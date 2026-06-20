// app.jsx — Portfolio Manager dashboard
const { useState, useEffect, useRef } = React;

const D = window.PMData;

// ---- formatting helpers ----
const fmtPct = (n, dp = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
const fmtAbs = (n) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const UP = "#0e9f6e", DOWN = "#e02424";
const sc = (n) => (n >= 0 ? UP : DOWN);

const RANGES = [
  { k: "1W", d: 5 }, { k: "1M", d: 21 }, { k: "3M", d: 63 },
  { k: "6M", d: 126 }, { k: "1Y", d: 252 }, { k: "ALL", d: 252 },
];

// ============================================================ Sidebar
const NAV = [
  ["Dashboard", "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z"],
  ["Holdings", "M4 4h16v4H4V4Zm0 6h16v4H4v-4Zm0 6h16v4H4v-4Z"],
  ["Performance", "M3 3v18h18v-2H5V3H3Zm5 12 3-4 3 3 5-6 1.5 1.2-6.5 7.8-3-3-2.5 3.3L8 15Z"],
  ["Projections", "M3 3h2v16h16v2H3V3Zm15.3 3.3 1.4 1.4L14 16.4l-3-3-4.3 4.3-1.4-1.4L11 10.6l3 3 4.3-4.3Z"],
  ["Backtest", "M9 2h6v2h-1v4.2l4.6 8A2 2 0 0 1 16.8 19H7.2a2 2 0 0 1-1.8-2.8L10 8.2V4H9V2Zm3 8-2.6 5h5.2L12 10Z"],
  ["Strategy Lab", "M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2Zm1 1.05V11h7.95A8.01 8.01 0 0 0 13 3.05ZM7 13l3 3 4-5 3 4"],
  ["Watchlist", "M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5C21.3 7.6 17 4.5 12 4.5Zm0 12a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Zm0-2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"],
  ["Screener", "M3 5h18v2H3V5Zm3 6h12v2H6v-2Zm3 6h6v2H9v-2Z"],
  ["Research", "M9.5 3a6.5 6.5 0 1 0 4.2 11.5l5.4 5.4 1.4-1.4-5.4-5.4A6.5 6.5 0 0 0 9.5 3Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z"],
];

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
        {NAV.map(([label, d]) => (
          <button key={label} className={`pm-nav-item${active === label ? " is-active" : ""}`}
                  onClick={() => setActive(label)}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d={d} /></svg>
            <span>{label}</span>
          </button>
        ))}
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
            <div style={{ width: `${Math.max(0, Math.min(100, (kpis.ytdReturnPct / kpis.targetPct) * 100))}%`, background: accent }} />
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
    </aside>
  );
}

