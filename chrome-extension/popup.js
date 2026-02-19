// UFC Data Collector - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const collectBtn = document.getElementById('collect-btn');
  const sendBtn = document.getElementById('send-btn');
  const copyBtn = document.getElementById('copy-btn');
  const clearBtn = document.getElementById('clear-btn');
  const statusEl = document.getElementById('status');
  const countEl = document.getElementById('fighter-count');
  const collectedDataEl = document.getElementById('collected-data');
  const fighterListEl = document.getElementById('fighter-list');

  // Load stored data
  const stored = await chrome.storage.local.get(['collectedFighters', 'sources']);
  let collectedFighters = stored.collectedFighters || {};
  let sources = stored.sources || { tapology: false, dratings: false, fightmatrix: false };

  updateUI();

  // Collect data from current page
  collectBtn.addEventListener('click', async () => {
    try {
      statusEl.className = 'status collecting';
      statusEl.textContent = 'Collecting data...';

      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab.url;

      // Determine which scraper to use based on URL
      let scraperFn;
      let sourceName;

      if (url.includes('tapology.com')) {
        scraperFn = scrapeTapology;
        sourceName = 'tapology';
      } else if (url.includes('dratings.com')) {
        scraperFn = scrapeDRatings;
        sourceName = 'dratings';
      } else if (url.includes('fightmatrix.com')) {
        scraperFn = scrapeFightMatrix;
        sourceName = 'fightmatrix';
      } else {
        throw new Error('Not on a supported site (Tapology, DRatings, or FightMatrix)');
      }

      // Inject and execute the scraper
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scraperFn
      });

      if (results && results[0] && results[0].result) {
        const data = results[0].result;
        console.log('Scraped data:', data);

        if (data.fighters.length === 0) {
          statusEl.className = 'status error';
          statusEl.textContent = `No fighters found on this page. Check console for debug info.`;
          return;
        }

        // Merge new data with existing
        for (const fighter of data.fighters) {
          const existingKeys = Object.keys(collectedFighters);
          const key = findMatchingKey(fighter.name, existingKeys);
          if (!collectedFighters[key]) {
            collectedFighters[key] = { name: fighter.name };
          }
          // Merge data sources
          if (fighter.tapology !== undefined) {
            // Store tapology as nested object with consensus and method breakdown
            // This matches the structure expected by prediction-engine.js
            if (typeof collectedFighters[key].tapology !== 'object') {
              collectedFighters[key].tapology = {};
            }
            collectedFighters[key].tapology.consensus = fighter.tapology;
            sources.tapology = true;
          }
          if (fighter.dratings !== undefined) {
            collectedFighters[key].dratings = fighter.dratings;
            sources.dratings = true;
          }
          if (fighter.cirrs !== undefined) {
            collectedFighters[key].cirrs = fighter.cirrs;
            sources.fightmatrix = true;
          }
          // Merge expanded FightMatrix data
          if (fighter.eloK170 !== undefined) {
            if (!collectedFighters[key].fightmatrix) collectedFighters[key].fightmatrix = {};
            collectedFighters[key].fightmatrix.eloK170 = fighter.eloK170;
          }
          if (fighter.eloMod !== undefined) {
            if (!collectedFighters[key].fightmatrix) collectedFighters[key].fightmatrix = {};
            collectedFighters[key].fightmatrix.eloMod = fighter.eloMod;
          }
          if (fighter.glicko !== undefined) {
            if (!collectedFighters[key].fightmatrix) collectedFighters[key].fightmatrix = {};
            collectedFighters[key].fightmatrix.glicko = fighter.glicko;
          }
          if (fighter.whr !== undefined) {
            if (!collectedFighters[key].fightmatrix) collectedFighters[key].fightmatrix = {};
            collectedFighters[key].fightmatrix.whr = fighter.whr;
          }
          if (fighter.bettingWinPct !== undefined) {
            if (!collectedFighters[key].fightmatrix) collectedFighters[key].fightmatrix = {};
            collectedFighters[key].fightmatrix.bettingWinPct = fighter.bettingWinPct;
            collectedFighters[key].fightmatrix.bettingOdds = fighter.bettingOdds;
          }
          if (fighter.age !== undefined) {
            if (!collectedFighters[key].fightmatrix) collectedFighters[key].fightmatrix = {};
            collectedFighters[key].fightmatrix.age = fighter.age;
          }
          if (fighter.daysSinceLastFight !== undefined) {
            if (!collectedFighters[key].fightmatrix) collectedFighters[key].fightmatrix = {};
            collectedFighters[key].fightmatrix.daysSinceLastFight = fighter.daysSinceLastFight;
          }
          if (fighter.ranking !== undefined) {
            if (!collectedFighters[key].fightmatrix) collectedFighters[key].fightmatrix = {};
            collectedFighters[key].fightmatrix.ranking = fighter.ranking;
          }
          if (fighter.record !== undefined) {
            if (!collectedFighters[key].fightmatrix) collectedFighters[key].fightmatrix = {};
            collectedFighters[key].fightmatrix.record = fighter.record;
          }
          if (fighter.last3Record !== undefined) {
            if (!collectedFighters[key].fightmatrix) collectedFighters[key].fightmatrix = {};
            collectedFighters[key].fightmatrix.last3Record = fighter.last3Record;
          }
          // Merge method prediction data (TKO/SUB/DEC) into tapology object
          if (fighter.tko !== undefined || fighter.sub !== undefined || fighter.dec !== undefined) {
            if (typeof collectedFighters[key].tapology !== 'object') {
              collectedFighters[key].tapology = {};
            }
            if (fighter.tko !== undefined) collectedFighters[key].tapology.koTko = fighter.tko;
            if (fighter.sub !== undefined) collectedFighters[key].tapology.sub = fighter.sub;
            if (fighter.dec !== undefined) collectedFighters[key].tapology.dec = fighter.dec;
          }
        }

        // Save to storage
        await chrome.storage.local.set({ collectedFighters, sources });

        statusEl.className = 'status ready';
        statusEl.textContent = `Collected ${data.fighters.length} fighters from ${data.source}`;
        updateUI();
      } else {
        throw new Error('No data returned from scraper');
      }
    } catch (error) {
      console.error('Collection error:', error);
      statusEl.className = 'status error';
      statusEl.textContent = 'Error: ' + error.message;
    }
  });

  // Copy to clipboard
  copyBtn.addEventListener('click', async () => {
    const fighters = Object.values(collectedFighters);
    const json = JSON.stringify(fighters, null, 2);
    await navigator.clipboard.writeText(json);
    statusEl.textContent = 'Copied to clipboard!';
    setTimeout(() => {
      statusEl.textContent = 'Ready to collect data';
    }, 2000);
  });

  // Clear data
  clearBtn.addEventListener('click', async () => {
    collectedFighters = {};
    sources = { tapology: false, dratings: false, fightmatrix: false };
    await chrome.storage.local.set({ collectedFighters, sources });
    updateUI();
    statusEl.textContent = 'Data cleared';
  });

  // Send to App
  sendBtn.addEventListener('click', async () => {
    try {
      const fighters = Object.values(collectedFighters);
      if (fighters.length === 0) return;

      statusEl.className = 'status collecting';
      statusEl.textContent = 'Sending to app...';

      // Send to localhost
      const response = await fetch('http://localhost:5555/api/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fighters: fighters, source: 'extension' })
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const result = await response.json();
      console.log('Server response:', result);

      statusEl.className = 'status ready';
      statusEl.textContent = `Sent ${fighters.length} fighters to App!`;

      // Flash success
      sendBtn.textContent = 'Sent Successfully!';
      setTimeout(() => {
        sendBtn.textContent = 'Send to App (Localhost)';
        statusEl.textContent = 'Ready to collect data';
      }, 3000);

    } catch (error) {
      console.error('Send error:', error);
      statusEl.className = 'status error';
      statusEl.textContent = 'Failed to send: ' + error.message + '. Is the app running?';
    }
  });

  // Collect results (post-event)
  const collectResultsBtn = document.getElementById('collect-results-btn');
  collectResultsBtn.addEventListener('click', async () => {
    try {
      statusEl.className = 'status collecting';
      statusEl.textContent = 'Collecting results...';

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab.url;

      let scraperFn;
      if (url.includes('tapology.com')) {
        scraperFn = scrapeTapologyResults;
      } else if (url.includes('ufc.com')) {
        scraperFn = scrapeUFCResults;
      } else {
        throw new Error('Results scraping only supported on Tapology or UFC.com event pages');
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scraperFn
      });

      const data = results[0].result;
      if (!data || !data.results || data.results.length === 0) {
        throw new Error('No results found on this page');
      }

      // Copy results to clipboard
      const json = JSON.stringify(data.results, null, 2);
      await navigator.clipboard.writeText(json);

      statusEl.className = 'status ready';
      statusEl.textContent = `Copied ${data.results.length} fight results to clipboard!`;
    } catch (error) {
      statusEl.className = 'status error';
      statusEl.textContent = error.message;
    }
  });

  function updateUI() {
    const fighterArray = Object.values(collectedFighters);
    countEl.textContent = fighterArray.length;
    copyBtn.disabled = fighterArray.length === 0;
    if (sendBtn) sendBtn.disabled = fighterArray.length === 0;

    // Update source badges
    document.getElementById('badge-tapology').className = 'badge' + (sources.tapology ? ' active' : '');
    document.getElementById('badge-dratings').className = 'badge' + (sources.dratings ? ' active' : '');
    document.getElementById('badge-fightmatrix').className = 'badge' + (sources.fightmatrix ? ' active' : '');

    // Show/hide collected data
    if (fighterArray.length > 0) {
      collectedDataEl.style.display = 'block';
      fighterListEl.innerHTML = fighterArray.map(f => {
        // Handle nested tapology structure
        const tapologyConsensus = typeof f.tapology === 'object' ? f.tapology.consensus : f.tapology;
        return `
        <div class="fighter-item">
          <span class="fighter-name">${f.name}</span>
          <span class="fighter-data">
            ${tapologyConsensus !== undefined ? `T:${tapologyConsensus}%` : ''}
            ${f.dratings !== undefined ? `D:${f.dratings}%` : ''}
            ${f.cirrs !== undefined ? `FM:${f.cirrs}` : ''}
          </span>
        </div>
      `;
      }).join('');
    } else {
      collectedDataEl.style.display = 'none';
    }
  }

  function normalizeName(name) {
    // Remove accents (Natália -> Natalia)
    const withoutAccents = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Lowercase
    const lower = withoutAccents.toLowerCase();
    // Expand common abbreviations (St. -> Saint, Jr. -> Junior, etc.)
    const expanded = lower
      .replace(/\bst\.\s*/g, 'saint ')
      .replace(/\bjr\.\s*/g, 'junior ')
      .replace(/\bsr\.\s*/g, 'senior ');
    // Remove non-alpha chars and collapse whitespace
    const cleaned = expanded.replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
    // Sort name parts alphabetically to handle "Song Yadong" vs "Yadong Song"
    const parts = cleaned.split(' ').sort();
    return parts.join(' ');
  }

  // Find existing key that matches a fighter name (handles partial matches)
  function findMatchingKey(name, existingKeys) {
    const normalizedNew = normalizeName(name);

    // Exact match first
    if (existingKeys.includes(normalizedNew)) {
      return normalizedNew;
    }

    // Get last name (last word after normalization, before sorting)
    const withoutAccents = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const cleaned = withoutAccents.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
    const nameParts = cleaned.split(' ');
    const lastName = nameParts[nameParts.length - 1];
    const firstName = nameParts[0];

    // Look for partial matches by last name + first name
    for (const key of existingKeys) {
      const keyParts = key.split(' ');
      // Check if last name and first name both appear in the key
      if (keyParts.includes(lastName) && keyParts.includes(firstName)) {
        return key;
      }
      // Check if it's just first + last vs full name (e.g., "ateba gautier" vs "abega ateba gautier")
      if (keyParts.includes(lastName) && keyParts.some(p => p === firstName || firstName.includes(p) || p.includes(firstName))) {
        return key;
      }
    }

    // No match found, return normalized new name
    return normalizedNew;
  }
});

