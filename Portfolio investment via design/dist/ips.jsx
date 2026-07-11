// ips.jsx — Investment Policy Statement, enforced (Phase 1c of the autonomy roadmap).
//
// The Plan already COMPUTES a policy (bucket target bands, volatile-offense risk budget,
// funded status, breach govMode) — but it only DISPLAYS it, inline, and only the volatile
// sleeve is ever checked. Nothing checks a single proposed trade against the policy.
//
// Per the user's own Copilot framework ("if a candidate violates IPS, it cannot pass"),
// this formalizes the Plan into a reusable, enforced boundary that every surface reads:
//   HelmIPS.policy()       → the constraint set derived from the Plan
//   HelmIPS.check(view)    → current portfolio breaches (bucket bands, sleeve, concentration)
//   HelmIPS.checkTrade(t)  → does THIS proposed buy/add comply? hard-blocks vs soft breaches
// Enforcement strength follows the Plan's existing govMode: Off / Warn / Confirm.
// A-Light: it flags and (at Confirm) gates — it never silently places or blocks an order.
const { useState: useIpsState } = React;

const ipsUP = "#0e9f6e", ipsDN = "#e02424", ipsWARN = "#d97706", ipsBLUE = "#2563eb";

// single-name concentration cap by profile (household discipline — the "no one bet dominates")
const IPS_MAXPOS = { Conservative: 8, Balanced: 12, Aggressive: 16 };

function ipsPlan() { return (window.HelmPlan && window.HelmPlan.loadPlan) ? window.HelmPlan.loadPlan() : null; }
function ipsView() { return (window.PMData && window.PMData.buildView) ? window.PMData.buildView("all") : null; }

// derive the full policy from the Plan — the IPS "document"
function ipsPolicy() {
  const p = ipsPlan();
  const HP = window.HelmPlan;
  if (!p || !HP) return null;
  const view = ipsView();
  const current = view ? view.kpis.equity : 0;
  const f = HP.fundedCalc(p, current);
  const targets = HP.PROFILE_TARGETS[p.riskProfile] || HP.PROFILE_TARGETS.Aggressive;
  return {
    profile: p.riskProfile,
    buckets: targets,                       // {bucket: [target, lo, hi]}
    specCap: p.specCap,                     // volatile-offense risk budget (%)
    maxDrawdown: p.maxDrawdown,
    maxSinglePos: IPS_MAXPOS[p.riskProfile] || 12,
    requiredReturn: f.requiredReturn,       // %/yr to fully fund the goal
    planningReturn: p.planningReturn,
    fundedStatus: f.status,                 // Behind | On Track | Ahead
    fundedRatio: f.ratio,
    govMode: p.govMode || "Warn",           // Off | Warn | Confirm
    yearsToGoal: f.n,
  };
}

