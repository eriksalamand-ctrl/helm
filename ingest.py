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
CRYPTO = {"bitcoin": "BTC", "ethereum": "ETH", "solana": "SOL", "ripple": "XRP"}

# index benchmarks (Stooq symbols)
BENCHMARKS = {"^spx": "SPX", "^ndq": "NDX", "^tsx": "TSX"}

HIST_DAYS = 1280  # ~5y of trading days for the backtest


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
    for cid, sym in CRYPTO.items():
        h = get_json(f"https://api.coingecko.com/api/v3/coins/{cid}/market_chart"
                     f"?vs_currency=usd&days=365&interval=daily")
        if h and "prices" in h:
            prices[sym] = [{"d": datetime.utcfromtimestamp(p[0] / 1000).strftime("%Y-%m-%d"),
                            "c": round(p[1], 2)} for p in h["prices"]]
        time.sleep(1.5)  # be gentle on the free tier
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
def finnhub_fundamentals(tickers):
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

    for t in tickers:
        j = get_json(f"https://finnhub.io/api/v1/stock/metric?symbol={t}"
                     f"&metric=all&token={FINNHUB_KEY}")
        m = (j or {}).get("metric", {})
        if m:
            out[t] = {
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


def finnhub_news(tickers, per=3):
    out = []
    if not FINNHUB_KEY:
        return out
    frm = (datetime.now(timezone.utc).date().replace(day=1)).isoformat()
    to = datetime.now(timezone.utc).date().isoformat()
    for t in tickers:
        j = get_json(f"https://finnhub.io/api/v1/company-news?symbol={t}"
                     f"&from={frm}&to={to}&token={FINNHUB_KEY}")
        for a in (j or [])[:per]:
            out.append({"ticker": t, "headline": a.get("headline"),
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

    # ---- prices + quotes (Stooq) for holdings + benchmarks ----
    prices, quotes = {}, {}
    seen = {}
    for p in positions:
        if p["ticker"] in seen:
            continue
        seen[p["ticker"]] = True
        hist = history(p["ticker"], p["exchange"])
        if hist:
            prices[p["ticker"]] = hist
            last, prev = hist[-1]["c"], hist[-2]["c"] if len(hist) > 1 else hist[-1]["c"]
            quotes[p["ticker"]] = {"last": last,
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

    # ---- everything else ----
    fx = fx_usdcad()
    macro = fred_all()
    fundamentals = finnhub_fundamentals(holdings_tickers)
    news = finnhub_news(holdings_tickers) + [
        {**a, "ticker": "MACRO"} for a in gdelt()
    ]

    meta = {"generatedAt": now_iso(),
            "sources": ["stooq", "coingecko", "bankofcanada", "fred", "finnhub", "gdelt"],
            "positions": len(positions), "tickers": holdings_tickers}

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
