// cioview.jsx — house strategy view + target allocation (grounds the Strategy Lab in a CIO framework)
// Built from an institutional asset-allocation framework (risk-asset tilts, June 2026 reading).
const { useState: useStateCio } = React;

// CIO asset-allocation tilts (−2..+2). Reading of the June 2026 "Vues - Répartition de l'actif" table.
const CIO = {
  asof: "June 2026",
  regime: "The path of discomfort",
  stance: "Overweight equities",
  thesis: "Equity markets keep grinding higher despite the Strait of Hormuz standoff. Strong corporate profits and a fragile-but-holding energy balance keep the dominant wind favourable to stocks — but watch geopolitics, sticky inflation under a new Fed chair, and crowding into the AI theme.",
  risks: ["Geopolitics · Strait of Hormuz / Iran", "Inflation & Fed (Kevin Warsh)", "AI concentration risk"],
  stanceTrend: 1, // +1 tilting more risk-on, -1 risk-off, 0 steady (the CIO's latest move)
  stanceWhy: "Raised on expanding global liquidity, despite the Hormuz risk premium.",
  classes: [
    { name: "Equities", tilt: 1, d: 1, why: "Raised on liquidity tailwind + strong profits" },
    { name: "Fixed income", tilt: -1, d: 0 },
    { name: "Cash", tilt: 0, d: -1, why: "Trimmed cash to fund equity add" },
    { name: "Alternatives", tilt: 1, d: 1, why: "Raised — gold hedge vs geopolitics" },
  ],
  equities: [
    { name: "Canada", tilt: 0, d: 0 },
    { name: "United States", tilt: 1, d: 0 },
    { name: "EAFE", tilt: 0, d: 0 },
    { name: "Emerging markets", tilt: 1, d: 1, why: "Raised — earnings revisions turned positive" },
  ],
  fixedIncome: [
    { name: "Government", tilt: 0, d: 0 },
    { name: "Credit", tilt: 1, d: 0 },
    { name: "Duration", tilt: -1, d: -1, why: "Cut — sticky inflation under new Fed chair" },
  ],
  alts: [
    { name: "Gold", tilt: 1, d: 1, why: "Raised — geopolitical hedge, central-bank buying" },
    { name: "Uncorrelated strat.", tilt: 1, d: 0 },
    { name: "Canadian dollar", tilt: 0, d: 0 },
  ],
  // 12-month total returns (context)
  returns12m: [
    ["S&P/TSX", 36.1], ["S&P 500", 29.8], ["MSCI EM", 55.1], ["MSCI EAFE", 23.4],
    ["Gold", 39.7], ["WTI oil", 48.3], ["CA bonds", 2.9],
  ],
};

// ===== Live macro monitor (transmission chain: real macro → asset-class signal) =====
// Reads window.HelmFeed.macro (real FRED/BoC series) + window.HelmRegime. Returns a
// directional live score (−2..+2) per asset class, to compare against the CIO's strategic tilt.
function cioTrend(series, n) { if (!series || series.length < 2) return null; const a = series[series.length - 1].v, j = Math.max(0, series.length - 1 - n), b = series[j].v; return b ? ((a - b) / Math.abs(b)) * 100 : null; }
function cioLast(series) { return series && series.length ? series[series.length - 1].v : null; }
function cioYoY(series) { if (!series || series.length < 2) return null; const last = series[series.length - 1]; const target = new Date(last.d).getTime() - 365 * 86400000; let best = null, bd = Infinity; for (const p of series) { const diff = Math.abs(new Date(p.d).getTime() - target); if (diff < bd) { bd = diff; best = p; } } return best && best.v ? ((last.v - best.v) / Math.abs(best.v)) * 100 : null; }
function cioClamp(v) { return Math.max(-2, Math.min(2, v)); }

