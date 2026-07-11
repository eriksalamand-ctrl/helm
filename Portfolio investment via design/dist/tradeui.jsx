// tradeui.jsx — shared "Log a real trade" modal + trigger button.
// Any page dispatches window.dispatchEvent(new CustomEvent("helm:log-trade", { detail:{...} }))
// (see TradeButton below) and the single modal instance mounted in app.jsx's Dashboard opens.
// Writes go through window.HelmRealTrades (realtrades.js) which patches the REAL portfolio.

function fmtCcyLT(n, ccy) {
  const sym = ccy === "USD" ? "US$" : "$";
  return sym + Math.round(n || 0).toLocaleString("en-US");
}

function LogTradeModal({ prefill, accent, onClose }) {
  const RT = window.HelmRealTrades;
  const D = window.PMData;
  const p = prefill || {};
  const [ticker, setTicker] = React.useState(p.ticker || "");
  const [side, setSide] = React.useState(p.side || "buy");
  const [acct, setAcct] = React.useState(p.acctHint || "");
  const [amount, setAmount] = React.useState(p.suggestedAmount ? String(Math.round(p.suggestedAmount)) : "");
  const [priceStr, setPriceStr] = React.useState("");
  const [priceTouched, setPriceTouched] = React.useState(false);
  const [dca, setDca] = React.useState(p.tag === "dca");
  const [done, setDone] = React.useState(null);

  const tk = (ticker || "").trim().toUpperCase();
  const menu = RT.tickerMenu();
  const known = tk ? menu.find((m) => m.ticker === tk) : null;
  const elig = React.useMemo(() => (tk ? RT.eligibleAccounts(tk) : (D.accounts || []).map((a) => a.id)), [tk]);

  React.useEffect(() => {
    if (tk && !priceTouched) {
      const px = RT.priceFor(tk);
      if (px) setPriceStr(String(px));
    }
  }, [tk]);

  React.useEffect(() => {
    if (!acct || !elig.includes(acct)) {
      const heldElig = elig.find((id) => RT.holdingsFor(tk, id));
      setAcct(heldElig || elig[0] || "");
    }
  }, [tk, elig.join(",")]);

  const acctObj = (D.accounts || []).find((a) => a.id === acct);
  const heldHere = tk && acct ? RT.holdingsFor(tk, acct) : null;

  React.useEffect(() => {
    if (p.fullSell && heldHere) setAmount(String(Math.round(heldHere.marketValue)));
    // eslint-disable-next-line
  }, [acct, tk, !!heldHere]);

  const priceNum = parseFloat(priceStr) || 0;
  const amountNum = parseFloat(amount) || 0;
  const shares = priceNum > 0 ? amountNum / priceNum : 0;
  const availCash = acctObj ? acctObj.cash || 0 : 0;
  const maxSellShares = heldHere ? heldHere.shares : 0;

  const overCash = side === "buy" && amountNum > availCash + 0.01;
  const overShares = side === "sell" && shares > maxSellShares * 1.0001;
  const canSubmit = !!tk && !!acct && priceNum > 0 && amountNum > 0 && !overCash && !overShares;

  function submit() {
    if (!canSubmit) return;
    const nm = (known && known.name) || (heldHere && heldHere.name) || tk;
    const sec = (known && known.sector) || (heldHere && heldHere.sector) || "—";
    const ccy = (known && known.ccy) || (heldHere && heldHere.ccy) || (acctObj && acctObj.ccy) || "USD";
    const sellShares = side === "sell" ? Math.min(shares, maxSellShares) : shares;
    RT.log({
      side, ticker: tk, name: nm, sector: sec, ccy,
      acct, acctName: acctObj ? acctObj.name : acct,
      shares: sellShares, price: priceNum,
      amount: side === "sell" ? sellShares * priceNum : amountNum,
      tag: dca ? "dca" : p.tag || null,
      source: p.source || "Manual",
      full: side === "sell" && heldHere ? Math.abs(sellShares - heldHere.shares) < 1e-6 : false,
    });
    setDone({ side, tk, acctName: acctObj ? acctObj.name : "" });
    setTimeout(onClose, 800);
  }

  return (
    <div className="lt-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{LT_CSS}</style>
      <div className="lt-card">
        {done ? (
          <div className="lt-done">
            <div className="lt-done-ico" style={{ background: accent }}>✓</div>
            <div className="lt-done-txt">{done.side === "buy" ? "Buy" : "Sell"} logged</div>
            <div className="lt-done-sub">{done.tk} · {done.acctName}</div>
          </div>
        ) : (
          <React.Fragment>
            <div className="lt-head">
              <div>
                <div className="lt-eyebrow">Log a real trade</div>
                <div className="lt-sub">Records what you did at your broker — Helm has no brokerage connection and can't place orders.</div>
              </div>
              <button className="lt-x" onClick={onClose}>×</button>
            </div>

            <div className="lt-side-toggle">
              <button style={side === "buy" ? { background: "#0e9f6e", color: "#fff", borderColor: "#0e9f6e" } : {}} onClick={() => setSide("buy")}>Buy</button>
              <button style={side === "sell" ? { background: "#e02424", color: "#fff", borderColor: "#e02424" } : {}} onClick={() => setSide("sell")}>Sell / Trim</button>
            </div>

            <label className="lt-field">
              <span>Ticker</span>
              <input list="lt-ticker-menu" value={ticker} placeholder="e.g. NVDA, BTCY.B, XRP" autoFocus autoComplete="off"
                     onChange={(e) => setTicker(e.target.value.toUpperCase())} />
              <datalist id="lt-ticker-menu">
                {menu.map((m) => <option key={m.ticker} value={m.ticker}>{m.name}</option>)}
              </datalist>
            </label>

            <label className="lt-field">
              <span>Account</span>
              <select value={acct} onChange={(e) => setAcct(e.target.value)}>
                {elig.length === 0 && <option value="">—</option>}
                {elig.map((id) => {
                  const a = (D.accounts || []).find((x) => x.id === id);
                  if (!a) return null;
                  return <option key={id} value={id}>{a.name} · {fmtCcyLT(a.cash, a.ccy)} cash</option>;
                })}
              </select>
            </label>

            <div className="lt-row2">
              <label className="lt-field">
                <span>Price / unit</span>
                <input value={priceStr} inputMode="decimal" placeholder="0.00"
                       onChange={(e) => { setPriceTouched(true); setPriceStr(e.target.value); }} />
              </label>
              <label className="lt-field">
                <span>{side === "buy" ? "Amount to spend" : "Amount to sell"}</span>
                <input value={amount} inputMode="decimal" placeholder="0"
                       onChange={(e) => setAmount(e.target.value)} />
              </label>
            </div>

            {side === "buy" && (
              <label className="lt-dca">
                <input type="checkbox" checked={dca} onChange={(e) => setDca(e.target.checked)} />
                Part of a DCA plan (tags it in the trade log)
              </label>
            )}

            <div className="lt-preview">
              <span>≈ <strong>{shares ? shares.toLocaleString("en-US", { maximumFractionDigits: shares < 10 ? 4 : 2 }) : "0"}</strong> shares/units</span>
              {side === "buy"
                ? <span className={overCash ? "lt-warn" : ""}>Cash after: <strong>{fmtCcyLT(availCash - amountNum, acctObj ? acctObj.ccy : "USD")}</strong></span>
                : <span className={overShares ? "lt-warn" : ""}>Available: <strong>{maxSellShares.toLocaleString("en-US", { maximumFractionDigits: 4 })}</strong></span>}
            </div>
            {overCash && <div className="lt-err">More than this account's available cash ({fmtCcyLT(availCash, acctObj ? acctObj.ccy : "USD")}).</div>}
            {overShares && <div className="lt-err">More than you hold here ({maxSellShares.toLocaleString("en-US", { maximumFractionDigits: 4 })}).</div>}

            <div className="lt-actions">
              <button className="lt-btn ghost" onClick={onClose}>Cancel</button>
              <button className="lt-btn" disabled={!canSubmit} style={{ background: canSubmit ? accent : undefined, opacity: canSubmit ? 1 : 0.5 }} onClick={submit}>
                Confirm {side === "buy" ? "buy" : "sell"}
              </button>
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

// Trigger used across pages — just dispatches the shared open-modal event (no prop drilling).
function TradeButton({ label, ticker, side, amount, acctHint, source, tag, fullSell, small, style }) {
  return (
    <button className={"lt-trigger" + (small ? " sm" : "")} style={style} onClick={(e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent("helm:log-trade", {
        detail: { ticker, side, suggestedAmount: amount, acctHint, source, tag, fullSell },
      }));
    }}>
      {label || (side === "sell" ? "Sell" : "Buy")}
    </button>
  );
}

const LT_CSS = `
.lt-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 900; }
.lt-card { width: 420px; max-width: calc(100vw - 32px); background: #fff; border-radius: 16px; padding: 20px 22px 18px; box-shadow: 0 24px 64px rgba(0,0,0,0.28); max-height: calc(100vh - 48px); overflow-y: auto; }
.lt-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
.lt-eyebrow { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
.lt-sub { font-size: 12px; color: var(--muted); margin-top: 3px; max-width: 300px; line-height: 1.4; }
.lt-x { border: 0; background: none; font-size: 20px; line-height: 1; color: var(--muted); cursor: pointer; padding: 2px 6px; }
.lt-x:hover { color: var(--ink); }
.lt-side-toggle { display: flex; gap: 8px; margin-bottom: 14px; }
.lt-side-toggle button { flex: 1; padding: 9px; border-radius: 9px; border: 1px solid var(--line); background: var(--panel-2); font: inherit; font-weight: 700; font-size: 13px; cursor: pointer; color: var(--ink-2); }
.lt-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; font-size: 12px; font-weight: 600; color: var(--ink-2); }
.lt-field input, .lt-field select { font: inherit; font-size: 14px; font-weight: 500; padding: 9px 10px; border-radius: 9px; border: 1px solid var(--line); color: var(--ink); background: #fff; }
.lt-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.lt-dca { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ink-2); margin: -2px 0 14px; }
.lt-preview { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--ink-2); background: var(--panel-2); border-radius: 9px; padding: 9px 12px; margin-bottom: 6px; }
.lt-preview strong { color: var(--ink); font-family: var(--mono); }
.lt-warn { color: #d97706; }
.lt-err { font-size: 12px; color: #e02424; margin: 6px 2px 0; }
.lt-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.lt-btn { padding: 10px 18px; border-radius: 9px; border: 0; background: var(--accent, #0e9f6e); color: #fff; font: inherit; font-weight: 700; font-size: 13px; cursor: pointer; }
.lt-btn.ghost { background: var(--panel-2); color: var(--ink-2); border: 1px solid var(--line); }
.lt-btn:disabled { cursor: not-allowed; }
.lt-done { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 26px 10px 14px; text-align: center; }
.lt-done-ico { width: 44px; height: 44px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 22px; }
.lt-done-txt { font-size: 16px; font-weight: 700; }
.lt-done-sub { font-size: 12.5px; color: var(--muted); }
.lt-trigger { font: inherit; font-size: 11.5px; font-weight: 700; padding: 4px 11px; border-radius: 7px; border: 1px solid var(--line); background: #fff; color: var(--ink-2); cursor: pointer; white-space: nowrap; }
.lt-trigger:hover { background: var(--panel-2); border-color: var(--muted); }
.lt-trigger.sm { padding: 3px 9px; font-size: 11px; }
`;

window.LogTradeModal = LogTradeModal;
window.TradeButton = TradeButton;
