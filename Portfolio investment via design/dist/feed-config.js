// feed-config.js — point Helm at your live data feed.
// Leave EMPTY ("") to run on the built-in demo data (mock mode).
//
// We read directly from raw.githubusercontent.com — the daily GitHub Action commits
// feed/public/*.json and raw serves them (CORS-enabled for GET).
//
// NOTE: in this repo the feed lives under the nested upload folder, so the path includes
// "Portfolio investment via design/dist". The Action ran (verified: real data from
// stooq/coingecko/bankofcanada/fred/finnhub/gdelt). If you later move feed/ to the repo
// ROOT, change the base back to ".../main/feed/public".
//
// VERIFY: open <base>/meta.json in a browser — JSON = the top-bar pill flips Demo → Live.
window.HELM_FEED_BASE = "https://raw.githubusercontent.com/eriksalamand-ctrl/helm/main/Portfolio%20investment%20via%20design/dist/feed/public";    // daily: prices/fx/macro/news/fundamentals
window.HELM_QUOTES_BASE = "https://raw.githubusercontent.com/eriksalamand-ctrl/helm/main/Portfolio%20investment%20via%20design/dist/feed/public";  // minute quotes (set to your Cloudflare Worker URL once deployed; falls back to HELM_FEED_BASE)
window.HELM_TRANSCRIPT_BASE = "";  // YouTube-link transcripts for Vera intake — deploy feed/transcript-worker.js (2 min, free) and put its URL here; empty = public-reader fallback, less reliable
