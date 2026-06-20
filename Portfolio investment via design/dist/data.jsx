// data.jsx — portfolio data modeled on real NBDB accounts (Eric Salamand)
// All client-side, illustrative. Prices in each holding's native currency.
(function () {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function series(seed, days, startVal, totalReturn, vol) {
    // walk that lands near startVal*(1+totalReturn)
    const rnd = mulberry32(seed);
    const out = []; let v = startVal;
    const drift = Math.pow(1 + totalReturn, 1 / days) - 1;
    for (let i = 0; i < days; i++) { v = v * (1 + drift + (rnd() - 0.5) * 2 * vol); out.push(v); }
    const end = out[out.length - 1], target = startVal * (1 + totalReturn);
    for (let i = 0; i < out.length; i++) out[i] = out[i] * (target / end) ** (i / (out.length - 1)) ;
    return out;
  }
  function spark(seed, n, up) {
    const rnd = mulberry32(seed); const out = []; let v = 50;
    for (let i = 0; i < n; i++) { v += (rnd() - (up ? 0.42 : 0.58)) * 6; out.push(v); }
    return out;
  }
  // longer daily history for research charts (5y ≈ 1260d)
  function priceHistory(seed, days, endPrice, totalReturn, vol) {
    const s = series(seed, days, endPrice / (1 + totalReturn), totalReturn, vol);
    return s;
  }

  let FX = 1.4174; // USD -> CAD (mutable: live feed can update it)
  const DAYS = 252;
  const DONUT_COLORS = ["#0e9f6e", "#4f46e5", "#d97706", "#0ea5e9", "#e02424", "#7c3aed", "#0891b2", "#94a3b8"];

  // ---- accounts (real NBDB structure) ----
  const accounts = [
    { id: "reer-cad", name: "REER",      ccy: "CAD", label: "CAD · Retirement",       cash: 44803.61, reg: true },
    { id: "reer-usd", name: "REER USD",  ccy: "USD", label: "USD · Retirement",       cash: 446.08, reg: true },
    { id: "celi-cad", name: "CELI",      ccy: "CAD", label: "CAD · Tax-free savings", cash: 22753.59, reg: true },
    { id: "celi-usd", name: "CELI USD",  ccy: "USD", label: "USD · Tax-free savings", cash: 84.62, reg: true },
  ];

  // ---- holdings (native ccy). Real CAD REER rows from statement; others plausible ----
  const raw = [
    // CAD REER (6683FZS) — real
    { t: "SOLQ",  n: "3iQ Solana Staking ETF",   sec: "Crypto",         ccy: "CAD", q: 3536, avg: 11.1159, px: 7.97,  d: 0.25,  acct: "reer-cad", seed: 11 },
    { t: "ETHX.B",n: "CI Galaxy Ethereum",       sec: "Crypto",         ccy: "CAD", q: 3446, avg: 10.77494,px: 8.56,  d: 0.12,  acct: "reer-cad", seed: 12 },
    { t: "HCAL",  n: "Hamilton CA Fin Yield ETF",sec: "Financials",     ccy: "CAD", q: 1200, avg: 18.50,   px: 18.90, d: 0.42,  acct: "reer-cad", seed: 13 },
    { t: "MDA",   n: "MDA Space Ltd",             sec: "Aerospace",      ccy: "CAD", q: 800,  avg: 22.00,   px: 28.00, d: 4.28,  acct: "reer-cad", seed: 14 },
    { t: "VLE",   n: "Valeura Energy",            sec: "Energy",         ccy: "CAD", q: 3000, avg: 7.20,    px: 5.20,  d: 3.03,  acct: "reer-cad", seed: 15 },
    { t: "ATD",   n: "Alimentation Couche-Tard",  sec: "Consumer",       ccy: "CAD", q: 32,   avg: 84.22,   px: 82.11, d: -0.40, acct: "reer-cad", seed: 16 },
    { t: "CSH.UN",n: "Chartwell Retirement",      sec: "Real Estate",    ccy: "CAD", q: 138,  avg: 17.01268,px: 21.54, d: 0.09,  acct: "reer-cad", seed: 17 },
    { t: "AP.UN", n: "Allied Properties REIT",    sec: "Real Estate",    ccy: "CAD", q: 89,   avg: 16.1718, px: 10.20, d: 0.89,  acct: "reer-cad", seed: 18 },
    { t: "ADEN",  n: "Adentra Inc",               sec: "Industrials",    ccy: "CAD", q: 30,   avg: 29.72,   px: 35.34, d: 0.71,  acct: "reer-cad", seed: 19 },
    { t: "ASML",  n: "ASML Holding CDR",          sec: "Semiconductors", ccy: "CAD", q: 20,   avg: 47.40,   px: 54.40, d: -0.75, acct: "reer-cad", seed: 20 },
    { t: "TECK.B",n: "Teck Resources",            sec: "Materials",      ccy: "CAD", q: 150,  avg: 48.88,   px: 31.90, d: 1.10,  acct: "reer-cad", seed: 21 },
    { t: "ZWP",   n: "BMO Euro Hi Div Cov ETF",   sec: "ETF",            ccy: "CAD", q: 31,   avg: 19.30355,px: 21.07, d: 0.24,  acct: "reer-cad", seed: 22 },
    { t: "ZGI",   n: "BMO Glb Infras Index ETF",  sec: "ETF",            ccy: "CAD", q: 10,   avg: 53.00,   px: 59.16, d: 0.63,  acct: "reer-cad", seed: 23 },
    { t: "COPR",  n: "Coppernico Metals",         sec: "Materials",      ccy: "CAD", q: 1600, avg: 0.495,   px: 0.370, d: -1.33, acct: "reer-cad", seed: 24 },
    { t: "DRM",   n: "Dream Unlimited A",         sec: "Real Estate",    ccy: "CAD", q: 3,    avg: 22.15,   px: 19.63, d: -0.15, acct: "reer-cad", seed: 25 },
    // USD REER — small, +37%
    { t: "NVDA",  n: "NVIDIA Corp",               sec: "Semiconductors", ccy: "USD", q: 12,   avg: 100.0,   px: 142.62,d: 3.41,  acct: "reer-usd", seed: 26 },
    { t: "AVGO",  n: "Broadcom Inc",              sec: "Semiconductors", ccy: "USD", q: 8,    avg: 110.3,   px: 178.66,d: 2.71,  acct: "reer-usd", seed: 27 },
    { t: "MSFT",  n: "Microsoft Corp",            sec: "Software",       ccy: "USD", q: 3,    avg: 360.0,   px: 438.10,d: -0.74, acct: "reer-usd", seed: 28 },
    // CELI CAD (6683FZW) — ~63k, real account is down ~13.8%
    { t: "ENB",   n: "Enbridge Inc",              sec: "Energy",         ccy: "CAD", q: 300,  avg: 60.0,    px: 53.0,  d: 0.51,  acct: "celi-cad", seed: 29 },
    { t: "RY",    n: "Royal Bank of Canada",      sec: "Financials",     ccy: "CAD", q: 80,   avg: 180.0,   px: 168.0, d: 0.34,  acct: "celi-cad", seed: 30 },
    { t: "CNR",   n: "Canadian National Railway", sec: "Industrials",    ccy: "CAD", q: 60,   avg: 185.0,   px: 158.0, d: -0.22, acct: "celi-cad", seed: 31 },
    { t: "SHOP",  n: "Shopify Inc",               sec: "Software",       ccy: "CAD", q: 140,  avg: 125.0,   px: 98.77, d: 1.88,  acct: "celi-cad", seed: 32 },
    { t: "T",     n: "Telus Corp",                sec: "Telecom",        ccy: "CAD", q: 480,  avg: 25.0,    px: 22.0,  d: -0.45, acct: "celi-cad", seed: 33 },
    // USD CELI — ~6.8k, roughly flat/slightly down
    { t: "AAPL",  n: "Apple Inc",                 sec: "Hardware",       ccy: "USD", q: 12,   avg: 230.0,   px: 229.87,d: 0.92,  acct: "celi-usd", seed: 34 },
    { t: "COIN",  n: "Coinbase Global",           sec: "Fintech",        ccy: "USD", q: 8,    avg: 340.0,   px: 311.40,d: 6.83,  acct: "celi-usd", seed: 35 },
    { t: "TSLA",  n: "Tesla Inc",                 sec: "Auto",           ccy: "USD", q: 6,    avg: 250.0,   px: 248.50,d: -1.96, acct: "celi-usd", seed: 36 },
  ];

  const allHoldings = raw.map((h) => {
    const marketValue = h.px * h.q;
    const costBasis = h.avg * h.q;
    const plAbs = marketValue - costBasis;
    const plPct = (plAbs / costBasis) * 100;
    const dayAbs = marketValue - marketValue / (1 + h.d / 100);
    const divYield = ({ ETF: 3.2, "Real Estate": 5.4, Energy: 4.1, Financials: 4.6, Telecom: 6.8 }[h.sec]) || 0;
    return {
      ticker: h.t, name: h.n, sector: h.sec, ccy: h.ccy, shares: h.q, avgCost: h.avg,
      price: h.px, dayPct: h.d, acct: h.acct, seed: h.seed,
      marketValue, costBasis, plAbs, plPct, dayAbs, divYield,
      annualIncome: marketValue * divYield / 100,
      spark: spark(h.seed, 32, plPct > 0),
    };
  });

  const toCAD = (v, ccy) => (ccy === "USD" ? v * FX : v);
  let DISP = "CAD"; // display currency
  function convert(v, from) {
    if (from === DISP) return v;
    if (from === "USD" && DISP === "CAD") return v * FX;
    if (from === "CAD" && DISP === "USD") return v / FX;
    return v;
  }

  function buildView(acctId) {
    const isAll = acctId === "all";
    const isCrypto = acctId === "crypto";
    let holdings, cashRaw, cashCcy;
    if (isAll) {
      holdings = allHoldings.slice();
      cashRaw = accounts.map((a) => convert(a.cash, a.ccy)).reduce((s, x) => s + x, 0);
      cashCcy = DISP;
    } else if (isCrypto) {
      holdings = allHoldings.filter((h) => h.sector === "Crypto");
      cashRaw = 0; cashCcy = DISP;
    } else {
      const acct = accounts.find((a) => a.id === acctId);
      holdings = allHoldings.filter((h) => h.acct === acctId);
      cashRaw = acct ? convert(acct.cash, acct.ccy) : 0; cashCcy = DISP;
    }
    const cash = cashRaw; // already in DISP
    const conv = (h) => convert(h.marketValue, h.ccy);
    const convC = (h) => convert(h.costBasis, h.ccy);
    const convD = (h) => convert(h.dayAbs, h.ccy);

    const totalValue = holdings.reduce((s, h) => s + conv(h), 0);
    const totalCost = holdings.reduce((s, h) => s + convC(h), 0);
    const equity = totalValue + cash;
    const dispH = holdings.map((h) => ({ ...h, dispValue: conv(h), weight: equity ? (conv(h) / equity) * 100 : 0 }));
    dispH.sort((a, b) => b.dispValue - a.dispValue);

    const dayChangeAbs = holdings.reduce((s, h) => s + convD(h), 0);
    const dayChangePct = equity ? (dayChangeAbs / (equity - dayChangeAbs)) * 100 : 0;
    const totalPlAbs = totalValue - totalCost;
    const totalPlPct = totalCost ? (totalPlAbs / totalCost) * 100 : 0;
    const income = holdings.reduce((s, h) => s + convert(h.annualIncome, h.ccy), 0);

    // 1Y series ending at equity, shaped by total return
    const seed = isAll ? 2024 : 3000 + acctId.length * 31;
    const portfolio = series(seed, DAYS, equity / (1 + totalPlPct / 100), totalPlPct / 100, 0.012);
    const pEnd = portfolio[portfolio.length - 1];
    for (let i = 0; i < portfolio.length; i++) portfolio[i] = (portfolio[i] / pEnd) * equity;

    // allocation by sector
    const map = {};
    dispH.forEach((h) => { map[h.sector] = (map[h.sector] || 0) + h.dispValue; });
    const allocation = Object.entries(map).map(([name, value]) => ({ name, value, pct: (value / equity) * 100 }))
      .sort((a, b) => b.value - a.value);
    if (cash > 0) allocation.push({ name: "Cash", value: cash, pct: (cash / equity) * 100 });

    return {
      holdings: dispH, allocation, portfolio,
      kpis: { equity, totalValue, cash, totalCost, dayChangeAbs, dayChangePct,
              totalPlAbs, totalPlPct, ytdReturnPct: totalPlPct, income, ccy: DISP, targetPct: 60, fx: FX },
    };
  }

  const sp500 = series(7, DAYS, 100, 0.16, 0.007);
  const nasdaq = series(13, DAYS, 100, 0.24, 0.010);
  for (let i = sp500.length - 1; i >= 0; i--) sp500[i] = (sp500[i] / sp500[0]) * 100;
  for (let i = nasdaq.length - 1; i >= 0; i--) nasdaq[i] = (nasdaq[i] / nasdaq[0]) * 100;

  const watchlist = [
    { ticker: "SMCI", name: "Super Micro",  price:  48.21, dayPct:  7.62, seed: 101 },
    { ticker: "ARM",  name: "Arm Holdings", price: 138.90, dayPct:  3.05, seed: 102 },
    { ticker: "MU",   name: "Micron Tech",  price: 102.34, dayPct: -2.41, seed: 103 },
    { ticker: "DND",  name: "Dye & Durham", price:  14.20, dayPct:  2.94, seed: 104 },
    { ticker: "GPUS", name: "Hyperscale",   price:   2.10, dayPct:  3.57, seed: 105 },
    { ticker: "EFX",  name: "Enerflex",     price:  11.80, dayPct:  3.04, seed: 106 },
  ].map((w) => ({ ...w, spark: spark(w.seed, 28, w.dayPct > 0) }));
  const movers = [...allHoldings, ...watchlist].sort((a, b) => b.dayPct - a.dayPct);

  // ---- RENDEMENT: real CELI-CAD figures; generated for others ----
  const REAL = {
    "celi-cad": {
      annual: {
        labels: ["2022", "2023", "2024", "2025", "Année courante"],
        ret:    [-59.91, 56.83, 52.43, -6.83, -21.48],
        sharpe: [-0.89, 2.44, 0.76, -0.14, -1.67],
        initial:[40835.28, 29850.56, 62884.51, 107486.44, 97346.68],
        inflow: [20490.72, 14837.35, 8000.00, 7001.00, 8000.00],
        outflow:[-1234.35, -1385.52, -769.51, -11500.00, -717.34],
        variation:[-30241.09, 19582.12, 37371.44, -5640.76, -20548.00],
        final:  [29850.56, 62884.51, 107486.44, 97346.68, 84081.34],
      },
      cumul: {
        labels: ["3 mois", "6 mois", "1 an", "3 ans", "5 ans", "Depuis l'ouverture"],
        ret:    [-7.12, -22.36, -6.12, 12.52, -3.64, -2.51],
        sharpe: [-0.90, -1.71, -0.20, 0.19, -0.10, -0.08],
      },
    },
  };

  function genRows(seed, labels, start, scale) {
    const rnd = mulberry32(seed); let value = start; const rows = [];
    for (let i = 0; i < labels.length; i++) {
      const ret = ((rnd() - 0.45) * 2) * scale;
      const inflow = Math.round(rnd() * start * 0.1);
      const outflow = -Math.round(rnd() * start * 0.04);
      const base = value + inflow + outflow;
      const variation = base * (ret / 100);
      const final = base + variation;
      rows.push({ label: labels[i], ret, sharpe: ret / 100 / 0.18, initial: value, inflow, outflow, variation, final });
      value = final;
    }
    return rows;
  }
  function realRows(block) {
    return block.labels.map((label, i) => ({
      label, ret: block.ret[i], sharpe: block.sharpe[i],
      initial: block.initial ? block.initial[i] : 0,
      inflow: block.inflow ? block.inflow[i] : 0,
      outflow: block.outflow ? block.outflow[i] : 0,
      variation: block.variation ? block.variation[i] : 0,
      final: block.final ? block.final[i] : 0,
    }));
  }
  function cumulFromIndividual(rows, cumulBlock) {
    // build cumulative rows; if real cumul provided use it, else compound
    if (cumulBlock) return realRows(cumulBlock);
    let cumR = 1, cumV = 0;
    return rows.map((r) => { cumR *= 1 + r.ret / 100; cumV += r.variation;
      return { label: r.label, ret: (cumR - 1) * 100, sharpe: r.sharpe, variation: cumV,
               initial: rows[0].initial, inflow: r.inflow, outflow: r.outflow, final: r.final }; });
  }

  function buildRendement(acctId) {
    const real = REAL[acctId];
    const start = buildView(acctId).kpis.equity / 2.2 || 40000;
    const seed = 51 + acctId.length * 13;
    const annualLabels = ["2022", "2023", "2024", "2025", "Année courante"];
    const monthLabels = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    const cumulLabels = ["3 mois", "6 mois", "1 an", "3 ans", "5 ans", "Depuis l'ouverture"];

    const annualInd = real ? realRows(real.annual) : genRows(seed, annualLabels, start, 34);
    const annualCum = real ? realRows(real.cumul) : cumulFromIndividual(genRows(seed + 1, cumulLabels, start, 18));
    const monthInd = genRows(seed + 3, monthLabels, start * 1.6, 7);
    const monthCum = cumulFromIndividual(genRows(seed + 4, ["1 mois", "3 mois", "6 mois", "ÀCJ", "1 an"], start * 1.6, 6));

    return {
      annual: { individual: annualInd, cumulative: annualCum },
      monthly: { individual: monthInd, cumulative: monthCum },
    };
  }

  // ---- live feed adapter: patch holdings from quotes.json / fx.json, then refresh snapshot ----
  function applyLive(feed) {
    if (!feed) return false;
    if (feed.fx && feed.fx.USDCAD) FX = feed.fx.USDCAD;
    const q = feed.quotes || {};
    let touched = 0;
    allHoldings.forEach((h) => {
      const k = q[h.ticker];
      if (k && k.last) {
        h.price = k.last;
        if (k.chgPct != null) h.dayPct = k.chgPct;
        h.marketValue = h.price * h.shares;
        h.plAbs = h.marketValue - h.costBasis;
        h.plPct = h.costBasis ? (h.plAbs / h.costBasis) * 100 : 0;
        h.dayAbs = h.marketValue - h.marketValue / (1 + h.dayPct / 100);
        h.annualIncome = h.marketValue * h.divYield / 100;
        touched++;
      }
    });
    Object.assign(window.PMData, buildView("all")); // refresh default snapshot
    return touched > 0;
  }

  window.PMData = {
    accounts, allHoldings, watchlist, movers, sp500, nasdaq, DAYS, DONUT_COLORS, FX,
    buildView, buildRendement, priceHistory, applyLive,
    setDispCcy: (c) => { DISP = c; }, getDispCcy: () => DISP,
    getFx: () => FX,
    ...buildView("all"),
  };
})();
