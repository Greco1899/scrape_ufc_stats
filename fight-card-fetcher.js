/**
 * UFC Weekly Predictor - Fight Card Fetcher
 * Automated fight lineup discovery from UFC.com, Tapology, and Sherdog
 * Uses Gemini API for intelligent parsing when needed
 */

class FightCardFetcher {
    constructor() {
        // API configuration
        this.geminiApiKey = null; // Set via setGeminiApiKey()
        // Try multiple models in case of rate limits
        this.geminiModels = [
            'gemini-2.0-flash',
            'gemini-1.5-flash-latest',
            'gemini-1.5-flash',
            'gemini-1.5-pro-latest'
        ];
        this.geminiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/';

        // Source URLs
        this.sources = {
            ufc: {
                baseUrl: 'https://www.ufc.com/event/',
                searchUrl: 'https://www.ufc.com/events'
            },
            tapology: {
                baseUrl: 'https://www.tapology.com/fightcenter/events/',
                searchUrl: 'https://www.tapology.com/fightcenter'
            },
            sherdog: {
                baseUrl: 'https://www.sherdog.com/events/',
                searchUrl: 'https://www.sherdog.com/organizations/Ultimate-Fighting-Championship-UFC-2'
            }
        };

        // CORS proxies for browser requests (try multiple in case one fails)
        this.corsProxies = [
            'http://localhost:5555/proxy?url=',
            'https://api.allorigins.win/raw?url=',
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest='
        ];
        this.currentProxyIndex = 0;

        // Weight class mapping
        this.weightClassMap = {
            'heavyweight': 'HW',
            'light heavyweight': 'LHW',
            'middleweight': 'MW',
            'welterweight': 'WW',
            'lightweight': 'LW',
            'featherweight': 'FW',
            'bantamweight': 'BW',
            'flyweight': 'FLW',
            "women's strawweight": 'WSW',
            "women's flyweight": 'WFLW',
            "women's bantamweight": 'WBW',
            "women's featherweight": 'WFW',
            'catchweight': 'CW'
        };
    }

    /**
     * Set Gemini API key for intelligent parsing
     */
    setGeminiApiKey(apiKey) {
        this.geminiApiKey = apiKey;
        localStorage.setItem('geminiApiKey', apiKey);
    }

    /**
     * Load Gemini API key from storage
     */
    loadGeminiApiKey() {
        this.geminiApiKey = localStorage.getItem('geminiApiKey');
        return this.geminiApiKey;
    }

    /**
     * Main method: Fetch fight card for an event
     * Tries Gemini first (most reliable with grounded search), then web scraping fallbacks
     */
    async fetchFightCard(eventName, eventDate) {
        const results = {
            success: false,
            source: null,
            fights: [],
            error: null,
            fetchedAt: new Date().toISOString()
        };

        // Try Gemini first if available (most reliable with grounded search)
        if (this.geminiApiKey) {
            try {
                console.log('Attempting Gemini-powered search with grounding...');
                const fights = await this.fetchWithGemini(eventName, eventDate);
                if (fights && fights.length > 0) {
                    results.success = true;
                    results.source = 'gemini';
                    results.fights = this.markMainEvent(fights);
                    console.log(`Successfully fetched ${fights.length} fights from Gemini`);
                    return results;
                }
            } catch (error) {
                console.warn('Gemini search failed:', error.message);
            }
        }

        // Fallback to web scraping sources
        const sources = ['tapology', 'ufc', 'sherdog'];

        for (const source of sources) {
            try {
                console.log(`Attempting to fetch from ${source}...`);
                const fights = await this.fetchFromSource(source, eventName, eventDate);

                if (fights && fights.length > 0) {
                    results.success = true;
                    results.source = source;
                    results.fights = this.markMainEvent(fights);
                    console.log(`Successfully fetched ${fights.length} fights from ${source}`);
                    return results;
                }
            } catch (error) {
                console.warn(`Failed to fetch from ${source}:`, error.message);
            }
        }

        results.error = this.geminiApiKey
            ? 'Unable to fetch fight card from any source. The event may not be announced yet, or please enter fights manually.'
            : 'Unable to fetch fight card. Configure a Gemini API key in settings for better results, or enter fights manually.';
        return results;
    }

