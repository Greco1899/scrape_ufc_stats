/**
 * UFC Weekly Predictor - 3-Layer Prediction Engine
 * Implements the complete UFC Fight Prediction Model specification
 */

class PredictionEngine {
    constructor() {
        // Confidence thresholds
        this.CONFIDENCE_HIGH = 65;
        this.CONFIDENCE_MEDIUM = 55;

        // Finish thresholds
        this.FINISH_THRESHOLD = 65; // % career finishes needed for finish prediction
        this.OPPONENT_FINISH_LOSS_THRESHOLD = 50; // % finish losses for opponent

        // Source agreement thresholds
        this.STRONG_AGREEMENT_THRESHOLD = 4; // 4+ sources agree on same winner
        this.LOPSIDED_FAVORITE_THRESHOLD = 80; // confidence above this = likely finish
        this.CLOSE_FIGHT_THRESHOLD = 50; // confidence below this = lean DEC (lowered from 55)

        // Layoff thresholds (strengthened)
        this.LAYOFF_MODERATE = 300; // days - small penalty
        this.LAYOFF_SEVERE = 400; // days - moderate penalty
        this.LAYOFF_EXTREME = 500; // days - heavy penalty

        // Weight class finish bias
        this.WEIGHT_CLASS_FINISH_BIAS = {
            'HW': { ko: 1.3, sub: 1.0, dec: 0.8 },
            'LHW': { ko: 1.2, sub: 1.0, dec: 0.9 },
            'MW': { ko: 1.0, sub: 1.0, dec: 1.0 },
            'WW': { ko: 1.0, sub: 1.0, dec: 1.0 },
            'LW': { ko: 0.97, sub: 1.0, dec: 1.03 },
            'FW': { ko: 0.95, sub: 1.0, dec: 1.05 },
            'BW': { ko: 0.92, sub: 0.97, dec: 1.08 },
            'FLW': { ko: 0.88, sub: 0.95, dec: 1.12 },
            'WSW': { ko: 0.85, sub: 0.95, dec: 1.15 },
            'WFLW': { ko: 0.87, sub: 0.95, dec: 1.13 },
            'WBW': { ko: 0.87, sub: 0.95, dec: 1.13 },
            'WFW': { ko: 0.90, sub: 0.97, dec: 1.08 }
        };

        // Round prediction: continuous scoring constants (aligned with Python implementation)
        this.METHOD_CONFIDENCE_SCALE = 0.50;
        this.BONUS_LOSER_POWER_PUNCHER = 5.0;
        this.BONUS_LOPSIDED = 5.0;
        this.MAX_BONUS_CAP = 8.0;

        // Division-specific round thresholds for 3-round fights
        // Higher TKO-rate divisions get lower thresholds (more R1/R2 predictions)
        this.DIVISION_ROUND_THRESHOLDS_3RD = {
            'HW':   { R1: 42.0, R2: 33.0, R3: 0.0 },
            'LHW':  { R1: 45.0, R2: 36.0, R3: 0.0 },
            'MW':   { R1: 48.0, R2: 39.0, R3: 0.0 },
            'WW':   { R1: 50.0, R2: 41.0, R3: 0.0 },
            'LW':   { R1: 52.0, R2: 43.0, R3: 0.0 },
            'FW':   { R1: 52.0, R2: 43.0, R3: 0.0 },
            'BW':   { R1: 54.0, R2: 45.0, R3: 0.0 },
            'FLW':  { R1: 55.0, R2: 46.0, R3: 0.0 },
            'WSW':  { R1: 58.0, R2: 49.0, R3: 0.0 },
            'WFLW': { R1: 57.0, R2: 48.0, R3: 0.0 },
            'WBW':  { R1: 56.0, R2: 47.0, R3: 0.0 },
            'WFW':  { R1: 55.0, R2: 46.0, R3: 0.0 }
        };

        // Division-specific round thresholds for 5-round fights
        this.DIVISION_ROUND_THRESHOLDS_5RD = {
            'HW':   { R1: 45.0, R2: 36.0, R3: 28.0, R4: 0.0 },
            'LHW':  { R1: 48.0, R2: 39.0, R3: 31.0, R4: 0.0 },
            'MW':   { R1: 51.0, R2: 42.0, R3: 33.0, R4: 0.0 },
            'WW':   { R1: 53.0, R2: 44.0, R3: 35.0, R4: 0.0 },
            'LW':   { R1: 55.0, R2: 45.0, R3: 35.0, R4: 0.0 },
            'FW':   { R1: 55.0, R2: 45.0, R3: 35.0, R4: 0.0 },
            'BW':   { R1: 57.0, R2: 47.0, R3: 37.0, R4: 0.0 },
            'FLW':  { R1: 58.0, R2: 48.0, R3: 38.0, R4: 0.0 },
            'WSW':  { R1: 61.0, R2: 51.0, R3: 41.0, R4: 0.0 },
            'WFLW': { R1: 60.0, R2: 50.0, R3: 40.0, R4: 0.0 },
            'WBW':  { R1: 59.0, R2: 49.0, R3: 39.0, R4: 0.0 },
            'WFW':  { R1: 58.0, R2: 48.0, R3: 38.0, R4: 0.0 }
        };

        this.FALLBACK_THRESHOLDS_3RD = { R1: 52.0, R2: 43.0, R3: 0.0 };
        this.FALLBACK_THRESHOLDS_5RD = { R1: 55.0, R2: 45.0, R3: 35.0, R4: 0.0 };

        // Grappler detection thresholds
        this.WRESTLER_TD_THRESHOLD = 2.5; // TDs per 15 min
        this.WRESTLER_SUB_WIN_THRESHOLD = 50; // % sub wins
        this.VETERAN_CONTROL_TD_THRESHOLD = 2.0;
        this.VETERAN_CONTROL_TIME_THRESHOLD = 2.0; // mins per round

        // Early KO threat multiplier conditions
        this.EARLY_KO_THREAT_TAPOLOGY_THRESHOLD = 65; // underdog < this
        this.EARLY_KO_KO_WIN_THRESHOLD = 75; // % KO wins needed
    }

    /**
     * Generate predictions for all fights in an event
     */
    generatePredictions(fights, eventType) {
        return fights.map(fight => this.predictFight(fight, eventType));
    }

    /**
     * Generate prediction for a single fight
     */
    predictFight(fight, eventType) {
        const reasoning = [];

        // Layer 1: Winner Selection
        const layer1Result = this.layer1WinnerSelection(fight, reasoning);

        // Layer 2: Method Selection
        const layer2Result = this.layer2MethodSelection(fight, layer1Result, eventType, reasoning);

        // Layer 3: Round Prediction
        const layer3Result = this.layer3RoundPrediction(fight, layer1Result, layer2Result, reasoning);

        // Determine which data sources contributed to this prediction
        const dataSources = this.getContributingSources(fight);

        return {
            fightId: fight.id,
            winner: layer1Result.winner,
            winnerName: layer1Result.winnerName,
            method: layer2Result.method,
            round: layer3Result.round,
            confidence: layer1Result.confidence,
            confidenceTier: layer1Result.confidenceTier,
            isVolatile: layer1Result.isVolatile,
            primarySource: layer1Result.primarySource,
            dataSources: dataSources,
            reasoning: {
                winner: reasoning.filter(r => r.layer === 1),
                method: reasoning.filter(r => r.layer === 2),
                round: reasoning.filter(r => r.layer === 3)
            }
        };
    }

