// bridge.jsx — the V3 shell: three surfaces (Bridge / Book / Lab) over the existing
// modules. Bridge = the meeting, pre-held: Rhodes' brief + round-table cards + material
// news + policy watch. Book & Lab reuse the classic pages as sub-tabs (parity-safe).
// Toggled from the classic shell; state in localStorage helm_v3_on.
const { useState: useBrState, useEffect: useBrEffect, useMemo: useBrMemo } = React;

const brUP = "#0e9f6e", brDN = "#e02424", brWARN = "#d97706", brBLUE = "#2563eb", brPUR = "#7c3aed";
const brMoney = (n) => "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

const BR_CREW = {
  rhodes: { n: "Rhodes", r: "Chief", c: "#121820" },
  iris: { n: "Iris", r: "Economist", c: brBLUE },
  vera: { n: "Vera", r: "Analyst", c: brWARN },
  flint: { n: "Flint", r: "Quant", c: brUP },
};

// ---------------------------------------------------------------- Bridge surface
function BridgeSurface({ accent, onPick }) {
  // recompute when the live feed lands/refreshes — mount-time data is often demo-stale
  const [feedTick, setFeedTick] = useBrState(0);
  useBrEffect(() => {
    const h = () => {
      if (window.HelmSigma && window.HelmSigma.bustCache) window.HelmSigma.bustCache();
      if (window.HelmPulse && window.HelmPulse.bustCache) window.HelmPulse.bustCache();
      setFeedTick((n) => n + 1);
    };
    window.addEventListener("helm:feed", h);
    return () => window.removeEventListener("helm:feed", h);
  }, []);
  const fp = useBrMemo(() => window.HelmChief.factPack(), [feedTick]);
  const brief = useBrMemo(() => window.HelmChief.composeBrief(fp), [fp]);
  const [prose, setProse] = useBrState(null);
  useBrEffect(() => { let on = true; window.HelmChief.polishBrief(fp, brief).then((t) => { if (on && t) setProse(t); }); return () => { on = false; }; }, [feedTick]);
  const { K, regime, props, news, breaches } = fp;
  const [open, setOpen] = useBrState(null); // expanded card ticker

  const moveColor = (k) => k === "Buy" ? brUP : k === "Exit" ? brDN : brWARN;
  const Ava = ({ a, size = 22 }) => <span className="br-ava" style={{ background: a.c, width: size, height: size, fontSize: size * 0.48 }}>{a.n[0]}</span>;

  return (
    <div className="br-grid">
      <div className="br-main">
        {window.PulseDial && <window.PulseDial />}
        {/* ---- Rhodes' brief ---- */}
        <section className="pm-card br-brief">
          <div className="br-brief-head">
            <Ava a={BR_CREW.rhodes} size={38} />
            <div>
              <div className="br-eyebrow">Rhodes · Chief — morning brief</div>
              <div className="br-date">{new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}</div>
            </div>
            <div className="br-nl">
              <div className="br-nl-v mono">{brMoney(K.equity)}</div>
              <div className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: K.dayChangeAbs >= 0 ? brUP : brDN }}>{(K.dayChangePct >= 0 ? "+" : "−") + Math.abs(K.dayChangePct).toFixed(1)}% today</div>
            </div>
          </div>
          {prose ? (
            <p className="br-lead">{prose} <button className="br-srcbtn" title="Show the cited fact pack" onClick={() => setProse(null)}>facts ▸</button></p>
          ) : (
            <p className="br-lead">
              {brief.sentences.map((s, i) => (
                <span key={i}>{s.txt} <span className="br-src">{s.src}</span>{" "}</span>
              ))}
            </p>
          )}
          <p className="br-do">{brief.doLine}</p>
        </section>

        {/* ---- round-table cards ---- */}
        <div className="br-cards-head">
          <span className="br-eyebrow">Round table · {props.cards.length || "no"} card{props.cards.length === 1 ? "" : "s"} today</span>
          <span className="br-scanned">scanned {props.scanned} names · floor {props.floor} (+6 margin) · {props.gateLog.length} blocked at gates</span>
        </div>
        {props.cards.length === 0 && (
          <section className="pm-card br-empty">
            <strong>No proposition today.</strong> Nothing clears the conviction floor with real data at a sane σ-entry. The most honest output — the crew keeps watch.
            {props.gateLog.length > 0 && <div className="br-gatelog">Blocked: {props.gateLog.map((g) => `${g.t} (${g.g})`).join(" · ")}</div>}
          </section>
        )}
        {props.cards.map((c) => (
          <section className="pm-card br-card" key={c.kind + c.ticker}>
            <div className="br-card-top">
              <span className="br-act" style={{ color: moveColor(c.kind), background: moveColor(c.kind) + "16" }}>{c.kind.toUpperCase()}</span>
              <button className="br-tkr" onClick={() => onPick && onPick(c.ticker)}>{c.ticker}</button>
              <span className="br-nm">{c.name}{c.held ? "" : " · new"}</span>
              <span className="br-conv mono">{c.kind === "Buy" ? `edge ${c.edge.toFixed(1)} · clears bar +${(c.sig.composite - (props.floor - 6)).toFixed(0)}` : `score ${c.sig.composite}`}</span>
            </div>
            <div className="br-thesis">{c.thesis}</div>
            <div className="br-ev">
              {c.ev.map((e, i) => (
                <div className="br-ev-row" key={i}>
                  <span className={`br-chip ${e.cls}${e.tag.includes("σ") ? " nocase" : ""}`}>{e.tag}</span>
                  <span>{e.txt}</span>
                </div>
              ))}
            </div>
            <div className="br-stances">
              {["vera", "iris", "flint"].map((k) => (
                <span className="br-stance" key={k} title={c.vote && c.vote.byVoice[k] ? `${BR_CREW[k].r} · ballot weight ×${c.vote.byVoice[k].w.toFixed(2)} — ${c.vote.byVoice[k].why}` : BR_CREW[k].r}>
                  <Ava a={BR_CREW[k]} size={18} />
                  <b style={{ color: /BUY|SUPPORT/.test(c.stances[k][0]) ? brUP : /CAUTION|SMALLER|WATCH|NO/.test(c.stances[k][0]) ? brWARN : "var(--ink-2)" }}>{c.stances[k][0]}</b>
                  <i>{c.stances[k][1]}</i>
                  {c.vote && c.vote.byVoice[k] && c.vote.byVoice[k].n > 0 && <u className="br-vw mono">×{c.vote.byVoice[k].w.toFixed(2)}</u>}
                </span>
              ))}
              <span className="br-stance"><b style={{ color: c.gates.ok ? brUP : brDN }}>{c.gates.ok ? "GATES ✓" : "GATES ✗"}</b>{c.gates.notes.length > 0 && <i>{c.gates.notes[0]}</i>}</span>
              {c.vote && (
                <span className="br-stance br-verdict" title={c.vote.tracked ? "Ballots weighted by measured track records (Reflexion · Methods · Intake). Advisory — gates still rule." : "No voice has a resolved track record yet — equal weights until the ledgers accrue."}>
                  <b style={{ color: /UNANIMOUS|MAJORITY/.test(c.vote.verdict) ? brUP : /LEAN/.test(c.vote.verdict) ? "var(--ink-2)" : brWARN }}>TABLE {c.vote.verdict}</b>
                  <i>{c.vote.line}{c.vote.sizeFactor < 1 ? ` · size ×${c.vote.sizeFactor}` : ""}{c.vote.tracked ? "" : " · equal weights (no record yet)"}</i>
                </span>
              )}
            </div>
            {c.dissent && <div className="br-dissent">Dissent on record — split table, size accordingly{c.vote && c.vote.sizeFactor < 1 ? ` (×${c.vote.sizeFactor})` : ""}.</div>}
            <div className="br-kill"><b>Kill</b> {c.kill}</div>
            <div className="br-foot">
              {c.kind === "Buy" && c.route
                ? <span className="br-size">Size <b className="mono">{brMoney(c.route.amt)}</b> · {c.shares} sh · {c.route.acctName}</span>
                : <span className="br-size">{c.kind === "Trim" ? "Sell ~⅓ · keep the rest working" : "Close the position"}</span>}
              <span className="mono br-tpsl"><span style={{ color: brDN }}>SL {brMoney(c.sig.stop)}</span> · <span style={{ color: brUP }}>TP {brMoney(c.sig.target)}</span></span>
              <button className="br-link" onClick={() => setOpen(open === c.ticker ? null : c.ticker)}>{open === c.ticker ? "hide σ-band" : "σ-band"}</button>
              {window.TradeButton && <window.TradeButton label={c.kind === "Buy" ? "Log buy" : "Log " + c.kind.toLowerCase()}
                ticker={c.ticker} side={c.kind === "Buy" ? "buy" : "sell"}
                amount={c.kind === "Buy" && c.route ? c.route.amt : undefined}
                acctHint={c.route ? c.route.acct : undefined} source="Bridge" fullSell={c.kind === "Exit"} small />}
            </div>
            {open === c.ticker && c.e && (
              <div className="br-sigma">
                <window.SigmaStrip ticker={c.ticker} benchKey={c.e.benchKey} />
                <div className="br-sigma-cap">excess path vs {c.e.benchName}, 1y · now {c.e.z >= 0 ? "+" : ""}{c.e.z.toFixed(1)}σ · RS {c.e.rs ? c.e.rs.pct + "th pct" : "—"}{c.e.real ? "" : " · demo series"}</div>
              </div>
            )}
          </section>
        ))}
      </div>

      {/* ---- right rail ---- */}
      <div className="br-rail">
        {window.TransmissionAlerts && <window.TransmissionAlerts onPick={onPick} />}
        {window.OddsCard && <window.OddsCard />}
        <section className="pm-card">
          <div className="br-rail-head"><Ava a={BR_CREW.iris} size={20} /><span className="br-eyebrow">Material news · {news.items.length} of {news.total}{news.live ? " · live" : " · demo"}</span></div>
          {news.items.length === 0 && <div className="br-quiet">Nothing material to the book today.</div>}
          {news.items.map((n, i) => (
            <div className="br-news" key={i}>
              <div className="br-news-h">{n.url ? <a href={n.url} target="_blank" rel="noopener">{n.headline}</a> : n.headline}</div>
              <div className="br-news-a" style={{ color: n.touch.length ? brWARN : "var(--muted)" }}>{n.touch.length ? "→ touches " + n.touch.join(", ") : n.action}</div>
            </div>
          ))}
        </section>
        <section className="pm-card">
          <div className="br-eyebrow" style={{ marginBottom: 8 }}>Policy watch · gates</div>
          {breaches.length === 0
            ? <div className="br-quiet"><b style={{ color: brUP }}>✓ Within policy.</b> No breaches across budget, drift, regime, funded status.</div>
            : breaches.map((b) => (
              <div className="br-breach" key={b.t}><strong>{b.t}</strong><span>{b.d}</span></div>
            ))}
        </section>
        <section className="pm-card">
          <div className="br-eyebrow" style={{ marginBottom: 8 }}>The Ledger · crew scores</div>
          {(() => {
            const R = window.HelmReflexion;
            let comp = null;
            try { comp = R && R.compute ? R.compute() : null; } catch (e) {}
            const n = comp && (comp.resolved != null ? comp.resolved : (comp.rows || []).length);
            return n ? (
              <div className="br-quiet">{n} predictions resolved — hit rates accruing by regime. <button className="br-link" onClick={() => window.dispatchEvent(new CustomEvent("helm:nav", { detail: "Learning" }))}>Open ledger →</button></div>
            ) : (
              <div className="br-quiet">Gathering — the Ledger scores every stance above once predictions age ≥2 days. Until then, weights stay flat.</div>
            );
          })()}
        </section>
        {window.NightLoopCard && <window.NightLoopCard />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Book & Lab surfaces
function BrSubTabs({ tabs, cur, set, accent }) {
  return (
    <div className="br-subtabs">
      {tabs.map(([k, l]) => <button key={k} className={cur === k ? "is-on" : ""} style={cur === k ? { color: accent, borderColor: accent } : null} onClick={() => set(k)}>{l}</button>)}
    </div>
  );
}

function BookSurface({ accent, account, view, query, onPick, sub, setSub }) {
  const tabs = [["overview", "Overview"], ["holdings", "Holdings"], ["perf", "Performance"], ["plan", "Plan / IPS"], ["trades", "Trade history"]];
  return (
    <div>
      <BrSubTabs tabs={tabs} cur={sub} set={setSub} accent={accent} />
      {sub === "overview" && window.DashboardBody && <window.DashboardBody view={view} query={query} accent={accent} onPick={onPick} />}
      {sub === "holdings" && (account === "crypto" && window.CryptoView ? <window.CryptoView accent={accent} onPick={onPick} /> : window.HoldingsPage ? <window.HoldingsPage view={view} accountId={account} accent={accent} onPick={onPick} /> : null)}
      {sub === "perf" && window.Rendement && <window.Rendement accountId={account} accent={accent} />}
      {sub === "plan" && window.PlanPage && <window.PlanPage accent={accent} account={account} />}
      {sub === "trades" && window.TradeHistoryPage && <window.TradeHistoryPage accent={accent} />}
    </div>
  );
}

function LabSurface({ accent, account, onPick, sub, setSub }) {
  const tabs = [["strategy", "Strategy Lab"], ["machine", "σ Machine"], ["screener", "Screener"], ["sim", "Simulation"], ["tracker", "Tracker"], ["learning", "Learning"], ["macro", "Macro"], ["projections", "Projections"]];
  return (
    <div>
      <BrSubTabs tabs={tabs} cur={sub} set={setSub} accent={accent} />
      {sub === "strategy" && window.StrategyLab && <window.StrategyLab accent={accent} account={account} />}
      {sub === "machine" && window.CompoundingMachine && <window.CompoundingMachine accent={accent} />}
      {sub === "screener" && window.Screener && <window.Screener accent={accent} />}
      {sub === "sim" && window.PaperSim && <window.PaperSim accent={accent} account={account} />}
      {sub === "tracker" && window.StrategyTracker && <window.StrategyTracker accent={accent} />}
      {sub === "learning" && window.LearningHub && <window.LearningHub accent={accent} account={account} initial="learning" />}
      {sub === "macro" && window.MacroModule && <window.MacroModule accent={accent} />}
      {sub === "projections" && window.Projections && <window.Projections accent={accent} account={account} />}
    </div>
  );
}

// ---------------------------------------------------------------- V3 shell
function BridgeShell({ accent, onExit }) {
  const D = window.PMData;
  const [surface, setSurface] = useBrState("bridge");
  const [bookSub, setBookSub] = useBrState("overview");
  const [labSub, setLabSub] = useBrState("strategy");
  const [account, setAccount] = useBrState("all");
  const [ccy, setCcy] = useBrState(D.getDispCcy ? D.getDispCcy() : "CAD");
  const [research, setResearch] = useBrState(null);
  D.setDispCcy(ccy);
  const view = D.buildView(account);

  // classic tab names → V3 locations (helm:nav events from inner modules still route)
  useBrEffect(() => {
    const MAP = { Today: ["bridge"], Dashboard: ["book", "overview"], Holdings: ["book", "holdings"], Performance: ["book", "perf"], Plan: ["book", "plan"], "Trade History": ["book", "trades"], "Strategy Lab": ["lab", "strategy"], Screener: ["lab", "screener"], Watchlist: ["lab", "screener"], "Portfolio Simulation": ["lab", "sim"], Tracker: ["lab", "tracker"], Learning: ["lab", "learning"], "Learning Lab": ["lab", "learning"], Backtest: ["lab", "learning"], Macro: ["lab", "macro"], Projections: ["lab", "projections"] };
    const h = (e) => {
      const m = MAP[e.detail]; if (!m) return;
      setResearch(null); setSurface(m[0]);
      if (m[0] === "book" && m[1]) setBookSub(m[1]);
      if (m[0] === "lab" && m[1]) setLabSub(m[1]);
    };
    window.addEventListener("helm:nav", h);
    return () => window.removeEventListener("helm:nav", h);
  }, []);

  const [tradeModal, setTradeModal] = useBrState(null);
  useBrEffect(() => {
    const h = (e) => setTradeModal(e.detail || {});
    window.addEventListener("helm:log-trade", h);
    return () => window.removeEventListener("helm:log-trade", h);
  }, []);

  const feed = window.HelmFeed && window.HelmFeed.status || { live: false };
  const accounts = [{ id: "all", name: "All accounts" }, ...D.accounts, { id: "crypto", name: "Crypto (all)" }];

  return (
    <div className="br-shell">
      <style>{BRIDGE_CSS}</style>
      <header className="br-top">
        <span className="br-brand">HELM <i>v3</i></span>
        <nav className="br-tabs">
          {[["bridge", "Bridge"], ["book", "Book"], ["lab", "Lab"]].map(([k, l]) => (
            <button key={k} className={surface === k && !research ? "is-on" : ""} onClick={() => { setResearch(null); setSurface(k); }}>{l}</button>
          ))}
        </nav>
        <div className="br-top-r">
          <select className="br-sel" value={account} onChange={(e) => setAccount(e.target.value)} title="Account">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div className="br-ccy">{["CAD", "USD"].map((c) => <button key={c} className={ccy === c ? "is-on" : ""} onClick={() => setCcy(c)}>{c}</button>)}</div>
          <span className={`br-pill${feed.live ? " live" : ""}`}>{feed.live ? "● live" : "demo"}</span>
          <button className="br-trade" onClick={() => window.dispatchEvent(new CustomEvent("helm:log-trade", { detail: {} }))}>＋ Trade</button>
          <button className="br-exit" onClick={onExit} title="Back to the classic 12-tab shell">Classic</button>
        </div>
      </header>
      <div className="br-scroll">
        <div className="br-wrap">
          {research && window.ResearchPage
            ? <window.ResearchPage ticker={research} accent={accent} onPick={setResearch} onBack={() => setResearch(null)} />
            : surface === "bridge" ? <BridgeSurface accent={accent} onPick={setResearch} />
            : surface === "book" ? <BookSurface accent={accent} account={account} view={view} query="" onPick={setResearch} sub={bookSub} setSub={setBookSub} />
            : <LabSurface accent={accent} account={account} onPick={setResearch} sub={labSub} setSub={setLabSub} />}
        </div>
      </div>
      {tradeModal && window.LogTradeModal && <window.LogTradeModal prefill={tradeModal} accent={accent} onClose={() => setTradeModal(null)} />}
    </div>
  );
}

const BRIDGE_CSS = `
.br-shell { position: fixed; inset: 0; z-index: 60; background: var(--bg, #f4f6f8); display: flex; flex-direction: column; }
.br-top { display: flex; align-items: center; gap: 18px; padding: 10px 22px; background: #121820; color: #fff; flex: none; }
.br-brand { font-family: var(--mono); font-weight: 700; font-size: 14px; letter-spacing: 0.05em; }
.br-brand i { font-style: normal; color: #9fe8c9; font-size: 10px; vertical-align: 2px; margin-left: 2px; }
.br-tabs { display: flex; gap: 4px; }
.br-tabs button { font: inherit; font-size: 13.5px; color: #aab4c2; background: none; border: 0; border-radius: 8px; padding: 7px 16px; cursor: pointer; font-weight: 600; }
.br-tabs button:hover { color: #fff; }
.br-tabs button.is-on { background: rgba(255,255,255,.14); color: #fff; }
.br-top-r { margin-left: auto; display: flex; align-items: center; gap: 9px; }
.br-sel { font: inherit; font-size: 12px; color: #cdd5df; background: transparent; border: 1px solid rgba(255,255,255,.25); border-radius: 8px; padding: 4px 8px; }
.br-sel option { color: #121820; }
.br-ccy { display: flex; border: 1px solid rgba(255,255,255,.25); border-radius: 8px; overflow: hidden; }
.br-ccy button { font: inherit; font-size: 11px; font-weight: 600; color: #aab4c2; background: none; border: 0; padding: 4px 9px; cursor: pointer; }
.br-ccy button.is-on { background: rgba(255,255,255,.16); color: #fff; }
.br-pill { font-family: var(--mono); font-size: 10.5px; color: #aab4c2; border: 1px solid rgba(255,255,255,.25); border-radius: 99px; padding: 3px 10px; }
.br-pill.live { color: #9fe8c9; border-color: rgba(159,232,201,.4); }
.br-trade { font: inherit; font-size: 12.5px; font-weight: 700; color: #121820; background: #fff; border: 0; border-radius: 8px; padding: 6px 13px; cursor: pointer; }
.br-exit { font: inherit; font-size: 11.5px; color: #aab4c2; background: none; border: 1px solid rgba(255,255,255,.25); border-radius: 8px; padding: 5px 11px; cursor: pointer; }
.br-exit:hover { color: #fff; }
.br-scroll { flex: 1; overflow: auto; }
.br-wrap { max-width: 1180px; margin: 0 auto; padding: 20px 22px 60px; }
.br-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; align-items: start; }
.br-main { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.br-rail { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 0; }
.br-eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; }
.br-ava { display: inline-grid; place-items: center; border-radius: 30%; color: #fff; font-family: var(--mono); font-weight: 700; flex: none; }
.br-brief-head { display: flex; align-items: center; gap: 12px; }
.br-date { font-size: 15.5px; font-weight: 700; letter-spacing: -0.01em; }
.br-nl { margin-left: auto; text-align: right; }
.br-nl-v { font-size: 19px; font-weight: 700; }
.br-lead { font-size: 14.5px; line-height: 1.75; color: var(--ink); margin-top: 13px; text-wrap: pretty; }
.br-src { font-family: var(--mono); font-size: 8.5px; font-weight: 700; color: ${brBLUE}; background: ${brBLUE}14; border-radius: 4px; padding: 1px 5px; vertical-align: 2px; white-space: nowrap; }
.br-srcbtn { font: inherit; font-size: 10.5px; font-family: var(--mono); color: var(--muted); background: none; border: 1px solid var(--line); border-radius: 6px; padding: 1px 7px; cursor: pointer; }
.br-do { font-size: 13px; line-height: 1.55; color: var(--ink); margin-top: 10px; padding: 9px 13px; background: ${brUP}0f; border: 1px solid ${brUP}33; border-radius: 9px; }
.br-cards-head { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 2px 0; }
.br-scanned { font-size: 11px; color: var(--muted); font-family: var(--mono); }
.br-empty { font-size: 13.5px; color: var(--ink-2); line-height: 1.6; }
.br-empty strong { color: var(--ink); }
.br-gatelog { font-size: 11.5px; color: var(--muted); margin-top: 8px; font-family: var(--mono); }
.br-card { display: flex; flex-direction: column; gap: 9px; }
.br-card-top { display: flex; align-items: center; gap: 10px; }
.br-act { font-family: var(--mono); font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 7px; flex: none; }
.br-tkr { font: inherit; font-size: 15.5px; font-weight: 700; color: var(--ink); background: none; border: 0; padding: 0; cursor: pointer; }
.br-tkr:hover { text-decoration: underline; }
.br-nm { font-size: 12px; color: var(--muted); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.br-conv { font-size: 11px; color: var(--ink-2); }
.br-thesis { font-size: 13.5px; line-height: 1.55; color: var(--ink); }
.br-ev { display: flex; flex-direction: column; gap: 5px; }
.br-ev-row { display: flex; gap: 9px; align-items: baseline; font-size: 12px; color: var(--ink-2); line-height: 1.45; }
.br-chip { font-family: var(--mono); font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 2px 7px; border-radius: 99px; white-space: nowrap; flex: none; }
.br-chip.nocase { text-transform: none; }
.br-chip.real { background: ${brUP}1f; color: ${brUP}; }
.br-chip.mod { background: ${brBLUE}1a; color: ${brBLUE}; }
.br-chip.news { background: ${brWARN}1f; color: #b45309; }
.br-stances { display: flex; flex-wrap: wrap; gap: 7px 16px; padding: 8px 10px; background: var(--panel-2, #f8f9fb); border: 1px solid var(--line-2, #f0f2f5); border-radius: 9px; }
.br-stance { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; }
.br-stance b { font-family: var(--mono); font-size: 10px; letter-spacing: 0.03em; }
.br-stance i { font-style: normal; color: var(--muted); }
.br-vw { font-size: 9px; color: var(--muted); text-decoration: none; border: 1px solid var(--line); border-radius: 5px; padding: 0 4px; cursor: help; }
.br-verdict { border-left: 1px solid var(--line); padding-left: 12px; cursor: help; }
.br-dissent { font-size: 11.5px; color: #b45309; }
.br-kill { font-size: 12px; color: var(--ink-2); line-height: 1.5; }
.br-kill b { font-family: var(--mono); font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; color: ${brDN}; margin-right: 6px; }
.br-foot { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding-top: 9px; border-top: 1px solid var(--line-2, #f0f2f5); font-size: 12px; color: var(--ink-2); }
.br-size b { color: var(--ink); }
.br-tpsl { font-size: 11px; }
.br-link { font: inherit; font-size: 11.5px; font-weight: 600; color: ${brBLUE}; background: none; border: 0; cursor: pointer; padding: 0; }
.br-link:hover { text-decoration: underline; }
.br-sigma { padding-top: 4px; }
.br-sigma-cap { font-size: 10.5px; color: var(--muted); font-family: var(--mono); margin-top: 4px; }
.br-rail-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.br-news { padding: 8px 0; border-bottom: 1px solid var(--line-2, #f0f2f5); }
.br-news:last-child { border-bottom: 0; }
.br-news-h { font-size: 12.5px; line-height: 1.45; color: var(--ink); }
.br-news-h a { color: inherit; text-decoration: none; }
.br-news-h a:hover { text-decoration: underline; }
.br-news-a { font-size: 10.5px; font-family: var(--mono); margin-top: 3px; }
.br-quiet { font-size: 12.5px; color: var(--ink-2); line-height: 1.55; }
.br-breach { display: flex; flex-direction: column; gap: 2px; border-left: 3px solid ${brWARN}; padding: 6px 0 6px 11px; margin-bottom: 7px; font-size: 12.5px; }
.br-breach span { color: var(--ink-2); font-size: 12px; }
.br-subtabs { display: flex; gap: 7px; margin-bottom: 14px; flex-wrap: wrap; }
.br-subtabs button { font: inherit; font-size: 12.5px; font-weight: 600; color: var(--ink-2); background: var(--panel, #fff); border: 1px solid var(--line); border-radius: 9px; padding: 6px 14px; cursor: pointer; }
.br-subtabs button:hover { border-color: var(--muted); }
.br-subtabs button.is-on { }
@media (max-width: 940px) { .br-grid { grid-template-columns: 1fr; } .br-rail { position: static; } }
`;

window.BridgeShell = BridgeShell;
