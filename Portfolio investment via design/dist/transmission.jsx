// transmission.jsx — geopolitics → supply chain → your dollars.
// Reads window.HelmGraph (transmission-graph.js) + live GDELT/Finnhub headlines:
// keyword-scores each chokepoint, keeps a small daily history for an honest baseline,
// propagates hot events along the curated edges, and lands on tickers you HOLD with
// a $ exposure and a stance. Every alert is an implicit Iris prediction (logged for
// the Ledger). Deterministic — no LLM.
(function () {
  const D = () => window.PMData;
  const money = (n) => "$" + Math.round(Math.abs(n)).toLocaleString("en-US");

  function headlines() {
    const live = window.HelmFeed && window.HelmFeed.news;
    if (live && live.length) return live.map((n) => n.headline || "").filter(Boolean);
    return [
      "Strait of Hormuz tensions keep a risk premium in crude",
      "New Fed chair Warsh signals patience on rate cuts amid sticky core CPI",
      "China tightens gallium and germanium export licences; helium spot firm on Qatari maintenance",
      "White House floats surprise national security tariff round on autos — details unclear",
    ];
  }

  // ---- intensity per chokepoint: today's headline hits vs stored baseline ----
  const HKEY = "helm_tx_hist_v1";
  function intensities() {
    const G = window.HelmGraph; if (!G) return {};
    const hl = headlines();
    const day = new Date().toISOString().slice(0, 10);
    let hist = {}; try { hist = JSON.parse(localStorage.getItem(HKEY) || "{}"); } catch (e) {}
    const out = {};
    Object.entries(G.chokepoints).forEach(([id, c]) => {
      const count = hl.filter((h) => c.kw.test(h)).length;
      const arr = (hist[id] = hist[id] || []);
      if (!arr.length || arr[arr.length - 1].d !== day) arr.push({ d: day, c: count });
      else arr[arr.length - 1].c = count;
      hist[id] = arr.slice(-60);
      const past = arr.slice(0, -1).map((x) => x.c);
      let z = null;
      if (past.length >= 5) {
        const m = past.reduce((a, v) => a + v, 0) / past.length;
        const sd = Math.sqrt(past.reduce((a, v) => a + (v - m) * (v - m), 0) / past.length) || 0.5;
        z = (count - m) / sd;
      }
      const label = (z != null ? z >= 2 : count >= 3) ? "hot" : count >= 1 ? "watch" : "calm";
      out[id] = { count, z, label, baselineDays: past.length, name: c.name };
    });
    try { localStorage.setItem(HKEY, JSON.stringify(hist)); } catch (e) {}
    return out;
  }

  // ---- propagate a chokepoint shock along edges to ticker endpoints ----
  function propagate(srcId, maxHops = 4) {
    const G = window.HelmGraph; if (!G) return [];
    const adj = {};
    G.edges.forEach(([f, t, rel, w]) => { (adj[f] = adj[f] || []).push({ t, rel, w }); });
    const best = {}; // node -> {w, path[], rels[]}
    const q = [{ node: srcId, w: 1, path: [srcId], rels: [], hops: 0 }];
    while (q.length) {
      const cur = q.shift();
      if (cur.hops >= maxHops) continue;
      (adj[cur.node] || []).forEach((e) => {
        const w = cur.w * e.w;
        if (Math.abs(w) < 0.15) return;
        const path = [...cur.path, e.t];
        const rels = [...cur.rels, e.rel];
        if (!best[e.t] || Math.abs(w) > Math.abs(best[e.t].w)) { best[e.t] = { w, path, rels }; q.push({ node: e.t, w, path, rels, hops: cur.hops + 1 }); }
      });
    }
    // expand sector-nodes into member tickers (same weight, one more hop)
    Object.entries(G.sectorMembers || {}).forEach(([sec, members]) => {
      if (best[sec]) members.forEach((t) => {
        if (!best[t] || Math.abs(best[sec].w) > Math.abs(best[t].w)) best[t] = { w: best[sec].w, path: [...best[sec].path, t], rels: [...best[sec].rels, "sector member"] };
      });
    });
    return best;
  }

  // ---- the public read: alerts that end at YOUR dollars ----
  let _cache = null, _stamp = 0;
  function alerts() {
    if (_cache && Date.now() - _stamp < 60000) return _cache;
    const G = window.HelmGraph;
    if (!G) { _cache = { list: [], calm: [] }; return _cache; }
    const view = D().buildView("all");
    const held = {};
    view.holdings.forEach((h) => { held[h.ticker] = (held[h.ticker] || 0) + (h.dispValue || 0); });
    const ints = intensities();
    const uniSet = {};
    (window.HelmUniverse || []).forEach((u) => { uniSet[u.ticker] = true; });
    const list = [], calm = [];
    Object.entries(ints).forEach(([id, it]) => {
      if (it.label === "calm") { calm.push(it.name); return; }
      const cp = (window.HelmGraph.chokepoints || {})[id] || {};
      const vol = cp.mode === "volatility";
      const reach = propagate(id);
      const touches = Object.entries(reach)
        .filter(([t]) => held[t])
        .map(([t, r]) => ({ ticker: t, w: r.w, path: r.path, rels: r.rels, $: held[t] }))
        .sort((a, b) => Math.abs(b.w * b.$) - Math.abs(a.w * a.$));
      if (!touches.length) { calm.push(it.name); return; }
      const hurt = touches.filter((x) => x.w < 0).reduce((s, x) => s + x.$, 0);
      const benefit = touches.filter((x) => x.w > 0).reduce((s, x) => s + x.$, 0);
      // second-order: beneficiaries in the UNIVERSE you don't hold (idea, not order)
      const opp = vol ? null : Object.entries(reach)
        .filter(([t, r]) => !held[t] && uniSet[t] && r.w >= 0.3)
        .sort((a, b) => b[1].w - a[1].w).slice(0, 2)
        .map(([t, r]) => ({ ticker: t, w: r.w, rel: r.rels[r.rels.length - 1] }));
      const stance = vol
        ? "unforecastable actor — no directional call. Treat as volatility: halve new-buy size in touched names, widen stops, keep cash dry until the text of the order exists"
        : it.label === "hot"
          ? (hurt >= benefit ? "size new buys smaller in affected names · verify stops" : "hold beneficiaries · consider raising stops")
          : "watch — no action yet; flag becomes a sizing input if it stays elevated";
      list.push({ id, name: it.name, it, vol, speed: cp.speed, touches: touches.slice(0, 4), hurt, benefit, opp, stance });
    });
    list.sort((a, b) => (b.it.label === "hot") - (a.it.label === "hot") || (b.hurt + b.benefit) - (a.hurt + a.benefit));
    // log today's alerts so the Ledger can score Iris later ("did the touched tickers move?")
    try {
      const lkey = "helm_tx_ledger_v1";
      const led = JSON.parse(localStorage.getItem(lkey) || "[]");
      const day = new Date().toISOString().slice(0, 10);
      list.forEach((a) => {
        if (!led.some((e) => e.d === day && e.id === a.id)) {
          led.push({ d: day, id: a.id, label: a.it.label, tickers: a.touches.map((t) => ({ t: t.ticker, px: (view.holdings.find((h) => h.ticker === t.ticker) || {}).price })) });
        }
      });
      localStorage.setItem(lkey, JSON.stringify(led.slice(-200)));
    } catch (e) {}
    _cache = { list, calm, live: !!(window.HelmFeed && window.HelmFeed.status && window.HelmFeed.status.live) };
    _stamp = Date.now();
    return _cache;
  }
  function bustCache() { _cache = null; _stamp = 0; }

  // ---- OEC deep-data pull, inline on an alert (only when a key is saved + the event routes) ----
  function TxDeepData({ a }) {
    const [open, setOpen] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [res, setRes] = React.useState(null);
    const [err, setErr] = React.useState("");
    const O = window.HelmOEC;
    const topic = React.useMemo(() => { try { return O && O.hasKey() ? O.routeHeadline(a.name + " " + (a.stance || "")) : null; } catch (e) { return null; } }, [a.id]);
    if (!topic) return null;
    async function pull() {
      if (res) { setOpen(!open); return; }
      setOpen(true); setBusy(true); setErr("");
      try {
        const e = await O.evidenceFor(topic);
        const yr = (r) => r.year || r.time_period || r.date || "";
        const rows = e.rows.filter((r) => Object.values(r).some((v) => typeof v === "number"))
          .sort((x, y) => String(yr(y)).localeCompare(String(yr(x)))).slice(0, 4)
          .map((r) => { const nk = Object.keys(r).find((k) => typeof r[k] === "number" && !/year|id|code/i.test(k)); return { k: `${yr(r)} · ${String(r.indicator || r.series || r.country || r.ref_area || nk).slice(0, 34)}`, v: r[nk] }; });
        setRes({ rows, why: topic.why, src: topic.slug });
      } catch (ex) { setErr(ex.message); }
      finally { setBusy(false); }
    }
    return (
      <div className="tx-deep">
        <button className="tx-deep-btn" onClick={pull}>{open ? "▾" : "▸"} deep data · {topic.label}{topic.iso ? " · " + topic.iso : ""}</button>
        {open && (
          <div className="tx-deep-body">
            {busy && <span className="tx-deep-note">querying OEC…</span>}
            {err && <span className="tx-deep-note" style={{ color: "#c43d3d" }}>{err}</span>}
            {res && (
              <>
                <div className="tx-deep-why">{res.why}</div>
                {res.rows.length
                  ? res.rows.map((r, i) => <div className="tx-deep-row" key={i}><span>{r.k}</span><b className="mono">{typeof r.v === "number" ? r.v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : String(r.v)}</b></div>)
                  : <span className="tx-deep-note">no numeric rows — open Macro → Iris · deep data and query by country</span>}
                <div className="tx-deep-note">{res.src} · structural (1–2y lag) — context, not a price signal</div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // ---- Bridge panel ----
  function TransmissionAlerts({ onPick }) {
    const [, force] = React.useState(0);
    const [mapFor, setMapFor] = React.useState(null);
    React.useEffect(() => {
      const h = () => { bustCache(); force((n) => n + 1); };
      window.addEventListener("helm:feed", h);
      return () => window.removeEventListener("helm:feed", h);
    }, []);
    const { list, calm, live } = alerts();
    const G = window.HelmGraph;
    if (!G) return null;
    const nodeName = (n) => (G.chokepoints[n] ? G.chokepoints[n].name : n.replace(/-/g, " "));
    return (
      <section className="pm-card tx-card">
        <div className="tx-head">
          <span className="tx-eyebrow">Transmission — geopolitics → supply chain → your book {live ? "· live tape" : "· demo tape"}</span>
          <span className="tx-ver mono">graph {G.version} · {G.edges.length} edges</span>
        </div>
        {list.length === 0 && (
          <div className="tx-quiet">All chokepoints calm on today's tape — nothing propagates to holdings. {calm.length ? `Watched: ${calm.slice(0, 5).join(" · ")}.` : ""}</div>
        )}
        {list.map((a) => (
          <div className="tx-alert" key={a.id}>
            <div className="tx-row1">
              <span className={`tx-flag ${a.it.label}`}>{a.it.label === "hot" ? "⚠" : "◔"} {a.name}{a.it.z != null ? ` · ${a.it.z >= 0 ? "+" : ""}${a.it.z.toFixed(1)}σ vs baseline` : ` · ${a.it.count} hit${a.it.count > 1 ? "s" : ""} today`}{a.speed ? <span className="tx-speed"> · transmits in {a.speed}</span> : null}</span>
              <span className="tx-exp mono">{a.vol
                ? <em style={{ color: "#b45309" }}>{money(a.hurt + a.benefit)} headline-sensitive</em>
                : <>{a.hurt > 0 && <em style={{ color: "#e02424" }}>−{money(a.hurt)} at risk</em>}{a.hurt > 0 && a.benefit > 0 && " · "}{a.benefit > 0 && <em style={{ color: "#0e9f6e" }}>+{money(a.benefit)} benefits</em>}</>}</span>
            </div>
            {a.vol && <div className="tx-volnote">volatility node — the graph maps exposure, not direction</div>}
            {a.touches.slice(0, 2).map((t) => (
              <div className="tx-chain" key={t.ticker} title={t.rels ? t.rels.join(" → ") : ""}>
                {t.path.map((n, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="tx-arr" title={t.rels && t.rels[i - 1] ? t.rels[i - 1] : ""}>→</span>}
                    {i === t.path.length - 1
                      ? <button className="tx-tkr" onClick={() => onPick && onPick(t.ticker)}>{t.ticker}</button>
                      : <span className="tx-node">{nodeName(n)}</span>}
                  </React.Fragment>
                ))}
                <span className="tx-w mono">{a.vol ? "sensitive" : t.w > 0 ? "benefits" : "exposed"} · {money(t.$)}</span>
              </div>
            ))}
            {a.touches[0] && a.touches[0].rels && <div className="tx-why">why: {a.touches[0].rels.join(" → ")}</div>}
            {a.opp && a.opp.length > 0 && (
              <div className="tx-opp">not held, screens as beneficiary: {a.opp.map((o, i) => (
                <React.Fragment key={o.ticker}>{i > 0 && " · "}<button className="tx-tkr sm" onClick={() => onPick && onPick(o.ticker)}>{o.ticker}</button> <span className="tx-opp-rel">({o.rel})</span></React.Fragment>
              ))}</div>
            )}
            <div className="tx-stance"><b>Iris</b> {a.stance}{a.it.baselineDays < 5 ? " · baseline building (" + a.it.baselineDays + "d)" : ""}</div>
            <div className="tx-actions">
              <button className="tx-map-btn" onClick={() => setMapFor(a.id)}>⧉ flow map — see it land in the book</button>
              <TxDeepData a={a} />
            </div>
          </div>
        ))}
        {mapFor && window.TxFlowMap && React.createElement(window.TxFlowMap, { alertId: mapFor, onClose: () => setMapFor(null), onPick })}
      </section>
    );
  }

  const TX_CSS = `
  .tx-card { display: flex; flex-direction: column; gap: 10px; }
  .tx-deep { margin-top: 4px; }
  .tx-deep-btn { font: inherit; font-size: 11.5px; font-weight: 600; color: var(--accent, #2563eb); background: none; border: none; padding: 0; cursor: pointer; }
  .tx-deep-body { margin-top: 5px; padding: 7px 9px; background: var(--panel, #f6f7f9); border-radius: 7px; display: flex; flex-direction: column; gap: 3px; }
  .tx-deep-why { font-size: 11.5px; color: var(--ink-2, #444); }
  .tx-deep-row { display: flex; justify-content: space-between; gap: 8px; font-size: 11.5px; }
  .tx-deep-note { font-size: 10.5px; color: var(--muted, #888); }
  .tx-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .tx-eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; }
  .tx-ver { font-size: 10px; color: var(--muted); }
  .tx-quiet { font-size: 12.5px; color: var(--ink-2); line-height: 1.55; }
  .tx-alert { border: 1px solid var(--line-2, #f0f2f5); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 7px; }
  .tx-row1 { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .tx-flag { font-family: var(--mono); font-size: 11px; font-weight: 700; }
  .tx-flag.hot { color: #e02424; } .tx-flag.watch { color: #b45309; }
  .tx-speed { font-weight: 600; color: var(--muted); text-transform: none; }
  .tx-volnote { font-size: 10.5px; font-weight: 700; color: #b45309; background: #d9770612; border: 1px solid #d9770630; border-radius: 6px; padding: 3px 8px; align-self: flex-start; }
  .tx-why { font-size: 10.5px; color: var(--muted); font-style: italic; line-height: 1.4; }
  .tx-opp { font-size: 11px; color: var(--ink-2); }
  .tx-opp .tx-tkr.sm { font-size: 10.5px; padding: 1px 6px; }
  .tx-opp-rel { color: var(--muted); font-size: 10px; }
  .tx-exp { font-size: 11px; } .tx-exp em { font-style: normal; font-weight: 600; }
  .tx-chain { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11.5px; }
  .tx-node { background: var(--panel-2, #f8f9fb); border: 1px solid var(--line, #e8ebef); border-radius: 6px; padding: 2px 8px; color: var(--ink); }
  .tx-arr { color: var(--muted); }
  .tx-tkr { font: inherit; font-weight: 700; color: var(--ink); background: none; border: 1px solid var(--line, #e8ebef); border-radius: 6px; padding: 2px 8px; cursor: pointer; }
  .tx-tkr:hover { border-color: var(--muted); }
  .tx-w { margin-left: auto; font-size: 10.5px; color: var(--ink-2); white-space: nowrap; }
  .tx-stance { font-size: 11.5px; color: var(--ink-2); line-height: 1.5; }
  .tx-stance b { font-family: var(--mono); font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #2563eb; margin-right: 6px; }
  .tx-actions { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .tx-map-btn { font: inherit; font-size: 11.5px; font-weight: 600; color: var(--accent, #2563eb); background: none; border: none; padding: 0; cursor: pointer; text-align: left; }
  .tx-map-btn:hover { text-decoration: underline; }
  `;
  if (!document.getElementById("helm-tx-css")) {
    const el = document.createElement("style"); el.id = "helm-tx-css"; el.textContent = TX_CSS; document.head.appendChild(el);
  }

  window.HelmTransmission = { alerts, intensities, propagate, bustCache };
  window.TransmissionAlerts = TransmissionAlerts;
})();
