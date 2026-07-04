#!/usr/bin/env python3
"""
Helm data-feed ingestion job.

Runs once per day (after market close) — pulls EOD data from FREE sources and writes
the JSON snapshots the Helm front-end reads. Pure standard library (urllib/csv/json):
no pip install, nothing to break on a runner.

Free sources used:
  - Stooq            EOD quotes + history (US + TSX), no key
  - CoinGecko        crypto spot, no key
  - Bank of Canada   official USD/CAD, no key
  - FRED             US macro + liquidity model     (env FRED_API_KEY)
  - Finnhub          fundamentals + company news     (env FINNHUB_API_KEY)
  - GDELT            geopolitical / news events, no key

Output: ./public/*.json  (commit these; the front-end fetch()es them)
"""

import csv
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "public")
POSITIONS = os.path.join(HERE, "positions.csv")

FRED_KEY = os.environ.get("FRED_API_KEY", "")
FINNHUB_KEY = os.environ.get("FINNHUB_API_KEY", "")

UA = {"User-Agent": "Mozilla/5.0 (HelmFeed/1.0)"}

# ---- macro series to pull from FRED (id -> friendly key) -------------------
FRED_SERIES = {
    "DGS10": "us10y",            # 10-yr Treasury yield
    "DGS2": "us2y",             # 2-yr Treasury yield
    "CPIAUCSL": "us_cpi",        # CPI (level)
    "UNRATE": "us_unemployment",
    "DCOILWTICO": "wti_oil",
    "FEDFUNDS": "fed_funds",
    # liquidity-model components (Raoul Pal net-liquidity proxy):
    "WALCL": "fed_balance_sheet",       # Fed total assets
    "RRPONTSYD": "reverse_repo",        # overnight reverse repo
    "WTREGEN": "treasury_general_acct", # Treasury General Account
}

# crypto: coingecko id -> friendly symbol
CRYPTO = {"bitcoin": "BTC", "ethereum": "ETH", "solana": "SOL", "ripple": "XRP",
          "litecoin": "LTC", "near": "NEAR", "cosmos": "ATOM", "aptos": "APT"}

# index benchmarks (Stooq symbols)
BENCHMARKS = {"^spx": "SPX", "^ndq": "NDX", "^tsx": "TSX"}

HIST_DAYS = 1280  # ~5y of trading days for the backtest

