// cockpit.jsx — "Today": the Chief's morning brief. Leaner v2: the Chief's synthesis and the
// day's proposed trades/readjustments get the space; macro & finance news sit beside them;
// governance folds into a compact policy strip. Mode-aware (Minimal → risk/exits only).
const { useState: useCkState } = React;

const ckUP = "#0e9f6e", ckDN = "#e02424", ckWARN = "#d97706";
const ckMoney = (n) => "$" + (Math.abs(n) >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n.toFixed(2));
const ckSign = (n, dp = 1) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(dp);

function ckCfg(risk) {
  return (window.helmPresetCfg || (() => ({ weights: { trend: 35, value: 20, reversion: 25, income: 20 }, buyBar: 62, sellBar: 40, rsiOver: 72, rsiUnder: 30, stopMult: 1, maxPos: 12 })))(risk);
}

// ---- macro & finance news (live via feed, honest demo fallback) ----
const CK_MOCK_NEWS = [
  { headline: "Strait of Hormuz tensions keep a risk premium in crude", source: "Reuters", tone: -2.1, tag: "Geopolitics" },
  { headline: "Fed chair Warsh signals patience on rate cuts amid sticky core CPI", source: "Bloomberg", tone: -0.8, tag: "Monetary" },
  { headline: "AI capex cycle broadens beyond mega-cap; concentration risk debated", source: "FT", tone: 0.6, tag: "Equities" },
  { headline: "Gold extends gains as central banks keep accumulating reserves", source: "WGC", tone: 1.1, tag: "Commodities" },
  { headline: "Canadian dollar firms on stronger commodity terms of trade", source: "BoC", tone: 0.5, tag: "FX" },
];
function ckNews() {
  const live = window.HelmFeed && window.HelmFeed.news;
  if (live && live.length) {
    return live.filter((n) => n.headline).slice(0, 6).map((n) => ({
      headline: n.headline, source: n.source || "—", tone: n.tone || 0, url: n.url,
      tag: n.ticker && n.ticker !== "MACRO" ? n.ticker : "Macro",
    }));
  }
  return CK_MOCK_NEWS;
}

