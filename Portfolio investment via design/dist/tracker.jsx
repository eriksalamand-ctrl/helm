// roundtable.jsx — the weighted round table (Borda + credibility, from the autonomy research).
// Turns the crew's per-card stances into a REAL vote: each voice's ballot is weighted by its
// MEASURED track record — Flint by the engine's resolved hit-rate (Reflexion ledger) plus the
// per-regime/sector calibration adjustment; Iris by how the regime/macro lenses are scoring in
// the CURRENT regime (Methodology registry); Vera by her intake sources' resolved hit% (Vera
// intake ledger). No track record yet → weight 1.0, said honestly. Advisory: the verdict sets a
// SIZE factor and a label — it never places orders and never overrides the hard gates.
(function () {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function weights() {
    const out = {
      vera: { w: 1, why: "no resolved intake sources yet — neutral weight", n: 0 },
      iris: { w: 1, why: "methodology registry not scored yet — neutral weight", n: 0 },
      flint: { w: 1, why: "no resolved engine predictions yet — neutral weight", n: 0 },
    };
    // Flint — the engine's own resolved predicted-vs-realized record
    try {
      const c = window.HelmReflexion && window.HelmReflexion.compute();
      const S = c && c.summary;
      if (S && S.nResolved >= 10 && S.hitRate != null) {
        out.flint = { w: clamp(0.5 + S.hitRate, 0.6, 1.4), n: S.nResolved,
          why: `engine hit ${Math.round(S.hitRate * 100)}% on ${S.nResolved} resolved calls${S.evError != null && Math.abs(S.evError) > 0.06 ? ` · ${S.evError > 0 ? "over" : "under"}confident ${Math.round(Math.abs(S.evError) * 100)}pts` : ""}` };
      }
    } catch (e) {}
    // Iris — regime/macro lens success in the CURRENT regime family
    try {
      const M = window.HelmMethods;
      if (M && Array.isArray(M.weights) && M.weights.length) {
        const mine = M.weights.filter((x) => /regime|markov|macro|liquid/i.test(x.k));
        if (mine.length) {
          const avg = mine.reduce((s, x) => s + x.w, 0) / mine.length;
          out.iris = { w: clamp(avg, 0.6, 1.4), n: mine.length,
            why: `regime+macro lenses scoring ×${avg.toFixed(2)} in the current regime (${M.fam})` };
        }
      }
    } catch (e) {}
    // Vera — outside-source credibility from the intake ledger (resolved claims only)
    try {
      const I = window.HelmIntake;
      if (I && I.load && I.credibility) {
        const by = I.credibility(I.load());
        let hits = 0, res = 0;
        Object.keys(by).forEach((s) => { const b = by[s]; const r = b.right + b.wrong + b.flat; if (b.score != null) { hits += (b.right + b.flat * 0.5); res += r; } });
        if (res >= 3) out.vera = { w: clamp(0.5 + hits / res, 0.6, 1.4), n: res,
          why: `intake sources hit ${Math.round((hits / res) * 100)}% on ${res} resolved claims` };
      }
    } catch (e) {}
    return out;
  }

  // ballot: does this voice's stance support THE CARD'S ACTION?
  function ballot(token, kind) {
    const t = token || "";
    if (kind === "Buy") {
      if (/BUY|SUPPORTIVE/.test(t)) return 1;
      if (/NO SHOT/.test(t)) return -1;
      if (/CAUTION|SMALLER|WATCH/.test(t)) return -0.5;
      return 0; // NEUTRAL / HOLD FIRE
    }
    // Trim / Exit cards: caution AGREES with de-risking
    if (/TRIM|EXIT/.test(t)) return 1;
    if (/CAUTION|SMALLER|WATCH|NO SHOT/.test(t)) return 0.5;
    if (/BUY|SUPPORTIVE/.test(t)) return -0.5;
    return 0;
  }

  function vote(stances, kind, ctx) {
    const W = weights();
    const byVoice = {};
    let score = 0, max = 0;
    ["vera", "iris", "flint"].forEach((k) => {
      if (!stances[k]) return;
      let w = W[k].w, adjWhy = null;
      // Flint's ballot is additionally calibrated to THIS card's regime × sector blind spots
      if (k === "flint" && ctx && window.HelmReflexion && window.HelmReflexion.adjustment) {
        try { const a = window.HelmReflexion.adjustment(ctx.regime, ctx.sector); if (a && a.mult !== 1) { w = clamp(w * a.mult, 0.5, 1.5); if (a.why && a.why.length) adjWhy = a.why[0]; } } catch (e) {}
      }
      const s = ballot(stances[k][0], kind);
      byVoice[k] = { w, s, why: W[k].why + (adjWhy ? " · " + adjWhy : ""), n: W[k].n };
      score += w * s; max += w;
    });
    const ratio = max ? score / max : 0;
    const verdict = ratio >= 0.85 ? "UNANIMOUS" : ratio >= 0.45 ? "MAJORITY" : ratio >= 0.1 ? "LEAN" : ratio > -0.1 ? "SPLIT" : "AGAINST";
    const sizeFactor = verdict === "UNANIMOUS" || verdict === "MAJORITY" ? 1 : verdict === "LEAN" ? 0.85 : verdict === "SPLIT" ? 0.7 : 0.5;
    const tracked = Object.values(byVoice).some((v) => v.n > 0);
    return { byVoice, score, max, ratio, verdict, sizeFactor, tracked,
      line: `${score.toFixed(1)} of ${max.toFixed(1)} weighted` };
  }

  window.HelmRoundTable = { weights, vote };
})();
