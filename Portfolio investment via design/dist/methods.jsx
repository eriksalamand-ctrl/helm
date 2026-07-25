// methods.jsx — Methodology registry: tracks each analytical "lens" (TA, regime, macro-liquidity,
// Elliott, cycles, factor/quant, sentiment, breadth) — its current signal, hit-rate, success score,
// and a DYNAMIC weight that follows per-regime success. Sets window.HelmMethods for the Learning loop.
// Honest: hit-rates are seeded/simulated until the Tracker journal accrues real predicted-vs-realized history.
const { useState: useMethState } = React;

const mUP = "#0e9f6e", mDN = "#e02424", mWARN = "#d97706";

// each method: deterministic current read + a seeded track record (hit-rate overall + per regime family)
// regime families: TR (trending/risk-on), CH (chop/neutral), RO (risk-off/defensive)
const METHODS = [
  { k: "Regime / Markov", short: "Regime", desc: "Growth×inflation state, transition odds", base: 0.62, byReg: { TR: 0.68, CH: 0.55, RO: 0.66 }, horizon: "Weeks–months" },
  { k: "Macro liquidity", short: "Liquidity", desc: "Global M2 / net liquidity (Raoul Pal lens)", base: 0.58, byReg: { TR: 0.66, CH: 0.50, RO: 0.61 }, horizon: "8–12 wks lead" },
  { k: "Factor / quant", short: "Factor", desc: "Value · momentum · quality composite", base: 0.60, byReg: { TR: 0.64, CH: 0.57, RO: 0.52 }, horizon: "Months" },
  { k: "Technical (TA)", short: "TA", desc: "RSI · moving averages · trend gate", base: 0.55, byReg: { TR: 0.63, CH: 0.46, RO: 0.51 }, horizon: "Days–weeks" },
  { k: "Market cycles", short: "Cycles", desc: "4-yr cycle · seasonality · halving", base: 0.52, byReg: { TR: 0.56, CH: 0.50, RO: 0.49 }, horizon: "Months–years" },
  { k: "Elliott wave", short: "Elliott", desc: "Impulse/corrective wave count", base: 0.47, byReg: { TR: 0.52, CH: 0.43, RO: 0.45 }, horizon: "Swing" },
  { k: "Sentiment / news", short: "Sentiment", desc: "GDELT geopolitics · news tone", base: 0.50, byReg: { TR: 0.48, CH: 0.49, RO: 0.58 }, horizon: "Days" },
  { k: "Breadth / flows", short: "Breadth", desc: "Advance-decline · concentration (added)", base: 0.54, byReg: { TR: 0.60, CH: 0.51, RO: 0.55 }, horizon: "Weeks" },
];

// map the live regime label → family bucket
function regimeFamily() {
  const r = window.HelmRegime;
  if (!r) return "CH";
  if (/Goldilocks|Reflation|Disinflation/.test(r.label)) return "TR";
  if (/Stagflation|Deflation|Slowdown/.test(r.label)) return "RO";
  return "CH";
}

// each method's current directional read (deterministic from available signals)
function methodSignal(m) {
  const r = window.HelmRegime;
  const fam = regimeFamily();
  const bias = r ? r.bias : "Neutral";
  const riskOn = /Risk-on|Constructive/.test(bias), riskOff = /Risk-off|Defensive/.test(bias);
  switch (m.short) {
    case "Regime": return riskOn ? "Bullish" : riskOff ? "Bearish" : "Neutral";
    case "Liquidity": { const live = window.HelmFeed && window.HelmFeed.macro; return (live ? 1 : 1) && fam !== "RO" ? "Bullish" : "Neutral"; }
    case "Factor": return riskOn ? "Bullish" : "Neutral";
    case "TA": return fam === "TR" ? "Bullish" : fam === "RO" ? "Bearish" : "Neutral";
    case "Cycles": return "Neutral";
    case "Elliott": return fam === "TR" ? "Bullish" : "Neutral";
    case "Sentiment": { const geo = r ? r.geoScore : 0; return geo >= 55 ? "Bearish" : "Neutral"; }
    case "Breadth": return fam === "TR" ? "Bullish" : fam === "RO" ? "Bearish" : "Neutral";
    default: return "Neutral";
  }
}

// dynamic weight = per-regime success, normalized across methods, floored so nothing dies entirely
function methodWeights(fam) {
  const raw = METHODS.map((m) => Math.max(0.05, m.byReg[fam] - 0.45)); // success above coin-flip-ish floor
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return METHODS.map((m, i) => ({ m, w: raw[i] / sum }));
}

// publish at load so roundtable (Iris's ballot weight) + chief work without the Learning panel mounting;
// re-published on render (regime may classify a beat later, so retry once after it settles)
function methPublish() {
  try {
    const fam = regimeFamily();
    const weighted = methodWeights(fam);
    const blended = weighted.reduce((acc, { m, w }) => { const s = methodSignal(m); return acc + w * (s === "Bullish" ? 1 : s === "Bearish" ? -1 : 0); }, 0);
    window.HelmMethods = { fam, blended, weights: weighted.map(({ m, w }) => ({ k: m.short, w })) };
  } catch (e) {}
}
methPublish();
setTimeout(methPublish, 2500);

