<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Model Comparison — TPS-QCIO</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --accent: #0e9f6e;
    --gpt: #2563eb;
    --cop: #b45309;
    --ui: "IBM Plex Sans", system-ui, sans-serif;
    --mono: "IBM Plex Mono", ui-monospace, monospace;
    --bg: #f4f6f8;
    --panel: #ffffff;
    --panel-2: #fbfcfd;
    --ink: #121820;
    --ink-2: #475063;
    --muted: #818b99;
    --line: #e8ebef;
    --line-2: #f0f2f5;
    --good: #0e9f6e;
    --bad: #d1495b;
  }
  html, body { background: var(--bg); }
  body {
    font-family: var(--ui); color: var(--ink); font-size: 14px;
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
    line-height: 1.5;
  }
  .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 40px 32px 80px; }

  /* Header */
  .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding-bottom: 22px; border-bottom: 1px solid var(--line); margin-bottom: 30px; }
  .head h1 { font-size: 27px; font-weight: 700; letter-spacing: -0.025em; }
  .head .sub { color: var(--ink-2); font-size: 14px; margin-top: 6px; max-width: 640px; }
  .badge { font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); padding: 5px 10px; border: 1px solid var(--line); border-radius: 99px; white-space: nowrap; }

  /* Verdict band */
  .verdict { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 22px 24px; margin-bottom: 34px; display: grid; grid-template-columns: 1fr 1fr; gap: 0; overflow: hidden; }
  .verdict .col { padding: 0 26px; }
  .verdict .col:first-child { padding-left: 0; border-right: 1px solid var(--line); }
  .verdict .col:last-child { padding-right: 0; }
  .verdict h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 9px; }
  .verdict p { font-size: 14.5px; color: var(--ink); line-height: 1.55; }
  .verdict .spine { color: var(--cop); font-weight: 600; }
  .verdict .organs { color: var(--gpt); font-weight: 600; }

  .section-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); font-weight: 600; margin: 0 0 16px; }

  /* Compare table */
  .ctable { width: 100%; border-collapse: separate; border-spacing: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; margin-bottom: 40px; }
  .ctable th, .ctable td { text-align: left; vertical-align: top; padding: 16px 20px; border-bottom: 1px solid var(--line); }
  .ctable thead th { background: var(--panel-2); font-size: 13px; position: sticky; top: 0; }
  .ctable thead th:first-child { width: 118px; }
  .ctable thead th + th { width: calc((100% - 118px) / 3); }
  .ctable tr:last-child td { border-bottom: 0; }
  .ctable td:first-child, .ctable th:first-child { border-right: 1px solid var(--line); }
  .ctable th + th + th, .ctable td + td + td { border-left: 1px solid var(--line); }
  .dot.helm { background: var(--accent); }
  .ctable th, .ctable td { padding: 15px 17px; }
  .rowlabel { font-weight: 600; font-size: 13px; color: var(--ink-2); }
  .rowlabel .small { display: block; font-weight: 400; color: var(--muted); font-size: 11.5px; margin-top: 3px; }
  .model-th { display: flex; align-items: center; gap: 10px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
  .dot.gpt { background: var(--gpt); }
  .dot.cop { background: var(--cop); }
  .model-th .name { font-weight: 700; font-size: 15px; letter-spacing: -0.01em; }
  .model-th .meta { font-family: var(--mono); font-size: 11px; color: var(--muted); }
  ul.pl { list-style: none; }
  ul.pl li { position: relative; padding-left: 18px; margin-bottom: 7px; font-size: 13.5px; line-height: 1.45; }
  ul.pl li:last-child { margin-bottom: 0; }
  ul.pl.pro li::before { content: "+"; position: absolute; left: 0; top: -1px; color: var(--good); font-weight: 700; font-family: var(--mono); }
  ul.pl.con li::before { content: "−"; position: absolute; left: 0; top: -1px; color: var(--bad); font-weight: 700; font-family: var(--mono); }
  .kw { font-weight: 600; color: var(--ink); }
  .tag { display: inline-block; font-family: var(--mono); font-size: 10.5px; background: var(--line-2); color: var(--ink-2); padding: 1px 6px; border-radius: 5px; }

  /* Incorporate list */
  .inc-grid { display: flex; flex-direction: column; gap: 10px; margin-bottom: 40px; }
  .inc { display: grid; grid-template-columns: 38px 1fr 120px; gap: 18px; align-items: center; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 15px 20px; }
  .inc .num { width: 30px; height: 30px; border-radius: 8px; background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); font-weight: 700; font-family: var(--mono); display: grid; place-items: center; font-size: 14px; }
  .inc .body h4 { font-size: 14.5px; font-weight: 600; margin-bottom: 3px; }
  .inc .body p { font-size: 13px; color: var(--ink-2); }
  .inc .body .src { font-family: var(--mono); font-size: 10.5px; color: var(--muted); }
  .inc .pri { justify-self: end; text-align: right; }
  .inc .pri .pill { font-family: var(--mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 9px; border-radius: 99px; }
  .pill.p1 { background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); }
  .pill.p2 { background: color-mix(in srgb, var(--gpt) 12%, transparent); color: var(--gpt); }
  .pill.p3 { background: var(--line-2); color: var(--muted); }

  /* Questions */
  .q-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .q { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 17px 19px; }
  .q.span { grid-column: 1 / -1; }
  .q .qn { font-family: var(--mono); font-size: 11px; color: var(--accent); font-weight: 600; }
  .q h4 { font-size: 14.5px; font-weight: 600; margin: 5px 0 5px; }
  .q p { font-size: 13px; color: var(--ink-2); }
  .q .dflt { font-size: 12px; color: var(--muted); margin-top: 7px; }
  .q .dflt b { color: var(--ink-2); }

  /* transmission chain */
  .chain-wrap { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 22px 24px; margin-bottom: 40px; }
  .chain-intro { font-size: 13px; color: var(--ink-2); line-height: 1.55; margin-bottom: 18px; max-width: 920px; }
  .chain-gap-key { color: var(--cop); font-weight: 600; }
  .chain { display: flex; flex-wrap: wrap; align-items: stretch; gap: 6px; }
  .chain-node { flex: 1 1 0; min-width: 140px; border: 1px solid var(--line); border-radius: 10px; padding: 11px 12px; display: flex; gap: 9px; background: var(--panel-2); }
  .chain-node.gap { border-style: dashed; border-color: color-mix(in srgb, var(--cop) 50%, var(--line)); background: color-mix(in srgb, var(--cop) 5%, var(--panel)); }
  .chain-node.res { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--panel)); }
  .chain-n { font-family: var(--mono); font-size: 11px; font-weight: 600; color: var(--muted); flex: none; }
  .chain-node strong { display: block; font-size: 12.5px; font-weight: 600; line-height: 1.25; }
  .chain-node span { display: block; font-size: 11px; color: var(--muted); margin-top: 3px; line-height: 1.35; }
  .chain-src { display: block; font-family: var(--mono); font-size: 9.5px; color: var(--cop); margin-top: 5px; font-style: normal; }
  .chain-node:not(.gap) .chain-src { color: var(--muted); }
  .chain-arr { display: flex; align-items: center; color: var(--muted); font-size: 14px; flex: none; }
  .chain-foot { font-size: 12.5px; color: var(--ink-2); line-height: 1.55; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); max-width: 920px; }
  .chain-foot strong { color: var(--ink); }

  @media (max-width: 980px) { .chain-arr { display: none; } .chain-node { flex-basis: 46%; } }
  @media (max-width: 760px) {
    .verdict, .q-grid { grid-template-columns: 1fr; }
    .verdict .col:first-child { border-right: 0; border-bottom: 1px solid var(--line); padding: 0 0 18px; margin-bottom: 18px; }
    .inc { grid-template-columns: 32px 1fr; }
    .inc .pri { grid-column: 2; justify-self: start; }
  }
