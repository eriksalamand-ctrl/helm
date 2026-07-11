// regime.jsx — Economic CIO engine (Phase 2): 9-state regime classifier, scored geopolitical
// framework, and the geo→econ→portfolio transmission chain. Sets window.HelmRegime for the spine.
// Grounded in NBC Finance 101 (S08 what moves markets, S10 yield curve, S12 commodities) + CIO June-2026 view.
// + Raoul Pal Real Vision 4-season macro framework + asset-class ranking table.
const { useState: useRegState, useEffect: useRegEffect } = React;

const rUP = "#0e9f6e", rDOWN = "#e02424", rWARN = "#d97706", rINFO = "#4f46e5";

// ---- Raoul Pal 4-season macro framework (Real Vision) ----
// Maps growth × inflation to a season with asset class ranking & portfolio implication.
const SEASONS = {
  Spring: { icon: "🌱", label: "Spring", sub: "Disinflationary boom", desc: "Central banks easing; flood of liquidity; equities & risk assets lead; yield curve steepens.",
    growth: "Rising", inflation: "Falling",
    regimes: ["Goldilocks", "Disinflation"],
    col: "#16a34a",
    ranks: [
      ["Equities (growth)", 1], ["Crypto / BTC", 2], ["EM equities", 3], ["Real estate", 4],
      ["Commodities", 5], ["Investment grade", 6], ["Gold", 7], ["Cash", 8], ["Long bonds", 9],
    ],
    path: "Best entry point. Risk-on posture; deploy cash, add growth & crypto exposure.",
  },
  Summer: { icon: "☀️", label: "Summer", sub: "Inflationary boom", desc: "Growth above potential; inflation rising; central banks start to tighten. Mid-cycle peak.",
    growth: "Rising", inflation: "Rising",
    regimes: ["Reflation", "Overheat"],
    col: "#d97706",
    ranks: [
      ["Commodities", 1], ["Energy", 2], ["Real estate", 3], ["Equities (value/cyclical)", 4],
      ["Crypto / BTC", 5], ["Gold", 6], ["EM equities", 7], ["Investment grade", 8],
      ["Cash", 9], ["Long bonds", 10],
    ],
    path: "Tilt to real assets & value. Trim duration. CB hawkishness approaching.",
  },
  Fall: { icon: "🍂", label: "Fall", sub: "Stagflation", desc: "Growth slowing, inflation still high. Risk premiums widen; CBs still tight. Late cycle.",
    growth: "Falling", inflation: "Rising",
    regimes: ["Stagflation", "Stagflation-lite"],
    col: "#b45309",
    ranks: [
      ["Gold", 1], ["Commodities", 2], ["Cash", 3], ["Short-duration bonds", 4],
      ["Equities (defensives)", 5], ["Energy", 6], ["Real estate", 7], ["EM equities", 8],
      ["Crypto / BTC", 9], ["Long bonds", 10],
    ],
    path: "Defensive posture. Gold, cash, trim equities & crypto. Worst season for risk.",
  },
  Winter: { icon: "❄️", label: "Winter", sub: "Deflationary bust", desc: "Growth and inflation both contracting. CB pivot approaching. Monetary drag widest.",
    growth: "Falling", inflation: "Falling",
    regimes: ["Slowdown", "Contraction", "Deflation bust", "Muddle-through"],
    col: "#2563eb",
    ranks: [
      ["Long bonds", 1], ["Gold", 2], ["Cash", 3], ["Quality equities", 4],
      ["Investment grade", 5], ["Defensives", 6], ["Real estate", 7], ["EM equities", 8],
      ["Commodities", 9], ["Crypto / BTC", 10],
    ],
    path: "Capital preservation. Long duration, gold, cash. Spring setup forms late here — watch the CB pivot signal.",
  },
};

function seasonForRegime(regimeObj) {
  // derive directly from the growth/inflation axes, not the label string
  const g = regimeObj ? regimeObj.growth : null;  // Expanding | Stable | Contracting
  const i = regimeObj ? regimeObj.inflation : null; // Falling | Sticky | Rising
  if (!g || !i) return "Winter"; // defensive default until regime classifies
  if (g === "Expanding" && i === "Falling") return "Spring";
  if (g === "Expanding" && (i === "Sticky" || i === "Rising")) return "Summer";
  if (g === "Contracting" && (i === "Rising" || i === "Sticky")) return "Fall";
  if (g === "Contracting" && i === "Falling") return "Winter";
  // Stable growth: lean by inflation direction
  if (g === "Stable" && i === "Falling") return "Spring";   // disinflation in stable growth = Spring
  if (g === "Stable" && i === "Rising") return "Summer";    // inflation re-accelerating = Summer
  return "Winter"; // Stable + Sticky = muddle-through, defensive default
}

