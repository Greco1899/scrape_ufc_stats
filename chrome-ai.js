/**
 * Chrome Built-in AI Integration
 * Uses Chrome's Prompt API (Gemini Nano on-device) and Summarizer API
 * for AI-generated fight analysis and MMA news context
 */

class ChromeAI {
    constructor() {
        this.promptAvailable = false;
        this.summarizerAvailable = false;
        this.session = null;
        this.summarizer = null;
        this.enabled = true;
        this.newsSourcesEnabled = true;

        // MMA news sources for pre-fight context
        this.newsSources = [
            { id: 'mmajunkie', name: 'MMA Junkie', searchUrl: (q) => `https://mmajunkie.usatoday.com/tag/${q.toLowerCase().replace(/\s+/g, '-')}` },
            { id: 'mmafighting', name: 'MMA Fighting', searchUrl: (q) => `https://www.mmafighting.com/search?q=${encodeURIComponent(q)}` },
            { id: 'espnmma', name: 'ESPN MMA', searchUrl: (q) => `https://www.espn.com/search/_/q/${encodeURIComponent(q)}/type/stories/sport/mma` },
            { id: 'sherdog', name: 'Sherdog', searchUrl: (q) => `https://www.sherdog.com/news/search?q=${encodeURIComponent(q)}` },
        ];

        this.loadSettings();
    }

    // ── Settings ──────────────────────────────────────────────────

    loadSettings() {
        this.enabled = localStorage.getItem('chromeAIEnabled') !== 'false';
        this.newsSourcesEnabled = localStorage.getItem('chromeAINewsEnabled') !== 'false';

        try {
            const sources = JSON.parse(localStorage.getItem('chromeAINewsSources') || '{}');
            this.enabledSources = sources;
        } catch {
            this.enabledSources = {};
        }
    }

    saveSettings() {
        localStorage.setItem('chromeAIEnabled', this.enabled);
        localStorage.setItem('chromeAINewsEnabled', this.newsSourcesEnabled);
        localStorage.setItem('chromeAINewsSources', JSON.stringify(this.enabledSources));
    }

    isSourceEnabled(sourceId) {
        return this.enabledSources[sourceId] !== false; // default true
    }

    // ── Feature Detection ─────────────────────────────────────────

    async checkAvailability() {
        // Check Prompt API (LanguageModel)
        try {
            if ('LanguageModel' in self) {
                const availability = await LanguageModel.availability();
                this.promptAvailable = (availability === 'available' || availability === 'downloadable');
            }
        } catch (e) {
            console.warn('[ChromeAI] Prompt API not available:', e.message);
            this.promptAvailable = false;
        }

        // Check Summarizer API
        try {
            if ('Summarizer' in self) {
                const availability = await Summarizer.availability();
                this.summarizerAvailable = (availability === 'available' || availability === 'downloadable');
            }
        } catch (e) {
            console.warn('[ChromeAI] Summarizer API not available:', e.message);
            this.summarizerAvailable = false;
        }

        console.log(`[ChromeAI] Prompt API: ${this.promptAvailable}, Summarizer: ${this.summarizerAvailable}`);
        return {
            prompt: this.promptAvailable,
            summarizer: this.summarizerAvailable,
            anyAvailable: this.promptAvailable || this.summarizerAvailable
        };
    }

    // ── Session Management ────────────────────────────────────────

    async ensureSession() {
        if (!this.promptAvailable || !this.enabled) return null;
        if (this.session) return this.session;

        try {
            this.session = await LanguageModel.create({
                initialPrompts: [{
                    role: 'system',
                    content: 'You are an expert MMA analyst. You provide concise, insightful fight analysis based on statistical data. Keep responses under 200 words. Focus on WHY a prediction makes sense based on stylistic matchups and data trends, not just restating numbers. Be direct and opinionated.'
                }],
                temperature: 0.7,
                topK: 5
            });
            return this.session;
        } catch (e) {
            console.error('[ChromeAI] Failed to create session:', e);
            this.promptAvailable = false;
            return null;
        }
    }

    async ensureSummarizer() {
        if (!this.summarizerAvailable || !this.enabled) return null;
        if (this.summarizer) return this.summarizer;

        try {
            this.summarizer = await Summarizer.create({
                type: 'key-points',
                format: 'plain-text',
                length: 'short',
                sharedContext: 'MMA fight preview articles for UFC events'
            });
            return this.summarizer;
        } catch (e) {
            console.error('[ChromeAI] Failed to create summarizer:', e);
            this.summarizerAvailable = false;
            return null;
        }
    }

    destroy() {
        if (this.session) {
            this.session.destroy();
            this.session = null;
        }
        this.summarizer = null;
    }

    // ── MMA News Fetching ─────────────────────────────────────────

    getLastName(fullName) {
        const parts = fullName.trim().split(' ');
        return parts[parts.length - 1];
    }

