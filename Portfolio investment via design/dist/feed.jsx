// feed.jsx — front-end live-feed adapter. Fetches the JSON snapshots and patches PMData.
// No-op (mock mode) when HELM_FEED_BASE / HELM_QUOTES_BASE are empty.
(function () {
  const trim = (u) => (u || "").replace(/\/$/, "");
  const feedBase = () => trim(window.HELM_FEED_BASE);
  const quotesBase = () => trim(window.HELM_QUOTES_BASE) || feedBase();

  async function getJSON(base, name) {
    if (!base) return null;
    try {
      // cache-bust in 60s buckets: raw.githubusercontent has a ~5-min CDN edge cache that
      // { cache: "no-store" } does NOT bypass, so a fresh daily commit wouldn't show for
      // minutes. A 60s-bucketed query param forces a fresh origin pull at most once/min.
      const bust = (name.indexOf("?") >= 0 ? "&" : "?") + "v=" + Math.floor(Date.now() / 60000);
      const r = await fetch(base + "/" + name + bust, { cache: "no-store" });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  window.HelmFeed = {
    status: { live: false, source: "mock", asOf: null },

    async init(onUpdate) {
      this._onUpdate = onUpdate;
      if (!feedBase() && !quotesBase()) { this.status = { live: false, source: "mock", asOf: null }; return; }
      const [quotes, prices, fx, macro, news, fundamentals] = await Promise.all([
        getJSON(quotesBase(), "quotes.json"),
        getJSON(feedBase(), "prices.json"),
        getJSON(feedBase(), "fx.json"),
        getJSON(feedBase(), "macro.json"),
        getJSON(feedBase(), "news.json"),
        getJSON(feedBase(), "fundamentals.json"),
      ]);
      this.macro = macro || null;
      this.news = news || null;
      this.fundamentals = fundamentals || null;
      this.prices = prices || null;
      const res = window.PMData.applyLive({ quotes, prices, fx }) || {};
      this.status = res.live
        ? { live: true, source: "feed", partial: !!res.partial, touched: res.touched,
            asOf: (quotes && quotes._updatedAt) || (fx && fx.asOf) || null,
            marketOpen: quotes ? quotes._marketOpen : undefined }
        : { live: false, source: "mock", asOf: null };
      if (res.live && onUpdate) onUpdate();
      // fast-lane polling every 60s while a quotes base is configured
      if (quotesBase()) {
        clearInterval(this._timer);
        this._timer = setInterval(() => this.refresh(), 60000);
      }
    },

    async refresh() {
      const quotes = await getJSON(quotesBase(), "quotes.json");
      if (!quotes) return;
      const res = window.PMData.applyLive({ quotes }) || {};
      if (res.live) {
        this.status = { ...this.status, live: true, source: "feed", touched: res.touched,
                        asOf: quotes._updatedAt || this.status.asOf, marketOpen: quotes._marketOpen };
        if (this._onUpdate) this._onUpdate();
      }
    },
  };
})();