    /**
     * Get list of sources that contributed data to this prediction
     */
    getContributingSources(fight) {
        const sources = [];
        const fighterA = fight.fighterA || {};
        const fighterB = fight.fighterB || {};

        // Tapology - check if consensus exists and isn't default 50
        if (fighterA.tapology?.consensus && fighterA.tapology.consensus !== 50) {
            sources.push('tapology');
        }

        // DRatings - check if winPct exists and isn't default 50
        const dratingsA = this.extractDRatingsWinPct(fighterA.dratings);
        if (dratingsA !== 50) {
            sources.push('dratings');
        }

        // FightMatrix expanded data
        if (fighterA.fightmatrix?.eloK170 || fighterB.fightmatrix?.eloK170) {
            sources.push('fightmatrix-elo');
        }
        if (fighterA.fightmatrix?.bettingWinPct || fighterB.fightmatrix?.bettingWinPct) {
            sources.push('betting-odds');
        }
        if (fighterA.fightmatrix?.age || fighterB.fightmatrix?.age) {
            sources.push('age-data');
        }

        // Legacy FightMatrix - check if CIRRS exists
        if (!sources.includes('fightmatrix-elo') && (fighterA.fightMatrix?.cirrs || fighterA.cirrs || fighterB.fightMatrix?.cirrs || fighterB.cirrs)) {
            sources.push('fightmatrix');
        }

        // UFCStats - check if any meaningful stats exist
        if (fighterA.ufcStats?.slpm || fighterA.ufcStats?.koWinPct !== null ||
            fighterB.ufcStats?.slpm || fighterB.ufcStats?.koWinPct !== null) {
            sources.push('ufcstats');
        }

        return sources;
    }

    /**
     * Layer 1: Winner Selection
     * Uses source agreement logic with Tapology override rule
     */
    layer1WinnerSelection(fight, reasoning) {
        const fighterA = fight.fighterA;
        const fighterB = fight.fighterB;

        // Calculate composite win probability
        const sources = this.gatherSourceData(fight);
        const composite = this.calculateCompositeWinProb(sources);

        // Calculate source agreement (new)
        const sourceAgreement = this.calculateSourceAgreement(sources);

        reasoning.push({
            layer: 1,
            type: 'source_data',
            text: `Sources - Tapology: ${fighterA.name} ${sources.tapologyA}% / ${fighterB.name} ${sources.tapologyB}%, DRatings: ${sources.dratingsA}% / ${sources.dratingsB}%`
        });

        // Log source agreement
        if (sourceAgreement.totalSources > 0) {
            reasoning.push({
                layer: 1,
                type: 'source_agreement',
                text: `Source Agreement: ${sourceAgreement.agreementCount}/${sourceAgreement.totalSources} sources agree${sourceAgreement.disagreingSources.length > 0 ? ` (dissenting: ${sourceAgreement.disagreingSources.join(', ')})` : ' (unanimous)'}`
            });
        }

        // Log FightMatrix rating systems
        if (sources.eloK170A && sources.eloK170B) {
            reasoning.push({
                layer: 1,
                type: 'fight_matrix',
                text: `FightMatrix Elo K170: ${fighterA.name} ${sources.eloK170A.winPct.toFixed(1)}% / ${fighterB.name} ${sources.eloK170B.winPct.toFixed(1)}%`
            });
        }

        if (sources.bettingWinPctA && sources.bettingWinPctB) {
            reasoning.push({
                layer: 1,
                type: 'betting_odds',
                text: `Betting Odds: ${fighterA.name} ${sources.bettingWinPctA.toFixed(1)}% / ${fighterB.name} ${sources.bettingWinPctB.toFixed(1)}%`
            });
        }

        // Log age and activity modifiers if applicable
        if (sources.ageA && sources.ageB) {
            reasoning.push({
                layer: 1,
                type: 'age_data',
                text: `Ages: ${fighterA.name} ${sources.ageA} / ${fighterB.name} ${sources.ageB}`
            });
        }

        if (sources.daysSinceLastFightA && sources.daysSinceLastFightB) {
            reasoning.push({
                layer: 1,
                type: 'activity_data',
                text: `Days since last fight: ${fighterA.name} ${sources.daysSinceLastFightA} / ${fighterB.name} ${sources.daysSinceLastFightB}`
            });
        }

        if (sources.last3RecordA && sources.last3RecordB) {
            reasoning.push({
                layer: 1,
                type: 'form_data',
                text: `Last 3 fights: ${fighterA.name} (${sources.last3RecordA}) / ${fighterB.name} (${sources.last3RecordB})`
            });
        }

        // UFCStats career data
        if (fighterA.ufcStats?.koWinPct !== null || fighterB.ufcStats?.koWinPct !== null) {
            const aKO = fighterA.ufcStats?.koWinPct?.toFixed(0) || 'N/A';
            const aSUB = fighterA.ufcStats?.subWinPct?.toFixed(0) || 'N/A';
            const aFinish = fighterA.ufcStats?.finishWinPct?.toFixed(0) || 'N/A';
            const bKO = fighterB.ufcStats?.koWinPct?.toFixed(0) || 'N/A';
            const bSUB = fighterB.ufcStats?.subWinPct?.toFixed(0) || 'N/A';
            const bFinish = fighterB.ufcStats?.finishWinPct?.toFixed(0) || 'N/A';
            reasoning.push({
                layer: 1,
                type: 'ufcstats_data',
                text: `UFCStats Career: ${fighterA.name} (KO ${aKO}%, SUB ${aSUB}%, Finish ${aFinish}%) / ${fighterB.name} (KO ${bKO}%, SUB ${bSUB}%, Finish ${bFinish}%)`
            });
        }

        if (fighterA.ufcStats?.slpm !== null || fighterB.ufcStats?.slpm !== null) {
            const aSlpm = fighterA.ufcStats?.slpm?.toFixed(2) || 'N/A';
            const aTdAvg = fighterA.ufcStats?.tdAvg?.toFixed(1) || 'N/A';
            const bSlpm = fighterB.ufcStats?.slpm?.toFixed(2) || 'N/A';
            const bTdAvg = fighterB.ufcStats?.tdAvg?.toFixed(1) || 'N/A';
            reasoning.push({
                layer: 1,
                type: 'ufcstats_activity',
                text: `UFCStats Activity: ${fighterA.name} (SLpM ${aSlpm}, TD ${aTdAvg}/15min) / ${fighterB.name} (SLpM ${bSlpm}, TD ${bTdAvg}/15min)`
            });
        }

        if (fighterA.ufcStats?.finishLossPct !== null || fighterB.ufcStats?.finishLossPct !== null) {
            const aFinishLoss = fighterA.ufcStats?.finishLossPct?.toFixed(0) || 'N/A';
            const bFinishLoss = fighterB.ufcStats?.finishLossPct?.toFixed(0) || 'N/A';
            reasoning.push({
                layer: 1,
                type: 'ufcstats_vulnerability',
                text: `UFCStats Vulnerability: ${fighterA.name} (${aFinishLoss}% finish losses) / ${fighterB.name} (${bFinishLoss}% finish losses)`
            });
        }

        // Legacy CIRRS fallback
        if (sources.fightMatrixA && sources.fightMatrixB && !sources.eloK170A) {
            const fmGap = sources.fightMatrixA - sources.fightMatrixB;
            reasoning.push({
                layer: 1,
                type: 'fight_matrix',
                text: `Fight Matrix CIRRS: ${fighterA.name} ${sources.fightMatrixA} / ${fighterB.name} ${sources.fightMatrixB} (Gap: ${fmGap > 0 ? '+' : ''}${fmGap})`
            });
        }

        // Determine winner based on composite
        let winner, winnerName, confidence, primarySource;
        let isVolatile = false;

        if (composite.winProbA >= 50) {
            winner = 'fighterA';
            winnerName = fighterA.name;
            confidence = composite.winProbA;
            primarySource = composite.primarySourceA;
        } else {
            winner = 'fighterB';
            winnerName = fighterB.name;
            confidence = composite.winProbB;
            primarySource = composite.primarySourceB;
        }

        // Tapology Override Rule: >75% consensus can override in close fights
        const tapologyOverrideThreshold = 75;
        const closeFightThreshold = 60;

        if (confidence < closeFightThreshold) {
            if (sources.tapologyA > tapologyOverrideThreshold && winner !== 'fighterA') {
                winner = 'fighterA';
                winnerName = fighterA.name;
                confidence = sources.tapologyA;
                primarySource = 'tapology';
                reasoning.push({
                    layer: 1,
                    type: 'override',
                    text: `Tapology Override: ${fighterA.name} has ${sources.tapologyA}% consensus (>${tapologyOverrideThreshold}%) overriding close fight (<${closeFightThreshold}%)`
                });
            } else if (sources.tapologyB > tapologyOverrideThreshold && winner !== 'fighterB') {
                winner = 'fighterB';
                winnerName = fighterB.name;
                confidence = sources.tapologyB;
                primarySource = 'tapology';
                reasoning.push({
                    layer: 1,
                    type: 'override',
                    text: `Tapology Override: ${fighterB.name} has ${sources.tapologyB}% consensus (>${tapologyOverrideThreshold}%) overriding close fight (<${closeFightThreshold}%)`
                });
            }
        }

        // Volatility Detection: sources disagree on winner
        const sourceDisagreement = this.checkSourceDisagreement(sources);
        if (sourceDisagreement) {
            isVolatile = true;
            reasoning.push({
                layer: 1,
                type: 'volatility',
                text: `Volatility Flag: Sources disagree - ${sourceDisagreement}`
            });
        }

        // Confidence tier
        let confidenceTier;
        if (confidence >= this.CONFIDENCE_HIGH) {
            confidenceTier = 'high';
        } else if (confidence >= this.CONFIDENCE_MEDIUM) {
            confidenceTier = 'medium';
        } else {
            confidenceTier = 'low';
            isVolatile = true;
        }

        reasoning.push({
            layer: 1,
            type: 'result',
            text: `Winner: ${winnerName} (${confidence.toFixed(1)}% confidence, ${confidenceTier} tier, primary source: ${primarySource})`
        });

        return {
            winner,
            winnerName,
            confidence,
            confidenceTier,
            isVolatile,
            primarySource,
            sourceAgreement // Include for Layer 2 and 3 to use
        };
    }

