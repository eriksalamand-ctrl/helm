// odds.jsx — GMI-style conditional forward-return stats + secular/weekly trend reads.
// Everything here is measured on the actual price series (real feed EOD when live,
// flagged synthetic otherwise) — no model opinion involved.
//   HelmOdds.cellFor(t)  → today's regime×vol cell for a ticker (trend vs 200d × vol tercile)
//   HelmOdds.compute(t)  → forward 1wk/1mo/3mo stats among PAST days in the same cell:
//                          median return, P(up) (probability-framed, GMI-style), worst decile
//   HelmOdds.trend2(t)   → secular (200d) + weekly (20d) trend with signal-since dates
//   <OddsCard/>          → Bridge rail card: the tape's (S&P 500) current cell odds
(function () {
  const { useState: useOdState } = React;
  const day = () => new Date().toISOString().slice(0, 10);
  // cache key includes the feed state so results computed pre-feed don't stick all day
  const feedStamp = () => { const f = window.HelmFeed; return f && f.status ? (f.status.live ? "L" : "d") + (f.status.asOf || "") : "none"; };
  let cache = { d: null, m: new Map() };
  const memo = (k, fn) => {
    const dk = day() + "|" + feedStamp();
    if (cache.d !== dk) cache = { d: dk, m: new Map() };
    if (!cache.m.has(k)) cache.m.set(k, fn());
    return cache.m.get(k);
  };
  const sma = (a, i, n) => { const s = Math.max(0, i - n + 1); let t = 0; for (let j = s; j <= i; j++) t += a[j]; return t / (i - s + 1); };

  // annualized realized vol of the trailing 63 days ending at i
  function vol63(a, i) {
    const s = Math.max(1, i - 62); let m = 0, n = 0;
    const rets = [];
    for (let j = s; j <= i; j++) { const r = a[j] / a[j - 1] - 1; rets.push(r); m += r; }
    m /= rets.length || 1;
    rets.forEach((r) => { n += (r - m) * (r - m); });
    return Math.sqrt(n / (rets.length || 1)) * Math.sqrt(252) * 100;
  }

  // classify every day ≥ warmup into {trend: up|down, vol: lo|mid|hi}; terciles from this series' own history
  function classify(arr) {
    const W = 200;
    if (!arr || arr.length < W + 80) return null;
    const vols = [], cells = [];
    for (let i = W; i < arr.length; i++) vols.push(vol63(arr, i));
    const sortedV = [...vols].sort((a, b) => a - b);
    const t1 = sortedV[Math.floor(sortedV.length / 3)], t2 = sortedV[Math.floor((2 * sortedV.length) / 3)];
    for (let i = W; i < arr.length; i++) {
      const v = vols[i - W];
      cells.push({ i, trend: arr[i] >= sma(arr, i, W) ? "up" : "down", vol: v < t1 ? "lo" : v < t2 ? "mid" : "hi" });
    }
    return { cells, t1, t2 };
  }

  function cellFor(ticker, lookback = 1260) {
    return memo("cell:" + ticker, () => {
      const s = window.HelmSigma.seriesFor(ticker, lookback);
      const cl = classify(s.arr);
      if (!cl) return null;
      const now = cl.cells[cl.cells.length - 1];
      return { trend: now.trend, vol: now.vol, real: !!s.real, arr: s.arr, cells: cl.cells };
    });
  }

  // forward stats among past days sharing today's cell (exclude the last `h` days — outcome unknown)
  function compute(ticker, lookback = 1260) {
    return memo("odds:" + ticker, () => {
      const c = cellFor(ticker, lookback);
      if (!c) return null;
      const HORIZONS = [{ k: "1wk", h: 5 }, { k: "1mo", h: 21 }, { k: "3mo", h: 63 }];
      const out = { trend: c.trend, vol: c.vol, real: c.real, horizons: [] };
      for (const { k, h } of HORIZONS) {
        const rets = [];
        for (const cell of c.cells) {
          if (cell.trend !== c.trend || cell.vol !== c.vol) continue;
          if (cell.i + h >= c.arr.length) continue;
          rets.push((c.arr[cell.i + h] / c.arr[cell.i] - 1) * 100);
        }
        if (rets.length < 20) { out.horizons.push({ k, n: rets.length }); continue; }
        rets.sort((a, b) => a - b);
        out.horizons.push({
          k, n: rets.length,
          median: rets[Math.floor(rets.length / 2)],
          pUp: (rets.filter((r) => r > 0).length / rets.length) * 100,
          worst: rets[Math.floor(rets.length * 0.1)], // worst decile
        });
      }
      out.n = Math.max(...out.horizons.map((h) => h.n || 0));
      return out;
    });
  }

  // secular (200d) + weekly (20d) trend, each with the date the current signal started
  function trend2(ticker) {
    return memo("t2:" + ticker, () => {
      const s = window.HelmSigma.seriesFor(ticker, 400);
      const a = s.arr;
      if (!a || a.length < 60) return null;
      const one = (win) => {
        const n = a.length - 1;
        const on = a[n] >= sma(a, n, win);
        let since = 0;
        for (let i = n; i >= Math.max(win, 1); i--) {
          if ((a[i] >= sma(a, i, win)) === on) since = n - i; else break;
        }
        const d = new Date(Date.now() - since * 1.45 * 86400000); // calendar ≈ trading days × 1.45
        return { up: on, sinceD: since, since: d.toLocaleDateString("en-CA", { month: "short", day: "numeric" }) + (since > 175 ? " ’" + String(d.getFullYear()).slice(2) : "") };
      };
      return { secular: one(Math.min(200, a.length - 2)), weekly: one(20), real: !!s.real };
    });
  }

  // ---- Bridge rail card: the tape's odds, probability-framed ----
  function OddsCard() {
    const [open, setOpen] = useOdState(false);
    const o = compute("SPX", 1260);
    if (!o) return null;
    const cellName = `${o.trend === "up" ? "Uptrend" : "Downtrend"} · ${o.vol === "lo" ? "low" : o.vol === "mid" ? "mid" : "high"} vol`;
    const m1 = o.horizons.find((h) => h.k === "1mo");
    const pc = (v) => v == null ? "—" : v.toFixed(0) + "%";
    const sg = (v, dp = 1) => v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(dp) + "%";
    const edge = m1 && m1.pUp != null ? (m1.pUp >= 62 ? ["tailwind", "#0e9f6e"] : m1.pUp >= 52 ? ["mild tailwind", "#0e9f6e"] : m1.pUp >= 48 ? ["coin-flip", "var(--muted)"] : ["headwind", "#e02424"]) : null;
    return (
      <section className="pm-card od-card">
        <div className="od-head" onClick={() => setOpen(!open)}>
          <span className="br-eyebrow">Conditioned odds · S&P 500</span>
          <span className="od-cell mono">{cellName}{o.real ? "" : " · demo"}</span>
        </div>
        {m1 && m1.pUp != null && (
          <div className="od-line">
            P(higher in 1 month): <b style={{ color: edge[1] }}>{pc(m1.pUp)}</b> <span className="od-tag" style={{ color: edge[1] }}>{edge[0]}</span>
            <span className="od-med">median {sg(m1.median)} · worst decile {sg(m1.worst)}</span>
          </div>
        )}
        {open && (
          <div className="od-table">
            <div className="od-tr od-th"><span>Fwd</span><span>P(up)</span><span>Median</span><span>Worst 10%</span><span>n</span></div>
            {o.horizons.map((h) => (
              <div className="od-tr mono" key={h.k}>
                <span>{h.k}</span>
                {h.pUp != null ? (<React.Fragment>
                  <span style={{ color: h.pUp >= 55 ? "#0e9f6e" : h.pUp <= 45 ? "#e02424" : "var(--ink-2)" }}>{pc(h.pUp)}</span>
                  <span>{sg(h.median)}</span>
                  <span style={{ color: "#e02424" }}>{sg(h.worst)}</span>
                  <span style={{ color: "var(--muted)" }}>{h.n}</span>
                </React.Fragment>) : (<span style={{ gridColumn: "2 / -1", color: "var(--muted)" }}>n={h.n} — too few matching days</span>)}
              </div>
            ))}
            <div className="od-note">How PAST days in this same trend×vol cell resolved ({o.n} matching days over ~5y{o.real ? ", real series" : ", synthetic demo series"}). Base rates, not a forecast — 50% is a coin-flip.</div>
          </div>
        )}
      </section>
    );
  }

  const OD_CSS = `
  .od-card { display: flex; flex-direction: column; gap: 8px; }
  .od-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; cursor: pointer; }
  .od-cell { font-size: 10px; color: var(--ink-2); background: var(--panel-2, #f4f6f8); padding: 2px 8px; border-radius: 99px; white-space: nowrap; }
  .od-line { font-size: 12px; color: var(--ink-2); line-height: 1.55; }
  .od-line b { font-size: 13px; }
  .od-tag { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-left: 4px; }
  .od-med { display: block; font-size: 10.5px; color: var(--muted); font-family: var(--mono); margin-top: 2px; }
  .od-table { display: flex; flex-direction: column; gap: 3px; border-top: 1px solid var(--line-2, #f0f2f5); padding-top: 7px; }
  .od-tr { display: grid; grid-template-columns: 44px 1fr 1fr 1fr 40px; gap: 6px; font-size: 11px; }
  .od-th { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 700; font-family: inherit; }
  .od-note { font-size: 10px; color: var(--muted); line-height: 1.5; margin-top: 4px; }
  .scr-t2 { display: flex; flex-direction: column; gap: 2px; align-items: center; }
  .scr-t2 span { font-family: var(--mono); font-size: 9.5px; line-height: 1.2; white-space: nowrap; }
  `;
  if (!document.getElementById("helm-od-css")) {
    const el = document.createElement("style"); el.id = "helm-od-css"; el.textContent = OD_CSS; document.head.appendChild(el);
  }

  window.HelmOdds = { cellFor, compute, trend2 };
  window.OddsCard = OddsCard;
})();
