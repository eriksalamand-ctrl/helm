// screener.jsx — Market scanner across US / Canada / Crypto. Distinct from Strategy Lab
// (which proposes trades on YOUR book) — this discovers candidates across a broad universe.
// Reuses window.signalsFor. Click a row to expand the rationale behind the score & action.
const { useState: useScrState } = React;

const scUP = "#0e9f6e", scDN = "#e02424", scWARN = "#d97706";
const scMoney = (n) => "$" + (n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n.toFixed(2));

// seeded price-path generator (deterministic spark for universe names)
function scSpark(seed, n = 28) {
  let s = seed * 9301 + 49297; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const drift = (rnd() - 0.45) * 0.9; const out = []; let v = 100;
  for (let i = 0; i < n; i++) { v = v * (1 + drift / n + (rnd() - 0.5) * 0.05); out.push(v); }
  return out;
}

// representative liquid universe per market (deterministic scores via hash-based fundamentals)
const UNIVERSE = [
  // ---- US ----
  ["AAPL","Apple","US","Tech",268,0.5],["MSFT","Microsoft","US","Tech",505,0.7],["NVDA","NVIDIA","US","Semiconductors",205,0],
  ["AMZN","Amazon","US","Consumer",225,0],["GOOGL","Alphabet","US","Tech",195,0],["META","Meta Platforms","US","Tech",720,0.4],
  ["TSLA","Tesla","US","Consumer",360,0],["AMD","Adv. Micro Devices","US","Semiconductors",165,0],["AVGO","Broadcom","US","Semiconductors",440,1.2],
  ["NFLX","Netflix","US","Consumer",710,0],["JPM","JPMorgan","US","Financials",215,2.2],["V","Visa","US","Financials",285,0.8],
  ["UNH","UnitedHealth","US","Healthcare",520,1.5],["XOM","Exxon Mobil","US","Energy",112,3.3],["CVX","Chevron","US","Energy",152,4.1],
  ["COST","Costco","US","Consumer",890,0.5],["LLY","Eli Lilly","US","Healthcare",780,0.7],["HD","Home Depot","US","Consumer",385,2.4],
  ["KO","Coca-Cola","US","Consumer",62,3.0],["WMT","Walmart","US","Consumer",78,1.2],
  ["SOXX","iShares Semiconductor ETF","US","Semiconductors",255,0.6],["PLTR","Palantir","US","Software",78,0],
  ["ARM","Arm Holdings","US","Semiconductors",148,0],["ARKK","ARK Innovation ETF","US","Innovation",62,0],["COIN","Coinbase","US","Financials",235,0],
  ["CRM","Salesforce","US","Software",330,0.6],["NOW","ServiceNow","US","Software",1020,0],
  ["MU","Micron","US","Semiconductors",105,0.4],["MRVL","Marvell","US","Semiconductors",92,0.3],["SNOW","Snowflake","US","Software",185,0],
  ["UBER","Uber","US","Technology",78,0],["SHOP","Shopify","US","Software",95,0],["ANET","Arista Networks","US","Technology",110,0],
  ["VST","Vistra","US","Utilities",165,0.6],["CEG","Constellation Energy","US","Utilities",285,0.5],["DELL","Dell Technologies","US","Technology",128,1.5],
  ["TSM","Taiwan Semi","US","Semiconductors",215,1.2],["ASML","ASML Holding","US","Semiconductors",950,0.9],["PANW","Palo Alto Networks","US","Software",195,0],
  ["ARKW","ARK Next-Gen Internet","US","Innovation",95,0],["ARKG","ARK Genomic","US","Innovation",28,0],
  // ---- US: financials / healthcare / industrials / consumer / energy (broadens beyond mega-cap tech) ----
  ["BAC","Bank of America","US","Financials",48,2.3],["WFC","Wells Fargo","US","Financials",78,2.1],["GS","Goldman Sachs","US","Financials",620,1.8],
  ["MS","Morgan Stanley","US","Financials",145,1.9],["SCHW","Charles Schwab","US","Financials",92,1.3],["BLK","BlackRock","US","Financials",1080,1.9],
  ["AXP","American Express","US","Financials",320,1.0],["MA","Mastercard","US","Financials",560,0.5],["PYPL","PayPal","US","Financials",72,0],
  ["SOFI","SoFi Technologies","US","Financials",14,0],["HOOD","Robinhood","US","Financials",58,0],["AFRM","Affirm","US","Financials",58,0],
  ["JNJ","Johnson & Johnson","US","Healthcare",162,3.1],["PFE","Pfizer","US","Healthcare",26,6.5],["ABBV","AbbVie","US","Healthcare",192,3.2],
  ["MRK","Merck","US","Healthcare",92,3.6],["ABT","Abbott Labs","US","Healthcare",118,1.8],["TMO","Thermo Fisher","US","Healthcare",520,0.3],
  ["DHR","Danaher","US","Healthcare",215,0.5],["ISRG","Intuitive Surgical","US","Healthcare",545,0],["VRTX","Vertex Pharma","US","Healthcare",470,0],["REGN","Regeneron","US","Healthcare",620,0.4],
  ["CAT","Caterpillar","US","Industrials",395,1.7],["DE","Deere & Co","US","Industrials",425,1.4],["GE","GE Aerospace","US","Industrials",210,0.5],
  ["HON","Honeywell","US","Industrials",230,1.9],["RTX","RTX Corp","US","Industrials",135,2.0],["LMT","Lockheed Martin","US","Industrials",485,2.6],
  ["BA","Boeing","US","Industrials",178,0],["UPS","United Parcel Service","US","Industrials",122,5.5],["UNP","Union Pacific","US","Industrials",235,2.2],
  ["MCD","McDonald's","US","Consumer",295,2.4],["SBUX","Starbucks","US","Consumer",92,2.7],["NKE","Nike","US","Consumer",72,2.1],
  ["TGT","Target","US","Consumer",132,3.3],["LOW","Lowe's","US","Consumer",245,1.9],["PG","Procter & Gamble","US","Consumer",165,2.4],
  ["PEP","PepsiCo","US","Consumer",145,3.6],["DIS","Walt Disney","US","Consumer",112,0.9],["BKNG","Booking Holdings","US","Consumer",4950,0.5],
  ["ABNB","Airbnb","US","Consumer",135,0],["DASH","DoorDash","US","Consumer",185,0],["RIVN","Rivian","US","Consumer",13,0],
  ["LCID","Lucid Group","US","Consumer",3.2,0],["GM","General Motors","US","Consumer",52,1.0],["F","Ford Motor","US","Consumer",11,4.8],
  ["CELH","Celsius Holdings","US","Consumer",38,0],["COP","ConocoPhillips","US","Energy",98,3.1],["SLB","Schlumberger","US","Energy",42,2.6],["OXY","Occidental Petroleum","US","Energy",48,1.7],
  // ---- US: broader tech / semis / software / growth ----
  ["ORCL","Oracle","US","Software",178,0.8],["IBM","IBM","US","Software",245,2.9],["INTC","Intel","US","Semiconductors",28,1.9],
  ["QCOM","Qualcomm","US","Semiconductors",165,2.0],["TXN","Texas Instruments","US","Semiconductors",195,2.8],["ADBE","Adobe","US","Software",440,0],
  ["INTU","Intuit","US","Software",640,0.5],["ADI","Analog Devices","US","Semiconductors",225,1.6],["LRCX","Lam Research","US","Semiconductors",95,0.8],
  ["KLAC","KLA Corp","US","Semiconductors",720,0.7],["CDNS","Cadence Design","US","Software",305,0],["SNPS","Synopsys","US","Software",480,0],
  ["DDOG","Datadog","US","Software",130,0],["ZS","Zscaler","US","Software",210,0],["CRWD","CrowdStrike","US","Software",395,0],
  ["NET","Cloudflare","US","Software",115,0],["MDB","MongoDB","US","Software",240,0],["TEAM","Atlassian","US","Software",210,0],
  ["RBLX","Roblox","US","Software",68,0],["ROKU","Roku","US","Software",78,0],["RKLB","Rocket Lab","US","Aerospace",28,0],
  ["IONQ","IonQ","US","Technology",32,0],["NEE","NextEra Energy","US","Utilities",72,2.9],["FSLR","First Solar","US","Utilities",195,0],
  ["ENPH","Enphase Energy","US","Technology",68,0],["TMUS","T-Mobile US","US","Telecom",235,1.5],["CMCSA","Comcast","US","Telecom",38,3.4],
  // ---- Canada (.TO) ----
  ["RY.TO","Royal Bank","CA","Financials",168,3.6],["TD.TO","TD Bank","CA","Financials",82,5.1],["ENB.TO","Enbridge","CA","Energy",58,6.5],
  ["CNQ.TO","Cdn Natural Res","CA","Energy",47,4.4],["SHOP.TO","Shopify","CA","Tech",145,0],["BNS.TO","Scotiabank","CA","Financials",70,6.0],
  ["BMO.TO","Bank of Montreal","CA","Financials",128,4.8],["CP.TO","Cdn Pacific Kansas","CA","Industrials",108,0.7],["CNR.TO","Cdn National Rail","CA","Industrials",148,2.2],
  ["SU.TO","Suncor Energy","CA","Energy",54,4.0],["ATD.TO","Couche-Tard","CA","Consumer",78,0.9],["BCE.TO","BCE","CA","Telecom",38,8.5],
  ["NTR.TO","Nutrien","CA","Materials",68,4.3],["CSU.TO","Constellation Sw","CA","Tech",4200,0.1],["FNV.TO","Franco-Nevada","CA","Materials",185,1.1],
  ["HPS-A.TO","Hammond Power Solutions","CA","Industrials",128,0.7],["CLS.TO","Celestica","CA","Technology",185,0],["WSP.TO","WSP Global","CA","Industrials",265,0.6],
  // ---- Canada (.TO): broader TSX coverage — financials, energy, industrials, staples ----
  ["GIB-A.TO","CGI Inc","CA","Software",165,0],["L.TO","Loblaw Companies","CA","Consumer",215,1.0],["DOL.TO","Dollarama","CA","Consumer",145,0.3],
  ["MG.TO","Magna International","CA","Consumer",62,4.5],["TRP.TO","TC Energy","CA","Energy",68,4.9],["PPL.TO","Pembina Pipeline","CA","Energy",52,5.2],
  ["ABX.TO","Barrick Mining","CA","Materials",28,2.1],["K.TO","Kinross Gold","CA","Materials",18,1.1],["WCN.TO","Waste Connections","CA","Industrials",245,0.6],
  ["TIH.TO","Toromont Industries","CA","Industrials",128,1.2],["TFII.TO","TFI International","CA","Industrials",125,1.3],["MFC.TO","Manulife Financial","CA","Financials",42,3.9],
  ["SLF.TO","Sun Life Financial","CA","Financials",84,3.9],["IFC.TO","Intact Financial","CA","Financials",255,1.7],["POW.TO","Power Corp of Canada","CA","Financials",56,4.2],
  ["QSR.TO","Restaurant Brands Intl","CA","Consumer",92,3.4],["CTC-A.TO","Canadian Tire","CA","Consumer",165,3.9],["SAP.TO","Saputo","CA","Consumer",28,2.4],
  ["IMO.TO","Imperial Oil","CA","Energy",108,2.2],["OVV.TO","Ovintiv","CA","Energy",58,2.6],["TOU.TO","Tourmaline Oil","CA","Energy",68,3.1],
  ["ARX.TO","ARC Resources","CA","Energy",28,2.7],["NPI.TO","Northland Power","CA","Utilities",24,4.8],["BEP-UN.TO","Brookfield Renewable","CA","Utilities",32,5.6],
  ["BAM.TO","Brookfield Asset Mgmt","CA","Financials",68,3.0],["BN.TO","Brookfield Corp","CA","Financials",78,0.5],["DOO.TO","BRP Inc","CA","Consumer",78,2.3],
  ["CCL-B.TO","CCL Industries","CA","Materials",78,1.3],["STN.TO","Stantec","CA","Industrials",135,0.6],["GFL.TO","GFL Environmental","CA","Industrials",58,0.2],
  // ---- Crypto ----
  ["BTC","Bitcoin","Crypto","Crypto",61000,0],["ETH","Ethereum","Crypto","Crypto",2950,0],["SOL","Solana","Crypto","Crypto",69,0],
  ["XRP","XRP","Crypto","Crypto",1.14,0],["BNB","BNB","Crypto","Crypto",595,0],["ADA","Cardano","Crypto","Crypto",0.62,0],
  ["DOGE","Dogecoin","Crypto","Crypto",0.083,0],["LINK","Chainlink","Crypto","Crypto",7.9,0],["AVAX","Avalanche","Crypto","Crypto",24,0],
  ["DOT","Polkadot","Crypto","Crypto",4.2,0],["SUI","Sui","Crypto","Crypto",0.72,0],["TRX","TRON","Crypto","Crypto",0.32,0],
  ["LTC","Litecoin","Crypto","Crypto",118,0],["NEAR","NEAR Protocol","Crypto","Crypto",5.8,0],["ATOM","Cosmos","Crypto","Crypto",8.5,0],["APT","Aptos","Crypto","Crypto",9.2,0],
  // ---- Canada ETFs (.TO) · curated liquid, Nov-2025 NBC ETF directory ----
  ["VFV.TO","Vanguard S&P 500 Index","CA-ETF","US Equity",148,1.2],["ZSP.TO","BMO S&P 500 Index","CA-ETF","US Equity",94,1.1],
  ["XIC.TO","iShares Core S&P/TSX Composite","CA-ETF","CA Equity",48,2.3],["XIU.TO","iShares S&P/TSX 60","CA-ETF","CA Equity",45,2.5],
  ["XEF.TO","iShares Core MSCI EAFE IMI","CA-ETF","Intl Equity",37,2.9],["ZCN.TO","BMO S&P/TSX Capped Composite","CA-ETF","CA Equity",38,2.6],
  ["ZAG.TO","BMO Aggregate Bond Index","CA-ETF","Fixed Income",14,3.4],["VCN.TO","Vanguard FTSE Canada All Cap","CA-ETF","CA Equity",52,2.5],
  ["ZEA.TO","BMO MSCI EAFE Index","CA-ETF","Intl Equity",24,2.8],["XUS.TO","iShares Core S&P 500","CA-ETF","US Equity",58,1.2],
  ["HXT.TO","Global X S&P/TSX 60","CA-ETF","CA Equity",75,0],["VDY.TO","Vanguard FTSE Cdn Hi-Div Yield","CA-ETF","CA Dividend",46,4.2],
  ["XEI.TO","iShares S&P/TSX Comp High Div","CA-ETF","CA Dividend",30,4.8],["XDV.TO","iShares Cdn Select Dividend","CA-ETF","CA Dividend",33,4.4],
  ["ZLB.TO","BMO Low Vol Canadian Equity","CA-ETF","CA Low Vol",48,2.3],["ZWB.TO","BMO Covered Call Cdn Banks","CA-ETF","Covered Call",19,7.1],
  ["ZWC.TO","BMO CA High Div Covered Call","CA-ETF","Covered Call",18,7.4],["VGRO.TO","Vanguard Growth ETF Portfolio","CA-ETF","Asset Alloc",36,1.9],
  ["VBAL.TO","Vanguard Balanced ETF Portfolio","CA-ETF","Asset Alloc",32,2.2],["XBAL.TO","iShares Core Balanced ETF","CA-ETF","Asset Alloc",31,2.3],
  ["XEG.TO","iShares S&P/TSX Capped Energy","CA-ETF","CA Energy",18,3.1],["ZUB.TO","BMO Equal Weight US Banks Hgd","CA-ETF","US Financials",36,2.0],
  ["BTCC.TO","Purpose Bitcoin ETF","CA-ETF","Crypto",12,0],["ETHX.B.TO","CI Galaxy Ethereum","CA-ETF","Crypto",18,0],
  // ---- US ETFs · curated liquid, Nov-2025 NBC ETF directory ----
  ["SPY","SPDR S&P 500 Trust","US-ETF","US Equity",595,1.2],["IVV","iShares Core S&P 500","US-ETF","US Equity",598,1.3],
  ["VTI","Vanguard Total Stock Market","US-ETF","US Equity",295,1.3],["QQQ","Invesco QQQ Trust","US-ETF","US Tech",515,0.6],
  ["VEA","Vanguard FTSE Developed Mkts","US-ETF","Intl Equity",52,3.0],["VTV","Vanguard Value","US-ETF","US Value",172,2.1],
  ["BND","Vanguard Total Bond Market","US-ETF","Fixed Income",73,3.6],["GLD","SPDR Gold Shares","US-ETF","Gold",245,0],
  ["IWF","iShares Russell 1000 Growth","US-ETF","US Growth",420,0.5],["VGT","Vanguard Info Technology","US-ETF","US Tech",615,0.6],
  ["VIG","Vanguard Dividend Appreciation","US-ETF","US Dividend",200,1.7],["IJH","iShares Core S&P Mid-Cap","US-ETF","US Mid Cap",325,1.2],
  ["XLK","Technology Select Sector SPDR","US-ETF","US Tech",240,0.6],["IJR","iShares Core S&P Small-Cap","US-ETF","US Small Cap",120,1.4],
  ["IBIT","iShares Bitcoin Trust","US-ETF","Crypto",58,0],["RSP","Invesco S&P 500 Equal Weight","US-ETF","US Equity",185,1.5],
  ["IWM","iShares Russell 2000","US-ETF","US Small Cap",235,1.2],["IWD","iShares Russell 1000 Value","US-ETF","US Value",195,1.9],
  ["TLT","iShares 20+ Year Treasury","US-ETF","Fixed Income",92,4.0],["XLF","Financial Select Sector SPDR","US-ETF","US Financials",50,1.5],
  ["IAU","iShares Gold Trust","US-ETF","Gold",50,0],["VT","Vanguard Total World Stock","US-ETF","Global Equity",125,1.9],
  ["JEPI","JPMorgan Equity Premium Income","US-ETF","Covered Call",58,7.2],["XLV","Health Care Select Sector SPDR","US-ETF","US Healthcare",148,1.6],
  ["SMH","VanEck Semiconductor","US-ETF","US Semis",265,0.5],["SCHD","Schwab US Dividend Equity","US-ETF","US Dividend",28,3.5],
  ["IEF","iShares 7-10 Year Treasury","US-ETF","Fixed Income",95,3.5],["LQD","iShares iBoxx IG Corp Bond","US-ETF","Fixed Income",110,4.2],
  ["DIA","SPDR Dow Jones Industrial","US-ETF","US Equity",445,1.6],["VB","Vanguard Small-Cap","US-ETF","US Small Cap",245,1.3],
].map(([ticker, name, market, sector, price, divYield], i) => ({ ticker, name, market, sector, price, divYield, spark: scSpark(i + 7) }));

