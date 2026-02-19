/**
 * UFC Weekly Predictor - IndexedDB Storage Layer
 * Handles all data persistence for events, fights, predictions, results, and accuracy history
 */

const DB_NAME = 'UFCPredictorDB';
const DB_VERSION = 4;

class Storage {
    constructor() {
        this.db = null;
        this.isReady = false;
    }

    /**
     * Normalize a fighter name for duplicate detection
     */
    normalizeName(name) {
        if (!name) return '';
        // Remove accents
        const withoutAccents = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        // Lowercase
        const lower = withoutAccents.toLowerCase();
        // Expand common abbreviations (St. -> Saint, Jr. -> Junior, etc.)
        const expanded = lower
            .replace(/\bst\.\s*/g, 'saint ')
            .replace(/\bjr\.\s*/g, 'junior ')
            .replace(/\bsr\.\s*/g, 'senior ');
        // Replace hyphens with spaces
        const withSpaces = expanded.replace(/[-]/g, ' ');
        // Remove non-alpha except spaces, collapse whitespace
        return withSpaces.replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
    }

    /**
     * Initialize the database connection
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open database:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.isReady = true;
                console.log('Database initialized successfully');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Events store
                if (!db.objectStoreNames.contains('events')) {
                    const eventsStore = db.createObjectStore('events', { keyPath: 'id' });
                    eventsStore.createIndex('date', 'date', { unique: false });
                    eventsStore.createIndex('status', 'status', { unique: false });
                }

                // Fights store
                if (!db.objectStoreNames.contains('fights')) {
                    const fightsStore = db.createObjectStore('fights', { keyPath: 'id' });
                    fightsStore.createIndex('eventId', 'eventId', { unique: false });
                }

                // Predictions store
                if (!db.objectStoreNames.contains('predictions')) {
                    const predictionsStore = db.createObjectStore('predictions', { keyPath: 'id' });
                    predictionsStore.createIndex('eventId', 'eventId', { unique: false });
                    predictionsStore.createIndex('fightId', 'fightId', { unique: false });
                }

                // Results store
                if (!db.objectStoreNames.contains('results')) {
                    const resultsStore = db.createObjectStore('results', { keyPath: 'id' });
                    resultsStore.createIndex('eventId', 'eventId', { unique: false });
                    resultsStore.createIndex('fightId', 'fightId', { unique: false });
                }

                // Accuracy history store
                if (!db.objectStoreNames.contains('accuracyHistory')) {
                    const accuracyStore = db.createObjectStore('accuracyHistory', { keyPath: 'id' });
                    accuracyStore.createIndex('eventId', 'eventId', { unique: false });
                    accuracyStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // Fighters store - persistent fighter database
                if (!db.objectStoreNames.contains('fighters')) {
                    const fightersStore = db.createObjectStore('fighters', { keyPath: 'id' });
                    fightersStore.createIndex('name', 'name', { unique: false });
                    fightersStore.createIndex('normalizedName', 'normalizedName', { unique: true });
                }

                // Fighter event history - tracks fighter data per event for historical analysis
                if (!db.objectStoreNames.contains('fighterEventHistory')) {
                    const historyStore = db.createObjectStore('fighterEventHistory', { keyPath: 'id' });
                    historyStore.createIndex('fighterId', 'fighterId', { unique: false });
                    historyStore.createIndex('eventId', 'eventId', { unique: false });
                    historyStore.createIndex('fighterEvent', ['fighterId', 'eventId'], { unique: true });
                }

                // Confidence rankings store - stores confidence rankings for pick contests
                if (!db.objectStoreNames.contains('confidenceRankings')) {
                    const rankingsStore = db.createObjectStore('confidenceRankings', { keyPath: 'id' });
                    rankingsStore.createIndex('eventId', 'eventId', { unique: true });
                }

                // Settings store - for app settings like save folder handle
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }

                console.log('Database schema created/upgraded');
            };
        });
    }

    /**
     * Generate a unique ID
     */
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // ==================== EVENTS ====================

