// realtrades.js — log REAL trades against your REAL accounts.
// Honest scope: Helm has no brokerage connection and places no orders anywhere. This module
// lets you RECORD a trade you made (or are about to make) at your broker so Holdings /
// Performance / Dashboard reflect it. Persisted to this browser only. Replays on every load
// by patching window.PMData.accounts / allHoldings in place — same technique applyLive uses
// to patch prices, so every downstream view (which calls D.buildView()) sees it for free.
(function () {
  const LS_KEY = "helm_real_trades_v1";

  function loadLog() {
    try { const v = JSON.parse(localStorage.getItem(LS_KEY)); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function saveLog(l) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(l)); } catch (e) {}
  }

  let log = loadLog();
  let updateCb = null;
  let replayed = false;
  function notify() { if (updateCb) updateCb(); }

  // small deterministic-ish spark for a freshly-created position (no history to draw from)
  function miniSpark(seedN, up) {
    let s = Math.abs(Math.floor(seedN)) || 7, v = 100;
    const out = [];
    for (let i = 0; i < 32; i++) {
      s = (s * 9301 + 49297) % 233280;
      const r = (s / 233280 - 0.5) * 2;
      v = Math.max(1, v + r * 1.1 + (up ? 0.12 : -0.12));
      out.push(v);
    }
    return out;
  }

  function acctById(id) {
    const D = window.PMData;
    return D && (D.accounts || []).find((a) => a.id === id);
  }

  // apply ONE trade's effect to the live in-memory model (mutates in place; never
  // reassigns D.allHoldings / D.accounts, so data.jsx's internal closures stay in sync)
  function applyOne(tr) {
    const D = window.PMData;
    if (!D || !tr || !tr.acct || !tr.ticker) return;
    const acct = acctById(tr.acct);
    if (!acct) return;

    if (tr.side === "buy") {
      acct.cash = (acct.cash || 0) - tr.amount;
      const h = D.allHoldings.find((x) => x.ticker === tr.ticker && x.acct === tr.acct);
      if (h) {
        const newShares = h.shares + tr.shares;
        const newCost = h.costBasis + tr.amount;
        h.shares = newShares;
        h.costBasis = newCost;
        h.avgCost = newShares ? newCost / newShares : h.avgCost;
        h.price = tr.price;
        h.marketValue = h.price * h.shares;
        h.plAbs = h.marketValue - h.costBasis;
        h.plPct = h.costBasis ? (h.plAbs / h.costBasis) * 100 : 0;
      } else {
        D.allHoldings.push({
          ticker: tr.ticker, name: tr.name || tr.ticker, sector: tr.sector || "\u2014",
          ccy: tr.ccy || acct.ccy, shares: tr.shares, avgCost: tr.price, price: tr.price,
          dayPct: 0, acct: tr.acct, seed: Math.floor(Math.random() * 900) + 100,
          marketValue: tr.price * tr.shares, costBasis: tr.price * tr.shares,
          plAbs: 0, plPct: 0, dayAbs: 0, divYield: 0, annualIncome: 0,
          spark: miniSpark(tr.ticker.length * 13 + tr.shares, true), _logged: true,
        });
      }
    } else { // sell / trim
      const idx = D.allHoldings.findIndex((x) => x.ticker === tr.ticker && x.acct === tr.acct);
      if (idx === -1) return;
      const h = D.allHoldings[idx];
      const sellShares = Math.min(h.shares, tr.shares);
      const costPortion = h.avgCost * sellShares;
      h.shares -= sellShares;
      h.costBasis -= costPortion;
      acct.cash = (acct.cash || 0) + tr.amount;
      if (h.shares <= 1e-6) {
        D.allHoldings.splice(idx, 1);
      } else {
        h.marketValue = h.price * h.shares;
        h.plAbs = h.marketValue - h.costBasis;
        h.plPct = h.costBasis ? (h.plAbs / h.costBasis) * 100 : 0;
      }
    }
    if (D.buildView) Object.assign(D, D.buildView("all"));
  }

  function replay() {
    if (replayed || !window.PMData) return;
    replayed = true;
    log.slice().reverse().forEach(applyOne); // oldest first
    if (window.PMData.buildView) Object.assign(window.PMData, window.PMData.buildView("all"));
  }

  function priceFor(ticker) {
    const D = window.PMData;
    if (!D) return null;
    const h = (D.allHoldings || []).find((x) => x.ticker === ticker);
    if (h) return h.price;
    const w = (D.watchlist || []).find((x) => x.ticker === ticker);
    if (w) return w.price;
    return null;
  }

  function tickerMenu() {
    const D = window.PMData;
    if (!D) return [];
    const seen = {}, out = [];
    (D.allHoldings || []).forEach((h) => {
      if (!seen[h.ticker]) { seen[h.ticker] = 1; out.push({ ticker: h.ticker, name: h.name, ccy: h.ccy, sector: h.sector }); }
    });
    (D.watchlist || []).forEach((w) => {
      if (!seen[w.ticker]) { seen[w.ticker] = 1; out.push({ ticker: w.ticker, name: w.name, ccy: "USD", sector: "\u2014" }); }
    });
    return out;
  }

  // accounts eligible to hold a given ticker: direct coin -> Crypto Direct only;
  // else match currency (USD assets can also sit in the Crypto Direct USD sleeve)
  function eligibleAccounts(ticker) {
    const D = window.PMData;
    if (!D) return [];
    const held = (D.allHoldings || []).filter((h) => h.ticker === ticker);
    const known = tickerMenu().find((m) => m.ticker === ticker);
    // a ticker can be held in more than one currency (e.g. NVDA + its CAD-hedged CDR) —
    // offer accounts matching ANY held currency, not just the first lot's
    const ccys = held.length ? [...new Set(held.map((h) => h.ccy))] : (known && known.ccy ? [known.ccy] : []);
    const sector = (held[0] && held[0].sector) || (known && known.sector) || null;
    // a direct (non-ETF-wrapped) coin ticker not currently held outside Crypto Direct -> Crypto Direct only
    const directCoinGuess = sector === "Crypto" && !/\.(TO|B|U)$/i.test(ticker || "");
    if (directCoinGuess && !held.some((h) => h.acct !== "crypto-direct")) {
      const cd = D.accounts.find((a) => a.id === "crypto-direct");
      if (cd) return [cd.id];
    }
    if (ccys.length) return D.accounts.filter((a) => ccys.includes(a.ccy)).map((a) => a.id);
    return D.accounts.map((a) => a.id);
  }

  function holdingsFor(ticker, acctId) {
    const D = window.PMData;
    if (!D) return null;
    return (D.allHoldings || []).find((x) => x.ticker === ticker && x.acct === acctId) || null;
  }

  window.HelmRealTrades = {
    init(onUpdate) { updateCb = onUpdate; },
    getLog: () => log,
    priceFor, tickerMenu, eligibleAccounts, holdingsFor, acctById,
    log(trade) {
      const entry = Object.assign(
        { id: "t" + Date.now() + Math.floor(Math.random() * 1000), ts: Date.now(), date: new Date().toISOString().slice(0, 10) },
        trade
      );
      log = [entry, ...log].slice(0, 500);
      saveLog(log);
      applyOne(entry);
      notify();
      return entry;
    },
    undo(id) {
      const entry = log.find((e) => e.id === id);
      if (!entry) return;
      applyOne(Object.assign({}, entry, { side: entry.side === "buy" ? "sell" : "buy" }));
      log = log.filter((e) => e.id !== id);
      saveLog(log);
      notify();
    },
  };

  replay(); // data.jsx has already run by this point in script order — replay immediately, no flash
})();
