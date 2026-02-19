/**
 * UFC Weekly Predictor - Fighter Data Fetcher
 * Automatically fetches fighter statistics from Tapology, DRatings, and FightMatrix
 * Uses Gemini API for reliable extraction when CORS proxy fails
 */

class FighterDataFetcher {
    constructor() {
        // Multiple CORS proxies to try in order of reliability
        this.corsProxies = [
            { name: 'allorigins', url: 'https://api.allorigins.win/raw?url=' },
            { name: 'corsproxy.io', url: 'https://corsproxy.io/?' },
            { name: 'cors-anywhere', url: 'https://cors-anywhere.herokuapp.com/' },
            { name: 'thingproxy', url: 'https://thingproxy.freeboard.io/fetch/' }
        ];
        this.currentProxyIndex = 0;
        this.geminiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/';
        // Models to try in order (1.5-flash often has more free quota)
        this.geminiModels = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-pro'];
        this.sources = {
            tapology: 'https://www.tapology.com',
            dratings: 'https://www.dratings.com',
            fightmatrix: 'https://www.fightmatrix.com'
        };
        this.fetchProgress = {
            current: null,
            total: 0,
            completed: 0,
            errors: []
        };
    }

    /**
     * Get current CORS proxy URL
     */
    get corsProxy() {
        return this.corsProxies[this.currentProxyIndex].url;
    }

    /**
     * Fetch with automatic CORS proxy fallback
     * Tries each proxy until one works
     */
    async fetchWithCorsProxy(targetUrl, options = {}) {
        let lastError = null;

        for (let i = 0; i < this.corsProxies.length; i++) {
            const proxy = this.corsProxies[i];
            const proxyUrl = proxy.url + encodeURIComponent(targetUrl);

            try {
                console.log(`Trying CORS proxy: ${proxy.name}`);
                const response = await fetch(proxyUrl, {
                    ...options,
                    signal: AbortSignal.timeout(15000) // 15 second timeout per proxy
                });

                if (response.ok) {
                    const text = await response.text();
                    // Check if we got actual content (not an error page)
                    if (text && text.length > 100 && !text.includes('403 Forbidden') && !text.includes('Access Denied')) {
                        this.currentProxyIndex = i; // Remember working proxy
                        return { ok: true, text };
                    }
                }
                console.log(`Proxy ${proxy.name} returned invalid response`);
            } catch (error) {
                console.log(`Proxy ${proxy.name} failed:`, error.message);
                lastError = error;
            }
        }

        return { ok: false, error: lastError || new Error('All CORS proxies failed') };
    }

    /**
     * Get Gemini API key from storage
     */
    getGeminiApiKey() {
        return localStorage.getItem('geminiApiKey');
    }

    /**
     * Fetch all data for fights in an event
     * @param {string} eventName - Name of the event (e.g., "UFC 324")
     * @param {string} eventDate - Date of the event
     * @param {Array} fights - Array of fight objects with fighterA and fighterB names
     * @param {Function} progressCallback - Callback for progress updates
     */
    async fetchAllFighterData(eventName, eventDate, fights, progressCallback) {
        this.fetchProgress = {
            current: null,
            total: fights.length * 2,
            completed: 0,
            errors: []
        };

        const results = [];
        let tapologyEventData = null;
        let dratingsEventData = null;
        let fightMatrixData = null;
        let usedGemini = false;

        // First, try traditional CORS proxy methods
        try {
            progressCallback?.({ phase: 'sources', message: 'Fetching Tapology predictions...' });
            tapologyEventData = await this.fetchTapologyEventData(eventName, eventDate);
        } catch (error) {
            console.error('Tapology CORS fetch failed:', error);
        }

        try {
            progressCallback?.({ phase: 'sources', message: 'Fetching DRatings predictions...' });
            dratingsEventData = await this.fetchDRatingsData(eventName, eventDate);
        } catch (error) {
            console.error('DRatings CORS fetch failed:', error);
        }

        try {
            progressCallback?.({ phase: 'sources', message: 'Fetching FightMatrix ratings...' });
            fightMatrixData = await this.fetchFightMatrixData(eventName, eventDate);
        } catch (error) {
            console.error('FightMatrix CORS fetch failed:', error);
        }

        // Fetch UFC Stats directly from ufcstats.com
        let ufcStatsData = null;
        try {
            progressCallback?.({ phase: 'sources', message: 'Fetching UFC Stats career data...' });
            ufcStatsData = await this.fetchAllUfcStats(fights, progressCallback);
        } catch (error) {
            console.error('UFCStats fetch failed:', error);
        }

        // Check if we got any data from CORS methods
        const gotTapology = tapologyEventData && Object.keys(tapologyEventData.fights || {}).length > 0;
        const gotDRatings = dratingsEventData && Object.keys(dratingsEventData.predictions || {}).length > 0;
        const gotFightMatrix = fightMatrixData && Object.keys(fightMatrixData.ratings || {}).length > 0;
        const gotUfcStats = ufcStatsData?.success || false;

        // If CORS methods failed or returned no data, try Gemini
        if (!gotTapology && !gotDRatings && !gotFightMatrix) {
            const apiKey = this.getGeminiApiKey();
            if (apiKey) {
                progressCallback?.({ phase: 'sources', message: 'Using Gemini AI to fetch predictions...' });
                try {
                    const geminiData = await this.fetchWithGemini(eventName, eventDate, fights, apiKey);
                    if (geminiData) {
                        usedGemini = true;
                        // Process Gemini results directly
                        return {
                            success: true,
                            results: geminiData.results,
                            errors: [],
                            sources: {
                                tapology: geminiData.hasTapology,
                                dratings: geminiData.hasDRatings,
                                fightMatrix: geminiData.hasFightMatrix,
                                ufcStats: geminiData.hasUfcStats,
                                gemini: true
                            }
                        };
                    }
                } catch (error) {
                    console.error('Gemini fetch failed:', error);
                    this.fetchProgress.errors.push({ source: 'Gemini', error: error.message });
                }
            } else {
                this.fetchProgress.errors.push({
                    source: 'All',
                    error: 'CORS fetch failed and no Gemini API key configured. Add your API key in Settings.'
                });
            }
        }

        // Process each fight with available data
        const ufcStatsMap = ufcStatsData?.statsMap || {};

        for (const fight of fights) {
            const fightResult = {
                fightId: fight.id,
                fighterA: await this.processFighterData(
                    fight.fighterA.name,
                    tapologyEventData,
                    dratingsEventData,
                    fightMatrixData,
                    progressCallback
                ),
                fighterB: await this.processFighterData(
                    fight.fighterB.name,
                    tapologyEventData,
                    dratingsEventData,
                    fightMatrixData,
                    progressCallback
                )
            };

            // Merge UFC Stats if available
            if (ufcStatsMap[fight.fighterA.name]) {
                fightResult.fighterA.ufcStats = this.processUfcStats(ufcStatsMap[fight.fighterA.name]);
            }
            if (ufcStatsMap[fight.fighterB.name]) {
                fightResult.fighterB.ufcStats = this.processUfcStats(ufcStatsMap[fight.fighterB.name]);
            }

            results.push(fightResult);
        }

        return {
            success: true,
            results,
            errors: this.fetchProgress.errors,
            sources: {
                tapology: gotTapology,
                dratings: gotDRatings,
                fightMatrix: gotFightMatrix,
                ufcStats: gotUfcStats,
                gemini: usedGemini
            }
        };
    }

