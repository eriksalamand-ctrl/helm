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
function AreaChart({ data, benchmark, accent, height = 280, showBenchmark = true }) {
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  const W = 1000, H = height, padL = 8, padR = 8, padT = 16, padB = 8;

  const { dMin, dMax } = useMemo(() => {
    const lo = Math.min(...data), hi = Math.max(...data);
    const pad = (hi - lo) * 0.08;
    return { dMin: lo - pad, dMax: hi + pad };
  }, [data]);

  const x = (i) => padL + (i / (data.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - dMin) / (dMax - dMin)) * (H - padT - padB);

  const linePath = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(data.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;

  // benchmark rescaled to share the same vertical band as the portfolio start
  const benchPath = useMemo(() => {
    if (!benchmark || !showBenchmark) return null;
    const b0 = benchmark[0];
    const scaled = benchmark.map((b) => data[0] * (b / b0));
    return scaled.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  }, [benchmark, data, dMin, dMax, showBenchmark]);

  function onMove(e) {
    const rect = wrapRef.current.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    const i = Math.max(0, Math.min(data.length - 1, Math.round(rel * (data.length - 1))));
    setHover(i);
  }

  const gid = "ag-" + accent.replace(/[^a-z0-9]/gi, "");
  return (
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
      {hover != null && (
        <div className="pm-chart-tip" style={{
          position: "absolute", top: 6,
          left: `clamp(0px, ${(hover / (data.length - 1)) * 100}%, calc(100% - 150px))`,
        }}>
          <div className="pm-chart-tip-val">{fmtUSD(data[hover])}</div>
          <div className="pm-chart-tip-sub">
            Day {hover + 1} · {((data[hover] / data[0] - 1) * 100 >= 0 ? "+" : "")}
            {((data[hover] / data[0] - 1) * 100).toFixed(1)}% from start
          </div>
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
function Donut({ data, colors, size = 168, thickness = 22, centerLabel, centerSub }) {
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
            <circle key={d.name} cx={c} cy={c} r={r} fill="none"
                    stroke={colors[i % colors.length]}
                    strokeWidth={hi === i ? thickness + 4 : thickness}
                    strokeDasharray={`${len} ${circ - len}`}
                    strokeDashoffset={-offset}
                    style={{ transition: "stroke-width .15s", cursor: "pointer" }}
                    onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} />
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