// current portfolio compliance
function ipsCheck() {
  const pol = ipsPolicy();
  const HP = window.HelmPlan, view = ipsView();
  if (!pol || !HP || !view) return { breaches: [], within: true, constraints: [], pol };
  const eq = view.kpis.equity || 1;
  const sums = { "Core Growth": 0, Ballast: 0, Satellite: 0, "Volatile Offense": 0 };
  view.holdings.forEach((h) => { sums[HP.bucketOf(h)] += h.dispValue; });
  sums.Ballast += view.kpis.cash;
  const pct = {}; HP.BUCKETS.forEach((b) => (pct[b] = (sums[b] / eq) * 100));

  const breaches = [];
  // 1) volatile-offense risk budget
  const volOver = pct["Volatile Offense"] - pol.specCap;
  if (volOver > 0.5) breaches.push({ code: "vol-budget", title: "Volatile-offense over budget",
    detail: `${pct["Volatile Offense"].toFixed(0)}% vs ${pol.specCap}% budget — ${volOver.toFixed(0)} pts over`,
    severity: pol.fundedStatus === "Ahead" ? "high" : "warn", go: "Plan", rule: "Strategic risk budget" });
  // 2) bucket target bands
  HP.BUCKETS.forEach((b) => {
    const band = pol.buckets[b]; if (!band) return;
    const [, lo, hi] = band;
    if (pct[b] > hi + 0.5) breaches.push({ code: "band-" + b, title: `${b} above band`,
      detail: `${pct[b].toFixed(0)}% vs ${lo}–${hi}% target`, severity: b === "Volatile Offense" ? "high" : "warn", go: "Plan", rule: "Strategic allocation bands" });
    else if (pct[b] < lo - 0.5 && b !== "Volatile Offense") breaches.push({ code: "band-lo-" + b, title: `${b} below band`,
      detail: `${pct[b].toFixed(0)}% vs ${lo}–${hi}% target`, severity: "info", go: "Plan", rule: "Strategic allocation bands" });
  });
  // 3) single-name concentration
  const over = view.holdings.filter((h) => eq && (h.dispValue / eq) * 100 > pol.maxSinglePos + 0.5)
    .map((h) => ({ t: h.ticker, w: (h.dispValue / eq) * 100 })).sort((a, b) => b.w - a.w);
  if (over.length) breaches.push({ code: "concentration", title: "Single-name concentration",
    detail: `${over[0].t} at ${over[0].w.toFixed(0)}% vs ${pol.maxSinglePos}% cap${over.length > 1 ? ` (+${over.length - 1} more)` : ""}`,
    severity: "warn", go: "Holdings", rule: "Concentration cap" });
  // 4) funded status
  if (pol.fundedStatus === "Behind") breaches.push({ code: "funded", title: "Funded ratio behind",
    detail: `${(pol.fundedRatio * 100).toFixed(0)}% funded — return pressure high`, severity: "warn", go: "Plan", rule: "Funded-ratio status" });

  const constraints = [
    { k: "Risk profile", v: pol.profile, status: "info" },
    { k: "Volatile-offense budget", v: `≤ ${pol.specCap}%`, status: volOver > 0.5 ? "breach" : "ok", now: `${pct["Volatile Offense"].toFixed(0)}%` },
    { k: "Single-name concentration", v: `≤ ${pol.maxSinglePos}%`, status: over.length ? "breach" : "ok", now: over.length ? `${over[0].w.toFixed(0)}%` : "within" },
    { k: "Core Growth band", v: `${pol.buckets["Core Growth"][1]}–${pol.buckets["Core Growth"][2]}%`, status: (pct["Core Growth"] > pol.buckets["Core Growth"][2] + 0.5 || pct["Core Growth"] < pol.buckets["Core Growth"][1] - 0.5) ? "breach" : "ok", now: `${pct["Core Growth"].toFixed(0)}%` },
    { k: "Ballast band", v: `${pol.buckets.Ballast[1]}–${pol.buckets.Ballast[2]}%`, status: (pct.Ballast > pol.buckets.Ballast[2] + 0.5 || pct.Ballast < pol.buckets.Ballast[1] - 0.5) ? "breach" : "ok", now: `${pct.Ballast.toFixed(0)}%` },
    { k: "Max drawdown tolerance", v: `${pol.maxDrawdown}%`, status: "info" },
    { k: "Required return to fund goal", v: pol.requiredReturn == null ? "—" : `${pol.requiredReturn.toFixed(1)}%/yr`, status: pol.requiredReturn != null && pol.requiredReturn > pol.planningReturn + 0.05 ? "pressure" : "ok", now: `plan ${pol.planningReturn}%` },
    { k: "Registered accounts", v: "no direct crypto", status: "hard" },
    { k: "Currency match", v: "USD asset → USD acct", status: "hard" },
  ];
  return { breaches, within: breaches.filter((b) => b.severity !== "info").length === 0, constraints, pct, pol };
}

// gate a single proposed trade. t = { ticker, sector, action, amount, acct, curWeightPct, equity, reg, ccy, market }
function ipsCheckTrade(t) {
  const pol = ipsPolicy();
  if (!pol || !t) return { ok: true, hardBlock: false, breaches: [], note: null };
  const breaches = [];
  let hardBlock = false;
  const isBuy = /buy|add|accept|dca/i.test(t.action || "buy");
  const isCrypto = t.sector === "Crypto" || t.market === "Crypto";
  const directCoin = isCrypto && !/\.(TO|B)$/.test(t.ticker || "") && !/Q$|ETF/i.test(t.ticker || "") && (t.ticker || "").length <= 5;

  // ---- HARD rules (cannot pass) — mirror the account-eligibility discipline ----
  if (isBuy && directCoin && t.reg) { hardBlock = true; breaches.push({ code: "reg-crypto", severity: "hard", msg: "Registered account can't hold direct crypto — route to the crypto account." }); }
  if (isBuy && t.ccy && t.assetCcy && t.ccy !== t.assetCcy) { hardBlock = true; breaches.push({ code: "ccy", severity: "hard", msg: `${t.assetCcy} asset must go in a ${t.assetCcy} account.` }); }

  // ---- POLICY rules (warn / confirm per govMode) ----
  if (isBuy) {
    // projected single-name weight after the buy
    const addPct = t.equity ? (t.amount / t.equity) * 100 : 0;
    const afterW = (t.curWeightPct || 0) + addPct;
    if (afterW > pol.maxSinglePos + 0.5) breaches.push({ code: "concentration", severity: "warn",
      msg: `Would take ${t.ticker} to ${afterW.toFixed(0)}% — over the ${pol.maxSinglePos}% concentration cap.` });
    // adding to volatile offense while the sleeve is already over budget (worse if funded Ahead)
    if (isCrypto) {
      const chk = ipsCheck();
      const volNow = chk.pct ? chk.pct["Volatile Offense"] : 0;
      if (volNow > pol.specCap + 0.5) breaches.push({ code: "vol-budget", severity: pol.fundedStatus === "Ahead" ? "high" : "warn",
        msg: `Volatile sleeve already ${volNow.toFixed(0)}% (budget ${pol.specCap}%)${pol.fundedStatus === "Ahead" ? " and you're funded Ahead — policy says de-risk, not add" : ""}.` });
    }
    // funded Ahead → de-risking posture, adding risk is off-policy (soft)
    if (pol.fundedStatus === "Ahead" && isCrypto) breaches.push({ code: "posture", severity: "info", msg: "Funded Ahead — glidepath favours de-risking over new volatile adds." });
  }

  const blocking = hardBlock || (pol.govMode === "Confirm" && breaches.some((b) => b.severity === "high" || b.severity === "warn"));
  return { ok: breaches.length === 0, hardBlock, blocking, govMode: pol.govMode, breaches, note: breaches[0] ? breaches[0].msg : null };
}

