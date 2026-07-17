// papersim.jsx — Portfolio Simulation: a fictive book you run yourself.
// The engine proposes trades (via window.signalsFor); YOU accept or reject each, per account.
// Accepted trades become paper positions, marked daily against live/last prices. Every decision
// is logged so we can SEE whether your judgement (accept/reject) beats the raw model — the real
// feedback loop for improving portfolio propositions. Persists in localStorage. No real orders.
const { useState: usePsState, useEffect: usePsEffect } = React;

const psUP = "#0e9f6e",psDN = "#e02424",psWARN = "#d97706";
const PS_KEY = "helm_papersim_v1";
const psMoney = (n) => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const psPct = (n, dp = 1) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(dp) + "%";
const psToday = () => new Date().toISOString().slice(0, 10);

function psLoad() {try {return JSON.parse(localStorage.getItem(PS_KEY) || "null");} catch (e) {return null;}}
function psSave(s) {try {localStorage.setItem(PS_KEY, JSON.stringify(s));} catch (e) {}}

function psAccts() {return (window.PMData && window.PMData.accounts || []).filter((a) => a.id);}
// per-account starting paper cash (segregated) — mirrors the REAL account cash so the
// simulated book starts in sync with reality (TFSA CAD 32k, RRSP CAD 50k, rest 0).
function psFreshCash() {
  const accts = psAccts();
  const cash = {};
  accts.forEach((a) => {cash[a.id] = typeof a.cash === "number" ? a.cash : 0;});
  return cash;
}
function psFresh() {
  const cash = psFreshCash();
  const startCapital = Object.values(cash).reduce((a, b) => a + b, 0) || 100000;
  return { started: psToday(), startCapital, cash, positions: [], log: [], decisions: { accepted: 0, rejected: 0 }, snapshots: [], startReal: 0 };
}

// Tickers where the live feed would return the WRONG price — skip feed lookup, use seed price:
// ASML = Canadian Depositary Receipt on NEO (~$54 CAD) ≠ NASDAQ ASML (~$950 USD)
// X    = TMX Group on TSX (~$47 CAD)               ≠ US Steel (NYSE X)
const PS_NO_FEED = new Set(['ASML', 'X']);

// current price for a ticker: prefer live feed, else universe seed, else position entry
function psPrice(ticker, fallback) {
  if (PS_NO_FEED.has(ticker)) return typeof fallback === 'number' ? fallback : 0;
  const F = window.HelmFeed;
  if (F && F.prices) {const p = Array.isArray(F.prices) ? null : F.prices[ticker];if (p && typeof p.c === "number") return p.c;if (typeof p === "number") return p;}
  const U = window.HelmUniverse || [];
  const u = U.find((x) => (x[0] || x.ticker) === ticker);
  if (u) return Array.isArray(u) ? u[4] : u.price;
  return fallback || 0;
}

