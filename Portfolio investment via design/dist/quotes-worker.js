# Helm — go-live, step by step (with exact URLs)

Total time ≈ 15-20 min. Everything here is free. No coding — just copy/paste.

────────────────────────────────────────────────────────
## STEP 1 — Get the FRED API key (macro data)  ~3 min
1. Open: https://fredaccount.stlouisfed.org/login/secure/  → "Register" (free).
2. After login, open: https://fredaccount.stlouisfed.org/apikeys
3. Click **"Request API Key"**, type "Helm portfolio" as the use, submit.
4. Copy the 32-character key. Keep it in a note for Step 4.

## STEP 2 — Get the Finnhub API key (quotes, fundamentals, news)  ~2 min
1. Open: https://finnhub.io/register  (free).
2. After login you land on: https://finnhub.io/dashboard
3. Copy the **API key** shown there. Keep it for Step 4.

────────────────────────────────────────────────────────
## STEP 3 — Put this project on GitHub  ~5 min
You need the project files in a GitHub repo so the daily job can run.

A. Download the project: in this app use **Download** (I can also hand you a zip) → unzip it.
B. Create the repo: open https://github.com/new
   - Repository name: `helm`  (or anything)
   - Visibility: **Private** is fine.
   - Click **Create repository**.
C. Upload the files: on the new repo page click **"uploading an existing file"**
   (link in the "Quick setup" box), drag the whole unzipped folder in, then **Commit changes**.
   (Make sure the `feed/` folder and `.github/workflows/daily.yml` are included.)

## STEP 4 — Add your API keys as repo secrets  ~2 min
1. In the repo, go to: **Settings → Secrets and variables → Actions**
   Direct path: `https://github.com/<you>/helm/settings/secrets/actions`
2. **New repository secret** → Name `FRED_API_KEY`, value = your FRED key → Add.
3. **New repository secret** → Name `FINNHUB_API_KEY`, value = your Finnhub key → Add.

## STEP 5 — Add your real holdings  ~3 min
1. In the repo open `feed/positions.csv` → pencil ✏️ (Edit).
2. Columns: `account,ticker,exchange,qty,avg_cost,ccy`
   - `exchange` = `US` or `TSX`
   - It's prefilled with your statement holdings — just correct any number.
3. **Commit changes.**

## STEP 6 — Run the daily job once  ~2 min
1. Repo → **Actions** tab. If prompted "enable workflows", click **enable**.
2. Click **"Helm daily feed (slow lane)"** → **Run workflow** → **Run workflow**.
3. Wait ~1 min (green check). It creates `feed/public/*.json` and commits them.
   Check: the folder `feed/public/` now has `prices.json`, `quotes.json`, `fx.json`, `macro.json`, etc.

## STEP 7 — Serve the JSON with GitHub Pages  ~3 min
1. Repo → **Settings → Pages**.  Path: `https://github.com/<you>/helm/settings/pages`
2. Under "Build and deployment": Source = **Deploy from a branch**;
   Branch = `main`, folder = `/ (root)` → **Save**.
3. After ~1 min your files are at:
   `https://<you>.github.io/helm/feed/public/quotes.json`
   (open that URL — you should see JSON.)

## STEP 8 — Point Helm at the feed  ~1 min
1. Edit `feed-config.js` (in the repo, or here and re-upload):
   ```js
   window.HELM_FEED_BASE   = "https://<you>.github.io/helm/feed/public";
   window.HELM_QUOTES_BASE = "https://<you>.github.io/helm/feed/public"; // until the Worker is set up
   ```
2. Reload Helm. The top-bar pill flips from **"Demo data"** to **"Live feed"** (green).

✅ You now have a live, free, once-daily feed. Everything (RSI, returns, backtest, signals)
recomputes off the real prices.

────────────────────────────────────────────────────────
## OPTIONAL STEP 9 — Minute quotes (Cloudflare Worker)  ~10 min
Only if you want intraday refresh (crypto 24/7 + US stocks in market hours). Canadian/TSX
has no free intraday, so this is a nice-to-have.

1. Install the CLI:  `npm install -g wrangler`  (needs Node — https://nodejs.org)
2. Sign in:  `npx wrangler login`  (opens https://dash.cloudflare.com to authorize)
3. `cd feed`
4. `npx wrangler kv namespace create HELM_QUOTES`  → copy the `id` it prints
   into `feed/wrangler.toml` (replace `PASTE_KV_NAMESPACE_ID_HERE`).
5. `npx wrangler secret put FINNHUB_KEY`  → paste your Finnhub key.
6. `npx wrangler deploy`  → it prints your Worker URL,
   e.g. `https://helm-quotes.<you>.workers.dev`
7. In `feed-config.js` set:
   `window.HELM_QUOTES_BASE = "https://helm-quotes.<you>.workers.dev";`
8. Reload Helm — quotes now refresh every minute while markets are open.

────────────────────────────────────────────────────────
## Where to get keys (quick links)
- FRED keys:     https://fredaccount.stlouisfed.org/apikeys
- Finnhub:       https://finnhub.io/dashboard
- New GitHub repo: https://github.com/new
- Cloudflare:    https://dash.cloudflare.com
- Node.js:       https://nodejs.org

## If the pill stays "Demo data"
- Open the `quotes.json` URL directly — if it 404s, Pages isn't serving yet (wait, or recheck Step 7).
- Make sure `feed-config.js` URLs have **no trailing slash** and match your repo name exactly.
- Browser console (F12) will show a red CORS/404 line pointing at the wrong URL.