# ---- broad recommendation universe (mirrors screener.jsx's UNIVERSE) ------
# Why this exists: without it, Screener/Strategy Lab/Tracker can only score real
# fundamentals for tickers already in positions.csv — anything else falls back to
# an honest-but-fake hash proxy, so the model can never recommend something you
# don't already own. This gives real Finnhub fundamentals + Stooq/Yahoo prices to
# a genuinely broad, liquid US+CA universe instead of just your ~26 held names.
# (ticker, exchange) — exchange "US" or "TSX"; ticker has NO ".TO" suffix (the
# suffix is added by the symbol helpers below, same convention as positions.csv).
#
# EQUITIES get real Finnhub fundamentals (P/E, ROE, margins, growth, debt) + news.
# ETFS get price/history only — P/E-style fundamentals aren't meaningful for a fund,
# and skipping them keeps the daily job's Finnhub call budget sane.
UNIVERSE_EQUITIES = [
    ("AAPL","US"),("MSFT","US"),("NVDA","US"),("AMZN","US"),("GOOGL","US"),("META","US"),("TSLA","US"),("AMD","US"),
    ("AVGO","US"),("NFLX","US"),("JPM","US"),("V","US"),("UNH","US"),("XOM","US"),("CVX","US"),("COST","US"),
    ("LLY","US"),("HD","US"),("KO","US"),("WMT","US"),("PLTR","US"),("ARM","US"),("COIN","US"),("CRM","US"),
    ("NOW","US"),("MU","US"),("MRVL","US"),("SNOW","US"),("UBER","US"),("SHOP","US"),("ANET","US"),("VST","US"),
    ("CEG","US"),("DELL","US"),("TSM","US"),("ASML","US"),("PANW","US"),
    ("BAC","US"),("WFC","US"),("GS","US"),("MS","US"),("SCHW","US"),("BLK","US"),("AXP","US"),("MA","US"),
    ("PYPL","US"),("SOFI","US"),("HOOD","US"),("AFRM","US"),
    ("JNJ","US"),("PFE","US"),("ABBV","US"),("MRK","US"),("ABT","US"),("TMO","US"),("DHR","US"),("ISRG","US"),
    ("VRTX","US"),("REGN","US"),
    ("CAT","US"),("DE","US"),("GE","US"),("HON","US"),("RTX","US"),("LMT","US"),("BA","US"),("UPS","US"),("UNP","US"),
    ("MCD","US"),("SBUX","US"),("NKE","US"),("TGT","US"),("LOW","US"),("PG","US"),("PEP","US"),("DIS","US"),
    ("BKNG","US"),("ABNB","US"),("DASH","US"),("RIVN","US"),("LCID","US"),("GM","US"),("F","US"),("CELH","US"),
    ("COP","US"),("SLB","US"),("OXY","US"),
    ("ORCL","US"),("IBM","US"),("INTC","US"),("QCOM","US"),("TXN","US"),("ADBE","US"),("INTU","US"),("ADI","US"),
    ("LRCX","US"),("KLAC","US"),("CDNS","US"),("SNPS","US"),("DDOG","US"),("ZS","US"),("CRWD","US"),("NET","US"),
    ("MDB","US"),("TEAM","US"),("RBLX","US"),("ROKU","US"),("RKLB","US"),("IONQ","US"),("NEE","US"),("FSLR","US"),
    ("ENPH","US"),("TMUS","US"),("CMCSA","US"),
    # ---- Canada (TSX) ----
    ("RY","TSX"),("TD","TSX"),("ENB","TSX"),("CNQ","TSX"),("SHOP","TSX"),("BNS","TSX"),("BMO","TSX"),("CP","TSX"),
    ("CNR","TSX"),("SU","TSX"),("ATD","TSX"),("BCE","TSX"),("NTR","TSX"),("CSU","TSX"),("FNV","TSX"),
    ("HPS-A","TSX"),("CLS","TSX"),("WSP","TSX"),
    ("GIB-A","TSX"),("L","TSX"),("DOL","TSX"),("MG","TSX"),("TRP","TSX"),("PPL","TSX"),("ABX","TSX"),("K","TSX"),
    ("WCN","TSX"),("TIH","TSX"),("TFII","TSX"),("MFC","TSX"),("SLF","TSX"),("IFC","TSX"),("POW","TSX"),("QSR","TSX"),
    ("CTC-A","TSX"),("SAP","TSX"),("IMO","TSX"),("OVV","TSX"),("TOU","TSX"),("ARX","TSX"),("NPI","TSX"),
    ("BEP-UN","TSX"),("BAM","TSX"),("BN","TSX"),("DOO","TSX"),("CCL-B","TSX"),("STN","TSX"),("GFL","TSX"),
]
# CA "SHOP" is the same company as US "SHOP" (dual-listed) — one real fundamentals
# fetch covers both; skip the redundant Finnhub call but still fetch its own CAD price.
_DUPE_FUNDAMENTALS = {("SHOP", "TSX")}

