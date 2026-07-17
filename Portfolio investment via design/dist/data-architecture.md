// projections.jsx — forward projection toward the 60%/yr goal
const { useState: useStatePr } = React;

const jUP = "#0e9f6e";
const jMoney = (n) => "$" + Math.round(n).toLocaleString("en-US");
const jMoneyK = (n) => n >= 1e6 ? "$" + (n / 1e6).toFixed(n >= 1e7 ? 0 : 2) + "M" : "$" + Math.round(n / 1000) + "k";

const HORIZONS = [{ k: "3Y", y: 3 }, { k: "5Y", y: 5 }, { k: "10Y", y: 10 }, { k: "20Y", y: 20 }];
const MILESTONES = [250000, 500000, 1000000, 2500000, 5000000];

function project(start, annual, monthly, years) {
  const rm = Math.pow(1 + annual, 1 / 12) - 1;
  const pts = [start]; let v = start;
  for (let m = 1; m <= years * 12; m++) { v = v * (1 + rm) + monthly; pts.push(v); }
  return pts;
}
function monthsTo(start, annual, monthly, target) {
  const rm = Math.pow(1 + annual, 1 / 12) - 1;
  let v = start, m = 0;
  while (v < target && m < 1200) { v = v * (1 + rm) + monthly; m++; }
  return m >= 1200 ? null : m;
}
function dateAfter(months) {
  const d = new Date(2026, 5, 1); d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// Growth-path chart: actual history (muted) + projection (accent), with time X-axis & currency Y-axis
function ProjChart({ past, future, accent, height, ccy, years, pastYears }) {
  const cyLabel = (v) => "$" + (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.round(v / 1000) + "k");
  const fmtTick = (v) => "$" + (Math.abs(v) >= 950000 ? (v / 1e6).toFixed(1) + "M" : Math.round(v / 1000) + "k");
  const all = [...past, ...future];
  const W = 1000, H = height, padT = 16, padB = 30, padL = 70, padR = 14;
  const n = all.length;
  let dMin = Math.min(...all, 0), dMax = Math.max(...all);
  const pad = (dMax - dMin) * 0.06; dMax += pad;
  const x = (i) => padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - dMin) / (dMax - dMin || 1)) * (H - padT - padB);
  const splitIdx = past.length - 1;
  const splitX = x(splitIdx);

  const pastPts = past.map((v, i) => [x(i), y(v)]);
  const futPts = future.map((v, i) => [x(splitIdx + i), y(v)]);
  const pastPath = window.smoothPath ? window.smoothPath(pastPts, 0.6) : pastPts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  const futPath = window.smoothPath ? window.smoothPath(futPts, 0.6) : futPts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  const area = `${futPath} L${futPts[futPts.length - 1][0].toFixed(1)},${H - padB} L${futPts[0][0].toFixed(1)},${H - padB} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => dMin + (dMax - dMin) * f);
  const yearStep = years <= 5 ? 1 : years <= 10 ? 2 : 5;
  const xTicks = [];
  for (let yr = yearStep; yr <= years; yr += yearStep) xTicks.push({ x: x(splitIdx + (future.length - 1) * (yr / years)), label: `+${yr}y` });
  const gid = "pg-" + accent.replace(/[^a-z0-9]/gi, "");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={accent} stopOpacity="0.20" /><stop offset="100%" stopColor={accent} stopOpacity="0" />
      </linearGradient></defs>
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="currentColor" strokeOpacity="0.08" />
          <text x={padL - 10} y={y(v) + 4} textAnchor="end" className="pj-ytick">{fmtTick(v)}</text>
        </g>
      ))}
      <rect x={padL} y={padT} width={splitX - padL} height={H - padT - padB} fill="currentColor" opacity="0.03" />
      <path d={area} fill={`url(#${gid})`} />
      <path d={pastPath} fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
      <path d={futPath} fill="none" stroke={accent} strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
      <circle cx={splitX} cy={y(past[past.length - 1])} r="3.5" fill={accent} stroke="#fff" strokeWidth="2" />
      <line x1={splitX} y1={padT} x2={splitX} y2={H - padB} stroke="currentColor" strokeOpacity="0.28" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <text x={splitX} y={H - 10} textAnchor="middle" className="pj-xtick strong">Today</text>
      {pastYears ? <text x={padL} y={H - 10} textAnchor="start" className="pj-xtick">−{pastYears}</text> : null}
      {xTicks.map((t, i) => (<text key={i} x={t.x} y={H - 10} textAnchor="middle" className="pj-xtick">{t.label}</text>))}
      <text className="pj-yaxis-label" transform={`translate(16 ${H / 2}) rotate(-90)`} textAnchor="middle">Value ({ccy})</text>
    </svg>
  );
}

