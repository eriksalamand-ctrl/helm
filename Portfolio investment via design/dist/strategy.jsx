// strategy.jsx — Strategy Lab: signals, ranked trades, RSI, tax-aware rebalance, stop-loss
// Account-aware + risk-model + configurable factor engine.
const { useState: useStateS } = React;

const sUP = "#0e9f6e", sDOWN = "#e02424", sWARN = "#d97706";
const sMoney = (n) => "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
const sSigned = (n) => `${n >= 0 ? "+" : "−"}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const bMeanS = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

// ---- deterministic fundamentals proxy (stable per ticker, NOT tied to your P/L) ----
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
function fundamentals(ticker) {
  const q = hashStr(ticker + "·q"), v = hashStr(ticker + "·v");
  return { quality: clamp(34 + q * 58, 0, 100), valuation: clamp(30 + v * 58, 0, 100) };
}

// ---- RSI from the holding's price path proxy ----
function rsiFrom(points) {
  if (!points || points.length < 2) return 50;
  let gain = 0, loss = 0, n = 0;
  for (let i = 1; i < points.length; i++) { const d = points[i] - points[i - 1]; if (d >= 0) gain += d; else loss -= d; n++; }
  const avgG = gain / n, avgL = loss / n;
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}
function momentum(points) {
  if (!points || points.length < 2) return 50;
  const first = points[0], last = points[points.length - 1];
  const range = Math.max(...points) - Math.min(...points) || 1;
  return clamp(((last - first) / range) * 60 + 50, 0, 100);
}

// ---- the model ----
function signalsFor(h, cfg) {
  const rsi = rsiFrom(h.spark);
  const mom = momentum(h.spark);
  const fnd = fundamentals(h.ticker);
  const trendScore = mom;
  const valueScore = fnd.valuation;          // high = attractively valued (independent of your cost)
  const qualityScore = fnd.quality;
  const incomeScore = clamp((h.divYield || 0) * 11, 0, 100);
  const revScore = clamp(100 - rsi, 0, 100); // oversold => high

  const w = cfg.weights, wsum = (w.trend + w.value + w.reversion + w.income) || 1;
  let composite = (trendScore * w.trend + valueScore * w.value + revScore * w.reversion + incomeScore * w.income) / wsum;
  composite = clamp(Math.round(composite * 0.85 + qualityScore * 0.15), 0, 100); // quality tilt
  const conf = clamp((qualityScore - 35) / 0.65, 0, 100);                         // confidence 0-100

  // Action logic with TREND CONFIRMATION — no buying falling knives on "it's cheap"
  const brokenTrend = mom < 42;
  let action = "Hold";
  if (composite >= cfg.buyBar && rsi < cfg.rsiOver && !brokenTrend) action = "Buy";
  else if (composite <= cfg.sellBar || rsi > cfg.rsiOver) action = "Sell";
  if (rsi < cfg.rsiUnder && qualityScore > 55 && mom > 38) action = "Buy";        // quality oversold bounce
  if (rsi > cfg.rsiOver + 6) action = "Sell";                                      // hard overbought trim

  const vol = (Math.max(...h.spark) - Math.min(...h.spark)) / (Math.abs(h.spark[0]) || 1);
  const stop = h.price * (1 - clamp((0.06 + vol * 0.04) * cfg.stopMult, 0.035, 0.20));
  const target = h.price * (1 + clamp((0.10 + vol * 0.08) * cfg.stopMult, 0.08, 0.42));
  return { rsi, mom, valueScore, trendScore, qualityScore, incomeScore, revScore, composite, conf, action, stop, target, vol };
}

function rationale(h, s, cfg) {
  const bits = [];
  if (s.trendScore > 60) bits.push("uptrend intact");
  else if (s.trendScore < 42) bits.push("downtrend — needs a base");
  else bits.push("range-bound");
  if (s.rsi < 32) bits.push(`oversold RSI ${s.rsi.toFixed(0)}`);
  else if (s.rsi > 70) bits.push(`overbought RSI ${s.rsi.toFixed(0)}`);
  if (s.qualityScore > 62) bits.push("high quality");
  else if (s.qualityScore < 40) bits.push("weak quality");
  if (s.valueScore > 62) bits.push("attractively valued");
  if ((h.divYield || 0) > 4) bits.push(`${h.divYield.toFixed(1)}% yield`);
  if (h.weight > cfg.maxPos) bits.push(`oversized ${h.weight.toFixed(0)}%`);
  const lead = s.action === "Buy" ? "Add — " : s.action === "Sell" ? "Trim — " : "Hold — ";
  return lead + bits.slice(0, 3).join(", ") + ".";
}

const RISK = {
  conservative: { label: "Conservative", maxPos: 8,  cashDeploy: 0.35, buyBar: 70, sellBar: 46, rsiOver: 68, rsiUnder: 28, stopMult: 0.7, name: "Smaller positions, tighter stops" },
  balanced:     { label: "Balanced",     maxPos: 12, cashDeploy: 0.60, buyBar: 62, sellBar: 40, rsiOver: 72, rsiUnder: 30, stopMult: 1.0, name: "Moderate sizing" },
  aggressive:   { label: "Aggressive",   maxPos: 20, cashDeploy: 0.85, buyBar: 55, sellBar: 34, rsiOver: 78, rsiUnder: 33, stopMult: 1.4, name: "Concentrated, chasing the 60% goal" },
};
const DEFAULT_WEIGHTS = { trend: 35, value: 20, reversion: 25, income: 20 };
function presetCfg(r) {
  const p = RISK[r];
  return { weights: { ...DEFAULT_WEIGHTS }, buyBar: p.buyBar, sellBar: p.sellBar, rsiOver: p.rsiOver, rsiUnder: p.rsiUnder, cashDeploy: p.cashDeploy, maxPos: p.maxPos, stopMult: p.stopMult };
}

function MeterBar({ value, color }) { return <div className="sl-meter"><i style={{ width: `${value}%`, background: color }} /></div>; }

function Slider({ label, value, min, max, step, suffix, accent, onChange }) {
  return (
    <div className="sl-cfg-row">
      <div className="sl-cfg-rowhead"><span>{label}</span><strong>{value}{suffix || ""}</strong></div>
      <input type="range" min={min} max={max} step={step || 1} value={value}
             onChange={(e) => onChange(+e.target.value)} style={{ accentColor: accent }} />
    </div>
  );
}

function StrategyLab({ accent, account }) {
  const D = window.PMData;
  const [risk, setRisk] = useStateS("balanced");
  const [cfg, setCfg] = useStateS(() => presetCfg("balanced"));
  const [sort, setSort] = useStateS("composite");
  const [showCfg, setShowCfg] = useStateS(false);

  const pickRisk = (k) => { setRisk(k); setCfg(presetCfg(k)); };
  const setW = (key, val) => setCfg((c) => ({ ...c, weights: { ...c.weights, [key]: val } }));
  const setC = (key, val) => setCfg((c) => ({ ...c, [key]: val }));

  const acctId = account || "all";
  const view = D.buildView(acctId);
  const K = view.kpis;
  const acctMeta = D.accounts.find((a) => a.id === acctId);
  const acctLabel = acctId === "all" ? "All accounts" : acctId === "crypto" ? "Crypto lens" : (acctMeta ? acctMeta.name : acctId);

  const enriched = view.holdings.map((h) => {
    const s = signalsFor(h, cfg);
    return { ...h, sig: s, why: rationale(h, s, cfg) };
  });

  const ranked = [...enriched].sort((a, b) => {
    if (sort === "composite") return b.sig.composite - a.sig.composite;
    if (sort === "rsi") return a.sig.rsi - b.sig.rsi;
    return b.sig.trendScore - a.sig.trendScore;
  });

  const buys = enriched.filter((h) => h.sig.action === "Buy").sort((a, b) => b.sig.composite - a.sig.composite);
  const sells = enriched.filter((h) => h.sig.action === "Sell").sort((a, b) => a.sig.composite - b.sig.composite);

  // ---- tax-loss harvest: ONLY non-registered accounts (registered gains/losses aren't taxable) ----
  const acctReg = (id) => { const a = D.accounts.find((x) => x.id === id); return a ? a.reg : true; };
  const nonReg = enriched.filter((h) => acctReg(h.acct) === false);
  const harvest = nonReg.filter((h) => h.plAbs < -300).sort((a, b) => a.plAbs - b.plAbs);
  const harvestTotal = harvest.reduce((s, h) => s + Math.abs(h.plAbs), 0);
  const taxSaved = harvestTotal * 0.26;
  const allRegistered = nonReg.length === 0;

  const maxPos = cfg.maxPos;
  const oversized = enriched.filter((h) => h.weight > maxPos).sort((a, b) => b.weight - a.weight);

  const tradeCash = K.cash * cfg.cashDeploy;
  const totalConv = buys.reduce((s, h) => s + Math.max(1, h.sig.composite - cfg.sellBar), 0) || 1;
  const sized = buys.map((h) => ({ ...h, alloc: tradeCash * (Math.max(1, h.sig.composite - cfg.sellBar) / totalConv) }));

  const avgScore = Math.round(bMeanS(enriched.map((h) => h.sig.composite)) || 0);
  const posture = avgScore >= 58 ? ["Risk-on", sUP] : avgScore >= 48 ? ["Neutral", sWARN] : ["Defensive", sDOWN];
  const wsum = cfg.weights.trend + cfg.weights.value + cfg.weights.reversion + cfg.weights.income;
  const wpct = (x) => Math.round((x / wsum) * 100);

  return (
    <div className="sl">
      <CioMacroPanel accent={accent} account={acctId} />
      {/* 1. POSTURE BANNER */}
      <section className="pm-card sl-macro">
        <div className="sl-macro-l">
          <div className="pm-card-eyebrow">Strategy posture · {acctLabel}</div>
          <div className="sl-posture" style={{ color: posture[1] }}>{posture[0]}</div>
          <p className="sl-macro-txt">
            Across {enriched.length} position{enriched.length === 1 ? "" : "s"} the blended signal reads <strong>{avgScore}/100</strong>.
            {" "}{buys.length} add{buys.length === 1 ? "" : "s"}, {sells.length} trim{sells.length === 1 ? "" : "s"} flagged{!allRegistered && harvest.length ? <> · <strong>{sMoney(taxSaved)}</strong> tax offset available</> : null}.
          </p>
        </div>
        <div className="sl-risk">
          <div className="sl-risk-toprow">
            <span className="sl-risk-label">Risk model</span>
            <button className={`sl-cfg-btn${showCfg ? " is-on" : ""}`} onClick={() => setShowCfg((s) => !s)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 3.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H8a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V8a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
              Configure
            </button>
          </div>
          <div className="pm-range sl-risk-seg">
            {Object.keys(RISK).map((k) => (
              <button key={k} className={risk === k ? "is-active" : ""} onClick={() => pickRisk(k)}>{RISK[k].label}</button>
            ))}
          </div>
          <span className="sl-risk-note">{RISK[risk].name} · max {maxPos}% / position · {Math.round(cfg.cashDeploy * 100)}% cash deployed</span>
        </div>
      </section>

      {/* CONFIG PANEL */}
      {showCfg && (
        <section className="pm-card sl-cfg">
          <div className="sl-cfg-grid">
            <div className="sl-cfg-col">
              <div className="sl-cfg-title">Factor weights <span>{wpct(cfg.weights.trend)}/{wpct(cfg.weights.value)}/{wpct(cfg.weights.reversion)}/{wpct(cfg.weights.income)}</span></div>
              <Slider label="Momentum" value={cfg.weights.trend} min={0} max={60} accent={accent} onChange={(v) => setW("trend", v)} />
              <Slider label="Value / quality" value={cfg.weights.value} min={0} max={60} accent={accent} onChange={(v) => setW("value", v)} />
              <Slider label="Mean-reversion (RSI)" value={cfg.weights.reversion} min={0} max={60} accent={accent} onChange={(v) => setW("reversion", v)} />
              <Slider label="Income" value={cfg.weights.income} min={0} max={60} accent={accent} onChange={(v) => setW("income", v)} />
            </div>
            <div className="sl-cfg-col">
              <div className="sl-cfg-title">Decision thresholds</div>
              <Slider label="Buy bar (composite)" value={cfg.buyBar} min={50} max={80} accent={accent} onChange={(v) => setC("buyBar", v)} />
              <Slider label="Sell bar (composite)" value={cfg.sellBar} min={25} max={50} accent={accent} onChange={(v) => setC("sellBar", v)} />
              <Slider label="RSI overbought" value={cfg.rsiOver} min={60} max={85} accent={accent} onChange={(v) => setC("rsiOver", v)} />
              <Slider label="RSI oversold" value={cfg.rsiUnder} min={15} max={40} accent={accent} onChange={(v) => setC("rsiUnder", v)} />
            </div>
            <div className="sl-cfg-col">
              <div className="sl-cfg-title">Sizing & risk</div>
              <Slider label="Cash deployed" value={Math.round(cfg.cashDeploy * 100)} min={0} max={100} step={5} suffix="%" accent={accent} onChange={(v) => setC("cashDeploy", v / 100)} />
              <Slider label="Max position" value={cfg.maxPos} min={5} max={25} suffix="%" accent={accent} onChange={(v) => setC("maxPos", v)} />
              <Slider label="Stop / target width" value={cfg.stopMult.toFixed(1)} min={0.5} max={2} step={0.1} suffix="×" accent={accent} onChange={(v) => setC("stopMult", v)} />
              <button className="sl-cfg-reset" onClick={() => setCfg(presetCfg(risk))}>↺ Reset to {RISK[risk].label} preset</button>
            </div>
          </div>
        </section>
      )}

      {/* 2. PROPOSED TRADES */}
      <div className="sl-cols">
        <section className="pm-card">
          <div className="pm-card-head">
            <div className="pm-card-eyebrow">Proposed trades · {acctLabel}</div>
            <span className="pm-count">{buys.length + sells.length} actions</span>
          </div>
          <div className="sl-trades">
            {[...sized.map((h) => ({ ...h, _kind: "buy" })), ...sells.map((h) => ({ ...h, _kind: "sell" }))].map((h) => (
              <div className="sl-trade" key={h.ticker + h._kind}>
                <div className={`sl-trade-act ${h.sig.action.toLowerCase()}`}>{h.sig.action}</div>
                <div className="pm-sym-badge sl-badge" style={{ background: accent + "1a", color: accent }}>{h.ticker.slice(0, 2)}</div>
                <div className="sl-trade-id">
                  <div className="sl-trade-tkr">{h.ticker} <span className="sl-trade-name">{h.name}</span></div>
                  <div className="sl-trade-why">{h.why}</div>
                </div>
                <div className="sl-trade-nums">
                  <div className="sl-trade-size">{h._kind === "buy" ? sMoney(h.alloc) : sMoney(h.dispValue * 0.4)}</div>
                  <div className="sl-trade-lv">
                    <span style={{ color: sDOWN }}>SL {sMoney(h.sig.stop)}</span>
                    <span style={{ color: sUP }}>TP {sMoney(h.sig.target)}</span>
                  </div>
                </div>
              </div>
            ))}
            {buys.length + sells.length === 0 && <div className="pm-empty">No high-conviction trades for {acctLabel} at the {RISK[risk].label.toLowerCase()} settings.</div>}
          </div>
        </section>

        {/* tax + rebalance rail */}
        <div className="sl-rail">
          <section className="pm-card sl-tax">
            <div className="pm-card-eyebrow">Tax-loss harvest</div>
            {allRegistered ? (
              <div className="sl-tax-na">
                <div className="sl-tax-na-big">N/A</div>
                <p>{acctId === "all" ? "All your accounts are registered (REER / CELI)" : `${acctLabel} is a registered account`} — capital gains and losses aren't taxable, so there's nothing to harvest here. Tax-loss selling only helps in a non-registered (cash/margin) account.</p>
              </div>
            ) : (
              <>
                <div className="sl-tax-big" style={{ color: accent }}>{sMoney(taxSaved)}</div>
                <div className="sl-tax-sub">est. tax offset from {harvest.length} losing positions</div>
                <div className="sl-tax-list">
                  {harvest.slice(0, 4).map((h) => (
                    <div className="sl-tax-row" key={h.ticker}>
                      <span className="sl-tax-tkr">{h.ticker}</span>
                      <span className="sl-tax-loss" style={{ color: sDOWN }}>{sSigned(h.plAbs)}</span>
                    </div>
                  ))}
                </div>
                <div className="sl-tax-note">Mind the 30-day superficial-loss rule before repurchasing.</div>
              </>
            )}
          </section>

          <section className="pm-card">
            <div className="pm-card-eyebrow">Rebalance flags</div>
            {oversized.length ? oversized.map((h) => (
              <div className="sl-rb-row" key={h.ticker}>
                <span className="sl-rb-tkr">{h.ticker}</span>
                <span className="sl-rb-w">{h.weight.toFixed(1)}%</span>
                <span className="sl-rb-act" style={{ color: sWARN }}>trim to {maxPos}%</span>
              </div>
            )) : <div className="sl-ok">All positions within the {maxPos}% cap.</div>}
          </section>
        </div>
      </div>

      {/* 3. SIGNAL TABLE */}
      <section className="pm-card">
        <div className="pm-card-head">
          <div className="pm-card-eyebrow">Signal scores</div>
          <div className="pm-range sl-sortseg">
            <button className={sort === "composite" ? "is-active" : ""} onClick={() => setSort("composite")}>Composite</button>
            <button className={sort === "trend" ? "is-active" : ""} onClick={() => setSort("trend")}>Momentum</button>
            <button className={sort === "rsi" ? "is-active" : ""} onClick={() => setSort("rsi")}>RSI</button>
          </div>
        </div>
        <div className="pm-table-wrap">
          <table className="pm-table sl-table">
            <thead><tr>
              <th className="ta-left">Symbol</th>
              <th className="ta-center">Signal</th>
              <th className="ta-left">Momentum</th>
              <th className="ta-left">Value/qual</th>
              <th className="ta-left">Income</th>
              <th className="ta-right">RSI 14</th>
              <th className="ta-center">Action</th>
            </tr></thead>
            <tbody>
              {ranked.map((h) => (
                <tr key={h.ticker}>
                  <td className="ta-left">
                    <div className="pm-sym">
                      <div className="pm-sym-badge" style={{ background: accent + "1a", color: accent }}>{h.ticker.slice(0, 2)}</div>
                      <div><div className="pm-sym-tkr">{h.ticker}</div><div className="pm-sym-name">{h.sector}</div></div>
                    </div>
                  </td>
                  <td className="ta-center"><div className="sl-comp" style={{ color: h.sig.composite >= 60 ? sUP : h.sig.composite <= 40 ? sDOWN : sWARN }}>{h.sig.composite}</div></td>
                  <td className="ta-left"><MeterBar value={h.sig.trendScore} color={accent} /></td>
                  <td className="ta-left"><MeterBar value={h.sig.valueScore} color="#4f46e5" /></td>
                  <td className="ta-left"><MeterBar value={h.sig.incomeScore} color="#0891b2" /></td>
                  <td className="ta-right mono" style={{ color: h.sig.rsi < 32 ? sUP : h.sig.rsi > 70 ? sDOWN : "var(--ink-2)" }}>{h.sig.rsi.toFixed(0)}</td>
                  <td className="ta-center"><span className={`sl-act-tag ${h.sig.action.toLowerCase()}`}>{h.sig.action}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sl-foot-note">
          Composite blends momentum ({wpct(cfg.weights.trend)}%), value/quality ({wpct(cfg.weights.value)}%), mean-reversion/RSI ({wpct(cfg.weights.reversion)}%) and income ({wpct(cfg.weights.income)}%), with a quality tilt and a trend-confirmation gate so deeply-fallen names aren't auto-bought. Bounded by the {RISK[risk].label.toLowerCase()} risk model. Framework only — not investment advice.
        </div>
      </section>
    </div>
  );
}

window.StrategyLab = StrategyLab;
