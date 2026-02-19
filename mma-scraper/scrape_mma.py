from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
import time
import csv

def setup_driver():
    """Initialize Chrome WebDriver."""
    chrome_options = Options()
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    driver = webdriver.Chrome(options=chrome_options)
    return driver

def scrape_current_page(driver, week_number, matchup_name):
    """Scrape the currently loaded page."""
    data = []
    
    try:
        # Wait for content to load
        time.sleep(2)
        
        # Get player names from headers
        headers = driver.find_elements(By.TAG_NAME, "h2")
        left_player = None
        right_player = None
        
        for header in headers:
            text = header.text.strip()
            if text and "PTS" not in text and text != "Scoreboard":
                if left_player is None:
                    left_player = text
                elif right_player is None:
                    right_player = text
                    break
        
        if not left_player or not right_player:
            print(f"  ✗ Could not find player names")
            return data
        
        # Get all fighter names (they're in heading elements)
        all_headings = driver.find_elements(By.TAG_NAME, "h3")
        fighters = []
        seen_fighters = set()
        
        for heading in all_headings:
            fighter_name = heading.text.strip()
            if fighter_name and fighter_name not in seen_fighters:
                fighters.append(fighter_name)
                seen_fighters.add(fighter_name)
                if len(fighters) >= 8:  # Only need 8 fighters
                    break
        
        print(f"  Found {len(fighters)} fighters")
        
        # For each fighter, find their data in both columns
        for fighter in fighters:
            try:
                # Find all elements containing this fighter's data
                fighter_headings = driver.find_elements(By.XPATH, f"//h3[contains(text(), '{fighter}')]")
                
                if len(fighter_headings) >= 2:
                    # Left column (first occurrence)
                    left_parent = fighter_headings[0].find_element(By.XPATH, "./parent::*")
                    left_generics = left_parent.find_elements(By.TAG_NAME, "span")
                    
                    left_method = left_generics[0].text if len(left_generics) > 0 else ""
                    left_round = left_generics[1].text if len(left_generics) > 1 else ""
                    left_score = left_generics[2].text if len(left_generics) > 2 else ""
                    
                    # Right column (second occurrence)
                    right_parent = fighter_headings[1].find_element(By.XPATH, "./parent::*")
                    right_generics = right_parent.find_elements(By.TAG_NAME, "span")
                    
                    right_method = right_generics[0].text if len(right_generics) > 0 else ""
                    right_round = right_generics[1].text if len(right_generics) > 1 else ""
                    right_score = right_generics[2].text if len(right_generics) > 2 else ""
                    
                    data.append([
                        f'Week {week_number}',
                        matchup_name,
                        fighter,
                        left_player,
                        left_method,
                        left_round,
                        left_score,
                        right_player,
                        right_method,
                        right_round,
                        right_score
                    ])
                    
            except Exception as e:
                print(f"  ✗ Error with fighter {fighter}: {str(e)}")
                continue
        
        print(f"  ✓ Scraped {len(data)} fights")
        
    except Exception as e:
        print(f"  ✗ Error scraping page: {str(e)}")
    
    return data

def main():
    """Scrape Week 1 for all matchups."""
    driver = setup_driver()
    all_data = []
    
    matchups = [
        "Brian vs Rob",
        "Scott vs Joe",
        "Matt vs Mike",
        "Eugene vs Phil",
        "Dan vs Larry",
        "Jason & Mike vs Fred",
        "Anthony vs Bashar",
        "Josh vs Zach"
    ]
    
    try:
        driver.get('https://mma-v1.web.app/match-up')
        time.sleep(3)
        
        print("\nScraping Week 1 for all matchups...\n")
        
        for idx, matchup in enumerate(matchups, 1):
            print(f"[{idx}/8] {matchup}")
            
            try:
                # Find the matchup dropdown (first combobox)
                matchup_dropdown = driver.find_element(By.XPATH, "//select[@aria-haspopup='menu'][1]")
                
                # Click to open dropdown
                matchup_dropdown.click()
                time.sleep(0.5)
                
                # Select the option
                option = driver.find_element(By.XPATH, f"//option[text()='{matchup}']")
                option.click()
                time.sleep(2)
                
                # Scrape the current page
                page_data = scrape_current_page(driver, 1, matchup)
                all_data.extend(page_data)
                
            except Exception as e:
                print(f"  ✗ Error: {str(e)}")
                continue
        
        # Save to CSV
        if all_data:
            filename = 'mma_week1_all_matchups.csv'
            fieldnames = ['Week', 'Matchup', 'Fighter', 
                         'Left_Player', 'Left_Method', 'Left_Round', 'Left_Score',
                         'Right_Player', 'Right_Method', 'Right_Round', 'Right_Score']
            
            with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.writer(csvfile)
                writer.writerow(fieldnames)
                writer.writerows(all_data)
            
            print(f"\n{'='*60}")
            print(f"✓ Data saved to {filename}")
            print(f"✓ Total rows: {len(all_data)}")
            print(f"✓ Expected: {8 * 8} (8 matchups × 8 fights)")
            print(f"✓ Success rate: {len(all_data) / 64 * 100:.1f}%")
            print(f"{'='*60}")
        else:
            print("\n✗ No data scraped!")
        
    except Exception as e:
        print(f"\nFatal error: {str(e)}")
        import traceback
        traceback.print_exc()
        
    finally:
        driver.quit()

if __name__ == "__main__":
    print("MMA Week 1 Scraper")
    print("="*60)
    main()
