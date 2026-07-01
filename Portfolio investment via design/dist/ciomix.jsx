// ciomix.jsx — Chief Investment Office top-down asset mix across accounts.
// Proposes a target balance between US growth, Canada defensive, Crypto sleeve (+ cash/ballast)
// driven by regime, macro (rates/liquidity/USD proxy) and the chosen portfolio type. Sets
// window.HelmCIOMix(preset) → { targets:{us,ca,crypto,cash}, drivers, note }. Honest heuristic.
(function () {
  // real medium-term US-vs-Canada relative strength from feed index history (SPX vs TSX).
  // Returns a signed lean: >0 = US leading, <0 = Canada leading, null if no data.
  function usCaRS() {
    const P = window.HelmFeed && window.HelmFeed.prices;
    if (!P || !P.SPX || !P.TSX) return null;
    const ret = (series, days) => {
      if (!series || series.length < days + 1) return null;
      const a = series[series.length - 1].c, b = series[series.length - 1 - days].c;
      return b ? (a - b) / b * 100 : null;
    };
    // blend 3-month (63d) and 6-month (126d) relative return
    const parts = [];
    [[63, 0.5], [126, 0.5]].forEach(([d, w]) => {
      const us = ret(P.SPX, d), ca = ret(P.TSX, d);
      if (us != null && ca != null) parts.push([(us - ca), w]);
    });
    if (!parts.length) return null;
    const wsum = parts.reduce((s, p) => s + p[1], 0);
    return parts.reduce((s, p) => s + p[0] * p[1], 0) / wsum; // pp of US-minus-CA relative return
  }

  function usdProxy() {
    // no free DXY — proxy USD strength from real rates + risk regime (higher rates + risk-off = stronger USD)
    const m = window.HelmFeed && window.HelmFeed.macro;
    const r = window.HelmRegime;
    let s = 50;
    if (m && m.us10y && m.us10y.length) { const y = m.us10y[m.us10y.length - 1].v; s += (y - 4) * 6; }
    if (m && m.fed_funds && m.fed_funds.length) { const f = m.fed_funds[m.fed_funds.length - 1].v; s += (f - 3) * 4; }
    if (r) { if (/Risk-off|Defensive/.test(r.bias)) s += 10; else if (/Risk-on/.test(r.bias)) s -= 10; }
    return Math.max(0, Math.min(100, Math.round(s)));
  }

  // base sleeve splits per portfolio type (sum to 100, before regime tilt)
  const BASE = {
    conservative: { us: 28, ca: 45, crypto: 4, cash: 23 },
    balanced:     { us: 38, ca: 36, crypto: 14, cash: 12 },
    aggressive:   { us: 46, ca: 18, crypto: 28, cash: 8 },
  };
  // crypto is the strategic FIRE/volatile sleeve — regime modulates it within a band [floor, cap],
  // it is never fully deleted (the user runs it as a deliberate asymmetric-offense allocation).
  const CRYPTO_FLOOR = { conservative: 2, balanced: 7, aggressive: 14 };
  const CRYPTO_CAP   = { conservative: 6, balanced: 18, aggressive: 34 };

  // crypto cycle read: 4-year halving clock + net-liquidity (Raoul/Global-M2) overlay → phase +
  // an expected forward annual-return band. Heuristic, NOT a prediction — the Chief's honest prior.
  function cryptoCycle() {
    const halving = new Date("2024-04-19").getTime();
    const mo = Math.max(0, Math.round((Date.now() - halving) / (1000 * 60 * 60 * 24 * 30.4)));
    const c = mo % 48;
    let phase, lo, hi;
    if (c < 12)      { phase = "Accumulation";     lo = 25;  hi = 60; }
    else if (c < 18) { phase = "Markup";           lo = 40;  hi = 90; }
    else if (c < 24) { phase = "Euphoria";         lo = -10; hi = 25; }
    else if (c < 34) { phase = "Markdown";         lo = -40; hi = 0;  }
    else             { phase = "Re-accumulation";  lo = 20;  hi = 55; }
    const m = window.HelmFeed && window.HelmFeed.macro;
    let liq = 0;
    if (m && m.net_liquidity && m.net_liquidity.length > 60) {
      const a = m.net_liquidity[m.net_liquidity.length - 1].v, b = m.net_liquidity[m.net_liquidity.length - 61].v;
      liq = b ? (a - b) / Math.abs(b) : 0;
    }
    const adj = Math.round(liq * 120);
    const liqRising = liq > 0.02, liqDraining = liq < -0.02;
    const eff = (phase === "Markdown" && liqRising) ? "Re-accumulation" : phase;
    return { phase, eff, months: c, lo: lo + adj, hi: hi + adj, liqRising, liqDraining };
  }

  // crypto DEPLOYMENT STANCE — the Chief's call on whether to deploy capital into crypto NOW:
  // WAIT (don't deploy) · DCA (scale in slowly) · DEPLOY (toward target) · DISTRIBUTE (take profit).
  function cryptoStance(cycle, biasStr) {
    const ph = cycle.eff, defensive = /Risk-off|Defensive/.test(biasStr);
    if (ph === "Euphoria")
      return { stance: "DISTRIBUTE", pace: "Trim into strength", reason: "Late-cycle euphoria — take profit and rotate toward BTC or cash. No new adds.", trigger: "Re-enter on the next Accumulation phase." };
    if (ph === "Markdown") {
      if (cycle.liqRising)
        return { stance: "DCA", pace: "Scale in · ~15%/mo of target", reason: "Markdown, but liquidity is turning up — the bottoming tell. Begin a BTC-first DCA.", trigger: "Step up to DEPLOY once price reclaims the range (trend confirms)." };
      return { stance: "WAIT", pace: defensive ? "Hold cash · prep a BTC-first DCA" : "Hold · wait for the liquidity turn",
        reason: defensive ? "Bottoming but not confirmed; liquidity still draining and the book is defensive — don't deploy the sleeve yet. A small long-horizon BTC DCA is optional." : "Markdown with draining liquidity — wait for the liquidity turn before deploying.",
        trigger: "Start the DCA the moment net liquidity turns positive (watch Macro)." };
    }
    if (ph === "Accumulation" || ph === "Re-accumulation")
      return { stance: "DEPLOY", pace: "Scale toward target · ~25%/mo", reason: "Post-bottom base-building — deploy the BTC core first, add ETH/SOL as the cycle confirms.", trigger: "Full sleeve by Markup; trim only if Euphoria arrives." };
    return { stance: "DEPLOY", pace: "Hold at target on majors", reason: "Markup underway — keep the sleeve at target on the majors; let a small satellite run.", trigger: "Begin trimming as Euphoria signals appear." };
  }

  // standalone read for the buy engine (strategy.jsx) — preset-independent
  window.HelmCryptoCycle = function () {
    const c = cryptoCycle();
    return Object.assign({}, c, { stance: cryptoStance(c, window.HelmRegime ? window.HelmRegime.bias : "Neutral") });
  };

  window.HelmCIOMix = function (preset) {
    const base = { ...(BASE[preset] || BASE.balanced) };
    const r = window.HelmRegime;
    const bias = r ? r.bias : "Neutral";
    const usd = usdProxy();
    const drivers = [];

    // regime tilt: risk-on → +US growth +crypto, −cash ; risk-off → +Canada defensive +cash, −crypto/US
    let dU = 0, dCa = 0, dCr = 0, dCash = 0;
    if (/Risk-on/.test(bias)) { dU += 8; dCr += 5; dCash -= 8; dCa -= 5; drivers.push("Risk-on regime → lean into US growth + crypto sleeve"); }
    else if (/Constructive/.test(bias)) { dU += 4; dCr += 2; dCash -= 4; drivers.push("Constructive regime → modest risk-on tilt"); }
    else if (/Defensive/.test(bias)) { dCa += 7; dCash += 5; dCr -= 5; dU -= 5; drivers.push("Defensive regime → rotate to Canada defensives + cash, trim crypto"); }
    else if (/Risk-off/.test(bias)) { dCa += 10; dCash += 8; dCr -= 10; dU -= 8; drivers.push("Risk-off regime → maximize Canada defensives + cash, cut volatile sleeve"); }

    // USD strength: strong USD favors holding US (currency tailwind for CAD-based investor); weak USD → Canada/crypto
    if (usd >= 60) { dU += 4; dCa -= 2; drivers.push("Strong USD (proxy " + usd + ") → US assets carry an FX tailwind for a CAD investor"); }
    else if (usd <= 40) { dCa += 4; dCr += 2; dU -= 4; drivers.push("Weak USD (proxy " + usd + ") → favor Canada + crypto over US"); }

    // REAL US-vs-Canada relative strength (SPX vs TSX, 3-6mo) — the medium-term market lean
    const rs = usCaRS();
    if (rs != null) {
      const tilt = Math.max(-10, Math.min(10, Math.round(rs * 0.8))); // ±10pp cap
      dU += tilt; dCa -= tilt;
      if (Math.abs(tilt) >= 2) drivers.push(`US ${rs >= 0 ? "leads" : "lags"} Canada by ${Math.abs(rs).toFixed(1)}pp over 3–6mo → lean ${rs >= 0 ? "US growth" : "Canada"} (real index RS)`);
      else drivers.push("US and Canada are running neck-and-neck over 3–6mo → no market lean");
    }

    // liquidity: rising net liquidity supports the volatile sleeve (Raoul lens)
    const m = window.HelmFeed && window.HelmFeed.macro;
    if (m && m.net_liquidity && m.net_liquidity.length > 60) {
      const a = m.net_liquidity[m.net_liquidity.length - 1].v, b = m.net_liquidity[m.net_liquidity.length - 61].v;
      if (b && (a - b) / Math.abs(b) > 0.02) { dCr += 3; drivers.push("Net liquidity rising → supportive for the crypto sleeve"); }
      else if (b && (a - b) / Math.abs(b) < -0.02) { dCr -= 3; dCash += 2; drivers.push("Net liquidity draining → de-risk the volatile sleeve"); }
    }

    // PLAN-AWARE glide: tie risk to the goal's required return and the time horizon.
    // risk-NEED rises with the required return; risk-CAPACITY rises with years-to-goal and falls
    // when already ahead of plan. The PRUDENT budget = min(need, capacity) — never need alone.
    let planNote = null, planRisk = null;
    const HP = window.HelmPlan;
    if (HP && HP.loadPlan && HP.fundedCalc) {
      try {
        const p = HP.loadPlan();
        const eq = (window.PMData && window.PMData.buildView) ? (window.PMData.buildView("all").kpis.equity || 0) : 0;
        const f = HP.fundedCalc(p, eq);
        const years = f.n || 0, req = f.requiredReturn;
        if (req != null) {
          const safe = 5.5, ceil = 15;                                   // CIO equity forecast → sane growth ceiling
          const need = Math.max(0, Math.min(1, (req - safe) / (ceil - safe)));
          let cap = Math.max(0, Math.min(1, years / 18));                // long horizon = more room to recover
          if (f.ratio >= 1.1) cap *= 0.6;                                 // already ahead → dial risk down
          const budget = Math.min(need, cap);                            // prudent risk = min(need, capacity)
          const tilt = Math.round((budget - 0.5) * 10);                  // −5..+5 pp swing
          dCr += Math.round(tilt * 0.6); dU += Math.round(tilt * 0.4); dCash -= tilt;
          planRisk = { need: Math.round(need * 100), cap: Math.round(cap * 100), budget: Math.round(budget * 100), req: Math.round(req), years };
          drivers.push(`Plan needs ~${req.toFixed(0)}%/yr over ${years}y → risk budget ${planRisk.budget}% (need ${planRisk.need} vs capacity ${planRisk.cap}) → ${tilt >= 0 ? "add" : "trim"} growth + crypto`);
          if (years > 0 && years <= 3) { dCr -= 4; dCash += 4; drivers.push(`Within ${years}y of the goal → glide the volatile sleeve down`); }
          if (need > cap + 0.2) planNote = `⚠ The goal implies ~${req.toFixed(0)}%/yr — more risk than a ${years}y horizon prudently carries. Maxing crypto to chase it raises ruin risk; better to extend the horizon, add contributions, or accept a lower target.`;
        }
      } catch (e) {}
    }

    let t = { us: base.us + dU, ca: base.ca + dCa, crypto: base.crypto + dCr, cash: Math.max(0, base.cash + dCash) };
    // crypto sleeve held within its strategic band [floor, cap] — regime tilts inside the band, never to zero
    const cFloor = CRYPTO_FLOOR[preset] != null ? CRYPTO_FLOOR[preset] : 7;
    const cryptoCap = CRYPTO_CAP[preset] != null ? CRYPTO_CAP[preset] : 18;
    const cryptoRaw = t.crypto;
    t.crypto = Math.min(Math.max(t.crypto, cFloor), cryptoCap);
    if (cryptoRaw < cFloor) drivers.push(`Crypto held at the ${preset} FIRE floor (${cFloor}%) despite regime drag — it's a strategic sleeve, not a tactical bet`);
    else if (cryptoRaw > cryptoCap) drivers.push(`Crypto capped at the ${preset} risk budget (${cryptoCap}%)`);
    // normalize to 100
    const sum = t.us + t.ca + t.crypto + t.cash || 1;
    t = { us: Math.round(t.us / sum * 100), ca: Math.round(t.ca / sum * 100), crypto: Math.round(t.crypto / sum * 100), cash: Math.round(t.cash / sum * 100) };
    // fix rounding drift into cash
    const drift = 100 - (t.us + t.ca + t.crypto + t.cash); t.cash += drift;

    const note = preset === "conservative" ? "Conservative: Canada defensives + cash anchor the book; crypto is a tiny FIRE option."
      : preset === "aggressive" ? "Aggressive: US growth leads, crypto is a real FIRE sleeve, minimal cash — sized to the regime."
      : "Balanced: US growth and Canada defensives split the core; crypto is a measured volatile sleeve.";
  // crypto cycle read: 4-year halving clock + net-liquidity (Raoul/Global-M2) overlay → phase +
  // an expected forward annual-return band. Heuristic, NOT a prediction — the Chief's honest prior.
  function cryptoCycle() {
    const halving = new Date("2024-04-19").getTime();
    const mo = Math.max(0, Math.round((Date.now() - halving) / (1000 * 60 * 60 * 24 * 30.4)));
    const c = mo % 48;
    let phase, lo, hi;
    if (c < 12)      { phase = "Accumulation";     lo = 25;  hi = 60; }
    else if (c < 18) { phase = "Markup";           lo = 40;  hi = 90; }
    else if (c < 24) { phase = "Euphoria";         lo = -10; hi = 25; }
    else if (c < 34) { phase = "Markdown";         lo = -40; hi = 0;  }
    else             { phase = "Re-accumulation";  lo = 20;  hi = 55; }
    // liquidity overlay: rising net liquidity pulls the band up (and can front-run the next leg)
    const m = window.HelmFeed && window.HelmFeed.macro;
    let liq = 0;
    if (m && m.net_liquidity && m.net_liquidity.length > 60) {
      const a = m.net_liquidity[m.net_liquidity.length - 1].v, b = m.net_liquidity[m.net_liquidity.length - 61].v;
      liq = b ? (a - b) / Math.abs(b) : 0;
    }
    const adj = Math.round(liq * 120);
    const liqRising = liq > 0.02, liqDraining = liq < -0.02;
    // a strongly-rising-liquidity Markdown is treated as transitioning to Re-accumulation
    const eff = (phase === "Markdown" && liqRising) ? "Re-accumulation" : phase;
    return { phase, eff, months: c, lo: lo + adj, hi: hi + adj, liqRising, liqDraining };
  }
  const cyc = cryptoCycle();
  const cryptoStanceObj = cryptoStance(cyc, bias);

  // CRYPTO IS NOT MONOLITHIC — split the sleeve into BTC core / ETH-SOL growth / alt satellite,
  // sized by the prudent risk budget AND the cycle phase, then nudged by regime.
  function cryptoSplit(pct, b01, biasStr, cycle) {
    if (!pct) return null;
    const b = b01 == null ? 0.5 : b01;
    let btc, growth, alt;
    if (b <= 0.4)       { btc = 0.78; growth = 0.22; alt = 0.00; }
    else if (b <= 0.65) { btc = 0.58; growth = 0.30; alt = 0.12; }
    else                { btc = 0.42; growth = 0.35; alt = 0.23; }
    // cycle tilt: early cycle funds growth/alts (beta), late cycle concentrates BTC and cuts satellites
    const ph = cycle.eff;
    if (ph === "Euphoria")              { btc = Math.min(0.9, btc + 0.18); alt = Math.max(0, alt - 0.15); growth = Math.max(0, 1 - btc - alt); }
    else if (ph === "Markdown")         { btc = Math.min(0.95, btc + 0.25); alt = 0; growth = Math.max(0, 1 - btc - alt); }
    else if (ph === "Markup")           { alt = alt + 0.08; growth = growth + 0.04; btc = Math.max(0.3, 1 - growth - alt); }
    else if (ph === "Accumulation" || ph === "Re-accumulation") { btc = Math.min(0.85, btc + 0.06); growth = Math.max(0, 1 - btc - alt); } // BTC leads off the bottom; alts lag
    if (/Risk-off|Defensive/.test(biasStr)) { btc = Math.min(0.92, btc + 0.10); alt = Math.max(0, alt - 0.08); growth = Math.max(0, 1 - btc - alt); }
    const tBtc = Math.round(pct * btc), tAlt = Math.round(pct * alt);
    const tGrowth = Math.max(0, pct - tBtc - tAlt);
    const why = `${cycle.eff} phase (mo ${cycle.months}/48) · BTC est ${cycle.lo}–${cycle.hi}%/yr${cycle.liqRising ? " · liquidity rising" : cycle.liqDraining ? " · liquidity draining" : ""} → ${ph === "Markdown" || ph === "Euphoria" ? "concentrate the BTC core, cut satellites" : ph === "Markup" ? "let growth + a satellite run" : "BTC core leads off the base, alts still lag"}`;
    return { btc: tBtc, growth: tGrowth, alt: tAlt, why, cycle };
  }
    const cryptoTiers = cryptoSplit(t.crypto, planRisk ? planRisk.budget / 100 : null, bias, cyc);

    return { targets: t, drivers, usd, usCaRS: usCaRS(), bias, regimeLabel: r ? r.label : "—", note, cryptoCap, planNote, planRisk, cryptoTiers, cryptoCycle: cyc, cryptoStance: cryptoStanceObj };
  };
})();