    async fetchNewsForFight(fighterAName, fighterBName) {
        if (!this.newsSourcesEnabled) return [];

        const searchTerm = `${this.getLastName(fighterAName)} ${this.getLastName(fighterBName)}`;
        const articles = [];

        for (const source of this.newsSources) {
            if (!this.isSourceEnabled(source.id)) continue;

            try {
                const url = source.searchUrl(searchTerm);
                const response = await fetch(
                    `/proxy?url=${encodeURIComponent(url)}`,
                    { signal: AbortSignal.timeout(8000) }
                );

                if (!response.ok) continue;

                const html = await response.text();
                const text = this.extractArticleText(html, source.id);

                if (text && text.length > 200) {
                    articles.push({
                        source: source.name,
                        text: text.substring(0, 3000)
                    });
                }
            } catch (e) {
                console.warn(`[ChromeAI] Failed to fetch from ${source.name}:`, e.message);
            }
        }

        return articles;
    }

    extractArticleText(html, sourceId) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Remove noise
        doc.querySelectorAll('script, style, nav, footer, header, aside, .ad, .sidebar, .social-share, .comments').forEach(el => el.remove());

        // Source-specific selectors
        const selectors = {
            mmajunkie: 'article, .article-body, .gnt_ar_b',
            mmafighting: 'article, .c-entry-content, .article-body',
            espnmma: 'article, .article-body, .story-body',
            sherdog: 'article, .article_detail, .body_content'
        };

        const selector = selectors[sourceId] || 'article, main, .content';
        const contentEl = doc.querySelector(selector);

        if (contentEl) {
            return contentEl.textContent.replace(/\s+/g, ' ').trim();
        }

