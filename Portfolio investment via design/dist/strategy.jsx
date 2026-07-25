// strategy.jsx — Strategy Lab: signals, ranked trades, RSI, tax-aware rebalance, stop-loss
// Account-aware + risk-model + configurable factor engine.
const { useState: useStateS } = React;

const sUP = "#0e9f6e", sDOWN = "#e02424", sWARN = "#d97706";
const sMoney = (n) => "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
const sSigned = (n) => `${n >= 0 ? "+" : "−"}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const bMeanS = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

// ---- fundamentals: REAL (Finnhub via feed) when available, else deterministic proxy ----
// REAL quality from profitability + growth + leverage (Finnhub metric=all). null if no fields present.
function realQuality(r) {
  const parts = [];
  if (typeof r.roe === "number") parts.push([clamp(40 + r.roe * 2.0, 0, 100), 1.3]);          // ROE 0→40 · 15→70 · 30→100
  if (typeof r.netMargin === "number") parts.push([clamp(45 + r.netMargin * 2.0, 0, 100), 1.1]); // 0→45 · 15→75 · 27→100
  if (typeof r.operMargin === "number") parts.push([clamp(45 + r.operMargin * 1.8, 0, 100), 0.9]);
  if (typeof r.revGrowth === "number") parts.push([clamp(50 + r.revGrowth * 1.6, 5, 100), 1.0]);  // 0→50 · 15→74 · neg→down
  if (typeof r.epsGrowth === "number") parts.push([clamp(52 + r.epsGrowth * 0.9, 5, 100), 0.7]);
  if (typeof r.debtToEquity === "number") parts.push([clamp(85 - r.debtToEquity * 28, 10, 95), 0.9]); // 0→85 · 1→57 · 2.5→15
  if (!parts.length) return null;
  const wsum = parts.reduce((s, p) => s + p[1], 0);
  return clamp(Math.round(parts.reduce((s, p) => s + p[0] * p[1], 0) / wsum), 0, 100);
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

// ---- CRYPTO is its own book: no P/E, no ROE, no equity "valuation" concept exists for BTC.
// Scoring it through fundamentals() below (hash-fallback pretending to be P/E-like) was noise.
// Instead: valuation = cheapness vs the halving/liquidity cycle; quality = tier durability
// (BTC/ETH have survived every cycle; deep alts haven't). Both are REAL signals already
// computed elsewhere (HelmCryptoCycle, the relative-strength tier table) — this just stops
// diluting them with a fake equity-style number.
const CRYPTO_TIER = { BTC: 92, IBIT: 92, BTCC: 90, BTCY: 88, ETH: 80, ETHX: 78, ETHH: 78, ETHY: 76, SOL: 66, SOLQ: 64, BNB: 58, LINK: 54, LTC: 52, XRP: 50, SUI: 46, AVAX: 44, TRX: 40, ATOM: 42, NEAR: 40, APT: 36, ADA: 38, DOT: 34, DOGE: 30 };
const CRYPTO_PHASE_VALUATION = { "Accumulation": 82, "Re-accumulation": 74, "Markup": 52, "Euphoria": 22, "Markdown": 60 };
function cryptoFundamentals(h) {
  const base = (h.ticker || "").replace(/\.(TO|B|U)$/i, "").toUpperCase();
  const quality = CRYPTO_TIER[base] != null ? CRYPTO_TIER[base] : 36; // unlisted/long-tail alt = low durability tier
  const cc = window.HelmCryptoCycle ? window.HelmCryptoCycle() : null;
  const phase = cc ? (cc.eff || cc.phase) : null;
  const valuation = phase && CRYPTO_PHASE_VALUATION[phase] != null ? CRYPTO_PHASE_VALUATION[phase] : 50;
  return { quality, valuation, real: true, qualReal: true, cryptoNative: true, cyclePhase: phase };
}
function fundamentals(h) {
  const ticker = (h && h.ticker) || h;
  const fb = { quality: clamp(34 + hashStr(ticker + "·q") * 58, 0, 100), valuation: clamp(30 + hashStr(ticker + "·v") * 58, 0, 100), real: false };
  const F = window.HelmFeed && window.HelmFeed.fundamentals;
  const r = F && F[ticker];
  if (!r) return fb;
  // REAL valuation from P/E (lower = cheaper = higher score) + 52-week range position
  let valuation = fb.valuation;
  if (typeof r.pe === "number" && r.pe > 0) valuation = clamp(92 - (r.pe - 10) * 1.4, 18, 92);   // PE 10→92 · 25→71 · 40→50 · 60→22
  const px = (h && typeof h.price === "number") ? h.price : null;
  let rangePos = null;
  if (px != null && typeof r.high52 === "number" && typeof r.low52 === "number" && r.high52 > r.low52) {
    rangePos = clamp((px - r.low52) / (r.high52 - r.low52), 0, 1);                                // 0 = at 52w low, 1 = at high
    valuation = clamp(valuation + (0.5 - rangePos) * 18, 10, 95);                                 // near low → cheaper
  }
  // REAL quality from ROE/margins/growth/leverage; fall back to beta-stability, then hash proxy
  const rq = realQuality(r);
  let quality, qualReal = false;
  if (rq != null) { quality = rq; qualReal = true; }
  else if (typeof r.beta === "number") quality = clamp(70 - (r.beta - 1) * 22, 30, 90);
  else quality = fb.quality;
  return { quality, valuation, real: true, qualReal, pe: r.pe, beta: r.beta, roe: r.roe, netMargin: r.netMargin, revGrowth: r.revGrowth, rangePos };
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
// session memo (10-min expiry): σ-band z per ticker for the policy gates — entryRead is O(series)
const helmZMemo = {};
function helmPolicyZ(t) {
  if (!window.HelmSigma) return null; // pre-sigma call (load order) — do NOT memoize the miss
  const m = helmZMemo[t];
  if (m && Date.now() - m.at < 600000) return m.z;
  let z = null; try { const e = window.HelmSigma.entryRead(t); z = e && e.z != null ? e.z : null; } catch (e) {}
  if (z != null) helmZMemo[t] = { z, at: Date.now() }; // never memoize a miss — series may not have arrived yet
  return z;
}

function signalsFor(h, cfg) {
  const rsi = rsiFrom(h.spark);
  const isCryptoAsset = h.sector === "Crypto" || h.market === "Crypto";
  const fnd = isCryptoAsset ? cryptoFundamentals(h) : fundamentals(h);
  let cryptoStance = null;
  // momentum: prefer REAL 52-week range position (near high = uptrend) when feed-covered, else synthetic spark
  let mom = momentum(h.spark);
  if (fnd.rangePos != null) mom = Math.round(clamp(mom * 0.3 + (fnd.rangePos * 100) * 0.7, 0, 100));
  // CRYPTO relative-strength: synthetic spark can't tell BTC from a laggard, so anchor on cycle leadership.
  // This-cycle leaders (BTC/ETH/SOL) keep momentum; chronic laggards (DOT/ADA/DOGE) get cut so they don't
  // get proposed as "buys" when you could just hold BTC/ETH.
  if (h.sector === "Crypto" || h.market === "Crypto") {
    const base = (h.ticker || "").replace(/\.(TO|B|U)$/i, "").toUpperCase();
    const RS = { BTC: 90, ETH: 82, SOL: 78, IBIT: 90, BTCC: 88, ETHX: 80, SOLQ: 76, BNB: 64, LINK: 60, SUI: 58, XRP: 52, TRX: 50, AVAX: 46, ADA: 34, DOT: 28, DOGE: 30 };
    const tier = RS[base] != null ? RS[base] : (/BTC|ETH|SOL/.test(base) ? 80 : 42);
    mom = Math.round(clamp(mom * 0.25 + tier * 0.75, 0, 100)); // RS dominates for crypto
  }
  const trendScore = mom;
  const valueScore = fnd.valuation;          // high = attractively valued (real P/E + 52w when feed-covered)
  const qualityScore = fnd.quality;
  const incomeScore = clamp((h.divYield || 0) * 11, 0, 100);
  const revScore = clamp(100 - rsi, 0, 100); // oversold => high

  const w = cfg.weights, wsum = (w.trend + w.value + w.reversion + w.income) || 1;
  let composite = (trendScore * w.trend + valueScore * w.value + revScore * w.reversion + incomeScore * w.income) / wsum;
  composite = clamp(Math.round(composite * 0.85 + qualityScore * 0.15), 0, 100); // quality tilt
  // NBC analyst conviction overlay: a name on the NBF/Morningstar Select List with upside to target gets a boost
  const sel = window.HelmSelectMap && (window.HelmSelectMap[h.ticker] || window.HelmSelectMap[(h.ticker || "").split(".")[0]]);
  let selBoost = 0;
  if (sel) { selBoost = clamp(6 + (sel.est || 0) * 0.18, 6, 22); composite = clamp(Math.round(composite + selBoost * 0.5), 0, 100); }
  const conf = clamp((qualityScore - 35) / 0.65 + (sel ? 12 : 0), 0, 100);        // confidence 0-100 (analyst-backed = steadier)

  // HORIZON: swing (weeks) · position (months) · long (years). Long-term re-anchors on fundamentals.
  const horizon = cfg.horizon || "position";
  const longTerm = horizon === "long";
  if (longTerm) composite = clamp(Math.round(qualityScore * 0.42 + valueScore * 0.28 + trendScore * 0.20 + incomeScore * 0.10), 0, 100);

  // Action logic
  const brokenTrend = mom < 42;
  let action = "Hold";
  if (longTerm) {
    // multi-year: a quality compounder at a fair price is a Buy regardless of short-term RSI — no overbought sell
    if (qualityScore >= 56 && valueScore >= 38 && mom >= 36) action = "Buy";
    else if (qualityScore < 42 || (valueScore < 26 && mom < 45)) action = "Sell"; // quality eroding, or richly-priced AND rolling over
  } else {
    if (composite >= cfg.buyBar && rsi < cfg.rsiOver && !brokenTrend) action = "Buy";
    else if (composite <= cfg.sellBar || rsi > cfg.rsiOver) action = "Sell";
    if (rsi < cfg.rsiUnder && qualityScore > 55 && mom > 38) action = "Buy";      // quality oversold bounce
    if (rsi > cfg.rsiOver + 6) action = "Sell";                                    // hard overbought trim
  }

  // CRYPTO majors-first: a chronic laggard (weak relative strength) shouldn't be a Buy when you
  // could just hold BTC/ETH. Demote weak-RS coins to Hold unless they clear a high momentum bar.
  if ((h.sector === "Crypto" || h.market === "Crypto") && action === "Buy" && mom < 58 && !longTerm) action = "Hold";

  // CRYPTO DEPLOYMENT STANCE (cycle-aware): the Chief decides whether to deploy capital into crypto NOW.
  // WAIT → don't add (long-term BTC only); DCA → BTC-first scale-in; DEPLOY → normal; DISTRIBUTE → take profit.
  if (h.sector === "Crypto" || h.market === "Crypto") {
    const cc = window.HelmCryptoCycle ? window.HelmCryptoCycle() : null;
    if (cc) {
      const base = (h.ticker || "").replace(/\.(TO|B|U)$/i, "").toUpperCase();
      const isBTC = /^(BTC|IBIT|BTCC|BTCY|FBTC)/.test(base);
      const isMajor = isBTC || /^(ETH|SOL|ETHX|SOLQ|ETHH|ETHY)/.test(base);
      cryptoStance = cc.stance ? cc.stance.stance : null;
      if (cryptoStance === "WAIT") {
        // bottom not confirmed → don't deploy; only a long-horizon BTC nibble is allowed
        if (action === "Buy" && !(longTerm && isBTC)) action = "Hold";
      } else if (cryptoStance === "DCA") {
        // scale in BTC-first; majors may buy, non-majors wait
        if (action === "Buy" && !isMajor) action = "Hold";
      } else if (cryptoStance === "DISTRIBUTE") {
        // euphoria → no new adds; flip would-be buys to a trim of strength
        if (action === "Buy") action = "Sell";
      }
      // DEPLOY → leave the action as the engine decided
    }
  }

  // distinguish a partial TRIM from a full EXIT — prefer Trim; Exit only on genuine deterioration
  const sellKind = action === "Sell"
    ? ((composite <= cfg.sellBar - 12 && (longTerm ? qualityScore < 38 : brokenTrend)) ? "Exit" : "Trim")
    : null;
  const sellFrac = sellKind === "Exit" ? 1.0 : sellKind === "Trim" ? 0.33 : 0;

  const vol = (Math.max(...h.spark) - Math.min(...h.spark)) / (Math.abs(h.spark[0]) || 1);
  const widthMult = longTerm ? 2.6 : 1;
  const stop = h.price * (1 - clamp((0.06 + vol * 0.04) * cfg.stopMult * widthMult, 0.035, longTerm ? 0.38 : 0.20));
  const target = h.price * (1 + clamp((0.10 + vol * 0.08) * cfg.stopMult * widthMult, 0.08, longTerm ? 1.4 : 0.42));
  const out = { rsi, mom, valueScore, trendScore, qualityScore, incomeScore, revScore, composite, conf, action, sellKind, sellFrac, stop, target, vol, horizon, realFund: fnd.real, qualReal: fnd.qualReal, cryptoStance, pe: fnd.pe, roe: fnd.roe, select: sel || null, selBoost };
  // Phase 1b — close the Learning-Lab loop: apply any candidate rules the user has APPROVED
  // into the live engine (engineconfig.js store + learninglab.jsx rule library, both looked up
  // at call time). Skipped when cfg.__raw is set so the Lab's own sandbox isn't double-counted.
  // Guarded so a bad rule can never crash scoring; fully reversible from the Learning Lab.
  if (!cfg.__raw && window.HelmConfig && window.HelmCandidateRules) {
    try {
      const active = window.HelmConfig.activeRules();
      for (let i = 0; i < active.length; i++) { const rule = window.HelmCandidateRules[active[i]]; if (rule) rule(out); }
    } catch (e) {}
    // POLICY REASSERTED — approved rules tune scoring; they never override hard policy (a
    // momentum rule was flipping Hold→Buy AFTER the crypto-stance gate). Not in __raw replays
    // (today's stance/σ would be lookahead against sandbox history).
    if (out.action === "Buy" && (h.sector === "Crypto" || h.market === "Crypto") && out.cryptoStance) {
      const b = (h.ticker || "").replace(/\.(TO|B|U)$/i, "").toUpperCase();
      const isBTC = /^(BTC|IBIT|BTCC|BTCY|FBTC)/.test(b);
      const isMajor = isBTC || /^(ETH|SOL|ETHX|SOLQ|ETHH|ETHY)/.test(b);
      if (out.cryptoStance === "WAIT" && !(longTerm && isBTC)) out.action = "Hold";
      else if (out.cryptoStance === "DCA" && !isMajor) out.action = "Hold";
      else if (out.cryptoStance === "DISTRIBUTE") { out.action = "Sell"; out.sellKind = "Trim"; out.sellFrac = 0.33; }
    }
  }
  // σ-BAND ENTRY GATE (house rule, was Chief-only — now engine-wide): no falling knives
  // (≤−2σ below trend, bounce unconfirmed), no chasing (≥+2σ stretched). Skipped in __raw replays.
  if (!cfg.__raw && out.action === "Buy") {
    const z = helmPolicyZ(h.ticker);
    if (z != null && z <= -2 && !(longTerm && out.qualReal && out.qualityScore >= 60)) { out.action = "Hold"; out.gateZ = z; }
    else if (z != null && z >= 2) { out.action = "Hold"; out.gateZ = z; }
  }
  return out;
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
  conservative: { label: "Conservative", maxPos: 8,  cashDeploy: 0.35, buyBar: 66, sellBar: 44, rsiOver: 68, rsiUnder: 28, stopMult: 0.7, name: "Smaller positions, tighter stops", weights: { trend: 22, value: 30, reversion: 26, income: 22 } },
  balanced:     { label: "Balanced",     maxPos: 12, cashDeploy: 0.60, buyBar: 60, sellBar: 40, rsiOver: 72, rsiUnder: 30, stopMult: 1.0, name: "Moderate sizing", weights: { trend: 38, value: 22, reversion: 22, income: 18 } },
  aggressive:   { label: "Aggressive",   maxPos: 20, cashDeploy: 0.85, buyBar: 54, sellBar: 34, rsiOver: 80, rsiUnder: 33, stopMult: 1.4, name: "Growth & momentum, concentrated", weights: { trend: 56, value: 14, reversion: 8, income: 4 } },
};
// classify each proposition's NATURAL holding horizon from its signal character
function tradeHorizon(sig) {
  const q = sig.qualityScore, v = sig.valueScore, mom = sig.mom, rsi = sig.rsi;
  if (q >= 60 && v >= 42) return { tag: "Core · years", kind: "core", note: "quality compounder at a fair price — base position to hold through cycles" };
  if (rsi < 32) return { tag: "Quick win · weeks", kind: "quick", note: "oversold bounce — tactical, take the snap-back" };
  if (rsi > 70 || (mom >= 62 && q < 55)) return { tag: "Quick win · wks–mths", kind: "quick", note: "momentum/extended — tactical, not a forever hold" };
  if (mom >= 52) return { tag: "Tactical · months", kind: "tactical", note: "trend position over months" };
  if (q >= 52) return { tag: "Build · months–yrs", kind: "build", note: "decent quality — accumulate on weakness" };
  return { tag: "Watch · months", kind: "watch", note: "range-bound — no clear edge yet" };
}
const DEFAULT_WEIGHTS = { trend: 35, value: 20, reversion: 25, income: 20 };
function presetCfg(r, raw) {
  const p = RISK[r];
  const cfg = { weights: { ...(p.weights || DEFAULT_WEIGHTS) }, buyBar: p.buyBar, sellBar: p.sellBar, rsiOver: p.rsiOver, rsiUnder: p.rsiUnder, cashDeploy: p.cashDeploy, maxPos: p.maxPos, stopMult: p.stopMult };
  if (raw) { cfg.__raw = true; return cfg; } // Learning Lab wants the pristine engine to stack its own rules on
  return (window.HelmConfig && window.HelmConfig.applyTo) ? window.HelmConfig.applyTo(cfg) : cfg;
}

function MeterBar({ value, color }) { return <div className="sl-meter"><i style={{ width: `${value}%`, background: color }} /></div>; }

// ===== Three Score Families (Copilot §8) — the canonical scoring layer =====
// Opportunity = is it a good asset? · Route = where should it sit (account/tax/size)? · Predictive = does the forward setup support it?
const CRYPTO_BENCH_MOM = 46; // BTC momentum proxy in the current drawdown regime (the "just hold BTC/ETH" hurdle)
function scoreFamilies(h, s, cfg, ctx) {
  // --- Opportunity: the existing composite (quality/value/momentum/reversion/income) ---
  const opportunity = s.composite;

  // --- Route: execution fit = position headroom + tax-location bonus ---
  const headroom = clamp(100 - (h.weight / (cfg.maxPos || 12)) * 100, 0, 100);
  const isCrypto = h.sector === "Crypto";
  const noDiv = (h.divYield || 0) < 1;
  // growthy/no-div → best in registered (tax-free growth); losers in non-reg → harvestable
  let routeTo, taxBonus;
  if (isCrypto) { routeTo = h.plPct < 0 ? "Crypto Direct (harvest loss)" : "Registered (shelter gains)"; taxBonus = h.plPct < 0 ? 70 : 55; }
  else if (noDiv) { routeTo = "Registered — REER/CELI"; taxBonus = 62; }
  else { routeTo = "Registered — dividends tax-free"; taxBonus = 58; }
  const route = clamp(Math.round(headroom * 0.55 + taxBonus * 0.45), 0, 100);

  // --- Predictive: regime alignment + trend confirmation (+ crypto BTC/ETH benchmark rule) ---
  const biasAdj = { "Risk-on": 16, "Constructive": 10, "Late-cycle": 2, "Neutral": 0, "Defensive": -12, "Risk-off": -20 }[ctx.regimeBias] || 0;
  let predictive = clamp(Math.round(s.mom * 0.6 + 50 * 0.4 + biasAdj), 0, 100);
  let benchNote = null, beatsBench = true;
  if (isCrypto) {
    beatsBench = s.mom >= CRYPTO_BENCH_MOM;
    if (!beatsBench) { predictive = clamp(predictive - 22, 0, 100); benchNote = "lags BTC — hold BTC/ETH instead"; }
    else benchNote = "clears the BTC/ETH hurdle";
  }
  return { opportunity, route, predictive, routeTo, benchNote, beatsBench };
}

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
  const [horizon, setHorizon] = useStateS("position");

  const pickRisk = (k) => { setRisk(k); setCfg((c) => ({ ...presetCfg(k), horizon })); };
  const pickHorizon = (h) => { setHorizon(h); setCfg((c) => ({ ...c, horizon: h })); };
  const setW = (key, val) => setCfg((c) => ({ ...c, weights: { ...c.weights, [key]: val } }));
  const setC = (key, val) => setCfg((c) => ({ ...c, [key]: val }));

  const acctId = account || "all";
  const view = D.buildView(acctId);
  const K = view.kpis;
  if (cfg.horizon !== horizon) cfg.horizon = horizon;
  const acctMeta = D.accounts.find((a) => a.id === acctId);
  const acctLabel = acctId === "all" ? "All accounts" : acctId === "crypto" ? "Crypto lens" : (acctMeta ? acctMeta.name : acctId);

  // per-account signals (used for tax-loss harvest + rebalance, which are account-specific)
  const perAcct = view.holdings.map((h) => {
    const s = signalsFor(h, cfg);
    return { ...h, sig: s, why: rationale(h, s, cfg) };
  });

  // security-level view: aggregate the same ticker across accounts (signals are per-security)
  const byTicker = {};
  view.holdings.forEach((h) => {
    const k = byTicker[h.ticker] || (byTicker[h.ticker] = {
      ticker: h.ticker, name: h.name, sector: h.sector, ccy: h.ccy, price: h.price,
      dayPct: h.dayPct, divYield: h.divYield, spark: h.spark,
      shares: 0, marketValue: 0, costBasis: 0, dispValue: 0, accts: [],
    });
    k.shares += h.shares; k.marketValue += h.marketValue; k.costBasis += h.costBasis;
    k.dispValue += h.dispValue; k.accts.push(h.acct);
  });
  const enriched = Object.values(byTicker).map((h) => {
    h.plAbs = h.marketValue - h.costBasis;
    h.plPct = h.costBasis ? (h.plAbs / h.costBasis) * 100 : 0;
    h.weight = K.equity ? (h.dispValue / K.equity) * 100 : 0;
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
  const regime = window.HelmRegime || null;
  const fam = (h) => scoreFamilies(h, h.sig, cfg, { regimeBias: regime ? regime.bias : "Neutral" });
  const nonReg = perAcct.filter((h) => acctReg(h.acct) === false);
  const harvest = nonReg.filter((h) => h.plAbs < -300).sort((a, b) => a.plAbs - b.plAbs);
  const harvestTotal = harvest.reduce((s, h) => s + Math.abs(h.plAbs), 0);
  // Quebec: 50% capital-gains inclusion × top combined fed+QC marginal rate 53.31% ≈ 26.65%
  const QC_CG_RATE = 0.2665;
  const taxSaved = harvestTotal * QC_CG_RATE;
  const allRegistered = nonReg.length === 0;

  const maxPos = cfg.maxPos;
  const oversized = enriched.filter((h) => h.weight > maxPos).sort((a, b) => b.weight - a.weight);

  const tradeCash = K.cash * cfg.cashDeploy;

  // ---- buy candidates: FULL market universe (held + broad) not just held positions ----
  const heldSet = new Set(enriched.map((h) => h.ticker));
  const universeExtra = (window.HelmUniverse || []).filter((u) => !heldSet.has(u.ticker)).map((u) => {
    const s = signalsFor(u, cfg);
    return { ...u, sig: s, why: rationale(u, s, cfg), weight: 0, plPct: 0, alloc: 0 };
  }).filter((u) => u.sig.action === "Buy").sort((a, b) => b.sig.composite - a.sig.composite).slice(0, 8);
  // combine: sells/trims from held positions first, then buys from full universe
  const allBuys = [
    ...buys.map((h) => ({ ...h, _held: true })),
    ...universeExtra.map((h) => ({ ...h, _held: false })),
  ];
  const totalConv = allBuys.reduce((s, h) => s + Math.max(1, h.sig.composite - cfg.sellBar), 0) || 1;
  const sized = allBuys.map((h) => ({ ...h, _kind: "buy", alloc: tradeCash * (Math.max(1, h.sig.composite - cfg.sellBar) / totalConv) }));

  const avgScore = Math.round(bMeanS(enriched.map((h) => h.sig.composite)) || 0);const posture = avgScore >= 58 ? ["Risk-on", sUP] : avgScore >= 48 ? ["Neutral", sWARN] : ["Defensive", sDOWN];
  const wsum = cfg.weights.trend + cfg.weights.value + cfg.weights.reversion + cfg.weights.income;
  const wpct = (x) => Math.round((x / wsum) * 100);
  const acctNm = (id) => { const a = D.accounts.find((x) => x.id === id); return a ? a.name : "—"; };
  const slFx = D.getFx ? D.getFx() : 1.4174;
  const slDispCcy = D.getDispCcy ? D.getDispCcy() : "CAD";
  const sharesFor = (amount, h) => {
    const px = h.price || 0; if (!px) return 0;
    const native = (h.ccy === slDispCcy || !h.ccy) ? amount : (h.ccy === "USD" ? amount / slFx : amount * slFx);
    return Math.max(1, Math.round(native / px));
  };
  const routeAcct = (h) => {
    if (h.sector === "Crypto" || h.market === "Crypto") return "REER (crypto sleeve)";
    if (h.market === "US" || h.market === "US-ETF" || h.ccy === "USD") return "CELI USD / REER USD";
    return "CELI / REER";
  };

  return (
    <div className="sl">
      <style>{`.sl-fam-sub{font-size:12px;color:var(--muted);margin-top:2px;line-height:1.45}.sl-fam-sub strong{color:var(--ink)}.sl-fam-cell{display:flex;align-items:center;gap:8px}.sl-fam-cell b{font-family:var(--mono);font-size:13px;min-width:22px}.sl-fam-table .sl-meter{min-width:54px}.sl-fam-route{font-size:12px;color:var(--ink-2)}.sl-fam-bench{font-style:normal;font-size:11px}.sl-trade-act.trim{background:color-mix(in srgb,#d97706 16%,transparent);color:#d97706}.sl-act-tag.trim{background:color-mix(in srgb,#d97706 15%,transparent);color:#d97706}.sl-trade-new{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#4f46e5;background:color-mix(in srgb,#4f46e5 12%,transparent);padding:1px 6px;border-radius:5px;margin-left:6px;vertical-align:middle}`}</style>
      <CioMacroPanel accent={accent} account={acctId} compact={true} />
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
          <div className="sl-risk-toprow" style={{ marginTop: 10 }}>
            <span className="sl-risk-label">Horizon</span>
          </div>
          <div className="pm-range sl-risk-seg">
            {[["swing", "Swing · weeks"], ["position", "Position · months"], ["long", "Long-term · years"]].map(([k, l]) => (
              <button key={k} className={horizon === k ? "is-active" : ""} onClick={() => pickHorizon(k)}>{l}</button>
            ))}
          </div>
          <span className="sl-risk-note">{RISK[risk].name} · max {maxPos}% / position · {Math.round(cfg.cashDeploy * 100)}% cash deployed{horizon === "long" ? " · long-term lens: scores on fundamentals, ignores short-term overbought" : horizon === "swing" ? " · swing lens: momentum & RSI-driven" : ""}</span>
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
            {[...sized, ...sells.map((h) => ({ ...h, _kind: "sell" }))].map((h) => (
              <div className="sl-trade" key={h.ticker + h._kind}>
                <div className={`sl-trade-act ${h._kind === "buy" ? "buy" : (h.sig.sellKind === "Exit" ? "exit" : "trim")}`}>{h._kind === "buy" ? "Buy" : h.sig.sellKind}</div>
                <div className="pm-sym-badge sl-badge" style={{ background: accent + "1a", color: accent }}>{h.ticker.slice(0, 2)}</div>
                <div className="sl-trade-id">
                  <div className="sl-trade-tkr">{h.ticker} <span className="sl-trade-name">{h.name}</span>{h.sig.realFund ? <span className="sl-fund-live" title={"Real fundamentals from live feed" + (h.sig.pe ? " · P/E " + h.sig.pe.toFixed(1) : "") + (h.sig.qualReal && typeof h.sig.roe === "number" ? " · ROE " + h.sig.roe.toFixed(0) + "%" : "")}>● {h.sig.qualReal ? "live+" : "live"}</span> : null}{h.sig.select ? <span className="sl-nbc" title={`NBC Select List · target $${h.sig.select.target} · analyst est. +${h.sig.select.est}%`}>★ NBC +{Math.round(h.sig.select.est)}%</span> : null}{h._kind === "buy" && !h._held ? <span className="sl-trade-new">new</span> : null}</div>
                  <div className="sl-trade-why">{h.why}</div>
                  {(() => { const th = tradeHorizon(h.sig); return <span className={`sl-horizon sl-hz-${th.kind}`} title={th.note}>{th.tag}</span>; })()}
                </div>
                <div className="sl-trade-nums">
                  <div className="sl-trade-size">{h._kind === "buy" ? sMoney(h.alloc) : sMoney(h.dispValue * (h.sig.sellFrac || 0.33))} <span className="sl-trade-sh">· {sharesFor(h._kind === "buy" ? h.alloc : h.dispValue * (h.sig.sellFrac || 0.33), h).toLocaleString("en-US")} sh</span></div>
                  <div className="sl-trade-acct">{h._kind === "buy"
                    ? (h._held && h.acct ? "add in " + acctNm(h.acct) : "→ " + routeAcct(h))
                    : (h.acct ? "from " + acctNm(h.acct) + (h.sig.sellKind === "Trim" ? " · keep " + Math.round((1 - (h.sig.sellFrac || 0.33)) * 100) + "%" : " · sell all") : (h.sig.sellKind === "Trim" ? "trim · keep " + Math.round((1 - (h.sig.sellFrac || 0.33)) * 100) + "%" : "sell all"))}</div>
                  <div className="sl-trade-lv">
                    <span style={{ color: sDOWN }}>SL {sMoney(h.sig.stop)}</span>
                    <span style={{ color: sUP }}>TP {sMoney(h.sig.target)}</span>
                  </div>
                  {window.TradeButton && <window.TradeButton
                    label={h._kind === "buy" ? "Log buy" : (h.sig.sellKind === "Exit" ? "Log exit" : "Log trim")}
                    ticker={h.ticker} side={h._kind === "buy" ? "buy" : "sell"}
                    amount={h._kind === "buy" ? h.alloc : h.dispValue * (h.sig.sellFrac || 0.33)}
                    acctHint={h.acct} source="Strategy Lab" fullSell={h._kind !== "buy" && h.sig.sellKind === "Exit"} small
                    style={{ marginTop: 6 }} />}
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
                    <div className="sl-tax-row" key={h.ticker + "·" + h.acct}>
                      <span className="sl-tax-tkr">{h.ticker}</span>
                      <span className="sl-tax-loss" style={{ color: sDOWN }}>{sSigned(h.plAbs)}</span>
                    </div>
                  ))}
                </div>
                <div className="sl-tax-note">Québec: ~26.65% effective rate (50% inclusion × 53.31% top combined fed+QC). Mind the 30-day superficial-loss rule before repurchasing.</div>
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

      {/* 2.5 THREE SCORE FAMILIES — canonical scoring */}
      <section className="pm-card">
        <div className="pm-card-head">
          <div>
            <div className="pm-card-eyebrow">Three score families · {acctLabel}</div>
            <div className="sl-fam-sub">Opportunity (is it a good asset?) · Route (where should it sit?) · Predictive (does the forward setup back it?). {regime ? <>Regime: <strong>{regime.label}</strong> · {regime.bias}.</> : "Regime: — (open Macro → Economic CIO)."}</div>
          </div>
        </div>
        <div className="pm-table-wrap">
          <table className="pm-table sl-fam-table">
            <thead><tr>
              <th className="ta-left">Symbol</th>
              <th className="ta-left">Opportunity</th>
              <th className="ta-left">Route</th>
              <th className="ta-left">Predictive</th>
              <th className="ta-left">Route → / note</th>
              <th className="ta-center">Action</th>
            </tr></thead>
            <tbody>
              {[...enriched].map((h) => ({ h, f: fam(h) })).sort((a, b) => (b.f.opportunity + b.f.predictive) - (a.f.opportunity + a.f.predictive)).map(({ h, f }) => (
                <tr key={h.ticker}>
                  <td className="ta-left">
                    <div className="pm-sym">
                      <div className="pm-sym-badge" style={{ background: accent + "1a", color: accent }}>{h.ticker.slice(0, 2)}</div>
                      <div><div className="pm-sym-tkr">{h.ticker}</div><div className="pm-sym-name">{h.sector}</div></div>
                    </div>
                  </td>
                  <td className="ta-left"><div className="sl-fam-cell"><b style={{ color: f.opportunity >= 60 ? sUP : f.opportunity <= 40 ? sDOWN : sWARN }}>{f.opportunity}</b><MeterBar value={f.opportunity} color={accent} /></div></td>
                  <td className="ta-left"><div className="sl-fam-cell"><b>{f.route}</b><MeterBar value={f.route} color="#4f46e5" /></div></td>
                  <td className="ta-left"><div className="sl-fam-cell"><b style={{ color: f.predictive >= 60 ? sUP : f.predictive <= 40 ? sDOWN : sWARN }}>{f.predictive}</b><MeterBar value={f.predictive} color="#0891b2" /></div></td>
                  <td className="ta-left"><div className="sl-fam-route">{f.routeTo}{f.benchNote ? <em className="sl-fam-bench" style={{ color: f.beatsBench ? sUP : sDOWN }}> · {f.benchNote}</em> : null}</div></td>
                  <td className="ta-center"><span className={`sl-act-tag ${h.sig.action === "Sell" ? (h.sig.sellKind === "Exit" ? "sell" : "trim") : h.sig.action.toLowerCase()}`}>{h.sig.action === "Sell" ? h.sig.sellKind : h.sig.action}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sl-foot-note">The three families are account-aware and sit above the raw factors. Crypto positions must clear the <strong>BTC/ETH benchmark rule</strong> in Predictive — a coin that lags Bitcoin's trend scores lower, since you could just hold BTC/ETH. Framework only.</div>
      </section>

      {/* 3. SIGNAL TABLE */}
      <section className="pm-card">
        <div className="pm-card-head">
          <div className="pm-card-eyebrow">Factor detail · raw signals</div>
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

window.__helmStrategyRev = "gate-v4"; // σ-gate + no-miss-memo
window.StrategyLab = StrategyLab;
window.signalsFor = signalsFor;
window.helmTradeHorizon = tradeHorizon;
window.helmPresetCfg = presetCfg;

// ===== Portfolio construction: correlation/sector-aware sizing + diversification overlay =====
// Takes ranked picks [{ ticker, sector, score, ... }] and returns balanced weights that:
//  1. cap any single name, 2. cap any one sector, 3. shrink names that are highly correlated
//     (same sector = high corr proxy), so the BOOK is diversified, not just each pick good.
const CORR_SECTOR = { Crypto: 0.85, Semiconductors: 0.72, Tech: 0.62, Technology: 0.62, Software: 0.62, Energy: 0.58, Materials: 0.55, Financials: 0.5, Gold: 0.6 };

// ── Ledoit-Wolf shrinkage: constant-correlation target, analytic λ ────────────
// Shrinks the sample correlation matrix toward a constant-correlation model
// (all off-diagonal elements = ρ̅). With short histories (our spark is only 6
// points) the shrinkage is heavy — intentionally, to avoid noise domination.
function ledoitWolfCorr(C) {
  const n = C.length;
  let rhoBar = 0, cnt = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) { rhoBar += C[i][j]; cnt++; }
  rhoBar = cnt ? rhoBar / cnt : 0;
  // analytic shrinkage intensity: Oracle approx = n / (n + 0.5p)
  const lambda = Math.min(1, Math.max(0, n / (n + n * 0.5)));
  return C.map((row, i) => row.map((v, j) => i === j ? 1 : lambda * rhoBar + (1 - lambda) * v));
}

// Build n×n proxy correlation matrix from sector tags, then shrink
function buildCorrMatrix(picks) {
  const n = picks.length;
  const C = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => {
    if (i === j) return 1;
    const si = picks[i].sector, sj = picks[j].sector;
    if (si === sj) return CORR_SECTOR[si] != null ? CORR_SECTOR[si] : 0.5;
    const ci = CORR_SECTOR[si] != null ? CORR_SECTOR[si] : 0.4;
    const cj = CORR_SECTOR[sj] != null ? CORR_SECTOR[sj] : 0.4;
    return (ci + cj) * 0.15; // rough cross-sector proxy (no shared single-factor)
  }));
  return ledoitWolfCorr(C);
}

// ── HRP: single-linkage seriation → recursive bisection → inverse-var weights ──
function hrpWeights(picks, C) {
  const n = picks.length;
  if (n === 1) return [1];
  // distance: d_ij = sqrt((1 − ρ_ij) / 2)  (angular distance, metric)
  const D = C.map((row, i) => row.map((v, j) => i === j ? 0 : Math.sqrt((1 - Math.max(-0.99, Math.min(0.99, v))) / 2)));
  // Greedy seriation: O(n²) — build a chain that always picks the nearest un-visited neighbour
  const visited = new Array(n).fill(false);
  const order = [0]; visited[0] = true;
  for (let step = 1; step < n; step++) {
    let best = Infinity, bi = -1;
    const last = order[order.length - 1];
    for (let j = 0; j < n; j++) if (!visited[j] && D[last][j] < best) { best = D[last][j]; bi = j; }
    order.push(bi); visited[bi] = true;
  }
  // Cluster variance: equal-weight portfolio within the cluster (using proxy corr)
  const clusterVar = (idx) => {
    const m = idx.length;
    let v = 0;
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) v += C[idx[i]][idx[j]];
    return v / (m * m);
  };
  // Recursive bisection: split into two halves, weight each half by inverse variance
  const w = new Array(n).fill(1);
  const bisect = (cluster) => {
    if (cluster.length <= 1) return;
    const mid = Math.ceil(cluster.length / 2);
    const L = cluster.slice(0, mid), R = cluster.slice(mid);
    const vL = Math.max(1e-8, clusterVar(L)), vR = Math.max(1e-8, clusterVar(R));
    const aL = vR / (vL + vR); // left gets MORE weight when it has LOWER variance
    L.forEach((i) => { w[i] *= aL; }); R.forEach((i) => { w[i] *= (1 - aL); });
    bisect(L); bisect(R);
  };
  bisect(order);
  const tot = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((v) => v / tot);
}
function helmConstruct(picks, opts) {
  opts = opts || {};
  const maxName = opts.maxName || 0.12;
  const maxSector = opts.maxSector || 0.30;
  if (!picks.length) return { weights: [], div: null };

  // ── INITIAL WEIGHTS via HRP + Ledoit-Wolf (when ≥3 picks) ────────────────────────────
  // HRP gives inverse-variance weights that respect the correlation structure between picks
  // (high-corr names in the same sector get naturally down-weighted without us having to hand-tune).
  // The existing water-filling name/sector caps still apply ON TOP of HRP as a hard risk guard.
  let w;
  // bySector needed for feasibility check + fallback branch
  const bySector = {};
  picks.forEach((p) => { (bySector[p.sector] = bySector[p.sector] || []).push(p); });
  if (picks.length >= 3 && opts.hrp !== false) {
    const C = buildCorrMatrix(picks);
    const hrp = hrpWeights(picks, C);
    w = picks.map((p, i) => ({ ...p, w: hrp[i] }));
  } else {
    // fallback for 1–2 picks: score-proportional with intra-sector shrink
    const bySec = {};
    picks.forEach((p) => { (bySec[p.sector] = bySec[p.sector] || []).push(p); });
    const raw = picks.map((p) => {
      const peers = bySec[p.sector]; const rank = peers.indexOf(p);
      const corr = CORR_SECTOR[p.sector] != null ? CORR_SECTOR[p.sector] : 0.4;
      return { ...p, w0: Math.max(1, p.score) / (1 + corr * rank) };
    });
    const tot0 = raw.reduce((a, p) => a + p.w0, 0) || 1;
    w = raw.map((p) => ({ ...p, w: p.w0 / tot0 }));
  }
  const nSec = Object.keys(bySector).length;
  // feasibility: caps must allow the weights to sum to 1
  const feasible = (w.length * maxName >= 1 - 1e-9) && (nSec * maxSector >= 1 - 1e-9);
  if (!feasible) {
    // can't satisfy caps — fall back to equal weight (least-concentrated achievable) and flag it
    const eq = 1 / w.length;
    w = w.map((p) => ({ ...p, w: eq }));
  } else {
    // WATER-FILLING: cap a name/sector, then redistribute its excess ONLY to uncapped names
    // (global renormalize would re-inflate the capped bucket, so we never renormalize globally)
    for (let pass = 0; pass < 24; pass++) {
      let changed = false;
      // name caps
      let excess = 0; const freeName = [];
      w.forEach((p) => { if (p.w > maxName + 1e-9) { excess += p.w - maxName; p.w = maxName; p._capN = true; changed = true; } if (p.w < maxName - 1e-9 && !p._capN) freeName.push(p); });
      if (excess > 1e-9 && freeName.length) { const base = freeName.reduce((a, p) => a + p.w, 0) || 1; freeName.forEach((p) => { p.w += excess * (p.w / base); }); }
      // sector caps
      const secT = {}; w.forEach((p) => { secT[p.sector] = (secT[p.sector] || 0) + p.w; });
      Object.keys(secT).forEach((sec) => {
        if (secT[sec] > maxSector + 1e-9) {
          const scale = maxSector / secT[sec];
          let freed = 0;
          w.forEach((p) => { if (p.sector === sec) { const nw = p.w * scale; freed += p.w - nw; p.w = nw; } });
          changed = true;
          // give freed weight to names in OTHER, non-maxed sectors below the name cap
          const recip = w.filter((p) => p.sector !== sec && p.w < maxName - 1e-9);
          const recSecT = {}; recip.forEach((p) => { recSecT[p.sector] = (recSecT[p.sector] || 0) + 1; });
          const base = recip.reduce((a, p) => a + p.w, 0) || recip.length || 1;
          if (recip.length) recip.forEach((p) => { p.w += freed * ((p.w || 1 / recip.length) / base); });
        }
      });
      if (!changed) break;
    }
    // final tidy normalize (tiny drift only — caps already hold)
    const tot = w.reduce((a, p) => a + p.w, 0) || 1;
    w = w.map((p) => ({ ...p, w: p.w / tot, _capN: undefined }));
  }
  // diversification score: penalize ACTUAL top-sector concentration, not just average HHI
  const hhiName = w.reduce((a, p) => a + p.w * p.w, 0);
  const secW = {}; w.forEach((p) => { secW[p.sector] = (secW[p.sector] || 0) + p.w; });
  const effNames = 1 / hhiName;
  const sectorsArr = Object.entries(secW).sort((a, b) => b[1] - a[1]);
  const topSectorW = sectorsArr.length ? sectorsArr[0][1] : 1;
  const maxNameW = w.reduce((a, p) => Math.max(a, p.w), 0);
  // base on effective breadth, then hard-penalize concentration above the intended caps
  let divScore = (effNames / w.length) * 60 + (sectorsArr.length / Math.max(1, w.length)) * 40;
  divScore *= clamp(1 - Math.max(0, topSectorW - maxSector) * 1.6, 0.3, 1);   // top sector over cap → cut score
  divScore *= clamp(1 - Math.max(0, maxNameW - maxName) * 1.5, 0.4, 1);        // any name over cap → cut score
  if (!feasible) divScore = Math.min(divScore, 55);                            // can't honestly call an infeasible book well-diversified
  divScore = clamp(Math.round(divScore), 0, 100);
  const topSector = sectorsArr[0];
  return { weights: w, div: { score: divScore, effNames: +effNames.toFixed(1), sectors: sectorsArr.length, topSector: topSector ? topSector[0] : "—", topSectorW: topSector ? Math.round(topSector[1] * 100) : 0, feasible, capName: Math.round(maxName * 100), capSector: Math.round(maxSector * 100), method: picks.length >= 3 ? "HRP+LW" : "score-prop" } };
}
window.helmConstruct = helmConstruct;