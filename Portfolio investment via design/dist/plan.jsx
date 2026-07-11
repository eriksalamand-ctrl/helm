// plan.jsx — Policy & Funded-Ratio module (Strategic Layers 0–4 + governance)
// Reads net liquidity from window.PMData; persists the plan to localStorage.
const { useState: usePlanState, useEffect: usePlanEffect } = React;

const PLAN_KEY = "helm.plan.v1";
const PLAN_DEFAULTS = {
  currentAge: 40,
  retireAge: 55,
  annualSpending: 80000,
  withdrawalRate: 4,       // %
  annualContribution: 30000,
  planningReturn: 8,       // % — conservative base, NOT the 60% ambition
  riskProfile: "Aggressive",
  specCap: 30,             // % speculative hard cap
  maxDrawdown: 20,         // %
  govMode: "Warn",         // Off | Warn | Confirm
  cycleState: "Normal",    // Normal | Elevated | Partial | Extreme
  acctGov: { "reer-cad": true, "reer-usd": true, "celi-cad": true, "celi-usd": true },
  overrides: [],
};

function loadPlan() {
  try { return { ...PLAN_DEFAULTS, ...JSON.parse(localStorage.getItem(PLAN_KEY) || "{}"),
                 acctGov: { ...PLAN_DEFAULTS.acctGov, ...(JSON.parse(localStorage.getItem(PLAN_KEY) || "{}").acctGov || {}) } }; }
  catch (e) { return { ...PLAN_DEFAULTS }; }
}

// ---- profile presets: target weight + band per strategic bucket ----
const BUCKETS = ["Core Growth", "Ballast", "Satellite", "Volatile Offense"];
const PROFILE_TARGETS = {
  Conservative: { "Core Growth": [55, 45, 65], Ballast: [35, 25, 45], Satellite: [7, 0, 12], "Volatile Offense": [3, 0, 8] },
  Balanced:     { "Core Growth": [58, 45, 65], Ballast: [22, 12, 30], Satellite: [12, 8, 18], "Volatile Offense": [8, 3, 15] },
  Aggressive:   { "Core Growth": [50, 42, 62], Ballast: [12, 8, 22], Satellite: [18, 10, 24], "Volatile Offense": [20, 8, 30] },
};
const BUCKET_DESC = {
  "Core Growth": "Broad ETFs, quality compounders, semis",
  Ballast: "Income, utilities, REITs, cash",
  Satellite: "Single-name thematic conviction",
  "Volatile Offense": "Crypto, micro-caps — high volatility by design, not low quality",
};

function bucketOf(h) {
  if (h.sector === "Crypto") return "Volatile Offense";
  if ((h.price || 0) < 1.5) return "Volatile Offense";
  if (h.sector === "Real Estate") return "Ballast";
  if (["ZWU", "ZWP", "ZGI"].includes(h.ticker)) return "Ballast";
  if (h.sector === "ETF") return "Core Growth";
  if (["Semiconductors", "Consumer", "Financials", "Energy"].includes(h.sector)) return "Core Growth";
  return "Satellite";
}

function fundedCalc(p, current) {
  const n = Math.max(0, p.retireAge - p.currentAge);
  const r = p.planningReturn / 100;
  const required = p.withdrawalRate > 0 ? p.annualSpending / (p.withdrawalRate / 100) : 0;
  const grown = current * Math.pow(1 + r, n);
  const contribFV = r > 0 ? p.annualContribution * ((Math.pow(1 + r, n) - 1) / r) : p.annualContribution * n;
  const projected = grown + contribFV;
  const ratio = required > 0 ? projected / required : 0;
  const status = ratio < 0.9 ? "Behind" : ratio <= 1.1 ? "On Track" : "Ahead";
  // required CAGR to fully fund the goal: solve projected(rr) = required via bisection
  let requiredReturn = null;
  if (required > 0 && n > 0) {
    let lo = -0.5, hi = 2.0;
    for (let k = 0; k < 64; k++) {
      const m = (lo + hi) / 2;
      const g = current * Math.pow(1 + m, n) + (Math.abs(m) > 1e-9 ? p.annualContribution * ((Math.pow(1 + m, n) - 1) / m) : p.annualContribution * n);
      if (g < required) lo = m; else hi = m;
    }
    requiredReturn = ((lo + hi) / 2) * 100;
  }
  return { n, required, projected, grown, contribFV, ratio, status, requiredReturn };
}