function cioLiveSignals() {
  const f = window.HelmFeed, r = window.HelmRegime;
  if (!f || !f.macro || !f.status || !f.status.live) return null;
  const m = f.macro;
  const bias = r ? r.bias : "Neutral";
  const biasScore = /Risk-on/.test(bias) ? 2 : /Constructive/.test(bias) ? 1 : /Defensive/.test(bias) ? -1 : /Risk-off/.test(bias) ? -2 : 0;
  const liq = cioTrend(m.net_liquidity, 60);          // 3-mo net-liquidity trend (Fed/Raoul lens)
  const y10 = cioTrend(m.us10y, 60);                  // 3-mo move in 10y yield
  const curve = (cioLast(m.us10y) != null && cioLast(m.us2y) != null) ? cioLast(m.us10y) - cioLast(m.us2y) : null;
  const cpiTrend = cioTrend(m.us_cpi, 120);           // disinflation if < 0
  const cpiYoY = cioYoY(m.us_cpi);                     // inflation rate (CPI index → YoY %)
  const realYield = (cioLast(m.us10y) != null && cpiYoY != null) ? cioLast(m.us10y) - cpiYoY : null;
  const wti = cioTrend(m.wti_oil, 252);               // 12-mo WTI
  const ff = cioLast(m.fed_funds);

  // Equities: liquidity tailwind + regime
  let eq = 0; if (liq != null) eq += liq > 2 ? 1 : liq < -2 ? -1 : 0; eq += biasScore >= 1 ? 1 : biasScore <= -1 ? -1 : 0; eq = cioClamp(eq);
  // Duration / govt bonds: falling yields + disinflation = attractive
  let dur = 0; if (y10 != null) dur += y10 < -3 ? 1 : y10 > 3 ? -1 : 0; if (cpiYoY != null) dur += cpiYoY < 2.5 ? 1 : cpiYoY > 3.5 ? -1 : 0; dur = cioClamp(dur);
  // Gold / alts: low/ falling real yields + liquidity + geopolitics
  let gold = 0; if (realYield != null) gold += realYield < 1.5 ? 1 : realYield > 2.5 ? -1 : 0; if (liq != null && liq > 2) gold += 1; if (r && r.geoScore > 0) gold += 1; gold = cioClamp(gold);
  // Cash: high policy rate + risk-off = competitive
  let cash = 0; if (ff != null) cash += ff > 4 ? 1 : ff < 2 ? -1 : 0; cash += biasScore <= -1 ? 1 : biasScore >= 1 ? -1 : 0; cash = cioClamp(cash);
  // Credit: risk appetite proxy
  const credit = cioClamp(biasScore);

  return {
    asOf: f.status.asOf, bias, biasScore, regimeLabel: r ? r.label : null,
    drivers: { liq, y10, curve, cpiYoY, realYield, wti, ff },
    byRow: { "Equities": eq, "United States": eq, "Emerging markets": eq, "Fixed income": dur, "Government": dur, "Duration": dur, "Credit": credit, "Cash": cash, "Alternatives": gold, "Gold": gold },
  };
}

function LiveBadge({ tilt, live }) {
  if (live == null) return <span className="cio-live cio-live-na" title="No live macro proxy — framework view only">·</span>;
  const sT = Math.sign(tilt), sL = Math.sign(live);
  let state, txt, col;
  if (sT === 0 || sL === 0) { state = "neutral"; txt = "neutral"; col = "var(--muted)"; }
  else if (sT === sL) { state = "confirm"; txt = "confirmed"; col = "#0e9f6e"; }
  else { state = "atodds"; txt = "at odds"; col = "#d97706"; }
  const icon = state === "confirm" ? "✓" : state === "atodds" ? "⚠" : "≈";
  return <span className={`cio-live cio-live-${state}`} style={{ color: col }} title={`Live macro signal ${live > 0 ? "+" : ""}${live} vs CIO tilt ${tilt > 0 ? "+" : ""}${tilt} — ${txt}`}>{icon}</span>;
}

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

