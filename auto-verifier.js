const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Configuration
const RESULTS_DIR = path.join(__dirname, 'results');

async function main() {
    const argv = yargs(hideBin(process.argv))
        .option('event', {
            alias: 'e',
            type: 'string',
            description: 'Event name to verify (e.g., "UFC 300")'
        })
        .option('url', {
            alias: 'u',
            type: 'string',
            description: 'Direct URL to Tapology/UFC results page'
        })
        .option('save', {
            alias: 's',
            type: 'boolean',
            description: 'Save verification results to file',
            default: true
        })
        .option('visible', {
            alias: 'v',
            type: 'boolean',
            description: 'Run in visible mode (not headless) to inspect or solve CAPTCHAs',
            default: false
        })
        .help()
        .argv;

    console.log('--- UFC Data Auto-Verifier (Headless Browser) ---');

    if (!argv.event && !argv.url) {
        console.error('Error: Please provide an --event name or a direct --url.');
        process.exit(1);
    }

    const browser = await puppeteer.launch({
        headless: argv.visible ? false : 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Set a real User-Agent to avoid basic bot detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        let url = argv.url;

        if (!url) {
            console.log(`Searching for results for "${argv.event}"...`);
            url = await searchForEventUrl(page, argv.event);
            if (!url) {
                console.error('Could not find a results page. Please provide a --url manually.');
                await browser.close();
                process.exit(1);
            }
        }

        console.log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        // Wait for results to load (Tapology might be slow)
        try {
            await page.waitForSelector('.fightCard, .c-listing-fight', { timeout: 10000 });
        } catch (e) {
            console.log('Timeout waiting for fight card selector. Proceeding with best effort...');
        }

        const results = await scrapePageData(page, url);

        if (results.length === 0) {
            console.log('No results found. The page structure might have changed or it is not a supported site.');
        } else {
            console.log(`Found ${results.length} fight results.`);
            console.table(results.slice(0, 5)); // Show preview

            if (argv.save) {
                const filename = `verification_${new Date().toISOString().split('T')[0]}.json`;
                // Create results directory if it doesn't exist
                if (!fs.existsSync(RESULTS_DIR)) {
                    fs.mkdirSync(RESULTS_DIR);
                }
                const filepath = path.join(RESULTS_DIR, filename);

                const output = {
                    source: url,
                    verifiedAt: new Date().toISOString(),
                    results: results
                };

                fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
                console.log(`Saved verification data to ${filepath}`);
            }
        }

    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        await browser.close();
    }
}

async function searchForEventUrl(page, eventName) {
    // Strategy: Use Google Search via Puppeteer
    const query = `site:tapology.com/fightcenter/events ${eventName} results`;
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

    console.log(`Performing Google Search: ${googleUrl}`);
    await page.goto(googleUrl, { waitUntil: 'domcontentloaded' });

    // Extract first valid Tapology link
    const link = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a'));
        for (const a of anchors) {
            if (a.href && a.href.includes('tapology.com/fightcenter/events/')) {
                return a.href;
            }
        }
        return null;
    });

    if (link) {
        console.log(`Found event URL: ${link}`);
        return link;
    }

    return null;
}

async function scrapePageData(page, url) {
    return await page.evaluate((currentUrl) => {
        const data = [];

        if (currentUrl.includes('tapology.com')) {
            // Tapology Scraper Logic (Browser Context)
            const items = document.querySelectorAll('ul.fightCard li, .fightCard table tr');

            items.forEach(el => {
                // Heuristic for winner/loser: first two 'a.link-primary-red' or explicit winner/loser classes
                const winnerEl = el.querySelector('.fightCardResult .winner, .winner, a.link-primary-red:nth-of-type(1)');
                const loserEl = el.querySelector('.fightCardResult .loser, .loser, a.link-primary-red:nth-of-type(2)');
                const methodEl = el.querySelector('.fightCardResult .method, .method');

                if (winnerEl && loserEl) {
                    const winner = winnerEl.innerText.trim();
                    const loser = loserEl.innerText.trim();
                    const methodText = methodEl ? methodEl.innerText.trim() : 'Decision';

                    let method = 'DEC';
                    if (methodText.match(/KO|TKO/i)) method = 'KO';
                    else if (methodText.match(/Sub/i)) method = 'SUB';
                    else if (methodText.match(/Draw/i)) method = 'DRAW';

                    let round = 'DEC';
                    const roundMatch = methodText.match(/R(\d)/);
                    if (roundMatch) round = 'R' + roundMatch[1];

                    data.push({ winner, loser, method, round, sourceMethod: methodText });
                }
            });
        }
        return data;
    }, url);
}

main().catch(console.error);