// ============================================================ Account selector
function AccountSelector({ account, setAccount, accent }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const items = [
    { id: "all", name: "All accounts", label: `Aggregate · ${D.accounts.length} accounts`, currency: "" },
    ...D.accounts,
    { id: "crypto", name: "Crypto", label: "Crypto ETFs · in REER", currency: "" },
  ];
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
      {open && (
        <div className="pm-acct-menu">
          <div className="pm-acct-menu-label">Portfolios & sub-accounts</div>
          {items.map((a) => (
            <button key={a.id} className={`pm-acct-opt${a.id === account ? " is-active" : ""}`}
                    onClick={() => { setAccount(a.id); setOpen(false); }}>
              <span className="pm-acct-ico sm" style={{ background: accent + "1a", color: accent }}>
                {a.id === "all" ? "ALL" : a.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="pm-acct-text">
                <span className="pm-acct-name">{a.name}</span>
                <span className="pm-acct-label">{a.label}</span>
              </span>
              {a.id === account && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================ Topbar
function Topbar({ query, setQuery, active, account, setAccount, accent, ccy, setCcy }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const t = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <header className="pm-top">
      <div className="pm-top-l">
        <AccountSelector account={account} setAccount={setAccount} accent={accent} />
        <div className="pm-mkt">
          <span className="pm-mkt-dot" /> Markets open
          <span className="pm-mkt-time">{t} ET</span>
        </div>
        {(() => {
          const s = (window.HelmFeed && window.HelmFeed.status) || { live: false, source: "mock" };
          return (
            <span className={`pm-feed${s.live ? " is-live" : ""}`} title={s.asOf ? "as of " + s.asOf : "running on built-in demo data"}>
              <span className="pm-feed-dot" />{s.live ? "Live feed" : "Demo data"}
            </span>
          );
        })()}
      </div>
      <div className="pm-top-r">
        <div className="pm-ccy-toggle">
          {["CAD", "USD"].map((c) => (
            <button key={c} className={ccy === c ? "is-active" : ""} onClick={() => setCcy(c)}>{c}</button>
          ))}
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
        <button className="pm-btn-primary">+ Trade</button>
      </div>
    </header>
  );
}

// ============================================================ KPI cards
function StatCard({ label, value, deltaSub, deltaColor }) {
  return (
    <div className="pm-stat">
      <div className="pm-stat-label">{label}</div>
      <div className="pm-stat-value">{value}</div>
      <div className="pm-stat-foot">
        <span className="pm-stat-delta" style={{ color: deltaColor }}>{deltaSub}</span>
      </div>
    </div>
  );
}

// ============================================================ Performance card (full-width)
const BENCHES = [
  { key: "sp500", name: "S&P 500" },
  { key: "ndx", name: "Nasdaq 100" },
];
function PerfCard({ view, accent }) {
  const [range, setRange] = useState("1Y");
  const [benchKey, setBenchKey] = useState("sp500"); // "off" | "sp500" | "ndx"
  const days = RANGES.find((r) => r.k === range).d;
  const data = view.portfolio.slice(-days);
  const benchOn = benchKey !== "off";
  const benchSrc = benchKey === "ndx" ? D.nasdaq : D.sp500;
  const benchData = benchSrc.slice(-days);
  const benchName = (BENCHES.find((b) => b.key === benchKey) || {}).name;
  const ret = (data[data.length - 1] / data[0] - 1) * 100;
  const benchRet = (benchData[benchData.length - 1] / benchData[0] - 1) * 100;
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
            {benchOn && (
              <span className="pm-vs" style={{ color: ret >= benchRet ? UP : DOWN }}>
                {ret >= benchRet ? "▲" : "▼"} {Math.abs(ret - benchRet).toFixed(1)}% vs {benchName}
              </span>
            )}
          </div>
        </div>
        <div className="pm-perf-ctrl">
          <div className="pm-baseline">
            <span className="pm-baseline-label">Baseline</span>
            <div className="pm-range">
              <button className={benchKey === "off" ? "is-active" : ""} onClick={() => setBenchKey("off")}>Off</button>
              {BENCHES.map((b) => (
                <button key={b.key} className={benchKey === b.key ? "is-active" : ""}
                        onClick={() => setBenchKey(b.key)}>{b.name}</button>
              ))}
            </div>
          </div>
          <div className="pm-range">
            {RANGES.map((r) => (
              <button key={r.k} className={range === r.k ? "is-active" : ""}
                      onClick={() => setRange(r.k)}>{r.k}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="pm-chart-area">
        <AreaChart data={data} benchmark={benchData} accent={accent} showBenchmark={benchOn} height={300} />
      </div>
    </section>
  );
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
    { key: "weight", label: "Weight", align: "right" },
  ];
  const q = query.trim().toLowerCase();
  let rows = view.holdings.filter((h) => !q || h.ticker.toLowerCase().includes(q) || h.name.toLowerCase().includes(q));
  rows = [...rows].sort((a, b) => (a[sort.key] > b[sort.key] ? 1 : -1) * sort.dir);

  function setCol(key) {
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: -1 }));
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
              {cols.map((c) => (
                <th key={c.key} className={`ta-${c.align}${c.noSort ? "" : " sortable"}${sort.key === c.key ? " sorted" : ""}`}
                    onClick={c.noSort ? undefined : () => setCol(c.key)}>
                  {c.label}{sort.key === c.key ? (sort.dir < 0 ? " ↓" : " ↑") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.ticker} className="hp-row" onClick={() => onPick && onPick(h.ticker)}>
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
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="8" className="pm-empty">No positions match “{query}”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
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
    </section>
  );
}

function AllocCard({ view }) {
  return (
    <section className="pm-card">
      <div className="pm-card-eyebrow">Allocation</div>
      <div className="pm-alloc">
        <Donut data={view.allocation} colors={D.DONUT_COLORS}
               centerLabel={fmtUSD(view.kpis.equity)} centerSub="Net liquidity" />
        <ul className="pm-legend">
          {view.allocation.map((a, i) => (
            <li key={a.name}>
              <span className="pm-legend-dot" style={{ background: D.DONUT_COLORS[i % D.DONUT_COLORS.length] }} />
              <span className="pm-legend-name">{a.name}</span>
              <span className="pm-legend-pct mono">{a.pct.toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function MoversCard() {
  const top = D.movers.slice(0, 3);
  const bottom = D.movers.slice(-3).reverse();
  const Row = (m) => (
    <div className="pm-mover" key={m.ticker}>
      <span className="pm-mover-tkr">{m.ticker}</span>
      <span className="pm-mover-name">{m.name}</span>
      <span className="pm-mover-pct mono" style={{ color: sc(m.dayPct) }}>{fmtPct(m.dayPct, 1)}</span>
    </div>
  );
  return (
    <section className="pm-card">
      <div className="pm-card-eyebrow">Today's movers</div>
      <div className="pm-mover-grp-label">Gainers</div>
      {top.map(Row)}
      <div className="pm-mover-grp-label" style={{ marginTop: 10 }}>Laggards</div>
      {bottom.map(Row)}
    </section>
  );
}

function WatchlistCard({ accent }) {
  return (
    <section className="pm-card">
      <div className="pm-card-head">
        <div className="pm-card-eyebrow">Watchlist</div>
        <button className="pm-link" style={{ color: accent }}>Edit</button>
      </div>
      <div className="pm-watch">
        {D.watchlist.map((w) => (
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
        ))}
      </div>
    </section>
  );
}

// ============================================================ Dashboard body
function DashboardBody({ view, query, accent, onPick }) {
  const K = view.kpis;
  return (
    <>
      <div className="pm-kpis">
        <StatCard label="Net liquidity" value={fmtUSD(K.equity)}
                  deltaSub={`${fmtPct(K.dayChangePct)} today`} deltaColor={sc(K.dayChangeAbs)} />
        <StatCard label="Day's change" value={fmtAbs(K.dayChangeAbs)}
                  deltaSub={`${fmtPct(K.dayChangePct)} · open positions`} deltaColor={sc(K.dayChangeAbs)} />
        <StatCard label="Unrealized P/L" value={fmtAbs(K.totalPlAbs)}
                  deltaSub={`${fmtPct(K.totalPlPct)} on cost`} deltaColor={sc(K.totalPlAbs)} />
        <StatCard label="Buying power" value={fmtUSD(K.cash)}
                  deltaSub="cash + margin available" deltaColor="var(--muted)" />
      </div>

      <PerfCard view={view} accent={accent} />

      <div className="pm-cols">
        <div className="pm-col-main">
          <HoldingsTable view={view} query={query} accent={accent} onPick={onPick} />
        </div>
        <div className="pm-col-rail">
          <TargetCard kpis={K} accent={accent} />
          <AllocCard view={view} />
          <WatchlistCard accent={accent} />
          <MoversCard />
        </div>
      </div>
    </>
  );
}

// ============================================================ App shell
function Dashboard({ accent }) {
  const [active, setActive] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState("all");
  const [research, setResearch] = useState(null); // ticker or null
  const [ccy, setCcy] = useState("CAD");
  D.setDispCcy(ccy);
  const view = D.buildView(account);

  const openResearch = (ticker) => { setResearch(ticker); };
  const goNav = (label) => { setResearch(null); setActive(label); };

  let content;
  if (research) {
    content = <ResearchPage ticker={research} accent={accent} onPick={openResearch} onBack={() => setResearch(null)} />;
  } else if (account === "crypto" && active === "Dashboard") {
    content = <CryptoView accent={accent} onPick={openResearch} />;
  } else if (active === "Holdings") {
    content = <HoldingsPage view={view} accountId={account} accent={accent} onPick={openResearch} />;
  } else if (active === "Performance") {
    content = <Rendement accountId={account} accent={accent} />;
  } else if (active === "Projections") {
    content = <Projections accent={accent} account={account} />;
  } else if (active === "Backtest") {
    content = <Backtest accent={accent} account={account} />;
  } else if (active === "Strategy Lab") {
    content = <StrategyLab accent={accent} account={account} />;
  } else if (active === "Research") {
    content = <ResearchPage ticker={view.holdings[0].ticker} accent={accent} onPick={openResearch} onBack={() => goNav("Dashboard")} />;
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
        <div className="pm-scroll">{content}</div>
      </div>
    </>
  );
}

window.Dashboard = Dashboard;