    /**
     * Use Gemini API to fetch all fighter prediction data
     * Tries multiple models and includes retry logic for rate limits
     */
    async fetchWithGemini(eventName, eventDate, fights, apiKey) {
        const fighterList = fights.map(f => `${f.fighterA.name} vs ${f.fighterB.name}`).join('\n');

        const prompt = `I need comprehensive prediction data for the UFC event "${eventName}" on ${eventDate}.

Here are the fights:
${fighterList}

Search for and provide the following data for EACH fighter:

1. **Tapology** community predictions: Win percentage (e.g., "64%"), KO/TKO %, Submission %, Decision %

2. **DRatings** win probability percentage

3. **FightMatrix** CIRRS rating (a number usually between 1000-2500)

4. **UFCStats** career statistics (from ufcstats.com fighter pages):
   - SLpM: Significant Strikes Landed per Minute (e.g., 5.42)
   - strAcc: Striking Accuracy percentage (e.g., 52)
   - SApM: Significant Strikes Absorbed per Minute (e.g., 3.21)
   - strDef: Striking Defense percentage (e.g., 58)
   - tdAvg: Takedown Average per 15 minutes (e.g., 2.5)
   - tdAcc: Takedown Accuracy percentage (e.g., 45)
   - tdDef: Takedown Defense percentage (e.g., 70)
   - subAvg: Submission Attempts Average per 15 minutes (e.g., 0.4)
   - Career wins breakdown: total wins, wins by KO/TKO, wins by SUB, wins by DEC
   - Career losses breakdown: total losses, losses by KO/TKO, losses by SUB, losses by DEC

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "fights": [
    {
      "fighterA": {
        "name": "Fighter A Name",
        "tapology": { "consensus": 64, "koTko": 25, "sub": 15, "dec": 60 },
        "dratings": { "winPct": 62.5 },
        "fightMatrix": { "cirrs": 1850 },
        "ufcStats": {
          "slpm": 5.42,
          "strAcc": 52,
          "sapm": 3.21,
          "strDef": 58,
          "tdAvg": 2.5,
          "tdAcc": 45,
          "tdDef": 70,
          "subAvg": 0.4,
          "wins": { "total": 20, "ko": 12, "sub": 5, "dec": 3 },
          "losses": { "total": 3, "ko": 1, "sub": 1, "dec": 1 }
        }
      },
      "fighterB": {
        "name": "Fighter B Name",
        "tapology": { "consensus": 36, "koTko": 30, "sub": 20, "dec": 50 },
        "dratings": { "winPct": 37.5 },
        "fightMatrix": { "cirrs": 1720 },
        "ufcStats": {
          "slpm": 4.21,
          "strAcc": 48,
          "sapm": 4.10,
          "strDef": 52,
          "tdAvg": 1.2,
          "tdAcc": 38,
          "tdDef": 65,
          "subAvg": 0.2,
          "wins": { "total": 15, "ko": 8, "sub": 3, "dec": 4 },
          "losses": { "total": 5, "ko": 2, "sub": 1, "dec": 2 }
        }
      }
    }
  ]
}

Use null for any data you cannot find. The consensus percentages for each fight should add up to 100%.
For ufcStats, calculate percentages from the win/loss counts (e.g., koWinPct = ko wins / total wins * 100).`;

        // Try each model in order
        let lastError = null;
        for (const model of this.geminiModels) {
            try {
                console.log(`Trying Gemini model: ${model}`);
                const result = await this.callGeminiModel(model, prompt, apiKey, fights);
                if (result) {
                    console.log(`Success with model: ${model}`);
                    return result;
                }
            } catch (error) {
                console.warn(`Model ${model} failed:`, error.message);
                lastError = error;

                // If rate limited, check if we should wait and retry
                if (error.message.includes('429') && error.retryAfter) {
                    console.log(`Rate limited. Waiting ${error.retryAfter}s before trying next model...`);
                    // Don't wait for free tier - just try next model
                }
            }
        }

        // All models failed - provide helpful error message
        if (lastError?.message?.includes('429')) {
            throw new Error('Gemini API quota exceeded. Wait a few minutes or try tomorrow when quota resets.');
        }
        throw lastError || new Error('All Gemini models failed');
    }

    /**
     * Call a specific Gemini model
     */
    async callGeminiModel(model, prompt, apiKey, fights) {
        const endpoint = `${this.geminiBaseUrl}${model}:generateContent?key=${apiKey}`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 4096
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`Gemini API error: ${response.status}`);

