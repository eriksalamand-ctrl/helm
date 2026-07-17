# Helm — Data Feed Architecture (free-tier design)

**Design principle:** the strategy is swing-horizon (1 week to several months), so **one
end-of-day (EOD) refresh per day is enough**. No intraday, no streaming. That single fact
keeps every data source inside its free quota and lets us avoid running a paid server.

---

## The core architectural decision: precompute → static JSON → static front-end

A browser prototype can't call these APIs directly (CORS + exposed API keys + rate limits).
So we split into two halves:

```
   ┌─────────────────────────────────────────────┐
   │  INGESTION JOB (runs once daily, after close) │   ← the only "backend"
   │  GitHub Action  (free)  OR  small cron box     │
   │   1. pull from free APIs                       │
   │   2. normalize + cache in SQLite               │
   │   3. compute snapshots                         │
   │   4. write static JSON files                   │
   └───────────────────────┬───────────────────────┘
                            │  commits / uploads JSON
                            ▼
   ┌─────────────────────────────────────────────┐
   │  STATIC JSON SNAPSHOTS  (in repo / CDN / S3)   │
   │  prices.json  macro.json  news.json  fx.json   │
   └───────────────────────┬───────────────────────┘
                            │  fetch() — same-origin or CORS-open
                            ▼
   ┌─────────────────────────────────────────────┐
   │  HELM front-end (this HTML app)                │
   │  reads JSON; RSI / returns / backtest /        │
   │  signals all already compute client-side       │
   └─────────────────────────────────────────────┘
```

