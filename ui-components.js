/**
 * UFC Weekly Predictor - UI Components
 * Reusable UI components for fight cards, charts, and displays
 */

const UIComponents = {
    /**
     * Create an event card element
     */
    createEventCard(event, isSelected = false) {
        const card = document.createElement('div');
        card.className = `event-card${isSelected ? ' selected' : ''}`;
        card.dataset.eventId = event.id;

        // Map status to CSS class
        const statusClassMap = {
            'pre-event': 'pre-event',
            'fight-card-approved': 'pre-event',
            'data-complete': 'pre-event',
            'predictions-ready': 'predictions-ready',
            'results-entered': 'results-entered'
        };
        const statusClass = statusClassMap[event.status] || 'pre-event';
        const statusText = this.getStatusText(event.status);

        // Build fight count display
        const fightCountText = event.fightCount !== undefined ? `${event.fightCount} fights` : '';

        // Build accuracy display if results are entered
        let accuracyHtml = '';
        if (event.accuracy && event.accuracy.winnerPct !== null) {
            accuracyHtml = `<span class="event-accuracy">${event.accuracy.winnerPct}% correct</span>`;
        }

        card.innerHTML = `
            <h3>${this.escapeHtml(event.name)}</h3>
            <div class="event-meta">
                <span>${this.formatDate(event.date)}</span>
                <span>${this.formatEventType(event.type)}</span>
                ${fightCountText ? `<span class="event-fight-count">${fightCountText}</span>` : ''}
            </div>
            <div class="event-status-row">
                <span class="event-status ${statusClass}">${statusText}</span>
                ${accuracyHtml}
            </div>
        `;

        return card;
    },

    /**
     * Create a fight card element
     */
    createFightCard(fight, isExpanded = false) {
        const card = document.createElement('div');
        card.className = `fight-card${isExpanded ? ' expanded' : ''}`;
        card.dataset.fightId = fight.id;

        const fighterAName = fight.fighterA?.name || 'TBD';
        const fighterBName = fight.fighterB?.name || 'TBD';
        const isComplete = fight.dataComplete;
        const missingFields = storage.getMissingFields(fight);

        card.innerHTML = `
            <div class="fight-card-header">
                <div class="fighters">
                    <span>${this.escapeHtml(fighterAName)}</span>
                    <span class="vs">vs</span>
                    <span>${this.escapeHtml(fighterBName)}</span>
                    <span class="weight-class">${fight.weightClass || 'TBD'}</span>
                    ${fight.isMainEvent ? '<span class="weight-class">Main Event</span>' : ''}
                </div>
                <div class="data-indicator">
                    ${isComplete
                ? '<span class="complete">Complete</span>'
                : `<span class="incomplete">${missingFields.length} missing</span>`}
                    <span class="expand-icon">&#9660;</span>
                </div>
            </div>
            <div class="fight-card-body">
                ${this.createFighterStatsDisplay(fight)}
                <div class="fight-card-actions" style="margin-top: var(--space-md); display: flex; gap: var(--space-sm);">
                    <button class="btn btn-primary btn-sm edit-fight-btn">Edit Fight</button>
                    <button class="btn btn-danger btn-sm delete-fight-btn">Delete</button>
                </div>
            </div>
        `;

        return card;
    },

    /**
     * Create fighter stats display
     */
    createFighterStatsDisplay(fight) {
        const fighterA = fight.fighterA || {};
        const fighterB = fight.fighterB || {};

        return `
            <div class="fighter-stats">
                <div class="fighter-column">
                    <h4>${this.escapeHtml(fighterA.name || 'Fighter A')}</h4>
                    ${this.createStatRows(fighterA, 'A')}
                </div>
                <div class="fighter-column">
                    <h4>${this.escapeHtml(fighterB.name || 'Fighter B')}</h4>
                    ${this.createStatRows(fighterB, 'B')}
                </div>
            </div>
        `;
    },

    /**
     * Create stat rows for a fighter
     */
    createStatRows(fighter, label) {
        // Access nested data with fallbacks
        const tapology = fighter.tapology || {};
        const dratings = fighter.dratings || {};
        const fightMatrix = fighter.fightMatrix || {};
        const ufcStats = fighter.ufcStats || {};

        const stats = [
            { value: fighter.record, label: 'Record' },
            { value: tapology.consensus, label: 'Tapology %', suffix: '%' },
            { value: tapology.koTko, label: 'T-KO %', suffix: '%' },
            { value: tapology.sub, label: 'T-SUB %', suffix: '%' },
            { value: tapology.dec, label: 'T-DEC %', suffix: '%' },
            { value: dratings.winPct, label: 'DRatings %', suffix: '%' },
            { value: fightMatrix.cirrs, label: 'Fight Matrix CIRRS' },
            { value: ufcStats.slpm, label: 'SLpM' },
            { value: ufcStats.tdAvg, label: 'TD Avg' },
            { value: ufcStats.subAvg, label: 'Sub Avg' },
            { value: ufcStats.ctrlTime, label: 'Ctrl Time' },
            { value: ufcStats.koWinPct, label: 'KO Win %', suffix: '%' },
            { value: ufcStats.subWinPct, label: 'SUB Win %', suffix: '%' },
            { value: ufcStats.finishLossPct, label: 'Finish Loss %', suffix: '%' }
        ];

        return stats.map(stat => {
            const value = stat.value;
            const displayValue = value !== null && value !== undefined && value !== ''
                ? `${value}${stat.suffix || ''}`
                : '<span class="missing">--</span>';
            const isMissing = value === null || value === undefined || value === '';

            return `
                <div class="stat-row">
                    <span class="stat-label">${stat.label}</span>
                    <span class="stat-value${isMissing ? ' missing' : ''}">${displayValue}</span>
                </div>
            `;
        }).join('');
    },

    /**
     * Create a prediction card element
     */
    createPredictionCard(prediction, fight, isExpanded = false, aiAnalysis = null) {
        const card = document.createElement('div');
        card.className = `prediction-card confidence-${prediction.confidenceTier}${isExpanded ? ' expanded' : ''}`;
        card.dataset.fightId = prediction.fightId;

        const fighterAName = fight.fighterA?.name || 'Fighter A';
        const fighterBName = fight.fighterB?.name || 'Fighter B';

        card.innerHTML = `
            <div class="prediction-card-header">
                <div class="prediction-summary">
                    <div class="prediction-matchup">
                        ${this.escapeHtml(fighterAName)} vs ${this.escapeHtml(fighterBName)}
                        <span class="weight-class">${fight.weightClass}</span>
                    </div>
                    <div class="prediction-pick">
                        <span class="predicted-winner">${this.escapeHtml(prediction.winnerName)}</span>
                        <span class="prediction-method">by ${prediction.method} ${prediction.round !== 'DEC' ? `(${prediction.round})` : ''}</span>
                    </div>
                </div>
                <div class="prediction-badges">
                    ${prediction.isVolatile ? '<span class="volatility-badge">Volatile</span>' : ''}
                    ${this.createSourceBadges(prediction.dataSources || [prediction.primarySource], prediction.primarySource)}
                    <span class="expand-icon">&#9660;</span>
                </div>
            </div>
            <div class="prediction-card-body">
                ${this.createAIAnalysisSection(aiAnalysis, prediction.fightId)}
                ${this.createReasoningDisplay(prediction.reasoning)}
            </div>
        `;

        return card;
    },

    /**
     * Create AI analysis section for a prediction card
     */
    createAIAnalysisSection(analysisResult, fightId) {
        if (!analysisResult) {
            // No analysis yet - show nothing (user clicks the bulk "AI Analysis" button)
            return '';
        }

        const timestamp = new Date(analysisResult.generatedAt).toLocaleString();
        const newsBadge = analysisResult.hadNews ? '<span class="ai-news-badge">+ News</span>' : '';

        // Sanitize and format the analysis text
        const analysisHtml = this.escapeHtml(analysisResult.analysis)
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');

        return `
            <div class="ai-analysis-section">
                <div class="ai-analysis-header">
                    <span class="ai-badge">AI Analysis</span>
                    ${newsBadge}
                    <span class="ai-timestamp">${timestamp}</span>
                </div>
                <div class="ai-analysis-body">
                    <p>${analysisHtml}</p>
                </div>
            </div>
        `;
    },

    /**
     * Create reasoning display
     */
    createReasoningDisplay(reasoning) {
        const sections = [
            { key: 'winner', title: 'Winner Selection (Layer 1)' },
            { key: 'method', title: 'Method Selection (Layer 2)' },
            { key: 'round', title: 'Round Prediction (Layer 3)' }
        ];

        return `
            <div class="reasoning-section">
                <h4>Prediction Reasoning</h4>
                ${sections.map(section => {
            const items = reasoning[section.key] || [];
            if (items.length === 0) return '';

            return `
                        <div class="reasoning-layer">
                            <strong>${section.title}</strong>
                            ${items.map(item => `
                                <div class="reasoning-item">
                                    ${this.escapeHtml(item.text)}
                                </div>
                            `).join('')}
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    },

    /**
     * Create a result entry card
     */
    createResultCard(fight, prediction, existingResult = null) {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.dataset.fightId = fight.id;

        const fighterAName = fight.fighterA?.name || 'Fighter A';
        const fighterBName = fight.fighterB?.name || 'Fighter B';
        const isCancelled = existingResult?.winner === 'cancelled';

        card.innerHTML = `
            <h4>${this.escapeHtml(fighterAName)} vs ${this.escapeHtml(fighterBName)}</h4>
            <div class="result-form">
                <div class="form-group">
                    <label>Winner</label>
                    <select class="result-winner" required>
                        <option value="">Select winner...</option>
                        <option value="fighterA" ${existingResult?.winner === 'fighterA' ? 'selected' : ''}>${this.escapeHtml(fighterAName)}</option>
                        <option value="fighterB" ${existingResult?.winner === 'fighterB' ? 'selected' : ''}>${this.escapeHtml(fighterBName)}</option>
                        <option value="draw" ${existingResult?.winner === 'draw' ? 'selected' : ''}>Draw/NC</option>
                        <option value="cancelled" ${isCancelled ? 'selected' : ''}>❌ Fight Cancelled</option>
                    </select>
                </div>
                <div class="form-group method-group" ${isCancelled ? 'style="display:none"' : ''}>
                    <label>Method</label>
                    <select class="result-method" ${isCancelled ? '' : 'required'}>
                        <option value="">Select method...</option>
                        <option value="KO" ${existingResult?.method === 'KO' ? 'selected' : ''}>KO/TKO</option>
                        <option value="SUB" ${existingResult?.method === 'SUB' ? 'selected' : ''}>Submission</option>
                        <option value="DEC" ${existingResult?.method === 'DEC' ? 'selected' : ''}>Decision</option>
                        <option value="DRAW" ${existingResult?.method === 'DRAW' ? 'selected' : ''}>Draw</option>
                        <option value="NC" ${existingResult?.method === 'NC' ? 'selected' : ''}>No Contest</option>
                    </select>
                </div>
                <div class="form-group round-group" ${isCancelled ? 'style="display:none"' : ''}>
                    <label>Round</label>
                    <select class="result-round">
                        <option value="DEC" ${existingResult?.round === 'DEC' ? 'selected' : ''}>Full Fight (DEC)</option>
                        <option value="R1" ${existingResult?.round === 'R1' ? 'selected' : ''}>Round 1</option>
                        <option value="R2" ${existingResult?.round === 'R2' ? 'selected' : ''}>Round 2</option>
                        <option value="R3" ${existingResult?.round === 'R3' ? 'selected' : ''}>Round 3</option>
                        <option value="R4" ${existingResult?.round === 'R4' ? 'selected' : ''}>Round 4</option>
                        <option value="R5" ${existingResult?.round === 'R5' ? 'selected' : ''}>Round 5</option>
                    </select>
                </div>
            </div>
            ${prediction ? `
                <div class="result-prediction">
                    <strong>Prediction:</strong> ${this.escapeHtml(prediction.winnerName)} by ${prediction.method} ${prediction.round !== 'DEC' ? `(${prediction.round})` : ''}
                </div>
            ` : ''}
        `;

        // Add event listener to toggle method/round visibility when cancelled is selected
        const winnerSelect = card.querySelector('.result-winner');
        const methodGroup = card.querySelector('.method-group');
        const roundGroup = card.querySelector('.round-group');
        const methodSelect = card.querySelector('.result-method');

        winnerSelect.addEventListener('change', () => {
            const isCancelled = winnerSelect.value === 'cancelled';
            methodGroup.style.display = isCancelled ? 'none' : '';
            roundGroup.style.display = isCancelled ? 'none' : '';
            methodSelect.required = !isCancelled;
        });

        return card;
    },

    /**
     * Create accuracy bar row
     */
    createAccuracyBar(label, percentage, total = null) {
        return `
            <div class="accuracy-row">
                <span class="label">${this.escapeHtml(label)}</span>
                <div class="bar-container">
                    <div class="bar" style="width: ${Math.min(percentage, 100)}%"></div>
                </div>
                <span class="value">${percentage.toFixed(1)}%${total ? ` (${total})` : ''}</span>
            </div>
        `;
    },

    /**
     * Create a finding item
     */
    createFindingItem(finding) {
        const severityClass = finding.severity === 'positive' ? '' :
            finding.severity === 'warning' ? 'warning' : '';

        return `
            <div class="finding-item ${severityClass}">
                <strong>${this.escapeHtml(finding.title)}</strong>
                <p>${this.escapeHtml(finding.message)}</p>
            </div>
        `;
    },

    /**
     * Create a recommendation item
     */
    createRecommendationItem(recommendation) {
        const priorityClass = recommendation.priority === 'high' ? 'warning' : '';

        return `
            <div class="recommendation-item ${priorityClass}">
                <strong>${this.escapeHtml(recommendation.title)}</strong>
                <p>${this.escapeHtml(recommendation.message)}</p>
                <p><em>Action: ${this.escapeHtml(recommendation.action)}</em></p>
            </div>
        `;
    },

    /**
     * Create event history item
     */
    createEventHistoryItem(event) {
        return `
            <div class="event-history-item">
                <div>
                    <strong>${this.escapeHtml(event.eventName)}</strong>
                    <span style="color: var(--text-muted); margin-left: var(--space-sm);">${this.formatDate(event.eventDate)}</span>
                </div>
                <div>
                    <span style="color: var(--success);">${event.winnerPct.toFixed(0)}% Winner</span>
                    <span style="margin-left: var(--space-md);">${event.methodPct.toFixed(0)}% Method</span>
                    <span style="margin-left: var(--space-md); color: var(--text-muted);">(${event.totalFights} fights)</span>
                </div>
            </div>
        `;
    },

    /**
     * Show toast notification
     */
    showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    /**
     * Show loading overlay
     */
    showLoading(text = 'Loading...') {
        const overlay = document.getElementById('loading-overlay');
        const loadingText = overlay.querySelector('.loading-text');
        loadingText.textContent = text;
        overlay.classList.remove('hidden');
    },

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        overlay.classList.add('hidden');
    },

    // ==================== HELPER FUNCTIONS ====================

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Format date for display
     */
    formatDate(dateStr) {
        if (!dateStr) return 'No date';
        // Parse as noon local time to avoid timezone shift issues
        // (parsing "YYYY-MM-DD" alone treats it as UTC midnight, which shifts the day in US timezones)
        const date = new Date(dateStr + 'T12:00:00');
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    },

    /**
     * Format event type for display
     */
    formatEventType(type) {
        const types = {
            'ppv': 'PPV',
            'fight-night': 'Fight Night',
            'abc': 'ABC',
            'espn': 'ESPN'
        };
        return types[type] || type?.toUpperCase() || 'Event';
    },

    /**
     * Get status text
     */
    getStatusText(status) {
        const statuses = {
            'pre-event': 'Fight Card Discovery',
            'fight-card-approved': 'Data Entry',
            'data-complete': 'Data Ready',
            'predictions-ready': 'Predictions Ready',
            'results-entered': 'Complete'
        };
        return statuses[status] || status;
    },

    /**
     * Format source name for display
     */
    formatSourceName(source) {
        const names = {
            'tapology': 'Tapology',
            'dratings': 'DRatings',
            'fightmatrix': 'Fight Matrix',
            'heuristic': 'Heuristic',
            'composite': 'Composite'
        };
        return names[source] || source;
    },

    /**
     * Create source badges HTML for all contributing sources
     * Primary source is highlighted, others are dimmed
     */
    createSourceBadges(dataSources, primarySource) {
        if (!dataSources || dataSources.length === 0) {
            return `<span class="source-tag ${primarySource}">${this.formatSourceName(primarySource)}</span>`;
        }

        return dataSources.map(source => {
            const isPrimary = source === primarySource;
            const className = isPrimary ? `source-tag ${source} primary` : `source-tag ${source} secondary`;
            return `<span class="${className}">${this.formatSourceName(source)}</span>`;
        }).join('');
    },

    /**
     * Populate form from fight data
     * Reads from nested structure matching storage.js format
     */
    populateFightForm(fight) {
        // Basic info
        document.getElementById('fight-id').value = fight.id || '';
        document.getElementById('weight-class').value = fight.weightClass || '';
        document.getElementById('num-rounds').value = fight.numRounds || 3;
        document.getElementById('is-main-event').checked = fight.isMainEvent || false;

        // Fighter A - read from nested structure
        const a = fight.fighterA || {};
        const aTapology = a.tapology || {};
        const aDratings = a.dratings || {};
        const aFightMatrix = a.fightMatrix || {};
        const aUfcStats = a.ufcStats || {};

        document.getElementById('fighter-a-name').value = a.name || '';
        document.getElementById('fighter-a-record').value = a.record || '';
        document.getElementById('fighter-a-tapology-pct').value = aTapology.consensus ?? '';
        document.getElementById('fighter-a-tapology-ko').value = aTapology.koTko ?? '';
        document.getElementById('fighter-a-tapology-sub').value = aTapology.sub ?? '';
        document.getElementById('fighter-a-tapology-dec').value = aTapology.dec ?? '';
        document.getElementById('fighter-a-dratings').value = aDratings.winPct ?? '';
        document.getElementById('fighter-a-fightmatrix').value = aFightMatrix.cirrs ?? '';
        document.getElementById('fighter-a-slpm').value = aUfcStats.slpm ?? '';
        document.getElementById('fighter-a-td-avg').value = aUfcStats.tdAvg ?? '';
        document.getElementById('fighter-a-sub-avg').value = aUfcStats.subAvg ?? '';
        document.getElementById('fighter-a-ctrl-time').value = aUfcStats.ctrlTime ?? '';
        document.getElementById('fighter-a-ko-win-pct').value = aUfcStats.koWinPct ?? '';
        document.getElementById('fighter-a-sub-win-pct').value = aUfcStats.subWinPct ?? '';
        document.getElementById('fighter-a-finish-loss-pct').value = aUfcStats.finishLossPct ?? '';

        // Fighter B - read from nested structure
        const b = fight.fighterB || {};
        const bTapology = b.tapology || {};
        const bDratings = b.dratings || {};
        const bFightMatrix = b.fightMatrix || {};
        const bUfcStats = b.ufcStats || {};

        document.getElementById('fighter-b-name').value = b.name || '';
        document.getElementById('fighter-b-record').value = b.record || '';
        document.getElementById('fighter-b-tapology-pct').value = bTapology.consensus ?? '';
        document.getElementById('fighter-b-tapology-ko').value = bTapology.koTko ?? '';
        document.getElementById('fighter-b-tapology-sub').value = bTapology.sub ?? '';
        document.getElementById('fighter-b-tapology-dec').value = bTapology.dec ?? '';
        document.getElementById('fighter-b-dratings').value = bDratings.winPct ?? '';
        document.getElementById('fighter-b-fightmatrix').value = bFightMatrix.cirrs ?? '';
        document.getElementById('fighter-b-slpm').value = bUfcStats.slpm ?? '';
        document.getElementById('fighter-b-td-avg').value = bUfcStats.tdAvg ?? '';
        document.getElementById('fighter-b-sub-avg').value = bUfcStats.subAvg ?? '';
        document.getElementById('fighter-b-ctrl-time').value = bUfcStats.ctrlTime ?? '';
        document.getElementById('fighter-b-ko-win-pct').value = bUfcStats.koWinPct ?? '';
        document.getElementById('fighter-b-sub-win-pct').value = bUfcStats.subWinPct ?? '';
        document.getElementById('fighter-b-finish-loss-pct').value = bUfcStats.finishLossPct ?? '';
    },

    /**
     * Get fight data from form
     * Returns nested structure matching storage.js format
     */
    getFightFormData() {
        const parseNumber = (val) => {
            const num = parseFloat(val);
            return isNaN(num) ? null : num;
        };

        return {
            weightClass: document.getElementById('weight-class').value,
            numRounds: parseInt(document.getElementById('num-rounds').value) || 3,
            isMainEvent: document.getElementById('is-main-event').checked,
            fighterA: {
                name: document.getElementById('fighter-a-name').value.trim(),
                record: document.getElementById('fighter-a-record').value.trim(),
                tapology: {
                    consensus: parseNumber(document.getElementById('fighter-a-tapology-pct').value),
                    koTko: parseNumber(document.getElementById('fighter-a-tapology-ko').value),
                    sub: parseNumber(document.getElementById('fighter-a-tapology-sub').value),
                    dec: parseNumber(document.getElementById('fighter-a-tapology-dec').value)
                },
                dratings: {
                    winPct: parseNumber(document.getElementById('fighter-a-dratings').value)
                },
                fightMatrix: {
                    cirrs: parseNumber(document.getElementById('fighter-a-fightmatrix').value)
                },
                ufcStats: {
                    slpm: parseNumber(document.getElementById('fighter-a-slpm').value),
                    tdAvg: parseNumber(document.getElementById('fighter-a-td-avg').value),
                    subAvg: parseNumber(document.getElementById('fighter-a-sub-avg').value),
                    ctrlTime: parseNumber(document.getElementById('fighter-a-ctrl-time').value),
                    koWinPct: parseNumber(document.getElementById('fighter-a-ko-win-pct').value),
                    subWinPct: parseNumber(document.getElementById('fighter-a-sub-win-pct').value),
                    finishLossPct: parseNumber(document.getElementById('fighter-a-finish-loss-pct').value)
                }
            },
            fighterB: {
                name: document.getElementById('fighter-b-name').value.trim(),
                record: document.getElementById('fighter-b-record').value.trim(),
                tapology: {
                    consensus: parseNumber(document.getElementById('fighter-b-tapology-pct').value),
                    koTko: parseNumber(document.getElementById('fighter-b-tapology-ko').value),
                    sub: parseNumber(document.getElementById('fighter-b-tapology-sub').value),
                    dec: parseNumber(document.getElementById('fighter-b-tapology-dec').value)
                },
                dratings: {
                    winPct: parseNumber(document.getElementById('fighter-b-dratings').value)
                },
                fightMatrix: {
                    cirrs: parseNumber(document.getElementById('fighter-b-fightmatrix').value)
                },
                ufcStats: {
                    slpm: parseNumber(document.getElementById('fighter-b-slpm').value),
                    tdAvg: parseNumber(document.getElementById('fighter-b-td-avg').value),
                    subAvg: parseNumber(document.getElementById('fighter-b-sub-avg').value),
                    ctrlTime: parseNumber(document.getElementById('fighter-b-ctrl-time').value),
                    koWinPct: parseNumber(document.getElementById('fighter-b-ko-win-pct').value),
                    subWinPct: parseNumber(document.getElementById('fighter-b-sub-win-pct').value),
                    finishLossPct: parseNumber(document.getElementById('fighter-b-finish-loss-pct').value)
                }
            }
        };
    },

    /**
     * Reset fight form
     */
    resetFightForm() {
        document.getElementById('fight-form').reset();
        document.getElementById('fight-id').value = '';
        document.getElementById('fight-modal-title').textContent = 'Add Fight';
        document.getElementById('delete-fight-btn').style.display = 'none';
    },

    // ==================== CONFIDENCE RANKING COMPONENTS ====================

    /**
     * Create a confidence ranking card element
     */
    createConfidenceRankCard(ranking, totalFights, isExpanded = false) {
        const card = document.createElement('div');
        const tierClass = this.getRankTierClass(ranking.rank, totalFights);
        card.className = `confidence-rank-card ${tierClass}${isExpanded ? ' expanded' : ''}${ranking.isVolatile ? ' volatile' : ''}`;
        card.dataset.rank = ranking.rank;
        card.dataset.fightId = ranking.fightId;

        const volatileBadge = ranking.isVolatile
            ? '<span class="volatility-badge-small">VOLATILE</span>'
            : '';

        const tiedBadge = ranking.isTied
            ? '<span class="tied-badge">TIED</span>'
            : '';

        card.innerHTML = `
            <div class="confidence-rank-header">
                <div class="rank-number">
                    <span class="rank-label">Rank</span>
                    <span class="rank-value">${ranking.rank}</span>
                </div>
                <div class="rank-matchup">
                    <div class="matchup-names">
                        ${this.escapeHtml(ranking.fighterA)} vs ${this.escapeHtml(ranking.fighterB)}
                        <span class="weight-class">${ranking.weightClass}</span>
                        ${ranking.isMainEvent ? '<span class="main-event-badge">Main</span>' : ''}
                    </div>
                    <div class="rank-pick">
                        Pick: <strong>${this.escapeHtml(ranking.pick)}</strong>
                        ${volatileBadge}
                        ${tiedBadge}
                    </div>
                </div>
                <div class="rank-score">
                    <span class="score-value">${ranking.confidenceScore}</span>
                    <span class="score-label">Score</span>
                </div>
                <span class="expand-icon">&#9660;</span>
            </div>
            <div class="confidence-rank-body">
                <div class="rank-reasoning">
                    <h4>Reasoning</h4>
                    <p>${ranking.reasoning.join(', ')}</p>
                </div>
                <div class="rank-breakdown">
                    <h4>Score Breakdown</h4>
                    <div class="breakdown-items">
                        <div class="breakdown-item">
                            <span>DRatings Base</span>
                            <span>+${ranking.scoreBreakdown.dratings}</span>
                        </div>
                        <div class="breakdown-item">
                            <span>Tapology Bonus</span>
                            <span>+${ranking.scoreBreakdown.tapology}</span>
                        </div>
                        <div class="breakdown-item">
                            <span>Fight Matrix</span>
                            <span>+${ranking.scoreBreakdown.fightMatrix}</span>
                        </div>
                        <div class="breakdown-item">
                            <span>Confidence Tier</span>
                            <span>+${ranking.scoreBreakdown.confidenceTier}</span>
                        </div>
                        ${ranking.scoreBreakdown.volatility !== 0 ? `
                        <div class="breakdown-item penalty">
                            <span>Volatility Penalty</span>
                            <span>${ranking.scoreBreakdown.volatility}</span>
                        </div>` : ''}
                        ${ranking.scoreBreakdown.closeOdds !== 0 ? `
                        <div class="breakdown-item penalty">
                            <span>Close Odds Penalty</span>
                            <span>${ranking.scoreBreakdown.closeOdds}</span>
                        </div>` : ''}
                    </div>
                </div>
            </div>
        `;

        return card;
    },

    /**
     * Get rank tier class based on position
     */
    getRankTierClass(rank, totalFights) {
        const percentile = rank / totalFights;

        if (percentile > 0.67) {
            return 'rank-tier-high';
        } else if (percentile > 0.33) {
            return 'rank-tier-medium';
        } else {
            return 'rank-tier-low';
        }
    },

    /**
     * Create the confidence ranking view header
     */
    createConfidenceRankingHeader(eventName, totalFights, generatedAt) {
        return `
            <div class="confidence-ranking-header">
                <h3>CONFIDENCE RANKINGS</h3>
                <p class="ranking-event-name">${this.escapeHtml(eventName)}</p>
                <p class="ranking-subtitle">(Most Confident &#8594; Least Confident)</p>
                <div class="ranking-meta">
                    <span>${totalFights} fights ranked</span>
                    <span>Generated: ${new Date(generatedAt).toLocaleString()}</span>
                </div>
            </div>
        `;
    },

    /**
     * Create the simple copy format for clipboard
     */
    formatRankingsForCopy(rankings) {
        return rankings
            .map(r => `${r.rank.toString().padStart(2, ' ')}. ${r.pick}`)
            .join('\n');
    },

    // ==================== STRATEGY & ANALYSIS VIEW ====================

    /**
     * Create betting strategy display
     */
    createStrategyDisplay(strategy) {
        const container = document.createElement('div');
        container.className = 'strategy-container-inner';
        let hasContent = false;

        // 1. Unit Sizing Cards
        if (strategy.unitSizing && strategy.unitSizing.length > 0) {
            const group = document.createElement('div');
            group.className = 'strategy-group';
            group.innerHTML = '<h4>Unit Sizing Adjustments</h4>';
            strategy.unitSizing.forEach(item => {
                group.appendChild(this.createStrategyCard(item, 'unit'));
            });
            container.appendChild(group);
            hasContent = true;
        }

        // 2. Fade/Follow Cards
        if (strategy.fadeFollow && strategy.fadeFollow.length > 0) {
            const group = document.createElement('div');
            group.className = 'strategy-group';
            group.innerHTML = '<h4>Fade / Follow Targets</h4>';
            strategy.fadeFollow.forEach(item => {
                group.appendChild(this.createStrategyCard(item, 'fade'));
            });
            container.appendChild(group);
            hasContent = true;
        }

        // 3. Props Cards
        if (strategy.props && strategy.props.length > 0) {
            const group = document.createElement('div');
            group.className = 'strategy-group';
            group.innerHTML = '<h4>Props & Anchors</h4>';
            strategy.props.forEach(item => {
                group.appendChild(this.createStrategyCard(item, 'prop'));
            });
            container.appendChild(group);
            hasContent = true;
        }

        if (!hasContent) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'No specific strategy recommendations available yet. Continue tracking results to build history.';
            container.appendChild(empty);
        }

        return container;
    },

    /**
     * Create individual strategy card
     */
    createStrategyCard(item, type) {
        const card = document.createElement('div');

        let cardClass = 'strategy-card';
        let tierName = '';

        // Determine class based on content/action
        if (type === 'unit') {
            tierName = item.tier;
            if (item.action.includes('Increase')) cardClass += ' high-confidence';
            else if (item.action.includes('Reduce')) cardClass += ' caution';
        } else if (type === 'fade') {
            tierName = item.target;
            if (item.action.includes('Fade')) cardClass += ' fade';
            else if (item.action.includes('Follow')) cardClass += ' high-confidence';
        } else if (type === 'prop') {
            tierName = item.type;
            cardClass += ' prop';
        }

        card.className = cardClass;

        const tierSpan = document.createElement('span');
        tierSpan.className = 'strategy-tier';
        tierSpan.textContent = tierName;

        const actionSpan = document.createElement('span');
        actionSpan.className = 'strategy-action-badge';
        actionSpan.textContent = item.action;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'strategy-header';
        headerDiv.appendChild(tierSpan);
        headerDiv.appendChild(actionSpan);

        const msgP = document.createElement('p');
        msgP.className = 'strategy-message';
        msgP.textContent = item.message;

        card.appendChild(headerDiv);
        card.appendChild(msgP);

        return card;
    },

    /**
     * Create trend analysis display
     */
    createTrendDisplay(trendAnalysis) {
        if (!trendAnalysis.hasTrends) {
            return `<p class="empty-state">${trendAnalysis.message}</p>`;
        }

        const container = document.createElement('div');
        container.className = 'trend-container';

        // 1. Summary Cards
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'trend-summary-cards';

        const createSummaryCard = (label, value, subtext, isPositive) => {
            return `
                <div class="trend-summary-card">
                    <span class="trend-label">${label}</span>
                    <span class="trend-value ${isPositive ? 'positive' : 'negative'}">${value}</span>
                    <span class="trend-subtext">${subtext}</span>
                </div>
            `;
        };

        const change = trendAnalysis.summary.change;
        const isPositive = change >= 0;
        const directionIcon = isPositive ? '&#8593;' : '&#8595;';

        summaryDiv.innerHTML = `
            ${createSummaryCard('Recent Trend', `${directionIcon} ${Math.abs(change).toFixed(1)}%`, 'vs previous events', isPositive)}
            ${createSummaryCard('Current Form', `${trendAnalysis.summary.latestWinnerPct.toFixed(1)}%`, 'Last Event Accuracy', trendAnalysis.summary.latestWinnerPct >= 50)}
            ${createSummaryCard('Overall Avg', `${trendAnalysis.summary.averageWinnerPct.toFixed(1)}%`, 'All Time', true)}
        `;

        container.appendChild(summaryDiv);

        // 2. Trend Table
        const table = document.createElement('table');
        table.className = 'trend-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Event</th>
                    <th>Winner %</th>
                    <th>Method %</th>
                    <th>Diff</th>
                </tr>
            </thead>
            <tbody>
                ${trendAnalysis.dataPoints.slice().reverse().map((point, index, arr) => {
            // Calculate diff from previous (which is next in reversed array)
            const prev = arr[index + 1];
            const diff = prev ? point.winnerPct - prev.winnerPct : 0;
            const diffClass = diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'neutral';
            const diffIcon = diff > 0 ? '&#8593;' : diff < 0 ? '&#8595;' : '-';

            return `
                        <tr>
                            <td>${this.escapeHtml(point.eventName)}</td>
                            <td><strong>${point.winnerPct.toFixed(1)}%</strong></td>
                            <td>${point.methodPct.toFixed(1)}%</td>
                            <td class="${diffClass}">${prev ? `${diffIcon} ${Math.abs(diff).toFixed(1)}%` : '-'}</td>
                        </tr>
                    `;
        }).join('')}
            </tbody>
        `;

        container.appendChild(table);

        // 3. Insight Message
        const messageDiv = document.createElement('div');
        messageDiv.className = 'trend-insight';
        messageDiv.innerHTML = `<p><strong>Analysis:</strong> ${this.escapeHtml(trendAnalysis.message)}</p>`;
        container.appendChild(messageDiv);

        return container;
    }
};
