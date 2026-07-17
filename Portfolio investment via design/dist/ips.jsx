/**
 * Helm — fast-lane quote poller (Cloudflare Worker).
 *
 * Why a Worker and not GitHub Actions: Actions cron is 5-min minimum and heavily
 * throttled. A Worker cron trigger fires every minute on the free tier (100k req/day)
 * and KV gives a free key/value store the front-end can read over HTTPS (CORS-open).
 *
 * Cadence: this handles ONLY quotes (last price + day change). History, fundamentals,
 * macro, liquidity and news stay on the once-daily GitHub Action (feed/ingest.py) —
 * they don't change intraday.
 *
 * Free-data reality:
 *   - US stocks/ETFs : Finnhub /quote (real-time, 60 calls/min free) — env FINNHUB_KEY
 *   - Crypto         : CoinGecko simple/price (free, no key)
 *   - Canadian / TSX : NOT free intraday — left at the daily EOD close (front-end keeps it)
 *
 * Setup:
 *   wrangler kv:namespace create HELM_QUOTES
 *   add the binding + a `"* * * * *"` cron trigger in wrangler.toml
 *   wrangler secret put FINNHUB_KEY
 *   set US_TICKERS below (or load from KV "config")
 */

const US_TICKERS = ["NVDA", "AVGO", "MSFT", "AAPL", "AMD", "TSLA", "META", "COIN", "LLY", "SHOP"];
const CRYPTO = { bitcoin: "BTC", ethereum: "ETH", solana: "SOL" };

const MARKET_OPEN_UTC = 13 * 60 + 30; // 09:30 ET
const MARKET_CLOSE_UTC = 20 * 60;     // 16:00 ET (approx; ignores DST + holidays)

function isUsMarketHours(d) {
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins >= MARKET_OPEN_UTC && mins <= MARKET_CLOSE_UTC;
}

async function finnhubQuote(ticker, key) {
  const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${key}`);
  if (!r.ok) return null;
  const j = await r.json();            // { c: current, dp: day %change, t: ts }
  if (j.c == null || j.c === 0) return null;
  return { last: j.c, chgPct: +(j.dp ?? 0).toFixed(2), asOf: new Date((j.t || 0) * 1000).toISOString() };
}

async function cryptoQuotes() {
  const ids = Object.keys(CRYPTO).join(",");
  const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
  if (!r.ok) return {};
  const j = await r.json();
  const out = {};
  for (const [id, sym] of Object.entries(CRYPTO)) {
    if (j[id]) out[sym] = { last: j[id].usd, chgPct: +(j[id].usd_24h_change ?? 0).toFixed(2), asOf: new Date().toISOString() };
  }
  return out;
}

async function refresh(env) {
  const now = new Date();
  const quotes = {};
  // crypto trades 24/7 — always refresh
  Object.assign(quotes, await cryptoQuotes());
  // US equities only during market hours (saves the free quota off-hours)
  if (isUsMarketHours(now) && env.FINNHUB_KEY) {
    for (const t of US_TICKERS) {
      const q = await finnhubQuote(t, env.FINNHUB_KEY);
      if (q) quotes[t] = q;
    }
  }
  const prev = JSON.parse((await env.HELM_QUOTES.get("quotes")) || "{}");
  const merged = { ...prev, ...quotes, _updatedAt: now.toISOString(), _marketOpen: isUsMarketHours(now) };
  await env.HELM_QUOTES.put("quotes", JSON.stringify(merged));
  return merged;
}

export default {
  // cron: "* * * * *"  (every minute)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refresh(env));
  },
  // GET endpoint the front-end polls: returns the latest quotes (CORS-open)
  async fetch(request, env) {
    const data = (await env.HELM_QUOTES.get("quotes")) || "{}";
    return new Response(data, {
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      },
    });
  },
};
