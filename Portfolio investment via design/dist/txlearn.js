// txlearn.js — the transmission graph grading its own elasticities against reality.
//
// The curated weights in transmission-graph.js are hand-set judgements ("a Taiwan escalation
// costs TSM ~0.9"). Nobody ever checked whether they were RIGHT. This module closes that loop:
// every alert Helm has ever raised is already journaled (helm_tx_ledger_v1) with the tickers it
// touched and the weight it predicted; once the chokepoint's own speed horizon has passed, the
// realized move is knowable. So we measure it.
//
// Method (deliberately conservative):
//   • realized = the ticker's EXCESS return vs the broad market over the horizon (a chokepoint
//     claim is a relative claim — "this name suffers MORE than the tape", not "stocks fall").
//   • expected = w × REF[speed], where REF is the excess move a full-strength (|w|=1) edge should
//     produce: 4% for days-speed events, 6% weeks, 9% months.
//   • scale = median(realized / expected) across resolved observations, clamped to [-0.5, 2.5].
//     A scale near 1 means the curated weight was about right; 2 means it under-called the move;
//     a NEGATIVE scale means the edge had the sign backwards.
//   • blend = curated × (1 − k) + curated × scale × k, with k = min(0.5, n/12).
//     The curated graph is never fully overruled — evidence can at most half-move it — and with
//     few observations it barely moves at all. Sign flips damp toward zero rather than inverting.
//
// Honest limits: n is small by construction (chokepoints fire rarely), a single macro shock can
// move every name at once, and excess-vs-market is a crude control. This is calibration, not
// econometrics — which is why it is capped, always shows n, and never replaces the curated sign
// outright. Volatility-mode chokepoints (us-policy-shock) are EXCLUDED: they make no directional
// claim, so there is nothing to grade.
(function () {
  const LKEY = "helm_tx_ledger_v1";
  const REF = { days: 4, weeks: 6, months: 9 };          // % excess move a |w|=1 edge implies
  const HORIZON = { days: 5, weeks: 15, months: 45 };     // trading days until the claim is knowable
  const BENCH = "SPX";

  const ledger = () => { try { return JSON.parse(localStorage.getItem(LKEY) || "[]"); } catch (e) { return []; } };

  // trading-day distance between two ISO dates (calendar × 0.69, the inverse of the 1.4484 used elsewhere)
  function tdSince(iso) {
    const ms = Date.now() - new Date(iso + "T00:00:00Z").getTime();
    return Math.max(0, Math.round((ms / 86400000) * 0.69));
  }

  // excess return of `ticker` vs the benchmark over the LAST `win` trading days ending `agoTd` days back
  function excess(ticker, agoTd, win) {
    const S = window.HelmSigma; if (!S) return null;
    const a = S.seriesFor(ticker, 504), b = S.seriesFor(BENCH, 504);
    if (!a || !b || a.arr.length < agoTd + win + 2 || b.arr.length < agoTd + win + 2) return null;
    const cut = (arr) => { const end = arr.length - agoTd; return [arr[end - win], arr[end - 1]]; };
    const [a0, a1] = cut(a.arr), [b0, b1] = cut(b.arr);
    if (!a0 || !b0) return null;
    return { pct: ((a1 / a0 - 1) - (b1 / b0 - 1)) * 100, real: !!(a.real && b.real) };
  }

  const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((p, q) => p - q); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  // ---- the measured table: { "cp|TICKER": {n, scale, hit, real, obs:[…]} } ----
  let _memo = null, _memoDay = "";
  function stats() {
    const day = new Date().toISOString().slice(0, 10);
    if (_memo && _memoDay === day) return _memo;
    const G = window.HelmGraph, out = {};
    const led = ledger();
    led.forEach((e) => {
      const cp = G && G.chokepoints ? G.chokepoints[e.id] : null;
      if (!cp || cp.mode === "volatility") return;      // no directional claim → nothing to grade
      if (e.label !== "hot") return;                     // "watch" is explicitly not a call
      const hz = HORIZON[cp.speed] || 15, ref = REF[cp.speed] || 6;
      const age = tdSince(e.d);
      if (age < hz) return;                              // not knowable yet
      (e.tickers || []).forEach((t) => {
        if (t.w == null || !t.t) return;                 // pre-r4 rows carry no predicted weight
        const ex = excess(t.t, Math.max(0, age - hz), hz);
        if (!ex) return;
        const expected = t.w * ref;
        if (Math.abs(expected) < 0.4) return;            // too small a claim to grade
        const k = e.id + "|" + t.t;
        (out[k] = out[k] || { cp: e.id, ticker: t.t, obs: [], real: 0 }).obs.push({ d: e.d, ratio: ex.pct / expected, realized: ex.pct, expected });
        if (ex.real) out[k].real++;
      });
    });
    Object.values(out).forEach((r) => {
      r.n = r.obs.length;
      r.scale = Math.max(-0.5, Math.min(2.5, median(r.obs.map((o) => o.ratio))));
      r.hit = r.obs.filter((o) => o.ratio > 0).length / r.n;     // sign agreed
      r.k = Math.min(0.5, r.n / 12);
    });
    _memo = out; _memoDay = day;
    return out;
  }

  // effective weight for the FINAL hop (chokepoint → the name you hold)
  function effWeight(cpId, ticker, curated) {
    const r = stats()[cpId + "|" + ticker];
    if (!r || r.n < 2) return { w: curated, learned: false };
    const w = Math.max(-1, Math.min(1, curated * (1 - r.k) + curated * r.scale * r.k));
    return { w, learned: true, n: r.n, scale: r.scale, hit: r.hit, real: r.real, curated };
  }

  // roll-up for the UI: how well is the graph calibrated overall?
  function summary() {
    const rows = Object.values(stats()).filter((r) => r.n >= 2);
    if (!rows.length) return { rows: [], n: 0, pairs: 0 };
    const obs = rows.reduce((s, r) => s + r.n, 0);
    return {
      rows: rows.sort((a, b) => b.n - a.n),
      pairs: rows.length, n: obs,
      hit: rows.reduce((s, r) => s + r.hit * r.n, 0) / obs,
      scale: median(rows.map((r) => r.scale)),
      real: rows.reduce((s, r) => s + r.real, 0),
    };
  }

  window.HelmTxLearn = { stats, effWeight, summary, bust: () => { _memo = null; } };
})();