        // Fallback: get paragraph text
        const paragraphs = doc.querySelectorAll('p');
        return Array.from(paragraphs)
            .map(p => p.textContent.trim())
            .filter(t => t.length > 50)
            .slice(0, 10)
            .join(' ');
    }

    // ── News Summarization ────────────────────────────────────────

    async summarizeNewsForFight(articles) {
        if (articles.length === 0) return null;

        const summarizer = await this.ensureSummarizer();
        const combinedText = articles
            .map(a => `[${a.source}]: ${a.text}`)
            .join('\n\n');

        if (!summarizer) {
            // Fallback: return truncated raw text
            return combinedText.substring(0, 500);
        }

        try {
            const summary = await summarizer.summarize(combinedText, {
                context: 'Pre-fight analysis and news for an upcoming UFC fight'
            });
            return summary;
        } catch (e) {
            console.warn('[ChromeAI] Summarization failed:', e.message);
            return combinedText.substring(0, 500);
        }
    }

    // ── Prompt Building ───────────────────────────────────────────

    buildAnalysisPrompt(fight, prediction, newsSummary) {
        const fighterA = fight.fighterA;
        const fighterB = fight.fighterB;
        const winner = prediction.winnerName;

        // Compact stats block
        let stats = `Fight: ${fighterA.name} vs ${fighterB.name} (${fight.weightClass})
Pick: ${winner} by ${prediction.method}${prediction.round !== 'DEC' ? ` in ${prediction.round}` : ''}
Confidence: ${prediction.confidence.toFixed(1)}% (${prediction.confidenceTier})`;

        // Tapology consensus
        const aT = fighterA.tapology?.consensus;
        const bT = fighterB.tapology?.consensus;
        if (aT && bT) stats += `\nTapology: ${fighterA.name} ${aT}% / ${fighterB.name} ${bT}%`;

        // DRatings
        const aD = fighterA.dratings?.winPct;
        const bD = fighterB.dratings?.winPct;
        if (aD && bD) stats += `\nDRatings: ${fighterA.name} ${aD}% / ${fighterB.name} ${bD}%`;

        // Betting odds
        const aBet = fighterA.fightmatrix?.bettingWinPct;
        const bBet = fighterB.fightmatrix?.bettingWinPct;
        if (aBet && bBet) stats += `\nBetting: ${fighterA.name} ${aBet}% / ${fighterB.name} ${bBet}%`;

        // Method distributions
        const aKO = fighterA.tapology?.koTko;
        const aSub = fighterA.tapology?.sub;
        const aDec = fighterA.tapology?.dec;
        if (aKO || aSub || aDec) {
            stats += `\n${fighterA.name} method: KO ${aKO || '?'}% SUB ${aSub || '?'}% DEC ${aDec || '?'}%`;
        }
        const bKO = fighterB.tapology?.koTko;
        const bSub = fighterB.tapology?.sub;
        const bDec = fighterB.tapology?.dec;
        if (bKO || bSub || bDec) {
            stats += `\n${fighterB.name} method: KO ${bKO || '?'}% SUB ${bSub || '?'}% DEC ${bDec || '?'}%`;
        }

        // Striking rates if available
        const aSlpm = fighterA.ufcStats?.slpm;
        const bSlpm = fighterB.ufcStats?.slpm;
        if (aSlpm && bSlpm) stats += `\nStriking: ${fighterA.name} ${aSlpm} SLpM / ${fighterB.name} ${bSlpm} SLpM`;

        // Volatility
        if (prediction.isVolatile) stats += `\nNOTE: Sources disagree on this fight (volatile)`;

        // Key reasoning results
        const keyReasons = [
            ...prediction.reasoning.winner.filter(r => r.type === 'result'),
            ...prediction.reasoning.method.filter(r => r.type === 'result'),
        ].map(r => r.text).slice(0, 3);
        if (keyReasons.length > 0) stats += `\nModel reasoning: ${keyReasons.join('; ')}`;

        let prompt = `Analyze this UFC fight prediction in 2-3 short paragraphs. Explain WHY this pick makes sense based on stylistic matchups and data. Note any risks if it's a close or volatile fight.\n\n${stats}`;

        if (newsSummary) {
            prompt += `\n\nRecent news/analysis:\n${newsSummary}`;
        }

        return prompt;
    }

    // ── Analysis Generation ───────────────────────────────────────

    async generateFightAnalysis(fight, prediction, options = {}) {
        const session = await this.ensureSession();
        if (!session) return null;

        try {
            // Fetch and summarize news if enabled
            let newsSummary = null;
            if (this.newsSourcesEnabled && options.includeNews !== false) {
                const articles = await this.fetchNewsForFight(
                    fight.fighterA.name,
                    fight.fighterB.name
                );
                if (articles.length > 0) {
                    newsSummary = await this.summarizeNewsForFight(articles);
                }
            }

            const prompt = this.buildAnalysisPrompt(fight, prediction, newsSummary);

            // Use streaming for responsive UI
            let fullResponse = '';
            if (session.promptStreaming) {
                const stream = session.promptStreaming(prompt);
                for await (const chunk of stream) {
                    fullResponse = chunk; // Prompt API streams full accumulated text
                    options.onChunk?.(fullResponse);
                }
            } else {
                fullResponse = await session.prompt(prompt);
            }

            return {
                analysis: fullResponse,
                hadNews: newsSummary !== null,
                generatedAt: new Date().toISOString()
            };
        } catch (e) {
            console.error('[ChromeAI] Analysis generation failed:', e);
            // Reset session if it died
            if (e.name === 'InvalidStateError' || e.name === 'NotReadableError') {
                this.session?.destroy();
                this.session = null;
            }
            return null;
        }
    }

    async generateAllAnalyses(fights, predictions, options = {}) {
        const results = new Map();

        for (let i = 0; i < predictions.length; i++) {
            const prediction = predictions[i];
            const fight = fights.find(f => f.id === prediction.fightId);
            if (!fight) continue;

            options.onProgress?.(i + 1, predictions.length, fight);

            const analysis = await this.generateFightAnalysis(fight, prediction, {
                ...options,
                includeNews: i < 5, // Only fetch news for top 5 fights
                onChunk: null // Don't stream individual chunks during batch
            });

            if (analysis) {
                results.set(prediction.fightId, analysis);
            }

            // Small delay between prompts
            if (i < predictions.length - 1) {
                await new Promise(r => setTimeout(r, 300));
            }
        }

        return results;
    }

    // ── Caching (uses IndexedDB settings store) ───────────────────

    async cacheAnalysis(eventId, fightId, analysisResult) {
        const key = `ai-analysis-${eventId}-${fightId}`;
        try {
            const tx = storage.db.transaction('settings', 'readwrite');
            const store = tx.objectStore('settings');
            store.put({ key, value: analysisResult });
            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) {
            console.warn('[ChromeAI] Failed to cache analysis:', e.message);
        }
    }

    async getCachedAnalysis(eventId, fightId) {
        const key = `ai-analysis-${eventId}-${fightId}`;
        try {
            const tx = storage.db.transaction('settings', 'readonly');
            const store = tx.objectStore('settings');
            const request = store.get(key);
            return await new Promise((resolve) => {
                request.onsuccess = () => resolve(request.result?.value || null);
                request.onerror = () => resolve(null);
            });
        } catch {
            return null;
        }
    }

    async clearEventAnalysisCache(eventId) {
        try {
            const tx = storage.db.transaction('settings', 'readwrite');
            const store = tx.objectStore('settings');
            const request = store.openCursor();
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    if (typeof cursor.key === 'string' && cursor.key.startsWith(`ai-analysis-${eventId}-`)) {
                        cursor.delete();
                    }
                    cursor.continue();
                }
            };
        } catch (e) {
            console.warn('[ChromeAI] Failed to clear cache:', e.message);
        }
    }
}

// Global singleton
const chromeAI = new ChromeAI();