window.HelmIPS = { policy: ipsPolicy, check: ipsCheck, checkTrade: ipsCheckTrade };

// ---- IPS constraint panel (for the Plan page) — makes the enforced policy tangible ----
function IPSPanel({ accent }) {
  const [, force] = useIpsState(0);
  React.useEffect(() => {
    const h = () => force((n) => n + 1);
    window.addEventListener("helm:feed", h); window.addEventListener("storage", h);
    return () => { window.removeEventListener("helm:feed", h); window.removeEventListener("storage", h); };
  }, []);
  const chk = ipsCheck();
  if (!chk || !chk.pol) return null;
  const pol = chk.pol;
  const nBreach = chk.breaches.filter((b) => b.severity !== "info").length;
  const statusColor = (s) => s === "breach" ? ipsDN : s === "pressure" ? ipsWARN : s === "hard" ? ipsBLUE : s === "info" ? "var(--muted)" : ipsUP;
  const statusLabel = (s) => s === "breach" ? "breach" : s === "pressure" ? "pressure" : s === "hard" ? "hard rule" : s === "info" ? "—" : "within";

  return (
    <section className="pm-card ips">
      <style>{IPS_CSS}</style>
      <div className="ips-head">
        <div>
          <div className="pm-card-eyebrow">Investment Policy Statement · enforced</div>
          <div className="ips-title">The policy the engine checks every proposal against</div>
        </div>
        <div className={`ips-status ${nBreach ? "breach" : "ok"}`}>
          {nBreach ? <>▲ {nBreach} breach{nBreach === 1 ? "" : "es"}</> : <>✓ Within policy</>}
          <span className="ips-gov">enforcement · {pol.govMode}</span>
        </div>
      </div>
      <div className="ips-grid">
        {chk.constraints.map((c) => (
          <div className="ips-con" key={c.k}>
            <div className="ips-con-k">{c.k}</div>
            <div className="ips-con-v">{c.v}</div>
            <div className="ips-con-s" style={{ color: statusColor(c.status) }}>
              {c.now && c.status !== "hard" && c.status !== "info" ? <span className="ips-con-now">{c.now}</span> : null}
              {statusLabel(c.status)}
            </div>
          </div>
        ))}
      </div>
      <div className="ips-foot">
        Enforcement follows your <strong>{pol.govMode}</strong> setting (Plan → governance): <em>Warn</em> flags an off-policy trade; <em>Confirm</em> gates it behind an explicit override. Hard rules (registered-account crypto, currency match) can never pass. Precedence: policy → funded status → regime → signal.
      </div>
    </section>
  );
}

const IPS_CSS = `
.ips-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-bottom: 14px; flex-wrap: wrap; }
.ips-title { font-size: 16px; font-weight: 700; margin-top: 3px; }
.ips-status { font-size: 12.5px; font-weight: 700; padding: 7px 13px; border-radius: 10px; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex: none; }
.ips-status.ok { background: color-mix(in srgb, #0e9f6e 10%, white); color: #0a7d57; }
.ips-status.breach { background: color-mix(in srgb, #e02424 9%, white); color: #c11515; }
.ips-gov { font-size: 10px; font-weight: 600; font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.75; }
.ips-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.ips-con { border: 1px solid var(--line); border-radius: 10px; padding: 11px 13px; }
.ips-con-k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin-bottom: 4px; }
.ips-con-v { font-size: 14px; font-weight: 700; }
.ips-con-s { font-size: 11px; font-weight: 600; font-family: var(--mono); margin-top: 4px; display: flex; justify-content: space-between; align-items: baseline; }
.ips-con-now { color: var(--ink-2); font-weight: 500; }
.ips-foot { font-size: 11.5px; color: var(--muted); margin-top: 13px; line-height: 1.55; }
.ips-foot strong { color: var(--ink-2); } .ips-foot em { font-style: normal; font-weight: 600; color: var(--ink-2); }
@media (max-width: 820px) { .ips-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 560px) { .ips-grid { grid-template-columns: 1fr; } }
`;

window.IPSPanel = IPSPanel;