**Why a GitHub Action is the sweet spot:** it's free, runs on a daily `cron`, has secrets
storage for API keys (keys never reach the browser), and commits JSON back to the repo.
GitHub Pages/raw then serves the JSON to the front-end with no server to run or pay for.
(Prompt 2's `macro_dashboard.py` is the seed of this job — fix its fetches and point it here.)

---

## What each module needs → which free source

| Module | Data needed | Free source (primary → fallback) |
|---|---|---|
| Holdings / Dashboard / Crypto | your positions | **NBDB CSV export** or statement upload (no public API — stays manual) |
| | EOD quotes (stocks/ETF, US + TSX `.TO`) | **Stooq** EOD CSV (no key, bulk) → **Twelve Data** (free key, 800/day) |
| | crypto prices | **CoinGecko** (free, generous) |
| | USD/CAD FX | **Bank of Canada Valet** (official CAD) → **Frankfurter**/ECB |
| Research | 5y daily OHLC | **Stooq** bulk EOD → **Yahoo chart API** → Twelve Data `time_series` |
| | fundamentals (P/E, beta, yield) | **Finnhub** (60/min) → **FMP** (250/day) |
| | company news | **Finnhub** company-news → RSS / **Marketaux** (free tier) |
| Performance / Rendement | returns + flows | computed locally from price history + your **transaction log** (NBDB export) |
| Backtest | 5y daily history per asset | **Stooq** (best free bulk EOD) |
| Projections | long-term return assumptions | static **NBC CIO PMLT** (4.8% balanced / 5.5% equity / 3.7% FI) + risk-free from FRED/BoC |
| Strategy Lab | RSI / momentum | computed locally from history |
| | valuation / quality | **Finnhub** / **FMP** fundamentals |
| Macro module | rates, CPI, yield curve, unemployment | **FRED** (St-Louis Fed, free key — DGS10, DGS2, CPIAUCSL, UNRATE) |
| | Canadian rates / CPI | **Bank of Canada Valet** (free, official) |
| | **global liquidity** (Raoul Pal proxy) | **FRED**: Fed balance sheet `WALCL` − reverse repo `RRPONTSYD` − TGA `WTREGEN`; add ECB/BOJ/PBOC for global |
| | commodities (oil, gold, copper) | **FRED** (`DCOILWTICO`, gold) → Stooq futures |
| | geopolitical / news events | **GDELT Project** (free global events+tone API) + RSS |
| | economist-persona analysis | LLM over the fetched headlines (precompute in the job, store as text) |

---

## Recommended free stack (minimum keys, maximum coverage)
1. **Stooq** — EOD prices & 5y history, US + TSX, **no API key**, CSV bulk. The workhorse.
2. **CoinGecko** — crypto, no key.
3. **Bank of Canada Valet** — official CAD FX + rates, no key.
4. **FRED** — all US macro + the liquidity proxy (one free key).
5. **Finnhub** — fundamentals + company news (one free key, 60/min).
6. **GDELT** — geopolitical/news events, no key.

Six sources, **two API keys** (FRED + Finnhub), both stored as GitHub Action secrets.

---

## Liquidity model (the Raoul Pal "global liquidity" proxy), from FRED
`Net Fed Liquidity = WALCL (Fed balance sheet) − RRPONTSYD (reverse repo) − WTREGEN (Treasury General Account)`
For *global* liquidity, add major central-bank balance sheets (ECB, BOJ, PBOC) converted to USD.
Plot vs S&P 500 — the lead/lag is the signal. All series are free on FRED (ECB/BOJ via their own portals or FRED proxies).

---

## Storage schema (SQLite — fixes Prompt 2's design)
- `positions(account, ticker, qty, avg_cost, ccy, updated_at)`  ← from NBDB export
- `prices(ticker, date, close, volume)`  ← EOD, primary key (ticker, date)
- `fundamentals(ticker, pe, beta, div_yield, fetched_at)`
- `macro(series_id, date, value)`  ← FRED/BoC series, long format
- `news(id, ticker_or_topic, headline, url, source, published_at)`
- `ai_analyses(id, run_at, kind, input_digest, analysis_text)`  ← link to macro/news by run_at
Fix vs Prompt 2: real FRED endpoint `fredgraph.csv?id=SERIES`, RSS/Finnhub for news (not HTML `<title>` scraping), FK by run_at.

---

## Data contract the front-end reads (what the job emits)
```jsonc
// prices.json      { "NVDA": [{ "d":"2026-06-19", "c":142.62 }, ...], ... }
// quotes.json      { "NVDA": { "last":142.62, "chgPct":3.41, "asOf":"..." }, ... }
// fundamentals.json{ "NVDA": { "pe":..., "beta":..., "divYield":... }, ... }
// fx.json          { "USDCAD":1.4174, "asOf":"..." }
// macro.json       { "DGS10":[...], "netLiquidity":[...], "CPIAUCSL":[...] }
// news.json        [{ "ticker":"NVDA", "headline":"...", "url":"...", "ts":"..." }]
// cio.json         { "asOf":"2026-06", "stance":"OW equities", "tilts":{...}, "forecasts":{...} }
```
The front-end already computes RSI, returns, the backtest, and signals — it just swaps mock
generators for `fetch('prices.json')` etc. Minimal change to Helm.

---

## Cadence & cost — two-speed feed
**Fast lane — quotes only, every 1 min (market hours):** `feed/quotes-worker.js` on a
**Cloudflare Worker** (free tier, 1-min cron, 100k req/day) + Workers KV. Polls Finnhub
(US real-time, 60/min) + CoinGecko (crypto, 24/7) and serves `quotes.json` (CORS-open).
The front-end polls it once a minute. *Note:* Stooq is EOD-only and free Canadian/TSX
intraday doesn't exist — TSX names stay at the daily close. Minute data improves the live
**view**, not the swing **signals** (which are 1wk–months by design).

**Slow lane — everything else, once daily:** `feed/ingest.py` on a **GitHub Action**
(history, fundamentals, macro, liquidity model, news). None of these change intraday.

- GitHub Actions cron is 5-min-minimum and throttled → can't be the minute clock; the Worker is.
- Cost: still **$0** — both within free tiers. Two API keys (FRED + Finnhub) as secrets.
- The only manual step: refreshing **positions** from NBDB (CSV export or statement upload).

### Why not minute everywhere
Per-minute polling of history/fundamentals/macro burns free quotas for data that only
changes once a day. Keep heavy data daily; spend the minute budget on quotes alone.