    /**
     * Fetch from a specific source
     */
    async fetchFromSource(source, eventName, eventDate) {
        switch (source) {
            case 'ufc':
                return await this.fetchFromUFC(eventName, eventDate);
            case 'tapology':
                return await this.fetchFromTapology(eventName, eventDate);
            case 'sherdog':
                return await this.fetchFromSherdog(eventName, eventDate);
            default:
                throw new Error(`Unknown source: ${source}`);
        }
    }

    /**
     * Mark the first main card fight as the main event (5 rounds)
     * Fight cards are typically ordered with main event first
     */
    markMainEvent(fights) {
        if (!fights || fights.length === 0) return fights;

        // Find the first main card fight and mark it as main event
        let mainEventMarked = false;
        return fights.map(fight => {
            if (!mainEventMarked && fight.isMainCard) {
                mainEventMarked = true;
                return { ...fight, isMainEvent: true };
            }
            return { ...fight, isMainEvent: false };
        });
    }

    /**
     * Fetch fight card from UFC.com
     * Tries multiple URL formats: date-based and name-based
     */
    async fetchFromUFC(eventName, eventDate) {
        // Generate multiple possible URL slugs
        const slugs = this.generateUFCSlugs(eventName, eventDate);

        for (const slug of slugs) {
            const url = `${this.sources.ufc.baseUrl}${slug}`;
            console.log(`Trying UFC.com URL: ${url}`);

            try {
                const html = await this.fetchWithProxy(url);
                const fights = this.parseUFCPage(html);
                if (fights && fights.length > 0) {
                    return fights;
                }
            } catch (error) {
                console.warn(`UFC.com URL failed: ${slug}`, error.message);
            }
        }

        // Try searching UFC events page as last resort
        return await this.searchUFCEvents(eventName, eventDate);
    }

    /**
     * Generate multiple possible UFC.com URL slugs
     * UFC uses different formats: date-based, name-based, numbered events
     */
    generateUFCSlugs(eventName, eventDate) {
        const slugs = [];
        const nameLower = eventName.toLowerCase();

        // 1. Date-based format: "ufc-fight-night-february-21-2026"
        if (eventDate) {
            // Parse date without timezone issues (YYYY-MM-DD format)
            const dateParts = eventDate.split('-');
            const months = ['january', 'february', 'march', 'april', 'may', 'june',
                'july', 'august', 'september', 'october', 'november', 'december'];
            const year = parseInt(dateParts[0]);
            const month = months[parseInt(dateParts[1]) - 1]; // Month is 1-indexed in string
            const day = parseInt(dateParts[2]);

            // For Fight Night events
            if (nameLower.includes('fight night')) {
                slugs.push(`ufc-fight-night-${month}-${day}-${year}`);
                // Try padded day (07 vs 7)
                if (day < 10) slugs.push(`ufc-fight-night-${month}-0${day}-${year}`);
            }
            // Generic date format
            slugs.push(`ufc-${month}-${day}-${year}`);
            if (day < 10) slugs.push(`ufc-${month}-0${day}-${year}`);
        }

        // 2. Numbered event format: "ufc-315" or "ufc-315-fighter-vs-fighter"
        const numberedMatch = nameLower.match(/ufc\s*(\d+)/);
        if (numberedMatch) {
            slugs.push(`ufc-${numberedMatch[1]}`);
        }

        // 3. Name-based format: "ufc-fight-night-strickland-vs-hernandez"
        const nameSlug = eventName
            .toLowerCase()
            .replace(/[:\-–]/g, '')
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .replace(/-+/g, '-');
        slugs.push(nameSlug);

        // 4. Simplified name format (just main fighters if present)
        const vsMatch = nameLower.match(/([a-z]+)\s+vs\.?\s+([a-z]+)/);
        if (vsMatch && nameLower.includes('fight night')) {
            slugs.push(`ufc-fight-night-${vsMatch[1]}-vs-${vsMatch[2]}`);
        }

        return [...new Set(slugs)]; // Remove duplicates
    }

