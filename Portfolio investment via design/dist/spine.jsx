// rendement.jsx — Return / Net-change analysis view
const { useState: useStateR, useMemo: useMemoR } = React;

function fmtSigned(n, dp = 2) {
  const s = n < 0 ? "−" : "";
  return s + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtMoney0(n) {
  return (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ---- categorical chart: bars for "individual", line for "cumulative" ----
function PeriodChart({ rows, accent, mode, kind }) {
  const W = 1000, H = 320, padT = 28, padB = 36, padL = 8, padR = 8;
  const UP = "#0e9f6e", DOWN = "#e02424";
  const vals = rows.map((r) => (kind === "return" ? r.ret : r.variation));
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const span = (hi - lo) || 1;
  const y = (v) => padT + (1 - (v - lo) / span) * (H - padT - padB);
  const zeroY = y(0);
  const n = rows.length;
  const slot = (W - padL - padR) / n;
  const cx = (i) => padL + slot * (i + 0.5);

  const [hover, setHover] = useStateR(null);

  if (mode === "individual") {
    const bw = Math.min(64, slot * 0.5);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}
           onMouseLeave={() => setHover(null)}>
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="currentColor" strokeOpacity="0.18" />
        {rows.map((r, i) => {
          const v = vals[i];
          const top = v >= 0 ? y(v) : zeroY;
          const h = Math.abs(y(v) - zeroY);
          const col = v >= 0 ? accent : DOWN;
          return (
            <g key={r.label} onMouseEnter={() => setHover(i)} style={{ cursor: "pointer" }}>
              <rect x={cx(i) - slot / 2} y={padT} width={slot} height={H - padT - padB} fill="transparent" />
              <rect x={cx(i) - bw / 2} y={top} width={bw} height={Math.max(2, h)} rx="3"
                    fill={col} opacity={hover == null || hover === i ? 1 : 0.45} />
              <text x={cx(i)} y={v >= 0 ? top - 8 : top + h + 16} textAnchor="middle"
                    className="rd-bar-val" fill={col}>
                {kind === "return" ? fmtSigned(v, 1) + "%" : fmtMoney0(v)}
              </text>
              <text x={cx(i)} y={H - 12} textAnchor="middle" className="rd-axis">{r.label}</text>
            </g>
          );
        })}
      </svg>
    );
  }

  // cumulative line (smoothed)
  const pts = vals.map((v, i) => [cx(i), y(v)]);
  const linePath = smoothPath(pts, 0.6);
  const lastUp = vals[vals.length - 1] >= 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}
         onMouseLeave={() => setHover(null)}>
      <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="currentColor" strokeOpacity="0.18" />
      <path d={`${linePath} L${pts[n - 1][0]},${zeroY} L${pts[0][0]},${zeroY} Z`}
            fill={lastUp ? accent : DOWN} opacity="0.08" />
      <path d={linePath} fill="none" stroke={lastUp ? accent : DOWN} strokeWidth="2.5"
            strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {pts.map((p, i) => (
        <g key={i} onMouseEnter={() => setHover(i)} style={{ cursor: "pointer" }}>
          <circle cx={p[0]} cy={p[1]} r={hover === i ? 6 : 4} fill="#fff"
                  stroke={vals[i] >= 0 ? accent : DOWN} strokeWidth="2.5" />
          <text x={p[0]} y={H - 12} textAnchor="middle" className="rd-axis">{rows[i].label}</text>
          {hover === i && (
            <text x={p[0]} y={p[1] - 14} textAnchor="middle" className="rd-bar-val"
                  fill={vals[i] >= 0 ? accent : DOWN}>
              {kind === "return" ? fmtSigned(vals[i], 1) + "%" : fmtMoney0(vals[i])}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ---- monthly tracking ledger — records a real net-worth snapshot per month (accumulates forward) ----
const RD_LKEY = "helm_monthly_ledger_v1";
function rdLedger() { try { return JSON.parse(localStorage.getItem(RD_LKEY)) || {}; } catch (e) { return {}; } }
function rdRecordMonth() {
  const led = rdLedger();
  const ym = new Date().toISOString().slice(0, 7);
  const entry = led[ym] || {};
  entry.asOf = new Date().toISOString().slice(0, 10);
  ["all", ...window.PMData.accounts.map((a) => a.id)].forEach((id) => {
    try { entry[id] = Math.round(window.PMData.buildView(id).kpis.equity); } catch (e) {}
  });
  led[ym] = entry;
  try { localStorage.setItem(RD_LKEY, JSON.stringify(led)); } catch (e) {}
  return led;
}

function TrackedMonths({ accountId, accent }) {
  const led = rdRecordMonth();
  const key = accountId === "all" || accountId === "crypto" ? "all" : accountId;
  const months = Object.keys(led).sort();
  const rows = months.map((ym, i) => {
    const close = led[ym][key];
    const prev = i > 0 ? led[months[i - 1]][key] : null;
    return { ym, asOf: led[ym].asOf, close, delta: prev != null && close != null ? close - prev : null, pct: prev ? (close - prev) / prev * 100 : null };
  }).filter((r) => r.close != null).reverse();
  return (
    <section className="pm-card">
      <div className="pm-card-head">
        <div className="pm-card-eyebrow">Monthly tracking · real snapshots{accountId === "crypto" ? " · all accounts" : ""}</div>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>auto-recorded on each visit · month-end value = last visit that month</span>
      </div>
      <div className="pm-table-wrap">
        <table className="pm-table">
          <thead><tr><th className="ta-left">Month</th><th className="ta-right">Closing value</th><th className="ta-right">Variation nette</th><th className="ta-right">Rendement</th><th className="ta-right">Snapshot</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ym}>
                <td className="ta-left"><strong>{r.ym}</strong></td>
                <td className="ta-right mono">{fmtMoney0(r.close)}</td>
                <td className="ta-right mono" style={{ color: r.delta == null ? "var(--muted)" : r.delta >= 0 ? "#0e9f6e" : "#e02424" }}>{r.delta == null ? "— baseline" : (r.delta >= 0 ? "+" : "−") + "$" + Math.abs(r.delta).toLocaleString("en-US")}</td>
                <td className="ta-right mono" style={{ color: r.pct == null ? "var(--muted)" : r.pct >= 0 ? "#0e9f6e" : "#e02424" }}>{r.pct == null ? "—" : (r.pct >= 0 ? "+" : "") + r.pct.toFixed(2) + "%"}</td>
                <td className="ta-right mono" style={{ color: "var(--muted)", fontSize: 11 }}>{r.asOf}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rd-note" style={{ marginTop: 10 }}>This ledger tracks <strong>real</strong> month-over-month net variation and return from {months[0]} forward — it fills itself as months pass (uses live-feed values when connected). Paste your statement history in chat to backfill earlier months as real data.</div>
    </section>
  );
}

function Rendement({ accountId, accent }) {
  const [kind, setKind] = useStateR("return");      // return | networth
  const [mode, setMode] = useStateR("individual");  // individual | cumulative
  const [frame, setFrame] = useStateR("annual");    // annual | monthly
  const [benchKey, setBenchKey] = useStateR("sp500"); // sp500 | ndx

  const data = useMemoR(() => window.PMData.buildRendement(accountId), [accountId]);
  const block = data[frame];
  const rows = block[mode];

  // headline = last cumulative value (the "total" over the window)
  const headline = block.cumulative[block.cumulative.length - 1];
  const headVal = kind === "return" ? headline.ret : headline.variation;
  const UP = "#0e9f6e", DOWN = "#e02424";
  const headCol = headVal >= 0 ? UP : DOWN;

  const title = kind === "return"
    ? "Time-weighted return (%)"
    : "Change in market value ($)";
  const acctName = accountId === "all"
    ? "All accounts"
    : (window.PMData.accounts.find((a) => a.id === accountId)?.label || accountId);

  // benchmark return over the comparable window (annual ≈ 1Y, monthly ≈ 1M of the index)
  const bench = window.PMData[benchKey === "ndx" ? "nasdaq" : "sp500"];
  const benchWin = frame === "annual" ? 252 : 21;
  const bSlice = bench.slice(-benchWin);
  const benchRet = (bSlice[bSlice.length - 1] / bSlice[0] - 1) * 100;
  const benchName = benchKey === "ndx" ? "Nasdaq 100" : "S&P 500";

  // ---- Session 18 institutional scorecard (vs benchmark), Rf = 2.5% ----
  const BENCH_ANNUAL = { sp500: [-18.1, 26.3, 25.0, 23.3, 12.0], ndx: [-32.4, 44.6, 28.6, 29.0, 14.0] };
  const pRets = data.annual.individual.map((r) => r.ret);
  const bRets = (BENCH_ANNUAL[benchKey] || BENCH_ANNUAL.sp500).slice(0, pRets.length);
  const avgA = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const sdA = (a) => { const m = avgA(a); return Math.sqrt(avgA(a.map((x) => (x - m) ** 2))); };
  const RF = 2.5;
  const meanP = avgA(pRets), sdP = sdA(pRets) || 1;
  const sharpe = (meanP - RF) / sdP;
  const va = meanP - avgA(bRets);
  const te = sdA(pRets.map((p, i) => p - (bRets[i] != null ? bRets[i] : 0))) || 1;
  const ir = va / te;
  const up = pRets.reduce((s, p) => s + Math.max(0, p - RF), 0);
  const dn = pRets.reduce((s, p) => s + Math.max(0, RF - p), 0);
  const omega = dn > 0 ? up / dn : (up > 0 ? 9.99 : 0);
  const SP_W = { NVDA: 7, MSFT: 6, AAPL: 6, AVGO: 2, META: 2.5, AMD: 0.5, TSLA: 1.5, COIN: 0.1, LLY: 1.2 };
  const evView = window.PMData.buildView(accountId);
  const overlap = evView.holdings.reduce((s, h) => s + Math.min(h.weight, SP_W[h.ticker] || 0), 0);
  const activeShare = Math.max(60, Math.min(99.5, 100 - overlap));

  function exportCSV() {
    const head = kind === "networth"
      ? ["Period", "Opening", "Inflows", "Outflows", "Market change", "Closing"]
      : ["Period", mode === "cumulative" ? "Cumulative return %" : "Return %", "Sharpe"];
    const lines = rows.map((r) => kind === "networth"
      ? [r.label, r.initial, r.inflow, r.outflow, r.variation, r.final].join(",")
      : [r.label, r.ret.toFixed(2), r.sharpe.toFixed(2)].join(","));
    const csv = [head.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rendement-${accountId}-${kind}-${frame}-${mode}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="rd-wrap">
      <section className="pm-card rd-card">
        <div className="rd-head">
          <div className="rd-tabs">
            <button className={kind === "return" ? "is-active" : ""} onClick={() => setKind("return")}>Rendement</button>
            <button className={kind === "networth" ? "is-active" : ""} onClick={() => setKind("networth")}>Variation nette</button>
          </div>
          <div className="rd-frame">
            <span className="rd-frame-label">Basis</span>
            <div className="pm-range">
              <button className={frame === "annual" ? "is-active" : ""} onClick={() => setFrame("annual")}>Annual</button>
              <button className={frame === "monthly" ? "is-active" : ""} onClick={() => setFrame("monthly")}>Monthly</button>
            </div>
          </div>
        </div>

        <div className="rd-headline">
          <div>
            <div className="rd-eyebrow">{title} · {acctName}</div>
            <div className="rd-big" style={{ color: headCol }}>
              {kind === "return" ? fmtSigned(headVal, 2) + "%" : fmtMoney0(headVal)}
            </div>
            <div className="rd-sub">
              {mode === "cumulative" ? "Cumulative" : "Per-period"} · {frame === "annual" ? "by year" : "trailing 12 months"}
              {kind === "return" && (
                <span className="rd-vs" style={{ color: headVal >= benchRet ? UP : DOWN }}>
                  {"  "}{headVal >= benchRet ? "▲" : "▼"} {Math.abs(headVal - benchRet).toFixed(1)} pts vs {benchName}
                </span>
              )}
            </div>
          </div>
          <div className="rd-mode pm-range">
            <button className={mode === "individual" ? "is-active" : ""} onClick={() => setMode("individual")}>Individual periods</button>
            <button className={mode === "cumulative" ? "is-active" : ""} onClick={() => setMode("cumulative")}>Cumulative</button>
          </div>
        </div>

        <div className="rd-chart">
          <PeriodChart rows={rows} accent={accent} mode={mode} kind={kind} />
        </div>
      </section>

      <TrackedMonths accountId={accountId} accent={accent} />

      <section className="pm-card rd-score">
        <div className="pm-card-head">
          <div className="pm-card-eyebrow">Institutional scorecard · vs {benchName}</div>
          <span className="rd-score-src">NBC Finance 101 · Session 18 method · Rf 2.5%</span>
        </div>
        <div className="rd-score-grid">
          <div className="rd-metric"><span>Sharpe ratio</span><strong style={{ color: sharpe >= 0 ? UP : DOWN }}>{sharpe.toFixed(2)}</strong><em>(return − Rf) / σ</em></div>
          <div className="rd-metric"><span>Value added</span><strong style={{ color: va >= 0 ? UP : DOWN }}>{fmtSigned(va, 1)} pts</strong><em>vs benchmark avg</em></div>
          <div className="rd-metric"><span>Information ratio</span><strong style={{ color: ir >= 0.5 ? UP : ir >= 0 ? "var(--ink)" : DOWN }}>{ir.toFixed(2)}</strong><em>VA / tracking err · good ≥ 0.5</em></div>
          <div className="rd-metric"><span>Tracking error</span><strong>{te.toFixed(1)}%</strong><em>σ of value added</em></div>
          <div className="rd-metric"><span>Active share</span><strong style={{ color: accent }}>{activeShare.toFixed(0)}%</strong><em>departure from index</em></div>
          <div className="rd-metric"><span>Omega ratio</span><strong style={{ color: omega >= 1 ? UP : DOWN }}>{omega.toFixed(2)}</strong><em>upside / downside vs Rf</em></div>
        </div>
        <div className="rd-score-note">Sharpe &amp; Omega measure return per unit of risk; Information Ratio &amp; Active Share measure skill vs the benchmark — good active equity managers reach IR ≥ 0.5. Computed on annual returns vs {benchName}.</div>
      </section>

      <section className="pm-card">
        <div className="pm-card-head">
          <div className="pm-card-eyebrow">Breakdown</div>
          <div className="rd-bench-row">
            <select className="rd-select" value={benchKey} onChange={(e) => setBenchKey(e.target.value)}>
              <option value="sp500">vs S&P 500</option>
              <option value="ndx">vs Nasdaq 100</option>
            </select>
            <button className="rd-csv" onClick={exportCSV}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
              Export CSV
            </button>
          </div>
        </div>
        <div className="pm-table-wrap">
          <table className="pm-table rd-table">
            <thead>
              <tr>
                <th className="ta-left">Period</th>
                {kind === "networth" && <th className="ta-right">Opening value</th>}
                {kind === "networth" && <th className="ta-right">Inflows</th>}
                {kind === "networth" && <th className="ta-right">Outflows</th>}
                <th className="ta-right">{kind === "return" ? (mode === "cumulative" ? "Cumulative return" : "Return") : "Market change"}</th>
                {kind === "networth" && <th className="ta-right">Closing value</th>}
                {kind === "return" && <th className="ta-right">Sharpe</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const v = kind === "return" ? r.ret : r.variation;
                const col = v >= 0 ? UP : DOWN;
                const sharpe = (r.ret / 100 / 0.18).toFixed(2);
                return (
                  <tr key={r.label}>
                    <td className="ta-left" style={{ fontWeight: 600 }}>{r.label}</td>
                    {kind === "networth" && <td className="ta-right mono">{fmtMoney0(r.initial)}</td>}
                    {kind === "networth" && <td className="ta-right mono" style={{ color: UP }}>{fmtMoney0(r.inflow)}</td>}
                    {kind === "networth" && <td className="ta-right mono" style={{ color: DOWN }}>{fmtMoney0(r.outflow)}</td>}
                    <td className="ta-right mono" style={{ color: col, fontWeight: 600 }}>
                      {kind === "return" ? fmtSigned(v, 2) + "%" : fmtMoney0(v)}
                    </td>
                    {kind === "networth" && <td className="ta-right mono">{fmtMoney0(r.final)}</td>}
                    {kind === "return" && <td className="ta-right mono" style={{ color: sharpe >= 0 ? "var(--ink-2)" : DOWN }}>{sharpe}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="rd-note">Time-weighted return neutralizes the effect of deposits and withdrawals. Net change shows actual dollar movement including flows.</div>
      </section>
    </div>
  );
}

window.Rendement = Rendement;
