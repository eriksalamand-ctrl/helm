// transmission-graph.js — curated dependency graph: geopolitics → supply chain → tickers.
// Plain JS (no Babel). Hand-checkable, versioned. Built with LLM assistance, maintained
// quarterly. Every path ends at tickers so alerts can end at YOUR dollars.
// Node kinds: chokepoint | country | commodity | sector-node | ticker.
// Chokepoint fields: kw (GDELT/Finnhub headline regex), speed (how fast a shock reaches
// prices: days | weeks | months), mode: "directional" (default) or "volatility" —
// volatility = unforecastable actor (e.g. executive-order shocks): the graph maps WHO is
// exposed but refuses a directional call; stance becomes sizing/stops, not buy/sell.
// Edge: [from, to, relation, weight −1..1 (transmission strength; sign = direction)].
// SIGN RULE (weights MULTIPLY along a path — two negatives would read as "benefits"):
//   • an edge OUT OF a chokepoint or a price/stress node carries DIRECTION (− = the target is hurt);
//   • an edge out of a SECTOR-HEALTH node (ca-exporters, banks-sector, defense-sector…) is pure
//     TRANSMISSION and stays POSITIVE — members move WITH their sector, beta in the magnitude.
// Getting this wrong silently inverts an alert (r3 fixed Taiwan→TSM and the CA tariff wall).
window.HelmGraph = {
  version: "2026-07 r3",

  chokepoints: {
    "taiwan-strait": { name: "Taiwan Strait", speed: "days", kw: /taiwan|tsmc|strait of taiwan|chinese military|pla drill/i },
    "hormuz": { name: "Strait of Hormuz", speed: "days", kw: /hormuz|iran|persian gulf|gulf tanker|opec escort/i },
    "suez": { name: "Suez / Red Sea", speed: "weeks", kw: /suez|red sea|houthi|bab el-mandeb/i },
    "panama": { name: "Panama Canal", speed: "weeks", kw: /panama canal|canal drought/i },
    "malacca": { name: "Malacca / S. China Sea", speed: "days", kw: /malacca|south china sea/i },
    "russia-ukraine": { name: "Russia–Ukraine", speed: "days", kw: /ukraine|russia sanctions|black sea grain|nord stream/i },
    "us-china-trade": { name: "US–China trade", speed: "days", kw: /china tariff|export control|chip ban|trade war|decoupling|entity list/i },
    "us-fiscal": { name: "US fiscal/Fed", speed: "days", kw: /debt ceiling|government shutdown|fed chair|treasury auction|fed independence/i },
    // ---- r2 additions ----
    "critical-materials": { name: "Critical materials (He/Ne/Ga/REE)", speed: "months", kw: /helium|neon shortage|gallium|germanium|rare earth|critical mineral|graphite export|antimony|magnet export/i },
    "uranium-nuclear": { name: "Uranium / nuclear", speed: "weeks", kw: /uranium|nuclear restart|enrichment|kazatomprom|small modular reactor|nuclear power deal/i },
    "canada-us-trade": { name: "Canada–US trade", speed: "days", kw: /canada tariff|usmca|softwood lumber|aluminum tariff|steel tariff|dairy quota|buy america|canadian export/i },
    "pharma-supply": { name: "Pharma supply / FDA", speed: "weeks", kw: /drug shortage|api shortage|pharma tariff|semaglutide|glp-1 supply|compounding|fda import|drug pricing order/i },
    "power-grid": { name: "Power grid / AI energy", speed: "months", kw: /grid strain|transformer shortage|datacenter power|power purchase agreement|electricity price|interconnection queue/i },
    "us-policy-shock": { name: "US policy shock (executive)", speed: "days", mode: "volatility", kw: /executive order|surprise tariff|truth social|trump (?:threatens|orders|announces|floats)|section 301|section 232|emergency powers|national security tariff/i },
  },

  edges: [
    // Taiwan Strait → semis supply chain. SIGN CONVENTION: the source edge carries direction
    // (escalation HURTS the exposed name → negative); hub edges are transmission (same direction).
    ["taiwan-strait", "TSM", "fab concentration", -0.9],
    ["TSM", "NVDA", "sole leading-edge foundry", 0.8],
    ["TSM", "AMD", "foundry", 0.8],
    ["TSM", "AAPL", "A/M-series supply", 0.6],
    ["TSM", "AVGO", "foundry", 0.6],
    ["TSM", "QCOM", "foundry", 0.6],
    ["taiwan-strait", "ASML", "litho demand shock", -0.5],
    ["NVDA", "MSFT", "AI capex dependency", 0.4],
    ["NVDA", "GOOGL", "AI capex dependency", 0.4],
    ["NVDA", "AMZN", "AI capex dependency", 0.4],
    ["NVDA", "META", "AI capex dependency", 0.4],
    ["NVDA", "VRT", "datacenter buildout", 0.5],
    ["NVDA", "SMCI", "server integration", 0.6],

    // Hormuz / Iran → energy complex
    ["hormuz", "crude-oil", "20% of global crude transits", 0.9],
    ["crude-oil", "CNQ", "producer — benefits", 0.7],
    ["crude-oil", "SU", "producer — benefits", 0.7],
    ["crude-oil", "CVE", "producer — benefits", 0.7],
    ["crude-oil", "XOM", "producer — benefits", 0.7],
    ["crude-oil", "ENB", "volume/toll — mildly benefits", 0.4],
    ["crude-oil", "TRP", "volume/toll — mildly benefits", 0.4],
    ["crude-oil", "airlines-sector", "jet fuel cost", -0.6],
    ["hormuz", "lng", "Qatar LNG transits Hormuz", 0.7],
    ["lng", "TOU", "gas price bid — benefits", 0.5],
    ["lng", "helium", "helium rides Qatari LNG trains", 0.6],

    // Suez / Red Sea → shipping & retail supply
    ["suez", "shipping-rates", "reroute around Cape", 0.8],
    ["shipping-rates", "ZIM", "container rates — benefits", 0.7],
    ["shipping-rates", "WMT", "import cost — hurt", -0.3],
    ["shipping-rates", "COST", "import cost — hurt", -0.3],
    ["shipping-rates", "ATD", "goods cost — mildly hurt", -0.2],
    ["panama", "shipping-rates", "transit caps", 0.5],
    ["malacca", "shipping-rates", "Asia-Europe lane risk", 0.5],
    ["malacca", "TSM", "regional escalation proxy", -0.3],

    // Russia–Ukraine → energy + grains + defense + neon
    ["russia-ukraine", "crude-oil", "supply risk", 0.5],
    ["russia-ukraine", "nat-gas", "supply risk", 0.7],
    ["nat-gas", "TOU", "producer — benefits", 0.6],
    ["nat-gas", "ARX", "producer — benefits", 0.6],
    ["russia-ukraine", "wheat", "Black Sea exports", 0.7],
    ["wheat", "NTR", "fertilizer demand — benefits", 0.5],
    ["wheat", "MOS", "fertilizer demand — benefits", 0.5],
    ["russia-ukraine", "defense-sector", "defense budgets", 0.6],
    ["defense-sector", "LMT", "order books", 0.6],
    ["defense-sector", "RTX", "order books", 0.6],
    ["defense-sector", "MDA", "space/defense CA", 0.5],
    ["russia-ukraine", "semi-inputs", "Odesa/Mariupol neon (chip litho gas)", 0.5],

    // US–China trade → tech + industrials + materials
    ["us-china-trade", "NVDA", "export controls", -0.7],
    ["us-china-trade", "AMD", "export controls", -0.6],
    ["us-china-trade", "AAPL", "China revenue+assembly", -0.6],
    ["us-china-trade", "TSLA", "China plant+market", -0.6],
    ["us-china-trade", "semi-inputs", "Ga/Ge/graphite export licences", 0.8],
    ["us-china-trade", "rare-earths", "export leverage", 0.7],
    ["us-china-trade", "CAT", "China capex demand", -0.4],
    ["us-china-trade", "DE", "ag exports", -0.3],
    ["us-china-trade", "shipping-rates", "front-running tariffs", 0.4],

    // Critical materials → semi inputs, magnets, industrial gas
    ["critical-materials", "semi-inputs", "He/Ne/Ga/Ge supply concentration", 0.8],
    ["critical-materials", "rare-earths", "magnet/motor inputs", 0.7],
    ["critical-materials", "helium", "He supply (US BLM sold off; Qatar/Russia concentrated)", 0.7],
    ["semi-inputs", "TSM", "litho gas + wafer chemistry cost", -0.4],
    ["semi-inputs", "NVDA", "upstream input risk", -0.3],
    ["semi-inputs", "AMD", "upstream input risk", -0.3],
    ["semi-inputs", "industrial-gas", "spot gas prices — benefits", 0.6],
    ["helium", "industrial-gas", "He spot/contract — benefits", 0.7],
    ["helium", "healthcare-imaging", "MRI cryogen cost — hurt", -0.3],
    ["industrial-gas", "LIN", "largest He/Ne/Ga refiner-distributor", 0.6],
    ["industrial-gas", "APD", "industrial gas major", 0.6],
    ["rare-earths", "MP", "US producer — benefits", 0.7],
    ["rare-earths", "TSLA", "motor magnets — input risk", -0.3],

    // Uranium / nuclear
    ["uranium-nuclear", "uranium", "supply/demand repricing", 0.8],
    ["uranium", "CCO", "CA producer — benefits", 0.7],
    ["uranium", "NXE", "CA developer — benefits", 0.7],
    ["uranium", "CEG", "nuclear fleet operator — benefits", 0.4],
    ["power-grid", "CEG", "clean firm power premium", 0.6],
    ["power-grid", "VRT", "grid/datacenter electrification", 0.6],
    ["power-grid", "H", "regulated transmission CA", 0.3],

    // Canada–US trade (the book is CAD-heavy — this chokepoint is personal)
    ["canada-us-trade", "ca-exporters", "tariff wall on CA goods", -0.8],
    ["ca-exporters", "MG", "auto parts — USMCA content", 0.6],
    ["ca-exporters", "WFG", "softwood lumber", 0.6],
    ["ca-exporters", "CP", "cross-border rail volumes", 0.4],
    ["ca-exporters", "CNR", "cross-border rail volumes", 0.4],
    ["ca-exporters", "ATD", "cross-border consumer — mild", 0.2],
    ["canada-us-trade", "STLD", "US steel — benefits from wall", 0.4],
    ["canada-us-trade", "NUE", "US steel — benefits from wall", 0.4],
    ["canada-us-trade", "cad-sentiment", "CAD + TSX risk premium", -0.5],
    ["cad-sentiment", "banks-sector", "CA macro beta", 0.3],

    // Pharma supply / FDA — HIMS is headline-sensitive BOTH ways (compounding rules)
    ["pharma-supply", "HIMS", "GLP-1 compounding exemption — two-sided headline risk", -0.6],
    ["pharma-supply", "glp1-makers", "shortage resolution favors brand", 0.5],
    ["glp1-makers", "LLY", "brand GLP-1", 0.5],
    ["glp1-makers", "NVO", "brand GLP-1", 0.5],
    ["pharma-supply", "generic-pharma", "API cost/shortage pass-through", 0.3],

    // US fiscal / Fed → rates complex
    ["us-fiscal", "rates-vol", "auction/ceiling stress", 0.7],
    ["rates-vol", "banks-sector", "NIM + mark-to-market", -0.5],
    ["banks-sector", "RY", "CA bank", 0.4],
    ["banks-sector", "TD", "CA bank", 0.4],
    ["banks-sector", "BNS", "CA bank", 0.4],
    ["banks-sector", "BMO", "CA bank", 0.4],
    ["banks-sector", "JPM", "US bank", 0.4],
    ["banks-sector", "HCAL", "levered CA banks ETF", 0.6],
    ["rates-vol", "gold", "haven bid", 0.6],
    ["gold", "AEM", "miner — benefits", 0.7],
    ["gold", "ABX", "miner — benefits", 0.7],
    ["rates-vol", "BTC", "liquidity-sensitive risk asset", -0.5],
    ["BTC", "COIN", "volumes/beta", 0.8],
    ["BTC", "MSTR", "treasury beta", 0.9],
    ["BTC", "IREN", "miner beta", 0.8],
    ["BTC", "crypto-etfs", "wrapper beta", 0.9],

    // US policy shock (volatility mode: |w| = headline sensitivity, NOT direction)
    ["us-policy-shock", "tariff-sensitive", "one post can reprice the complex", 0.7],
    ["us-policy-shock", "canada-us-trade", "CA in the blast radius", 0.6],
    ["us-policy-shock", "rates-vol", "Fed-independence headlines", 0.5],
    ["us-policy-shock", "pharma-supply", "drug-pricing orders", 0.4],
    ["us-policy-shock", "gold", "policy-uncertainty haven bid", 0.4],
    ["tariff-sensitive", "AAPL", "China assembly", 0.6],
    ["tariff-sensitive", "TSLA", "supply chain + subsidies", 0.6],
    ["tariff-sensitive", "NVDA", "export-license whiplash", 0.5],
    ["tariff-sensitive", "WMT", "import COGS", 0.4],
    ["tariff-sensitive", "CAT", "retaliation target", 0.4],
    ["tariff-sensitive", "MG", "USMCA content rules", 0.5],
  ],

  // sector-node → member tickers the book might hold (resolved at runtime too)
  sectorMembers: {
    "airlines-sector": ["AC.TO", "DAL", "UAL"],
    "banks-sector": ["RY", "TD", "BNS", "BMO", "JPM", "HCAL", "MFC", "SLF"],
    "defense-sector": ["LMT", "RTX", "MDA"],
    "crypto-etfs": ["BTCC.B", "BTCC", "BTCC.TO", "ETHX.B", "ETHH.B", "ETHY.B", "BTCY.B", "SOLQ", "ETHA"],
    "healthcare-imaging": ["GEHC", "SIE", "PHG"],
    "generic-pharma": ["TEVA", "VTRS"],
  },
};