UNIVERSE_ETFS = [
    ("SMH","US"),("SOXX","US"),("ARKK","US"),("ARKW","US"),("ARKG","US"),("IBIT","US"),
    ("SPY","US"),("IVV","US"),("VTI","US"),("QQQ","US"),("VEA","US"),("VTV","US"),("BND","US"),("GLD","US"),
    ("IWF","US"),("VGT","US"),("VIG","US"),("IJH","US"),("XLK","US"),("IJR","US"),("RSP","US"),("IWM","US"),
    ("IWD","US"),("TLT","US"),("XLF","US"),("IAU","US"),("VT","US"),("JEPI","US"),("XLV","US"),("SCHD","US"),
    ("IEF","US"),("LQD","US"),("DIA","US"),("VB","US"),
    ("VFV","TSX"),("ZSP","TSX"),("XIC","TSX"),("XIU","TSX"),("XEF","TSX"),("ZCN","TSX"),("ZAG","TSX"),("VCN","TSX"),
    ("ZEA","TSX"),("XUS","TSX"),("HXT","TSX"),("VDY","TSX"),("XEI","TSX"),("XDV","TSX"),("ZLB","TSX"),("ZWB","TSX"),
    ("ZWC","TSX"),("VGRO","TSX"),("VBAL","TSX"),("XBAL","TSX"),("XEG","TSX"),("ZUB","TSX"),("BTCC","TSX"),("ETHX.B","TSX"),
]


# --------------------------------------------------------------------------
def get(url, headers=None, retries=3, timeout=25):
    """GET with retry/backoff. Returns bytes or None."""
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers or UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa
            wait = 2 ** i
            print(f"  ! {url[:70]}… {e} (retry in {wait}s)", file=sys.stderr)
            time.sleep(wait)
    return None


def get_json(url, headers=None):
    raw = get(url, headers)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def write(name, obj):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)
    print(f"  wrote {name} ({os.path.getsize(path)//1024} kB)")


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---- positions (the one manual input — NBDB CSV export) -------------------
def load_positions():
    """positions.csv columns: account,ticker,exchange,qty,avg_cost,ccy
    exchange is US or TSX (drives the Stooq symbol suffix)."""
    rows = []
    if not os.path.exists(POSITIONS):
        print("  ! positions.csv not found — using benchmarks only", file=sys.stderr)
        return rows
    with open(POSITIONS, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if not r.get("ticker"):
                continue
            rows.append({
                "account": (r.get("account") or "").strip(),
                "ticker": r["ticker"].strip().upper(),
                "exchange": (r.get("exchange") or "US").strip().upper(),
                "qty": float(r.get("qty") or 0),
                "avg_cost": float(r.get("avg_cost") or 0),
                "ccy": (r.get("ccy") or "USD").strip().upper(),
            })
    return rows


def stooq_symbol(ticker, exchange):
    t = ticker.lower().replace(".", "-")
    return f"{t}.us" if exchange == "US" else f"{t}.ca"


# ---- Yahoo Finance: EOD history (JSON, free, no key — reliable on CI runners) ----
def yahoo_symbol(ticker, exchange):
    # Yahoo uses '-' for dotted classes (ETHX.B -> ETHX-B) and '.TO' for TSX.
    t = ticker.upper().replace(".", "-")
    return t if exchange == "US" else f"{t}.TO"


# Finnhub uses the same '-' for share classes + '.TO' for TSX as Yahoo (for PRICE/quote
# endpoints, which do cover TSX). But its FUNDAMENTALS endpoint on the free tier does
# NOT cover ".TO" symbols — so fundamentals must use the bare/US listing (see below).
def finnhub_symbol(ticker, exchange):
    return yahoo_symbol(ticker, exchange)


# Company fundamentals are listing-agnostic, and Finnhub's FREE tier does not resolve
# ".TO" tickers — but most large Canadian names are ALSO US-listed under the bare
# ticker (ENB, RY, TD, BNS, BMO, CNQ, SU, MFC, SLF, NTR...), which DOES return real
# fundamentals. Canada-only names (CSU, MDA, WSP, HPS-A, GIB-A...) won't resolve on
# the free tier and correctly fall back to the front-end's honest hash proxy. So for
# fundamentals + company news we ALWAYS use the bare ticker, never the ".TO" form.
# (This fixes a regression where adding ".TO" made EVERY Canadian name return nothing.)
def finnhub_fund_symbol(base):
    return base.upper()


def yahoo_history(symbol):
    """Returns list of {d, c, v} ascending, or []."""
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}"
           f"?range=5y&interval=1d")
    j = get_json(url)
    try:
        res = j["chart"]["result"][0]
        ts = res["timestamp"]
        closes = res["indicators"]["quote"][0]["close"]
        vols = res["indicators"]["quote"][0].get("volume", [None] * len(ts))
        out = []
        for i, t in enumerate(ts):
            c = closes[i]
            if c is None:
                continue
            out.append({"d": datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"),
                        "c": round(float(c), 4), "v": float(vols[i] or 0)})
        return out[-HIST_DAYS:]
    except Exception:
        return []


