// feed-config.js — point Helm at your live data feed.
// Leave EMPTY ("") to run on the built-in demo data (mock mode).
// Set to the base URL that serves the JSON snapshots, e.g.:
//   - Cloudflare Worker:  "https://helm-quotes.<you>.workers.dev"   (serves quotes.json)
//   - GitHub Pages/raw:   "https://<you>.github.io/<repo>/feed/public"  (daily snapshots)
// The fast-lane Worker and the slow-lane GitHub job can live at different bases —
// set HELM_FEED_BASE to the daily snapshots and HELM_QUOTES_BASE to the Worker.
window.HELM_FEED_BASE = "";    // daily: prices/fx/macro/news/fundamentals
window.HELM_QUOTES_BASE = "";  // minute: quotes only (Cloudflare Worker). Falls back to HELM_FEED_BASE.
