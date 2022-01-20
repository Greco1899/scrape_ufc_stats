# Scrape UFC Stats
Scrape all available UFC fights stats and events data from [ufcstats.com](http://ufcstats.com/) and saved in CSV format.
<br>
<br>
<br>

## Prerequisites
```
Python 3
```
Install requirements with `pip install -r requirements.txt`
<br>
<br>
<br>

## Introduction

Data before 01 January 2022 (last event UFC Fight Night: Lewis vs. Daukaus) has scraped and saved as the following data files:
```
ufc_events.csv
ufc_fight_details.csv
ufc_fight_results.csv
ufc_fight_stats.csv
```

You can run the notebook `srape_ufc_stats_unparsed_data.ipynb` or the script `scrape_ufc_stats_unparsed_data.py` to start scraping the latest data and refresh the data files above.

You can also scrape the all data again using the notebook `scrape_ufc_stats_all_historical_data.ipynb`. 
Do note this might take a few hours to complete.

The notebook `scrape_ufc_stats_working_example.ipynb` can be used for testing or debugging.

The data is raw data directly from the UFC stats website and has not been cleaned for analysis, that is the next step to be worked on.

Do feel free to reach out with any comments, suggestions, or issues.
<br>
<br>
<br>
