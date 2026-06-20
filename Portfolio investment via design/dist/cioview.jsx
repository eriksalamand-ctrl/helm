// cioview.jsx — NBC CIO macro view + target allocation (grounds the Strategy Lab in real research)
// Source: BNC/NBC Bureau du chef des placements — Stratégie de répartition de l'actif, Juin 2026.
const { useState: useStateCio } = React;

// CIO asset-allocation tilts (−2..+2). Reading of the June 2026 "Vues - Répartition de l'actif" table.
const CIO = {
  asof: "June 2026",
  regime: "The path of discomfort",
  stance: "Overweight equities",
  thesis: "Equity markets keep grinding higher despite the Strait of Hormuz standoff. Strong corporate profits and a fragile-but-holding energy balance keep the dominant wind favourable to stocks — but watch geopolitics, sticky inflation under a new Fed chair, and crowding into the AI theme.",
  risks: ["Geopolitics · Strait of Hormuz / Iran", "Inflation & Fed (Kevin Warsh)", "AI concentration risk"],
  classes: [
    { name: "Equities", tilt: 1 },
    { name: "Fixed income", tilt: -1 },
    { name: "Cash", tilt: 0 },
    { name: "Alternatives", tilt: 1 },
  ],
  equities: [
    { name: "Canada", tilt: 0 },
    { name: "United States", tilt: 1 },
    { name: "EAFE", tilt: 0 },
    { name: "Emerging markets", tilt: 1 },
  ],
  fixedIncome: [
    { name: "Government", tilt: 0 },
    { name: "Credit", tilt: 1 },
    { name: "Duration", tilt: -1 },
  ],
  alts: [
    { name: "Gold", tilt: 1 },
    { name: "Uncorrelated strat.", tilt: 1 },
    { name: "Canadian dollar", tilt: 0 },
  ],
  // 12-month total returns (context)
  returns12m: [
    ["S&P/TSX", 36.1], ["S&P 500", 29.8], ["MSCI EM", 55.1], ["MSCI EAFE", 23.4],
    ["Gold", 39.7], ["WTI oil", 48.3], ["CA bonds", 2.9],
  ],
};

function TiltScale({ tilt, accent }) {
  // 5 cells: −2 −1 0 +1 +2
  const cells = [-2, -1, 0, 1, 2];
  const col = tilt > 0 ? accent : tilt < 0 ? "#e02424" : "var(--muted)";
  return (
    <div className="cio-scale">
      {cells.map((c) => {
        const on = (tilt > 0 && c > 0 && c <= tilt) || (tilt < 0 && c < 0 && c >= tilt) || (tilt === 0 && c === 0);
        return <span key={c} className={`cio-cell${on ? " on" : ""}${c === 0 ? " mid" : ""}`} style={on ? { background: col } : {}} />;
      })}
    </div>
  );
}

function TiltGroup({ title, rows, accent }) {
  const lbl = (t) => t > 1 ? "Strong OW" : t === 1 ? "Overweight" : t === 0 ? "Neutral" : t === -1 ? "Underweight" : "Strong UW";
  return (
    <div className="cio-group">
      <div className="cio-group-title">{title}</div>
      {rows.map((r) => (
        <div className="cio-row" key={r.name}>
          <span className="cio-row-name">{r.name}</span>
          <TiltScale tilt={r.tilt} accent={accent} />
          <span className="cio-row-lbl" style={{ color: r.tilt > 0 ? accent : r.tilt < 0 ? "#e02424" : "var(--muted)" }}>{lbl(r.tilt)}</span>
        </div>
      ))}
    </div>
  );
}

function CioMacroPanel({ accent, account }) {
  const [open, setOpen] = useStateCio(true);
  const D = window.PMData;
  const view = D.buildView(account || "all");
  // user's current equity-ish exposure (everything not Cash/Fixed)
  const equityVal = view.allocation.filter((a) => !/cash/i.test(a.name)).reduce((s, a) => s + a.value, 0);
  const equityPct = view.kpis.equity ? (equityVal / view.kpis.equity) * 100 : 0;

  return (
    <section className="pm-card cio">
      <div className="cio-head">
        <div className="cio-head-l">
          <div className="cio-eyebrow">NBC CIO view · {CIO.asof} · <span className="cio-src">Bureau du chef des placements</span></div>
          <div className="cio-regime">{CIO.regime}</div>
          <div className="cio-stance" style={{ color: accent }}>● {CIO.stance}</div>
        </div>
        <button className="cio-toggle" onClick={() => setOpen((o) => !o)}>{open ? "Hide detail" : "Show detail"}</button>
      </div>

      <p className="cio-thesis">{CIO.thesis}</p>
      <div className="cio-risks">
        {CIO.risks.map((r) => <span className="cio-risk" key={r}>{r}</span>)}
      </div>

      {open && (
        <div className="cio-detail">
          <div className="cio-grid">
            <TiltGroup title="Asset classes" rows={CIO.classes} accent={accent} />
            <TiltGroup title="Equities — regions" rows={CIO.equities} accent={accent} />
            <TiltGroup title="Fixed income" rows={CIO.fixedIncome} accent={accent} />
            <TiltGroup title="Alternatives & FX" rows={CIO.alts} accent={accent} />
          </div>

          <div className="cio-foot">
            <div className="cio-foot-l">
              <div className="cio-foot-title">Your equity exposure vs the CIO's overweight call</div>
              <div className="cio-expo">
                <div className="cio-expo-bar"><i style={{ width: `${Math.min(100, equityPct)}%`, background: accent }} /></div>
                <span className="cio-expo-val">{equityPct.toFixed(0)}% in equities</span>
              </div>
              <div className="cio-foot-note">
                The CIO is <strong style={{ color: accent }}>overweight equities</strong> and <strong style={{ color: accent }}>emerging markets</strong> — your book is concentrated in single names, so the trade ideas below tilt toward that stance while respecting your risk model.
              </div>
            </div>
            <div className="cio-returns">
              <div className="cio-foot-title">12-month total return</div>
              <div className="cio-returns-grid">
                {CIO.returns12m.map(([n, v]) => (
                  <div className="cio-ret" key={n}><span>{n}</span><strong style={{ color: v >= 0 ? accent : "#e02424" }}>+{v.toFixed(0)}%</strong></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

window.CioMacroPanel = CioMacroPanel;
