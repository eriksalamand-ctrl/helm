// learninglab.jsx — Walk-Forward Strategy Validator (Phase 1 of the Learning Lab spec).
// Runs the EXISTING model (signalsFor = v0.1.0 baseline) day-by-day on out-of-sample history,
// scores it, tests a candidate tweak, compares KPIs, and proposes an accept/reject decision.
// Sandboxed: never modifies the live engine. AI prose via window.helmAI ?? window.claude (Opus/Gemini/Haiku).
const { useState: useLLState, useRef: useLLRef } = React;

const llUP = "#0e9f6e", llDN = "#e02424", llWARN = "#d97706", llBLUE = "#2563eb";
const llPct = (n, dp = 1) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(dp) + "%";
const llNum = (n, dp = 2) => n == null || isNaN(n) ? "—" : n.toFixed(dp);

const LL_VERSIONS_KEY = "helm_ll_versions_v1";
const loadVersions = () => { try { return JSON.parse(localStorage.getItem(LL_VERSIONS_KEY) || "[]"); } catch (e) { return []; } };
const saveVersions = (v) => { try { localStorage.setItem(LL_VERSIONS_KEY, JSON.stringify(v)); } catch (e) {} };

const LL_RUNS_KEY = "helm_ll_runs_v1";
const loadRunHistory = () => { try { return JSON.parse(localStorage.getItem(LL_RUNS_KEY) || "[]"); } catch (e) { return []; } };
const saveRunHistory = (v) => { try { localStorage.setItem(LL_RUNS_KEY, JSON.stringify(v)); } catch (e) {} };

// ---- KPI math ----
function computeKPIs(dailyRet, tradeFlags) {
  const n = dailyRet.length || 1;
  let equity = 1, peak = 1, mdd = 0;
  const curve = [1];
  dailyRet.forEach((r) => { equity *= (1 + r); curve.push(equity); peak = Math.max(peak, equity); mdd = Math.min(mdd, equity / peak - 1); });
  const totalRet = (equity - 1) * 100;
  const years = n / 252;
  const cagr = (Math.pow(equity, 1 / Math.max(years, 0.01)) - 1) * 100;
  const mean = dailyRet.reduce((s, r) => s + r, 0) / n;
  const variance = dailyRet.reduce((s, r) => s + (r - mean) ** 2, 0) / n;
  const vol = Math.sqrt(variance) * Math.sqrt(252) * 100;
  const downside = Math.sqrt(dailyRet.filter((r) => r < 0).reduce((s, r) => s + r * r, 0) / n) * Math.sqrt(252) * 100;
  const rf = 0.025;
  const sharpe = vol > 0 ? (cagr / 100 - rf) / (vol / 100) : 0;
  const sortino = downside > 0 ? (cagr / 100 - rf) / (downside / 100) : 0;
  const calmar = mdd < 0 ? (cagr / 100) / Math.abs(mdd) : 0;
  const trades = tradeFlags ? tradeFlags.reduce((s, f) => s + (f ? 1 : 0), 0) : 0;
  const turnover = (trades / n) * 252;
  const timeIn = tradeFlags ? (tradeFlags.filter(Boolean).length / n) * 100 : 0;
  return { totalRet, cagr, mdd: mdd * 100, vol, sharpe, sortino, calmar, trades, turnover, timeIn, curve };
}

// ---- candidate rule library: each accepted version adds ONE distinct rule (cumulative) ----
// We DON'T touch signalsFor. Each rule wraps its output. v0.1.N applies rules[0..N-1].
// Mix of SUPPRESSORS (Buy→Hold) and ADDITIVE rules (Hold→Buy on strong evidence) so stacking
// stays balanced instead of over-filtering to zero trades.
const CANDIDATE_RULES = [
  { id: "trend-gate", name: "Trend-confirmation gate", kind: "filter", desc: "Skip Buy when momentum <52 or trend <55 — no falling-knife entries.",
    apply: (s) => { if (s.action === "Buy" && (s.mom < 52 || s.trendScore < 55)) s.action = "Hold"; return s; } },
  { id: "rsi-exit", name: "RSI overbought exit", kind: "filter", desc: "Don't Buy when RSI >72 — wait for the overbought spike to cool.",
    apply: (s) => { if (s.action === "Buy" && s.rsi > 72) s.action = "Hold"; return s; } },
  { id: "oversold-add", name: "Oversold-bounce entry", kind: "add", desc: "ADD: promote a Hold to Buy when RSI <32 and quality ≥50 — buy quality on capitulation.",
    apply: (s) => { if (s.action !== "Sell" && s.rsi < 32 && s.qualityScore >= 50) s.action = "Buy"; return s; } },
  { id: "quality-floor", name: "Quality floor", kind: "filter", desc: "Require quality ≥50 to Buy — avoid low-quality names.",
    apply: (s) => { if (s.action === "Buy" && s.qualityScore < 50) s.action = "Hold"; return s; } },
  { id: "value-conviction", name: "Value+quality conviction add", kind: "add", desc: "ADD: promote a Hold to Buy when value ≥60, quality ≥55 and trend isn't broken (mom ≥48).",
    apply: (s) => { if (s.action === "Hold" && s.valueScore >= 60 && s.qualityScore >= 55 && s.mom >= 48) s.action = "Buy"; return s; } },
  { id: "regime-tilt", name: "Regime tilt (add/cut)", kind: "both", desc: "Risk-on/Constructive: promote strong Holds (composite ≥58) to Buy. Risk-off/Defensive: cut weak Buys.",
    apply: (s) => { const r = window.HelmRegime, c = s.composite != null ? s.composite : 50;
      if (r && /Risk-on|Constructive/.test(r.bias) && s.action === "Hold" && c >= 58) s.action = "Buy";
      else if (r && /Risk-off|Defensive/.test(r.bias) && s.action === "Buy" && c < 55) s.action = "Hold";
      return s; } },
  { id: "breakout-add", name: "Momentum-breakout add", kind: "add", desc: "ADD: promote a Hold to Buy when momentum ≥62 and trend ≥60 — ride confirmed breakouts.",
    apply: (s) => { if (s.action === "Hold" && s.mom >= 62 && s.trendScore >= 60) s.action = "Buy"; return s; } },
  { id: "value-guard", name: "Valuation guard", kind: "filter", desc: "Require value ≥42 to Buy — skip extremely rich setups.",
    apply: (s) => { if (s.action === "Buy" && s.valueScore < 42) s.action = "Hold"; return s; } },
];

// apply the first `ruleCount` rules cumulatively
function modelDecision(ruleCount, h, cfg) {
  let s = { ...window.signalsFor(h, cfg) };
  for (let i = 0; i < ruleCount && i < CANDIDATE_RULES.length; i++) s = CANDIDATE_RULES[i].apply(s);
  return s;
}

// ---- walk-forward over one ticker; long-only: in-market when action=Buy, flat otherwise ----
function walkForwardTicker(ruleCount, hist, meta, cfg) {
  const N = hist.length;
  const FEAT = 28;             // feature window length (the 28-day spark)
  const HZ = 5;                // label horizon (forward return used for prediction scoring)
  // PURGED + EMBARGO split: test on newest 50%, but embargo the first FEAT days of the test side so
  // no test-day feature window reaches back across the train/test boundary (kills look-ahead leakage).
  const split = Math.floor(N / 2);
  const start = split + FEAT;  // embargo gap
  const dailyRet = [], tradeFlags = [], preds = [];
  let inMarket = false;
  for (let t = start; t < N - HZ; t++) {
    const window28 = hist.slice(Math.max(0, t - 27), t + 1).map((c, i, a) => (c / a[0]) * 50);
    const synth = { ticker: meta.ticker, sector: meta.sector, price: hist[t], spark: window28, divYield: meta.divYield || 0, plPct: 0, weight: 0 };
    const sig = modelDecision(ruleCount, synth, cfg);
    const wasIn = inMarket;
    inMarket = sig.action === "Buy";
    tradeFlags.push(wasIn !== inMarket); // a trade happened on transition
    const dayRet = inMarket ? (hist[t + 1] / hist[t] - 1) : 0; // long-only daily P&L
    dailyRet.push(dayRet);
    // prediction scoring at horizon
    const fwd = hist[t + HZ] / hist[t] - 1;
    const dir = sig.action === "Buy" ? 1 : sig.action === "Sell" ? -1 : 0;
    const hit = (dir > 0 && fwd > 0) || (dir < 0 && fwd < 0) || (dir === 0 && Math.abs(fwd) < 0.02);
    preds.push({ hit, dir });
  }
  return { dailyRet, tradeFlags, preds };
}