    /**
     * Layer 2: Method Selection
     * Applies finish thresholding rule, weight class bias, and source agreement modifiers
     */
    layer2MethodSelection(fight, layer1Result, eventType, reasoning) {
        const winner = layer1Result.winner;
        const winnerData = fight[winner] || {};
        const loserKey = winner === 'fighterA' ? 'fighterB' : 'fighterA';
        const loserData = fight[loserKey] || {};
        const confidence = layer1Result.confidence;
        const sourceAgreement = layer1Result.sourceAgreement;

        // RULE: Close fight lean toward DEC
        // If confidence is below threshold and sources disagree, lean DEC
        if (confidence < this.CLOSE_FIGHT_THRESHOLD) {
            reasoning.push({
                layer: 2,
                type: 'close_fight_rule',
                text: `Close fight detected (${confidence.toFixed(1)}% < ${this.CLOSE_FIGHT_THRESHOLD}%) - leaning toward DEC`
            });

            // If sources also disagree, force DEC
            if (sourceAgreement && sourceAgreement.highConfidenceDisagreement) {
                reasoning.push({
                    layer: 2,
                    type: 'disagreement_rule',
                    text: `High-confidence source disagreement in close fight - forcing DEC prediction`
                });
                return { method: 'DEC', koProb: 0, subProb: 0, forcedByDisagreement: true };
            }
        }

        // Get method distribution from Tapology (using nested structure)
        const tapologyKO = winnerData.tapology?.koTko || 0;
        const tapologySub = winnerData.tapology?.sub || 0;
        const tapologyDec = winnerData.tapology?.dec || 0;
        const hasTapologyMethod = tapologyKO > 0 || tapologySub > 0 || tapologyDec > 0;

        // Get UFC Stats if available (career finish rates)
        const koWinPct = winnerData.ufcStats?.koWinPct || 0;
        const subWinPct = winnerData.ufcStats?.subWinPct || 0;
        const decWinPct = winnerData.ufcStats?.decWinPct || 0;
        const totalFinishPct = koWinPct + subWinPct;
        const opponentFinishLossPct = loserData.ufcStats?.finishLossPct || 0;
        const hasUfcStats = koWinPct > 0 || subWinPct > 0 || opponentFinishLossPct > 0;

        // Get loser's defensive vulnerabilities
        const loserStrDef = loserData.ufcStats?.strDef || 50;
        const loserTdDef = loserData.ufcStats?.tdDef || 50;

        let method = 'DEC';
        let methodReason = '';
        let finalKoProb = 0;
        let finalSubProb = 0;

        // STRATEGY A: Blend Tapology method bars with UFCStats career data
        if (hasTapologyMethod || hasUfcStats) {
            // Start with base probabilities
            let baseKO = 0, baseSub = 0, baseDec = 0;
            let tapologyWeight = 0, ufcStatsWeight = 0;

            // Add Tapology contribution (community prediction)
            if (hasTapologyMethod) {
                reasoning.push({
                    layer: 2,
                    type: 'tapology_method',
                    text: `Tapology method prediction for ${winnerData.name}: KO ${tapologyKO}%, SUB ${tapologySub}%, DEC ${tapologyDec}%`
                });
                baseKO += tapologyKO * 0.5;
                baseSub += tapologySub * 0.5;
                baseDec += tapologyDec * 0.5;
                tapologyWeight = 0.5;
            }

            // Add UFCStats contribution (actual career track record)
            if (hasUfcStats) {
                reasoning.push({
                    layer: 2,
                    type: 'ufcstats_method',
                    text: `UFCStats career for ${winnerData.name}: KO ${koWinPct.toFixed(0)}%, SUB ${subWinPct.toFixed(0)}%, DEC ${decWinPct.toFixed(0)}%`
                });

                // UFCStats weight increases when Tapology is missing
                const ufcWeight = hasTapologyMethod ? 0.5 : 1.0;
                baseKO += koWinPct * ufcWeight;
                baseSub += subWinPct * ufcWeight;
                baseDec += decWinPct * ufcWeight;
                ufcStatsWeight = ufcWeight;

                // Bonus: Opponent vulnerability adjustments
                if (opponentFinishLossPct > 60) {
                    // Opponent gets finished a lot - boost finish probability
                    const vulnerabilityBoost = 1.15;
                    baseKO *= vulnerabilityBoost;
                    baseSub *= vulnerabilityBoost;
                    reasoning.push({
                        layer: 2,
                        type: 'vulnerability_boost',
                        text: `Opponent vulnerability: ${loserData.name} has ${opponentFinishLossPct.toFixed(0)}% finish losses - boosting finish probability`
                    });
                }

                // Striker vs poor chin - boost KO
                if (loserStrDef < 50 && koWinPct > 50) {
                    baseKO *= 1.1;
                    reasoning.push({
                        layer: 2,
                        type: 'matchup_boost',
                        text: `Striking matchup: ${loserData.name} has poor striking defense (${loserStrDef}%) vs KO artist - boosting KO`
                    });
                }

                // Wrestler vs poor TD defense - boost SUB potential
                if (loserTdDef < 50 && subWinPct > 30) {
                    baseSub *= 1.1;
                    reasoning.push({
                        layer: 2,
                        type: 'matchup_boost',
                        text: `Grappling matchup: ${loserData.name} has poor TD defense (${loserTdDef}%) vs grappler - boosting SUB`
                    });
                }
            }

            // Normalize if we had both sources
            const totalWeight = tapologyWeight + ufcStatsWeight;
            if (totalWeight > 0) {
                baseKO = baseKO / totalWeight;
                baseSub = baseSub / totalWeight;
                baseDec = baseDec / totalWeight;
            }

            // Apply weight class bias
            const weightClassBias = this.WEIGHT_CLASS_FINISH_BIAS[fight.weightClass] || { ko: 1, sub: 1, dec: 1 };

            // Calculate adjusted method probabilities
            let koProb = baseKO * weightClassBias.ko;
            let subProb = baseSub * weightClassBias.sub;
            let decProb = baseDec * weightClassBias.dec;

            // RULE: Lopsided favorite boost for finishes
            // When confidence is very high AND sources all agree, boost finish probability
            if (confidence >= this.LOPSIDED_FAVORITE_THRESHOLD && sourceAgreement && sourceAgreement.allAgree) {
                const finishBoost = 1.25;
                koProb *= finishBoost;
                subProb *= finishBoost;
                reasoning.push({
                    layer: 2,
                    type: 'lopsided_favorite',
                    text: `Lopsided favorite rule: ${confidence.toFixed(1)}% confidence + unanimous sources → boosting finish probability by 25%`
                });
            } else if (confidence >= this.LOPSIDED_FAVORITE_THRESHOLD) {
                // High confidence but some disagreement - smaller boost
                const finishBoost = 1.1;
                koProb *= finishBoost;
                subProb *= finishBoost;
                reasoning.push({
                    layer: 2,
                    type: 'lopsided_favorite',
                    text: `Strong favorite rule: ${confidence.toFixed(1)}% confidence → slight finish boost`
                });
            }

            // RULE: Betting odds finish modifier
            // Big favorites finish fights more often - use betting data we already have
            const winnerBettingPct = winnerData.fightmatrix?.bettingWinPct || null;
            if (winnerBettingPct !== null) {
                let bettingFinishMult = 1.0;
                if (winnerBettingPct >= 80) {
                    bettingFinishMult = 1.35;
                } else if (winnerBettingPct >= 75) {
                    bettingFinishMult = 1.25;
                } else if (winnerBettingPct >= 70) {
                    bettingFinishMult = 1.15;
                }
                if (bettingFinishMult > 1.0) {
                    koProb *= bettingFinishMult;
                    subProb *= bettingFinishMult;
                    reasoning.push({
                        layer: 2,
                        type: 'betting_finish_modifier',
                        text: `Betting odds finish modifier: ${winnerData.name} at ${winnerBettingPct.toFixed(1)}% betting favorite → ${((bettingFinishMult - 1) * 100).toFixed(0)}% finish probability boost`
                    });
                }
            }

            // Apply grappler-specific rules (if UFC stats available)
            if (hasUfcStats) {
                const grapplerAdjustment = this.applyGrapplerRules(winnerData, loserData, fight.weightClass, reasoning);
                koProb *= grapplerAdjustment.koMult;
                subProb *= grapplerAdjustment.subMult;
                decProb *= grapplerAdjustment.decMult;

                // Apply striker-specific rules
                const strikerAdjustment = this.applyStrikerRules(winnerData, loserData, layer1Result, fight.weightClass, reasoning);
                koProb *= strikerAdjustment.koMult;
            }

            // Apply event type modifiers
            const eventModifier = this.applyEventTypeModifier(eventType, fight.isMainEvent, fight.numRounds, reasoning);
            decProb *= eventModifier.decMult;
            koProb *= eventModifier.finishMult;
            subProb *= eventModifier.finishMult;

            // Normalize and select method
            const total = koProb + subProb + decProb;
            if (total > 0) {
                koProb = (koProb / total) * 100;
                subProb = (subProb / total) * 100;
                decProb = (decProb / total) * 100;

                // Capture actual probabilities for Layer 3 round prediction
                finalKoProb = koProb;
                finalSubProb = subProb;

                reasoning.push({
                    layer: 2,
                    type: 'adjusted_probs',
                    text: `Adjusted method probabilities: KO ${koProb.toFixed(1)}%, SUB ${subProb.toFixed(1)}%, DEC ${decProb.toFixed(1)}%`
                });

                // EV-based method selection
                // Scoring: DEC correct = 8pts max, Finish correct = 10pts max
                // Break-even: finish at ~45% prob yields same EV as DEC at ~55%
                const combinedFinishProb = koProb + subProb;
                const EV_FINISH_THRESHOLD = 45;

                if (combinedFinishProb >= EV_FINISH_THRESHOLD) {
                    if (koProb >= subProb) {
                        method = 'KO';
                        methodReason = `KO selected: EV-optimal (combined finish ${combinedFinishProb.toFixed(1)}% >= ${EV_FINISH_THRESHOLD}%, KO ${koProb.toFixed(1)}% > SUB ${subProb.toFixed(1)}%)`;
                    } else {
                        method = 'SUB';
                        methodReason = `SUB selected: EV-optimal (combined finish ${combinedFinishProb.toFixed(1)}% >= ${EV_FINISH_THRESHOLD}%, SUB ${subProb.toFixed(1)}% > KO ${koProb.toFixed(1)}%)`;
                    }
                } else {
                    method = 'DEC';
                    methodReason = `DEC selected: Combined finish probability too low (${combinedFinishProb.toFixed(1)}% < ${EV_FINISH_THRESHOLD}% EV threshold)`;
                }
            }
        }
        // STRATEGY B: Fall back to UFC Stats finish thresholding if no Tapology method data
        else if (hasUfcStats) {
            reasoning.push({
                layer: 2,
                type: 'finish_rate',
                text: `${winnerData.name} career finishes: ${totalFinishPct.toFixed(1)}% (KO: ${koWinPct}%, SUB: ${subWinPct}%). ${loserData.name} finish losses: ${opponentFinishLossPct}%`
            });

            // Finish Thresholding Rule
            const canPredictFinish = totalFinishPct >= this.FINISH_THRESHOLD &&
                                      opponentFinishLossPct >= this.OPPONENT_FINISH_LOSS_THRESHOLD;

            if (canPredictFinish) {
                // Determine KO vs SUB based on winner's stats
                if (koWinPct > subWinPct) {
                    method = 'KO';
                    finalKoProb = koWinPct;
                    finalSubProb = subWinPct;
                    methodReason = `KO selected: ${winnerData.name} has ${koWinPct}% KO wins vs ${subWinPct}% SUB wins`;
                } else if (subWinPct > koWinPct) {
                    method = 'SUB';
                    finalKoProb = koWinPct;
                    finalSubProb = subWinPct;
                    methodReason = `SUB selected: ${winnerData.name} has ${subWinPct}% SUB wins vs ${koWinPct}% KO wins`;
                } else {
                    // Default to KO if equal
                    method = 'KO';
                    finalKoProb = koWinPct;
                    finalSubProb = subWinPct;
                    methodReason = `KO selected: Equal finish rates, defaulting to KO`;
                }
            } else {
                methodReason = `Finish threshold not met: ${winnerData.name} ${totalFinishPct.toFixed(1)}% finishes (need ${this.FINISH_THRESHOLD}%), ${loserData.name} ${opponentFinishLossPct}% finish losses (need ${this.OPPONENT_FINISH_LOSS_THRESHOLD}%)`;
                reasoning.push({
                    layer: 2,
                    type: 'threshold',
                    text: methodReason
                });
            }
        }
        // STRATEGY C: No method data available - default to DEC
        else {
            methodReason = 'No method data available (no Tapology method bars or UFC Stats) - defaulting to DEC';
            reasoning.push({
                layer: 2,
                type: 'no_data',
                text: methodReason
            });
        }

        reasoning.push({
            layer: 2,
            type: 'result',
            text: `Method: ${method} - ${methodReason}`
        });

        return {
            method,
            koProb: finalKoProb,
            subProb: finalSubProb
        };
    }