    /**
     * Create a new event
     */
    async createEvent(eventData) {
        const event = {
            id: this.generateId(),
            name: eventData.name,
            date: eventData.date,
            type: eventData.type,
            status: 'pre-event', // pre-event, data-complete, predictions-ready, results-entered
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            const request = store.add(event);

            request.onsuccess = () => {
                console.log('[Storage] Event CREATED:', event.name, '| ID:', event.id);
                resolve(event);
            };
            request.onerror = () => {
                console.error('[Storage] Failed to create event:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get all events
     */
    async getAllEvents() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readonly');
            const store = transaction.objectStore('events');
            const request = store.getAll();

            request.onsuccess = () => {
                const events = request.result.sort((a, b) => new Date(b.date) - new Date(a.date));
                console.log('[Storage] Retrieved', events.length, 'events from IndexedDB');
                resolve(events);
            };
            request.onerror = () => {
                console.error('[Storage] Failed to get events:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get a single event by ID
     */
    async getEvent(eventId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readonly');
            const store = transaction.objectStore('events');
            const request = store.get(eventId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Update an event
     */
    async updateEvent(eventId, updates) {
        const event = await this.getEvent(eventId);
        if (!event) throw new Error('Event not found');

        const updatedEvent = {
            ...event,
            ...updates,
            updatedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            const request = store.put(updatedEvent);

            request.onsuccess = () => {
                console.log('[Storage] Event UPDATED:', updatedEvent.name, '| Status:', updatedEvent.status);
                resolve(updatedEvent);
            };
            request.onerror = () => {
                console.error('[Storage] Failed to update event:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Delete an event and all associated data
     */
    async deleteEvent(eventId) {
        // Delete all fights for this event
        const fights = await this.getFightsByEvent(eventId);
        for (const fight of fights) {
            await this.deleteFight(fight.id);
        }

        // Delete predictions for this event
        await this.deletePredictionsByEvent(eventId);

        // Delete results for this event
        await this.deleteResultsByEvent(eventId);

        // Delete the event itself
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            const request = store.delete(eventId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== FIGHTS ====================

    /**
     * Create a new fight (skips if duplicate matchup already exists for this event)
     */
    async createFight(fightData) {
        // Check for duplicate matchup in this event using normalized names
        const existingFights = await this.getFightsByEvent(fightData.eventId);
        const newFighterA = this.normalizeName(fightData.fighterA?.name);
        const newFighterB = this.normalizeName(fightData.fighterB?.name);

        const isDuplicate = existingFights.some(f => {
            const existingA = this.normalizeName(f.fighterA?.name);
            const existingB = this.normalizeName(f.fighterB?.name);
            // Check both orderings (A vs B or B vs A)
            return (existingA === newFighterA && existingB === newFighterB) ||
                (existingA === newFighterB && existingB === newFighterA);
        });

        if (isDuplicate) {
            console.log('[Storage] Skipping duplicate fight:', newFighterA, 'vs', newFighterB);
            return null;
        }

        const fight = {
            id: this.generateId(),
            eventId: fightData.eventId,
            weightClass: fightData.weightClass,
            numRounds: fightData.numRounds || 3,
            isMainEvent: fightData.isMainEvent || false,
            fighterA: fightData.fighterA,
            fighterB: fightData.fighterB,
            dataComplete: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fights'], 'readwrite');
            const store = transaction.objectStore('fights');
            const request = store.add(fight);

            request.onsuccess = () => {
                console.log('[Storage] Fight CREATED:', fight.fighterA?.name, 'vs', fight.fighterB?.name, '| ID:', fight.id);
                resolve(fight);
            };
            request.onerror = () => {
                console.error('[Storage] Failed to create fight:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get all fights for an event
     */
    async getFightsByEvent(eventId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fights'], 'readonly');
            const store = transaction.objectStore('fights');
            const index = store.index('eventId');
            const request = index.getAll(eventId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a single fight by ID
     */
    async getFight(fightId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fights'], 'readonly');
            const store = transaction.objectStore('fights');
            const request = store.get(fightId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Update a fight
     */
    async updateFight(fightId, updates) {
        const fight = await this.getFight(fightId);
        if (!fight) throw new Error('Fight not found');

        const updatedFight = {
            ...fight,
            ...updates,
            updatedAt: new Date().toISOString()
        };

        // Check if data is complete
        updatedFight.dataComplete = this.checkFightDataComplete(updatedFight);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fights'], 'readwrite');
            const store = transaction.objectStore('fights');
            const request = store.put(updatedFight);

            request.onsuccess = () => {
                console.log('[Storage] Fight UPDATED:', updatedFight.fighterA?.name, 'vs', updatedFight.fighterB?.name, '| DataComplete:', updatedFight.dataComplete);
                resolve(updatedFight);
            };
            request.onerror = () => {
                console.error('[Storage] Failed to update fight:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Delete a fight
     */
    async deleteFight(fightId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fights'], 'readwrite');
            const store = transaction.objectStore('fights');
            const request = store.delete(fightId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Check if a fight has all required data
     * Uses nested structure: fighter.tapology.consensus, fighter.dratings.winPct
     */
    checkFightDataComplete(fight) {
        for (const fighterKey of ['fighterA', 'fighterB']) {
            const fighterData = fight[fighterKey];
            if (!fighterData) return false;
            if (!fighterData.name) return false;

            // Check for at least one prediction source
            const hasTapology = fighterData.tapology?.consensus !== null && fighterData.tapology?.consensus !== undefined;
            const hasDRatings = fighterData.dratings?.winPct !== null && fighterData.dratings?.winPct !== undefined;

            if (!hasTapology && !hasDRatings) {
                return false;
            }
        }

        return fight.weightClass ? true : false;
    }

    /**
     * Get missing data fields for a fight
     */
    getMissingFields(fight) {
        const missing = [];

        if (!fight.weightClass) {
            missing.push({ field: 'weightClass', label: 'Weight Class' });
        }

        for (const fighterKey of ['fighterA', 'fighterB']) {
            const fighter = fight[fighterKey];
            const label = fighterKey === 'fighterA' ? 'Fighter A' : 'Fighter B';

            if (!fighter) {
                missing.push({ field: fighterKey, label: `${label} data` });
                continue;
            }

            if (!fighter.name) {
                missing.push({ field: `${fighterKey}.name`, label: `${label} Name` });
            }

            // Check prediction sources (need at least one)
            const hasTapology = fighter.tapology?.consensus !== null && fighter.tapology?.consensus !== undefined;
            const hasDRatings = fighter.dratings?.winPct !== null && fighter.dratings?.winPct !== undefined;

            if (!hasTapology && !hasDRatings) {
                missing.push({ field: `${fighterKey}.predictions`, label: `${label} Predictions (Tapology or DRatings)` });
            }
        }

        return missing;
    }

    // ==================== PREDICTIONS ====================

    /**
     * Save predictions for an event
     */
    async savePredictions(eventId, predictions) {
        const transaction = this.db.transaction(['predictions'], 'readwrite');
        const store = transaction.objectStore('predictions');

        // Clear existing predictions for this event
        const index = store.index('eventId');
        const existingRequest = index.getAllKeys(eventId);

        return new Promise((resolve, reject) => {
            existingRequest.onsuccess = async () => {
                // Delete existing predictions
                for (const key of existingRequest.result) {
                    store.delete(key);
                }

                // Add new predictions
                const savedPredictions = [];
                for (const pred of predictions) {
                    const prediction = {
                        id: this.generateId(),
                        eventId,
                        fightId: pred.fightId,
                        winner: pred.winner,
                        winnerName: pred.winnerName,
                        method: pred.method,
                        round: pred.round,
                        confidence: pred.confidence,
                        confidenceTier: pred.confidenceTier,
                        isVolatile: pred.isVolatile,
                        primarySource: pred.primarySource,
                        dataSources: pred.dataSources || [],
                        reasoning: pred.reasoning,
                        createdAt: new Date().toISOString()
                    };

                    store.add(prediction);
                    savedPredictions.push(prediction);
                }

                transaction.oncomplete = () => {
                    console.log('[Storage] SAVED', savedPredictions.length, 'predictions for event:', eventId);
                    resolve(savedPredictions);
                };
                transaction.onerror = () => {
                    console.error('[Storage] Failed to save predictions:', transaction.error);
                    reject(transaction.error);
                };
            };

            existingRequest.onerror = () => reject(existingRequest.error);
        });
    }

    /**
     * Get predictions for an event
     */
    async getPredictionsByEvent(eventId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['predictions'], 'readonly');
            const store = transaction.objectStore('predictions');
            const index = store.index('eventId');
            const request = index.getAll(eventId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get prediction for a specific fight
     */
    async getPredictionByFight(fightId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['predictions'], 'readonly');
            const store = transaction.objectStore('predictions');
            const index = store.index('fightId');
            const request = index.get(fightId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete predictions for an event
     */
    async deletePredictionsByEvent(eventId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['predictions'], 'readwrite');
            const store = transaction.objectStore('predictions');
            const index = store.index('eventId');
            const request = index.getAllKeys(eventId);

            request.onsuccess = () => {
                for (const key of request.result) {
                    store.delete(key);
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== RESULTS ====================

    /**
     * Save result for a fight
     */
    async saveResult(resultData) {
        const result = {
            id: this.generateId(),
            eventId: resultData.eventId,
            fightId: resultData.fightId,
            winner: resultData.winner, // 'fighterA', 'fighterB', or 'draw'
            winnerName: resultData.winnerName,
            method: resultData.method, // 'KO', 'SUB', 'DEC', 'DRAW', 'NC'
            round: resultData.round,
            createdAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['results'], 'readwrite');
            const store = transaction.objectStore('results');

            // Check if result already exists for this fight
            const index = store.index('fightId');
            const checkRequest = index.get(resultData.fightId);

            checkRequest.onsuccess = () => {
                if (checkRequest.result) {
                    // Update existing result
                    const existingResult = { ...checkRequest.result, ...result, id: checkRequest.result.id };
                    const updateRequest = store.put(existingResult);
                    updateRequest.onsuccess = () => {
                        console.log('[Storage] Result UPDATED:', existingResult.winnerName, 'by', existingResult.method);
                        resolve(existingResult);
                    };
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    // Add new result
                    const addRequest = store.add(result);
                    addRequest.onsuccess = () => {
                        console.log('[Storage] Result SAVED:', result.winnerName, 'by', result.method);
                        resolve(result);
                    };
                    addRequest.onerror = () => reject(addRequest.error);
                }
            };

            checkRequest.onerror = () => reject(checkRequest.error);
        });
    }

    /**
     * Get all results for an event
     */
    async getResultsByEvent(eventId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['results'], 'readonly');
            const store = transaction.objectStore('results');
            const index = store.index('eventId');
            const request = index.getAll(eventId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get result for a specific fight
     */
    async getResultByFight(fightId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['results'], 'readonly');
            const store = transaction.objectStore('results');
            const index = store.index('fightId');
            const request = index.get(fightId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete results for an event
     */
    async deleteResultsByEvent(eventId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['results'], 'readwrite');
            const store = transaction.objectStore('results');
            const index = store.index('eventId');
            const request = index.getAllKeys(eventId);

            request.onsuccess = () => {
                for (const key of request.result) {
                    store.delete(key);
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== ACCURACY HISTORY ====================

    /**
     * Save accuracy record for an event
     */
    async saveAccuracyRecord(record) {
        const accuracyRecord = {
            id: this.generateId(),
            eventId: record.eventId,
            eventName: record.eventName,
            eventDate: record.eventDate,
            eventType: record.eventType,
            totalFights: record.totalFights,
            winnerCorrect: record.winnerCorrect,
            methodCorrect: record.methodCorrect,
            roundCorrect: record.roundCorrect,
            byWeightClass: record.byWeightClass,
            bySource: record.bySource,
            byVolatility: record.byVolatility,
            fightDetails: record.fightDetails,
            timestamp: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['accuracyHistory'], 'readwrite');
            const store = transaction.objectStore('accuracyHistory');

            // Check if record already exists for this event
            const index = store.index('eventId');
            const checkRequest = index.get(record.eventId);

            checkRequest.onsuccess = () => {
                if (checkRequest.result) {
                    // Update existing record
                    const existingRecord = { ...checkRequest.result, ...accuracyRecord, id: checkRequest.result.id };
                    const updateRequest = store.put(existingRecord);
                    updateRequest.onsuccess = () => {
                        console.log('[Storage] Accuracy record UPDATED for:', existingRecord.eventName);
                        resolve(existingRecord);
                    };
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    // Add new record
                    const addRequest = store.add(accuracyRecord);
                    addRequest.onsuccess = () => {
                        console.log('[Storage] Accuracy record SAVED for:', accuracyRecord.eventName, '| Winner:', accuracyRecord.winnerCorrect + '/' + accuracyRecord.totalFights);
                        resolve(accuracyRecord);
                    };
                    addRequest.onerror = () => reject(addRequest.error);
                }
            };

            checkRequest.onerror = () => reject(checkRequest.error);
        });
    }

    /**
     * Get all accuracy records
     */
    async getAllAccuracyRecords() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['accuracyHistory'], 'readonly');
            const store = transaction.objectStore('accuracyHistory');
            const request = store.getAll();

            request.onsuccess = () => {
                const records = request.result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                resolve(records);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get accuracy record for a specific event
     */
    async getAccuracyByEvent(eventId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['accuracyHistory'], 'readonly');
            const store = transaction.objectStore('accuracyHistory');
            const index = store.index('eventId');
            const request = index.get(eventId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get events with results (for analysis requirements)
     */
    async getEventsWithResults() {
        const events = await this.getAllEvents();
        return events.filter(e => e.status === 'results-entered');
    }

    // ==================== FIGHTERS ====================

    /**
     * Normalize fighter name for consistent lookup
     */
    normalizeFighterName(name) {
        return name.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Get or create a fighter by name
     */
    async getOrCreateFighter(fighterName) {
        const normalizedName = this.normalizeFighterName(fighterName);

        // Try to find existing fighter
        const existing = await this.getFighterByNormalizedName(normalizedName);
        if (existing) {
            return existing;
        }

        // Create new fighter
        const fighter = {
            id: this.generateId(),
            name: fighterName,
            normalizedName: normalizedName,
            record: null,
            weightClass: null,
            country: null,
            gym: null,
            tapologyUrl: null,
            ufcStatsUrl: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fighters'], 'readwrite');
            const store = transaction.objectStore('fighters');
            const request = store.add(fighter);

            request.onsuccess = () => resolve(fighter);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get fighter by normalized name
     */
    async getFighterByNormalizedName(normalizedName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fighters'], 'readonly');
            const store = transaction.objectStore('fighters');
            const index = store.index('normalizedName');
            const request = index.get(normalizedName);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get fighter by ID
     */
    async getFighter(fighterId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fighters'], 'readonly');
            const store = transaction.objectStore('fighters');
            const request = store.get(fighterId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Update fighter data
     */
    async updateFighter(fighterId, updates) {
        const fighter = await this.getFighter(fighterId);
        if (!fighter) throw new Error('Fighter not found');

        const updatedFighter = {
            ...fighter,
            ...updates,
            updatedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fighters'], 'readwrite');
            const store = transaction.objectStore('fighters');
            const request = store.put(updatedFighter);

            request.onsuccess = () => resolve(updatedFighter);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all fighters
     */
    async getAllFighters() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fighters'], 'readonly');
            const store = transaction.objectStore('fighters');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Search fighters by name
     */
    async searchFighters(query) {
        const fighters = await this.getAllFighters();
        const normalizedQuery = this.normalizeFighterName(query);

        return fighters.filter(f =>
            f.normalizedName.includes(normalizedQuery) ||
            f.name.toLowerCase().includes(query.toLowerCase())
        );
    }

    // ==================== FIGHTER EVENT HISTORY ====================

    /**
     * Save fighter data for a specific event
     */
    async saveFighterEventData(fighterId, eventId, eventData) {
        const record = {
            id: this.generateId(),
            fighterId,
            eventId,
            // Tapology data
            tapologyConsensus: eventData.tapologyConsensus || null,
            tapologyKoTko: eventData.tapologyKoTko || null,
            tapologySub: eventData.tapologySub || null,
            tapologyDec: eventData.tapologyDec || null,
            // DRatings data
            dratingsWinPct: eventData.dratingsWinPct || null,
            // FightMatrix data
            fightMatrixCirrs: eventData.fightMatrixCirrs || null,
            fightMatrixPrediction: eventData.fightMatrixPrediction || null,
            // UFC Stats snapshot
            ufcStatsSlpm: eventData.ufcStatsSlpm || null,
            ufcStatsTdAvg: eventData.ufcStatsTdAvg || null,
            ufcStatsSubAvg: eventData.ufcStatsSubAvg || null,
            ufcStatsCtrlTime: eventData.ufcStatsCtrlTime || null,
            // Record at time of fight
            recordAtFight: eventData.recordAtFight || null,
            // Prediction outcome (filled after event)
            wasOurPick: eventData.wasOurPick || null,
            actualResult: eventData.actualResult || null,
            // Timestamps
            fetchedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fighterEventHistory'], 'readwrite');
            const store = transaction.objectStore('fighterEventHistory');

            // Check if record exists
            const index = store.index('fighterEvent');
            const checkRequest = index.get([fighterId, eventId]);

            checkRequest.onsuccess = () => {
                if (checkRequest.result) {
                    // Update existing
                    const existing = checkRequest.result;
                    const updated = { ...existing, ...record, id: existing.id };
                    const updateRequest = store.put(updated);
                    updateRequest.onsuccess = () => resolve(updated);
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    // Add new
                    const addRequest = store.add(record);
                    addRequest.onsuccess = () => resolve(record);
                    addRequest.onerror = () => reject(addRequest.error);
                }
            };

            checkRequest.onerror = () => reject(checkRequest.error);
        });
    }

    /**
     * Get fighter event data
     */
    async getFighterEventData(fighterId, eventId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fighterEventHistory'], 'readonly');
            const store = transaction.objectStore('fighterEventHistory');
            const index = store.index('fighterEvent');
            const request = index.get([fighterId, eventId]);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all event history for a fighter
     */
    async getFighterHistory(fighterId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fighterEventHistory'], 'readonly');
            const store = transaction.objectStore('fighterEventHistory');
            const index = store.index('fighterId');
            const request = index.getAll(fighterId);

            request.onsuccess = () => {
                const records = request.result.sort((a, b) =>
                    new Date(b.fetchedAt) - new Date(a.fetchedAt)
                );
                resolve(records);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get prediction accuracy for a specific fighter
     */
    async getFighterPredictionAccuracy(fighterId) {
        const history = await this.getFighterHistory(fighterId);
        const withResults = history.filter(h => h.actualResult !== null);

        if (withResults.length === 0) {
            return { total: 0, correct: 0, accuracy: null };
        }

        const correct = withResults.filter(h => h.wasOurPick && h.actualResult === 'win').length;
        const pickedAndLost = withResults.filter(h => h.wasOurPick && h.actualResult === 'loss').length;
        const notPickedAndWon = withResults.filter(h => !h.wasOurPick && h.actualResult === 'win').length;

        const totalPicks = correct + pickedAndLost;

        return {
            total: withResults.length,
            totalPicks,
            correct,
            accuracy: totalPicks > 0 ? (correct / totalPicks * 100).toFixed(1) : null,
            record: `${correct}-${pickedAndLost}`
        };
    }

    // ==================== CONFIDENCE RANKINGS ====================

    /**
     * Save confidence ranking for an event
     */
    async saveConfidenceRanking(rankingData) {
        const ranking = {
            id: this.generateId(),
            eventId: rankingData.eventId,
            eventName: rankingData.eventName,
            eventDate: rankingData.eventDate,
            totalFights: rankingData.totalFights,
            rankings: rankingData.rankings,
            generatedAt: rankingData.generatedAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['confidenceRankings'], 'readwrite');
            const store = transaction.objectStore('confidenceRankings');

            // Check if ranking already exists for this event
            const index = store.index('eventId');
            const checkRequest = index.get(rankingData.eventId);

            checkRequest.onsuccess = () => {
                if (checkRequest.result) {
                    // Update existing ranking
                    const existingRanking = { ...checkRequest.result, ...ranking, id: checkRequest.result.id };
                    const updateRequest = store.put(existingRanking);
                    updateRequest.onsuccess = () => {
                        console.log('[Storage] Confidence ranking UPDATED for:', existingRanking.eventName);
                        resolve(existingRanking);
                    };
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    // Add new ranking
                    const addRequest = store.add(ranking);
                    addRequest.onsuccess = () => {
                        console.log('[Storage] Confidence ranking SAVED for:', ranking.eventName, '| Fights:', ranking.totalFights);
                        resolve(ranking);
                    };
                    addRequest.onerror = () => reject(addRequest.error);
                }
            };

            checkRequest.onerror = () => reject(checkRequest.error);
        });
    }

    /**
     * Get confidence ranking for a specific event
     */
    async getConfidenceRanking(eventId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['confidenceRankings'], 'readonly');
            const store = transaction.objectStore('confidenceRankings');
            const index = store.index('eventId');
            const request = index.get(eventId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all confidence rankings
     */
    async getAllConfidenceRankings() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['confidenceRankings'], 'readonly');
            const store = transaction.objectStore('confidenceRankings');
            const request = store.getAll();

            request.onsuccess = () => {
                const rankings = request.result.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
                resolve(rankings);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete confidence ranking for an event
     */
    async deleteConfidenceRanking(eventId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['confidenceRankings'], 'readwrite');
            const store = transaction.objectStore('confidenceRankings');
            const index = store.index('eventId');
            const request = index.getKey(eventId);

            request.onsuccess = () => {
                if (request.result) {
                    store.delete(request.result);
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== DEBUG METHODS ====================

    /**
     * Dump all database contents to console for debugging
     * Call this from browser console: storage.debugDumpDatabase()
     */
    async debugDumpDatabase() {
        console.log('\n========== DATABASE DUMP ==========');
        console.log('Timestamp:', new Date().toISOString());
        console.log('');

        try {
            // Get all events
            const events = await this.getAllEvents();
            console.log(`EVENTS (${events.length}):`);
            console.table(events.map(e => ({
                id: e.id.substring(0, 8) + '...',
                name: e.name,
                date: e.date,
                type: e.type,
                status: e.status,
                created: e.createdAt?.substring(0, 10)
            })));

            // Get all fights
            let totalFights = 0;
            const allFights = [];
            for (const event of events) {
                const fights = await this.getFightsByEvent(event.id);
                totalFights += fights.length;
                fights.forEach(f => {
                    allFights.push({
                        event: event.name,
                        fighterA: f.fighterA?.name,
                        fighterB: f.fighterB?.name,
                        weightClass: f.weightClass,
                        dataComplete: f.dataComplete,
                        hasTapologyA: f.fighterA?.tapology?.consensus !== null && f.fighterA?.tapology?.consensus !== undefined,
                        hasDRatingsA: f.fighterA?.dratings?.winPct !== null && f.fighterA?.dratings?.winPct !== undefined
                    });
                });
            }
            console.log(`\nFIGHTS (${totalFights}):`);
            if (allFights.length > 0) {
                console.table(allFights);
            } else {
                console.log('  (no fights)');
            }

            // Get all predictions
            let totalPredictions = 0;
            const allPredictions = [];
            for (const event of events) {
                const predictions = await this.getPredictionsByEvent(event.id);
                totalPredictions += predictions.length;
                predictions.forEach(p => {
                    allPredictions.push({
                        event: event.name,
                        winner: p.winnerName,
                        method: p.method,
                        round: p.round,
                        confidence: p.confidence,
                        source: p.primarySource
                    });
                });
            }
            console.log(`\nPREDICTIONS (${totalPredictions}):`);
            if (allPredictions.length > 0) {
                console.table(allPredictions);
            } else {
                console.log('  (no predictions)');
            }

            // Get all results
            let totalResults = 0;
            const allResults = [];
            for (const event of events) {
                const results = await this.getResultsByEvent(event.id);
                totalResults += results.length;
                results.forEach(r => {
                    allResults.push({
                        event: event.name,
                        winner: r.winnerName,
                        method: r.method,
                        round: r.round
                    });
                });
            }
            console.log(`\nRESULTS (${totalResults}):`);
            if (allResults.length > 0) {
                console.table(allResults);
            } else {
                console.log('  (no results)');
            }

            // Get accuracy records
            const accuracyRecords = await this.getAllAccuracyRecords();
            console.log(`\nACCURACY HISTORY (${accuracyRecords.length}):`);
            if (accuracyRecords.length > 0) {
                console.table(accuracyRecords.map(a => ({
                    event: a.eventName,
                    fights: a.totalFights,
                    winnerCorrect: a.winnerCorrect,
                    methodCorrect: a.methodCorrect,
                    winnerPct: a.totalFights > 0 ? ((a.winnerCorrect / a.totalFights) * 100).toFixed(1) + '%' : 'N/A'
                })));
            } else {
                console.log('  (no accuracy records)');
            }

            console.log('\n========== END DUMP ==========\n');

            // Return summary object
            return {
                events: events.length,
                fights: totalFights,
                predictions: totalPredictions,
                results: totalResults,
                accuracyRecords: accuracyRecords.length,
                data: { events, allFights, allPredictions, allResults, accuracyRecords }
            };
        } catch (error) {
            console.error('[Storage] Debug dump failed:', error);
            return { error: error.message };
        }
    }

    /**
     * Get database statistics summary
     */
    async getDbStats() {
        const events = await this.getAllEvents();
        let fights = 0, predictions = 0, results = 0;

        for (const event of events) {
            fights += (await this.getFightsByEvent(event.id)).length;
            predictions += (await this.getPredictionsByEvent(event.id)).length;
            results += (await this.getResultsByEvent(event.id)).length;
        }

        const accuracy = await this.getAllAccuracyRecords();

        return {
            events: events.length,
            fights,
            predictions,
            results,
            accuracyRecords: accuracy.length
        };
    }

    // ==================== EXPORT/IMPORT ====================

    /**
     * Export all data to a downloadable JSON file
     */
    async exportToJSON() {
        const data = await this.debugDumpDatabase();
        const exportData = {
            exportedAt: new Date().toISOString(),
            version: DB_VERSION,
            ...data.data
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ufc-predictor-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('[Storage] Exported data to JSON file');
        return exportData;
    }

    /**
     * Save data to local Python server (auto-saves to project folder)
     * Requires running: python save_server.py
     */
    async saveToServer(filename = null) {
        const data = await this.debugDumpDatabase();
        const exportData = {
            exportedAt: new Date().toISOString(),
            version: DB_VERSION,
            ...data.data
        };

        if (!filename) {
            filename = `ufc-predictor-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        }

        try {
            const response = await fetch('http://localhost:5555/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, data: exportData })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('[Storage] Saved to server:', result.path);
                return result;
            } else {
                throw new Error('Server returned ' + response.status);
            }
        } catch (error) {
            console.error('[Storage] Failed to save to server:', error.message);
            console.log('[Storage] Make sure save_server.py is running: python save_server.py');
            throw error;
        }
    }

    // ==================== FILE SYSTEM ACCESS ====================

    /**
     * Let user pick a folder for auto-saving (one-time setup)
     * Uses File System Access API - stores directory handle for future saves
     */
    async pickSaveFolder() {
        if (!('showDirectoryPicker' in window)) {
            console.error('[Storage] File System Access API not supported in this browser');
            alert('Your browser does not support direct folder access. Use Chrome for this feature.');
            return null;
        }

        try {
            const dirHandle = await window.showDirectoryPicker({
                id: 'ufc-predictor-results',
                mode: 'readwrite',
                startIn: 'documents'
            });

            // Store the handle in IndexedDB for future use
            await this.storeDirHandle(dirHandle);
            console.log('[Storage] Save folder set to:', dirHandle.name);
            return dirHandle;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('[Storage] Folder selection cancelled');
            } else {
                console.error('[Storage] Error picking folder:', error);
            }
            return null;
        }
    }

    /**
     * Store directory handle in IndexedDB
     */
    async storeDirHandle(dirHandle) {
        // Check if settings store exists
        if (!this.db.objectStoreNames.contains('settings')) {
            console.error('[Storage] Settings store not found. Please refresh the page.');
            return;
        }
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('settings', 'readwrite');
            const store = tx.objectStore('settings');
            store.put({ key: 'saveFolderHandle', value: dirHandle });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Get stored directory handle from IndexedDB
     */
    async getDirHandle() {
        // Check if settings store exists (might not on older DB versions)
        if (!this.db.objectStoreNames.contains('settings')) {
            return null;
        }
        return new Promise((resolve) => {
            const tx = this.db.transaction('settings', 'readonly');
            const store = tx.objectStore('settings');
            const request = store.get('saveFolderHandle');
            request.onsuccess = () => resolve(request.result?.value || null);
            request.onerror = () => resolve(null);
        });
    }

    /**
     * Save directly to the selected folder
     */
    async saveToFolder() {
        let dirHandle = await this.getDirHandle();

        // If no folder selected yet, prompt user to pick one
        if (!dirHandle) {
            console.log('[Storage] No save folder configured, prompting user...');
            dirHandle = await this.pickSaveFolder();
            if (!dirHandle) return null;
        }

        // Verify we still have permission
        const permission = await dirHandle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            const newPermission = await dirHandle.requestPermission({ mode: 'readwrite' });
            if (newPermission !== 'granted') {
                console.error('[Storage] Permission denied for folder');
                return null;
            }
        }

        // Get export data
        const data = await this.debugDumpDatabase();
        const exportData = {
            exportedAt: new Date().toISOString(),
            version: DB_VERSION,
            ...data.data
        };

        // Create filename with timestamp
        const filename = `ufc-predictor-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

        try {
            const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(exportData, null, 2));
            await writable.close();

            console.log('[Storage] Saved to folder:', filename);
            return { success: true, filename };
        } catch (error) {
            console.error('[Storage] Error saving to folder:', error);
            throw error;
        }
    }

    /**
     * Auto-save after results are entered
     * Tries folder first, then server, then falls back to download
     */
    async autoSave() {
        // Try saving to selected folder first
        try {
            const dirHandle = await this.getDirHandle();
            if (dirHandle) {
                await this.saveToFolder();
                return;
            }
        } catch (error) {
            console.log('[Storage] Folder save failed:', error.message);
        }

        // Try server next
        try {
            await this.saveToServer();
            return;
        } catch (error) {
            console.log('[Storage] Server not available');
        }

        // Fall back to direct download
        console.log('[Storage] Falling back to download...');
        await this.exportToJSON();
    }
    /**
     * Import data from JSON export (Smart Restore)
     * Reconstructs database from summary/raw mixed backup format
     */
    async importJSON(data) {
        console.log('[Storage] Starting smart import...');

        // 1. Clear existing data to avoid conflicts
        await this.clearDatabase();

        // 2. Restore Events (Raw data)
        const eventMap = new Map(); // Name -> ID
        if (data.events && Array.isArray(data.events)) {
            for (const event of data.events) {
                // Ensure ID exists
                if (!event.id) event.id = this.generateId();

                // Direct save to preserve ID
                await this.saveEventDirect(event);
                eventMap.set(event.name, event.id);
            }
            console.log(`[Storage] Restored ${data.events.length} events`);
        }

        // 3. Restore Fights (Summary data) - Reconstruct objects
        const fightMap = new Map(); // EventID+FighterName -> FightID
        if (data.allFights && Array.isArray(data.allFights)) {
            let restoredFights = 0;
            for (const f of data.allFights) {
                const eventId = eventMap.get(f.event);
                if (!eventId) {
                    console.warn('[Storage] Skipping fight for unknown event:', f.event);
                    continue;
                }

                // Reconstruct fight object
                const fight = {
                    id: this.generateId(),
                    eventId: eventId,
                    weightClass: f.weightClass || 'Unknown',
                    numRounds: 3, // Default
                    isMainEvent: false, // Default
                    fighterA: {
                        name: f.fighterA,
                        tapology: { consensus: null },
                        dratings: { winPct: null }
                    },
                    fighterB: {
                        name: f.fighterB,
                        tapology: { consensus: null },
                        dratings: { winPct: null }
                    },
                    dataComplete: f.dataComplete || false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                await this.saveFightDirect(fight);

                // Map both fighters to this fight ID for prediction/result matching
                fightMap.set(`${eventId}|${this.normalizeFighterName(f.fighterA)}`, fight.id);
                fightMap.set(`${eventId}|${this.normalizeFighterName(f.fighterB)}`, fight.id);

                restoredFights++;
            }
            console.log(`[Storage] Restored ${restoredFights} fights`);
        }

        // 4. Restore Predictions (Summary data)
        if (data.allPredictions && Array.isArray(data.allPredictions)) {
            let restoredPreds = 0;
            for (const p of data.allPredictions) {
                const eventId = eventMap.get(p.event);
                if (!eventId) continue;

                // Find fight by looking up the winner name
                const fightId = fightMap.get(`${eventId}|${this.normalizeFighterName(p.winner)}`);

                if (fightId) {
                    const prediction = {
                        id: this.generateId(),
                        eventId: eventId,
                        fightId: fightId,
                        winner: 'unknown',
                        winnerName: p.winner,
                        method: p.method,
                        round: p.round,
                        confidence: p.confidence,
                        primarySource: p.source,
                        createdAt: new Date().toISOString()
                    };

                    await this.savePredictionDirect(prediction);
                    restoredPreds++;
                }
            }
            console.log(`[Storage] Restored ${restoredPreds} predictions`);
        }

        // 5. Restore Results (Summary data)
        if (data.allResults && Array.isArray(data.allResults)) {
            let restoredResults = 0;
            for (const r of data.allResults) {
                const eventId = eventMap.get(r.event);
                if (!eventId) continue;

                const fightId = fightMap.get(`${eventId}|${this.normalizeFighterName(r.winner)}`);

                if (fightId) {
                    const result = {
                        id: this.generateId(),
                        eventId: eventId,
                        fightId: fightId,
                        winnerName: r.winner,
                        method: r.method,
                        round: r.round,
                        createdAt: new Date().toISOString()
                    };
                    await this.saveResult(result);
                    restoredResults++;
                }
            }
            console.log(`[Storage] Restored ${restoredResults} results`);
        }

        // 6. Restore Accuracy Records (Raw data)
        if (data.accuracyRecords && Array.isArray(data.accuracyRecords)) {
            for (const rec of data.accuracyRecords) {
                if (!rec.id) rec.id = this.generateId();
                await this.saveAccuracyRecordDirect(rec);
            }
            console.log(`[Storage] Restored ${data.accuracyRecords.length} accuracy records`);
        }

        return true;
    }

    /**
     * Helper: Clear entire database
     */
    async clearDatabase() {
        const stores = ['events', 'fights', 'predictions', 'results', 'accuracyHistory', 'fighters', 'confidenceRankings'];
        const tx = this.db.transaction(stores, 'readwrite');
        const promises = stores.map(storeName => {
            return new Promise((resolve, reject) => {
                const store = tx.objectStore(storeName);
                const req = store.clear();
                req.onsuccess = resolve;
                req.onerror = reject;
            });
        });
        await Promise.all(promises);
        console.log('[Storage] Database cleared');
    }

    async saveEventDirect(event) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['events'], 'readwrite');
            tx.objectStore('events').put(event);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async saveFightDirect(fight) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['fights'], 'readwrite');
            tx.objectStore('fights').add(fight);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async savePredictionDirect(prediction) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['predictions'], 'readwrite');
            tx.objectStore('predictions').add(prediction);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async saveAccuracyRecordDirect(record) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['accuracyHistory'], 'readwrite');
            tx.objectStore('accuracyHistory').put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }
}

// Export singleton instance
const storage = new Storage();