// 9-state grid: growth (Contracting/Stable/Expanding) × inflation (Falling/Sticky/Rising)
const REGIME_GRID = {
  "Expanding|Falling":   { label: "Goldilocks",      bias: "Risk-on", tilt: "Equities OW · duration OW · credit OW", col: rUP },
  "Expanding|Sticky":    { label: "Reflation",       bias: "Risk-on", tilt: "Equities OW · commodities OW · duration UW", col: rUP },
  "Expanding|Rising":    { label: "Overheat",        bias: "Late-cycle", tilt: "Commodities/energy OW · real assets · duration UW", col: rWARN },
  "Stable|Falling":      { label: "Disinflation",    bias: "Constructive", tilt: "Duration OW · quality growth · gold", col: rUP },
  "Stable|Sticky":       { label: "Muddle-through",  bias: "Neutral", tilt: "Balanced · carry · selective equity", col: rWARN },
  "Stable|Rising":       { label: "Stagflation-lite",bias: "Defensive", tilt: "Energy · gold · TIPS · short duration", col: rWARN },
  "Contracting|Falling": { label: "Deflation bust",  bias: "Risk-off", tilt: "Long duration · cash · quality only", col: rDOWN },
  "Contracting|Sticky":  { label: "Slowdown",        bias: "Defensive", tilt: "Ballast · defensives · trim beta", col: rDOWN },
  "Contracting|Rising":  { label: "Stagflation",     bias: "Risk-off", tilt: "Gold · energy · cash · avoid duration & growth", col: rDOWN },
};

// the 7 geopolitical categories (ChatGPT v16 §5), each scored prob × impact
const GEO_CATEGORIES = [
  { k: "Armed conflict", ex: "Hormuz / Iran, regional war", prob: 0.55, impact: 4, horizon: "Weeks", drivers: "Oil, defense, gold ↑ · risk assets ↓" },
  { k: "Energy security", ex: "Supply cuts, sanctions", prob: 0.50, impact: 3, horizon: "Weeks–months", drivers: "Crude premium → inflation" },
  { k: "Trade fragmentation", ex: "Tariffs, export controls", prob: 0.45, impact: 3, horizon: "Months", drivers: "Margins, supply chains, FX" },
  { k: "Strategic competition", ex: "US–China tech, Taiwan/TSMC", prob: 0.40, impact: 4, horizon: "Months–years", drivers: "Semis, AI capex concentration" },
  { k: "Elections / policy", ex: "New Fed chair (Warsh), fiscal", prob: 0.60, impact: 3, horizon: "Months", drivers: "Rates path, term premium" },
  { k: "Cyber / AI", ex: "Critical-infra attack", prob: 0.30, impact: 3, horizon: "Tail", drivers: "Vol spike, sector dispersion" },
  { k: "Critical materials", ex: "Rare earths, uranium, copper", prob: 0.35, impact: 2, horizon: "Months", drivers: "Materials, miners ↑" },
];

// transmission chain (geo → econ → portfolio), gaps filled from NBC S08/09/10/12
const CHAIN = [
  { n: "Geopolitical event", d: "Conflict · energy · trade · sanctions", src: "v16 §5" },
  { n: "Commodities & energy", d: "Oil/gas/uranium/metals repricing", src: "NBC S12" },
  { n: "Inflation & expectations", d: "Headline/core, supply-shock pass-through", src: "NBC S08" },
  { n: "Rates & monetary policy", d: "CB stance, real yields, QT/QE", src: "both" },
  { n: "Yield curve & FX", d: "Curve shape, term premium, CAD/USD", src: "NBC S09–10" },
  { n: "Valuation / ERP", d: "Equity risk premium, credit spreads", src: "NBC S08" },
  { n: "Regime + sleeve impact", d: "9-state regime → per-bucket bias", src: "Copilot §4" },
  { n: "Portfolio response", d: "Routing · risk budget · hedge/monitor", src: "both" },
];