    /**
     * Layer 3: Round Prediction
     * Uses continuous scoring with division-specific thresholds to produce
     * natural round variance instead of collapsing all finishes into R1.
     */
    layer3RoundPrediction(fight, layer1Result, layer2Result, reasoning) {
        const winner = layer1Result.winner;
        const loserKey = winner === 'fighterA' ? 'fighterB' : 'fighterA';
        const loserData = fight[loserKey];
        const confidence = layer1Result.confidence;

        const method = layer2Result.method;
        const numRounds = fight.numRounds || 3;
        const isFiveRounder = numRounds === 5;
        const weightClass = fight.weightClass || '';

        let round = 'DEC';

        // If method is decision, round is N/A (full fight)
        if (method === 'DEC') {
            reasoning.push({
                layer: 3,
                type: 'result',
                text: `Round: DEC (Decision - full ${numRounds} rounds)`
            });
            return { round: 'DEC' };
        }

        // Determine dominant method probability from Layer 2
        const dominantPct = method === 'KO' ? layer2Result.koProb : layer2Result.subProb;

        // Calculate early finish profile using continuous scoring
        const earlyFinishProfile = this.calculateEarlyFinishProfile(
            method, dominantPct, loserData, confidence
        );

        reasoning.push({
            layer: 3,
            type: 'early_finish',
            text: `Early finish profile: ${earlyFinishProfile.score.toFixed(1)} (${earlyFinishProfile.reason})`
        });

        // Select division-specific thresholds
        const thresholds = isFiveRounder
            ? (this.DIVISION_ROUND_THRESHOLDS_5RD[weightClass] || this.FALLBACK_THRESHOLDS_5RD)
            : (this.DIVISION_ROUND_THRESHOLDS_3RD[weightClass] || this.FALLBACK_THRESHOLDS_3RD);

        // Select round based on tiered thresholds (iterate in order: R1, R2, R3...)
        for (const [roundName, threshold] of Object.entries(thresholds)) {
            if (earlyFinishProfile.score >= threshold) {
                round = roundName;
                break;
            }
        }

        // Fallback if no threshold matched
        if (round === 'DEC') {
            round = isFiveRounder ? 'R4' : 'R3';
        }

        const thresholdStr = Object.entries(thresholds)
            .map(([r, t]) => `${r}>=${t}`)
            .join(', ');
        reasoning.push({
            layer: 3,
            type: 'round_selection',
            text: `${weightClass} thresholds [${thresholdStr}] → ${round} (score ${earlyFinishProfile.score.toFixed(1)})`
        });

        reasoning.push({
            layer: 3,
            type: 'result',
            text: `Round: ${round}`
        });

        return { round };
    }

