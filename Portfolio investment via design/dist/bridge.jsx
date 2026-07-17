// analysis.jsx — AI-assisted technical chart analysis (uses window.claude.complete).
// Computes local technicals, then asks Claude for a concise read. Falls back to a
// rule-based read when the AI helper isn't available.
const { useState: useStateA } = React;

function aSMA(arr, n) { if (arr.length < n) return null; const s = arr.slice(-n); return s.reduce((a, b) => a + b, 0) / n; }
function aRSI(arr, period = 14) {
  if (arr.length < period + 1) return 50;
  let g = 0, l = 0;
  for (let i = arr.length - period; i < arr.length; i++) { const d = arr[i] - arr[i - 1]; if (d >= 0) g += d; else l -= d; }
  const ag = g / period, al = l / period; if (al === 0) return 100; return 100 - 100 / (1 + ag / al);
}
function aSlope(arr) { // % per the window, via simple endpoints of a smoothed tail
  if (arr.length < 2) return 0;
  const tail = arr.slice(-Math.min(30, arr.length));
  return (tail[tail.length - 1] / tail[0] - 1) * 100;
}
function aVol(arr) {
  const r = []; for (let i = 1; i < arr.length; i++) r.push(arr[i] / arr[i - 1] - 1);
  const m = r.reduce((a, b) => a + b, 0) / (r.length || 1);
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length || 1));
  return sd * Math.sqrt(252) * 100;
}

function technicals(series, price) {
  const last = price || series[series.length - 1];
  const hi = Math.max(...series), lo = Math.min(...series);
  const sma20 = aSMA(series, 20), sma50 = aSMA(series, 50);
  const rsi = aRSI(series);
  const slope = aSlope(series);
  const vol = aVol(series);
  const recent = series.slice(-60);
  const support = Math.min(...recent), resistance = Math.max(...recent);
  return {
    last, hi, lo, sma20, sma50, rsi, slope, vol, support, resistance,
    fromHigh: (last / hi - 1) * 100,
    aboveSma50: sma50 != null ? last >= sma50 : null,
    trend: slope > 4 ? "up" : slope < -4 ? "down" : "sideways",
  };
}

function ruleRead(t, ticker) {
  const bits = [];
  bits.push(`${ticker} is in a ${t.trend === "up" ? "rising" : t.trend === "down" ? "falling" : "range-bound"} trend (${t.slope >= 0 ? "+" : ""}${t.slope.toFixed(1)}% over the recent window).`);
  if (t.rsi > 70) bits.push(`RSI ${t.rsi.toFixed(0)} is overbought — momentum is stretched.`);
  else if (t.rsi < 30) bits.push(`RSI ${t.rsi.toFixed(0)} is oversold — watch for a bounce.`);
  else bits.push(`RSI ${t.rsi.toFixed(0)} is neutral.`);
  if (t.aboveSma50 === true) bits.push("Price sits above its 50-day average (constructive).");
  else if (t.aboveSma50 === false) bits.push("Price sits below its 50-day average (cautious).");
  bits.push(`Support near $${t.support.toFixed(2)}, resistance near $${t.resistance.toFixed(2)}. Annualized volatility ≈ ${t.vol.toFixed(0)}%.`);
  bits.push(`It is ${Math.abs(t.fromHigh).toFixed(0)}% ${t.fromHigh < 0 ? "below" : "at/above"} its window high.`);
  return bits.join(" ");
}

const A_HORIZONS = [
  { id: "day",  label: "Day trade", desc: "intraday · hours", out: "OUTLOOK (today / intraday)" },
  { id: "swing", label: "Swing", desc: "days to weeks", out: "OUTLOOK (days–weeks)" },
  { id: "position", label: "Position", desc: "weeks to months", out: "OUTLOOK (weeks–months)" },
  { id: "long", label: "Long-term", desc: "months to a year+", out: "OUTLOOK (months–year)" },
];

