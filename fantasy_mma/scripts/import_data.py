import pandas as pd
from sqlalchemy.orm import Session
from datetime import datetime
import sys
import os

# Add the parent directory to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal
from app.models.database import Fighter, Event, Fight

def import_fighter_data(db: Session):
    """Import fighter data from the UFC stats CSV files."""
    print("Importing fighter data...")
    
    # Read fighter details
    fighter_details = pd.read_csv("../ufc_stats/data/ufc_fighter_details.csv")
    fighter_stats = pd.read_csv("../ufc_stats/data/ufc_fighter_tott.csv")
    
    # Merge fighter data
    fighters_df = pd.merge(
        fighter_details,
        fighter_stats,
        on="NAME",
        how="left"
    )
    
    # Convert height to inches
    def height_to_inches(height_str):
        try:
            feet, inches = map(int, height_str.replace('"', '').split("' "))
            return feet * 12 + inches
        except:
            return None
    
    fighters_df["HEIGHT"] = fighters_df["HEIGHT"].apply(height_to_inches)
    
    # Convert reach to inches
    fighters_df["REACH"] = fighters_df["REACH"].str.replace('"', '').astype(float)
    
    for _, row in fighters_df.iterrows():
        fighter = Fighter(
            name=row["NAME"],
            nickname=row.get("NICKNAME", ""),
            height=row["HEIGHT"],
            reach=row["REACH"],
            stance=row.get("STANCE", ""),
            wins=row.get("WINS", 0),
            losses=row.get("LOSSES", 0),
            draws=row.get("DRAWS", 0),
            weight_class=row.get("WEIGHT_CLASS", ""),
            strikes_landed_per_min=row.get("STRIKES_LANDED_PER_MIN", 0.0),
            strike_accuracy=row.get("STRIKE_ACCURACY", 0.0),
            strikes_absorbed_per_min=row.get("STRIKES_ABSORBED_PER_MIN", 0.0),
            strike_defense=row.get("STRIKE_DEFENSE", 0.0),
            takedown_avg=row.get("TAKEDOWN_AVG", 0.0),
            takedown_accuracy=row.get("TAKEDOWN_ACCURACY", 0.0),
            takedown_defense=row.get("TAKEDOWN_DEFENSE", 0.0),
            submission_avg=row.get("SUBMISSION_AVG", 0.0)
        )
        db.add(fighter)
    
    db.commit()
    print(f"Imported {len(fighters_df)} fighters")

def import_event_data(db: Session):
    """Import event and fight data from the UFC stats CSV files."""
    print("Importing event data...")
    
    # Read event and fight data
    events_df = pd.read_csv("../ufc_stats/data/ufc_event_details.csv")
    fights_df = pd.read_csv("../ufc_stats/data/ufc_fight_results.csv")
    
    # Process events
    for _, row in events_df.iterrows():
        event = Event(
            name=row["EVENT"],
            date=datetime.strptime(row["DATE"], "%B %d, %Y"),
            location=row["LOCATION"]
        )
        db.add(event)
    
    db.commit()
    print(f"Imported {len(events_df)} events")
    
    # Create a mapping of event names to IDs
    event_map = {event.name: event.id for event in db.query(Event).all()}
    fighter_map = {fighter.name: fighter.id for fighter in db.query(Fighter).all()}
    
    # Process fights
    for _, row in fights_df.iterrows():
        # Extract fighter names from the bout
        fighters = row["BOUT"].split(" vs. ")
        if len(fighters) != 2:
            continue
        
        fighter1_name, fighter2_name = fighters
        
        # Get fighter IDs
        fighter1_id = fighter_map.get(fighter1_name)
        fighter2_id = fighter_map.get(fighter2_name)
        
        if not fighter1_id or not fighter2_id:
            continue
        
        # Determine winner
        if row["OUTCOME"] == "W":
            winner_id = fighter1_id
        elif row["OUTCOME"] == "L":
            winner_id = fighter2_id
        else:
            winner_id = None
        
        fight = Fight(
            event_id=event_map.get(row["EVENT"]),
            fighter1_id=fighter1_id,
            fighter2_id=fighter2_id,
            weight_class=row.get("WEIGHT_CLASS", ""),
            winner_id=winner_id,
            method=row.get("METHOD", ""),
            round=row.get("ROUND", 0),
            time=row.get("TIME", "")
        )
        db.add(fight)
    
    db.commit()
    print(f"Imported {len(fights_df)} fights")

def main():
    """Main function to import all data."""
    db = SessionLocal()
    try:
        import_fighter_data(db)
        import_event_data(db)
        print("Data import completed successfully!")
    except Exception as e:
        print(f"Error importing data: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    main() 