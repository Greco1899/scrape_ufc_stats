# Integrated Combatometry: A Quantitative Framework for Predictive Modeling in the UFC

> Research generated via Gemini Deep Research, February 2026.
> Used to inform Layer 1/2/3 prediction engine updates.

## Data Enrichment from Primary Sources

### Tapology — Additional Fields to Scrape
- **Reach/height ratios**: +8-10% odds per cm for hook/straight KO finishes
- **Gym/Association metadata**: "Camp Quality" coefficient for Layer 1
- **Pro MMA record breakdowns**: Regional vs top-tier opponent splits

### FightMatrix — Additional Fields
- **Division-Adjusted Ranking Points**: 17% penalty/bonus for weight class movers
- **540 Opponent Metric**: Opponent quality over 540 days (identifies "can-crushers")
- **Elo Velocity**: Rising WHR + stagnant K170 = undervalued fighter
- **Modified Elo**: Accounts for home advantage, split/majority decisions

### DRatings — Additional Fields
- **Log Loss history**: Compare algo vs sportsbooks per weight class
- **Volatility Bet Value**: Fights where algo diverges from market price

## Sherdog as 4th Data Source
- **Recursive opponent records**: "Quality of Victory" (QoV) metric
- **Regional vs UFC splits**: "Big League Experience" feature
- **Referee assignment data**: Statistically significant impact on finish rates

### Referee Tendencies
| Referee | Implied Probability | Outcome Bias |
|---------|-------------------|--------------|
| Herb Dean | 53.53% | Standard Distribution |
| Mark Smith | 55.03% | High Favorite Success |
| Marc Goddard | 55.14% | High Favorite Success |
| Jason Herzog | < 52.6% | High Underdog Ratio |

## Division-Specific Finish Rates (UFC Historical)

| Weight Class | (T)KO Rate | Submission Rate | Decision Rate |
|-------------|-----------|----------------|--------------|
| Heavyweight | 48.4% | 21.6% | 28.7% |
| Middleweight | 36.9% | 21.7% | 40.1% |
| Lightweight | 29.1% | 21.8% | 48.0% |
| Bantamweight | 25.7% | 19.2% | 53.6% |
| Women's Flyweight | 16.6% | 19.6% | 63.8% |
| Women's Strawweight | 13.3% | 19.2% | 66.9% |

**Key insight**: SUB rates are stable (~19-22%) across all divisions. KO power is the primary driver of fight duration variance.

## Source Accuracy Benchmarks

| Source | Documented Accuracy | Primary Utility | Best For |
|--------|-------------------|-----------------|----------|
| Betting Odds | 65-70% (Brier 0.201) | Efficient Market Baseline | Winner Prediction |
| Bayesian Models | ~70% | Style Matchup Analysis | Winner Prediction |
| DRatings | Variable | Identifying Market Inefficiency | Betting Value |
| In-Round Analytics | ~80% | Momentum and Fatigue Tracking | Round Prediction |

**Recommendation**: Reduce Tapology community picks from 25% to 10%. Increase WHR and Glicko weights. "Fading the public" in non-title fights was historically profitable.

## High-Value Derived Features (Ranked)
1. **Reverse Line Movement** — sharp money signal (10-4 historical)
2. **Quality of Victory** — Sherdog recursive opponent scraping
3. **Fighter Mileage** — age + years since debut + times KO'd
4. **Striking Differential** — over last 3 fights (not just W/L record)
5. **Style Mismatch Index** — `(TD_Acc x TD_Freq) - (TDD_Opp x StrikeDiff_Opp)`
6. **Age-Decline Curves** — 80% of elite fighters are 26-35; steep decline 36+

### Age Distribution
| Age Group | Participation % | Context |
|-----------|----------------|---------|
| 21-25 | 4.02% | Developing Prospects |
| 26-30 | 36.21% | Physical Peak |
| 31-35 | 44.25% | Technical Peak / Elite Maintenance |
| 36-40 | 14.37% | Rapid Decline |
| 41-45 | 1.15% | Outliers (HW/Legends) |

## Odds API Options

| Provider | Price Range | Update Frequency | Best For |
|----------|-----------|-----------------|----------|
| The Odds API | $0 - $249 | Every 5-10 Minutes | Moneyline / Totals |
| Sports Game Odds | $99 - $499 | Real-Time / WebSocket | Arbitrage / Settlements |
| OddsJam | High (Custom) | Real-Time (Latency Optimized) | Sharp Betting |
| GoalServe | XML/JSON Feeds | Historic / Pre-match | Archival Backtesting |

## Ensemble Weight Recommendations

### Layer 1 (Updated)
| Source | Old Weight | New Weight | Rationale |
|--------|-----------|-----------|-----------|
| Tapology | 25% | 10% | Crowd bias, emotional |
| WHR | 10% | 20% | Best career trajectory model |
| Glicko | 10% | 15% | RD handles inactivity |
| Betting | 15% | 20% | Brier 0.201, most efficient |
| DRatings | 15% | 15% | No change |
| Elo K170 | 15% | 15% | No change |
| Modified Elo | 10% | 5% | Experimental, reduce influence |

### Layer 2 (New Modifiers)
- Reach advantage finish type multiplier (per cm)
- Division-specific TKO/SUB base rates
- Referee tendency adjustments

### Layer 3 (Division-Specific Thresholds)
- Replace single threshold set with per-division calibration
- Weight class TKO rates drive R1 threshold aggressiveness
- Championship rounds multiplier for R4/R5