// ============================================================
// SCRAPER FUNCTIONS - These run in the context of the web page
// ============================================================

function scrapeTapology() {
  console.log('[UFC Scraper] Running Tapology scraper...');
  const fighters = [];
  const seenNames = new Set();

  // Words to filter out - these aren't fighter names
  const filterWords = ['decision', 'submission', 'knockout', 'events', 'bouts', 'round', 'method', 'main', 'prelim', 'card', 'fight', 'view', 'save', 'pick', 'help', 'left', 'right', 'choose', 'previous', 'next', 'ranking', 'record', 'unranked', 'event', 'co-main', 'preliminary'];

  const fullText = document.body.innerText;
  console.log('[UFC Scraper] Page text sample:', fullText.substring(0, 500));

  // Try to extract method bars from DOM
  // Tapology uses classes like: tko_bar_slim, sub_bar_slim, dec_bar_slim (or total_bar_slim)
  // The width style contains the percentage (e.g., style="width: 35.5%")
  const methodDataByName = {};

  // Helper to extract width percentage from element
  const getWidthPct = (el) => {
    if (!el) return 0;
    const width = el.style?.width || '';
    const match = width.match(/([\d.]+)%/);
    return match ? Math.round(parseFloat(match[1])) : 0;
  };

  // Strategy 1: Look for fighter containers with method bars inside
  // Tapology often has fighter info in sections/divs with links to fighter pages
  const fighterLinks = document.querySelectorAll('a[href*="/fightcenter/fighters/"]');
  console.log('[UFC Scraper] Found fighter links:', fighterLinks.length);

  fighterLinks.forEach((link, idx) => {
    const name = link.textContent.trim();
    if (!name || name.length < 3 || filterWords.includes(name.toLowerCase())) return;

    // Look for method bars in the parent containers (go up a few levels)
    let container = link.parentElement;
    for (let i = 0; i < 5 && container; i++) {
      // Look for bar elements with _slim suffix (Tapology's actual class names)
      const tkoBar = container.querySelector('[class*="tko_bar"], .tko_bar_slim');
      const subBar = container.querySelector('[class*="sub_bar"], .sub_bar_slim');
      const decBar = container.querySelector('[class*="dec_bar"], .dec_bar_slim');

      if (tkoBar || subBar || decBar) {
        const key = name.toLowerCase();
        if (!methodDataByName[key]) {
          methodDataByName[key] = { name };
        }

        const tko = getWidthPct(tkoBar);
        const sub = getWidthPct(subBar);
        const dec = getWidthPct(decBar);

        if (tko > 0) methodDataByName[key].tko = tko;
        if (sub > 0) methodDataByName[key].sub = sub;
        if (dec > 0) methodDataByName[key].dec = dec;

        console.log('[UFC Scraper] Found method bars for', name, '- TKO:', tko, 'SUB:', sub, 'DEC:', dec);
        break; // Found bars, stop climbing
      }
      container = container.parentElement;
    }
  });

  // Helper to normalize names for matching (strips apostrophes, hyphens, accents, etc.)
  const normalizeForMatch = (name) => {
    // First normalize accents (Natália -> Natalia)
    const withoutAccents = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Then lowercase and remove non-alpha chars
    return withoutAccents.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  };

  // Strategy 2: Collect method bars by index
  // IMPORTANT: Method bars are ordered by FAVORITE (higher consensus %), not by left/right position
  // Bar 0,2,4... = favorite's method breakdown for each fight
  // Bar 1,3,5... = underdog's method breakdown for each fight
  // We store bars by index now, then match to fighters AFTER we know consensus percentages
  console.log('[UFC Scraper] Collecting method bars by index...');

  // Helper to extract width percentage
  const extractWidth = (el) => {
    if (!el) return 0;
    const width = el.style?.width || '';
    const match = width.match(/([\d.]+)%/);
    return match ? Math.round(parseFloat(match[1])) : 0;
  };

  // Get all method bars in DOM order
  const allTkoBars = Array.from(document.querySelectorAll('[class*="tko_bar"]'));
  const allSubBars = Array.from(document.querySelectorAll('[class*="sub_bar"]'));
  const allDecBars = Array.from(document.querySelectorAll('[class*="dec_bar"]'));
  console.log('[UFC Scraper] Found bars - TKO:', allTkoBars.length, 'SUB:', allSubBars.length, 'DEC:', allDecBars.length);

  // Store method data by bar index (will match to fighters later based on consensus %)
  const methodBarsByIndex = [];
  for (let i = 0; i < allTkoBars.length; i++) {
    const tko = extractWidth(allTkoBars[i]);
    const sub = extractWidth(allSubBars[i]);
    const dec = extractWidth(allDecBars[i]);
    methodBarsByIndex.push({ tko, sub, dec });
    console.log('[UFC Scraper] Bar', i, '- TKO:', tko, 'SUB:', sub, 'DEC:', dec);
  }

  console.log('[UFC Scraper] Stored', methodBarsByIndex.length, 'method bar sets for later matching');

  // Build fight matchups list from "Fighter1 vs Fighter2" patterns
  // These appear in fight card order on the page (main event first)
  const fightMatchups = []; // Array of {fighter1: name, fighter2: name}
  // Context-aware line parser to handle duplicate names (e.g., Javid Basharat vs Farid Basharat)
  const consensusByName = {};

  // --- STATE MACHINE APPROACH ---

  // Normalize diacritics for matching: ł→l, é→e, etc.
  // NFD decomposition handles most (é, ñ, ü, etc.) but not ł, ø, đ which are single codepoints
  const stripDiacritics = (text) => {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[łŁ]/g, m => m === 'ł' ? 'l' : 'L')
      .replace(/[øØ]/g, m => m === 'ø' ? 'o' : 'O')
      .replace(/[đĐ]/g, m => m === 'đ' ? 'd' : 'D');
  };

