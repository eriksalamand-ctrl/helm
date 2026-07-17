// spine.jsx — Helm governance spine: global status strip, operating modes, decision precedence.
// Reads the Plan state (helm.plan.v1) + live household view; everything downstream can read window.HelmState.
const { useState: useSpineState, useEffect: useSpineEffect } = React;

const MODE_KEY = "helm.mode.v1";
const HELM_MODES = [
  { k: "Minimal", note: "Drawdown / stress mode — status + risk only, no new-idea noise." },
  { k: "Standard", note: "Day-to-day — full app, governance nudges on." },
  { k: "Full", note: "Deep-work — every panel, scores, drift, learning surfaced." },
];

// Master Decision Precedence (Copilot §0) — higher wins when signals conflict.
const PRECEDENCE = [
  "Capital preservation & hard risk limits",
  "Policy / IPS constraints (per-account mandate)",
  "Funded-ratio status & glidepath posture",
  "Cycle de-risk tier (pre-committed)",
  "Economic regime & CIO stance",
  "Geopolitical risk overlay",
  "Volatile-offense risk budget",
  "Opportunity / Route / Predictive scores",
  "Tax location & after-tax optimisation",
  "Tactical conviction / discretionary override (logged)",
];

function computeHelmState() {
  const HP = window.HelmPlan, D = window.PMData;
  if (!HP || !D) return null;
  const p = HP.loadPlan();
  const view = D.buildView("all");
  const current = view.kpis.equity;
  const f = HP.fundedCalc(p, current);

  // household volatile-offense %
  const sums = {}; HP.BUCKETS.forEach((b) => (sums[b] = 0));
  view.holdings.forEach((h) => { sums[HP.bucketOf(h)] += h.dispValue; });
  sums.Ballast += view.kpis.cash;
  const eq = current || 1;
  const volPct = (sums["Volatile Offense"] / eq) * 100;
  const volOver = volPct - p.specCap;

  const posture = f.n > 15 ? "Growth-Favoring" : f.n >= 10 ? "Mild Ballast" : f.n >= 5 ? "Moderate Ballast" : "Preservation";
  const regime = window.HelmRegime || null; // Phase 2 fills this
  const drift = window.HelmDrift || null;    // Phase 4 fills this
  return { p, view, f, volPct, volOver, posture, regime, drift, ccy: view.kpis.ccy };
}

function loadMode() { try { return localStorage.getItem(MODE_KEY) || "Standard"; } catch (e) { return "Standard"; } }

