// reflexion.jsx — Reflexion Ledger (Phase 1a of the autonomy roadmap).
// The one gap that keeps recurring: signalsFor() is a one-way function — it makes
// predictions but never reads the outcome journals back in. This module closes that:
// it derives a predicted-vs-realized ledger from the REAL journals already persisted
// (Tracker's dated, regime-stamped model books + Papersim's accept/reject decisions),
// buckets the error by regime / theme / horizon, and exposes window.HelmReflexion so
// the engine CAN consult its own calibration. Framed micro/meso/macro after SAMULE.
//
// Honest scope: this SURFACES calibration and publishes an advisory adjustment(); it
// does NOT silently mutate the live engine. Wiring an approved adjustment into config
// is Phase 1b (Learning-Lab loop). Sample sizes are shown so you can trust/distrust it.
const { useState: useRxState } = React;

const rxUP = "#0e9f6e", rxDN = "#e02424", rxWARN = "#d97706", rxBLUE = "#2563eb";
const rxPct = (n, dp = 1) => (n == null || isNaN(n) ? "—" : (n >= 0 ? "+" : "−") + Math.abs(n * 100).toFixed(dp) + "%");
const rxPts = (n, dp = 0) => (n == null || isNaN(n) ? "—" : (n >= 0 ? "+" : "−") + Math.abs(n * 100).toFixed(dp));
const rxClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rxMean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const rxToday = () => new Date().toISOString().slice(0, 10);

function rxDaysBetween(dateStr, today) {
  try { const a = new Date(dateStr + "T00:00:00"), b = new Date(today + "T00:00:00");
    return Math.max(0, Math.round((b - a) / 86400000)); } catch (e) { return 0; }
}
function rxSecOf(ticker) {
  const D = window.PMData;
  const h = (D && D.allHoldings || []).find((x) => x.ticker === ticker);
  if (h && h.sector) return h.sector;
  const u = (window.HelmUniverse || []).find((x) => x.ticker === ticker);
  return u && u.sector ? u.sector : "Other";
}
function rxPriceOf(ticker) {
  const D = window.PMData;
  const h = (D && D.allHoldings || []).find((x) => x.ticker === ticker);
  if (h && h.price) return h.price;
  const u = (window.HelmUniverse || []).find((x) => x.ticker === ticker);
  return u && u.price ? u.price : null;
}
// weight (conviction share, ~0.05–0.3) → a probability-like confidence, ONLY as a
// fallback when the snapshot predates entry-time composite storage.
function rxConfFromWeight(w) { return rxClamp(0.5 + (w || 0.1), 0.5, 0.85); }

function rxLoad(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } }

// ---- build the ledger from the persisted journals -------------------------
function buildRecords() {
  const today = rxToday();
  const recs = [];

  // 1) Tracker journal — each dated snapshot carries every model's full book (entry
  //    prices) + the regime that was live. Each pick = a Buy prediction we can mark.
  const journal = rxLoad("helm_tracker_journal_v1") || [];
  journal.forEach((e) => {
    const models = (e.models && e.models.length) ? e.models
      : (e.picks ? [{ name: e.champion || "Champion", picks: e.picks }] : []);
    const age = rxDaysBetween(e.date, today);
    models.forEach((m) => (m.picks || []).forEach((p) => {
      const now = rxPriceOf(p.t);
      if (!now || !p.entry) return;
      const realized = now / p.entry - 1;
      const conf = p.c != null ? rxClamp(p.c / 100, 0, 1) : rxConfFromWeight(p.w);
      recs.push({
        src: "tracker", date: e.date, ticker: p.t, sector: rxSecOf(p.t),
        regime: e.regime || null, model: m.name, action: "Buy",
        conf, entry: p.entry, now, realized, ageDays: age, hit: realized > 0,
        // scorable only if it's aged AND the price actually moved — a name marked to an
        // unchanged (static/seed) price hasn't resolved, it's just uncovered by the feed.
        resolved: age >= 2 && Math.abs(realized) >= 0.002,
      });
    }));
  });

  // 2) Papersim decision log — YOUR accept/reject overlay on the model. Accept = a Buy
  //    (should go up); Reject = you passed (a "win" only if the name did NOT run away).
  const ps = rxLoad("helm_papersim_v1");
  if (ps && Array.isArray(ps.log)) {
    ps.log.forEach((l) => {
      if (l.kind !== "accept" && l.kind !== "reject") return;
      const now = rxPriceOf(l.ticker);
      const entry = l.price || l.entryRef;
      if (!now || !entry) return;
      const realized = now / entry - 1;
      const conf = l.score != null ? rxClamp(l.score / 100, 0, 1) : 0.6;
      const age = rxDaysBetween(l.date, today);
      recs.push({
        src: "papersim", date: l.date, ticker: l.ticker, sector: rxSecOf(l.ticker),
        regime: l.regime || null, model: "Your judgment",
        action: l.kind === "accept" ? "Accept" : "Reject",
        conf, entry, now, realized, ageDays: age,
        hit: l.kind === "accept" ? realized > 0 : realized <= 0.05,
        resolved: age >= 2 && Math.abs(realized) >= 0.002,
      });
    });
  }
  return recs;
}