function aggregateKPIs(runs) {
  // pool daily returns across tickers equal-weighted
  const maxLen = Math.max(...runs.map((r) => r.dailyRet.length));
  const pooled = [], flags = [];
  for (let i = 0; i < maxLen; i++) {
    const day = runs.map((r) => r.dailyRet[i]).filter((x) => x != null);
    pooled.push(day.length ? day.reduce((s, x) => s + x, 0) / day.length : 0);
    flags.push(runs.some((r) => r.tradeFlags[i]));
  }
  const kpi = computeKPIs(pooled, flags);
  const allPreds = runs.flatMap((r) => r.preds);
  kpi.predAcc = allPreds.length ? (allPreds.filter((p) => p.hit).length / allPreds.length) * 100 : 0;
  kpi.predN = allPreds.length;
  return kpi;
}

// ---- acceptance rule (spec section 17) ----
function evaluateAcceptance(base, cand) {
  // a candidate must actually DO something different and meaningfully better — not a zero-delta clone
  const meaningfulChange = Math.abs(cand.sharpe - base.sharpe) > 0.03 || Math.abs(cand.cagr - base.cagr) > 0.3 || Math.abs(cand.mdd - base.mdd) > 0.3;
  const sharpeGain = cand.sharpe - base.sharpe;
  const checks = [
    { k: "Engine actually traded", pass: cand.turnover > 0.05 && cand.timeIn > 1 },
    { k: "Candidate differs from baseline", pass: meaningfulChange },
    { k: "Sharpe improves (≥+0.05 & ≥5%)", pass: sharpeGain >= 0.05 && cand.sharpe >= base.sharpe * 1.05 },
    { k: "Sortino not worse", pass: cand.sortino >= base.sortino - 0.02 },
    { k: "Max drawdown not worse", pass: cand.mdd >= base.mdd - 0.5 },
    { k: "CAGR drop ≤3pp", pass: cand.cagr >= base.cagr - 3 },
    { k: "Turnover not +25%", pass: cand.turnover <= base.turnover * 1.25 + 0.5 },
  ];
  const passed = checks.filter((c) => c.pass).length;
  const accepted = checks.every((c) => c.pass);
  return { checks, passed, total: checks.length, accepted };
}

