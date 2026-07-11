# Reference frameworks — extracted from the user's NBC/BNC "Finance 101" course decks
# (Pierre Laroche, Banque Nationale Marchés financiers). Use these to ground the app's
# Strategy Lab, Performance, and Macro modules in real institutional methodology.

## Portfolio-management process (Séances 16-17 — La gestion de portefeuille)
1. **Design** — investment objectives: return target, risk, correlation. Approach (traditional / quant / mixed).
2. **Policy** — define the investment universe; how the "best" assets are selected; how capital is
   allocated ("diversification is the only free lunch"); **rebalancing + profit-taking + stop-loss rules**.
3. **Monitoring** — market events, corporate actions, volatility spikes, policy/regulatory compliance, efficient execution.
4. **Performance evaluation** (see Session 18).
5. **Communication** — to investors and regulators.

### Diversification & allocation
- Portfolio return = weighted avg; risk depends on **correlations** (between −1 and +1). Lower correlation → lower risk.
- ~90% of diversification benefit is reached with ~20 stocks.
- Long-run stock/bond correlation ≈ 0 but swings between −0.8 and +0.8.
- Concentration risk is real (Japan 40% of MSCI World in 1989; BlackBerry ~50% of SPTSX60; mega-cap 5 ≈ 22% of S&P 500).

### Active management
- **Strategic Asset Allocation (SAA)** — long-term (3-5 yr) divergence from benchmark weights.
- **Tactical Asset Allocation (TAA)** — short-term (3-12 mo): e.g. add equities after an exaggerated drop (mean-reversion), FX hedge around elections.

### Risk profiling (regulator-required questionnaire)
- **Tolerance** — do you sleep well when markets are volatile?
- **Capacity** — function of financial cushion + age.
- **Knowledge** — more informed → can take more risk.
- Behavioral-finance definition of risk: **probability of NOT reaching your financial goals** (and how far short).
- A "decision grid" maps the risk profile to one of **6-8 model portfolios**, from "liquidity" (very prudent) to 90%+ equities.

## Performance evaluation (Session 18)
Three approaches:
1. **vs peers** — stable above-median returns, ideally risk-adjusted.
2. **vs benchmark**
   - **Value Added (VA)** = avg portfolio return − avg benchmark return.
   - **Active share** = sum of |weight differences| (measures conviction / departure from benchmark).
   - **Tracking error** = RMSE = std dev of Value Added.
   - **Information Ratio (IR)** = VA / Tracking error. Good: **0.5+ equities, 0.75+ fixed income**.
3. **vs itself**
   - **Sharpe ratio** = (avg portfolio return − risk-free rate) / std dev. (Deck uses **Rf = 2.5%**.)
   - **Omega ratio** = expected upside (vs a target) / expected |downside|. Better than Sharpe — doesn't assume Gaussian returns.

### Sources of alpha (documented)
New issues (not in benchmarks); M&A / special situations; access to small & mid caps; SAA (incl. dynamic
risk management like stop-loss); TAA; capturing the negative alpha of other managers.
Low-cost ETFs are purging "closet indexers" (high fees for near-benchmark portfolios).

## How this maps into Helm (the app)
- **Strategy Lab** — risk models = the 6-8 "decision grid" tiers; surface Tolerance/Capacity/Knowledge.
  TAA "add after exaggerated drop" = the mean-reversion buy signal; stop-loss rules already present.
- **Performance / Rendement** — add the institutional scorecard: Sharpe (Rf 2.5%), Information Ratio,
  Active Share, Tracking Error, Omega — vs S&P 500 / Nasdaq.
- **Macro module (future)** — "Ce qui fait bouger les marchés" (Séance 08), fixed income & yield curves
  (Séance 10), commodities (Séance 12), FX & money markets (Session 09) → the indicators feeding posture.

## NBC CIO long-term market forecasts (Prévisions de marché à long terme — spring 2026, as of 31 Mar 2026)
10-year expected annual returns (the basis of strategic asset allocation):
- **Balanced reference portfolio: 4.8%/yr** (vs 8.3% realized over the last 10y; was 4.3% in fall 2025).
  Balanced = 18% S&P/TSX, 24% S&P 500, 12% MSCI EAFE, 6% MSCI EM, 40% Canada Universe bonds (CAD).
- **Equities (benchmark): 5.5%/yr** (30% TSX, 40% S&P 500, 20% EAFE, 10% EM). EM most favourable (strong
  earnings growth, P/E in line with history).
- **Canadian fixed income: 3.7%/yr** (≈ current yield-to-maturity).
- 30-year horizon: balanced ~6.7%, equities ~8.2%.
→ Used in Projections as the realistic "market" baseline (5.5%) the 60%/yr target is measured against.

## NBC CIO asset-allocation views (June 2026 — "Le chemin de l'inconfort")
Overweight equities; watch geopolitics (Strait of Hormuz/Iran), inflation & the new Fed chair (Kevin Warsh),
and AI-concentration risk. Tilts: Equities OW, Fixed income UW, Alternatives OW; US + EM overweight; Credit OW,
Duration UW; Gold + uncorrelated strategies OW. → Drives the CIO Macro View panel in the Strategy Lab.
