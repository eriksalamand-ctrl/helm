name: Helm daily feed (slow lane)

# Heavy data once a day — history, fundamentals, macro, liquidity model, news.
# Quotes are handled separately by the Cloudflare Worker (feed/quotes-worker.js).
# Paths are auto-located so this works whether the project sits at the repo root
# or inside a subfolder.
on:
  schedule:
    - cron: "30 21 * * 1-5"   # 21:30 UTC, weekdays (~after US market close)
  workflow_dispatch: {}        # allow manual runs from the Actions tab

permissions:
  contents: write

# Prevent overlapping runs (e.g. a manual re-run firing while another is still
# ingesting) from racing to push and rejecting each other.
concurrency:
  group: helm-daily-feed
  cancel-in-progress: false

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Locate and run ingestion (pure stdlib)
        env:
          FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
          FINNHUB_API_KEY: ${{ secrets.FINNHUB_API_KEY }}
        run: |
          F=$(find . -name ingest.py -path '*feed*' | head -1)
          echo "Running $F"
          python "$F"
      - name: Commit snapshots
        run: |
          git config user.name "helm-bot"
          git config user.email "bot@users.noreply.github.com"
          git add -A
          git commit -m "feed: $(date -u +%FT%TZ)" || echo "no changes"
          # rebase onto whatever is newest on main before pushing, retrying a
          # few times in case another run (or a manual upload) landed first.
          for i in 1 2 3 4 5; do
            git pull --rebase origin main && git push && break
            echo "push rejected, retrying ($i)..."
            sleep $((RANDOM % 10 + 3))
          done
