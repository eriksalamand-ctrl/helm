// backtest.jsx — predictive backtest: train on first half of 5y history, forecast, compare to actual
const { useState: useStateB, useMemo: useMemoB } = React;

// ---------- math helpers ----------
const bMean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const bStd = (a) => { const m = bMean(a); return Math.sqrt(bMean(a.map((x) => (x - m) ** 2))); };
const bDiff = (a) => a.slice(1).map((x, i) => x - a[i]);
function bLinreg(y) { // y vs index → {a,b}
  const n = y.length, xs = [...Array(n).keys()];
  const mx = bMean(xs), my = bMean(y);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (y[i] - my); den += (xs[i] - mx) ** 2; }
  const b = num / den; return { a: my - b * mx, b };
}
function mulb(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- 5y daily history with regimes (deterministic) ----------
function genHistory(seed, p0, drift, vol, days = 1260) {
  const rnd = mulb(seed);
  const out = [p0]; let v = p0;
  // regime multipliers so trend isn't a single straight line
  const regimes = []; let t = 0;
  while (t < days) { const len = 80 + Math.floor(rnd() * 160); const dd = drift * (0.2 + rnd() * 1.8) * (rnd() < 0.28 ? -1 : 1); regimes.push({ end: t + len, dd }); t += len; }
  let ri = 0;
  for (let i = 1; i < days; i++) {
    while (i > regimes[ri].end && ri < regimes.length - 1) ri++;
    const dd = regimes[ri].dd / 252;
    v = v * (1 + dd + (rnd() - 0.5) * 2 * vol); v = Math.max(0.01, v);
    out.push(v);
  }
  return out;
}

// ---------- train on first `split`, forecast the rest ----------
function backtest(hist, splitFrac = 0.5) {
  const n = hist.length, split = Math.floor(n * splitFrac);
  const train = hist.slice(0, split), testActual = hist.slice(split);
  const logT = train.map(Math.log);
  const { a, b } = bLinreg(logT);                 // training log-trend
  const rets = bDiff(logT);
  const sigma = bStd(rets);
  const mom = bMean(rets.slice(-40));             // recent momentum
  const lastLog = logT[logT.length - 1];
  const trendAtEnd = a + b * (split - 1);
  const gap = lastLog - trendAtEnd;               // how far above/below trend we end

  const pred = [], lo = [], hi = [];
  for (let k = 1; k <= testActual.length; k++) {
    const trendLog = a + b * (split - 1 + k);
    const momPart = mom * Math.max(0, 1 - k / 90) * k * 0.5;   // decaying momentum push
    const revert = gap * Math.max(0, 1 - k / 110);            // mean-revert the gap
    const central = trendLog + revert + momPart;
    pred.push(Math.exp(central));
    const band = sigma * Math.sqrt(k) * 1.6;
    lo.push(Math.exp(central - band)); hi.push(Math.exp(central + band));
  }

  // ---- metrics ----
  const errs = pred.map((p, i) => p - testActual[i]);
  const rmse = Math.sqrt(bMean(errs.map((e) => e * e)));
  const rmsePct = (rmse / bMean(testActual)) * 100;
  const finalErrPct = ((pred[pred.length - 1] - testActual[testActual.length - 1]) / testActual[testActual.length - 1]) * 100;
  // directional accuracy on 20-day forward changes
  let hits = 0, tot = 0;
  for (let i = 0; i + 20 < testActual.length; i += 10) {
    const pa = Math.sign(pred[i + 20] - pred[i]), aa = Math.sign(testActual[i + 20] - testActual[i]);
    if (pa === aa) hits++; tot++;
  }
  const dirAcc = tot ? (hits / tot) * 100 : 0;
  let covered = 0;
  testActual.forEach((x, i) => { if (x >= lo[i] && x <= hi[i]) covered++; });
  const coverage = (covered / testActual.length) * 100;
  const trackScore = Math.max(0, Math.min(100, 100 - rmsePct * 1.7));

  return { split, train, testActual, pred, lo, hi, metrics: { rmsePct, finalErrPct, dirAcc, coverage, trackScore } };
}

// ---------- comparison chart ----------
function BTChart({ res, accent }) {
  const { train, testActual, pred, lo, hi, split } = res;
  const all = [...train, ...testActual, ...pred, ...lo, ...hi];
  const W = 1000, H = 340, padT = 14, padB = 26, padL = 8, padR = 8;
  const n = train.length + testActual.length;
  const dMin = Math.min(...all), dMax = Math.max(...all);
  const x = (i) => padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - dMin) / (dMax - dMin)) * (H - padT - padB);
  const path = (arr, off = 0) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i + off).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const bandPath = `${hi.map((v, i) => `${i === 0 ? "M" : "L"}${x(split + i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} ${lo.map((v, i) => `L${x(split + lo.length - 1 - i).toFixed(1)},${y(lo[lo.length - 1 - i]).toFixed(1)}`).join(" ")} Z`;
  const splitX = x(split);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block" }}>
      <rect x={padL} y={padT} width={splitX - padL} height={H - padT - padB} fill="currentColor" opacity="0.035" />
      <line x1={splitX} y1={padT} x2={splitX} y2={H - padB} stroke="currentColor" strokeOpacity="0.3" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <path d={bandPath} fill={accent} opacity="0.12" />
      <path d={path(train)} fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <path d={path(testActual, split)} fill="none" stroke="currentColor" strokeOpacity="0.85" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
      <path d={path(pred, split)} fill="none" stroke={accent} strokeWidth="2.4" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Build the backtest universe from the SELECTED account's holdings (+ S&P benchmark)
function assetsForAccount(account) {
  const D = window.PMData;
  const view = D.buildView(account || "all");
  const seen = new Set(); const list = [];
  view.holdings.slice(0, 8).forEach((h) => {
    if (seen.has(h.ticker)) return; seen.add(h.ticker);
    const sp = h.spark || [50, 50];
    const vol = clamp((Math.max(...sp) - Math.min(...sp)) / (Math.abs(sp[0]) || 1) * 0.02 + 0.010, 0.008, 0.045);
    const r = mulb(h.seed * 13 + 5)();
    list.push({ t: h.ticker, n: h.name, seed: h.seed * 7 + 13, p0: Math.max(1, h.price / 3), drift: 0.05 + r * 0.5, vol });
  });
  list.push({ t: "SPX", n: "S&P 500 (benchmark)", seed: 74, p0: 1800, drift: 0.13, vol: 0.011 });
  return list;
}

function Backtest({ accent, account }) {
  const D = window.PMData;
  const assets = assetsForAccount(account);
  const acctMeta = D.accounts.find((a) => a.id === (account || "all"));
  const acctLabel = !account || account === "all" ? "All accounts" : account === "crypto" ? "Crypto ETFs" : (acctMeta ? acctMeta.name : account);
  const [asset, setAsset] = useStateB(assets[0].t);
  const sel = assets.some((a) => a.t === asset) ? asset : assets[0].t;
  const meta = assets.find((a) => a.t === sel) || assets[0];
  const res = useMemoB(() => backtest(genHistory(meta.seed, meta.p0, meta.drift, meta.vol), 0.5), [sel, account]);
  const m = res.metrics;
  const money = (v) => "$" + v.toLocaleString("en-US", { maximumFractionDigits: v < 100 ? 2 : 0 });
  const verdict = m.trackScore >= 75 ? ["Strong", accent] : m.trackScore >= 55 ? ["Fair", "#d97706"] : ["Weak", "#e02424"];

  return (
    <div className="bt">
      <div className="bt-head">
        <div>
          <div className="pm-card-eyebrow">Predictive backtest · walk-forward</div>
          <div className="bt-sub">Backtesting holdings in <strong>{acctLabel}</strong>. The model trains on the first 2.5 years, then forecasts the next 2.5 — compared against what actually happened.</div>
        </div>
        <div className="bt-assets">
          {assets.map((a) => (
            <button key={a.t} className={sel === a.t ? "is-active" : ""} onClick={() => setAsset(a.t)}>{a.t}</button>
          ))}
        </div>
      </div>

      <div className="bt-scorebar">
        <div className="bt-score">
          <div className="bt-score-ring" style={{ background: `conic-gradient(${verdict[1]} ${m.trackScore * 3.6}deg, var(--line) 0)` }}>
            <span>{Math.round(m.trackScore)}</span>
          </div>
          <div>
            <div className="bt-score-label">Tracking score</div>
            <div className="bt-score-verdict" style={{ color: verdict[1] }}>{verdict[0]} fit vs reality</div>
          </div>
        </div>
        <div className="bt-mini"><span>Directional accuracy</span><strong>{m.dirAcc.toFixed(0)}%</strong></div>
        <div className="bt-mini"><span>Mean error (RMSE)</span><strong>{m.rmsePct.toFixed(1)}%</strong></div>
        <div className="bt-mini"><span>Final-value error</span><strong style={{ color: Math.abs(m.finalErrPct) < 12 ? accent : "var(--ink)" }}>{m.finalErrPct >= 0 ? "+" : ""}{m.finalErrPct.toFixed(1)}%</strong></div>
        <div className="bt-mini"><span>In 90% band</span><strong>{m.coverage.toFixed(0)}%</strong></div>
      </div>

      <section className="pm-card">
        <div className="pm-card-head">
          <div className="pm-card-eyebrow">{meta.n} — forecast vs actual</div>
          <div className="bt-legend">
            <span><i className="solid muted" /> Training (in-sample)</span>
            <span><i className="solid" /> Actual (out-of-sample)</span>
            <span><i className="dash" style={{ borderColor: accent }} /> Model forecast</span>
            <span><i className="band" style={{ background: accent }} /> 90% range</span>
          </div>
        </div>
        <div className="bt-chart" style={{ color: "var(--ink)" }}><BTChart res={res} accent={accent} /></div>
        <div className="bt-axis"><span>5 years ago</span><span className="bt-axis-split">↑ train / test split (2.5y)</span><span>today</span></div>
      </section>

      <div className="bt-readout">
        <section className="pm-card">
          <div className="pm-card-eyebrow">What the model predicted</div>
          <div className="bt-read-grid">
            <div><span>Forecast end price</span><strong>{money(res.pred[res.pred.length - 1])}</strong></div>
            <div><span>Actual end price</span><strong>{money(res.testActual[res.testActual.length - 1])}</strong></div>
            <div><span>Predicted return</span><strong style={{ color: accent }}>{(((res.pred[res.pred.length - 1] / res.pred[0]) - 1) * 100).toFixed(0)}%</strong></div>
            <div><span>Actual return</span><strong>{(((res.testActual[res.testActual.length - 1] / res.testActual[0]) - 1) * 100).toFixed(0)}%</strong></div>
          </div>
          <p className="bt-note">The forecast blends the training-period <strong>trend</strong>, recent <strong>momentum</strong> (decaying), and <strong>mean-reversion</strong> of the gap to trend. The shaded cone widens with √time as uncertainty compounds. Swap in real Finnhub / Twelve Data candles to run this on live history.</p>
        </section>
        <section className="pm-card bt-verdict-card">
          <div className="pm-card-eyebrow">Read</div>
          <div className="bt-verdict-big" style={{ color: verdict[1] }}>{Math.abs(m.finalErrPct).toFixed(0)}% off at the finish</div>
          <p>Over a 2.5-year out-of-sample window, the model's path stayed within <strong>{m.rmsePct.toFixed(0)}%</strong> RMSE of the real price and called the direction right <strong>{m.dirAcc.toFixed(0)}%</strong> of the time. {m.trackScore >= 70 ? "Good enough to inform position sizing, not precise enough to time exact entries." : "Use for direction, not for precise price targets."}</p>
        </section>
      </div>
    </div>
  );
}

window.Backtest = Backtest;