def history(ticker, exchange):
    """Primary Yahoo, fallback Stooq. Returns [] only if both fail."""
    h = yahoo_history(yahoo_symbol(ticker, exchange))
    if h:
        return h
    return stooq_history(stooq_symbol(ticker, exchange))


# ---- Stooq: EOD history (CSV) ---------------------------------------------
def stooq_history(symbol):
    """Returns list of {d, c, v} ascending by date, or []."""
    url = f"https://stooq.com/q/d/l/?s={urllib.parse.quote(symbol)}&i=d"
    raw = get(url)
    if not raw:
        return []
    text = raw.decode("utf-8", "replace")
    out = []
    for row in csv.DictReader(text.splitlines()):
        try:
            out.append({"d": row["Date"], "c": float(row["Close"]),
                        "v": float(row.get("Volume") or 0)})
        except (KeyError, ValueError):
            continue
    return out[-HIST_DAYS:]


# ---- CoinGecko: crypto spot + history -------------------------------------
def coingecko():
    ids = ",".join(CRYPTO)
    quotes, prices = {}, {}
    q = get_json(f"https://api.coingecko.com/api/v3/simple/price?ids={ids}"
                 f"&vs_currencies=usd&include_24hr_change=true")
    if q:
        for cid, sym in CRYPTO.items():
            if cid in q:
                quotes[sym] = {"last": q[cid].get("usd"),
                               "chgPct": round(q[cid].get("usd_24h_change", 0), 2),
                               "asOf": now_iso()}
    # per-coin daily history. The keyless free tier rate-limits the TAIL of a burst even
    # at modest spacing, so: (1) 9s base spacing, (2) a CoinGecko-specific 429 backoff, and
    # (3) a SECOND PASS at the end that retries only the coins still missing, with a long
    # cooldown first. This reliably fills the last few coins (NEAR/ATOM/APT) that used to 429.
    def fetch_hist(cid):
        url = (f"https://api.coingecko.com/api/v3/coins/{cid}/market_chart"
               f"?vs_currency=usd&days=365&interval=daily")
        for attempt in range(3):
            raw = get(url)  # get() already retries transient errors; this adds 429-aware waits
            if raw:
                try:
                    j = json.loads(raw)
                    if j and "prices" in j and j["prices"]:
                        return [{"d": datetime.utcfromtimestamp(p[0] / 1000).strftime("%Y-%m-%d"),
                                 "c": round(p[1], 2)} for p in j["prices"]]
                except Exception:
                    pass
            time.sleep(15 * (attempt + 1))  # 15s, 30s — CoinGecko wants a long cooldown after a 429
        return None

    for cid, sym in CRYPTO.items():
        h = fetch_hist(cid)
        if h:
            prices[sym] = h
        time.sleep(9)  # base spacing between coins

    # second pass: any coin whose history is still missing gets one more try after a cooldown
    missing = [(cid, sym) for cid, sym in CRYPTO.items() if sym not in prices]
    if missing:
        print(f"  crypto history retry pass for {[s for _, s in missing]}")
        time.sleep(30)
        for cid, sym in missing:
            h = fetch_hist(cid)
            if h:
                prices[sym] = h
            time.sleep(12)
    return quotes, prices


# ---- Bank of Canada: official USD/CAD -------------------------------------
def fx_usdcad():
    j = get_json("https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1")
    try:
        obs = j["observations"][0]
        return {"USDCAD": float(obs["FXUSDCAD"]["v"]), "asOf": obs["d"]}
    except Exception:
        return {"USDCAD": 1.4174, "asOf": now_iso(), "note": "fallback"}


