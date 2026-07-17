// charts.jsx — SVG chart components for the portfolio dashboard
// Exposes AreaChart, Sparkline, Donut, TargetGauge on window.
const { useState, useRef, useMemo } = React;

function fmtUSD(n, dp = 0) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

// Catmull-Rom -> cubic bezier smooth path through [x,y] points
function smoothPath(pts, tension = 0.5) {
  if (pts.length < 3) return pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

// ----------------------------------------------------------------------------
// AreaChart — portfolio value over time with optional benchmark overlay + hover
// ----------------------------------------------------------------------------
function AreaChart({ data, benchmark, accent, height = 280, showBenchmark = true, dates = null }) {
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  const W = 1000, H = height, padL = 8, padR = 8, padT = 16, padB = 8;

  const { dMin, dMax } = useMemo(() => {
    const lo = Math.min(...data), hi = Math.max(...data);
    const pad = (hi - lo) * 0.08 || 1;
    return { dMin: lo - pad, dMax: hi + pad };
  }, [data]);

  const x = (i) => padL + (i / (data.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - dMin) / (dMax - dMin)) * (H - padT - padB);

  const linePath = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(data.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;

  // benchmark rescaled to the portfolio's start AND to its own point count, so the grey
  // line always spans the exact same horizontal window as the portfolio line.
  const benchPath = useMemo(() => {
    if (!benchmark || !showBenchmark || benchmark.length < 2) return null;
    const b0 = benchmark[0];
    const xb = (i) => padL + (i / (benchmark.length - 1)) * (W - padL - padR);
    return benchmark.map((b, i) => `${i === 0 ? "M" : "L"}${xb(i).toFixed(1)},${y(data[0] * (b / b0)).toFixed(1)}`).join(" ");
  }, [benchmark, data, dMin, dMax, showBenchmark]);

  // ---- axes ----
  const fmtAxis = (v) => Math.abs(v) >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : Math.abs(v) >= 1000 ? "$" + Math.round(v / 1000) + "k" : "$" + Math.round(v);
  const yTicks = useMemo(() => {
    const span = dMax - dMin, rawStep = span / 3.5;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= 4.5) || 5 * mag;
    const out = [];
    for (let v = Math.ceil(dMin / step) * step; v <= dMax; v += step) out.push(v);
    return out;
  }, [dMin, dMax]);
  const fmtDate = (d, span) => d.toLocaleDateString("en-CA", span > 200 ? { month: "short", year: "2-digit" } : { month: "short", day: "numeric" });
  const xTicks = useMemo(() => {
    if (!dates || dates.length < 2) return null;
    const n = dates.length, span = (dates[n - 1] - dates[0]) / 864e5;
    return [0, 0.25, 0.5, 0.75, 1].map((f) => fmtDate(dates[Math.round(f * (n - 1))], span));
  }, [dates]);

  function onMove(e) {
    const rect = wrapRef.current.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    const i = Math.max(0, Math.min(data.length - 1, Math.round(rel * (data.length - 1))));
    setHover(i);
  }

  const gid = "ag-" + accent.replace(/[^a-z0-9]/gi, "");
  return (
    <div style={{ width: "100%" }}>
      <div ref={wrapRef} style={{ position: "relative", width: "100%" }}
           onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
             style={{ width: "100%", height: H, display: "block" }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </linearGradient>
          </defs>
          {yTicks.map((v) => (
            <line key={v} x1={padL} y1={y(v)} x2={W - padR} y2={y(v)}
                  stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={areaPath} fill={`url(#${gid})`} />
          {benchPath && (
            <path d={benchPath} fill="none" stroke="currentColor" strokeOpacity="0.28"
                  strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          )}
          <path d={linePath} fill="none" stroke={accent} strokeWidth="2"
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {hover != null && (
            <line x1={x(hover)} y1={padT} x2={x(hover)} y2={H - padB}
                  stroke="currentColor" strokeOpacity="0.25" strokeWidth="1"
                  vectorEffect="non-scaling-stroke" />
          )}
          {hover != null && (
            <circle cx={x(hover)} cy={y(data[hover])} r="3.5" fill={accent}
                    stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {yTicks.map((v) => (
          <span key={v} style={{ position: "absolute", left: 4, top: `calc(${(y(v) / H) * 100}% - 15px)`,
            fontSize: 10, fontFamily: "var(--mono)", color: "var(--muted)", pointerEvents: "none", background: "color-mix(in srgb, var(--panel, #fff) 72%, transparent)", padding: "1px 4px", borderRadius: 4 }}>
            {fmtAxis(v)}
          </span>
        ))}
        {hover != null && (
          <div className="pm-chart-tip" style={{
            position: "absolute", top: 6,
            left: `clamp(0px, ${(hover / (data.length - 1)) * 100}%, calc(100% - 150px))`,
          }}>
            <div className="pm-chart-tip-val">{fmtUSD(data[hover])}</div>
            <div className="pm-chart-tip-sub">
              {dates && dates[hover] ? dates[hover].toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : `Day ${hover + 1}`} · {((data[hover] / data[0] - 1) * 100 >= 0 ? "+" : "")}
              {((data[hover] / data[0] - 1) * 100).toFixed(1)}% from start
            </div>
          </div>
        )}
      </div>
      {xTicks && (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 2px 0",
          fontSize: 10, fontFamily: "var(--mono)", color: "var(--muted)", borderTop: "1px solid var(--line-2, #f0f2f5)", marginTop: 2 }}>
          {xTicks.map((t, i) => <span key={i}>{t}</span>)}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sparkline — tiny trend line for table rows
// ----------------------------------------------------------------------------
function Sparkline({ points, color, width = 96, height = 28 }) {
  const lo = Math.min(...points), hi = Math.max(...points);
  const x = (i) => (i / (points.length - 1)) * width;
  const y = (v) => height - 2 - ((v - lo) / (hi - lo || 1)) * (height - 4);
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5"
            strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ----------------------------------------------------------------------------
// Donut — sector allocation
// ----------------------------------------------------------------------------
function Donut({ data, colors, size = 168, thickness = 22, centerLabel, centerSub, onSlice }) {
  const r = size / 2 - thickness / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const [hi, setHi] = useState(null);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${c} ${c})`}>
        {data.map((d, i) => {
          const frac = d.pct / 100;
          const len = frac * circ;
          const seg = (
            <circle key={i} cx={c} cy={c} r={r} fill="none"
                    stroke={colors[i % colors.length]}
                    strokeWidth={hi === i ? thickness + 4 : thickness}
                    strokeDasharray={`${len} ${circ - len}`}
                    strokeDashoffset={-offset}
                    style={{ transition: "stroke-width .15s", cursor: "pointer" }}
                    onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}
                    onClick={onSlice ? () => onSlice(d, i) : undefined} />
          );
          offset += len;
          return seg;
        })}
      </g>
      <text x={c} y={c - 4} textAnchor="middle" className="pm-donut-center">
        {hi != null ? `${data[hi].pct.toFixed(1)}%` : centerLabel}
      </text>
      <text x={c} y={c + 16} textAnchor="middle" className="pm-donut-sub">
        {hi != null ? data[hi].name : centerSub}
      </text>
    </svg>
  );
}

// ----------------------------------------------------------------------------
// TargetGauge — progress toward annual return target (semicircle)
// ----------------------------------------------------------------------------
function TargetGauge({ current, target, accent, size = 200 }) {
  const W = size, H = size * 0.62, sw = 16;
  const cx = W / 2, cy = H - 6, r = (W - sw) / 2;
  const polar = (deg) => {
    const a = (Math.PI * deg) / 180;
    return [cx + r * Math.cos(Math.PI - a), cy - r * Math.sin(Math.PI - a)];
  };
  const arc = (d0, d1) => {
    const [x0, y0] = polar(d0), [x1, y1] = polar(d1);
    const large = d1 - d0 > 180 ? 1 : 0;
    return `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1}`;
  };
  const pct = Math.max(0, Math.min(1.15, current / target));
  const deg = Math.min(180, pct * 180);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 6}`} style={{ display: "block" }}>
      <path d={arc(0, 180)} fill="none" stroke="currentColor" strokeOpacity="0.1"
            strokeWidth={sw} strokeLinecap="round" />
      <path d={arc(0, deg)} fill="none" stroke={accent}
            strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

Object.assign(window, { AreaChart, Sparkline, Donut, TargetGauge, fmtUSD, smoothPath });
