// tracker.jsx — Strategy Tracker: paper-trades several models continuously, scores them,
// crowns a "champion", and keeps a dated journal in localStorage (the ML feedback loop).
const { useState: useStateT, useMemo: useMemoT, useEffect: useEffectT } = React;

const tUP = "#0e9f6e", tDOWN = "#e02424", tWARN = "#d97706";
const tPct = (n, dp = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
const tMoney = (n) => "$" + Math.round(n).toLocaleString("en-US");
const tClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const tMean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const tStd = (a) => { const m = tMean(a); return Math.sqrt(tMean(a.map((x) => (x - m) ** 2))); };

// --- factor proxies (independent of strategy.jsx) ---
function tHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
function tMom(spark) {
  if (!spark || spark.length < 2) return 50;
  const f = spark[0], l = spark[spark.length - 1], r = Math.max(...spark) - Math.min(...spark) || 1;
  return tClamp(((l - f) / r) * 60 + 50, 0, 100);
}
function tRsi(spark) {
  if (!spark || spark.length < 2) return 50;
  let g = 0, l = 0, n = 0;
  for (let i = 1; i < spark.length; i++) { const d = spark[i] - spark[i - 1]; if (d >= 0) g += d; else l -= d; n++; }
  const ag = g / n, al = l / n; if (al === 0) return 100; return 100 - 100 / (1 + ag / al);
}

// the three tracked portfolios = the Strategy Lab's risk-model presets.
// Each proposes trades from the same universe but with a different posture, sizing and concentration.
const MODELS = [
  { id: "conservative", name: "Conservative", color: "#0e9f6e", topN: 14, conc: 0.6,
    blurb: "Smaller, diversified positions; quality + income lean, tight stops.",
    score: (h, f) => f.quality * 0.38 + f.income * 0.30 + (100 - f.rsi) * 0.17 + f.mom * 0.15 },
  { id: "balanced", name: "Balanced", color: "#4f46e5", topN: 8, conc: 1.0,
    blurb: "Moderate sizing; all factors blended evenly.",
    score: (h, f) => (f.mom + f.value + f.quality + f.income + (100 - f.rsi)) / 5 },
  { id: "aggressive", name: "Aggressive", color: "#d97706", topN: 5, conc: 1.8,
    blurb: "Concentrated, momentum-led; chasing the 60%/yr goal.",
    score: (h, f) => f.mom * 0.55 + f.value * 0.2 + f.quality * 0.15 + (100 - f.rsi) * 0.10 },
];

// CIO overweight sectors (from the June 2026 view): US/EM equities, semis, fintech, gold/materials
const CIO_FAV = { Semiconductors: 85, Software: 70, Fintech: 78, Materials: 72, Energy: 60, Crypto: 65 };

function factorsFor(h) {
  return {
    mom: tMom(h.spark),
    rsi: tRsi(h.spark),
    value: tClamp(30 + tHash(h.ticker + "v") * 58, 0, 100),
    quality: tClamp(34 + tHash(h.ticker + "q") * 58, 0, 100),
    income: tClamp((h.divYield || 0) * 11, 0, 100),
    cioTilt: CIO_FAV[h.sector] || 45,
  };
}

// build a paper portfolio for a model and simulate a forward equity curve
function runModel(model, universe, sp500) {
  const topN = model.topN || 8, conc = model.conc || 1;
  const scored = universe.map((h) => ({ h, f: factorsFor(h), s: 0 }));
  scored.forEach((x) => { x.s = model.score(x.h, x.f); });
  scored.sort((a, b) => b.s - a.s);
  const picks = scored.slice(0, topN);
  const totalConv = picks.reduce((s, p) => s + Math.pow(Math.max(1, p.s - 45), conc), 0) || 1;
  picks.forEach((p) => { p.w = Math.pow(Math.max(1, p.s - 45), conc) / totalConv; });

  // deterministic ~120-trading-day forward path per pick, ending near its realized plPct
  const PH = window.PMData.priceHistory;
  const N = 120;
  const curve = new Array(N).fill(0);
  picks.forEach((p) => {
    const tot = tClamp((p.h.plPct || 0) / 100, -0.6, 2.0);
    const path = PH(p.h.seed * 9 + 7, N, Math.max(1, p.h.price), tot, 0.018);
    const base = path[0] || 1;
    for (let i = 0; i < N; i++) curve[i] += p.w * (path[i] / base);
  });
  // benchmark (S&P) normalized over same window
  const bSlice = sp500.slice(-N);
  const bBase = bSlice[0] || 1;
  const bench = bSlice.map((v) => v / bBase);

  const ret = (curve[curve.length - 1] - 1) * 100;
  const benchRet = (bench[bench.length - 1] - 1) * 100;
  const rets = curve.slice(1).map((v, i) => v / curve[i] - 1);
  const sharpe = (tMean(rets) * 252 - 0.025) / ((tStd(rets) * Math.sqrt(252)) || 1);
  let peak = -Infinity, mdd = 0;
  curve.forEach((v) => { peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); });
  const hits = picks.filter((p) => (p.h.plPct || 0) >= 0).length;
  const hitRate = (hits / picks.length) * 100;

  return { model, picks, curve, bench, ret, benchRet, sharpe, mdd: mdd * 100, hitRate, va: ret - benchRet };
}