# ---- FRED: macro series + net-liquidity model -----------------------------
def fred_series(series_id, limit=400):
    if not FRED_KEY:
        return []
    url = (f"https://api.stlouisfed.org/fred/series/observations?series_id={series_id}"
           f"&api_key={FRED_KEY}&file_type=json&sort_order=desc&limit={limit}")
    j = get_json(url)
    if not j or "observations" not in j:
        return []
    out = []
    for o in j["observations"]:
        if o["value"] in (".", ""):
            continue
        out.append({"d": o["date"], "v": float(o["value"])})
    out.reverse()
    return out


def fred_all():
    macro = {}
    raw = {}
    for sid, key in FRED_SERIES.items():
        s = fred_series(sid)
        # CPIAUCSL is an index level — convert to year-over-year % (FRED is monthly → 12 obs back)
        if sid == "CPIAUCSL" and len(s) > 12:
            yoy = []
            for i in range(12, len(s)):
                prev = s[i - 12]["v"]
                if prev:
                    yoy.append({"d": s[i]["d"], "v": round((s[i]["v"] / prev - 1) * 100, 2)})
            s = yoy
        macro[key] = s
        raw[sid] = {o["d"]: o["v"] for o in s}
        time.sleep(0.3)
    # Net Fed liquidity = balance sheet − reverse repo − Treasury general account.
    # FRED reports these in MILLIONS of USD — store in BILLIONS so the front-end's
    # "(v/1000) → trillions" math (and the mock fallback) line up.
    bs, rr, tga = raw.get("WALCL", {}), raw.get("RRPONTSYD", {}), raw.get("WTREGEN", {})
    net = []
    for d in sorted(bs):
        # components are weekly/daily on different calendars — only emit when bs exists
        val = bs[d] - rr.get(d, 0) - tga.get(d, 0)
        net.append({"d": d, "v": round(val / 1000.0, 1)})  # millions → billions
    macro["net_liquidity"] = net[-260:]
    return macro


# ---- Finnhub: fundamentals + company news ---------------------------------
# Both take a list of (output_key, finnhub_symbol) pairs rather than bare tickers —
# output_key is what the front-end looks up (e.g. bare "ATD" for a held CA position
# per data.jsx's convention, or "RY.TO" for a universe-only CA name per screener.jsx's
# convention); finnhub_symbol is the BARE ticker that resolves on Finnhub's free tier
# (fundamentals are company-level, and ".TO" is not covered — see finnhub_fund_symbol).
# The two differ for CA names, which is exactly why they're passed as pairs: we look
# up "RY.TO" on the front-end but fetch "RY" (its US listing) from Finnhub.
def finnhub_fundamentals(pairs):
    out = {}
    if not FINNHUB_KEY:
        return out

    def pick(m, *keys):
        for k in keys:
            v = m.get(k)
            if v is not None:
                try:
                    return round(float(v), 4)
                except (TypeError, ValueError):
                    pass
        return None

    for key, sym in pairs:
        j = get_json(f"https://finnhub.io/api/v1/stock/metric?symbol={sym}"
                     f"&metric=all&token={FINNHUB_KEY}")
        m = (j or {}).get("metric", {})
        if m:
            out[key] = {
                # valuation + risk (already used)
                "pe": pick(m, "peTTM", "peAnnual"),
                "beta": pick(m, "beta"),
                "divYield": pick(m, "dividendYieldIndicatedAnnual", "currentDividendYieldTTM"),
                "high52": pick(m, "52WeekHigh"),
                "low52": pick(m, "52WeekLow"),
                "pb": pick(m, "pbQuarterly", "pbAnnual"),
                "ps": pick(m, "psTTM", "psAnnual"),
                # --- REAL quality fundamentals (same endpoint, just more fields) ---
                "roe": pick(m, "roeTTM", "roeRfy"),
                "roa": pick(m, "roaTTM", "roaRfy"),
                "netMargin": pick(m, "netProfitMarginTTM", "netMarginTTM", "netProfitMarginAnnual"),
                "grossMargin": pick(m, "grossMarginTTM", "grossMarginAnnual"),
                "operMargin": pick(m, "operatingMarginTTM", "operatingMarginAnnual"),
                "revGrowth": pick(m, "revenueGrowthTTMYoy", "revenueGrowthQuarterlyYoy", "revenueGrowth3Y"),
                "epsGrowth": pick(m, "epsGrowthTTMYoy", "epsGrowthQuarterlyYoy", "epsGrowth3Y"),
                "debtToEquity": pick(m, "totalDebt/totalEquityQuarterly", "totalDebt/totalEquityAnnual", "longTermDebt/equityQuarterly"),
                "currentRatio": pick(m, "currentRatioQuarterly", "currentRatioAnnual"),
            }
        time.sleep(1.1)  # 60/min free limit
    return out