// classify from available macro signals (live feed or mock), mirroring macro.jsx getMacro
function classifyRegime() {
  const live = window.HelmFeed && window.HelmFeed.macro;
  const arr = (k, fb) => (live && Array.isArray(live[k]) && live[k].length ? live[k].map((o) => o.v) : fb);
  let nl = arr("net_liquidity", null);
  // growth proxy: liquidity trend + (inverse) unemployment trend
  const un = arr("us_unemployment", null);
  const cpiRaw = arr("us_cpi", null);
  // fallbacks consistent with current demo read
  const nlTrend = nl && nl.length > 1 ? (nl[nl.length - 1] / nl[0] - 1) : -0.05;
  const unTrend = un && un.length > 1 ? (un[un.length - 1] - un[0]) : 0.1;
  let cpiNow = 2.9, cpiTrend = -0.2;
  if (cpiRaw && cpiRaw.length) {
    if (Math.max(...cpiRaw) > 50) {
      const yoy = []; for (let i = 12; i < cpiRaw.length; i++) if (cpiRaw[i - 12]) yoy.push((cpiRaw[i] / cpiRaw[i - 12] - 1) * 100);
      if (yoy.length) { cpiNow = yoy[yoy.length - 1]; cpiTrend = yoy[yoy.length - 1] - yoy[0]; }
    } else { cpiNow = cpiRaw[cpiRaw.length - 1]; cpiTrend = cpiRaw[cpiRaw.length - 1] - cpiRaw[0]; }
  }
  // growth axis
  const growthScore = (nlTrend > 0 ? 1 : -1) + (unTrend < 0 ? 1 : -1);
  const growth = growthScore >= 1 ? "Expanding" : growthScore <= -1 ? "Contracting" : "Stable";
  // inflation axis
  const inflation = cpiNow > 3.2 && cpiTrend >= -0.1 ? "Rising" : cpiNow > 2.6 ? "Sticky" : "Falling";
  const key = `${growth}|${inflation}`;
  const r = REGIME_GRID[key] || REGIME_GRID["Stable|Sticky"];
  return { ...r, key, growth, inflation, cpiNow, nlTrend };
}

