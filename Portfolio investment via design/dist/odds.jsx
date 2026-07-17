// macro.jsx — Macro module: liquidity model, yield curve, key indicators, geopolitical feed.
// Reads window.HelmFeed.macro / .news when the feed is live; otherwise deterministic mock.
// Grounded in NBC Finance 101: Séance 08 (what moves markets), 10 (yield curves), 12 (commodities).
const { useState: useStateM } = React;

const mUP = "#0e9f6e", mDOWN = "#e02424", mWARN = "#d97706";
const mClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function mMul(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function walk(seed, n, start, drift, vol, floor) {
  const rnd = mMul(seed); const out = []; let v = start;
  for (let i = 0; i < n; i++) { v = v * (1 + drift / n + (rnd() - 0.5) * 2 * vol); if (floor != null) v = Math.max(floor, v); out.push(v); }
  return out;
}

// ---- assemble macro series: live if present, else deterministic mock ----
function getMacro() {
  const live = window.HelmFeed && window.HelmFeed.macro;
  const pick = (key, fallback) => {
    if (live && Array.isArray(live[key]) && live[key].length) return live[key].map((o) => o.v);
    return fallback;
  };
  // net liquidity: normalize to BILLIONS regardless of whether feed sent millions or billions
  let nl = pick("net_liquidity", walk(101, 60, 5950, -0.06, 0.012, 4000));
  if (nl.length && Math.max(...nl) > 100000) nl = nl.map((v) => v / 1000); // millions → billions
  // CPI: if the feed sent the raw index level (~250-360), convert to YoY %
  let cpiRaw = pick("us_cpi", null);
  let cpi;
  if (cpiRaw && cpiRaw.length) {
    if (Math.max(...cpiRaw) > 50) {           // index level, not a percent
      const out = [];
      for (let i = 12; i < cpiRaw.length; i++) {
        if (cpiRaw[i - 12]) out.push((cpiRaw[i] / cpiRaw[i - 12] - 1) * 100);
      }
      cpi = out.length ? out : [2.9];
    } else {
      cpi = cpiRaw;                            // already YoY %
    }
  } else {
    cpi = walk(104, 60, 2.9, -0.04, 0.01, 0);
  }
  return {
    live: !!live,
    netLiquidity: nl,
    us10y: pick("us10y", walk(102, 60, 4.55, -0.07, 0.02, 0.5)),
    us2y: pick("us2y", walk(103, 60, 4.35, -0.10, 0.02, 0.5)),
    cpi: cpi,
    unemployment: pick("us_unemployment", walk(105, 60, 4.1, 0.05, 0.008, 0)),
    fedFunds: pick("fed_funds", walk(106, 60, 4.5, -0.06, 0.004, 0)),
    oil: pick("wti_oil", walk(107, 60, 74, 0.12, 0.02, 20)),
  };
}

const last = (a) => a[a.length - 1];
const chg = (a) => a.length > 1 ? a[a.length - 1] - a[0] : 0;

// ---- Global M2 liquidity (Raoul Pal lens): BTC tracks global M2 with a ~10–12 week lag ----
function globalM2Series() {
  const live = window.HelmFeed && window.HelmFeed.macro && window.HelmFeed.macro.global_m2;
  if (live && live.length) return live.map((o) => o.v);
  return walk(303, 78, 102, 0.16, 0.010, 80).map((v) => v * 1000); // ~$102T in trillions
}
const m2IsLive = () => !!(window.HelmFeed && window.HelmFeed.macro && window.HelmFeed.macro.global_m2 && window.HelmFeed.macro.global_m2.length);
// real BTC monthly closes aligned onto the (monthly) live M2 months, shifted LEFT by
// lagObs so leader/follower peaks overlay; the flat tail = the lag window (forecast zone)
function realBtcMonthly(lagObs) {
  const f = window.HelmFeed;
  const m2raw = f && f.macro && f.macro.global_m2;
  const bt = f && f.prices && f.prices.BTC;
  if (!m2raw || !Array.isArray(bt) || bt.length < 60) return null;
  const byM = {};
  bt.forEach((o) => { byM[o.d.slice(0, 7)] = o.c; });
  const months = m2raw.map((o) => o.d.slice(0, 7));
  let lastV = null;
  const vals = months.map((m, i) => {
    const v = byM[months[Math.min(months.length - 1, i + lagObs)]];
    return v != null ? (lastV = v) : lastV;
  });
  if (lastV == null) return null;
  const first = vals.find((v) => v != null);
  return vals.map((v) => (v == null ? first : v));
}
function btcVsM2(m2, lagWeeks) {
  const rnd = mMul(404); const out = [];
  for (let i = 0; i < m2.length; i++) {
    const src = m2[Math.max(0, i - lagWeeks)];
    const amp = 1 + (src / m2[0] - 1) * 6.5;            // BTC ~6.5× the M2 impulse
    out.push(40000 * amp * (1 + (rnd() - 0.5) * 0.04));
  }
  return out;
}
function M2Chart({ m2, btc, accent, height = 280 }) {
  const W = 1000, H = height, padT = 16, padB = 20, padL = 8, padR = 8;
  const n = m2.length;
  const norm = (a) => { const lo = Math.min(...a), hi = Math.max(...a); return a.map((v) => (v - lo) / (hi - lo || 1)); };
  const nm = norm(m2), nb = norm(btc);
  const x = (i) => padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - v) * (H - padT - padB);
  const line = (arr) => window.smoothPath ? window.smoothPath(arr.map((v, i) => [x(i), y(v)]), 0.5)
    : arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
      <path d={line(nm)} fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <path d={line(nb)} fill="none" stroke={accent} strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ---- mini sparkline that fills its cell ----
function MacroSpark({ pts, color, height = 34 }) {
  const W = 120, H = height;
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (v) => H - 2 - ((v - lo) / (hi - lo || 1)) * (H - 4);
  const d = window.smoothPath ? window.smoothPath(pts.map((v, i) => [x(i), y(v)]), 0.5)
    : pts.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block" }}>
    <path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg>;
}

// ---- big area chart (net liquidity) ----
function LiquidityChart({ pts, accent, height = 260 }) {
  const W = 1000, H = height, padT = 14, padB = 24, padL = 56, padR = 12;
  const lo = Math.min(...pts) * 0.99, hi = Math.max(...pts) * 1.005;
  const x = (i) => padL + (i / (pts.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
  const line = window.smoothPath ? window.smoothPath(pts.map((v, i) => [x(i), y(v)]), 0.5)
    : pts.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;
  const gid = "lqg";
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={accent} stopOpacity="0.20" /><stop offset="100%" stopColor={accent} stopOpacity="0" />
      </linearGradient></defs>
      {ticks.map((v, i) => (<g key={i}>
        <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="currentColor" strokeOpacity="0.08" />
        <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="mc-ytick">${(v / 1000).toFixed(2)}T</text>
      </g>))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={accent} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ---- yield-curve mini (2y vs 10y) ----
function YieldCurve({ y2, y10, accent }) {
  const spread = y10 - y2;
  const inverted = spread < 0;
  const pts = [{ l: "3M", v: y2 + 0.15 }, { l: "2Y", v: y2 }, { l: "5Y", v: (y2 + y10) / 2 - 0.05 }, { l: "10Y", v: y10 }, { l: "30Y", v: y10 + 0.25 }];
  const W = 300, H = 130, padL = 30, padB = 22, padT = 10, padR = 10;
  const lo = Math.min(...pts.map((p) => p.v)) - 0.2, hi = Math.max(...pts.map((p) => p.v)) + 0.2;
  const x = (i) => padL + (i / (pts.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
  const d = window.smoothPath ? window.smoothPath(pts.map((p, i) => [x(i), y(p.v)]), 0.5) : pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.v)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 130, display: "block" }}>
        <path d={d} fill="none" stroke={inverted ? mDOWN : accent} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
        {pts.map((p, i) => (<g key={p.l}>
          <circle cx={x(i)} cy={y(p.v)} r="3" fill={inverted ? mDOWN : accent} />
          <text x={x(i)} y={H - 6} textAnchor="middle" className="mc-ytick">{p.l}</text>
        </g>))}
      </svg>
      <div className="mc-curve-read" style={{ color: inverted ? mDOWN : mUP }}>
        {inverted ? "▼ Inverted" : "▲ Normal"} · 10Y−2Y spread {spread >= 0 ? "+" : ""}{(spread * 100).toFixed(0)} bps
      </div>
      <div className="mc-curve-note">{inverted
        ? "An inverted curve has historically preceded recessions — the classic fixed-income warning (Séance 10)."
        : "An upward-sloping curve signals normal growth expectations."}</div>
    </div>
  );
}

// ---- default geopolitical / economist feed (mock) — themed on the CIO June 2026 risks ----
const MOCK_NEWS = [
  { headline: "Strait of Hormuz tensions keep a risk premium in crude", source: "Reuters", tone: -2.1, tag: "Geopolitics" },
  { headline: "New Fed chair Warsh signals patience on rate cuts amid sticky core CPI", source: "Bloomberg", tone: -0.8, tag: "Monetary" },
  { headline: "AI capex cycle broadens beyond mega-cap; concentration risk debated", source: "FT", tone: 0.6, tag: "Equities" },
  { headline: "Emerging-market earnings revisions turn positive, valuations in line with history", source: "MSCI", tone: 1.4, tag: "Equities" },
  { headline: "Gold extends gains as central banks keep accumulating reserves", source: "WGC", tone: 1.1, tag: "Commodities" },
  { headline: "Canadian dollar firms on stronger commodity terms of trade", source: "BoC", tone: 0.5, tag: "FX" },
];
function getNews() {
  const live = window.HelmFeed && window.HelmFeed.news;
  if (live && live.length) {
    return live.filter((n) => n.headline).slice(0, 8).map((n) => ({
      headline: n.headline, source: n.source || "—", tone: n.tone || 0,
      tag: n.ticker && n.ticker !== "MACRO" ? n.ticker : "Macro",
    }));
  }
  return MOCK_NEWS;
}

function MacroModule({ accent }) {
  const [tab, setTab] = useStateM("regime");
  const [lag, setLag] = useStateM(10);
  const m = getMacro();
  const news = getNews();
  const m2 = globalM2Series();
  const m2Live = m2IsLive();
  const lagObs = m2Live ? Math.max(1, Math.round(lag / 4.33)) : lag; // live series is monthly
  const btc = (m2Live && realBtcMonthly(lagObs)) || btcVsM2(m2, lagObs);
  const m2Chg = (last(m2) / m2[0] - 1) * 100;

  const nl = m.netLiquidity, nlLast = last(nl), nlChg = (nlLast / nl[0] - 1) * 100;
  const liqRising = nlChg >= 0;
  const y10 = last(m.us10y), y2 = last(m.us2y), spread = y10 - y2;
  const cpiNow = last(m.cpi), oilNow = last(m.oil), ffNow = last(m.fedFunds), unNow = last(m.unemployment);

  // economist read — synthesized from the indicators
  const posBits = [];
  posBits.push(liqRising ? "expanding liquidity is a tailwind for risk assets" : "contracting net liquidity is a headwind for risk assets");
  posBits.push(spread < 0 ? "an inverted curve flags late-cycle risk" : "a normal curve supports the growth view");
  posBits.push(cpiNow > 3 ? "inflation above target keeps the Fed cautious" : "inflation near target gives the Fed room");
  const stance = (liqRising ? 1 : -1) + (spread < 0 ? -1 : 1) + (cpiNow > 3 ? -1 : 1);
  const posture = stance >= 2 ? ["Constructive", mUP] : stance <= -1 ? ["Cautious", mDOWN] : ["Balanced", mWARN];

  const INDICATORS = [
    { label: "Fed net liquidity", val: `$${(nlLast / 1000).toFixed(2)}T`, chg: nlChg, pts: nl, color: accent, note: "balance sheet − RRP − TGA" },
    { label: "10Y Treasury", val: `${y10.toFixed(2)}%`, chg: chg(m.us10y) * 100, pts: m.us10y, color: "#4f46e5", note: "bps over window", unit: "bps" },
    { label: "2Y Treasury", val: `${y2.toFixed(2)}%`, chg: chg(m.us2y) * 100, pts: m.us2y, color: "#0891b2", note: "bps over window", unit: "bps" },
    { label: "CPI (YoY)", val: `${cpiNow.toFixed(1)}%`, chg: chg(m.cpi), pts: m.cpi, color: mWARN, note: "vs 2% target", inv: true },
    { label: "Fed funds", val: `${ffNow.toFixed(2)}%`, chg: chg(m.fedFunds), pts: m.fedFunds, color: "#7c3aed", note: "policy rate" },
    { label: "Unemployment", val: `${unNow.toFixed(1)}%`, chg: chg(m.unemployment), pts: m.unemployment, color: "#64748b", note: "U-3 rate", inv: true },
    { label: "WTI crude", val: `$${oilNow.toFixed(0)}`, chg: (oilNow / m.oil[0] - 1) * 100, pts: m.oil, color: "#d97706", note: "Hormuz premium" },
  ];

  return (
    <div className="mc">
      <style>{`.mc-tabs{display:flex;gap:8px;margin-bottom:16px}.mc-tabs button{font:inherit;font-size:13px;font-weight:600;color:var(--ink-2);background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:8px 14px;cursor:pointer}.mc-tabs button:hover{border-color:var(--muted)}`}</style>
      <div className="mc-tabs">
        <button className={tab === "regime" ? "is-active" : ""} onClick={() => setTab("regime")} style={tab === "regime" ? { borderColor: accent, color: accent } : {}}>Economic CIO &amp; geopolitics</button>
        <button className={tab === "indicators" ? "is-active" : ""} onClick={() => setTab("indicators")} style={tab === "indicators" ? { borderColor: accent, color: accent } : {}}>Liquidity &amp; indicators</button>
      </div>

      {tab === "regime" && window.CioMacroPanel && <div style={{ marginBottom: 16 }}><window.CioMacroPanel accent={accent} account="all" /></div>}
      {tab === "regime" && window.RegimePanel && <window.RegimePanel accent={accent} />}
      {tab === "regime" && (
      <section className="pm-card mc-read" style={{ marginTop: 16 }}>
        <div className="mc-read-l">
          <div className="pm-card-eyebrow">Macro read · the economist's view {m.live ? "· live data" : "· demo data"}</div>
          <div className="mc-posture" style={{ color: posture[1] }}>{posture[0]}</div>
          <p className="mc-read-txt">With {posBits[0]}, {posBits[1]}, and {posBits[2]}. Net liquidity is {liqRising ? "rising" : "falling"} ({nlChg >= 0 ? "+" : ""}{nlChg.toFixed(1)}% over the window), the 10Y−2Y spread sits at {spread >= 0 ? "+" : ""}{(spread * 100).toFixed(0)} bps, and WTI carries a geopolitical premium near ${oilNow.toFixed(0)}.</p>
        </div>
        <div className="mc-read-r">
          <div className="mc-read-stat"><span>Liquidity trend</span><strong style={{ color: liqRising ? mUP : mDOWN }}>{liqRising ? "Expanding" : "Contracting"}</strong></div>
          <div className="mc-read-stat"><span>Yield curve</span><strong style={{ color: spread < 0 ? mDOWN : mUP }}>{spread < 0 ? "Inverted" : "Normal"}</strong></div>
        </div>
      </section>
      )}

      {tab === "indicators" && <>

      {/* liquidity model — the Raoul Pal lens */}
      <section className="pm-card">
        <div className="pm-card-head">
          <div>
            <div className="pm-card-eyebrow">Global liquidity model</div>
            <div className="mc-liq-sub">Fed net liquidity (balance sheet − reverse repo − TGA) — the dominant driver of risk-asset cycles.</div>
          </div>
          <div className="mc-liq-val" style={{ color: liqRising ? mUP : mDOWN }}>${(nlLast / 1000).toFixed(2)}T <span>{nlChg >= 0 ? "+" : ""}{nlChg.toFixed(1)}%</span></div>
        </div>
        <div className="mc-chart" style={{ color: "var(--ink)" }}><LiquidityChart pts={nl} accent={accent} /></div>
        <div className="mc-foot-note">When net liquidity expands, risk assets (equities, crypto) tend to follow with a lag; contraction tightens financial conditions. This is the core of the liquidity-cycle framework.</div>
      </section>

      {/* Global M2 — the Raoul Pal lens */}
      <section className="pm-card">
        <div className="pm-card-head">
          <div>
            <div className="pm-card-eyebrow">Global M2 liquidity · the liquidity-cycle lens</div>
            <div className="mc-liq-sub">Global M2 (US + Eurozone + Japan + UK + Canada money supply, in USD{m2Live ? " · real FRED/OECD series, monthly" : ""}) leads Bitcoin by ~10–12 weeks — the dominant driver of the crypto/risk cycle.{m2Live ? " China M2 has no maintained free series — excluded, impulse still representative." : ""}</div>
          </div>
          <div className="mc-m2-ctrl">
            <span className="mc-m2-lagval" style={{ color: accent }}>${(last(m2) / 1000).toFixed(1)}T <span>{m2Chg >= 0 ? "+" : ""}{m2Chg.toFixed(1)}%</span></span>
            <div className="pm-range mc-m2-seg">
              {[8, 10, 12].map((w) => (
                <button key={w} className={lag === w ? "is-active" : ""} onClick={() => setLag(w)}>{w}w lag</button>
              ))}
            </div>
          </div>
        </div>
        <div className="mc-legend2">
          <span><i style={{ background: "var(--muted)" }} /> Global M2 (leads)</span>
          <span><i style={{ background: accent }} /> Bitcoin ({m2Live ? "real, " : ""}follows, {lag}-week lag)</span>
        </div>
        <div className="mc-chart" style={{ color: "var(--ink)" }}><M2Chart m2={m2} btc={btc} accent={accent} /></div>
        <div className="mc-foot-note">Raoul Pal's thesis: monetary expansion — not headlines — drives Bitcoin's long-term path, with global M2 explaining the bulk of moves at a ~{lag}-week lead. <strong>Caveat:</strong> critics note the relationship is sensitive to the chosen lag and reporting-frequency mismatches, so treat it as a cycle compass, not a precise timing tool.</div>
      </section>

      <div className="mc-cols">
        {/* indicators grid */}
        <section className="pm-card">
          <div className="pm-card-eyebrow">Key indicators</div>
          <div className="mc-grid">
            {INDICATORS.map((it) => {
              const up = it.chg >= 0;
              const good = it.inv ? !up : up;
              return (
                <div className="mc-ind" key={it.label}>
                  <div className="mc-ind-top">
                    <span className="mc-ind-label">{it.label}</span>
                    <span className="mc-ind-chg" style={{ color: good ? mUP : mDOWN }}>{up ? "▲" : "▼"} {Math.abs(it.chg).toFixed(it.unit === "bps" ? 0 : 1)}{it.unit === "bps" ? "bps" : "%"}</span>
                  </div>
                  <div className="mc-ind-val">{it.val}</div>
                  <MacroSpark pts={it.pts} color={it.color} />
                  <div className="mc-ind-note">{it.note}</div>
                </div>
              );
            })}
            <div className="mc-ind mc-ind-curve">
              <div className="mc-ind-label">Yield curve</div>
              <YieldCurve y2={y2} y10={y10} accent={accent} />
            </div>
          </div>
        </section>

        {/* geopolitical / news feed */}
        <section className="pm-card mc-feed-card">
          <div className="pm-card-eyebrow">Geopolitical & market feed</div>
          <div className="mc-feed">
            {news.map((n, i) => {
              const tone = n.tone || 0;
              const tc = tone > 0.5 ? mUP : tone < -0.5 ? mDOWN : "var(--muted)";
              return (
                <div className="mc-news" key={i}>
                  <div className="mc-news-top">
                    <span className="mc-news-tag" style={{ color: accent }}>{n.tag}</span>
                    <span className="mc-news-tone" style={{ color: tc }} title="sentiment tone">{tone > 0.5 ? "▲" : tone < -0.5 ? "▼" : "—"}</span>
                  </div>
                  <div className="mc-news-h">{n.headline}</div>
                  <div className="mc-news-src">{n.source}</div>
                </div>
              );
            })}
          </div>
          <div className="mc-foot-note">{m.live ? "Live headlines via the feed (GDELT + Finnhub)." : "Demo headlines — connect the feed for live GDELT + Finnhub events."}</div>
        </section>
      </div>
      </>}
    </div>
  );
}

window.MacroModule = MacroModule;
