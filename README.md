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

Data for all fights have scraped and saved as the following data files:
```
ufc_events.csv
ufc_fight_details.csv
ufc_fight_results.csv
ufc_fight_stats.csv
```

To download the CSV files without running any code, click `Code` > `Download ZIP` or clone the repo.

You can also scrape the all the data again using the notebook `scrape_ufc_stats_all_historical_data.ipynb`. 
Do note this might take a few hours to complete.

Once you have the up-to-date historical data, you can run the notebook `scrape_ufc_stats_unparsed_data.ipynb` or the script `scrape_ufc_stats_unparsed_data.py` to scrape the only latest fights and refresh the data.

The notebook `scrape_ufc_stats_working_example.ipynb` can be used for testing or debugging.

Do feel free to reach out with any comments, suggestions, or issues. 😃
<br>
<br>
<br>

## Data Refresh

The script `scrape_ufc_stats_unparsed_data.py` has been added to [PythonAnywhere](https://www.pythonanywhere.com/?affiliate_id=00a8b72b) and will run daily to check and scrape new fights and push the refreshed data files to this repository. 

This keeps the data files up to date with the latest fight stats and you can download and use the CSV files without running any code.
<br>
<br>
<br>

## Next Steps

Clean Data - Clean data to be used for further analysis

Data Exploration - Plot and visualise stats

Prediction - Build a machine learning model to predict the outcome of fights
<br>
<br>
<br>
