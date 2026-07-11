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
    { id: "reer-cad", name: "REER",      ccy: "CAD", label: "CAD · Retirement",       cash: 50000, reg: true },
    { id: "reer-usd", name: "REER USD",  ccy: "USD", label: "USD · Retirement",       cash: 0, reg: true },
    { id: "celi-cad", name: "CELI",      ccy: "CAD", label: "CAD · Tax-free savings", cash: 23000, reg: true },
    { id: "celi-usd", name: "CELI USD",  ccy: "USD", label: "USD · Tax-free savings", cash: 0, reg: true },
    { id: "crypto-direct", name: "Crypto Direct", ccy: "USD", label: "USD · Direct coins (non-reg.)", cash: 0, reg: false },
  ];

  // ---- holdings (native ccy) — real NBDB statement positions, Jun 21 2026 ----
  // day % (d) left at 0; the live feed overwrites it with real intraday moves.
  const raw = [
    // ===== CAD RRSP (reer-cad) =====
    { t: "ETHH.B", n: "Purpose Ether CAD-Hgd", sec: "Crypto",        ccy: "CAD", q: 3558, avg: 10.31558, px: 8.09,  d: 0, acct: "reer-cad", seed: 11 },
    { t: "SOLQ",   n: "3iQ Solana Staking ETF", sec: "Crypto",       ccy: "CAD", q: 3536, avg: 11.1159,  px: 7.95,  d: 0, acct: "reer-cad", seed: 12 },
    { t: "ETHX.B", n: "CI Galaxy Ethereum",      sec: "Crypto",       ccy: "CAD", q: 3446, avg: 10.77494, px: 8.55,  d: 0, acct: "reer-cad", seed: 13 },
    { t: "ETHY.B", n: "Purpose Ether CAD-Hgd",   sec: "Crypto",       ccy: "CAD", q: 2555, avg: 3.72515,  px: 1.65,  d: 0, acct: "reer-cad", seed: 14 },
    { t: "COPR",   n: "Coppernico Metals",        sec: "Materials",    ccy: "CAD", q: 1600, avg: 0.495,    px: 0.370, d: 0, acct: "reer-cad", seed: 15 },
    { t: "HCAL",   n: "Hamilton Enh Cdn Bank ETF",sec: "ETF",          ccy: "CAD", q: 361,  avg: 25.279,   px: 48.80, d: 0, acct: "reer-cad", seed: 16 },
    { t: "URC",    n: "Uranium Royalty",          sec: "Materials",    ccy: "CAD", q: 200,  avg: 5.475,    px: 4.18,  d: 0, acct: "reer-cad", seed: 17 },
    { t: "CSH.UN", n: "Chartwell Retirement",     sec: "Real Estate",  ccy: "CAD", q: 138,  avg: 17.01268, px: 21.58, d: 0, acct: "reer-cad", seed: 18 },
    { t: "DND",    n: "Dye & Durham",             sec: "Software",     ccy: "CAD", q: 125,  avg: 6.986,    px: 1.82,  d: 0, acct: "reer-cad", seed: 19 },
    { t: "VLE",    n: "Valeura Energy",           sec: "Energy",       ccy: "CAD", q: 120,  avg: 4.32317,  px: 11.16, d: 0, acct: "reer-cad", seed: 20 },
    { t: "THX",    n: "Thor Explorations",        sec: "Materials",    ccy: "CAD", q: 119,  avg: 1.42076,  px: 1.16,  d: 0, acct: "reer-cad", seed: 21 },
    { t: "BTCY.B", n: "Purpose Bitcoin CAD-Hgd",  sec: "Crypto",       ccy: "CAD", q: 100,  avg: 5.03,     px: 5.36,  d: 0, acct: "reer-cad", seed: 22 },
    { t: "DHT.UN", n: "DRI Healthcare Trust",     sec: "Healthcare",   ccy: "CAD", q: 98,   avg: 11.88061, px: 17.96, d: 0, acct: "reer-cad", seed: 23 },
    { t: "AP.UN",  n: "Allied Properties REIT",   sec: "Real Estate",  ccy: "CAD", q: 89,   avg: 16.1718,  px: 10.22, d: 0, acct: "reer-cad", seed: 24 },
    { t: "LSPD",   n: "Lightspeed Commerce",      sec: "Software",     ccy: "CAD", q: 49,   avg: 19.32918, px: 13.29, d: 0, acct: "reer-cad", seed: 25 },
    { t: "MDA",    n: "MDA Space Ltd",            sec: "Aerospace",    ccy: "CAD", q: 45,   avg: 39.60,    px: 59.11, d: 0, acct: "reer-cad", seed: 26 },
    { t: "SHLD",   n: "Global X Defence ETF",     sec: "ETF",          ccy: "CAD", q: 40,   avg: 28.44,    px: 25.30, d: 0, acct: "reer-cad", seed: 27 },
    { t: "BTCC.B", n: "Purpose Bitcoin Non-Hgd",  sec: "Crypto",       ccy: "CAD", q: 38,   avg: 16.38947, px: 12.35, d: 0, acct: "reer-cad", seed: 28 },
    { t: "ATD",    n: "Alimentation Couche-Tard", sec: "Consumer",     ccy: "CAD", q: 32,   avg: 84.22,    px: 82.37, d: 0, acct: "reer-cad", seed: 29 },
    { t: "ZWP",    n: "BMO Euro Hi Div Cov ETF",  sec: "ETF",          ccy: "CAD", q: 31,   avg: 19.30355, px: 21.12, d: 0, acct: "reer-cad", seed: 30 },
    { t: "ADEN",   n: "Adentra Inc",              sec: "Industrials",  ccy: "CAD", q: 30,   avg: 29.72,    px: 35.19, d: 0, acct: "reer-cad", seed: 31 },
    { t: "QQC",    n: "Invesco NASDAQ 100 ETF",   sec: "ETF",          ccy: "CAD", q: 21,   avg: 51.07,    px: 51.22, d: 0, acct: "reer-cad", seed: 32 },
    { t: "ASML",   n: "ASML Holding CDR",         sec: "Semiconductors",ccy:"CAD", q: 20,   avg: 47.40,    px: 53.80, d: 0, acct: "reer-cad", seed: 33 },
    { t: "FCUV",   n: "Fidelity US Value ETF",    sec: "ETF",          ccy: "CAD", q: 20,   avg: 27.29,    px: 27.45, d: 0, acct: "reer-cad", seed: 34 },
    { t: "LAC",    n: "Lithium Americas",         sec: "Materials",    ccy: "CAD", q: 20,   avg: 7.57,     px: 6.14,  d: 0, acct: "reer-cad", seed: 35 },
    { t: "ENB",    n: "Enbridge Inc",             sec: "Energy",       ccy: "CAD", q: 15,   avg: 56.01533, px: 77.47, d: 0, acct: "reer-cad", seed: 36 },
    { t: "MDI",    n: "Major Drilling Group",     sec: "Industrials",  ccy: "CAD", q: 15,   avg: 8.54533,  px: 15.27, d: 0, acct: "reer-cad", seed: 37 },
    { t: "TECK.B", n: "Teck Resources B",         sec: "Materials",    ccy: "CAD", q: 14,   avg: 75.96,    px: 88.93, d: 0, acct: "reer-cad", seed: 38 },
    { t: "ZGI",    n: "BMO Glb Infras Index ETF", sec: "ETF",          ccy: "CAD", q: 10,   avg: 53.00,    px: 59.16, d: 0, acct: "reer-cad", seed: 39 },
    { t: "EFX",    n: "Enerflex Ltd",             sec: "Energy",       ccy: "CAD", q: 10,   avg: 31.59,    px: 35.11, d: 0, acct: "reer-cad", seed: 40 },
    { t: "X",      n: "TMX Group",                sec: "Financials",   ccy: "CAD", q: 7,    avg: 45.88143, px: 47.44, d: 0, acct: "reer-cad", seed: 41 },
    { t: "BTCC",   n: "Purpose Bitcoin ETF Hgd",  sec: "Crypto",       ccy: "CAD", q: 6,    avg: 14.55,    px: 11.09, d: 0, acct: "reer-cad", seed: 42 },
    { t: "DRM",    n: "Dream Unlimited A",        sec: "Real Estate",  ccy: "CAD", q: 3,    avg: 22.15,    px: 19.75, d: 0, acct: "reer-cad", seed: 43 },
    { t: "XCH",    n: "iShares China Index ETF",  sec: "ETF",          ccy: "CAD", q: 1,    avg: 24.60,    px: 22.50, d: 0, acct: "reer-cad", seed: 44 },

    // ===== CAD TFSA (celi-cad) =====
    { t: "SOLQ",   n: "3iQ Solana Staking ETF",   sec: "Crypto",       ccy: "CAD", q: 1575, avg: 11.47139, px: 7.95,  d: 0, acct: "celi-cad", seed: 45 },
    { t: "ETHX.B", n: "CI Galaxy Ethereum",       sec: "Crypto",       ccy: "CAD", q: 1419, avg: 11.29871, px: 8.55,  d: 0, acct: "celi-cad", seed: 46 },
    { t: "ETHH.B", n: "Purpose Ether CAD-Hgd",    sec: "Crypto",       ccy: "CAD", q: 1445, avg: 10.30268, px: 8.09,  d: 0, acct: "celi-cad", seed: 47 },
    { t: "ETHY.B", n: "Purpose Ether CAD-Hgd",    sec: "Crypto",       ccy: "CAD", q: 507,  avg: 3.2511,   px: 1.65,  d: 0, acct: "celi-cad", seed: 48 },
    { t: "COPR",   n: "Coppernico Metals",         sec: "Materials",    ccy: "CAD", q: 1125, avg: 0.45489,  px: 0.370, d: 0, acct: "celi-cad", seed: 49 },
    { t: "BIGT",   n: "Big Tree Carbon",           sec: "Materials",    ccy: "CAD", q: 1000, avg: 0.0075,   px: 0.015, d: 0, acct: "celi-cad", seed: 50 },
    { t: "VLE",    n: "Valeura Energy",            sec: "Energy",       ccy: "CAD", q: 130,  avg: 4.28792,  px: 11.16, d: 0, acct: "celi-cad", seed: 51 },
    { t: "MNC",    n: "Magnetic North Acquis",     sec: "Financials",   ccy: "CAD", q: 110,  avg: 0.11682,  px: 0.001, d: 0, acct: "celi-cad", seed: 52 },
    { t: "HCAL",   n: "Hamilton Enh Cdn Bank ETF", sec: "ETF",          ccy: "CAD", q: 102,  avg: 35.12059, px: 48.80, d: 0, acct: "celi-cad", seed: 53 },
    { t: "URC",    n: "Uranium Royalty",           sec: "Materials",    ccy: "CAD", q: 100,  avg: 5.475,    px: 4.18,  d: 0, acct: "celi-cad", seed: 54 },
    { t: "GPUS",   n: "Alset AI Ventures",         sec: "Software",     ccy: "CAD", q: 100,  avg: 0.23,     px: 0.135, d: 0, acct: "celi-cad", seed: 55 },
    { t: "PNG",    n: "Kraken Robotics",           sec: "Industrials",  ccy: "CAD", q: 55,   avg: 5.79273,  px: 7.60,  d: 0, acct: "celi-cad", seed: 56 },
    { t: "LSPD",   n: "Lightspeed Commerce",       sec: "Software",     ccy: "CAD", q: 46,   avg: 24.35,    px: 13.29, d: 0, acct: "celi-cad", seed: 57 },
    { t: "KEY",    n: "Keyera Corp",               sec: "Energy",       ccy: "CAD", q: 39,   avg: 50.55333, px: 56.46, d: 0, acct: "celi-cad", seed: 58 },
    { t: "ZWU",    n: "BMO Covered Call Util ETF", sec: "ETF",          ccy: "CAD", q: 34,   avg: 11.65706, px: 11.95, d: 0, acct: "celi-cad", seed: 59 },
    { t: "MDA",    n: "MDA Space Ltd",             sec: "Aerospace",    ccy: "CAD", q: 30,   avg: 39.61,    px: 59.11, d: 0, acct: "celi-cad", seed: 60 },
    { t: "FRSH",   n: "FreshLocal Solutions",      sec: "Software",     ccy: "CAD", q: 24,   avg: 0.385,    px: 0.385, d: 0, acct: "celi-cad", seed: 61 },
    { t: "SHLD",   n: "Global X Defence ETF",      sec: "ETF",          ccy: "CAD", q: 20,   avg: 28.44,    px: 25.30, d: 0, acct: "celi-cad", seed: 62 },
    { t: "FCUV",   n: "Fidelity US Value ETF",     sec: "ETF",          ccy: "CAD", q: 20,   avg: 27.30,    px: 27.45, d: 0, acct: "celi-cad", seed: 63 },
    { t: "AP.UN",  n: "Allied Properties REIT",    sec: "Real Estate",  ccy: "CAD", q: 20,   avg: 10.37,    px: 10.22, d: 0, acct: "celi-cad", seed: 64 },
    { t: "X",      n: "TMX Group",                 sec: "Financials",   ccy: "CAD", q: 20,   avg: 29.30,    px: 47.44, d: 0, acct: "celi-cad", seed: 65 },
    { t: "TSLA",   n: "Tesla CDR (CAD-Hgd)",       sec: "Auto",         ccy: "CAD", q: 20,   avg: 37.76,    px: 34.60, d: 0, acct: "celi-cad", seed: 66 },
    { t: "ATD",    n: "Alimentation Couche-Tard",  sec: "Consumer",     ccy: "CAD", q: 17,   avg: 73.32176, px: 82.37, d: 0, acct: "celi-cad", seed: 67 },
    { t: "NVDA",   n: "NVIDIA CDR (CAD-Hgd)",      sec: "Semiconductors",ccy:"CAD", q: 16,   avg: 48.09,    px: 46.95, d: 0, acct: "celi-cad", seed: 68 },
    { t: "RUS",    n: "Russel Metals",             sec: "Materials",    ccy: "CAD", q: 15,   avg: 48.57,    px: 63.37, d: 0, acct: "celi-cad", seed: 69 },
    { t: "ENB",    n: "Enbridge Inc",              sec: "Energy",       ccy: "CAD", q: 13,   avg: 67.86538, px: 77.47, d: 0, acct: "celi-cad", seed: 70 },
    { t: "ASML",   n: "ASML Holding CDR",          sec: "Semiconductors",ccy:"CAD", q: 10,   avg: 47.40,    px: 53.80, d: 0, acct: "celi-cad", seed: 71 },
    { t: "QQC",    n: "Invesco NASDAQ 100 ETF",    sec: "ETF",          ccy: "CAD", q: 10,   avg: 51.06,    px: 51.22, d: 0, acct: "celi-cad", seed: 72 },
    { t: "LAC",    n: "Lithium Americas",          sec: "Materials",    ccy: "CAD", q: 10,   avg: 7.57,     px: 6.14,  d: 0, acct: "celi-cad", seed: 73 },
    { t: "DFSC",   n: "Defence Technologies",      sec: "Industrials",  ccy: "CAD", q: 10,   avg: 4.11,     px: 4.77,  d: 0, acct: "celi-cad", seed: 74 },
    { t: "CJT",    n: "Cargojet Inc",              sec: "Industrials",  ccy: "CAD", q: 9,    avg: 129.87111,px: 81.62, d: 0, acct: "celi-cad", seed: 75 },
    { t: "MTCH",   n: "Match Group",               sec: "Software",     ccy: "CAD", q: 9,    avg: 58.46222, px: 50.17, d: 0, acct: "celi-cad", seed: 76 },
    { t: "MTY",    n: "MTY Food Group",            sec: "Consumer",     ccy: "CAD", q: 8,    avg: 44.145,   px: 39.19, d: 0, acct: "celi-cad", seed: 77 },
    { t: "X.TMX",  n: "TMX Group",                 sec: "Financials",   ccy: "CAD", q: 7,    avg: 45.88,    px: 47.44, d: 0, acct: "celi-cad", seed: 78 },
    { t: "BNS",    n: "Bank of Nova Scotia",       sec: "Financials",   ccy: "CAD", q: 6,    avg: 82.375,   px: 123.48,d: 0, acct: "celi-cad", seed: 79 },
    { t: "ZGI",    n: "BMO Glb Infras Index ETF",  sec: "ETF",          ccy: "CAD", q: 6,    avg: 53.01,    px: 59.16, d: 0, acct: "celi-cad", seed: 80 },
    { t: "CNR",    n: "Canadian National Railway", sec: "Industrials",  ccy: "CAD", q: 5,    avg: 145.852,  px: 159.73,d: 0, acct: "celi-cad", seed: 81 },
    { t: "EFX",    n: "Enerflex Ltd",              sec: "Energy",       ccy: "CAD", q: 5,    avg: 31.59,    px: 35.11, d: 0, acct: "celi-cad", seed: 82 },
    { t: "MTL",    n: "Mullen Group",              sec: "Industrials",  ccy: "CAD", q: 5,    avg: 11.75,    px: 21.78, d: 0, acct: "celi-cad", seed: 83 },
    { t: "DRM",    n: "Dream Unlimited A",         sec: "Real Estate",  ccy: "CAD", q: 4,    avg: 23.48,    px: 19.75, d: 0, acct: "celi-cad", seed: 84 },
    { t: "MATR",   n: "Mattr Corp",                sec: "Industrials",  ccy: "CAD", q: 4,    avg: 14.7925,  px: 12.61, d: 0, acct: "celi-cad", seed: 85 },
    { t: "GSY",    n: "goeasy Ltd",                sec: "Financials",   ccy: "CAD", q: 2,    avg: 36.17,    px: 41.60, d: 0, acct: "celi-cad", seed: 86 },
    { t: "BIP.UN", n: "Brookfield Infra Partners", sec: "Real Estate",  ccy: "CAD", q: 1,    avg: 44.71,    px: 52.11, d: 0, acct: "celi-cad", seed: 87 },
    { t: "MHCD",   n: "Middlefield Hlth Div ETF",  sec: "ETF",          ccy: "CAD", q: 1,    avg: 11.83,    px: 11.28, d: 0, acct: "celi-cad", seed: 88 },
    { t: "TOI",    n: "Topicus.com Inc",           sec: "Software",     ccy: "CAD", q: 1,    avg: 76.51,    px: 98.44, d: 0, acct: "celi-cad", seed: 89 },

    // ===== USD TFSA (celi-usd) =====
    { t: "HIMS",   n: "Hims & Hers Health",        sec: "Healthcare",   ccy: "USD", q: 21,   avg: 24.77095, px: 35.47, d: 0, acct: "celi-usd", seed: 90 },
    { t: "ETOR",   n: "eToro Group",               sec: "Fintech",      ccy: "USD", q: 15,   avg: 39.60,    px: 39.09, d: 0, acct: "celi-usd", seed: 91 },
    { t: "EDSA",   n: "Edesa Biotech",             sec: "Healthcare",   ccy: "USD", q: 15,   avg: 10.42467, px: 7.35,  d: 0, acct: "celi-usd", seed: 92 },
    { t: "DFH",    n: "Dream Finders Homes",       sec: "Consumer",     ccy: "USD", q: 10,   avg: 20.362,   px: 15.60, d: 0, acct: "celi-usd", seed: 93 },
    { t: "ETHA",   n: "iShares Ethereum Trust",    sec: "Crypto",       ccy: "USD", q: 9,    avg: 12.39667, px: 12.88, d: 0, acct: "celi-usd", seed: 94 },
    { t: "CRCL",   n: "Circle Internet Group",     sec: "Fintech",      ccy: "USD", q: 8,    avg: 103.96,   px: 80.23, d: 0, acct: "celi-usd", seed: 95 },
    { t: "PINS",   n: "Pinterest Inc",             sec: "Software",     ccy: "USD", q: 8,    avg: 24.42625, px: 20.27, d: 0, acct: "celi-usd", seed: 96 },
    { t: "TAN",    n: "Invesco Solar ETF",         sec: "ETF",          ccy: "USD", q: 7,    avg: 69.20143, px: 60.58, d: 0, acct: "celi-usd", seed: 97 },
    { t: "MNSB",   n: "Mainstreet Bancshares",     sec: "Financials",   ccy: "USD", q: 7,    avg: 21.52286, px: 23.86, d: 0, acct: "celi-usd", seed: 98 },
    { t: "BMNR",   n: "Bitmine Immersion Tech",    sec: "Crypto",       ccy: "USD", q: 6,    avg: 19.36,    px: 16.14, d: 0, acct: "celi-usd", seed: 99 },
    { t: "NVDA",   n: "NVIDIA Corp",               sec: "Semiconductors",ccy:"USD", q: 5,    avg: 215.356,  px: 210.69,d: 0, acct: "celi-usd", seed: 100 },
    { t: "LUMN",   n: "Lumen Technologies",        sec: "Telecom",      ccy: "USD", q: 14,   avg: 6.235,    px: 8.20,  d: 0, acct: "celi-usd", seed: 101 },
    { t: "COHN",   n: "Cohen & Company",           sec: "Financials",   ccy: "USD", q: 3,    avg: 12.20667, px: 11.90, d: 0, acct: "celi-usd", seed: 102 },
    { t: "HPQ",    n: "HP Inc",                     sec: "Hardware",     ccy: "USD", q: 3,    avg: 29.43,    px: 23.50, d: 0, acct: "celi-usd", seed: 103 },
    { t: "IREN",   n: "IREN Ltd",                  sec: "Crypto",       ccy: "USD", q: 3,    avg: 61.38,    px: 59.96, d: 0, acct: "celi-usd", seed: 104 },
    { t: "SSRM",   n: "SSR Mining",                sec: "Materials",    ccy: "USD", q: 3,    avg: 30.91,    px: 30.95, d: 0, acct: "celi-usd", seed: 105 },
    { t: "VEA",    n: "Vanguard FTSE Dev Mkt ETF", sec: "ETF",          ccy: "USD", q: 3,    avg: 60.55333, px: 72.31, d: 0, acct: "celi-usd", seed: 106 },
    { t: "AMD",    n: "Advanced Micro Devices",    sec: "Semiconductors",ccy:"USD", q: 2,    avg: 494.95,   px: 537.37,d: 0, acct: "celi-usd", seed: 107 },
    { t: "TSLA",   n: "Tesla Inc",                 sec: "Auto",         ccy: "USD", q: 2,    avg: 431.965,  px: 400.49,d: 0, acct: "celi-usd", seed: 108 },

    // ===== USD RRSP (reer-usd) =====
    { t: "TSM",    n: "Taiwan Semiconductor ADR",  sec: "Semiconductors",ccy:"USD", q: 4,    avg: 94.01,    px: 462.12,d: 0, acct: "reer-usd", seed: 109 },
    { t: "TSLA",   n: "Tesla Inc",                 sec: "Auto",         ccy: "USD", q: 2,    avg: 363.195,  px: 400.49,d: 0, acct: "reer-usd", seed: 110 },
    { t: "VEA",    n: "Vanguard FTSE Dev Mkt ETF", sec: "ETF",          ccy: "USD", q: 4,    avg: 71.275,   px: 72.31, d: 0, acct: "reer-usd", seed: 111 },
    { t: "IREN",   n: "IREN Ltd",                  sec: "Crypto",       ccy: "USD", q: 6,    avg: 61.38,    px: 59.96, d: 0, acct: "reer-usd", seed: 112 },
    { t: "COIN",   n: "Coinbase Global",           sec: "Fintech",      ccy: "USD", q: 2,    avg: 298.795,  px: 163.26,d: 0, acct: "reer-usd", seed: 113 },
    { t: "LUMN",   n: "Lumen Technologies",        sec: "Telecom",      ccy: "USD", q: 10,   avg: 6.778,    px: 8.20,  d: 0, acct: "reer-usd", seed: 114 },
    { t: "EDSA",   n: "Edesa Biotech",             sec: "Healthcare",   ccy: "USD", q: 11,   avg: 11.70455, px: 7.35,  d: 0, acct: "reer-usd", seed: 115 },
    { t: "TAN",    n: "Invesco Solar ETF",         sec: "ETF",          ccy: "USD", q: 4,    avg: 71.0825,  px: 60.58, d: 0, acct: "reer-usd", seed: 116 },
    { t: "SSRM",   n: "SSR Mining",                sec: "Materials",    ccy: "USD", q: 3,    avg: 30.88,    px: 30.95, d: 0, acct: "reer-usd", seed: 117 },
    { t: "HPQ",    n: "HP Inc",                     sec: "Hardware",     ccy: "USD", q: 3,    avg: 29.37667, px: 23.50, d: 0, acct: "reer-usd", seed: 118 },
    { t: "CRCL",   n: "Circle Internet Group",     sec: "Fintech",      ccy: "USD", q: 1,    avg: 105.30,   px: 80.23, d: 0, acct: "reer-usd", seed: 119 },

    // ===== Crypto Direct — non-registered exchange account (spot coins, USD), Jun 18 2026 =====
    { t: "XRP",    n: "XRP",                       sec: "Crypto", ccy: "USD", q: 25169,  avg: 0.9095,  px: 1.136,   d: 0, acct: "crypto-direct", seed: 120 },
    { t: "LINK",   n: "Chainlink",                 sec: "Crypto", ccy: "USD", q: 2257.2, avg: 10.33,   px: 7.87,    d: 0, acct: "crypto-direct", seed: 121 },
    { t: "SUI",    n: "Sui",                        sec: "Crypto", ccy: "USD", q: 22472,  avg: 1.1616,  px: 0.7188,  d: 0, acct: "crypto-direct", seed: 122 },
    { t: "SOL",    n: "Solana",                     sec: "Crypto", ccy: "USD", q: 138.18, avg: 78.64,   px: 68.82,   d: 0, acct: "crypto-direct", seed: 123 },
    { t: "ONDO",   n: "Ondo Finance",              sec: "Crypto", ccy: "USD", q: 17280,  avg: 0.2826,  px: 0.3506,  d: 0, acct: "crypto-direct", seed: 124 },
    { t: "TRX",    n: "TRON",                       sec: "Crypto", ccy: "USD", q: 17798,  avg: 0.1091,  px: 0.319,   d: 0, acct: "crypto-direct", seed: 125 },
    { t: "TAO",    n: "Bittensor",                  sec: "Crypto", ccy: "USD", q: 20.31,  avg: 254.76,  px: 233.46,  d: 0, acct: "crypto-direct", seed: 126 },
    { t: "RENDER", n: "Render",                     sec: "Crypto", ccy: "USD", q: 1103.9, avg: 1.838,   px: 1.66,    d: 0, acct: "crypto-direct", seed: 127 },
    { t: "DOGE",   n: "Dogecoin",                   sec: "Crypto", ccy: "USD", q: 5695,   avg: 0.230,   px: 0.08257, d: 0, acct: "crypto-direct", seed: 128 },
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

  // ---- live feed adapter: patch holdings from quotes.json + prices.json + fx.json ----
  // Crypto ETFs track their underlying coin's daily move (price level differs, so we apply
  // only the % change from the coin quote, keeping the ETF's own price level).
  const ETF_UNDERLYING = { "SOLQ": "SOL", "ETHX.B": "ETH" };

  function applyLive(feed) {
    if (!feed) return false;
    let touched = 0, fxSet = false;
    if (feed.fx && feed.fx.USDCAD) { FX = feed.fx.USDCAD; fxSet = true; }
    const q = feed.quotes || {};
    const px = feed.prices || {};

    const recompute = (h) => {
      h.marketValue = h.price * h.shares;
      h.plAbs = h.marketValue - h.costBasis;
      h.plPct = h.costBasis ? (h.plAbs / h.costBasis) * 100 : 0;
      h.dayAbs = h.marketValue - h.marketValue / (1 + h.dayPct / 100);
      h.annualIncome = h.marketValue * h.divYield / 100;
    };

    allHoldings.forEach((h) => {
      const k = q[h.ticker];
      if (k && k.last) {                    // direct live quote (US stocks, matched tickers)
        h.price = k.last;
        if (k.chgPct != null) h.dayPct = k.chgPct;
        recompute(h); touched++; return;
      }
      const series = px[h.ticker];          // EOD close history for this exact ticker
      if (Array.isArray(series) && series.length) {
        const last = series[series.length - 1], prev = series[series.length - 2] || last;
        h.price = last.c;
        if (prev.c) h.dayPct = (last.c / prev.c - 1) * 100;
        recompute(h); touched++; return;
      }
      const under = ETF_UNDERLYING[h.ticker]; // crypto ETF → apply underlying's day move
      if (under && q[under] && q[under].chgPct != null) {
        h.dayPct = q[under].chgPct;
        recompute(h); touched++; return;
      }
    });

    Object.assign(window.PMData, buildView("all")); // refresh default snapshot
    // live if we patched any holding; partial-live if only FX refreshed
    return { touched, live: touched > 0 || fxSet, partial: touched === 0 && fxSet };
  }

  window.PMData = {
    accounts, allHoldings, watchlist, movers, sp500, nasdaq, DAYS, DONUT_COLORS, FX,
    buildView, buildRendement, priceHistory, applyLive,
    setDispCcy: (c) => { DISP = c; }, getDispCcy: () => DISP,
    getFx: () => FX,
    ...buildView("all"),
  };
})();
