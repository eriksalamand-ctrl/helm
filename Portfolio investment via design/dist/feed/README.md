# Helm data feed — setup

Two-speed, $0 architecture. Front-end falls back to built-in demo data until you fill these in.

## 1. Slow lane — daily heavy data (GitHub Actions → JSON snapshots)
1. Get free API keys: **FRED** (fred.stlouisfed.org) and **Finnhub** (finnhub.io).
2. Repo → Settings → Secrets → Actions: add `FRED_API_KEY` and `FINNHUB_API_KEY`.
3. Put your NBDB holdings in `feed/positions.csv` (columns: account,ticker,exchange,qty,avg_cost,ccy).
4. The workflow `.github/workflows/daily.yml` runs weekdays 21:30 UTC (or run it manually from the
   Actions tab). It writes `feed/public/*.json` and commits them.
5. Serve those JSON files (GitHub Pages, or any static host) and set in `feed-config.js`:
   `window.HELM_FEED_BASE = "https://<you>.github.io/<repo>/feed/public";`

## 2. Fast lane — minute quotes (Cloudflare Worker)
1. `cd feed && npx wrangler kv:namespace create HELM_QUOTES` → paste the id into `wrangler.toml`.
2. `npx wrangler secret put FINNHUB_KEY`
3. `npx wrangler deploy`
4. Set in `feed-config.js`: `window.HELM_QUOTES_BASE = "https://helm-quotes.<you>.workers.dev";`

## What's free vs not
- Crypto: true minute, 24/7 (CoinGecko). US stocks/ETFs: minute in market hours (Finnhub).
- Canadian/TSX: **no free intraday** — those stay at the daily EOD close.
- Everything else (history, fundamentals, macro, liquidity, news): once daily.

## The one manual step
`feed/positions.csv` — refresh it from an NBDB CSV export or statement when your holdings change.

## Status in the app
Top-bar pill shows **"Live feed"** (green) when JSON loaded, **"Demo data"** otherwise.
The front-end recomputes everything (RSI, returns, backtest, signals) off the live prices automatically.