function PaperSim({ accent, initialTab, account }) {
  const D = window.PMData;
  const selAcct = account && account !== "all" ? account : null;
  const [s, setS] = usePsState(() => {
    const loaded = psLoad();
    if (!loaded) return psFresh();
    // migrate old single-number cash → per-account
    if (typeof loaded.cash === "number") {
      const accts = psAccts();const per = accts.length ? Math.round(loaded.cash / accts.length) : loaded.cash;
      const cash = {};accts.forEach((a) => {cash[a.id] = per;});loaded.cash = cash;
    }
    if (loaded.startReal == null) loaded.startReal = 0;
    // non-destructive re-sync: if the user hasn't traded yet, adopt the current real-account cash
    const untouched = (!loaded.positions || loaded.positions.length === 0) && (!loaded.decisions || loaded.decisions.accepted === 0 && loaded.decisions.rejected === 0);
    if (untouched && loaded.cashSync !== 2) {
      loaded.cash = psFreshCash();
      loaded.startCapital = Object.values(loaded.cash).reduce((a, b) => a + b, 0);
      loaded.startReal = 0;
      loaded.cashSync = 2;
    }
    // heal an obviously-wrong Twin baseline (e.g. startReal set to the small paper capital instead of real net worth)
    const realNow = window.PMData && window.PMData.buildView ? window.PMData.buildView("all").kpis.equity || 0 : 0;
    if (realNow > 0 && loaded.startReal > 0) {
      const ratio = loaded.startReal / realNow;
      if (ratio < 0.5 || ratio > 2) loaded.startReal = Math.round(realNow); // baseline off by >2x → re-anchor to real
    }
    // heal empty snapshots (e.g. left empty by an older sync) — seed today so the Twin chart isn't blank/crashing
    if (loaded.startReal > 0 && (!loaded.snapshots || loaded.snapshots.length === 0)) {
      const cap = loaded.startCapital || 0;
      loaded.snapshots = [{ date: psToday(), value: Math.round(cap), ret: 0, real: Math.round(realNow || loaded.startReal) }];
    }
    return loaded;
  });
  const [risk, setRisk] = usePsState("balanced");
  const [horizon, setHorizon] = usePsState("position");
  const [tab, setTab] = usePsState(initialTab || "book"); // book | propose | twin | log
  const [showFlow, setShowFlow] = usePsState(false);
  const [flash, setFlash] = usePsState(null);
  const [xfer, setXfer] = usePsState(null); // {from,to,amt} when transfer modal open
  const [mbuy, setMbuy] = usePsState(null); // {ticker,acct,dollars} when manual-buy modal open
  usePsEffect(() => {psSave(s);}, [s]);

  const cfg = (window.helmPresetCfg ? window.helmPresetCfg(risk) : {}) || {};
  cfg.horizon = horizon;

  // display currency (CAD by default) + FX so the paper book matches the real book's CAD totals
  const psFx = D.getFx ? D.getFx() : 1.4174;
  const psDisp = D.getDispCcy ? D.getDispCcy() : "CAD";
  const acctCcyOfId = (id) => { const a = (D.accounts || []).find((x) => x.id === id); return a ? a.ccy : "CAD"; };
  const toDisp = (v, ccy) => { ccy = ccy || "CAD"; if (ccy === psDisp) return v; if (ccy === "USD" && psDisp === "CAD") return v * psFx; if (ccy === "CAD" && psDisp === "USD") return v / psFx; return v; };
  const posCcy = (p) => p.ccy || acctCcyOfId(p.acct);

  // ---- proposals: market Buys (not held) + REBALANCE trims/exits on held positions ----
  const heldTickers = new Set(s.positions.map((p) => p.ticker));
  const U = window.HelmUniverse || [];
  const buyProps = U.map((u) => {
    const h = Array.isArray(u) ? { ticker: u[0], name: u[1], market: u[2], sector: u[3], price: u[4], divYield: u[5], spark: [100, 103, 101, 106, 104, 109] } : u;
    const sig = window.signalsFor ? window.signalsFor(h, cfg) : null;
    return { h, sig, kind: "buy" };
  }).filter((x) => x.sig && x.sig.action === "Buy" && !heldTickers.has(x.h.ticker)).
  sort((a, b) => b.sig.composite - a.sig.composite).
  slice(0, 12);
  // held positions the engine now rates Sell/Trim → propose to lighten/exit (reshuffle)
  const sellProps = s.positions.map((p) => {
    const px = psPrice(p.ticker, p.entry);
    const sig = window.signalsFor ? window.signalsFor({ ticker: p.ticker, name: p.name, market: p.ccy === "USD" ? "US" : "CA", sector: p.sector, price: px, divYield: 0, spark: [100, 103, 101, 106, 104, 109] }, cfg) : null;
    return { h: { ...p, price: px }, sig, kind: sig && sig.sellKind === "Exit" ? "exit" : "trim", pos: p };
  }).filter((x) => x.sig && x.sig.action === "Sell");
  let proposals = [...sellProps, ...buyProps];

  // ---- mark the book (all values converted to display ccy so totals match the real book) ----
  const marked = s.positions.map((p) => {
    // fromReal positions mark at the SAME price the real book uses (h.price) so paper stays in sync;
    // manual buys mark to the live feed via psPrice.
    const realH = p.fromReal ? (D.allHoldings || []).find((x) => x.ticker === p.ticker && x.acct === p.acct) : null;
    const pxNative = realH ? realH.price : psPrice(p.ticker, p.seedPx != null ? p.seedPx : p.entry);
    const ccy = posCcy(p);
    const px = toDisp(pxNative, ccy);
    const value = px * p.shares;
    const cost = toDisp(p.entry, ccy) * p.shares;
    const pl = value - cost;
    const plPct = cost ? pl / cost * 100 : 0;
    const sig = window.signalsFor ? window.signalsFor({ ticker: p.ticker, name: p.name, sector: p.sector, price: pxNative, divYield: 0, spark: [100, 103, 101, 106, 104, 109] }, cfg) : null;
    return { ...p, px, value, cost, pl, plPct, sig };
  });
  const cashByAcct = s.cash || {};
  const totalCash = Object.keys(cashByAcct).reduce((a, id) => a + toDisp(cashByAcct[id] || 0, acctCcyOfId(id)), 0);
  const bookValue = marked.reduce((a, p) => a + p.value, 0);
  const totalValue = totalCash + bookValue;
  const totalCost = marked.reduce((a, p) => a + p.cost, 0);
  const totalPL = bookValue - totalCost;
  const totalRet = (totalValue - s.startCapital) / s.startCapital * 100;
  // diversification of the ACTUAL paper book (by current market value)
  const bookDiv = bookValue > 0 && marked.length && window.helmConstruct ?
  window.helmConstruct(marked.map((p) => ({ ticker: p.ticker, sector: p.sector, score: Math.max(1, p.value) })), { maxName: 1, maxSector: 1 }).div :
  null;

  const realNetWorth = (D.buildView ? D.buildView("all").kpis.equity : 0) || 0;
  // ---- auto daily snapshot + capture the real-book baseline once (no manual button) ----
  usePsEffect(() => {
    const today = psToday();
    setS((st) => {
      let n = st;
      if (!st.startReal && realNetWorth > 0) n = { ...n, startReal: Math.round(realNetWorth) };
      if (!n.snapshots.some((x) => x.date === today)) {
        n = { ...n, snapshots: [{ date: today, value: Math.round(totalValue), ret: +totalRet.toFixed(2), real: Math.round(realNetWorth) }, ...n.snapshots.filter((x) => x.date !== today)].slice(0, 180) };
      }
      return n === st ? st : n;
    });
    // eslint-disable-next-line
  }, []);
  // ---- "Would AI have done better?" — Twin (your accepted book) vs real, from the sim's start ----
  const snaps = (s.snapshots || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const withReal = snaps.filter((x) => typeof x.real === "number" && x.real > 0);
  let twin = null;
  if (s.startReal > 0) {
    const twinRet = totalRet; // Twin since start (paper book)
    const realRet = (realNetWorth - s.startReal) / s.startReal * 100; // real book since start
    const addedPct = twinRet - realRet;
    // added value in $ on a CONSISTENT base (the Twin's own capital), not the real book's denominator
    const addedDollars = s.startCapital * (addedPct / 100);
    const verdict = addedPct > 0.3 ? "YES" : addedPct < -0.3 ? "NO" : "TIE";
    const days = Math.round((Date.now() - new Date(s.started).getTime()) / 86400000);
    twin = { days, twinRet, realRet, addedPct, addedDollars, verdict, n: withReal.length, series: withReal };
  }
  const acctName = (id) => {const a = (D.accounts || []).find((x) => x.id === id);return a ? a.name : id;};
  const accounts = (D.accounts || []).filter((a) => a.id);
  const acctCcyOf = (id) => {const a = (D.accounts || []).find((x) => x.id === id);return a ? a.ccy : "CAD";};
  const acctReg = (id) => {const a = (D.accounts || []).find((x) => x.id === id);return a ? a.reg : true;};
  // a direct coin (Crypto market, plain ticker) — NOT a crypto ETF like SOLQ/ETHX.B (those are registered-OK)
  const isDirectCoin = (h) => (h.market === "Crypto" || h.sector === "Crypto") && !/\.[A-Z]$|Q$|ETF/i.test(h.ticker || "") && (h.ticker || "").length <= 5 && !/\.(TO|B)$/.test(h.ticker || "");
  const assetCcy = (h) => h.market === "US" || h.market === "US-ETF" || h.market === "Crypto" || h.ccy === "USD" ? "USD" : "CAD";
  // which accounts may legally hold this asset?
  const eligibleAccts = (h) => {
    if (isDirectCoin(h)) return accounts.filter((a) => !a.reg).map((a) => a.id); // direct coins → non-registered only (Crypto Direct)
    const wantCcy = assetCcy(h);
    return accounts.filter((a) => a.ccy === wantCcy).map((a) => a.id); // USD assets → USD accounts, CAD → CAD
  };
  const routeAcct = (h) => {
    const elig = eligibleAccts(h);
    if (selAcct && elig.includes(selAcct)) return selAcct;
    const funded = elig.find((id) => (cashByAcct[id] || 0) > 0);
    if (funded) return funded;
    if (elig.length) return elig.slice().sort((a, b) => (cashByAcct[b] || 0) - (cashByAcct[a] || 0))[0];
    const best = accounts.slice().sort((a, b) => (cashByAcct[b.id] || 0) - (cashByAcct[a.id] || 0))[0];
    return best ? best.id : "celi-cad";
  };

  // when a specific account is selected, show only proposals that can legally route there
  if (selAcct) proposals = proposals.filter((p) => p.pos ? p.pos.acct === selAcct : (eligibleAccts(p.h) || []).includes(selAcct));

  // resolve a security by ticker: universe seed → real holding → typed unknown (infer ccy from suffix)
  function resolveSec(t) {
    t = (t || "").trim().toUpperCase();
    if (!t) return null;
    const U = window.HelmUniverse || [];
    const u = U.find((x) => (Array.isArray(x) ? x[0] : x.ticker || "").toUpperCase() === t);
    if (u) return Array.isArray(u) ? { ticker: u[0], name: u[1], market: u[2], sector: u[3], price: u[4], divYield: u[5], spark: [100, 103, 101, 106, 104, 109] } : u;
    const h = (D.allHoldings || []).find((x) => (x.ticker || "").toUpperCase() === t);
    if (h) return { ticker: h.ticker, name: h.name, market: h.ccy === "USD" ? "US" : "CA", sector: h.sector, price: psPrice(h.ticker, h.price), ccy: h.ccy, spark: [100, 103, 101, 106, 104, 109] };
    const ca = /\.(TO|V|UN)$|\.B$/i.test(t);
    return { ticker: t, name: t, market: ca ? "CA" : "US", sector: "\u2014", price: psPrice(t, 100), ccy: ca ? "CAD" : "USD", spark: [100, 103, 101, 106, 104, 109] };
  }
  // tickers offered in the manual-buy datalist (universe + real holdings + current paper book)
  const buyMenu = (() => {
    const seen = {}, out = [];
    (window.HelmUniverse || []).forEach((u) => { const t = Array.isArray(u) ? u[0] : u.ticker; const n = Array.isArray(u) ? u[1] : u.name; if (t && !seen[t]) { seen[t] = 1; out.push([t, n]); } });
    (D.allHoldings || []).forEach((h) => { if (h.ticker && !seen[h.ticker]) { seen[h.ticker] = 1; out.push([h.ticker, h.name]); } });
    return out;
  })();
  function manualBuy(tickerRaw, acct, dollars) {
    const sec = resolveSec(tickerRaw);
    if (!sec) { setFlash({ t: "Enter a ticker.", bad: true }); return; }
    const elig = eligibleAccts(sec);
    if (!elig.includes(acct)) { setFlash({ t: `${acctName(acct)} can't hold ${sec.ticker} \u2014 ${isDirectCoin(sec) ? "direct crypto \u2192 Crypto account only" : assetCcy(sec) + " asset \u2192 " + assetCcy(sec) + " account only"}.`, bad: true }); return; }
    const amt = +dollars;
    if (!amt || amt <= 0) { setFlash({ t: "Enter a dollar amount.", bad: true }); return; }
    const px = sec.price;
    const avail = s.cash && s.cash[acct] || 0;
    const shares = Math.max(1, Math.floor(amt / px));
    const spend = shares * px;
    if (spend > avail) { setFlash({ t: `Not enough cash in ${acctName(acct)} (${psMoney(avail)}).`, bad: true }); return; }
    setS((st) => {
      const existing = st.positions.find((p) => p.ticker === sec.ticker && p.acct === acct);
      let positions;
      if (existing) {
        const tot = existing.shares + shares;
        const avg = (existing.entry * existing.shares + px * shares) / tot;
        positions = st.positions.map((p) => p === existing ? { ...p, shares: tot, entry: avg } : p);
      } else {
        positions = [...st.positions, { id: sec.ticker + "\u00b7" + Date.now(), ticker: sec.ticker, name: sec.name, sector: sec.sector, shares, entry: px, acct, date: psToday(), horizon: "", manual: true }];
      }
      return {
        ...st, positions,
        cash: { ...st.cash, [acct]: (st.cash[acct] || 0) - spend },
        log: [{ date: psToday(), ts: Date.now(), kind: "manual", ticker: sec.ticker, shares, price: px, acct, note: "Manual buy " + shares + " @ " + psMoney(px) }, ...st.log].slice(0, 200),
        decisions: { ...st.decisions, accepted: (st.decisions.accepted || 0) + 1 }
      };
    });
    setFlash({ t: "Bought " + shares + " " + sec.ticker + " in " + acctName(acct), bad: false });
    setMbuy(null);
  }

  // ---- actions ----
  function accept(prop, acct, dollars) {
    const px = prop.h.price;
    const avail = s.cash && s.cash[acct] || 0;
    const shares = Math.max(1, Math.floor(dollars / px));
    const spend = shares * px;
    if (spend > avail) {setFlash({ t: `Not enough cash in ${acctName(acct)} (${psMoney(avail)}). Cash can't move between accounts.`, bad: true });return;}
    // ---- IPS enforcement (Phase 1c): check the proposal against the enforced policy ----
    let ipsWarn = null;
    if (window.HelmIPS) {
      const acctObj = (D.accounts || []).find((a) => a.id === acct);
      const existingVal = s.positions.filter((p) => p.ticker === prop.h.ticker).reduce((a, p) => a + p.shares * psPrice(p.ticker, p.entry), 0);
      const chk = window.HelmIPS.checkTrade({
        ticker: prop.h.ticker, sector: prop.h.sector, market: prop.h.market, action: "buy",
        amount: spend, acct, equity: totalValue || 1,
        curWeightPct: totalValue ? (existingVal / totalValue) * 100 : 0,
        reg: acctObj ? acctObj.reg : false, ccy: acctObj ? acctObj.ccy : undefined, assetCcy: assetCcy(prop.h),
      });
      if (chk.hardBlock) { setFlash({ t: "Blocked by policy — " + chk.note, bad: true }); return; }
      if (chk.blocking) {
        if (!window.confirm("Off-policy trade (Confirm mode)\n\n" + chk.note + "\n\nProceed anyway?")) {
          setFlash({ t: "Held back — off-policy: " + chk.note, bad: false }); return;
        }
      }
      if (chk.breaches.length) ipsWarn = chk.breaches[0].msg;
    }
    setS((st) => ({
      ...st,
      cash: { ...st.cash, [acct]: (st.cash[acct] || 0) - spend },
      positions: [...st.positions, { id: prop.h.ticker + "·" + Date.now(), ticker: prop.h.ticker, name: prop.h.name, sector: prop.h.sector, shares, entry: px, acct, date: psToday(), horizon: window.helmTradeHorizon ? window.helmTradeHorizon(prop.sig).tag : "" }],
      log: [{ date: psToday(), ts: Date.now(), kind: "accept", ticker: prop.h.ticker, shares, price: px, acct, score: prop.sig.composite, regime: window.HelmRegime ? window.HelmRegime.label : null, ips: ipsWarn || undefined, note: "Bought " + shares + " @ " + psMoney(px) }, ...st.log].slice(0, 200),
      decisions: { ...st.decisions, accepted: st.decisions.accepted + 1 }
    }));
    setFlash({ t: (ipsWarn ? "⚠ Accepted off-policy — " : "Accepted ") + prop.h.ticker + " · " + shares + " sh in " + acctName(acct), bad: false });
  }
  function reject(prop) {
    setS((st) => ({
      ...st,
      log: [{ date: psToday(), ts: Date.now(), kind: "reject", ticker: prop.h.ticker, price: prop.h.price, score: prop.sig.composite, regime: window.HelmRegime ? window.HelmRegime.label : null, note: "Passed on a Buy (score " + prop.sig.composite + ")", entryRef: prop.h.price }, ...st.log].slice(0, 200),
      decisions: { ...st.decisions, rejected: st.decisions.rejected + 1 }
    }));
    setFlash({ t: "Rejected " + prop.h.ticker + " — logged for learning", bad: false });
  }
  function sell(pos) {
    setS((st) => ({
      ...st,
      cash: { ...st.cash, [pos.acct]: (st.cash[pos.acct] || 0) + pos.value },
      positions: st.positions.filter((p) => p.id !== pos.id),
      log: [{ date: psToday(), ts: Date.now(), kind: "sell", ticker: pos.ticker, shares: pos.shares, price: pos.px, acct: pos.acct, pl: pos.pl, note: "Sold all " + pos.shares + " @ " + psMoney(pos.px) + " · P&L " + psMoney(pos.pl) }, ...st.log].slice(0, 200)
    }));
    setFlash({ t: "Sold " + pos.ticker + " · realized " + psMoney(pos.pl), bad: pos.pl < 0 });
  }
  function trim(pos) {
    const sellShares = Math.max(1, Math.floor(pos.shares * 0.33));
    if (sellShares >= pos.shares) return sell(pos);
    const proceeds = sellShares * pos.px;
    const realized = (pos.px - pos.entry) * sellShares;
    setS((st) => ({
      ...st,
      cash: { ...st.cash, [pos.acct]: (st.cash[pos.acct] || 0) + proceeds },
      positions: st.positions.map((p) => p.id === pos.id ? { ...p, shares: p.shares - sellShares } : p),
      log: [{ date: psToday(), ts: Date.now(), kind: "trim", ticker: pos.ticker, shares: sellShares, price: pos.px, acct: pos.acct, pl: realized, note: "Trimmed " + sellShares + " of " + pos.shares + " (kept " + (pos.shares - sellShares) + ") · P&L " + psMoney(realized) }, ...st.log].slice(0, 200)
    }));
    setFlash({ t: "Trimmed " + pos.ticker + " · sold " + sellShares + ", kept " + (pos.shares - sellShares), bad: false });
  }
  function setAcctCapital(acct) {
    const cur = s.cash && s.cash[acct] || 0;
    const v = parseInt(prompt(`Paper cash for ${acctName(acct)} ($):`, String(Math.round(cur))), 10);
    if (!isNaN(v) && v >= 0) setS((st) => {const cash = { ...st.cash, [acct]: v };return { ...st, cash, startCapital: Object.values(cash).reduce((a, b) => a + b, 0) + st.positions.reduce((a, p) => a + p.entry * p.shares, 0) };});
  }
  const psFamily = (id) => (id || "").split("-")[0]; // reer / celi / crypto
  function realPositions() {
    return (D.allHoldings || []).map((h, i) => ({
      id: h.ticker + "·" + h.acct + "·real" + i, ticker: h.ticker, name: h.name, sector: h.sector,
      shares: h.shares, entry: h.avgCost, seedPx: h.price, acct: h.acct, ccy: h.ccy, date: psToday(),
      fromReal: true
    }));
  }
  function syncCash() {
    const fresh = psFreshCash();
    const pos = realPositions();
    const cap0 = Object.keys(fresh).reduce((a, id) => a + toDisp(fresh[id] || 0, acctCcyOfId(id)), 0)
      + pos.reduce((a, p) => { const rh = (D.allHoldings || []).find((x) => x.ticker === p.ticker && x.acct === p.acct); return a + toDisp(rh ? rh.price : (p.seedPx != null ? p.seedPx : p.entry), p.ccy) * p.shares; }, 0);
    setS((st) => ({ ...st, cash: fresh, positions: pos, startReal: Math.round(realNetWorth), startCapital: cap0, snapshots: [{ date: psToday(), value: Math.round(cap0), ret: 0, real: Math.round(realNetWorth) }], log: [{ date: psToday(), ts: Date.now(), kind: "transfer", ticker: "CASH", note: `Synced to real: ${pos.length} positions + cash baseline` }, ...st.log].slice(0, 200) }));
    setFlash({ t: `Synced to your real portfolio — ${pos.length} positions and cash imported.`, bad: false });
  }
  function startFresh() {
    const f = psFresh();f.startReal = Math.round(realNetWorth);
    setS(f);
    setFlash({ t: "Clean book \u00b7 cash & baseline synced to real accounts. Ready to backtest.", bad: false });
  }
  // in-UI transfer (prompt() is blocked in the sandboxed preview) — same-plan only
  const acctCcy = (id) => {const a = (D.accounts || []).find((x) => x.id === id);return a ? a.ccy : "CAD";};
  function doTransfer(from, to, amt) {
    const avail = s.cash && s.cash[from] || 0;
    if (psFamily(from) !== psFamily(to)) {setFlash({ t: "Cash can't move across plan types (e.g. RRSP → TFSA).", bad: true });return;}
    if (!amt || amt <= 0) {setFlash({ t: "Enter an amount to transfer.", bad: true });return;}
    if (amt > avail) {setFlash({ t: `Only ${psMoney(avail)} available in ${acctName(from)}.`, bad: true });return;}
    // FX convert if currencies differ, then 1% conversion commission
    const fx = D.getFx ? D.getFx() : 1.4174; // USD→CAD
    const fromC = acctCcy(from),toC = acctCcy(to);
    let converted = amt;
    if (fromC !== toC) converted = fromC === "USD" ? amt * fx : amt / fx; // USD→CAD ×fx ; CAD→USD ÷fx
    const commission = fromC !== toC ? converted * 0.01 : 0;
    const credited = converted - commission;
    setS((st) => ({
      ...st,
      cash: { ...st.cash, [from]: (st.cash[from] || 0) - amt, [to]: (st.cash[to] || 0) + credited },
      log: [{ date: psToday(), ts: Date.now(), kind: "transfer", ticker: "CASH", acct: to, note: `${psMoney(amt)} ${fromC} ${acctName(from)} → ${psMoney(credited)} ${toC} ${acctName(to)}${fromC !== toC ? ` (FX ${fx.toFixed(4)}, 1% fee ${psMoney(commission)})` : ""}` }, ...st.log].slice(0, 200)
    }));
    setFlash({ t: fromC !== toC ? `Moved ${psMoney(amt)} ${fromC} → ${psMoney(credited)} ${toC} (FX + 1% fee)` : `Moved ${psMoney(amt)} ${acctName(from)} → ${acctName(to)}`, bad: false });
    setXfer(null);
  }
  function resetAll() {if (confirm("Reset the paper portfolio? All positions and logs are cleared.")) {const f = psFresh();setS(f);setFlash({ t: "Paper portfolio reset · per-account cash restored", bad: false });}}

  // ---- learning: did accepted names move up? did rejected names we passed on run away? ----
  const acceptedClosed = s.log.filter((l) => l.kind === "sell" || l.kind === "trim");
  const wins = acceptedClosed.filter((l) => (l.pl || 0) > 0).length;
  const realizedPL = acceptedClosed.reduce((a, l) => a + (l.pl || 0), 0);
  const rejects = s.log.filter((l) => l.kind === "reject");
  const rejectMissed = rejects.map((l) => {const now = psPrice(l.ticker, l.entryRef);const move = l.entryRef ? (now - l.entryRef) / l.entryRef * 100 : 0;return { ...l, move };});
  const rejectRanAway = rejectMissed.filter((r) => r.move > 5).length;
  const rejectDodged = rejectMissed.filter((r) => r.move < -5).length;

  return (
    <div className="ps">
      <style>{PS_CSS}</style>

      {/* hero / summary */}
      {flash && <div className={`ps-flash${flash.bad ? " bad" : ""}`}>{flash.t}</div>}

      {/* controls */}
      <section className="pm-card ps-controls" style={{ height: "84px" }}>
        <div className="ps-ctl-group">
          <span className="ps-ctl-label">Risk model</span>
          <div className="ps-seg">{["conservative", "balanced", "aggressive"].map((k) => <button key={k} className={risk === k ? "on" : ""} onClick={() => setRisk(k)} style={risk === k ? { background: accent, borderColor: accent, color: "#fff" } : {}}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>
        </div>
        <div className="ps-ctl-group">
          <span className="ps-ctl-label">Horizon</span>
          <div className="ps-seg">{[["swing", "Swing"], ["position", "Position"], ["long", "Long-term"]].map(([k, l]) => <button key={k} className={horizon === k ? "on" : ""} onClick={() => setHorizon(k)} style={horizon === k ? { background: accent, borderColor: accent, color: "#fff" } : {}}>{l}</button>)}</div>
        </div>
        <div className="ps-ctl-actions">
          <span className="ps-autosnap" title="A daily snapshot of your Twin and real book is recorded automatically">● auto-snapshot daily</span>
          <button className="ps-btn ghost" onClick={startFresh}>Start fresh</button>
        </div>
      </section>

      {/* tabs + cash actions */}
      <div className="ps-tabs">
        <button className={tab === "book" ? "on" : ""} onClick={() => setTab("book")} style={tab === "book" ? { borderColor: accent, color: accent } : {}}>Portfolio <span className="ps-tab-n">{marked.length}</span></button>
        <button className={tab === "propose" ? "on" : ""} onClick={() => setTab("propose")} style={tab === "propose" ? { borderColor: accent, color: accent } : {}}>Propositions <span className="ps-tab-n">{proposals.length}</span></button>
        <button className={tab === "twin" ? "on" : ""} onClick={() => setTab("twin")} style={tab === "twin" ? { borderColor: accent, color: accent } : {}}>Would AI do better?</button>
        <button className={tab === "log" ? "on" : ""} onClick={() => setTab("log")} style={tab === "log" ? { borderColor: accent, color: accent } : {}}>Decision log <span className="ps-tab-n">{s.log.length}</span></button>
        <div className="ps-tabs-actions">
          <span className="ps-tabs-kpi">Value <strong>{psMoney(totalValue)}</strong></span>
          <span className="ps-tabs-kpi">Return <strong style={{ color: totalRet >= 0 ? psUP : psDN }}>{psPct(totalRet)}</strong></span>
          <span className="ps-tabs-kpi">P&amp;L <strong style={{ color: totalPL >= 0 ? psUP : psDN }}>{psMoney(totalPL)}</strong></span>
          <button className="ps-transfer-btn" onClick={syncCash} title="Set paper cash to match your real accounts (keeps positions)">↺ Sync to real</button>
          <button className="ps-transfer-btn" onClick={() => setMbuy({ ticker: "", acct: selAcct || (accounts[0] && accounts[0].id), dollars: "" })} title="Buy any ticker into an eligible account with available cash" style={{ borderColor: accent, color: accent }}>＋ Buy</button>
          <button className="ps-transfer-btn" onClick={() => {const fam = {};accounts.forEach((a) => {(fam[psFamily(a.id)] = fam[psFamily(a.id)] || []).push(a);});const g = Object.values(fam).find((x) => x.length > 1);setXfer(g ? { from: g[0].id, to: g[1].id, amt: 0 } : { from: accounts[0] && accounts[0].id, to: accounts[0] && accounts[0].id, amt: 0 });}}>⇄ Transfer cash</button>
        </div>
      </div>

      {xfer &&
      <div className="ps-xfer-modal" onClick={(e) => {if (e.target.className === "ps-xfer-modal") setXfer(null);}}>
          <div className="ps-xfer-card">
            <div className="ps-xfer-title">Transfer cash</div>
            <div className="ps-xfer-note">Cash moves only within the same plan (RRSP ↔ RRSP, TFSA ↔ TFSA).</div>
            <label className="ps-xfer-row"><span>From</span>
              <select value={xfer.from} onChange={(e) => setXfer({ ...xfer, from: e.target.value, to: (accounts.find((a) => psFamily(a.id) === psFamily(e.target.value) && a.id !== e.target.value) || {}).id || xfer.to })}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {psMoney(cashByAcct[a.id] || 0)}</option>)}
              </select>
            </label>
            <label className="ps-xfer-row"><span>To</span>
              <select value={xfer.to} onChange={(e) => setXfer({ ...xfer, to: e.target.value })}>
                {accounts.filter((a) => psFamily(a.id) === psFamily(xfer.from) && a.id !== xfer.from).map((a) => <option key={a.id} value={a.id}>{a.name} · {psMoney(cashByAcct[a.id] || 0)}</option>)}
              </select>
            </label>
            <label className="ps-xfer-row"><span>Amount</span>
              <input type="number" min="0" max={cashByAcct[xfer.from] || 0} value={xfer.amt || ""} placeholder={"max " + Math.round(cashByAcct[xfer.from] || 0)} onChange={(e) => setXfer({ ...xfer, amt: +e.target.value })} />
            </label>
            {accounts.filter((a) => psFamily(a.id) === psFamily(xfer.from) && a.id !== xfer.from).length === 0 ?
          <div className="ps-xfer-warn">{acctName(xfer.from)} has no same-plan account to transfer to.</div> : null}
            <div className="ps-xfer-actions">
              <button className="ps-btn ghost" onClick={() => setXfer(null)}>Cancel</button>
              <button className="ps-btn" style={{ background: accent }} onClick={() => doTransfer(xfer.from, xfer.to, xfer.amt)}>Transfer</button>
            </div>
          </div>
        </div>
      }

      {mbuy && (() => {
        const sec = mbuy.ticker ? resolveSec(mbuy.ticker) : null;
        const elig = sec ? eligibleAccts(sec) : accounts.map((a) => a.id);
        const acctOk = !sec || elig.includes(mbuy.acct);
        const px = sec ? sec.price : 0;
        const avail = cashByAcct[mbuy.acct] || 0;
        const amt = +mbuy.dollars || 0;
        const shares = px ? Math.max(amt >= px ? 1 : 0, Math.floor(amt / px)) : 0;
        const spend = shares * px;
        const reason = sec ? (isDirectCoin(sec) ? "direct crypto \u2192 Crypto account only" : assetCcy(sec) + " asset \u2192 " + assetCcy(sec) + " account only") : "";
        return (
        <div className="ps-xfer-modal" onClick={(e) => {if (e.target.className === "ps-xfer-modal") setMbuy(null);}}>
          <div className="ps-xfer-card">
            <div className="ps-xfer-title">Buy a security</div>
            <div className="ps-xfer-note">Buy any current or new ticker into an eligible account with available cash. USD assets → USD accounts; direct crypto → Crypto account.</div>
            <label className="ps-xfer-row"><span>Ticker</span>
              <input list="ps-buy-menu" value={mbuy.ticker} placeholder="e.g. NVDA, ATD.TO, BTC" onChange={(e) => { const tk = e.target.value.toUpperCase(); const ns = resolveSec(tk); const el = ns ? eligibleAccts(ns) : []; setMbuy({ ...mbuy, ticker: tk, acct: el.includes(mbuy.acct) ? mbuy.acct : (el[0] || mbuy.acct) }); }} />
              <datalist id="ps-buy-menu">{buyMenu.map(([t, n]) => <option key={t} value={t}>{n}</option>)}</datalist>
            </label>
            <label className="ps-xfer-row"><span>Account</span>
              <select value={mbuy.acct} onChange={(e) => setMbuy({ ...mbuy, acct: e.target.value })}>
                {(sec ? accounts.filter((a) => elig.includes(a.id)) : accounts).map((a) => <option key={a.id} value={a.id}>{a.name} · {psMoney(cashByAcct[a.id] || 0)}</option>)}
              </select>
            </label>
            <label className="ps-xfer-row"><span>Amount</span>
              <input type="number" min="0" max={avail} value={mbuy.dollars} placeholder={"max " + Math.round(avail)} onChange={(e) => setMbuy({ ...mbuy, dollars: e.target.value })} />
            </label>
            {sec && !acctOk ? <div className="ps-xfer-warn">{acctName(mbuy.acct)} can't hold {sec.ticker} — {reason}.</div> : null}
            {sec && acctOk && px ? <div className="ps-buy-preview">{sec.name} · mark <strong className="mono">{psMoney(px)}</strong>{shares > 0 ? <> → <strong className="mono">{shares} sh</strong> = <strong className="mono">{psMoney(spend)}</strong></> : null} · {acctName(mbuy.acct)} cash {psMoney(avail)}</div> : null}
            <div className="ps-xfer-actions">
              <button className="ps-btn ghost" onClick={() => setMbuy(null)}>Cancel</button>
              <button className="ps-btn" style={{ background: accent, opacity: (acctOk && shares > 0) ? 1 : 0.5 }} disabled={!acctOk || shares <= 0} onClick={() => manualBuy(mbuy.ticker, mbuy.acct, mbuy.dollars)}>Buy{shares > 0 ? " " + shares + " sh" : ""}</button>
            </div>
          </div>
        </div>);
      })()}

      {tab === "twin" &&
      <section className="pm-card ps-twin">
          <div className="ps-twin-h1">Would AI have done better?</div>
          <div className="ps-twin-h2">Executive answer based on your approved Twin simulation vs your real portfolio. No real trades are executed.</div>
          {!twin ?
        <div className="ps-twin-empty">
              <div className="ps-twin-q">Measuring…</div>
              <p>This compares your <strong>Twin</strong> (the paper book you build by accepting recommendations) against your <strong>real portfolio</strong> since the sim started. A daily snapshot of both is recorded <strong>automatically</strong> — no button to press. Accept a few proposals to give the Twin something to track, and the verdict appears here.</p>
            </div> :

        <>
              <div className="ps-twin-cards">
                <div className="ps-twin-card"><span>Current net worth</span><strong>{psMoney(realNetWorth)}</strong><em>your real portfolio</em></div>
                <div className="ps-twin-card vio"><span>Simulated Twin</span><strong style={{ color: "#6d28d9" }}>{psMoney(totalValue)}</strong><em>accepted twin state</em></div>
                <div className="ps-twin-card grn"><span>AI Added Value</span><strong style={{ color: twin.addedPct >= 0 ? psUP : psDN }}>{(twin.addedDollars >= 0 ? "+" : "") + psMoney(twin.addedDollars)}</strong><em>{psPct(twin.addedPct)} delta</em></div>
                <div className="ps-twin-card amb"><span>After-tax Added Value</span><strong style={{ color: twin.addedPct >= 0 ? psUP : psDN }}>{(twin.addedDollars >= 0 ? "+" : "") + psMoney(twin.addedDollars)}</strong><em>registered → tax-free</em></div>
                <div className="ps-twin-card"><span>Decisions</span><strong>{s.decisions.accepted}</strong><em>accepted of {s.decisions.accepted + s.decisions.rejected}</em></div>
              </div>
              <div className="ps-twin-grid">
                <div className="ps-twin-answer-card">
                  <div className="ps-twin-answer-lbl">Answer</div>
                  <div className={`ps-twin-answer ${twin.verdict.toLowerCase()}`}>{twin.verdict === "YES" ? "YES" : twin.verdict === "NO" ? "NO" : "TOO CLOSE"}</div>
                  <p className="ps-twin-say">{twin.verdict === "YES" ?
                <>Over {twin.days} day{twin.days === 1 ? "" : "s"}, following the engine's accepted recommendations would have <strong>beaten</strong> your real book by <strong style={{ color: psUP }}>{psPct(twin.addedPct)}</strong> — about <strong style={{ color: psUP }}>{psMoney(twin.addedDollars)}</strong> on your {psMoney(realNetWorth)} net worth.</> :
                twin.verdict === "NO" ?
                <>Over {twin.days} day{twin.days === 1 ? "" : "s"}, your <strong>real portfolio held up better</strong> — the Twin lagged by <strong style={{ color: psDN }}>{psPct(twin.addedPct)}</strong> ({psMoney(twin.addedDollars)}). Your own calls beat the model in this window.</> :
                <>Over {twin.days} day{twin.days === 1 ? "" : "s"}, Twin and real are <strong>within {Math.abs(twin.addedPct).toFixed(1)}%</strong> — no clear edge either way yet.</>}</p>
                  <p className="ps-twin-say-2">Comparison is cash-flow adjusted and built from daily snapshots. Only accepted recommendations affect the official Twin ledger.</p>
                  <div className="ps-twin-answer-btns">
                    <button className="ps-btn ghost" onClick={() => setTab("log")}>Open decision log</button>
                    <button className="ps-btn ghost" onClick={() => setTab("propose")}>View recommendations</button>
                  </div>
                </div>
                <div className="ps-twin-chartbox">
                  <div className="ps-twin-chart-h">Real vs Portfolio Twin — net worth evolution</div>
                  <TwinChart series={twin.series} accent={accent} />
                  {window.RiskPanel && (() => {
                    const twinRets = snaps.slice(1).map((s, i) => snaps[i].twinVal > 0 ? (s.twinVal - snaps[i].twinVal) / snaps[i].twinVal : 0).filter((r) => Math.abs(r) > 0);
                    const realRets = withReal.slice(1).map((s, i) => withReal[i].real > 0 ? (s.real - withReal[i].real) / withReal[i].real : 0).filter((r) => Math.abs(r) > 0);
                    if (twinRets.length < 5) return <div className="risk-empty">Needs ≥5 snapshots for risk stats.</div>;
                    return (
                      <>
                        <div className="pm-card-eyebrow" style={{ marginTop: 18 }}>Risk · AI Twin</div>
                        {React.createElement(window.RiskPanel, { rets: twinRets, accent, compact: true })}
                        {realRets.length >= 5 && <><div className="pm-card-eyebrow" style={{ marginTop: 14 }}>Risk · Real portfolio</div>{React.createElement(window.RiskPanel, { rets: realRets, accent: '#64748b', compact: true })}</>}
                      </>
                    );
                  })()}
                </div>
              </div>
              <div className="ps-twin-foot">Twin = your accepted paper book since {s.started}; real = your actual net worth over the same span. Daily snapshots are automatic (the chart fills over a few days). Registered accounts (REER/CELI) make gains tax-free, so after-tax ≈ gross.</div>
              {window.ReadinessBanner ? <div style={{ marginTop: 14 }}><window.ReadinessBanner label="before trusting this comparison" /></div> : null}
            </>
        }
        </section>
      }

      {/* PROPOSALS */}
      {tab === "propose" &&
      <section className="pm-card">
          <div className="pm-card-eyebrow">AI recommendations · {risk} · {horizon} — user approval gate</div>
          <p className="ps-prop-sub">Nothing affects the Twin until accepted. Accept routes the trade to an account's cash; reject is logged and shadow-measured for learning.</p>
          {(() => {
            const buyN = proposals.filter((p) => p.kind === "buy").length;
            const trimN = proposals.length - buyN;
            if (proposals.length === 0) return (
              <div className="ps-empty">
                <strong>No proposition today.</strong> No new buy clears the {risk} · {horizon} bar, and no held position needs trimming or reallocation right now — you're within policy. A no-trade day is a valid, disciplined outcome. Widen the net with the Aggressive preset or a longer horizon, or use ＋ Buy to act on your own idea.
              </div>
            );
            return (
              <>
                {buyN === 0 && trimN > 0 && (
                  <div className="ps-prop-note">No <strong>new buys</strong> clear the bar today — the {trimN} proposal{trimN === 1 ? "" : "s"} below {trimN === 1 ? "is a" : "are"} <strong>trim / reallocation</strong> to keep the book on target.</div>
                )}
                {buyN > 0 && trimN > 0 && (
                  <div className="ps-prop-note">{buyN} new buy{buyN === 1 ? "" : "s"} · {trimN} trim / reallocation{trimN === 1 ? "" : "s"} — risk-management moves are listed first.</div>
                )}
                <div className="ps-proposals">
                  {proposals.map((p) => <ProposalRow key={(p.kind || "buy") + "·" + p.h.ticker + "·" + (p.pos ? p.pos.acct : "")} prop={p} accent={accent} cashByAcct={cashByAcct} routeAcct={routeAcct} eligibleAccts={eligibleAccts} acctName={acctName} accounts={accounts} onAccept={accept} onReject={reject} onSell={sell} onTrim={trim} />)}
                </div>
              </>
            );
          })()}
        </section>
      }

      {/* BOOK / PORTFOLIO (mock 02) */}
      {tab === "book" &&
      <section className="pm-card">
          {window.HelmCIOMix && (() => {
            const mix = window.HelmCIOMix(risk);
            const mktOf = (p) => (p.sector === "Crypto") ? "crypto" : (p.ccy === "USD" || /US/.test(p.market || "")) ? "us" : "ca";
            const cur = { us: 0, ca: 0, crypto: 0, cash: totalCash };
            marked.forEach((p) => { cur[mktOf(p)] += p.value; });
            const tot = cur.us + cur.ca + cur.crypto + cur.cash || 1;
            const curPct = { us: Math.round(cur.us / tot * 100), ca: Math.round(cur.ca / tot * 100), crypto: Math.round(cur.crypto / tot * 100), cash: Math.round(cur.cash / tot * 100) };
            const SL = [["us", "US growth", "#7c3aed"], ["ca", "Canada defensive", "#0e9f6e"], ["crypto", "Crypto · FIRE sleeve", "#d97706"], ["cash", "Cash / ballast", "#64748b"]];
            return (
              <div className="ps-cio">
                <div className="pm-card-eyebrow" style={{ margin: 0 }}>Chief Investment Office · target asset mix ({risk})</div>
                <div className="ps-cio-sub">Regime <strong>{mix.regimeLabel} · {mix.bias}</strong> · USD proxy {mix.usd}. A medium-term <strong>lean</strong> between US growth, Canada defensives and the crypto sleeve — advisory, not an obligation.{mix.planRisk ? <> Plan risk budget <strong>{mix.planRisk.budget}%</strong> (needs {mix.planRisk.req}%/yr over {mix.planRisk.years}y).</> : null}</div>
                <div className="ps-cio-bars">
                  {SL.map(([k, label, col]) => {
                    const c = curPct[k], t = mix.targets[k], d = t - c;
                    return (
                      <div className="ps-cio-row" key={k}>
                        <span className="ps-cio-lbl">{label}</span>
                        <div className="ps-cio-track"><div className="ps-cio-cur" style={{ width: c + "%", background: col }} /><div className="ps-cio-tgt" style={{ left: t + "%" }} title={"CIO target " + t + "%"} /></div>
                        <span className="ps-cio-now mono">{c}%</span>
                        <span className="ps-cio-arrow mono" style={{ color: Math.abs(d) < 3 ? "var(--muted)" : d > 0 ? "#0e9f6e" : "#e02424" }}>{Math.abs(d) < 3 ? "on target" : (d > 0 ? "▲ +" : "▼ ") + d + "pp"}</span>
                      </div>
                    );
                  })}
                </div>
                {mix.cryptoStance ? (
                  <div className={"ps-cstance ps-cstance-" + mix.cryptoStance.stance.toLowerCase()}>
                    <span className="ps-cstance-tag">{mix.cryptoStance.stance}</span>
                    <div className="ps-cstance-body">
                      <div className="ps-cstance-reason">{mix.cryptoStance.reason}</div>
                      <div className="ps-cstance-meta"><strong>{mix.cryptoStance.pace}</strong> · {mix.cryptoStance.trigger}</div>
                    </div>
                    {window.TradeButton && mix.cryptoStance.stance !== "WAIT" && (
                      mix.cryptoStance.stance === "DISTRIBUTE"
                        ? <window.TradeButton label="Log a trim" ticker="BTCY.B" side="sell" acctHint="reer-cad" source="CIO crypto stance" small />
                        : <window.TradeButton label={mix.cryptoStance.stance === "DCA" ? "Log DCA buy" : "Log a buy"} ticker="BTCY.B" side="buy" acctHint="reer-cad" source="CIO crypto stance" tag={mix.cryptoStance.stance === "DCA" ? "dca" : null} small />
                    )}
                  </div>
                ) : null}
                {mix.cryptoTiers && (mix.cryptoTiers.btc + mix.cryptoTiers.growth + mix.cryptoTiers.alt) > 0 ? (
                  <div className="ps-cryptotier">
                    <div className="ps-cryptotier-h">Inside the crypto sleeve <span>{mix.cryptoTiers.why}</span></div>
                    <div className="ps-cryptotier-bars">
                      {[["BTC core", mix.cryptoTiers.btc, "#f7931a", "BTCY.B"], ["ETH / SOL growth", mix.cryptoTiers.growth, "#627eea", "ETHX.B"], ["Alt satellite", mix.cryptoTiers.alt, "#a855f7", ""]].map(([lbl, v, col, tkr]) => (
                        <div className="ps-cryptotier-row" key={lbl}>
                          <span className="ps-cryptotier-lbl"><span className="ps-cryptotier-dot" style={{ background: col }} />{lbl}</span>
                          <div className="ps-cryptotier-track"><div style={{ width: (mix.targets.crypto ? v / mix.targets.crypto * 100 : 0) + "%", background: col }} /></div>
                          <span className="ps-cryptotier-pct mono">{v}%</span>
                          {window.TradeButton && <window.TradeButton label="Log buy" ticker={tkr} side="buy" acctHint={tkr ? "reer-cad" : undefined} source={"CIO tier \u00b7 " + lbl} small />}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="ps-cio-drivers">{mix.drivers.length ? mix.drivers.map((x, i) => <span className="ps-cio-driver" key={i}>{x}</span>) : <span className="ps-cio-driver">Neutral regime — hold the base mix.</span>}</div>
                {mix.planNote ? <div className="ps-cio-warn">{mix.planNote}</div> : null}
                <div className="ps-cio-note">{mix.note} The bar is your <strong>current</strong> book; the tick marks the CIO target. Close the gap via Propositions — or ignore it.</div>
              </div>
            );
          })()}
          <div className="pm-card-eyebrow" style={{ marginTop: 18 }}>Loaded accounts & simulated state · per account</div>
          <div className="pm-table-wrap">
            <table className="pm-table ps-acct-table">
              <thead><tr><th className="ta-left">Account</th><th className="ta-right">Cash</th><th className="ta-right">Investments</th><th className="ta-right">Current total</th><th className="ta-right">Unrealized G/L</th></tr></thead>
              <tbody>
                {accounts.map((a) => {
                const inv = marked.filter((p) => p.acct === a.id).reduce((x, p) => x + p.value, 0);
                const pl = marked.filter((p) => p.acct === a.id).reduce((x, p) => x + p.pl, 0);
                const cash = toDisp(cashByAcct[a.id] || 0, acctCcyOfId(a.id));
                return (
                  <tr key={a.id}>
                      <td className="ta-left"><strong>{a.name}</strong> <span className="ps-acct-lbl">{a.label}</span></td>
                      <td className="ta-right mono">{psMoney(cash)}</td>
                      <td className="ta-right mono">{psMoney(inv)}</td>
                      <td className="ta-right mono">{psMoney(cash + inv)}</td>
                      <td className="ta-right mono" style={{ color: pl >= 0 ? psUP : psDN }}>{psMoney(pl)}</td>
                    </tr>);

              })}
                <tr className="ps-acct-total">
                  <td className="ta-left"><strong>Total</strong></td>
                  <td className="ta-right mono">{psMoney(totalCash)}</td>
                  <td className="ta-right mono">{psMoney(bookValue)}</td>
                  <td className="ta-right mono">{psMoney(totalValue)}</td>
                  <td className="ta-right mono" style={{ color: totalPL >= 0 ? psUP : psDN }}>{psMoney(totalPL)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="ps-acct-foot">Cash is <strong>segregated per account</strong> — it can't move between them (you can't fund a buy from RRSP cash, etc.). Recommendations live in the Propositions tab, not here.</div>
        </section>
      }
      {tab === "book" &&
      <section className="pm-card">
          <div className="pm-card-eyebrow">Paper positions · marked daily{selAcct ? " · " + acctName(selAcct) : ""}</div>
          {bookDiv && marked.length > 1 &&
        <div className="ps-div" title="Diversification of your actual paper book, by market value">
              <span className="ps-div-tag" style={{ background: bookDiv.score >= 65 ? psUP : bookDiv.score >= 45 ? psWARN : psDN }}>Diversification {bookDiv.score}/100</span>
              <span className="ps-div-txt">{bookDiv.effNames} effective names across {bookDiv.sectors} sector{bookDiv.sectors === 1 ? "" : "s"} · largest <strong>{bookDiv.topSector} {bookDiv.topSectorW}%</strong>. {bookDiv.score < 45 ? "Concentrated — a single shock hits hard. Spread across more sectors." : bookDiv.score < 65 ? "Moderately balanced — watch the top sector." : "Well spread across names and sectors."}</span>
            </div>
        }
          {marked.length === 0 ? <div className="ps-empty">No paper positions yet. Accept a proposal to start building the book.</div> :
        <div className="pm-table-wrap">
              <table className="pm-table ps-book">
                <thead><tr><th className="ta-left">Position</th><th className="ta-left">Account</th><th className="ta-right">Shares</th><th className="ta-right">Entry</th><th className="ta-right">Now</th><th className="ta-right">Value</th><th className="ta-right">P&amp;L</th><th className="ta-center">Signal</th><th></th></tr></thead>
                <tbody>
                  {(selAcct ? marked.filter((p) => p.acct === selAcct) : marked).map((p) =>
              <tr key={p.id}>
                      <td className="ta-left"><strong>{p.ticker}</strong> <span className="ps-pos-sec">{p.sector}</span>{p.horizon ? <span className="ps-pos-hz">{p.horizon}</span> : null}</td>
                      <td className="ta-left"><span className="ps-acct-tag">{acctName(p.acct)}</span></td>
                      <td className="ta-right mono">{p.shares}</td>
                      <td className="ta-right mono">{psMoney(p.entry)}</td>
                      <td className="ta-right mono">{psMoney(p.px)}</td>
                      <td className="ta-right mono">{psMoney(p.value)}</td>
                      <td className="ta-right mono" style={{ color: p.pl >= 0 ? psUP : psDN }}>{psMoney(p.pl)} <span className="ps-plpct">{psPct(p.plPct)}</span></td>
                      <td className="ta-center">{p.sig ? <span className="ps-sig" style={{ color: p.sig.action === "Buy" ? psUP : p.sig.action === "Sell" ? p.sig.sellKind === "Trim" ? psWARN : psDN : "var(--muted)" }}>{p.sig.action === "Sell" ? p.sig.sellKind || "Sell" : p.sig.action}</span> : "—"}</td>
                      <td className="ta-right"><div className="ps-pos-actions"><button className="ps-buy-btn" onClick={() => setMbuy({ ticker: p.ticker, acct: p.acct, dollars: "" })} title="Buy more of this name">Buy</button>{p.shares > 2 ? <button className="ps-trim-btn" onClick={() => trim(p)} title="Sell ~a third, keep the rest">Trim</button> : null}<button className="ps-sell-btn" onClick={() => sell(p)} title="Close the whole position">Sell</button></div></td>
                    </tr>
              )}
                </tbody>
              </table>
            </div>
        }
          {marked.length > 0 && <div className="ps-book-foot">The <strong>Signal</strong> column is the engine's current read — <strong style={{ color: psWARN }}>Trim</strong> (orange) means lighten, <strong style={{ color: psDN }}>Exit</strong> (red) means close out. <strong>Trim</strong> sells about a third and keeps the rest; <strong>Sell</strong> closes the position. Proceeds return to that position's account cash.</div>}
        </section>
      }

      {/* LOG + LEARNING */}
      {tab === "log" &&
      <>
          <section className="pm-card">
            <div className="pm-card-eyebrow">Learning · did your judgement help?</div>
            <div className="ps-learn-grid">
              <div className="ps-learn"><span>Decisions</span><strong>{s.decisions.accepted + s.decisions.rejected}</strong><em>{s.decisions.accepted} accepted · {s.decisions.rejected} rejected</em></div>
              <div className="ps-learn"><span>Realized P&amp;L</span><strong style={{ color: realizedPL >= 0 ? psUP : psDN }}>{psMoney(realizedPL)}</strong><em>{acceptedClosed.length} closed · {wins} winners</em></div>
              <div className="ps-learn"><span>Rejects that ran away</span><strong style={{ color: psDN }}>{rejectRanAway}</strong><em>names you passed that rose &gt;5%</em></div>
              <div className="ps-learn"><span>Rejects you dodged</span><strong style={{ color: psUP }}>{rejectDodged}</strong><em>passed names that fell &gt;5% — good calls</em></div>
            </div>
            <div className="ps-learn-note">
              {rejectRanAway > rejectDodged ?
            "Your rejections have cost more than they saved — the model's Buys you passed on mostly rose. Consider trusting the engine more, or tightening what makes you reject." :
            rejectDodged > rejectRanAway ?
            "Your rejections are adding value — you're dodging more losers than you miss winners. Your judgement is complementing the model." :
            "Not enough closed decisions yet to judge. Keep accepting/rejecting and snapshotting daily — the edge shows over time."}
            </div>
          </section>
          <section className="pm-card">
            <div className="pm-card-eyebrow">Decision log</div>
            {s.log.length === 0 ? <div className="ps-empty">No decisions yet.</div> :
          <div className="ps-log">
                {s.log.map((l, i) =>
            <div className="ps-log-row" key={l.ts || i}>
                    <span className="ps-log-date mono">{l.date}</span>
                    <span className={`ps-log-kind ${l.kind}`}>{l.kind === "accept" ? "BUY" : l.kind === "manual" ? "BUY+" : l.kind === "reject" ? "PASS" : l.kind === "trim" ? "TRIM" : l.kind === "transfer" ? "MOVE" : "SELL"}</span>
                    <span className="ps-log-tkr">{l.ticker}</span>
                    <span className="ps-log-note">{l.note}</span>
                    {l.acct ? <span className="ps-log-acct">{acctName(l.acct)}</span> : null}
                  </div>
            )}
              </div>
          }
          </section>
        </>
      }

      <div className="ps-foot">Paper trading only — no real orders, no real money. Prices mark against the live feed when connected, else the last universe seed. This is the feedback loop: by recording your accept/reject decisions and their outcomes, Helm learns whether to weight your judgement or the raw model more heavily.</div>
    </div>);

}

function TwinChart({ series, accent }) {
  if (!series || series.length < 1) return <div className="ps-twin-chart-empty">Needs ≥2 daily snapshots to draw — the chart fills automatically over the coming days.</div>;
  const W = 900,H = 220,pad = 34;
  // normalize both to index 100 at first point for fair shape comparison
  const t0 = series[0].value || 1,r0 = series[0].real || 1;
  const twin = series.map((s) => s.value / t0 * 100);
  const real = series.map((s) => s.real / r0 * 100);
  const all = [...twin, ...real];
  const lo = Math.min(...all, 100) - 1,hi = Math.max(...all, 100) + 1;
  const n = series.length;
  const x = (i) => pad + i / Math.max(1, n - 1) * (W - pad * 2);
  const y = (v) => H - pad - (v - lo) / (hi - lo || 1) * (H - pad * 2);
  const path = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <div className="ps-twin-chartwrap">
      <div className="ps-twin-chart-title">Real vs Twin — indexed to 100 at first snapshot</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {[lo, (lo + hi) / 2, hi].map((v, i) => <g key={i}><line x1={pad} y1={y(v)} x2={W - pad} y2={y(v)} stroke="currentColor" strokeOpacity="0.08" /><text x={pad - 5} y={y(v) + 3} textAnchor="end" style={{ fontSize: 9, fill: "var(--muted)" }} className="mono">{v.toFixed(0)}</text></g>)}
        <path d={path(real)} fill="none" stroke="var(--ink-2)" strokeWidth="1.8" />
        <path d={path(twin)} fill="none" stroke={accent} strokeWidth="2.2" />
      </svg>
      <div className="ps-twin-legend"><span><i style={{ background: "var(--ink-2)" }} />Real portfolio</span><span><i style={{ background: accent }} />Portfolio Twin</span></div>
    </div>);

}

function ProposalRow({ prop, accent, cashByAcct, routeAcct, eligibleAccts, acctName, accounts, onAccept, onReject, onSell, onTrim }) {
  const { h, sig, kind } = prop;
  const isSell = kind === "trim" || kind === "exit";
  const elig = eligibleAccts ? eligibleAccts(h) : accounts.map((a) => a.id);
  const [acct, setAcct] = usePsState(routeAcct(h));
  const avail = cashByAcct && cashByAcct[acct] || 0;
  const [size, setSize] = usePsState(Math.min(8000, Math.max(1000, Math.round(avail * 0.2))));
  const cappedSize = Math.min(size, avail);
  const shares = Math.max(0, Math.floor(cappedSize / h.price));
  const th = window.helmTradeHorizon ? window.helmTradeHorizon(sig) : null;
  const tag = kind === "exit" ? "Exit" : kind === "trim" ? "Trim" : "Buy";
  const tagCol = kind === "exit" ? psDN : kind === "trim" ? psWARN : accent;
  return (
    <div className="ps-prop">
      <div className="ps-prop-id">
        <div className="ps-prop-badge" style={{ background: tagCol + "1a", color: tagCol }}>{tag === "Buy" ? h.ticker.replace(".TO", "").slice(0, 3) : tag === "Trim" ? "↓" : "✕"}</div>
        <div>
          <div className="ps-prop-tkr"><span className="ps-prop-act" style={{ color: tagCol }}>{tag}</span> {h.ticker} <span className="ps-prop-name">{h.name}</span>{sig.realFund ? <span className="ps-live">● live{sig.qualReal ? "+" : ""}</span> : null}</div>
          <div className="ps-prop-meta">Score <strong style={{ color: sig.composite >= 60 ? psUP : psWARN }}>{sig.composite}</strong> · {h.sector} · {psMoney(h.price)}{th ? <span className={`ps-prop-hz ps-hz-${th.kind}`}>{th.tag}</span> : null}</div>
        </div>
      </div>
      <div className="ps-prop-controls">
        {isSell ?
        <>
            <span className="ps-prop-from">in {acctName(prop.pos.acct)} · {prop.pos.shares} sh</span>
            <div className="ps-prop-actions">
              {kind === "trim" ?
            <button className="ps-accept" style={{ background: psWARN }} onClick={() => onTrim(prop.pos)}>Trim ⅓</button> :
            <button className="ps-accept" style={{ background: psDN }} onClick={() => onSell(prop.pos)}>Sell</button>}
              <button className="ps-reject" onClick={() => onReject(prop)}>Keep</button>
            </div>
          </> :

        <>
            <select className="ps-acct-sel" value={acct} onChange={(e) => setAcct(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id} disabled={!elig.includes(a.id)}>{a.name} · {psMoney(cashByAcct && cashByAcct[a.id] || 0)}{elig.includes(a.id) ? "" : " — N/A"}</option>)}
            </select>
            <div className="ps-size">
              <input type="range" min="500" max={Math.max(1000, Math.round(avail))} step="250" value={cappedSize} onChange={(e) => setSize(+e.target.value)} />
              <span className="ps-size-v mono">{psMoney(cappedSize)} · {shares} sh</span>
            </div>
            <div className="ps-prop-actions">
              <button className="ps-accept" style={{ background: shares > 0 && elig.includes(acct) ? accent : "var(--line)" }} disabled={shares < 1 || !elig.includes(acct)} onClick={() => onAccept(prop, acct, cappedSize)}>Accept</button>
              <button className="ps-reject" onClick={() => onReject(prop)}>Reject</button>
            </div>
          </>
        }
      </div>
    </div>);

}

const PS_CSS = `
.ps { display: flex; flex-direction: column; gap: 16px; }
.ps-hero { display: flex; justify-content: space-between; gap: 24px; align-items: center; flex-wrap: wrap; }
.ps-hero-title { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; margin: 3px 0 8px; }
.ps-hero-note { font-size: 12.5px; color: var(--muted); margin-top: 4px; }
.ps-hero-sub { font-size: 13px; color: var(--ink-2); line-height: 1.55; max-width: 600px; }
.ps-hero-sub strong { color: var(--ink); }
.ps-hero-kpis { display: grid; grid-template-columns: repeat(2, auto); gap: 14px 28px; flex: none; }
.ps-kpi { display: flex; flex-direction: column; gap: 2px; }
.ps-kpi span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.ps-kpi strong { font-family: var(--mono); font-size: 20px; font-weight: 700; }
.ps-flash { background: color-mix(in srgb, #0e9f6e 10%, white); border: 1px solid color-mix(in srgb, #0e9f6e 30%, white); color: #0a7d57; font-size: 13px; padding: 10px 15px; border-radius: 9px; }
.ps-flash.bad { background: color-mix(in srgb, #e02424 8%, white); border-color: color-mix(in srgb, #e02424 26%, white); color: #b91c1c; }
.ps-flow-head { width: 100%; display: flex; justify-content: space-between; align-items: center; background: none; border: 0; cursor: pointer; padding: 0; font: inherit; }
.ps-flow-tog { font-size: 12px; font-weight: 600; color: var(--muted); }
.ps-flow-strip { display: flex; align-items: stretch; gap: 4px; margin-top: 14px; overflow-x: auto; }
.ps-flow-node { flex: 1; min-width: 130px; border: 1px solid var(--line); border-radius: 10px; padding: 11px 12px; background: var(--panel-2); }
.ps-flow-num { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; color: #fff; font-size: 11px; font-weight: 700; font-family: var(--mono); margin-bottom: 6px; }
.ps-flow-k { font-size: 13px; font-weight: 700; }
.ps-flow-d { font-size: 11px; color: var(--ink-2); line-height: 1.4; margin-top: 3px; }
.ps-flow-arr { display: flex; align-items: center; color: var(--muted); font-size: 15px; flex: none; }
.ps-flow-note { font-size: 12px; color: var(--ink-2); line-height: 1.55; margin-top: 12px; }
.ps-flow-note strong { color: var(--ink); }
.ps-controls { display: flex; gap: 24px; align-items: flex-end; flex-wrap: wrap; }
.ps-ctl-group { display: flex; flex-direction: column; gap: 6px; }
.ps-ctl-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.ps-seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.ps-seg button { font: inherit; font-size: 12px; font-weight: 600; padding: 6px 13px; border: 0; border-right: 1px solid var(--line); background: var(--panel-2); color: var(--ink-2); cursor: pointer; }
.ps-seg button:last-child { border-right: 0; }
.ps-ctl-actions { display: flex; gap: 8px; margin-left: auto; align-items: center; }
.ps-autosnap { font-size: 11.5px; font-weight: 600; color: #0a7d57; background: color-mix(in srgb, #0e9f6e 12%, transparent); padding: 5px 11px; border-radius: 99px; white-space: nowrap; }
.ps-acctcash { display: flex; flex-direction: column; gap: 8px; }
.ps-acctcash-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.ps-acctcash-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.ps-acctcash-btns { display: flex; gap: 8px; }
.ps-transfer-btn { font: inherit; font-size: 12px; font-weight: 600; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 13px; cursor: pointer; }
.ps-transfer-btn:hover { border-color: var(--ink-2); }
.ps-xfer-modal { position: fixed; inset: 0; background: rgba(18,24,32,0.45); display: grid; place-items: center; z-index: 100; }
.ps-xfer-card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 22px 24px; width: 360px; max-width: 92vw; box-shadow: 0 12px 40px rgba(0,0,0,0.18); display: flex; flex-direction: column; gap: 12px; }
.ps-xfer-title { font-size: 16px; font-weight: 700; }
.ps-xfer-note { font-size: 12px; color: var(--muted); line-height: 1.5; }
.ps-xfer-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; font-weight: 600; color: var(--ink-2); }
.ps-xfer-row select, .ps-xfer-row input { font: inherit; font-size: 13px; padding: 7px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--ink); width: 200px; }
.ps-xfer-warn { font-size: 12px; color: #b45309; background: color-mix(in srgb, #d97706 12%, transparent); padding: 7px 10px; border-radius: 8px; }
.ps-buy-preview { font-size: 12px; color: var(--ink-2); background: var(--panel-2); padding: 7px 10px; border-radius: 8px; line-height: 1.5; }
.ps-xfer-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.ps-acctcash-row { display: flex; gap: 8px; flex-wrap: wrap; }
.ps-acctcash-chip { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; border: 1px solid var(--line); border-radius: 9px; padding: 8px 13px; background: var(--panel-2); cursor: pointer; font: inherit; }
.ps-acctcash-chip:hover { border-color: var(--ink-2); }
.ps-acctcash-nm { font-size: 11.5px; font-weight: 600; color: var(--ink); }
.ps-acctcash-v { font-size: 13px; font-weight: 700; }
.ps-btn { font: inherit; font-size: 12.5px; font-weight: 600; padding: 8px 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--ink); color: #fff; cursor: pointer; }
.ps-btn.ghost { background: var(--panel); color: var(--ink-2); }
.ps-tabs { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ps-tabs-actions { display: flex; gap: 8px; margin-left: auto; align-items: center; }
.ps-tabs-kpi { font-size: 12px; color: var(--muted); white-space: nowrap; }
.ps-tabs-kpi strong { font-family: var(--mono); font-size: 13px; color: var(--ink); margin-left: 4px; }
.ps-tabs button { font: inherit; font-size: 13px; font-weight: 600; padding: 9px 16px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 9px; background: var(--panel); color: var(--ink-2); cursor: pointer; display: flex; align-items: center; gap: 7px; }
.ps-tab-n { font-family: var(--mono); font-size: 11px; background: var(--line-2); color: var(--ink-2); padding: 1px 7px; border-radius: 99px; }
.ps-empty { font-size: 13px; color: var(--ink-2); padding: 16px; line-height: 1.6; background: var(--panel-2); border: 1px solid var(--line); border-radius: 11px; }
.ps-empty strong { color: var(--ink); }
.ps-prop-note { font-size: 12.5px; color: var(--ink-2); line-height: 1.5; padding: 9px 13px; margin-bottom: 12px; background: color-mix(in srgb, var(--accent, #0e9f6e) 6%, white); border: 1px solid color-mix(in srgb, var(--accent, #0e9f6e) 20%, var(--line)); border-radius: 9px; }
.ps-prop-note strong { color: var(--ink); }
.ps-prop-sub { font-size: 12.5px; color: var(--ink-2); line-height: 1.5; margin: 2px 0 14px; }
.ps-twin-empty { padding: 8px 0; }
.ps-twin-h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
.ps-twin-h2 { font-size: 13px; color: var(--ink-2); margin: 4px 0 16px; line-height: 1.5; }
.ps-twin-cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 16px; }
.ps-twin-card { border: 1px solid var(--line); border-radius: 11px; padding: 13px 15px; display: flex; flex-direction: column; gap: 3px; background: var(--panel); }
.ps-twin-card.vio { background: color-mix(in srgb, #6d28d9 6%, white); border-color: color-mix(in srgb, #6d28d9 22%, white); }
.ps-twin-card.grn { background: color-mix(in srgb, #0e9f6e 7%, white); border-color: color-mix(in srgb, #0e9f6e 24%, white); }
.ps-twin-card.amb { background: color-mix(in srgb, #d97706 8%, white); border-color: color-mix(in srgb, #d97706 24%, white); }
.ps-twin-card span { font-size: 11px; font-weight: 600; color: var(--ink-2); }
.ps-twin-card strong { font-family: var(--mono); font-size: 19px; font-weight: 700; }
.ps-twin-card em { font-style: normal; font-size: 10.5px; color: var(--muted); }
.ps-twin-grid { display: grid; grid-template-columns: 1fr 1.2fr; gap: 14px; }
.ps-twin-answer-card { border: 1px solid var(--line); border-radius: 12px; padding: 20px 22px; }
.ps-twin-answer-lbl { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
.ps-twin-say-2 { font-size: 12.5px; color: var(--muted); line-height: 1.55; margin-top: 10px; }
.ps-twin-answer-btns { display: flex; gap: 8px; margin-top: 16px; }
.ps-twin-chartbox { border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; }
.ps-twin-chart-empty { font-size: 12.5px; color: var(--muted); padding: 24px 0; text-align: center; }
.ps-twin-chart-h { font-size: 14px; font-weight: 700; margin-bottom: 8px; }
@media (max-width: 880px) { .ps-twin-cards { grid-template-columns: repeat(2, 1fr); } .ps-twin-grid { grid-template-columns: 1fr; } }
.ps-twin-q { font-size: 17px; font-weight: 700; margin-bottom: 8px; }
.ps-twin-empty p { font-size: 13px; color: var(--ink-2); line-height: 1.6; max-width: 640px; margin-bottom: 8px; }
.ps-twin-have { font-size: 12px; color: var(--muted); font-family: var(--mono); }
.ps-twin-verdict { display: flex; align-items: flex-start; gap: 18px; margin: 6px 0 18px; }
.ps-twin-answer { font-size: 38px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; flex: none; }
.ps-twin-answer.yes { color: #0e9f6e; }
.ps-twin-answer.no { color: #e02424; }
.ps-twin-answer.tie { color: #d97706; font-size: 30px; }
.ps-twin-say { font-size: 14px; color: var(--ink-2); line-height: 1.55; }
.ps-twin-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
.ps-twin-kpi { border: 1px solid var(--line); border-radius: 11px; padding: 13px 15px; display: flex; flex-direction: column; gap: 3px; }
.ps-twin-kpi span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
.ps-twin-kpi strong { font-family: var(--mono); font-size: 21px; font-weight: 700; }
.ps-twin-kpi em { font-style: normal; font-size: 11px; color: var(--muted); }
.ps-twin-chartwrap { border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
.ps-twin-chart-title { font-size: 12px; font-weight: 600; color: var(--ink-2); margin-bottom: 6px; }
.ps-twin-legend { display: flex; gap: 18px; justify-content: center; margin-top: 6px; font-size: 11.5px; color: var(--muted); }
.ps-twin-legend i { display: inline-block; width: 14px; height: 3px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
.ps-twin-foot { font-size: 11.5px; color: var(--muted); line-height: 1.55; margin-top: 12px; }
@media (max-width: 720px) { .ps-twin-kpis { grid-template-columns: 1fr 1fr; } }
.ps-proposals { display: flex; flex-direction: column; gap: 8px; }
.ps-prop { display: flex; justify-content: space-between; align-items: center; gap: 18px; border: 1px solid var(--line); border-radius: 11px; padding: 12px 15px; flex-wrap: wrap; }
.ps-prop-id { display: flex; align-items: center; gap: 11px; min-width: 230px; }
.ps-prop-badge { width: 38px; height: 38px; border-radius: 9px; display: grid; place-items: center; font-weight: 700; font-size: 13px; flex: none; }
.ps-prop-tkr { font-size: 14px; font-weight: 700; }
.ps-prop-name { font-size: 12px; font-weight: 400; color: var(--muted); }
.ps-prop-act { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; margin-right: 2px; }
.ps-prop-from { font-size: 12px; color: var(--ink-2); }
.ps-live { font-size: 9.5px; font-weight: 700; color: #0e9f6e; background: color-mix(in srgb, #0e9f6e 12%, transparent); padding: 1px 6px; border-radius: 99px; margin-left: 6px; }
.ps-prop-meta { font-size: 12px; color: var(--ink-2); margin-top: 3px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ps-prop-hz { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; padding: 1px 7px; border-radius: 99px; }
.ps-hz-core { background: color-mix(in srgb, #0e9f6e 14%, transparent); color: #0a7d57; }
.ps-hz-build { background: color-mix(in srgb, #2563eb 12%, transparent); color: #1d4ed8; }
.ps-hz-tactical { background: color-mix(in srgb, #4f46e5 12%, transparent); color: #4338ca; }
.ps-hz-quick { background: color-mix(in srgb, #d97706 14%, transparent); color: #b45309; }
.ps-hz-watch { background: var(--line-2); color: var(--muted); }
.ps-prop-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.ps-acct-sel { font: inherit; font-size: 12px; padding: 6px 9px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); color: var(--ink); }
.ps-size { display: flex; flex-direction: column; gap: 3px; }
.ps-size input { width: 130px; accent-color: var(--accent, #0e9f6e); }
.ps-size-v { font-size: 11px; color: var(--ink-2); }
.ps-prop-actions { display: flex; gap: 7px; }
.ps-accept { font: inherit; font-size: 12.5px; font-weight: 700; color: #fff; border: 0; border-radius: 8px; padding: 8px 16px; cursor: pointer; }
.ps-reject { font: inherit; font-size: 12.5px; font-weight: 600; color: var(--ink-2); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 14px; cursor: pointer; }
.ps-book td { padding: 10px 12px; }
.ps-pos-sec { font-size: 11px; color: var(--muted); margin-left: 4px; }
.ps-div { display: flex; align-items: center; gap: 12px; margin: 4px 0 14px; padding: 11px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); flex-wrap: wrap; }
.ps-div-tag { color: #fff; font-family: var(--mono); font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px; white-space: nowrap; }
.ps-div-txt { font-size: 12.5px; color: var(--ink-2); line-height: 1.5; }
.ps-div-txt strong { color: var(--ink); }
.ps-pos-hz { font-size: 9.5px; font-weight: 700; text-transform: uppercase; color: #0a7d57; background: color-mix(in srgb, #0e9f6e 12%, transparent); padding: 1px 6px; border-radius: 99px; margin-left: 6px; }
.ps-acct-tag { font-size: 11.5px; font-weight: 600; color: var(--ink-2); background: var(--panel-2); border: 1px solid var(--line); padding: 2px 9px; border-radius: 6px; }
.ps-acct-table td { padding: 9px 12px; }
.ps-acct-lbl { font-size: 11px; color: var(--muted); margin-left: 4px; }
.ps-acct-total td { border-top: 2px solid var(--line); font-weight: 700; }
.ps-acct-foot { font-size: 12px; color: var(--ink-2); line-height: 1.55; margin-top: 12px; }
.ps-cio { border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; margin-bottom: 6px; background: var(--panel-2); }
.ps-cio-sub { font-size: 12.5px; color: var(--ink-2); line-height: 1.5; margin: 4px 0 14px; }
.ps-cio-sub strong { color: var(--ink); }
.ps-cio-bars { display: flex; flex-direction: column; gap: 9px; }
.ps-cio-row { display: grid; grid-template-columns: 140px 1fr 42px 78px; gap: 12px; align-items: center; }
.ps-cio-lbl { font-size: 12.5px; font-weight: 600; }
.ps-cio-track { position: relative; height: 12px; background: var(--line-2); border-radius: 6px; overflow: visible; }
.ps-cio-cur { height: 100%; border-radius: 6px; }
.ps-cio-tgt { position: absolute; top: -3px; width: 2px; height: 18px; background: var(--ink); border-radius: 2px; }
.ps-cio-now { font-size: 12.5px; font-weight: 600; text-align: right; }
.ps-cio-arrow { font-size: 11px; font-weight: 600; text-align: right; }
.ps-cio-drivers { display: flex; flex-wrap: wrap; gap: 7px; margin: 14px 0 10px; }
.ps-cio-driver { font-size: 11.5px; color: var(--ink-2); background: var(--panel); border: 1px solid var(--line); border-radius: 7px; padding: 4px 10px; }
.ps-cio-note { font-size: 11.5px; color: var(--muted); line-height: 1.55; }
.ps-cio-warn { font-size: 12px; color: #b45309; background: color-mix(in srgb, #d97706 12%, transparent); border-radius: 8px; padding: 8px 11px; line-height: 1.5; margin-bottom: 10px; }
.ps-cryptotier { margin: 12px 0 4px; padding: 11px 13px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); }
.ps-cstance { display: flex; gap: 11px; align-items: center; margin: 12px 0 0; padding: 11px 13px; border-radius: 10px; border: 1px solid var(--line); }
.ps-cstance .lt-trigger { margin-left: auto; flex: none; }
.ps-cstance-tag { font-size: 11px; font-weight: 800; letter-spacing: 0.04em; padding: 4px 9px; border-radius: 6px; flex: none; color: #fff; }
.ps-cstance-wait .ps-cstance-tag { background: #64748b; }
.ps-cstance-dca .ps-cstance-tag { background: #2563eb; }
.ps-cstance-deploy .ps-cstance-tag { background: #0e9f6e; }
.ps-cstance-distribute .ps-cstance-tag { background: #d97706; }
.ps-cstance-wait { background: color-mix(in srgb, #64748b 8%, transparent); }
.ps-cstance-dca { background: color-mix(in srgb, #2563eb 8%, transparent); }
.ps-cstance-deploy { background: color-mix(in srgb, #0e9f6e 8%, transparent); }
.ps-cstance-distribute { background: color-mix(in srgb, #d97706 8%, transparent); }
.ps-cstance-reason { font-size: 12.5px; color: var(--ink); line-height: 1.5; }
.ps-cstance-meta { font-size: 11.5px; color: var(--muted); line-height: 1.5; margin-top: 3px; }
.ps-cstance-meta strong { color: var(--ink-2); }
.ps-cryptotier-h { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-2); margin-bottom: 9px; }
.ps-cryptotier-h span { display: block; text-transform: none; letter-spacing: 0; font-weight: 500; font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.ps-cryptotier-bars { display: flex; flex-direction: column; gap: 6px; }
.ps-cryptotier-row { display: grid; grid-template-columns: 140px 1fr 36px auto; align-items: center; gap: 10px; }
.ps-cryptotier-lbl { font-size: 12px; color: var(--ink-2); display: flex; align-items: center; gap: 6px; }
.ps-cryptotier-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.ps-cryptotier-track { height: 6px; border-radius: 99px; background: var(--line); overflow: hidden; }
.ps-cryptotier-track > div { height: 100%; border-radius: 99px; }
.ps-cryptotier-pct { font-size: 12px; font-weight: 600; text-align: right; }
.ps-cio-note strong { color: var(--ink-2); }
.ps-acct-foot strong { color: var(--ink); }
.ps-plpct { font-size: 11px; }
.ps-sig { font-size: 11.5px; font-weight: 700; }
.ps-sell-btn { font: inherit; font-size: 11.5px; font-weight: 600; color: var(--ink-2); background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 4px 11px; cursor: pointer; }
.ps-pos-actions { display: flex; gap: 6px; justify-content: flex-end; }
.ps-buy-btn { font: inherit; font-size: 11.5px; font-weight: 600; color: #0a7d57; background: color-mix(in srgb, #0e9f6e 12%, transparent); border: 1px solid color-mix(in srgb, #0e9f6e 30%, transparent); border-radius: 6px; padding: 4px 11px; cursor: pointer; }
.ps-buy-btn:hover { background: color-mix(in srgb, #0e9f6e 20%, transparent); }
.ps-trim-btn { font: inherit; font-size: 11.5px; font-weight: 600; color: #b45309; background: color-mix(in srgb, #d97706 12%, transparent); border: 1px solid color-mix(in srgb, #d97706 30%, transparent); border-radius: 6px; padding: 4px 11px; cursor: pointer; }
.ps-book-foot, .ps-learn-note { font-size: 12px; color: var(--ink-2); line-height: 1.55; margin-top: 12px; }
.ps-learn-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.ps-learn { border: 1px solid var(--line); border-radius: 10px; padding: 13px 15px; display: flex; flex-direction: column; gap: 3px; }
.ps-learn span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
.ps-learn strong { font-family: var(--mono); font-size: 21px; font-weight: 700; }
.ps-learn em { font-style: normal; font-size: 11.5px; color: var(--muted); }
.ps-log { display: flex; flex-direction: column; }
.ps-log-row { display: grid; grid-template-columns: 84px 54px 60px 1fr auto; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line-2); font-size: 12.5px; }
.ps-log-row:last-child { border-bottom: 0; }
.ps-log-date { color: var(--muted); font-size: 11px; }
.ps-log-kind { font-size: 10px; font-weight: 700; text-align: center; padding: 2px 0; border-radius: 5px; }
.ps-log-kind.accept { background: color-mix(in srgb, #0e9f6e 14%, transparent); color: #0a7d57; }
.ps-log-kind.reject { background: var(--line-2); color: var(--muted); }
.ps-log-kind.sell { background: color-mix(in srgb, #2563eb 12%, transparent); color: #1d4ed8; }
.ps-log-kind.trim { background: color-mix(in srgb, #d97706 14%, transparent); color: #b45309; }
.ps-log-kind.transfer { background: color-mix(in srgb, #6d28d9 12%, transparent); color: #6d28d9; }
.ps-log-kind.manual { background: color-mix(in srgb, #0e9f6e 20%, transparent); color: #0a7d57; }
.ps-log-tkr { font-weight: 700; }
.ps-log-note { color: var(--ink-2); }
.ps-log-acct { font-size: 11px; color: var(--muted); }
.ps-foot { font-size: 11.5px; color: var(--muted); line-height: 1.55; }
@media (max-width: 760px) { .ps-prop { flex-direction: column; align-items: stretch; } .ps-log-row { grid-template-columns: 70px 50px 1fr; } .ps-log-note, .ps-log-acct { grid-column: 3; } }
`;

window.PaperSim = PaperSim;