// multi-line equity chart
function TrackChart({ runs, accent, actual, height = 300 }) {
  const W = 1000, H = height, padT = 14, padB = 26, padL = 44, padR = 12;
  const all = runs.flatMap((r) => r.curve).concat(runs[0].bench).concat(actual || []);
  const lo = Math.min(...all), hi = Math.max(...all);
  const n = runs[0].curve.length;
  const x = (i) => padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
  const line = (arr) => (window.smoothPath ? window.smoothPath(arr.map((v, i) => [x(i), y(v)]), 0.5)
    : arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" "));
  const yTicks = [lo, (lo + hi) / 2, hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="currentColor" strokeOpacity="0.08" />
          <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="tk-ytick">{((v - 1) * 100 >= 0 ? "+" : "") + ((v - 1) * 100).toFixed(0)}%</text>
        </g>
      ))}
      <path d={line(runs[0].bench)} fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.6" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      {actual && actual.length ? <path d={line(actual)} fill="none" stroke="currentColor" strokeOpacity="0.6" strokeWidth="2" strokeDasharray="7 4" vectorEffect="non-scaling-stroke" /> : null}
      {runs.map((r) => (
        <path key={r.model.id} d={line(r.curve)} fill="none" stroke={r.model.color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

const JOURNAL_KEY = "helm_tracker_journal_v1";
function loadJournal() { try { return JSON.parse(localStorage.getItem(JOURNAL_KEY) || "[]"); } catch (e) { return []; } }
function saveJournal(j) { try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(j)); } catch (e) {} }

function StrategyTracker({ accent }) {
  const D = window.PMData;
  const [journal, setJournal] = useStateT(loadJournal);
  const [flash, setFlash] = useStateT(false);
  const [bookId, setBookId] = useStateT(null);
  const view0 = D.buildView("all");
  const equity = view0.kpis.equity;
  const dispCcy = view0.kpis.ccy;
  const acctName = (id) => { const a = (D.accounts || []).find((x) => x.id === id); return a ? a.name : "Unassigned"; };
  const acctLabel = (id) => { const a = (D.accounts || []).find((x) => x.id === id); return a ? a.label : ""; };

  const runs = useMemoT(() => {
    const universe = D.buildView("all").holdings;
    // dedupe by ticker so a name held in 2 accounts isn't double-counted
    const seen = {}; const uni = [];
    universe.forEach((h) => { if (!seen[h.ticker]) { seen[h.ticker] = 1; uni.push(h); } });
    return MODELS.map((m) => runModel(m, uni, D.sp500)).sort((a, b) => b.ret - a.ret);
  }, []);
  const champ = runs[0];

  // the user's actual portfolio, normalized to the same 120-pt window (grey dashed reference)
  const actualCurve = useMemoT(() => {
    const p = (D.buildView("all").portfolio || []).slice(-120);
    if (!p.length) return null;
    const base = p[0] || 1;
    return p.map((v) => v / base);
  }, []);

  // current price per ticker (live-updated by the feed) — used to mark past proposals to market
  const priceNow = {};
  D.allHoldings.forEach((h) => { priceNow[h.ticker] = h.price; });
  // realized weighted return of a snapshot's proposed picks vs their entry prices
  function realizedSince(entry) {
    if (!entry.picks || !entry.picks.length) return null;
    let wsum = 0, acc = 0, n = 0;
    entry.picks.forEach((p) => {
      const now = priceNow[p.t];
      if (now && p.entry) { acc += (p.w || 1) * (now / p.entry - 1); wsum += (p.w || 1); n++; }
    });
    return n ? { ret: (acc / (wsum || 1)) * 100, n } : null;
  }

  function buildEntry() {
    return {
      v: 2,
      date: new Date().toISOString().slice(0, 10),
      regime: window.HelmRegime ? window.HelmRegime.label : null,
      champion: champ.model.name,
      // every model recorded daily — return, value-added, AND its FULL proposed book (entry prices) so
      // the feed can mark each model's book to market later (not just the champion's top 5)
      models: runs.map((r) => ({ id: r.model.id, name: r.model.name, ret: +r.ret.toFixed(1), va: +r.va.toFixed(1),
        picks: r.picks.map((p) => ({ t: p.h.ticker, entry: p.h.price, w: +(p.w || 0).toFixed(3) })) })),
      topPick: champ.picks[0] ? champ.picks[0].h.ticker : "\u2014",
      picks: champ.picks.map((p) => ({ t: p.h.ticker, entry: p.h.price, w: +(p.w || 0).toFixed(3) })),
    };
  }
  function recordSnapshot(silent) {
    const entry = buildEntry();
    const next = [entry, ...journal.filter((e) => e.date !== entry.date)].slice(0, 30);
    setJournal(next); saveJournal(next);
    if (!silent) { setFlash(true); setTimeout(() => setFlash(false), 1500); }
  }
  // auto-record today's signals for all 3 models, once per day (no manual click needed)
  useEffectT(() => {
    const today = new Date().toISOString().slice(0, 10);
    const te = journal.find((e) => e.date === today);
    const stale = te && (te.v !== 2 || !(te.models && te.models[0] && Array.isArray(te.models[0].picks)));
    if (!te || stale) recordSnapshot(true);
  }, []);
  function clearJournal() { setJournal([]); saveJournal([]); }

  // seed a realistic back-dated history so the learning loop (ledger/drift/simulation) populates.
  // entry prices are jittered off current price so realized-since deltas vary by date & champion.
  function seedHistory() {
    const days = [70, 56, 42, 30, 21, 14, 7, 2]; // trading-ish spacing, oldest first
    let s = 20260101;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const seeded = days.map((ago) => {
      const d = new Date(); d.setDate(d.getDate() - ago);
      // rotate champion deterministically; vary model returns plausibly
      const order = [...runs].sort(() => rnd() - 0.5);
      const ch = order[0];
      // older snapshots: entries set so realized drifts (older = bigger move, mixed sign)
      const horizonScale = ago / 70;
      const picks = ch.picks.slice(0, 5).map((p) => {
        const move = (rnd() - 0.42) * 0.5 * horizonScale; // entry below/above current
        const entry = +(p.h.price / (1 + move)).toFixed(2);
        return { t: p.h.ticker, entry, w: +(p.w || 0).toFixed(3) };
      });
      return {
        date: d.toISOString().slice(0, 10),
        regime: window.HelmRegime ? window.HelmRegime.label : "Slowdown",
        champion: ch.model.name,
        models: order.map((r) => ({ id: r.model.id, name: r.model.name, ret: +(r.ret + (rnd() - 0.5) * 8).toFixed(1), va: +(r.va + (rnd() - 0.5) * 4).toFixed(1) })),
        topPick: ch.picks[0] ? ch.picks[0].h.ticker : "—",
        picks, seeded: true,
      };
    });
    const dates = new Set(seeded.map((e) => e.date));
    const next = [...seeded.reverse(), ...journal.filter((e) => !dates.has(e.date))].slice(0, 30);
    setJournal(next); saveJournal(next);
    setFlash(true); setTimeout(() => setFlash(false), 1500);
  }

  // champion consistency across journal
  const champCounts = {};
  journal.forEach((e) => { champCounts[e.champion] = (champCounts[e.champion] || 0) + 1; });
  const mostConsistent = Object.entries(champCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="tk">
      {/* header */}
      <section className="pm-card tk-hero">
        <div className="tk-hero-l">
          <div className="pm-card-eyebrow">Strategy Tracker · risk-model portfolios</div>
          <div className="tk-hero-title">Three risk models, tracked daily</div>
          <p className="tk-hero-sub">The same Strategy Lab signals run under three postures — <strong>Conservative</strong>, <strong>Balanced</strong> and <strong>Aggressive</strong> — each proposing a conviction-weighted set of trades. Hit <strong>Record</strong> to log today's proposals with entry prices; the daily feed then marks them to market, so every snapshot shows its <strong>realized return since</strong>. Over time the journal reveals which posture actually works, and the leader becomes your <strong>champion</strong>.</p>
        </div>
        <div className="tk-hero-r">
          <button className={`tk-record${flash ? " flashed" : ""}`} onClick={() => recordSnapshot(false)} style={{ background: accent }}>
            {flash ? "✓ Recorded" : "Re-record now"}
          </button>
          <span className="tk-record-note">Auto-recorded daily · {journal.length} snapshot{journal.length === 1 ? "" : "s"} logged · <button className="tk-seed" onClick={seedHistory}>seed demo history</button></span>
        </div>
      </section>

      {/* all three model portfolios — champion highlighted */}
      <div className="tk-cards">
        {runs.map((r, i) => (
          <section className={`pm-card tk-card${i === 0 ? " is-champ" : ""}`} key={r.model.id} style={i === 0 ? { borderColor: r.model.color } : {}}>
            <div className="tk-card-top">
              <span className="tk-dot" style={{ background: r.model.color }} />
              <span className="tk-card-name">{r.model.name}</span>
              {i === 0 && <span className="tk-card-badge" style={{ background: r.model.color }}>★ Champion</span>}
            </div>
            <div className="tk-card-ret" style={{ color: r.ret >= 0 ? tUP : tDOWN }}>{tPct(r.ret)}</div>
            <div className="tk-card-grid">
              <div><span>vs S&P</span><strong style={{ color: r.va >= 0 ? tUP : tDOWN }}>{tPct(r.va)}</strong></div>
              <div><span>Sharpe</span><strong>{r.sharpe.toFixed(2)}</strong></div>
              <div><span>Max DD</span><strong style={{ color: tDOWN }}>{r.mdd.toFixed(1)}%</strong></div>
              <div><span>Hit rate</span><strong>{r.hitRate.toFixed(0)}%</strong></div>
            </div>
            <div className="tk-card-blurb">{r.model.blurb}</div>
            <div className="tk-card-picks">{r.picks.slice(0, 5).map((p) => p.h.ticker).join(" · ")}</div>
          </section>
        ))}
      </div>

      {/* CONSOLIDATED PROPOSED BOOKS — all propositions, with $ amounts + account routing */}
      <section className="pm-card tk-books">
        <style>{TK_BOOKS_CSS}</style>
        <div className="pm-card-head">
          <div>
            <div className="pm-card-eyebrow">Proposed books · deploy your capital</div>
            <div className="tk-books-sub">Each model reallocates your <strong>{tMoney(equity)}</strong> net liquidity into a full position list — every line shows the <strong>dollar amount</strong> and the <strong>account</strong> to hold it in. Switch models to compare postures.</div>
          </div>
          <div className="tk-books-tabs">
            {runs.map((r) => {
              const id = r.model.id, on = (bookId || runs[0].model.id) === id;
              return <button key={id} className={on ? "on" : ""} onClick={() => setBookId(id)} style={on ? { background: r.model.color, borderColor: r.model.color, color: "#fff" } : {}}>{r.model.name}</button>;
            })}
          </div>
        </div>
        {(() => {
          const r = runs.find((x) => x.model.id === (bookId || runs[0].model.id)) || runs[0];
          const built = window.helmConstruct ? window.helmConstruct(r.picks.map((p) => ({ ticker: p.h.ticker, sector: p.h.sector, score: (p.h.sig ? p.h.sig.composite : 0) || Math.round((p.w || 0.05) * 800), h: p.h })), { maxName: r.model.id === "aggressive" ? 0.18 : r.model.id === "conservative" ? 0.09 : 0.12, maxSector: r.model.id === "aggressive" ? 0.40 : 0.30 }) : null;
          const wmap = {};
          if (built) built.weights.forEach((b) => { wmap[b.ticker] = b.w; });
          const rows = r.picks.map((p) => { const w = built && wmap[p.h.ticker] != null ? wmap[p.h.ticker] : (p.w || 0); return { t: p.h.ticker, sec: p.h.sector, w: w * 100, amt: w * equity, acct: p.h.acct, px: p.h.price, ccy: p.h.ccy, h0: p.h }; }).sort((a, b) => b.w - a.w);
          const div = built ? built.div : null;
          const byAcct = {};
          rows.forEach((x) => { byAcct[x.acct] = (byAcct[x.acct] || 0) + x.amt; });
          return (
            <>
              {div && (
                <div className="tk-div" title="Portfolio construction: correlation/sector-aware sizing">
                  <span className="tk-div-tag" style={{ background: div.score >= 65 ? "#0e9f6e" : div.score >= 45 ? "#d97706" : "#e02424" }}>Diversification {div.score}/100</span>
                  <span className="tk-div-txt">{div.effNames} effective names across {div.sectors} sectors · largest sector <strong>{div.topSector} {div.topSectorW}%</strong>. {div.feasible ? `Weights are correlation- & sector-capped (≤${div.capName}% name, ≤${div.capSector}% sector) so the book is balanced, not just each pick.` : `Caps (≤${div.capName}% name, ≤${div.capSector}% sector) can't be met with so few names — weights fall back to equal-weight, so concentration stays high. Add more names to diversify.`}</span>
                </div>
              )}
              <div className="tk-books-summary">
                {Object.entries(byAcct).sort((a, b) => b[1] - a[1]).map(([id, amt]) => (
                  <div className="tk-acct-chip" key={id} title={acctLabel(id)}>
                    <span className="tk-acct-name">{acctName(id)}</span>
                    <span className="tk-acct-amt mono">{tMoney(amt)}</span>
                    <span className="tk-acct-pct mono">{(amt / equity * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
              <div className="pm-table-wrap">
                <table className="pm-table tk-book-table">
                  <thead><tr>
                    <th className="ta-left">#</th><th className="ta-left">Position</th>
                    <th className="ta-left">Target weight</th><th className="ta-right">Amount ({dispCcy})</th>
                    <th className="ta-left">Horizon</th><th className="ta-left">Hold in account</th><th className="ta-center">Action</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((x, i) => (
                      <tr key={x.t}>
                        <td className="ta-left tk-rank">{i + 1}</td>
                        <td className="ta-left"><strong>{x.t}</strong> <span className="tk-book-sec">{x.sec}</span></td>
                        <td className="ta-left"><div className="tk-wrow"><div className="tk-wbar-wrap"><div className="tk-wbar" style={{ width: Math.min(100, x.w) + "%", background: r.model.color }} /></div><span className="mono tk-wpct">{x.w.toFixed(1)}%</span></div></td>
                        <td className="ta-right mono">{tMoney(x.amt)}</td>
                        <td className="ta-left">{(() => { const sg = window.signalsFor ? window.signalsFor(x.h0 || { ticker: x.t, price: x.px, sector: x.sec, divYield: 0, spark: [100, 103, 106, 108, 111] }, window.helmPresetCfg ? window.helmPresetCfg(r.model.id) : undefined) : null; const th = sg && window.helmTradeHorizon ? window.helmTradeHorizon(sg) : null; return th ? <span className="tk-hz" title={th.note} style={{ color: th.kind === "core" ? "#0a7d57" : th.kind === "quick" ? "#b45309" : "var(--ink-2)" }}>{th.tag}</span> : <span className="tk-hz">—</span>; })()}</td>
                        <td className="ta-left"><span className="tk-acct-tag">{acctName(x.acct)}</span></td>
                        <td className="ta-center"><span className="tk-buy">Buy</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="tk-foot-note">Conviction-scaled weights · posture: {r.model.blurb.toLowerCase()} Account routing follows where each name sits today (registered REER/CELI shelter gains; crypto in the crypto sleeve). Total deploys 100% of your {tMoney(equity)}. Framework proposal — validate against your Plan budget before trading.</div>
            </>
          );
        })()}
      </section>

      {/* equity curves */}
      <section className="pm-card">
        <div className="pm-card-head">
          <div className="pm-card-eyebrow">Paper-portfolio equity curves · 120 days</div>
          <div className="tk-legend">
            {runs.map((r) => (<span key={r.model.id}><i style={{ background: r.model.color }} />{r.model.name}</span>))}
            <span className="tk-mut"><i className="dash dash-actual" />Your actual portfolio</span>
            <span className="tk-mut"><i className="dash" />S&P 500</span>
          </div>
        </div>
        <div className="tk-chart" style={{ color: "var(--ink)" }}><TrackChart runs={runs} accent={accent} actual={actualCurve} /></div>
      </section>

      {window.ReadinessBanner ? <window.ReadinessBanner label="before trading the champion's picks" /> : null}

      {/* leaderboard */}
      <section className="pm-card">
        <div className="pm-card-eyebrow">Model leaderboard</div>
        <div className="pm-table-wrap">
          <table className="pm-table tk-table">
            <thead><tr>
              <th className="ta-left">#</th><th className="ta-left">Model</th>
              <th className="ta-right">Return</th><th className="ta-right">vs S&P</th>
              <th className="ta-right">Sharpe</th><th className="ta-right">Max DD</th>
              <th className="ta-right">Hit rate</th><th className="ta-left">Top picks</th>
            </tr></thead>
            <tbody>
              {runs.map((r, i) => (
                <tr key={r.model.id} className={i === 0 ? "tk-leader" : ""}>
                  <td className="ta-left tk-rank">{i + 1}</td>
                  <td className="ta-left">
                    <span className="tk-dot" style={{ background: r.model.color }} />
                    <strong>{r.model.name}</strong>
                  </td>
                  <td className="ta-right mono" style={{ color: r.ret >= 0 ? tUP : tDOWN }}>{tPct(r.ret)}</td>
                  <td className="ta-right mono" style={{ color: r.va >= 0 ? tUP : tDOWN }}>{tPct(r.va)}</td>
                  <td className="ta-right mono">{r.sharpe.toFixed(2)}</td>
                  <td className="ta-right mono" style={{ color: tDOWN }}>{r.mdd.toFixed(1)}%</td>
                  <td className="ta-right mono">{r.hitRate.toFixed(0)}%</td>
                  <td className="ta-left tk-picks">{r.picks.slice(0, 4).map((p) => p.h.ticker).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* journal */}
      <section className="pm-card">
        <div className="pm-card-head">
          <div className="pm-card-eyebrow">Tracking journal</div>
          {journal.length > 0 && <button className="pm-link" style={{ color: "var(--muted)" }} onClick={clearJournal}>Clear</button>}
        </div>
        {mostConsistent && (
          <div className="tk-consistent">Most consistent champion so far: <strong>{mostConsistent[0]}</strong> ({mostConsistent[1]} of {journal.length} snapshots)</div>
        )}
        {journal.length === 0 ? (
          <div className="tk-empty">Recording today's signals automatically… re-visit on different days (or after the live feed updates prices) to build the track record across all three models.</div>
        ) : (
          <div className="tk-journal">
            {journal.map((e) => (
              <div className="tk-jrow" key={e.date}>
                <span className="tk-jdate mono">{e.date}</span>
                <span className="tk-jchamp" style={{ color: accent }}>★ {e.champion}</span>
                <span className="tk-jtop">top pick {e.topPick}</span>
                {(() => {
                  const r = realizedSince(e);
                  return r
                    ? <span className="tk-jreal mono" style={{ color: r.ret >= 0 ? tUP : tDOWN }} title={`${r.n} proposed picks marked to current feed price`}>{tPct(r.ret)} since</span>
                    : <span className="tk-jreal tk-mut">— since</span>;
                })()}
                <span className="tk-jrets">{e.models.slice(0, 3).map((m) => (
                  <span key={m.id} className="mono" style={{ color: m.ret >= 0 ? tUP : tDOWN }}>{m.name.split(" ")[0]} {tPct(m.ret, 0)}</span>
                ))}</span>
              </div>
            ))}
          </div>
        )}
        {journal.length >= 5 && window.RiskPanel && (() => {
          // daily returns per model from the journal (each entry has model.ret as % return that day)
          const champRets = journal.map((e) => { const m = e.models ? e.models.find((x) => x.name === e.champion) : null; return m ? m.ret / 100 : 0; }).filter((r) => r !== 0);
          return (
            <div style={{ marginTop: 18 }}>
              <div className="pm-card-eyebrow">Risk statistics · champion model ({champ.model.name})</div>
              {React.createElement(window.RiskPanel, { rets: champRets, label: champ.model.name, accent })}
            </div>
          );
        })()}
        <div className="tk-foot-note">Paper-trading simulation on deterministic forward paths — a framework to compare models, not a live trading record. With the data feed connected, each recorded snapshot captures the real prices of that day, so the journal becomes a genuine walk-forward test set the models can be tuned against.</div>
      </section>
    </div>
  );
}

const TK_BOOKS_CSS = `
.tk-books-sub { font-size: 13px; color: var(--ink-2); line-height: 1.55; max-width: 640px; }
.tk-books-tabs { display: inline-flex; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; flex: none; }
.tk-books-tabs button { font: inherit; font-size: 12.5px; font-weight: 600; padding: 7px 14px; border: 0; border-right: 1px solid var(--line); background: var(--panel-2); color: var(--ink-2); cursor: pointer; }
.tk-books-tabs button:last-child { border-right: 0; }
.tk-books-summary { display: flex; flex-wrap: wrap; gap: 10px; margin: 14px 0 4px; }
.tk-acct-chip { display: flex; align-items: baseline; gap: 8px; border: 1px solid var(--line); border-radius: 9px; padding: 8px 13px; background: var(--panel-2); }
.tk-acct-name { font-size: 12px; font-weight: 600; color: var(--ink); }
.tk-acct-amt { font-size: 13px; font-weight: 700; }
.tk-acct-pct { font-size: 11px; color: var(--muted); }
.tk-book-table td { padding: 9px 12px; vertical-align: middle; }
.tk-book-sec { font-size: 11px; color: var(--muted); margin-left: 4px; }
.tk-wrow { display: flex; align-items: center; gap: 9px; }
.tk-wbar-wrap { width: 90px; height: 7px; background: var(--line-2); border-radius: 4px; overflow: hidden; flex: none; }
.tk-wbar { height: 100%; border-radius: 4px; }
.tk-wpct { font-size: 12px; min-width: 42px; }
.tk-acct-tag { font-size: 11.5px; font-weight: 600; color: var(--ink-2); background: var(--panel-2); border: 1px solid var(--line); padding: 2px 9px; border-radius: 6px; }
.tk-hz { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
.tk-div { display: flex; align-items: center; gap: 12px; margin: 14px 0 2px; padding: 11px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); flex-wrap: wrap; }
.tk-div-tag { color: #fff; font-family: var(--mono); font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px; white-space: nowrap; }
.tk-div-txt { font-size: 12.5px; color: var(--ink-2); line-height: 1.5; }
.tk-div-txt strong { color: var(--ink); }
.tk-buy { font-size: 11px; font-weight: 700; color: #0e9f6e; background: color-mix(in srgb, #0e9f6e 12%, transparent); padding: 3px 11px; border-radius: 99px; }
@media (max-width: 760px) { .tk-books-tabs { width: 100%; } .tk-books-tabs button { flex: 1; } }
`;

window.StrategyTracker = StrategyTracker;