function HelmStatusStrip({ accent, onOpenPlan }) {
  const [, force] = useSpineState(0);
  const [mode, setMode] = useSpineState(loadMode);
  const [showPrec, setShowPrec] = useSpineState(false);
  const [modeOpen, setModeOpen] = useSpineState(false);

  useSpineEffect(() => { try { localStorage.setItem(MODE_KEY, mode); } catch (e) {} window.HelmMode = mode; }, [mode]);
  // re-read when plan/feed changes
  useSpineEffect(() => {
    const h = () => force((n) => n + 1);
    window.addEventListener("storage", h);
    window.addEventListener("helm:feed", h);
    const iv = setInterval(h, 30000);
    return () => { window.removeEventListener("storage", h); window.removeEventListener("helm:feed", h); clearInterval(iv); };
  }, []);

  const s = computeHelmState();
  if (!s) return null;
  const SC = window.HelmPlan.STATUS_COLOR;
  const volBreach = s.volOver > 0.5;

  const items = [
    { k: "Funded", v: s.f.status, c: SC[s.f.status], sub: (s.f.ratio * 100).toFixed(0) + "%" },
    { k: "Posture", v: s.posture, sub: s.f.n + "y to 55" },
    { k: "Cycle", v: (window.HelmPlan.CYCLE_TIERS.find((t) => t.k === s.p.cycleState) || {}).label || s.p.cycleState },
    { k: "Volatile budget", v: s.volPct.toFixed(0) + "% / " + s.p.specCap + "%", c: volBreach ? "#d97706" : undefined },
    { k: "Regime", v: s.regime ? s.regime.label : "—", sub: s.regime ? null : "Phase 2", dim: !s.regime },
    { k: "Drift", v: s.drift ? s.drift.label : "—", sub: s.drift ? null : "Phase 4", dim: !s.drift },
  ];
  // Minimal mode trims to the risk-critical items
  const shown = mode === "Minimal" ? items.filter((i) => ["Funded", "Cycle", "Volatile budget"].includes(i.k)) : items;

  return (
    <div className="helm-strip">
      <style>{SPINE_CSS}</style>
      <div className="helm-strip-items">
        {shown.map((i) => (
          <button key={i.k} className={`helm-si${i.dim ? " dim" : ""}`} onClick={onOpenPlan} title="Open Plan">
            <span className="helm-si-k">{i.k}</span>
            <span className="helm-si-v" style={i.c ? { color: i.c } : undefined}>
              {i.c && i.k === "Funded" ? "● " : ""}{i.v}{i.sub ? <em> · {i.sub}</em> : null}
            </span>
          </button>
        ))}
      </div>
      <div className="helm-strip-r">
        <button className="helm-prec" onClick={() => setShowPrec((v) => !v)} title="Decision precedence">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h12M3 18h6" strokeLinecap="round"/></svg>
          Precedence
        </button>
        <div className="helm-mode-wrap">
          <button className="helm-mode-btn" onClick={() => setModeOpen((v) => !v)}>
            <span className="helm-mode-dot" style={{ background: accent }} />{mode}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m6 9 6 6 6-6" strokeLinecap="round"/></svg>
          </button>
          {modeOpen && (
            <div className="helm-mode-menu" onMouseLeave={() => setModeOpen(false)}>
              {HELM_MODES.map((m) => (
                <button key={m.k} className={`helm-mode-item${mode === m.k ? " on" : ""}`}
                        onClick={() => { setMode(m.k); setModeOpen(false); }}>
                  <span className="helm-mode-name">{m.k}{mode === m.k ? " ✓" : ""}</span>
                  <span className="helm-mode-note">{m.note}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {showPrec && (
        <div className="helm-prec-pop" onMouseLeave={() => setShowPrec(false)}>
          <div className="helm-prec-head">Master decision precedence <em>— higher wins on conflict</em></div>
          <ol className="helm-prec-list">
            {PRECEDENCE.map((x, i) => <li key={i}><span className="helm-prec-n">{i + 1}</span>{x}</li>)}
          </ol>
          <div className="helm-prec-foot">From Copilot V2.1 §0. Discretionary overrides are allowed but logged &amp; fed to the learning journal.</div>
        </div>
      )}
    </div>
  );
}

const SPINE_CSS = `
.helm-strip { position: relative; display: flex; align-items: stretch; justify-content: space-between; gap: 12px;
  background: var(--surface, #fff); border-bottom: 1px solid var(--line, #e8ebef); padding: 0 22px; min-height: 42px; }
.helm-strip-items { display: flex; align-items: stretch; gap: 0; flex-wrap: wrap; }
.helm-si { display: flex; flex-direction: column; justify-content: center; gap: 1px; padding: 5px 16px 5px 0; margin-right: 16px;
  border: 0; background: none; cursor: pointer; text-align: left; border-right: 1px solid var(--line, #eee); font: inherit; }
.helm-si:hover .helm-si-v { text-decoration: underline; text-underline-offset: 2px; }
.helm-si.dim { opacity: 0.5; }
.helm-si-k { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted, #818b99); }
.helm-si-v { font-size: 12.5px; font-weight: 600; color: var(--ink, #121820); }
.helm-si-v em { font-style: normal; font-weight: 400; color: var(--muted, #818b99); }
.helm-strip-r { display: flex; align-items: center; gap: 8px; }
.helm-prec { display: inline-flex; align-items: center; gap: 5px; font: inherit; font-size: 11.5px; font-weight: 500; color: var(--ink-2, #475063);
  background: none; border: 1px solid var(--line, #e8ebef); border-radius: 7px; padding: 5px 9px; cursor: pointer; }
.helm-prec:hover { border-color: var(--muted, #aaa); }
.helm-mode-wrap { position: relative; }
.helm-mode-btn { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 12px; font-weight: 600; color: var(--ink, #121820);
  background: var(--panel-2, #f7f9fb); border: 1px solid var(--line, #e8ebef); border-radius: 7px; padding: 5px 10px; cursor: pointer; }
.helm-mode-dot { width: 7px; height: 7px; border-radius: 50%; }
.helm-mode-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 50; width: 280px; background: #fff;
  border: 1px solid var(--line, #e8ebef); border-radius: 10px; box-shadow: 0 12px 32px rgba(15,23,42,.14); padding: 6px; }
.helm-mode-item { display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; border: 0; background: none;
  padding: 9px 11px; border-radius: 7px; cursor: pointer; font: inherit; }
.helm-mode-item:hover { background: var(--panel-2, #f4f6f8); }
.helm-mode-item.on { background: color-mix(in srgb, var(--accent, #0e9f6e) 9%, #fff); }
.helm-mode-name { font-size: 13px; font-weight: 600; color: var(--ink, #121820); }
.helm-mode-note { font-size: 11px; color: var(--muted, #818b99); line-height: 1.35; }
.helm-prec-pop { position: absolute; top: calc(100% + 6px); right: 22px; z-index: 50; width: 360px; background: #fff;
  border: 1px solid var(--line, #e8ebef); border-radius: 11px; box-shadow: 0 14px 38px rgba(15,23,42,.16); padding: 14px 16px; }
.helm-prec-head { font-size: 12.5px; font-weight: 700; color: var(--ink, #121820); margin-bottom: 9px; }
.helm-prec-head em { font-style: normal; font-weight: 400; color: var(--muted, #818b99); }
.helm-prec-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.helm-prec-list li { display: flex; align-items: center; gap: 9px; font-size: 12px; color: var(--ink-2, #475063); }
.helm-prec-n { width: 18px; height: 18px; flex: none; border-radius: 5px; background: var(--panel-2, #f0f2f5); color: var(--muted, #818b99);
  font-family: var(--mono, monospace); font-size: 10px; font-weight: 600; display: grid; place-items: center; }
.helm-prec-foot { margin-top: 11px; padding-top: 10px; border-top: 1px solid var(--line, #eee); font-size: 11px; color: var(--muted, #818b99); line-height: 1.5; }
@media (max-width: 720px) { .helm-strip { flex-direction: column; align-items: flex-start; padding: 8px 16px; } }
`;

window.HelmStatusStrip = HelmStatusStrip;
window.computeHelmState = computeHelmState;