function RegimePanel({ accent }) {
  const r = classifyRegime();
  // geo aggregate score 0–100
  const geoRaw = GEO_CATEGORIES.reduce((s, g) => s + g.prob * g.impact, 0);
  const geoMax = GEO_CATEGORIES.reduce((s, g) => s + 1 * 4, 0);
  const geoScore = Math.round((geoRaw / geoMax) * 100);
  const geoLevel = geoScore >= 55 ? ["Elevated", rDOWN] : geoScore >= 35 ? ["Moderate", rWARN] : ["Contained", rUP];

  // Raoul Pal season — derived from growth × inflation axes, not label string
  const seasonKey = seasonForRegime(r);
  const season = SEASONS[seasonKey];

  // publish for the spine
  useRegEffect(() => {
    window.HelmRegime = { label: r.label, bias: r.bias, key: r.key, geoScore };
    window.dispatchEvent(new Event("helm:regime"));
  }, [r.key, geoScore]);

  const cells = [
    ["Contracting", "Stable", "Expanding"], // columns (x growth)
  ];
  const infRows = ["Rising", "Sticky", "Falling"];
  const growthCols = ["Contracting", "Stable", "Expanding"];

  return (
    <div className="reg">
      <style>{REGIME_CSS}</style>

      {/* Raoul Pal macro season */}
      <section className="pm-card reg-season">
        <div className="reg-season-top">
          <div>
            <div className="pm-card-eyebrow">Macro season · Raoul Pal / Real Vision framework</div>
            <div className="reg-season-name" style={{ color: season.col }}>{season.icon} {season.label} <span className="reg-season-sub">— {season.sub}</span></div>
            <p className="reg-season-desc">{season.desc}</p>
            <div className="reg-season-path" style={{ borderColor: season.col + "44", background: season.col + "0e" }}>{season.path}</div>
          </div>
        </div>
        {/* horizontal cycle track */}
        <div className="reg-cycle-track">
          {["Spring","Summer","Fall","Winter"].map((k, i) => {
            const s = SEASONS[k];
            const here = k === seasonKey;
            const pct = ["Spring","Summer","Fall","Winter"].indexOf(seasonKey);
            return (
              <React.Fragment key={k}>
                <div className={`reg-ct-seg${here ? " here" : ""}`} style={here ? { background: s.col + "18", borderColor: s.col } : {}}>
                  <div className="reg-ct-icon">{s.icon}</div>
                  <div className="reg-ct-label" style={{ color: here ? s.col : "var(--ink-2)" }}>{s.label}</div>
                  <div className="reg-ct-sub">{s.growth} growth<br/>{s.inflation} infl.</div>
                  {here && <div className="reg-ct-pin" style={{ background: s.col }}>▼ now</div>}
                </div>
                {i < 3 && <div className="reg-ct-arr">→</div>}
              </React.Fragment>
            );
          })}
        </div>
        <div className="reg-ct-note">
          Cycle moves <strong>clockwise</strong>: Spring → Summer → Fall → Winter → Spring. Position is inferred from the growth × inflation axes of the regime classifier — updates with the live feed.
          {r.growth && <> Current: growth <strong>{r.growth}</strong> · inflation <strong>{r.inflation}</strong>.</>}
        </div>
        <div className="reg-ranks">
          <div className="reg-ranks-title">Asset class ranking in <strong style={{ color: season.col }}>{season.label}</strong></div>
          <div className="reg-ranks-list">
            {season.ranks.map(([name, rank]) => (
              <div className="reg-rank-row" key={name}>
                <span className="reg-rank-n" style={{ color: rank <= 3 ? season.col : rank >= 8 ? rDOWN : "var(--muted)" }}>{rank}</span>
                <span className="reg-rank-bar"><i style={{ width: `${Math.max(6, 100 - (rank - 1) * 10)}%`, background: rank <= 3 ? season.col : rank >= 8 ? rDOWN : rWARN }} /></span>
                <span className="reg-rank-name">{name}</span>
                <span className="reg-rank-tag" style={{ color: rank <= 3 ? season.col : rank >= 8 ? rDOWN : "var(--muted)" }}>{rank <= 3 ? "OW" : rank >= 8 ? "UW" : "N"}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* regime header */}
      <section className="pm-card reg-head">
        <div className="reg-head-l">
          <div className="pm-card-eyebrow">Economic CIO · current regime</div>
          <div className="reg-name" style={{ color: r.col }}>{r.label}</div>
          <div className="reg-axes">
            Growth <strong>{r.growth}</strong> · Inflation <strong>{r.inflation}</strong> · CPI {r.cpiNow.toFixed(1)}%
          </div>
          <p className="reg-tilt"><span className="reg-bias" style={{ background: r.col + "1a", color: r.col }}>{r.bias}</span>{r.tilt}</p>
        </div>
        <div className="reg-grid-wrap">
          <div className="reg-grid-title">Growth × Inflation</div>
          <div className="reg-grid">
            <div className="reg-grid-corner" />
            {growthCols.map((g) => <div key={g} className="reg-axis-x">{g}</div>)}
            {infRows.map((inf) => (
              <React.Fragment key={inf}>
                <div className="reg-axis-y">{inf}</div>
                {growthCols.map((g) => {
                  const cell = REGIME_GRID[`${g}|${inf}`];
                  const here = `${g}|${inf}` === r.key;
                  return (
                    <div key={g} className={`reg-cell${here ? " here" : ""}`}
                         style={here ? { borderColor: cell.col, background: cell.col + "14" } : {}}
                         title={cell.tilt}>
                      <span className="reg-cell-dot" style={{ background: cell.col }} />
                      {cell.label}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* geopolitical framework */}
      <section className="pm-card">
        <div className="pm-card-head">
          <div>
            <div className="pm-card-eyebrow">Geopolitical risk · scored framework</div>
            <div className="reg-sub">7 categories · probability × impact (1–4) → portfolio response. From ChatGPT v16 §5.</div>
          </div>
          <div className="reg-geo-score" style={{ color: geoLevel[1] }}>
            <span className="reg-geo-num">{geoScore}</span>
            <span className="reg-geo-lvl">{geoLevel[0]}</span>
          </div>
        </div>
        <div className="reg-geo-list">
          <div className="reg-geo-rowh">
            <span>Category</span><span>Example</span><span>Prob</span><span>Impact</span><span>Horizon</span><span>Transmission</span>
          </div>
          {GEO_CATEGORIES.slice().sort((a, b) => b.prob * b.impact - a.prob * a.impact).map((g) => {
            const sc = g.prob * g.impact, hot = sc >= 1.8;
            return (
              <div className="reg-geo-row" key={g.k}>
                <span className="reg-geo-k">{g.k}</span>
                <span className="reg-geo-ex">{g.ex}</span>
                <span className="reg-geo-bar"><i style={{ width: (g.prob * 100) + "%", background: accent }} />{Math.round(g.prob * 100)}%</span>
                <span className="reg-geo-imp">{"●".repeat(g.impact)}<em>{"○".repeat(4 - g.impact)}</em></span>
                <span className="reg-geo-hz">{g.horizon}</span>
                <span className="reg-geo-dr" style={hot ? { color: rDOWN } : {}}>{g.drivers}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* transmission chain */}
      <section className="pm-card">
        <div className="pm-card-eyebrow">Transmission chain · geo → economics → portfolio</div>
        <div className="reg-sub" style={{ marginBottom: 14 }}>How a shock propagates to your sleeves. The middle links (commodities→inflation, rates→curve/FX→ERP) are the bridge both prototypes left implicit — filled from NBC Finance 101.</div>
        <div className="reg-chain">
          {CHAIN.map((c, i) => (
            <React.Fragment key={c.n}>
              <div className={`reg-chain-node${i === CHAIN.length - 1 ? " res" : ""}${/NBC/.test(c.src) ? " gap" : ""}`}
                   style={i === CHAIN.length - 1 ? { borderColor: accent, background: accent + "10" } : {}}>
                <span className="reg-chain-n">{i + 1}</span>
                <strong>{c.n}</strong>
                <span className="reg-chain-d">{c.d}</span>
                <em className="reg-chain-src">{c.src}</em>
              </div>
              {i < CHAIN.length - 1 && <span className="reg-chain-arr">→</span>}
            </React.Fragment>
          ))}
        </div>
      </section>
    </div>
  );
}

const REGIME_CSS = `
.reg { display: flex; flex-direction: column; gap: 16px; }
.reg-season { display: flex; flex-direction: column; gap: 14px; }
.reg-season-top { display: flex; flex-direction: column; gap: 8px; }
.reg-cycle-track { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr; gap: 0; align-items: stretch; }
.reg-ct-seg { border: 1px solid var(--line); border-radius: 11px; padding: 14px 12px 10px; text-align: center; position: relative; transition: border-color .15s; }
.reg-ct-seg.here { border-width: 2px; }
.reg-ct-icon { font-size: 22px; }
.reg-ct-label { font-size: 13px; font-weight: 700; margin-top: 4px; }
.reg-ct-sub { font-size: 10.5px; color: var(--muted); margin-top: 3px; line-height: 1.35; }
.reg-ct-pin { position: absolute; top: -26px; left: 50%; transform: translateX(-50%); font-size: 10.5px; font-weight: 700; color: #fff; padding: 2px 9px; border-radius: 99px; white-space: nowrap; }
.reg-ct-arr { display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 16px; padding: 0 8px; }
.reg-ct-note { font-size: 11.5px; color: var(--muted); line-height: 1.5; }
.reg-ct-note strong { color: var(--ink-2); }
.reg-cycle-track { margin-top: 18px; }
.reg-ranks-title { font-size: 11.5px; color: var(--ink-2); font-weight: 600; margin-bottom: 10px; }
.reg-ranks-list { display: flex; flex-direction: column; gap: 6px; }
.reg-rank-row { display: grid; grid-template-columns: 22px 1fr 1.8fr 30px; gap: 10px; align-items: center; }
.reg-rank-n { font-family: var(--mono); font-size: 13px; font-weight: 700; text-align: right; }
.reg-rank-bar { height: 8px; background: var(--line-2); border-radius: 5px; overflow: hidden; }
.reg-rank-bar i { display: block; height: 100%; border-radius: 5px; }
.reg-rank-name { font-size: 13px; color: var(--ink); }
.reg-rank-tag { font-size: 10.5px; font-weight: 700; font-family: var(--mono); text-align: right; }
.reg-head { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: center; }
.reg-name { font-size: 30px; font-weight: 700; letter-spacing: -0.02em; }
.reg-axes { font-size: 13px; color: var(--ink-2); margin-top: 4px; }
.reg-axes strong { color: var(--ink); }
.reg-tilt { font-size: 13px; color: var(--ink-2); margin-top: 12px; line-height: 1.55; display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
.reg-bias { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 99px; white-space: nowrap; }
.reg-sub { font-size: 12px; color: var(--muted); margin-top: 2px; line-height: 1.45; }
.reg-grid-title { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin-bottom: 7px; text-align: right; }
.reg-grid { display: grid; grid-template-columns: auto repeat(3, 1fr); gap: 4px; }
.reg-grid-corner { }
.reg-axis-x { font-size: 10px; color: var(--muted); text-align: center; padding-bottom: 2px; }
.reg-axis-y { font-size: 10px; color: var(--muted); display: flex; align-items: center; padding-right: 6px; }
.reg-cell { font-size: 10.5px; font-weight: 500; color: var(--ink-2); border: 1px solid var(--line); border-radius: 7px; padding: 7px 6px; display: flex; align-items: center; gap: 5px; line-height: 1.1; min-height: 38px; }
.reg-cell.here { font-weight: 700; color: var(--ink); }
.reg-cell-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.reg-geo-score { text-align: center; }
.reg-geo-num { display: block; font-size: 30px; font-weight: 700; font-family: var(--mono); line-height: 1; }
.reg-geo-lvl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
.reg-geo-list { display: flex; flex-direction: column; }
.reg-geo-rowh, .reg-geo-row { display: grid; grid-template-columns: 1.3fr 1.6fr 0.9fr 0.7fr 1fr 1.8fr; gap: 12px; align-items: center; }
.reg-geo-rowh { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); padding: 6px 0; border-bottom: 1px solid var(--line); }
.reg-geo-row { padding: 9px 0; border-bottom: 1px solid var(--line-2); font-size: 12.5px; }
.reg-geo-k { font-weight: 600; }
.reg-geo-ex { color: var(--muted); font-size: 11.5px; }
.reg-geo-bar { position: relative; font-family: var(--mono); font-size: 11px; color: var(--ink-2); background: var(--line-2); border-radius: 5px; padding: 2px 6px; overflow: hidden; }
.reg-geo-bar i { position: absolute; left: 0; top: 0; bottom: 0; opacity: 0.22; }
.reg-geo-imp { font-size: 9px; color: var(--ink-2); letter-spacing: 1px; }
.reg-geo-imp em { color: var(--line); font-style: normal; }
.reg-geo-hz { font-size: 11px; color: var(--muted); }
.reg-geo-dr { font-size: 11.5px; color: var(--ink-2); }
.reg-chain { display: flex; flex-wrap: wrap; align-items: stretch; gap: 5px; }
.reg-chain-node { flex: 1 1 0; min-width: 130px; border: 1px solid var(--line); border-radius: 9px; padding: 9px 10px; background: var(--panel-2); display: flex; flex-direction: column; gap: 2px; position: relative; }
.reg-chain-node.gap { border-style: dashed; border-color: color-mix(in srgb, #d97706 50%, var(--line)); background: color-mix(in srgb, #d97706 5%, var(--panel)); }
.reg-chain-n { font-family: var(--mono); font-size: 10px; color: var(--muted); }
.reg-chain-node strong { font-size: 12px; line-height: 1.2; }
.reg-chain-d { font-size: 10.5px; color: var(--muted); line-height: 1.3; }
.reg-chain-src { font-family: var(--mono); font-size: 9px; color: #b45309; margin-top: 3px; font-style: normal; }
.reg-chain-node:not(.gap) .reg-chain-src { color: var(--muted); }
.reg-chain-arr { display: flex; align-items: center; color: var(--muted); flex: none; }
@media (max-width: 980px) { .reg-head { grid-template-columns: 1fr; } .reg-chain-arr { display: none; } .reg-chain-node { flex-basis: 46%; }
  .reg-geo-rowh { display: none; } .reg-geo-row { grid-template-columns: 1fr 1fr; gap: 4px 12px; } }
`;

window.RegimePanel = RegimePanel;
window.classifyRegime = classifyRegime;
