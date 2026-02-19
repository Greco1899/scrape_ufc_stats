"""
Simple Flask server to save UFC Predictor data to local files and serve the application.
Run with: python save_server.py

This allows the web app to:
1. Auto-save data to D:\\projects\\ufc_project\\results
2. Bypass CORS restrictions via /proxy endpoint
3. Run as a proper web application (not file://)
"""

from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
import json
import os
from datetime import datetime
import urllib.request
import urllib.error
import time

# Configure Flask to serve static files from the current directory
app = Flask(__name__, static_url_path='', static_folder='.')
CORS(app)  # Allow cross-origin requests

# Configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(BASE_DIR, "results")

# Ensure results directory exists
os.makedirs(RESULTS_DIR, exist_ok=True)

# Odds API configuration
ODDS_API_KEY = "7bf926338e9bda83703db22931ac7210"
ODDS_CACHE = {"data": None, "timestamp": 0}
ODDS_CACHE_TTL = 1800  # 30 minutes

# ==========================================
# STATIC FILE SERVING
# ==========================================

@app.route('/')
def serve_index():
    return app.send_static_file('index.html')

# ==========================================
# PROXY ENDPOINT (CORS BYPASS)
# ==========================================

@app.route('/proxy', methods=['GET'])
def proxy():
    """Proxy requests to bypass CORS restrictions."""
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'Missing url parameter'}), 400

    try:
        # Create request with browser-like headers
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        )
        
        with urllib.request.urlopen(req, timeout=10) as response:
            content = response.read()
            # Return content with CORS headers (handled by flask_cors)
            return Response(content, mimetype=response.headers.get_content_type())
            
    except urllib.error.HTTPError as e:
        return jsonify({'error': f'HTTP Error {e.code}: {e.reason}'}), e.code
    except Exception as e:
        print(f"[Proxy] Error fetching {url}: {e}")
        return jsonify({'error': str(e)}), 500

# ==========================================
# DATA SAVING ENDPOINTS
# ==========================================

@app.route('/save', methods=['POST'])
def save_data():
    """Save JSON data to a file in the results directory."""
    try:
        payload = request.json
        filename = payload.get('filename', f'ufc-predictor-{datetime.now().strftime("%Y-%m-%d_%H-%M-%S")}.json')
        data = payload.get('data', {})

        # Sanitize filename
        filename = "".join(c for c in filename if c.isalnum() or c in '.-_')
        if not filename.endswith('.json'):
            filename += '.json'

        filepath = os.path.join(RESULTS_DIR, filename)

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print(f"[SaveServer] Saved: {filepath}")
        return jsonify({'success': True, 'path': filepath, 'filename': filename})

    except Exception as e:
        print(f"[SaveServer] Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/import', methods=['POST'])
def import_data():
    """Receive data from Chrome Extension."""
    try:
        data = request.json
        # Format as list of fighters if it comes wrapped
        if isinstance(data, dict) and 'fighters' in data:
            data = data['fighters']
        
        # Save to a dedicated import file that overwrites itself (or unique if preferred)
        # We'll use a fixed name so it's easy to find, or timestamped
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        filename = f"extension-import-{timestamp}.json"
        
        filepath = os.path.join(RESULTS_DIR, filename)

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print(f"[SaveServer] Import received: {filepath}")
        return jsonify({'success': True, 'filename': filename})

    except Exception as e:
        print(f"[SaveServer] Import Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/list', methods=['GET'])
def list_files():
    """List all saved JSON files."""
    try:
        files = [f for f in os.listdir(RESULTS_DIR) if f.endswith('.json')]
        files.sort(reverse=True)  # Most recent first
        return jsonify({'files': files})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/load/<filename>', methods=['GET'])
def load_file(filename):
    """Load a specific JSON file."""
    try:
        filepath = os.path.join(RESULTS_DIR, filename)
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ==========================================
# LIVE ODDS ENDPOINT (The Odds API)
# ==========================================

@app.route('/api/odds', methods=['GET'])
def get_odds():
    """Fetch live MMA odds from The Odds API with caching."""
    try:
        now = time.time()
        if ODDS_CACHE["data"] and (now - ODDS_CACHE["timestamp"]) < ODDS_CACHE_TTL:
            print("[Odds] Returning cached data")
            return jsonify(ODDS_CACHE["data"])

        url = (
            f"https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds"
            f"?apiKey={ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=american"
        )
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=15) as response:
            raw = json.loads(response.read().decode('utf-8'))
            remaining = response.headers.get('x-requests-remaining', '?')
            print(f"[Odds] Fetched {len(raw)} events. API requests remaining: {remaining}")

        # Process into fighter-level odds
        fights = []
        for event in raw:
            fighter_a = event.get("home_team", "")
            fighter_b = event.get("away_team", "")
            commence = event.get("commence_time", "")

            # Average odds across all bookmakers
            odds_a = []
            odds_b = []
            for bk in event.get("bookmakers", []):
                for market in bk.get("markets", []):
                    if market["key"] == "h2h":
                        for outcome in market.get("outcomes", []):
                            if outcome["name"] == fighter_a:
                                odds_a.append(outcome["price"])
                            elif outcome["name"] == fighter_b:
                                odds_b.append(outcome["price"])

            def american_to_implied(odds_list):
                """Convert list of American odds to averaged implied probability."""
                if not odds_list:
                    return None
                probs = []
                for o in odds_list:
                    if o > 0:
                        probs.append(100 / (o + 100))
                    else:
                        probs.append(abs(o) / (abs(o) + 100))
                return round(sum(probs) / len(probs) * 100, 2)

            avg_odds_a = round(sum(odds_a) / len(odds_a)) if odds_a else None
            avg_odds_b = round(sum(odds_b) / len(odds_b)) if odds_b else None

            fights.append({
                "fighterA": fighter_a,
                "fighterB": fighter_b,
                "commence": commence,
                "oddsA": avg_odds_a,
                "oddsB": avg_odds_b,
                "impliedProbA": american_to_implied(odds_a),
                "impliedProbB": american_to_implied(odds_b),
                "bookmakers": len(event.get("bookmakers", []))
            })

        result = {"fights": fights, "fetched": datetime.now().isoformat(), "remaining": remaining}
        ODDS_CACHE["data"] = result
        ODDS_CACHE["timestamp"] = now

        return jsonify(result)

    except urllib.error.HTTPError as e:
        print(f"[Odds] HTTP Error: {e.code} {e.reason}")
        return jsonify({"error": f"Odds API HTTP {e.code}: {e.reason}"}), e.code
    except Exception as e:
        print(f"[Odds] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'results_dir': RESULTS_DIR, 'mode': 'server+proxy'})


if __name__ == '__main__':
    print(f"""
╔══════════════════════════════════════════════════════════╗
║         UFC Predictor Data & Proxy Server                ║
══════════════════════════════════════════════════════════
║  Server URL: http://localhost:5555                       ║
║  Proxy URL:  http://localhost:5555/proxy?url=...         ║
║  Saving to:  {RESULTS_DIR:<35} ║
╚══════════════════════════════════════════════════════════╝
    """)
    app.run(host='0.0.0.0', port=5555, debug=False)
