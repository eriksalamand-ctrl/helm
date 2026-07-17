// nightloop.jsx — the Night Loop: bounded, automatic self-learning (A-Light).
// Once per day, unattended, it runs the full learn cycle the design docs describe:
//   1 OBSERVE   read the Reflexion ledger (predicted vs realized, real journals)
//   2 DIAGNOSE  find the worst calibrated bucket with a real sample (n ≥ 8)
//   3 PROPOSE   map that failure to ONE candidate rule from the Learning-Lab library
//   4 REPLAY    walk-forward the current live engine vs live+rule on real history
//               (purged/embargoed split — same discipline as the Lab)
//   5 GATE      acceptance checks (§17 style); fail → journal & stop
//   6 STAGE     passing edits wait for one-tap approval (or auto-apply if the user
//               explicitly enabled it — still config-level, reversible, journaled)
// Hard bounds: config-level rules only (no retrain, no orders), one edit per day,
// rejected rules blacklisted 14 days, every run journaled even when nothing changes.
(function () {
  const KEY = "helm_nightloop_v1";
  const { useState: useNlState, useEffect: useNlEffect } = React;

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null") || { runs: [], pending: null, rejected: {}, autoApply: false }; } catch (e) { return { runs: [], pending: null, rejected: {}, autoApply: false }; } };
  const save = (j) => { try { localStorage.setItem(KEY, JSON.stringify(j)); } catch (e) {} };
  const today = () => new Date().toISOString().slice(0, 10);
  const notify = () => { try { window.dispatchEvent(new Event("helm:nightloop")); } catch (e) {} };

  // ---- 2→3: map a calibration failure to the candidate rule that targets it ----
  // evError > 0 = overconfident (predicted better than realized) → suppressors;
  // evError < 0 = too timid (realized beat prediction) → additive rules.
  function ruleFor(bucket, active, rejected) {
    const over = bucket.evError > 0;
    const order = over
      ? (/crypto/i.test(bucket.key) ? ["rsi-exit", "trend-gate", "value-guard", "quality-floor", "regime-tilt"]
        : /defensive|risk-off|stagflation|slowdown|contraction/i.test(bucket.key) ? ["regime-tilt", "trend-gate", "quality-floor", "rsi-exit", "value-guard"]
        : ["trend-gate", "rsi-exit", "quality-floor", "value-guard", "regime-tilt"])
      : ["oversold-add", "value-conviction", "breakout-add", "regime-tilt"];
    const lib = window.HelmCandidateRules || {};
    const cut = Date.now() - 14 * 86400000;
    return order.find((id) => lib[id] && !active.includes(id) && !(rejected[id] && new Date(rejected[id]).getTime() > cut)) || null;
  }

  // ---- 4: compact walk-forward replay (purged + embargoed, long-only, like the Lab) ----
  function replayTicker(hist, meta, cfg, extraApply) {
    const N = hist.length, FEAT = 28, HZ = 5;
    const start = Math.floor(N / 2) + FEAT; // test on newest half, embargo the feature window
    const daily = [], flags = [];
    let inMkt = false;
    for (let t = start; t < N - HZ; t++) {
      const w28 = hist.slice(Math.max(0, t - 27), t + 1).map((c, i, a) => (c / a[0]) * 50);
      const synth = { ticker: meta.ticker, sector: meta.sector, price: hist[t], spark: w28, divYield: meta.divYield || 0, plPct: 0, weight: 0 };
      let s = { ...window.signalsFor(synth, cfg) };
      if (extraApply) s = extraApply(s);
      const was = inMkt; inMkt = s.action === "Buy";
      flags.push(was !== inMkt);
      daily.push(inMkt ? (hist[t + 1] / hist[t] - 1) : 0);
    }
    return { daily, flags };
  }

  function kpis(runs) {
    const maxLen = Math.max(...runs.map((r) => r.daily.length));
    const pooled = [], flags = [];
    for (let i = 0; i < maxLen; i++) {
      const day = runs.map((r) => r.daily[i]).filter((x) => x != null);
      pooled.push(day.length ? day.reduce((s, x) => s + x, 0) / day.length : 0);
      flags.push(runs.some((r) => r.flags[i]));
    }
    const n = pooled.length || 1;
    const eq = pooled.reduce((a, r) => { a.push((a[a.length - 1] || 1) * (1 + r)); return a; }, []);
    const cagr = (Math.pow(eq[eq.length - 1] || 1, 252 / n) - 1) * 100;
    const mean = pooled.reduce((s, x) => s + x, 0) / n;
    const sd = Math.sqrt(pooled.reduce((s, x) => s + (x - mean) * (x - mean), 0) / n) || 1e-9;
    const dn = Math.sqrt(pooled.reduce((s, x) => s + (x < 0 ? x * x : 0), 0) / n) || 1e-9;
    let peak = 1, mdd = 0;
    eq.forEach((v) => { peak = Math.max(peak, v); mdd = Math.min(mdd, (v / peak - 1) * 100); });
    const timeIn = (pooled.filter((x) => x !== 0).length / n) * 100;
    const turnover = flags.filter(Boolean).length / (n / 252);
    return { cagr, sharpe: (mean * 252) / (sd * Math.sqrt(252)), sortino: (mean * 252) / (dn * Math.sqrt(252)), mdd, timeIn, turnover: turnover / 100 };
  }

  // ---- 5: acceptance gates (§17, compact) ----
  function gates(base, cand) {
    const differs = Math.abs(cand.sharpe - base.sharpe) > 0.03 || Math.abs(cand.cagr - base.cagr) > 0.3 || Math.abs(cand.mdd - base.mdd) > 0.3;
    const checks = [
      { k: "Engine actually traded", pass: cand.turnover > 0.0005 && cand.timeIn > 1 },
      { k: "Candidate differs from baseline", pass: differs },
      { k: "Sharpe improves (≥+0.05 & ≥5%)", pass: cand.sharpe - base.sharpe >= 0.05 && cand.sharpe >= base.sharpe * 1.05 },
      { k: "Sortino not worse", pass: cand.sortino >= base.sortino - 0.02 },
      { k: "Max drawdown not worse (−0.5pp tol)", pass: cand.mdd >= base.mdd - 0.5 },
      { k: "CAGR drop ≤3pp", pass: cand.cagr >= base.cagr - 3 },
    ];
    return { checks, accepted: checks.every((c) => c.pass) };
  }

  // ---- the nightly run ----
  let running = false;
  async function run(force) {
    if (running) return; running = true;
    const t0 = Date.now();
    const J = load();
    try {
      if (!force && J.runs.length && J.runs[0].d === today()) return; // once per day
      if (J.pending) return; // a staged edit is waiting on the human — don't stack
      const log = (entry) => { J.runs.unshift({ d: today(), ms: Date.now() - t0, ...entry }); J.runs = J.runs.slice(0, 45); save(J); notify(); };

      if (!window.HelmReflexion || !window.signalsFor || !window.helmPresetCfg) { log({ verdict: "skipped", reason: "engine modules not loaded" }); return; }

      // 1–2 OBSERVE + DIAGNOSE (regime + theme + horizon-age buckets, plus macro drift)
      const c = window.HelmReflexion.compute();
      const drift = c.drift || null; // recent-half vs older-half hit-rate — domain-drift signal
      const buckets = [...(c.byRegime || []), ...(c.byTheme || []), ...(c.byHorizon || [])].filter((b) => b.n >= 8 && Math.abs(b.evError) > 0.06)
        .sort((a, b) => Math.abs(b.evError) - Math.abs(a.evError));
      const resolved = c.resolved != null ? c.resolved : (c.rows || []).length;
      if (!buckets.length) { log({ verdict: "no-edit", reason: `insufficient evidence — no bucket with n≥8 and |EV error|>6% yet (${resolved} predictions resolved${drift && drift.delta < -0.1 ? `; ⚠ drift: recent hit ${Math.round(drift.recent * 100)}% vs ${Math.round(drift.old * 100)}% older` : ""}). The ledger keeps accruing.` }); return; }
      const bucket = buckets[0];

      // 3 PROPOSE
      const active = window.HelmConfig ? window.HelmConfig.activeRules() : [];
      const ruleId = ruleFor(bucket, active, J.rejected || {});
      if (!ruleId) { log({ verdict: "no-edit", reason: `worst bucket "${bucket.key}" (EV err ${(bucket.evError * 100).toFixed(0)}%, n=${bucket.n}) — but every matching rule is already active, or was rejected <14d ago.`, bucket: { k: bucket.key, ev: bucket.evError, n: bucket.n } }); return; }
      const meta = (window.HelmCandidateRuleMeta || {})[ruleId] || { name: ruleId, desc: "" };
      const apply = window.HelmCandidateRules[ruleId];

      // 4 REPLAY on the top-8 held names by value (real feed history when live)
      const D = window.PMData;
      const byT = {};
      (D.allHoldings || []).forEach((h) => { const q = h.qty || h.q || 0; byT[h.ticker] = byT[h.ticker] || { ticker: h.ticker, sector: h.sector, divYield: h.divYield || 0, mv: 0 }; byT[h.ticker].mv += h.marketValue || h.price * q; });
      const picks = Object.values(byT).sort((a, b) => b.mv - a.mv).slice(0, 8);
      const st = window.computeHelmState ? window.computeHelmState() : null;
      const cfg = window.helmPresetCfg((st ? st.p.riskProfile : "Balanced").toLowerCase()); // NON-raw: baseline includes already-applied rules
      const baseRuns = [], candRuns = [];
      let realN = 0;
      for (const p of picks) {
        const s = window.HelmSigma ? window.HelmSigma.seriesFor(p.ticker, 504) : null;
        if (!s || s.arr.length < 160) continue;
        if (s.real) realN++;
        baseRuns.push(replayTicker(s.arr, p, cfg, null));
        candRuns.push(replayTicker(s.arr, p, cfg, apply));
        await new Promise((r) => setTimeout(r)); // keep the UI responsive
      }
      if (!baseRuns.length) { log({ verdict: "skipped", reason: "no usable history for replay" }); return; }
      const base = kpis(baseRuns), cand = kpis(candRuns);

      // 5 GATE
      const g = gates(base, cand);
      const runEntry = {
        verdict: g.accepted ? "staged" : "rejected-by-gates",
        bucket: { k: bucket.key, ev: bucket.evError, n: bucket.n },
        ruleId, ruleName: meta.name, ruleDesc: meta.desc,
        rationale: `${bucket.key}: engine ${bucket.evError > 0 ? "overshoots" : "undershoots"} realized EV by ${(Math.abs(bucket.evError) * 100).toFixed(0)}% (n=${bucket.n}) → tested "${meta.name}"`,
        base, cand, checks: g.checks, dataReal: `${realN}/${baseRuns.length} real series`,
      };
      if (!g.accepted) { log(runEntry); return; }

      // 6 STAGE (or auto-apply if the human explicitly turned that on)
      if (J.autoApply && window.HelmConfig) {
        window.HelmConfig.apply({ rules: [...active, ruleId], meta: { source: "night-loop (auto)", label: meta.name, note: runEntry.rationale } });
        log({ ...runEntry, verdict: "auto-applied" });
      } else {
        J.pending = { ...runEntry, d: today() };
        log(runEntry);
      }
    } finally { running = false; }
  }

  function approve() {
    const J = load(); if (!J.pending) return;
    const active = window.HelmConfig ? window.HelmConfig.activeRules() : [];
    if (window.HelmConfig && !active.includes(J.pending.ruleId)) {
      window.HelmConfig.apply({ rules: [...active, J.pending.ruleId], meta: { source: "night-loop (approved)", label: J.pending.ruleName, note: J.pending.rationale } });
    }
    J.runs.unshift({ d: today(), verdict: "applied", ruleId: J.pending.ruleId, ruleName: J.pending.ruleName, reason: "approved by user" });
    J.pending = null; save(J); notify();
  }
  function reject() {
    const J = load(); if (!J.pending) return;
    J.rejected = J.rejected || {}; J.rejected[J.pending.ruleId] = today();
    J.runs.unshift({ d: today(), verdict: "rejected", ruleId: J.pending.ruleId, ruleName: J.pending.ruleName, reason: "rejected by user — blacklisted 14d" });
    J.pending = null; save(J); notify();
  }
  function setAutoApply(v) { const J = load(); J.autoApply = !!v; save(J); notify(); }

  // ---- Bridge rail card ----
  function NightLoopCard() {
    const [, force] = useNlState(0);
    const [open, setOpen] = useNlState(false);
    useNlEffect(() => {
      const h = () => force((n) => n + 1);
      window.addEventListener("helm:nightloop", h);
      return () => window.removeEventListener("helm:nightloop", h);
    }, []);
    const J = load();
    const last = J.runs[0];
    const P = J.pending;
    const num = (n, dp = 2) => n == null || isNaN(n) ? "—" : n.toFixed(dp);
    const Kpi = ({ l, b, c, dp = 2, pct }) => (
      <div className="nl-kpi"><span>{l}</span><b className="mono">{num(b, dp)}{pct ? "%" : ""} → <i style={{ color: (c >= b) === (l !== "Max DD") || c === b ? "#0e9f6e" : "#e02424" }}>{num(c, dp)}{pct ? "%" : ""}</i></b></div>
    );
    return (
      <section className="pm-card nl-card">
        <div className="nl-head">
          <span className="nl-eyebrow">Night loop · self-learning{P ? " — 1 pending" : ""}</span>
          <label className="nl-auto" title="When on, gate-passing edits apply without waiting (still config-level, reversible, journaled)">
            <input type="checkbox" checked={!!J.autoApply} onChange={(e) => setAutoApply(e.target.checked)} /> auto-apply
          </label>
        </div>
        {P ? (
          <div className="nl-pending">
            <div className="nl-p-title">Proposed: <b>{P.ruleName}</b></div>
            <div className="nl-p-why">{P.rationale}</div>
            <div className="nl-kpis">
              <Kpi l="Sharpe" b={P.base.sharpe} c={P.cand.sharpe} />
              <Kpi l="CAGR" b={P.base.cagr} c={P.cand.cagr} dp={1} pct />
              <Kpi l="Max DD" b={P.base.mdd} c={P.cand.mdd} dp={1} pct />
            </div>
            <div className="nl-p-meta mono">replay: top-8 held, 2y purged walk-forward · {P.dataReal} · gates {P.checks.filter((c) => c.pass).length}/{P.checks.length}</div>
            <div className="nl-actions">
              <button className="nl-ok" onClick={approve}>Approve & apply</button>
              <button className="nl-no" onClick={reject}>Reject (14d)</button>
            </div>
          </div>
        ) : last ? (
          <div className="nl-last">
            <span className={`nl-badge ${last.verdict}`}>{last.verdict}</span>
            <span className="nl-reason">{last.reason || last.rationale || (last.ruleName ? `"${last.ruleName}" — gates ${last.checks ? last.checks.filter((c) => c.pass).length + "/" + last.checks.length : ""}` : "")}</span>
          </div>
        ) : (
          <div className="nl-last"><span className="nl-reason">First run happens ~10s after load, once per day. Bounded: one config-level rule max, replay-gated, reversible.</span></div>
        )}
        <div className="nl-foot">
          <button className="nl-link" onClick={() => run(true)}>run now</button>
          <button className="nl-link" onClick={() => setOpen(!open)}>{open ? "hide journal" : `journal (${J.runs.length})`}</button>
          {window.HelmConfig && window.HelmConfig.activeRules().length > 0 && <span className="nl-active mono">{window.HelmConfig.activeRules().length} rule{window.HelmConfig.activeRules().length > 1 ? "s" : ""} live</span>}
        </div>
        {open && (
          <div className="nl-journal">
            {J.runs.slice(0, 12).map((r, i) => (
              <div className="nl-j-row" key={i}>
                <span className="mono nl-j-d">{r.d.slice(5)}</span>
                <span className={`nl-badge ${r.verdict}`}>{r.verdict}</span>
                <span className="nl-j-t">{r.ruleName || ""} {r.reason || r.rationale || ""}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  const NL_CSS = `
  .nl-card { display: flex; flex-direction: column; gap: 9px; }
  .nl-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .nl-eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; }
  .nl-auto { font-size: 10.5px; color: var(--ink-2); display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
  .nl-auto input { accent-color: #121820; margin: 0; }
  .nl-pending { border: 1px solid #0e9f6e44; background: #0e9f6e08; border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 7px; }
  .nl-p-title { font-size: 13px; }
  .nl-p-why { font-size: 11.5px; color: var(--ink-2); line-height: 1.5; }
  .nl-kpis { display: flex; gap: 14px; flex-wrap: wrap; }
  .nl-kpi { display: flex; flex-direction: column; gap: 1px; font-size: 10px; color: var(--muted); }
  .nl-kpi b { font-size: 11.5px; color: var(--ink); font-weight: 600; }
  .nl-kpi i { font-style: normal; }
  .nl-p-meta { font-size: 9.5px; color: var(--muted); }
  .nl-actions { display: flex; gap: 8px; }
  .nl-ok { font: inherit; font-size: 12px; font-weight: 700; color: #fff; background: #0e9f6e; border: 0; border-radius: 8px; padding: 6px 13px; cursor: pointer; }
  .nl-no { font: inherit; font-size: 12px; font-weight: 600; color: var(--ink-2); background: none; border: 1px solid var(--line); border-radius: 8px; padding: 6px 13px; cursor: pointer; }
  .nl-last { display: flex; align-items: baseline; gap: 8px; }
  .nl-badge { font-family: var(--mono); font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 2px 7px; border-radius: 99px; white-space: nowrap; flex: none; }
  .nl-badge.no-edit, .nl-badge.skipped { background: var(--panel-2, #f4f6f8); color: var(--muted); }
  .nl-badge.staged { background: #0e9f6e1f; color: #0e9f6e; }
  .nl-badge.applied, .nl-badge.auto-applied { background: #0e9f6e; color: #fff; }
  .nl-badge.rejected, .nl-badge.rejected-by-gates { background: #e024241a; color: #e02424; }
  .nl-reason { font-size: 11.5px; color: var(--ink-2); line-height: 1.5; }
  .nl-foot { display: flex; align-items: center; gap: 12px; }
  .nl-link { font: inherit; font-size: 11px; font-weight: 600; color: #2563eb; background: none; border: 0; cursor: pointer; padding: 0; }
  .nl-link:hover { text-decoration: underline; }
  .nl-active { font-size: 9.5px; color: #0e9f6e; margin-left: auto; }
  .nl-journal { display: flex; flex-direction: column; gap: 5px; border-top: 1px solid var(--line-2, #f0f2f5); padding-top: 8px; }
  .nl-j-row { display: flex; align-items: baseline; gap: 7px; font-size: 11px; }
  .nl-j-d { color: var(--muted); font-size: 9.5px; flex: none; }
  .nl-j-t { color: var(--ink-2); line-height: 1.4; }
  `;
  if (!document.getElementById("helm-nl-css")) {
    const el = document.createElement("style"); el.id = "helm-nl-css"; el.textContent = NL_CSS; document.head.appendChild(el);
  }

  window.HelmNightLoop = { run, approve, reject, setAutoApply, journal: load };
  window.NightLoopCard = NightLoopCard;

  // schedule: give feed + modules ~10s to settle, then run (skips itself if already ran today)
  setTimeout(() => { try { run(false); } catch (e) {} }, 10000);
})();
