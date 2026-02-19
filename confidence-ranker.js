/**
 * UFC Weekly Predictor - Confidence Ranker
 * Calculates confidence rankings for pick-only prediction contests
 * Uses existing prediction data to generate sequential rankings from most to least confident
 */

class ConfidenceRanker {
    constructor() {
        // Scoring thresholds
        this.TAPOLOGY_HIGH_THRESHOLD = 75;      // +15 points
        this.TAPOLOGY_MEDIUM_THRESHOLD = 65;    // +10 points
        this.TAPOLOGY_LOW_THRESHOLD = 55;       // +5 points

        this.FIGHTMATRIX_HIGH_GAP = 500;        // +10 points
        this.FIGHTMATRIX_MEDIUM_GAP = 300;      // +5 points

        this.CLOSE_ODDS_THRESHOLD = 60;         // -10 points if below
        this.VOLATILITY_PENALTY = 20;           // -20 points if volatile
    }

    /**
     * Generate confidence rankings for an event
     * @param {Array} predictions - Array of prediction objects
     * @param {Array} fights - Array of fight objects (with fighter data)
     * @param {Object} event - Event object with name, date, etc.
     * @returns {Object} - Confidence ranking result with ranked fights
     */
    generateRankings(predictions, fights, event) {
        if (!predictions || predictions.length === 0) {
            return {
                success: false,
                error: 'No predictions available to rank',
                rankings: []
            };
        }

        // Create a map of fights by ID for easy lookup
        const fightMap = new Map(fights.map(f => [f.id, f]));

        // Calculate confidence score for each prediction
        const scoredFights = predictions.map(prediction => {
            const fight = fightMap.get(prediction.fightId);
            if (!fight) return null;

            const score = this.calculateConfidenceScore(prediction, fight);

            return {
                fightId: prediction.fightId,
                prediction: prediction,
                fight: fight,
                confidenceScore: score.total,
                scoreBreakdown: score.breakdown,
                reasoning: score.reasoning
            };
        }).filter(f => f !== null);

        // Sort by confidence score (highest first)
        scoredFights.sort((a, b) => {
            // Primary sort: confidence score (descending)
            if (b.confidenceScore !== a.confidenceScore) {
                return b.confidenceScore - a.confidenceScore;
            }

            // Tiebreaker 1: DRatings win %
            const dratingsA = this.getDRatingsWinPct(a.prediction, a.fight);
            const dratingsB = this.getDRatingsWinPct(b.prediction, b.fight);
            if (dratingsB !== dratingsA) {
                return dratingsB - dratingsA;
            }

            // Tiebreaker 2: Tapology consensus %
            const tapologyA = this.getTapologyConsensus(a.prediction, a.fight);
            const tapologyB = this.getTapologyConsensus(b.prediction, b.fight);
            if (tapologyB !== tapologyA) {
                return tapologyB - tapologyA;
            }

            // Tiebreaker 3: FightMatrix CIRRS rating gap (higher gap = more confident)
            const fmGapA = this.getFightMatrixGap(a.prediction, a.fight);
            const fmGapB = this.getFightMatrixGap(b.prediction, b.fight);
            if (fmGapB !== fmGapA) {
                return fmGapB - fmGapA;
            }

            // Tiebreaker 4: Non-volatile fights ranked higher
            if (a.prediction.isVolatile !== b.prediction.isVolatile) {
                return a.prediction.isVolatile ? 1 : -1; // Non-volatile first
            }

            // Tiebreaker 5: Main event status (main events ranked higher)
            if (a.fight.isMainEvent !== b.fight.isMainEvent) {
                return a.fight.isMainEvent ? -1 : 1;
            }

            // Tiebreaker 6: Card position (higher position = more important fight)
            const posA = a.fight.cardPosition || 0;
            const posB = b.fight.cardPosition || 0;
            if (posB !== posA) {
                return posB - posA;
            }

            // Final tiebreaker: Alphabetical by predicted winner name (deterministic)
            const nameA = (a.prediction.winnerName || '').toLowerCase();
            const nameB = (b.prediction.winnerName || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });

        // Assign ranks (handle ties)
        const rankings = this.assignRanks(scoredFights);

        return {
            success: true,
            eventId: event.id,
            eventName: event.name,
            eventDate: event.date,
            totalFights: rankings.length,
            rankings: rankings,
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Calculate confidence score for a single fight prediction
     */
    calculateConfidenceScore(prediction, fight) {
        let total = 0;
        const breakdown = {};
        const reasoning = [];

        // Get the predicted winner's data
        const winner = prediction.winner; // 'fighterA' or 'fighterB'
        const winnerData = fight[winner] || {};
        const loserKey = winner === 'fighterA' ? 'fighterB' : 'fighterA';
        const loserData = fight[loserKey] || {};

        // 1. DRatings win probability (0-100 points)
        // Handle various data formats: could be number, object with winPct, or nested
        let dratingsWinPct = 50;
        if (typeof winnerData.dratings === 'number') {
            dratingsWinPct = winnerData.dratings;
        } else if (winnerData.dratings?.winPct !== undefined) {
            dratingsWinPct = parseFloat(winnerData.dratings.winPct) || 50;
        } else if (typeof winnerData.dratings === 'string') {
            dratingsWinPct = parseFloat(winnerData.dratings) || 50;
        }

        const dratingsScore = Math.round(dratingsWinPct);
        total += dratingsScore;
        breakdown.dratings = dratingsScore;
        reasoning.push(`DRatings ${Math.round(dratingsWinPct)}%`);

        // 2. Tapology consensus bonus
        // Handle various data formats
        let tapologyConsensus = 50;
        if (typeof winnerData.tapology === 'number') {
            tapologyConsensus = winnerData.tapology;
        } else if (winnerData.tapology?.consensus !== undefined) {
            tapologyConsensus = parseFloat(winnerData.tapology.consensus) || 50;
        }

        let tapologyBonus = 0;
        if (tapologyConsensus > this.TAPOLOGY_HIGH_THRESHOLD) {
            tapologyBonus = 15;
            reasoning.push(`Tapology ${Math.round(tapologyConsensus)}% (>75%)`);
        } else if (tapologyConsensus > this.TAPOLOGY_MEDIUM_THRESHOLD) {
            tapologyBonus = 10;
            reasoning.push(`Tapology ${Math.round(tapologyConsensus)}%`);
        } else if (tapologyConsensus > this.TAPOLOGY_LOW_THRESHOLD) {
            tapologyBonus = 5;
            reasoning.push(`Tapology ${Math.round(tapologyConsensus)}%`);
        } else {
            reasoning.push(`Tapology ${Math.round(tapologyConsensus)}%`);
        }
        total += tapologyBonus;
        breakdown.tapology = tapologyBonus;

        // 3. Fight Matrix rating gap bonus
        // Handle various data formats
        let winnerCirrs = null;
        if (typeof winnerData.fightMatrix === 'number') {
            winnerCirrs = winnerData.fightMatrix;
        } else if (winnerData.fightMatrix?.cirrs !== undefined) {
            winnerCirrs = parseFloat(winnerData.fightMatrix.cirrs) || null;
        } else if (winnerData.cirrs !== undefined) {
            winnerCirrs = parseFloat(winnerData.cirrs) || null;
        }

        let loserCirrs = null;
        if (typeof loserData.fightMatrix === 'number') {
            loserCirrs = loserData.fightMatrix;
        } else if (loserData.fightMatrix?.cirrs !== undefined) {
            loserCirrs = parseFloat(loserData.fightMatrix.cirrs) || null;
        } else if (loserData.cirrs !== undefined) {
            loserCirrs = parseFloat(loserData.cirrs) || null;
        }
        let fightMatrixBonus = 0;
        if (winnerCirrs !== null && loserCirrs !== null) {
            const ratingGap = winnerCirrs - loserCirrs;
            if (ratingGap > this.FIGHTMATRIX_HIGH_GAP) {
                fightMatrixBonus = 10;
                reasoning.push(`Fight Matrix +${ratingGap}`);
            } else if (ratingGap > this.FIGHTMATRIX_MEDIUM_GAP) {
                fightMatrixBonus = 5;
                reasoning.push(`Fight Matrix +${ratingGap}`);
            }
        }
        total += fightMatrixBonus;
        breakdown.fightMatrix = fightMatrixBonus;

        // 4. Confidence tier bonus
        let tierBonus = 0;
        if (prediction.confidenceTier === 'high') {
            tierBonus = 10;
            reasoning.push('High tier');
        } else if (prediction.confidenceTier === 'medium') {
            tierBonus = 5;
            reasoning.push('Medium tier');
        } else {
            reasoning.push('Low tier');
        }
        total += tierBonus;
        breakdown.confidenceTier = tierBonus;

        // 5. Volatility penalty
        // But don't apply if we have strong Tapology consensus (90%+) even if other sources missing
        let volatilityPenalty = 0;
        if (prediction.isVolatile) {
            // Check if volatility is due to missing data vs actual disagreement
            const hasStrongTapology = tapologyConsensus >= 75;
            const dratingsIsMissing = dratingsWinPct === 50; // Default value when missing

            if (hasStrongTapology && dratingsIsMissing) {
                // Volatility is due to missing DRatings data, not actual disagreement
                // Apply reduced penalty
                volatilityPenalty = -10;
                reasoning.push('VOLATILE (missing data)');
            } else {
                volatilityPenalty = -this.VOLATILITY_PENALTY;
                reasoning.push('VOLATILITY FLAG');
            }
        } else {
            reasoning.push('No volatility');
        }
        total += volatilityPenalty;
        breakdown.volatility = volatilityPenalty;

        // 6. Close odds penalty
        // Use the BEST available source for win likelihood, not just DRatings
        let closeOddsPenalty = 0;
        const bestWinLikelihood = Math.max(
            prediction.confidence || 0,
            dratingsWinPct,
            tapologyConsensus
        );
        if (bestWinLikelihood < this.CLOSE_ODDS_THRESHOLD) {
            closeOddsPenalty = -10;
            reasoning.push('Close odds');
        }
        total += closeOddsPenalty;
        breakdown.closeOdds = closeOddsPenalty;

        return {
            total: Math.max(0, total), // Don't go negative
            breakdown,
            reasoning
        };
    }

    /**
     * Assign sequential ranks (deterministic - no ties due to comprehensive tiebreakers)
     * Ranks go from highest (totalFights) = most confident to lowest (1) = least confident
     */
    assignRanks(scoredFights) {
        const totalFights = scoredFights.length;
        const rankings = [];

        // Since our sort function has deterministic tiebreakers (ending in alphabetical),
        // each fight gets a unique rank - no ties possible
        for (let i = 0; i < scoredFights.length; i++) {
            const fight = scoredFights[i];
            const rank = totalFights - i; // First in sorted list = highest rank

            rankings.push({
                rank: rank,
                fightId: fight.fightId,
                fighterA: fight.fight.fighterA?.name || 'Fighter A',
                fighterB: fight.fight.fighterB?.name || 'Fighter B',
                weightClass: fight.fight.weightClass,
                isMainEvent: fight.fight.isMainEvent,
                pick: fight.prediction.winnerName,
                pickKey: fight.prediction.winner,
                method: fight.prediction.method,
                round: fight.prediction.round,
                confidenceScore: fight.confidenceScore,
                scoreBreakdown: fight.scoreBreakdown,
                reasoning: fight.reasoning,
                isVolatile: fight.prediction.isVolatile,
                isTied: false // Deterministic sort means no ties
            });
        }

        return rankings;
    }

    /**
     * Get DRatings win % for the predicted winner
     */
    getDRatingsWinPct(prediction, fight) {
        const winnerData = fight[prediction.winner] || {};
        if (typeof winnerData.dratings === 'number') {
            return winnerData.dratings;
        } else if (winnerData.dratings?.winPct !== undefined) {
            return parseFloat(winnerData.dratings.winPct) || 50;
        } else if (typeof winnerData.dratings === 'string') {
            return parseFloat(winnerData.dratings) || 50;
        }
        return 50;
    }

    /**
     * Get Tapology consensus % for the predicted winner
     */
    getTapologyConsensus(prediction, fight) {
        const winnerData = fight[prediction.winner] || {};
        if (typeof winnerData.tapology === 'number') {
            return winnerData.tapology;
        } else if (winnerData.tapology?.consensus !== undefined) {
            return parseFloat(winnerData.tapology.consensus) || 50;
        }
        return 50;
    }

    /**
     * Get FightMatrix CIRRS rating gap (winner - loser)
     * Positive = winner is higher rated
     */
    getFightMatrixGap(prediction, fight) {
        const winnerKey = prediction.winner;
        const loserKey = winnerKey === 'fighterA' ? 'fighterB' : 'fighterA';
        const winnerData = fight[winnerKey] || {};
        const loserData = fight[loserKey] || {};

        // Extract winner CIRRS
        let winnerCirrs = null;
        if (typeof winnerData.fightMatrix === 'number') {
            winnerCirrs = winnerData.fightMatrix;
        } else if (winnerData.fightMatrix?.cirrs !== undefined) {
            winnerCirrs = parseFloat(winnerData.fightMatrix.cirrs) || null;
        } else if (winnerData.cirrs !== undefined) {
            winnerCirrs = parseFloat(winnerData.cirrs) || null;
        }

        // Extract loser CIRRS
        let loserCirrs = null;
        if (typeof loserData.fightMatrix === 'number') {
            loserCirrs = loserData.fightMatrix;
        } else if (loserData.fightMatrix?.cirrs !== undefined) {
            loserCirrs = parseFloat(loserData.fightMatrix.cirrs) || null;
        } else if (loserData.cirrs !== undefined) {
            loserCirrs = parseFloat(loserData.cirrs) || null;
        }

        if (winnerCirrs !== null && loserCirrs !== null) {
            return winnerCirrs - loserCirrs;
        }
        return 0; // No gap if data missing
    }

    /**
     * Format rankings for clipboard copy (simple format)
     */
    formatForClipboard(rankings) {
        return rankings
            .map(r => `${r.rank.toString().padStart(2, ' ')}. ${r.pick}`)
            .join('\n');
    }

    /**
     * Format rankings for display (detailed format)
     */
    formatForDisplay(rankings, eventName) {
        const lines = [
            `CONFIDENCE RANKINGS FOR ${eventName.toUpperCase()}`,
            `(Most Confident -> Least Confident)`,
            ''
        ];

        rankings.forEach(r => {
            lines.push(`Rank ${r.rank}: ${r.fighterA} vs ${r.fighterB} [${r.weightClass}]`);
            lines.push(`  Pick: ${r.pick}`);
            lines.push(`  Confidence Score: ${r.confidenceScore}`);
            lines.push(`  Reasoning: ${r.reasoning.join(', ')}`);
            lines.push('');
        });

        return lines.join('\n');
    }

    /**
     * Get tier color class based on rank position
     * @param {number} rank - Current rank
     * @param {number} totalFights - Total number of fights
     * @returns {string} - CSS class for tier coloring
     */
    getRankTierClass(rank, totalFights) {
        // Top 33% = high confidence (green)
        // Middle 34% = medium confidence (yellow)
        // Bottom 33% = low confidence (red)
        const percentile = rank / totalFights;

        if (percentile > 0.67) {
            return 'rank-tier-high';
        } else if (percentile > 0.33) {
            return 'rank-tier-medium';
        } else {
            return 'rank-tier-low';
        }
    }
}

// Export singleton instance
const confidenceRanker = new ConfidenceRanker();
