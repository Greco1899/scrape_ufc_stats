/**
 * UFC Weekly Predictor - Accuracy Tracking System
 * Tracks prediction accuracy across all dimensions
 */

class AccuracyTracker {
    constructor() {
        // Weight class categories for grouping
        this.HEAVY_WEIGHT_CLASSES = ['HW', 'LHW'];
        this.MIDDLE_WEIGHT_CLASSES = ['MW', 'WW'];
        this.LIGHT_WEIGHT_CLASSES = ['LW', 'FW', 'BW', 'FLW'];
        this.WOMENS_WEIGHT_CLASSES = ['WSW', 'WFLW', 'WBW', 'WFW'];
    }

    /**
     * Calculate accuracy for a single event
     */
    async calculateEventAccuracy(eventId) {
        const event = await storage.getEvent(eventId);
        const fights = await storage.getFightsByEvent(eventId);
        const predictions = await storage.getPredictionsByEvent(eventId);
        const results = await storage.getResultsByEvent(eventId);

        if (predictions.length === 0 || results.length === 0) {
            return null;
        }

        // Create lookup maps
        const predictionMap = new Map(predictions.map(p => [p.fightId, p]));
        const resultMap = new Map(results.map(r => [r.fightId, r]));
        const fightMap = new Map(fights.map(f => [f.id, f]));

        // Initialize counters
        let totalFights = 0;
        let winnerCorrect = 0;
        let methodCorrect = 0;
        let roundCorrect = 0;

        // Dimension tracking
        const byWeightClass = {};
        const bySource = {};
        const byVolatility = { volatile: { total: 0, correct: 0 }, nonVolatile: { total: 0, correct: 0 } };
        const fightDetails = [];

        // Process each fight with both prediction and result
        for (const [fightId, prediction] of predictionMap) {
            const result = resultMap.get(fightId);
            const fight = fightMap.get(fightId);

            // Skip if no result, no fight, or fight was cancelled
            if (!result || !fight || result.winner === 'cancelled') continue;

            totalFights++;

            // Check winner
            const winnerMatch = prediction.winner === result.winner;
            if (winnerMatch) winnerCorrect++;

            // Check method (only if winner correct)
            const methodMatch = winnerMatch && this.methodMatches(prediction.method, result.method);
            if (methodMatch) methodCorrect++;

            // Check round (only if method correct and not DEC)
            const roundMatch = methodMatch && this.roundMatches(prediction.round, result.round, result.method);
            if (roundMatch) roundCorrect++;

            // Track by weight class
            const weightClass = fight.weightClass;
            if (!byWeightClass[weightClass]) {
                byWeightClass[weightClass] = { total: 0, winnerCorrect: 0, methodCorrect: 0, roundCorrect: 0 };
            }
            byWeightClass[weightClass].total++;
            if (winnerMatch) byWeightClass[weightClass].winnerCorrect++;
            if (methodMatch) byWeightClass[weightClass].methodCorrect++;
            if (roundMatch) byWeightClass[weightClass].roundCorrect++;

            // Track by primary source
            const source = prediction.primarySource;
            if (!bySource[source]) {
                bySource[source] = { total: 0, winnerCorrect: 0, methodCorrect: 0, roundCorrect: 0 };
            }
            bySource[source].total++;
            if (winnerMatch) bySource[source].winnerCorrect++;
            if (methodMatch) bySource[source].methodCorrect++;
            if (roundMatch) bySource[source].roundCorrect++;

            // Track by volatility
            const volatilityKey = prediction.isVolatile ? 'volatile' : 'nonVolatile';
            byVolatility[volatilityKey].total++;
            if (winnerMatch) byVolatility[volatilityKey].correct++;

            // Store fight details for analysis
            fightDetails.push({
                fightId,
                fighterA: fight.fighterA.name,
                fighterB: fight.fighterB.name,
                weightClass,
                prediction: {
                    winner: prediction.winnerName,
                    method: prediction.method,
                    round: prediction.round,
                    confidence: prediction.confidence,
                    confidenceTier: prediction.confidenceTier,
                    isVolatile: prediction.isVolatile,
                    primarySource: prediction.primarySource
                },
                result: {
                    winner: result.winnerName,
                    method: result.method,
                    round: result.round
                },
                correct: {
                    winner: winnerMatch,
                    method: methodMatch,
                    round: roundMatch
                }
            });
        }

        const accuracyRecord = {
            eventId,
            eventName: event.name,
            eventDate: event.date,
            eventType: event.type,
            totalFights,
            winnerCorrect,
            methodCorrect,
            roundCorrect,
            byWeightClass,
            bySource,
            byVolatility,
            fightDetails
        };

        // Save to database
        await storage.saveAccuracyRecord(accuracyRecord);

        return accuracyRecord;
    }

