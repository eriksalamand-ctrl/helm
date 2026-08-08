// engineconfig.js — the applied-edits layer (Phase 1b: close the Learning-Lab loop).
//
// Until now every learning surface was one-way: Learning Lab could ACCEPT a candidate
// rule and "promote" a version, but promotion only wrote a registry row — the live
// signalsFor() never changed. This is the missing write path: a persistent, reversible
// override the engine actually reads. An approved candidate calls HelmConfig.apply(...),
// signalsFor() merges it, and every surface (Screener, Tracker, Cockpit, Papersim) runs
// the edited engine. Nothing is applied without an explicit click, and Reset restores
// the baseline instantly. This is A-Light: harness-level config edits only — never a
// model retrain, never a broker order.
(function () {
  const KEY = "helm_engine_overrides_v1";

  const EMPTY = { weights: null, bars: null, rules: [], meta: null };

  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!o || typeof o !== "object") return { ...EMPTY };
      return { weights: o.weights || null, bars: o.bars || null,
               rules: Array.isArray(o.rules) ? o.rules : [], meta: o.meta || null };
    } catch (e) { return { ...EMPTY }; }
  }
  function persist(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }

  let state = load();

  function notify() {
    try { window.dispatchEvent(new Event("helm:config")); } catch (e) {}
  }

  const HelmConfig = {
    // current overrides (may be empty)
    get() { return state; },
    // is the live engine running anything other than baseline?
    isActive() { return !!(state.weights || state.bars || (state.rules && state.rules.length)); },

    // merge overrides onto a preset cfg — called by strategy.jsx presetCfg()
    applyTo(cfg) {
      if (!cfg) return cfg;
      const out = { ...cfg };
      if (state.weights) out.weights = { ...cfg.weights, ...state.weights };
      if (state.bars) Object.keys(state.bars).forEach((k) => { if (state.bars[k] != null) out[k] = state.bars[k]; });
      return out;
    },
    // the accepted candidate-rule ids the engine should post-apply (resolved at call time
    // against window.HelmCandidateRules, which learninglab.jsx publishes)
    activeRules() { return state.rules || []; },

    // apply an approved edit. patch = { weights?, bars?, rules?, meta:{source,version,label,note} }
    apply(patch) {
      if (!patch) return;
      const next = {
        weights: patch.weights !== undefined ? patch.weights : state.weights,
        bars: patch.bars !== undefined ? patch.bars : state.bars,
        rules: patch.rules !== undefined ? patch.rules : state.rules,
        meta: { ...(patch.meta || {}), date: new Date().toISOString().slice(0, 10), ts: Date.now() },
      };
      state = next; persist(next); notify();
      // append to an applied-edits ledger (audit trail, separate from the live override)
      try {
        const L = JSON.parse(localStorage.getItem("helm_engine_edits_log_v1") || "[]");
        L.unshift({ action: "apply", ...next.meta, weights: next.weights, bars: next.bars, rules: next.rules });
        localStorage.setItem("helm_engine_edits_log_v1", JSON.stringify(L.slice(0, 50)));
      } catch (e) {}
      return next;
    },
    reset(note) {
      state = { ...EMPTY }; persist(state); notify();
      try {
        const L = JSON.parse(localStorage.getItem("helm_engine_edits_log_v1") || "[]");
        L.unshift({ action: "reset", date: new Date().toISOString().slice(0, 10), ts: Date.now(), note: note || "reverted to baseline" });
        localStorage.setItem("helm_engine_edits_log_v1", JSON.stringify(L.slice(0, 50)));
      } catch (e) {}
    },
    log() { try { return JSON.parse(localStorage.getItem("helm_engine_edits_log_v1") || "[]"); } catch (e) { return []; } },
  };

  window.HelmConfig = HelmConfig;
})();