function TiltGroup({ title, rows, accent, liveSig }) {
  const lbl = (t) => t > 1 ? "Strong OW" : t === 1 ? "Overweight" : t === 0 ? "Neutral" : t === -1 ? "Underweight" : "Strong UW";
  return (
    <div className="cio-group">
      <div className="cio-group-title">{title}</div>
      {rows.map((r) => (
        <div className="cio-row" key={r.name}>
          <span className="cio-row-name">{r.name}</span>
          {r.d ? <span className="cio-arrow" style={{ color: r.d > 0 ? accent : "#e02424" }} title={r.why || (r.d > 0 ? "raised" : "cut")}>{r.d > 0 ? "▲" : "▼"}</span> : <span className="cio-arrow cio-arrow-flat">·</span>}
          <TiltScale tilt={r.tilt} accent={accent} />
          <span className="cio-row-lbl" style={{ color: r.tilt > 0 ? accent : r.tilt < 0 ? "#e02424" : "var(--muted)" }}>{lbl(r.tilt)}</span>
          {liveSig ? <LiveBadge tilt={r.tilt} live={liveSig.byRow.hasOwnProperty(r.name) ? liveSig.byRow[r.name] : null} /> : null}
        </div>
      ))}
    </div>
  );
}

function CioMacroPanel({ accent, account, compact }) {
  const [open, setOpen] = useStateCio(!compact);
  const D = window.PMData;
  const view = D.buildView(account || "all");
  const liveSig = cioLiveSignals();
  // user's current equity-ish exposure (everything not Cash/Fixed)
  const equityVal = view.allocation.filter((a) => !/cash/i.test(a.name)).reduce((s, a) => s + a.value, 0);
  const equityPct = view.kpis.equity ? (equityVal / view.kpis.equity) * 100 : 0;

  // compact mode (Strategy Lab): just the exposure-vs-call gap — the narrative lives in Macro
  if (compact) {
    return (
      <section className="pm-card cio cio-compact">
        <div className="cio-foot-title">Your exposure vs the CIO call
          <span className="cio-src" style={{ fontWeight: 400 }}> · {CIO.stance} · <button className="cio-link" onClick={() => window.dispatchEvent(new CustomEvent("helm:nav", { detail: "Macro" }))}>full view in Macro →</button></span>
        </div>
        <div className="cio-expo">
          <div className="cio-expo-bar"><i style={{ width: `${Math.min(100, equityPct)}%`, background: accent }} /></div>
          <span className="cio-expo-val">{equityPct.toFixed(0)}% in equities</span>
        </div>
        <div className="cio-foot-note">CIO is <strong style={{ color: accent }}>overweight equities &amp; EM</strong>; the trades below tilt toward that stance within your risk model.</div>
      </section>
    );
  }

  return (
    <section className="pm-card cio">
      <div className="cio-head">
        <div className="cio-head-l">
          <div className="cio-eyebrow">Strategy view · <span className="cio-src">Chief Investment Office</span> · <span style={{ color: "#b45309", background: "#d977060f", border: "1px solid #d9770633", borderRadius: 99, padding: "1px 8px", fontSize: 10 }}>framework baseline {CIO.asof} — static text, does not auto-update</span></div>
          <div className="cio-regime">{CIO.regime}</div>
          <div className="cio-stance" style={{ color: accent }}>● {CIO.stance}
            {CIO.stanceTrend ? <span className="cio-stance-trend" style={{ color: CIO.stanceTrend > 0 ? accent : "#e02424" }} title={CIO.stanceWhy}>{CIO.stanceTrend > 0 ? "▲ tilting risk-on" : "▼ tilting risk-off"}</span> : null}
          </div>
          {CIO.stanceWhy ? <div className="cio-stance-why">{CIO.stanceWhy}</div> : null}
        </div>
        <button className="cio-toggle" onClick={() => setOpen((o) => !o)}>{open ? "Hide detail" : "Show detail"}</button>
      </div>

      <p className="cio-thesis">{CIO.thesis}</p>
      <div className="cio-risks">
        {CIO.risks.map((r) => <span className="cio-risk" key={r}>{r}</span>)}
      </div>

      {liveSig && (() => {
        const stanceRiskOn = CIO.stanceTrend > 0 || /[Oo]verweight equit/.test(CIO.stance);
        const diverge = (stanceRiskOn && liveSig.biasScore <= -1) || (!stanceRiskOn && liveSig.biasScore >= 1);
        const D = liveSig.drivers;
        const fmtT = (v, unit, inv) => v == null ? "—" : <strong style={{ color: (inv ? -v : v) >= 0 ? "#0e9f6e" : "#e02424" }}>{v > 0 ? "+" : ""}{v.toFixed(unit === "pp" ? 2 : 1)}{unit === "pp" ? "pp" : "%"}</strong>;
        return (
          <div className="cio-livewrap">
            <div className={`cio-recon ${diverge ? "diverge" : "align"}`}>
              <span className="cio-recon-tag" style={{ background: diverge ? "#d97706" : "#0e9f6e" }}>{diverge ? "⚠ DIVERGENCE" : "✓ ALIGNED"}</span>
              <span className="cio-recon-txt">
                Framework stance (<strong>{CIO.asof}</strong>): {CIO.stance}. Live macro regime: <strong>{liveSig.regimeLabel || "—"} · {liveSig.bias}</strong> as of {liveSig.asOf}.
                {diverge ? " The strategic call and today's macro disagree — the framework view is dated; treat tilts as under review and watch for a stance change." : " Real macro currently supports the strategic call."}
              </span>
            </div>
            {(() => {
              const items = ((window.HelmFeed && window.HelmFeed.news) || []).filter((n) => n.headline).slice(0, 3);
              const t = liveSig.asOf ? new Date(liveSig.asOf) : null;
              const staleDays = t && !isNaN(t) ? Math.floor((Date.now() - t.getTime()) / 864e5) : null;
              return (
                <div style={{ margin: "10px 0 2px" }}>
                  {staleDays != null && staleDays > 3 && (
                    <div style={{ fontSize: 12, color: "#b45309", background: "#d977060f", border: "1px solid #d9770633", borderRadius: 8, padding: "7px 10px", marginBottom: 8, lineHeight: 1.5 }}>
                      ⚠ Feed data is <strong>{staleDays} days old</strong> (last {liveSig.asOf}) — the daily GitHub Action may be failing again. Check the repo's Actions tab; headlines and macro below reflect the last successful run, not today.
                    </div>
                  )}
                  {items.length > 0 && (
                    <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 11px" }}>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", marginBottom: 5, fontWeight: 600 }}>Live tape — latest headlines (auto-updates daily · the framework text above does not)</div>
                      {items.map((n, i) => (
                        <div key={i} style={{ fontSize: 12, color: "var(--ink-2)", padding: "2px 0", lineHeight: 1.45 }}>· {n.headline}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="cio-drivers">
              <div className="cio-drivers-title">Live macro drivers · real feed</div>
              <div className="cio-drivers-grid">
                <div className="cio-driver"><span>Net liquidity · 3-mo</span>{fmtT(D.liq)}<em>risk-asset fuel</em></div>
                <div className="cio-driver"><span>10y yield · 3-mo</span>{fmtT(D.y10, "%", true)}<em>↓ = duration friendly</em></div>
                <div className="cio-driver"><span>2s10s curve</span>{D.curve == null ? "—" : <strong style={{ color: D.curve >= 0 ? "#0e9f6e" : "#e02424" }}>{D.curve > 0 ? "+" : ""}{D.curve.toFixed(2)}</strong>}<em>{D.curve == null ? "" : D.curve < 0 ? "inverted" : "positive"}</em></div>
                <div className="cio-driver"><span>Real 10y yield</span>{D.realYield == null ? "—" : <strong>{D.realYield.toFixed(1)}%</strong>}<em>↓ = gold friendly</em></div>
                <div className="cio-driver"><span>CPI · YoY</span>{D.cpiYoY == null ? "—" : <strong style={{ color: D.cpiYoY <= 3 ? "#0e9f6e" : "#d97706" }}>{D.cpiYoY.toFixed(1)}%</strong>}<em>inflation</em></div>
                <div className="cio-driver"><span>WTI · 12-mo</span>{fmtT(D.wti)}<em>energy/geopolitics</em></div>
                <div className="cio-driver"><span>Fed funds</span>{D.ff == null ? "—" : <strong>{D.ff.toFixed(2)}%</strong>}<em>cash hurdle</em></div>
              </div>
              <div className="cio-drivers-note">Transmission chain (Finance 101): liquidity &amp; rates → asset-class signal → the badges beside each tilt: <strong style={{ color: "#0e9f6e" }}>✓ confirmed</strong> · <strong style={{ color: "#d97706" }}>⚠ at odds</strong> · <strong>≈ neutral</strong> · <span style={{ opacity: .55 }}>· no live proxy</span>. Tilts are the strategic view; badges are today's macro check.</div>
            </div>
          </div>
        );
      })()}

      {open && (
        <div className="cio-detail">
          <div className="cio-grid">
            <TiltGroup title="Asset classes" rows={CIO.classes} accent={accent} liveSig={liveSig} />
            <TiltGroup title="Equities — regions" rows={CIO.equities} accent={accent} liveSig={liveSig} />
            <TiltGroup title="Fixed income" rows={CIO.fixedIncome} accent={accent} liveSig={liveSig} />
            <TiltGroup title="Alternatives & FX" rows={CIO.alts} accent={accent} liveSig={liveSig} />
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
if (typeof document !== "undefined" && !document.getElementById("cio-compact-css")) {
  const st = document.createElement("style"); st.id = "cio-compact-css";
  st.textContent = ".cio-compact .cio-expo{margin-top:8px}.cio-link{font:inherit;color:var(--accent,#0e9f6e);background:none;border:0;cursor:pointer;padding:0;font-size:inherit}.cio-link:hover{text-decoration:underline}"
    + ".cio-livewrap{display:flex;flex-direction:column;gap:10px;margin:14px 0 4px}"
    + ".cio-recon{display:flex;align-items:flex-start;gap:10px;padding:11px 14px;border-radius:10px;border:1px solid}"
    + ".cio-recon.diverge{background:#fff8ef;border-color:#f0c98a}.cio-recon.align{background:#f0faf4;border-color:#bce4cd}"
    + ".cio-recon-tag{color:#fff;font-family:var(--mono,monospace);font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:99px;white-space:nowrap;flex:none}"
    + ".cio-recon-txt{font-size:12.5px;color:var(--ink-2);line-height:1.5}.cio-recon-txt strong{color:var(--ink)}"
    + ".cio-drivers{border:1px solid var(--line);border-radius:10px;padding:13px 14px;background:var(--panel)}"
    + ".cio-drivers-title{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:600;margin-bottom:9px}"
    + ".cio-drivers-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}"
    + ".cio-driver{display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--muted)}.cio-driver span{color:var(--ink-2);font-weight:600}.cio-driver strong{font-family:var(--mono,monospace);font-size:14px;color:var(--ink)}.cio-driver em{font-style:normal;font-size:10px}"
    + ".cio-drivers-note{font-size:11px;color:var(--muted);line-height:1.5;margin-top:10px;padding-top:9px;border-top:1px solid var(--line-2)}.cio-drivers-note strong{color:var(--ink-2)}"
    + ".cio-live{font-size:12px;font-weight:700;white-space:nowrap;flex:none;width:14px;text-align:center}.cio-live-na{color:var(--muted);opacity:.45}";
  document.head.appendChild(st);
}
