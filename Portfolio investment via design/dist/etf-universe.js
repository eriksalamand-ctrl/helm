// cryptoview.jsx — CoinStats-style crypto account screen
const { useState: useStateC } = React;

const cUP = "#0e9f6e", cDOWN = "#e02424";
const cSc = (n) => (n >= 0 ? cUP : cDOWN);
const cPct = (n, dp = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
const cMoney = (n, dp = 0) => "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const cSigned = (n, dp = 0) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

// coin metadata (underlying asset for each ETF held)
const COIN_META = {
  "SOLQ":   { coin: "Solana",   sym: "SOL", color: "#9945FF", realized: 2840, h24: -1.8 },
  "ETHX.B": { coin: "Ethereum", sym: "ETH", color: "#627EEA", realized: 1390, h24: -0.9 },
  "ETHH.B": { coin: "Ethereum", sym: "ETH", color: "#7B8CF0", realized: 0,    h24: -0.9 },
  "ETHY.B": { coin: "Ether (yield)", sym: "ETHY", color: "#4A5FD0", realized: 0, h24: -0.9 },
  "ETHA":   { coin: "Ethereum (US)", sym: "ETH", color: "#8E9BF5", realized: 0, h24: -0.9 },
  "BTCY.B": { coin: "Bitcoin (yield)", sym: "BTCY", color: "#F7931A", realized: 0, h24: 0.4 },
  "BTCC.B": { coin: "Bitcoin", sym: "BTC", color: "#FFA940", realized: 0, h24: 0.4 },
  "BTCC":   { coin: "Bitcoin (hgd)", sym: "BTC", color: "#E8820E", realized: 0, h24: 0.4 },
  "BMNR":   { coin: "Bitmine", sym: "BMNR", color: "#C2410C", realized: 0, h24: 1.2 },
  "IREN":   { coin: "IREN", sym: "IREN", color: "#0EA5E9", realized: 0, h24: 1.5 },
};

const CRYPTO_TX = [
  { side: "buy",  ticker: "SOLQ",   qty: 636,  px: 8.90,  when: "Nov 2025", realized: 0 },
  { side: "sell", ticker: "SOLQ",   qty: 800,  px: 14.20, when: "Jun 2025", realized: 2840 },
  { side: "buy",  ticker: "ETHX.B", qty: 1000, px: 9.40,  when: "Apr 2025", realized: 0 },
  { side: "buy",  ticker: "SOLQ",   qty: 1200, px: 13.10, when: "Jan 2025", realized: 0 },
  { side: "sell", ticker: "ETHX.B", qty: 500,  px: 13.80, when: "Dec 2024", realized: 1390 },
  { side: "buy",  ticker: "ETHX.B", qty: 2946, px: 11.20, when: "Aug 2024", realized: 0 },
  { side: "buy",  ticker: "SOLQ",   qty: 2500, px: 10.40, when: "Mar 2024", realized: 0 },
];

function CryptoRangeChart({ data, accent }) {
  return <AreaChart data={data} accent={accent} showBenchmark={false} height={300} />;
}

function CryptoView({ accent, onPick }) {
  const [range, setRange] = useStateC("1Y");
  const D = window.PMData;
  const view = D.buildView("crypto");
  // aggregate the same crypto ETF held across multiple accounts into one row
  const _agg = {};
  view.holdings.forEach((h) => {
    const k = _agg[h.ticker] || (_agg[h.ticker] = {
      ticker: h.ticker, name: h.name, sector: h.sector, ccy: h.ccy, price: h.price,
      dayPct: h.dayPct, divYield: h.divYield, spark: h.spark,
      shares: 0, marketValue: 0, costBasis: 0, dispValue: 0,
    });
    k.shares += h.shares; k.marketValue += h.marketValue; k.costBasis += h.costBasis; k.dispValue += h.dispValue;
  });
  const coins = Object.values(_agg).map((h) => {
    h.plAbs = h.marketValue - h.costBasis;
    h.plPct = h.costBasis ? (h.plAbs / h.costBasis) * 100 : 0;
    return h;
  }).sort((a, b) => b.dispValue - a.dispValue);
  const K = view.kpis;

  const realized = coins.reduce((s, h) => s + (COIN_META[h.ticker]?.realized || 0), 0);
  const unrealized = K.totalPlAbs;
  const allTime = unrealized + realized;
  const allTimePct = K.totalCost ? (allTime / K.totalCost) * 100 : 0;
  const h24 = coins.reduce((s, h) => s + (COIN_META[h.ticker]?.h24 || h.dayPct) * h.dispValue, 0) / (K.totalValue || 1);

  const RANGES = [{ k: "1W", d: 7 }, { k: "1M", d: 30 }, { k: "3M", d: 90 }, { k: "1Y", d: 252 }, { k: "ALL", d: 252 }];
  const days = RANGES.find((r) => r.k === range).d;
  const fullSeries = view.portfolio;
  const data = fullSeries.slice(-Math.min(days, fullSeries.length));

  const best = [...coins].sort((a, b) => b.plPct - a.plPct)[0];
  const worst = [...coins].sort((a, b) => a.plPct - b.plPct)[0];

  return (
    <div className="cv">
      {/* header */}
      <div className="cv-hero">
        <div>
          <div className="cv-eyebrow">Crypto · digital assets · {coins.length} positions</div>
          <div className="cv-total">{cMoney(K.totalValue)}</div>
          <div className="cv-hero-sub">
            <span className="cv-pill" style={{ background: cSc(h24) + "1a", color: cSc(h24) }}>{cPct(h24, 2)} 24h</span>
            <span className="cv-allpill" style={{ color: cSc(allTime) }}>{cSigned(allTime)} all-time ({cPct(allTimePct, 1)})</span>
          </div>
        </div>
        <div className="cv-hero-actions">
          <button className="pm-btn-primary">+ Buy crypto</button>
        </div>
      </div>

      {/* analytics cards */}
      <div className="cv-stats">
        <div className="cv-stat">
          <span>Unrealized P/L</span>
          <strong style={{ color: cSc(unrealized) }}>{cSigned(unrealized)}</strong>
          <em style={{ color: cSc(unrealized) }}>{cPct(K.totalPlPct, 1)} on cost</em>
        </div>
        <div className="cv-stat">
          <span>Realized P/L</span>
          <strong style={{ color: cSc(realized) }}>{cSigned(realized)}</strong>
          <em className="cv-mut">booked from sells</em>
        </div>
        <div className="cv-stat">
          <span>All-time profit</span>
          <strong style={{ color: cSc(allTime) }}>{cSigned(allTime)}</strong>
          <em style={{ color: cSc(allTime) }}>{cPct(allTimePct, 1)} return</em>
        </div>
        <div className="cv-stat">
          <span>Total invested</span>
          <strong>{cMoney(K.totalCost)}</strong>
          <em className="cv-mut">cost basis</em>
        </div>
      </div>

      {/* chart */}
      <section className="pm-card">
        <div className="pm-card-head">
          <div>
            <div className="pm-card-eyebrow">Portfolio value</div>
            <div className="cv-chart-val">{cMoney(K.totalValue)}</div>
          </div>
          <div className="pm-range">
            {RANGES.map((r) => (
              <button key={r.k} className={range === r.k ? "is-active" : ""} onClick={() => setRange(r.k)}>{r.k}</button>
            ))}
          </div>
        </div>
        <div className="cv-chart" style={{ color: "var(--ink)" }}>
          <CryptoRangeChart data={data} accent={h24 >= 0 ? accent : cDOWN} />
        </div>
      </section>

      <div className="cv-cols">
        {/* coin list */}
        <section className="pm-card">
          <div className="pm-card-eyebrow">Assets</div>
          <div className="cv-coins">
            {coins.map((h) => {
              const m = COIN_META[h.ticker] || {};
              return (
                <div className="cv-coin" key={h.ticker} onClick={() => onPick(h.ticker)}>
                  <div className="cv-coin-logo" style={{ background: m.color || accent }}>{m.sym || h.ticker.slice(0, 2)}</div>
                  <div className="cv-coin-id">
                    <div className="cv-coin-name">{m.coin || h.name}</div>
                    <div className="cv-coin-sub">{h.ticker} · {h.shares.toLocaleString("en-US")} units</div>
                  </div>
                  <div className="cv-coin-spark"><Sparkline points={h.spark} color={cSc(h.plPct)} width={72} height={28} /></div>
                  <div className="cv-coin-val">
                    <div className="mono cv-coin-mv">{cMoney(h.dispValue)}</div>
                    <div className="mono cv-coin-pl" style={{ color: cSc(h.plPct) }}>{cPct(h.plPct, 1)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* right rail */}
        <div className="cv-rail">
          <section className="pm-card">
            <div className="pm-card-eyebrow">Allocation</div>
            <div className="cv-alloc">
              <Donut data={coins.map((h) => ({ name: h.ticker, pct: (h.dispValue / K.totalValue) * 100 }))}
                     colors={coins.map((h) => COIN_META[h.ticker]?.color || accent)}
                     centerLabel={cMoney(K.totalValue)} centerSub="Crypto value" size={150} thickness={20} />
              <ul className="pm-legend">
                {coins.map((h) => (
                  <li key={h.ticker}>
                    <span className="pm-legend-dot" style={{ background: COIN_META[h.ticker]?.color || accent }} />
                    <span className="pm-legend-name">{(COIN_META[h.ticker]?.coin || h.ticker)} <span className="cv-legend-tkr">{h.ticker}</span></span>
                    <span className="pm-legend-pct mono">{((h.dispValue / K.totalValue) * 100).toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="pm-card">
            <div className="pm-card-eyebrow">Performers</div>
            <div className="cv-perf-row"><span className="cv-perf-tag good">Best</span><strong>{COIN_META[best.ticker]?.coin || best.ticker}</strong><span className="mono" style={{ color: cUP, marginLeft: "auto" }}>{cPct(best.plPct, 1)}</span></div>
            <div className="cv-perf-row"><span className="cv-perf-tag bad">Worst</span><strong>{COIN_META[worst.ticker]?.coin || worst.ticker}</strong><span className="mono" style={{ color: cDOWN, marginLeft: "auto" }}>{cPct(worst.plPct, 1)}</span></div>
          </section>
        </div>
      </div>

      {/* transactions */}
      <section className="pm-card">
        <div className="pm-card-eyebrow">Recent transactions</div>
        <div className="pm-table-wrap">
          <table className="pm-table">
            <thead><tr>
              <th className="ta-left">Type</th><th className="ta-left">Asset</th>
              <th className="ta-right">Units</th><th className="ta-right">Price</th>
              <th className="ta-right">Value</th><th className="ta-right">Realized</th><th className="ta-right">Date</th>
            </tr></thead>
            <tbody>
              {CRYPTO_TX.map((tx, i) => {
                const m = COIN_META[tx.ticker] || {};
                return (
                  <tr key={i}>
                    <td className="ta-left"><span className={`cv-side ${tx.side}`}>{tx.side === "buy" ? "Buy" : "Sell"}</span></td>
                    <td className="ta-left"><span className="cv-tx-asset"><span className="cv-tx-dot" style={{ background: m.color }} />{m.coin || tx.ticker}</span></td>
                    <td className="ta-right mono">{tx.qty.toLocaleString("en-US")}</td>
                    <td className="ta-right mono">{cMoney(tx.px, 2)}</td>
                    <td className="ta-right mono">{cMoney(tx.qty * tx.px)}</td>
                    <td className="ta-right mono" style={{ color: tx.realized ? cUP : "var(--muted)" }}>{tx.realized ? cSigned(tx.realized) : "—"}</td>
                    <td className="ta-right mono cv-mut">{tx.when}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

window.CryptoView = CryptoView;
