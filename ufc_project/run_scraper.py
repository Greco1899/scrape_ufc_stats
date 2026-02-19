"""Main script to run UFC stats scraping"""
import os
from pathlib import Path
import yaml
import scrape_ufc_stats_library as LIB
import pandas as pd
from tqdm import tqdm

def main():
    # Load config
    with open("scrape_ufc_stats_config.yaml") as f:
        config = yaml.safe_load(f)
    
    print("Starting UFC data scraping...")
    
    # First update fighter data
    print("Updating fighter data...")
    list_of_alphabetical_urls = LIB.generate_alphabetical_urls()
    
    all_fighter_details_df = pd.DataFrame()
    for url in tqdm(list_of_alphabetical_urls):
        soup = LIB.get_soup(url)
        fighter_details_df = LIB.parse_fighter_details(soup, config['fighter_details_column_names'])
        all_fighter_details_df = pd.concat([all_fighter_details_df, fighter_details_df])
    
    # Then update fight data using scrape_ufc_stats_unparsed_data logic
    print("Updating fight data...")
    exec(open("scrape_ufc_stats_unparsed_data.py").read())
    
    print("Scraping completed!")

if __name__ == "__main__":
    main()