function Cockpit({ accent, onNav, onPick }) {
  const D = window.PMData;
  const [, force] = useCkState(0);
  React.useEffect(() => {
    const h = () => force((n) => n + 1);
    window.addEventListener("helm:feed", h); window.addEventListener("helm:regime", h); window.addEventListener("helm:drift", h);
    return () => { window.removeEventListener("helm:feed", h); window.removeEventListener("helm:regime", h); window.removeEventListener("helm:drift", h); };
  }, []);

  const mode = window.HelmMode || "Standard";
  const minimal = mode === "Minimal";
  const st = window.computeHelmState ? window.computeHelmState() : null;
  let regime = window.HelmRegime;
  if (!regime && window.classifyRegime) { const r = window.classifyRegime(); regime = { label: r.label, bias: r.bias, key: r.key, geoScore: 0 }; window.HelmRegime = regime; }
  const drift = window.HelmDrift;
  const view = D.buildView("all");
  const K = view.kpis;
  const cfg = ckCfg(st ? st.p.riskProfile.toLowerCase() : "balanced");

  // ---- aggregate holdings by ticker for sell/trim scan ----
  const byT = {};
  D.allHoldings.forEach((h) => {
    if (!byT[h.ticker]) byT[h.ticker] = { ticker: h.ticker, name: h.name, sector: h.sector, price: h.price, spark: h.spark, divYield: h.divYield || 0, mv: 0, cost: 0, held: true };
    const q = h.qty || h.q || 0; byT[h.ticker].mv += (h.marketValue || h.price * q); byT[h.ticker].cost += (h.costBasis || (h.avg || h.price) * q);
  });
  const holds = Object.values(byT).map((h) => { h.plPct = h.cost ? ((h.mv - h.cost) / h.cost) * 100 : 0; h.weight = K.equity ? (h.mv / K.equity) * 100 : 0; return h; });

  // ---- score: exits/trims from holdings (risk-first), buys from universe ----
  const sig = (h) => window.signalsFor ? window.signalsFor(h, cfg) : null;
  const dur = (s) => window.helmDurationOf ? window.helmDurationOf(s) : { k: "Weeks" };

  const exits = holds.map((h) => ({ h, s: sig(h) })).filter((x) => x.s && x.s.action === "Sell")
    .sort((a, b) => a.s.composite - b.s.composite)
    .map((x) => ({ kind: x.s.sellKind === "Exit" ? "Exit" : "Trim", ...x }));

  const universe = (window.HelmUniverse || holds);
  const buys = universe.map((h) => ({ h, s: sig(h) })).filter((x) => x.s && x.s.action === "Buy")
    .sort((a, b) => b.s.composite - a.s.composite).slice(0, 5)
    .map((x) => ({ kind: "Buy", ...x }));

  let moves = [...exits.slice(0, 2), ...buys];
  if (minimal) moves = exits;
  moves = moves.slice(0, minimal ? 6 : 4);

  // ---- policy breaches ----
  const breaches = [];
  if (st && st.volOver > 0.5) breaches.push({ t: "Volatile budget", d: `${st.volPct.toFixed(0)}% vs ${st.p.specCap}% budget — ${st.volOver.toFixed(0)} pts over`, lvl: st.f.status === "Ahead" ? "high" : "warn", go: "Plan" });
  if (drift && drift.score != null && drift.score >= 60) breaches.push({ t: "Model drift", d: `${drift.label} · confidence ${drift.conf}`, lvl: "high", go: "Learning" });
  if (regime && /Risk-off|Defensive/.test(regime.bias)) breaches.push({ t: "Defensive regime", d: `${regime.label} — model favours de-risking`, lvl: "warn", go: "Macro" });
  if (st && st.f.status === "Behind") breaches.push({ t: "Funded behind", d: `Funded ratio ${(st.f.ratio * 100).toFixed(0)}% — return pressure high`, lvl: "warn", go: "Plan" });

  // ---- the Chief's synthesized brief ----
  const stanceWord = regime ? (/Risk-on|Constructive/.test(regime.bias) ? "lean into risk" : /Risk-off|Defensive/.test(regime.bias) ? "stay defensive" : "hold a balanced stance") : "hold a balanced stance";
  const nBuys = moves.filter((m) => m.kind === "Buy").length;
  const nAdj = moves.length - nBuys;
  const adjPhrase = nAdj ? `${nAdj} readjustment${nAdj === 1 ? "" : "s"}${exits.length > nAdj ? ` (top of ${exits.length} flagged)` : ""}` : "no readjustments";
  const lead = regime
    ? `Recommendation: ${stanceWord}${st && st.volOver > 0.5 ? ` and bring the volatile sleeve back within budget (${st.volOver.toFixed(0)} pts over)` : regime && /Risk-on|Constructive/.test(regime.bias) ? " and put cash to work in the top-conviction names below" : /Risk-off|Defensive/.test(regime.bias) ? " — trim risk and hold quality" : " and rebalance toward target weights"}. ${minimal ? "Minimal mode — risk actions only." : moves.length ? `${nBuys} buy idea${nBuys === 1 ? "" : "s"} and ${adjPhrase} are proposed below.` : "No high-conviction moves today — sit tight; a no-trade day is a valid call."}`
    : "Classifying the regime — open Macro → Economic CIO to initialise the engine.";
  const doLine = breaches.length
    ? `Do: ${breaches[0].t.toLowerCase()} first (${breaches[0].d.split("—")[0].trim()}), then review the proposed moves. Nothing else needs you today.`
    : moves.length ? `Do: review the ${moves.length} proposed move${moves.length === 1 ? "" : "s"} below — then close the app.` : "Do: nothing. You're within policy and no setup clears the bar.";

  const chips = [
    regime && { k: "Regime", v: `${regime.label} · ${regime.bias}`, go: "Macro" },
    st && { k: "Funded", v: `${st.f.status} ${(st.f.ratio * 100).toFixed(0)}%`, go: "Plan" },
    st && { k: "Vol budget", v: `${st.volPct.toFixed(0)}% of ${st.p.specCap}%`, warn: st.volOver > 0.5, go: "Plan" },
    drift && { k: "Drift", v: drift.label, warn: drift.score >= 60, go: "Learning" },
  ].filter(Boolean);

  const news = ckNews();
  const feedLive = !!(window.HelmFeed && window.HelmFeed.status && window.HelmFeed.status.live);

  const moveColor = (k) => k === "Buy" ? ckUP : k === "Exit" ? ckDN : ckWARN;
  const NavLink = ({ to, children }) => <button className="ck-link" onClick={() => onNav && onNav(to)}>{children}</button>;

  return (
    <div className="ck">
      <style>{COCKPIT_CSS}</style>

      {/* ============ the Chief's brief — the hero ============ */}
      <section className="pm-card ck-brief">
        <div className="ck-brief-top">
          <div className="ck-cio">
            <div className="ck-cio-badge" style={{ background: accent }}>CIO</div>
            <div>
              <div className="ck-eyebrow">The Chief · morning brief</div>
              <div className="ck-date">{new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}{minimal ? " · Minimal mode" : ""}</div>
            </div>
          </div>
          <div className="ck-nl">
            <div className="ck-nl-k">Net liquidity</div>
            <div className="ck-nl-v mono">{ckMoney(K.equity)}</div>
            <div className="ck-nl-d mono" style={{ color: K.dayChangeAbs >= 0 ? ckUP : ckDN }}>{ckSign(K.dayChangePct)}% today</div>
          </div>
        </div>
        <p className="ck-lead">{lead}</p>
        <p className="ck-do">{doLine}</p>
        <div className="ck-chips">
          {chips.map((c) => (
            <button className={`ck-chip${c.warn ? " warn" : ""}`} key={c.k} onClick={() => onNav && onNav(c.go)}>
              <span>{c.k}</span><strong>{c.v}</strong>
            </button>
          ))}
        </div>
      </section>

      <div className="ck-grid">
        {/* ============ proposed trades & readjustments ============ */}
        <section className="pm-card ck-moves">
          <div className="pm-card-head">
            <div className="pm-card-eyebrow">{minimal ? "Risk actions" : "Proposed trades & readjustments"}</div>
            <NavLink to="Screener">Open Screener →</NavLink>
          </div>
          {moves.length === 0 ? (
            <div className="ck-empty"><strong>No proposition today.</strong> No new buy clears the {st ? st.p.riskProfile : "current"} bar and no position needs trimming or reallocation — you're within policy. A no-trade day is a valid, disciplined call.</div>
          ) : (<React.Fragment>{moves.every((m) => m.kind !== "Buy") ? <div className="ck-move-note">No new <strong>buys</strong> clear the bar today — the moves below are <strong>risk-management trims/exits</strong> to keep the book on target.</div> : null}{moves.map(({ kind, h, s }) => {
            const d = dur(s);
            const rr = (s.target - h.price) / Math.max(0.0001, h.price - s.stop);
            const why = kind === "Buy" ? `Score ${s.composite}, ${s.mom >= 55 ? "trend confirmed" : "setup forming"}${regime && /Risk-on|Constructive/.test(regime.bias) ? ", regime supportive" : ""}`
              : kind === "Exit" ? `Score ${s.composite} weak / trend broken — exit` : `Overbought ${s.rsi.toFixed(0)} — trim into strength`;
            return (
              <div className="ck-move" key={kind + h.ticker} onClick={() => onPick && onPick(h.ticker)}>
                <div className="ck-move-act" style={{ color: moveColor(kind), background: moveColor(kind) + "16" }}>{kind}</div>
                <div className="ck-move-main">
                  <div className="ck-move-tkr">{h.ticker} <span className="ck-move-name">{h.name}</span></div>
                  <div className="ck-move-why">{why}</div>
                </div>
                <div className="ck-move-nums">
                  <div className="ck-move-tp"><span style={{ color: ckDN }}>SL {ckMoney(s.stop)}</span> · <span style={{ color: ckUP }}>TP {ckMoney(s.target)}</span></div>
                  <div className="ck-move-meta"><span className="ck-move-dur">{d.k}</span> · R:R {rr > 0 ? rr.toFixed(1) : "—"}</div>
                </div>
              </div>
            );
          })}</React.Fragment>)}
          <div className="ck-foot">Rule-based engine at your {st ? st.p.riskProfile : "current"} preset — click a row for full research, or <NavLink to="Strategy Lab">open Strategy Lab →</NavLink>. Not advice.</div>
        </section>

        {/* ============ right rail: news + policy ============ */}
        <div className="ck-rail">
          <section className="pm-card ck-news">
            <div className="pm-card-head">
              <div className="pm-card-eyebrow">Macro & finance news {feedLive ? "· live" : "· demo"}</div>
              <NavLink to="Macro">Macro →</NavLink>
            </div>
            {news.map((n, i) => {
              const tc = n.tone > 0.5 ? ckUP : n.tone < -0.5 ? ckDN : "var(--muted)";
              return (
                <div className="ck-news-row" key={i}>
                  <div className="ck-news-top">
                    <span className="ck-news-tag">{n.tag}</span>
                    <span className="ck-news-tone" style={{ color: tc }}>{n.tone > 0.5 ? "▲" : n.tone < -0.5 ? "▼" : "—"}</span>
                  </div>
                  <div className="ck-news-h">{n.url ? <a href={n.url} target="_blank" rel="noopener">{n.headline}</a> : n.headline}</div>
                  <div className="ck-news-src">{n.source}</div>
                </div>
              );
            })}
            {!feedLive && <div className="ck-foot">Demo headlines — connect the feed for live GDELT + Finnhub events.</div>}
          </section>

          <section className="pm-card ck-watch">
            <div className="pm-card-eyebrow">Policy watch</div>
            {breaches.length === 0 ? (
              <div className="ck-clear"><div className="ck-clear-ico" style={{ background: ckUP }}>✓</div><div><strong>Within policy.</strong><span>No breaches across budget, drift, regime or funded status.</span></div></div>
            ) : breaches.map((b) => (
              <div className={`ck-breach ${b.lvl}`} key={b.t}>
                <div className="ck-breach-top"><strong>{b.t}</strong><button className="ck-link" onClick={() => onNav && onNav(b.go)}>{b.go} →</button></div>
                <div className="ck-breach-d">{b.d}</div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

const COCKPIT_CSS = `
.ck { display: flex; flex-direction: column; gap: 14px; }
.ck-link { font: inherit; font-size: 12px; font-weight: 600; color: var(--accent, #0e9f6e); background: none; border: 0; cursor: pointer; padding: 0; }
.ck-link:hover { text-decoration: underline; }
.ck-brief { padding: 22px 24px; }
.ck-brief-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
.ck-cio { display: flex; gap: 12px; align-items: center; }
.ck-cio-badge { width: 44px; height: 44px; border-radius: 12px; color: #fff; font-weight: 800; font-size: 13px; display: grid; place-items: center; letter-spacing: 0.02em; }
.ck-eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); }
.ck-date { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; margin-top: 2px; }
.ck-nl { text-align: right; }
.ck-nl-k { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.ck-nl-v { font-size: 21px; font-weight: 700; }
.ck-nl-d { font-size: 12px; font-weight: 600; }
.ck-lead { font-size: 16px; line-height: 1.65; color: var(--ink); margin-top: 16px; max-width: 940px; text-wrap: pretty; }
.ck-do { font-size: 13.5px; line-height: 1.55; color: var(--ink); margin-top: 10px; max-width: 940px; padding: 10px 14px; background: color-mix(in srgb, var(--accent, #0e9f6e) 6%, transparent); border: 1px solid color-mix(in srgb, var(--accent, #0e9f6e) 20%, var(--line)); border-radius: 9px; }
.ck-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.ck-chip { display: inline-flex; align-items: baseline; gap: 7px; font: inherit; font-size: 11.5px; color: var(--muted); background: var(--panel-2, #f8f9fb); border: 1px solid var(--line); border-radius: 99px; padding: 5px 12px; cursor: pointer; }
.ck-chip strong { color: var(--ink); font-weight: 600; }
.ck-chip.warn { border-color: #d9770655; } .ck-chip.warn strong { color: #b45309; }
.ck-chip:hover { border-color: var(--muted); }
.ck-grid { display: grid; grid-template-columns: 1.45fr 1fr; gap: 14px; align-items: start; }
.ck-rail { display: flex; flex-direction: column; gap: 14px; }
.ck-move { display: flex; align-items: center; gap: 14px; padding: 13px 0; border-bottom: 1px solid var(--line-2); cursor: pointer; }
.ck-move:hover { background: var(--panel-2); }
.ck-move:last-of-type { border-bottom: 0; }
.ck-move-act { font-size: 12px; font-weight: 700; padding: 4px 11px; border-radius: 7px; flex: none; width: 52px; text-align: center; }
.ck-move-main { flex: 1; }
.ck-move-tkr { font-size: 14.5px; font-weight: 700; }
.ck-move-name { font-weight: 400; color: var(--muted); font-size: 12px; }
.ck-move-why { font-size: 12px; color: var(--ink-2); margin-top: 2px; }
.ck-move-nums { text-align: right; flex: none; }
.ck-move-tp { font-size: 11.5px; font-family: var(--mono); }
.ck-move-meta { font-size: 11px; color: var(--muted); margin-top: 2px; }
.ck-move-dur { font-weight: 600; color: var(--ink-2); }
.ck-empty, .ck-clear span { color: var(--muted); font-size: 13px; }
.ck-empty { line-height: 1.55; } .ck-empty strong { color: var(--ink); }
.ck-move-note { font-size: 12px; color: var(--ink-2); line-height: 1.5; padding: 8px 12px; margin-bottom: 10px; background: color-mix(in srgb, var(--accent, #0e9f6e) 6%, white); border: 1px solid color-mix(in srgb, var(--accent, #0e9f6e) 18%, var(--line)); border-radius: 8px; }
.ck-move-note strong { color: var(--ink); }
.ck-news-row { padding: 9px 0; border-bottom: 1px solid var(--line-2); }
.ck-news-row:last-of-type { border-bottom: 0; }
.ck-news-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px; }
.ck-news-tag { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent, #0e9f6e); }
.ck-news-tone { font-size: 10px; }
.ck-news-h { font-size: 12.5px; line-height: 1.45; color: var(--ink); }
.ck-news-h a { color: inherit; text-decoration: none; }
.ck-news-h a:hover { text-decoration: underline; }
.ck-news-src { font-size: 10.5px; color: var(--muted); margin-top: 2px; }
.ck-clear { display: flex; gap: 12px; align-items: center; padding: 6px 0; }
.ck-clear-ico { width: 28px; height: 28px; border-radius: 8px; color: #fff; display: grid; place-items: center; font-size: 14px; flex: none; }
.ck-clear strong { display: block; font-size: 13.5px; } .ck-clear span { display: block; font-size: 12px; }
.ck-breach { border-left: 3px solid; padding: 8px 0 8px 13px; margin-bottom: 8px; }
.ck-breach.high { border-color: #e02424; } .ck-breach.warn { border-color: #d97706; }
.ck-breach-top { display: flex; justify-content: space-between; align-items: baseline; }
.ck-breach-top strong { font-size: 13px; }
.ck-breach-d { font-size: 12px; color: var(--ink-2); margin-top: 2px; }
.ck-foot { font-size: 11.5px; color: var(--muted); margin-top: 12px; line-height: 1.5; }
@media (max-width: 920px) { .ck-grid { grid-template-columns: 1fr; } }
`;

window.Cockpit = Cockpit;