    /**
     * Parse UFC.com event page HTML
     */
    parseUFCPage(html) {
        const fights = [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // UFC.com uses various class names for fight cards
        const fightCards = doc.querySelectorAll('.c-listing-fight, .fight-card, [class*="fight-card"]');

        fightCards.forEach(card => {
            try {
                const fight = this.parseUFCFightCard(card);
                if (fight) {
                    fights.push(fight);
                }
            } catch (e) {
                console.warn('Failed to parse UFC fight card:', e);
            }
        });

        return fights;
    }

    /**
     * Parse individual UFC fight card element
     */
    parseUFCFightCard(card) {
        // Try multiple selector patterns
        const fighterA = card.querySelector('.c-listing-fight__corner-name--red, .red-corner .fighter-name')?.textContent?.trim();
        const fighterB = card.querySelector('.c-listing-fight__corner-name--blue, .blue-corner .fighter-name')?.textContent?.trim();
        const weightClass = card.querySelector('.c-listing-fight__class, .weight-class')?.textContent?.trim();

        if (!fighterA || !fighterB) {
            return null;
        }

        return {
            fighterA: { name: this.cleanFighterName(fighterA) },
            fighterB: { name: this.cleanFighterName(fighterB) },
            weightClass: this.normalizeWeightClass(weightClass),
            isMainCard: card.closest('.main-card, [class*="main"]') !== null,
            approved: true // Default to approved
        };
    }

    /**
     * Search UFC events page for matching event
     */
    async searchUFCEvents(eventName, eventDate) {
        try {
            // Fetch the UFC events listing page
            const html = await this.fetchWithProxy(this.sources.ufc.searchUrl);
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Look for event links that match our date
            const eventLinks = doc.querySelectorAll('a[href*="/event/"]');

            for (const link of eventLinks) {
                const href = link.getAttribute('href');
                const text = link.textContent?.toLowerCase() || '';

                // Check if the link matches our event by date or name
                const nameLower = eventName.toLowerCase();
                if (text.includes(nameLower) ||
                    (href && this.urlMatchesDate(href, eventDate))) {
                    // Found a match, try to fetch this event page
                    const eventUrl = href.startsWith('http') ? href : `https://www.ufc.com${href}`;
                    console.log(`Found matching UFC event URL: ${eventUrl}`);
                    const eventHtml = await this.fetchWithProxy(eventUrl);
                    const fights = this.parseUFCPage(eventHtml);
                    if (fights && fights.length > 0) {
                        return fights;
                    }
                }
            }
        } catch (error) {
            console.warn('UFC events search failed:', error.message);
        }
        return [];
    }

    /**
     * Check if a URL slug matches a date string (YYYY-MM-DD format)
     */
    urlMatchesDate(url, eventDate) {
        const months = ['january', 'february', 'march', 'april', 'may', 'june',
            'july', 'august', 'september', 'october', 'november', 'december'];

        // Parse date string directly to avoid timezone issues
        const dateParts = eventDate.split('-');
        const year = dateParts[0];
        const month = months[parseInt(dateParts[1]) - 1];
        const day = parseInt(dateParts[2]);

        const urlLower = url.toLowerCase();
        return urlLower.includes(`${month}-${day}`) && urlLower.includes(year);
    }

    /**
     * Fetch fight card from Tapology
     */
    async fetchFromTapology(eventName, eventDate) {
        // Generate Tapology search URL
        const searchTerm = encodeURIComponent(eventName);
        const searchUrl = `${this.sources.tapology.searchUrl}?search=${searchTerm}`;

        try {
            const html = await this.fetchWithProxy(searchUrl);
            const eventUrl = this.findTapologyEventUrl(html, eventName, eventDate);

            if (eventUrl) {
                const eventHtml = await this.fetchWithProxy(eventUrl);
                return this.parseTapologyPage(eventHtml);
            }
        } catch (error) {
            console.warn('Tapology fetch failed:', error);
        }

        return [];
    }

    /**
     * Find Tapology event URL from search results
     */
    findTapologyEventUrl(html, eventName, eventDate) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Look for event links
        const links = doc.querySelectorAll('a[href*="/fightcenter/events/"]');

        for (const link of links) {
            const text = link.textContent.toLowerCase();
            const nameLower = eventName.toLowerCase();

            // Check if event name matches
            if (text.includes(nameLower) || nameLower.includes(text)) {
                return 'https://www.tapology.com' + link.getAttribute('href');
            }
        }

        return null;
    }

