// ledger.jsx — the unified prediction Ledger ("Quill's book"): ONE scoreboard across every
// crew voice that makes calls. Sources: Rhodes' daily proposition cards (journaled HERE —
// they used to vanish unscored), Flint's model books + your sim decisions (via HelmReflexion,
// which already scores those journals), and Vera's intake sources (via HelmIntake.credibility).
// Honest rules follow the house convention: a call only RESOLVES once aged ≥2d AND the price
// actually moved ≥0.2% (static seed price = uncovered, not wrong). Display-only — weights stay
// where they live (roundtable.jsx); this closes the "Rhodes is never scored" gap + gives one view.
(function () {
  const K = "helm_chief_ledger_v1";
  const load = () => { try { return JSON.parse(localStorage.getItem(K) || "null") || { cards: [] }; } catch (e) { return { cards: [] }; } };
  const save = (j) => { try { localStorage.setItem(K, JSON.stringify(j)); } catch (e) {} };
  const today = () => new Date().toISOString().slice(0, 10);
  const lastPrice = (t) => {
    const s = window.HelmSigma && window.HelmSigma.seriesFor(t, 10);
    return s && s.arr && s.arr.length ? { p: s.arr[s.arr.length - 1], real: !!s.real } : null;
  };

  // ---- writer: chief.jsx calls this with the day's cards (idempotent per day+ticker) ----
  function stamp(cards, regime) {
    if (!Array.isArray(cards) || !cards.length) return;
    const J = load(); const d = today();
    let added = 0;
    cards.forEach((c) => {
      if (!c || !c.ticker || !c.kind) return;
      if (J.cards.some((x) => x.d === d && x.t === c.ticker)) return; // one stamp per name per day
      const lp = lastPrice(c.ticker);
      J.cards.push({
        d, t: c.ticker, kind: c.kind, dir: c.kind === "Buy" ? 1 : -1,
        p0: lp ? lp.p : null,
        regime: (regime && (regime.key || regime.label)) || "",
        verdict: (c.vote && c.vote.verdict) || "",
      });
      added++;
    });
    if (added) { J.cards = J.cards.slice(-300); save(J); }
  }

  // ---- scoring Rhodes' cards: direction right beyond noise at ~1 month, house resolve rule ----
  const NOISE = 2.5; // % — propositions are position-trade calls; tighter than intake's mo bar
  function scoreCard(c) {
    const lp = c.p0 ? lastPrice(c.t) : null;
    if (!lp || !c.p0) return { ...c, status: "untracked" };
    const move = (lp.p / c.p0 - 1) * 100;
    const ageD = Math.round((Date.now() - new Date(c.d).getTime()) / 86400000);
    if (ageD < 2 || Math.abs(move) < 0.2) return { ...c, status: "open", move, ageD };
    // Buy → wants up; Trim/Exit → right if the name did NOT keep running past noise
    const hit = c.dir > 0 ? move > NOISE : move < NOISE;
    const flat = Math.abs(move) <= NOISE;
    return { ...c, status: "resolved", move, ageD, hit, flat };
  }

  function chiefBoard() {
    const cards = load().cards.map(scoreCard);
    const res = cards.filter((c) => c.status === "resolved");
    const hits = res.filter((c) => c.flat ? false : c.hit).length + res.filter((c) => c.flat).length * 0.5;
    return {
      n: cards.filter((c) => c.status !== "untracked").length,
      open: cards.filter((c) => c.status === "open").length,
      resolved: res.length,
      hit: res.length ? hits / res.length : null,
      cards,
    };
  }

  // ---- the unified board: one row per voice/book/source ----
  function board() {
    const rows = [];
    const ch = chiefBoard();
    rows.push({ who: "Chief", what: "propositions", n: ch.n, open: ch.open, resolved: ch.resolved, hit: ch.hit, note: ch.n ? "" : "stamps start today — every brief card is now journaled" });
    try {
      const R = window.HelmReflexion && window.HelmReflexion.compute();
      const bm = (R && R.buckets && R.buckets.byModel) || (R && R.byModel) || [];
      bm.forEach((b) => {
        const sim = /sim|accept|paper|you/i.test(b.k);
        rows.push({ who: sim ? "You" : "Flint", what: b.k, n: b.n, open: null, resolved: b.n, hit: b.hit, note: "" });
      });
      if (!bm.length && R && R.summary && R.summary.nResolved) rows.push({ who: "Flint", what: "model books + sim", n: R.summary.nTotal, open: R.summary.nTotal - R.summary.nResolved, resolved: R.summary.nResolved, hit: R.summary.hitRate, note: "" });
    } catch (e) {}
    try {
      const I = window.HelmIntake;
      if (I && I.credibility && I.load) {
        const by = I.credibility(I.load()) || {};
        Object.entries(by).forEach(([src, b]) => {
          const res = (b.right || 0) + (b.wrong || 0) + (b.flat || 0);
          rows.push({ who: "Vera", what: src, n: b.n, open: b.open, resolved: res, hit: b.score != null ? b.score / 100 : null, note: res < 3 ? "needs ≥3 resolved" : "" });
        });
      }
    } catch (e) {}
    return rows;
  }

  // ---- Bridge card body ----
  function LedgerBoard() {
    const rows = board();
    const scored = rows.filter((r) => r.hit != null);
    const fmt = (h) => Math.round(h * 100) + "%";
    const col = (h) => (h >= 0.5 ? "var(--up, #1d9a6c)" : "var(--dn, #c43d3d)");
    return (
      <div>
        <style>{`.lg-tbl{width:100%;border-collapse:collapse;font-size:12px}.lg-tbl td,.lg-tbl th{padding:4px 6px;border-top:1px solid var(--line-2,#f0f2f5);text-align:right;white-space:nowrap}.lg-tbl th{color:var(--muted);font-weight:600;border-top:none;font-size:11px}.lg-tbl td:first-child,.lg-tbl th:first-child{text-align:left}.lg-who{font-weight:700}.lg-what{color:var(--muted);font-weight:400;max-width:110px;overflow:hidden;text-overflow:ellipsis;display:inline-block;vertical-align:bottom}.lg-note{font-size:11px;color:var(--muted);margin-top:6px}`}</style>
        {rows.length ? (
          <table className="lg-tbl">
            <thead><tr><th>Voice · book</th><th>calls</th><th>open</th><th>hit</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} title={r.note || r.what}>
                  <td><span className="lg-who">{r.who}</span> <span className="lg-what">{r.what}</span></td>
                  <td className="mono">{r.n || 0}</td>
                  <td className="mono">{r.open == null ? "—" : r.open}</td>
                  <td className="mono" style={{ color: r.hit != null ? col(r.hit) : "var(--muted)", fontWeight: 700 }}>{r.hit != null ? fmt(r.hit) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="lg-note">No calls logged yet.</div>}
        <div className="lg-note">One book. Every proposition, model pick, and intake claim — stamped at entry, resolved ≥2d after a real move. Hit ≥50% green. <button className="br-link" onClick={() => window.dispatchEvent(new CustomEvent("helm:nav", { detail: "learning" }))}>Full reflexion →</button></div>
      </div>
    );
  }

  window.HelmLedger = { stamp, board, chiefBoard };
  window.LedgerBoard = LedgerBoard;
})();
