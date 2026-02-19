/**
 * UFC Weekly Predictor - Main Application
 * Handles view routing, state management, and workflow orchestration
 */

class App {
    constructor() {
        this.activeEventId = null;
        this.activeEvent = null;
        this.currentView = 'events';
        this.fetchedFightCard = []; // Holds fetched fights during discovery phase
        this.currentConfidenceRanking = null; // Holds current confidence ranking data
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            console.log('[App] Initializing UFC Weekly Predictor...');
            UIComponents.showLoading('Initializing database...');

            // Initialize storage
            await storage.init();

            // Log startup database state
            const events = await storage.getAllEvents();
            console.log('[App] Startup: Found', events.length, 'events in IndexedDB');
            if (events.length > 0) {
                console.log('[App] Events:', events.map(e => `${e.name} (${e.status})`).join(', '));
            }

            // Get database stats for startup log
            const stats = await storage.getDbStats();
            console.log('[App] Database stats:', stats);

            // Set up event listeners
            this.setupEventListeners();

            // Load initial data
            await this.loadEventsView();

            // Auto-restore from server if DB is empty (Migration)
            const storedEvents = await storage.getAllEvents();
            if (storedEvents.length === 0) {
                console.log('[App] Database empty. Attempting to restore from server backup (Migration)...');
                UIComponents.showLoading('Restoring data from server backup...');
                try {
                    // Fetch list of backups
                    const listResp = await fetch('/list');
                    if (listResp.ok) {
                        const fileList = await listResp.json();
                        if (fileList.files && fileList.files.length > 0) {
                            const latestFile = fileList.files[0];
                            console.log(`[App] Found backup: ${latestFile}`);

                            // Fetch content
                            const loadResp = await fetch(`/load/${latestFile}`);
                            if (loadResp.ok) {
                                const data = await loadResp.json();
                                await storage.importJSON(data);
                                console.log('[App] Restore complete!');
                                UIComponents.showToast(`Restored data from ${latestFile}`, 'success');

                                // Reload view
                                await this.loadEventsView();
                            }
                        } else {
                            console.log('[App] No backups found on server.');
                        }
                    }
                } catch (err) {
                    console.error('[App] Auto-restore failed:', err);
                    UIComponents.showToast('Failed to restore backup from server', 'warning');
                }
                UIComponents.hideLoading();
            }

            // Initialize Chrome AI (non-blocking)
            this.initChromeAI();

            console.log('[App] Initialization complete');
            UIComponents.hideLoading();
        } catch (error) {
            console.error('[App] Failed to initialize app:', error);
            UIComponents.hideLoading();
            UIComponents.showToast('Failed to initialize application', 'error');
        }
    }

    /**
     * Set up all event listeners
     */
    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.navigateTo(e.target.dataset.view));
        });



        // Event management
        document.getElementById('create-event-btn').addEventListener('click', () => this.showCreateEventModal());
        document.getElementById('cancel-event-btn').addEventListener('click', () => this.hideCreateEventModal());
        document.getElementById('create-event-form').addEventListener('submit', (e) => this.handleCreateEvent(e));

        // Fight management
        document.getElementById('add-fight-btn').addEventListener('click', () => this.showFightModal());
        document.getElementById('cancel-fight-btn').addEventListener('click', () => this.hideFightModal());
        document.getElementById('delete-fight-btn').addEventListener('click', () => this.handleDeleteFight());
        document.getElementById('fight-form').addEventListener('submit', (e) => this.handleSaveFight(e));
        document.getElementById('mark-complete-btn').addEventListener('click', () => this.handleMarkDataComplete());
        document.getElementById('auto-fetch-data-btn').addEventListener('click', () => this.handleAutoFetchData());

        // Paste Data
        document.getElementById('paste-data-btn').addEventListener('click', () => this.showPasteDataModal());
        document.getElementById('cancel-paste-btn').addEventListener('click', () => this.hidePasteDataModal());
        document.getElementById('preview-paste-btn').addEventListener('click', () => this.handlePreviewPaste());
        document.getElementById('apply-paste-btn').addEventListener('click', () => this.handleApplyPaste());
        document.querySelectorAll('.paste-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.handlePasteTabChange(e));
        });

        // Data tab expand/collapse
        document.getElementById('expand-all-fights-btn').addEventListener('click', () => this.expandAllFights());
        document.getElementById('collapse-all-fights-btn').addEventListener('click', () => this.collapseAllFights());

        // Predictions
        document.getElementById('generate-predictions-btn').addEventListener('click', () => this.handleGeneratePredictions());
        document.getElementById('expand-all-predictions-btn').addEventListener('click', () => this.expandAllPredictions());
        document.getElementById('collapse-all-predictions-btn').addEventListener('click', () => this.collapseAllPredictions());
        document.getElementById('ai-analysis-btn').addEventListener('click', () => this.handleGenerateAIAnalysis());

        // Confidence Ranking
        document.getElementById('confidence-rank-btn').addEventListener('click', () => this.handleShowConfidenceRanking());
        document.getElementById('close-ranking-btn').addEventListener('click', () => this.hideConfidenceRankingModal());
        document.getElementById('copy-ranking-btn').addEventListener('click', () => this.handleCopyRanking());
        document.getElementById('regenerate-ranking-btn').addEventListener('click', () => this.handleRegenerateRanking());
        document.getElementById('confidence-ranking-list').addEventListener('click', (e) => this.handleRankingCardClick(e));

        // Results
        document.getElementById('save-all-results-btn').addEventListener('click', () => this.handleSaveResults());
        document.getElementById('paste-results-btn').addEventListener('click', () => this.toggleResultsPasteArea());
        document.getElementById('apply-results-paste-btn').addEventListener('click', () => this.applyResultsPaste());

        // Analysis
        document.getElementById('run-analysis-btn').addEventListener('click', () => this.handleRunAnalysis());

        // Fight Card Discovery
        document.getElementById('refetch-card-btn').addEventListener('click', () => this.handleRefetchFightCard());
        document.getElementById('add-fight-manual-btn').addEventListener('click', () => this.showManualFightModal());
        document.getElementById('cancel-manual-fight-btn').addEventListener('click', () => this.hideManualFightModal());
        document.getElementById('manual-fight-form').addEventListener('submit', (e) => this.handleAddManualFight(e));
        document.getElementById('approve-card-btn').addEventListener('click', () => this.handleApproveAndContinue());
        document.getElementById('fight-card-list').addEventListener('click', (e) => this.handleFightCardClick(e));

        // Settings
        document.getElementById('settings-btn').addEventListener('click', () => this.showSettingsModal());
        document.getElementById('cancel-settings-btn').addEventListener('click', () => this.hideSettingsModal());
        document.getElementById('settings-form').addEventListener('submit', (e) => this.handleSaveSettings(e));
        document.getElementById('show-api-key').addEventListener('change', (e) => this.toggleApiKeyVisibility(e));
        document.getElementById('pick-save-folder-btn').addEventListener('click', () => this.handlePickSaveFolder());



        // Initialize extension load button (if present)
        const loadExtBtn = document.getElementById('load-extension-btn');
        if (loadExtBtn) {
            loadExtBtn.addEventListener('click', () => this.handleLoadExtensionData());
        }

        // Debug button
        document.getElementById('debug-db-btn').addEventListener('click', () => this.handleDebugDump());

        // Event list clicks
        document.getElementById('events-list').addEventListener('click', (e) => this.handleEventClick(e));

        // Delete event button
        document.getElementById('delete-event-btn').addEventListener('click', () => this.handleDeleteEvent());

        // Fight list clicks
        document.getElementById('fights-list').addEventListener('click', (e) => this.handleFightClick(e));

        // Prediction list clicks
        document.getElementById('predictions-list').addEventListener('click', (e) => this.handlePredictionClick(e));

        // Close modals on backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        });
    }

    // ==================== NAVIGATION ====================

    /**
     * Navigate to a view
     */
    navigateTo(viewName) {
        // Check if we have an active event for data-dependent views
        const eventRequiredViews = ['fight-card', 'data-collection', 'predictions', 'results'];
        if (eventRequiredViews.includes(viewName) && !this.activeEventId) {
            UIComponents.showToast('Please select an event first', 'warning');
            return;
        }

        // Hide all views
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));

        // Show target view
        const targetView = document.getElementById(`${viewName}-view`);
        if (targetView) {
            targetView.classList.add('active');
            this.currentView = viewName;

            // Update nav buttons
            document.querySelectorAll('.nav-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.view === viewName);
            });

            // Load view-specific data
            this.loadViewData(viewName);
        }
    }

    /**
     * Load data for specific view
     */
    async loadViewData(viewName) {
        switch (viewName) {
            case 'events':
                await this.loadEventsView();
                break;
            case 'fight-card':
                await this.loadFightCardView();
                break;
            case 'data-collection':
                await this.loadDataCollectionView();
                break;
            case 'predictions':
                await this.loadPredictionsView();
                break;
            case 'results':
                await this.loadResultsView();
                break;
            case 'accuracy':
                await this.loadAccuracyView();
                break;
            case 'analysis':
                await this.loadAnalysisView();
                break;
        }
    }

    // ==================== EVENTS VIEW ====================

    /**
     * Load events view
     */
    async loadEventsView() {
        const eventsList = document.getElementById('events-list');
        const events = await storage.getAllEvents();

        if (events.length === 0) {
            eventsList.innerHTML = '<p class="empty-state">No events yet. Create your first event to get started.</p>';
            return;
        }

        eventsList.innerHTML = '';

        // Fetch additional data for each event (fight count, accuracy)
        for (const event of events) {
            const fights = await storage.getFightsByEvent(event.id);
            const accuracy = await storage.getAccuracyByEvent(event.id);

            const eventData = {
                ...event,
                fightCount: fights.length,
                accuracy: accuracy ? {
                    winnerPct: accuracy.totalFights > 0 ? ((accuracy.winnerCorrect / accuracy.totalFights) * 100).toFixed(0) : null,
                    total: accuracy.totalFights
                } : null
            };

            const card = UIComponents.createEventCard(eventData, event.id === this.activeEventId);
            eventsList.appendChild(card);
        }
    }

    /**
     * Handle event card click
     */
    async handleEventClick(e) {
        const card = e.target.closest('.event-card');
        if (!card) return;

        const eventId = card.dataset.eventId;
        await this.selectEvent(eventId);
    }

    /**
     * Select an event
     */
    async selectEvent(eventId) {
        this.activeEventId = eventId;
        this.activeEvent = await storage.getEvent(eventId);

        // Update banner
        const banner = document.getElementById('active-event-banner');
        banner.querySelector('.event-name').textContent = this.activeEvent.name;
        banner.querySelector('.event-date').textContent = UIComponents.formatDate(this.activeEvent.date);
        banner.querySelector('.event-state').textContent = UIComponents.getStatusText(this.activeEvent.status);
        banner.classList.remove('hidden');

        // Refresh events list to show selection
        await this.loadEventsView();

        // Navigate to appropriate view based on status
        if (this.activeEvent.status === 'results-entered') {
            this.navigateTo('accuracy');
        } else if (this.activeEvent.status === 'predictions-ready') {
            this.navigateTo('results');
        } else if (this.activeEvent.status === 'data-complete') {
            this.navigateTo('predictions');
        } else if (this.activeEvent.status === 'fight-card-approved') {
            this.navigateTo('data-collection');
        } else {
            // New event or fight-card-fetching - go to fight card discovery
            this.navigateTo('fight-card');
        }

        UIComponents.showToast(`Selected: ${this.activeEvent.name}`, 'success');
    }

    /**
     * Handle delete event button click
     */
    async handleDeleteEvent() {
        if (!this.activeEventId || !this.activeEvent) {
            UIComponents.showToast('No event selected', 'error');
            return;
        }

        const confirmDelete = confirm(`Are you sure you want to delete "${this.activeEvent.name}"?\n\nThis will permanently delete:\n- All fights\n- All predictions\n- All results\n\nThis cannot be undone.`);

        if (!confirmDelete) {
            return;
        }

        try {
            UIComponents.showLoading('Deleting event...');

            await storage.deleteEvent(this.activeEventId);

            // Clear active event
            this.activeEventId = null;
            this.activeEvent = null;

            // Hide banner
            document.getElementById('active-event-banner').classList.add('hidden');

            // Refresh events list
            await this.loadEventsView();

            // Navigate back to events view
            this.navigateTo('events');

            UIComponents.hideLoading();
            UIComponents.showToast('Event deleted successfully', 'success');
        } catch (error) {
            console.error('Failed to delete event:', error);
            UIComponents.hideLoading();
            UIComponents.showToast('Failed to delete event', 'error');
        }
    }

    /**
     * Show create event modal
     */
    showCreateEventModal() {
        document.getElementById('create-event-form').reset();
        document.getElementById('create-event-modal').classList.remove('hidden');
    }

    /**
     * Hide create event modal
     */
    hideCreateEventModal() {
        document.getElementById('create-event-modal').classList.add('hidden');
    }

    /**
     * Handle create event form submission
     */
    async handleCreateEvent(e) {
        e.preventDefault();

        const name = document.getElementById('event-name').value.trim();
        const date = document.getElementById('event-date').value;
        const type = document.getElementById('event-type').value;

        if (!name || !date) {
            UIComponents.showToast('Please fill in all required fields', 'error');
            return;
        }

        try {
            UIComponents.showLoading('Creating event...');

            const event = await storage.createEvent({ name, date, type });

            this.hideCreateEventModal();
            UIComponents.hideLoading();

            // Select event and navigate to fight card discovery
            this.activeEventId = event.id;
            this.activeEvent = event;

            // Update banner
            const banner = document.getElementById('active-event-banner');
            banner.querySelector('.event-name').textContent = event.name;
            banner.querySelector('.event-date').textContent = UIComponents.formatDate(event.date);
            banner.querySelector('.event-state').textContent = 'Fight Card Discovery';
            banner.classList.remove('hidden');

            await this.loadEventsView();

            UIComponents.showToast('Event created! Fetching fight card...', 'success');

            // Navigate to fight card view and auto-fetch
            this.navigateTo('fight-card');
            await this.autoFetchFightCard();
        } catch (error) {
            console.error('Failed to create event:', error);
            UIComponents.hideLoading();
            UIComponents.showToast('Failed to create event', 'error');
        }
    }

    // ==================== FIGHT CARD DISCOVERY VIEW ====================

    /**
     * Load fight card discovery view
     */
    async loadFightCardView() {
        if (!this.activeEventId) return;

        // Check for cached fight card
        const cached = fightCardFetcher.getCachedFightCard(this.activeEventId);

        if (cached && cached.fights.length > 0) {
            this.fetchedFightCard = cached.fights;
            this.renderFightCardList();
            this.updateFightCardStatus(cached.source, cached.cachedAt);
        } else {
            // Show empty state - user can manually add or fetch
            this.fetchedFightCard = [];
            this.renderFightCardList();
        }

        // Check if there are already approved fights in the database
        const existingFights = await storage.getFightsByEvent(this.activeEventId);
        if (existingFights.length > 0 && this.activeEvent.status === 'fight-card-approved') {
            // Already has approved fights, show them
            this.fetchedFightCard = existingFights.map(f => ({
                fighterA: { name: f.fighterA.name },
                fighterB: { name: f.fighterB.name },
                weightClass: f.weightClass,
                isMainCard: f.isMainEvent,
                approved: true,
                savedId: f.id
            }));
            this.renderFightCardList();
        }
    }

    /**
     * Auto-fetch fight card from sources
     */
    async autoFetchFightCard() {
        if (!this.activeEvent) return;

        // Show progress UI
        this.showFetchProgress();

        try {
            const result = await fightCardFetcher.fetchFightCard(
                this.activeEvent.name,
                this.activeEvent.date
            );

            this.hideFetchProgress();

            if (result.success) {
                this.fetchedFightCard = result.fights;

                // Cache the results
                await fightCardFetcher.cacheFightCard(this.activeEventId, result.fights, result.source);

                this.updateFightCardStatus(result.source, result.fetchedAt);
                this.renderFightCardList();

                UIComponents.showToast(`Found ${result.fights.length} fights from ${result.source}`, 'success');
            } else {
                this.showFetchError(result.error);
                UIComponents.showToast('Could not auto-fetch fight card. Add fights manually.', 'warning');
            }
        } catch (error) {
            console.error('Auto-fetch failed:', error);
            this.hideFetchProgress();
            this.showFetchError('An error occurred while fetching the fight card.');
        }
    }

    /**
     * Show fetch progress UI
     */
    showFetchProgress() {
        document.getElementById('fetch-progress').classList.remove('hidden');
        document.getElementById('fetch-error').classList.add('hidden');
        document.getElementById('fight-card-list').innerHTML = '';
    }

    /**
     * Hide fetch progress UI
     */
    hideFetchProgress() {
        document.getElementById('fetch-progress').classList.add('hidden');
    }

    /**
     * Show fetch error UI
     */
    showFetchError(message) {
        document.getElementById('fetch-error').classList.remove('hidden');
        document.getElementById('fetch-error-message').textContent = message;
    }

    /**
     * Update fight card status display
     */
    updateFightCardStatus(source, fetchedAt) {
        document.getElementById('fetch-source-name').textContent = source || '--';
        document.getElementById('fetch-time').textContent = fetchedAt
            ? new Date(fetchedAt).toLocaleString()
            : '--';

        this.updateFightCounts();
    }

    /**
     * Update fight counts in status bar
     */
    updateFightCounts() {
        const approved = this.fetchedFightCard.filter(f => f.approved !== false).length;
        const removed = this.fetchedFightCard.filter(f => f.approved === false).length;
        const total = this.fetchedFightCard.length;

        document.getElementById('approved-fight-count').textContent = approved;
        document.getElementById('removed-fight-count').textContent = removed;
        document.getElementById('total-fetched-count').textContent = total;

        // Enable/disable approve button
        document.getElementById('approve-card-btn').disabled = approved === 0;
    }

    /**
     * Render the fight card review list
     */
    renderFightCardList() {
        const container = document.getElementById('fight-card-list');
        document.getElementById('fetch-error').classList.add('hidden');

        if (this.fetchedFightCard.length === 0) {
            container.innerHTML = '<p class="empty-state">No fights fetched yet. Try "Re-fetch Card" or add fights manually.</p>';
            this.updateFightCounts();
            return;
        }

        // Separate main card and prelims
        const mainCard = this.fetchedFightCard.filter(f => f.isMainCard);
        const prelims = this.fetchedFightCard.filter(f => !f.isMainCard);

        let html = '';

        if (mainCard.length > 0) {
            html += '<div class="fight-card-section"><h4>Main Card</h4>';
            html += mainCard.map((fight, idx) => this.createFightCardReviewItem(fight, idx)).join('');
            html += '</div>';
        }

        if (prelims.length > 0) {
            html += '<div class="fight-card-section"><h4>Prelims</h4>';
            html += prelims.map((fight, idx) => this.createFightCardReviewItem(fight, mainCard.length + idx)).join('');
            html += '</div>';
        }

        // If no separation, just list all
        if (mainCard.length === 0 && prelims.length === 0 && this.fetchedFightCard.length > 0) {
            html = this.fetchedFightCard.map((fight, idx) => this.createFightCardReviewItem(fight, idx)).join('');
        }

        container.innerHTML = html;
        this.updateFightCounts();
    }

    /**
     * Create a fight card review item HTML
     */
    createFightCardReviewItem(fight, index) {
        const isApproved = fight.approved !== false;
        const statusClass = isApproved ? 'approved' : 'removed';

        return `
            <div class="fight-card-review-item ${statusClass}" data-index="${index}">
                <div class="fight-info">
                    <div class="fight-matchup">
                        ${UIComponents.escapeHtml(fight.fighterA.name)}
                        <span class="vs">vs</span>
                        ${UIComponents.escapeHtml(fight.fighterB.name)}
                    </div>
                    <div class="fight-meta">
                        <span class="fight-weight-class">${fight.weightClass || 'Unknown'}</span>
                        ${fight.isMainCard ? '<span class="main-card-badge">Main Card</span>' : ''}
                    </div>
                </div>
                <div class="fight-actions">
                    ${isApproved
                ? `<button class="btn btn-sm btn-remove" data-action="remove">✕ Remove</button>`
                : `<button class="btn btn-sm btn-restore" data-action="restore">↩ Restore</button>`
            }
                </div>
            </div>
        `;
    }

    /**
     * Handle clicks on fight card review items
     */
    handleFightCardClick(e) {
        const item = e.target.closest('.fight-card-review-item');
        if (!item) return;

        const index = parseInt(item.dataset.index);
        const action = e.target.dataset.action;

        if (action === 'remove') {
            this.fetchedFightCard[index].approved = false;
            this.renderFightCardList();
        } else if (action === 'restore') {
            this.fetchedFightCard[index].approved = true;
            this.renderFightCardList();
        }
    }

    /**
     * Handle re-fetch fight card button
     */
    async handleRefetchFightCard() {
        // Clear cache
        fightCardFetcher.clearCachedFightCard(this.activeEventId);
        this.fetchedFightCard = [];

        await this.autoFetchFightCard();
    }

    /**
     * Show manual fight add modal
     */
    showManualFightModal() {
        document.getElementById('manual-fight-form').reset();
        document.getElementById('manual-fight-modal').classList.remove('hidden');
    }

    /**
     * Hide manual fight add modal
     */
    hideManualFightModal() {
        document.getElementById('manual-fight-modal').classList.add('hidden');
    }

    /**
     * Handle adding a fight manually
     */
    handleAddManualFight(e) {
        e.preventDefault();

        const fighterA = document.getElementById('manual-fighter-a').value.trim();
        const fighterB = document.getElementById('manual-fighter-b').value.trim();
        const weightClass = document.getElementById('manual-weight-class').value;
        const isMainCard = document.getElementById('manual-is-main-card').checked;

        if (!fighterA || !fighterB || !weightClass) {
            UIComponents.showToast('Please fill in all required fields', 'error');
            return;
        }

        // Add to fetched fight card
        this.fetchedFightCard.push({
            fighterA: { name: fighterA },
            fighterB: { name: fighterB },
            weightClass: weightClass,
            isMainCard: isMainCard,
            approved: true
        });

        this.hideManualFightModal();
        this.renderFightCardList();
        UIComponents.showToast('Fight added', 'success');
    }

    /**
     * Handle approve and continue button
     */
    async handleApproveAndContinue() {
        const approvedFights = this.fetchedFightCard.filter(f => f.approved !== false);

        if (approvedFights.length === 0) {
            UIComponents.showToast('No fights approved. Add or restore at least one fight.', 'warning');
            return;
        }

        try {
            UIComponents.showLoading('Saving approved fights...');

            // Create fight entries in database for each approved fight
            for (const fight of approvedFights) {
                // Skip if already saved (has savedId)
                if (fight.savedId) continue;

                const fightData = {
                    eventId: this.activeEventId,
                    weightClass: fight.weightClass,
                    isMainEvent: fight.isMainEvent || false,
                    numRounds: fight.isMainEvent ? 5 : 3,
                    fighterA: {
                        name: fight.fighterA.name,
                        record: '',
                        tapology: { consensus: null, koTko: null, sub: null, dec: null },
                        dratings: { winPct: null },
                        fightMatrix: { cirrs: null },
                        ufcStats: { slpm: null, tdAvg: null, subAvg: null, ctrlTime: null, koWinPct: null, subWinPct: null, finishLossPct: null }
                    },
                    fighterB: {
                        name: fight.fighterB.name,
                        record: '',
                        tapology: { consensus: null, koTko: null, sub: null, dec: null },
                        dratings: { winPct: null },
                        fightMatrix: { cirrs: null },
                        ufcStats: { slpm: null, tdAvg: null, subAvg: null, ctrlTime: null, koWinPct: null, subWinPct: null, finishLossPct: null }
                    }
                };

                await storage.createFight(fightData);
            }

            // Update event status
            await storage.updateEvent(this.activeEventId, { status: 'fight-card-approved' });
            this.activeEvent = await storage.getEvent(this.activeEventId);

            // Update banner
            document.getElementById('active-event-banner').querySelector('.event-state').textContent = 'Data Entry';

            // Clear cache since fights are now saved
            fightCardFetcher.clearCachedFightCard(this.activeEventId);

            UIComponents.hideLoading();
            UIComponents.showToast(`Approved ${approvedFights.length} fights. Now enter detailed data.`, 'success');

            // Navigate to data collection
            this.navigateTo('data-collection');
        } catch (error) {
            console.error('Failed to save approved fights:', error);
            UIComponents.hideLoading();
            UIComponents.showToast('Failed to save fights', 'error');
        }
    }

    // ==================== SETTINGS ====================

    /**
     * Show settings modal
     */
    async showSettingsModal() {
        const apiKey = fightCardFetcher.loadGeminiApiKey();
        document.getElementById('gemini-api-key').value = apiKey || '';
        document.getElementById('show-api-key').checked = false;
        document.getElementById('gemini-api-key').type = 'password';

        // Update API status
        const statusEl = document.getElementById('api-status-text');
        if (apiKey) {
            statusEl.textContent = 'Configured';
            statusEl.className = 'status-configured';
        } else {
            statusEl.textContent = 'Not configured';
            statusEl.className = 'status-not-configured';
        }

        // Update save folder display
        const folderNameEl = document.getElementById('save-folder-name');
        const dirHandle = await storage.getDirHandle();
        if (dirHandle) {
            folderNameEl.textContent = dirHandle.name;
            folderNameEl.style.color = 'var(--success-color)';
        } else {
            folderNameEl.textContent = 'Not configured';
            folderNameEl.style.color = 'var(--text-secondary)';
        }

        // Chrome AI settings
        const aiStatusEl = document.getElementById('chrome-ai-status-text');
        if (aiStatusEl) {
            if (chromeAI.promptAvailable || chromeAI.summarizerAvailable) {
                aiStatusEl.textContent = `Available (Prompt: ${chromeAI.promptAvailable ? 'Yes' : 'No'}, Summarizer: ${chromeAI.summarizerAvailable ? 'Yes' : 'No'})`;
                aiStatusEl.className = 'status-configured';
            } else {
                aiStatusEl.textContent = 'Not available (requires Chrome 138+)';
                aiStatusEl.className = 'status-not-configured';
            }
        }
        const chromeAIEnabledEl = document.getElementById('chrome-ai-enabled');
        if (chromeAIEnabledEl) chromeAIEnabledEl.checked = chromeAI.enabled;
        const newsEnabledEl = document.getElementById('chrome-ai-news-enabled');
        if (newsEnabledEl) newsEnabledEl.checked = chromeAI.newsSourcesEnabled;
        document.querySelectorAll('.news-source-toggle').forEach(toggle => {
            toggle.checked = chromeAI.isSourceEnabled(toggle.dataset.source);
        });

        document.getElementById('settings-modal').classList.remove('hidden');
    }

    /**
     * Hide settings modal
     */
    hideSettingsModal() {
        document.getElementById('settings-modal').classList.add('hidden');
    }

    /**
     * Handle save settings
     */
    handleSaveSettings(e) {
        e.preventDefault();

        const apiKey = document.getElementById('gemini-api-key').value.trim();

        if (apiKey) {
            fightCardFetcher.setGeminiApiKey(apiKey);
        } else {
            localStorage.removeItem('geminiApiKey');
            fightCardFetcher.geminiApiKey = null;
        }

        // Save Chrome AI settings
        chromeAI.enabled = document.getElementById('chrome-ai-enabled')?.checked !== false;
        chromeAI.newsSourcesEnabled = document.getElementById('chrome-ai-news-enabled')?.checked !== false;
        const enabledSources = {};
        document.querySelectorAll('.news-source-toggle').forEach(toggle => {
            enabledSources[toggle.dataset.source] = toggle.checked;
        });
        chromeAI.enabledSources = enabledSources;
        chromeAI.saveSettings();

        // Update AI button visibility
        const aiBtn = document.getElementById('ai-analysis-btn');
        if (aiBtn) {
            aiBtn.style.display = (chromeAI.enabled && chromeAI.promptAvailable) ? '' : 'none';
        }

        UIComponents.showToast('Settings saved', 'success');
        this.hideSettingsModal();
    }

    /**
     * Toggle API key visibility
     */
    toggleApiKeyVisibility(e) {
        const input = document.getElementById('gemini-api-key');
        input.type = e.target.checked ? 'text' : 'password';
    }

    /**
     * Handle picking a save folder for auto-save
     */
    async handlePickSaveFolder() {
        const dirHandle = await storage.pickSaveFolder();
        if (dirHandle) {
            const folderNameEl = document.getElementById('save-folder-name');
            folderNameEl.textContent = dirHandle.name;
            folderNameEl.style.color = 'var(--success-color)';
            UIComponents.showToast(`Save folder set to: ${dirHandle.name}`, 'success');
        }
    }

    // ==================== DATA COLLECTION VIEW ====================

    /**
     * Load data collection view
     */
    async loadDataCollectionView() {
        if (!this.activeEventId) return;

        const fights = await storage.getFightsByEvent(this.activeEventId);
        const fightsList = document.getElementById('fights-list');

        // Update status counts
        const totalFights = fights.length;
        const completeFights = fights.filter(f => f.dataComplete).length;
        const missingFights = totalFights - completeFights;

        document.getElementById('fight-count').textContent = totalFights;
        document.getElementById('complete-count').textContent = completeFights;
        document.getElementById('missing-count').textContent = missingFights;

        // Enable/disable mark complete button
        const markCompleteBtn = document.getElementById('mark-complete-btn');
        markCompleteBtn.disabled = totalFights === 0 || missingFights > 0;

        // Render fights
        if (fights.length === 0) {
            fightsList.innerHTML = '<p class="empty-state">No fights added. Click "Add Fight" to enter fight data.</p>';
            return;
        }

        fightsList.innerHTML = '';
        fights.forEach(fight => {
            const card = UIComponents.createFightCard(fight);
            fightsList.appendChild(card);
        });
    }

    /**
     * Handle fight card clicks
     */
    handleFightClick(e) {
        const card = e.target.closest('.fight-card');
        if (!card) return;

        // Handle edit button
        if (e.target.classList.contains('edit-fight-btn')) {
            this.editFight(card.dataset.fightId);
            return;
        }

        // Handle delete button
        if (e.target.classList.contains('delete-fight-btn')) {
            this.confirmDeleteFight(card.dataset.fightId);
            return;
        }

        // Handle expand/collapse
        if (e.target.closest('.fight-card-header')) {
            card.classList.toggle('expanded');
        }
    }

    /**
     * Show fight modal for adding new fight
     */
    showFightModal() {
        UIComponents.resetFightForm();
        document.getElementById('fight-modal').classList.remove('hidden');
    }

    /**
     * Hide fight modal
     */
    hideFightModal() {
        document.getElementById('fight-modal').classList.add('hidden');
    }

    // ==================== PASTE DATA FUNCTIONALITY ====================

    /**
     * Show paste data modal
     */
    showPasteDataModal() {
        document.getElementById('paste-data-input').value = '';
        document.getElementById('paste-preview').classList.add('hidden');
        document.getElementById('apply-paste-btn').disabled = true;
        this.parsedPasteData = null;
        document.getElementById('paste-data-modal').classList.remove('hidden');
    }

    /**
     * Hide paste data modal
     */
    hidePasteDataModal() {
        document.getElementById('paste-data-modal').classList.add('hidden');
    }

    /**
     * Handle tab change in paste modal
     */
    handlePasteTabChange(eOrSource) {
        let source;
        let targetElement;

        if (typeof eOrSource === 'string') {
            source = eOrSource;
            targetElement = document.querySelector(`.paste-tab[data-source="${source}"]`);
        } else {
            source = eOrSource.target.dataset.source;
            targetElement = eOrSource.target;
        }

        document.querySelectorAll('.paste-tab').forEach(t => t.classList.remove('active'));
        if (targetElement) targetElement.classList.add('active');
        this.currentPasteSource = source;

        const instructions = {
            tapology: '<strong>Tapology:</strong> Go to the event page on Tapology, copy the community predictions section (including fighter names and percentages).',
            dratings: '<strong>DRatings:</strong> Go to DRatings UFC Predictions page, copy the table with fighter names and win percentages.',
            fightmatrix: '<strong>FightMatrix:</strong> Copy CIRRS ratings from FightMatrix. Supports multiple formats:<br>• "Fighter Name 1850"<br>• "1. Fighter Name (30) 15-2-0 1850"<br>• "Fighter Name - 1850"<br>Will auto-match to fighters on your card.',
            json: '<strong>JSON:</strong> Paste JSON data in format: <code>[{"name": "Fighter Name", "tapology": 65, "dratings": 62.5, "cirrs": 1850}]</code>'
        };

        // For FightMatrix, also show which fighters are missing data
        let missingInfo = '';
        if (source === 'fightmatrix' && this.activeEventId) {
            storage.getFightsByEvent(this.activeEventId).then(fights => {
                const missing = fighterDataFetcher.getMissingFightMatrixFighters(fights);
                if (missing.length > 0) {
                    document.getElementById('paste-instructions').innerHTML = `<p>${instructions[source]}</p><p class="missing-fighters-hint"><strong>Missing CIRRS data (${missing.length}):</strong> ${missing.join(', ')}</p>`;
                }
            });
        }

        document.getElementById('paste-instructions').innerHTML = `<p>${instructions[source]}</p>`;
    }

    /**
     * Preview parsed paste data
     */
    async handlePreviewPaste() {
        const input = document.getElementById('paste-data-input').value.trim();
        console.log('[Paste Debug] Raw input length:', input.length);
        console.log('[Paste Debug] Raw input preview:', input.substring(0, 500));

        if (!input) {
            UIComponents.showToast('Please paste some data first', 'error');
            return;
        }

        const source = this.currentPasteSource || 'tapology';
        console.log('[Paste Debug] Selected source:', source);
        let parsed;

        try {
            if (source === 'json') {
                console.log('[Paste Debug] Parsing as JSON...');
                parsed = this.parseJsonData(input);
            } else if (source === 'fightmatrix') {
                // Use enhanced FightMatrix parser that matches against actual fight card
                console.log('[Paste Debug] Using enhanced FightMatrix parser...');
                parsed = await this.parseFightMatrixPasteData(input);
            } else {
                console.log('[Paste Debug] Parsing as text for source:', source);
                parsed = this.parseTextData(input, source);
            }

            console.log('[Paste Debug] Parsed result:', parsed);
            console.log('[Paste Debug] Parsed count:', parsed ? parsed.length : 0);

            if (!parsed || parsed.length === 0) {
                UIComponents.showToast('Could not parse any fighter data. Check the format.', 'error');
                return;
            }

            this.parsedPasteData = parsed;
            this.renderPastePreview(parsed);
            document.getElementById('paste-preview').classList.remove('hidden');
            document.getElementById('apply-paste-btn').disabled = false;

        } catch (error) {
            console.error('[Paste Debug] Parse error:', error);
            console.error('[Paste Debug] Error stack:', error.stack);
            UIComponents.showToast('Error parsing data: ' + error.message, 'error');
        }
    }

    /**
     * Parse JSON format data
     */
    parseJsonData(input) {
        console.log('[JSON Parse] Starting JSON parse...');
        const data = JSON.parse(input);
        console.log('[JSON Parse] Parsed JSON:', data);
        console.log('[JSON Parse] Is array:', Array.isArray(data));
        console.log('[JSON Parse] Length:', data?.length);

        if (!Array.isArray(data)) {
            throw new Error('Expected an array of fighter data');
        }

        // First pass: parse all items
        const parsed = data.map((item, idx) => {
            console.log(`[JSON Parse] Item ${idx}:`, item);

            // Handle both nested and flat structures, and both casings (fightMatrix vs fightmatrix)
            const tapologyIsObject = typeof item.tapology === 'object' && item.tapology !== null;
            const dratingsIsObject = typeof item.dratings === 'object' && item.dratings !== null;
            const fmObj = item.fightMatrix || item.fightmatrix || null;
            const fmIsObject = typeof fmObj === 'object' && fmObj !== null;

            const result = {
                name: item.name,
                tapology: {
                    consensus: tapologyIsObject ? (item.tapology.consensus ?? null) : (item.tapology ?? item.consensus ?? null),
                    koTko: tapologyIsObject ? (item.tapology.koTko ?? null) : (item.tko ?? null),
                    sub: tapologyIsObject ? (item.tapology.sub ?? null) : (item.sub ?? null),
                    dec: tapologyIsObject ? (item.tapology.dec ?? null) : (item.dec ?? null)
                },
                dratings: { winPct: dratingsIsObject ? (item.dratings.winPct ?? null) : (item.dratings ?? item.winPct ?? null) },
                fightMatrix: { cirrs: fmIsObject ? (fmObj.cirrs ?? item.cirrs ?? null) : (item.cirrs ?? null) }
            };

            // Preserve expanded FightMatrix data (eloK170, eloMod, glicko, whr, betting, age, etc.)
            // prediction-engine.js reads these from fighter.fightmatrix (lowercase)
            if (fmIsObject && (fmObj.eloK170 || fmObj.eloMod || fmObj.glicko || fmObj.whr || fmObj.bettingWinPct || fmObj.age)) {
                result.fightmatrix = {
                    eloK170: fmObj.eloK170 || null,
                    eloMod: fmObj.eloMod || null,
                    glicko: fmObj.glicko || null,
                    whr: fmObj.whr || null,
                    bettingWinPct: fmObj.bettingWinPct ?? null,
                    bettingOdds: fmObj.bettingOdds ?? null,
                    age: fmObj.age ?? null,
                    daysSinceLastFight: fmObj.daysSinceLastFight ?? null,
                    ranking: fmObj.ranking ?? null,
                    record: fmObj.record || null,
                    last3Record: fmObj.last3Record || null
                };
            }

            return result;
        });

        // Second pass: consolidate entries with similar names
        const consolidated = this.consolidateFighterData(parsed);
        console.log('[JSON Parse] Consolidated from', parsed.length, 'to', consolidated.length, 'entries');
        console.log('[JSON Parse] Final result:', consolidated);
        return consolidated;
    }

    /**
     * Consolidate fighter data entries with similar/matching names
     */
    consolidateFighterData(fighters) {
        const consolidated = [];

        for (const fighter of fighters) {
            // Find existing entry that matches this fighter
            const existingIdx = consolidated.findIndex(existing =>
                this.namesMatch(existing.name, fighter.name)
            );

            if (existingIdx >= 0) {
                // Merge into existing entry
                const existing = consolidated[existingIdx];
                console.log(`[Consolidate] Merging "${fighter.name}" into "${existing.name}"`);

                // Prefer the longer/more complete name
                if (fighter.name.length > existing.name.length) {
                    existing.name = fighter.name;
                }

                // Merge tapology data (prefer non-null values)
                if (fighter.tapology.consensus !== null && existing.tapology.consensus === null) {
                    existing.tapology.consensus = fighter.tapology.consensus;
                }
                if (fighter.tapology.koTko !== null && existing.tapology.koTko === null) {
                    existing.tapology.koTko = fighter.tapology.koTko;
                }
                if (fighter.tapology.sub !== null && existing.tapology.sub === null) {
                    existing.tapology.sub = fighter.tapology.sub;
                }
                if (fighter.tapology.dec !== null && existing.tapology.dec === null) {
                    existing.tapology.dec = fighter.tapology.dec;
                }

                // Merge dratings data
                if (fighter.dratings.winPct !== null && existing.dratings.winPct === null) {
                    existing.dratings.winPct = fighter.dratings.winPct;
                }

                // Merge fightMatrix data
                if (fighter.fightMatrix.cirrs !== null && existing.fightMatrix.cirrs === null) {
                    existing.fightMatrix.cirrs = fighter.fightMatrix.cirrs;
                }

                // Merge expanded fightmatrix data
                if (fighter.fightmatrix && !existing.fightmatrix) {
                    existing.fightmatrix = { ...fighter.fightmatrix };
                }
            } else {
                // Add as new entry
                consolidated.push({ ...fighter });
            }
        }

        return consolidated;
    }

    /**
     * Parse text-based data (from copy/paste)
     */
    parseTextData(input, source) {
        const fighters = [];
        const lines = input.split('\n').map(l => l.trim()).filter(l => l);

        // Pattern to match "Fighter Name" followed by percentage
        // Handles formats like:
        // "Jon Jones 78%"
        // "Jon Jones    78%"
        // "Jon Jones (78%)"
        // "78% Jon Jones"
        const percentPattern = /^(.+?)\s+(\d{1,3}(?:\.\d+)?)\s*%|(\d{1,3}(?:\.\d+)?)\s*%\s+(.+?)$/;
        const nameOnlyPattern = /^([A-Za-z\s\-'\.]+)$/;

        // STRATEGY 2: Multi-line analysis for "Tapology Community Predictions"
        // Pattern: Name1 PERCENT% ... Name2 PERCENT%
        // Example: "Bautista64%\nOliveira36%"
        // Or: "Tapology Community Predictions: 4,289 ...\nBautista64%\nOliveira36%"

        // We'll look for lines that end with '%' and have a name prefix
        const tapologyTest = lines.filter(l => /^[A-Za-z\s\-\.]+\d{1,3}%\s*$/.test(l));

        if (tapologyTest.length > 0) {
            console.log('[Parse Text] Detected Tapology raw format');

            for (const line of lines) {
                // Match "NamePercent%" e.g. "Bautista64%" or "Oliveira36%"
                // Also handles spaces: "Jon Jones 78%"
                const match = line.match(/^([A-Za-z\s\-\.]+?)(\d{1,3})%\s*$/);
                if (match) {
                    let name = match[1].trim();
                    let val = parseFloat(match[2]);

                    if (name && !isNaN(val)) {
                        fighters.push({
                            name: name,
                            tapology: { consensus: val },
                            dratings: { winPct: null },
                            fightMatrix: { cirrs: null },
                            source: 'text_tapology'
                        });
                    }
                }
            }
        } else {
            // STRATEGY 1: Standard Line-by-Line (Original Logic)
            for (const line of lines) {
                // Try to match percentage pattern "Name 78%" or "78% Name"
                const pctMatch = line.match(/([A-Za-z][A-Za-z\s\-'\.]+?)\s+(\d{1,3}(?:\.\d+)?)\s*%/);
                const reversePctMatch = line.match(/(\d{1,3}(?:\.\d+)?)\s*%\s+([A-Za-z][A-Za-z\s\-'\.]+)/);

                let name, value;

                if (pctMatch) {
                    name = pctMatch[1].trim();
                    value = parseFloat(pctMatch[2]);
                } else if (reversePctMatch) {
                    name = reversePctMatch[2].trim();
                    value = parseFloat(reversePctMatch[1]);
                }

                if (name && value && name.length > 2 && name.length < 40) {
                    fighters.push({
                        name: name,
                        tapology: { consensus: value }, // Default to tapology for text paste
                        dratings: { winPct: null },
                        fightMatrix: { cirrs: null },
                        source: 'text_generic'
                    });
                }
            } // End Strategy 1 Loop
        } // End Strategy Check

        return fighters;
    }





    /**
     * Parse FightMatrix paste data using enhanced parser
     * Uses fighterDataFetcher's parser which matches against actual fight card fighters
     */
    async parseFightMatrixPasteData(input) {
        // Get current fights to match against
        const fights = await storage.getFightsByEvent(this.activeEventId);
        if (!fights || fights.length === 0) {
            console.log('[FightMatrix Paste] No fights found for event');
            return [];
        }

        // Use the enhanced parser from fighterDataFetcher
        const result = fighterDataFetcher.parseFightMatrixPaste(input, fights);
        console.log('[FightMatrix Paste] Parser result:', result);

        // Convert the ratings map to the format expected by renderPastePreview
        const fighters = [];
        for (const [fighterName, data] of Object.entries(result.ratings)) {
            fighters.push({
                name: fighterName,
                tapology: { consensus: null, koTko: null, sub: null, dec: null },
                dratings: { winPct: null },
                fightMatrix: { cirrs: data.cirrs }
            });
        }

        // Show match stats
        const missingFighters = fighterDataFetcher.getMissingFightMatrixFighters(fights);
        const matchedCount = result.totalParsed;
        const totalFighters = result.totalFighters;

        if (matchedCount < totalFighters) {
            console.log(`[FightMatrix Paste] Matched ${matchedCount}/${totalFighters} fighters`);
            console.log('[FightMatrix Paste] Still missing:', missingFighters);
        }

        return fighters;
    }

    /**
     * Normalize name for matching - handles hyphens, accents, and variations
     */
    normalizeNameForMatch(name) {
        if (!name) return '';
        // Remove accents (e.g., "Natália" -> "Natalia")
        const withoutAccents = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        // Convert to lowercase
        const lower = withoutAccents.toLowerCase();
        // Expand common abbreviations (St. -> Saint, Jr. -> Junior, etc.)
        const expanded = lower
            .replace(/\bst\.\s*/g, 'saint ')
            .replace(/\bjr\.\s*/g, 'junior ')
            .replace(/\bsr\.\s*/g, 'senior ');
        // Replace hyphens with spaces (Saint-Denis -> Saint Denis)
        const withSpaces = expanded.replace(/[-]/g, ' ');
        // Remove non-alpha except spaces, collapse whitespace
        return withSpaces.replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
    }

    /**
     * Check if two names likely refer to the same fighter
     */
    namesMatch(name1, name2) {
        const norm1 = this.normalizeNameForMatch(name1);
        const norm2 = this.normalizeNameForMatch(name2);

        // Exact match after normalization
        if (norm1 === norm2) return true;

        // One is a substring of the other (handles "Lopes" vs "Diego Lopes")
        if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

        // Last name match with min length check
        const parts1 = norm1.split(' ');
        const parts2 = norm2.split(' ');
        const lastName1 = parts1[parts1.length - 1];
        const lastName2 = parts2[parts2.length - 1];

        // REMOVED: Unconditional last name match. 
        // This caused "Javid Basharat" to match "Farid Basharat".
        // We now rely on findBestFighterMatch's specific "last name only" fallback 
        // which has duplicate-detection safety.
        // if (lastName1.length >= 4 && lastName1 === lastName2) return true;

        // Check if all parts of one name appear within the other (handles "Rangbo Sulang" vs "Sulangrangbo")
        // This catches cases where names are concatenated differently
        const noSpace1 = norm1.replace(/\s/g, '');
        const noSpace2 = norm2.replace(/\s/g, '');

        // If names without spaces are similar length and one contains all parts of the other
        if (Math.abs(noSpace1.length - noSpace2.length) <= 2) {
            // Check if all parts of name1 appear in name2 (without spaces)
            // Use length >= 2 to handle short Asian name parts like "Yi", "Li"
            const allParts1InName2 = parts1.every(part => part.length >= 2 && noSpace2.includes(part));
            const allParts2InName1 = parts2.every(part => part.length >= 2 && noSpace1.includes(part));

            if (allParts1InName2 || allParts2InName1) return true;
        }

        // Handle "Zha Yi" vs "Yizha" - check if concatenated versions match
        if (noSpace1 === noSpace2) return true;

        // Check reversed concatenation: "zhayi" vs "yizha" won't match, but
        // "yizha" contains "yi" and "zha" - already covered above

        // Try reversed name parts: "zha yi" -> "yi zha"
        const reversed1 = parts1.slice().reverse().join(' ');
        const reversed2 = parts2.slice().reverse().join(' ');
        if (reversed1 === norm2 || reversed2 === norm1) return true;

        return false;
    }

    /**
     * Render preview of parsed data
     */
    renderPastePreview(data) {
        const container = document.getElementById('paste-preview-content');
        container.innerHTML = data.map(fighter => {
            // Build method breakdown string if available
            const methodParts = [];
            if (fighter.tapology) {
                if (fighter.tapology.koTko !== null) methodParts.push(`KO:${fighter.tapology.koTko}%`);
                if (fighter.tapology.sub !== null) methodParts.push(`SUB:${fighter.tapology.sub}%`);
                if (fighter.tapology.dec !== null) methodParts.push(`DEC:${fighter.tapology.dec}%`);
            }
            const methodStr = methodParts.length > 0 ? ` (${methodParts.join(' ')})` : '';

            return `
            <div class="paste-preview-item">
                <span class="paste-preview-fighter">${fighter.name}</span>
                <div class="paste-preview-data">
                    ${fighter.tapology && fighter.tapology.consensus !== null ? `<span>Tapology: ${fighter.tapology.consensus}%${methodStr}</span>` : ''}
                    ${fighter.dratings && fighter.dratings.winPct !== null ? `<span>DRatings: ${fighter.dratings.winPct}%</span>` : ''}
                    ${fighter.fightMatrix && fighter.fightMatrix.cirrs !== null ? `<span>CIRRS: ${fighter.fightMatrix.cirrs}</span>` : ''}
                </div>
            </div>
        `}).join('');
    }

    /**
     * Apply parsed paste data to fights
     */
    async handleApplyPaste() {
        if (!this.parsedPasteData || this.parsedPasteData.length === 0) {
            UIComponents.showToast('No data to apply', 'error');
            return;
        }

        try {
            UIComponents.showLoading('Applying data to fights...');

            const fights = await storage.getFightsByEvent(this.activeEventId);
            console.log('[Apply Paste] Active event ID:', this.activeEventId);
            console.log('[Apply Paste] Fights in event:', fights.length);
            console.log('[Apply Paste] Parsed data count:', this.parsedPasteData.length);

            let updatedCount = 0;
            let matchedFighters = 0;

            for (const fight of fights) {
                let updated = false;
                console.log('[Apply Paste] Processing fight:', fight.fighterA?.name, 'vs', fight.fighterB?.name);

                // Try to match fighter A
                const matchA = this.findBestFighterMatch(fight.fighterA?.name, this.parsedPasteData);
                console.log('[Apply Paste] Fighter A match:', fight.fighterA?.name, '->', matchA ? matchA.name : 'NO MATCH');
                if (matchA) {
                    this.mergeFighterData(fight.fighterA, matchA);
                    updated = true;
                    matchedFighters++;
                }

                // Try to match fighter B
                const matchB = this.findBestFighterMatch(fight.fighterB?.name, this.parsedPasteData);
                console.log('[Apply Paste] Fighter B match:', fight.fighterB?.name, '->', matchB ? matchB.name : 'NO MATCH');
                if (matchB) {
                    this.mergeFighterData(fight.fighterB, matchB);
                    updated = true;
                    matchedFighters++;
                }

                if (updated) {
                    await storage.updateFight(fight.id, fight);
                    updatedCount++;
                }
            }

            console.log('[Apply Paste] Total fights updated:', updatedCount);
            console.log('[Apply Paste] Total fighters matched:', matchedFighters);

            this.hidePasteDataModal();
            await this.loadDataCollectionView();

            UIComponents.hideLoading();
            UIComponents.showToast(`Updated ${updatedCount} fights (${matchedFighters} fighters matched)`, 'success');

        } catch (error) {
            console.error('Failed to apply paste data:', error);
            UIComponents.hideLoading();
            UIComponents.showToast('Failed to apply data', 'error');
        }
    }

    /**
     * Load data from Chrome Extension via server
     */
    async handleLoadExtensionData() {
        try {
            UIComponents.showLoading('Checking for extension data...');

            // 1. List files
            const listRes = await fetch('http://localhost:5555/list');
            if (!listRes.ok) throw new Error('Could not connect to server');
            const listData = await listRes.json();

            if (!listData.files || listData.files.length === 0) {
                UIComponents.hideLoading();
                UIComponents.showToast('No saved data found on server', 'warning');
                return;
            }

            // 2. Find latest extension import
            const latestFile = listData.files.find(f => f.startsWith('extension-import-'));

            if (!latestFile) {
                UIComponents.hideLoading();
                UIComponents.showToast('No extension data found. Did you click "Send to App"?', 'warning');
                return;
            }

            // 3. Load file
            UIComponents.showLoading(`Loading ${latestFile}...`);
            const loadRes = await fetch(`http://localhost:5555/load/${latestFile}`);
            if (!loadRes.ok) throw new Error('Failed to load file');
            const data = await loadRes.json();

            // 4. Normalize through parseJSONData and preview
            UIComponents.hideLoading();

            // Put JSON into text area for visibility
            const fighters = Array.isArray(data) ? data : (data.fighters || []);
            document.getElementById('paste-data-input').value = JSON.stringify(fighters, null, 2);

            // Set source to JSON
            this.handlePasteTabChange('json');

            // Parse through the same pipeline as JSON paste
            this.parsedPasteData = this.parseJsonData(JSON.stringify(fighters));
            this.renderPastePreview(this.parsedPasteData);

            UIComponents.showToast('Loaded data from extension!', 'success');

        } catch (error) {
            console.error('Extension load error:', error);
            UIComponents.hideLoading();
            UIComponents.showToast('Failed to load extension data: ' + error.message, 'error');
        }
    }

    /**
     * Find best matching fighter from parsed data
     */
    findBestFighterMatch(fighterName, parsedData) {
        if (!fighterName) return null;

        const normalizedName = this.normalizeNameForMatch(fighterName);
        const nameParts = normalizedName.split(' ');
        const lastName = nameParts[nameParts.length - 1];
        const firstName = nameParts[0];

        console.log('[Match Debug] Looking for:', fighterName, '-> normalized:', normalizedName, 'last:', lastName, 'first:', firstName);

        // Try exact normalized match first
        let match = parsedData.find(p => this.normalizeNameForMatch(p.name) === normalizedName);
        if (match) {
            console.log('[Match Debug] Exact match found:', match.name);
            return match;
        }

        // Try using namesMatch helper (handles partial names, hyphens, etc.)
        match = parsedData.find(p => this.namesMatch(fighterName, p.name));
        if (match) {
            console.log('[Match Debug] namesMatch found:', match.name);
            return match;
        }

        // Try reversed name order (for Asian names like "Song Yadong" vs "Yadong Song")
        const reversedName = nameParts.reverse().join(' ');
        match = parsedData.find(p => this.normalizeNameForMatch(p.name) === reversedName);
        if (match) {
            console.log('[Match Debug] Reversed name match found:', match.name);
            return match;
        }

        // Try last name match (most reliable for UFC) - require min length to avoid false positives
        if (lastName.length >= 4) {
            const matches = parsedData.filter(p => {
                const pNorm = this.normalizeNameForMatch(p.name);
                const pParts = pNorm.split(' ');
                const pLastName = pParts[pParts.length - 1];
                return pLastName === lastName;
            });

            // SAFETY: Only match if there is EXACTLY ONE fighter with this last name
            // This prevents "Javid Basharat" matching "Farid Basharat"
            if (matches.length === 1) {
                console.log('[Match Debug] Last name match found (Unique):', matches[0].name);
                return matches[0];
            } else if (matches.length > 1) {
                console.warn('[Match Debug] Multiple last name matches found, skipping to avoid ambiguity:', matches.map(m => m.name));
            }
        }

        // Try first name match as fallback (handles "Song Yadong" matching "Yadong Song")
        match = parsedData.find(p => {
            const pParts = p.name.split(' ').map(part => part.toLowerCase());
            return pParts.includes(firstName) || pParts.includes(lastName);
        });
        if (match) {
            console.log('[Match Debug] Partial name match found:', match.name);
            return match;
        }

        // Try substring match (handles hyphenated names like "Cortes-Acosta")
        match = parsedData.find(p => {
            const pNormalized = this.normalizeNameForMatch(p.name);
            return pNormalized.includes(lastName) || normalizedName.includes(this.normalizeNameForMatch(p.name.split(' ').pop()));
        });
        if (match) {
            console.log('[Match Debug] Substring match found:', match.name);
            return match;
        }

        console.log('[Match Debug] No match found for:', fighterName);
        return null;
    }

    /**
     * Merge parsed data into fighter object
     */
    mergeFighterData(fighter, parsedData) {
        if (parsedData.tapology.consensus !== null) {
            fighter.tapology = fighter.tapology || {};
            fighter.tapology.consensus = parsedData.tapology.consensus;
        }
        // Merge Tapology method breakdown (KO/SUB/DEC percentages)
        if (parsedData.tapology.koTko !== null) {
            fighter.tapology = fighter.tapology || {};
            fighter.tapology.koTko = parsedData.tapology.koTko;
        }
        if (parsedData.tapology.sub !== null) {
            fighter.tapology = fighter.tapology || {};
            fighter.tapology.sub = parsedData.tapology.sub;
        }
        if (parsedData.tapology.dec !== null) {
            fighter.tapology = fighter.tapology || {};
            fighter.tapology.dec = parsedData.tapology.dec;
        }
        if (parsedData.dratings && parsedData.dratings.winPct !== null) {
            fighter.dratings = fighter.dratings || {};
            fighter.dratings.winPct = parsedData.dratings.winPct;
        }
        if (parsedData.fightMatrix && parsedData.fightMatrix.cirrs !== null) {
            fighter.fightMatrix = fighter.fightMatrix || {};
            fighter.fightMatrix.cirrs = parsedData.fightMatrix.cirrs;
        }
        // Store expanded FightMatrix data (eloK170, eloMod, glicko, whr, betting, age, etc.)
        // prediction-engine.js reads these from fighter.fightmatrix (lowercase)
        if (parsedData.fightmatrix) {
            fighter.fightmatrix = { ...(fighter.fightmatrix || {}), ...parsedData.fightmatrix };
        }
    }

    /**
     * Fetch live odds from The Odds API (via server) and merge into fighter data
     */
    async fetchAndMergeLiveOdds(fights) {
        try {
            const res = await fetch('http://localhost:5555/api/odds');
            if (!res.ok) throw new Error(`Odds API returned ${res.status}`);
            const data = await res.json();

            if (!data.fights || data.fights.length === 0) {
                console.log('[Odds] No odds data available');
                return;
            }

            let matched = 0;
            for (const fight of fights) {
                const nameA = (fight.fighterA?.name || '').toLowerCase();
                const nameB = (fight.fighterB?.name || '').toLowerCase();
                if (!nameA || !nameB) continue;

                // Find matching odds event by last name
                const lastNameA = nameA.split(' ').pop();
                const lastNameB = nameB.split(' ').pop();

                const oddsMatch = data.fights.find(o => {
                    const oA = o.fighterA.toLowerCase();
                    const oB = o.fighterB.toLowerCase();
                    return (oA.includes(lastNameA) || oB.includes(lastNameA)) &&
                        (oA.includes(lastNameB) || oB.includes(lastNameB));
                });

                if (oddsMatch) {
                    // Determine which odds fighter maps to which fight fighter
                    const oA = oddsMatch.fighterA.toLowerCase();
                    let probA, probB, oddsAmA, oddsAmB;

                    if (oA.includes(lastNameA)) {
                        probA = oddsMatch.impliedProbA;
                        probB = oddsMatch.impliedProbB;
                        oddsAmA = oddsMatch.oddsA;
                        oddsAmB = oddsMatch.oddsB;
                    } else {
                        probA = oddsMatch.impliedProbB;
                        probB = oddsMatch.impliedProbA;
                        oddsAmA = oddsMatch.oddsB;
                        oddsAmB = oddsMatch.oddsA;
                    }

                    // Merge into fightmatrix (where prediction engine reads from)
                    if (probA !== null) {
                        fight.fighterA.fightmatrix = fight.fighterA.fightmatrix || {};
                        fight.fighterA.fightmatrix.bettingWinPct = probA;
                        fight.fighterA.fightmatrix.bettingOdds = oddsAmA;
                    }
                    if (probB !== null) {
                        fight.fighterB.fightmatrix = fight.fighterB.fightmatrix || {};
                        fight.fighterB.fightmatrix.bettingWinPct = probB;
                        fight.fighterB.fightmatrix.bettingOdds = oddsAmB;
                    }

                    matched++;
                    console.log(`[Odds] Matched: ${fight.fighterA.name} (${probA}%) vs ${fight.fighterB.name} (${probB}%) from ${oddsMatch.bookmakers} books`);
                }
            }

            console.log(`[Odds] Matched ${matched}/${fights.length} fights with live odds`);
            if (matched > 0) {
                // Save updated fight data
                for (const fight of fights) {
                    await storage.updateFight(fight.id, fight);
                }
                UIComponents.showToast(`Live odds merged for ${matched} fights`, 'success');
            }
        } catch (error) {
            console.warn('[Odds] Could not fetch live odds:', error.message);
            // Non-fatal - continue with existing data
        }
    }

    // ==================== END PASTE DATA ====================

    /**
     * Edit existing fight
     */
    async editFight(fightId) {
        const fight = await storage.getFight(fightId);
        if (!fight) return;

        UIComponents.populateFightForm(fight);
        document.getElementById('fight-modal-title').textContent = 'Edit Fight';
        document.getElementById('delete-fight-btn').style.display = 'block';
        document.getElementById('fight-modal').classList.remove('hidden');
    }

    /**
     * Handle save fight form submission
     */
    async handleSaveFight(e) {
        e.preventDefault();

        const fightId = document.getElementById('fight-id').value;
        const formData = UIComponents.getFightFormData();

        // Validate required fields
        if (!formData.fighterA.name || !formData.fighterB.name || !formData.weightClass) {
            UIComponents.showToast('Please fill in fighter names and weight class', 'error');
            return;
        }

        try {
            UIComponents.showLoading('Saving fight...');

            if (fightId) {
                // Update existing fight
                await storage.updateFight(fightId, formData);
            } else {
                // Create new fight
                formData.eventId = this.activeEventId;
                await storage.createFight(formData);
            }

            this.hideFightModal();
            await this.loadDataCollectionView();

            UIComponents.hideLoading();
            UIComponents.showToast('Fight saved successfully', 'success');
        } catch (error) {
            console.error('Failed to save fight:', error);
            UIComponents.hideLoading();
            UIComponents.showToast('Failed to save fight', 'error');
        }
    }

    /**
     * Confirm and delete fight
     */
    async confirmDeleteFight(fightId) {
        if (!confirm('Are you sure you want to delete this fight?')) return;

        try {
            await storage.deleteFight(fightId);
            await this.loadDataCollectionView();
            UIComponents.showToast('Fight deleted', 'success');
        } catch (error) {
            console.error('Failed to delete fight:', error);
            UIComponents.showToast('Failed to delete fight', 'error');
        }
    }

    /**
     * Handle delete fight button in modal
     */
    async handleDeleteFight() {
        const fightId = document.getElementById('fight-id').value;
        if (!fightId) return;

        this.hideFightModal();
        await this.confirmDeleteFight(fightId);
    }

    /**
     * Handle auto-fetch data for all fights
     */
    async handleAutoFetchData() {
        if (!this.activeEventId || !this.activeEvent) return;

        const fights = await storage.getFightsByEvent(this.activeEventId);
        if (fights.length === 0) {
            UIComponents.showToast('No fights to fetch data for', 'warning');
            return;
        }

        // Show progress UI
        const progressEl = document.getElementById('auto-fetch-progress');
        const statusEl = document.getElementById('auto-fetch-status');
        const tapologyBadge = document.getElementById('tapology-status');
        const dratingsBadge = document.getElementById('dratings-status');
        const fightmatrixBadge = document.getElementById('fightmatrix-status');
        const geminiBadge = document.getElementById('gemini-status');

        progressEl.classList.remove('hidden');
        tapologyBadge.className = 'source-badge loading';
        dratingsBadge.className = 'source-badge loading';
        fightmatrixBadge.className = 'source-badge loading';
        geminiBadge.className = 'source-badge';

        try {
            const result = await fighterDataFetcher.fetchAllFighterData(
                this.activeEvent.name,
                this.activeEvent.date,
                fights,
                (progress) => {
                    statusEl.textContent = progress.message || 'Fetching...';
                }
            );

            // Update source badges based on success
            tapologyBadge.className = `source-badge ${result.sources.tapology ? 'success' : 'error'}`;
            dratingsBadge.className = `source-badge ${result.sources.dratings ? 'success' : 'error'}`;
            fightmatrixBadge.className = `source-badge ${result.sources.fightMatrix ? 'success' : 'error'}`;
            geminiBadge.className = `source-badge ${result.sources.gemini ? 'success' : ''}`;
            const ufcstatsBadge = document.getElementById('ufcstats-status');
            if (ufcstatsBadge) ufcstatsBadge.className = `source-badge ${result.sources.ufcStats ? 'success' : 'error'}`;

            // Apply fetched data to fights
            let updatedCount = 0;
            for (const fightResult of result.results) {
                const fight = fights.find(f => f.id === fightResult.fightId);
                if (!fight) continue;

                // Merge fetched data with existing fight data
                const updates = {
                    fighterA: {
                        ...fight.fighterA,
                        tapology: {
                            consensus: fightResult.fighterA.tapology.consensus,
                            koTko: fightResult.fighterA.tapology.koTko,
                            sub: fightResult.fighterA.tapology.sub,
                            dec: fightResult.fighterA.tapology.dec
                        },
                        dratings: {
                            winPct: fightResult.fighterA.dratings.winPct
                        },
                        fightMatrix: {
                            cirrs: fightResult.fighterA.fightMatrix.cirrs
                        },
                        ufcStats: fightResult.fighterA.ufcStats || fight.fighterA.ufcStats
                    },
                    fighterB: {
                        ...fight.fighterB,
                        tapology: {
                            consensus: fightResult.fighterB.tapology.consensus,
                            koTko: fightResult.fighterB.tapology.koTko,
                            sub: fightResult.fighterB.tapology.sub,
                            dec: fightResult.fighterB.tapology.dec
                        },
                        dratings: {
                            winPct: fightResult.fighterB.dratings.winPct
                        },
                        fightMatrix: {
                            cirrs: fightResult.fighterB.fightMatrix.cirrs
                        },
                        ufcStats: fightResult.fighterB.ufcStats || fight.fighterB.ufcStats
                    }
                };

                // Only update if we got some data
                const hasAnyData =
                    updates.fighterA.tapology.consensus !== null ||
                    updates.fighterA.dratings.winPct !== null ||
                    updates.fighterA.fightMatrix.cirrs !== null ||
                    updates.fighterA.ufcStats?.slpm !== null ||
                    updates.fighterB.tapology.consensus !== null ||
                    updates.fighterB.dratings.winPct !== null ||
                    updates.fighterB.fightMatrix.cirrs !== null ||
                    updates.fighterB.ufcStats?.slpm !== null;

                if (hasAnyData) {
                    await storage.updateFight(fightResult.fightId, updates);
                    updatedCount++;

                    // Also save to fighter history for tracking
                    await this.saveFighterEventHistory(fight, fightResult);
                }
            }

            // Update sources indicator
            const sourcesUsed = [];
            if (result.sources.gemini) sourcesUsed.push('Gemini AI');
            if (result.sources.tapology) sourcesUsed.push('Tapology');
            if (result.sources.dratings) sourcesUsed.push('DRatings');
            if (result.sources.fightMatrix) sourcesUsed.push('FightMatrix');
            if (result.sources.ufcStats) sourcesUsed.push('UFCStats');
            document.getElementById('sources-fetched').textContent =
                sourcesUsed.length > 0 ? sourcesUsed.join(', ') : 'Manual Entry';

            // Hide progress and reload view
            setTimeout(() => {
                progressEl.classList.add('hidden');
            }, 1500);

            await this.loadDataCollectionView();

            if (updatedCount > 0) {
                UIComponents.showToast(`Updated ${updatedCount} fight(s) with fetched data`, 'success');
            } else {
                UIComponents.showToast('No new data found. Try manual entry.', 'warning');
            }

            // Check for missing FightMatrix data and alert user
            const updatedFights = await storage.getFightsByEvent(this.activeEventId);
            const missingFM = fighterDataFetcher.getMissingFightMatrixFighters(updatedFights);
            if (missingFM.length > 0) {
                console.log('[Auto-Fetch] Missing FightMatrix data for:', missingFM);
                // Show warning with option to paste
                setTimeout(() => {
                    UIComponents.showToast(
                        `Missing FightMatrix data for ${missingFM.length} fighter(s). Use "Paste Data" > FightMatrix tab to add manually.`,
                        'warning'
                    );
                }, 1500);
            }

            // Show any errors
            if (result.errors.length > 0) {
                console.warn('Fetch errors:', result.errors);
                // Show user-friendly error message
                const errorMsgs = result.errors.map(e => `${e.source}: ${e.error}`).join('; ');
                if (updatedCount === 0) {
                    UIComponents.showToast(errorMsgs, 'error');
                }
            }

        } catch (error) {
            console.error('Auto-fetch failed:', error);
            tapologyBadge.className = 'source-badge error';
            dratingsBadge.className = 'source-badge error';
            fightmatrixBadge.className = 'source-badge error';
            geminiBadge.className = 'source-badge error';

            setTimeout(() => {
                progressEl.classList.add('hidden');
            }, 1500);

            UIComponents.showToast(`Failed to fetch: ${error.message}`, 'error');
        }
    }

    /**
     * Save fighter event history for tracking predictions over time
     */
    async saveFighterEventHistory(fight, fetchedData) {
        try {
            // Get or create fighter records
            const fighterA = await storage.getOrCreateFighter(fight.fighterA.name);
            const fighterB = await storage.getOrCreateFighter(fight.fighterB.name);

            // Save event-specific data for fighter A
            await storage.saveFighterEventData(fighterA.id, this.activeEventId, {
                tapologyConsensus: fetchedData.fighterA.tapology.consensus,
                tapologyKoTko: fetchedData.fighterA.tapology.koTko,
                tapologySub: fetchedData.fighterA.tapology.sub,
                tapologyDec: fetchedData.fighterA.tapology.dec,
                dratingsWinPct: fetchedData.fighterA.dratings.winPct,
                fightMatrixCirrs: fetchedData.fighterA.fightMatrix.cirrs,
                recordAtFight: fight.fighterA.record
            });

            // Save event-specific data for fighter B
            await storage.saveFighterEventData(fighterB.id, this.activeEventId, {
                tapologyConsensus: fetchedData.fighterB.tapology.consensus,
                tapologyKoTko: fetchedData.fighterB.tapology.koTko,
                tapologySub: fetchedData.fighterB.tapology.sub,
                tapologyDec: fetchedData.fighterB.tapology.dec,
                dratingsWinPct: fetchedData.fighterB.dratings.winPct,
                fightMatrixCirrs: fetchedData.fighterB.fightMatrix.cirrs,
                recordAtFight: fight.fighterB.record
            });
        } catch (error) {
            console.error('Failed to save fighter history:', error);
        }
    }

    /**
     * Handle mark data complete
     */
    async handleMarkDataComplete() {
        if (!this.activeEventId) return;

        const fights = await storage.getFightsByEvent(this.activeEventId);
        const incompleteFights = fights.filter(f => !f.dataComplete);

        if (incompleteFights.length > 0) {
            UIComponents.showToast(`${incompleteFights.length} fight(s) have incomplete data`, 'warning');
            return;
        }

        try {
            await storage.updateEvent(this.activeEventId, { status: 'data-complete' });
            this.activeEvent = await storage.getEvent(this.activeEventId);

            // Update banner
            document.getElementById('active-event-banner').querySelector('.event-state').textContent = 'Data Ready';

            UIComponents.showToast('Data collection complete! You can now generate predictions.', 'success');
            this.navigateTo('predictions');
        } catch (error) {
            console.error('Failed to update event status:', error);
            UIComponents.showToast('Failed to update event status', 'error');
        }
    }

    // ==================== PREDICTIONS VIEW ====================

    /**
     * Load predictions view
     */
    async loadPredictionsView() {
        if (!this.activeEventId) return;

        const predictions = await storage.getPredictionsByEvent(this.activeEventId);
        const fights = await storage.getFightsByEvent(this.activeEventId);
        const fightMap = new Map(fights.map(f => [f.id, f]));

        const predictionsList = document.getElementById('predictions-list');
        const predictionsStatus = document.getElementById('predictions-status');
        const confidenceRankBtn = document.getElementById('confidence-rank-btn');

        // Check if we can generate predictions
        const canGenerate = this.activeEvent.status !== 'pre-event' || fights.every(f => f.dataComplete);
        document.getElementById('generate-predictions-btn').disabled = !canGenerate && predictions.length === 0;

        // Enable/disable confidence rank button based on predictions existence
        confidenceRankBtn.disabled = predictions.length === 0;

        // Check if ranking already exists for this event
        const existingRanking = await storage.getConfidenceRanking(this.activeEventId);
        if (existingRanking) {
            confidenceRankBtn.textContent = 'Confidence Rank (Saved)';
        } else {
            confidenceRankBtn.textContent = 'Confidence Rank';
        }

        if (predictions.length === 0) {
            predictionsList.innerHTML = '<p class="empty-state">No predictions generated yet. Complete data collection and click "Generate Predictions".</p>';
            predictionsStatus.classList.add('hidden');
            return;
        }

        predictionsStatus.classList.remove('hidden');
        predictionsList.innerHTML = '';

        // Load cached AI analyses
        const aiAnalyses = new Map();
        if (chromeAI.enabled && chromeAI.promptAvailable) {
            for (const prediction of predictions) {
                const cached = await chromeAI.getCachedAnalysis(this.activeEventId, prediction.fightId);
                if (cached) aiAnalyses.set(prediction.fightId, cached);
            }
        }

        // Enable/disable AI analysis button
        const aiBtn = document.getElementById('ai-analysis-btn');
        if (aiBtn && chromeAI.promptAvailable && chromeAI.enabled) {
            aiBtn.disabled = predictions.length === 0;
        }

        predictions.forEach(prediction => {
            const fight = fightMap.get(prediction.fightId);
            if (!fight) return;

            const aiAnalysis = aiAnalyses.get(prediction.fightId) || null;
            const card = UIComponents.createPredictionCard(prediction, fight, false, aiAnalysis);
            predictionsList.appendChild(card);
        });
    }

    /**
     * Handle prediction card click (expand/collapse)
     */
    handlePredictionClick(e) {
        const card = e.target.closest('.prediction-card');
        if (!card) return;

        if (e.target.closest('.prediction-card-header')) {
            card.classList.toggle('expanded');
        }
    }

    /**
     * Initialize Chrome AI features
     */
    async initChromeAI() {
        try {
            const availability = await chromeAI.checkAvailability();
            const aiBtn = document.getElementById('ai-analysis-btn');

            if (availability.anyAvailable && aiBtn) {
                aiBtn.style.display = '';
            } else if (aiBtn) {
                aiBtn.style.display = 'none';
            }
        } catch (e) {
            console.warn('[App] Chrome AI init failed:', e.message);
        }
    }

    /**
     * Generate AI fight analysis for all predictions
     */
    async handleGenerateAIAnalysis() {
        if (!this.activeEventId) return;

        const fights = await storage.getFightsByEvent(this.activeEventId);
        const predictions = await storage.getPredictionsByEvent(this.activeEventId);

        if (predictions.length === 0) {
            UIComponents.showToast('Generate predictions first', 'warning');
            return;
        }

        UIComponents.showLoading('Generating AI analysis...');

        try {
            const analyses = await chromeAI.generateAllAnalyses(fights, predictions, {
                onProgress: (current, total, fight) => {
                    const loadingText = document.querySelector('.loading-text');
                    if (loadingText) {
                        loadingText.textContent = `Analyzing ${fight.fighterA.name} vs ${fight.fighterB.name} (${current}/${total})...`;
                    }
                }
            });

            // Cache all results
            for (const [fightId, analysis] of analyses) {
                await chromeAI.cacheAnalysis(this.activeEventId, fightId, analysis);
            }

            UIComponents.hideLoading();
            UIComponents.showToast(`AI analysis generated for ${analyses.size} fights`, 'success');

            // Re-render predictions view with analysis
            await this.loadPredictionsView();
        } catch (e) {
            console.error('[App] AI analysis failed:', e);
            UIComponents.hideLoading();
            UIComponents.showToast('AI analysis failed: ' + e.message, 'error');
        }
    }

    /**
     * Handle generate predictions
     */
    async handleGeneratePredictions() {
        if (!this.activeEventId) return;

        const fights = await storage.getFightsByEvent(this.activeEventId);

        if (fights.length === 0) {
            UIComponents.showToast('No fights to generate predictions for', 'warning');
            return;
        }

        // Check for incomplete data
        const incompleteFights = fights.filter(f => !f.dataComplete);
        if (incompleteFights.length > 0) {
            UIComponents.showToast(`${incompleteFights.length} fight(s) have incomplete data`, 'warning');
            return;
        }

        try {
            UIComponents.showLoading('Fetching live odds...');

            // Fetch live odds and merge into fighter data before generating
            await this.fetchAndMergeLiveOdds(fights);

            UIComponents.showLoading('Generating predictions...');

            // Generate predictions using the engine
            const predictions = predictionEngine.generatePredictions(fights, this.activeEvent.type);

            // Save predictions
            await storage.savePredictions(this.activeEventId, predictions);

            // Update event status
            await storage.updateEvent(this.activeEventId, { status: 'predictions-ready' });
            this.activeEvent = await storage.getEvent(this.activeEventId);

            // Update banner
            document.getElementById('active-event-banner').querySelector('.event-state').textContent = 'Predictions Ready';

            // Reload view
            await this.loadPredictionsView();

            UIComponents.hideLoading();
            UIComponents.showToast(`Generated ${predictions.length} predictions`, 'success');

            // Auto-save to server (if running)
            storage.autoSave().then(() => {
                console.log('[App] Auto-saved after predictions');
            }).catch(() => { });
        } catch (error) {
            console.error('Failed to generate predictions:', error);
            UIComponents.hideLoading();
            UIComponents.showToast('Failed to generate predictions', 'error');
        }
    }

    /**
     * Expand all fight cards on Data tab
     */
    expandAllFights() {
        document.querySelectorAll('.fight-card').forEach(card => {
            card.classList.add('expanded');
        });
    }

    /**
     * Collapse all fight cards on Data tab
     */
    collapseAllFights() {
        document.querySelectorAll('.fight-card').forEach(card => {
            card.classList.remove('expanded');
        });
    }

    /**
     * Expand all prediction cards
     */
    expandAllPredictions() {
        document.querySelectorAll('.prediction-card').forEach(card => {
            card.classList.add('expanded');
        });
    }

    /**
     * Collapse all prediction cards
     */
    collapseAllPredictions() {
        document.querySelectorAll('.prediction-card').forEach(card => {
            card.classList.remove('expanded');
        });
    }

    // ==================== CONFIDENCE RANKING ====================

    /**
     * Handle show confidence ranking button click
     */
    async handleShowConfidenceRanking() {
        if (!this.activeEventId || !this.activeEvent) {
            UIComponents.showToast('No event selected', 'error');
            return;
        }

        try {
            UIComponents.showLoading('Generating confidence rankings...');

            // Check if we already have a saved ranking
            let rankingData = await storage.getConfidenceRanking(this.activeEventId);

            if (!rankingData) {
                // Generate new ranking
                rankingData = await this.generateConfidenceRanking();
                if (!rankingData.success) {
                    UIComponents.hideLoading();
                    UIComponents.showToast(rankingData.error || 'Failed to generate ranking', 'error');
                    return;
                }

                // Save the ranking
                await storage.saveConfidenceRanking(rankingData);
            }

            this.currentConfidenceRanking = rankingData;
            this.renderConfidenceRankingModal(rankingData);

            UIComponents.hideLoading();
            document.getElementById('confidence-ranking-modal').classList.remove('hidden');

            // Update button text
            document.getElementById('confidence-rank-btn').textContent = 'Confidence Rank (Saved)';

        } catch (error) {
            console.error('Failed to show confidence ranking:', error);
            UIComponents.hideLoading();
            UIComponents.showToast('Failed to generate confidence ranking', 'error');
        }
    }

    /**
     * Generate confidence ranking for current event
     */
    async generateConfidenceRanking() {
        const predictions = await storage.getPredictionsByEvent(this.activeEventId);
        const fights = await storage.getFightsByEvent(this.activeEventId);

        if (predictions.length === 0) {
            return { success: false, error: 'No predictions available to rank' };
        }

        const rankingResult = confidenceRanker.generateRankings(predictions, fights, this.activeEvent);
        return rankingResult;
    }

    /**
     * Render the confidence ranking modal content
     */
    renderConfidenceRankingModal(rankingData) {
        const headerContainer = document.getElementById('confidence-ranking-header');
        const listContainer = document.getElementById('confidence-ranking-list');

        // Render header
        headerContainer.innerHTML = UIComponents.createConfidenceRankingHeader(
            rankingData.eventName,
            rankingData.totalFights,
            rankingData.generatedAt
        );

        // Render ranking cards
        listContainer.innerHTML = '';

        if (rankingData.rankings.length === 0) {
            listContainer.innerHTML = '<p class="empty-state">No rankings available.</p>';
            return;
        }

        rankingData.rankings.forEach(ranking => {
            const card = UIComponents.createConfidenceRankCard(ranking, rankingData.totalFights);
            listContainer.appendChild(card);
        });
    }

    /**
     * Hide confidence ranking modal
     */
    hideConfidenceRankingModal() {
        document.getElementById('confidence-ranking-modal').classList.add('hidden');
    }

    /**
     * Handle copy ranking to clipboard
     */
    async handleCopyRanking() {
        if (!this.currentConfidenceRanking || !this.currentConfidenceRanking.rankings) {
            UIComponents.showToast('No ranking data to copy', 'error');
            return;
        }

        const copyText = UIComponents.formatRankingsForCopy(this.currentConfidenceRanking.rankings);

        try {
            await navigator.clipboard.writeText(copyText);
            UIComponents.showToast('Ranking copied to clipboard!', 'success');
        } catch (error) {
            // Fallback for browsers that don't support clipboard API
            const textarea = document.createElement('textarea');
            textarea.value = copyText;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                UIComponents.showToast('Ranking copied to clipboard!', 'success');
            } catch (e) {
                UIComponents.showToast('Failed to copy. Please copy manually.', 'error');
                console.error('Copy failed:', e);
            }
            document.body.removeChild(textarea);
        }
    }

    /**
     * Handle regenerate ranking button
     */
    async handleRegenerateRanking() {
        if (!this.activeEventId) return;

        try {
            UIComponents.showLoading('Regenerating confidence rankings...');

            // Delete existing ranking
            await storage.deleteConfidenceRanking(this.activeEventId);

            // Generate new ranking
            const rankingData = await this.generateConfidenceRanking();
            if (!rankingData.success) {
                UIComponents.hideLoading();
                UIComponents.showToast(rankingData.error || 'Failed to regenerate ranking', 'error');
                return;
            }

            // Save the new ranking
            await storage.saveConfidenceRanking(rankingData);
            this.currentConfidenceRanking = rankingData;

            // Re-render the modal
            this.renderConfidenceRankingModal(rankingData);

            UIComponents.hideLoading();
            UIComponents.showToast('Ranking regenerated successfully!', 'success');

        } catch (error) {
            console.error('Failed to regenerate ranking:', error);
            UIComponents.hideLoading();
            UIComponents.showToast('Failed to regenerate ranking', 'error');
        }
    }

    /**
     * Handle click on ranking card (expand/collapse)
     */
    handleRankingCardClick(e) {
        const card = e.target.closest('.confidence-rank-card');
        if (!card) return;

        if (e.target.closest('.confidence-rank-header')) {
            card.classList.toggle('expanded');
        }
    }

    // ==================== RESULTS VIEW ====================

    /**
     * Load results view
     */
    async loadResultsView() {
        if (!this.activeEventId) return;

        const fights = await storage.getFightsByEvent(this.activeEventId);
        const predictions = await storage.getPredictionsByEvent(this.activeEventId);
        const results = await storage.getResultsByEvent(this.activeEventId);

        const predictionMap = new Map(predictions.map(p => [p.fightId, p]));
        const resultMap = new Map(results.map(r => [r.fightId, r]));

        const resultsList = document.getElementById('results-list');

        if (predictions.length === 0) {
            resultsList.innerHTML = '<p class="empty-state">Generate predictions first, then enter results after the event.</p>';
            document.getElementById('save-all-results-btn').disabled = true;
            return;
        }

        document.getElementById('save-all-results-btn').disabled = false;
        resultsList.innerHTML = '';

        fights.forEach(fight => {
            const prediction = predictionMap.get(fight.id);
            const existingResult = resultMap.get(fight.id);
            const card = UIComponents.createResultCard(fight, prediction, existingResult);
            resultsList.appendChild(card);
        });
    }

    /**
     * Handle save all results
     */
    async handleSaveResults() {
        if (!this.activeEventId) return;

        const resultCards = document.querySelectorAll('.result-card');
        const resultsToSave = [];

        // Collect results from form
        resultCards.forEach(card => {
            const fightId = card.dataset.fightId;
            const winner = card.querySelector('.result-winner').value;
            const method = card.querySelector('.result-method').value;
            const round = card.querySelector('.result-round').value;

            // Handle cancelled fights (no method/round needed)
            if (winner === 'cancelled') {
                resultsToSave.push({
                    eventId: this.activeEventId,
                    fightId,
                    winner: 'cancelled',
                    winnerName: 'Fight Cancelled',
                    method: 'CANCELLED',
                    round: 'N/A'
                });
            } else if (winner && method) {
                // Get winner name from the select option text
                const winnerSelect = card.querySelector('.result-winner');
                const winnerName = winnerSelect.options[winnerSelect.selectedIndex].text;

                resultsToSave.push({
                    eventId: this.activeEventId,
                    fightId,
                    winner,
                    winnerName,
                    method,
                    round
                });
            }
        });

        if (resultsToSave.length === 0) {
            UIComponents.showToast('Please enter at least one result', 'warning');
            return;
        }

        try {
            UIComponents.showLoading('Saving results...');

            // Save each result
            for (const result of resultsToSave) {
                await storage.saveResult(result);
            }

            // Calculate accuracy
            await accuracyTracker.calculateEventAccuracy(this.activeEventId);

            // Update event status
            await storage.updateEvent(this.activeEventId, { status: 'results-entered' });
            this.activeEvent = await storage.getEvent(this.activeEventId);

            // Update banner
            document.getElementById('active-event-banner').querySelector('.event-state').textContent = 'Complete';

            UIComponents.hideLoading();
            UIComponents.showToast(`Saved ${resultsToSave.length} results. Accuracy calculated!`, 'success');

            // Auto-save to server (if running)
            storage.autoSave().then(() => {
                console.log('[App] Auto-saved after results');
                UIComponents.showToast('Data backed up to file', 'success');
            }).catch(() => { });

            // Navigate to accuracy view
            this.navigateTo('accuracy');
        } catch (error) {
            console.error('Failed to save results:', error);
            UIComponents.hideLoading();
            UIComponents.showToast('Failed to save results', 'error');
        }
    }

    /**
     * Toggle results paste area visibility
     */
    toggleResultsPasteArea() {
        const pasteArea = document.getElementById('results-paste-area');
        pasteArea.classList.toggle('hidden');
        if (!pasteArea.classList.contains('hidden')) {
            document.getElementById('results-paste-input').focus();
        }
    }

    /**
     * Apply pasted results from Chrome extension
     */
    async applyResultsPaste() {
        const pasteInput = document.getElementById('results-paste-input');
        const pastedText = pasteInput.value.trim();

        if (!pastedText) {
            UIComponents.showToast('Please paste results data first', 'warning');
            return;
        }

        try {
            const results = JSON.parse(pastedText);

            if (!Array.isArray(results) || results.length === 0) {
                throw new Error('Invalid results format');
            }

            console.log('[Apply Results] Parsed results:', results);

            // Get current fights
            const fights = await storage.getFightsByEvent(this.activeEventId);
            let matchedCount = 0;

            // For each result, find matching fight and fill in the form
            for (const result of results) {
                const winnerName = result.winner?.toLowerCase().trim();
                const loserName = result.loser?.toLowerCase().trim();

                // Find the fight card that matches this result
                const resultCards = document.querySelectorAll('.result-card');
                for (const card of resultCards) {
                    const fightId = card.dataset.fightId;
                    const fight = fights.find(f => f.id === fightId);
                    if (!fight) continue;

                    const fighterAName = fight.fighterA?.name?.toLowerCase().trim();
                    const fighterBName = fight.fighterB?.name?.toLowerCase().trim();

                    // Check if this fight matches the result (either fighter order)
                    const fighterAWon = (fighterAName && (winnerName?.includes(fighterAName.split(' ').pop()) || fighterAName.includes(winnerName?.split(' ').pop() || '')));
                    const fighterBWon = (fighterBName && (winnerName?.includes(fighterBName.split(' ').pop()) || fighterBName.includes(winnerName?.split(' ').pop() || '')));

                    // Check for cancelled fight (method = CANCELLED or cancelled = true)
                    const isCancelled = result.cancelled === true ||
                        result.method?.toUpperCase() === 'CANCELLED' ||
                        result.winner?.toLowerCase() === 'cancelled';

                    if (isCancelled) {
                        // Match cancelled fights by checking if either fighter name matches
                        const matchesFight = (fighterAName && (
                            result.fighterA?.toLowerCase().includes(fighterAName.split(' ').pop()) ||
                            result.fighterB?.toLowerCase().includes(fighterAName.split(' ').pop()) ||
                            result.winner?.toLowerCase().includes(fighterAName.split(' ').pop()) ||
                            result.loser?.toLowerCase().includes(fighterAName.split(' ').pop())
                        )) || (fighterBName && (
                            result.fighterA?.toLowerCase().includes(fighterBName.split(' ').pop()) ||
                            result.fighterB?.toLowerCase().includes(fighterBName.split(' ').pop()) ||
                            result.winner?.toLowerCase().includes(fighterBName.split(' ').pop()) ||
                            result.loser?.toLowerCase().includes(fighterBName.split(' ').pop())
                        ));

                        if (matchesFight) {
                            const winnerSelect = card.querySelector('.result-winner');
                            winnerSelect.value = 'cancelled';
                            // Trigger change event to hide method/round
                            winnerSelect.dispatchEvent(new Event('change'));
                            matchedCount++;
                            console.log('[Apply Results] Matched cancelled fight:', fightId);
                            break;
                        }
                    } else if (fighterAWon || fighterBWon) {
                        // Set winner
                        const winnerSelect = card.querySelector('.result-winner');
                        winnerSelect.value = fighterAWon ? 'fighterA' : 'fighterB';

                        // Set method
                        const methodSelect = card.querySelector('.result-method');
                        if (result.method) {
                            methodSelect.value = result.method.toUpperCase();
                        }

                        // Set round
                        const roundSelect = card.querySelector('.result-round');
                        if (result.round) {
                            roundSelect.value = result.round;
                        }

                        matchedCount++;
                        console.log('[Apply Results] Matched:', result.winner, 'to fight', fightId);
                        break;
                    }
                }
            }

            // Clear paste area
            pasteInput.value = '';
            document.getElementById('results-paste-area').classList.add('hidden');

            // Enable save button
            document.getElementById('save-all-results-btn').disabled = false;

            UIComponents.showToast(`Applied ${matchedCount} of ${results.length} results`, matchedCount > 0 ? 'success' : 'warning');
        } catch (error) {
            console.error('Failed to parse results:', error);
            UIComponents.showToast('Invalid JSON format. Please check the pasted data.', 'error');
        }
    }

    // ==================== ACCURACY VIEW ====================

    /**
     * Load accuracy view
     */
    async loadAccuracyView() {
        try {
            const overall = await accuracyTracker.getOverallAccuracy();
            const eventHistory = await accuracyTracker.getEventHistory();

            // Update overall stats
            document.getElementById('overall-winner-pct').textContent =
                overall.totalFights > 0 ? `${overall.winnerPct.toFixed(1)}%` : '--';
            document.getElementById('overall-method-pct').textContent =
                overall.totalFights > 0 ? `${overall.methodPct.toFixed(1)}%` : '--';
            document.getElementById('overall-round-pct').textContent =
                overall.totalFights > 0 ? `${overall.roundPct.toFixed(1)}%` : '--';
            document.getElementById('total-fights-tracked').textContent = overall.totalFights;
            document.getElementById('total-events-tracked').textContent = overall.totalEvents;

            // Weight class breakdown
            const wcContainer = document.getElementById('accuracy-by-weight');
            if (Object.keys(overall.byWeightClass).length > 0) {
                wcContainer.innerHTML = Object.entries(overall.byWeightClass)
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([wc, data]) => UIComponents.createAccuracyBar(wc, data.winnerPct, data.total))
                    .join('');
            } else {
                wcContainer.innerHTML = '<p class="empty-state">No data yet</p>';
            }

            // Source breakdown
            const sourceContainer = document.getElementById('accuracy-by-source');
            if (Object.keys(overall.bySource).length > 0) {
                sourceContainer.innerHTML = Object.entries(overall.bySource)
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([source, data]) => UIComponents.createAccuracyBar(
                        UIComponents.formatSourceName(source),
                        data.winnerPct,
                        data.total
                    ))
                    .join('');
            } else {
                sourceContainer.innerHTML = '<p class="empty-state">No data yet</p>';
            }

            // Volatility breakdown
            const volContainer = document.getElementById('accuracy-volatility');
            if (overall.byVolatility.volatile.total > 0 || overall.byVolatility.nonVolatile.total > 0) {
                volContainer.innerHTML = `
                    ${UIComponents.createAccuracyBar('Non-Volatile', overall.byVolatility.nonVolatile.winnerPct, overall.byVolatility.nonVolatile.total)}
                    ${UIComponents.createAccuracyBar('Volatile', overall.byVolatility.volatile.winnerPct, overall.byVolatility.volatile.total)}
                `;
            } else {
                volContainer.innerHTML = '<p class="empty-state">No data yet</p>';
            }

            // Event type breakdown
            const eventTypeContainer = document.getElementById('accuracy-by-event-type');
            if (Object.keys(overall.byEventType).length > 0) {
                eventTypeContainer.innerHTML = Object.entries(overall.byEventType)
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([type, data]) => UIComponents.createAccuracyBar(
                        UIComponents.formatEventType(type),
                        data.winnerPct,
                        data.total
                    ))
                    .join('');
            } else {
                eventTypeContainer.innerHTML = '<p class="empty-state">No data yet</p>';
            }

            // Event history
            const historyContainer = document.getElementById('event-history-list');
            if (eventHistory.length > 0) {
                historyContainer.innerHTML = eventHistory
                    .map(event => UIComponents.createEventHistoryItem(event))
                    .join('');
            } else {
                historyContainer.innerHTML = '<p class="empty-state">No completed events yet</p>';
            }
        } catch (error) {
            console.error('Failed to load accuracy view:', error);
            UIComponents.showToast('Failed to load accuracy data', 'error');
        }
    }

    // ==================== ANALYSIS VIEW ====================

    /**
     * Load analysis view
     */
    async loadAnalysisView() {
        try {
            const status = await aiAnalyzer.canRunAnalysis();

            document.getElementById('completed-events-count').textContent = status.eventsCompleted;

            if (!status.canAnalyze) {
                document.getElementById('analysis-requirements').classList.remove('hidden');
                document.getElementById('analysis-results').classList.add('hidden');
                document.getElementById('run-analysis-btn').disabled = true;
                return;
            }

            document.getElementById('run-analysis-btn').disabled = false;

            // Check if we already have recent analysis results displayed
            const analysisResults = document.getElementById('analysis-results');
            if (!analysisResults.classList.contains('hidden')) {
                // Analysis already shown, don't re-run automatically
                return;
            }

            // Show requirements as placeholder until user clicks run
            document.getElementById('analysis-requirements').innerHTML = `
                <p>Analysis ready! Click "Run Analysis" to generate insights and recommendations.</p>
                <p>Events with results: <span id="completed-events-count">${status.eventsCompleted}</span></p>
            `;
        } catch (error) {
            console.error('Failed to load analysis view:', error);
        }
    }

    /**
     * Handle run analysis
     */
    async handleRunAnalysis() {
        try {
            UIComponents.showLoading('Running analysis...');

            const analysis = await aiAnalyzer.runAnalysis();

            if (!analysis.canAnalyze) {
                UIComponents.hideLoading();
                UIComponents.showToast(analysis.message, 'warning');
                return;
            }

            // Hide requirements, show results
            document.getElementById('analysis-requirements').classList.add('hidden');
            document.getElementById('analysis-results').classList.remove('hidden');

            // Render findings
            const findingsContainer = document.getElementById('key-findings');
            findingsContainer.innerHTML = analysis.findings
                .map(finding => UIComponents.createFindingItem(finding))
                .join('');

            // Render betting strategy (Strategist's Corner)
            const strategyContainer = document.getElementById('betting-strategy');
            if (analysis.strategy) {
                strategyContainer.innerHTML = '';
                strategyContainer.appendChild(UIComponents.createStrategyDisplay(analysis.strategy));
            } else {
                strategyContainer.innerHTML = '<p class="empty-state">Strategy analysis not available.</p>';
            }

            // Render recommendations
            const recsContainer = document.getElementById('recommendations');
            if (analysis.recommendations.length > 0) {
                recsContainer.innerHTML = analysis.recommendations
                    .map(rec => UIComponents.createRecommendationItem(rec))
                    .join('');
            } else {
                recsContainer.innerHTML = '<p class="empty-state">No specific recommendations at this time. Keep tracking more events!</p>';
            }

            // Render trend analysis
            const trendContainer = document.getElementById('trend-analysis');
            trendContainer.innerHTML = '';
            trendContainer.appendChild(UIComponents.createTrendDisplay(analysis.trendAnalysis));

            UIComponents.hideLoading();
            UIComponents.showToast('Analysis complete!', 'success');
        } catch (error) {
            console.error('Failed to run analysis:', error);
            UIComponents.hideLoading();
            UIComponents.showToast('Failed to run analysis', 'error');
        }
    }

    // ==================== DEBUG ====================

    /**
     * Handle debug database dump button
     */
    async handleDebugDump() {
        try {
            UIComponents.showToast('Dumping database to console...', 'info');
            const stats = await storage.debugDumpDatabase();
            UIComponents.showToast(
                `DB: ${stats.events} events, ${stats.fights} fights, ${stats.predictions} predictions, ${stats.results} results`,
                'success',
                5000
            );
        } catch (error) {
            console.error('Debug dump failed:', error);
            UIComponents.showToast('Debug dump failed - check console', 'error');
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    window.app.init();
});
