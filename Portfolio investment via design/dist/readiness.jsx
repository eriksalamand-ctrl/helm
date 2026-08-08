// readiness.jsx — honest "proposal readiness" trust-ladder banner.
// Tells the user how far a proposal is from real-money-ready: data source, forward record,
// cost/tax adjustment, sample size. Reads HelmFeed.status + the Tracker journal. No hype.
(function () {
  const RJ_KEY = "helm_tracker_journal_v1";
  const load = () => { try { return JSON.parse(localStorage.getItem(RJ_KEY) || "[]"); } catch (e) { return []; } };

  // returns the 4 trust-ladder rungs + an overall verdict
  window.HelmReadiness = function () {
    const feed = window.HelmFeed && window.HelmFeed.status;
    const live = !!(feed && feed.live);
    const journal = load();
    let fwdDays = 0;
    if (journal.length >= 2) {
      const ds = journal.map((e) => +new Date(e.date)).filter((n) => !isNaN(n));
      if (ds.length >= 2) fwdDays = Math.round((Math.max(...ds) - Math.min(...ds)) / 86400000);
    }
    const rungs = [
      { k: "Real market data", ok: live, note: live ? "live feed connected" : "synthetic / demo prices — backtests run on generated paths" },
      { k: "Forward track record", ok: fwdDays >= 60, partial: fwdDays > 0, note: fwdDays > 0 ? `${fwdDays} day${fwdDays === 1 ? "" : "s"} of logged forward marking${fwdDays < 60 ? " — need ~60+" : ""}` : "0 days — nothing marked forward against real prices yet" },
      { k: "Cost & tax adjusted", ok: false, note: "gross returns only — no commissions, slippage or Québec 26.65% modeled" },
      { k: "Statistically significant", ok: journal.length >= 20, partial: journal.length > 0, note: `${journal.length} snapshot${journal.length === 1 ? "" : "s"} across regimes — need a fuller sample` },
    ];
    const score = rungs.filter((r) => r.ok).length;
    let verdict, vcolor;
    if (score >= 4) { verdict = "Validation-grade — review before sizing"; vcolor = "#0e9f6e"; }
    else if (score >= 2) { verdict = "Early validation — paper-trade only"; vcolor = "#d97706"; }
    else { verdict = "NOT ready for live capital — research only"; vcolor = "#e02424"; }
    return { rungs, score, total: rungs.length, verdict, vcolor, live, fwdDays, snapshots: journal.length };
  };

  if (typeof document !== "undefined" && !document.getElementById("helm-readiness-css")) {
    const st = document.createElement("style"); st.id = "helm-readiness-css";
    st.textContent = `
.helm-ready { border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; background: var(--panel); }
.helm-ready-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.helm-ready-badge { font-family: var(--mono); font-size: 11px; font-weight: 700; color: #fff; padding: 4px 11px; border-radius: 99px; white-space: nowrap; }
.helm-ready-title { font-size: 12.5px; font-weight: 700; color: var(--ink); }
.helm-ready-score { font-family: var(--mono); font-size: 11.5px; color: var(--muted); margin-left: auto; }
.helm-ready-rungs { display: flex; flex-direction: column; gap: 6px; }
.helm-ready-rung { display: grid; grid-template-columns: 18px 150px 1fr; gap: 10px; align-items: baseline; font-size: 12px; }
.helm-ready-ico { font-weight: 700; font-size: 13px; }
.helm-ready-k { font-weight: 600; color: var(--ink); }
.helm-ready-note { color: var(--ink-2); }
.helm-ready-foot { font-size: 11px; color: var(--muted); margin-top: 10px; line-height: 1.5; }
@media (max-width: 620px) { .helm-ready-rung { grid-template-columns: 18px 1fr; } .helm-ready-rung .helm-ready-note { grid-column: 2; } }
`;
    document.head.appendChild(st);
  }

  // React component (uses global React)
  window.ReadinessBanner = function ReadinessBanner(props) {
    const r = window.HelmReadiness();
    const e = React.createElement;
    return e("div", { className: "helm-ready" },
      e("div", { className: "helm-ready-head" },
        e("span", { className: "helm-ready-badge", style: { background: r.vcolor } }, "READINESS " + r.score + "/" + r.total),
        e("span", { className: "helm-ready-title", style: { color: r.vcolor } }, r.verdict),
        e("span", { className: "helm-ready-score" }, props.label || "before acting on any proposal")
      ),
      e("div", { className: "helm-ready-rungs" },
        r.rungs.map((rung) => e("div", { className: "helm-ready-rung", key: rung.k },
          e("span", { className: "helm-ready-ico", style: { color: rung.ok ? "#0e9f6e" : rung.partial ? "#d97706" : "#e02424" } }, rung.ok ? "✓" : rung.partial ? "◐" : "✗"),
          e("span", { className: "helm-ready-k" }, rung.k),
          e("span", { className: "helm-ready-note" }, rung.note)
        ))
      ),
      e("div", { className: "helm-ready-foot" }, "Each rung upgrades automatically as you wire the live feed and let the Tracker accrue real forward history. The app's job is to keep you honest about what's validated — not to flatter the model.")
    );
  };
})();
