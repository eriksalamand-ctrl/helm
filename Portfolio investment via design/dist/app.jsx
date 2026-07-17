<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>NBC Research → Helm — Documentation &amp; Improvement Ledger</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --accent: #0e9f6e; --bad: #e02424; --warn: #d97706; --blue: #2563eb;
  --ui: "IBM Plex Sans", system-ui, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, monospace;
  --bg: #f4f6f8; --panel: #ffffff; --panel-2: #f8f9fb;
  --ink: #121820; --ink-2: #475063; --muted: #818b99;
  --line: #e8ebef; --line-2: #f0f2f5;
}
html, body { background: var(--bg); }
body { font-family: var(--ui); color: var(--ink); font-size: 14px; -webkit-font-smoothing: antialiased; line-height: 1.5; }
.mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 40px 32px 80px; }
.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding-bottom: 22px; border-bottom: 1px solid var(--line); margin-bottom: 32px; }
.head h1 { font-size: 26px; font-weight: 700; letter-spacing: -0.025em; }
.head .sub { color: var(--ink-2); font-size: 14px; margin-top: 6px; max-width: 720px; line-height: 1.55; }
.badge { font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); padding: 5px 10px; border: 1px solid var(--line); border-radius: 99px; white-space: nowrap; flex: none; }
.section-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); font-weight: 600; margin: 36px 0 16px; }
.section-label:first-of-type { margin-top: 0; }