const newLines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
let activeFighters = [];
let lastFighterSeen = null;

for (let i = 0; i < newLines.length; i++) {
  const line = stripDiacritics(newLines[i]);

  // Detect Matchup Header
  // Strip trailing card info (e.g. "Main Card | Middleweight · 185 lbs | ...")
  const vsLine = line.replace(/\s+(Main Card|Prelim|Early Prelim)\b.*$/i, '').replace(/\s*\|.*$/, '');
  const vsMatch = vsLine.match(/^([A-Z][a-zA-Z\-'.]+(?:\s+[A-Z][a-zA-Z\-'.]+)*)\s+vs\.?\s+([A-Z][a-zA-Z\-'.]+(?:\s+[A-Z][a-zA-Z\-'.]+)*)(?:\s+[IVX]+)?$/i);
  if (vsMatch) {
    const f1 = vsMatch[1].trim();
    const f2 = vsMatch[2].trim().replace(/\s+[IVX]+$/, '');
    // Validate
    const isName = (n) => !filterWords.includes(n.split(' ').pop().toLowerCase()) && n.split(' ').length <= 4;
    if (isName(f1) && isName(f2)) {
      activeFighters = [f1, f2];
      fightMatchups.push({ fighter1: f1, fighter2: f2 });

      // Init entries
      const k1 = f1.toLowerCase();
      const k2 = f2.toLowerCase();
      if (!consensusByName[k1]) consensusByName[k1] = { name: f1 };
      if (!consensusByName[k2]) consensusByName[k2] = { name: f2 };

      console.log('[UFC Scraper] Context:', f1, 'vs', f2);
    }
    continue;
  }

  if (activeFighters.length === 2) {
    // We are inside a matchup block

    // Check for "Name 55%" (Single line) — handles both "Oleksiejczuk 95%" and "J. Oleksiejczuk 95%"
    const combinedMatch = line.match(/^((?:[A-Z]\.?\s+)?[A-Z][a-zA-Z\-'.]+)\s+(\d{1,3})%$/);
    if (combinedMatch) {
      const name = combinedMatch[1].trim();
      const pct = parseInt(combinedMatch[2]);
      // Match to active fighters using normalized last name comparison
      const nameLower = name.toLowerCase();
      const target = activeFighters.find(f => {
        const fLower = f.toLowerCase();
        const fLastName = f.split(' ').pop().toLowerCase();
        return fLower.includes(nameLower) || fLastName === nameLower || nameLower.includes(fLastName);
      });
      if (target) {
        const key = target.toLowerCase();
        consensusByName[key].tapology = pct;
        console.log(`[UFC Scraper] Matched combined "${name}" -> ${target} (${pct}%)`);
      }
      continue;
    }

    // Check for "55%" (Multi-line)
    const pctMatch = line.match(/^(\d{1,3})%$/);
    if (pctMatch) {
      const pct = parseInt(pctMatch[1]);
      if (lastFighterSeen && pct > 0 && pct <= 100) {
        const key = lastFighterSeen.toLowerCase();
        consensusByName[key].tapology = pct;
        lastFighterSeen = null; // Reset
      }
      continue;
    }

    // This line might be just a Name?
    // Check if it matches one of our active fighters
    const matchedF = activeFighters.find(f => {
      const parts = f.split(' ');
      const lastName = parts[parts.length - 1];
      return line.includes(lastName) || line === f || (line.length > 3 && f.includes(line));
    });

    if (matchedF && !filterWords.includes(line.toLowerCase())) {
      lastFighterSeen = matchedF;
    }
  }
}

console.log('[UFC Scraper] Found', fightMatchups.length, 'fight matchups');
console.log('[UFC Scraper] Found consensus for', Object.keys(consensusByName).length, 'fighters');

// Now process fights in order, matching bars based on favorite/underdog
// Bars are in fight card order: fight 0 bars at 0,1; fight 1 bars at 2,3; etc.
console.log('[UFC Scraper] Matching method bars to fighters by fight order and consensus %...');

for (let fightIdx = 0; fightIdx < fightMatchups.length; fightIdx++) {
  const matchup = fightMatchups[fightIdx];
  const f1Key = matchup.fighter1.toLowerCase();
  const f2Key = matchup.fighter2.toLowerCase();

  const f1Data = consensusByName[f1Key];
  const f2Data = consensusByName[f2Key];

  if (!f1Data || !f2Data) {
    console.log('[UFC Scraper] Fight', fightIdx, '- Missing consensus data for', matchup.fighter1, 'or', matchup.fighter2);
    continue;
  }

  const barIdx1 = fightIdx * 2;     // First bar for this fight (favorite's bar)
  const barIdx2 = fightIdx * 2 + 1; // Second bar for this fight (underdog's bar)

  if (barIdx1 >= methodBarsByIndex.length || barIdx2 >= methodBarsByIndex.length) {
    console.log('[UFC Scraper] Fight', fightIdx, '- No bars available at indices', barIdx1, barIdx2);
    continue;
  }

  const favoriteBar = methodBarsByIndex[barIdx1];
  const underdogBar = methodBarsByIndex[barIdx2];

  // Determine who is favorite (higher consensus %)
  const f1IsFavorite = f1Data.tapology >= f2Data.tapology;

  if (f1IsFavorite) {
    // Fighter1 is favorite, gets bar at even index
    if (favoriteBar.tko > 0) f1Data.tko = favoriteBar.tko;
    if (favoriteBar.sub > 0) f1Data.sub = favoriteBar.sub;
    if (favoriteBar.dec > 0) f1Data.dec = favoriteBar.dec;
    // Fighter2 is underdog, gets bar at odd index
    if (underdogBar.tko > 0) f2Data.tko = underdogBar.tko;
    if (underdogBar.sub > 0) f2Data.sub = underdogBar.sub;
    if (underdogBar.dec > 0) f2Data.dec = underdogBar.dec;
  } else {
    // Fighter2 is favorite, gets bar at even index
    if (favoriteBar.tko > 0) f2Data.tko = favoriteBar.tko;
    if (favoriteBar.sub > 0) f2Data.sub = favoriteBar.sub;
    if (favoriteBar.dec > 0) f2Data.dec = favoriteBar.dec;
    // Fighter1 is underdog, gets bar at odd index
    if (underdogBar.tko > 0) f1Data.tko = underdogBar.tko;
    if (underdogBar.sub > 0) f1Data.sub = underdogBar.sub;
    if (underdogBar.dec > 0) f1Data.dec = underdogBar.dec;
  }
}

  // Re-build clean fighters array
  const finalFighters = Object.values(consensusByName);

  console.log('[UFC Scraper] Final fighters with method data:', finalFighters);
  return { source: 'Tapology', fighters: finalFighters };
}

function scrapeDRatings() {
  console.log('[UFC Scraper] Running DRatings scraper...');
  const fighters = [];
  const seenNames = new Set();

  // DRatings DOM structure:
  // <td class="ta--left">Fighter1 Name<br>Fighter2 Name</td>
  // <td class="table-division"><span class="tc--green">XX.X%</span><br><span class="tc--red">XX.X%</span></td>
  // First percentage (green) = Fighter1's win %, Second percentage (red) = Fighter2's win %

  // Find the "Completed Fights" heading to know where to stop
  const completedHeading = Array.from(document.querySelectorAll('h2, h3')).find(
    h => h.textContent.toLowerCase().includes('completed')
  );
  console.log('[UFC Scraper] Completed heading found:', !!completedHeading);

  // Find all table rows in the upcoming fights section
  const tables = document.querySelectorAll('table');
  console.log('[UFC Scraper] Found tables:', tables.length);

  tables.forEach((table, tableIdx) => {
    // Skip tables that come AFTER the "Completed Fights" heading
    if (completedHeading) {
      // Check if this table comes after the completed heading in DOM order
      const position = completedHeading.compareDocumentPosition(table);
      // DOCUMENT_POSITION_FOLLOWING = 4 means table comes after heading
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        console.log('[UFC Scraper] Skipping table', tableIdx, '- after Completed Fights heading');
        return;
      }
    }

    const rows = table.querySelectorAll('tr');
    rows.forEach((row, rowIdx) => {
      // Find cells with fighter names and percentages
      const cells = row.querySelectorAll('td');

      cells.forEach(cell => {
        // Look for cells containing fighter names (has <br> with two names)
        const cellHtml = cell.innerHTML;
        const cellText = cell.textContent;

        // Check if this looks like a names cell (contains <br> and has name-like text)
        if (cellHtml.includes('<br>') && cellText.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/)) {
          // Get the sibling cell with percentages
          const nextCell = cell.nextElementSibling;
          if (!nextCell) return;

          // Extract names by splitting on <br>
          const nameSpans = cell.innerHTML.split(/<br\s*\/?>/i);
          const names = nameSpans.map(html => {
            // Strip HTML tags and get clean name
            const temp = document.createElement('div');
            temp.innerHTML = html;
            return temp.textContent.trim();
          }).filter(n => n.length > 3 && n.match(/^[A-Z]/));

          // Extract percentages
          const pctSpans = nextCell.querySelectorAll('span');
          const percentages = [];
          pctSpans.forEach(span => {
            const pctMatch = span.textContent.match(/(\d{1,3}\.?\d?)%/);
            if (pctMatch) {
              percentages.push(parseFloat(pctMatch[1]));
            }
          });

          // Also try splitting by <br> if spans didn't work
          if (percentages.length === 0) {
            const pctParts = nextCell.innerHTML.split(/<br\s*\/?>/i);
            pctParts.forEach(part => {
              const pctMatch = part.match(/(\d{1,3}\.?\d?)%/);
              if (pctMatch) {
                percentages.push(parseFloat(pctMatch[1]));
              }
            });
          }

          console.log('[UFC Scraper] Row', rowIdx, 'names:', names, 'percentages:', percentages);

          // Match names to percentages (same order)
          if (names.length >= 2 && percentages.length >= 2) {
            for (let i = 0; i < Math.min(names.length, percentages.length); i++) {
              const name = names[i];
              const pct = percentages[i];
              const key = name.toLowerCase();

              if (!seenNames.has(key) && pct > 0 && pct <= 100) {
                seenNames.add(key);
                fighters.push({ name, dratings: pct });
                console.log('[UFC Scraper] Found (DOM):', name, pct + '%');
              }
            }
          }
        }
      });
    });
  });

  // Fallback to text parsing if DOM didn't find enough
  if (fighters.length < 10) {
    console.log('[UFC Scraper] DOM found only', fighters.length, 'fighters, trying text fallback...');

    const fullText = document.body.innerText;
    let textToScan = fullText;
    const completedIdx = fullText.toLowerCase().indexOf('completed fights');
    if (completedIdx > 0) {
      textToScan = fullText.substring(0, completedIdx);
    }

    const lines = textToScan.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Pattern: "Name XX.X%" on same line
      const sameLine = line.match(/^([A-Z][a-zà-ÿ]+(?:\s+[A-Z][a-zA-Zà-ÿ\-']+)+)\s+(\d{1,3}\.?\d?)%$/);
      if (sameLine) {
        const name = sameLine[1].trim();
        const pct = parseFloat(sameLine[2]);
        const key = name.toLowerCase();

        if (!seenNames.has(key) && pct > 0 && pct <= 100) {
          seenNames.add(key);
          fighters.push({ name, dratings: pct });
          console.log('[UFC Scraper] Found (text fallback):', name, pct + '%');
        }
      }
    }
  }

  console.log('[UFC Scraper] Total found:', fighters.length);
  return { source: 'DRatings', fighters };
}

function scrapeFightMatrix() {
  console.log('[UFC Scraper] Running FightMatrix scraper...');
  const fighters = [];
  const seenNames = new Set();

  const fullText = document.body.innerText;
  console.log('[UFC Scraper] Page text sample:', fullText.substring(0, 1500));

  // Helper to match name loosely
  const nameMatches = (fullName, partialName) => {
    const full = fullName.toLowerCase();
    const partial = partialName.toLowerCase().trim();
    const lastName = partial.split(' ').pop();
    return full.includes(lastName) || partial.includes(full.split(' ').pop());
  };

  // Find all matchup lines first using global regex
  // Patterns to handle:
  // [#5][#5UFC] Justin Gaethje (26-5-0, +191) vs. [#8][#7UFC] Paddy Pimblett (23-3-0, -235)
  // [#8P4P][#4][#4UFC] Natalia Silva (19-5-1, -423) vs. [#10P4P][#5][#5UFC] Rose Namajunas (14-7-0, +315)
  // [*] Arnold Allen (20-3-0, +225) vs. [#18][#13UFC] Jean Silva (16-3-0, -279)
  // [#7][#6UFC] Benoit St. Denis (16-3-0, -324) vs. [#8][#7UFC] Dan Hooker (24-13-0, +252)
  // Updated pattern: rankings can have P4P suffix, multiple brackets, or [*] for unranked
  // Name pattern includes period for abbreviations like "St." or "Jr."
  const matchupPattern = /(?:\[#(\d+)\w*\]|\[\*\])(?:\[#\d+\w*\])*\s*([A-Za-zÀ-ÿ\-'.]+(?:\s+[A-Za-zÀ-ÿ\-'.]+)+)\s*\((\d+-\d+-\d+),?\s*([+\-]?\d+)?\)\s*vs\.?\s*(?:\[#(\d+)\w*\]|\[\*\])(?:\[#\d+\w*\])*\s*([A-Za-zÀ-ÿ\-'.]+(?:\s+[A-Za-zÀ-ÿ\-'.]+)+)\s*\((\d+-\d+-\d+),?\s*([+\-]?\d+)?\)/gi;

  let matchupMatch;
  const matchups = [];

  while ((matchupMatch = matchupPattern.exec(fullText)) !== null) {
    matchups.push({
      fullMatch: matchupMatch[0],
      index: matchupMatch.index,
      fighter1: {
        name: matchupMatch[2].trim(),
        ranking: matchupMatch[1] ? parseInt(matchupMatch[1]) : null, // null for [*] unranked
        record: matchupMatch[3],
        bettingOdds: matchupMatch[4] ? parseInt(matchupMatch[4]) : null
      },
      fighter2: {
        name: matchupMatch[6].trim(),
        ranking: matchupMatch[5] ? parseInt(matchupMatch[5]) : null, // null for [*] unranked
        record: matchupMatch[7],
        bettingOdds: matchupMatch[8] ? parseInt(matchupMatch[8]) : null
      }
    });
    console.log('[UFC Scraper] Found matchup:', matchupMatch[2].trim(), 'vs', matchupMatch[6].trim());
  }

  console.log('[UFC Scraper] Total matchups found:', matchups.length);

  // Process each matchup and find associated data in the text that follows
  for (let i = 0; i < matchups.length; i++) {
    const matchup = matchups[i];
    const startIdx = matchup.index;
    const endIdx = (i + 1 < matchups.length) ? matchups[i + 1].index : fullText.length;
    const block = fullText.substring(startIdx, endIdx);

    console.log('[UFC Scraper] Processing block for:', matchup.fighter1.name, 'vs', matchup.fighter2.name);

    const fighter1 = matchup.fighter1;
    const fighter2 = matchup.fighter2;

    // Extract ages: Fighter Ages on Fight Day: Benoit St. Denis 30.1, Dan Hooker 35.9
    // Name pattern includes period for abbreviations like "St." or "Jr."
    const agePattern = /Fighter Ages[^:]*:\s*([A-Za-zÀ-ÿ\-'.\s]+?)\s+([\d.]+),?\s*([A-Za-zÀ-ÿ\-'.\s]+?)\s+([\d.]+)/i;
    const ageMatch = block.match(agePattern);
    if (ageMatch) {
      if (nameMatches(fighter1.name, ageMatch[1])) {
        fighter1.age = parseFloat(ageMatch[2]);
        fighter2.age = parseFloat(ageMatch[4]);
      } else {
        fighter1.age = parseFloat(ageMatch[4]);
        fighter2.age = parseFloat(ageMatch[2]);
      }
    }

    // Extract days since last fight
    const daysPattern = /Days Since Last[^:]*:\s*([A-Za-zÀ-ÿ\-'.\s]+?)\s+(\d+),?\s*([A-Za-zÀ-ÿ\-'.\s]+?)\s+(\d+)/i;
    const daysMatch = block.match(daysPattern);
    if (daysMatch) {
      if (nameMatches(fighter1.name, daysMatch[1])) {
        fighter1.daysSinceLastFight = parseInt(daysMatch[2]);
        fighter2.daysSinceLastFight = parseInt(daysMatch[4]);
      } else {
        fighter1.daysSinceLastFight = parseInt(daysMatch[4]);
        fighter2.daysSinceLastFight = parseInt(daysMatch[2]);
      }
    }

    // Extract rating systems from table
    // Extract rating systems from table - UPDATED to handle tabs/spaces better
    const ratingSystems = {};

    // Elo K170
    const eloK170Pattern = /Elo K170[\t\s]+([A-Za-zÀ-ÿ\-'.\s]+?)[\t\s]+([\d.]+)[\t\s]+([+\-]?[\d.]+)[\t\s]+([\d.]+)%/i;
    const eloK170Match = block.match(eloK170Pattern);
    if (eloK170Match) {
      ratingSystems.eloK170 = {
        favorite: eloK170Match[1].trim(),
        rating: parseFloat(eloK170Match[2]),
        diff: parseFloat(eloK170Match[3]),
        winPct: parseFloat(eloK170Match[4])
      };
    }

    // Elo Modified
    const eloModPattern = /Elo Modified[\t\s]+([A-Za-zÀ-ÿ\-'.\s]+?)[\t\s]+([\d.]+)[\t\s]+([+\-]?[\d.]+)[\t\s]+([\d.]+)%/i;
    const eloModMatch = block.match(eloModPattern);
    if (eloModMatch) {
      ratingSystems.eloMod = {
        favorite: eloModMatch[1].trim(),
        rating: parseFloat(eloModMatch[2]),
        diff: parseFloat(eloModMatch[3]),
        winPct: parseFloat(eloModMatch[4])
      };
    }

    // Glicko-1
    const glickoPattern = /Glicko-1[\t\s]+([A-Za-zÀ-ÿ\-'.\s]+?)[\t\s]+([\d.]+)[\t\s]+([+\-]?[\d.]+)[\t\s]+([\d.]+)%/i;
    const glickoMatch = block.match(glickoPattern);
    if (glickoMatch) {
      ratingSystems.glicko = {
        favorite: glickoMatch[1].trim(),
        rating: parseFloat(glickoMatch[2]),
        diff: parseFloat(glickoMatch[3]),
        winPct: parseFloat(glickoMatch[4])
      };
    }

    // WHR (Whole-History Rating)
    const whrPattern = /WHR[\t\s]+([A-Za-zÀ-ÿ\-'.\s]+?)[\t\s]+([\d.]+)[\t\s]+([+\-]?[\d.]+)[\t\s]+([\d.]+)%/i;
    const whrMatch = block.match(whrPattern);
    if (whrMatch) {
      ratingSystems.whr = {
        favorite: whrMatch[1].trim(),
        rating: parseFloat(whrMatch[2]),
        diff: parseFloat(whrMatch[3]),
        winPct: parseFloat(whrMatch[4])
      };
    }

    // Betting Odds from table
    const oddsPattern = /Betting Odds[\t\s]+([A-Za-zÀ-ÿ\-'.\s]+?)[\t\s]+([+\-]?\d+)[\t\s]+([\d.]+)%/i;
    const oddsMatch = block.match(oddsPattern);
    if (oddsMatch) {
      ratingSystems.bettingOdds = {
        favorite: oddsMatch[1].trim(),
        odds: parseInt(oddsMatch[2]),
        winPct: parseFloat(oddsMatch[3])
      };
    }

    // Extract last 3 fight records
    const last3Pattern = /Last 3 Fights:\s*([A-Za-zÀ-ÿ\-'.\s]+?)\s*\((\d+-\d+-\d+)\)/gi;
    let last3Match;
    while ((last3Match = last3Pattern.exec(block)) !== null) {
      if (nameMatches(fighter1.name, last3Match[1])) {
        fighter1.last3Record = last3Match[2];
      } else if (nameMatches(fighter2.name, last3Match[1])) {
        fighter2.last3Record = last3Match[2];
      }
    }

    // Assign rating data to fighters
    const assignRatingToFighters = (system, data) => {
      if (!data) return;
      const isFighter1Fav = nameMatches(fighter1.name, data.favorite);

      if (isFighter1Fav) {
        fighter1[system] = { rating: data.rating, diff: data.diff, winPct: data.winPct };
        fighter2[system] = { rating: data.rating - data.diff, diff: -data.diff, winPct: 100 - data.winPct };
      } else {
        fighter2[system] = { rating: data.rating, diff: data.diff, winPct: data.winPct };
        fighter1[system] = { rating: data.rating - data.diff, diff: -data.diff, winPct: 100 - data.winPct };
      }
    };

    assignRatingToFighters('eloK170', ratingSystems.eloK170);
    assignRatingToFighters('eloMod', ratingSystems.eloMod);
    assignRatingToFighters('glicko', ratingSystems.glicko);
    assignRatingToFighters('whr', ratingSystems.whr);

    // Handle betting odds
    if (ratingSystems.bettingOdds) {
      const isFighter1Fav = nameMatches(fighter1.name, ratingSystems.bettingOdds.favorite);
      if (isFighter1Fav) {
        fighter1.bettingWinPct = ratingSystems.bettingOdds.winPct;
        fighter2.bettingWinPct = 100 - ratingSystems.bettingOdds.winPct;
      } else {
        fighter2.bettingWinPct = ratingSystems.bettingOdds.winPct;
        fighter1.bettingWinPct = 100 - ratingSystems.bettingOdds.winPct;
      }
    }

    // Use Elo K170 rating as the primary CIRRS value for backwards compatibility
    if (fighter1.eloK170) fighter1.cirrs = Math.round(fighter1.eloK170.rating);
    if (fighter2.eloK170) fighter2.cirrs = Math.round(fighter2.eloK170.rating);

    // Add fighters to list
    const key1 = fighter1.name.toLowerCase();
    const key2 = fighter2.name.toLowerCase();

    if (!seenNames.has(key1)) {
      seenNames.add(key1);
      fighters.push(fighter1);
      console.log('[UFC Scraper] Added fighter:', fighter1.name, fighter1);
    }

    if (!seenNames.has(key2)) {
      seenNames.add(key2);
      fighters.push(fighter2);
      console.log('[UFC Scraper] Added fighter:', fighter2.name, fighter2);
    }
  }

  // Fallback: Simple pattern for basic CIRRS extraction if detailed parsing fails
  if (fighters.length === 0) {
    console.log('[UFC Scraper] Falling back to simple pattern matching...');
    const simplePattern = /([A-Z][a-z]+\s+[A-Z][a-zA-Z\-']+)\s+(\d{4})/g;
    let match;
    while ((match = simplePattern.exec(fullText)) !== null) {
      const name = match[1].trim();
      const cirrs = parseInt(match[2]);
      const key = name.toLowerCase();

      if (!seenNames.has(key) && cirrs >= 1000 && cirrs <= 2500) {
        seenNames.add(key);
        fighters.push({ name, cirrs });
        console.log('[UFC Scraper] Found via simple pattern:', name, 'CIRRS:', cirrs);
      }
    }
  }

  console.log('[UFC Scraper] Total found:', fighters.length);
  return { source: 'FightMatrix', fighters };
}

// ==================== RESULTS SCRAPERS ====================

function scrapeTapologyResults() {
  console.log('[UFC Scraper] Running Tapology results scraper...');
  const results = [];
  const seenFights = new Set();

  const fullText = document.body.innerText;

  // Tapology format: "Winner Name def Loser Name" on one line
  // Then method info like "KO/TKO, 0:26 R1" or "Unanimous Dec" nearby

  // Pattern handles:
  // - Full names: "Mauricio Ruffy"
  // - Abbreviated names: "A. Volkanovski", "B. Saint-Denis"
  // - Single-word names: "Sulangrangbo", "Yizha" (min 5 chars to avoid false positives)
  const namePattern = '(?:[A-Z]\\.?\\s*[A-Z][a-zA-Zà-ÿ\\-\']+(?:\\s+[A-Z][a-zA-Zà-ÿ\\-\']+)*|[A-Z][a-zA-Zà-ÿ\\-\']+(?:\\s+[A-Z][a-zA-Zà-ÿ\\-\']+)+|[A-Z][a-zA-Zà-ÿ]{4,})';
  const defPattern = new RegExp('(' + namePattern + ')\\s+def\\s+(' + namePattern + ')', 'g');

  let match;
  while ((match = defPattern.exec(fullText)) !== null) {
    const winner = match[1].trim();
    const loser = match[2].trim();

    // Skip if too short (likely false positive)
    if (winner.length < 5 || loser.length < 3) continue;

    // Create a key to avoid duplicates
    const key = winner.toLowerCase() + '-' + loser.toLowerCase();
    if (seenFights.has(key)) continue;
    seenFights.add(key);

    // Look for method info in nearby text, but STOP at the next fight indicator
    // This prevents grabbing method from the next fight
    let afterMatch = fullText.substring(match.index + match[0].length, match.index + match[0].length + 200);

    // Truncate at next fight marker (W\n, L\n, or next "def")
    const nextFightMarker = afterMatch.search(/\n[WL]\n|\sdef\s/i);
    if (nextFightMarker > 0) {
      afterMatch = afterMatch.substring(0, nextFightMarker);
    }

    console.log('[UFC Scraper] Method detection text for', winner, ':', afterMatch.substring(0, 60).replace(/\n/g, '|'));

    let method = 'DEC';
    let round = 'DEC';

    // Check for Decision FIRST (most common, and we want to catch "Unanimous Dec" before seeing KO from next fight)
    // Look for decision indicators appearing BEFORE any KO/SUB indicators
    const decMatch = afterMatch.match(/Unanimous|Majority|Split|Decision/i);
    const koMatch = afterMatch.match(/KO\/TKO|TKO\b|KO\b/i);
    const subMatch = afterMatch.match(/Submission|Sub\b|Technical Sub/i);

    // Find which method indicator appears first in the text
    const decPos = decMatch ? afterMatch.indexOf(decMatch[0]) : 999;
    const koPos = koMatch ? afterMatch.indexOf(koMatch[0]) : 999;
    const subPos = subMatch ? afterMatch.indexOf(subMatch[0]) : 999;

    // Use whichever method appears first
    if (koPos < decPos && koPos < subPos) {
      method = 'KO';
    } else if (subPos < decPos && subPos < koPos) {
      method = 'SUB';
    } else if (decPos < 999) {
      method = 'DEC';
    }
    // Default remains DEC if nothing found

    // Extract round if not a decision
    if (method !== 'DEC') {
      const roundMatch = afterMatch.match(/R(\d)|Round\s*(\d)/i);
      if (roundMatch) {
        round = 'R' + (roundMatch[1] || roundMatch[2]);
      }
    }

    results.push({
      winner: winner,
      loser: loser,
      method: method,
      round: round
    });
    console.log('[UFC Scraper] Result:', winner, 'def', loser, '-', method, round);
  }

  // Also check for draws: "Fighter vs Fighter" with "Draw" nearby
  // But exclude bonus section matches (FIGHT OF THE NIGHT, PERFORMANCE OF THE NIGHT, etc.)
  const drawPattern = /([A-Z][a-zA-Zà-ÿ\-']+(?:\s+[A-Z][a-zA-Zà-ÿ\-']+)+)\s+vs\.?\s+([A-Z][a-zA-Zà-ÿ\-']+(?:\s+[A-Z][a-zA-Zà-ÿ\-']+)+)/g;
  while ((match = drawPattern.exec(fullText)) !== null) {
    // Check context before and after the match to exclude bonus section
    const beforeMatch = fullText.substring(Math.max(0, match.index - 100), match.index);
    const afterMatch = fullText.substring(match.index, match.index + match[0].length + 100);

    // Skip if this is in the bonus section
    if (/FIGHT OF THE NIGHT|PERFORMANCE OF THE NIGHT|BONUS|Bonuses/i.test(beforeMatch + afterMatch)) {
      console.log('[UFC Scraper] Skipping bonus section match:', match[0]);
      continue;
    }

    if (/Draw|NC|No Contest/i.test(afterMatch) && !/def\s/i.test(afterMatch)) {
      const fighter1 = match[1].trim();
      const fighter2 = match[2].trim();
      const key = fighter1.toLowerCase() + '-' + fighter2.toLowerCase();
      if (!seenFights.has(key)) {
        seenFights.add(key);
        results.push({
          winner: 'DRAW',
          loser: fighter1 + ' vs ' + fighter2,
          method: 'DRAW',
          round: 'DEC'
        });
        console.log('[UFC Scraper] Draw:', fighter1, 'vs', fighter2);
      }
    }
  }

  // Check for cancelled fights in the "Cancelled & Fizzled Bouts" section
  // Tapology shows these with fighter names and "[cancelled]" text
  const cancelledSection = fullText.match(/Cancelled\s*(?:&|and)?\s*Fizzled\s*Bouts[\s\S]*?(?=(?:Bonus|Related|$))/i);
  if (cancelledSection) {
    console.log('[UFC Scraper] Found cancelled section');
    const cancelledText = cancelledSection[0];

    // Words that should not be treated as fighter names
    const cancelledFilterWords = ['fizzled', 'bouts', 'cancelled', 'withdrew', 'medical', 'injury', 'visa', 'weight', 'rescheduled', 'ruptured', 'acl', 'missed'];

    // Split into lines and process each line for cancelled fights
    const cancelledLines = cancelledText.split('\n');

    // Try to extract fighter pairs - look for "vs" patterns on single lines
    const vsPattern = /([A-Z][a-zA-Zà-ÿ\-']+(?:\s+[A-Z][a-zA-Zà-ÿ\-']+)+)\s+vs\.?\s+([A-Z][a-zA-Zà-ÿ\-']+(?:\s+[A-Z][a-zA-Zà-ÿ\-']+)+)/i;

    for (const line of cancelledLines) {
      const cancelMatch = vsPattern.exec(line);
      if (cancelMatch) {
        const fighter1 = cancelMatch[1].trim();
        const fighter2 = cancelMatch[2].trim();

        // Skip if too short or contains filter words
        if (fighter1.length < 5 || fighter2.length < 5) continue;
        const f1Lower = fighter1.toLowerCase();
        const f2Lower = fighter2.toLowerCase();
        if (cancelledFilterWords.some(w => f1Lower.includes(w) || f2Lower.includes(w))) continue;

        const key = f1Lower + '-' + f2Lower;
        if (!seenFights.has(key)) {
          seenFights.add(key);
          results.push({
            fighterA: fighter1,
            fighterB: fighter2,
            cancelled: true,
            method: 'CANCELLED'
          });
          console.log('[UFC Scraper] Cancelled fight:', fighter1, 'vs', fighter2);
        }
      }
    }
  }

  console.log('[UFC Scraper] Total results found:', results.length);
  return { source: 'Tapology', results };
}

function scrapeUFCResults() {
  console.log('[UFC Scraper] Running UFC.com results scraper...');
  const results = [];

  // UFC.com has structured fight result cards
  const fightCards = document.querySelectorAll('.c-listing-fight, .l-listing__item');

  fightCards.forEach(card => {
    // Find winner (usually has a "Winner" badge or different styling)
    const corners = card.querySelectorAll('.c-listing-fight__corner');
    let winner = null;
    let loser = null;

    corners.forEach(corner => {
      const nameEl = corner.querySelector('.c-listing-fight__corner-name a, .c-listing-fight__corner-name');
      const name = nameEl?.textContent?.trim();

      // Check if this corner won
      const isWinner = corner.classList.contains('winner') ||
        corner.querySelector('.c-listing-fight__outcome--Winner') ||
        corner.querySelector('[class*="winner"]');

      if (isWinner) {
        winner = name;
      } else if (name) {
        loser = name;
      }
    });

    // Get method and round
    const detailsEl = card.querySelector('.c-listing-fight__result-text, .c-listing-fight__details');
    const detailsText = detailsEl?.textContent?.trim() || '';

    let method = 'DEC';
    if (detailsText.toLowerCase().includes('ko') || detailsText.toLowerCase().includes('tko')) {
      method = 'KO';
    } else if (detailsText.toLowerCase().includes('sub')) {
      method = 'SUB';
    }

    let round = 'DEC';
    const roundMatch = detailsText.match(/R(\d)|Round\s*(\d)/i);
    if (roundMatch && method !== 'DEC') {
      round = 'R' + (roundMatch[1] || roundMatch[2]);
    }

    if (winner && loser) {
      results.push({ winner, loser, method, round });
      console.log('[UFC Scraper] Result:', winner, 'def.', loser, 'via', method, round);
    }
  });

  // Fallback: parse text for "def." patterns
  if (results.length === 0) {
    const fullText = document.body.innerText;
    const defPattern = /([A-Z][a-zA-Z\-'\s]+)\s+def\.\s+([A-Z][a-zA-Z\-'\s]+)/gi;
    let match;

    while ((match = defPattern.exec(fullText)) !== null) {
      const winner = match[1].trim();
      const loser = match[2].trim();

      if (winner.length > 3 && loser.length > 3) {
        results.push({ winner, loser, method: 'DEC', round: 'DEC' });
        console.log('[UFC Scraper] Result from text:', winner, 'def.', loser);
      }
    }
  }

  console.log('[UFC Scraper] Total results found:', results.length);
  return { source: 'UFC', results };
}