    /**
     * Gather source data for composite calculation
     * Updated to use nested data structure with expanded FightMatrix data
     */
    gatherSourceData(fight) {
        const fighterA = fight.fighterA || {};
        const fighterB = fight.fighterB || {};

        return {
            // Tapology data
            tapologyA: fighterA.tapology?.consensus || 50,
            tapologyB: fighterB.tapology?.consensus || 50,
            tapologyKOA: fighterA.tapology?.koTko || 0,
            tapologySubA: fighterA.tapology?.sub || 0,
            tapologyDecA: fighterA.tapology?.dec || 0,
            tapologyKOB: fighterB.tapology?.koTko || 0,
            tapologySubB: fighterB.tapology?.sub || 0,
            tapologyDecB: fighterB.tapology?.dec || 0,
            // DRatings data - handle null/missing data properly
            dratingsA: this.extractDRatingsWinPct(fighterA.dratings),
            dratingsB: this.extractDRatingsWinPct(fighterB.dratings),
            // Legacy CIRRS (backwards compatible)
            fightMatrixA: fighterA.fightMatrix?.cirrs || fighterA.cirrs || null,
            fightMatrixB: fighterB.fightMatrix?.cirrs || fighterB.cirrs || null,
            // Expanded FightMatrix rating systems
            eloK170A: fighterA.fightmatrix?.eloK170 || null,
            eloK170B: fighterB.fightmatrix?.eloK170 || null,
            eloModA: fighterA.fightmatrix?.eloMod || null,
            eloModB: fighterB.fightmatrix?.eloMod || null,
            glickoA: fighterA.fightmatrix?.glicko || null,
            glickoB: fighterB.fightmatrix?.glicko || null,
            whrA: fighterA.fightmatrix?.whr || null,
            whrB: fighterB.fightmatrix?.whr || null,
            // Betting odds
            bettingWinPctA: fighterA.fightmatrix?.bettingWinPct || null,
            bettingWinPctB: fighterB.fightmatrix?.bettingWinPct || null,
            // Age and activity data
            ageA: fighterA.fightmatrix?.age || null,
            ageB: fighterB.fightmatrix?.age || null,
            daysSinceLastFightA: fighterA.fightmatrix?.daysSinceLastFight || null,
            daysSinceLastFightB: fighterB.fightmatrix?.daysSinceLastFight || null,
            // Recent form
            last3RecordA: fighterA.fightmatrix?.last3Record || null,
            last3RecordB: fighterB.fightmatrix?.last3Record || null
        };
    }