/* source docs */
.docs { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 12px; }
.doc { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 15px 17px; display: flex; flex-direction: column; gap: 6px; }
.doc-top { display: flex; align-items: center; gap: 9px; }
.doc-pub { font-family: var(--mono); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 5px; }
.doc-pub.nbf { background: color-mix(in srgb, #2563eb 12%, transparent); color: #1d4ed8; }
.doc-pub.ms { background: color-mix(in srgb, #d97706 14%, transparent); color: #b45309; }
.doc-date { font-size: 11px; color: var(--muted); margin-left: auto; font-family: var(--mono); }
.doc-title { font-size: 13.5px; font-weight: 600; line-height: 1.4; }
.doc-note { font-size: 12px; color: var(--ink-2); line-height: 1.5; }
.doc-link { font-size: 11.5px; color: var(--accent); font-family: var(--mono); word-break: break-all; }

/* ledger table */
.ledger { width: 100%; border-collapse: separate; border-spacing: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 13px; overflow: hidden; }
.ledger th, .ledger td { text-align: left; padding: 13px 15px; border-bottom: 1px solid var(--line-2); font-size: 13px; vertical-align: top; }
.ledger thead th { background: var(--panel-2); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 600; }
.ledger tr:last-child td { border-bottom: 0; }
.ledger td:first-child { font-weight: 600; color: var(--ink); white-space: nowrap; }
.ledger .what { color: var(--ink-2); }
.ledger .imp { color: var(--ink); }
.st { font-family: var(--mono); font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 99px; white-space: nowrap; }
.st.done { background: color-mix(in srgb, var(--accent) 14%, transparent); color: #0a7d57; }
.st.partial { background: color-mix(in srgb, var(--warn) 16%, transparent); color: #b45309; }
.st.planned { background: var(--line-2); color: var(--muted); }

/* data coverage */
.cov { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.cov-card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; }
.cov-card h3 { font-size: 14px; font-weight: 700; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.cov-row { display: flex; align-items: baseline; gap: 9px; padding: 7px 0; border-bottom: 1px solid var(--line-2); font-size: 12.5px; }
.cov-row:last-child { border-bottom: 0; }
.cov-ico { font-weight: 700; font-size: 13px; flex: none; }
.cov-k { font-weight: 600; color: var(--ink); min-width: 130px; }
.cov-v { color: var(--ink-2); }

.note { font-size: 12px; color: var(--muted); line-height: 1.6; margin-top: 14px; }
@media (max-width: 820px) { .cov { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <div>
      <h1>NBC Research → Helm</h1>
      <div class="sub">Source documentation and the improvement ledger: which June-2026 NBC / NBF / Morningstar research was analysed, what it contained, and the concrete engine improvements each one led to. The honest record of how external research feeds the model.</div>
    </div>
    <div class="badge">Living doc · Jun 2026</div>
  </div>

  <!-- SOURCE DOCS -->
  <div class="section-label">Source documents (uploads/)</div>
  <div class="docs">
    <div class="doc">
      <div class="doc-top"><span class="doc-pub nbf">NBF</span><span class="doc-title">Stock Select List — Liste de Sélections BNMC</span><span class="doc-date">06-11</span></div>
      <div class="doc-note">47 Canadian names with <strong>analyst price targets, dividend yields and estimated returns</strong> by sector. The single most reusable file — concrete conviction data.</div>
      <div class="doc-link">uploads/Recherche_Actions_NBF_Morningstar_Juin2026/NBF-STOCK_SELECT_LIST-2026-06-11…pdf</div>
    </div>
    <div class="doc">
      <div class="doc-top"><span class="doc-pub ms">Morningstar</span><span class="doc-title">Canadian Income Select List — buy vs hold</span><span class="doc-date">06-10</span></div>
      <div class="doc-note">High-dividend, stable, undervalued Canadian names split into Buy / Hold. Performance commentary vs S&amp;P/TSX 60 (e.g. BCE +7.7%, TRI −7.3% in May).</div>
      <div class="doc-link">uploads/Recherche_Actions_NBF_Morningstar_Juin2026/MORNINGSTAR-STOCK_SELECT_LIST-2026-06-10…pdf</div>
    </div>
    <div class="doc">
      <div class="doc-top"><span class="doc-pub nbf">NBF</span><span class="doc-title">Economic News — Canada CPI (May)</span><span class="doc-date">06-22</span></div>
      <div class="doc-note">Canada CPI <strong>3.2% YoY</strong> (out of BoC band), core 3.5%. "Patience should prevail." Cross-checks the live FRED CPI series already wired into Macro.</div>
      <div class="doc-link">uploads/NBF_Economie_Marches_Strategie_Juin2026/NBF-ECONOMIC_NEWS-2026-06-22…pdf</div>
    </div>
    <div class="doc">
      <div class="doc-top"><span class="doc-pub nbf">NBF</span><span class="doc-title">Weekly Economic &amp; Market Outlook</span><span class="doc-date">06-20</span></div>
      <div class="doc-note">CA + US economic calendar (image-only PDF — no extractable text). Useful as a human reference for event risk, not machine-readable.</div>
      <div class="doc-link">uploads/NBF_Economie_Marches_Strategie_Juin2026/NBF-WEEKLY_ECONOMIC_MARKET_OUTLOOK-2026-06-20…pdf</div>
    </div>
    <div class="doc">
      <div class="doc-top"><span class="doc-pub nbf">NBF</span><span class="doc-title">Sector &amp; Industry Reports</span><span class="doc-date">05-27 → 06-22</span></div>
      <div class="doc-note">Sector-level views (energy, materials, industrials). Feed the CIO tilt grid and regime-conditional sector weighting — qualitative, mapped manually.</div>
      <div class="doc-link">uploads/NBF_Economie_Marches_Strategie_Juin2026/NBF-SECTOR_REPORT-… · NBF-INDUSTRY_REPORT-…pdf</div>
    </div>
    <div class="doc">
      <div class="doc-top"><span class="doc-pub ms">Morningstar</span><span class="doc-title">Stock — Latest Publication</span><span class="doc-date">06-25</span></div>
      <div class="doc-note">Single-stock deep-dive (fair value, moat, uncertainty). Reference for individual research; not bulk-extractable into the engine.</div>
      <div class="doc-link">uploads/Recherche_Actions_NBF_Morningstar_Juin2026/MORNINGSTAR-STOCK_LATEST_PUBLICATION-2026-06-25…pdf</div>
    </div>
  </div>

  <!-- IMPROVEMENT LEDGER -->
  <div class="section-label">Improvement ledger — what was useful &amp; what it changed</div>
  <table class="ledger">
    <thead><tr><th>Source</th><th>What it contained</th><th>Improvement it led to in Helm</th><th>Status</th></tr></thead>
    <tbody>
      <tr>
        <td>NBF Select List (06-11)</td>
        <td class="what">47 CA names with analyst price targets + estimated returns by sector.</td>
        <td class="imp">Extracted to <span class="mono">nbc-research.js</span> (<span class="mono">window.HelmSelectList</span>). Wired as an <strong>analyst-conviction overlay</strong> in <span class="mono">signalsFor()</span> — Select-List names get a composite boost scaled by their estimated upside, a confidence bump, and a <strong>★ NBC +X%</strong> badge in Strategy Lab showing the target &amp; estimated return.</td>
        <td><span class="st done">Shipped</span></td>
      </tr>
      <tr>
        <td>NBF Economic News — CPI (06-22)</td>
        <td class="what">Canada CPI 3.2% YoY, core 3.5%, out of BoC band; "patience should prevail."</td>
        <td class="imp">Validates the live FRED CPI-YoY series already driving the Macro CIO real-yield &amp; regime logic. Confirms the <strong>Slowdown / Defensive</strong> regime read and the duration-underweight tilt. No code change — a cross-check that the live feed matches the bank's read.</td>
        <td><span class="st done">Verified</span></td>
      </tr>
      <tr>
        <td>Morningstar Income List (06-10)</td>
        <td class="what">High-dividend, stable, undervalued CA names; Buy vs Hold split + monthly performance vs TSX 60.</td>
        <td class="imp">Roadmap: merge the Buy names into the Select overlay with an <strong>income-quality</strong> tag, and use the Buy/Hold split to gate the income factor. Performance commentary is a candidate calibration target for the Learning Lab.</td>
        <td><span class="st partial">In progress</span></td>
      </tr>
      <tr>
        <td>NBF Sector / Industry reports</td>
        <td class="what">Sector-level directional views (energy, materials, industrials).</td>
        <td class="imp">Map to the <strong>CIO tilt grid</strong> (cioview) and feed regime-conditional sector weights. Currently mapped manually into the strategic tilts; goal is a structured sector-bias table the engine reads.</td>
        <td><span class="st planned">Planned</span></td>
      </tr>
      <tr>
        <td>NBF Weekly Outlook (06-20)</td>
        <td class="what">CA + US economic calendar (image-only).</td>
        <td class="imp">Not machine-readable (scanned). Kept as a human event-risk reference. No engine wiring — documented honestly so we don't pretend it's a live input.</td>
        <td><span class="st planned">Reference only</span></td>
      </tr>
    </tbody>
  </table>

  <!-- LIVE DATA COVERAGE -->
  <div class="section-label">Can we replicate these signals live? — feed coverage check</div>
  <div class="cov">
    <div class="cov-card">
      <h3>✅ Already live (no document needed)</h3>
      <div class="cov-row"><span class="cov-ico" style="color:var(--accent)">✓</span><span class="cov-k">Canada / US CPI</span><span class="cov-v">FRED series → Macro real-yield + regime. Matches NBF's 3.2% read.</span></div>
      <div class="cov-row"><span class="cov-ico" style="color:var(--accent)">✓</span><span class="cov-k">Net liquidity, yields</span><span class="cov-v">FRED WALCL/RRP/TGA + 2y/10y → Macro drivers, daily.</span></div>
      <div class="cov-row"><span class="cov-ico" style="color:var(--accent)">✓</span><span class="cov-k">Valuation (P/E, 52w)</span><span class="cov-v">Finnhub fundamentals → engine valuation factor.</span></div>
      <div class="cov-row"><span class="cov-ico" style="color:var(--accent)">✓</span><span class="cov-k">Geopolitics</span><span class="cov-v">GDELT feed → Macro geo score + regime.</span></div>
    </div>
    <div class="cov-card">
      <h3>⚠ Document-only (no free live source)</h3>
      <div class="cov-row"><span class="cov-ico" style="color:var(--warn)">◐</span><span class="cov-k">Analyst price targets</span><span class="cov-v">No free API. The Select List PDF is the source — re-upload monthly to refresh <span class="mono">nbc-research.js</span>.</span></div>
      <div class="cov-row"><span class="cov-ico" style="color:var(--warn)">◐</span><span class="cov-k">Buy / Hold ratings</span><span class="cov-v">Proprietary to NBF/Morningstar — manual extract only.</span></div>
      <div class="cov-row"><span class="cov-ico" style="color:var(--warn)">◐</span><span class="cov-k">Sector house views</span><span class="cov-v">Qualitative reports — mapped by hand into the CIO tilt grid.</span></div>
      <div class="cov-row"><span class="cov-ico" style="color:var(--bad)">✗</span><span class="cov-k">Economic calendar</span><span class="cov-v">Scanned image PDF — not extractable.</span></div>
    </div>
  </div>
  <p class="note"><strong>Honest takeaway:</strong> the macro signals NBC publishes (CPI, liquidity, yields, geopolitics) are <em>already live</em> in Helm via FRED/GDELT — the documents confirm our read rather than add new data. The genuinely new, high-value content is the <strong>analyst conviction</strong> (price targets, Buy/Hold, sector views), which has no free live API — so it enters Helm by periodically extracting these PDFs into <span class="mono">nbc-research.js</span>. Re-upload the Select List each month and the ★ NBC overlay refreshes.</p>

</div>
<template id="__bundler_thumbnail">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#2563eb"/><text x="50" y="64" font-size="44" text-anchor="middle" fill="#fff">📑</text></svg>
</template>
</body>
</html>