    /**
     * Parse Tapology event page HTML
     */
    parseTapologyPage(html) {
        const fights = [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Tapology uses table rows for fights
        const fightRows = doc.querySelectorAll('.fightCard tr, .fightCardBout, [class*="bout"]');

        fightRows.forEach(row => {
            try {
                const fight = this.parseTapologyFightRow(row);
                if (fight) {
                    fights.push(fight);
                }
            } catch (e) {
                console.warn('Failed to parse Tapology fight row:', e);
            }
        });

        return fights;
    }

    /**
     * Parse individual Tapology fight row
     */
    parseTapologyFightRow(row) {
        const fighters = row.querySelectorAll('.fightCardFighterName a, .fighter a, [class*="fighter"] a');

        if (fighters.length < 2) {
            return null;
        }

        const weightClassEl = row.querySelector('.pointed, .weight-class, [class*="weight"]');

        return {
            fighterA: { name: this.cleanFighterName(fighters[0].textContent) },
            fighterB: { name: this.cleanFighterName(fighters[1].textContent) },
            weightClass: this.normalizeWeightClass(weightClassEl?.textContent),
            isMainCard: row.closest('.main-card') !== null,
            approved: true
        };
    }

    /**
     * Fetch fight card from Sherdog
     */
    async fetchFromSherdog(eventName, eventDate) {
        // Similar implementation for Sherdog
        // For now, return empty to use Gemini fallback
        return [];
    }

    /**
     * Parse Sherdog event page HTML
     */
    parseSherdogPage(html) {
        const fights = [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const fightRows = doc.querySelectorAll('.event-fight, tr[itemprop="subEvent"]');

        fightRows.forEach(row => {
            try {
                const fight = this.parseSherdogFightRow(row);
                if (fight) {
                    fights.push(fight);
                }
            } catch (e) {
                console.warn('Failed to parse Sherdog fight row:', e);
            }
        });

        return fights;
    }

    /**
     * Parse individual Sherdog fight row
     */
    parseSherdogFightRow(row) {
        const fighters = row.querySelectorAll('[itemprop="performer"] span[itemprop="name"], .fighter-name');

        if (fighters.length < 2) {
            return null;
        }

        const weightClassEl = row.querySelector('.weight_class, [class*="weight"]');

        return {
            fighterA: { name: this.cleanFighterName(fighters[0].textContent) },
            fighterB: { name: this.cleanFighterName(fighters[1].textContent) },
            weightClass: this.normalizeWeightClass(weightClassEl?.textContent),
            isMainCard: false,
            approved: true
        };
    }

    /**
     * Use Gemini API to find fight card
     * Tries multiple models and grounding options to handle rate limits
     */
    async fetchWithGemini(eventName, eventDate) {
        if (!this.geminiApiKey) {
            throw new Error('Gemini API key not configured');
        }

        // Try each model with grounding first, then without
        for (const model of this.geminiModels) {
            for (const grounded of [true, false]) {
                try {
                    console.log(`Trying Gemini model: ${model} (grounded: ${grounded})`);
                    const result = await this._callGeminiAPI(eventName, eventDate, grounded, model);
                    if (result && result.length > 0) {
                        return result;
                    }
                } catch (error) {
                    // Try next option immediately on error (404, 429, etc)
                    console.warn(`Gemini ${model} failed:`, error.message);
                    if (error.message.includes('429')) {
                        console.log(`${model} rate limited, trying next option...`);
                    }
                    continue;
                }
            }
        }

        return [];
    }

    /**
     * Internal: Call Gemini API with or without grounding
     */
    async _callGeminiAPI(eventName, eventDate, useGrounding = false, model = 'gemini-2.0-flash') {
        // Format date for better search results (parse without timezone issues)
        const dateParts = eventDate.split('-');
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        const formattedDate = `${months[parseInt(dateParts[1]) - 1]} ${parseInt(dateParts[2])}, ${dateParts[0]}`;

        const prompt = useGrounding
            ? `Find the COMPLETE official fight card for the UFC event on ${formattedDate}.
Event name: "${eventName}"

Search these sources for the full card:
- UFC.com official event page
- Tapology.com event page
- MMAFighting.com or MMAJunkie.com news

I need ALL fights on the card - both main card AND preliminary card.

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "fighterA": "First Last",
    "fighterB": "First Last",
    "weightClass": "Middleweight",
    "isMainCard": true
  }
]

Rules:
- List main card fights first (isMainCard: true), then prelims (isMainCard: false)
- Use full fighter names (first and last name)
- Use standard weight class names (Heavyweight, Light Heavyweight, Middleweight, Welterweight, Lightweight, Featherweight, Bantamweight, Flyweight, Women's Strawweight, Women's Flyweight, Women's Bantamweight)
- If you cannot find the event, return an empty array []`
            : `You are an MMA expert. Provide the complete fight card for "${eventName}" on ${formattedDate}.

Return ONLY a valid JSON array (no markdown):
[
  {
    "fighterA": "First Last",
    "fighterB": "First Last",
    "weightClass": "Middleweight",
    "isMainCard": true
  }
]

List main card first, then prelims. Use full names and standard weight classes.
If you don't know this event, return [].`;

        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 4096
            }
        };

        // Add grounding tool if enabled
        if (useGrounding) {
            requestBody.tools = [{
                google_search_retrieval: {
                    dynamic_retrieval_config: {
                        mode: "MODE_DYNAMIC",
                        dynamic_threshold: 0.3
                    }
                }
            }];
        }

        const endpoint = `${this.geminiBaseUrl}${model}:generateContent`;
        const response = await fetch(`${endpoint}?key=${this.geminiApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            return [];
        }

        // Extract JSON from response
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            return [];
        }

        const fights = JSON.parse(jsonMatch[0]);

        // Normalize the response
        return fights.map(fight => ({
            fighterA: { name: this.cleanFighterName(fight.fighterA) },
            fighterB: { name: this.cleanFighterName(fight.fighterB) },
            weightClass: this.normalizeWeightClass(fight.weightClass),
            isMainCard: fight.isMainCard || false,
            approved: true
        }));
    }

    /**
     * Fetch URL through CORS proxy
     * Tries multiple proxies if one fails
     */
    async fetchWithProxy(url) {
        let lastError = null;

        // Try each proxy in order
        for (let i = 0; i < this.corsProxies.length; i++) {
            const proxy = this.corsProxies[(this.currentProxyIndex + i) % this.corsProxies.length];
            const proxyUrl = proxy + encodeURIComponent(url);

            try {
                console.log(`Trying CORS proxy: ${proxy.substring(0, 30)}...`);
                const response = await fetch(proxyUrl, {
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                if (response.ok) {
                    // Remember which proxy worked
                    this.currentProxyIndex = (this.currentProxyIndex + i) % this.corsProxies.length;
                    return await response.text();
                }
                lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
            } catch (error) {
                lastError = error;
                console.warn(`Proxy failed: ${proxy.substring(0, 30)}...`, error.message);
            }
        }

        throw lastError || new Error('All CORS proxies failed');
    }

    /**
     * Clean fighter name (remove rankings, extra whitespace)
     */
    cleanFighterName(name) {
        if (!name) return '';

        return name
            .replace(/#\d+/, '')           // Remove rankings like #5
            .replace(/\(C\)/gi, '')        // Remove champion indicator
            .replace(/\(IC\)/gi, '')       // Remove interim champion
            .replace(/\s+/g, ' ')          // Normalize whitespace
            .trim();
    }

    /**
     * Normalize weight class to standard abbreviation
     */
    normalizeWeightClass(weightClass) {
        if (!weightClass) return 'Unknown';

        const lower = weightClass.toLowerCase().trim();

        // Check direct mapping
        for (const [key, value] of Object.entries(this.weightClassMap)) {
            if (lower.includes(key)) {
                return value;
            }
        }

        // Try to extract from patterns like "265 lbs" or "Heavyweight Bout"
        if (lower.includes('265') || lower.includes('heavy')) return 'HW';
        if (lower.includes('205') || lower.includes('light heavy')) return 'LHW';
        if (lower.includes('185') || lower.includes('middle')) return 'MW';
        if (lower.includes('170') || lower.includes('welter')) return 'WW';
        if (lower.includes('155') || lower.includes('light') && !lower.includes('heavy')) return 'LW';
        if (lower.includes('145') || lower.includes('feather')) return 'FW';
        if (lower.includes('135') || lower.includes('bantam')) return 'BW';
        if (lower.includes('125') || lower.includes('fly')) return 'FLW';

        // Women's divisions
        if (lower.includes('women') || lower.includes('w-')) {
            if (lower.includes('115') || lower.includes('straw')) return 'WSW';
            if (lower.includes('125') || lower.includes('fly')) return 'WFLW';
            if (lower.includes('135') || lower.includes('bantam')) return 'WBW';
            if (lower.includes('145') || lower.includes('feather')) return 'WFW';
        }

        return 'Unknown';
    }

    /**
     * Validate fetched fight card
     */
    validateFightCard(fights) {
        const valid = [];

        for (const fight of fights) {
            if (fight.fighterA?.name && fight.fighterB?.name) {
                valid.push({
                    ...fight,
                    fighterA: { name: fight.fighterA.name },
                    fighterB: { name: fight.fighterB.name },
                    weightClass: fight.weightClass || 'Unknown',
                    approved: fight.approved !== false
                });
            }
        }

        return valid;
    }

    /**
     * Cache fight card for an event
     */
    async cacheFightCard(eventId, fights, source) {
        const cacheData = {
            eventId,
            fights,
            source,
            cachedAt: new Date().toISOString()
        };

        localStorage.setItem(`fightCard_${eventId}`, JSON.stringify(cacheData));
        return cacheData;
    }

    /**
     * Get cached fight card for an event
     */
    getCachedFightCard(eventId) {
        const cached = localStorage.getItem(`fightCard_${eventId}`);
        if (cached) {
            return JSON.parse(cached);
        }
        return null;
    }

    /**
     * Clear cached fight card
     */
    clearCachedFightCard(eventId) {
        localStorage.removeItem(`fightCard_${eventId}`);
    }

    /**
     * Check if Gemini API is configured
     */
    isGeminiConfigured() {
        return !!this.geminiApiKey || !!localStorage.getItem('geminiApiKey');
    }
}

// Export singleton instance
const fightCardFetcher = new FightCardFetcher();
// Load API key from storage on init
fightCardFetcher.loadGeminiApiKey();