def finnhub_news(pairs, per=3):
    out = []
    if not FINNHUB_KEY:
        return out
    frm = (datetime.now(timezone.utc).date().replace(day=1)).isoformat()
    to = datetime.now(timezone.utc).date().isoformat()
    for key, sym in pairs:
        j = get_json(f"https://finnhub.io/api/v1/company-news?symbol={sym}"
                     f"&from={frm}&to={to}&token={FINNHUB_KEY}")
        for a in (j or [])[:per]:
            out.append({"ticker": key, "headline": a.get("headline"),
                        "url": a.get("url"), "source": a.get("source"),
                        "ts": datetime.utcfromtimestamp(a.get("datetime", 0)).isoformat()})
        time.sleep(1.1)
    return out


# ---- GDELT: geopolitical / market-moving news -----------------------------
# English-only, finance-scoped query (bare keyword-OR queries return a lot of
# unrelated/non-English noise — gambling sites, sports, local politics).
# Domain restriction to known financial/macro publishers + sourcelang filter
# keeps signal high; currency terms (yen/BoJ/ECB/ISM etc.) added so FX-moving
# stories (e.g. Japanese yen intervention) actually surface.
def gdelt(query=None, n=15):
    if query is None:
        topics = [
            '"central bank"', '"interest rate"', "inflation", '"federal reserve"',
            '"Bank of Japan"', "yen", '"Bank of Canada"', '"European Central Bank"',
            "tariff", "sanctions", '"oil price"', "recession",
        ]
        query = "(" + " OR ".join(topics) + ") sourcelang:eng"
    url = ("https://api.gdeltproject.org/api/v2/doc/doc?query="
           + urllib.parse.quote(query)
           + f"&mode=ArtList&maxrecords={n}&format=json&sort=DateDesc")
    j = get_json(url)
    out = []
    for a in (j or {}).get("articles", []):
        title = a.get("title") or ""
        # belt-and-suspenders: skip anything with non-ASCII letters that slipped
        # through the sourcelang filter (spam mirrors, mistagged locale, etc.)
        if not title or not title.isascii():
            continue
        out.append({"headline": title, "url": a.get("url"),
                    "source": a.get("domain"), "ts": a.get("seendate"),
                    "tone": a.get("tone")})
    return out