</style>
</head>
<body>
<div class="wrap">

  <div class="head">
    <div>
      <h1>Two prototypes, one lineage</h1>
      <div class="sub">Both files are the same <span class="mono">TPS-QCIO</span> portfolio-assistant system at two stages — ChatGPT v16 is the maximalist content build; Copilot V2.1 is an architectural refactor of it. They're complementary, not competing.</div>
    </div>
    <div class="badge">Architect's review · Jun 2026</div>
  </div>

  <div class="verdict">
    <div class="col">
      <h3>Verdict</h3>
      <p>Adopt <span class="spine">Copilot's spine</span> — decision precedence, operating modes, three score families, the Economic CIO engine — and hang <span class="organs">ChatGPT's organs</span> on it: the elaborated frameworks, communication templates, source tiers, and ledger schemas.</p>
    </div>
    <div class="col">
      <h3>In one line</h3>
      <p>Copilot tells you <em>how to decide and resolve conflicts</em>. ChatGPT tells you <em>what to analyse and how to write it up</em>. Neither is complete alone.</p>
    </div>
  </div>

  <div class="section-label">Pros &amp; cons per model</div>
  <table class="ctable">
    <thead>
      <tr>
        <th></th>
        <th>
          <div class="model-th"><span class="dot gpt"></span><div><div class="name">ChatGPT v16</div><div class="meta">2,870 lines · content build</div></div></div>
        </th>
        <th>
          <div class="model-th"><span class="dot cop"></span><div><div class="name">Copilot V2.1</div><div class="meta">984 lines · OS refactor</div></div></div>
        </th>
        <th>
          <div class="model-th"><span class="dot helm"></span><div><div class="name">Helm — current</div><div class="meta">live app · 10 tabs</div></div></div>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="rowlabel">Core idea</td>
        <td>Exhaustive <span class="kw">content library</span> — every framework spelled out in full.</td>
        <td>Clean <span class="kw">operating-system skeleton</span> — fewer parts, sharper logic.</td>
        <td>Working <span class="kw">React app</span> — real data &amp; live feed. Execution exists; the governance spine doesn't yet.</td>
      </tr>
      <tr>
        <td class="rowlabel">Strengths<span class="small">what it does better</span></td>
        <td>
          <ul class="pl pro">
            <li>Full frameworks elaborated: economic, geopolitical, equity, fixed-income, scenario, themes</li>
            <li>Rich <span class="kw">client / committee output templates</span> — monthly commentary, IC memo, client email</li>
            <li>Explicit <span class="tag">data-source tiers 1–4</span></li>
            <li>Numeric macro scoring (−20…+20 bands), prediction-ledger &amp; reflexion <span class="kw">schemas</span></li>
            <li>Full governance calendar (daily → quarterly), evidence grades A–F</li>
            <li>Deepest governed-learning detail (shadow model, parameter registry, EWC phases)</li>
          </ul>
        </td>
        <td>
          <ul class="pl pro">
            <li><span class="kw">Master Decision Precedence</span> — a 10-level conflict hierarchy <span class="tag">ChatGPT has none</span></li>
            <li><span class="kw">Operating Modes</span> Minimal / Standard / Full — usable mid-drawdown</li>
            <li><span class="kw">Three Score Families only</span> (Opportunity / Route / Predictive, all 0–100) — kills score overload</li>
            <li><span class="kw">Economic CIO Engine</span>: regime → price-evolution → sleeve-impact → theme lens, w/ Simple/Full sub-modes</li>
            <li><span class="kw">Crypto Benchmark Rule</span> — "why better than just holding BTC/ETH?"</li>
            <li>Drift → action mapping; "drift can reduce but never <em>increase</em> learning freedom"</li>
          </ul>
        </td>
        <td>
          <ul class="pl pro">
            <li>Real NBDB data — 4 accounts, <span class="tag">109 positions</span>, live-feed pipeline</li>
            <li>Institutional scorecard already live (Sharpe / Info Ratio / Omega)</li>
            <li>Strategy Lab factor signals, RSI, stop/target, ranked trades</li>
            <li>Tracker paper-trades 3 risk-model portfolios + leaderboard</li>
            <li>Macro module w/ Global-M2 / Fed-liquidity; AI chart analysis</li>
            <li><span class="kw">Account- &amp; currency-aware</span> — every tab follows the selector</li>
          </ul>
        </td>
      </tr>
      <tr>
        <td class="rowlabel">Weaknesses<span class="small">where it falls short</span></td>
        <td>
          <ul class="pl con">
            <li><span class="kw">Score overload</span> — Common-Core-25, portfolio-specific, account penalties, TFSA compounding, chart, theme &amp; quality scores all overlap <span class="tag">the doc admits it</span></li>
            <li>Three stacked legacy layers; repetitive, conflicts resolved only by "v16 controls"</li>
            <li>No top-level precedence, no operating modes → analysis-paralysis risk</li>
            <li>Heavy to implement faithfully</li>
          </ul>
        </td>
        <td>
          <ul class="pl con">
            <li>Thin on client-facing <span class="kw">output templates</span> &amp; comms style</li>
            <li>Frameworks <em>named</em>, not elaborated (equity / FI / geo / scenario)</li>
            <li>No data-source tiers, no numeric macro bands</li>
            <li>Lighter ledger / reflexion schemas &amp; governance specifics</li>
            <li>Assumes you already own the content to plug into the skeleton</li>
          </ul>
        </td>
        <td>
          <ul class="pl con">
            <li>No <span class="kw">IPS / funded-ratio / glidepath</span> — Layers 0–4 absent</li>
            <li>No top-level <span class="kw">decision precedence</span> or operating modes</li>
            <li>Scoring is ad-hoc factors, not the 3 standardized families</li>
            <li>No drift-detection / governed-learning surface yet</li>
            <li>Crypto view is descriptive, not <span class="kw">predictive</span></li>
            <li>Governance principles live in <span class="tag">CLAUDE.md</span>, not in the UI</li>
          </ul>
        </td>
      </tr>
      <tr>
        <td class="rowlabel">Geopolitics &amp; economics<span class="small">the skill you asked about</span></td>
        <td>
          <ul class="pl pro">
            <li><span class="kw">Genuinely strong &amp; well-linked.</span> Full <span class="tag">V16-4 Economic</span> framework: Growth · Inflation · Monetary · Fiscal · Valuation → 8-state Cycle Diagnosis</li>
            <li>Dedicated <span class="tag">V16-5 Geopolitical</span>: 7 categories (conflict, energy, trade, strategic competition, elections, cyber/AI, critical materials)</li>
            <li>Each geo risk <span class="kw">scored</span> probability × impact × horizon → asset classes → account exposure → portfolio response</li>
            <li>The link is explicit: cycle &amp; geo both feed <em>per-asset-class + per-account routing</em> implications</li>
          </ul>
        </td>
        <td>
          <ul class="pl con">
            <li>Geopolitics is <span class="kw">one input line</span> inside the regime engine — no dedicated framework or scoring</li>
            <li>But the <span class="kw">economic architecture is cleaner</span>: regime → price-evolution → sleeve-impact → theme lens, Simple/Full modes</li>
            <li>Names the channels; doesn't elaborate the transmission</li>
          </ul>
        </td>
        <td>
          <ul class="pl con">
            <li>Macro module exists (Fed liquidity, Global-M2, yield curve, geo feed) but it's <span class="kw">descriptive</span></li>
            <li>No regime classifier, no scored geo → portfolio transmission, no per-sleeve impact</li>
          </ul>
        </td>
      </tr>
      <tr>
        <td class="rowlabel">Continuous learning<span class="small">does it get better over time</span></td>
        <td>
          <ul class="pl pro">
            <li><span class="kw">Deepest learning spec.</span> Prediction ledger + <span class="tag">reflexion schemas</span>, EV-error tracking by strategy/theme/horizon/regime</li>
            <li>Separate accuracy for macro / regime / theme / security calls \u2014 knows <em>what</em> it's bad at</li>
            <li>Shadow model, parameter registry, <span class="tag">EWC phases</span>, replay-before-change, A\u2013F evidence grades</li>
          </ul>
        </td>
        <td>
          <ul class="pl pro">
            <li><span class="kw">Best-governed learning.</span> A-Light: logs, replays, monitors drift \u2014 <em>never</em> self-tunes without approval</li>
            <li>Drift split by domain (macro/inflation/rates/liquidity/regime/vol/theme) \u2192 mapped to required action</li>
            <li>Key rule: <span class="kw">\"drift can reduce but never increase learning freedom\"</span> \u2014 safe under stress</li>
          </ul>
        </td>
        <td>
          <ul class=\"pl con\">
            <li>Tracker journals paper-trades + realized-since, but <span class=\"kw\">no predicted-vs-realized calibration loop yet</span></li>
            <li>No drift detection, no reflexion ledger, no replay \u2014 it doesn't yet improve itself</li>
            <li>Open todo #1 (Tracker calibration) is the first step</li>
          </ul>
        </td>
      </tr>
      <tr>
        <td class=\"rowlabel\">Best used as</td>
        <td>The <span class=\"organs\" style=\"font-weight:600\">reference manual</span> you pull detail from.</td>
        <td>The <span class="spine" style="font-weight:600">runtime architecture</span> you build on.</td>
        <td>The <span style="font-weight:600;color:var(--accent)">live surface</span> the two specs should govern.</td>
      </tr>
    </tbody>
  </table>

  <div class="section-label">Geopolitics → economics → portfolio · the transmission chain</div>
  <div class="chain-wrap">
    <p class="chain-intro">Both specs <em>name</em> the inputs but leave the plumbing between them implicit. This is the chain that links them — the gaps (<span class="chain-gap-key">dashed</span>) are filled from your <span class="mono">NBC Finance 101</span> decks: <em>Ce qui fait bouger les marchés</em> (S08), FX &amp; money markets (S09), fixed income &amp; yield curves (S10), commodities (S12).</p>
    <div class="chain">
      <div class="chain-node"><span class="chain-n">1</span><div><strong>Geopolitical event</strong><span>Conflict · energy security · trade fragmentation · sanctions</span><em class="chain-src">ChatGPT V16-5</em></div></div>
      <div class="chain-arr">→</div>
      <div class="chain-node gap"><span class="chain-n">2</span><div><strong>Commodities &amp; energy</strong><span>Oil / gas / uranium / metals repricing; supply-shock premium</span><em class="chain-src">NBC S12 · link added</em></div></div>
      <div class="chain-arr">→</div>
      <div class="chain-node gap"><span class="chain-n">3</span><div><strong>Inflation &amp; expectations</strong><span>Headline/core, services, supply-chain → inflation trend</span><em class="chain-src">NBC S08 · link added</em></div></div>
      <div class="chain-arr">→</div>
      <div class="chain-node"><span class="chain-n">4</span><div><strong>Rates &amp; monetary policy</strong><span>CB stance, real yields, QT/QE, liquidity</span><em class="chain-src">both specs</em></div></div>
      <div class="chain-arr">→</div>
      <div class="chain-node gap"><span class="chain-n">5</span><div><strong>Yield curve &amp; FX</strong><span>Curve shape, term premium, CAD/USD pressure</span><em class="chain-src">NBC S09–S10 · link added</em></div></div>
      <div class="chain-arr">→</div>
      <div class="chain-node gap"><span class="chain-n">6</span><div><strong>Valuation / ERP</strong><span>Equity risk premium, credit spreads, discount rate</span><em class="chain-src">NBC S08 · link added</em></div></div>
      <div class="chain-arr">→</div>
      <div class="chain-node"><span class="chain-n">7</span><div><strong>Regime + sleeve impact</strong><span>9-state regime → per-bucket bias → SAA/TAA tilt</span><em class="chain-src">Copilot §4</em></div></div>
      <div class="chain-arr">→</div>
      <div class="chain-node res"><span class="chain-n">8</span><div><strong>Portfolio response</strong><span>Account routing · risk budget · hedge/monitor · No-Trade</span><em class="chain-src">both specs</em></div></div>
    </div>
    <p class="chain-foot"><strong>Verdict on your question:</strong> yes — the geo/econ skill is real and well-linked <em>in ChatGPT v16</em>. The one missing piece in <em>both</em> is steps 2-3 and 5-6: the commodity → inflation and rates → curve/FX/ERP channels. NBC Finance 101 supplies exactly those. Helm's Macro module already has the data (oil, M2, yield curve, FX) — it's missing the regime classifier and the scored geo → sleeve transmission. That's item #4 below.</p>
  </div>

  <div class="section-label">What I'd incorporate into Helm — prioritized</div>
  <div class="inc-grid">
    <div class="inc">
      <div class="num">1</div>
      <div class="body">
        <h4>Strategic Layers 0–4 → "Policy &amp; Funded Ratio" module</h4>
        <p>One-page IPS, 4 strategic buckets vs your real allocation, glidepath posture, a <b>funded-ratio gauge tied to the 60%/yr-retire goal</b>, pre-committed cycle de-risk tiers. Helm's biggest gap; plugs into Projections.</p>
        <span class="src">both files · Layers 0–4</span>
      </div>
      <div class="pri"><span class="pill p1">Build first</span></div>
    </div>
    <div class="inc">
      <div class="num">2</div>
      <div class="body">
        <h4>Master Decision Precedence + Operating Mode + status strip</h4>
        <p>Persistent header: <span class="mono">Funded · Risk Posture · Cycle · Regime · Drift · Mode</span>. Your top-bar pill already does a third of this.</p>
        <span class="src">Copilot §0, §2, §18</span>
      </div>
      <div class="pri"><span class="pill p1">Build first</span></div>
    </div>
    <div class="inc">
      <div class="num">3</div>
      <div class="body">
        <h4>Collapse Strategy Lab into the 3 Score Families</h4>
        <p>Opportunity / Route / Predictive, all 0–100, account-aware. Removes Helm's ad-hoc factor sprawl.</p>
        <span class="src">Copilot §8 · ChatGPT scoring</span>
      </div>
      <div class="pri"><span class="pill p2">Next</span></div>
    </div>
    <div class="inc">
      <div class="num">4</div>
      <div class="body">
        <h4>Economic CIO regime states → Macro module</h4>
        <p>Named regimes + portfolio bias + per-sleeve impact. Pairs with the Global-M2 work already on the todo list.</p>
        <span class="src">Copilot §4</span>
      </div>
      <div class="pri"><span class="pill p2">Next</span></div>
    </div>
    <div class="inc">
      <div class="num">5</div>
      <div class="body">
        <h4>Drift-detection dashboard</h4>
        <p>This <em>is</em> open todo #1 (Tracker calibration). Domain drift scores + status + required action.</p>
        <span class="src">both · drift engine</span>
      </div>
      <div class="pri"><span class="pill p2">Next</span></div>
    </div>
    <div class="inc">
      <div class="num">6</div>
      <div class="body">
        <h4>Crypto predictive engine</h4>
        <p>Regime class + predictive-support score + BTC/ETH benchmark rule → upgrade cryptoview / analysis.</p>
        <span class="src">Copilot §11–12</span>
      </div>
      <div class="pri"><span class="pill p3">Later</span></div>
    </div>
    <div class="inc">
      <div class="num">7</div>
      <div class="body">
        <h4>Client / committee output templates</h4>
        <p>Optional "Reports" export. Lower priority for a solo investor.</p>
        <span class="src">ChatGPT V16-14</span>
      </div>
      <div class="pri"><span class="pill p3">Later</span></div>
    </div>
  </div>

  <div class="section-label">Decisions locked — resolved with you</div>
  <div class="q-grid">
    <div class="q span">
      <div class="qn">✓ D1 · the core tension — RESOLVED</div>
      <h4>Governance is a visible brake, never a wall</h4>
      <p>Aggressive 60%/yr offense stays the goal. Governance is <b>visible &amp; overridable</b>, toggleable <b>per portfolio</b>, with a <b>confirm pop-up</b> on risk breaches and a <b>simulate-and-learn</b> path. Risk management matters, so breaches surface — but you always decide.</p>
      <div class="dflt"><b>Built into:</b> Plan page · governance panel (Off / Warn / Confirm + per-account toggles).</div>
    </div>
    <div class="q">
      <div class="qn">✓ D2 · account model — RESOLVED</div>
      <h4>Crypto is a real non-registered account</h4>
      <p>9 direct coins (XRP, LINK, SUI, SOL, ONDO, TRX, TAO, RENDER, DOGE) wired into <span class="mono">data.jsx</span>. Being taxable, it <b>switches the after-tax engine + tax-loss harvest ON</b> (Québec 26.65%, 30-day superficial-loss).</p>
      <div class="dflt"><b>Done:</b> account live in selector as "Crypto Direct".</div>
    </div>
    <div class="q">
      <div class="qn">✓ D3 · the "speculative" cap — RESOLVED &amp; RENAMED</div>
      <h4>It's a risk budget, not a quality verdict</h4>
      <p>You're right — crypto is <b>volatile, not low-quality</b>. Sleeve renamed <b>"Volatile Offense."</b> The 30% is your <b>chosen risk budget</b> (profile sets a guardrail max; you set the target), checked at <b>household level</b> so a 100%-crypto account is fine by mandate. Warn-only.</p>
      <div class="dflt"><b>Matches both prototypes:</b> v16 "Volatile Asymmetric Offense Sleeve" + per-account mandate vs household roll-up.</div>
    </div>
    <div class="q">
      <div class="qn">✓ D5 · learning autonomy — RESOLVED</div>
      <h4>Keep it light, automation will follow</h4>
      <p>A-Light: logs, replays, proposes — <b>never self-tunes without approval</b>. Built so more automation switches on later.</p>
      <div class="dflt"><b>Default:</b> A-Light now.</div>
    </div>
    <div class="q span" style="border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); background: color-mix(in srgb, var(--accent) 4%, var(--panel));">
      <div class="qn" style="color: var(--accent);">◷ D4 · still open — two numbers needed</div>
      <h4>Funded ratio: retirement age 55 ✓ — need spending &amp; withdrawal rate</h4>
      <p>The Plan page is live with editable inputs (placeholder: $80k spending, 4% withdrawal). For a <em>real</em> funded ratio, give me your <b>target annual retirement spending</b> and preferred <b>safe withdrawal rate</b> — or keep the placeholders and tune them in-app.</p>
      <div class="dflt"><b>Next:</b> enter them on the Plan page, or tell me here.</div>
    </div>
  </div>

</div>

<template id="__bundler_thumbnail">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0e9f6e"/><g fill="#fff"><rect x="30" y="30" width="16" height="40" rx="2"/><rect x="54" y="30" width="16" height="40" rx="2"/></g></svg>
</template>
</body>
</html>