const STATUS_COLOR = { Behind: "#d97706", "On Track": "#0e9f6e", Ahead: "#2563eb" };
const CYCLE_TIERS = [
  { k: "Normal", label: "Normal", note: "Full tactical freedom within policy." },
  { k: "Elevated", label: "Elevated Caution", note: "No new speculative adds; trim the most stretched." },
  { k: "Partial", label: "Partial De-Risk", note: "Trim affected sleeve; raise ballast / cash." },
  { k: "Extreme", label: "Extreme De-Risk", note: "Mandatory larger trim; defensive actions only." },
];

const planMoney = (n, ccy) => "$" + Math.round(n).toLocaleString("en-US") + (ccy ? " " + ccy : "");
const planMoneyK = (n) => Math.abs(n) >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : "$" + Math.round(n / 1000) + "k";

// ---- funded-ratio radial gauge ----
function FundedGauge({ ratio, status, accent }) {
  const W = 240, H = 150, cx = W / 2, cy = 130, R = 104;
  const max = 1.4;
  const a0 = Math.PI, a1 = 0; // semicircle left→right
  const frac = Math.max(0, Math.min(1, ratio / max));
  const ang = a0 + (a1 - a0) * frac;
  const pt = (a, r) => [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  const arc = (from, to, r) => {
    const [x0, y0] = pt(from, r), [x1, y1] = pt(to, r);
    const large = Math.abs(to - from) > Math.PI ? 1 : 0;
    return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
  };
  const seg = (lo, hi) => [a0 + (a1 - a0) * (lo / max), a0 + (a1 - a0) * (hi / max)];
  const [b0, b1] = seg(0, 0.9), [o0, o1] = seg(0.9, 1.1), [aa0, aa1] = seg(1.1, max);
  const [hx, hy] = pt(ang, R);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 280, display: "block", margin: "0 auto" }}>
      <path d={arc(b0, b1, R)} stroke="#d97706" strokeOpacity="0.28" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d={arc(o0, o1, R)} stroke="#0e9f6e" strokeOpacity="0.30" strokeWidth="14" fill="none" />
      <path d={arc(aa0, aa1, R)} stroke="#2563eb" strokeOpacity="0.28" strokeWidth="14" fill="none" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={hx.toFixed(1)} y2={hy.toFixed(1)} stroke={STATUS_COLOR[status]} strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="6" fill={STATUS_COLOR[status]} />
      <text x={cx} y={cy - 34} textAnchor="middle" style={{ fontSize: 34, fontWeight: 700, fill: STATUS_COLOR[status], fontFamily: "var(--mono)" }}>{(ratio * 100).toFixed(0)}%</text>
      <text x={cx} y={cy - 14} textAnchor="middle" style={{ fontSize: 11, fill: "var(--muted)", letterSpacing: "0.05em" }}>FUNDED RATIO</text>
    </svg>
  );
}

function PlanField({ label, value, onChange, prefix, suffix, step = 1, min = 0, hint }) {
  return (
    <label className="plan-field">
      <span className="plan-field-label">{label}{hint && <i className="plan-hint" title={hint}>?</i>}</span>
      <span className="plan-input">
        {prefix && <span className="plan-affix">{prefix}</span>}
        <input type="number" value={value} step={step} min={min}
               onChange={(e) => onChange(e.target.value === "" ? 0 : +e.target.value)} />
        {suffix && <span className="plan-affix r">{suffix}</span>}
      </span>
    </label>
  );
}

function ChoiceField({ label, value, onChange, options, prefix, suffix, step = 1, fmt, hint }) {
  return (
    <label className="plan-field">
      <span className="plan-field-label">{label}{hint && <i className="plan-hint" title={hint}>?</i>}</span>
      <div className="plan-chips">
        {options.map((o) => (
          <button type="button" key={o} className={`plan-chip${Math.abs(value - o) < 1e-6 ? " on" : ""}`}
                  onClick={() => onChange(o)}>{fmt ? fmt(o) : o}</button>
        ))}
      </div>
      <span className="plan-input">
        {prefix && <span className="plan-affix">{prefix}</span>}
        <input type="number" value={value} step={step} min={0}
               onChange={(e) => onChange(e.target.value === "" ? 0 : +e.target.value)} />
        {suffix && <span className="plan-affix r">{suffix}</span>}
      </span>
    </label>
  );
}