function rxBucketize(records, keyFn) {
  const b = {};
  records.forEach((r) => { const k = keyFn(r); if (k == null) return; (b[k] = b[k] || []).push(r); });
  const out = [];
  Object.keys(b).forEach((k) => {
    const rs = b[k], n = rs.length;
    const hitRate = rs.filter((r) => r.hit).length / n;
    const avgReal = rxMean(rs.map((r) => r.realized));
    const meanConf = rxMean(rs.map((r) => r.conf));
    out.push({ key: k, n, hitRate, avgReal, meanConf, evError: meanConf - hitRate });
  });
  return out.sort((a, b2) => b2.n - a.n);
}

const RX_AGE_BANDS = [
  ["T+1 · ≤3d", (d) => d <= 3],
  ["1wk · ≤10d", (d) => d <= 10],
  ["1mo · ≤35d", (d) => d <= 35],
  ["3mo · ≤100d", (d) => d <= 100],
  [">3mo", () => true],
];
function rxAgeBand(d) { for (const [lbl, test] of RX_AGE_BANDS) if (test(d)) return lbl; return ">3mo"; }

// ---- the single compute the panel AND the engine-facing API both use ------
let _rxCache = null, _rxCacheAt = 0;
function computeReflexion(force) {
  const now = Date.now();
  if (!force && _rxCache && (now - _rxCacheAt) < 20000) return _rxCache;
  const all = buildRecords();
  const resolved = all.filter((r) => r.resolved);
  const scored = resolved; // score ONLY resolved calls — never dilute with unmoved/unaged names

  const summary = {
    nTotal: all.length, nResolved: resolved.length,
    hitRate: scored.length ? scored.filter((r) => r.hit).length / scored.length : null,
    meanConf: scored.length ? rxMean(scored.map((r) => r.conf)) : null,
    avgReal: scored.length ? rxMean(scored.map((r) => r.realized)) : null,
  };
  summary.evError = (summary.meanConf != null && summary.hitRate != null) ? summary.meanConf - summary.hitRate : null;

  // drift: recent half vs older half hit-rate (macro-level domain drift signal)
  let drift = null;
  if (scored.length >= 8) {
    const byDate = [...scored].sort((a, b) => (a.date < b.date ? -1 : 1));
    const half = Math.floor(byDate.length / 2);
    const older = byDate.slice(0, half), recent = byDate.slice(half);
    const hOld = older.filter((r) => r.hit).length / older.length;
    const hNew = recent.filter((r) => r.hit).length / recent.length;
    drift = { old: hOld, recent: hNew, delta: hNew - hOld };
  }

  const byRegime = rxBucketize(scored.filter((r) => r.regime), (r) => r.regime);
  const byTheme = rxBucketize(scored, (r) => r.sector);
  const byHorizon = rxBucketize(scored, (r) => rxAgeBand(r.ageDays));
  const byModel = rxBucketize(scored, (r) => r.model);
  const byAction = rxBucketize(scored, (r) => r.action);

  // calibration bands: predicted-confidence vs realized hit-frequency
  const bands = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 1.01]];
  const calibration = bands.map(([lo, hi]) => {
    const rs = scored.filter((r) => r.conf >= lo && r.conf < hi);
    return { lo, hi, n: rs.length,
      predicted: rs.length ? rxMean(rs.map((r) => r.conf)) : null,
      realized: rs.length ? rs.filter((r) => r.hit).length / rs.length : null };
  });

  // meso: the worst systematically-overconfident bucket with a real sample
  const meso = [...byRegime.filter((b) => b.n >= 6), ...byTheme.filter((b) => b.n >= 6)]
    .sort((a, b) => b.evError - a.evError)[0] || null;

  const micro = [...scored].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 14);

  _rxCache = { all, scored, summary, drift, byRegime, byTheme, byHorizon, byModel, byAction, calibration, meso, micro };
  _rxCacheAt = now;
  return _rxCache;
}

