// sigma.jsx — v2-C: index σ-bands + relative-strength leader rank.
// window.HelmSigma: where a name sits, in standard deviations, vs its benchmark
// (Nasdaq-100 / S&P 500 / TSX 60 proxy), plus a 6-mo RS percentile within the
// held+universe scope. Real feed histories when live; deterministic synthetic
// fallback (flagged real:false) in demo. Deterministic — no LLM.
(function () {
  const D = () => window.PMData;

  function hashSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100000; }

  // ---- raw close series for any ticker (real feed EOD if present, else synthetic) ----
  function seriesFor(ticker, n = 252) {
    const P = window.HelmFeed && window.HelmFeed.prices;
    const s = P && P[ticker];
    if (Array.isArray(s) && s.length > 40) {
      return { arr: s.slice(-n).map((r) => r.c != null ? r.c : r), real: true };
    }
    // synthetic: seeded by ticker so it's stable across renders
    const held = (D().allHoldings || []).find((h) => h.ticker === ticker);
    const uni = (window.HelmUniverse || []).find((u) => u.ticker === ticker);
    const px = held ? held.price : uni ? uni.price : 50;
    const seed = held && held.seed != null ? held.seed : hashSeed(ticker);
    const totalReturn = ((hashSeed(ticker + "r") % 90) - 30) / 100; // −30%..+60%, stable
    return { arr: D().priceHistory(seed, n, px, totalReturn, 0.016), real: false };
  }

  const BENCH = {
    ndx: { name: "Nasdaq-100", feedKeys: ["NDX", "^NDX", "QQQ"] },
    spx: { name: "S&P 500", feedKeys: ["SPX", "^GSPC", "SPY"] },
    tsx: { name: "TSX 60", feedKeys: ["TSX60", "XIU.TO", "TSX"] },
  };
  function benchSeries(key, n = 252) {
    const b = BENCH[key] || BENCH.spx;
    const P = window.HelmFeed && window.HelmFeed.prices;
    if (P) for (const k of b.feedKeys) {
      const s = P[k];
      if (Array.isArray(s) && s.length > 40) return { arr: s.slice(-n).map((r) => r.c != null ? r.c : r), real: true, name: b.name };
    }
    const demo = key === "ndx" ? D().nasdaq : key === "spx" ? D().sp500 : D().priceHistory(991, 252, 100, 0.10, 0.006);
    return { arr: demo.slice(-n), real: false, name: b.name };
  }

  // pick the natural benchmark for a name (crypto/US tech → NDX; CA-listed → TSX; else SPX)
  // NOTE: allHoldings[].ccy is the DISPLAY currency (all CAD when toggle=CAD) — never use it
  // for listing detection. Native listing = account the name is held in, or universe market.
  function nativeCcy(t) {
    if (/\.TO$|\.B$|\.UN$/.test(t)) return "CAD";
    // a ticker can sit in several accounts (e.g. NVDA CDR in celi-cad + NVDA in celi-usd):
    // if ANY holding is in a USD/crypto account, the bare symbol is the US listing
    const rows = (D().allHoldings || []).filter((x) => x.ticker === t);
    if (rows.length) return rows.some((x) => /usd|crypto/.test(x.acct || "")) ? "USD" : "CAD";
    const uni = (window.HelmUniverse || []).find((u) => u.ticker === t);
    if (uni) { if (uni.market) return uni.market === "CA" ? "CAD" : "USD"; if (uni.ccy) return uni.ccy; }
    return "USD";
  }
  function benchKeyFor(h) {
    const t = (h.ticker || h) + "";
    const held = (D().allHoldings || []).find((x) => x.ticker === t) || {};
    const uni = (window.HelmUniverse || []).find((u) => u.ticker === t) || {};
    const sec = (typeof h === "object" && h.sector) || held.sector || uni.sector || "";
    if (/Crypto/i.test(sec)) return "ndx"; // risk-asset benchmark for the crypto sleeve
    if (nativeCcy(t) === "CAD") return "tsx";
    if (/Semicond|Tech|Software|Internet|Communication/i.test(sec)) return "ndx";
    return "spx";
  }

  // ---- the core: excess-return path vs the index + σ cone position ----
  // z = cumulative log excess return ÷ (σ_daily_excess · √n)
  function compute(ticker, benchKey, lookback = 252) {
    const key = benchKey || benchKeyFor(ticker);
    const s = seriesFor(ticker, lookback + 1), b = benchSeries(key, lookback + 1);
    const n = Math.min(s.arr.length, b.arr.length);
    if (n < 40) return null;
    const sa = s.arr.slice(-n), ba = b.arr.slice(-n);
    const ex = [0]; // cumulative log excess path, β = 1
    const dEx = [];
    for (let i = 1; i < n; i++) {
      const d = Math.log(sa[i] / sa[i - 1]) - Math.log(ba[i] / ba[i - 1]);
      dEx.push(d); ex.push(ex[ex.length - 1] + d);
    }
    const mean = dEx.reduce((a, v) => a + v, 0) / dEx.length;
    const sd = Math.sqrt(dEx.reduce((a, v) => a + (v - mean) * (v - mean), 0) / dEx.length) || 0.0001;
    const zPath = ex.map((e, i) => i === 0 ? 0 : e / (sd * Math.sqrt(i)));
    const z = zPath[zPath.length - 1];
    // z ~6 weeks ago, for "was +1.9σ in May" context
    const zPrev = zPath[Math.max(0, zPath.length - 31)];
    return { z, zPrev, zPath, ex, sigmaD: sd, n, real: s.real && b.real, benchKey: key, benchName: b.name,
      zone: z >= 2 ? "extended" : z >= 1 ? "working" : z > -1 ? "band" : z > -2 ? "soft" : "broken" };
  }

  // ---- RS leader rank: 126-day return percentile within held + universe ----
  let _rsCache = null, _rsStamp = 0;
  function rsTable() {
    if (_rsCache && Date.now() - _rsStamp < 120000) return _rsCache;
    const seen = {};
    (D().allHoldings || []).forEach((h) => { seen[h.ticker] = true; });
    (window.HelmUniverse || []).forEach((u) => { seen[u.ticker] = true; });
    const rows = Object.keys(seen).map((t) => {
      const s = seriesFor(t, 130);
      const a = s.arr; if (!a || a.length < 60) return null;
      const r = a[a.length - 1] / a[0] - 1;
      return { t, r, real: s.real };
    }).filter(Boolean).sort((a, b) => a.r - b.r);
    const out = {};
    rows.forEach((row, i) => { out[row.t] = { pct: Math.round((i / (rows.length - 1)) * 100), r6m: row.r * 100, real: row.real }; });
    _rsCache = out; _rsStamp = Date.now();
    return out;
  }
  function rsRank(ticker) { return rsTable()[ticker] || null; }

  // entry read used by the proposition engine (v2-A G3): leaders inside the band
  function entryRead(ticker, benchKey) {
    const sig = compute(ticker, benchKey);
    const rs = rsRank(ticker);
    if (!sig) return null;
    const leader = rs && rs.pct >= 75;
    const gate = sig.z >= 2 ? "block-chase" : sig.z <= -2 ? "block-knife" : "pass";
    const setup = gate !== "pass" ? null
      : leader && sig.z < 1 && sig.zPrev >= 1.2 ? "leader-pullback"
      : leader && sig.z < 1 ? "leader-in-band"
      : leader ? "leader-working"
      : null;
    return { ...sig, rs, leader, gate, setup };
  }

  // ---- compact strip visual for cards (z-path vs ±1/±2σ) ----
  function SigmaStrip({ ticker, benchKey, height = 64 }) {
    const r = compute(ticker, benchKey);
    if (!r) return null;
    const W = 320, H = height, n = r.zPath.length;
    const x = (i) => (i / (n - 1)) * W;
    const y = (z) => H / 2 - (Math.max(-2.6, Math.min(2.6, z)) / 2.6) * (H / 2 - 4);
    const path = r.zPath.map((z, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(z).toFixed(1)}`).join(" ");
    const line = (z, o) => <line x1="0" y1={y(z)} x2={W} y2={y(z)} stroke="currentColor" strokeOpacity={o} strokeWidth="1" strokeDasharray={z ? "3 3" : "0"} />;
    return (
      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }} preserveAspectRatio="none">
          <rect x="0" y={y(1)} width={W} height={y(-1) - y(1)} fill="#2563eb" opacity="0.07"></rect>
          {line(2, 0.18)}{line(1, 0.12)}{line(0, 0.25)}{line(-1, 0.12)}{line(-2, 0.18)}
          <path d={path} fill="none" stroke="#121820" strokeWidth="1.6" vectorEffect="non-scaling-stroke"></path>
          <circle cx={W} cy={y(r.z)} r="3.4" fill={r.z >= 2 ? "#e02424" : r.z <= -2 ? "#2563eb" : "#0e9f6e"}></circle>
        </svg>
        <span style={{ position: "absolute", right: 2, top: 0, fontSize: 9.5, fontFamily: "var(--mono)", color: "var(--muted)" }}>+2σ</span>
        <span style={{ position: "absolute", right: 2, bottom: 0, fontSize: 9.5, fontFamily: "var(--mono)", color: "var(--muted)" }}>−2σ</span>
      </div>
    );
  }

  // ---- log-trend channel (GMI "Compounding Machine" pattern): regression on log price,
  // σ of residuals → distance-to-own-trend in σ. Absolute twin of the relative σ-band above.
  // vsKey: null = own trend; "ndx"/"spx"/"tsx" = ratio vs index; "btc" = ratio vs Bitcoin.
  // Ratio mode fits the channel on log(asset ÷ benchmark) — the Real Vision relative lens;
  // px keeps the aligned ASSET price so $ accounting stays honest.
  function logTrend(ticker, lookback = 1260, vsKey = null) {
    const s = seriesFor(ticker, lookback);
    let a = s.arr; if (!a || a.length < 120) return null;
    let px = a, real = s.real, vsName = null;
    if (vsKey && !(vsKey === "btc" && ticker === "BTC")) {
      const b = vsKey === "btc" ? { ...seriesFor("BTC", lookback), name: "Bitcoin" } : benchSeries(vsKey, lookback);
      const n0 = Math.min(a.length, b.arr.length); if (n0 < 120) return null;
      const sa = a.slice(-n0), ba = b.arr.slice(-n0);
      a = sa.map((v, i) => v / ba[i]); px = sa;
      real = s.real && b.real; vsName = b.name;
    }
    const ln = a.map(Math.log), n = ln.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += ln[i]; sxx += i * i; sxy += i * ln[i]; }
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const intercept = (sy - slope * sx) / n;
    const resid = ln.map((v, i) => v - (intercept + slope * i));
    const sd = Math.sqrt(resid.reduce((t, v) => t + v * v, 0) / n) || 1e-4;
    const zPath = resid.map((v) => v / sd);
    return { arr: a, px, vsName, slope, intercept, sd, z: zPath[n - 1], zPath, n, real,
      fairNow: Math.exp(intercept + slope * (n - 1)),
      cagr: Math.exp(slope * 252) - 1,          // trend growth, annualized
      sigmaPct: Math.exp(sd) - 1,               // 1σ as % of fair value
      zone: zPath[n - 1] <= -1 ? "buy" : zPath[n - 1] >= 1 ? "chip" : "neutral" };
  }

  function bustCache() { _rsCache = null; _rsStamp = 0; }

  window.HelmSigma = { seriesFor, benchSeries, benchKeyFor, nativeCcy, compute, rsRank, rsTable, entryRead, BENCH, bustCache, logTrend };
  window.SigmaStrip = SigmaStrip;
})();