            // Parse retry delay if present
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.error?.details) {
                    const retryInfo = errorJson.error.details.find(d => d['@type']?.includes('RetryInfo'));
                    if (retryInfo?.retryDelay) {
                        error.retryAfter = parseInt(retryInfo.retryDelay) || 20;
                    }
                }
                error.message = `Gemini API error: ${response.status} - ${errorJson.error?.message || errorText}`;
            } catch (e) {
                error.message = `Gemini API error: ${response.status} - ${errorText}`;
            }

            throw error;
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            throw new Error('Empty response from Gemini');
        }

        // Extract JSON from response (remove markdown code blocks if present)
        let jsonText = text.trim();
        if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
        }

        const parsed = JSON.parse(jsonText);

        // Map Gemini results to our fight structure
        const results = fights.map((fight, index) => {
            const geminiMatch = parsed.fights?.[index] || {};
            return {
                fightId: fight.id,
                fighterA: {
                    name: fight.fighterA.name,
                    tapology: geminiMatch.fighterA?.tapology || { consensus: null, koTko: null, sub: null, dec: null },
                    dratings: geminiMatch.fighterA?.dratings || { winPct: null },
                    fightMatrix: geminiMatch.fighterA?.fightMatrix || { cirrs: null },
                    ufcStats: this.processUfcStats(geminiMatch.fighterA?.ufcStats)
                },
                fighterB: {
                    name: fight.fighterB.name,
                    tapology: geminiMatch.fighterB?.tapology || { consensus: null, koTko: null, sub: null, dec: null },
                    dratings: geminiMatch.fighterB?.dratings || { winPct: null },
                    fightMatrix: geminiMatch.fighterB?.fightMatrix || { cirrs: null },
                    ufcStats: this.processUfcStats(geminiMatch.fighterB?.ufcStats)
                }
            };
        });

        // Check what data we got
        const sample = results[0];
        const hasTapology = sample?.fighterA?.tapology?.consensus !== null;
        const hasDRatings = sample?.fighterA?.dratings?.winPct !== null;
        const hasFightMatrix = sample?.fighterA?.fightMatrix?.cirrs !== null;
        const hasUfcStats = sample?.fighterA?.ufcStats?.slpm !== null;

        return {
            results,
            hasTapology,
            hasDRatings,
            hasFightMatrix,
            hasUfcStats
        };
    }

    /**
     * Process raw ufcStats data and calculate derived percentages
     * that the prediction engine expects
     */
    processUfcStats(rawStats) {
        if (!rawStats) {
            return {
                slpm: null,
                strAcc: null,
                sapm: null,
                strDef: null,
                tdAvg: null,
                tdAcc: null,
                tdDef: null,
                subAvg: null,
                koWinPct: null,
                subWinPct: null,
                decWinPct: null,
                finishWinPct: null,
                finishLossPct: null,
                ctrlTime: null
            };
        }

        // Extract raw values
        const slpm = rawStats.slpm || null;
        const strAcc = rawStats.strAcc || null;
        const sapm = rawStats.sapm || null;
        const strDef = rawStats.strDef || null;
        const tdAvg = rawStats.tdAvg || null;
        const tdAcc = rawStats.tdAcc || null;
        const tdDef = rawStats.tdDef || null;
        const subAvg = rawStats.subAvg || null;

        // Calculate win method percentages
        const totalWins = rawStats.wins?.total || 0;
        const koWins = rawStats.wins?.ko || 0;
        const subWins = rawStats.wins?.sub || 0;
        const decWins = rawStats.wins?.dec || 0;

        const koWinPct = totalWins > 0 ? (koWins / totalWins) * 100 : null;
        const subWinPct = totalWins > 0 ? (subWins / totalWins) * 100 : null;
        const decWinPct = totalWins > 0 ? (decWins / totalWins) * 100 : null;
        const finishWinPct = totalWins > 0 ? ((koWins + subWins) / totalWins) * 100 : null;

        // Calculate loss method percentages (for opponent vulnerability)
        const totalLosses = rawStats.losses?.total || 0;
        const koLosses = rawStats.losses?.ko || 0;
        const subLosses = rawStats.losses?.sub || 0;

        const finishLossPct = totalLosses > 0 ? ((koLosses + subLosses) / totalLosses) * 100 : null;

        // Estimate control time from takedown stats (approximation)
        // Higher TD avg + higher TD acc typically correlates with more control time
        const ctrlTime = tdAvg !== null && tdAcc !== null ? (tdAvg * (tdAcc / 100) * 1.5) : null;

        return {
            slpm,
            strAcc,
            sapm,
            strDef,
            tdAvg,
            tdAcc,
            tdDef,
            subAvg,
            koWinPct,
            subWinPct,
            decWinPct,
            finishWinPct,
            finishLossPct,
            ctrlTime,
            // Keep raw counts for reference
            wins: rawStats.wins || null,
            losses: rawStats.losses || null
        };
    }

    // ==================== UFC STATS FETCHER ====================

    /**
     * Normalize fighter name for search (strip accents, lowercase)
     */
    normalizeNameForSearch(name) {
        return name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // strip diacritical marks
            .trim();
    }

    /**
     * Search ufcstats.com for a fighter and return their detail page URL
     */
    async searchUfcStats(fighterName) {
        const normalized = this.normalizeNameForSearch(fighterName);
        const lastName = normalized.split(' ').pop();

        const searchUrl = `http://ufcstats.com/statistics/fighters/search?query=${encodeURIComponent(lastName)}`;
        const proxyUrl = `http://localhost:5555/proxy?url=${encodeURIComponent(searchUrl)}`;

        try {
            const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
            if (!response.ok) return null;

            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Fighter links appear in sets of 3: first name, last name, nickname
            const links = doc.querySelectorAll('a.b-link.b-link_style_black[href*="fighter-details"]');
            if (links.length === 0) return null;

            const normalizedSearch = normalized.toLowerCase();

            // Check in groups of 3 (first, last, nickname)
            for (let i = 0; i < links.length; i += 3) {
                const firstName = (links[i]?.textContent || '').trim().toLowerCase();
                const last = (links[i + 1]?.textContent || '').trim().toLowerCase();
                const fullName = `${firstName} ${last}`;

                if (fullName === normalizedSearch ||
                    fullName.includes(normalizedSearch) ||
                    normalizedSearch.includes(fullName)) {
                    return links[i].href;
                }
            }

            // Fallback: check any link matching last name
            for (let i = 0; i < links.length; i += 3) {
                const last = (links[i + 1]?.textContent || '').trim().toLowerCase();
                if (last === lastName.toLowerCase()) {
                    return links[i].href;
                }
            }

            return null;
        } catch (error) {
            console.warn(`[UFCStats] Search failed for ${fighterName}:`, error.message);
            return null;
        }
    }

    /**
     * Fetch and parse a fighter's detail page from ufcstats.com
     * Returns raw stats in the format processUfcStats() expects
     */
    async fetchUfcStatsForFighter(fighterName) {
        const detailUrl = await this.searchUfcStats(fighterName);
        if (!detailUrl) {
            console.log(`[UFCStats] Fighter not found: ${fighterName}`);
            return null;
        }

        const proxyUrl = `http://localhost:5555/proxy?url=${encodeURIComponent(detailUrl)}`;

        try {
            const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
            if (!response.ok) return null;

            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Parse career averages from the stats boxes
            const statLabels = doc.querySelectorAll('i.b-list__box-item-title');
            const stats = {};

            for (const label of statLabels) {
                const labelText = label.textContent.trim().replace(':', '');
                const valueText = label.nextSibling?.textContent?.trim() || '';

                if (labelText === 'SLpM') stats.slpm = parseFloat(valueText) || null;
                else if (labelText === 'Str. Acc.') stats.strAcc = parseInt(valueText) || null;
                else if (labelText === 'SApM') stats.sapm = parseFloat(valueText) || null;
                else if (labelText === 'Str. Def') stats.strDef = parseInt(valueText) || null;
                else if (labelText === 'TD Avg.') stats.tdAvg = parseFloat(valueText) || null;
                else if (labelText === 'TD Acc.') stats.tdAcc = parseInt(valueText) || null;
                else if (labelText === 'TD Def.') stats.tdDef = parseInt(valueText) || null;
                else if (labelText === 'Sub. Avg.') stats.subAvg = parseFloat(valueText) || null;
            }

            // Parse win/loss record from fight history table
            const wins = { total: 0, ko: 0, sub: 0, dec: 0 };
            const losses = { total: 0, ko: 0, sub: 0, dec: 0 };

            const fightRows = doc.querySelectorAll('tr.b-fight-details__table-row.js-fight-details-click');

            for (const row of fightRows) {
                const flagEl = row.querySelector('.b-flag__text');
                const result = flagEl?.textContent?.trim().toLowerCase();
                if (result !== 'win' && result !== 'loss') continue;

                // Find the method column - it's in the table cells
                const cells = row.querySelectorAll('td.b-fight-details__table-col');
                let method = '';
                for (const cell of cells) {
                    const text = cell.textContent.trim();
                    if (text.includes('KO/TKO') || text.includes('SUB') || text.includes('Submission') ||
                        text.includes('DEC') || text.includes('Decision')) {
                        method = text;
                        break;
                    }
                }

                if (result === 'win') {
                    wins.total++;
                    if (method.includes('KO/TKO')) wins.ko++;
                    else if (method.includes('SUB') || method.includes('Submission')) wins.sub++;
                    else if (method.includes('DEC') || method.includes('Decision')) wins.dec++;
                } else {
                    losses.total++;
                    if (method.includes('KO/TKO')) losses.ko++;
                    else if (method.includes('SUB') || method.includes('Submission')) losses.sub++;
                    else if (method.includes('DEC') || method.includes('Decision')) losses.dec++;
                }
            }

            console.log(`[UFCStats] ${fighterName}: SLpM=${stats.slpm}, Str.Acc=${stats.strAcc}%, TDAvg=${stats.tdAvg}, Record=${wins.total}W-${losses.total}L (KO:${wins.ko}/${losses.ko}, SUB:${wins.sub}/${losses.sub}, DEC:${wins.dec}/${losses.dec})`);

            return {
                slpm: stats.slpm,
                strAcc: stats.strAcc,
                sapm: stats.sapm,
                strDef: stats.strDef,
                tdAvg: stats.tdAvg,
                tdAcc: stats.tdAcc,
                tdDef: stats.tdDef,
                subAvg: stats.subAvg,
                wins,
                losses
            };
        } catch (error) {
            console.warn(`[UFCStats] Failed to fetch details for ${fighterName}:`, error.message);
            return null;
        }
    }

    /**
     * Fetch UFC Stats for all fighters in the event
     * Returns a map of fighterName -> rawStats
     */
    async fetchAllUfcStats(fights, progressCallback) {
        const statsMap = {};
        let fetchedCount = 0;
        const totalFighters = fights.length * 2;

        for (const fight of fights) {
            for (const side of ['fighterA', 'fighterB']) {
                const name = fight[side]?.name;
                if (!name || statsMap[name]) continue;

                progressCallback?.({
                    phase: 'sources',
                    message: `Fetching UFC Stats for ${name}... (${fetchedCount + 1}/${totalFighters})`
                });

                const rawStats = await this.fetchUfcStatsForFighter(name);
                if (rawStats) {
                    statsMap[name] = rawStats;
                    fetchedCount++;
                }

                // Small delay between requests to be polite
                await new Promise(r => setTimeout(r, 300));
            }
        }

        console.log(`[UFCStats] Fetched stats for ${fetchedCount}/${totalFighters} fighters`);
        return { statsMap, success: fetchedCount > 0, count: fetchedCount };
    }

    /**
     * Process fighter data from all sources
     */
    async processFighterData(fighterName, tapologyData, dratingsData, fightMatrixData, progressCallback) {
        this.fetchProgress.current = fighterName;
        progressCallback?.({
            phase: 'fighters',
            message: `Processing ${fighterName}...`,
            progress: this.fetchProgress
        });

        const data = {
            name: fighterName,
            tapology: { consensus: null, koTko: null, sub: null, dec: null },
            dratings: { winPct: null },
            fightMatrix: { cirrs: null },
            ufcStats: this.processUfcStats(null) // Initialize with null structure
        };

        // Extract Tapology data
        if (tapologyData) {
            const tapMatch = this.findFighterInTapologyData(fighterName, tapologyData);
            if (tapMatch) {
                data.tapology = tapMatch;
            }
        }

        // Extract DRatings data
        if (dratingsData) {
            const drMatch = this.findFighterInDRatingsData(fighterName, dratingsData);
            if (drMatch) {
                data.dratings = drMatch;
            }
        }

        // Extract FightMatrix data
        if (fightMatrixData) {
            const fmMatch = this.findFighterInFightMatrixData(fighterName, fightMatrixData);
            if (fmMatch) {
                data.fightMatrix = fmMatch;
            }
        }

        this.fetchProgress.completed++;
        progressCallback?.({
            phase: 'fighters',
            message: `Completed ${fighterName}`,
            progress: this.fetchProgress
        });

        return data;
    }

    // ==================== TAPOLOGY FETCHER ====================

    /**
     * Fetch Tapology event data including community predictions
     */
    async fetchTapologyEventData(eventName, eventDate) {
        // Search for the event on Tapology
        const searchTerm = this.buildTapologySearchTerm(eventName);
        const searchUrl = `${this.sources.tapology}/fightcenter/events?search=${encodeURIComponent(searchTerm)}`;

        try {
            const searchResult = await this.fetchWithCorsProxy(searchUrl);
            if (!searchResult.ok) throw new Error('Tapology search failed');

            const eventUrl = this.extractTapologyEventUrl(searchResult.text, eventName, eventDate);

            if (!eventUrl) {
                console.log('Tapology event not found via search');
                return null;
            }

            // Fetch the event page
            const eventPageUrl = `${this.sources.tapology}${eventUrl}`;
            const eventResult = await this.fetchWithCorsProxy(eventPageUrl);
            if (!eventResult.ok) throw new Error('Tapology event page failed');

            return this.parseTapologyEventPage(eventResult.text);
        } catch (error) {
            console.error('Tapology fetch error:', error);
            return null;
        }
    }

    /**
     * Build search term for Tapology
     */
    buildTapologySearchTerm(eventName) {
        // Extract key parts: "UFC 324" or "UFC Fight Night: Fighter vs Fighter"
        const match = eventName.match(/UFC\s*(\d+|Fight Night)/i);
        return match ? match[0] : eventName;
    }

    /**
     * Extract event URL from Tapology search results
     */
    extractTapologyEventUrl(html, eventName, eventDate) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Find event links
        const eventLinks = doc.querySelectorAll('a[href*="/fightcenter/events/"]');

        for (const link of eventLinks) {
            const href = link.getAttribute('href');
            const text = link.textContent.toLowerCase();
            const eventNameLower = eventName.toLowerCase();

            // Check if this matches our event
            if (text.includes('ufc') && (
                href.includes(eventNameLower.replace(/\s+/g, '-')) ||
                text.includes(eventNameLower) ||
                this.fuzzyEventMatch(text, eventNameLower)
            )) {
                return href;
            }
        }

        return null;
    }

    /**
     * Fuzzy match for event names
     */
    fuzzyEventMatch(text, eventName) {
        // Extract UFC number or key fighters
        const ufcNum = eventName.match(/ufc\s*(\d+)/i);
        if (ufcNum && text.includes(ufcNum[1])) {
            return true;
        }

        // Match "Fighter vs Fighter" format
        const vsMatch = eventName.match(/:\s*(.+)\s+vs\.?\s+(.+)/i);
        if (vsMatch) {
            const fighter1 = vsMatch[1].toLowerCase().split(' ').pop();
            const fighter2 = vsMatch[2].toLowerCase().split(' ').pop();
            return text.includes(fighter1) && text.includes(fighter2);
        }

        return false;
    }

    /**
     * Parse Tapology event page for fight predictions
     */
    parseTapologyEventPage(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const fights = [];

        // Tapology lists fights in bout cards
        // Look for prediction percentages pattern: "Fighter 64%" vs "Fighter 36%"
        const fightSections = doc.querySelectorAll('.bout, .fightCard, [class*="bout"]');

        // Also try to extract from the raw HTML with regex for prediction patterns
        const predictionPattern = /([A-Za-z\s\-'\.]+?)\s*(\d{1,3})%/g;
        const matches = [...html.matchAll(predictionPattern)];

        // Group predictions by pairs
        const fighterPredictions = {};
        for (const match of matches) {
            const name = match[1].trim();
            const pct = parseInt(match[2]);

            if (name.length > 2 && name.length < 40 && pct > 0 && pct <= 100) {
                fighterPredictions[this.normalizeName(name)] = {
                    consensus: pct,
                    koTko: null,
                    sub: null,
                    dec: null
                };
            }
        }

        // Try to extract method breakdown (KO/Sub/Dec)
        // Pattern: "KO/TKO 45% Submission 30% Decision 25%"
        const methodPattern = /KO\/TKO[:\s]*(\d+)%.*?Sub[a-z]*[:\s]*(\d+)%.*?Dec[a-z]*[:\s]*(\d+)%/gi;
        const methodMatches = [...html.matchAll(methodPattern)];

        return {
            fights: fighterPredictions,
            raw: html.length > 0
        };
    }

    /**
     * Find fighter data in Tapology results
     */
    findFighterInTapologyData(fighterName, tapologyData) {
        if (!tapologyData || !tapologyData.fights) return null;

        const normalizedName = this.normalizeName(fighterName);

        // Try exact match first
        if (tapologyData.fights[normalizedName]) {
            return tapologyData.fights[normalizedName];
        }

        // Try namesMatch for flexible matching
        for (const [name, data] of Object.entries(tapologyData.fights)) {
            if (this.namesMatch(fighterName, name)) {
                return data;
            }
        }

        return null;
    }

    // ==================== DRATINGS FETCHER ====================

    /**
     * Fetch DRatings predictions for upcoming UFC fights
     */
    async fetchDRatingsData(eventName, eventDate) {
        const url = `${this.sources.dratings}/predictor/ufc-mma-predictions/`;

        try {
            const result = await this.fetchWithCorsProxy(url);
            if (!result.ok) throw new Error('DRatings fetch failed');

            return this.parseDRatingsPage(result.text, eventDate);
        } catch (error) {
            console.error('DRatings fetch error:', error);
            return null;
        }
    }

    /**
     * Parse DRatings predictions page
     */
    parseDRatingsPage(html, eventDate) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const predictions = {};

        // DRatings uses tables with fighter names and win percentages
        const rows = doc.querySelectorAll('table tr, .prediction-row');

        // Also extract with regex for "Name XX.X%" pattern
        // DRatings format: "Fighter Name    55.4%"
        const pctPattern = /([A-Za-z\s\-'\.]+?)\s+(\d{1,2}(?:\.\d)?)\s*%/g;
        const matches = [...html.matchAll(pctPattern)];

        for (const match of matches) {
            const name = match[1].trim();
            const pct = parseFloat(match[2]);

            if (name.length > 3 && name.length < 40 && pct > 0 && pct <= 100) {
                predictions[this.normalizeName(name)] = {
                    winPct: pct
                };
            }
        }

        return {
            predictions,
            raw: html.length > 0
        };
    }

    /**
     * Find fighter data in DRatings results
     */
    findFighterInDRatingsData(fighterName, dratingsData) {
        if (!dratingsData || !dratingsData.predictions) return null;

        const normalizedName = this.normalizeName(fighterName);

        if (dratingsData.predictions[normalizedName]) {
            return dratingsData.predictions[normalizedName];
        }

        // Try namesMatch for flexible matching
        for (const [name, data] of Object.entries(dratingsData.predictions)) {
            if (this.namesMatch(fighterName, name)) {
                return data;
            }
        }

        return null;
    }

    // ==================== FIGHTMATRIX FETCHER ====================

    /**
     * Fetch FightMatrix ratings and predictions
     */
    async fetchFightMatrixData(eventName, eventDate) {
        // FightMatrix has ratings on their rankings page and predictions in blog posts
        // First, try to find the event prediction blog post
        const blogUrl = await this.findFightMatrixBlogPost(eventName, eventDate);

        const result = {
            ratings: {},
            predictions: {},
            blogFound: false
        };

        // Fetch ratings from the main rankings page for each weight class
        try {
            const ratingsUrl = `${this.sources.fightmatrix}/mma-ranks/`;
            const ratingsResult = await this.fetchWithCorsProxy(ratingsUrl);
            if (ratingsResult.ok) {
                result.ratings = this.parseFightMatrixRatings(ratingsResult.text);
            }
        } catch (error) {
            console.error('FightMatrix ratings fetch error:', error);
        }

        // If we found a blog post, fetch predictions from there
        if (blogUrl) {
            try {
                const blogResult = await this.fetchWithCorsProxy(blogUrl);
                if (blogResult.ok) {
                    result.predictions = this.parseFightMatrixBlog(blogResult.text);
                    result.blogFound = true;
                }
            } catch (error) {
                console.error('FightMatrix blog fetch error:', error);
            }
        }

        return result;
    }

    /**
     * Find FightMatrix blog post for an event
     */
    async findFightMatrixBlogPost(eventName, eventDate) {
        // FightMatrix blog posts follow patterns like:
        // /2025/12/08/fight-matrix-program-ufc-fight-night-royval-vs-kape-12-13-2025/
        // /2025/04/03/ufc-314-picks-predictions/

        const eventDateObj = new Date(eventDate);
        const year = eventDateObj.getFullYear();
        const month = String(eventDateObj.getMonth() + 1).padStart(2, '0');

        // Try to find the blog post via Google search or direct URL construction
        const searchTerm = `site:fightmatrix.com ${eventName} predictions ${year}`;

        // For now, return null - we'll rely on the ratings
        // In a production version, you could use a search API here
        return null;
    }

    /**
     * Parse FightMatrix ratings page
     */
    parseFightMatrixRatings(html) {
        const ratings = {};

        // FightMatrix format: Rank, Fighter (Age), Record, Points
        // Pattern: "1. Fighter Name (30) 15-2-0 1850"
        const ratingPattern = /(\d+)\.\s+([A-Za-z\s\-'\.]+?)\s+\((\d+)\)\s+([\d\-]+)\s+(\d+)/g;
        const matches = [...html.matchAll(ratingPattern)];

        for (const match of matches) {
            const rank = parseInt(match[1]);
            const name = match[2].trim();
            const age = parseInt(match[3]);
            const record = match[4];
            const points = parseInt(match[5]);

            ratings[this.normalizeName(name)] = {
                cirrs: points,
                rank,
                record,
                age
            };
        }

        return ratings;
    }

    /**
     * Parse FightMatrix blog post for predictions
     */
    parseFightMatrixBlog(html) {
        const predictions = {};

        // Blog posts contain narrative predictions
        // Look for patterns like "Fighter A (86% chance)"
        const predPattern = /([A-Za-z\s\-'\.]+?)\s*\((\d{1,3})%\s*chance/gi;
        const matches = [...html.matchAll(predPattern)];

        for (const match of matches) {
            const name = match[1].trim();
            const pct = parseInt(match[2]);

            predictions[this.normalizeName(name)] = {
                winPct: pct
            };
        }

        return predictions;
    }

    /**
     * Find fighter data in FightMatrix results
     */
    findFighterInFightMatrixData(fighterName, fightMatrixData) {
        if (!fightMatrixData) return null;

        const normalizedName = this.normalizeName(fighterName);
        let result = { cirrs: null };

        // Check ratings first - exact match
        if (fightMatrixData.ratings && fightMatrixData.ratings[normalizedName]) {
            result.cirrs = fightMatrixData.ratings[normalizedName].cirrs;
        }

        // Try namesMatch for flexible matching
        if (!result.cirrs && fightMatrixData.ratings) {
            for (const [name, data] of Object.entries(fightMatrixData.ratings)) {
                if (this.namesMatch(fighterName, name)) {
                    result.cirrs = data.cirrs;
                    break;
                }
            }
        }

        return result;
    }

    // ==================== MANUAL FIGHTMATRIX PASTE ====================

    /**
     * Parse manually pasted FightMatrix data
     * Supports multiple formats from FightMatrix's event pages
     * @param {string} pastedText - Raw text pasted from FightMatrix
     * @param {Array} fights - Array of fight objects to match against
     * @returns {Object} - Parsed ratings mapped to fighter names
     */
    parseFightMatrixPaste(pastedText, fights) {
        const ratings = {};
        const lines = pastedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        // Build list of fighter names for matching
        const fighterNames = [];
        for (const fight of fights) {
            fighterNames.push({
                name: fight.fighterA.name,
                normalized: this.normalizeName(fight.fighterA.name),
                lastName: fight.fighterA.name.split(' ').pop().toLowerCase()
            });
            fighterNames.push({
                name: fight.fighterB.name,
                normalized: this.normalizeName(fight.fighterB.name),
                lastName: fight.fighterB.name.split(' ').pop().toLowerCase()
            });
        }

        let currentFightPair = null;

        for (const line of lines) {
            // Context Tracking: Look for "Fighter A ... vs. ... Fighter B" line
            if (line.includes(' vs.') || line.includes(' vs ')) {
                // Try to identify which fight this section belongs to
                // Pattern: "[#Rank] Name (Record) vs. [#Rank] Name (Record)"
                // Or just: "Name vs. Name"
                // We'll check if this line contains names from our known fights
                for (const fight of fights) {
                    const normA = this.normalizeName(fight.fighterA.name);
                    const normB = this.normalizeName(fight.fighterB.name);
                    const normLine = this.normalizeName(line);

                    // Check if both last names are in the line (simplified check)
                    const lastA = fight.fighterA.name.split(' ').pop().toLowerCase();
                    const lastB = fight.fighterB.name.split(' ').pop().toLowerCase();

                    if (normLine.includes(lastA) && normLine.includes(lastB)) {
                        currentFightPair = fight;
                        console.log(`[Parser] Context switch: ${fight.fighterA.name} vs ${fight.fighterB.name}`);
                        break;
                    }
                }
            }

            // Data Extraction Strategy 1: "Elo K170" Table Row (Preferred)
            // Format: "Elo K170	Fighter Name	1742.68	+207.51	76.75%"
            if (currentFightPair && (line.startsWith('Elo K170') || line.startsWith('Elo Modified'))) {
                // Split by tabs or multiple spaces
                const parts = line.split(/[\t\s]{2,}/);
                // If split failed, try splitting by spaces but be careful of name
                const partsFallback = line.split(/\s+/);

                // We need to extract: Name, Rating, Diff
                // Regex might be safer: "Elo K170 \s+ (Name Name) \s+ (Rating) \s+ (Diff) ..."
                const eloMatch = line.match(/(?:Elo K170|Elo Modified)\s+([A-Za-z\s\-'\.]+?)\s+(\d+(?:\.\d+)?)\s+([+\-]\d+(?:\.\d+)?)/);

                if (eloMatch) {
                    const favName = eloMatch[1].trim();
                    const favRating = parseFloat(eloMatch[2]);
                    const ratingDiff = parseFloat(eloMatch[3]);
                    const underdogRating = favRating - ratingDiff; // Diff is always positive relative to favorite

                    console.log(`[Parser] Found Elo data: ${favName} (${favRating}) vs Underdog (${underdogRating.toFixed(2)})`);

                    // Determine matches
                    const normFav = this.normalizeName(favName);
                    const normA = this.normalizeName(currentFightPair.fighterA.name);
                    const normB = this.normalizeName(currentFightPair.fighterB.name);

                    // Assign ratings based on who matched the "Favorite" name
                    if (this.namesMatch(favName, currentFightPair.fighterA.name)) {
                        // Fighter A is favorite
                        ratings[currentFightPair.fighterA.name] = { cirrs: Math.round(favRating), matchConfidence: 100 };
                        ratings[currentFightPair.fighterB.name] = { cirrs: Math.round(underdogRating), matchConfidence: 100 };
                    } else if (this.namesMatch(favName, currentFightPair.fighterB.name)) {
                        // Fighter B is favorite
                        ratings[currentFightPair.fighterB.name] = { cirrs: Math.round(favRating), matchConfidence: 100 };
                        ratings[currentFightPair.fighterA.name] = { cirrs: Math.round(underdogRating), matchConfidence: 100 };
                    }
                    continue; // Done with this line
                }
            }

            // Data Extraction Strategy 2: Line-by-Line (Legacy/Fallback)
            let parsed = null;

            // Pattern 1: Name followed by 4-digit number at end
            const pattern1 = /^([A-Za-z\s\-'\.]+?)\s+(\d{4})$/;
            const match1 = line.match(pattern1);
            if (match1) parsed = { name: match1[1].trim(), cirrs: parseInt(match1[2]) };

            // Pattern 2: Ranked format "1. Fighter Name (30) 15-2-0 1850"
            if (!parsed) {
                const pattern2 = /^\d+\.\s+([A-Za-z\s\-'\.]+?)\s+\(\d+\)\s+[\d\-]+\s+(\d{4})/;
                const match2 = line.match(pattern2);
                if (match2) parsed = { name: match2[1].trim(), cirrs: parseInt(match2[2]) };
            }

            // Pattern 3: Name - CIRRS format
            if (!parsed) {
                const pattern3 = /^([A-Za-z\s\-'\.]+?)\s*[-–]\s*(\d{4})/;
                const match3 = line.match(pattern3);
                if (match3) parsed = { name: match3[1].trim(), cirrs: parseInt(match3[2]) };
            }

            // If we parsed something, try to match it to a fighter
            if (parsed && parsed.name && parsed.cirrs) {
                const normalizedParsed = this.normalizeName(parsed.name);
                let bestMatch = null;
                let bestScore = 0;

                for (const fighter of fighterNames) {
                    let score = 0;
                    if (normalizedParsed === fighter.normalized) score = 100;
                    else if (normalizedParsed.includes(fighter.lastName) || fighter.normalized.includes(normalizedParsed)) score = 80;
                    else if (Math.abs(normalizedParsed.length - fighter.normalized.length) < 5) { // Simple heuristics
                        if (this.namesMatch(parsed.name, fighter.name)) score = 70;
                    }

                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = fighter;
                    }
                }

                if (bestMatch && bestScore >= 50) {
                    // Only update if we don't have a "better" (Strategy 1) rating yet
                    if (!ratings[bestMatch.name]) {
                        ratings[bestMatch.name] = {
                            cirrs: parsed.cirrs,
                            matchConfidence: bestScore
                        };
                    }
                }
            }
        }

        return {
            ratings,
            totalParsed: Object.keys(ratings).length,
            totalFighters: fighterNames.length
        };
    }

    /**
     * Merge manually pasted FightMatrix data with existing fight data
     * @param {Array} fights - Current fights array
     * @param {Object} pastedData - Parsed paste data from parseFightMatrixPaste
     * @returns {Array} - Updated fights with merged FightMatrix data
     */
    mergeFightMatrixPaste(fights, pastedData) {
        const updatedFights = [];

        for (const fight of fights) {
            const updatedFight = { ...fight };

            // Check if we have pasted data for fighter A
            if (pastedData.ratings[fight.fighterA.name]) {
                updatedFight.fighterA = {
                    ...fight.fighterA,
                    fightMatrix: {
                        ...(fight.fighterA.fightMatrix || {}),
                        cirrs: pastedData.ratings[fight.fighterA.name].cirrs
                    }
                };
            }

            // Check if we have pasted data for fighter B
            if (pastedData.ratings[fight.fighterB.name]) {
                updatedFight.fighterB = {
                    ...fight.fighterB,
                    fightMatrix: {
                        ...(fight.fighterB.fightMatrix || {}),
                        cirrs: pastedData.ratings[fight.fighterB.name].cirrs
                    }
                };
            }

            updatedFights.push(updatedFight);
        }

        return updatedFights;
    }

    /**
     * Check which fighters are missing FightMatrix data
     * @param {Array} fights - Array of fights to check
     * @returns {Array} - List of fighter names missing CIRRS data
     */
    getMissingFightMatrixFighters(fights) {
        const missing = [];

        for (const fight of fights) {
            const aHasCirrs = fight.fighterA?.fightMatrix?.cirrs ||
                (typeof fight.fighterA?.fightMatrix === 'number' && fight.fighterA.fightMatrix > 0);
            const bHasCirrs = fight.fighterB?.fightMatrix?.cirrs ||
                (typeof fight.fighterB?.fightMatrix === 'number' && fight.fighterB.fightMatrix > 0);

            if (!aHasCirrs) {
                missing.push(fight.fighterA.name);
            }
            if (!bHasCirrs) {
                missing.push(fight.fighterB.name);
            }
        }

        return missing;
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Normalize a fighter name for matching - handles hyphens, accents, and variations
     */
    normalizeName(name) {
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
        const norm1 = this.normalizeName(name1);
        const norm2 = this.normalizeName(name2);

        // Exact match after normalization
        if (norm1 === norm2) return true;

        // One is a substring of the other (handles "Lopes" vs "Diego Lopes")
        if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

        // Last name match with min length check
        const parts1 = norm1.split(' ');
        const parts2 = norm2.split(' ');
        const lastName1 = parts1[parts1.length - 1];
        const lastName2 = parts2[parts2.length - 1];

        // Only match on last name if it's long enough (avoid matching "Lee" to wrong fighter)
        if (lastName1.length >= 4 && lastName1 === lastName2) return true;

        // Check if all parts of one name appear within the other (handles "Rangbo Sulang" vs "Sulangrangbo")
        const noSpace1 = norm1.replace(/\s/g, '');
        const noSpace2 = norm2.replace(/\s/g, '');

        // If names without spaces are similar length and one contains all parts of the other
        if (Math.abs(noSpace1.length - noSpace2.length) <= 2) {
            // Use length >= 2 to handle short Asian name parts like "Yi", "Li"
            const allParts1InName2 = parts1.every(part => part.length >= 2 && noSpace2.includes(part));
            const allParts2InName1 = parts2.every(part => part.length >= 2 && noSpace1.includes(part));

            if (allParts1InName2 || allParts2InName1) return true;
        }

        // Handle concatenated versions matching
        if (noSpace1 === noSpace2) return true;

        // Try reversed name parts: "zha yi" -> "yi zha"
        const reversed1 = parts1.slice().reverse().join(' ');
        const reversed2 = parts2.slice().reverse().join(' ');
        if (reversed1 === norm2 || reversed2 === norm1) return true;

        return false;
    }

    /**
     * Get fetch progress status
     */
    getProgress() {
        return this.fetchProgress;
    }
}

// Export singleton instance
const fighterDataFetcher = new FighterDataFetcher();
