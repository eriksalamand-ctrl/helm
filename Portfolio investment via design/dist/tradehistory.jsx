// tradehistory.jsx — audit trail of every real trade logged via LogTradeModal.
function TradeHistoryPage({ accent }) {
  const RT = window.HelmRealTrades;
  const [, force] = React.useState(0);
  const log = RT ? RT.getLog() : [];

  function undo(id) {
    if (!window.confirm("Undo this logged trade? This reverses its effect on your real holdings.")) return;
    RT.undo(id);
    force((x) => x + 1);
  }

  const fmt = (n, ccy) => (ccy === "USD" ? "US$" : "$") + Math.round(n || 0).toLocaleString("en-US");

  return (
    <div className="th-wrap">
      <style>{TH_CSS}</style>
      <section className="pm-card">
        <div className="pm-card-head">
          <div>
            <div className="pm-card-eyebrow">Trade history · real accounts</div>
            <div className="th-sub">Every buy/sell you've logged against your real portfolio — this is Helm's memory of what you told it you did at your broker, not a brokerage record. Nothing here was actually executed by Helm.</div>
          </div>
          <span className="pm-count">{log.length} logged</span>
        </div>
        {log.length === 0 ? (
          <div className="pm-empty">Nothing logged yet. Use “+ Trade” in the top bar, or the “Log buy / sell” action on any recommendation, to record a real trade.</div>
        ) : (
          <div className="pm-table-wrap">
            <table className="pm-table">
              <thead><tr>
                <th className="ta-left">Date</th><th className="ta-left">Side</th><th className="ta-left">Ticker</th>
                <th className="ta-right">Shares</th><th className="ta-right">Price</th><th className="ta-right">Amount</th>
                <th className="ta-left">Account</th><th className="ta-left">Source</th><th className="ta-center">&nbsp;</th>
              </tr></thead>
              <tbody>
                {log.map((t) => (
                  <tr key={t.id}>
                    <td className="ta-left mono">{t.date}</td>
                    <td className="ta-left">
                      <span className={"th-side " + t.side}>{t.side === "buy" ? "Buy" : (t.full ? "Sold all" : "Trim")}</span>
                      {t.tag === "dca" ? <span className="th-tag">DCA</span> : null}
                    </td>
                    <td className="ta-left"><strong>{t.ticker}</strong> <span className="th-name">{t.name}</span></td>
                    <td className="ta-right mono">{(t.shares || 0).toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                    <td className="ta-right mono">{fmt(t.price, t.ccy)}</td>
                    <td className="ta-right mono">{fmt(t.amount, t.ccy)}</td>
                    <td className="ta-left">{t.acctName || t.acct}</td>
                    <td className="ta-left th-src">{t.source || "Manual"}</td>
                    <td className="ta-center"><button className="th-undo" onClick={() => undo(t.id)} title="Undo — reverses this trade's effect on your holdings">Undo</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const TH_CSS = `
.th-wrap { display: flex; flex-direction: column; gap: 16px; }
.th-sub { font-size: 12.5px; color: var(--muted); margin-top: 3px; max-width: 640px; line-height: 1.5; }
.th-side { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: .02em; }
.th-side.buy { color: #0a7d57; background: #0e9f6e1a; }
.th-side.sell { color: #b42318; background: #e024241a; }
.th-tag { font-size: 9.5px; font-weight: 700; color: #7c3aed; background: #7c3aed1a; padding: 1px 6px; border-radius: 5px; margin-left: 6px; }
.th-name { font-size: 11.5px; color: var(--muted); }
.th-src { font-size: 12px; color: var(--muted); }
.th-undo { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 6px; border: 1px solid var(--line); background: #fff; color: var(--muted); cursor: pointer; }
.th-undo:hover { color: #e02424; border-color: #e02424; }
`;

window.TradeHistoryPage = TradeHistoryPage;
