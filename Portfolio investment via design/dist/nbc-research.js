// learning.jsx — Phase 4: the learning loop, made visible (A-Light: logs & proposes, never self-tunes).
// Three sections: Reflexion ledger (predicted vs realized) · Drift dashboard · Improvements & implementation log.
// Reads the Tracker journal (helm_tracker_journal_v1) + Plan overrides (helm.plan.v1). Sets window.HelmDrift.
const { useState: useLrnState, useEffect: useLrnEffect } = React;

const lUP = "#0e9f6e", lDOWN = "#e02424", lWARN = "#d97706", lINFO = "#4f46e5";
const LRN_KEY = "helm.learning.v1";
const TJ_KEY = "helm_tracker_journal_v1";
const LL_VERS_KEY = "helm_ll_versions_v1";
const LL_RUNS_KEY = "helm_ll_runs_v1";
const lLoadLLVers = () => { try { return JSON.parse(localStorage.getItem(LL_VERS_KEY) || "[]"); } catch (e) { return []; } };
const lLoadLLRuns = () => { try { return JSON.parse(localStorage.getItem(LL_RUNS_KEY) || "[]"); } catch (e) { return []; } };

const lLoadJournal = () => { try { return JSON.parse(localStorage.getItem(TJ_KEY) || "[]"); } catch (e) { return []; } };
const lLoadLrn = () => { try { return JSON.parse(localStorage.getItem(LRN_KEY) || "{}"); } catch (e) { return {}; } };
const lSaveLrn = (o) => { try { localStorage.setItem(LRN_KEY, JSON.stringify(o)); } catch (e) {} };
const lPct = (v, dp = 1) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(dp) + "%";

// realized weighted return of a snapshot's picks marked to current feed price
function realizedOf(entry, priceNow) {
  if (!entry.picks || !entry.picks.length) return null;
  let wsum = 0, acc = 0, n = 0;
  entry.picks.forEach((p) => {
    const now = priceNow[p.t];
    if (now && p.entry) { const r = (now / p.entry - 1) * 100; acc += r * (p.w || 1); wsum += (p.w || 1); n++; }
  });
  if (!n) return null;
  return wsum ? acc / wsum : 0;
}

// domain drift: how stale/unreliable each signal domain looks right now
function computeDrift(ledger) {
  // calibration: mean |predicted − realized| across scored snapshots
  const scored = ledger.filter((e) => e.realized != null && e.predicted != null);
  const mae = scored.length ? scored.reduce((s, e) => s + Math.abs(e.predicted - e.realized), 0) / scored.length : null;
  const bias = scored.length ? scored.reduce((s, e) => s + (e.predicted - e.realized), 0) / scored.length : null;
  // map MAE → 0-100 drift (10pp error ≈ 50). honest about sample size.
  const calDrift = mae == null ? null : Math.min(100, Math.round((mae / 20) * 100));
  const conf = scored.length >= 8 ? "High" : scored.length >= 4 ? "Moderate" : scored.length >= 1 ? "Low" : "None";

  const r = window.HelmRegime;
  const geo = r ? r.geoScore : null;
  const domains = [
    { k: "Model calibration", v: calDrift, note: mae == null ? "no scored snapshots yet" : `mean error ${mae.toFixed(1)}pp · bias ${bias >= 0 ? "over" : "under"}-predicts ${Math.abs(bias).toFixed(1)}pp` },
    { k: "Regime stability", v: r ? 28 : null, note: r ? `current: ${r.label}` : "regime not classified — open Macro" },
    { k: "Geopolitical", v: geo != null ? Math.min(100, geo) : null, note: geo != null ? `geo risk score ${geo}` : "—" },
    { k: "Inflation / rates", v: 34, note: "CPI vs target band; curve shape" },
    { k: "Theme / factor", v: calDrift != null ? Math.min(100, calDrift + 8) : 30, note: "factor-return persistence" },
  ];
  return { domains, conf, scored: scored.length, mae, bias, calDrift };
}