function Projections({ accent, account }) {
  const D = window.PMData;
  const ccy = D.getDispCcy ? D.getDispCcy() : "CAD";
  const acctId = account || "all";
  const acctMeta = D.accounts.find((a) => a.id === acctId);
  const acctLabel = acctId === "all" ? "All accounts" : acctId === "crypto" ? "Crypto ETFs" : (acctMeta ? acctMeta.name : acctId);
  const start = D.buildView(acctId).kpis.equity;
  const [target, setTarget] = useStatePr(60);
  const [monthly, setMonthly] = useStatePr(1500);
  const [years, setYears] = useStatePr(5);
  const [goal, setGoal] = useStatePr(1000000);

  const annual = target / 100;
  const CIO_EQUITY = 0.055; // NBC CIO 10-yr long-term forecast: equities 5.5%, balanced 4.8%, FI 3.7%
  const proj = project(start, annual, monthly, years);
  const market = project(start, CIO_EQUITY, monthly, years);
  const projVal = proj[proj.length - 1];
  const marketVal = market[market.length - 1];
  const contributed = monthly * years * 12;
  const growth = projVal - start - contributed;

  // months to reach the goal at target vs needed CAGR to hit goal in `years`
  const mGoal = monthsTo(start, annual, monthly, goal);
  // solve required annual return to reach goal in `years` (bisection)
  function requiredCAGR() {
    let lo = 0, hi = 3;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const v = project(start, mid, monthly, years);
      if (v[v.length - 1] < goal) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  const reqC = requiredCAGR();

  // sample helper
  const sample = (arr, target = 60) => { const step = Math.max(1, Math.floor(arr.length / target)); const o = []; for (let i = 0; i < arr.length; i += step) o.push(arr[i]); o.push(arr[arr.length - 1]); return o; };
  // PAST = this account's real recent portfolio trajectory (down ~12%); FUTURE = projection from today
  const history = D.buildView(acctId).portfolio || [start];
  const pastFrac = years <= 5 ? 0.5 : 0.3;
  const pastYears = +((history.length * pastFrac) / 252).toFixed(1);
  const pastSeries = sample(history.slice(-Math.round(history.length * pastFrac)), 50);
  const futureSeries = sample(proj, 60);

  return (
    <div className="pj">
      <div className="pj-top">
        <section className="pm-card pj-hero">
          <div className="pm-card-eyebrow">Projected value · {acctLabel} · {years} years · {ccy}</div>
          <div className="pj-big" style={{ color: accent }}>{jMoney(projVal)}</div>
          <div className="pj-hero-sub">
            from {jMoney(start)} today at <strong>{target}%/yr</strong> + {jMoney(monthly)}/mo
          </div>
          <div className="pj-breakdown">
            <div><span>Starting value</span><strong>{jMoney(start)}</strong></div>
            <div><span>Contributions</span><strong>{jMoney(contributed)}</strong></div>
            <div><span>Growth</span><strong style={{ color: accent }}>{jMoney(growth)}</strong></div>
            <div><span>vs CIO forecast (5.5%)</span><strong>{jMoney(projVal - marketVal)} ahead</strong></div>
          </div>
        </section>

        <section className="pm-card pj-controls">
          <div className="pm-card-eyebrow">Assumptions</div>
          <div className="pj-ctrl">
            <div className="pj-ctrl-head"><span>Target annual return</span><strong>{target}%</strong></div>
            <input type="range" min="5" max="100" step="1" value={target} onChange={(e) => setTarget(+e.target.value)} style={{ accentColor: accent }} />
            <div className="pj-ctrl-scale"><span>5%</span><span className="pj-mark" style={{ color: accent }}>60% goal</span><span>100%</span></div>
          </div>
          <div className="pj-ctrl">
            <div className="pj-ctrl-head"><span>Monthly contribution</span><strong>{jMoney(monthly)}</strong></div>
            <input type="range" min="0" max="10000" step="100" value={monthly} onChange={(e) => setMonthly(+e.target.value)} style={{ accentColor: accent }} />
            <div className="pj-ctrl-scale"><span>$0</span><span>$10k</span></div>
          </div>
          <div className="pj-ctrl">
            <div className="pj-ctrl-head"><span>Horizon</span></div>
            <div className="pm-range pj-range">
              {HORIZONS.map((h) => (
                <button key={h.k} className={years === h.y ? "is-active" : ""} onClick={() => setYears(h.y)}>{h.k}</button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="pm-card">
        <div className="pm-card-head">
          <div className="pm-card-eyebrow">Growth path · {acctLabel}</div>
          <div className="pj-legend">
            <span className="pj-mut"><i style={{ background: "var(--muted)" }} /> actual to date</span>
            <span><i style={{ background: accent }} /> projected at {target}%/yr</span>
          </div>
        </div>
        <div className="pj-chart" style={{ color: "var(--ink)" }}>
          <ProjChart past={pastSeries} future={futureSeries} accent={accent} height={280} ccy={ccy} years={years} pastYears={pastYears} />
        </div>
      </section>

      <div className="pj-bottom">
        <section className="pm-card">
          <div className="pm-card-eyebrow">Milestones at {target}%/yr</div>
          <div className="pj-miles">
            {MILESTONES.map((m) => {
              const months = monthsTo(start, annual, monthly, m);
              const reached = start >= m;
              return (
                <div className={`pj-mile${reached ? " done" : ""}`} key={m}>
                  <div className="pj-mile-dot" style={{ background: reached ? accent : "var(--line)", borderColor: months ? accent : "var(--line)" }} />
                  <div className="pj-mile-val">{jMoneyK(m)}</div>
                  <div className="pj-mile-when">{reached ? "Reached" : months ? `${dateAfter(months)} · ${(months / 12).toFixed(1)} yr` : "—"}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="pm-card pj-goal">
          <div className="pm-card-eyebrow">Goal planner</div>
          <div className="pj-goal-row">
            <span>Reach</span>
            <select value={goal} onChange={(e) => setGoal(+e.target.value)} className="rd-select">
              {MILESTONES.map((m) => <option key={m} value={m}>{jMoneyK(m)}</option>)}
            </select>
          </div>
          <div className="pj-goal-result">
            <div>
              <span>At {target}%/yr you hit it</span>
              <strong>{mGoal ? `${dateAfter(mGoal)}` : "beyond 100 yrs"}</strong>
              <em>{mGoal ? `${(mGoal / 12).toFixed(1)} years away` : ""}</em>
            </div>
            <div>
              <span>To hit it in {years} yrs you need</span>
              <strong style={{ color: reqC * 100 <= target ? accent : "#d97706" }}>{(reqC * 100).toFixed(1)}%/yr</strong>
              <em>{reqC * 100 <= target ? "on track at current target" : "above your target"}</em>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

window.Projections = Projections;
