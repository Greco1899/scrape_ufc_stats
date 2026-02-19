import pandas as pd
import yaml

def load_fight_data():
    """Load all UFC fight data"""
    with open("scrape_ufc_stats_config.yaml") as f:
        config = yaml.safe_load(f)
    
    # Load the datasets
    fighters = pd.read_csv(config['fighter_details_file_name'])
    fighter_stats = pd.read_csv(config['fighter_tott_file_name'])
    fights = pd.read_csv(config['fight_results_file_name'])
    fight_stats = pd.read_csv(config['fight_stats_file_name'])
    
    return fighters, fighter_stats, fights, fight_stats

def analyze_recent_fights():
    """Analyze recent fight data"""
    fighters, fighter_stats, fights, fight_stats = load_fight_data()
    
    # Get most recent fights
    recent_fights = fights.head(10)
    print("\nMost Recent Fights:")
    print(recent_fights[['EVENT', 'BOUT', 'OUTCOME', 'METHOD']].to_string())
    
    # Get fighter win percentages
    fighter_names = fighter_stats['FIGHTER'].unique()
    print(f"\nTotal Fighters in Database: {len(fighter_names)}")
    
    # Show some basic stats
    print("\nFight Stats Summary:")
    print(fight_stats[['KD', 'SIG.STR.', 'TD']].describe())

if __name__ == "__main__":
    analyze_recent_fights()