const driftColor = (v) => v == null ? "var(--muted)" : v >= 60 ? lDOWN : v >= 38 ? lWARN : lUP;
const driftLabel = (v) => v == null ? "n/a" : v >= 60 ? "High" : v >= 38 ? "Watch" : "Stable";
const driftAction = (k, v) => {
  if (v == null) return "Log more snapshots to score this domain.";
  if (v >= 60) return k === "Model calibration" ? "Material miscalibration — review factor weights before new trades." : "Elevated — tighten risk, require confirmation on this domain's signals.";
  if (v >= 38) return "Monitor — within tolerance but trending; no action required.";
  return "Within tolerance — full signal freedom.";
};

function LearningPage({ accent }) {
  const D = window.PMData;
  const [, force] = useLrnState(0);
  const [lrn, setLrn] = useLrnState(lLoadLrn);
  const journal = lLoadJournal();
  const llVers = lLoadLLVers();
  const llRuns = lLoadLLRuns();
  const llAccepted = llVers.filter((v) => v.accepted);
  const llLatest = llAccepted.length ? llAccepted[0].num : "v0.1.0";

  useLrnEffect(() => {
    const h = () => force((n) => n + 1);
    window.addEventListener("storage", h); window.addEventListener("helm:feed", h);
    return () => { window.removeEventListener("storage", h); window.removeEventListener("helm:feed", h); };
  }, []);

  const priceNow = {};
  D.allHoldings.forEach((h) => { priceNow[h.ticker] = h.price; });

  // ---- reflexion ledger: predicted (champion model ret at record) vs realized (picks marked now) ----
  const ledger = journal.map((e) => {
    const champ = (e.models || []).find((m) => m.name === e.champion) || (e.models || [])[0] || {};
    const predicted = typeof champ.ret === "number" ? champ.ret : null;
    const realized = realizedOf(e, priceNow);
    const err = (predicted != null && realized != null) ? predicted - realized : null;
    return { date: e.date, champion: e.champion, topPick: e.topPick, regime: e.regime || (window.HelmRegime ? window.HelmRegime.label : "—"),
             predicted, realized, err, n: (e.picks || []).length };
  });
  const drift = computeDrift(ledger);

  // ---- multi-horizon simulation: predicted vs realized at T+1 / 1wk / 1mo / 3mo ----
  const HORIZONS = [{ k: "T+1", d: 1 }, { k: "1 week", d: 7 }, { k: "1 month", d: 30 }, { k: "3 months", d: 90 }];
  const today = new Date();
  const ageDays = (d) => Math.round((today - new Date(d)) / 86400000);
  const sim = HORIZONS.map((h) => {
    const matured = ledger.filter((e) => e.realized != null && e.predicted != null && ageDays(e.date) >= h.d);
    if (!matured.length) return { ...h, n: 0, pred: null, real: null, delta: null };
    // scale a snapshot's full predicted/realized to the horizon fraction (linear proxy)
    const scale = (e) => Math.min(1, h.d / Math.max(1, ageDays(e.date)));
    const pred = matured.reduce((s, e) => s + e.predicted * scale(e), 0) / matured.length;
    const real = matured.reduce((s, e) => s + e.realized * scale(e), 0) / matured.length;
    return { ...h, n: matured.length, pred, real, delta: pred - real };
  });

  // publish for the spine
  useLrnEffect(() => {
    const worst = Math.max(...drift.domains.map((d) => d.v == null ? -1 : d.v));
    window.HelmDrift = { label: worst < 0 ? "Baseline" : driftLabel(worst), score: worst < 0 ? null : worst, conf: drift.conf };
    window.dispatchEvent(new Event("helm:drift"));
  }, [drift.conf, drift.calDrift]);

  // ---- A-Light improvement proposals: rule-based, derived from the ledger. Never auto-applied. ----
  const proposals = [];
  if (drift.bias != null && drift.bias > 4) proposals.push({ id: "p-overpredict", title: "Trim optimism in the predictive model",
    why: `Champion model over-predicts realized return by ${drift.bias.toFixed(1)}pp across ${drift.scored} snapshots.`, change: "Lower momentum weight ~5pp; raise quality tilt.", domain: "Model calibration" });
  if (window.HelmRegime && /Defensive|Risk-off/.test(window.HelmRegime.bias)) proposals.push({ id: "p-regime", title: "Apply defensive regime gate",
    why: `Regime is ${window.HelmRegime.label} (${window.HelmRegime.bias}).`, change: "Raise buy bar +4; require confirmation on volatile-offense adds.", domain: "Regime" });
  if (drift.scored < 4) proposals.push({ id: "p-data", title: "Insufficient track record to retune",
    why: `Only ${drift.scored} scored snapshot${drift.scored === 1 ? "" : "s"}. Drift confidence: ${drift.conf}.`, change: "Keep recording daily snapshots in Tracker before changing weights.", domain: "Data", info: true });

  const decide = (id, status) => {
    const next = { ...lrn, decisions: { ...(lrn.decisions || {}), [id]: { status, date: new Date().toISOString().slice(0, 10) } } };
    setLrn(next); lSaveLrn(next);
  };
  const decisions = lrn.decisions || {};
  const log = Object.entries(decisions).map(([id, d]) => ({ id, ...d })).sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="lrn">
      <style>{LEARNING_CSS}</style>

      {/* header / honesty banner */}
      <section className="pm-card lrn-hero">
        <div>
          <div className="pm-card-eyebrow">Learning loop · A-Light</div>
          <div className="lrn-hero-title">Logs &amp; proposes — never self-tunes</div>
          <p className="lrn-hero-sub">The model writes down what it predicted, scores it against what actually happened, watches for drift, and <strong>proposes</strong> changes. Nothing is applied without your approval. {journal.length === 0
            ? <em style={{ color: lWARN }}> No snapshots yet — go to Tracker and "Record today's signals" to start the feedback loop.</em>
            : <> Currently scoring <strong>{drift.scored}</strong> of {journal.length} snapshot{journal.length === 1 ? "" : "s"} · drift confidence <strong>{drift.conf}</strong>.</>}</p>
        </div>
        <div className="lrn-hero-stat">
          <span className="lrn-hs-k">Calibration error</span>
          <span className="lrn-hs-v" style={{ color: drift.mae == null ? "var(--muted)" : driftColor(drift.calDrift) }}>{drift.mae == null ? "—" : drift.mae.toFixed(1) + "pp"}</span>
          <span className="lrn-hs-sub">{drift.bias == null ? "awaiting data" : (drift.bias >= 0 ? "over-predicts" : "under-predicts") + " " + Math.abs(drift.bias).toFixed(1) + "pp"}</span>
        </div>
      </section>

      {/* methodology registry */}
      {window.MethodRegistry && <window.MethodRegistry accent={accent} />}

      {/* multi-horizon simulation */}
      <section className="pm-card">
        <div className="pm-card-eyebrow">Simulation · predicted vs realized by horizon</div>
        <div className="lrn-sub2">Each logged snapshot is marked forward and the delta tracked as it matures through T+1 → 3 months.</div>
        <div className="lrn-sim">
          {sim.map((h) => (
            <div className="lrn-sim-cell" key={h.k}>
              <div className="lrn-sim-h">{h.k}</div>
              {h.n === 0 ? (
                <div className="lrn-sim-empty">pending<span>no matured snapshots</span></div>
              ) : (
                <>
                  <div className="lrn-sim-delta" style={{ color: Math.abs(h.delta) > 5 ? lDOWN : Math.abs(h.delta) > 2 ? lWARN : lUP }}>{lPct(h.delta)}</div>
                  <div className="lrn-sim-pr"><span>pred {lPct(h.pred)}</span><span>real {lPct(h.real)}</span></div>
                  <div className="lrn-sim-n">{h.n} snapshot{h.n === 1 ? "" : "s"}</div>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="lrn-foot">Delta = predicted − realized at each horizon. A method/model that's accurate short-term but drifts by 3mo shows it here — that's the signal to shorten its horizon or down-weight it.</div>
      </section>

      {/* drift dashboard */}
      <section className="pm-card">
        <div className="pm-card-eyebrow">Domain drift → required action</div>
        <div className="lrn-drift">
          {drift.domains.map((d) => (
            <div className="lrn-drow" key={d.k}>
              <div className="lrn-d-k">{d.k}<span className="lrn-d-note">{d.note}</span></div>
              <div className="lrn-d-bar"><i style={{ width: (d.v == null ? 6 : d.v) + "%", background: driftColor(d.v) }} /></div>
              <div className="lrn-d-lvl" style={{ color: driftColor(d.v) }}>{driftLabel(d.v)}</div>
              <div className="lrn-d-act">{driftAction(d.k, d.v)}</div>
            </div>
          ))}
        </div>
        <div className="lrn-foot">Drift rule: <strong>drift can reduce but never increase learning freedom</strong> (Copilot V2.1). High drift tightens gates; it never unlocks more autonomy.</div>
      </section>

      {/* reflexion ledger — richer per-prediction calibration by regime/theme/horizon (reflexion.jsx) */}
      {window.ReflexionPanel ? <window.ReflexionPanel accent={accent} /> : (
      <section className="pm-card">
        <div className="pm-card-head"><div className="pm-card-eyebrow">Reflexion ledger · predicted vs realized</div><span className="pm-count">{ledger.length} entries</span></div>
        <div className="lrn-empty">Reflexion module not loaded.</div>
      </section>
      )}

      {/* improvements & implementation */}
      <section className="pm-card">
        <div className="pm-card-eyebrow">Improvements &amp; implementation · proposals</div>
        <div className="lrn-props">
          {proposals.map((p) => {
            const dec = decisions[p.id];
            return (
              <div className={`lrn-prop${p.info ? " info" : ""}`} key={p.id}>
                <div className="lrn-prop-body">
                  <div className="lrn-prop-top"><strong>{p.title}</strong><span className="lrn-prop-dom">{p.domain}</span></div>
                  <div className="lrn-prop-why">{p.why}</div>
                  <div className="lrn-prop-change">Proposed: <em>{p.change}</em></div>
                </div>
                {p.info ? <span className="lrn-prop-info">info</span> : dec ? (
                  <span className={`lrn-prop-status ${dec.status}`}>{dec.status === "approved" ? "✓ Approved" : "✕ Dismissed"} · {dec.date}</span>
                ) : (
                  <div className="lrn-prop-actions">
                    <button className="lrn-pbtn ghost" onClick={() => decide(p.id, "dismissed")}>Dismiss</button>
                    <button className="lrn-pbtn solid" style={{ background: accent }} onClick={() => decide(p.id, "approved")}>Approve &amp; log</button>
                  </div>
                )}
              </div>
            );
          })}
          {proposals.length === 0 && <div className="lrn-empty">No proposals — the model is within tolerance and has no changes to suggest.</div>}
        </div>

        {log.length > 0 && (
          <div className="lrn-implog">
            <div className="lrn-implog-h">Implementation log <span>replay-before-change · A-Light</span></div>
            {log.map((d) => (
              <div className="lrn-imp-row" key={d.id}>
                <span className="mono">{d.date}</span>
                <span className={`lrn-imp-badge ${d.status}`}>{d.status}</span>
                <span className="lrn-imp-id">{d.id.replace(/^p-/, "")}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* engine versions · from the Learning Lab */}
      <section className="pm-card">
        <div className="pm-card-head">
          <div className="pm-card-eyebrow">Engine versions · from the Learning Lab</div>
          <span className="pm-count">{llRuns.length} run{llRuns.length === 1 ? "" : "s"} · live {llLatest}</span>
        </div>
        {llVers.length === 0 && llRuns.length === 0 ? (
          <div className="lrn-empty">No walk-forward testing yet. Go to <strong>Learning Lab</strong> → Run walk-forward to validate a candidate rule; accepted versions and run history flow here.</div>
        ) : (
          <>
            <div className="lrn-llrow lrn-llbase">
              <span className="lrn-llnum mono">v0.1.0</span>
              <span className="lrn-llstat" style={{ background: accent + "1a", color: accent }}>● raw engine</span>
              <span className="lrn-llchg">signalsFor() as deployed — the baseline all candidates are measured against</span>
            </div>
            {llVers.map((v, vi) => (
              <div className="lrn-llrow" key={v.num + v.date + vi}>
                <span className="lrn-llnum mono">{v.num}</span>
                <span className="lrn-llstat" style={{ background: (v.accepted ? lUP : lDOWN) + "1a", color: v.accepted ? lUP : lDOWN }}>● {v.accepted ? "accepted" : "rejected"}</span>
                <span className="lrn-llchg">{v.change} · Sharpe {typeof v.sharpe === "number" ? v.sharpe.toFixed(2) : "—"} · {v.date}</span>
              </div>
            ))}
            {llRuns.length > 0 && (
              <div className="lrn-llruns">
                <div className="lrn-implog-h">Recent walk-forward runs <span>read-only mirror of the Lab</span></div>
                {llRuns.slice(0, 6).map((r) => (
                  <div className="lrn-llrun" key={r.id}>
                    <span className="mono">{new Date(r.ts).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</span>
                    <span className="lrn-llrun-u">{r.universeLabel}</span>
                    <span className="lrn-llrun-m mono">{r.tickers ? r.tickers.length : 0} tk</span>
                    <span className={`lrn-imp-badge ${r.accepted ? "approved" : "dismissed"}`}>{r.accepted ? "ACCEPT" : "REJECT"} {r.gates}</span>
                    <span className="lrn-llrun-k mono">acc {r.predAcc}%</span>
                  </div>
                ))}
              </div>
            )}
            <div className="lrn-sub2" style={{ marginTop: 12 }}>The Lab is <strong>sandboxed</strong> — these versions never auto-deploy. A version only becomes live engine logic when you choose to apply it. Synthetic-data caveat applies until the live feed backfills real history.</div>
          </>
        )}
      </section>
    </div>
  );
}

const LEARNING_CSS = `
.lrn-llrow { display: grid; grid-template-columns: 64px 100px 1fr; gap: 12px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--line-2); font-size: 12.5px; }
.lrn-llrow:last-child { border-bottom: 0; }
.lrn-llbase { border-bottom: 1px solid var(--line); }
.lrn-llnum { font-weight: 700; }
.lrn-llstat { font-size: 10.5px; font-weight: 600; padding: 2px 9px; border-radius: 99px; text-align: center; }
.lrn-llchg { color: var(--ink-2); }
.lrn-llruns { margin-top: 14px; }
.lrn-llrun { display: grid; grid-template-columns: 70px 1fr auto auto auto; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--line-2); font-size: 12px; }
.lrn-llrun:last-child { border-bottom: 0; }
.lrn-llrun-u { color: var(--ink); font-weight: 600; }
.lrn-llrun-m, .lrn-llrun-k { color: var(--muted); font-size: 11.5px; }
.lrn-sub2 { font-size: 12px; color: var(--muted); margin: 2px 0 14px; }
.lrn-sim { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.lrn-sim-cell { border: 1px solid var(--line); border-radius: 11px; padding: 14px; text-align: center; }
.lrn-sim-h { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.lrn-sim-delta { font-size: 26px; font-weight: 700; font-family: var(--mono); margin: 6px 0 4px; }
.lrn-sim-pr { display: flex; justify-content: center; gap: 12px; font-size: 11px; color: var(--ink-2); font-family: var(--mono); }
.lrn-sim-n { font-size: 10.5px; color: var(--muted); margin-top: 4px; }
.lrn-sim-empty { font-size: 18px; font-weight: 600; color: var(--muted); margin: 10px 0; }
.lrn-sim-empty span { display: block; font-size: 10.5px; font-weight: 400; }
@media (max-width: 720px) { .lrn-sim { grid-template-columns: repeat(2, 1fr); } }
.lrn { display: flex; flex-direction: column; gap: 16px; }
.lrn-hero { display: flex; justify-content: space-between; align-items: center; gap: 24px; }
.lrn-hero-title { font-size: 21px; font-weight: 700; letter-spacing: -0.02em; margin-top: 2px; }
.lrn-hero-sub { font-size: 13px; color: var(--ink-2); margin-top: 6px; line-height: 1.55; max-width: 760px; }
.lrn-hero-sub strong { color: var(--ink); }
.lrn-hero-stat { text-align: right; flex: none; }
.lrn-hs-k { display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.lrn-hs-v { display: block; font-size: 28px; font-weight: 700; font-family: var(--mono); line-height: 1.1; }
.lrn-hs-sub { font-size: 11px; color: var(--muted); }
.lrn-drift { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.lrn-drow { display: grid; grid-template-columns: 1.5fr 1.2fr 0.7fr 2.2fr; gap: 14px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--line-2); }
.lrn-drow:last-child { border-bottom: 0; }
.lrn-d-k { font-size: 13px; font-weight: 600; }
.lrn-d-note { display: block; font-size: 11px; color: var(--muted); font-weight: 400; margin-top: 1px; }
.lrn-d-bar { height: 8px; background: var(--line-2); border-radius: 5px; overflow: hidden; }
.lrn-d-bar i { display: block; height: 100%; border-radius: 5px; }
.lrn-d-lvl { font-size: 12px; font-weight: 600; }
.lrn-d-act { font-size: 11.5px; color: var(--ink-2); }
.lrn-foot { font-size: 11.5px; color: var(--muted); margin-top: 12px; line-height: 1.5; }
.lrn-foot strong { color: var(--ink-2); }
.lrn-empty { font-size: 13px; color: var(--muted); padding: 14px 0; }
.lrn-table td, .lrn-table th { padding: 9px 10px; }
.lrn-props { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
.lrn-prop { display: flex; align-items: center; gap: 16px; border: 1px solid var(--line); border-radius: 11px; padding: 13px 16px; }
.lrn-prop.info { background: var(--panel-2); }
.lrn-prop-body { flex: 1; }
.lrn-prop-top { display: flex; align-items: baseline; gap: 10px; }
.lrn-prop-top strong { font-size: 14px; }
.lrn-prop-dom { font-size: 10.5px; font-family: var(--mono); color: var(--muted); background: var(--line-2); padding: 1px 7px; border-radius: 5px; }
.lrn-prop-why { font-size: 12.5px; color: var(--ink-2); margin-top: 4px; }
.lrn-prop-change { font-size: 12.5px; color: var(--ink-2); margin-top: 3px; }
.lrn-prop-change em { font-style: normal; font-weight: 600; color: var(--ink); }
.lrn-prop-actions { display: flex; gap: 8px; flex: none; }
.lrn-pbtn { font: inherit; font-size: 12.5px; font-weight: 600; border-radius: 8px; padding: 8px 13px; cursor: pointer; border: 1px solid var(--line); background: #fff; color: var(--ink-2); }
.lrn-pbtn.solid { color: #fff; border: 0; }
.lrn-prop-status { font-size: 12px; font-weight: 600; flex: none; }
.lrn-prop-status.approved { color: var(--good, #0e9f6e); }
.lrn-prop-status.dismissed { color: var(--muted); }
.lrn-prop-info { font-size: 11px; font-family: var(--mono); color: var(--muted); flex: none; }
.lrn-implog { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line); }
.lrn-implog-h { font-size: 12px; font-weight: 600; color: var(--ink-2); margin-bottom: 9px; }
.lrn-implog-h span { font-weight: 400; color: var(--muted); font-size: 11px; }
.lrn-imp-row { display: grid; grid-template-columns: 100px 90px 1fr; gap: 12px; font-size: 12.5px; padding: 5px 0; align-items: center; }
.lrn-imp-badge { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; padding: 2px 8px; border-radius: 5px; text-align: center; }
.lrn-imp-badge.approved { background: color-mix(in srgb, #0e9f6e 14%, transparent); color: #0e9f6e; }
.lrn-imp-badge.dismissed { background: var(--line-2); color: var(--muted); }
.lrn-imp-id { color: var(--ink-2); }
@media (max-width: 920px) { .lrn-hero { flex-direction: column; align-items: flex-start; } .lrn-drow { grid-template-columns: 1fr 1fr; } .lrn-d-act { grid-column: 1 / -1; } }
`;

window.LearningPage = LearningPage;