function durationOf(sig) {
  if (sig.action === "Sell") return { k: "Exit now", band: "now" };
  if (sig.rsi < 32 || sig.rsi > 70) return { k: "Days", band: "day" };
  if (sig.trendScore >= 60 && sig.mom >= 55) return { k: "Weeks", band: "week" };
  if (sig.valueScore >= 60 && sig.qualityScore >= 55) return { k: "Years", band: "year" };
  if (sig.valueScore >= 55) return { k: "Months", band: "month" };
  return { k: "Weeks", band: "week" };
}
const durColor = { now: scDN, day: scWARN, week: "#0891b2", month: "#4f46e5", year: scUP };

function scrRationale(h, sig, d, rr) {
  const bits = [];
  bits.push({ k: "Trend / momentum", v: sig.trendScore, why: sig.mom >= 55 ? "uptrend intact" : sig.mom < 42 ? "broken trend — knife risk" : "flat/range" });
  bits.push({ k: "Valuation", v: sig.valueScore, why: sig.valueScore >= 60 ? "attractively valued" : sig.valueScore <= 40 ? "rich" : "fair" });
  bits.push({ k: "Quality", v: sig.qualityScore, why: sig.qualityScore >= 60 ? "high quality" : sig.qualityScore <= 40 ? "low quality" : "average" });
  bits.push({ k: "Mean-reversion (RSI)", v: sig.revScore, why: sig.rsi > 70 ? `overbought ${sig.rsi.toFixed(0)}` : sig.rsi < 32 ? `oversold ${sig.rsi.toFixed(0)}` : `neutral ${sig.rsi.toFixed(0)}` });
  if ((h.divYield || 0) >= 1) bits.push({ k: "Income", v: sig.incomeScore, why: `${h.divYield}% yield` });
  const reg = window.HelmRegime;
  let actionWhy;
  if (sig.action === "Buy") actionWhy = `Composite ${sig.composite} ≥ buy bar with a confirmed trend${sig.rsi < 32 ? " and oversold bounce setup" : ""}.`;
  else if (sig.action === "Sell") actionWhy = sig.sellKind === "Exit" ? `Composite ${sig.composite} is weak or the trend has broken — full exit.` : `Overbought/extended — trim into strength, keep a core.`;
  else actionWhy = `Composite ${sig.composite} is in the hold band — no edge either way right now.`;
  const regWhy = reg ? `Regime ${reg.label} (${reg.bias}) ${/Risk-on|Constructive/.test(reg.bias) ? "supports" : /Risk-off|Defensive/.test(reg.bias) ? "works against" : "is neutral to"} this long.` : "Regime not classified — open Macro → Economic CIO.";
  return { bits, actionWhy, regWhy };
}

