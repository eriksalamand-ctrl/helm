// pages.jsx — Holdings full page + Research stock detail
const { useState: useStateP } = React;

const pUP = "#0e9f6e", pDOWN = "#e02424";
const pSc = (n) => (n >= 0 ? pUP : pDOWN);
const pPct = (n, dp = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
const pAbs = (n, ccy) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}${ccy ? " " + ccy : ""}`;
const pMoney = (n, dp = 0) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const acctNameOf = (id) => (window.PMData.accounts.find((a) => a.id === id) || {}).name || id;

// ============================================================ Holdings page
function HoldingsPage({ view, accountId, accent, onPick }) {
  const [sort, setSort] = useStateP({ key: "dispValue", dir: -1 });
  const [q, setQ] = useStateP("");
  const showAcct = accountId === "all";
  const cols = [
    { key: "ticker", label: "Symbol", align: "left" },
    ...(showAcct ? [{ key: "acct", label: "Account", align: "left" }] : []),
    { key: "price", label: "Last", align: "right" },
    { key: "dayPct", label: "Day", align: "right" },
    { key: "spark", label: "30D", align: "center", noSort: true },
    { key: "shares", label: "Qty", align: "right" },
    { key: "avgCost", label: "Avg cost", align: "right" },
    { key: "dispValue", label: "Mkt value", align: "right" },
    { key: "plAbs", label: "Unreal. P/L", align: "right" },
    { key: "annualIncome", label: "Income/yr", align: "right" },
    { key: "weight", label: "Weight", align: "right" },
  ];
  let rows = view.holdings.filter((h) => !q || h.ticker.toLowerCase().includes(q.toLowerCase()) || h.name.toLowerCase().includes(q.toLowerCase()));
  rows = [...rows].sort((a, b) => (a[sort.key] > b[sort.key] ? 1 : -1) * sort.dir);
  const setCol = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: -1 }));

  const K = view.kpis;
  const totalIncome = view.holdings.reduce((s, h) => s + (h.annualIncome || 0), 0);
  const winners = view.holdings.filter((h) => h.plAbs >= 0).length;

  return (
    <div className="hp">
      <div className="hp-summary">
        <div className="hp-sum-item"><span>Positions</span><strong>{view.holdings.length}</strong></div>
        <div className="hp-sum-item"><span>Invested</span><strong>{pMoney(K.totalCost)}</strong></div>
        <div className="hp-sum-item"><span>Market value</span><strong>{pMoney(K.totalValue)}</strong></div>
        <div className="hp-sum-item"><span>Unrealized P/L</span><strong style={{ color: pSc(K.totalPlAbs) }}>{pAbs(K.totalPlAbs)} <em>{pPct(K.totalPlPct, 1)}</em></strong></div>
        <div className="hp-sum-item"><span>Est. income/yr</span><strong>{pMoney(totalIncome)}</strong></div>
        <div className="hp-sum-item"><span>Winners</span><strong>{winners}/{view.holdings.length}</strong></div>
      </div>

      <section className="pm-card">
        <div className="pm-card-head">
          <div className="pm-card-eyebrow">All positions</div>
          <div className="hp-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2" strokeLinecap="round"/></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter positions…" />
          </div>
        </div>
        <div className="pm-table-wrap">
          <table className="pm-table">
            <thead><tr>
              {cols.map((c) => (
                <th key={c.key} className={`ta-${c.align}${c.noSort ? "" : " sortable"}${sort.key === c.key ? " sorted" : ""}`}
                    onClick={c.noSort ? undefined : () => setCol(c.key)}>
                  {c.label}{sort.key === c.key ? (sort.dir < 0 ? " ↓" : " ↑") : ""}
                </th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.ticker + h.acct} className="hp-row" onClick={() => onPick(h.ticker)}>
                  <td className="ta-left">
                    <div className="pm-sym">
                      <div className="pm-sym-badge" style={{ background: accent + "1a", color: accent }}>{h.ticker.slice(0, 2)}</div>
                      <div><div className="pm-sym-tkr">{h.ticker}</div><div className="pm-sym-name">{h.name}</div></div>
                    </div>
                  </td>
                  {showAcct && <td className="ta-left"><span className="hp-acct-tag">{acctNameOf(h.acct)}</span></td>}
                  <td className="ta-right mono">{pMoney(h.price, 2)}</td>
                  <td className="ta-right mono" style={{ color: pSc(h.dayPct) }}>{pPct(h.dayPct)}</td>
                  <td className="ta-center"><div className="pm-spk"><Sparkline points={h.spark} color={pSc(h.plPct)} /></div></td>
                  <td className="ta-right mono">{h.shares.toLocaleString("en-US")}</td>
                  <td className="ta-right mono">{pMoney(h.avgCost, 2)}</td>
                  <td className="ta-right mono">{pMoney(h.dispValue)}</td>
                  <td className="ta-right mono">
                    <div style={{ color: pSc(h.plPct) }}>{pPct(h.plPct)}</div>
                    <div className="pm-cell-sub" style={{ color: pSc(h.plAbs) }}>{pAbs(h.plAbs)}</div>
                  </td>
                  <td className="ta-right mono">{h.annualIncome ? pMoney(h.annualIncome) : "—"}</td>
                  <td className="ta-right mono">
                    <div className="pm-weight"><span>{h.weight.toFixed(1)}%</span>
                      <span className="pm-weight-bar"><i style={{ width: `${Math.min(100, h.weight * 3)}%`, background: accent }} /></span></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ============================================================ Research detail
const RANGES_R = [{ k: "1M", d: 21 }, { k: "3M", d: 63 }, { k: "6M", d: 126 }, { k: "1Y", d: 252 }, { k: "5Y", d: 1260 }];

function newsFor(ticker, name, sec) {
  const pool = {
    Crypto: [["Spot inflows accelerate as institutions add exposure", "2h"], ["Network upgrade roadmap reaffirmed by core team", "1d"], ["Volatility elevated ahead of macro print", "2d"]],
    Semiconductors: [["AI accelerator demand keeps order book full into next year", "3h"], ["Foundry capacity expansion announced", "1d"], ["Analysts lift price target on datacenter strength", "2d"]],
    Energy: [["Production guidance raised on stronger output", "5h"], ["Dividend increase declared for the quarter", "1d"], ["Commodity prices firm on supply tightness", "3d"]],
  };
  const generic = [[`${name} reaffirms full-year outlook`, "4h"], [`Quarterly results beat on margin expansion`, "1d"], [`Coverage initiated with constructive view`, "2d"], [`Sector rotation lifts ${sec} names`, "3d"]];
  return (pool[sec] || generic).slice(0, 4);
}

function ResearchPage({ ticker, accent, onPick, onBack }) {
  const [range, setRange] = useStateP("1Y");
  const D = window.PMData;
  const holds = D.allHoldings.filter((h) => h.ticker === ticker);
  const wl = D.watchlist.find((w) => w.ticker === ticker);
  const base = holds[0] || wl;
  if (!base) return <div className="pm-empty">No data for {ticker}.</div>;

  const name = base.name, sec = base.sector || "—", ccy = base.ccy || "USD";
  const price = base.price, dayPct = base.dayPct;
  const days = RANGES_R.find((r) => r.k === range).d;
  const totalRet = (holds[0] ? holds[0].plPct : 18) / 100;
  const hist = D.priceHistory(base.seed * 7 + 3, days, price, Math.min(2.5, Math.max(-0.6, totalRet)), 0.014);
  const lo = Math.min(...hist), hi = Math.max(...hist);

  // aggregate position across accounts
  const totShares = holds.reduce((s, h) => s + h.shares, 0);
  const totMV = holds.reduce((s, h) => s + h.marketValue, 0);
  const totCost = holds.reduce((s, h) => s + h.costBasis, 0);
  const plAbs = totMV - totCost, plPct = totCost ? (plAbs / totCost) * 100 : 0;
  const avgCost = totShares ? totCost / totShares : 0;
  const held = holds.length > 0;

  const stats = [
    ["Day range", `${pMoney(price * (1 - Math.abs(dayPct) / 100 - 0.004), 2)} – ${pMoney(price * (1 + 0.004), 2)}`],
    [`${range} range`, `${pMoney(lo, 2)} – ${pMoney(hi, 2)}`],
    ["Sector", sec],
    ["Currency", ccy],
    ["Div yield", base.divYield ? base.divYield.toFixed(1) + "%" : "—"],
    ["Beta (est.)", (0.7 + (base.seed % 9) / 10).toFixed(2)],
  ];
  const news = newsFor(ticker, name, sec);

  return (
    <div className="rp">
      <button className="rp-back" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        Back
      </button>

      <div className="rp-grid">
        <section className="pm-card rp-main">
          <div className="rp-head">
            <div className="pm-sym">
              <div className="pm-sym-badge lg" style={{ background: accent + "1a", color: accent }}>{ticker.slice(0, 2)}</div>
              <div>
                <div className="rp-tkr">{ticker} <span className="rp-ccy">{ccy}</span></div>
                <div className="rp-name">{name}</div>
              </div>
            </div>
            <div className="rp-px">
              <div className="rp-px-val">{pMoney(price, 2)}</div>
              <div className="rp-px-ch" style={{ color: pSc(dayPct) }}>{pPct(dayPct)} today</div>
            </div>
          </div>
          <div className="rp-range">
            {RANGES_R.map((r) => (
              <button key={r.k} className={range === r.k ? "is-active" : ""} onClick={() => setRange(r.k)}>{r.k}</button>
            ))}
          </div>
          <div className="rp-chart"><AreaChart data={hist} accent={dayPct >= 0 ? accent : pDOWN} showBenchmark={false} height={300} /></div>
          <div className="rp-stats">
            {stats.map(([k, v]) => (<div className="rp-stat" key={k}><span>{k}</span><strong>{v}</strong></div>))}
          </div>
        </section>

        <div className="rp-rail">
          <section className="pm-card">
            <div className="pm-card-eyebrow">Your position</div>
            {held ? (
              <div className="rp-pos">
                <div className="rp-pos-big" style={{ color: pSc(plAbs) }}>{pAbs(plAbs, ccy)}</div>
                <div className="rp-pos-sub" style={{ color: pSc(plPct) }}>{pPct(plPct)} unrealized</div>
                <div className="rp-pos-grid">
                  <div><span>Shares</span><strong>{totShares.toLocaleString("en-US")}</strong></div>
                  <div><span>Avg cost</span><strong>{pMoney(avgCost, 2)}</strong></div>
                  <div><span>Market value</span><strong>{pMoney(totMV)}</strong></div>
                  <div><span>Cost basis</span><strong>{pMoney(totCost)}</strong></div>
                </div>
                {holds.length > 1 && (
                  <div className="rp-pos-accts">
                    {holds.map((h) => (<div key={h.acct}><span>{acctNameOf(h.acct)}</span><strong>{h.shares} sh</strong></div>))}
                  </div>
                )}
                <div className="rp-pos-actions">
                  <button className="pm-btn-primary" style={{ flex: 1 }}>Buy</button>
                  <button className="rp-sell" style={{ flex: 1 }}>Sell</button>
                </div>
              </div>
            ) : (
              <div className="rp-nopos">
                <p>Not held. On your watchlist.</p>
                <button className="pm-btn-primary">+ Add trade</button>
              </div>
            )}
          </section>

          <section className="pm-card">
            <div className="pm-card-eyebrow">News</div>
            <div className="rp-news">
              {news.map(([h, t], i) => (
                <a className="rp-news-item" key={i}>
                  <div className="rp-news-h">{h}</div>
                  <div className="rp-news-t">{sec} · {t} ago</div>
                </a>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HoldingsPage, ResearchPage });
