'''
Overview
run the notebook 'scape_ufc_stats_all_historical_data.ipynb' first to parse all available past fight data
and the notebook ' scrape_ufc_stats_fighter_tott.ipynb' to parse all available fighter data

this code checks existing files for previously parsed data
if there are no new or unparsed events, script stops

if there are any unparsed events, script continues with parsing
combine new data and existing data into one and write to file

this notebook can be run manually when desired
the script, 'scrape_ufc_stats_unparsed_data.py' is the same code that can be set to run on a schedule
'''

# imports
import pandas as pd
from tqdm import tqdm

# import library
import scrape_ufc_stats_library as LIB

# import config
import yaml
config = yaml.safe_load(open('scrape_ufc_stats_config.yaml'))



### check if there are any unparsed events ###

# read existing event details
parsed_event_details_df = pd.read_csv(config['event_details_file_name'])
# get list of parsed event names
list_of_parsed_events = list(parsed_event_details_df['EVENT'])

# get soup
soup = LIB.get_soup(config['completed_events_all_url'])
# parse event details
updated_event_details_df = LIB.parse_event_details(soup)
# get list of all event names
list_of_all_events = list(updated_event_details_df['EVENT'])

# find list event names that have not been parsed
list_of_unparsed_events = [event for event in list_of_all_events if event not in list_of_parsed_events]

# check if there are any unparsed events
unparsed_events = False
# if list_of_unparsed_events is empty then all available events have been parsed
if not list_of_unparsed_events:
    print('All available events have been parsed.')
else:
    # set unparsed_events to true
    unparsed_events = True
    # show list of unparsed events
    print(list_of_unparsed_events)
    # write event details to file
    updated_event_details_df.to_csv(config['event_details_file_name'], index=False)



### parse all missing events ###
# if unparsed_events = True
# the code below continues to run to parse all missing events
# new data is added to existing data and is written to file

if unparsed_events == True:
    # read existing data files
    parsed_fight_details_df = pd.read_csv(config['fight_details_file_name'])
    parsed_fight_results_df = pd.read_csv(config['fight_results_file_name'])
    parsed_fight_stats_df = pd.read_csv(config['fight_stats_file_name'])

    ### parse fight details ###

    # define list of urls of missing fights to parse
    list_of_unparsed_events_urls = list(updated_event_details_df['URL'].loc[(updated_event_details_df['EVENT'].isin(list_of_unparsed_events))])

    # create empty df to store fight details
    unparsed_fight_details_df = pd.DataFrame(columns=config['fight_details_column_names'])

    # loop through each event and parse fight details
    for url in tqdm(list_of_unparsed_events_urls):

        # get soup
        soup = LIB.get_soup(url)

        # parse fight links
        fight_details_df = LIB.parse_fight_details(soup)
        
        # concat fight details to parsed fight details
        # concat update fight details to the top of existing df
        unparsed_fight_details_df = pd.concat([unparsed_fight_details_df, fight_details_df])

    # concat unparsed and parsed fight details
    parsed_fight_details_df = pd.concat([unparsed_fight_details_df, parsed_fight_details_df])

    # write fight details to file
    parsed_fight_details_df.to_csv(config['fight_details_file_name'], index=False)

    ### parse fight results and fight stats

    # define list of urls of fights to parse
    list_of_unparsed_fight_details_urls = list(unparsed_fight_details_df['URL'])

    # create empty df to store fight results
    unparsed_fight_results_df = pd.DataFrame(columns=config['fight_results_column_names'])
    # create empty df to store fight stats
    unparsed_fight_stats_df = pd.DataFrame(columns=config['fight_stats_column_names'])

    # loop through each fight and parse fight results and stats
    for url in tqdm(list_of_unparsed_fight_details_urls):

        # get soup
        soup = LIB.get_soup(url)

        # parse fight results and fight stats
        fight_results_df, fight_stats_df = LIB.parse_organise_fight_results_and_stats(
            soup, 
            url,
            config['fight_results_column_names'],
            config['totals_column_names'],
            config['significant_strikes_column_names']
            )

        # concat fight results
        unparsed_fight_results_df = pd.concat([unparsed_fight_results_df, fight_results_df])
        # concat fight stats
        unparsed_fight_stats_df = pd.concat([unparsed_fight_stats_df, fight_stats_df])

    # concat unparsed fight results and fight stats to parsed fight results and fight stats
    parsed_fight_results_df = pd.concat([unparsed_fight_results_df, parsed_fight_results_df])
    parsed_fight_stats_df = pd.concat([unparsed_fight_stats_df, parsed_fight_stats_df])

    # write to file
    parsed_fight_results_df.to_csv(config['fight_results_file_name'], index=False)
    # write to file
    parsed_fight_stats_df.to_csv(config['fight_stats_file_name'], index=False)



### check if there are any unparsed fighters ###

# read existing fighter details
parsed_fighter_details_df = pd.read_csv(config['fighter_details_file_name'])
# get list of parsed fighter urls
list_of_parsed_urls = list(parsed_fighter_details_df['URL'])

# generate list of urls for fighter details
list_of_alphabetical_urls = LIB.generate_alphabetical_urls()

# create empty dataframe to store all fighter details
all_fighter_details_df = pd.DataFrame()

# loop through list of alphabetical urls
for url in tqdm(list_of_alphabetical_urls):
    # get soup
    soup = LIB.get_soup(url)
    # parse fighter details
    fighter_details_df = LIB.parse_fighter_details(soup, config['fighter_details_column_names'])
    # concat fighter_details_df to all_fighter_details_df
    all_fighter_details_df = pd.concat([all_fighter_details_df, fighter_details_df])

# get all fighter urls
unparsed_fighter_urls = list(all_fighter_details_df['URL'])

# get list of unparsed fighter urls
list_of_unparsed_fighter_urls = [url for url in unparsed_fighter_urls if url not in list_of_parsed_urls]

# check if there are any unparsed fighters
unparsed_fighters = False
# if list_of_unparsed_fighter_urls is empty then all available fighters have been parsed
if not list_of_unparsed_fighter_urls:
    print('All available fighters have been parsed.')
else:
    # set unparsed_fighters to true
    unparsed_fighters = True
    # show list of unparsed events
    print(list_of_unparsed_fighter_urls)
    # write event details to file
    all_fighter_details_df.to_csv(config['fighter_details_file_name'], index=False)



### parse all missing fighters ###
# if unparsed_fighters = True
# the code below continues to run to parse all missing fighters
# new data is added to existing data and is written to file

if unparsed_fighters == True:

    # read existing data files
    parsed_fighter_tott_df = pd.read_csv(config['fighter_tott_file_name'])

    # create empty df to store fighters' tale of the tape
    unparsed_fighter_tott_df = pd.DataFrame(columns=config['fighter_tott_column_names'])

    # loop through list_of_fighter_urls
    for url in tqdm(list_of_unparsed_fighter_urls):
        # get soup
        soup = LIB.get_soup(url)
        # parse fighter tale of the tape
        fighter_tott = LIB.parse_fighter_tott(soup)
        # organise fighter tale of the tape
        fighter_tott_df = LIB.organise_fighter_tott(fighter_tott, config['fighter_tott_column_names'], url)
        # concat fighter
        unparsed_fighter_tott_df = pd.concat([unparsed_fighter_tott_df, fighter_tott_df])

    # concat unparsed fighter tale of the tape to parsed fighter tale of the tape
    parsed_fighter_tott_df = pd.concat([parsed_fighter_tott_df, unparsed_fighter_tott_df])
    # write to file 
    parsed_fighter_tott_df.to_csv(config['fighter_tott_file_name'], index=False)