// engine-facing: advisory confidence multiplier for a (regime, sector) — the "read the
// journal back in" hook. Returns 1 when we don't have enough evidence. NOT auto-applied.
function reflexionAdjustment(regime, sector) {
  const c = computeReflexion();
  let mult = 1, why = [];
  const rr = c.byRegime.find((b) => b.key === regime);
  const tt = c.byTheme.find((b) => b.key === sector);
  if (rr && rr.n >= 8) { const d = rxClamp(rr.evError, -0.25, 0.25); mult *= 1 - d * 0.5;
    if (Math.abs(d) > 0.06) why.push(`${regime}: ${d > 0 ? "over" : "under"}confident (${rr.n})`); }
  if (tt && tt.n >= 8) { const d = rxClamp(tt.evError, -0.25, 0.25); mult *= 1 - d * 0.5;
    if (Math.abs(d) > 0.06) why.push(`${sector}: ${d > 0 ? "over" : "under"}confident (${tt.n})`); }
  return { mult: rxClamp(mult, 0.7, 1.2), why };
}

window.HelmReflexion = { compute: computeReflexion, adjustment: reflexionAdjustment, buildRecords };

// ---------------------------------------------------------------------------
function RxBar({ value, mid, color }) {
  // value 0..1; a vertical mid marker (e.g. 0.5 coin-flip line)
  return (
    <div className="rx-bar">
      <i style={{ width: rxClamp(value, 0, 1) * 100 + "%", background: color }} />
      {mid != null && <span className="rx-bar-mid" style={{ left: mid * 100 + "%" }} />}
    </div>
  );
}