    /**
     * Extract DRatings win percentage from various data formats
     * Handles: number, object with winPct, string, null/undefined
     * @returns {number} Win percentage (0-100) or 50 if no valid data
     */
    extractDRatingsWinPct(dratings) {
        // Direct number
        if (typeof dratings === 'number' && !isNaN(dratings)) {
            return dratings;
        }
        // Object with winPct property
        if (dratings && typeof dratings === 'object') {
            const winPct = dratings.winPct;
            if (typeof winPct === 'number' && !isNaN(winPct)) {
                return winPct;
            }
            if (typeof winPct === 'string') {
                const parsed = parseFloat(winPct);
                if (!isNaN(parsed)) {
                    return parsed;
                }
            }
        }
        // String number
        if (typeof dratings === 'string') {
            const parsed = parseFloat(dratings);
            if (!isNaN(parsed)) {
                return parsed;
            }
        }
        // Default when no valid data
        return 50;
    }

    /**
     * Calculate composite win probability from all sources
     * Updated to incorporate multiple FightMatrix rating systems and modifiers
     */
    calculateCompositeWinProb(sources) {
        let totalWeight = 0;
        let weightedSumA = 0;
        let primarySourceA = 'composite';
        let primarySourceB = 'composite';
        let maxContributionA = 0;
        const contributions = [];

        // Tapology contribution (weight: 20%)
        const tapologyWeight = 0.20;
        if (sources.tapologyA !== 50 || sources.tapologyB !== 50) {
            weightedSumA += sources.tapologyA * tapologyWeight;
            totalWeight += tapologyWeight;
            contributions.push({ source: 'tapology', value: sources.tapologyA, weight: tapologyWeight });
            if (sources.tapologyA * tapologyWeight > maxContributionA) {
                maxContributionA = sources.tapologyA * tapologyWeight;
                primarySourceA = 'tapology';
            }
        }

        // DRatings contribution (weight: 15%)
        const dratingsWeight = 0.15;
        if (sources.dratingsA !== 50 || sources.dratingsB !== 50) {
            weightedSumA += sources.dratingsA * dratingsWeight;
            totalWeight += dratingsWeight;
            contributions.push({ source: 'dratings', value: sources.dratingsA, weight: dratingsWeight });
            if (sources.dratingsA * dratingsWeight > maxContributionA) {
                maxContributionA = sources.dratingsA * dratingsWeight;
                primarySourceA = 'dratings';
            }
        }

        // FightMatrix Betting Odds (weight: 20% - market signal is strong)
        if (sources.bettingWinPctA !== null && sources.bettingWinPctB !== null) {
            const bettingWeight = 0.20;
            weightedSumA += sources.bettingWinPctA * bettingWeight;
            totalWeight += bettingWeight;
            contributions.push({ source: 'betting', value: sources.bettingWinPctA, weight: bettingWeight });
            if (sources.bettingWinPctA * bettingWeight > maxContributionA) {
                maxContributionA = sources.bettingWinPctA * bettingWeight;
                primarySourceA = 'betting';
            }
        }

        // FightMatrix Elo K170 (weight: 15%)
        if (sources.eloK170A !== null && sources.eloK170B !== null) {
            const eloWeight = 0.15;
            weightedSumA += sources.eloK170A.winPct * eloWeight;
            totalWeight += eloWeight;
            contributions.push({ source: 'eloK170', value: sources.eloK170A.winPct, weight: eloWeight });
            if (sources.eloK170A.winPct * eloWeight > maxContributionA) {
                maxContributionA = sources.eloK170A.winPct * eloWeight;
                primarySourceA = 'eloK170';
            }
        }

        // FightMatrix Elo Modified (weight: 10%)
        if (sources.eloModA !== null && sources.eloModB !== null) {
            const eloModWeight = 0.10;
            weightedSumA += sources.eloModA.winPct * eloModWeight;
            totalWeight += eloModWeight;
            contributions.push({ source: 'eloMod', value: sources.eloModA.winPct, weight: eloModWeight });
        }

        // FightMatrix Glicko-1 (weight: 10%)
        if (sources.glickoA !== null && sources.glickoB !== null) {
            const glickoWeight = 0.10;
            weightedSumA += sources.glickoA.winPct * glickoWeight;
            totalWeight += glickoWeight;
            contributions.push({ source: 'glicko', value: sources.glickoA.winPct, weight: glickoWeight });
        }

        // FightMatrix WHR (weight: 10% - lower weight as it can be volatile)
        if (sources.whrA !== null && sources.whrB !== null) {
            const whrWeight = 0.10;
            weightedSumA += sources.whrA.winPct * whrWeight;
            totalWeight += whrWeight;
            contributions.push({ source: 'whr', value: sources.whrA.winPct, weight: whrWeight });
        }

        // Legacy fallback: use CIRRS if no expanded data
        if (totalWeight === 0 && sources.fightMatrixA !== null && sources.fightMatrixB !== null) {
            const fmWeight = 0.30;
            const ratingGap = sources.fightMatrixA - sources.fightMatrixB;
            const fmWinProbA = 50 + (Math.tanh(ratingGap / 200) * 50);
            weightedSumA += fmWinProbA * fmWeight;
            totalWeight += fmWeight;
            contributions.push({ source: 'cirrs', value: fmWinProbA, weight: fmWeight });
        }

        // Calculate base probability
        let winProbA = totalWeight > 0 ? weightedSumA / totalWeight : 50;

        // Apply modifiers based on age and activity
        const ageModifier = this.calculateAgeModifier(sources);
        const activityModifier = this.calculateActivityModifier(sources);
        const formModifier = this.calculateFormModifier(sources);

        // Apply modifiers (small adjustments, capped)
        winProbA += ageModifier + activityModifier + formModifier;
        winProbA = Math.max(5, Math.min(95, winProbA)); // Cap between 5-95%

        const winProbB = 100 - winProbA;

        // Determine primary source for B
        if (winProbB > winProbA) {
            if (sources.tapologyB > sources.tapologyA) primarySourceB = 'tapology';
            else if (sources.dratingsB > sources.dratingsA) primarySourceB = 'dratings';
            else if (sources.bettingWinPctB > sources.bettingWinPctA) primarySourceB = 'betting';
            else if (sources.eloK170B?.winPct > sources.eloK170A?.winPct) primarySourceB = 'eloK170';
        }

        return {
            winProbA,
            winProbB,
            primarySourceA,
            primarySourceB,
            contributions,
            modifiers: { age: ageModifier, activity: activityModifier, form: formModifier }
        };
    }

    /**
     * Calculate age-based modifier
     * Older fighters (35+) get slight penalty, especially vs younger opponents
     */
    calculateAgeModifier(sources) {
        if (sources.ageA === null || sources.ageB === null) return 0;

        const ageDiff = sources.ageB - sources.ageA; // positive = A is younger
        let modifier = 0;

        // Age cliff penalty for fighters over 37
        if (sources.ageA >= 37 && sources.ageB < 35) {
            modifier -= 2; // Penalty for older fighter
        } else if (sources.ageB >= 37 && sources.ageA < 35) {
            modifier += 2; // Bonus for younger fighter A
        }

        // General age advantage (capped at ±1.5%)
        modifier += Math.max(-1.5, Math.min(1.5, ageDiff * 0.2));

        return modifier;
    }

