import requests
from bs4 import BeautifulSoup
import pandas as pd
from datetime import datetime
import time

class Fight:
    def __init__(self, time, fighter1, fighter2, win_probs, odds):
        self.time = time
        self.fighter1 = fighter1
        self.fighter2 = fighter2
        self.win_probabilities = win_probs  # [fighter1_prob, fighter2_prob]
        self.odds = odds  # [fighter1_odds, fighter2_odds]

    def __str__(self):
        return f"{self.fighter1} vs {self.fighter2} - {self.time}"

def fetch_ufc_data():
    """Fetch UFC fight data from DRatings"""
    url = "https://www.dratings.com/predictor/ufc-mma-predictions"
    
    try:
        response = requests.get(url)
        response.raise_for_status()  # Raise exception for bad status codes
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find the upcoming fights table
        fights = []
        fight_rows = soup.find_all('tr')  # You might need to adjust this selector
        
        for row in fight_rows:
            try:
                # Extract fight information
                # Note: You'll need to adjust these selectors based on the actual HTML structure
                cells = row.find_all('td')
                if len(cells) < 4:  # Skip header rows
                    continue
                
                time_str = cells[0].get_text().strip()
                fighters = cells[1].get_text().strip().split()
                win_probs = cells[2].get_text().strip().split('%')
                odds = cells[3].get_text().strip().split()
                
                # Create Fight object
                fight = Fight(
                    time=time_str,
                    fighter1=fighters[0],
                    fighter2=fighters[1],
                    win_probs=[float(win_probs[0]), float(win_probs[1])],
                    odds=odds
                )
                fights.append(fight)
                
            except Exception as e:
                print(f"Error processing fight row: {e}")
                continue
        
        return fights
    
    except requests.RequestException as e:
        print(f"Error fetching data: {e}")
        return []

def analyze_fights(fights):
    """Analyze fights for potential value bets"""
    value_bets = []
    
    for fight in fights:
        try:
            # Convert odds to probabilities
            # This is a simple example - you might want to use a more sophisticated method
            odds1, odds2 = float(fight.odds[0]), float(fight.odds[1])
            implied_prob1 = 1 / (1 + odds1/100) if odds1 > 0 else odds1/(odds1 - 100)
            implied_prob2 = 1 / (1 + odds2/100) if odds2 > 0 else odds2/(odds2 - 100)
            
            # Compare with predicted probabilities
            if abs(implied_prob1 - fight.win_probabilities[0]/100) > 0.1:  # 10% difference threshold
                value_bets.append({
                    'fight': fight,
                    'value_fighter': fight.fighter1,
                    'edge': abs(implied_prob1 - fight.win_probabilities[0]/100)
                })
            
        except Exception as e:
            print(f"Error analyzing fight {fight}: {e}")
            continue
    
    return value_bets

def save_to_csv(fights, filename='ufc_fights.csv'):
    """Save fights data to CSV"""
    data = []
    for fight in fights:
        data.append({
            'time': fight.time,
            'fighter1': fight.fighter1,
            'fighter2': fight.fighter2,
            'fighter1_prob': fight.win_probabilities[0],
            'fighter2_prob': fight.win_probabilities[1],
            'fighter1_odds': fight.odds[0],
            'fighter2_odds': fight.odds[1]
        })
    
    df = pd.DataFrame(data)
    df.to_csv(filename, index=False)
    print(f"Data saved to {filename}")

def main():
    print("UFC Fight Predictor Starting...")
    
    # Fetch fight data
    fights = fetch_ufc_data()
    if not fights:
        print("No fights found")
        return
    
    print(f"Found {len(fights)} upcoming fights")
    
    # Analyze for value bets
    value_bets = analyze_fights(fights)
    
    # Print results
    print("\nPotential Value Bets:")
    for bet in value_bets:
        print(f"{bet['fight']}: Bet on {bet['value_fighter']} (Edge: {bet['edge']:.2%})")
    
    # Save data
    save_to_csv(fights)

if __name__ == "__main__":
    main()
