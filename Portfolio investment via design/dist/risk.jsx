// risk.jsx — Portfolio risk analytics: VaR, CVaR/Expected Shortfall, bootstrapped max-drawdown.
// Honest: historical simulation (not Gaussian). 500-path bootstrap for drawdown distribution.
// Exposes window.HelmRisk.compute(rets) and window.RiskPanel React component.
const { useState: useRiskState, useMemo: useRiskMemo } = React;

// ── Core risk functions ──────────────────────────────────────────────────────
function varHist(rets, conf) {
  if (!rets.length) return 0;
  const sorted = rets.slice().sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor((1 - conf) * sorted.length) - 1);
  return sorted[idx];
}
function cvarHist(rets, conf) {
  if (!rets.length) return 0;
  const v = varHist(rets, conf);
  const tail = rets.filter((r) => r <= v);
  return tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : v;
}
function bootstrapMDD(rets, paths, horizon) {
  const n = rets.length;
  if (!n) return { p50: 0, p95: 0, p99: 0, hist: [] };
  const mdds = [];
  for (let p = 0; p < paths; p++) {
    let peak = 1, val = 1, mdd = 0;
    for (let d = 0; d < horizon; d++) {
      val *= 1 + rets[Math.floor(Math.random() * n)];
      if (val > peak) peak = val;
      const dd = (peak - val) / peak;
      if (dd > mdd) mdd = dd;
    }
    mdds.push(mdd);
  }
  mdds.sort((a, b) => a - b);
  // 20-bin histogram
  const maxV = mdds[mdds.length - 1] || 1;
  const bins = Array(20).fill(0);
  mdds.forEach((v) => { bins[Math.min(19, Math.floor((v / maxV) * 20))]++; });
  return { p50: mdds[Math.floor(paths / 2)], p95: mdds[Math.floor(paths * 0.95)], p99: mdds[Math.floor(paths * 0.99)], hist: bins, maxV };
}

function computeRisk(rets, paths, horizon) {
  if (!rets || rets.length < 5) return null;
  return {
    n: rets.length,
    var95: varHist(rets, 0.95),
    var99: varHist(rets, 0.99),
    cvar95: cvarHist(rets, 0.95),
    cvar99: cvarHist(rets, 0.99),
    mdd: bootstrapMDD(rets, paths || 500, horizon || 252),
  };
}

window.HelmRisk = { compute: computeRisk };

// ── Histogram bar chart for the bootstrap MDD distribution ─────────────────
function MddHistogram({ mdd, accent }) {
  const { hist, p50, p95, p99, maxV } = mdd;
  if (!hist || !hist.length) return null;
  const maxBar = Math.max(...hist, 1);
  const W = 260, H = 60, bW = (W / hist.length) - 1;
  const pctFmt = (v) => (v * 100).toFixed(1) + '%';
  return (
    <div className="risk-hist-wrap">
      <svg width={W} height={H} style={{ display: 'block' }}>
        {hist.map((count, i) => {
          const bH = Math.max(2, (count / maxBar) * (H - 4));
          const x = i * (bW + 1);
          const xPct = (i / hist.length) * maxV;
          const isP95 = xPct >= p95 - maxV / 20 && xPct < p95 + maxV / 20;
          const isP99 = xPct >= p99 - maxV / 20;
          return <rect key={i} x={x} y={H - bH} width={bW} height={bH} fill={isP99 ? '#dc2626' : isP95 ? '#f59e0b' : accent || '#4f46e5'} opacity={0.8} rx={1} />;
        })}
      </svg>
      <div className="risk-hist-legend">
        <span>P50 <strong>{pctFmt(p50)}</strong></span>
        <span style={{ color: '#f59e0b' }}>P95 <strong>{pctFmt(p95)}</strong></span>
        <span style={{ color: '#dc2626' }}>P99 <strong>{pctFmt(p99)}</strong></span>
      </div>
    </div>
  );
}

// ── RiskPanel component ──────────────────────────────────────────────────────
// Props: rets (daily return array), label (string), accent, paths (default 500), horizon (default 252)
function RiskPanel({ rets, label, accent, paths, horizon, compact }) {
  const r = useRiskMemo(() => computeRisk(rets, paths || 500, horizon || 252), [rets]);
  if (!r) return (
    <div className="risk-empty">
      Needs ≥5 daily return observations to compute risk statistics.{rets && rets.length ? ` (have ${rets.length})` : ''}
    </div>
  );
  const pct = (v) => (v * 100).toFixed(2) + '%';
  return (
    <div className={`risk-panel${compact ? ' risk-compact' : ''}`}>
      <div className="risk-grid">
        <div className="risk-stat">
          <div className="risk-stat-label">VaR 95%</div>
          <div className="risk-stat-val" style={{ color: '#f59e0b' }}>{pct(Math.abs(r.var95))}</div>
          <div className="risk-stat-sub">daily loss not exceeded 95% of days</div>
        </div>
        <div className="risk-stat">
          <div className="risk-stat-label">VaR 99%</div>
          <div className="risk-stat-val" style={{ color: '#dc2626' }}>{pct(Math.abs(r.var99))}</div>
          <div className="risk-stat-sub">1-in-100 daily loss threshold</div>
        </div>
        <div className="risk-stat">
          <div className="risk-stat-label">CVaR 95%</div>
          <div className="risk-stat-val" style={{ color: '#f59e0b' }}>{pct(Math.abs(r.cvar95))}</div>
          <div className="risk-stat-sub">avg loss on the worst 5% of days</div>
        </div>
        <div className="risk-stat">
          <div className="risk-stat-label">CVaR 99%</div>
          <div className="risk-stat-val" style={{ color: '#dc2626' }}>{pct(Math.abs(r.cvar99))}</div>
          <div className="risk-stat-sub">avg loss on the worst 1% of days</div>
        </div>
      </div>
      {!compact && (
        <>
          <div className="risk-mdd-head">500-path bootstrapped max-drawdown · {horizon || 252}-day horizon</div>
          <MddHistogram mdd={r.mdd} accent={accent} />
          <div className="risk-foot">Based on {r.n} historical daily returns · historical simulation, not Gaussian · bootstrap resamples with replacement</div>
        </>
      )}
    </div>
  );
}

window.RiskPanel = RiskPanel;