function RxBucketTable({ title, sub, rows, accent }) {
  if (!rows || !rows.length) return null;
  return (
    <div className="rx-bt">
      <div className="rx-bt-head"><strong>{title}</strong><span>{sub}</span></div>
      <div className="rx-bt-rowh"><span>Bucket</span><span className="ta-r">n</span><span className="ta-r">Hit</span><span className="ta-r">Avg P&amp;L</span><span>Calibration (conf vs hit)</span></div>
      {rows.map((b) => {
        const over = b.evError > 0.06, under = b.evError < -0.06;
        const col = over ? rxWARN : under ? rxBLUE : rxUP;
        return (
          <div className="rx-bt-row" key={b.key}>
            <span className="rx-bt-k">{b.key}</span>
            <span className="ta-r mono" style={{ color: b.n < 6 ? "var(--muted)" : "var(--ink)" }}>{b.n}</span>
            <span className="ta-r mono" style={{ color: b.hitRate >= 0.5 ? rxUP : rxDN }}>{Math.round(b.hitRate * 100)}%</span>
            <span className="ta-r mono" style={{ color: b.avgReal >= 0 ? rxUP : rxDN }}>{rxPct(b.avgReal)}</span>
            <div className="rx-cal">
              <RxBar value={b.hitRate} mid={b.meanConf} color={col} />
              <span className="rx-cal-tag" style={{ color: col }}>{over ? "over " + rxPts(b.evError) : under ? "under " + rxPts(b.evError) : "calibrated"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReflexionPanel({ accent }) {
  const [tab, setTab] = useRxState("meso");
  const c = computeReflexion(true);
  const acc = accent || rxUP;
  const S = c.summary;
  const RX_MIN = 5; // predictions must resolve before calibration means anything

  if (!S.nTotal || S.nResolved < RX_MIN) {
    const pending = S.nTotal - S.nResolved;
    return (
      <section className="pm-card">
        <div className="pm-card-eyebrow">Reflexion ledger · predicted vs realized</div>
        <div className="rx-empty">
          {S.nTotal
            ? <><strong>{S.nResolved}</strong> of {S.nTotal} predictions have resolved so far{pending > 0 ? <> — <strong>{pending}</strong> are still marked at their entry price (aged &lt; 2 days, or the feed hasn't moved them yet)</> : null}. Calibration needs <strong>≥{RX_MIN}</strong> resolved calls before it means anything.</>
            : <>No predictions logged yet.</>}
          <div style={{ marginTop: 10 }}>The ledger reads the <strong>Tracker</strong> model books (regime-stamped, marked to the live feed) and your <strong>Portfolio Simulation</strong> accept/reject decisions. To populate it: connect the live feed so entry prices diverge from today's, or open the <em>Tracker → seed demo history</em> to back-date a track record.</div>
        </div>
      </section>
    );
  }


  const overallCol = S.evError == null ? "var(--muted)" : S.evError > 0.06 ? rxWARN : S.evError < -0.06 ? rxBLUE : rxUP;
  const verdict = S.evError == null ? "Gathering evidence"
    : S.evError > 0.06 ? "Systematically overconfident — the model's conviction runs ahead of its hit-rate"
    : S.evError < -0.06 ? "Underconfident — outcomes beat the stated conviction"
    : "Well calibrated — conviction ≈ realized hit-rate";

  return (
    <section className="pm-card rx">
      <style>{RX_CSS}</style>
      <div className="rx-hero">
        <div>
          <div className="pm-card-eyebrow">Reflexion ledger · closing the learning loop</div>
          <div className="rx-hero-title">What the engine got right — and where it's fooling itself</div>
          <p className="rx-hero-sub">Every proposal in the Tracker books and your Portfolio Simulation is marked to the live feed and scored <strong>predicted vs realized</strong>. Bucketed by regime, theme and horizon so a systematic blind spot shows up as a pattern, not a one-off. Framed <em>micro → meso → macro</em>.</p>
        </div>
        <div className="rx-hero-kpis">
          <div className="rx-kpi"><span>Predictions</span><strong>{S.nResolved}</strong><em>of {S.nTotal} logged · marked</em></div>
          <div className="rx-kpi"><span>Hit-rate</span><strong style={{ color: S.hitRate >= 0.5 ? rxUP : rxDN }}>{S.hitRate == null ? "—" : Math.round(S.hitRate * 100) + "%"}</strong><em>direction resolved right</em></div>
          <div className="rx-kpi"><span>Calibration</span><strong style={{ color: overallCol }}>{S.evError == null ? "—" : (S.evError > 0 ? "+" : "") + rxPts(S.evError)}</strong><em>conf − hit (pts)</em></div>
        </div>
      </div>

      {/* MACRO strip */}
      <div className="rx-macro" style={{ borderColor: overallCol + "55", background: overallCol + "0d" }}>
        <span className="rx-macro-lvl" style={{ color: overallCol }}>MACRO</span>
        <span className="rx-macro-txt" style={{ color: "var(--ink)" }}>{verdict}.</span>
        {c.drift && Math.abs(c.drift.delta) > 0.08 && (
          <span className="rx-macro-drift" style={{ color: c.drift.delta >= 0 ? rxUP : rxDN }}>
            {c.drift.delta >= 0 ? "▲" : "▼"} drift {rxPts(c.drift.delta)}pts recent vs older
          </span>
        )}
      </div>

      <div className="rx-tabs">
        <button className={tab === "meso" ? "on" : ""} onClick={() => setTab("meso")} style={tab === "meso" ? { borderColor: acc, color: acc } : {}}>Meso · patterns</button>
        <button className={tab === "cal" ? "on" : ""} onClick={() => setTab("cal")} style={tab === "cal" ? { borderColor: acc, color: acc } : {}}>Calibration</button>
        <button className={tab === "micro" ? "on" : ""} onClick={() => setTab("micro")} style={tab === "micro" ? { borderColor: acc, color: acc } : {}}>Micro · recent calls</button>
      </div>

      {tab === "meso" && (
        <div className="rx-meso">
          {c.meso && (
            <div className="rx-meso-lead">
              <span className="rx-lvl" style={{ color: rxWARN }}>MESO</span>
              Biggest blind spot: <strong>{c.meso.key}</strong> — conviction {Math.round(c.meso.meanConf * 100)}% but only {Math.round(c.meso.hitRate * 100)}% hit ({c.meso.n} calls). The engine is <strong style={{ color: rxWARN }}>{rxPts(c.meso.evError)}pts overconfident</strong> here.
            </div>
          )}
          <div className="rx-bt-grid">
            <RxBucketTable title="By regime" sub="what backdrop was live" rows={c.byRegime} accent={acc} />
            <RxBucketTable title="By theme" sub="sector of the name" rows={c.byTheme} accent={acc} />
            <RxBucketTable title="By horizon" sub="how long the call has run" rows={c.byHorizon} accent={acc} />
            <RxBucketTable title="By source model" sub="which book proposed it" rows={c.byModel} accent={acc} />
          </div>
          <div className="rx-foot">A bucket needs <strong>≥6 calls</strong> before its calibration is trustworthy (greyed n below that). "Over/under" = mean conviction minus realized hit-rate, in points.</div>
        </div>
      )}

      {tab === "cal" && (
        <div className="rx-cal-view">
          <div className="rx-cal-lead">Do the confidence numbers mean anything? A calibrated model's <strong>70% conviction bucket hits ~70%</strong>. Bars below the dashed conviction marker = overconfident.</div>
          <div className="rx-calbands">
            {c.calibration.map((b) => (
              <div className="rx-calband" key={b.lo}>
                <span className="rx-calband-lbl mono">{Math.round(b.lo * 100)}–{Math.round(b.hi * 100)}%</span>
                {b.n ? <>
                  <div className="rx-calband-bar">
                    <i style={{ width: (b.realized * 100) + "%", background: b.realized >= b.predicted - 0.06 ? rxUP : rxWARN }} />
                    <span className="rx-bar-mid" style={{ left: b.predicted * 100 + "%" }} />
                  </div>
                  <span className="rx-calband-v mono">{Math.round(b.realized * 100)}% hit · {b.n}</span>
                </> : <span className="rx-calband-empty">no calls in band</span>}
              </div>
            ))}
          </div>
          <div className="rx-foot">Dashed marker = average stated conviction in the band; bar = realized hit-rate. Aligned = trustworthy confidence.</div>
        </div>
      )}

      {tab === "micro" && (
        <div className="rx-micro">
          <div className="rx-micro-lead"><span className="rx-lvl" style={{ color: rxBLUE }}>MICRO</span>The most recent marked calls — the raw material the patterns above are built from.</div>
          <div className="rx-micro-rowh"><span>Date</span><span>Call</span><span>Regime</span><span className="ta-r">Conf</span><span className="ta-r">Realized</span><span className="ta-r">Verdict</span></div>
          {c.micro.map((r, i) => (
            <div className="rx-micro-row" key={i}>
              <span className="mono rx-micro-date">{r.date}</span>
              <span><strong>{r.action}</strong> {r.ticker} <em className="rx-micro-sec">{r.sector}</em></span>
              <span className="rx-micro-reg">{r.regime || "—"}</span>
              <span className="ta-r mono">{Math.round(r.conf * 100)}%</span>
              <span className="ta-r mono" style={{ color: r.realized >= 0 ? rxUP : rxDN }}>{rxPct(r.realized)}</span>
              <span className="ta-r">{r.resolved ? (r.hit ? <span style={{ color: rxUP }}>✓ hit</span> : <span style={{ color: rxDN }}>✕ miss</span>) : <span style={{ color: "var(--muted)" }}>pending</span>}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rx-advisory">
        <div className="rx-advisory-h"><span className="rx-lvl" style={{ color: acc }}>ADVISORY</span>What the engine would learn from this</div>
        {(() => {
          const worst = c.byRegime.concat(c.byTheme).filter((b) => b.n >= 8 && Math.abs(b.evError) > 0.06)
            .sort((a, b) => Math.abs(b.evError) - Math.abs(a.evError)).slice(0, 3);
          if (!worst.length) return <div className="rx-advisory-b">Not enough evidence in any single bucket yet (need ≥8 calls) to justify a confidence adjustment. The ledger keeps accruing — this stays advisory until Phase 1b wires an approved edit into config.</div>;
          return (
            <div className="rx-advisory-list">
              {worst.map((b) => {
                const mult = rxClamp(1 - rxClamp(b.evError, -0.25, 0.25) * 0.5, 0.7, 1.2);
                return (
                  <div className="rx-adv-row" key={b.key}>
                    <span className="rx-adv-k">{b.key}</span>
                    <span className="rx-adv-arrow" style={{ color: b.evError > 0 ? rxWARN : rxBLUE }}>{b.evError > 0 ? "down-weight" : "up-weight"} conviction ×{mult.toFixed(2)}</span>
                    <span className="rx-adv-why">{Math.round(b.meanConf * 100)}% stated vs {Math.round(b.hitRate * 100)}% real ({b.n})</span>
                  </div>
                );
              })}
              <div className="rx-foot">Advisory only — <strong>not applied</strong> to the live engine. <code>window.HelmReflexion.adjustment(regime, sector)</code> exposes these multipliers; Phase 1b lets you approve one into config.</div>
            </div>
          );
        })()}
      </div>
    </section>
  );
}

const RX_CSS = `
.rx { display: flex; flex-direction: column; gap: 0; }
.rx-hero { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
.rx-hero-title { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; margin: 3px 0 7px; }
.rx-hero-sub { font-size: 13px; color: var(--ink-2); line-height: 1.55; max-width: 640px; }
.rx-hero-sub strong { color: var(--ink); } .rx-hero-sub em { font-style: normal; color: var(--ink); font-weight: 600; }
.rx-hero-kpis { display: flex; gap: 10px; flex: none; }
.rx-kpi { background: var(--panel-2); border: 1px solid var(--line); border-radius: 11px; padding: 11px 14px; min-width: 96px; }
.rx-kpi span { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); display: block; }
.rx-kpi strong { font-size: 21px; font-weight: 700; font-variant-numeric: tabular-nums; display: block; margin: 2px 0 1px; }
.rx-kpi em { font-size: 10.5px; color: var(--muted); font-style: normal; }
.rx-macro { display: flex; align-items: center; gap: 12px; border: 1px solid; border-radius: 11px; padding: 11px 15px; margin: 16px 0 4px; flex-wrap: wrap; }
.rx-macro-lvl, .rx-lvl { font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: 0.1em; padding: 2px 7px; border: 1px solid currentColor; border-radius: 20px; flex: none; }
.rx-macro-txt { font-size: 13px; font-weight: 500; flex: 1; }
.rx-macro-drift { font-family: var(--mono); font-size: 12px; font-weight: 700; }
.rx-tabs { display: flex; gap: 8px; margin: 16px 0 14px; flex-wrap: wrap; }
.rx-tabs button { font: inherit; font-size: 12.5px; font-weight: 600; padding: 7px 13px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-2); color: var(--ink-2); cursor: pointer; }
.rx-meso-lead, .rx-cal-lead, .rx-micro-lead { font-size: 13px; color: var(--ink-2); line-height: 1.5; margin-bottom: 14px; display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
.rx-meso-lead strong, .rx-cal-lead strong, .rx-micro-lead strong { color: var(--ink); }
.rx-lvl { align-self: center; }
.rx-bt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.rx-bt { border: 1px solid var(--line); border-radius: 11px; padding: 13px 15px; }
.rx-bt-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 9px; }
.rx-bt-head strong { font-size: 13.5px; } .rx-bt-head span { font-size: 11px; color: var(--muted); }
.rx-bt-rowh { display: grid; grid-template-columns: 1.3fr 30px 42px 56px 1.5fr; gap: 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); padding-bottom: 6px; border-bottom: 1px solid var(--line-2); }
.rx-bt-row { display: grid; grid-template-columns: 1.3fr 30px 42px 56px 1.5fr; gap: 8px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--line-2); font-size: 12.5px; }
.rx-bt-row:last-child { border-bottom: 0; }
.rx-bt-k { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rx-cal { display: flex; align-items: center; gap: 8px; }
.rx-bar { position: relative; flex: 1; height: 8px; background: var(--line-2); border-radius: 5px; overflow: visible; }
.rx-bar i { display: block; height: 100%; border-radius: 5px; }
.rx-bar-mid { position: absolute; top: -2px; width: 2px; height: 12px; background: var(--ink); opacity: 0.55; border-radius: 2px; }
.rx-cal-tag { font-family: var(--mono); font-size: 10.5px; font-weight: 600; white-space: nowrap; min-width: 62px; }
.rx-calbands { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
.rx-calband { display: grid; grid-template-columns: 70px 1fr 110px; gap: 12px; align-items: center; }
.rx-calband-lbl { font-size: 12px; font-weight: 600; }
.rx-calband-bar { position: relative; height: 12px; background: var(--line-2); border-radius: 6px; }
.rx-calband-bar i { display: block; height: 100%; border-radius: 6px; }
.rx-calband-v { font-size: 11.5px; color: var(--ink-2); text-align: right; }
.rx-calband-empty { font-size: 11.5px; color: var(--muted); }
.rx-micro-rowh { display: grid; grid-template-columns: 82px 1.5fr 1fr 46px 66px 56px; gap: 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); padding-bottom: 7px; border-bottom: 1px solid var(--line-2); }
.rx-micro-row { display: grid; grid-template-columns: 82px 1.5fr 1fr 46px 66px 56px; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--line-2); font-size: 12.5px; }
.rx-micro-row:last-child { border-bottom: 0; }
.rx-micro-date { font-size: 11.5px; color: var(--ink-2); } .rx-micro-sec { font-style: normal; color: var(--muted); font-size: 11px; }
.rx-micro-reg { font-size: 11.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rx-advisory { margin-top: 18px; border-top: 1px solid var(--line); padding-top: 14px; }
.rx-advisory-h { display: flex; align-items: center; gap: 9px; font-size: 13px; font-weight: 700; margin-bottom: 11px; }
.rx-advisory-b { font-size: 12.5px; color: var(--ink-2); line-height: 1.5; }
.rx-advisory-list { display: flex; flex-direction: column; gap: 8px; }
.rx-adv-row { display: grid; grid-template-columns: 1.1fr 1.2fr 1.4fr; gap: 12px; align-items: center; background: var(--panel-2); border: 1px solid var(--line); border-radius: 9px; padding: 9px 13px; font-size: 12.5px; }
.rx-adv-k { font-weight: 700; } .rx-adv-arrow { font-family: var(--mono); font-size: 12px; font-weight: 700; } .rx-adv-why { font-size: 11.5px; color: var(--muted); text-align: right; }
.rx-foot { font-size: 11px; color: var(--muted); margin-top: 11px; line-height: 1.5; }
.rx-foot strong { color: var(--ink-2); } .rx-foot code { font-family: var(--mono); font-size: 10.5px; background: var(--line-2); padding: 1px 5px; border-radius: 4px; }
.rx-empty { font-size: 13px; color: var(--ink-2); line-height: 1.6; padding: 8px 0 4px; } .rx-empty strong { color: var(--ink); } .rx-empty em { color: var(--ink); font-style: italic; }
@media (max-width: 820px) { .rx-bt-grid { grid-template-columns: 1fr; } .rx-hero-kpis { width: 100%; } }
`;

window.ReflexionPanel = ReflexionPanel;
