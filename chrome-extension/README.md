# UFC Predictor Data Collector - Chrome Extension

A Chrome extension that automatically collects fighter prediction data from Tapology, DRatings, and FightMatrix for use with the UFC Weekly Predictor app.

## Installation

### 1. Generate Icons
1. Open `generate-icons.html` in Chrome
2. Right-click each canvas and "Save Image As..." or use the download links
3. Save the icons to the `icons/` folder as:
   - `icon16.png`
   - `icon48.png`
   - `icon128.png`

### 2. Load Extension in Chrome
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select this `chrome-extension` folder
5. The UFC Collector icon should appear in your toolbar

## Usage

### Collecting Data
1. Navigate to any of these pages:
   - **Tapology**: Event page with community predictions (e.g., `tapology.com/fightcenter/events/...`)
   - **DRatings**: UFC predictions page (`dratings.com/predictor/ufc-mma-predictions/`)
   - **FightMatrix**: Rankings or prediction blog posts (`fightmatrix.com/mma-ranks/`)

2. Click the UFC Collector extension icon
3. Click "Collect Data from This Page"
4. The extension will extract fighter names and prediction data

### Combining Multiple Sources
- Visit Tapology, DRatings, AND FightMatrix pages
- Click "Collect Data" on each
- The extension merges data by fighter name
- Source badges show which sources have been collected

### Using the Data
1. After collecting from your desired sources, click "Copy to Clipboard (JSON)"
2. Open the UFC Weekly Predictor app
3. Go to Data Collection view
4. Click "Paste Data"
5. Select the "JSON" tab
6. Paste the copied data
7. Click "Preview" then "Apply Data"

## Data Format

The extension exports JSON in this format:
```json
[
  {
    "name": "Jon Jones",
    "tapology": 78,
    "dratings": 82.5,
    "cirrs": 2150
  },
  {
    "name": "Stipe Miocic",
    "tapology": 22,
    "dratings": 17.5,
    "cirrs": 1890
  }
]
```

## Troubleshooting

### No data found
- Make sure you're on an event page with predictions, not just the main site
- Try scrolling down to load lazy-loaded content before collecting
- Check the browser console for error messages

### Data not matching fighters
- Fighter names must match closely (last name matching is used as fallback)
- Check the preview before applying to verify matches

### Extension not loading
- Ensure all icon files exist in the icons folder
- Check `chrome://extensions/` for error messages
- Try reloading the extension

## Privacy

This extension:
- Only activates on Tapology, DRatings, and FightMatrix domains
- Stores collected data locally in Chrome storage
- Does not send any data to external servers
- Only reads publicly visible page content
