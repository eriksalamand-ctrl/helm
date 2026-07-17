# Cloudflare Worker config for the Helm fast-lane quote poller.
# Deploy:  npx wrangler deploy
name = "helm-quotes"
main = "quotes-worker.js"
compatibility_date = "2026-01-01"

# Workers KV store the poller writes to and the fetch endpoint reads from.
# Create it once:  npx wrangler kv:namespace create HELM_QUOTES
# then paste the returned id below.
[[kv_namespaces]]
binding = "HELM_QUOTES"
id = "PASTE_KV_NAMESPACE_ID_HERE"

# Minute cron — fires every minute (free tier).
[triggers]
crons = ["* * * * *"]

# Secret (do NOT put the key here): npx wrangler secret put FINNHUB_KEY