function MethodRegistry({ accent, compact }) {
  const [sortBy, setSortBy] = useMethState("weight");
  const fam = regimeFamily();
  const famLabel = { TR: "Trending / risk-on", CH: "Chop / neutral", RO: "Risk-off / defensive" }[fam];
  const weighted = methodWeights(fam);

  // publish blended directional read for the spine / strategy lab
  const blended = weighted.reduce((acc, { m, w }) => {
    const s = methodSignal(m); return acc + w * (s === "Bullish" ? 1 : s === "Bearish" ? -1 : 0);
  }, 0);
  window.HelmMethods = { fam, blended, weights: weighted.map(({ m, w }) => ({ k: m.short, w })) };

  let rows = weighted.map(({ m, w }) => ({ m, w, sig: methodSignal(m), score: Math.round(m.byReg[fam] * 100), overall: Math.round(m.base * 100) }));
  rows.sort((a, b) => sortBy === "weight" ? b.w - a.w : sortBy === "score" ? b.score - a.score : a.m.k.localeCompare(b.m.k));

  const sigCol = (s) => s === "Bullish" ? mUP : s === "Bearish" ? mDN : "var(--muted)";

  return (
    <section className="pm-card mth">
      <style>{METHODS_CSS}</style>
      <div className="pm-card-head">
        <div>
          <div className="pm-card-eyebrow">Methodology registry · {METHODS.length} lenses</div>
          <div className="mth-sub">Each lens is scored, and its weight follows success <strong>in the current regime</strong> — now <strong style={{ color: accent }}>{famLabel}</strong>. Blended read:
            <span style={{ color: blended > 0.1 ? mUP : blended < -0.1 ? mDN : "var(--muted)", fontWeight: 700 }}> {blended > 0.1 ? "Bullish" : blended < -0.1 ? "Bearish" : "Neutral"} ({blended >= 0 ? "+" : ""}{(blended * 100).toFixed(0)})</span>
          </div>
        </div>
        {!compact && <div className="mth-sort">
          <button className={sortBy === "weight" ? "on" : ""} onClick={() => setSortBy("weight")}>Weight</button>
          <button className={sortBy === "score" ? "on" : ""} onClick={() => setSortBy("score")}>Score</button>
          <button className={sortBy === "name" ? "on" : ""} onClick={() => setSortBy("name")}>Name</button>
        </div>}
      </div>
      <div className="mth-list">
        <div className="mth-rowh">
          <span>Method</span><span>Current read</span><span className="ta-r">Regime score</span><span className="ta-r">Overall</span><span>Dynamic weight</span>
        </div>
        {rows.map(({ m, w, sig, score, overall }) => (
          <div className="mth-row" key={m.k}>
            <div className="mth-k"><strong>{m.k}</strong><span>{m.desc} · {m.horizon}</span></div>
            <div className="mth-sig" style={{ color: sigCol(sig) }}>● {sig}</div>
            <div className="ta-r mth-score" style={{ color: score >= 60 ? mUP : score >= 50 ? mWARN : mDN }}>{score}%</div>
            <div className="ta-r mth-overall">{overall}%</div>
            <div className="mth-w"><div className="mth-w-bar"><i style={{ width: (w * 100 * 2.2) + "%", background: accent }} /></div><span>{(w * 100).toFixed(0)}%</span></div>
          </div>
        ))}
      </div>
      <div className="mth-foot">Weights are per-regime &amp; dynamic: a lens that wins in trends but fails in chop is down-weighted when the regime turns. <strong>Simulated track record</strong> until the Tracker journal has real predicted-vs-realized history — then these scores update from the reflexion ledger.</div>
    </section>
  );
}

const METHODS_CSS = `
.mth-sub { font-size: 12px; color: var(--muted); margin-top: 2px; line-height: 1.5; }
.mth-sub strong { color: var(--ink); }
.mth-sort { display: inline-flex; gap: 0; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.mth-sort button { font: inherit; font-size: 11.5px; padding: 5px 11px; border: 0; background: var(--panel-2); color: var(--ink-2); cursor: pointer; border-right: 1px solid var(--line); }
.mth-sort button:last-child { border-right: 0; }
.mth-sort button.on { background: var(--ink); color: #fff; }
.mth-list { margin-top: 6px; }
.mth-rowh, .mth-row { display: grid; grid-template-columns: 2.3fr 1.1fr 0.9fr 0.7fr 1.6fr; gap: 14px; align-items: center; }
.mth-rowh { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); padding: 6px 0; border-bottom: 1px solid var(--line); }
.mth-row { padding: 11px 0; border-bottom: 1px solid var(--line-2); }
.ta-r { text-align: right; }
.mth-k strong { font-size: 13.5px; display: block; }
.mth-k span { font-size: 11px; color: var(--muted); }
.mth-sig { font-size: 12.5px; font-weight: 600; }
.mth-score { font-family: var(--mono); font-size: 13px; font-weight: 600; }
.mth-overall { font-family: var(--mono); font-size: 12px; color: var(--muted); }
.mth-w { display: flex; align-items: center; gap: 9px; }
.mth-w-bar { flex: 1; height: 8px; background: var(--line-2); border-radius: 5px; overflow: hidden; }
.mth-w-bar i { display: block; height: 100%; border-radius: 5px; }
.mth-w span { font-family: var(--mono); font-size: 12px; font-weight: 600; min-width: 30px; text-align: right; }
.mth-foot { font-size: 11.5px; color: var(--muted); margin-top: 12px; line-height: 1.5; }
.mth-foot strong { color: var(--ink-2); }
@media (max-width: 860px) { .mth-rowh { display: none; } .mth-row { grid-template-columns: 1fr 1fr; gap: 6px 14px; } }
`;

window.MethodRegistry = MethodRegistry;
window.helmRegimeFamily = regimeFamily;
