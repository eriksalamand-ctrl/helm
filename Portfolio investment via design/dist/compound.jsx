// compound.jsx — the "Compounding Machine" (GMI pattern, reference/vision/gmi-compounding-machine):
// a long-horizon discipline tool for one compounding asset (default BTC). Fits a log-trend
// channel (HelmSigma.logTrend), then simulates the mechanical rules over history:
//   BUY a fixed $ when the price is ≥ buyσ below trend (once per zone entry, weekly checks)
//   CHIP (sell a fixed %) when ≥ chipσ above trend — "lifestyle chips"
// with honest accounting + counterfactuals. Simulation on the SAME series the app shows;
// demo series flagged. Settings persist. No orders — pair with "Log trade" when acting.
const { useState: useCmState, useMemo: useCmMemo } = React;

function CompoundingMachine({ accent }) {
  const UP = "#0e9f6e", DN = "#e02424", WARN = "#d97706";
  const money = (n) => "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
  const KEY = "helm_compound_v1";
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } })();
  const [ticker, setTicker] = useCmState(saved.ticker || "BTC");
  const [buyAmt, setBuyAmt] = useCmState(saved.buyAmt || 2000);
  const [buySig, setBuySig] = useCmState(saved.buySig != null ? saved.buySig : 1);   // buy at ≤ −buySig
  const [chipSig, setChipSig] = useCmState(saved.chipSig != null ? saved.chipSig : 1); // chip at ≥ +chipSig
  const [chipPct, setChipPct] = useCmState(saved.chipPct != null ? saved.chipPct : 20);
  const [vsKey, setVsKey] = useCmState(saved.vsKey || "own");
  const save = (patch) => { try { localStorage.setItem(KEY, JSON.stringify({ ticker, buyAmt, buySig, chipSig, chipPct, vsKey, ...patch })); } catch (e) {} };

  const D = window.PMData;
  const options = useCmMemo(() => {
    const seen = {}; const out = [];
    (D.allHoldings || []).forEach((h) => { if (!seen[h.ticker]) { seen[h.ticker] = 1; out.push(h.ticker); } });
    (window.HelmUniverse || []).forEach((u) => { if (!seen[u.ticker]) { seen[u.ticker] = 1; out.push(u.ticker); } });
    return out.sort();
  }, []);

  const lt = useCmMemo(() => window.HelmSigma ? window.HelmSigma.logTrend(ticker, 1260, vsKey === "own" ? null : vsKey) : null, [ticker, vsKey]);
  const rel = !!(lt && lt.vsName); // ratio-channel mode actually active

  const sim = useCmMemo(() => {
    if (!lt) return null;
    const { zPath, n } = lt;
    const px = lt.px || lt.arr; // asset price for $ accounting (arr = ratio in rel mode)
    let units = 0, invested = 0, chipCash = 0, unitsNoChip = 0;
    const buys = [], chips = [];
    let inBuy = false, inChip = false;
    for (let i = 0; i < n; i += 5) { // weekly checks, as the reference does
      const z = zPath[i], p = px[i];
      if (z <= -buySig) {
        if (!inBuy) { const u = buyAmt / p; units += u; unitsNoChip += u; invested += buyAmt; buys.push({ i, px: p, z }); inBuy = true; }
      } else inBuy = false;
      if (z >= chipSig) {
        if (!inChip && units > 0) { const sold = units * (chipPct / 100); chipCash += sold * p; units -= sold; chips.push({ i, px: p, z, $: sold * p }); inChip = true; }
      } else inChip = false;
    }
    const pxNow = px[n - 1];
    const valueNow = units * pxNow;
    return { buys, chips, invested, chipCash, valueNow, pxNow,
      outOfPocket: invested - chipCash,
      totalNow: valueNow + chipCash,
      noChipValue: unitsNoChip * pxNow,
      pl: valueNow + chipCash - invested };
  }, [lt, buyAmt, buySig, chipSig, chipPct]);

  // ---- channel chart: log series + trend ± σ lines (straight in log space) + date axis ----
  const chart = useCmMemo(() => {
    if (!lt) return null;
    const { arr, slope, intercept, sd, n } = lt;
    const W = 720, H = 228, P = 6, PB = 22;
    const ln = arr.map(Math.log);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) {
      lo = Math.min(lo, ln[i], intercept + slope * i - 2.2 * sd);
      hi = Math.max(hi, ln[i], intercept + slope * i + 2.2 * sd);
    }
    const x = (i) => P + (i / (n - 1)) * (W - 2 * P);
    const y = (v) => H - PB - ((v - lo) / (hi - lo)) * (H - P - PB);
    const path = ln.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const trend = (k) => `M${x(0)},${y(intercept + k * sd)} L${x(n - 1)},${y(intercept + slope * (n - 1) + k * sd)}`;
    // timeline: trading-day index → calendar date (×≈51.45), ~5 ticks
    const dateAt = (i) => new Date(Date.now() - (n - 1 - i) * 1.4484 * 86400000);
    const ticks = [0.02, 0.26, 0.5, 0.74, 0.98].map((f) => {
      const i = Math.round(f * (n - 1)); const d = dateAt(i);
      return { i, label: d.toLocaleDateString("en-US", { month: "short" }) + " '" + String(d.getFullYear()).slice(2) };
    });
    return { W, H, PB, x, y, ln, path, trend, ticks };
  }, [lt]);

  if (!lt) return <section className="pm-card">No usable history for {ticker}.</section>;
  const zoneCol = lt.zone === "buy" ? UP : lt.zone === "chip" ? WARN : "var(--ink-2)";
  const yrs = (lt.n / 252).toFixed(1);
  const Num = ({ label, v, col, sub }) => (
    <div className="cm-kpi"><div className="cm-kpi-l">{label}</div><div className="cm-kpi-v mono" style={col ? { color: col } : null}>{v}</div>{sub && <div className="cm-kpi-s">{sub}</div>}</div>
  );

  return (
    <div className="cm-wrap">
      <style>{CM_CSS}</style>
      <section className="pm-card">
        <div className="cm-head">
          <div>
            <div className="pm-card-eyebrow">Compounding Machine · log-trend channel discipline</div>
            <div className="cm-title">{ticker} vs {rel ? <b>{lt.vsName} · ratio channel</b> : "its own trend"} <span className="cm-flag mono">{lt.real ? "● live series" : "demo series"} · {yrs}y fit</span></div>
          </div>
          <div className="cm-signal" style={{ borderColor: zoneCol + "55", background: zoneCol + "0d" }}>
            <div className="cm-sig-z mono" style={{ color: zoneCol }}>{lt.z >= 0 ? "+" : ""}{lt.z.toFixed(1)}σ</div>
            <div className="cm-sig-t" style={{ color: zoneCol }}>{lt.zone === "buy" ? "BUY ZONE" : lt.zone === "chip" ? "CHIP ZONE" : "IN CHANNEL"}</div>
            <div className="cm-sig-s">{rel ? `${((lt.arr[lt.n - 1] / lt.fairNow - 1) * 100).toFixed(0)}% vs rel. trend · price ${money(lt.px[lt.n - 1])}` : `price ${money(lt.arr[lt.n - 1])} vs fair ${money(lt.fairNow)} (${((lt.arr[lt.n - 1] / lt.fairNow - 1) * 100).toFixed(0)}%)`}</div>
          </div>
        </div>

        {chart && (
          <svg viewBox={`0 0 ${chart.W} ${chart.H}`} style={{ width: "100%", height: "auto", display: "block", marginTop: 10 }}>
            {chart.ticks.map((t, i) => (
              <g key={"t" + i}>
                <line x1={chart.x(t.i)} x2={chart.x(t.i)} y1={4} y2={chart.H - chart.PB} stroke="var(--line-2, #f0f2f5)" strokeWidth="1"></line>
                <text x={chart.x(t.i)} y={chart.H - 6} textAnchor="middle" fontSize="9.5" fill="var(--muted)" fontFamily="var(--mono)">{t.label}</text>
              </g>
            ))}
            {[2, 1].map((k) => <path key={"u" + k} d={chart.trend(k)} stroke={WARN} strokeOpacity={k === 1 ? 0.5 : 0.25} strokeWidth="1" strokeDasharray="4 4" fill="none"></path>)}
            <path d={chart.trend(0)} stroke="var(--muted)" strokeWidth="1.2" fill="none"></path>
            {[1, 2].map((k) => <path key={"d" + k} d={chart.trend(-k)} stroke={UP} strokeOpacity={k === 1 ? 0.5 : 0.25} strokeWidth="1" strokeDasharray="4 4" fill="none"></path>)}
            <path d={chart.path} stroke="#121820" strokeWidth="1.5" fill="none"></path>
            {sim.buys.map((b, i) => <circle key={"b" + i} cx={chart.x(b.i)} cy={chart.y(chart.ln[b.i])} r="4" fill={UP}></circle>)}
            {sim.chips.map((c, i) => <circle key={"c" + i} cx={chart.x(c.i)} cy={chart.y(chart.ln[c.i])} r="4" fill={WARN}></circle>)}
          </svg>
        )}
        <div className="cm-legend"><span><i style={{ background: UP }}></i>buy (≤ −{buySig}σ)</span><span><i style={{ background: WARN }}></i>chip {chipPct}% (≥ +{chipSig}σ)</span><span>{rel ? `rel. trend ${lt.cagr >= 0 ? "+" : ""}${(lt.cagr * 100).toFixed(0)}%/yr vs ${lt.vsName}` : `trend ${(lt.cagr * 100).toFixed(0)}%/yr`} · 1σ = {(lt.sigmaPct * 100).toFixed(0)}%</span></div>
        {rel && <div className="cm-note" style={{ marginTop: 7 }}>Ratio channel: the line is {ticker} ÷ {lt.vsName}. −σ = cheap <em>relative to {lt.vsName}</em> (not necessarily cheap outright); buys/chips below still transact the asset at its own price.</div>}
        {lt.n < 630 && <div className="cm-shortfit">⚠ Short fit window ({yrs}y of history) — this channel is tactical, not the long-term compounding trend the tool is designed for. Read signals with skepticism until the feed accrues more history.</div>}

        <div className="cm-controls">
          <label>Asset
            <input list="cm-tickers" value={ticker} onChange={(e) => { const v = e.target.value.toUpperCase().trim(); setTicker(v); save({ ticker: v }); }} />
            <datalist id="cm-tickers">{options.map((t) => <option key={t} value={t}></option>)}</datalist>
          </label>
          <label>Channel vs
            <select value={vsKey} onChange={(e) => { const v = e.target.value; setVsKey(v); save({ vsKey: v }); }}>
              <option value="own">Own trend (absolute)</option>
              <option value="ndx">Nasdaq-100 (ratio)</option>
              <option value="spx">S&P 500 (ratio)</option>
              <option value="tsx">TSX 60 (ratio)</option>
              <option value="btc">Bitcoin (ratio)</option>
            </select>
          </label>
          <label>Buy $ per signal
            <input type="number" min="100" step="100" value={buyAmt} onChange={(e) => { const v = +e.target.value || 0; setBuyAmt(v); save({ buyAmt: v }); }} />
          </label>
          <label>Buy at ≤ <b className="mono">−{buySig}σ</b>
            <input type="range" min="0.5" max="2" step="0.25" value={buySig} onChange={(e) => { const v = +e.target.value; setBuySig(v); save({ buySig: v }); }} />
          </label>
          <label>Chip at ≥ <b className="mono">+{chipSig}σ</b>
            <input type="range" min="0.5" max="2" step="0.25" value={chipSig} onChange={(e) => { const v = +e.target.value; setChipSig(v); save({ chipSig: v }); }} />
          </label>
          <label>Chip size <b className="mono">{chipPct}%</b>
            <input type="range" min="5" max="50" step="5" value={chipPct} onChange={(e) => { const v = +e.target.value; setChipPct(v); save({ chipPct: v }); }} />
          </label>
        </div>
      </section>

      <section className="pm-card">
        <div className="pm-card-eyebrow">If you had run these rules over the last {yrs} years — honest accounting</div>
        <div className="cm-kpis">
          <Num label="Signals" v={`${sim.buys.length} buys · ${sim.chips.length} chips`} />
          <Num label="Total invested" v={money(sim.invested)} />
          <Num label="Cash from chips" v={money(sim.chipCash)} col={WARN} />
          <Num label="Out of pocket" v={money(sim.outOfPocket)} sub="invested − chips" />
          <Num label="Stack value now" v={money(sim.valueNow)} />
          <Num label="Total (stack + cash)" v={money(sim.totalNow)} col={sim.pl >= 0 ? UP : DN} sub={(sim.pl >= 0 ? "+" : "−") + money(sim.pl) + " vs invested"} />
          <Num label="Never-chip counterfactual" v={money(sim.noChipValue)} sub={sim.noChipValue > sim.totalNow ? "holding all would have made " + money(sim.noChipValue - sim.totalNow) + " more" : "chipping beat holding by " + money(sim.totalNow - sim.noChipValue)} />
        </div>
        <div className="cm-note">Backtest on the fitted channel (hindsight bias: the trend uses today's fit). It measures the <em>discipline</em>, not a prediction. Signals check weekly; one buy per zone entry.{lt.real ? "" : " Demo series — goes real when the feed covers " + ticker + "."}</div>
        {(sim.buys.length > 0 || sim.chips.length > 0) && (
          <table className="cm-table">
            <thead><tr><th>Signal</th><th>When</th><th>Price</th><th>σ</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {[...sim.buys.map((b) => ({ ...b, k: "Buy" })), ...sim.chips.map((c) => ({ ...c, k: "Chip" }))].sort((a, b) => a.i - b.i).map((s, i) => (
                <tr key={i}>
                  <td style={{ color: s.k === "Buy" ? UP : WARN, fontWeight: 700 }}>{s.k}</td>
                  <td>{Math.round((lt.n - s.i) / 252 * 12)} mo ago</td>
                  <td className="mono">{money(s.px)}</td>
                  <td className="mono">{s.z >= 0 ? "+" : ""}{s.z.toFixed(1)}σ</td>
                  <td className="r mono">{s.k === "Buy" ? money(buyAmt) : money(s.$)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="cm-act">
          {lt.zone === "buy" && <span style={{ color: UP, fontWeight: 700 }}>Signal live now:</span>}
          {lt.zone === "chip" && <span style={{ color: WARN, fontWeight: 700 }}>Chip signal live now:</span>}
          {window.TradeButton && lt.zone !== "neutral" && <window.TradeButton label={lt.zone === "buy" ? "Log a " + money(buyAmt) + " buy" : "Log a chip"} ticker={ticker} side={lt.zone === "buy" ? "buy" : "sell"} amount={lt.zone === "buy" ? buyAmt : undefined} source="CompoundingMachine" small />}
          {lt.zone === "neutral" && <span className="cm-note" style={{ margin: 0 }}>No signal — in channel. The machine waits.</span>}
        </div>
      </section>
    </div>
  );
}

const CM_CSS = `
.cm-wrap { display: flex; flex-direction: column; gap: 12px; }
.cm-head { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
.cm-title { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; margin-top: 2px; }
.cm-flag { font-size: 10px; color: var(--muted); font-weight: 600; margin-left: 8px; }
.cm-signal { border: 1.5px solid; border-radius: 12px; padding: 8px 16px 10px; text-align: center; min-width: 210px; max-width: 100%; box-sizing: border-box; }
.cm-sig-z { font-size: 22px; font-weight: 700; }
.cm-sig-t { font-size: 10.5px; font-weight: 800; letter-spacing: 0.08em; }
.cm-sig-s { font-size: 10.5px; color: var(--muted); margin-top: 3px; font-family: var(--mono); line-height: 1.45; white-space: normal; }
.cm-legend { display: flex; gap: 18px; font-size: 11px; color: var(--ink-2); margin-top: 7px; flex-wrap: wrap; }
.cm-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; vertical-align: -1px; }
.cm-shortfit { font-size: 11.5px; color: #b45309; background: #d9770610; border: 1px solid #d9770633; border-radius: 9px; padding: 8px 12px; margin-top: 9px; line-height: 1.5; }
.cm-controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line-2, #f0f2f5); }
.cm-controls label { font-size: 11px; color: var(--muted); font-weight: 600; display: flex; flex-direction: column; gap: 5px; }
.cm-controls input[type=number], .cm-controls input[list], .cm-controls select { font: inherit; font-size: 13px; color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 6px 9px; width: 100%; box-sizing: border-box; background: #fff; }
.cm-controls input[type=range] { width: 100%; accent-color: #121820; }
.cm-controls b { color: var(--ink); }
.cm-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 10px; }
.cm-kpi { background: var(--panel-2, #f8f9fb); border: 1px solid var(--line-2, #f0f2f5); border-radius: 10px; padding: 9px 12px; }
.cm-kpi-l { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 700; }
.cm-kpi-v { font-size: 15px; font-weight: 700; margin-top: 3px; }
.cm-kpi-s { font-size: 10px; color: var(--muted); margin-top: 2px; }
.cm-note { font-size: 11.5px; color: var(--muted); line-height: 1.55; margin-top: 10px; }
.cm-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
.cm-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); padding: 5px 8px; border-bottom: 1px solid var(--line); }
.cm-table td { padding: 6px 8px; border-bottom: 1px solid var(--line-2, #f0f2f5); }
.cm-table .r { text-align: right; }
.cm-act { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
`;

window.CompoundingMachine = CompoundingMachine;