    /**
     * Calculate activity/ring rust modifier
     * Long layoffs get significant penalties - strengthened based on real-world impact
     */
    calculateActivityModifier(sources) {
        if (sources.daysSinceLastFightA === null || sources.daysSinceLastFightB === null) return 0;

        let modifier = 0;

        // Ring rust penalty for A (strengthened penalties)
        if (sources.daysSinceLastFightA > this.LAYOFF_EXTREME) {
            // 500+ days = major ring rust (e.g., Arnold Allen at 546 days)
            modifier -= 5;
        } else if (sources.daysSinceLastFightA > this.LAYOFF_SEVERE) {
            // 400-500 days = significant rust
            modifier -= 3;
        } else if (sources.daysSinceLastFightA > this.LAYOFF_MODERATE) {
            // 300-400 days = some rust
            modifier -= 1.5;
        }

        // Ring rust penalty for B (benefit to A)
        if (sources.daysSinceLastFightB > this.LAYOFF_EXTREME) {
            modifier += 5;
        } else if (sources.daysSinceLastFightB > this.LAYOFF_SEVERE) {
            modifier += 3;
        } else if (sources.daysSinceLastFightB > this.LAYOFF_MODERATE) {
            modifier += 1.5;
        }

        return modifier;
    }

    /**
     * Calculate source agreement score
     * Returns how many sources agree on the same winner and agreement strength
     */
    calculateSourceAgreement(sources) {
        const picks = [];

        // Collect all source picks with their confidence levels
        if (sources.tapologyA !== 50 || sources.tapologyB !== 50) {
            picks.push({
                source: 'Tapology',
                picksA: sources.tapologyA > 50,
                confidence: Math.abs(sources.tapologyA - 50)
            });
        }

        if (sources.dratingsA !== 50 || sources.dratingsB !== 50) {
            picks.push({
                source: 'DRatings',
                picksA: sources.dratingsA > 50,
                confidence: Math.abs(sources.dratingsA - 50)
            });
        }

        if (sources.bettingWinPctA !== null) {
            picks.push({
                source: 'Betting',
                picksA: sources.bettingWinPctA > 50,
                confidence: Math.abs(sources.bettingWinPctA - 50)
            });
        }

        if (sources.eloK170A !== null) {
            picks.push({
                source: 'EloK170',
                picksA: sources.eloK170A.winPct > 50,
                confidence: Math.abs(sources.eloK170A.winPct - 50)
            });
        }

        if (sources.eloModA !== null) {
            picks.push({
                source: 'EloMod',
                picksA: sources.eloModA.winPct > 50,
                confidence: Math.abs(sources.eloModA.winPct - 50)
            });
        }

        if (sources.glickoA !== null) {
            picks.push({
                source: 'Glicko',
                picksA: sources.glickoA.winPct > 50,
                confidence: Math.abs(sources.glickoA.winPct - 50)
            });
        }

        if (sources.whrA !== null) {
            picks.push({
                source: 'WHR',
                picksA: sources.whrA.winPct > 50,
                confidence: Math.abs(sources.whrA.winPct - 50)
            });
        }

        // Legacy CIRRS
        if (sources.fightMatrixA !== null && sources.fightMatrixB !== null && !sources.eloK170A) {
            picks.push({
                source: 'CIRRS',
                picksA: sources.fightMatrixA > sources.fightMatrixB,
                confidence: Math.abs(sources.fightMatrixA - sources.fightMatrixB) / 10 // Normalize
            });
        }

        if (picks.length === 0) {
            return { agreementCount: 0, totalSources: 0, allAgree: false, disagreingSources: [] };
        }

        // Count how many pick A vs B
        const picksACount = picks.filter(p => p.picksA).length;
        const picksBCount = picks.length - picksACount;
        const majorityPicksA = picksACount > picksBCount;
        const agreementCount = majorityPicksA ? picksACount : picksBCount;

        // Find disagreeing sources
        const disagreingSources = picks
            .filter(p => p.picksA !== majorityPicksA)
            .map(p => p.source);

        // Check if high-confidence sources disagree
        const highConfidenceDisagreement = picks
            .filter(p => p.picksA !== majorityPicksA && p.confidence > 15)
            .length > 0;

        return {
            agreementCount,
            totalSources: picks.length,
            allAgree: disagreingSources.length === 0,
            disagreingSources,
            majorityPicksA,
            highConfidenceDisagreement,
            agreementRatio: agreementCount / picks.length
        };
    }

    /**
     * Calculate recent form modifier based on last 3 fights
     */
    calculateFormModifier(sources) {
        if (sources.last3RecordA === null || sources.last3RecordB === null) return 0;

        const parseRecord = (record) => {
            const parts = record.split('-').map(n => parseInt(n));
            return { wins: parts[0] || 0, losses: parts[1] || 0, draws: parts[2] || 0 };
        };

        const recordA = parseRecord(sources.last3RecordA);
        const recordB = parseRecord(sources.last3RecordB);

        let modifier = 0;

        // Perfect recent form bonus
        if (recordA.wins === 3 && recordA.losses === 0) modifier += 1.5;
        if (recordB.wins === 3 && recordB.losses === 0) modifier -= 1.5;

        // Recent losing form penalty
        if (recordA.losses >= 2) modifier -= 1.5;
        if (recordB.losses >= 2) modifier += 1.5;

        return modifier;
    }

    /**
     * Check if sources disagree on the winner
     * Updated to check multiple FightMatrix rating systems
     */
    checkSourceDisagreement(sources) {
        const disagreements = [];
        const picks = [];

        // Tapology pick
        const tapologyPicksA = sources.tapologyA > 50;
        picks.push({ source: 'Tapology', picksA: tapologyPicksA, value: sources.tapologyA });

        // DRatings pick
        const dratingsPicksA = sources.dratingsA > 50;
        picks.push({ source: 'DRatings', picksA: dratingsPicksA, value: sources.dratingsA });

        // Betting odds pick
        if (sources.bettingWinPctA !== null) {
            const bettingPicksA = sources.bettingWinPctA > 50;
            picks.push({ source: 'Betting', picksA: bettingPicksA, value: sources.bettingWinPctA });
        }

        // Elo K170 pick
        if (sources.eloK170A !== null) {
            const eloPicksA = sources.eloK170A.winPct > 50;
            picks.push({ source: 'Elo K170', picksA: eloPicksA, value: sources.eloK170A.winPct });
        }

        // Glicko pick
        if (sources.glickoA !== null) {
            const glickoPicksA = sources.glickoA.winPct > 50;
            picks.push({ source: 'Glicko', picksA: glickoPicksA, value: sources.glickoA.winPct });
        }

        // WHR pick (often disagrees with others)
        if (sources.whrA !== null) {
            const whrPicksA = sources.whrA.winPct > 50;
            picks.push({ source: 'WHR', picksA: whrPicksA, value: sources.whrA.winPct });
        }

        // Check for disagreements between sources
        const majorityPicksA = picks.filter(p => p.picksA).length > picks.length / 2;
        const dissenting = picks.filter(p => p.picksA !== majorityPicksA);

        if (dissenting.length > 0) {
            dissenting.forEach(d => {
                disagreements.push(`${d.source} picks ${d.picksA ? 'Fighter A' : 'Fighter B'} (${d.value.toFixed(1)}%)`);
            });
        }

        // Check for close margins (within 5%)
        const closeMargins = picks.filter(p => Math.abs(p.value - 50) < 5);
        if (closeMargins.length > 0) {
            disagreements.push(`Close margins: ${closeMargins.map(p => p.source).join(', ')}`);
        }

        // Check for high variance between sources
        const values = picks.map(p => p.value);
        const maxValue = Math.max(...values);
        const minValue = Math.min(...values);
        if (maxValue - minValue > 25) {
            disagreements.push(`High variance between sources (${minValue.toFixed(1)}% - ${maxValue.toFixed(1)}%)`);
        }

        return disagreements.length > 0 ? disagreements.join('; ') : null;
    }

