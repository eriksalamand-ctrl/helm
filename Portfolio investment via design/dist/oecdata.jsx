// oecdata.jsx — Iris's "deep data" drawer: on-demand structural evidence from OEC BotMarket
// (botmarket.oec.world — World Bank / ILO / OECD / EIA / OEC datasets, free API).
// NEWS-DRIVEN, not chokepoint-only: an event-archetype router maps whatever is hot in the tape
// (yen collapse, sovereign-debt stress, trade war, pandemic, energy shock…) to the right dataset
// and pulls the numbers live. Honest scope: this data is structural (annual/quarterly, 1-2y lag) —
// it explains EXPOSURE and CONTEXT, never the day's price move. GDELT stays the trigger.
// Key handling: pasted once, kept in localStorage (helm_oec_key_v1) — NEVER in project files.
(function () {
  const { useState, useEffect } = React;
  const API = (window.HELM_OEC_BASE || "https://botmarket.oec.world/api").replace(/\/+$/, "");
  const KEY_K = "helm_oec_key_v1", CACHE_K = "helm_oec_cache_v1";

  const getKey = () => { try { return localStorage.getItem(KEY_K) || ""; } catch (e) { return ""; } };
  const setKey = (k) => { try { localStorage.setItem(KEY_K, k.trim()); } catch (e) {} };

  // 24h response cache — this data changes yearly; don't re-burn queries
  function cacheGet(url) {
    try { const c = JSON.parse(localStorage.getItem(CACHE_K) || "{}"); const e = c[url];
      if (e && Date.now() - e.t < 864e5) return e.d; } catch (e) {} return null;
  }
  function cachePut(url, d) {
    try { let c = JSON.parse(localStorage.getItem(CACHE_K) || "{}");
      const keys = Object.keys(c); if (keys.length > 24) { keys.sort((a, b) => c[a].t - c[b].t).slice(0, 12).forEach((k) => delete c[k]); }
      c[url] = { t: Date.now(), d }; localStorage.setItem(CACHE_K, JSON.stringify(c)); } catch (e) {}
  }

  async function api(path, auth) {
    const url = API + path;
    const hit = cacheGet(url); if (hit) return hit;
    const r = await fetch(url, auth ? { headers: { Authorization: "Bearer " + getKey() } } : undefined);
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "key rejected (401) — re-paste it" : "OEC API " + r.status);
    const j = await r.json();
    cachePut(url, j); return j;
  }
  const catalogSearch = (q) => api("/catalog?q=" + encodeURIComponent(q), false);
  const query = (slug, params) => api(`/datasets/${slug}/query?` + new URLSearchParams(params || {}).toString(), true);

  // ---- event-archetype router: news keywords → dataset + filters + how to read the rows ----
  // Country filters use ISO3; year left open (we take the latest rows). Each archetype names
  // WHY the dataset answers the event — that line is shown to the user.
  const ISO = { japan: "JPN", yen: "JPN", china: "CHN", yuan: "CHN", canada: "CAN", mexico: "MEX", europe: "DEU", euro: "DEU", uk: "GBR", turkey: "TUR", lira: "TUR", argentina: "ARG", brazil: "BRA", india: "IND", korea: "KOR", taiwan: "TWN" };
  const ARCHETYPES = [
    { id: "currency", label: "Currency stress", test: /yen|yuan|lira|peso|currency|devaluation|fx crisis|carry trade/i,
      slug: "wb_quarterly_external_debt_statistics_sdds", country: true,
      why: "External debt stock is the transmission channel of a currency collapse — who owes in someone else's money.", cols: ["year", "value"] },
    { id: "debt", label: "Sovereign debt", test: /sovereign|default|debt ceiling|bond vigilante|imf|restructur/i,
      slug: "wb_quarterly_public_sector_debt", country: true,
      why: "Public-sector debt levels say how much room the sovereign has before the bond market disciplines it.", cols: ["year", "value"] },
    { id: "labor", label: "Labor shock", test: /unemployment|layoffs|jobs report|labor market|strike/i,
      slug: "ilostat-key-metrics", country: true,
      why: "Unemployment + participation are the recession dashboard — consumer names live and die on this.", cols: ["year", "unemployment_rate"] },
    { id: "tax", label: "Fiscal / tax", test: /corporate tax|tax reform|fiscal|budget deficit|stimulus/i,
      slug: "oecd-tax-revenue", country: true,
      why: "Corporate tax rates move after-tax earnings directly — a 5pt change is a ~6-7% EPS swing.", cols: ["year", "corporate_tax_rate"] },
    { id: "energy", label: "Energy shock", test: /oil|opec|hormuz|natural gas|energy crisis|crude|pipeline/i,
      slug: "eia_aeo_2025", country: false,
      why: "EIA's outlook gives the supply/price baseline the shock deviates from.", cols: ["year", "value"] },
    { id: "complexity", label: "Trade structure", test: /tariff|trade war|export controls|sanctions|supply chain|reshoring|usmca|pandemic|shortage/i,
      slug: "complexity-eci-hs22-hs6", country: true,
      why: "Economic complexity = how substitutable a country's exports are. High ECI partners are hard to sanction away.", cols: ["year", "eci"] },
  ];

  function routeHeadline(txt) {
    const a = ARCHETYPES.find((x) => x.test.test(txt));
    if (!a) return null;
    const cKey = Object.keys(ISO).find((k) => new RegExp("\\b" + k, "i").test(txt));
    return { ...a, iso: cKey ? ISO[cKey] : null, headline: txt };
  }

  // pull hot topics: live news first, then transmission chokepoints
  function hotTopics() {
    const out = [];
    try { const N = (window.HelmFeed && window.HelmFeed.news) || [];
      N.slice(0, 20).forEach((n) => { const r = routeHeadline(n.headline || n.title || ""); if (r) out.push(r); }); } catch (e) {}
    try { const T = window.HelmTransmission && window.HelmTransmission.alerts();
      (T && T.list || []).slice(0, 4).forEach((al) => { const r = routeHeadline(al.chokepoint + " " + (al.why || "")); if (r && !out.some((o) => o.id === r.id)) out.push({ ...r, headline: "⛓ " + al.chokepoint }); }); } catch (e) {}
    const seen = {};
    return out.filter((o) => (seen[o.id + (o.iso || "")] ? false : (seen[o.id + (o.iso || "")] = true))).slice(0, 5);
  }

  async function evidenceFor(topic) {
    const params = { limit: 40 };
    if (topic.iso && topic.country) params.ref_area = topic.iso;
    const j = await query(topic.slug, params);
    return { topic, rows: j.rows || j.data || [], columns: j.columns || [] };
  }

  // free-text: search the catalog, query the best hit
  async function freeQuery(q) {
    const cat = await catalogSearch(q);
    const ds = (cat.datasets || cat.results || [])[0];
    if (!ds) throw new Error("no dataset matched — try different words");
    const j = await query(ds.slug, { limit: 40 });
    return { dataset: ds, rows: j.rows || j.data || [] };
  }

  // ---- panel (Macro → Economic CIO tab) ----
  function OECPanel() {
    const [key, setKeyS] = useState(getKey());
    const [input, setInput] = useState("");
    const [topics, setTopics] = useState([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [res, setRes] = useState(null); // {title, why, rows:[{k,v}], src}
    const [q, setQ] = useState("");
    useEffect(() => { setTopics(hotTopics()); }, []);

    function fmtRows(rows) {
      // keep the latest ~8 numeric rows, most recent first
      const yr = (r) => r.year || r.time_period || r.date || "";
      return rows.filter((r) => Object.values(r).some((v) => typeof v === "number"))
        .sort((a, b) => String(yr(b)).localeCompare(String(yr(a)))).slice(0, 8)
        .map((r) => {
          const numKey = Object.keys(r).find((k) => typeof r[k] === "number" && !/year|id|code/i.test(k));
          const label = r.indicator || r.series || r.variable || r.country || r.ref_area || numKey || "value";
          return { k: `${yr(r)} · ${String(label).slice(0, 42)}`, v: r[numKey] };
        });
    }
    async function pull(topic) {
      setBusy(true); setErr(""); setRes(null);
      try {
        const e = await evidenceFor(topic);
        setRes({ title: `${topic.label}${topic.iso ? " · " + topic.iso : ""}`, why: topic.why, rows: fmtRows(e.rows), src: topic.slug });
      } catch (ex) { setErr(ex.message.includes("Failed to fetch") ? "Browser blocked the call (CORS). Fallback: proxy it through a 5-line Cloudflare Worker like the quotes worker — say the word and I'll write it." : ex.message); }
      finally { setBusy(false); }
    }
    async function pullFree() {
      if (!q.trim()) return;
      setBusy(true); setErr(""); setRes(null);
      try { const e = await freeQuery(q); setRes({ title: e.dataset.name, why: e.dataset.description ? e.dataset.description.slice(0, 140) : "", rows: fmtRows(e.rows), src: e.dataset.slug }); }
      catch (ex) { setErr(ex.message.includes("Failed to fetch") ? "Browser blocked the call (CORS) — a tiny Worker proxy fixes it; ask me." : ex.message); }
      finally { setBusy(false); }
    }

    return (
      <section className="pm-card" style={{ marginTop: 16 }}>
        <style>{`.oec-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.oec-chip{font:inherit;font-size:12px;font-weight:600;color:var(--ink-2);background:var(--panel);border:1px solid var(--line);border-radius:99px;padding:5px 11px;cursor:pointer}.oec-chip:hover{border-color:var(--accent);color:var(--accent)}.oec-tbl{width:100%;border-collapse:collapse;margin-top:10px;font-size:12.5px}.oec-tbl td{padding:5px 8px;border-top:1px solid var(--line-2,#f0f2f5)}.oec-tbl td:last-child{text-align:right;font-family:var(--mono);font-weight:600}.oec-inp{font:inherit;font-size:13px;border:1px solid var(--line);border-radius:8px;padding:6px 10px;flex:1;min-width:160px}.oec-note{font-size:11.5px;color:var(--muted);margin-top:8px}.oec-why{font-size:12.5px;color:var(--ink-2);margin-top:8px;padding:8px 10px;background:var(--panel);border-radius:8px}`}</style>
        <div className="pm-card-eyebrow">Iris · deep data (OEC BotMarket)</div>
        {!key ? (
          <div>
            <p style={{ fontSize: 13, color: "var(--ink-2)", margin: "8px 0" }}>Structural evidence on demand — external debt, labor, tax, trade complexity, energy — routed from whatever is hot in the tape. Paste your BotMarket key once (stored only in this browser, never in files).</p>
            <div className="oec-row">
              <input className="oec-inp" type="password" placeholder="bot_market_ak_…" value={input} onChange={(e) => setInput(e.target.value)} />
              <button className="oec-chip" onClick={() => { if (input.trim().length > 10) { setKey(input); setKeyS(input.trim()); } }}>Save key</button>
            </div>
          </div>
        ) : (
          <div>
            <div className="oec-row">
              {topics.length ? topics.map((t, i) => (
                <button className="oec-chip" key={i} onClick={() => pull(t)} title={t.headline}>{t.label}{t.iso ? " · " + t.iso : ""}</button>
              )) : <span className="oec-note">No routable event in today's tape — use the free query below.</span>}
            </div>
            <div className="oec-row">
              <input className="oec-inp" placeholder="Ask the data: e.g. Japan external debt, corporate tax Canada…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && pullFree()} />
              <button className="oec-chip" onClick={pullFree}>Query</button>
              <button className="oec-chip" style={{ opacity: 0.6 }} onClick={() => { setKey(""); setKeyS(""); }} title="Forget the stored key">key ✕</button>
            </div>
            {busy && <div className="oec-note">querying…</div>}
            {err && <div className="oec-note" style={{ color: "var(--dn, #c43d3d)" }}>{err}</div>}
            {res && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 12 }}>{res.title}</div>
                {res.why && <div className="oec-why">{res.why}</div>}
                {res.rows.length ? (
                  <table className="oec-tbl"><tbody>{res.rows.map((r, i) => <tr key={i}><td>{r.k}</td><td>{typeof r.v === "number" ? r.v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(r.v)}</td></tr>)}</tbody></table>
                ) : <div className="oec-note">Query ran but returned no numeric rows — try the free-text box with a country name.</div>}
                <div className="oec-note">source: {res.src} · via OEC BotMarket · structural data (annual/quarterly, lags 1–2y) — context, not a price signal</div>
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  window.HelmOEC = { hotTopics, evidenceFor, freeQuery, routeHeadline, hasKey: () => !!getKey() };
  window.OECPanel = OECPanel;
})();
