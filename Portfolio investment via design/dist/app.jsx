// app.jsx — Portfolio Manager dashboard
const { useState, useEffect, useRef } = React;

const D = window.PMData;

// ---- formatting helpers ----
const fmtPct = (n, dp = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
const fmtAbs = (n) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const UP = "#0e9f6e",DOWN = "#e02424";
const sc = (n) => n >= 0 ? UP : DOWN;

const RANGES = [
{ k: "1W", d: 5 }, { k: "1M", d: 21 }, { k: "3M", d: 63 },
{ k: "6M", d: 126 }, { k: "1Y", d: 252 }, { k: "ALL", d: 9999 }];

// trading-day date array ending today (skips weekends) — feeds the chart's x-axis
function tradingDates(n) {
  const out = []; const d = new Date();
  while (out.length < n) { const wd = d.getDay(); if (wd !== 0 && wd !== 6) out.unshift(new Date(d)); d.setDate(d.getDate() - 1); }
  return out;
}

// ============================================================ Sidebar
// grouped navigation — Today is the front door; the rest sits under 4 sections
const NAV_GROUPS = [
[null, [
["Today", "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 5h-2v6l5 3 1-1.7-4-2.3V7Z"]]],

["Portfolios", [
["Dashboard", "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z"],
["Holdings", "M4 4h16v4H4V4Zm0 6h16v4H4v-4Zm0 6h16v4H4v-4Z"],
["Performance", "M3 3v18h18v-2H5V3H3Zm5 12 3-4 3 3 5-6 1.5 1.2-6.5 7.8-3-3-2.5 3.3L8 15Z"],
["Trade History", "M6 2h12v20l-3-2-3 2-3-2-3 2V2Zm2 4v2h8V6H8Zm0 4v2h8v-2H8Zm0 4h5v2H8v-2Z"]]],

["Plan", [
["Plan", "M12 2 4 5v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V5l-8-3Zm-1 13-3-3 1.4-1.4L11 12.2l4.6-4.6L17 9l-6 6Z"],
["Projections", "M3 3h2v16h16v2H3V3Zm15.3 3.3 1.4 1.4L14 16.4l-3-3-4.3 4.3-1.4-1.4L11 10.6l3 3 4.3-4.3Z"],
["Portfolio Simulation", "M4 4h16v2H4V4Zm0 5h10v2H4V9Zm0 5h16v2H4v-2Zm0 5h10v2H4v-2Zm14-8 4 3-4 3v-6Z"]]],

["Stock Simulation", [
["Strategy Lab", "M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2Zm1 1.05V11h7.95A8.01 8.01 0 0 0 13 3.05ZM7 13l3 3 4-5 3 4"],
["Screener", "M3 5h18v2H3V5Zm3 6h12v2H6v-2Zm3 6h6v2H9v-2Z"],
["Tracker", "M3 3v18h18v-2H5V3H3Zm4 12 4-4 3 3 5-7 1.6 1.2-6.6 9-3-3-3.6 3.6L7 15Z"]]],

["Understand", [
["Macro", "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 2a8 8 0 0 1 8 8h-8V4Zm-1 .07V12l5.66 5.66A8 8 0 0 1 11 4.07Z"],
["Learning", "M12 3 1 9l11 6 9-4.9V17h2V9M5 13.2V17c0 1.7 3.1 3 7 3s7-1.3 7-3v-3.8l-7 3.8z"],
["Documentation", "M6 2h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm8 1.5V8h4.5L14 3.5ZM8 12h8v1.6H8V12Zm0 4h8v1.6H8V16Z"],
["Research", "M9.5 3a6.5 6.5 0 1 0 4.2 11.5l5.4 5.4 1.4-1.4-5.4-5.4A6.5 6.5 0 0 0 9.5 3Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z"]]]];



function Sidebar({ active, setActive, accent, kpis }) {
  return (
    <aside className="pm-side">
      <div className="pm-brand">
        <div className="pm-brand-mark" style={{ background: accent }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 17 9 11l4 4 7-9" />
          </svg>
        </div>
        <div>
          <div className="pm-brand-name">Helm</div>
          <div className="pm-brand-sub">Portfolio</div>
        </div>
      </div>

      <nav className="pm-nav">
        {NAV_GROUPS.map(([section, items], gi) =>
        <div className="pm-nav-group" key={section || "top"}>
            {section && <div className="pm-nav-label">{section}</div>}
            {items.map(([label, d]) =>
          <button key={label} className={`pm-nav-item${active === label ? " is-active" : ""}`}
          onClick={() => setActive(label)}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d={d} /></svg>
                <span>{label}</span>
              </button>
          )}
          </div>
        )}
      </nav>

      <div className="pm-side-foot">
        <div className="pm-pace-chip">
          <div className="pm-pace-chip-top">
            <span>Annual pace</span>
            <strong style={{ color: kpis.ytdReturnPct >= kpis.targetPct ? UP : accent }}>
              {fmtPct(kpis.ytdReturnPct, 1)}
            </strong>
          </div>
          <div className="pm-pace-bar">
            <div style={{ width: `${Math.max(0, Math.min(100, kpis.ytdReturnPct / kpis.targetPct * 100))}%`, background: accent }} />
          </div>
          <div className="pm-pace-chip-foot">{kpis.targetPct}% / yr target</div>
        </div>
        <div className="pm-user">
          <div className="pm-avatar">AR</div>
          <div className="pm-user-meta">
            <div className="pm-user-name">Alex Rein</div>
            <div className="pm-user-sub">Individual · Margin</div>
          </div>
        </div>
      </div>
    </aside>);

}

// ============================================================ Account selector
function AccountSelector({ account, setAccount, accent }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onDoc(e) {if (ref.current && !ref.current.contains(e.target)) setOpen(false);}
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const items = [
  { id: "all", name: "All accounts", label: `Aggregate · ${D.accounts.length} accounts`, currency: "" },
  ...D.accounts,
  { id: "crypto", name: "Crypto (all)", label: "Digital assets · coins + ETFs", currency: "" }];

  const cur = items.find((a) => a.id === account) || items[0];
  return (
    <div className="pm-acct" ref={ref}>
      <button className={`pm-acct-btn${open ? " is-open" : ""}`} onClick={() => setOpen((o) => !o)}>
        <span className="pm-acct-ico" style={{ background: accent + "1a", color: accent }}>
          {cur.id === "all" ? "ALL" : cur.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="pm-acct-text">
          <span className="pm-acct-name">{cur.name}</span>
          <span className="pm-acct-label">{cur.label}</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open &&
      <div className="pm-acct-menu">
          <div className="pm-acct-menu-label">Portfolios & sub-accounts</div>
          {items.map((a) =>
        <button key={a.id} className={`pm-acct-opt${a.id === account ? " is-active" : ""}`}
        onClick={() => {setAccount(a.id);setOpen(false);}}>
              <span className="pm-acct-ico sm" style={{ background: accent + "1a", color: accent }}>
                {a.id === "all" ? "ALL" : a.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="pm-acct-text">
                <span className="pm-acct-name">{a.name}</span>
                <span className="pm-acct-label">{a.label}</span>
              </span>
              {a.id === account && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>}
            </button>
        )}
        </div>
      }
    </div>);

}

// ============================================================ Topbar
function Topbar({ query, setQuery, active, account, setAccount, accent, ccy, setCcy }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const t = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  // US market hours in ET (UTC−4 in summer): 09:30–16:00, Mon–Fri
  const etMin = (now.getUTCHours() - 4 + 24) % 24 * 60 + now.getUTCMinutes();
  const etDay = now.getUTCDay(); // 0 Sun .. 6 Sat (close enough for the ET weekday)
  const mktOpen = etDay >= 1 && etDay <= 5 && etMin >= 570 && etMin < 960;
  const cryptoLive = true; // crypto trades 24/7
  return (
    <header className="pm-top">
      <div className="pm-top-l">
        <AccountSelector account={account} setAccount={setAccount} accent={accent} />
        <div className={`pm-mkt${mktOpen ? "" : " closed"}`}>
          <span className="pm-mkt-dot" /> {mktOpen ? "Markets open" : "Markets closed"}
          <span className="pm-mkt-time">{t} ET</span>
        </div>
        {(() => {
          const s = window.HelmFeed && window.HelmFeed.status || { live: false, source: "mock" };
          // "live" only when a feed loaded AND the US market is open; otherwise "last close"
          const cls = !s.live ? "" : mktOpen ? " is-live" : " is-close";
          const label = !s.live ? "Demo data" : mktOpen ? "Live feed" : "Last close";
          const tip = !s.live ? "running on built-in demo data" :
          mktOpen ? s.asOf ? "live · updated " + s.asOf : "live feed" :
          "market closed — showing last close" + (s.asOf ? " · " + s.asOf : "");
          return (
            <span className={`pm-feed${cls}`} title={tip}>
              <span className="pm-feed-dot" />{label}
            </span>);

        })()}
      </div>
      <div className="pm-top-r">
        <div className="pm-ccy-toggle">
          {["CAD", "USD"].map((c) =>
          <button key={c} className={ccy === c ? "is-active" : ""} onClick={() => setCcy(c)}>{c}</button>
          )}
        </div>
        <div className="pm-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" strokeLinecap="round" />
          </svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ticker or company…" />
          <kbd>/</kbd>
        </div>
        <button className="pm-icon-btn" title="Notifications">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          <span className="pm-badge-dot" />
        </button>
        <button className="pm-btn-primary" style={{ background: "#121820" }} title="Switch to the Helm V3 shell — Bridge / Book / Lab" onClick={() => window.dispatchEvent(new CustomEvent("helm:v3-toggle"))}>V3</button>
        <button className="pm-btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("helm:log-trade", { detail: {} }))}>+ Trade</button>
      </div>
    </header>);

}

// ============================================================ KPI cards
function StatCard({ label, value, deltaSub, deltaColor }) {
  return (
    <div className="pm-stat" style={{ height: "90px", fontWeight: "500" }}>
      <div className="pm-stat-label">{label}</div>
      <div className="pm-stat-value" style={{ fontSize: "15px" }}>{value}</div>
      <div className="pm-stat-foot">
        <span className="pm-stat-delta" style={{ color: deltaColor, fontSize: "10px" }}>{deltaSub}</span>
      </div>
    </div>);

}

// ============================================================ Performance card (full-width)
const BENCHES = [
{ key: "sp500", name: "S&P 500" },
{ key: "ndx", name: "Nasdaq 100" }];

function PerfCard({ view, accent }) {
  const [range, setRange] = useState("1Y");
  const [benchKey, setBenchKey] = useState("sp500"); // "off" | "sp500" | "ndx"
  const days = RANGES.find((r) => r.k === range).d;
  let data = view.portfolio.slice(-days);
  const benchOn = benchKey !== "off";
  const benchSrc = benchKey === "ndx" ? D.nasdaq : D.sp500;
  let benchData = benchSrc.slice(-days);
  // align both series to the same trading-day window so the grey baseline
  // spans exactly the same period as the portfolio line
  const nAlign = benchOn ? Math.min(data.length, benchData.length) : data.length;
  data = data.slice(-nAlign); benchData = benchData.slice(-nAlign);
  const dates = tradingDates(data.length);
  const benchName = (BENCHES.find((b) => b.key === benchKey) || {}).name;
  const ret = (data[data.length - 1] / data[0] - 1) * 100;
  const benchRet = benchData.length > 1 ? (benchData[benchData.length - 1] / benchData[0] - 1) * 100 : 0;
  const K = view.kpis;

  return (
    <section className="pm-card pm-perf">
      <div className="pm-card-head">
        <div>
          <div className="pm-card-eyebrow">Portfolio value</div>
          <div className="pm-perf-val">{fmtUSD(K.equity)}</div>
          <div className="pm-perf-sub">
            <span style={{ color: sc(ret) }}>{fmtPct(ret)} </span>
            <span className="pm-muted">this period</span>
            {benchOn &&
            <span className="pm-vs" style={{ color: ret >= benchRet ? UP : DOWN }}>
                {ret >= benchRet ? "▲" : "▼"} {Math.abs(ret - benchRet).toFixed(1)}% vs {benchName}
              </span>
            }
          </div>
        </div>
        <div className="pm-perf-ctrl">
          <div className="pm-baseline">
            <span className="pm-baseline-label">Baseline</span>
            <div className="pm-range">
              <button className={benchKey === "off" ? "is-active" : ""} onClick={() => setBenchKey("off")}>Off</button>
              {BENCHES.map((b) =>
              <button key={b.key} className={benchKey === b.key ? "is-active" : ""}
              onClick={() => setBenchKey(b.key)}>{b.name}</button>
              )}
            </div>
          </div>
          <div className="pm-range">
            {RANGES.map((r) =>
            <button key={r.k} className={range === r.k ? "is-active" : ""}
            onClick={() => setRange(r.k)}>{r.k}</button>
            )}
          </div>
        </div>
      </div>
      <div className="pm-chart-area">
        <AreaChart data={data} benchmark={benchData} dates={dates} accent={accent} showBenchmark={benchOn} height={220} />
      </div>
    </section>);

}

// ============================================================ Holdings table
function HoldingsTable({ view, query, accent, onPick }) {
  const [sort, setSort] = useState({ key: "dispValue", dir: -1 });
  const cols = [
  { key: "ticker", label: "Symbol", align: "left" },
  { key: "price", label: "Last", align: "right" },
  { key: "dayPct", label: "Day", align: "right" },
  { key: "spark", label: "30D", align: "center", noSort: true },
  { key: "shares", label: "Shares", align: "right" },
  { key: "dispValue", label: "Mkt value", align: "right" },
  { key: "plPct", label: "Unreal. P/L", align: "right" },
  { key: "weight", label: "Weight", align: "right" }];

  const q = query.trim().toLowerCase();
  let rows = view.holdings.filter((h) => !q || h.ticker.toLowerCase().includes(q) || h.name.toLowerCase().includes(q));
  rows = [...rows].sort((a, b) => (a[sort.key] > b[sort.key] ? 1 : -1) * sort.dir);

  function setCol(key) {
    setSort((s) => s.key === key ? { key, dir: -s.dir } : { key, dir: -1 });
  }

  return (
    <section className="pm-card pm-holdings">
      <div className="pm-card-head">
        <div className="pm-card-eyebrow">Holdings</div>
        <span className="pm-count">{rows.length} positions</span>
      </div>
      <div className="pm-table-wrap">
        <table className="pm-table">
          <thead>
            <tr>
              {cols.map((c) =>
              <th key={c.key} className={`ta-${c.align}${c.noSort ? "" : " sortable"}${sort.key === c.key ? " sorted" : ""}`}
              onClick={c.noSort ? undefined : () => setCol(c.key)}>
                  {c.label}{sort.key === c.key ? sort.dir < 0 ? " ↓" : " ↑" : ""}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((h) =>
            <tr key={h.ticker + "·" + h.acct} className="hp-row" onClick={() => onPick && onPick(h.ticker)}>
                <td className="ta-left">
                  <div className="pm-sym">
                    <div className="pm-sym-badge" style={{ background: accent + "1a", color: accent }}>{h.ticker.slice(0, 2)}</div>
                    <div>
                      <div className="pm-sym-tkr">{h.ticker}</div>
                      <div className="pm-sym-name">{h.name}</div>
                    </div>
                  </div>
                </td>
                <td className="ta-right mono">{fmtUSD(h.price, 2)}</td>
                <td className="ta-right mono" style={{ color: sc(h.dayPct) }}>{fmtPct(h.dayPct)}</td>
                <td className="ta-center"><div className="pm-spk"><Sparkline points={h.spark} color={sc(h.plPct)} /></div></td>
                <td className="ta-right mono">{h.shares}</td>
                <td className="ta-right mono">{fmtUSD(h.dispValue)}</td>
                <td className="ta-right mono">
                  <div style={{ color: sc(h.plPct) }}>{fmtPct(h.plPct)}</div>
                  <div className="pm-cell-sub" style={{ color: sc(h.plAbs) }}>{fmtAbs(h.plAbs)}</div>
                </td>
                <td className="ta-right mono">
                  <div className="pm-weight">
                    <span>{h.weight.toFixed(1)}%</span>
                    <span className="pm-weight-bar"><i style={{ width: `${Math.min(100, h.weight * 2.4)}%`, background: accent }} /></span>
                  </div>
                </td>
              </tr>
            )}
            {rows.length === 0 &&
            <tr><td colSpan="8" className="pm-empty">No positions match “{query}”.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>);

}

// ============================================================ Right rail cards
function TargetCard({ kpis, accent }) {
  const aheadBy = kpis.ytdReturnPct - kpis.targetPct;
  const ahead = aheadBy >= 0;
  return (
    <section className="pm-card pm-target">
      <div className="pm-card-eyebrow">Return vs target</div>
      <TargetGauge current={kpis.ytdReturnPct} target={kpis.targetPct} accent={accent} />
      <div className="pm-target-num" style={{ color: accent }}>{fmtPct(kpis.ytdReturnPct, 1)}</div>
      <div className="pm-target-cap">trailing 12-month return</div>
      <div className={`pm-target-pill ${ahead ? "good" : "warn"}`}>
        {ahead ? "▲" : "▼"} {Math.abs(aheadBy).toFixed(1)} pts {ahead ? "ahead of" : "behind"} {kpis.targetPct}% goal
      </div>
    </section>);

}

function AllocCard({ view, onSector }) {
  return (
    <section className="pm-card">
      <div className="pm-card-head">
        <div className="pm-card-eyebrow">Allocation</div>
        <span className="pm-count" style={{ fontSize: 11, color: "var(--muted)" }}>click a sector for detail</span>
      </div>
      <div className="pm-alloc">
        <Donut data={view.allocation} colors={D.DONUT_COLORS}
        centerLabel={fmtUSD(view.kpis.equity)} centerSub="Net liquidity"
        onSlice={onSector ? (a) => onSector(a.name) : undefined} />
        <ul className="pm-legend">
          {view.allocation.map((a, i) =>
          <li key={a.name} onClick={() => onSector && onSector(a.name)} style={onSector ? { cursor: "pointer" } : undefined} title="Open sector detail">
              <span className="pm-legend-dot" style={{ background: D.DONUT_COLORS[i % D.DONUT_COLORS.length] }} />
              <span className="pm-legend-name">{a.name}</span>
              <span className="pm-legend-pct mono">{a.pct.toFixed(1)}%</span>
            </li>
          )}
        </ul>
      </div>
    </section>);

}

// ---- sector drill-down: holdings in a sector, listed per account ----
function SectorModal({ name, view, accent, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const rows = view.holdings.filter((h) => h.sector === name);
  const total = rows.reduce((s, h) => s + (h.dispValue || 0), 0);
  const byAcct = {};
  rows.forEach((h) => { (byAcct[h.acct] = byAcct[h.acct] || []).push(h); });
  const acctName = (id) => { const a = D.accounts.find((x) => x.id === id); return a ? a.name : (id || "—"); };
  const groups = Object.entries(byAcct).map(([id, hs]) => ({ id, name: acctName(id), hs: hs.sort((a, b) => b.dispValue - a.dispValue), sub: hs.reduce((s, h) => s + h.dispValue, 0) }))
    .sort((a, b) => b.sub - a.sub);
  return (
    <div className="pm-modal-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pm-modal pm-sectormodal">
        <div className="pm-modal-head">
          <div>
            <div className="pm-card-eyebrow">Sector detail</div>
            <div className="pm-modal-title">{name} <span className="mono" style={{ fontSize: 14, color: "var(--ink-2)", fontWeight: 500 }}>· {fmtUSD(total)} · {view.kpis.equity ? (total / view.kpis.equity * 100).toFixed(1) : 0}% of portfolio</span></div>
          </div>
          <button className="pm-modal-x" onClick={onClose}>✕</button>
        </div>
        <div className="pm-modal-body">
          {groups.map((g) => (
            <div className="pm-sec-grp" key={g.id}>
              <div className="pm-sec-grp-head"><strong>{g.name}</strong><span className="mono">{fmtUSD(g.sub)}</span></div>
              {g.hs.map((h) => (
                <div className="pm-sec-row" key={h.ticker + g.id}>
                  <span className="pm-sec-tkr">{h.ticker}</span>
                  <span className="pm-sec-name">{h.name}</span>
                  <span className="mono pm-sec-sh">{h.shares} sh</span>
                  <span className="mono" style={{ color: sc(h.dayPct) }}>{fmtPct(h.dayPct, 1)}</span>
                  <span className="mono" style={{ color: sc(h.plPct) }}>{fmtPct(h.plPct, 1)}</span>
                  <span className="mono pm-sec-val">{fmtUSD(h.dispValue)}</span>
                </div>
              ))}
            </div>
          ))}
          {groups.length === 0 && <div className="pm-empty">No positions in this sector for the selected account.</div>}
        </div>
      </div>
    </div>
  );
}

function TopMovers({ view, onPick }) {
  const agg = {};
  view.holdings.forEach((h) => {
    if (!agg[h.ticker]) agg[h.ticker] = { ticker: h.ticker, name: h.name, dayPct: h.dayPct || 0, val: 0 };
    agg[h.ticker].val += h.dispValue || 0;
  });
  const rows = Object.values(agg).map((r) => ({ ...r, dayAbs: r.val * (r.dayPct / 100) }));
  const byAbs = [...rows].sort((a, b) => Math.abs(b.dayAbs) - Math.abs(a.dayAbs)).slice(0, 6);
  const byPct = [...rows].sort((a, b) => Math.abs(b.dayPct) - Math.abs(a.dayPct)).slice(0, 6);
  const Cell = ({ r, mode }) => (
    <button className="pm-mvr" onClick={() => onPick && onPick(r.ticker)}>
      <span className="pm-mvr-tkr">{r.ticker} ›</span>
      <span className="mono" style={{ color: sc(mode === "$" ? r.dayAbs : r.dayPct) }}>
        {mode === "$" ? fmtAbs(r.dayAbs) : fmtPct(r.dayPct, 2)}{(mode === "$" ? r.dayAbs : r.dayPct) >= 0 ? " ↑" : " ↓"}
      </span>
    </button>
  );
  return (
    <section className="pm-card">
      <div className="pm-movers2">
        <div>
          <div className="pm-card-eyebrow">Top movers ($) · today</div>
          <div className="pm-mvr-grid">{byAbs.map((r) => <Cell key={r.ticker} r={r} mode="$" />)}</div>
        </div>
        <div>
          <div className="pm-card-eyebrow">Top movers (%) · today</div>
          <div className="pm-mvr-grid">{byPct.map((r) => <Cell key={r.ticker} r={r} mode="%" />)}</div>
        </div>
      </div>
    </section>
  );
}

function WatchlistCard({ accent }) {
  return (
    <section className="pm-card">
      <div className="pm-card-head">
        <div className="pm-card-eyebrow">Watchlist</div>
        <button className="pm-link" style={{ color: accent }} onClick={() => window.dispatchEvent(new CustomEvent("helm:nav", { detail: "Watchlist" }))}>Open</button>
      </div>
      <div className="pm-watch">
        {D.watchlist.map((w) =>
        <div className="pm-watch-row" key={w.ticker}>
            <div className="pm-watch-l">
              <div className="pm-watch-tkr">{w.ticker}</div>
              <div className="pm-watch-name">{w.name}</div>
            </div>
            <Sparkline points={w.spark} color={sc(w.dayPct)} width={64} height={24} />
            <div className="pm-watch-r">
              <div className="mono pm-watch-px">{fmtUSD(w.price, 2)}</div>
              <div className="mono pm-watch-ch" style={{ color: sc(w.dayPct) }}>{fmtPct(w.dayPct, 1)}</div>
            </div>
          </div>
        )}
      </div>
    </section>);

}

function WatchlistPage({ accent, onPick }) {
  const wl = D.watchlist || [];
  return (
    <div className="scr">
      <section className="pm-card">
        <div className="pm-card-head">
          <div className="pm-card-eyebrow">Watchlist · {wl.length} names</div>
          <span className="pm-count" style={{ fontSize: 11, color: "var(--muted)" }}>tap a row for research</span>
        </div>
        <div className="pm-table-wrap">
          <table className="pm-table">
            <thead><tr>
              <th className="ta-left">Symbol</th><th className="ta-right">Price</th><th className="ta-right">Day</th><th className="ta-left">Trend</th>
            </tr></thead>
            <tbody>
              {wl.map((w) =>
              <tr key={w.ticker} style={{ cursor: "pointer" }} onClick={() => onPick && onPick(w.ticker)}>
                  <td className="ta-left">
                    <div className="pm-sym"><div className="pm-sym-badge" style={{ background: accent + "1a", color: accent }}>{w.ticker.slice(0, 2)}</div>
                      <div><div className="pm-sym-tkr">{w.ticker}</div><div className="pm-sym-name">{w.name}</div></div></div>
                  </td>
                  <td className="ta-right mono">{fmtUSD(w.price, 2)}</td>
                  <td className="ta-right mono" style={{ color: sc(w.dayPct) }}>{fmtPct(w.dayPct, 1)}</td>
                  <td className="ta-left"><Sparkline points={w.spark} color={sc(w.dayPct)} width={80} height={24} /></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>);

}
function AccountSummary({ accent, onOpenAcct, onOpenHoldings }) {
  const D = window.PMData;
  const rows = (D.accounts || []).map((a) => {
    const v = D.buildView(a.id).kpis;
    const cash = v.cash || 0,total = v.equity || 0,inv = Math.max(0, total - cash);
    return { id: a.id, name: a.name, label: a.label, cash, inv, total, pl: v.totalPlAbs || 0, plPct: v.totalPlPct || 0, dayAbs: v.dayChangeAbs || 0, dayPct: v.dayChangePct || 0 };
  });
  const tot = rows.reduce((s, r) => ({ cash: s.cash + r.cash, inv: s.inv + r.inv, total: s.total + r.total, pl: s.pl + r.pl, dayAbs: s.dayAbs + r.dayAbs }), { cash: 0, inv: 0, total: 0, pl: 0, dayAbs: 0 });
  const totPct = tot.total - tot.pl ? tot.pl / (tot.total - tot.pl) * 100 : 0;
  const totDayPct = tot.total - tot.dayAbs ? tot.dayAbs / (tot.total - tot.dayAbs) * 100 : 0;
  const fx = (D.getFx ? D.getFx() : D.FX) || 1.4174;
  const DayCell = ({ abs, pct }) => (
    <td className="ta-right mono" style={{ color: sc(abs) }}>
      {fmtAbs(abs)} {abs >= 0 ? "↑" : "↓"}
      <div className="pm-cell-sub" style={{ color: sc(abs) }}>{fmtPct(pct)}</div>
    </td>
  );
  return (
    <section className="pm-card pm-acctsum">
      <div className="pm-card-head">
        <div className="pm-card-eyebrow">Summary</div>
        <button className="pm-link" style={{ color: accent }} onClick={() => onOpenHoldings && onOpenHoldings()}>Holdings →</button>
      </div>
      <div className="pm-table-wrap">
        <table className="pm-table pm-acctsum-table">
          <thead><tr><th className="ta-left">Account</th><th className="ta-right">Cash</th><th className="ta-right">Investments</th><th className="ta-right">Total</th><th className="ta-right">Day's change</th><th className="ta-right">Unrealized gain</th></tr></thead>
          <tbody>
            {rows.map((r) =>
            <tr key={r.id} className="pm-acctsum-row" onClick={() => onOpenAcct && onOpenAcct(r.id)} title="Open account detail">
                <td className="ta-left"><strong>{r.name}</strong> <span className="pm-acctsum-lbl">{r.label}</span> <span className="pm-acctsum-chev">›</span></td>
                <td className="ta-right mono">{fmtUSD(r.cash)}</td>
                <td className="ta-right mono">{fmtUSD(r.inv)}</td>
                <td className="ta-right mono">{fmtUSD(r.total)}</td>
                <DayCell abs={r.dayAbs} pct={r.dayPct} />
                <td className="ta-right mono" style={{ color: sc(r.pl) }}>{fmtAbs(r.pl)}<div className="pm-cell-sub" style={{ color: sc(r.pl) }}>{fmtPct(r.plPct)}</div></td>
              </tr>
            )}
            <tr className="pm-acctsum-total">
              <td className="ta-left"><strong>Total</strong></td>
              <td className="ta-right mono">{fmtUSD(tot.cash)}</td>
              <td className="ta-right mono">{fmtUSD(tot.inv)}</td>
              <td className="ta-right mono">{fmtUSD(tot.total)}</td>
              <DayCell abs={tot.dayAbs} pct={totDayPct} />
              <td className="ta-right mono" style={{ color: sc(tot.pl) }}>{fmtAbs(tot.pl)}<div className="pm-cell-sub" style={{ color: sc(tot.pl) }}>{fmtPct(totPct)}</div></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="pm-acctsum-fx">FX note: USD/CAD = {Number(fx).toFixed(4)} · values shown in {D.getDispCcy ? D.getDispCcy() : "CAD"} · click an account for its positions</div>
    </section>);

}

// ---- account drill-down: header KPIs + that account's positions ----
function AccountDetail({ id, accent, onPick, onBack }) {
  const a = D.accounts.find((x) => x.id === id) || { name: id, label: "" };
  const v = D.buildView(id);
  const K = v.kpis;
  const chip = (k, val, sub, color) => (
    <div className="pm-ad-chip" key={k}>
      <span className="pm-ad-k">{k}</span>
      <span className="mono pm-ad-v" style={color ? { color } : undefined}>{val}</span>
      {sub && <span className="pm-ad-sub" style={color ? { color } : undefined}>{sub}</span>}
    </div>
  );
  return (
    <>
      <div className="pm-ad-bar">
        <button className="pm-link" style={{ color: accent }} onClick={onBack}>← Back to Summary</button>
      </div>
      <section className="pm-card">
        <div className="pm-card-head" style={{ marginBottom: 4 }}>
          <div>
            <div className="pm-card-eyebrow">Account</div>
            <div className="pm-modal-title">{a.name} <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 400 }}>{a.label}</span></div>
          </div>
        </div>
        <div className="pm-ad-chips">
          {chip("Total", fmtUSD(K.equity))}
          {chip("Cash", fmtUSD(K.cash))}
          {chip("Investments", fmtUSD(Math.max(0, K.equity - K.cash)))}
          {chip("Day's change", fmtAbs(K.dayChangeAbs), fmtPct(K.dayChangePct), sc(K.dayChangeAbs))}
          {chip("Unrealized gain", fmtAbs(K.totalPlAbs), fmtPct(K.totalPlPct), sc(K.totalPlAbs))}
        </div>
      </section>
      <HoldingsTable view={v} query="" accent={accent} onPick={onPick} />
    </>
  );
}
function DashboardBody({ view, query, accent, onPick }) {
  const K = view.kpis;
  const [sub, setSub] = useState(null);      // null | { t: "acct", id } | "holdings"
  const [sector, setSector] = useState(null); // sector name or null

  let body;
  if (sub && sub.t === "acct") {
    body = <AccountDetail id={sub.id} accent={accent} onPick={onPick} onBack={() => setSub(null)} />;
  } else if (sub === "holdings") {
    body = (
      <>
        <div className="pm-ad-bar">
          <button className="pm-link" style={{ color: accent }} onClick={() => setSub(null)}>← Back to Summary</button>
        </div>
        <HoldingsTable view={view} query={query} accent={accent} onPick={onPick} />
      </>
    );
  } else {
    body = (
      <>
        <div className="pm-kpis" style={{ height: "110px", textAlign: "center", lineHeight: "1.1", fontWeight: "400" }}>
          <StatCard label="Net liquidity" value={fmtUSD(K.equity)}
          deltaSub={`${fmtPct(K.dayChangePct)} today`} deltaColor={sc(K.dayChangeAbs)} />
          <StatCard label="Day's change" value={fmtAbs(K.dayChangeAbs)}
          deltaSub={`${fmtPct(K.dayChangePct)} · open positions`} deltaColor={sc(K.dayChangeAbs)} />
          <StatCard label="Unrealized P/L" value={fmtAbs(K.totalPlAbs)}
          deltaSub={`${fmtPct(K.totalPlPct)} on cost`} deltaColor={sc(K.totalPlAbs)} />
          <StatCard label="Buying power" value={fmtUSD(K.cash)}
          deltaSub="cash + margin available" deltaColor="var(--muted)" />
        </div>

        <TopMovers view={view} onPick={onPick} />

        <AccountSummary accent={accent} onOpenAcct={(id) => setSub({ t: "acct", id })} onOpenHoldings={() => setSub("holdings")} />

        <PerfCard view={view} accent={accent} />

        <div className="pm-cols">
          <div className="pm-col-main">
            <AllocCard view={view} onSector={setSector} />
            <WatchlistCard accent={accent} />
          </div>
          <div className="pm-col-rail">
            <TargetCard kpis={K} accent={accent} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{DASH_CSS}</style>
      {body}
      {sector && <SectorModal name={sector} view={view} accent={accent} onClose={() => setSector(null)} />}
    </>
  );
}

const DASH_CSS = `
.pm-movers2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.pm-mvr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 22px; margin-top: 8px; }
.pm-mvr { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font: inherit; font-size: 12.5px; background: none; border: 0; border-bottom: 1px solid var(--line-2); padding: 6px 2px; cursor: pointer; text-align: left; }
.pm-mvr:hover { background: var(--panel-2); }
.pm-mvr-tkr { font-weight: 700; color: var(--ink); }
.pm-acctsum-row { cursor: pointer; }
.pm-acctsum-row:hover td { background: var(--panel-2); }
.pm-acctsum-chev { color: var(--muted); font-weight: 400; margin-left: 2px; }
.pm-acctsum-fx { font-size: 11px; color: var(--muted); margin-top: 10px; }
.pm-cell-sub { font-size: 10.5px; opacity: .75; }
.pm-ad-bar { margin-bottom: 2px; }
.pm-ad-chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
.pm-ad-chip { display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--line); border-radius: 10px; padding: 9px 14px; min-width: 128px; }
.pm-ad-k { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
.pm-ad-v { font-size: 15px; font-weight: 700; }
.pm-ad-sub { font-size: 11px; }
.pm-modal-back { position: fixed; inset: 0; background: rgba(18,24,32,.42); z-index: 90; display: grid; place-items: center; padding: 30px; }
.pm-modal { background: var(--panel, #fff); border-radius: 16px; width: min(720px, 100%); max-height: 82vh; display: flex; flex-direction: column; box-shadow: 0 18px 60px rgba(18,24,32,.25); }
.pm-modal-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 18px 22px 12px; border-bottom: 1px solid var(--line); }
.pm-modal-title { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
.pm-modal-x { font: inherit; font-size: 14px; border: 1px solid var(--line); background: var(--panel); border-radius: 8px; width: 30px; height: 30px; cursor: pointer; color: var(--ink-2); }
.pm-modal-x:hover { background: var(--panel-2); }
.pm-modal-body { overflow: auto; padding: 8px 22px 18px; }
.pm-sec-grp { margin-top: 14px; }
.pm-sec-grp-head { display: flex; justify-content: space-between; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--ink-2); border-bottom: 1px solid var(--line); padding-bottom: 5px; }
.pm-sec-row { display: grid; grid-template-columns: 64px 1fr 70px 70px 70px 100px; gap: 10px; align-items: baseline; font-size: 12.5px; padding: 7px 0; border-bottom: 1px solid var(--line-2); }
.pm-sec-tkr { font-weight: 700; }
.pm-sec-name { color: var(--muted); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pm-sec-sh, .pm-sec-row .mono { text-align: right; }
.pm-sec-val { font-weight: 600; }
`;

// ============================================================ Learning hub (Learning + Lab + Backtest merged)
function LearningHub({ accent, account, initial = "learning" }) {
  const [tab, setTab] = useState(initial);
  const tabs = [["learning", "Learning & reflexion"], ["lab", "Learning Lab"], ["intake", "Vera · intake"], ["backtest", "Backtest"]];
  return (
    <div>
      <style>{`.lh-tabs{display:flex;gap:8px;margin-bottom:14px}.lh-tabs button{font:inherit;font-size:13px;font-weight:600;color:var(--ink-2);background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:7px 16px;cursor:pointer}.lh-tabs button:hover{border-color:var(--muted)}.lh-tabs button.is-active{color:${accent};border-color:${accent}}`}</style>
      <div className="lh-tabs">
        {tabs.map(([k, l]) => <button key={k} className={tab === k ? "is-active" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "learning" && <LearningPage accent={accent} />}
      {tab === "lab" && (window.LearningLab ? <LearningLab accent={accent} /> : null)}
      {tab === "intake" && (window.VeraIntake ? <window.VeraIntake accent={accent} /> : null)}
      {tab === "backtest" && <Backtest accent={accent} account={account} />}
    </div>
  );
}

// ============================================================ App shell
function Dashboard({ accent }) {
  const [active, setActive] = useState("Today");
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState("all");
  const [research, setResearch] = useState(null); // ticker or null
  const [ccy, setCcy] = useState("CAD");
  D.setDispCcy(ccy);
  const view = D.buildView(account);

  const openResearch = (ticker) => {setResearch(ticker);};
  const goNav = (label) => {setResearch(null);setActive(label);};

  useEffect(() => {
    const h = (e) => goNav(e.detail);
    window.addEventListener("helm:nav", h);
    return () => window.removeEventListener("helm:nav", h);
  }, []);

  const [tradeModal, setTradeModal] = useState(null); // prefill detail obj, or null when closed
  useEffect(() => {
    const h = (e) => setTradeModal(e.detail || {});
    window.addEventListener("helm:log-trade", h);
    return () => window.removeEventListener("helm:log-trade", h);
  }, []);

  // ---- Helm V3 shell (Bridge / Book / Lab) — opt-in, classic stays intact ----
  const [v3, setV3] = useState(() => { try { return localStorage.getItem("helm_v3_on") === "1"; } catch (e) { return false; } });
  useEffect(() => {
    const h = () => setV3((v) => { const nv = !v; try { localStorage.setItem("helm_v3_on", nv ? "1" : "0"); } catch (e) {} return nv; });
    window.addEventListener("helm:v3-toggle", h);
    return () => window.removeEventListener("helm:v3-toggle", h);
  }, []);
  if (v3 && window.BridgeShell) {
    return <window.BridgeShell accent={accent} onExit={() => { try { localStorage.setItem("helm_v3_on", "0"); } catch (e) {} setV3(false); }} />;
  }

  let content;
  if (research) {
    content = <ResearchPage ticker={research} accent={accent} onPick={openResearch} onBack={() => setResearch(null)} />;
  } else if (active === "Today") {
    content = window.Cockpit ? <Cockpit accent={accent} onNav={goNav} onPick={openResearch} /> : null;
  } else if (account === "crypto" && active === "Dashboard") {
    content = <CryptoView accent={accent} onPick={openResearch} />;
  } else if (active === "Holdings") {
    content = <HoldingsPage view={view} accountId={account} accent={accent} onPick={openResearch} />;
  } else if (active === "Performance") {
    content = <Rendement accountId={account} accent={accent} />;
  } else if (active === "Plan") {
    content = <PlanPage accent={accent} account={account} />;
  } else if (active === "Projections") {
    content = <Projections accent={accent} account={account} />;
  } else if (active === "Learning Lab") {
    content = <LearningHub accent={accent} account={account} initial="lab" />;
  } else if (active === "Documentation") {
    content =
    <div className="pm-scrollwrap">
        <section className="pm-card">
          <div className="pm-card-eyebrow">Documentation &amp; research provenance</div>
          <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6, maxWidth: 640, margin: "6px 0 18px" }}>Source research and the improvement ledger — which external documents fed the engine and what each one changed. Opens in a new tab.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 560 }}>
            <a className="pm-doclink" href="Helm Rethink - Fable5 Response.html" target="_blank" rel="noopener">
              <span className="pm-doclink-ico" style={{ background: "#2563eb1a", color: "#2563eb" }}>◆</span>
              <span><strong>Rethinking Helm — architect's response</strong><em>14 prioritized moves (risk-relative, carry-gate, vol-sizing) + rebuild sketch</em></span>
              <span className="pm-doclink-arrow">↗</span>
            </a>
            <a className="pm-doclink" href="Helm QA &amp; Regression Checklist.html" target="_blank" rel="noopener">
              <span className="pm-doclink-ico" style={{ background: "#7c3aed1a", color: "#7c3aed" }}>✓</span>
              <span><strong>QA &amp; Regression Checklist</strong><em>Per-tab smoke tests + 8 regime scenario tests — run after any change</em></span>
              <span className="pm-doclink-arrow">↗</span>
            </a>
            <a className="pm-doclink" href="Helm Autonomy Roadmap.html" target="_blank" rel="noopener">
              <span className="pm-doclink-ico" style={{ background: "#0e9f6e1a", color: "#0e9f6e" }}>🧭</span>
              <span><strong>Making Helm Autonomous — roadmap</strong><em>3 research papers → pros/cons + effort for a self-improving engine</em></span>
              <span className="pm-doclink-arrow">↗</span>
            </a>
            <a className="pm-doclink" href="NBC Research Documentation.html" target="_blank" rel="noopener">
              <span className="pm-doclink-ico" style={{ background: "#2563eb1a", color: "#2563eb" }}>📑</span>
              <span><strong>NBC Research → Helm</strong><em>Source docs (NBF / Morningstar June 2026) + improvement ledger + live-coverage check</em></span>
              <span className="pm-doclink-arrow">↗</span>
            </a>
            <a className="pm-doclink" href="Learning Lab Analysis.html" target="_blank" rel="noopener">
              <span className="pm-doclink-ico" style={{ background: "#0e9f6e1a", color: "#0e9f6e" }}>🔬</span>
              <span><strong>Learning Lab — Architect's analysis</strong><em>Walk-forward validator spec: pros/cons, what to incorporate, gate impact</em></span>
              <span className="pm-doclink-arrow">↗</span>
            </a>
            <a className="pm-doclink" href="Model Comparison - TPS-QCIO.html" target="_blank" rel="noopener">
              <span className="pm-doclink-ico" style={{ background: "#d977061a", color: "#b45309" }}>⚖️</span>
              <span><strong>Model comparison — TPS vs QCIO</strong><em>The two prototype engines: pros/cons and what Helm incorporated</em></span>
              <span className="pm-doclink-arrow">↗</span>
            </a>
          </div>
        </section>
      </div>;

  } else if (active === "Backtest") {
    content = <LearningHub accent={accent} account={account} initial="backtest" />;
  } else if (active === "Strategy Lab") {
    content = <StrategyLab accent={accent} account={account} />;
  } else if (active === "Portfolio Simulation") {
    content = window.PaperSim ? <PaperSim accent={accent} account={account} /> : null;
  } else if (active === "Tracker") {
    content = <StrategyTracker accent={accent} />;
  } else if (active === "Learning") {
    content = <LearningHub accent={accent} account={account} initial="learning" />;
  } else if (active === "Macro") {
    content = <MacroModule accent={accent} />;
  } else if (active === "Screener") {
    content = window.Screener ? <Screener accent={accent} /> : null;
  } else if (active === "Watchlist") {
    content = <WatchlistPage accent={accent} onPick={openResearch} />;
  } else if (active === "Research") {
    content = <ResearchPage ticker={view.holdings[0].ticker} accent={accent} onPick={openResearch} onBack={() => goNav("Dashboard")} />;
  } else if (active === "Trade History") {
    content = window.TradeHistoryPage ? <TradeHistoryPage accent={accent} /> : null;
  } else {
    content = <DashboardBody view={view} query={query} accent={accent} onPick={openResearch} />;
  }

  return (
    <>
      <Sidebar active={active} setActive={goNav} accent={accent} kpis={view.kpis} />
      <div className="pm-main">
        <Topbar query={query} setQuery={setQuery} active={active}
        account={account} setAccount={setAccount} accent={accent}
        ccy={ccy} setCcy={setCcy} />
        {window.HelmStatusStrip && <window.HelmStatusStrip accent={accent} onOpenPlan={() => goNav("Plan")} />}
        <div className="pm-scroll">{content}</div>
      </div>
      {tradeModal && window.LogTradeModal && <LogTradeModal prefill={tradeModal} accent={accent} onClose={() => setTradeModal(null)} />}
    </>);

}

window.Dashboard = Dashboard;
Object.assign(window, { DashboardBody, LearningHub, HoldingsTable });