function LearningLab({ accent }) {
  const D = window.PMData;
  const [mode, setMode] = useLLState("quick");
  const [status, setStatus] = useLLState("idle"); // idle | running | done | stopped
  const [progress, setProgress] = useLLState(0);
  const [result, setResult] = useLLState(null);
  const [versions, setVersions] = useLLState(loadVersions);
  const [logText, setLogText] = useLLState("");
  const [aiState, setAiState] = useLLState("");
  const stopRef = useLLRef(false);
  const [universe, setUniverse] = useLLState("all");
  const [history, setHistory] = useLLState(loadRunHistory);
  const [expanded, setExpanded] = useLLState(null);
  const [zoom, setZoom] = useLLState(null);
  const [cfgTick, setCfgTick] = useLLState(0); // bumps to re-render the live-applied banner
  const [applyFlash, setApplyFlash] = useLLState(null); // transient "applied" confirmation

  const modeCfg = { quick: { n: 8, label: "Quick Test" }, medium: { n: 20, label: "Medium" }, full: { n: 40, label: "Full" } }[mode];

  // dynamic version model: each accepted version = one more rule from the library (cumulative)
  const acceptedVers = versions.filter((v) => v.accepted);
  const baseRuleCount = acceptedVers.length;
  const candRuleCount = baseRuleCount + 1;
  const baseLabel = "v0.1." + baseRuleCount;
  const candLabel = "v0.1." + candRuleCount;
  const ruleUnderTest = CANDIDATE_RULES[baseRuleCount] || null;

  // build universe options: held + per-account + per-MIT-bucket + broad market (from Screener)
  const bucketOf = window.HelmPlan ? window.HelmPlan.bucketOf : null;
  const market = window.HelmUniverse || [];
  const hasMkt = (m) => market.some((u) => u.market === m);
  const UNIVERSES = [
    { k: "all", label: "All holdings" },
    ...D.accounts.map((a) => ({ k: "acct:" + a.id, label: a.name })),
    ...(bucketOf ? ["Core Growth", "Ballast", "Satellite", "Volatile Offense"].map((b) => ({ k: "mit:" + b, label: b + " (MIT)" })) : []),
    ...(hasMkt("US") ? [{ k: "mkt:US", label: "US equities" }] : []),
    ...(hasMkt("CA") ? [{ k: "mkt:CA", label: "Canada equities" }] : []),
    ...(hasMkt("Crypto") ? [{ k: "mkt:Crypto", label: "Crypto (market)" }] : []),
    ...(hasMkt("US-ETF") ? [{ k: "mkt:US-ETF", label: "US ETFs · curated" }] : []),
    ...(hasMkt("CA-ETF") ? [{ k: "mkt:CA-ETF", label: "Canada ETFs · curated" }] : []),
    ...(window.HelmETFFull ? [{ k: "etf:US", label: "US ETFs · full directory" }, { k: "etf:CA", label: "Canada ETFs · full directory" }] : []),
  ];
  // normalize a full-directory ETF row [tk,name,price] into a sim record
  function etfNorm(row) {
    const [tk, name, price] = row;
    const seed = llHash(tk) % 9000 + 100;
    return { ticker: tk, name, sector: "ETF", price: price > 0 ? price : 25 + (seed % 120), seed, plPct: ((seed % 60) - 25), divYield: (seed % 5) * 0.8, shares: 0 };
  }
  // normalize any item (held or market) into a sim-ready record
  function llHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function normSim(h) {
    if (h.shares != null) return h; // held position already has seed + plPct
    const seed = llHash(h.ticker) % 9000 + 100;
    const plPct = ((seed % 70) - 30); // deterministic spread of historical outcomes
    return { ticker: h.ticker, sector: h.sector, price: h.price, seed, plPct, divYield: h.divYield || 0, shares: 0 };
  }
  function filterUniverse() {
    if (universe.startsWith("etf:")) { const m = universe.slice(4); return ((window.HelmETFFull || {})[m] || []).map(etfNorm); }
    if (universe.startsWith("mkt:")) { const m = universe.slice(4); return market.filter((u) => u.market === m).map(normSim); }
    let pool = D.allHoldings;
    if (universe.startsWith("acct:")) { const id = universe.slice(5); pool = pool.filter((h) => h.acct === id); }
    else if (universe.startsWith("mit:") && bucketOf) { const b = universe.slice(4); pool = pool.filter((h) => bucketOf(h) === b); }
    return pool;
  }
  function filterUnivCount(k) {
    if (k.startsWith("etf:")) { const m = k.slice(4); return ((window.HelmETFFull || {})[m] || []).length; }
    if (k.startsWith("mkt:")) { const m = k.slice(4); return market.filter((u) => u.market === m).length; }
    const seen = {}; let n = 0;
    let pool = D.allHoldings;
    if (k.startsWith("acct:")) { const id = k.slice(5); pool = pool.filter((h) => h.acct === id); }
    else if (k.startsWith("mit:") && bucketOf) { const b = k.slice(4); pool = pool.filter((h) => bucketOf(h) === b); }
    pool.forEach((h) => { if (!seen[h.ticker]) { seen[h.ticker] = 1; n++; } });
    return n;
  }

  function run() {
    setStatus("running"); setProgress(0); setResult(null); setLogText(""); setAiState(""); stopRef.current = false;
    const cfg = window.helmPresetCfg ? window.helmPresetCfg("balanced", true) : { weights: { trend: 35, value: 20, reversion: 25, income: 20 }, buyBar: 62, sellBar: 40, rsiOver: 72, rsiUnder: 30, stopMult: 1, maxPos: 12, __raw: true };
    // pick tickers: random sample of the selected universe, different each run
    const seen = {}, uniq = [];
    filterUniverse().forEach((h) => { if (!seen[h.ticker]) { seen[h.ticker] = 1; uniq.push(h); } });
    // Fisher-Yates shuffle (fresh each click)
    for (let j = uniq.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [uniq[j], uniq[k]] = [uniq[k], uniq[j]]; }
    const picks = uniq.slice(0, modeCfg.n);
    if (picks.length === 0) { setStatus("idle"); return; }
    // generate 2yr history per ticker (504d), deterministic from seed + landed P/L
    const histories = picks.map((h) => ({
      meta: h,
      hist: D.priceHistory(h.seed * 3 + 1, 504, h.price, (h.plPct || 0) / 100, 0.013 + (h.sector === "Crypto" ? 0.02 : 0)),
    }));

    const ruleCounts = [];
    for (let r = 0; r <= candRuleCount; r++) ruleCounts.push(r);
    const runsByRule = ruleCounts.map(() => []);
    let i = 0;
    function step() {
      if (stopRef.current) { setStatus("stopped"); return; }
      const batch = Math.min(i + 2, histories.length);
      for (; i < batch; i++) {
        ruleCounts.forEach((r, ri) => { runsByRule[ri].push(walkForwardTicker(r, histories[i].hist, histories[i].meta, cfg)); });
      }
      setProgress(Math.round((i / histories.length) * 100));
      if (i < histories.length) { setTimeout(step, 16); return; }
      // done
      const base = aggregateKPIs(runsByRule[baseRuleCount]);
      const cand = aggregateKPIs(runsByRule[candRuleCount]);
      const accept = evaluateAcceptance(base, cand);
      // --- portfolio suggestion: candidate model's CURRENT-day signal per ticker ---
      const suggSig = (rc, meta, hist) => {
        const t = hist.length - 1;
        const win = hist.slice(Math.max(0, t - 27), t + 1).map((c, i, a) => (c / a[0]) * 50);
        return modelDecision(rc, { ticker: meta.ticker, sector: meta.sector, price: hist[t], spark: win, divYield: meta.divYield || 0, plPct: 0, weight: 0 }, cfg);
      };
      const sugg = histories.map(({ meta, hist }) => {
        const sig = suggSig(candRuleCount, meta, hist);
        return { ticker: meta.ticker, sector: meta.sector, action: sig.action, score: sig.composite != null ? sig.composite : (sig.score || 50) };
      });
      const buys = sugg.filter((s) => s.action === "Buy").sort((a, b) => b.score - a.score).slice(0, cfg.maxPos || 12);
      const totalScore = buys.reduce((s, b) => s + b.score, 0) || 1;
      const suggested = buys.map((b) => ({ ...b, weight: (b.score / totalScore) * 100 }));
      const actionMix = { Buy: sugg.filter((s) => s.action === "Buy").length, Hold: sugg.filter((s) => s.action === "Hold").length, Trim: sugg.filter((s) => /Trim|Sell/.test(s.action)).length };
      // --- tracker series helpers ---
      const aggCurve = (runs, filt) => {
        const sel = runs.filter((_, idx) => !filt || filt.has(picks[idx].ticker));
        if (!sel.length) return [1];
        const mx = Math.max(...sel.map((r) => r.dailyRet.length)); let eq = 1; const c = [1];
        for (let d = 0; d < mx; d++) { const day = sel.map((r) => r.dailyRet[d]).filter((x) => x != null); eq *= (1 + (day.length ? day.reduce((s, x) => s + x, 0) / day.length : 0)); c.push(eq); }
        return c;
      };
      const accCurve = (runs) => {
        const mx = Math.max(...runs.map((r) => r.preds.length)); const c = []; let hit = 0, tot = 0;
        for (let d = 0; d < mx; d++) { runs.forEach((r) => { if (r.preds[d]) { tot++; if (r.preds[d].hit) hit++; } }); c.push(tot ? (hit / tot) * 100 : 50); }
        return c;
      };
      const suggSetFor = (rc) => { const set = new Set(); histories.forEach(({ meta, hist }) => { if (suggSig(rc, meta, hist).action === "Buy") set.add(meta.ticker); }); return set; };
      // one entry per version (rule count) — overlay all
      const versionsSeries = ruleCounts.map((r) => ({
        label: "v0.1." + r, ruleCount: r,
        equity: aggCurve(runsByRule[r]),
        sugg: aggCurve(runsByRule[r], suggSetFor(r)),
        acc: accCurve(runsByRule[r]),
        isBase: r === baseRuleCount, isCand: r === candRuleCount,
      }));
      const tracker = { versions: versionsSeries, baseIdx: baseRuleCount, candIdx: candRuleCount };
      const res = { base, cand, accept, tickers: picks.map((p) => p.ticker), days: base.curve.length, universe, suggested, actionMix, baseLabel, candLabel, tracker, ruleName: ruleUnderTest ? ruleUnderTest.name : "(rule library exhausted)" };
      setResult(res); setStatus("done"); setProgress(100);
      // append to run history log
      const rec = {
        id: Date.now(), ts: new Date().toISOString(),
        universe, universeLabel: (UNIVERSES.find((u) => u.k === universe) || {}).label || "All holdings",
        mode: modeCfg.label, tickers: picks.map((p) => p.ticker), days: base.curve.length,
        accepted: accept.accepted, gates: accept.passed + "/" + accept.total,
        baseSharpe: +base.sharpe.toFixed(2), candSharpe: +cand.sharpe.toFixed(2),
        baseMdd: +base.mdd.toFixed(1), candMdd: +cand.mdd.toFixed(1),
        candCagr: +cand.cagr.toFixed(1), predAcc: +cand.predAcc.toFixed(0),
      };
      setHistory((h) => { const next = [rec, ...h].slice(0, 50); saveRunHistory(next); return next; });
      writeLog(res);
    }
    setTimeout(step, 16);
  }

  async function writeLog(res) {
    const { base, cand, accept } = res;
    const fallback = `Iteration 1 · ${new Date().toISOString().slice(0, 10)}
Model tested: ${res.candLabel} (candidate) · Baseline: ${res.baseLabel}
Tickers: ${res.tickers.join(", ")}
Out-of-sample days: ${res.days}

Finding:
Candidate ${res.candLabel} adds one rule on top of baseline ${res.baseLabel}: "${res.ruleName}". Tested cumulatively on the out-of-sample half so the only difference vs baseline is this single rule.

Result:
Sharpe ${llNum(base.sharpe)} → ${llNum(cand.sharpe)} · Max DD ${llNum(base.mdd, 1)}% → ${llNum(cand.mdd, 1)}% · CAGR ${llNum(base.cagr, 1)}% → ${llNum(cand.cagr, 1)}% · Turnover ${llNum(base.turnover, 1)} → ${llNum(cand.turnover, 1)} · Prediction accuracy ${llNum(cand.predAcc, 0)}%.

Decision: ${accept.accepted ? "ACCEPT — passed all " + accept.total + " gates." : "REJECT — passed " + accept.passed + "/" + accept.total + " gates."}
Reason: ${accept.accepted ? "Candidate improved risk-adjusted return without worsening drawdown or overtrading." : "Candidate failed at least one acceptance gate; not robust enough to promote."}`;
    setLogText(fallback);
    // optional AI prose upgrade
    const ai = window.helmAI || window.claude;
    if (ai && ai.complete) {
      setAiState("Writing analysis with AI…");
      try {
        const prompt = `You are a quant validating a trading model. Write a concise (max 140 words) improvement-log entry. Baseline ${res.baseLabel} KPIs: Sharpe ${base.sharpe.toFixed(2)}, MaxDD ${base.mdd.toFixed(1)}%, CAGR ${base.cagr.toFixed(1)}%, turnover ${base.turnover.toFixed(1)}. Candidate ${res.candLabel} adds this rule: "${res.ruleName}". Its KPIs: Sharpe ${cand.sharpe.toFixed(2)}, MaxDD ${cand.mdd.toFixed(1)}%, CAGR ${cand.cagr.toFixed(1)}%, turnover ${cand.turnover.toFixed(1)}, prediction accuracy ${cand.predAcc.toFixed(0)}%. Decision: ${accept.accepted ? "ACCEPTED" : "REJECTED"} (${accept.passed}/${accept.total} gates). Tickers: ${res.tickers.join(", ")}. Write Finding, Result, Decision, Reason. Be specific and honest.`;
        const out = await ai.complete(prompt);
        if (out && out.length > 40) { setLogText(out); setAiState("Written by AI · " + (window.helmAI ? "custom model" : "Haiku")); }
        else setAiState("");
      } catch (e) { setAiState("AI unavailable — rule-based log shown."); }
    }
  }

  function promote(res) {
    const v = { num: res.candLabel, parent: res.baseLabel,
      date: new Date().toISOString().slice(0, 10), status: res.accept.accepted ? "stable" : "rejected",
      change: res.ruleName, sharpe: res.cand.sharpe, mdd: res.cand.mdd,
      accepted: res.accept.accepted };
    const next = [v, ...versions].slice(0, 30);
    setVersions(next); saveVersions(next);
  }
  // Phase 1b: actually APPLY an accepted candidate to the live engine (via engineconfig.js).
  // v0.1.N = the first N rules of the library stacked; applying writes those rule-ids to the
  // override store, which signalsFor() reads at call time. Reversible with resetEngine().
  // Honest feedback: count how many current holdings the applied rules actually change action on.
  function affectedCount(ids) {
    try {
      const D = window.PMData; const cfg = window.helmPresetCfg ? window.helmPresetCfg("balanced", true) : null;
      if (!cfg || !D) return null;
      let n = 0, tot = 0;
      D.allHoldings.forEach((x) => { if (!x.spark) return; tot++;
        const s0 = { ...window.signalsFor(x, cfg) }; const s1 = { ...s0 };
        ids.forEach((id) => { const r = window.HelmCandidateRules && window.HelmCandidateRules[id]; if (r) r(s1); });
        if (s0.action !== s1.action) n++;
      });
      return { n, tot };
    } catch (e) { return null; }
  }
  function applyRules(ids, version, label, note) {
    if (!window.HelmConfig) return;
    const aff = affectedCount(ids);
    window.HelmConfig.apply({ rules: ids, meta: { source: "Learning Lab", version, label, note: note || "applied to live engine" } });
    setCfgTick((t) => t + 1);
    setApplyFlash({ version, nRules: ids.length,
      msg: aff ? `${version} live — ${ids.length} rule${ids.length === 1 ? "" : "s"} active, changing ${aff.n} of ${aff.tot} current holdings` : `${version} applied to the live engine` });
    setTimeout(() => setApplyFlash(null), 6000);
  }
  function applyToEngine(res) {
    const candRuleCount = parseInt((res.candLabel || "v0.1.1").split(".").pop(), 10) || 1;
    const ids = CANDIDATE_RULES.slice(0, candRuleCount).map((r) => r.id);
    applyRules(ids, res.candLabel, res.ruleName || "candidate rule", "walk-forward accepted \u2192 applied to live engine");
    if (!versions.some((v) => v.num === res.candLabel)) promote(res); // register once
  }
  // apply straight from a registered version row (no re-run needed)
  function applyVersion(v) {
    const cnt = parseInt((v.num || "v0.1.1").split(".").pop(), 10) || 1;
    const ids = CANDIDATE_RULES.slice(0, cnt).map((r) => r.id);
    applyRules(ids, v.num, v.change || "candidate rule", "applied from version registry");
  }
  function resetEngine() { if (window.HelmConfig) { window.HelmConfig.reset("reverted from Learning Lab"); setCfgTick((t) => t + 1); setApplyFlash({ version: null, msg: "Reverted to baseline v0.1.0 \u2014 the live engine is back to the deployed model" }); setTimeout(() => setApplyFlash(null), 5000); } }
  const appliedVersion = (window.HelmConfig && window.HelmConfig.get().meta) ? window.HelmConfig.get().meta.version : null;

  const KROW = (label, b, c, fmt, better) => {
    const bv = fmt(b), cv = fmt(c);
    const improved = better === "up" ? c > b : c < b;
    return (
      <tr>
        <td className="ll-k">{label}</td>
        <td className="ta-right mono">{bv}</td>
        <td className="ta-right mono" style={{ color: improved ? llUP : (c === b ? "var(--ink)" : llDN), fontWeight: 600 }}>{cv}</td>
        <td className="ta-center"><span style={{ color: improved ? llUP : llDN, fontSize: 11 }}>{improved ? "▲ better" : "▼ worse"}</span></td>
      </tr>
    );
  };

  return (
    <div className="ll">
      <style>{LL_CSS}</style>

      {/* hero / controls */}
      <section className="pm-card ll-hero">
        <div className="ll-hero-l">
          <div className="pm-card-eyebrow">Walk-forward strategy validator · Phase 1</div>
          <div className="ll-hero-title">Test the model on history it hasn't seen</div>
          <p className="ll-hero-sub">Runs the live model (<strong>{baseLabel} baseline</strong>) day-by-day on the out-of-sample half of each ticker's history, then tests <strong>{candLabel}</strong> — which adds one new rule: <strong>{ruleUnderTest ? ruleUnderTest.name : "(rule library exhausted)"}</strong>. Each accepted version stacks one more rule, so versions genuinely differ. <strong>Sandboxed</strong> — the live engine is never modified.</p>
        </div>
        <div className="ll-hero-r">
          <select className="ll-univ" value={universe} onChange={(e) => setUniverse(e.target.value)} disabled={status === "running"}>
            {UNIVERSES.map((u) => <option key={u.k} value={u.k}>{u.label} ({filterUnivCount(u.k)})</option>)}
          </select>
          <div className="ll-modes">
            {["quick", "medium", "full"].map((m) => (
              <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)} disabled={status === "running"}
                      style={mode === m ? { background: accent, borderColor: accent, color: "#fff" } : {}}>
                {{ quick: "Quick · 8", medium: "Medium · 20", full: "Full · 40" }[m]}
              </button>
            ))}
          </div>
          {status !== "running"
            ? <button className="ll-run" style={{ background: accent }} onClick={run}>▶ Run walk-forward</button>
            : <button className="ll-run stop" onClick={() => { stopRef.current = true; }}>■ Stop</button>}
        </div>
      </section>

      {/* rule under test */}
      {ruleUnderTest && status !== "running" && (
        <div className="ll-rule">
          <span className="ll-rule-tag" style={{ background: accent }}>{candLabel} rule</span>
          <span className="ll-rule-name">{ruleUnderTest.name}</span>
          <span className="ll-rule-kind" style={{ color: ruleUnderTest.kind === "add" ? "#0e9f6e" : ruleUnderTest.kind === "both" ? "#4f46e5" : "#d97706" }}>{ruleUnderTest.kind === "add" ? "▲ additive" : ruleUnderTest.kind === "both" ? "↕ tilt" : "▼ filter"}</span>
          <span className="ll-rule-desc">{ruleUnderTest.desc}</span>
        </div>
      )}

      {/* status bar */}
      {status === "running" && (
        <section className="pm-card">
          <div className="ll-prog-row"><span>Simulating {modeCfg.label} · {modeCfg.n} tickers, day-by-day…</span><span className="mono">{progress}%</span></div>
          <div className="ll-prog"><i style={{ width: progress + "%", background: accent }} /></div>
        </section>
      )}
      {status === "stopped" && <div className="ll-banner">Run stopped. Partial results discarded — re-run for a full comparison.</div>}

      {result && status === "done" && (
        <>
          {/* KPI comparison */}
          <section className="pm-card">
            <div className="pm-card-head">
              <div>
                <div className="pm-card-eyebrow">KPI comparison · {result.baseLabel} baseline vs {result.candLabel} candidate</div>
                <div className="ll-sub">{result.tickers.length} tickers · {(UNIVERSES.find((u) => u.k === result.universe) || {}).label || "All holdings"} · {result.days} out-of-sample days</div>
              </div>
              <div className={`ll-verdict ${result.accept.accepted ? "accept" : "reject"}`}>
                {result.accept.accepted ? "✓ ACCEPT" : "✗ REJECT"} · {result.accept.passed}/{result.accept.total} gates
              </div>
            </div>
            <div className="ll-tickers">
              <span className="ll-tickers-label">Tickers in this run</span>
              {result.tickers.map((t) => <span className="ll-tk" key={t}>{t}</span>)}
            </div>
            <div className="pm-table-wrap">
              <table className="pm-table ll-table">
                <thead><tr><th className="ta-left">KPI</th><th className="ta-right">{result.baseLabel} baseline</th><th className="ta-right">{result.candLabel} candidate</th><th className="ta-center">Δ</th></tr></thead>
                <tbody>
                  {KROW("Total return", result.base.totalRet, result.cand.totalRet, (x) => llPct(x), "up")}
                  {KROW("CAGR", result.base.cagr, result.cand.cagr, (x) => llPct(x), "up")}
                  {KROW("Sharpe ratio", result.base.sharpe, result.cand.sharpe, (x) => llNum(x), "up")}
                  {KROW("Sortino ratio", result.base.sortino, result.cand.sortino, (x) => llNum(x), "up")}
                  {KROW("Calmar ratio", result.base.calmar, result.cand.calmar, (x) => llNum(x), "up")}
                  {KROW("Max drawdown", result.base.mdd, result.cand.mdd, (x) => llNum(x, 1) + "%", "up")}
                  {KROW("Volatility (ann.)", result.base.vol, result.cand.vol, (x) => llNum(x, 1) + "%", "down")}
                  {KROW("Turnover (ann.)", result.base.turnover, result.cand.turnover, (x) => llNum(x, 1), "down")}
                  {KROW("Time in market", result.base.timeIn, result.cand.timeIn, (x) => llNum(x, 0) + "%", "down")}
                  {KROW("Prediction accuracy", result.base.predAcc, result.cand.predAcc, (x) => llNum(x, 0) + "%", "up")}
                </tbody>
              </table>
            </div>
          </section>

          {/* 3-panel version tracker */}
          <section className="pm-card">
            <div className="pm-card-head">
              <div>
                <div className="pm-card-eyebrow">Version tracker · {result.baseLabel} vs {result.candLabel}</div>
                <div className="ll-sub">Three lenses over the out-of-sample window. Click a panel to zoom.</div>
              </div>
            </div>
            <div className="ll-track-strip">
              <LLTrackPanel title="Whole engine" sub="blended equity" versions={result.tracker.versions} field="equity" kind="equity" baseIdx={result.tracker.baseIdx} candIdx={result.tracker.candIdx} accent={accent} onZoom={() => setZoom("equity")} active={zoom === "equity"} />
              <LLTrackPanel title="Suggested portfolio" sub="proposed buys only" versions={result.tracker.versions} field="sugg" kind="equity" baseIdx={result.tracker.baseIdx} candIdx={result.tracker.candIdx} accent={accent} onZoom={() => setZoom("sugg")} active={zoom === "sugg"} />
              <LLTrackPanel title="Prediction accuracy" sub="cumulative hit-rate" versions={result.tracker.versions} field="acc" kind="acc" baseIdx={result.tracker.baseIdx} candIdx={result.tracker.candIdx} accent={accent} onZoom={() => setZoom("acc")} active={zoom === "acc"} />
            </div>
            {zoom && (() => {
              const meta = { equity: { t: "Whole engine — blended equity", field: "equity", kind: "equity" }, sugg: { t: "Suggested portfolio — proposed buys only", field: "sugg", kind: "equity" }, acc: { t: "Prediction accuracy — cumulative hit-rate", field: "acc", kind: "acc" } }[zoom];
              return (
                <div className="ll-track-zoom">
                  <div className="ll-track-zoom-head"><span>{meta.t}</span><button className="ll-zoom-x" onClick={() => setZoom(null)}>✕ close</button></div>
                  <LLTrackChart versions={result.tracker.versions} field={meta.field} kind={meta.kind} baseIdx={result.tracker.baseIdx} candIdx={result.tracker.candIdx} accent={accent} big={true} />
                  <div className="ll-track-vlegend">
                    {result.tracker.versions.map((v, i) => (
                      <span key={v.label}><i style={{ background: v.isCand ? accent : v.isBase ? "var(--ink-2)" : "var(--muted)", opacity: v.isCand || v.isBase ? 1 : 0.4 + 0.5 * (i / result.tracker.versions.length) }} />{v.label}{v.isCand ? " (testing)" : v.isBase ? " (live)" : ""}</span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </section>

          {/* suggested portfolio */}
          <section className="pm-card">
            <div className="pm-card-head">
              <div>
                <div className="pm-card-eyebrow">Suggested portfolio · candidate model ({result.candLabel})</div>
                <div className="ll-sub">What the validated model would hold today across this run's universe — Buy signals sized by conviction, capped at {result.suggested.length} names.</div>
              </div>
              {result.actionMix && <div className="ll-mix mono">{result.actionMix.Buy} buy · {result.actionMix.Hold} hold · {result.actionMix.Trim} trim/sell</div>}
            </div>
            {result.suggested.length === 0
              ? <div className="ll-empty">Candidate model has no Buy signals in this universe right now — it would stay in cash. (Defensive posture is a valid output.)</div>
              : <div className="ll-sugg">
                  {result.suggested.map((s) => (
                    <div className="ll-sugg-row" key={s.ticker}>
                      <span className="ll-sugg-tk mono">{s.ticker}</span>
                      <span className="ll-sugg-sec">{s.sector}</span>
                      <div className="ll-sugg-bar"><i style={{ width: s.weight + "%", background: accent }} /></div>
                      <span className="ll-sugg-w mono">{s.weight.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>}
            <div className="ll-foot" style={{ marginTop: 12 }}>Equal-conviction weighting (signal score ÷ total). This is the model's <strong>proposed</strong> book, not advice — validate against your Plan's risk budget before acting. Not a live order.</div>
            {window.ReadinessBanner ? <div style={{ marginTop: 14 }}><window.ReadinessBanner label="before acting on this book" /></div> : null}
          </section>

          {/* acceptance gates */}
          <section className="pm-card">
            <div className="pm-card-eyebrow">Acceptance gates · spec §17</div>
            <div className="ll-gates">
              {result.accept.checks.map((c) => (
                <div className="ll-gate" key={c.k}>
                  <span className="ll-gate-ico" style={{ color: c.pass ? llUP : llDN }}>{c.pass ? "✓" : "✗"}</span>
                  <span>{c.k}</span>
                </div>
              ))}
            </div>
          </section>

          {/* improvement log */}
          <section className="pm-card">
            <div className="pm-card-head">
              <div className="pm-card-eyebrow">Improvement log{aiState ? <span className="ll-ai-tag"> · {aiState}</span> : null}</div>
              <div className="ll-loghdr-btns">
                {result.accept.accepted && window.HelmConfig && (
                  appliedVersion === result.candLabel
                    ? <span className="ll-apply-live" style={{ color: accent, borderColor: accent }}>✓ {result.candLabel} is live</span>
                    : <button className="ll-apply" style={{ borderColor: accent, background: accent }} onClick={() => applyToEngine(result)}>⚡ Apply {result.candLabel} to live engine</button>
                )}
                <button className="ll-promote" style={{ borderColor: accent, color: accent }} onClick={() => promote(result)}>
                  {result.accept.accepted ? "Promote to " + result.candLabel : "Log rejected version"}
                </button>
              </div>
            </div>
            <pre className="ll-log">{logText}</pre>
          </section>
        </>
      )}

      {/* run history log */}
      <section className="pm-card">
        <div className="pm-card-head">
          <div className="pm-card-eyebrow">Run history · {history.length} run{history.length === 1 ? "" : "s"}</div>
          {history.length > 0 && <button className="pm-link" style={{ color: "var(--muted)" }} onClick={() => { setHistory([]); saveRunHistory([]); }}>Clear</button>}
        </div>
        {history.length === 0
          ? <div className="ll-empty">No runs logged yet. Each walk-forward is recorded here with its timestamp, universe, tickers, and verdict.</div>
          : history.map((r) => (
            <div className="ll-hrun" key={r.id}>
              <button className="ll-hrun-head" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                <span className="ll-hrun-exp">{expanded === r.id ? "−" : "+"}</span>
                <span className="ll-hrun-ts mono">{new Date(r.ts).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="ll-hrun-univ">{r.universeLabel}</span>
                <span className="ll-hrun-meta mono">{r.tickers.length} tk · {r.mode}</span>
                <span className={`ll-hrun-v ${r.accepted ? "accept" : "reject"}`}>{r.accepted ? "✓ ACCEPT" : "✗ REJECT"} {r.gates}</span>
              </button>
              {expanded === r.id && (
                <div className="ll-hrun-detail">
                  <div className="ll-hrun-tks">{r.tickers.map((t) => <span className="ll-tk" key={t}>{t}</span>)}</div>
                  <div className="ll-hrun-kpis">
                    <span>Sharpe <strong>{r.baseSharpe} → {r.candSharpe}</strong></span>
                    <span>Max DD <strong>{r.baseMdd}% → {r.candMdd}%</strong></span>
                    <span>Cand CAGR <strong>{r.candCagr}%</strong></span>
                    <span>Pred. acc <strong>{r.predAcc}%</strong></span>
                    <span>OOS days <strong>{r.days}</strong></span>
                  </div>
                  <div className="ll-hrun-full mono">{r.ts}</div>
                </div>
              )}
            </div>
          ))}
      </section>

      {/* version registry */}
      <section className="pm-card">
        <div className="pm-card-head"><div className="pm-card-eyebrow">Model version registry</div>{versions.length > 0 && <button className="pm-link" style={{ color: "var(--muted)" }} onClick={() => { setVersions([]); saveVersions([]); }}>Clear</button>}</div>
        {applyFlash && (
          <div className="ll-applyflash" style={{ borderColor: accent, background: accent + "12" }}>
            <span className="ll-applyflash-ico" style={{ background: accent }}>{applyFlash.version ? "\u26a1" : "\u21ba"}</span>
            <span>{applyFlash.msg}</span>
          </div>
        )}
        {window.HelmConfig && window.HelmConfig.isActive() && (() => {
          const cfg = window.HelmConfig.get(); const nR = (cfg.rules || []).length;
          return (
            <div className="ll-live-applied" data-tick={cfgTick}>
              <span className="ll-live-dot" />
              <span className="ll-live-txt">Live engine running an <strong>applied edit</strong> — {cfg.meta && cfg.meta.version ? cfg.meta.version : "custom"} · {nR} rule{nR === 1 ? "" : "s"} active{cfg.meta && cfg.meta.date ? " · since " + cfg.meta.date : ""}. Screener, Tracker, Cockpit &amp; Simulation all run this engine now.</span>
              <button className="ll-reset" onClick={resetEngine}>Reset to baseline</button>
            </div>
          );
        })()}
        <div className="ll-vrow ll-vbase">
          <span className="ll-vnum">v0.1.0</span><span className="ll-vstatus" style={{ background: accent + "1a", color: accent }}>● base</span>
          <span className="ll-vchange">Current production model — signalsFor() as deployed</span>
          {appliedVersion ? <button className="ll-vapply ll-vreset" onClick={resetEngine}>Revert to this</button>
            : <span className="ll-vlive" style={{ color: accent }}>● live now</span>}
        </div>
        {versions.length === 0
          ? <div className="ll-empty">No candidate versions yet. Run a walk-forward and promote an accepted candidate to register it here.</div>
          : versions.map((v, vi) => {
            const isLive = appliedVersion === v.num;
            return (
              <div className="ll-vrow" key={v.num + v.date + vi}>
                <span className="ll-vnum">{v.num}</span>
                <span className="ll-vstatus" style={{ background: (v.accepted ? llUP : llDN) + "1a", color: v.accepted ? llUP : llDN }}>● {v.status}</span>
                <span className="ll-vchange">{v.change} · Sharpe {llNum(v.sharpe)} · {v.date}</span>
                {isLive ? <span className="ll-vlive" style={{ color: accent }}>● live now</span>
                  : v.accepted && window.HelmConfig
                    ? <button className="ll-vapply" style={{ borderColor: accent, color: accent }} onClick={() => applyVersion(v)}>⚡ Apply</button>
                    : <span className="ll-vapply ll-vna">—</span>}
              </div>
            );
          })}
      </section>

      <div className="ll-foot">Research &amp; validation only — no real trades. Walk-forward with purged/embargo split (train on oldest 50%, embargo 28-day feature gap, test on remaining OOS) \u2014 kills look-ahead leakage from overlapping momentum/RSI windows. AI provider: set <span className="mono">window.helmAI</span> to use Opus/Gemini; falls back to Haiku, then a rule-based log.</div>
    </div>
  );
}

function LLTrackChart({ versions, field, kind, baseIdx, candIdx, accent, big }) {
  const W = 900, H = big ? 240 : 96, pad = big ? 30 : 14;
  const series = versions.map((v) => v[field]);
  let lo, hi, fmtAxis;
  if (kind === "acc") { lo = 0; hi = 100; fmtAxis = (v) => v.toFixed(0) + "%"; }
  else { const all = series.flat(); lo = Math.min(...all); hi = Math.max(...all); fmtAxis = (v) => ((v - 1) * 100).toFixed(0) + "%"; }
  const n = Math.max(...series.map((s) => s.length), 2);
  const x = (i) => pad + (i / (n - 1)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - pad * 2);
  const path = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} preserveAspectRatio="none">
      {big && [0, 0.5, 1].map((f) => { const v = lo + (hi - lo) * f; return <g key={f}><line x1={pad} y1={y(v)} x2={W - pad} y2={y(v)} stroke="currentColor" strokeOpacity="0.08" /><text x={pad - 4} y={y(v) + 3} textAnchor="end" style={{ fontSize: 9, fill: "var(--muted)" }} className="mono">{fmtAxis(v)}</text></g>; })}
      {kind === "acc" && <line x1={pad} y1={y(50)} x2={W - pad} y2={y(50)} stroke="currentColor" strokeOpacity="0.12" strokeDasharray="3 3" />}
      {versions.map((v, idx) => {
        const isCand = idx === candIdx, isBase = idx === baseIdx;
        const stroke = isCand ? accent : isBase ? "var(--ink-2)" : "var(--muted)";
        const op = isCand || isBase ? 1 : 0.25 + 0.45 * (idx / Math.max(versions.length - 1, 1));
        const w = isCand ? (big ? 2.2 : 2) : isBase ? (big ? 1.7 : 1.5) : (big ? 1 : 0.9);
        return <path key={v.label} d={path(v[field])} fill="none" stroke={stroke} strokeWidth={w} opacity={op} />;
      })}
    </svg>
  );
}

function LLTrackPanel({ title, sub, versions, field, kind, baseIdx, candIdx, accent, onZoom, active }) {
  const last = (a) => a[a.length - 1];
  const v0 = versions[0][field], cV = versions[candIdx][field]; // cumulative: latest vs raw v0.1.0 engine
  let delta, dColor;
  if (kind === "acc") { const d = last(cV) - last(v0); dColor = d >= 0 ? "#0e9f6e" : "#e02424"; delta = (d >= 0 ? "+" : "") + d.toFixed(0) + "pp"; }
  else { const d = (last(cV) - 1) * 100 - (last(v0) - 1) * 100; dColor = d >= 0 ? "#0e9f6e" : "#e02424"; delta = (d >= 0 ? "+" : "") + d.toFixed(1) + "pp"; }
  return (
    <button className={`ll-tp${active ? " active" : ""}`} onClick={onZoom} style={active ? { borderColor: accent } : {}}>
      <div className="ll-tp-head">
        <div><div className="ll-tp-title">{title}</div><div className="ll-tp-sub">{sub}</div></div>
        <div className="ll-tp-delta" style={{ color: dColor }} title="latest version vs raw v0.1.0 engine">{delta}</div>
      </div>
      <LLTrackChart versions={versions} field={field} kind={kind} baseIdx={baseIdx} candIdx={candIdx} accent={accent} big={false} />
      <div className="ll-tp-zoom">⤢ {versions.length} versions · vs v0.1.0</div>
    </button>
  );
}

function EquityCurve({ base, cand, accent }) {
  const W = 900, H = 220, pad = 30;
  const all = [...base, ...cand];
  const lo = Math.min(...all), hi = Math.max(...all);
  const n = Math.max(base.length, cand.length);
  const x = (i) => pad + (i / (n - 1)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - pad * 2);
  const path = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {[0, 0.5, 1].map((f) => { const v = lo + (hi - lo) * f; return <g key={f}><line x1={pad} y1={y(v)} x2={W - pad} y2={y(v)} stroke="currentColor" strokeOpacity="0.08" /><text x={pad - 4} y={y(v) + 3} textAnchor="end" style={{ fontSize: 9, fill: "var(--muted)" }} className="mono">{((v - 1) * 100).toFixed(0)}%</text></g>; })}
      <path d={path(base)} fill="none" stroke="var(--muted)" strokeWidth="1.6" />
      <path d={path(cand)} fill="none" stroke={accent} strokeWidth="2" />
    </svg>
  );
}

const LL_CSS = `
.ll { display: flex; flex-direction: column; gap: 16px; }
.ll-hero { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
.ll-hero-title { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; margin: 3px 0 8px; }
.ll-hero-sub { font-size: 13px; color: var(--ink-2); line-height: 1.55; max-width: 680px; }
.ll-hero-sub strong { color: var(--ink); }
.ll-hero-r { display: flex; flex-direction: column; gap: 10px; align-items: flex-end; flex: none; }
.ll-modes { display: inline-flex; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; }
.ll-univ { font: inherit; font-size: 12px; font-weight: 600; padding: 7px 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--panel-2); color: var(--ink); cursor: pointer; }
.ll-univ:disabled { opacity: 0.5; cursor: default; }
.ll-modes button { font: inherit; font-size: 12px; font-weight: 600; padding: 7px 12px; border: 0; border-right: 1px solid var(--line); background: var(--panel-2); color: var(--ink-2); cursor: pointer; }
.ll-modes button:last-child { border-right: 0; }
.ll-modes button:disabled { opacity: 0.5; cursor: default; }
.ll-run { font: inherit; font-size: 13px; font-weight: 700; color: #fff; border: 0; border-radius: 9px; padding: 10px 20px; cursor: pointer; white-space: nowrap; }
.ll-run.stop { background: #e02424; }
.ll-prog-row { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--ink-2); margin-bottom: 8px; }
.ll-prog { height: 8px; background: var(--line-2); border-radius: 5px; overflow: hidden; }
.ll-prog i { display: block; height: 100%; border-radius: 5px; transition: width .2s; }
.ll-banner { background: #fff4e6; border: 1px solid #f0b87a; color: #92651f; font-size: 13px; padding: 12px 16px; border-radius: 10px; }
.ll-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }
.ll-tickers { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 14px; }
.ll-tickers-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-right: 4px; }
.ll-tk { font-family: var(--mono); font-size: 11.5px; font-weight: 600; color: var(--ink-2); background: var(--panel-2); border: 1px solid var(--line); padding: 3px 9px; border-radius: 6px; }
.ll-verdict { font-family: var(--mono); font-size: 12px; font-weight: 700; padding: 6px 13px; border-radius: 99px; }
.ll-verdict.accept { background: color-mix(in srgb, #0e9f6e 14%, transparent); color: #0e9f6e; }
.ll-verdict.reject { background: color-mix(in srgb, #e02424 12%, transparent); color: #e02424; }
.ll-table td, .ll-table th { padding: 9px 12px; }
.ll-k { font-weight: 600; color: var(--ink-2); }
.ll-legend { display: flex; gap: 18px; justify-content: center; margin-top: 8px; font-size: 11.5px; color: var(--muted); }
.ll-rule { display: flex; align-items: center; gap: 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 11px; padding: 11px 16px; flex-wrap: wrap; }
.ll-rule-tag { color: #fff; font-family: var(--mono); font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px; white-space: nowrap; }
.ll-rule-name { font-size: 13.5px; font-weight: 700; }
.ll-rule-kind { font-size: 11px; font-weight: 700; font-family: var(--mono); white-space: nowrap; }
.ll-rule-desc { font-size: 12.5px; color: var(--ink-2); }
.ll-track-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.ll-tp { text-align: left; background: var(--panel-2); border: 1px solid var(--line); border-radius: 11px; padding: 12px 12px 8px; cursor: pointer; font: inherit; display: flex; flex-direction: column; gap: 6px; position: relative; transition: border-color .15s; }
.ll-tp:hover { border-color: var(--ink-2); }
.ll-tp.active { border-width: 2px; }
.ll-tp-head { display: flex; justify-content: space-between; align-items: flex-start; }
.ll-tp-title { font-size: 13px; font-weight: 700; }
.ll-tp-sub { font-size: 11px; color: var(--muted); }
.ll-tp-delta { font-family: var(--mono); font-size: 13px; font-weight: 700; }
.ll-tp-zoom { font-size: 10px; color: var(--muted); text-align: right; }
.ll-track-zoom { margin-top: 16px; border-top: 1px solid var(--line); padding-top: 14px; }
.ll-track-zoom-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 700; margin-bottom: 8px; }
.ll-track-vlegend { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; margin-top: 10px; font-size: 11px; color: var(--muted); }
.ll-track-vlegend i { display: inline-block; width: 13px; height: 3px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
.ll-zoom-x { font: inherit; font-size: 12px; font-weight: 600; color: var(--muted); background: none; border: 0; cursor: pointer; }
@media (max-width: 720px) { .ll-track-strip { grid-template-columns: 1fr; } }
.ll-legend i { display: inline-block; width: 14px; height: 3px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
.ll-gates { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
.ll-mix { font-size: 11.5px; color: var(--muted); white-space: nowrap; }
.ll-sugg { display: flex; flex-direction: column; gap: 2px; }
.ll-sugg-row { display: grid; grid-template-columns: 70px 1fr 160px 52px; gap: 12px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--line-2); }
.ll-sugg-row:last-child { border-bottom: 0; }
.ll-sugg-tk { font-weight: 700; font-size: 13px; }
.ll-sugg-sec { font-size: 12px; color: var(--muted); }
.ll-sugg-bar { height: 7px; background: var(--line-2); border-radius: 4px; overflow: hidden; }
.ll-sugg-bar i { display: block; height: 100%; border-radius: 4px; }
.ll-sugg-w { font-size: 12.5px; font-weight: 600; text-align: right; }
.ll-gate { display: flex; align-items: center; gap: 9px; font-size: 12.5px; color: var(--ink-2); border: 1px solid var(--line); border-radius: 9px; padding: 10px 13px; }
.ll-gate-ico { font-weight: 700; font-size: 14px; }
.ll-ai-tag { color: var(--muted); font-weight: 400; text-transform: none; letter-spacing: 0; }
.ll-promote { font: inherit; font-size: 12px; font-weight: 600; background: none; border: 1px solid; border-radius: 8px; padding: 7px 13px; cursor: pointer; }
.ll-loghdr-btns { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ll-apply { font: inherit; font-size: 12px; font-weight: 700; color: #fff; border: 1px solid; border-radius: 8px; padding: 7px 13px; cursor: pointer; }
.ll-apply-live { font-size: 12px; font-weight: 700; border: 1px solid; border-radius: 8px; padding: 7px 13px; background: color-mix(in srgb, currentColor 8%, white); }
.ll-live-applied { display: flex; align-items: center; gap: 11px; background: color-mix(in srgb, #0e9f6e 7%, white); border: 1px solid color-mix(in srgb, #0e9f6e 30%, var(--line)); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; font-size: 12.5px; color: var(--ink-2); }
.ll-live-txt { flex: 1; line-height: 1.45; } .ll-live-txt strong { color: var(--ink); }
.ll-live-dot { width: 9px; height: 9px; border-radius: 50%; background: #0e9f6e; flex: none; box-shadow: 0 0 0 3px color-mix(in srgb, #0e9f6e 20%, transparent); }
.ll-reset { font: inherit; font-size: 11.5px; font-weight: 600; color: var(--ink-2); background: var(--panel); border: 1px solid var(--line); border-radius: 7px; padding: 6px 11px; cursor: pointer; flex: none; }
.ll-reset:hover { border-color: #e02424; color: #e02424; }
.ll-log { font-family: var(--mono); font-size: 12px; line-height: 1.6; color: var(--ink-2); white-space: pre-wrap; background: var(--panel-2); border: 1px solid var(--line); border-radius: 9px; padding: 14px 16px; margin: 0; }
.ll-vrow { display: grid; grid-template-columns: 70px 110px 1fr auto; gap: 12px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--line-2); font-size: 12.5px; }
.ll-vrow:last-child { border-bottom: 0; }
.ll-vbase { border-bottom: 1px solid var(--line); }
.ll-vnum { font-family: var(--mono); font-weight: 700; }
.ll-vstatus { font-size: 10.5px; font-weight: 600; padding: 2px 9px; border-radius: 99px; text-align: center; }
.ll-vchange { color: var(--ink-2); }
.ll-vapply { font: inherit; font-size: 11.5px; font-weight: 700; background: var(--panel); border: 1px solid; border-radius: 7px; padding: 5px 12px; cursor: pointer; white-space: nowrap; }
.ll-vapply:hover { filter: brightness(0.97); }
.ll-vreset { border-color: var(--line); color: var(--muted); font-weight: 600; }
.ll-vreset:hover { border-color: #e02424; color: #e02424; }
.ll-vlive { font-size: 11.5px; font-weight: 700; white-space: nowrap; padding: 5px 4px; }
.ll-vna { border: 0; color: var(--muted); cursor: default; padding: 5px 12px; }
.ll-vna:hover { filter: none; }
.ll-applyflash { display: flex; align-items: center; gap: 11px; border: 1px solid; border-radius: 10px; padding: 11px 14px; margin-bottom: 12px; font-size: 12.5px; font-weight: 600; color: var(--ink); animation: llflash 0.25s ease; }
.ll-applyflash-ico { width: 22px; height: 22px; border-radius: 50%; color: #fff; display: grid; place-items: center; font-size: 12px; flex: none; }
@keyframes llflash { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.ll-empty { font-size: 13px; color: var(--muted); padding: 14px 0; }
.ll-hrun { border-bottom: 1px solid var(--line-2); }
.ll-hrun:last-child { border-bottom: 0; }
.ll-hrun-head { display: grid; grid-template-columns: 20px 130px 1fr auto auto; gap: 12px; align-items: center; width: 100%; text-align: left; background: none; border: 0; padding: 11px 0; cursor: pointer; font: inherit; }
.ll-hrun-head:hover { background: var(--panel-2); }
.ll-hrun-exp { font-family: var(--mono); font-size: 15px; font-weight: 700; color: var(--muted); }
.ll-hrun-ts { font-size: 12px; color: var(--ink-2); }
.ll-hrun-univ { font-size: 13px; font-weight: 600; color: var(--ink); }
.ll-hrun-meta { font-size: 11.5px; color: var(--muted); }
.ll-hrun-v { font-family: var(--mono); font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 99px; white-space: nowrap; }
.ll-hrun-v.accept { background: color-mix(in srgb, #0e9f6e 14%, transparent); color: #0e9f6e; }
.ll-hrun-v.reject { background: color-mix(in srgb, #e02424 12%, transparent); color: #e02424; }
.ll-hrun-detail { padding: 4px 0 14px 32px; display: flex; flex-direction: column; gap: 10px; }
.ll-hrun-tks { display: flex; flex-wrap: wrap; gap: 5px; }
.ll-hrun-kpis { display: flex; flex-wrap: wrap; gap: 16px; font-size: 12px; color: var(--ink-2); }
.ll-hrun-kpis strong { color: var(--ink); font-family: var(--mono); }
.ll-hrun-full { font-size: 10.5px; color: var(--muted); }
.ll-foot { font-size: 11.5px; color: var(--muted); line-height: 1.5; }
@media (max-width: 820px) { .ll-hero { flex-direction: column; } .ll-hero-r { align-items: flex-start; } }
`;

window.LearningLab = LearningLab;
// Phase 1b: publish the rule library as an id→apply map so signalsFor() can run APPROVED
// candidate rules against the live engine (engineconfig.js holds which ids are active).
window.HelmCandidateRules = CANDIDATE_RULES.reduce((m, r) => { m[r.id] = r.apply; return m; }, {});
// …and the metadata (name/desc/kind) so the Night Loop can explain what it proposes.
window.HelmCandidateRuleMeta = CANDIDATE_RULES.reduce((m, r) => { m[r.id] = { name: r.name, desc: r.desc, kind: r.kind }; return m; }, {});
