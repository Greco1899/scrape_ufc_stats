/**
 * UFC Weekly Predictor - AI Improvement Analyzer
 * Heuristic-based analysis that identifies patterns and suggests model adjustments
 */

class AIAnalyzer {
    constructor() {
        // Minimum events required for analysis
        this.MIN_EVENTS_FOR_ANALYSIS = 3;

        // Baseline expectations
        this.EXPECTED_WINNER_PCT = 60;
        this.EXPECTED_METHOD_PCT = 28;
        this.EXPECTED_ROUND_PCT = 15;

        // Thresholds for flagging issues
        this.SIGNIFICANT_DEVIATION = 10; // percentage points
        this.MIN_SAMPLE_SIZE = 5;
    }

    /**
     * Run full analysis and generate recommendations
     */
    async runAnalysis() {
        const eventsWithResults = await storage.getEventsWithResults();

        if (eventsWithResults.length < this.MIN_EVENTS_FOR_ANALYSIS) {
            return {
                canAnalyze: false,
                eventsCompleted: eventsWithResults.length,
                eventsRequired: this.MIN_EVENTS_FOR_ANALYSIS,
                message: `Need ${this.MIN_EVENTS_FOR_ANALYSIS - eventsWithResults.length} more event(s) with results to generate analysis.`
            };
        }

        const overall = await accuracyTracker.getOverallAccuracy();
        const trends = await accuracyTracker.getAccuracyTrends(3);
        const weakAreas = await accuracyTracker.identifyWeakAreas(50);
        const segmented = await accuracyTracker.getSegmentedAccuracy();

        // Generate findings
        const findings = await this.generateFindings(overall, trends, weakAreas);

        // Generate detailed betting strategy
        const strategy = this.generateBettingStrategy(overall, segmented);

        // Generate recommendations (merged with strategy insights)
        const recommendations = await this.generateRecommendations(overall, findings, weakAreas, strategy);

        // Generate trend analysis
        const trendAnalysis = this.analyzeTrends(trends, overall);

        return {
            canAnalyze: true,
            eventsCompleted: eventsWithResults.length,
            overall,
            segmented,
            findings,
            recommendations,
            strategy,
            trendAnalysis,
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Generate key findings from accuracy data
     */
    async generateFindings(overall, trends, weakAreas) {
        const findings = [];

        // Overall performance finding
        const performanceLevel = this.assessPerformanceLevel(overall.winnerPct);
        findings.push({
            type: 'overall',
            severity: performanceLevel.severity,
            title: 'Overall Model Performance',
            message: `Winner prediction accuracy is ${overall.winnerPct.toFixed(1)}% across ${overall.totalFights} fights. ${performanceLevel.assessment}`
        });

        // Method accuracy finding
        if (overall.totalFights >= 10) {
            const methodDiff = overall.methodPct - this.EXPECTED_METHOD_PCT;
            findings.push({
                type: 'method',
                severity: methodDiff < -10 ? 'warning' : (methodDiff > 5 ? 'positive' : 'neutral'),
                title: 'Method Prediction Accuracy',
                message: `Method accuracy is ${overall.methodPct.toFixed(1)}% (expected ~${this.EXPECTED_METHOD_PCT}%). ${this.getMethodAssessment(methodDiff)}`
            });
        }

        // Weight class findings
        const wcFindings = this.analyzeWeightClasses(overall.byWeightClass);
        findings.push(...wcFindings);

        // Source reliability findings
        const sourceFindings = this.analyzeSourceReliability(overall.bySource);
        findings.push(...sourceFindings);

        // Volatility findings
        const volatilityFinding = this.analyzeVolatility(overall.byVolatility);
        if (volatilityFinding) {
            findings.push(volatilityFinding);
        }

        // Trend-based findings
        if (trends && trends.length >= 3) {
            const trendFinding = this.analyzeTrendDirection(trends);
            if (trendFinding) {
                findings.push(trendFinding);
            }
        }

        return findings;
    }

    /**
     * Generate betting strategy based on segmented accuracy
     */
    generateBettingStrategy(overall, segmented) {
        const strategy = {
            unitSizing: [],
            fadeFollow: [],
            props: []
        };

        // 1. Unit Sizing (Confidence Tiers)
        const highConf = segmented.confidence.high;
        const medConf = segmented.confidence.medium;

        if (highConf.total >= 5) {
            if (highConf.accuracy >= 70) {
                strategy.unitSizing.push({
                    tier: 'High Confidence',
                    action: 'Increase Size (1.5u - 2u)',
                    message: `High confidence picks are hitting at ${highConf.accuracy.toFixed(1)}%. These are strong anchors.`
                });
            } else if (highConf.accuracy < 55) {
                strategy.unitSizing.push({
                    tier: 'High Confidence',
                    action: 'Reduce Size (0.5u)',
                    message: `High confidence picks are underperforming (${highConf.accuracy.toFixed(1)}%). Treat as standard plays until accuracy improves.`
                });
            } else {
                strategy.unitSizing.push({
                    tier: 'High Confidence',
                    action: 'Standard Size (1u)',
                    message: `High confidence picks are stable at ${highConf.accuracy.toFixed(1)}%.`
                });
            }
        }

        if (medConf.total >= 5) {
            if (medConf.accuracy >= 65) {
                strategy.unitSizing.push({
                    tier: 'Medium Confidence',
                    action: 'Standard Size (1u)',
                    message: `Medium confidence picks are performing well (${medConf.accuracy.toFixed(1)}%).`
                });
            } else if (medConf.accuracy < 50) {
                strategy.unitSizing.push({
                    tier: 'Medium Confidence',
                    action: 'Reduce Size (0.5u) or Pass',
                    message: `Medium confidence picks are coin-flips (${medConf.accuracy.toFixed(1)}%). Exercise caution.`
                });
            }
        }

        // 2. Fade/Follow (Weight Classes & Reliability)
        // We'll use the overall weight class data for this as it's more granular there
        for (const [wc, data] of Object.entries(overall.byWeightClass)) {
            if (data.total >= 5) {
                if (data.winnerPct >= 70) {
                    strategy.fadeFollow.push({
                        target: wc,
                        action: 'Follow',
                        message: `${wc} is a reliable division (${data.winnerPct.toFixed(1)}%).`
                    });
                } else if (data.winnerPct < 45) {
                    strategy.fadeFollow.push({
                        target: wc,
                        action: 'Fade / Pass',
                        message: `${wc} is unpredictable (${data.winnerPct.toFixed(1)}%). Avoid significant exposure.`
                    });
                }
            }
        }

        // 3. Props Strategy (Method & Round)
        const koStats = segmented.method.KO;
        const subStats = segmented.method.SUB;
        const decStats = segmented.method.DEC;

        // Method Prop Confidence
        if (koStats.total >= 5 && koStats.methodAccuracy >= 50) {
            strategy.props.push({
                type: 'KO Props',
                action: 'Bet Method',
                message: `Model correctly identifies KO outcomes ${koStats.methodAccuracy.toFixed(1)}% of the time.`
            });
        }
        if (subStats.total >= 5 && subStats.methodAccuracy >= 40) {
            strategy.props.push({
                type: 'Submission Props',
                action: 'Bet Method / Sprinkle',
                message: `Submission predictions are accurate (${subStats.methodAccuracy.toFixed(1)}%).`
            });
        }
        if (decStats.total >= 5 && decStats.methodAccuracy >= 70) {
            strategy.props.push({
                type: 'Decision Props',
                action: 'Parlay Anchor',
                message: `Decision predictions are highly accurate (${decStats.methodAccuracy.toFixed(1)}%). Good for parlay padding.`
            });
        }

        return strategy;
    }

    /**
     * Generate actionable recommendations
     */
    async generateRecommendations(overall, findings, weakAreas, strategy) {
        const recommendations = [];

        // Incorporate Strategy into Recommendations
        // High Confidence Level
        const highConfStrat = strategy.unitSizing.find(s => s.tier === 'High Confidence');
        if (highConfStrat && highConfStrat.action.includes('Increase')) {
            recommendations.push({
                type: 'strategy',
                priority: 'high',
                title: 'Capitalize on High Confidence',
                message: highConfStrat.message,
                action: 'Increase unit size for High Confidence picks.'
            });
        }

        // Fade Candidates
        const fades = strategy.fadeFollow.filter(s => s.action.includes('Fade'));
        if (fades.length > 0) {
            recommendations.push({
                type: 'strategy',
                priority: 'medium', // Downgraded to medium to avoid alarm fatigue
                title: 'Divisions to Avoid',
                message: `Model is struggling in: ${fades.map(f => f.target).join(', ')}.`,
                action: 'Reduce volume or pass on fights in these divisions.'
            });
        }

        // Weight class specific recommendations (Technical adjustments)
        for (const area of weakAreas.filter(a => a.category === 'weightClass')) {
            const rec = this.generateWeightClassRecommendation(area, overall);
            if (rec) recommendations.push(rec);
        }

        // Source-based recommendations
        for (const area of weakAreas.filter(a => a.category === 'source')) {
            const rec = this.generateSourceRecommendation(area, overall);
            if (rec) recommendations.push(rec);
        }

        // Volatility recommendations
        const volatileArea = weakAreas.find(a => a.category === 'volatility');
        if (volatileArea) {
            recommendations.push({
                type: 'volatility',
                priority: 'medium',
                title: 'Volatile Fight Strategy',
                message: `Volatile fight predictions are at ${volatileArea.accuracy.toFixed(1)}%.`,
                action: 'Use these for underdog sprinkles or pass completely. Do not include in parlays.'
            });
        }

        // Method prediction tuning (Technical)
        if (overall.methodPct < 20 && overall.totalFights >= 15) {
            recommendations.push({
                type: 'method',
                priority: 'low',
                title: 'Method Prediction Tuning',
                message: `Method accuracy is ${overall.methodPct.toFixed(1)}%, below the ${this.EXPECTED_METHOD_PCT}% baseline.`,
                action: 'Consider adjusting FINISH_THRESHOLD or defaulting closer to Decision for lighter weights.'
            });
        }

        // Sort by priority
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        return recommendations;
    }

    /**
     * Assess overall performance level
     */
    assessPerformanceLevel(winnerPct) {
        if (winnerPct >= 70) {
            return { severity: 'positive', assessment: 'Excellent performance - model is highly accurate.' };
        } else if (winnerPct >= 60) {
            return { severity: 'positive', assessment: 'Good performance - above random chance with meaningful edge.' };
        } else if (winnerPct >= 55) {
            return { severity: 'neutral', assessment: 'Moderate performance - slight edge over baseline.' };
        } else if (winnerPct >= 50) {
            return { severity: 'warning', assessment: 'Marginal performance - barely above 50/50.' };
        } else {
            return { severity: 'critical', assessment: 'Poor performance - model is underperforming. Review methodology.' };
        }
    }

    /**
     * Get method accuracy assessment
     */
    getMethodAssessment(diff) {
        if (diff > 10) {
            return 'Exceptionally strong method prediction.';
        } else if (diff > 0) {
            return 'Performing above expectations.';
        } else if (diff > -10) {
            return 'Within expected range.';
        } else {
            return 'Below expectations - consider adjusting finish thresholds.';
        }
    }

    /**
     * Analyze weight class performance
     */
    analyzeWeightClasses(byWeightClass) {
        const findings = [];

        // Find best and worst performing weight classes
        let best = null;
        let worst = null;

        for (const [wc, data] of Object.entries(byWeightClass)) {
            if (data.total < this.MIN_SAMPLE_SIZE) continue;

            if (!best || data.winnerPct > best.pct) {
                best = { wc, pct: data.winnerPct, total: data.total };
            }
            if (!worst || data.winnerPct < worst.pct) {
                worst = { wc, pct: data.winnerPct, total: data.total };
            }
        }

        if (best && best.pct >= 65) {
            findings.push({
                type: 'weight_class',
                severity: 'positive',
                title: `Strong in ${best.wc}`,
                message: `${best.wc} predictions at ${best.pct.toFixed(1)}% accuracy (${best.total} fights). Model performs well in this division.`
            });
        }

        if (worst && worst.pct < 50) {
            findings.push({
                type: 'weight_class',
                severity: 'warning',
                title: `Weak in ${worst.wc}`,
                message: `${worst.wc} predictions only ${worst.pct.toFixed(1)}% accurate (${worst.total} fights). Consider division-specific adjustments.`
            });
        }

        return findings;
    }

    /**
     * Analyze source reliability
     */
    analyzeSourceReliability(bySource) {
        const findings = [];

        let mostReliable = null;
        let leastReliable = null;

        for (const [source, data] of Object.entries(bySource)) {
            if (data.total < this.MIN_SAMPLE_SIZE) continue;

            if (!mostReliable || data.winnerPct > mostReliable.pct) {
                mostReliable = { source, pct: data.winnerPct, total: data.total };
            }
            if (!leastReliable || data.winnerPct < leastReliable.pct) {
                leastReliable = { source, pct: data.winnerPct, total: data.total };
            }
        }

        if (mostReliable && leastReliable && mostReliable.source !== leastReliable.source) {
            const diff = mostReliable.pct - leastReliable.pct;
            if (diff >= this.SIGNIFICANT_DEVIATION) {
                findings.push({
                    type: 'source',
                    severity: 'info',
                    title: 'Source Performance Gap',
                    message: `${mostReliable.source} leads at ${mostReliable.pct.toFixed(1)}% while ${leastReliable.source} trails at ${leastReliable.pct.toFixed(1)}%. Consider adjusting source weights.`
                });
            }
        }

        return findings;
    }

    /**
     * Analyze volatility prediction effectiveness
     */
    analyzeVolatility(byVolatility) {
        const volatile = byVolatility.volatile;
        const nonVolatile = byVolatility.nonVolatile;

        if (volatile.total < this.MIN_SAMPLE_SIZE || nonVolatile.total < this.MIN_SAMPLE_SIZE) {
            return null;
        }

        const diff = nonVolatile.winnerPct - volatile.winnerPct;

        if (diff >= 15) {
            return {
                type: 'volatility',
                severity: 'positive',
                title: 'Volatility Flag Working',
                message: `Non-volatile fights: ${nonVolatile.winnerPct.toFixed(1)}% vs Volatile: ${volatile.winnerPct.toFixed(1)}%. The volatility flag correctly identifies unpredictable fights.`
            };
        } else if (diff < 5) {
            return {
                type: 'volatility',
                severity: 'warning',
                title: 'Volatility Detection Issue',
                message: `Non-volatile (${nonVolatile.winnerPct.toFixed(1)}%) and volatile (${volatile.winnerPct.toFixed(1)}%) accuracy are similar. Volatility criteria may need refinement.`
            };
        }

        return null;
    }

    /**
     * Analyze trend direction
     */
    analyzeTrendDirection(trends) {
        if (trends.length < 3) return null;

        const recent = trends.slice(-3);
        const earlier = trends.slice(0, 3);

        const recentAvg = recent.reduce((sum, t) => sum + t.winnerPct, 0) / recent.length;
        const earlierAvg = earlier.reduce((sum, t) => sum + t.winnerPct, 0) / earlier.length;

        const diff = recentAvg - earlierAvg;

        if (diff >= 10) {
            return {
                type: 'trend',
                severity: 'positive',
                title: 'Improving Trend',
                message: `Recent accuracy (${recentAvg.toFixed(1)}%) is ${diff.toFixed(1)} points higher than earlier events (${earlierAvg.toFixed(1)}%). Model is improving.`
            };
        } else if (diff <= -10) {
            return {
                type: 'trend',
                severity: 'warning',
                title: 'Declining Trend',
                message: `Recent accuracy (${recentAvg.toFixed(1)}%) is ${Math.abs(diff).toFixed(1)} points lower than earlier events (${earlierAvg.toFixed(1)}%). Review recent predictions for patterns.`
            };
        }

        return null;
    }

    /**
     * Analyze trends for display
     */
    analyzeTrends(trends, overall) {
        if (!trends || trends.length < 2) {
            return {
                hasTrends: false,
                message: 'Not enough data for trend analysis. Complete more events.'
            };
        }

        const trendInfo = this.analyzeTrendDirection(trends);

        let message = '';
        let direction = 'stable';

        if (trendInfo) {
            message = trendInfo.message;
            direction = trendInfo.severity === 'positive' ? 'improving' : 'declining';
        } else {
            message = 'Accuracy has been relatively stable across recent events.';
        }

        const currentWinnerPct = trends[trends.length - 1].winnerPct;
        const previousWinnerPct = trends.length > 1 ? trends[trends.length - 2].winnerPct : currentWinnerPct;

        return {
            hasTrends: true,
            direction: direction,
            dataPoints: trends,
            summary: {
                latestWinnerPct: currentWinnerPct,
                averageWinnerPct: overall.winnerPct,
                change: currentWinnerPct - previousWinnerPct,
                totalDataPoints: trends.length
            },
            message: message
        };
    }

    /**
     * Generate weight class specific recommendation
     */
    generateWeightClassRecommendation(area, overall) {
        const wc = area.value;
        const accuracy = area.accuracy;

        // Determine division category
        const isHeavy = ['HW', 'LHW'].includes(wc);
        const isLight = ['FLW', 'BW', 'FW', 'WSW', 'WFLW', 'WBW'].includes(wc);

        let action = '';
        if (isHeavy && accuracy < 50) {
            action = `For ${wc}: Consider increasing KO finish threshold to 70% and placing more weight on recent fight history due to age/chin degradation factors.`;
        } else if (isLight && accuracy < 50) {
            action = `For ${wc}: Consider defaulting more to Decision predictions and increasing the finish threshold. Lighter divisions favor technical fighters.`;
        } else {
            action = `Review ${wc} predictions to identify common miss patterns. Consider division-specific heuristics.`;
        }

        return {
            type: 'weight_class',
            priority: accuracy < 40 ? 'high' : 'medium',
            title: `Improve ${wc} Predictions`,
            message: `${wc} accuracy is ${accuracy.toFixed(1)}%, significantly below model average of ${overall.winnerPct.toFixed(1)}%.`,
            action
        };
    }

    /**
     * Generate source-based recommendation
     */
    generateSourceRecommendation(area, overall) {
        const source = area.value;
        const accuracy = area.accuracy;

        let action = '';
        switch (source) {
            case 'tapology':
                action = 'Consider reducing Tapology weight or raising the override threshold above 75%.';
                break;
            case 'dratings':
                action = 'Consider reducing DRatings weight in the composite calculation.';
                break;
            case 'fightmatrix':
                action = 'Fight Matrix may be less reliable for certain matchup types. Consider reducing weight or using only for specific scenarios.';
                break;
            default:
                action = `Review when ${source} becomes the primary driver and consider additional validation.`;
        }

        return {
            type: 'source',
            priority: 'medium',
            title: `${source.charAt(0).toUpperCase() + source.slice(1)} Reliability`,
            message: `When ${source} is the primary source, accuracy drops to ${accuracy.toFixed(1)}%.`,
            action
        };
    }

    /**
     * Check if analysis is available
     */
    async canRunAnalysis() {
        const eventsWithResults = await storage.getEventsWithResults();
        return {
            canAnalyze: eventsWithResults.length >= this.MIN_EVENTS_FOR_ANALYSIS,
            eventsCompleted: eventsWithResults.length,
            eventsRequired: this.MIN_EVENTS_FOR_ANALYSIS
        };
    }
}

// Export singleton instance
const aiAnalyzer = new AIAnalyzer();
