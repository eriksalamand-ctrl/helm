// feed.jsx — front-end live-feed adapter. Fetches the JSON snapshots and patches PMData.
// No-op (mock mode) when HELM_FEED_BASE / HELM_QUOTES_BASE are empty.
(function () {
  const trim = (u) => (u || "").replace(/\/$/, "");
  const feedBase = () => trim(window.HELM_FEED_BASE);
  const quotesBase = () => trim(window.HELM_QUOTES_BASE) || feedBase();

  async function getJSON(base, name) {
    if (!base) return null;
    try {
      const r = await fetch(base + "/" + name, { cache: "no-store" });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  window.HelmFeed = {
    status: { live: false, source: "mock", asOf: null },

    async init(onUpdate) {
      this._onUpdate = onUpdate;
      if (!feedBase() && !quotesBase()) { this.status = { live: false, source: "mock", asOf: null }; return; }
      const [quotes, fx] = await Promise.all([
        getJSON(quotesBase(), "quotes.json"),
        getJSON(feedBase(), "fx.json"),
      ]);
      const ok = window.PMData.applyLive({ quotes, fx });
      this.status = ok
        ? { live: true, source: "feed", asOf: (quotes && quotes._updatedAt) || (fx && fx.asOf) || null,
            marketOpen: quotes ? quotes._marketOpen : undefined }
        : { live: false, source: "mock", asOf: null };
      if (ok && onUpdate) onUpdate();
      // fast-lane polling every 60s while a quotes base is configured
      if (quotesBase()) {
        clearInterval(this._timer);
        this._timer = setInterval(() => this.refresh(), 60000);
      }
    },

    async refresh() {
      const quotes = await getJSON(quotesBase(), "quotes.json");
      if (!quotes) return;
      const ok = window.PMData.applyLive({ quotes });
      if (ok) {
        this.status = { ...this.status, live: true, source: "feed",
                        asOf: quotes._updatedAt || this.status.asOf, marketOpen: quotes._marketOpen };
        if (this._onUpdate) this._onUpdate();
      }
    },
  };
})();