function PlanPage({ accent, account }) {
  const D = window.PMData;
  const ccy = D.getDispCcy ? D.getDispCcy() : "CAD";
  const [p, setP] = usePlanState(loadPlan);
  const [trimPreview, setTrimPreview] = usePlanState(null);
  usePlanEffect(() => { try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)); } catch (e) {} }, [p]);
  const set = (k, v) => setP((s) => ({ ...s, [k]: v }));

  const view = D.buildView("all");
  const current = view.kpis.equity;

  const f = fundedCalc(p, current);
  const targets = PROFILE_TARGETS[p.riskProfile] || PROFILE_TARGETS.Aggressive;

  // ---- current strategic buckets ----
  const sums = { "Core Growth": 0, Ballast: 0, Satellite: 0, "Volatile Offense": 0 };
  view.holdings.forEach((h) => { sums[bucketOf(h)] += h.dispValue; });
  sums.Ballast += view.kpis.cash;
  const eq = current || 1;
  const bucketPct = {};
  BUCKETS.forEach((b) => (bucketPct[b] = (sums[b] / eq) * 100));
  const specPct = bucketPct["Volatile Offense"];
  const specOver = specPct - p.specCap;
  const specBreach = specOver > 0.5;

  // ---- glidepath posture ----
  let basePosture = f.n > 15 ? "Growth-Favoring" : f.n >= 10 ? "Mild Ballast Lean" : f.n >= 5 ? "Moderate Ballast" : "Capital Preservation";
  const overlay = f.status === "Ahead" ? "accelerate de-risk" : f.status === "Behind" ? "no extra de-risking" : "follow base glidepath";

  // auto cycle flag
  const autoTier = specBreach && f.status === "Ahead" ? "Partial" : specBreach ? "Elevated" : "Normal";

  const accts = [...D.accounts, { id: "crypto", name: "Crypto", label: "Digital-asset lens" }];

  // simulate trim to cap
  const trimAmt = specBreach ? (specOver / 100) * eq : 0;
  const logOverride = () => {
    const entry = { date: new Date().toISOString().slice(0, 10), spec: +specPct.toFixed(1), cap: p.specCap, note: "Accepted volatile-offense over budget" };
    setP((s) => ({ ...s, overrides: [entry, ...(s.overrides || [])].slice(0, 8) }));
    setTrimPreview(null);
  };

  return (
    <div className="plan">
      <style>{PLAN_CSS}</style>

      {/* status strip removed — Funded/Posture/Cycle/Volatile already live in the global topbar spine */}

      {/* enforced IPS constraint panel — the policy every proposal is checked against */}
      {window.IPSPanel ? <window.IPSPanel accent={accent} /> : null}

      {/* ---------- breach banner ---------- */}
      {specBreach && p.govMode !== "Off" && (
        <div className={`plan-banner ${p.govMode === "Confirm" ? "confirm" : "warn"}`}>
          <div className="plan-banner-ico">▲</div>
          <div className="plan-banner-body">
            <strong>Volatile-offense sleeve at {specPct.toFixed(0)}% — {specOver.toFixed(0)} pts above your {p.specCap}% risk budget.</strong>
            <span>Profile <em>{p.riskProfile}</em> · funded status <em>{f.status}</em>. {f.status === "Ahead"
              ? "When Ahead the model recommends de-risking, not adding volatility."
              : "Visible warning only — your call to override."}</span>
          </div>
          <div className="plan-banner-actions">
            <button className="plan-btn ghost" title="Preview a trim back to cap" onClick={() => setTrimPreview(trimPreview ? null : { amt: trimAmt, from: +specPct.toFixed(1), to: p.specCap })}>Simulate trim ≈ {planMoneyK(trimAmt)}</button>
            <button className="plan-btn solid" style={{ background: accent }} onClick={logOverride}>Override &amp; accept</button>
          </div>
        </div>
      )}
      {trimPreview && (
        <div className="plan-trimsim">
          <strong>Simulated trim:</strong> selling ≈{planMoneyK(trimPreview.amt)} of the volatile-offense sleeve brings it from <strong>{trimPreview.from}%</strong> back to your <strong>{trimPreview.to}% budget</strong>. Proceeds rotate to Core Growth / Ballast per your target weights. <em>Preview only — no order placed.</em>
          <div className="plan-trimsim-actions">
            <button className="plan-btn ghost" onClick={() => setTrimPreview(null)}>Dismiss</button>
            <button className="plan-btn solid" style={{ background: accent }} onClick={() => { const entry = { date: new Date().toISOString().slice(0, 10), spec: +specPct.toFixed(1), cap: p.specCap, note: `Logged simulated trim of ${planMoneyK(trimPreview.amt)} to cap` }; setP((s) => ({ ...s, overrides: [entry, ...(s.overrides || [])].slice(0, 8) })); setTrimPreview(null); }}>Log this trim</button>
          </div>
        </div>
      )}

      {/* ---------- top: funded ratio + breakdown ---------- */}
      <div className="plan-grid2">
        <section className="pm-card plan-funded">
          <div className="pm-card-eyebrow">Funded ratio · retire at {p.retireAge}</div>
          <FundedGauge ratio={f.ratio} status={f.status} accent={accent} />
          <div className="plan-funded-legend">
            <span><i style={{ background: "#d97706" }} />Behind &lt;90%</span>
            <span><i style={{ background: "#0e9f6e" }} />On track</span>
            <span><i style={{ background: "#2563eb" }} />Ahead &gt;110%</span>
          </div>
          <p className="plan-funded-note">
            Projected <strong>{planMoneyK(f.projected)}</strong> vs <strong>{planMoneyK(f.required)}</strong> required,
            in {f.n} yrs at a <strong>{p.planningReturn}%</strong> planning return. This is the conservative base that
            decides whether you're on track — not your 60%/yr ambition.
          </p>
          {f.requiredReturn != null && (
            <div className="plan-reqret">
              <span>Required to fully fund the goal</span>
              <strong className="mono" style={{ color: f.requiredReturn > p.planningReturn + 0.05 ? "#d97706" : "#0e9f6e" }}>{f.requiredReturn.toFixed(1)}%/yr</strong>
              <em>{f.requiredReturn > p.planningReturn + 0.05 ? `${(f.requiredReturn - p.planningReturn).toFixed(1)} pts above your ${p.planningReturn}% base — return pressure` : `at or below your ${p.planningReturn}% base — no extra pressure`}</em>
            </div>
          )}
        </section>

        <section className="pm-card plan-break">
          <div className="pm-card-eyebrow">How it's built</div>
          <div className="plan-break-rows">
            <div className="plan-brow"><span>Current investable capital</span><strong className="mono">{planMoney(current, ccy)}</strong></div>
            <div className="plan-brow"><span>Grows to (at {p.planningReturn}%/yr × {f.n}y)</span><strong className="mono">{planMoney(f.grown)}</strong></div>
            <div className="plan-brow"><span>+ Contributions future value</span><strong className="mono">{planMoney(f.contribFV)}</strong></div>
            <div className="plan-brow total"><span>Projected capital at {p.retireAge}</span><strong className="mono" style={{ color: STATUS_COLOR[f.status] }}>{planMoney(f.projected)}</strong></div>
            <div className="plan-brow"><span>Required = spending ÷ {p.withdrawalRate}% rule</span><strong className="mono">{planMoney(f.required)}</strong></div>
          </div>
          <div className="plan-gap">
            {f.status === "Behind"
              ? <span style={{ color: "#d97706" }}>Gap of {planMoneyK(f.required - f.projected)} — return pressure is <strong>High</strong>. Tactical offense allowed within policy.</span>
              : f.status === "On Track"
                ? <span style={{ color: "#0e9f6e" }}>On track — return pressure Normal. Stay disciplined.</span>
                : <span style={{ color: "#2563eb" }}>Surplus of {planMoneyK(f.projected - f.required)} — risk-reducing actions only.</span>}
          </div>
        </section>
      </div>

      {/* ---------- plan inputs ---------- */}
      <section className="pm-card">
        <div className="pm-card-head">
          <div className="pm-card-eyebrow">Plan inputs · your one-page IPS</div>
          <span className="plan-saved">saved locally</span>
        </div>
        <div className="plan-fields">
          <PlanField label="Current age" value={p.currentAge} onChange={(v) => set("currentAge", v)} min={18} />
          <PlanField label="Target retirement age" value={p.retireAge} onChange={(v) => set("retireAge", v)} min={p.currentAge + 1} />
          <ChoiceField label="Annual spending in retirement" value={p.annualSpending} onChange={(v) => set("annualSpending", v)} prefix="$" step={1000}
                       options={[50000, 70000, 90000, 120000]} fmt={(o) => "$" + (o / 1000) + "k"} hint="Pick a band or type your own" />
          <ChoiceField label="Safe withdrawal rate" value={p.withdrawalRate} onChange={(v) => set("withdrawalRate", v)} suffix="%" step={0.1}
                       options={[3, 3.5, 4, 4.5]} fmt={(o) => o + "%"} hint="Required capital = spending ÷ this rate" />
          <PlanField label="Annual contribution" value={p.annualContribution} onChange={(v) => set("annualContribution", v)} prefix="$" step={1000} />
          <PlanField label="Planning return (base)" value={p.planningReturn} onChange={(v) => set("planningReturn", v)} suffix="%" step={0.5} hint="Conservative — separate from your 60% goal" />
          <label className="plan-field">
            <span className="plan-field-label">Risk profile</span>
            <select className="rd-select" value={p.riskProfile} onChange={(e) => set("riskProfile", e.target.value)}>
              {Object.keys(PROFILE_TARGETS).map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <PlanField label="Volatile Offense — risk budget" value={p.specCap} onChange={(v) => set("specCap", v)} suffix="%" step={1} hint="The volatility you CHOOSE to carry. Profile sets a guardrail max; this is your target. Not a quality verdict — crypto is volatile, not low-quality." />
          <PlanField label="Max drawdown tolerance" value={p.maxDrawdown} onChange={(v) => set("maxDrawdown", v)} suffix="%" step={1} />
        </div>
      </section>

      {/* ---------- strategic asset allocation ---------- */}
      <section className="pm-card">
        <div className="pm-card-head">
          <div className="pm-card-eyebrow">Strategic asset allocation · current vs target ({p.riskProfile})</div>
          <span className="plan-count">{view.holdings.length} positions mapped</span>
        </div>
        <div className="plan-buckets">
          {BUCKETS.map((b) => {
            const cur = bucketPct[b];
            const [tgt, lo, hi] = targets[b];
            const over = cur > hi + 0.5, under = cur < lo - 0.5;
            const col = b === "Volatile Offense" ? "#d97706" : b === "Ballast" ? "#64748b" : b === "Satellite" ? "#7c3aed" : accent;
            return (
              <div className="plan-bucket" key={b}>
                <div className="plan-bucket-head">
                  <div>
                    <div className="plan-bucket-name">{b}</div>
                    <div className="plan-bucket-desc">{BUCKET_DESC[b]}</div>
                  </div>
                  <div className="plan-bucket-num">
                    <span className="mono" style={{ color: over ? "#d97706" : "var(--ink)", fontWeight: 700 }}>{cur.toFixed(1)}%</span>
                    <span className="plan-bucket-tgt">target {tgt}% · band {lo}–{hi}</span>
                  </div>
                </div>
                <div className="plan-bar">
                  <div className="plan-bar-band" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
                  <div className="plan-bar-fill" style={{ width: `${Math.min(100, cur)}%`, background: col }} />
                  <div className="plan-bar-tgt" style={{ left: `${tgt}%` }} />
                </div>
                {(over || under) && (
                  <div className="plan-bucket-flag" style={{ color: over ? "#d97706" : "var(--muted)" }}>
                    {over ? `▲ ${(cur - hi).toFixed(0)} pts over band` : `▼ ${(lo - cur).toFixed(0)} pts under band`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- glidepath + cycle de-risk ---------- */}
      <div className="plan-grid2">
        <section className="pm-card">
          <div className="pm-card-eyebrow">Glidepath posture</div>
          <div className="plan-posture" style={{ borderColor: STATUS_COLOR[f.status] + "55" }}>
            <div className="plan-posture-big">{basePosture}</div>
            <div className="plan-posture-sub">{f.n} years to target · funded {f.status} → <strong>{overlay}</strong></div>
          </div>
          <div className="plan-glide">
            {[[">15y", "Growth-favoring"], ["10–15y", "Mild ballast"], ["5–10y", "Moderate ballast"], ["0–5y", "Preservation"]].map(([yr, lab], i) => {
              const ranges = [[15, 99], [10, 15], [5, 10], [0, 5]];
              const inRange = f.n >= ranges[i][0] && (i === 0 ? true : f.n < ranges[i][1]);
              const here = (f.n > 15 && i === 0) || (f.n >= 10 && f.n <= 15 && i === 1) || (f.n >= 5 && f.n < 10 && i === 2) || (f.n < 5 && i === 3);
              return (
                <div className={`plan-glide-step${here ? " here" : ""}`} key={yr} style={here ? { borderColor: accent, background: accent + "12" } : {}}>
                  <div className="plan-glide-yr">{yr}</div>
                  <div className="plan-glide-lab">{lab}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="pm-card">
          <div className="pm-card-head">
            <div className="pm-card-eyebrow">Cycle de-risk state</div>
            {autoTier !== "Normal" && <span className="plan-autoflag">auto-flag: {autoTier}</span>}
          </div>
          <div className="plan-ladder">
            {CYCLE_TIERS.map((t) => {
              const active = p.cycleState === t.k;
              return (
                <button key={t.k} className={`plan-tier${active ? " active" : ""}`}
                        onClick={() => set("cycleState", t.k)}
                        style={active ? { borderColor: accent, background: accent + "10" } : {}}>
                  <div className="plan-tier-dot" style={{ background: active ? accent : "var(--line)" }} />
                  <div>
                    <div className="plan-tier-name">{t.label}</div>
                    <div className="plan-tier-note">{t.note}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="plan-tier-hint">Pre-committed — set the tier deliberately; tactical actions obey it.</div>
        </section>
      </div>

      {/* ---------- governance ---------- */}
      <section className="pm-card">
        <div className="pm-card-head">
          <div className="pm-card-eyebrow">Risk governance · visible &amp; overridable</div>
          <span className="plan-count">learning mode A-Light · manual approval</span>
        </div>
        <div className="plan-gov">
          <div className="plan-gov-mode">
            <div className="plan-gov-label">Breach behaviour</div>
            <div className="pm-range plan-modes">
              {["Off", "Warn", "Confirm"].map((m) => (
                <button key={m} className={p.govMode === m ? "is-active" : ""} onClick={() => set("govMode", m)}>{m}</button>
              ))}
            </div>
            <p className="plan-gov-desc">
              {p.govMode === "Off" ? "No nudges — caps shown for reference only."
                : p.govMode === "Warn" ? "Show a visible warning when a cap is breached. Never blocks."
                : "Require an explicit confirmation step before a breaching action proceeds."}
            </p>
          </div>
          <div className="plan-gov-accts">
            <div className="plan-gov-label">Per-portfolio governance</div>
            <div className="plan-acct-list">
              {accts.map((a) => {
                const on = p.acctGov[a.id] !== false;
                return (
                  <div className="plan-acct-row" key={a.id}>
                    <div>
                      <div className="plan-acct-name">{a.name}</div>
                      <div className="plan-acct-label">{a.label}</div>
                    </div>
                    <button className={`plan-toggle${on ? " on" : ""}`} style={on ? { background: accent } : {}}
                            onClick={() => set("acctGov", { ...p.acctGov, [a.id]: !on })}>
                      <span /><em>{on ? "Governed" : "Off"}</em>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {(p.overrides && p.overrides.length > 0) && (
          <div className="plan-overrides">
            <div className="plan-gov-label">Override log <span className="plan-learn">↳ feeds the learning journal</span></div>
            {p.overrides.map((o, i) => (
              <div className="plan-ov-row" key={i}>
                <span className="mono">{o.date}</span>
                <span>{o.note}</span>
                <span className="mono plan-ov-num">spec {o.spec}% vs {o.cap}% cap</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="plan-foot">
        Strategic Layers 0–4 · paper / research only · not financial advice. Tax-loss harvest &amp; after-tax engine
        switch on automatically if a non-registered account is added.
      </div>
    </div>
  );
}

const PLAN_CSS = `
.plan { display: flex; flex-direction: column; gap: 16px; }
.plan-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.plan-strip { display: flex; gap: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.plan-strip-item { flex: 1; padding: 12px 18px; border-right: 1px solid var(--line); display: flex; flex-direction: column; gap: 3px; }
.plan-strip-item:last-child { border-right: 0; }
.plan-strip-k { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.plan-strip-v { font-size: 14.5px; font-weight: 600; }
.plan-banner { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 12px; border: 1px solid; }
.plan-banner.warn { background: #fffaf0; border-color: #f5d9a8; }
.plan-banner.confirm { background: #fff4e6; border-color: #f0b87a; }
.plan-banner-ico { width: 30px; height: 30px; border-radius: 8px; background: #d97706; color: #fff; display: grid; place-items: center; font-size: 13px; flex: none; }
.plan-banner-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.plan-banner-body strong { font-size: 13.5px; color: #7c4a06; }
.plan-banner-body span { font-size: 12.5px; color: #92651f; }
.plan-banner-body em { font-style: normal; font-weight: 600; }
.plan-banner-actions { display: flex; gap: 8px; flex: none; }
.plan-reqret { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line-2); font-size: 12.5px; color: var(--ink-2); }
.plan-reqret strong { font-size: 15px; }
.plan-reqret em { font-style: normal; font-size: 11.5px; color: var(--muted); }
.plan-trimsim { background: #fff; border: 1px solid #e6c590; border-radius: 11px; padding: 13px 16px; font-size: 12.5px; color: #7c4a06; line-height: 1.5; }
.plan-trimsim em { font-style: normal; color: var(--muted); }
.plan-trimsim-actions { display: flex; gap: 8px; margin-top: 10px; }
.plan-btn { font: inherit; font-size: 12.5px; font-weight: 600; border-radius: 8px; padding: 8px 12px; cursor: pointer; border: 1px solid var(--line); }
.plan-btn.ghost { background: #fff; color: #7c4a06; border-color: #e6c590; }
.plan-btn.solid { color: #fff; border: 0; }
.plan-funded { display: flex; flex-direction: column; }
.plan-funded-legend { display: flex; justify-content: center; gap: 16px; margin-top: 6px; font-size: 11.5px; color: var(--muted); }
.plan-funded-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 5px; vertical-align: middle; }
.plan-funded-note { margin-top: 12px; font-size: 12.5px; color: var(--ink-2); line-height: 1.5; }
.plan-funded-note strong { color: var(--ink); }
.plan-break-rows { display: flex; flex-direction: column; gap: 0; margin-top: 4px; }
.plan-brow { display: flex; justify-content: space-between; align-items: baseline; padding: 9px 0; border-bottom: 1px solid var(--line-2); font-size: 13px; color: var(--ink-2); }
.plan-brow.total { border-bottom: 1px solid var(--line); border-top: 1px solid var(--line); margin-top: 2px; }
.plan-brow.total span, .plan-brow.total strong { font-weight: 700; color: var(--ink); }
.plan-gap { margin-top: 12px; font-size: 12.5px; line-height: 1.5; }
.plan-gap strong { font-weight: 700; }
.plan-fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px 18px; }
.plan-field { display: flex; flex-direction: column; gap: 6px; }
.plan-field-label { font-size: 12px; color: var(--ink-2); font-weight: 500; display: flex; align-items: center; gap: 5px; }
.plan-hint { width: 14px; height: 14px; border-radius: 50%; background: var(--line); color: var(--muted); font-size: 9px; font-style: normal; display: inline-grid; place-items: center; cursor: help; }
.plan-input { display: flex; align-items: center; border: 1px solid var(--line); border-radius: 9px; background: var(--panel-2); overflow: hidden; }
.plan-input:focus-within { border-color: var(--accent); }
.plan-input input { flex: 1; border: 0; background: transparent; font: inherit; font-family: var(--mono); font-size: 14px; padding: 9px 10px; width: 100%; color: var(--ink); outline: none; -moz-appearance: textfield; }
.plan-input input::-webkit-outer-spin-button, .plan-input input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.plan-affix { padding: 0 4px 0 10px; color: var(--muted); font-size: 13px; }
.plan-affix.r { padding: 0 10px 0 0; }
.rd-select { border: 1px solid var(--line); border-radius: 9px; background: var(--panel-2); font: inherit; font-size: 14px; padding: 9px 10px; color: var(--ink); cursor: pointer; }
.plan-saved, .plan-count, .plan-autoflag, .plan-learn { font-size: 11px; color: var(--muted); }
.plan-autoflag { color: #d97706; font-weight: 600; }
.plan-buckets { display: flex; flex-direction: column; gap: 16px; margin-top: 4px; }
.plan-bucket-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
.plan-bucket-name { font-size: 14px; font-weight: 600; }
.plan-bucket-desc { font-size: 11.5px; color: var(--muted); margin-top: 1px; }
.plan-bucket-num { text-align: right; display: flex; flex-direction: column; }
.plan-bucket-num .mono { font-size: 15px; }
.plan-bucket-tgt { font-size: 11px; color: var(--muted); }
.plan-bar { position: relative; height: 12px; background: var(--line-2); border-radius: 7px; overflow: hidden; }
.plan-bar-band { position: absolute; top: 0; bottom: 0; background: repeating-linear-gradient(45deg, rgba(100,116,139,.10), rgba(100,116,139,.10) 4px, transparent 4px, transparent 8px); border-left: 1px dashed rgba(100,116,139,.4); border-right: 1px dashed rgba(100,116,139,.4); }
.plan-bar-fill { position: absolute; top: 0; bottom: 0; left: 0; border-radius: 7px; }
.plan-bar-tgt { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--ink); border-radius: 2px; }
.plan-bucket-flag { font-size: 11.5px; margin-top: 5px; font-weight: 600; }
.plan-posture { border: 1px solid; border-radius: 11px; padding: 14px 16px; margin-bottom: 12px; }
.plan-posture-big { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }
.plan-posture-sub { font-size: 12.5px; color: var(--ink-2); margin-top: 3px; }
.plan-glide { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.plan-glide-step { border: 1px solid var(--line); border-radius: 9px; padding: 10px 8px; text-align: center; }
.plan-glide-yr { font-family: var(--mono); font-size: 12px; color: var(--muted); }
.plan-glide-step.here .plan-glide-yr { color: var(--accent); }
.plan-glide-lab { font-size: 11.5px; font-weight: 600; margin-top: 3px; }
.plan-ladder { display: flex; flex-direction: column; gap: 8px; }
.plan-tier { display: flex; align-items: flex-start; gap: 11px; text-align: left; border: 1px solid var(--line); border-radius: 10px; padding: 11px 13px; background: var(--panel-2); cursor: pointer; font: inherit; transition: border-color .12s, background .12s; }
.plan-tier:hover { border-color: var(--accent); }
.plan-tier-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; flex: none; }
.plan-tier-name { font-size: 13.5px; font-weight: 600; }
.plan-tier-note { font-size: 11.5px; color: var(--muted); margin-top: 1px; }
.plan-tier-hint { font-size: 11.5px; color: var(--muted); margin-top: 10px; }
.plan-gov { display: grid; grid-template-columns: 1fr 1.1fr; gap: 24px; }
.plan-gov-label { font-size: 12px; font-weight: 600; color: var(--ink-2); margin-bottom: 8px; }
.plan-modes { display: inline-flex; }
.plan-gov-desc { font-size: 12.5px; color: var(--muted); margin-top: 10px; line-height: 1.5; }
.plan-acct-list { display: flex; flex-direction: column; gap: 8px; }
.plan-acct-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--panel-2); }
.plan-acct-name { font-size: 13px; font-weight: 600; }
.plan-acct-label { font-size: 11px; color: var(--muted); }
.plan-toggle { display: inline-flex; align-items: center; gap: 7px; border: 0; background: var(--line); border-radius: 99px; padding: 3px 10px 3px 3px; cursor: pointer; font: inherit; }
.plan-toggle span { width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: transform .15s; }
.plan-toggle.on span { transform: translateX(2px); }
.plan-toggle em { font-style: normal; font-size: 11px; font-weight: 600; color: #fff; }
.plan-toggle:not(.on) em { color: var(--muted); }
.plan-overrides { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line); }
.plan-ov-row { display: grid; grid-template-columns: 90px 1fr auto; gap: 12px; font-size: 12.5px; padding: 6px 0; color: var(--ink-2); }
.plan-ov-num { color: #d97706; }
.plan-foot { font-size: 11.5px; color: var(--muted); text-align: center; padding: 6px 0 4px; line-height: 1.5; }
.plan-chips { display: flex; gap: 5px; margin-bottom: 6px; flex-wrap: wrap; }
.plan-chip { font: inherit; font-size: 11.5px; font-family: var(--mono); padding: 4px 9px; border-radius: 7px; border: 1px solid var(--line); background: var(--panel-2); color: var(--ink-2); cursor: pointer; }
.plan-chip:hover { border-color: var(--accent); }
.plan-chip.on { background: var(--accent); border-color: var(--accent); color: #fff; }
@media (max-width: 1100px) { .plan-grid2, .plan-gov { grid-template-columns: 1fr; } .plan-fields { grid-template-columns: repeat(2, 1fr); } }
`;

window.PlanPage = PlanPage;
window.HelmPlan = { loadPlan, fundedCalc, bucketOf, PROFILE_TARGETS, BUCKETS, BUCKET_DESC, PLAN_KEY, PLAN_DEFAULTS, CYCLE_TIERS, STATUS_COLOR };
