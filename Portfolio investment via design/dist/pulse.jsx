// pulse.jsx — the Pulse: one 0–100 composite for the tape, computed not vibed.
// Six inputs, each scored 0–100 from real feed series when present (provenance
// flagged), deterministic demo values otherwise: net-liquidity trend, Global-M2
// impulse, HY credit spreads (FRED OAS), VIX level+trend, JPY-carry stability,
// breadth. Deterministic — no LLM. Feeds the Bridge dial + Stone-style stress
// flag; gates nothing by itself.
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const last = (a) => a[a.length - 1];

  function liveSeries(key) {
    const m = window.HelmFeed && window.HelmFeed.macro;
    const s = m && m[key];
    if (Array.isArray(s) && s.length > 5) return s.map((o) => (o && o.v != null ? o.v : o)).filter((v) => v != null && !isNaN(v));
    return null;
  }

  // score helpers: map a change/level onto 0–100 where 100 = maximally supportive
  const scoreTrend = (chgPct, span) => clamp(50 + (chgPct / span) * 50, 0, 100);
  const scoreLevelInv = (v, lo, hi) => clamp(100 - ((v - lo) / (hi - lo)) * 100, 0, 100); // low value = good

  function components() {
    const out = [];

    // 1 · Fed net liquidity (13-week trend)
    const nl = liveSeries("net_liquidity");
    {
      const arr = nl || null;
      const chg = arr ? (last(arr) / arr[Math.max(0, arr.length - 65)] - 1) * 100 : 1.2;
      out.push({ k: "Net liquidity", real: !!arr, score: scoreTrend(chg, 6),
        read: `${chg >= 0 ? "+" : ""}${chg.toFixed(1)}% vs 13wk — ${chg >= 0.5 ? "rising" : chg <= -0.5 ? "draining" : "flat"}` });
    }

    // 2 · Global M2 impulse (Pal lens; global_m2 series lands with ingest todo #2)
    {
      const m2 = liveSeries("global_m2");
      const chg = m2 ? (last(m2) / m2[Math.max(0, m2.length - 26)] - 1) * 100 : 2.1;
      out.push({ k: "Global M2 impulse", real: !!m2, score: scoreTrend(chg, 5),
        read: `${chg >= 0 ? "+" : ""}${chg.toFixed(1)}% 6mo — ${chg >= 1 ? "expanding" : chg <= -1 ? "contracting" : "flat"}` });
    }

    // 3 · HY credit spreads (OAS %, level + 4wk change)
    {
      const oas = liveSeries("hy_oas");
      const v = oas ? last(oas) : 3.4;
      const chg4w = oas && oas.length > 20 ? v - oas[oas.length - 21] : -0.1;
      const s = scoreLevelInv(v, 2.5, 6.0) * 0.7 + scoreLevelInv(chg4w, -0.3, 0.8) * 0.3;
      out.push({ k: "HY spreads", real: !!oas, score: s,
        read: `${(v * 100).toFixed(0)} bp ${chg4w >= 0.05 ? "widening" : chg4w <= -0.05 ? "tightening" : "stable"} — ${v < 3.5 ? "benign" : v < 4.5 ? "watch" : "stress"}` });
    }

    // 4 · VIX level + 3-week trend (proxy for term-structure stress w/o futures data)
    {
      const vix = liveSeries("vix");
      const v = vix ? last(vix) : 17.5;
      const chg = vix && vix.length > 15 ? v - vix[vix.length - 16] : 0.8;
      const s = scoreLevelInv(v, 12, 32) * 0.7 + scoreLevelInv(chg, -3, 8) * 0.3;
      out.push({ k: "VIX", real: !!vix, score: s,
        read: `${v.toFixed(1)} ${chg >= 1 ? "rising" : chg <= -1 ? "falling" : "calm"} — ${v < 16 ? "complacent-calm" : v < 22 ? "normal" : v < 28 ? "tense" : "stress"}` });
    }

    // 5 · JPY carry stability (JPY/USD 6wk move; sharp yen strength = unwind risk)
    {
      const jp = liveSeries("jpy_usd");
      const chg = jp && jp.length > 30 ? (last(jp) / jp[jp.length - 31] - 1) * 100 : -1.1;
      // JPY per USD falling = yen strengthening = carry stress → low score
      const s = clamp(50 + (chg / 5) * 50, 0, 100);
      out.push({ k: "JPY carry", real: !!(jp && jp.length > 30), score: s,
        read: `yen ${chg <= -0.2 ? "strengthening" : chg >= 0.2 ? "weakening" : "stable"} ${chg >= 0 ? "+" : ""}${chg.toFixed(1)}% 6wk — ${chg <= -3 ? "unwind risk" : chg <= -1 ? "tightening, watch" : "carry intact"}` });
    }

    // 6 · Breadth: % of tracked names above their 50d average (held + universe, real feed prices)
    {
      const S = window.HelmSigma;
      let pct = null;
      if (S) {
        const seen = {};
        (window.PMData.allHoldings || []).forEach((h) => { seen[h.ticker] = 1; });
        (window.HelmUniverse || []).forEach((u) => { seen[u.ticker] = 1; });
        const tickers = Object.keys(seen);
        let above = 0, total = 0, real = 0;
        tickers.forEach((t) => {
          const sr = S.seriesFor(t, 60);
          if (!sr.arr || sr.arr.length < 55) return;
          const a = sr.arr, ma = a.slice(-50).reduce((x, y) => x + y, 0) / 50;
          total++; if (last(a) > ma) above++; if (sr.real) real++;
        });
        if (total > 30) pct = { v: (above / total) * 100, realShare: real / total };
      }
      const v = pct ? pct.v : 44;
      out.push({ k: "Breadth", real: !!(pct && pct.realShare > 0.5), score: clamp((v - 20) / 60 * 100, 0, 100),
        read: `${v.toFixed(0)}% above 50d — ${v >= 60 ? "broad participation" : v >= 45 ? "ok" : v >= 35 ? "thin" : "narrow"}` });
    }

    return out;
  }

  const WEIGHTS = { "Net liquidity": 0.22, "Global M2 impulse": 0.15, "HY spreads": 0.20, "VIX": 0.15, "JPY carry": 0.13, "Breadth": 0.15 };

  let _cache = null, _stamp = 0;
  function compute() {
    if (_cache && Date.now() - _stamp < 60000) return _cache;
    const comp = components();
    const score = Math.round(comp.reduce((s, c) => s + c.score * (WEIGHTS[c.k] || 0.15), 0));
    // 7d delta: persist a tiny daily history so the dial can show direction honestly
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem("helm_pulse_hist_v1") || "[]"); } catch (e) {}
    const day = new Date().toISOString().slice(0, 10);
    if (!hist.length || hist[hist.length - 1].d !== day) hist.push({ d: day, s: score });
    else hist[hist.length - 1].s = score;
    hist = hist.slice(-30);
    try { localStorage.setItem("helm_pulse_hist_v1", JSON.stringify(hist)); } catch (e) {}
    const prev = hist.length > 1 ? hist[Math.max(0, hist.length - 8)].s : null;
    const delta7 = prev != null ? score - prev : null;
    const label = score >= 65 ? "RISK-ON" : score >= 50 ? "RISK-ON · THINNING" : score >= 35 ? "CAUTIOUS" : "RISK-OFF";
    const stress = comp.filter((c) => (c.k === "HY spreads" || c.k === "VIX" || c.k === "JPY carry") && c.score < 30);
    const realN = comp.filter((c) => c.real).length;
    _cache = { score, label, delta7, comp, stress: stress.map((c) => c.k), realN, total: comp.length };
    _stamp = Date.now();
    return _cache;
  }

  function bustCache() { _cache = null; _stamp = 0; }

  // ---- the dial (compact, for the Bridge) ----
  function PulseDial({ onOpen }) {
    const [open, setOpen] = React.useState(false);
    const [, force] = React.useState(0);
    React.useEffect(() => {
      const h = () => { bustCache(); force((n) => n + 1); };
      window.addEventListener("helm:feed", h);
      return () => window.removeEventListener("helm:feed", h);
    }, []);
    const p = compute();
    const col = p.score >= 65 ? "#0e9f6e" : p.score >= 50 ? "#d97706" : p.score >= 35 ? "#d97706" : "#e02424";
    const arc = 175.9 * (p.score / 100); // semicircle r=56 → πr ≈ 175.9
    return (
      <section className="pm-card pl-card">
        <div className="pl-row" onClick={() => setOpen(!open)} title="Click for components">
          <div className="pl-g">
            <svg viewBox="0 0 140 78" style={{ width: 120, display: "block" }}>
              <path d="M 14 72 A 56 56 0 0 1 126 72" fill="none" stroke="var(--line, #e8ebef)" strokeWidth="11" strokeLinecap="round"></path>
              <path d="M 14 72 A 56 56 0 0 1 126 72" fill="none" stroke={col} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${arc} 999`}></path>
            </svg>
            <div className="pl-num mono" style={{ color: col }}>{p.score}</div>
          </div>
          <div className="pl-main">
            <div className="pl-eyebrow">Pulse · the tape in one number</div>
            <div className="pl-label mono" style={{ color: col }}>{p.label}{p.delta7 != null ? ` · 7d ${p.delta7 >= 0 ? "+" : ""}${p.delta7}` : ""}</div>
            <div className="pl-sub"><span>{p.stress.length ? `⚠ stress: ${p.stress.join(", ")}` : "no stress flags"} · {p.realN}/{p.total} live series</span><span className="pl-more">{open ? "hide ▴" : "components ▾"}</span></div>
          </div>
        </div>
        {open && (
          <div className="pl-comp">
            {p.comp.map((c) => (
              <div className="pl-c" key={c.k}>
                <span className="pl-c-k">{c.k}{c.real ? "" : <i title="demo value — series not in feed yet"> · demo</i>}</span>
                <span className="pl-c-bar"><span style={{ width: c.score + "%", background: c.score >= 55 ? "#0e9f6e" : c.score >= 35 ? "#d97706" : "#e02424" }}></span></span>
                <span className="pl-c-read">{c.read}</span>
              </div>
            ))}
            <div className="pl-note">Composite = weighted scores (liquidity 22 · HY 20 · M2 15 · VIX 15 · breadth 15 · JPY 13). Informs the regime read and the brief; gates nothing by itself.</div>
          </div>
        )}
      </section>
    );
  }

  const PULSE_CSS = `
  .pl-card { padding: 12px 16px; }
  .pl-row { display: flex; align-items: center; gap: 16px; cursor: pointer; }
  .pl-g { position: relative; flex: none; }
  .pl-num { position: absolute; left: 0; right: 0; bottom: 2px; text-align: center; font-size: 22px; font-weight: 700; }
  .pl-eyebrow { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; }
  .pl-label { font-size: 13px; font-weight: 700; margin-top: 2px; }
  .pl-sub { font-size: 11px; color: var(--muted); margin-top: 3px; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
  .pl-more { color: var(--ink-2); font-weight: 600; white-space: nowrap; }
  .pl-comp { margin-top: 12px; border-top: 1px solid var(--line-2, #f0f2f5); padding-top: 10px; display: flex; flex-direction: column; gap: 7px; }
  .pl-c { display: grid; grid-template-columns: 130px 90px 1fr; gap: 10px; align-items: center; font-size: 11.5px; }
  .pl-c-k { font-weight: 600; color: var(--ink); }
  .pl-c-k i { font-style: normal; color: #b45309; font-size: 9.5px; }
  .pl-c-bar { height: 6px; background: var(--line-2, #f0f2f5); border-radius: 4px; overflow: hidden; }
  .pl-c-bar span { display: block; height: 100%; border-radius: 4px; }
  .pl-c-read { color: var(--ink-2); font-family: var(--mono); font-size: 10.5px; }
  .pl-note { font-size: 10.5px; color: var(--muted); line-height: 1.5; margin-top: 4px; }
  @media (max-width: 700px) { .pl-c { grid-template-columns: 110px 60px 1fr; } }
  `;
  if (!document.getElementById("helm-pulse-css")) {
    const el = document.createElement("style"); el.id = "helm-pulse-css"; el.textContent = PULSE_CSS; document.head.appendChild(el);
  }

  window.HelmPulse = { compute, components, bustCache };
  window.PulseDial = PulseDial;
})();
