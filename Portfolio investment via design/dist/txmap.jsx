// txmap.jsx — Transmission FLOW MAP. The rail alert says "$X at risk"; this shows the actual
// plumbing: chokepoint → intermediate nodes → the names YOU hold, ribbon width = weighted dollars
// (position value × chain strength). Reads HelmTransmission.propagate + HelmGraph — no new model.
(function () {
  const W = 940, PAD_L = 18, PAD_R = 158, NW = 11, H = 430, GAP = 9;
  const RED = "#e02424", GRN = "#0e9f6e", AMB = "#d97706";

  function money(v) { const a = Math.abs(v); return (v < 0 ? "−" : "") + "$" + (a >= 1e6 ? (a / 1e6).toFixed(2) + "M" : a >= 1e3 ? (a / 1e3).toFixed(1) + "k" : a.toFixed(0)); }
  function nodeName(n) { const G = window.HelmGraph; return G && G.chokepoints && G.chokepoints[n] ? G.chokepoints[n].name : String(n).replace(/-/g, " "); }
  function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  // ---- geometry ----
  function buildFlow(alertId, maxTickers) {
    const G = window.HelmGraph, T = window.HelmTransmission, D = window.PMData;
    if (!G || !T || !D) return null;
    const reach = T.propagate(alertId);
    const view = D.buildView("all");
    const held = {};
    view.holdings.forEach((h) => { held[h.ticker] = (held[h.ticker] || 0) + (h.dispValue || 0); });
    const touches = Object.entries(reach)
      .filter(([t]) => held[t])
      .map(([t, r]) => ({ ticker: t, w: r.w, path: r.path, rels: r.rels, $: held[t] }))
      .sort((a, b) => Math.abs(b.w * b.$) - Math.abs(a.w * a.$))
      .slice(0, maxTickers || 12);
    if (!touches.length) return { empty: true };

    const nodes = {}, links = {};
    touches.forEach((t) => {
      const flow = Math.abs(t.$ * t.w);
      t.path.forEach((n, i) => {
        const nd = nodes[n] || (nodes[n] = { id: n, depth: i, amt: 0, pos: 0, neg: 0, isTicker: false });
        nd.depth = Math.max(nd.depth, i); nd.amt += flow;
        if (t.w < 0) nd.neg += flow; else nd.pos += flow;
        if (i === t.path.length - 1) { nd.isTicker = true; nd.ticker = t.ticker; nd.held = t.$; nd.w = t.w; }
      });
      for (let i = 1; i < t.path.length; i++) {
        const f = t.path[i - 1], to = t.path[i], k = f + ">" + to;
        const L = links[k] || (links[k] = { f, t: to, amt: 0, pos: 0, neg: 0, rel: t.rels[i - 1] });
        L.amt += flow; if (t.w < 0) L.neg += flow; else L.pos += flow;
      }
    });
    // longest-path depth so every ribbon flows forward (curated graph can rejoin)
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      Object.values(links).forEach((L) => { const a = nodes[L.f], b = nodes[L.t]; if (a && b && b.depth <= a.depth) { b.depth = a.depth + 1; moved = true; } });
      if (!moved) break;
    }
    const cols = [];
    Object.values(nodes).forEach((n) => { (cols[n.depth] = cols[n.depth] || []).push(n); });
    for (let i = 0; i < cols.length; i++) if (!cols[i]) cols[i] = [];
    cols.forEach((c) => c.sort((a, b) => b.amt - a.amt));
    const maxSum = Math.max(...cols.map((c) => c.reduce((s, n) => s + n.amt, 0)), 1);
    const maxCount = Math.max(...cols.map((c) => c.length), 1);
    const scale = (H - GAP * (maxCount - 1)) / maxSum;
    cols.forEach((c) => {
      c.forEach((n) => { n.h = Math.max(13, n.amt * scale); });
      let total = c.reduce((s, n) => s + n.h, 0) + GAP * (c.length - 1);
      if (total > H) { const f = (H - GAP * (c.length - 1)) / (total - GAP * (c.length - 1)); c.forEach((n) => { n.h = Math.max(8, n.h * f); }); total = c.reduce((s, n) => s + n.h, 0) + GAP * (c.length - 1); }
      let y = (H - total) / 2 + 10;
      c.forEach((n) => { n.y = y; n.outY = y; n.inY = y; y += n.h + GAP; });
    });
    const nCols = cols.length;
    const colX = (i) => nCols < 2 ? PAD_L : PAD_L + i * ((W - PAD_L - PAD_R - NW) / (nCols - 1));
    cols.forEach((c, i) => c.forEach((n) => { n.x = colX(i); }));
    // ribbons, thickest first so small ones draw on top
    const ribbons = Object.values(links).sort((a, b) => b.amt - a.amt).map((L) => {
      const a = nodes[L.f], b = nodes[L.t];
      if (!a || !b) return null;
      const lh = Math.max(2, L.amt * scale * 0.98);
      const y0 = a.outY, y1 = b.inY;
      a.outY += lh; b.inY += lh;
      const x0 = a.x + NW, x1 = b.x, xm = (x0 + x1) / 2;
      return { d: `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + lh} C${xm},${y1 + lh} ${xm},${y0 + lh} ${x0},${y0 + lh} Z`, neg: L.neg >= L.pos, amt: L.amt, rel: L.rel, from: L.f, to: L.t };
    }).filter(Boolean);
    const hurt = touches.filter((t) => t.w < 0).reduce((s, t) => s + t.$, 0);
    const benefit = touches.filter((t) => t.w > 0).reduce((s, t) => s + t.$, 0);
    return { cols, ribbons, touches, hurt, benefit, height: H + 30 };
  }

  // ---- modal ----
  function TxFlowMap({ alertId, onClose, onPick }) {
    const [id, setId] = React.useState(alertId);
    const T = window.HelmTransmission;
    const all = React.useMemo(() => { try { return T.alerts().list; } catch (e) { return []; } }, []);
    const a = all.find((x) => x.id === id) || all[0] || null;
    const flow = React.useMemo(() => { try { return buildFlow(id, 12); } catch (e) { return null; } }, [id]);
    React.useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
    const vol = !!(a && a.vol);
    const col = (neg) => vol ? AMB : neg ? RED : GRN;

    return (
      <div className="txm-back" onClick={(e) => { if (e.target.classList.contains("txm-back")) onClose(); }}>
        <div className="txm-card">
          <div className="txm-head">
            <div>
              <div className="txm-eyebrow">Transmission flow map · where the shock lands in your book</div>
              <div className="txm-title">{a ? a.name : nodeName(id)}{a && a.it ? <span className={`txm-flag ${a.it.label}`}>{a.it.label === "hot" ? "⚠ hot" : "◔ watch"}{a.it.z != null ? ` · ${a.it.z >= 0 ? "+" : ""}${a.it.z.toFixed(1)}σ` : ""}</span> : null}{a && a.speed ? <span className="txm-speed">transmits in {a.speed}</span> : null}</div>
            </div>
            <button className="txm-x" onClick={onClose}>✕</button>
          </div>
          {all.length > 1 && (
            <div className="txm-chips">{all.map((x) => (
              <button key={x.id} className={"txm-chip" + (x.id === id ? " on" : "")} onClick={() => setId(x.id)}>{trunc(x.name, 26)}</button>
            ))}</div>
          )}
          {vol && <div className="txm-vol">Volatility node — an unforecastable actor. The map sizes <b>exposure</b>; it makes no directional call.</div>}
          {(!flow || flow.empty) && <div className="txm-empty">Nothing in this chain reaches a name you hold. That is a real answer — the event is noise for this book.</div>}
          {flow && !flow.empty && (
            <>
              <div className="txm-totals mono">
                {vol ? <em style={{ color: AMB }}>{money(flow.hurt + flow.benefit)} headline-sensitive</em>
                  : <>{flow.hurt > 0 && <em style={{ color: RED }}>−{money(flow.hurt)} exposed</em>}{flow.hurt > 0 && flow.benefit > 0 && <span className="txm-dot">·</span>}{flow.benefit > 0 && <em style={{ color: GRN }}>+{money(flow.benefit)} benefits</em>}</>}
                <span className="txm-legend">ribbon width = position × chain strength</span>
              </div>
              <div className="txm-scroll">
                <svg width={W} height={flow.height} className="txm-svg">
                  {flow.ribbons.map((r, i) => (
                    <path key={i} d={r.d} fill={col(r.neg)} fillOpacity={0.26} stroke={col(r.neg)} strokeOpacity={0.14}>
                      <title>{nodeName(r.from)} → {nodeName(r.to)} — {r.rel} · {money(r.amt)} weighted</title>
                    </path>
                  ))}
                  {flow.cols.map((c, ci) => c.map((n) => {
                    const neg = n.neg >= n.pos;
                    const label = n.isTicker ? n.ticker : trunc(nodeName(n.id), ci === 0 ? 26 : 20);
                    return (
                      <g key={n.id} className={n.isTicker ? "txm-node txm-clickable" : "txm-node"} onClick={n.isTicker && onPick ? () => { onPick(n.ticker); onClose(); } : undefined}>
                        <rect x={n.x} y={n.y} width={NW} height={n.h} rx={2.5} fill={col(neg)} fillOpacity={n.isTicker ? 0.95 : 0.55}></rect>
                        <text x={n.x + NW + 7} y={n.y + n.h / 2} dominantBaseline="middle" className={n.isTicker ? "txm-lbl tk" : "txm-lbl"}>{label}
                          <title>{n.isTicker ? `${n.ticker} · ${money(n.held)} held · chain strength ×${Math.abs(n.w).toFixed(2)}` : nodeName(n.id)}</title>
                        </text>
                        {n.isTicker && <text x={n.x + NW + 7} y={n.y + n.h / 2 + 12} dominantBaseline="middle" className="txm-sub mono">{money(n.held)} · ×{Math.abs(n.w).toFixed(2)}</text>}
                      </g>
                    );
                  }))}
                </svg>
              </div>
              <div className="txm-foot">
                <div className="txm-why"><b>Read it left to right.</b> The left bar is the event; each hop is a curated dependency ({window.HelmGraph ? window.HelmGraph.edges.length : 0} in the graph); the right column is your money. Click a ticker to open Research.</div>
                <div className="txm-honest">Edge weights are <b>analyst-curated elasticities, not regression betas</b> — the map shows where a shock <em>could</em> land and how big your position is, not a probability or a price target. {a && a.it && a.it.baselineDays < 5 ? `Event baseline still building (${a.it.baselineDays}d of history).` : ""}</div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const CSS = `
  .txm-back { position: fixed; inset: 0; background: #0b0f1799; backdrop-filter: blur(2px); z-index: 900; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .txm-card { background: var(--card, #fff); border-radius: 14px; box-shadow: 0 24px 60px #0b0f1740; width: min(1010px, 96vw); max-height: 92vh; overflow: auto; padding: 18px 22px 16px; display: flex; flex-direction: column; gap: 11px; }
  .txm-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; }
  .txm-eyebrow { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted, #8a9099); font-weight: 700; }
  .txm-title { font-size: 19px; font-weight: 650; letter-spacing: -0.01em; margin-top: 3px; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .txm-flag { font-family: var(--mono); font-size: 11px; font-weight: 700; }
  .txm-flag.hot { color: #e02424; } .txm-flag.watch { color: #b45309; }
  .txm-speed { font-size: 11px; color: var(--muted); font-weight: 500; }
  .txm-x { font: inherit; font-size: 15px; color: var(--muted); background: none; border: none; cursor: pointer; padding: 2px 4px; }
  .txm-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .txm-chip { font: inherit; font-size: 11px; font-weight: 600; color: var(--ink-2, #444); background: var(--panel, #f6f7f9); border: 1px solid var(--line, #e8ebef); border-radius: 999px; padding: 3px 10px; cursor: pointer; }
  .txm-chip.on { background: var(--ink, #111); color: #fff; border-color: var(--ink, #111); }
  .txm-vol { font-size: 11.5px; color: #92400e; background: #d9770610; border: 1px solid #d9770630; border-radius: 8px; padding: 6px 10px; }
  .txm-empty { font-size: 12.5px; color: var(--ink-2); padding: 22px 0; }
  .txm-totals { font-size: 12px; display: flex; align-items: baseline; gap: 8px; }
  .txm-totals em { font-style: normal; font-weight: 700; }
  .txm-dot { color: var(--muted); }
  .txm-legend { margin-left: auto; font-size: 10.5px; color: var(--muted); }
  .txm-scroll { overflow-x: auto; }
  .txm-svg { display: block; }
  .txm-lbl { font-size: 11.5px; fill: var(--ink, #111); paint-order: stroke; stroke: var(--card, #fff); stroke-width: 3.5px; stroke-linejoin: round; }
  .txm-lbl.tk { font-weight: 700; }
  .txm-sub { font-size: 9.5px; fill: var(--muted, #8a9099); paint-order: stroke; stroke: var(--card, #fff); stroke-width: 3px; }
  .txm-clickable { cursor: pointer; }
  .txm-clickable:hover .txm-lbl { text-decoration: underline; }
  .txm-foot { display: flex; flex-direction: column; gap: 5px; border-top: 1px solid var(--line-2, #f0f2f5); padding-top: 9px; }
  .txm-why { font-size: 11.5px; color: var(--ink-2, #444); line-height: 1.5; }
  .txm-honest { font-size: 10.5px; color: var(--muted, #8a9099); line-height: 1.5; }
  .txm-mapbtn { font: inherit; font-size: 11.5px; font-weight: 600; color: var(--accent, #2563eb); background: none; border: none; padding: 0; cursor: pointer; }
  `;
  if (!document.getElementById("helm-txm-css")) { const el = document.createElement("style"); el.id = "helm-txm-css"; el.textContent = CSS; document.head.appendChild(el); }

  window.HelmTxMap = { buildFlow };
  window.TxFlowMap = TxFlowMap;
})();