    /**
     * Check if methods match (handles variations like KO/TKO)
     */
    methodMatches(predicted, actual) {
        // Normalize methods
        const normalizedPredicted = this.normalizeMethod(predicted);
        const normalizedActual = this.normalizeMethod(actual);

        return normalizedPredicted === normalizedActual;
    }

    /**
     * Normalize method names
     */
    normalizeMethod(method) {
        if (!method) return 'UNKNOWN';

        const upper = method.toUpperCase();

        // Group KO/TKO together
        if (upper === 'KO' || upper === 'TKO' || upper === 'KO/TKO') {
            return 'KO';
        }

        // Group submission variants
        if (upper === 'SUB' || upper === 'SUBMISSION') {
            return 'SUB';
        }

        // Group decision variants
        if (upper === 'DEC' || upper === 'DECISION' || upper === 'UD' || upper === 'SD' || upper === 'MD') {
            return 'DEC';
        }

        return upper;
    }

    /**
     * Check if rounds match
     */
    roundMatches(predicted, actual, method) {
        // For decisions, round prediction is always correct if we predicted DEC
        if (this.normalizeMethod(method) === 'DEC') {
            return predicted === 'DEC';
        }

        // For finishes, compare round numbers
        return predicted === actual;
    }

    /**
     * Get aggregate accuracy across all events
     */
    async getOverallAccuracy() {
        const records = await storage.getAllAccuracyRecords();

        if (records.length === 0) {
            return {
                totalEvents: 0,
                totalFights: 0,
                winnerPct: 0,
                methodPct: 0,
                roundPct: 0,
                byWeightClass: {},
                bySource: {},
                byVolatility: {},
                byEventType: {}
            };
        }

        // Aggregate totals
        let totalFights = 0;
        let totalWinnerCorrect = 0;
        let totalMethodCorrect = 0;
        let totalRoundCorrect = 0;

        const byWeightClass = {};
        const bySource = {};
        const byVolatility = { volatile: { total: 0, correct: 0 }, nonVolatile: { total: 0, correct: 0 } };
        const byEventType = {};

        for (const record of records) {
            totalFights += record.totalFights;
            totalWinnerCorrect += record.winnerCorrect;
            totalMethodCorrect += record.methodCorrect;
            totalRoundCorrect += record.roundCorrect;

            // Aggregate by weight class
            for (const [wc, data] of Object.entries(record.byWeightClass)) {
                if (!byWeightClass[wc]) {
                    byWeightClass[wc] = { total: 0, winnerCorrect: 0, methodCorrect: 0, roundCorrect: 0 };
                }
                byWeightClass[wc].total += data.total;
                byWeightClass[wc].winnerCorrect += data.winnerCorrect;
                byWeightClass[wc].methodCorrect += data.methodCorrect;
                byWeightClass[wc].roundCorrect += data.roundCorrect;
            }

            // Aggregate by source
            for (const [source, data] of Object.entries(record.bySource)) {
                if (!bySource[source]) {
                    bySource[source] = { total: 0, winnerCorrect: 0, methodCorrect: 0, roundCorrect: 0 };
                }
                bySource[source].total += data.total;
                bySource[source].winnerCorrect += data.winnerCorrect;
                bySource[source].methodCorrect += data.methodCorrect;
                bySource[source].roundCorrect += data.roundCorrect;
            }

            // Aggregate volatility
            if (record.byVolatility) {
                byVolatility.volatile.total += record.byVolatility.volatile?.total || 0;
                byVolatility.volatile.correct += record.byVolatility.volatile?.correct || 0;
                byVolatility.nonVolatile.total += record.byVolatility.nonVolatile?.total || 0;
                byVolatility.nonVolatile.correct += record.byVolatility.nonVolatile?.correct || 0;
            }

            // Aggregate by event type
            const eventType = record.eventType || 'unknown';
            if (!byEventType[eventType]) {
                byEventType[eventType] = { total: 0, winnerCorrect: 0 };
            }
            byEventType[eventType].total += record.totalFights;
            byEventType[eventType].winnerCorrect += record.winnerCorrect;
        }

        // Calculate percentages
        const calculatePct = (correct, total) => total > 0 ? (correct / total * 100) : 0;

        // Weight class percentages
        const weightClassPcts = {};
        for (const [wc, data] of Object.entries(byWeightClass)) {
            weightClassPcts[wc] = {
                total: data.total,
                winnerPct: calculatePct(data.winnerCorrect, data.total),
                methodPct: calculatePct(data.methodCorrect, data.total),
                roundPct: calculatePct(data.roundCorrect, data.total)
            };
        }

        // Source percentages
        const sourcePcts = {};
        for (const [source, data] of Object.entries(bySource)) {
            sourcePcts[source] = {
                total: data.total,
                winnerPct: calculatePct(data.winnerCorrect, data.total),
                methodPct: calculatePct(data.methodCorrect, data.total)
            };
        }

        // Volatility percentages
        const volatilityPcts = {
            volatile: {
                total: byVolatility.volatile.total,
                winnerPct: calculatePct(byVolatility.volatile.correct, byVolatility.volatile.total)
            },
            nonVolatile: {
                total: byVolatility.nonVolatile.total,
                winnerPct: calculatePct(byVolatility.nonVolatile.correct, byVolatility.nonVolatile.total)
            }
        };

        // Event type percentages
        const eventTypePcts = {};
        for (const [type, data] of Object.entries(byEventType)) {
            eventTypePcts[type] = {
                total: data.total,
                winnerPct: calculatePct(data.winnerCorrect, data.total)
            };
        }

        return {
            totalEvents: records.length,
            totalFights,
            winnerPct: calculatePct(totalWinnerCorrect, totalFights),
            methodPct: calculatePct(totalMethodCorrect, totalFights),
            roundPct: calculatePct(totalRoundCorrect, totalFights),
            byWeightClass: weightClassPcts,
            bySource: sourcePcts,
            byVolatility: volatilityPcts,
            byEventType: eventTypePcts
        };
    }

