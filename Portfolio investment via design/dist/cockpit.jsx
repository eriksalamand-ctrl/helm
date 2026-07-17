// chief.jsx — v2-B/A: Rhodes' fact pack, material-news filter, evidence-chain proposition
// cards with round-table stances, and the brief composer. Deterministic facts; the LLM
// (window.helmAI ?? window.claude) may rephrase the brief but NEVER computes a number —
// rule-based composition is the floor and the fallback.
(function () {
  const D = () => window.PMData;
  const money = (n) => "$" + Math.abs(n) .toLocaleString("en-US", { maximumFractionDigits: 0 });

  const MACRO_KEYWORDS = /rate|fed|inflation|cpi|tariff|sanction|oil|opec|liquidity|treasur|yield|bank of canada|boc|ecb|boj|yen|dollar|recession|gdp|jobs|payroll/i;

  function cfgFor() {
    const st = window.computeHelmState ? window.computeHelmState() : null;
    const preset = st ? st.p.riskProfile.toLowerCase() : "balanced";
    const cfg = (window.helmPresetCfg || (() => ({ buyBar: 62, sellBar: 40, maxPos: 12, stopMult: 1 })))(preset);
    return { st, preset, cfg };
  }

  // ---- universe scope: held (aggregated by ticker) + screener universe, deduped ----
  function scope() {
    const byT = {};
    (D().allHoldings || []).forEach((h) => {
      if (!byT[h.ticker]) byT[h.ticker] = { ...h, held: true, mv: 0, cost: 0 };
      const q = h.qty || h.q || 0;
      byT[h.ticker].mv += (h.marketValue || h.price * q);
      byT[h.ticker].cost += (h.costBasis || (h.avg || h.price) * q);
    });
    (window.HelmUniverse || []).forEach((u) => { if (!byT[u.ticker]) byT[u.ticker] = { ...u, held: false }; });
    return Object.values(byT);
  }

  function acctName(id) { const a = D().accounts.find((x) => x.id === id); return a ? a.name : id; }

  // account routing per the house convention (registered → no direct coins; ccy match).
  // Native listing ccy comes from HelmSigma.nativeCcy (held account / universe market /
  // ticker suffix) — allHoldings.ccy is the display currency and must not be used here.
  function routeBuy(h, amt) {
    const isCoin = /Crypto/i.test(h.sector || "") && !/ETF|\.B$|\.TO$/.test(h.ticker) && !(h.name || "").includes("ETF");
    const nat = window.HelmSigma ? window.HelmSigma.nativeCcy(h.ticker) : (/\.TO$|\.B$|\.UN$/.test(h.ticker) ? "CAD" : "USD");
    const usd = nat === "USD";
    const elig = D().accounts.filter((a) => isCoin ? a.id === "crypto-direct" : a.ccy === (usd ? "USD" : "CAD") && a.id !== "crypto-direct");
    const best = elig.sort((a, b) => (b.cash || 0) - (a.cash || 0))[0];
    if (!best) return null;
    return { acct: best.id, acctName: best.name, amt: Math.min(amt, best.cash || 0) };
  }

  // ---- v2-A: build the day's cards (0–3 buys + up to 2 readjustments), gated ----
  function buildCards() {
    const { st, preset, cfg } = cfgFor();
    const S = window.HelmSigma;
    const view = D().buildView("all");
    const equity = view.kpis.equity || 1;
    const slice = equity * (preset === "aggressive" ? 0.05 : preset === "conservative" ? 0.025 : 0.035);
    const all = scope();
    const sig = (h) => { try { return window.signalsFor ? window.signalsFor(h, cfg) : null; } catch (e) { return null; } };

    // --- buy candidates through the gate chain ---
    const gateLog = [];
    let cands = all.map((h) => ({ h, s: sig(h) })).filter((x) => x.s && x.s.action === "Buy");
    const floor = cfg.buyBar + 6;
    cands = cands.filter((x) => {
      if (x.s.composite < floor) return false; // G4 conviction floor w/ margin
      if (!x.s.realFund && !x.h.held) { gateLog.push({ t: x.h.ticker, g: "G1 real-data" }); return false; }
      return true;
    });
    cands.forEach((x) => { x.e = S ? S.entryRead(x.h.ticker) : null; });
    cands = cands.filter((x) => {
      if (x.e && x.e.gate === "block-chase") { gateLog.push({ t: x.h.ticker, g: "G3 σ>+2 no-chase" }); return false; }
      if (x.e && x.e.gate === "block-knife") { gateLog.push({ t: x.h.ticker, g: "G3 σ<−2 knife" }); return false; }
      return true;
    });
    // G6 crypto-stance gate: the cycle clock gates ALL crypto-sector buys (coins AND ETF
    // wrappers — signalsFor's own gate misses wrappers). WAIT → only a long-term BTC nibble;
    // DCA → BTC/ETH majors only; DISTRIBUTE → no crypto buys at all.
    let cycle = null;
    try { cycle = window.HelmCryptoCycle ? window.HelmCryptoCycle() : null; } catch (e) {}
    const cycStance = cycle ? (typeof cycle.stance === "object" ? cycle.stance.stance : cycle.stance) : null;
    cands = cands.filter((x) => {
      if (!/Crypto/i.test(x.h.sector || "")) return true;
      const t = x.h.ticker;
      if (cycStance === "WAIT" || cycStance === "DISTRIBUTE") { gateLog.push({ t, g: `G6 crypto ${cycStance}` }); return false; }
      if (cycStance === "DCA" && !/^BTC|^ETH/i.test(t)) { gateLog.push({ t, g: "G6 DCA majors-only" }); return false; }
      return true;
    });
    // vol-adjusted edge (A-6): move-to-target ÷ path σ (√-scaled), rank desc
    cands.forEach((x) => {
      const up = (x.s.target - x.h.price) / x.h.price;
      const volH = (x.e ? x.e.sigmaD : 0.02) * Math.sqrt(63);
      x.edge = up / Math.max(0.02, volH);
    });
    cands.sort((a, b) => b.edge - a.edge);
    const buys = cands.slice(0, 3);

    // --- readjustments from the held book ---
    const sells = all.filter((h) => h.held).map((h) => ({ h, s: sig(h) }))
      .filter((x) => x.s && x.s.action === "Sell")
      .sort((a, b) => a.s.composite - b.s.composite);
    const adj = sells.slice(0, 2);

    // always classify FRESH — window.HelmRegime may hold a stale pre-feed read
    let regime = null;
    if (window.HelmRegimeCompute) { try { const r = window.HelmRegimeCompute(); regime = { label: r.label, bias: r.bias, key: r.key, since: r.since, pending: r.pending }; window.HelmRegime = regime; } catch (e) {} }
    if (!regime) regime = window.HelmRegime || {};
    const news = getNews();

    const mkCard = (x, kind) => {
      const { h, s, e } = x;
      const route = kind === "Buy" ? routeBuy(h, slice) : null;
      const shares = route && h.price ? Math.floor(route.amt / h.price) : 0;
      const newsHit = news.items.find((n) => n.tickers.includes(h.ticker));
      // evidence chain — each row carries provenance
      const ev = [];
      if (e) ev.push({ cls: "mod", tag: `σ vs ${e.benchName}`, txt: `${e.z >= 0 ? "+" : ""}${e.z.toFixed(1)}σ now${Math.abs(e.zPrev - e.z) > 0.6 ? ` (was ${e.zPrev >= 0 ? "+" : ""}${e.zPrev.toFixed(1)}σ 6wk ago)` : ""} · RS rank ${e.rs ? e.rs.pct + "th pct" : "—"}${e.setup ? " · " + e.setup.replace(/-/g, " ") : ""}${e.real ? "" : " · demo series"}` });
      ev.push({ cls: s.realFund ? "real" : "mod", tag: s.realFund ? "feed · real" : "proxy", txt: `quality ${s.qualityScore} · value ${s.valueScore} · trend ${s.trendScore}${s.realFund ? " — real fundamentals" : " — proxy scores (held name)"}` });
      ev.push({ cls: "mod", tag: "regime", txt: `${regime.label || "—"} · ${regime.bias || "—"}${cycStance && /Crypto/i.test(h.sector || "") ? " · crypto stance " + cycStance : ""}` });
      if (newsHit) ev.push({ cls: "news", tag: "news", txt: newsHit.headline.slice(0, 110) });
      // Vera's intake ledger: tracked outside-source claims on this name, credibility-weighted
      const intake = (() => {
        try {
          if (!window.HelmIntake) return null;
          const J = window.HelmIntake.load();
          const cl = J.claims.filter((c) => c.ticker === h.ticker).map(window.HelmIntake.scoreClaim);
          if (!cl.length) return null;
          const cred = window.HelmIntake.credibility(J);
          const open = cl.filter((c) => c.status === "open");
          const bull = open.filter((c) => c.direction === "bullish").length;
          const scores = [...new Set(cl.map((c) => c.src))].map((s2) => cred[s2] && cred[s2].score).filter((v) => v != null);
          return { n: cl.length, open: open.length, bull, bear: open.length - bull, best: scores.length ? Math.max(...scores) : null };
        } catch (e) { return null; }
      })();
      if (intake) ev.push({ cls: "news", tag: "Vera intake", txt: `${intake.n} tracked claim${intake.n > 1 ? "s" : ""} · ${intake.bull}▲ ${intake.bear}▼ open${intake.best != null ? ` · best source ${intake.best}% hit` : " · sources unproven yet"}` });
      const kill = kind === "Buy"
        ? `Closes below ${money(s.stop)} (stop) or RS rank drops out of top quartile — exit without debate.`
        : `Recovery above ${money(s.target)} with trend repair would void this ${kind.toLowerCase()}.`;
      // round-table stances (deterministic reads, persona-labeled)
      const stances = {
        vera: (() => {
          let base = s.realFund ? (s.qualityScore >= 55 ? ["BUY", "quality real & sound"] : ["CAUTION", "quality " + s.qualityScore]) : ["WATCH", "proxy data"];
          if (intake && intake.open) base = [base[0], base[1] + ` · intake ${intake.bull > intake.bear ? "bullish" : intake.bear > intake.bull ? "bearish" : "split"} (${intake.open})`];
          return base;
        })(),
        flint: e && e.setup ? ["BUY", e.setup.replace(/-/g, " ")] : e && e.gate !== "pass" ? ["NO SHOT", e.gate] : kind !== "Buy" ? [kind.toUpperCase(), "risk mgmt"] : ["HOLD FIRE", "no setup"],
        iris: /Risk-on|Constructive/.test(regime.bias || "") ? ["SUPPORTIVE", "regime tailwind"] : /Risk-off|Defensive/.test(regime.bias || "") ? ["SMALLER", "defensive regime"] : ["NEUTRAL", "mixed tape"],
      };
      let gates = { ok: true, notes: [] };
      try {
        if (window.HelmIPS && window.HelmIPS.checkTrade && kind === "Buy" && route) {
          const r = window.HelmIPS.checkTrade({ ticker: h.ticker, sec: h.sector, ccy: h.ccy, acct: route.acct, amount: route.amt, side: "buy" });
          if (r) gates = { ok: !(r.blocked || (r.hard || []).length), notes: (r.hard || r.breaches || r.soft || []).map((b) => b.msg || b.rule || b) };
        }
      } catch (err) {}
      // dissent = a voice pushing against THIS card's action. Iris's regime-wide caution is
      // real dissent on a Buy (defensive tape, buy anyway → size smaller). On trims/exits the
      // current stances have no "keep it" voice, so no dissent line — avoids badge noise.
      const dissent = kind === "Buy" && Object.values(stances).some((v) => /CAUTION|SMALLER|WATCH|NO SHOT/.test(v[0]));
      // weighted round-table vote (Borda + credibility): ballots weighted by measured track records
      let vote = null;
      try { vote = window.HelmRoundTable ? window.HelmRoundTable.vote(stances, kind, { regime: (regime && (regime.key || regime.label)) || "", sector: h.sector || "" }) : null; } catch (err) {}
      return { kind, ticker: h.ticker, name: h.name, held: !!h.held, sig: s, e, edge: x.edge,
        thesis: kind === "Buy"
          ? (e && e.setup === "leader-pullback" ? `Leader vs ${e.benchName} pulling back to its index path — the entry this engine is calibrated to buy.` : e && e.leader ? `Top-quartile leader inside the band vs ${e.benchName}.` : `Clears the ${preset} bar by ${(s.composite - cfg.buyBar).toFixed(0)} pts with acceptable risk shape.`)
          : kind === "Exit" ? `Trend broken and score deteriorating — capital is better deployed elsewhere.` : `Extended after the run — bank a third, keep the position working.`,
        ev, kill, stances, gates, route, shares, dissent, vote };
    };

    return {
      cards: [...buys.map((x) => mkCard(x, "Buy")), ...adj.map((x) => mkCard(x, x.s.sellKind === "Exit" ? "Exit" : "Trim"))],
      gateLog, floor, preset, flagged: sells.length, scanned: all.length,
    };
  }

  // ---- material-news filter ----
  const DEMO_NEWS = [
    { headline: "Hyperscaler capex guidance raised — AI supply chain supportive", source: "demo", tickers: ["NVDA", "TSM", "AMD"], macro: false },
    { headline: "BoC speaker leans dovish; CAD softer on the week", source: "demo", tickers: [], macro: true },
    { headline: "Strait of Hormuz insurance rates tick up — crude risk premium holds", source: "demo", tickers: ["CNQ", "SU"], macro: true },
  ];
  function getNews() {
    const heldSet = {};
    (D().allHoldings || []).forEach((h) => { heldSet[h.ticker] = true; });
    const raw = (window.HelmFeed && window.HelmFeed.news && window.HelmFeed.news.length)
      ? window.HelmFeed.news.map((n) => ({ headline: n.headline, source: n.source || "feed", url: n.url,
          tickers: n.ticker && n.ticker !== "MACRO" ? [n.ticker] : [], macro: !n.ticker || n.ticker === "MACRO" }))
      : DEMO_NEWS;
    const total = raw.length;
    const items = raw.filter((n) => n.headline && (n.tickers.some((t) => heldSet[t]) || (n.macro && MACRO_KEYWORDS.test(n.headline)))).slice(0, 4)
      .map((n) => ({ ...n, touch: n.tickers.filter((t) => heldSet[t]), action: n.tickers.some((t) => heldSet[t]) ? "review holding" : "no action — within regime read" }));
    return { items, total, live: !!(window.HelmFeed && window.HelmFeed.status && window.HelmFeed.status.live) };
  }

  // ---- the fact pack + rule-based brief (every sentence carries a src chip) ----
  function factPack() {
    const { st } = cfgFor();
    const view = D().buildView("all");
    const K = view.kpis;
    let regime = null;
    if (window.HelmRegimeCompute) {
      try { const r = window.HelmRegimeCompute(); regime = { label: r.label, bias: r.bias, key: r.key, since: r.since, pending: r.pending }; window.HelmRegime = regime; } catch (e) {}
    }
    if (!regime) regime = window.HelmRegime || null;
    const drift = window.HelmDrift || null;
    const props = buildCards();
    const news = getNews();
    const breaches = [];
    if (st && st.volOver > 0.5) breaches.push({ t: "Volatile sleeve", d: `${st.volPct.toFixed(0)}% vs ${st.p.specCap}% budget (+${st.volOver.toFixed(0)} pts)`, go: "Plan" });
    if (drift && drift.score >= 60) breaches.push({ t: "Model drift", d: drift.label, go: "Learning" });
    if (st && st.f.status === "Behind") breaches.push({ t: "Funded behind", d: `ratio ${(st.f.ratio * 100).toFixed(0)}%`, go: "Plan" });
    // top drag/lift today
    const agg = {};
    view.holdings.forEach((h) => { const k = h.ticker; agg[k] = (agg[k] || 0) + (h.dispValue || 0) * ((h.dayPct || 0) / 100); });
    const movers = Object.entries(agg).sort((a, b) => a[1] - b[1]);
    const drag = movers[0], lift = movers[movers.length - 1];
    return { K, regime, st, props, news, breaches, drag, lift };
  }

  function composeBrief(fp) {
    const { K, regime, props, news, breaches, drag, lift } = fp;
    const S = [];
    if (regime) S.push({ txt: `${/Risk-on|Constructive/.test(regime.bias) ? "Constructive tape" : /Risk-off|Defensive/.test(regime.bias) ? "Defensive tape" : "Mixed tape"} — regime ${regime.label} · ${regime.bias}.`, src: "REGIME" });
    const dayTxt = `Book ${K.dayChangePct >= 0 ? "up" : "down"} ${Math.abs(K.dayChangePct).toFixed(1)}% today${drag && drag[1] < -50 ? `, dragged by ${drag[0]} (−${money(drag[1])})` : lift && lift[1] > 50 ? `, led by ${lift[0]} (+${money(lift[1])})` : ""}.`;
    S.push({ txt: dayTxt, src: "P&L" });
    breaches.forEach((b) => S.push({ txt: `${b.t}: ${b.d}.`, src: "IPS" }));
    const nBuys = fp.props.cards.filter((c) => c.kind === "Buy").length;
    const nAdj = fp.props.cards.length - nBuys;
    S.push({ txt: props.cards.length === 0
      ? `No proposition clears the bar (floor ${props.floor}, margin +6) — a no-trade day, held with intent.`
      : `${nBuys ? nBuys + " buy" + (nBuys > 1 ? "s" : "") : "No buys"}${nAdj ? ` and ${nAdj} readjustment${nAdj > 1 ? "s" : ""}` : ""} clear${props.cards.length === 1 ? "s" : ""} the gates${props.gateLog.length ? ` (${props.gateLog.length} candidate${props.gateLog.length > 1 ? "s" : ""} blocked at G1/G3)` : ""}.`, src: "ENGINE" });
    S.push({ txt: news.items.length ? `${news.items.length} of ${news.total} news items are material to the book.` : `Nothing in the tape is material to holdings today.`, src: "NEWS" });
    const doLine = breaches.length
      ? `Do: fix ${breaches[0].t.toLowerCase()} first${props.cards.length ? ", then take the cards below" : ""} — then log off.`
      : props.cards.length ? `Do: work the ${props.cards.length} card${props.cards.length > 1 ? "s" : ""} below — then log off.` : `Do: nothing. Close the app; the crew keeps watch.`;
    return { sentences: S, doLine };
  }

  // optional LLM polish — cached one per day; falls back silently.
  // Returns body prose ONLY — the UI renders the Do-line itself in the green box.
  async function polishBrief(fp, brief) {
    const ai = window.helmAI || (window.claude && window.claude.complete ? window.claude : null);
    if (!ai) return null;
    const key = "helm_chief_brief_v3"; // v3: v2 cache had markdown headers + duplicated Do-line
    const facts = brief.sentences.map((s) => `[${s.src}] ${s.txt}`).join("\n");
    let fh = 0; for (let i = 0; i < facts.length; i++) { fh = (fh * 31 + facts.charCodeAt(i)) | 0; }
    try {
      const c = JSON.parse(localStorage.getItem(key) || "null");
      // regenerate when the facts materially change (e.g. live feed landing after mount)
      if (c && c.day === new Date().toISOString().slice(0, 10) && c.fh === fh) return c.text;
    } catch (e) {}
    try {
      const prompt = `You are Rhodes, a terse ex-military first mate. Rewrite the facts below as ONE plain-text paragraph (<=80 words) in a PM's voice.\nHARD RULES: plain prose only — no markdown, no asterisks, no headers, no bullet lists, no line breaks. Every fact must appear, including the regime line. These are PROPOSALS awaiting the captain's decision — NEVER say executed, traded, filled, done, or booked. Do NOT write a Do/action line — the app renders that separately. No new numbers, names, or claims.\nFACTS:\n${facts}\nReturn the paragraph only.`;
      const res = await (ai.complete ? ai.complete(prompt) : ai(prompt));
      let text = typeof res === "string" ? res.trim() : null;
      if (text) {
        text = text.replace(/[*#_`]+/g, "").replace(/\s*\n+\s*/g, " ").trim(); // markdown/linebreak guard
        const doIdx = text.search(/\bDo:/i); if (doIdx > 20) text = text.slice(0, doIdx).trim(); // Do-line guard
      }
      if (text && /execut|traded|filled|booked/i.test(text)) text = null; // hallucination guard
      if (text && text.length > 40) { localStorage.setItem(key, JSON.stringify({ day: new Date().toISOString().slice(0, 10), fh, text })); return text; }
    } catch (e) {}
    return null;
  }

  window.HelmChief = { factPack, buildCards, getNews, composeBrief, polishBrief };
})();