const SORTS = [["score", "Score"], ["conf", "Confidence"], ["rr", "R:R"], ["rsi", "RSI"], ["ticker", "Symbol"]];

function Screener({ accent }) {
  const D = window.PMData;
  const [risk, setRisk] = useScrState("balanced");
  const [market, setMarket] = useScrState("US");
  const [filter, setFilter] = useScrState("all");
  const [durF, setDurF] = useScrState("any");
  const [sort, setSort] = useScrState("score");
  const [asc, setAsc] = useScrState(false);
  const [openTkr, setOpenTkr] = useScrState(null);
  const cfg = (window.helmPresetCfg || (() => ({ weights: { trend: 35, value: 20, reversion: 25, income: 20 }, buyBar: 62, sellBar: 40, rsiOver: 72, rsiUnder: 30, stopMult: 1, maxPos: 12 })))(risk);

  if (!window.signalsFor) return <div className="pm-empty">Screener needs the Strategy model — open Strategy Lab once, then return.</div>;

  const heldSet = new Set(D.allHoldings.map((h) => h.ticker));
  let universe = UNIVERSE.filter((u) => market === "all" ? true : u.market === market)
    .map((u) => ({ ...u, held: heldSet.has(u.ticker) }));

  const rows = universe.map((h) => {
    const sig = window.signalsFor(h, cfg);
    const d = durationOf(sig);
    const rr = (sig.target - h.price) / Math.max(0.0001, h.price - sig.stop);
    return { h, sig, d, rr };
  });

  let shown = rows.filter(({ h, sig, d }) => {
    if (filter === "buy" && sig.action !== "Buy") return false;
    if (filter === "held" && !h.held) return false;
    if (durF !== "any" && d.band !== durF) return false;
    return true;
  });
  const key = (r) => sort === "score" ? r.sig.composite : sort === "conf" ? r.sig.conf : sort === "rr" ? r.rr : sort === "rsi" ? r.sig.rsi : r.h.ticker;
  shown.sort((a, b) => { const ka = key(a), kb = key(b); const cmp = typeof ka === "string" ? ka.localeCompare(kb) : ka - kb; return asc ? cmp : -cmp; });

  const clickSort = (k) => { if (sort === k) setAsc((v) => !v); else { setSort(k); setAsc(k === "ticker" || k === "rsi"); } };
  const actTag = (sig) => sig.action === "Buy" ? ["Buy", scUP] : sig.action === "Sell" ? (sig.sellKind === "Exit" ? ["Exit", scDN] : ["Trim", scWARN]) : ["Hold", "var(--muted)"];
  const buys = rows.filter((r) => r.sig.action === "Buy").length;
  const arrow = (k) => sort === k ? (asc ? " ▲" : " ▼") : "";
  const MARKETS = [["US", "US"], ["CA", "Canada"], ["Crypto", "Crypto"], ["all", "All"]];

  return (
    <div className="scr">
      <style>{SCREENER_CSS}</style>
      <section className="pm-card scr-head">
        <div>
          <div className="pm-card-eyebrow">Screener · {universe.length} names · {market === "all" ? "all markets" : market}</div>
          <div className="scr-sub">Scans a broad universe by the model — opportunity score, confidence, TP/SL, reward:risk and expected duration. <strong style={{ color: scUP }}>{buys} buys</strong> at the {risk} preset. Click any row for the rationale.</div>
        </div>
        <div className="scr-risk">
          {["conservative", "balanced", "aggressive"].map((r) => (
            <button key={r} className={risk === r ? "on" : ""} onClick={() => setRisk(r)} style={risk === r ? { borderColor: accent, color: accent } : {}}>{r[0].toUpperCase() + r.slice(1)}</button>
          ))}
        </div>
      </section>

      <section className="pm-card">
        <div className="scr-filters">
          <div className="scr-fgroup">
            <span className="scr-flabel">Market</span>
            {MARKETS.map(([k, l]) => (
              <button key={k} className={`scr-chip${market === k ? " on" : ""}`} onClick={() => setMarket(k)} style={market === k ? { background: accent, borderColor: accent, color: "#fff" } : {}}>{l}</button>
            ))}
          </div>
          <div className="scr-fgroup">
            <span className="scr-flabel">Show</span>
            {[["all", "All"], ["buy", "Buys"], ["held", "Held"]].map(([k, l]) => (
              <button key={k} className={`scr-chip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)} style={filter === k ? { background: accent, borderColor: accent, color: "#fff" } : {}}>{l}</button>
            ))}
          </div>
          <div className="scr-fgroup">
            <span className="scr-flabel">Duration</span>
            {[["any", "Any"], ["day", "Days"], ["week", "Weeks"], ["month", "Months"], ["year", "Years"]].map(([k, l]) => (
              <button key={k} className={`scr-chip${durF === k ? " on" : ""}`} onClick={() => setDurF(k)} style={durF === k ? { background: accent, borderColor: accent, color: "#fff" } : {}}>{l}</button>
            ))}
          </div>
        </div>

        <div className="pm-table-wrap">
          <table className="pm-table scr-table">
            <thead><tr>
              <th className="ta-left scr-sortable" onClick={() => clickSort("ticker")}>Symbol{arrow("ticker")}</th>
              <th className="ta-center">Action</th>
              <th className="ta-right scr-sortable" onClick={() => clickSort("score")}>Score{arrow("score")}</th>
              <th className="ta-right scr-sortable" onClick={() => clickSort("conf")}>Conf.{arrow("conf")}</th>
              <th className="ta-right scr-sortable" onClick={() => clickSort("rsi")}>RSI{arrow("rsi")}</th>
              <th className="ta-right">Price</th>
              <th className="ta-right">SL</th>
              <th className="ta-right">TP</th>
              <th className="ta-right scr-sortable" onClick={() => clickSort("rr")}>R:R{arrow("rr")}</th>
              <th className="ta-center">Duration</th>
            </tr></thead>
            <tbody>
              {shown.map(({ h, sig, d, rr }) => {
                const [al, ac] = actTag(sig);
                const open = openTkr === h.ticker;
                const rat = open ? scrRationale(h, sig, d, rr) : null;
                return (
                  <React.Fragment key={h.ticker}>
                    <tr className={`scr-row${open ? " open" : ""}`} onClick={() => setOpenTkr(open ? null : h.ticker)}>
                      <td className="ta-left">
                        <div className="pm-sym">
                          <div className="pm-sym-badge" style={{ background: accent + "1a", color: accent }}>{h.ticker.replace(".TO", "").slice(0, 3)}</div>
                          <div><div className="pm-sym-tkr">{h.ticker}{h.held ? <span className="scr-held">held</span> : null}<span className="scr-caret">{open ? "▾" : "▸"}</span></div><div className="pm-sym-name">{h.name} · {h.sector}</div></div>
                        </div>
                      </td>
                      <td className="ta-center"><span className="scr-act" style={{ color: ac, background: ac === "var(--muted)" ? "var(--line-2)" : ac + "1a" }}>{al}</span></td>
                      <td className="ta-right mono" style={{ fontWeight: 700, color: sig.composite >= 60 ? scUP : sig.composite <= 40 ? scDN : scWARN }}>{sig.composite}</td>
                      <td className="ta-right mono" style={{ color: "var(--ink-2)" }}>{sig.conf.toFixed(0)}</td>
                      <td className="ta-right mono" style={{ color: sig.rsi > 70 ? scDN : sig.rsi < 32 ? scWARN : "var(--ink-2)" }}>{sig.rsi.toFixed(0)}</td>
                      <td className="ta-right mono">{scMoney(h.price)}</td>
                      <td className="ta-right mono" style={{ color: scDN }}>{scMoney(sig.stop)}</td>
                      <td className="ta-right mono" style={{ color: scUP }}>{scMoney(sig.target)}</td>
                      <td className="ta-right mono" style={{ color: rr >= 2 ? scUP : rr >= 1 ? scWARN : scDN }}>{rr > 0 ? rr.toFixed(1) : "—"}</td>
                      <td className="ta-center"><span className="scr-dur" style={{ color: durColor[d.band], background: durColor[d.band] + "16" }}>{d.k}</span></td>
                    </tr>
                    {open && (
                      <tr className="scr-detail-row"><td colSpan={10}>
                        <div className="scr-detail">
                          <div className="scr-det-l">
                            <div className="scr-det-h">Why score {sig.composite} · {al}</div>
                            <p className="scr-det-action">{rat.actionWhy}</p>
                            <p className="scr-det-reg">{rat.regWhy}</p>
                            <div className="scr-det-meta">
                              <span>Confidence <strong>{sig.conf.toFixed(0)}</strong>/100 <em>(driven by quality)</em></span>
                              <span>Reward:risk <strong>{rr > 0 ? rr.toFixed(1) : "—"}</strong></span>
                              <span>Expected hold <strong>{d.k}</strong></span>
                              {window.helmTradeHorizon ? (() => { const th = window.helmTradeHorizon(sig); return <span title={th.note}>Natural horizon <strong style={{ color: th.kind === "core" ? scUP : th.kind === "quick" ? scWARN : "var(--ink)" }}>{th.tag}</strong></span>; })() : null}
                            </div>
                            {sig.action !== "Hold" && window.TradeButton && (() => {
                              const heldH = window.PMData.allHoldings.find((x) => x.ticker === h.ticker);
                              return <window.TradeButton
                                label={sig.action === "Buy" ? "Log buy" : (sig.sellKind === "Exit" ? "Log exit" : "Log trim")}
                                ticker={h.ticker} side={sig.action === "Buy" ? "buy" : "sell"}
                                acctHint={heldH ? heldH.acct : undefined}
                                source="Screener" fullSell={sig.sellKind === "Exit"} small
                                style={{ marginTop: 10 }} />;
                            })()}
                          </div>
                          <div className="scr-det-r">
                            <div className="scr-det-h">Score breakdown</div>
                            {rat.bits.map((b) => (
                              <div className="scr-bit" key={b.k}>
                                <span className="scr-bit-k">{b.k}</span>
                                <span className="scr-bit-bar"><i style={{ width: b.v + "%", background: b.v >= 60 ? scUP : b.v <= 40 ? scDN : scWARN }} /></span>
                                <span className="scr-bit-v mono">{Math.round(b.v)}</span>
                                <span className="scr-bit-why">{b.why}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && <div className="pm-empty">No names match these filters.</div>}
        <div className="scr-foot"><strong>Score</strong> = opportunity (trend/value/quality/reversion/income) — <em>not</em> confidence, which is a separate column. Universe is a representative liquid set per market (not every listing); prices are static reference quotes. TP/SL scale with volatility &amp; the {risk} preset. Research only.</div>
      </section>
    </div>
  );
}

const SCREENER_CSS = `
.scr { display: flex; flex-direction: column; gap: 16px; }
.scr-head { display: flex; justify-content: space-between; align-items: center; gap: 20px; }
.scr-sub { font-size: 12.5px; color: var(--muted); margin-top: 3px; line-height: 1.5; max-width: 760px; }
.scr-sub strong { color: var(--ink); }
.scr-risk { display: inline-flex; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; flex: none; }
.scr-risk button { font: inherit; font-size: 12.5px; font-weight: 600; padding: 7px 14px; border: 0; border-right: 1px solid var(--line); background: var(--panel-2); color: var(--ink-2); cursor: pointer; }
.scr-risk button:last-child { border-right: 0; }
.scr-risk button.on { background: #fff; }
.scr-filters { display: flex; align-items: center; gap: 22px 28px; flex-wrap: wrap; margin-bottom: 14px; }
.scr-fgroup { display: flex; align-items: center; gap: 6px; }
.scr-flabel { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-right: 2px; }
.scr-chip { font: inherit; font-size: 12px; padding: 5px 11px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel-2); color: var(--ink-2); cursor: pointer; }
.scr-chip:hover { border-color: var(--muted); }
.scr-table td, .scr-table th { padding: 10px 11px; }
.scr-sortable { cursor: pointer; user-select: none; white-space: nowrap; }
.scr-sortable:hover { color: var(--ink); }
.scr-row { cursor: pointer; }
.scr-row:hover { background: var(--panel-2); }
.scr-row.open { background: color-mix(in srgb, var(--accent, #0e9f6e) 6%, #fff); }
.scr-caret { font-size: 10px; color: var(--muted); margin-left: 6px; }
.scr-act { font-size: 11.5px; font-weight: 700; padding: 2px 9px; border-radius: 6px; }
.scr-dur { font-size: 11.5px; font-weight: 600; padding: 2px 9px; border-radius: 6px; }
.scr-held { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); background: var(--line-2); padding: 1px 5px; border-radius: 4px; margin-left: 6px; vertical-align: middle; }
.scr-detail-row td { padding: 0 !important; background: color-mix(in srgb, var(--accent, #0e9f6e) 4%, #fff); }
.scr-detail { display: grid; grid-template-columns: 1fr 1.2fr; gap: 26px; padding: 16px 18px; }
.scr-det-h { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 8px; }
.scr-det-action { font-size: 13px; color: var(--ink); line-height: 1.5; }
.scr-det-reg { font-size: 12.5px; color: var(--ink-2); line-height: 1.5; margin-top: 6px; }
.scr-det-meta { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 12px; font-size: 12px; color: var(--ink-2); }
.scr-det-meta strong { color: var(--ink); }
.scr-det-meta em { font-style: normal; color: var(--muted); font-size: 11px; }
.scr-bit { display: grid; grid-template-columns: 1.4fr 1.4fr 0.4fr 1.4fr; gap: 10px; align-items: center; padding: 5px 0; font-size: 12px; }
.scr-bit-k { color: var(--ink-2); }
.scr-bit-bar { height: 7px; background: var(--line-2); border-radius: 5px; overflow: hidden; }
.scr-bit-bar i { display: block; height: 100%; border-radius: 5px; }
.scr-bit-v { text-align: right; font-size: 11.5px; font-weight: 600; }
.scr-bit-why { color: var(--muted); font-size: 11px; }
.scr-foot { font-size: 11.5px; color: var(--muted); margin-top: 12px; line-height: 1.5; }
.scr-foot strong { color: var(--ink-2); } .scr-foot em { font-style: italic; }
@media (max-width: 820px) { .scr-head { flex-direction: column; align-items: flex-start; } .scr-detail { grid-template-columns: 1fr; gap: 16px; } }
`;

window.Screener = Screener;
window.HelmUniverse = UNIVERSE;
window.helmDurationOf = durationOf;