    /**
     * Get event history with accuracy summaries
     */
    async getEventHistory() {
        const records = await storage.getAllAccuracyRecords();

        return records.map(record => ({
            eventId: record.eventId,
            eventName: record.eventName,
            eventDate: record.eventDate,
            eventType: record.eventType,
            totalFights: record.totalFights,
            winnerPct: record.totalFights > 0 ? (record.winnerCorrect / record.totalFights * 100) : 0,
            methodPct: record.totalFights > 0 ? (record.methodCorrect / record.totalFights * 100) : 0,
            roundPct: record.totalFights > 0 ? (record.roundCorrect / record.totalFights * 100) : 0,
            timestamp: record.timestamp
        }));
    }

    /**
     * Get detailed breakdown for a specific weight class
     */
    async getWeightClassBreakdown(weightClass) {
        const records = await storage.getAllAccuracyRecords();

        const fights = [];
        for (const record of records) {
            if (record.fightDetails) {
                for (const fight of record.fightDetails) {
                    if (fight.weightClass === weightClass) {
                        fights.push({
                            ...fight,
                            eventName: record.eventName,
                            eventDate: record.eventDate
                        });
                    }
                }
            }
        }

        return fights;
    }

    /**
     * Get trending data for accuracy over time
     */
    async getAccuracyTrends(windowSize = 3) {
        const records = await storage.getAllAccuracyRecords();

        if (records.length < windowSize) {
            return null;
        }

        // Sort by date
        const sortedRecords = records.sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));

        // Calculate rolling averages
        const trends = [];
        for (let i = windowSize - 1; i < sortedRecords.length; i++) {
            const window = sortedRecords.slice(i - windowSize + 1, i + 1);

            let totalFights = 0;
            let totalWinnerCorrect = 0;
            let totalMethodCorrect = 0;

            for (const record of window) {
                totalFights += record.totalFights;
                totalWinnerCorrect += record.winnerCorrect;
                totalMethodCorrect += record.methodCorrect;
            }

            trends.push({
                eventName: sortedRecords[i].eventName,
                eventDate: sortedRecords[i].eventDate,
                winnerPct: totalFights > 0 ? (totalWinnerCorrect / totalFights * 100) : 0,
                methodPct: totalFights > 0 ? (totalMethodCorrect / totalFights * 100) : 0,
                windowSize
            });
        }

        return trends;
    }

    /**
     * Identify underperforming categories
     */
    async identifyWeakAreas(threshold = 50) {
        const overall = await this.getOverallAccuracy();
        const weakAreas = [];

        // Check weight classes
        for (const [wc, data] of Object.entries(overall.byWeightClass)) {
            if (data.total >= 3 && data.winnerPct < threshold) {
                weakAreas.push({
                    category: 'weightClass',
                    value: wc,
                    accuracy: data.winnerPct,
                    total: data.total,
                    message: `${wc} winner accuracy is ${data.winnerPct.toFixed(1)}% (${Math.round(data.winnerPct * data.total / 100)}/${data.total})`
                });
            }
        }

        // Check sources
        for (const [source, data] of Object.entries(overall.bySource)) {
            if (data.total >= 5 && data.winnerPct < threshold) {
                weakAreas.push({
                    category: 'source',
                    value: source,
                    accuracy: data.winnerPct,
                    total: data.total,
                    message: `${source} as primary source: ${data.winnerPct.toFixed(1)}% winner accuracy`
                });
            }
        }

        // Check volatility prediction
        if (overall.byVolatility.volatile.total >= 5) {
            const volatilePct = overall.byVolatility.volatile.winnerPct;
            if (volatilePct < 40) {
                weakAreas.push({
                    category: 'volatility',
                    value: 'volatile',
                    accuracy: volatilePct,
                    total: overall.byVolatility.volatile.total,
                    message: `Volatile fight predictions: only ${volatilePct.toFixed(1)}% winner accuracy`
                });
            }
        }

        // Check method accuracy (lower threshold expected)
        if (overall.totalFights >= 10 && overall.methodPct < 25) {
            weakAreas.push({
                category: 'method',
                value: 'overall',
                accuracy: overall.methodPct,
                total: overall.totalFights,
                message: `Overall method accuracy is ${overall.methodPct.toFixed(1)}% (expected 25-33%)`
            });
        }

        return weakAreas.sort((a, b) => a.accuracy - b.accuracy);
    }

    /**
     * Get segmented accuracy for detailed analysis
     * Breaks down accuracy by confidence tier and predicted method type
     */
    async getSegmentedAccuracy() {
        const records = await storage.getAllAccuracyRecords();

        const segments = {
            confidence: {
                high: { total: 0, correct: 0 },
                medium: { total: 0, correct: 0 },
                low: { total: 0, correct: 0 }
            },
            method: {
                KO: { total: 0, correct: 0, methodCorrect: 0 }, // correct = winner correct, methodCorrect = exact method correct
                SUB: { total: 0, correct: 0, methodCorrect: 0 },
                DEC: { total: 0, correct: 0, methodCorrect: 0 }
            }
        };

        for (const record of records) {
            if (!record.fightDetails) continue;

            for (const fight of record.fightDetails) {
                // Confidence segments
                const tier = fight.prediction.confidenceTier || 'low';
                if (segments.confidence[tier]) {
                    segments.confidence[tier].total++;
                    if (fight.correct.winner) segments.confidence[tier].correct++;
                }

                // Method segments
                const method = this.normalizeMethod(fight.prediction.method);
                if (segments.method[method]) {
                    segments.method[method].total++;
                    if (fight.correct.winner) segments.method[method].correct++;
                    if (fight.correct.method) segments.method[method].methodCorrect++;
                }
            }
        }

        // Calculate percentages
        const results = {
            confidence: {},
            method: {}
        };

        for (const [key, data] of Object.entries(segments.confidence)) {
            results.confidence[key] = {
                total: data.total,
                accuracy: data.total > 0 ? (data.correct / data.total * 100) : 0
            };
        }

        for (const [key, data] of Object.entries(segments.method)) {
            results.method[key] = {
                total: data.total,
                winnerAccuracy: data.total > 0 ? (data.correct / data.total * 100) : 0,
                methodAccuracy: data.total > 0 ? (data.methodCorrect / data.total * 100) : 0
            };
        }

        return results;
    }
}

// Export singleton instance
const accuracyTracker = new AccuracyTracker();