function ChartAnalysis({ series, ticker, name, sector, accent }) {
  const [state, setState] = useStateA("idle"); // idle | loading | done | error
  const [text, setText] = useStateA("");
  const [horizon, setHorizon] = useStateA("position");
  const t = technicals(series);
  const hz = A_HORIZONS.find((h) => h.id === horizon) || A_HORIZONS[2];

  async function analyze() {
    setState("loading"); setText("");
    const horizonLine = horizon === "day"
      ? "The investor is DAY-TRADING: intraday horizon (minutes to hours, flat by close). Focus on intraday momentum, opening range, VWAP-style levels, and tight risk."
      : horizon === "swing"
      ? "The investor is SWING-TRADING: holding days to a few weeks. Focus on the short-term trend, breakouts/pullbacks and near-term levels."
      : horizon === "position"
      ? "The investor holds POSITIONS for weeks to months (no day-trading). Focus on the primary trend, the 50-day average and swing levels."
      : "The investor is LONG-TERM: months to a year or more. Focus on the major trend, higher-timeframe structure and whether dips are buyable.";
    const prompt = {
      messages: [{
        role: "user",
        content: `You are a disciplined technical analyst. ${horizonLine} Analyze ${ticker} (${name}, ${sector}).

Indicators (price in native currency):
- Last: ${t.last.toFixed(2)}
- Trend: ${t.trend} (${t.slope.toFixed(1)}% over recent window)
- RSI(14): ${t.rsi.toFixed(0)}
- 50-day avg: ${t.sma50 ? t.sma50.toFixed(2) : "n/a"} (price is ${t.aboveSma50 ? "above" : "below"})
- Support: ${t.support.toFixed(2)}, Resistance: ${t.resistance.toFixed(2)}
- Annualized volatility: ${t.vol.toFixed(0)}%
- Distance from window high: ${t.fromHigh.toFixed(0)}%

Write a concise read with exactly these short sections, each one line:
TREND: ...
LEVELS: ...
MOMENTUM: ...
${hz.out}: ...
RISK: ...
Keep under 130 words total. End with: "Not financial advice."`,
      }],
    };
    try {
      if (!window.claude || !window.claude.complete) throw new Error("no-ai");
      const out = await window.claude.complete(prompt);
      setText(out || ruleRead(t, ticker)); setState("done");
    } catch (e) {
      setText(ruleRead(t, ticker)); setState("done");
    }
  }

  // render AI text: bold the SECTION: labels
  function render(txt) {
    return txt.split("\n").filter((l) => l.trim()).map((line, i) => {
      const m = line.match(/^([A-Z][A-Z ()0-9-]+):\s*(.*)$/);
      if (m) return <p key={i} className="an-line"><span className="an-key">{m[1]}</span> {m[2]}</p>;
      return <p key={i} className="an-line">{line}</p>;
    });
  }

  return (
    <section className="pm-card an-card">
      <div className="pm-card-head">
        <div>
          <div className="pm-card-eyebrow">AI chart analysis</div>
          <div className="an-sub">Technical read of {ticker} — <strong style={{ color: accent }}>{hz.label}</strong> timeframe ({hz.desc}).</div>
        </div>
        <button className="an-btn" onClick={analyze} disabled={state === "loading"} style={{ background: accent }}>
          {state === "loading" ? "Analyzing…" : state === "done" ? "Re-analyze" : "Analyze chart"}
        </button>
      </div>

      <div className="an-hz">
        <span className="an-hz-label">Trade horizon</span>
        <div className="an-hz-seg">
          {A_HORIZONS.map((h) => (
            <button key={h.id} className={horizon === h.id ? "is-active" : ""} onClick={() => setHorizon(h.id)} title={h.desc}>{h.label}</button>
          ))}
        </div>
        <span className="an-hz-desc">{hz.desc}</span>
      </div>

      {/* quick technical chips — always visible */}
      <div className="an-chips">
        <span className="an-chip" style={{ color: t.trend === "up" ? "#0e9f6e" : t.trend === "down" ? "#e02424" : "var(--ink-2)" }}>Trend {t.trend}</span>
        <span className="an-chip" style={{ color: t.rsi > 70 ? "#e02424" : t.rsi < 30 ? "#0e9f6e" : "var(--ink-2)" }}>RSI {t.rsi.toFixed(0)}</span>
        <span className="an-chip">vs 50d {t.aboveSma50 == null ? "—" : t.aboveSma50 ? "above" : "below"}</span>
        <span className="an-chip">S ${t.support.toFixed(2)}</span>
        <span className="an-chip">R ${t.resistance.toFixed(2)}</span>
        <span className="an-chip">σ {t.vol.toFixed(0)}%</span>
      </div>

      {state === "loading" && <div className="an-loading">Reading the chart…</div>}
      {state === "done" && <div className="an-out">{render(text)}</div>}
      {state === "idle" && <div className="an-hint">Click <strong>Analyze chart</strong> for an AI technical read (trend, levels, momentum, 1-4 week outlook, key risk).</div>}
    </section>
  );
}

window.ChartAnalysis = ChartAnalysis;
