// UFC Data Collector - Background Service Worker

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FIGHTER_DATA') {
    // Store fighter data
    handleFighterData(message.data, message.source);
    sendResponse({ success: true });
  }
  return true;
});

async function handleFighterData(fighters, source) {
  const stored = await chrome.storage.local.get(['collectedFighters', 'sources']);
  const collectedFighters = stored.collectedFighters || {};
  const sources = stored.sources || { tapology: false, dratings: false, fightmatrix: false };

  for (const fighter of fighters) {
    const key = normalizeName(fighter.name);
    if (!collectedFighters[key]) {
      collectedFighters[key] = { name: fighter.name };
    }

    // Merge data
    if (fighter.tapology !== undefined) {
      collectedFighters[key].tapology = fighter.tapology;
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
  }

  await chrome.storage.local.set({ collectedFighters, sources });

  // Update badge
  const count = Object.keys(collectedFighters).length;
  chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' });
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Initialize badge on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});