# --------------------------------------------------------------------------
def main():
    print(f"Helm feed — {now_iso()}")
    positions = load_positions()
    holdings_tickers = sorted({p["ticker"] for p in positions})
    print(f"  {len(positions)} positions, {len(holdings_tickers)} unique tickers")

    prices, quotes = {}, {}
    seen = set()  # output keys already fetched (held positions take priority)

    # ---- prices + quotes (Yahoo/Stooq) for held positions ----
    exch_of = {}  # ticker -> "US"/"TSX", for the Finnhub symbol pass below
    for p in positions:
        if p["ticker"] in seen:
            continue
        seen.add(p["ticker"])
        exch_of[p["ticker"]] = p["exchange"]
        hist = history(p["ticker"], p["exchange"])
        if hist:
            prices[p["ticker"]] = hist
            last, prev = hist[-1]["c"], hist[-2]["c"] if len(hist) > 1 else hist[-1]["c"]
            quotes[p["ticker"]] = {"last": last,
                                   "chgPct": round((last / prev - 1) * 100, 2) if prev else 0,
                                   "asOf": hist[-1]["d"]}
        time.sleep(0.4)

    # ---- prices + quotes for the broad universe (equities + ETFs) not already held ----
    # output key mirrors screener.jsx's ticker string: bare for US, "+.TO" for CA.
    def frontend_key(base, exch):
        return base if exch == "US" else f"{base}.TO"

    uni_all = UNIVERSE_EQUITIES + UNIVERSE_ETFS
    new_uni = [(base, exch) for (base, exch) in uni_all if frontend_key(base, exch) not in seen]
    print(f"  +{len(new_uni)} universe tickers beyond your holdings (of {len(uni_all)} curated)")
    for base, exch in new_uni:
        key = frontend_key(base, exch)
        seen.add(key)
        hist = history(base, exch)
        if hist:
            prices[key] = hist
            last, prev = hist[-1]["c"], hist[-2]["c"] if len(hist) > 1 else hist[-1]["c"]
            quotes[key] = {"last": last,
                           "chgPct": round((last / prev - 1) * 100, 2) if prev else 0,
                           "asOf": hist[-1]["d"]}
        time.sleep(0.4)

    for sym, name in BENCHMARKS.items():
        yh = {"SPX": "^GSPC", "NDX": "^NDX", "TSX": "^GSPTSE"}.get(name)
        h = (yahoo_history(yh) if yh else None) or stooq_history(sym)
        if h:
            prices[name] = h
        time.sleep(0.4)

    # ---- crypto ----
    c_quotes, c_prices = coingecko()
    quotes.update(c_quotes)
    prices.update(c_prices)

    # ---- Finnhub fundamentals + news: held positions + universe EQUITIES only ----
    # (ETFs skipped — P/E-style fundamentals aren't meaningful for a fund; this also
    # keeps the daily job's Finnhub call budget sane.) Fundamentals use the BARE ticker
    # (finnhub_fund_symbol) — the free tier doesn't cover ".TO", but dual-listed CA
    # names resolve via their US listing; Canada-only names fall back to the hash proxy.
    fund_pairs = [(t, finnhub_fund_symbol(t)) for t in holdings_tickers]
    uni_equity_new = [(base, exch) for (base, exch) in UNIVERSE_EQUITIES
                       if frontend_key(base, exch) not in holdings_tickers
                       and (base, exch) not in _DUPE_FUNDAMENTALS]
    fund_pairs += [(frontend_key(base, exch), finnhub_fund_symbol(base)) for (base, exch) in uni_equity_new]
    print(f"  fetching real fundamentals for {len(fund_pairs)} names ({len(holdings_tickers)} held + {len(uni_equity_new)} universe)")

    fx = fx_usdcad()
    macro = fred_all()
    fundamentals = finnhub_fundamentals(fund_pairs)
    # news: held positions only (universe-wide news adds ~3 more minutes of Finnhub
    # calls for names you don't own yet — lower value than the fundamentals that
    # actually drive scoring, so scope it to what you hold + geopolitical/macro).
    held_pairs_for_news = [(t, finnhub_fund_symbol(t)) for t in holdings_tickers]
    news = finnhub_news(held_pairs_for_news) + [
        {**a, "ticker": "MACRO"} for a in gdelt()
    ]

    meta = {"generatedAt": now_iso(),
            "sources": ["stooq", "coingecko", "bankofcanada", "fred", "finnhub", "gdelt"],
            "positions": len(positions), "tickers": holdings_tickers,
            "universeTickers": len(uni_all), "universeCovered": len(new_uni)}

    write("prices.json", prices)
    write("quotes.json", quotes)
    write("fx.json", fx)
    write("macro.json", macro)
    write("fundamentals.json", fundamentals)
    write("news.json", news)
    write("meta.json", meta)
    print("done.")


if __name__ == "__main__":
    main()