    /**
     * Apply grappler-specific rules
     * Updated to use nested ufcStats structure
     */
    applyGrapplerRules(winnerData, loserData, weightClass, reasoning) {
        let koMult = 1;
        let subMult = 1;
        let decMult = 1;

        const tdAvg = winnerData?.ufcStats?.tdAvg || 0;
        const subWinPct = winnerData?.ufcStats?.subWinPct || 0;
        const ctrlTime = winnerData?.ufcStats?.ctrlTime || 0;

        // Wrestler-to-SUB bias: high TDs + high SUB wins
        if (tdAvg >= this.WRESTLER_TD_THRESHOLD && subWinPct >= this.WRESTLER_SUB_WIN_THRESHOLD) {
            subMult = 1.3;
            koMult = 0.8;
            reasoning.push({
                layer: 2,
                type: 'grappler_rule',
                text: `Wrestler-to-SUB bias: ${winnerData.name} has ${tdAvg} TDs/15min and ${subWinPct}% SUB wins - boosting SUB probability`
            });
        }

        // Veteran Control Bias: high TDs + high control time = Decision favored
        if (tdAvg >= this.VETERAN_CONTROL_TD_THRESHOLD && ctrlTime >= this.VETERAN_CONTROL_TIME_THRESHOLD) {
            decMult = 1.25;
            koMult *= 0.9;
            subMult *= 0.9;
            reasoning.push({
                layer: 2,
                type: 'grappler_rule',
                text: `Veteran Control Bias: ${winnerData.name} has ${tdAvg} TDs/15min and ${ctrlTime} min control/round - favoring DEC`
            });
        }

        // Underdog Grappler Caution: check if loser has grappling threat
        const loserTdAvg = loserData?.ufcStats?.tdAvg || 0;
        const loserSubWinPct = loserData?.ufcStats?.subWinPct || 0;
        if (loserTdAvg >= 2.0 && loserSubWinPct >= 40) {
            // Reduce finish confidence when opponent has grappling threat
            koMult *= 0.9;
            subMult *= 0.9;
            reasoning.push({
                layer: 2,
                type: 'grappler_caution',
                text: `Underdog Grappler Caution: ${loserData.name} has grappling threat (${loserTdAvg} TDs, ${loserSubWinPct}% SUB wins) - reducing finish confidence`
            });
        }

        return { koMult, subMult, decMult };
    }

    /**
     * Apply striker-specific rules
     * Updated to use nested ufcStats structure
     */
    applyStrikerRules(winnerData, loserData, layer1Result, weightClass, reasoning) {
        let koMult = 1;

        const koWinPct = winnerData?.ufcStats?.koWinPct || 0;
        const slpm = winnerData?.ufcStats?.slpm || 0;

        // Early KO Threat Multiplier: underdog with high KO rate
        if (layer1Result.confidence < this.EARLY_KO_THREAT_TAPOLOGY_THRESHOLD &&
            koWinPct >= this.EARLY_KO_KO_WIN_THRESHOLD) {
            koMult = 1.25;
            reasoning.push({
                layer: 2,
                type: 'striker_rule',
                text: `Early KO Threat Multiplier: ${winnerData.name} is underdog (<${this.EARLY_KO_THREAT_TAPOLOGY_THRESHOLD}% confidence) with ${koWinPct}% KO wins - boosting KO probability`
            });
        }

        // High volume striker consideration
        if (slpm >= 5.0) {
            koMult *= 1.1;
            reasoning.push({
                layer: 2,
                type: 'striker_rule',
                text: `High Volume Striker: ${winnerData.name} has ${slpm} SLpM - slight KO boost`
            });
        }

        return { koMult };
    }

    /**
     * Apply event type modifiers
     */
    applyEventTypeModifier(eventType, isMainEvent, numRounds, reasoning) {
        let decMult = 1;
        let finishMult = 1;

        // PPV/ABC main events tend toward decisions in close fights
        if ((eventType === 'ppv' || eventType === 'abc') && isMainEvent) {
            decMult = 1.15;
            finishMult = 0.9;
            reasoning.push({
                layer: 2,
                type: 'event_modifier',
                text: `PPV/ABC Main Event modifier: Slightly favoring DEC in high-profile fight`
            });
        }

        // 5-round fights have more time for decisions
        if (numRounds === 5) {
            decMult *= 1.1;
            reasoning.push({
                layer: 2,
                type: 'event_modifier',
                text: `5-round fight modifier: Slightly higher DEC probability due to fight length`
            });
        }

        return { decMult, finishMult };
    }

    /**
     * Calculate early finish profile for round prediction
     * Uses continuous scoring: base = dominant method % × scale factor,
     * plus small capped bonuses. Creates natural variance between fights
     * instead of collapsing everything into R1.
     */
    calculateEarlyFinishProfile(method, dominantPct, loserData, confidence) {
        const bonuses = [];
        let totalBonus = 0;

        // Base score: continuous function of how dominant the predicted method is
        const base = dominantPct * this.METHOD_CONFIDENCE_SCALE;

        // Bonus: Loser is a power puncher (both fighters trading = earlier finishes)
        const loserTapologyKO = loserData?.tapology?.koTko || 0;
        if (loserTapologyKO >= 50) {
            bonuses.push(`loser is power puncher (${loserTapologyKO}% KO)`);
            totalBonus += this.BONUS_LOSER_POWER_PUNCHER;
        }

        // Bonus: Lopsided matchup (big favorites finish more often)
        if (confidence >= 73) {
            bonuses.push('lopsided matchup');
            totalBonus += this.BONUS_LOPSIDED;
        }

        const cappedBonus = Math.min(totalBonus, this.MAX_BONUS_CAP);
        const score = base + cappedBonus;

        return {
            score,
            base,
            dominantPct,
            bonuses,
            cappedBonus,
            reason: `base ${base.toFixed(1)} from ${method} ${dominantPct.toFixed(0)}% × ${this.METHOD_CONFIDENCE_SCALE} + bonus ${cappedBonus.toFixed(1)}${bonuses.length > 0 ? ' (' + bonuses.join(', ') + ')' : ''}`
        };
    }
}

// Export singleton instance
const predictionEngine = new PredictionEngine();
