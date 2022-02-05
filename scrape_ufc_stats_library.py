'''
Overview

library of functions to scrape ufc stats

'''

# imports
import pandas as pd
import numpy as np
import re
import requests
from bs4 import BeautifulSoup
import itertools
import string



# get soup from url
def get_soup(url):
    '''
    get soup from url using beautifulsoup

    arguments:
    url (str): url of page to parse

    returns:
    soup
    '''
    
    # get page of url
    page = requests.get(url)
    # create soup
    soup = BeautifulSoup(page.content, 'html.parser')

    # return
    return soup



# parse event details
def parse_event_details(soup):
    '''
    parse event details from soup
    includes names, urls, dates, locations of events
    clean each element in the list, removing '\n' and ' ' 
    e.g cleans '\n      Las Vegas, Nevada, USA\n' into 'Las Vegas, Nevada, USA'
    return details as a df

    arguments:
    soup (html): output of get_soup()

    returns:
    a dataframe of event details
    '''

    # create empty list to store event names and urls
    event_names = []
    event_urls = []
    event_dates = []
    event_locations = []

    # extract event name and urls
    for tag in soup.find_all('a', class_='b-link b-link_style_black'):
        event_names.append(tag.text.strip())
        event_urls.append(tag['href'])

    # extract event dates
    for tag in soup.find_all('span', class_='b-statistics__date'):
        event_dates.append(tag.text.strip())

    # extract event locations
    for tag in soup.find_all('td', class_='b-statistics__table-col b-statistics__table-col_style_big-top-padding'):
        event_locations.append(tag.text.strip())

    # remove first element of event dates and locations
    # as first element here represent an upcoming event with no stats yet
    event_dates = event_dates[1:]
    event_locations = event_locations[1:]

    # create df to store event details
    event_details_df = pd.DataFrame({
        'EVENT':event_names,
        'URL':event_urls,
        'DATE':event_dates,
        'LOCATION':event_locations
    })

    # return
    return event_details_df



# parse fight details
def parse_fight_details(soup):
    '''
    parse fight details from soup
    includes urls, and fights
    create bout from fighters' names and create event column as keys
    return a df of fight details of an event

    arguments:
    soup (html): output of get_soup()
    
    returns:
    a df of fight details
    '''
    
    # create empty list to store fight urls
    fight_urls = []
    # extract all fight detail urls for further parsing
    for tag in soup.find_all('tr', class_='b-fight-details__table-row b-fight-details__table-row__hover js-fight-details-click'):
        fight_urls.append(tag['data-link'])

    # create an empty list to store fighters in an event
    fighters_in_event = []
    # extract all fighters in an event
    for tag in soup.find_all('a', class_='b-link b-link_style_black'):
        fighters_in_event.append(tag.text.strip())

    # combine fighters in event in pairs to create fights
    fights_in_event = [fighter_a+' vs. '+fighter_b for fighter_a, fighter_b in zip(fighters_in_event[::2], fighters_in_event[1::2])]    
    
    # create df to store fights
    fight_details_df = pd.DataFrame({'BOUT':fights_in_event, 'URL':fight_urls})
    # create event column as key
    fight_details_df['EVENT'] = soup.find('h2', class_='b-content__title').text.strip()
    # reorder columns
    fight_details_df = move_columns(fight_details_df, ['EVENT'], 'BOUT', 'before')

    # return
    return fight_details_df



# parse fight results from soup
def parse_fight_results(soup):
    '''
    parase fight results from soup
    results include event, bout, outcome weightclass, method, round, time, timeformat, referee, details
    clean each element in the list, removing '\n' and ' ' 
    e.g cleans '\n      Welterweight Bout\n' into 'Welterweight Bout'
    details include description of finish or judges and scores
    judges and scores also include details of point deduction
    e.g. 'Point Deducted: Illegal Knee by Menne Tony Weeks 45 - 49.Doug Crosby 42 - 49.Jeff Mullen 44 - 49.'
    return fight results as a list

    arguments:
    soup (html): output of get_soup() parser

    returns:
    a list of fight results
    '''

    # create an empty list to store results
    fight_results = []

    # parse event name
    fight_results.append(soup.find('h2', class_='b-content__title').text)

    # parse fighters
    for tag in soup.find_all('a', class_='b-link b-fight-details__person-link'):
        fight_results.append(tag.text)

    # parse outcome as either w for win or l for loss
    for tag in soup.find_all('div', class_='b-fight-details__person'):
        for i_text in tag.find_all('i'):
            fight_results.append(i_text.text)

    # parse weightclass
    fight_results.append(soup.find('div', class_='b-fight-details__fight-head').text)

    # parse win method
    fight_results.append(soup.find('i', class_='b-fight-details__text-item_first').text)

    # parse remaining results
    # includes round, time, time format, referee, details
    remaining_results = soup.find_all('p', class_='b-fight-details__text')

    # parse round, time, time format, referee
    for tag in remaining_results[0].find_all('i', class_='b-fight-details__text-item'):
        fight_results.append(tag.text.strip())

    # parse details
    fight_results.append(remaining_results[1].get_text())

    # clean each element in the list, removing '\n' and '  ' 
    fight_results = [text.replace('\n', '').replace('  ', '') for text in fight_results]

    # return
    return fight_results



# organise fight results
def organise_fight_results(results_from_soup, fight_results_column_names):
    '''
    organise list of fight results
    fighters' names should be from index 1 and 2
    fight outcome should be from index 3 and 4
    other results includes from index 5 onwards
    weightclass, method, round, time, time format, referee, and details, should be 
    append all results into list and convert to a df

    arguments:
    results_from_soup (list): list of results from parse_fight_results()
    fight_results_column_names (list): list of column names for fight results

    returns:
    an organised list of fight results
    '''

    # create empty list to store results
    fight_results_clean = []
    # append event name
    fight_results_clean.append(results_from_soup[0])
    # join fighters name into one, e.g. fighter_a vs. fighter_b
    fight_results_clean.append(' vs. '.join(results_from_soup[1:3]))
    # join outcome as 'w/l' or 'l/w'
    fight_results_clean.append('/'.join(results_from_soup[3:5]))
    # remove label of results using regex
    # regrex, at the start of the string remove all characterts up to the first ':' 
    # remove and a single ' ', if any,  after the ':'
    fight_results_clean.extend([re.sub('^(.+?): ?', '', text) for text in results_from_soup[5:]])

    # create empty df to store results
    fight_result_df = pd.DataFrame(columns=fight_results_column_names)
    # append each round of totals stats from first half of list to totals_df
    fight_result_df.loc[len(fight_result_df)] = fight_results_clean

    # return
    return fight_result_df



# parse full fight stats for both fighters
def parse_fight_stats(soup):
    '''
    parse full fight stats for both fighters from soup
    loop through soup to find all 'td' tags with the class 'b-fight-details__table-col'
    this returns a list of stats for both fighters in alternate order
    e.g. [0, 1, 2, 2, 20, 30] stats [0, 2, 20] belong to the first fighter and [1, 2, 30] belong to the second fighter
    use enumerate to add index to results
    stats with even indexes belongs to the first fighter and odd indexes belong to the second fighter
    clean each element in the list, removing '\n' and ' ' 
    e.g cleans '\n fighter name \n' into 'fighter name' and  '\n      19 of 32\n    ' into '19 of 32'
    
    arguments:
    soup (html): output of get_soup() parser

    returns:
    two lists of fighter stats, one for each fighter
    '''

    # create empty list to store each fighter's stats
    fighter_a_stats = []
    fighter_b_stats = []

    # loop through soup to find all 'td' tags with the class 'b-fight-details__table-col'
    for tag in soup.find_all('td', class_='b-fight-details__table-col'):
        # loop through each 'td' tag and find all 'p' tags
        # this returns a list of stats for both fighters in alternate order
        # stats with even indexes belongs to the first fighter and odd indexes belong to the second fighter
        for index, p_text in enumerate(tag.find_all('p')):
            # check if index is even, if true then append to fighter_a_stats
            if index % 2 == 0:
                fighter_a_stats.append(p_text.text.strip())
            # if index is odd then append to fighter_b_stats
            else:
                fighter_b_stats.append(p_text.text.strip())

    # return
    return fighter_a_stats, fighter_b_stats



# organise stats extracted from soup
def organise_fight_stats(stats_from_soup):
    '''
    organise a list of raw stats extracted from soup
    each set of stats starts with the fighter's name, the function groups each set together into a list of lists by the fighter's name

    there are two different types of stats, totals and significant strikes
    Totals include KD, SIG.STR., SIG.STR. %, TOTAL STR., TD, TD %, SUB.ATT, REV., CTRL
    Significant Strikes include SIG.STR., SIG.STR. %, HEAD, BODY, LEG, DISTANCE, CLINCH, GROUND
    
    each type of stat has a summary of total stats for the fight, and individual round stats
    the sets of stats are returned as a list of lists
    e.g. [[totals - summary], [totals - round 1], [totals - round n]..., [significant strikes - summary], [significant strikes - round 1], [significant strikes - round n]...] 

    arguments:
    stats_from_soup (list): a list of fight stats from parse_fight_stats()

    returns: 
    a list of lists of fight stats
    '''

    # split clean stats by fighter's name into a list of list
    # each sub list represents total strike and sig strikes stats per round and totals

    # create empty list to store stats
    fighter_stats_clean = []
    # group stats by fighter's name
    for name, stats in itertools.groupby(stats_from_soup, lambda x: x == stats_from_soup[0]):
        # create empty sublist to store each set of stats
        if name: fighter_stats_clean.append([])
        # extend stats to sublist
        fighter_stats_clean[-1].extend(stats)

    # return
    return fighter_stats_clean



# convert list of fighter stats into a structured dataframe
def convert_fight_stats_to_df(clean_fighter_stats, totals_column_names, significant_strikes_column_names):
    '''
    convert a list of fighter stats from organise_fight_stats() into a structured dataframe
    check if list of stats is empty, there are old fights that do not have stats
    if fight has no stats, then fill stat columns with nans
    if fight has stats continue and get number of rounds in the fight
    for each round in fight, get stats for totals and significant strikes
    the summary of stats for the fights are ignored
    merge totals and significant stike stats together and return as one df

    arguments:
    clean_fighter_stats (list): list of fighter stats from organise_fight_stats()
    totals_column_names (list): list of column names for totals type stats
    significant_strikes_column_names (list): list of column names for significant strike type stats

    returns:
    a dataframe of fight stats
    '''

    # create empty df to store each type of stat
    totals_df = pd.DataFrame(columns=totals_column_names)
    significant_strikes_df = pd.DataFrame(columns=significant_strikes_column_names)

    # check if list of stats is empty 
    # meaning that stats are unavailable for the fight
    if len(clean_fighter_stats) == 0:
        # append nans to totals_df and significant_strikes_df
        totals_df.loc[len(totals_df)] = [np.nan] * len(list(totals_df))
        significant_strikes_df.loc[len(significant_strikes_df)] = [np.nan] * len(list(significant_strikes_df))
    
    # if list of stats is no empty
    else:
        # get number of rounds in fight
        # fight stats has two summary rows and two rows of stats for each round
        # subtract two summary rows and divide the remaining rows by two to get the number of rounds
        number_of_rounds = int((len(clean_fighter_stats) - 2) / 2)

        # create empty df to store each type of stat
        totals_df = pd.DataFrame(columns=totals_column_names)
        significant_strikes_df = pd.DataFrame(columns=significant_strikes_column_names)

        # for each round in fight, get stats for totals and significant strikes
        # the first half of stats are totals type and the second half are significant strike type
        # [[totals - summary], [totals - round 1], [totals - round n]..., [significant strikes - summary], [significant strikes - round 1], [significant strikes - round n]...] 
        for round in range(number_of_rounds):
            # append each round of totals stats from first half of list to totals_df
            totals_df.loc[len(totals_df)] = ['Round '+str(round+1)] + clean_fighter_stats[round+1]
            # append each round of significant strike stats from second half of list to significant_strikes_df
            significant_strikes_df.loc[len(significant_strikes_df)] = ['Round '+str(round+1)] + clean_fighter_stats[round+1+int((len(clean_fighter_stats) / 2))]

    # merge totals and significant stike stats together as one df
    fighter_stats_df = totals_df.merge(significant_strikes_df, how='inner')

    # return
    return fighter_stats_df



# combine fighter stats into one
def combine_fighter_stats_dfs(fighter_a_stats_df, fighter_b_stats_df, soup):
    '''
    concat both fighter's stats into one df
    create new event and bout column as a key
    results in a dataframe of stats for both fighters for a fight

    arguments:
    fighter_a_stats_df (df): a df output from convert_fight_stats_to_df()
    fighter_b_stats_df (df): a df output from convert_fight_stats_to_df()
    soup (html): output of get_soup() parser

    returns
    a dataframe of stats for the fight
    '''

    # concat both fighters' stats into one df
    fight_stats = pd.concat([fighter_a_stats_df, fighter_b_stats_df])

    # get name of event from soup
    fight_stats['EVENT'] = soup.find('h2', class_='b-content__title').text.strip()

    # create empty list to store fighters' names
    fighters_names = []
    # parse fighters' name from soup
    for tag in soup.find_all('a', class_='b-link b-fight-details__person-link'):
        fighters_names.append(tag.text.strip())

    # get name of bout with using fighters' names
    fight_stats['BOUT'] = ' vs. '.join(fighters_names)

    # reorder columns
    fight_stats = move_columns(fight_stats, ['EVENT', 'BOUT'], 'ROUND', 'before')

    # return
    return fight_stats



# parse and organise fight results and fight stats
def parse_organise_fight_results_and_stats(soup, url, fight_results_column_names, totals_column_names, significant_strikes_column_names):
    '''
    parse and organise fight results and fight stats from soup
    this function combines other functions that parse fight results and stats into one
    and returns two dfs, one for fight results and the other for fight stats

    arguments:
    soup (html): output of get_soup() parser
    url (str): url of fight
    fight_results_df (df): an df
    fight_results_column_names (list): list of column names for fight results
    fight_stats_df (df):
    totals_column_names (list): list of column names for totals type stats
    significant_strikes_column_names (list): list of column names for significant strike type stats

    returns:
    two dfs for fight results and stats
    '''

    # parse fight results

    # parase fight results from soup
    fight_results = parse_fight_results(soup)
    # append fight url 
    fight_results.append('URL:'+url)
    # organise fight results
    fight_results_df = organise_fight_results(fight_results, fight_results_column_names)

    # parse fight stats

    # parse full fight stats for both fighters
    fighter_a_stats, fighter_b_stats = parse_fight_stats(soup)
    # organise stats extracted from soup
    fighter_a_stats_clean = organise_fight_stats(fighter_a_stats)
    fighter_b_stats_clean = organise_fight_stats(fighter_b_stats)
    # convert list of fighter stats into a structured dataframe
    fighter_a_stats_df = convert_fight_stats_to_df(fighter_a_stats_clean, totals_column_names, significant_strikes_column_names)
    fighter_b_stats_df = convert_fight_stats_to_df(fighter_b_stats_clean, totals_column_names, significant_strikes_column_names)
    # combine fighter stats into one
    fight_stats_df = combine_fighter_stats_dfs(fighter_a_stats_df, fighter_b_stats_df, soup)

    # return
    return fight_results_df, fight_stats_df



# generate list of urls for fighter details
def generate_alphabetical_urls():
    '''
    generate a list of alphabetical urls for fighter details
    fighter urls are split by their last name and categorised alphabetically
    loop through each character in the alphabet from a to z to parse all the urls
    return all fighter urls as a list

    arguments:
    none

    returns:
    a list of urls of fighter details
    '''
    # create empty list to store fighter urls to parse
    list_of_alphabetical_urls = []

    # fighters are split in alphabetically
    # generate url for each alphabet and append to list
    for character in list(string.ascii_lowercase):
        list_of_alphabetical_urls.append('http://ufcstats.com/statistics/fighters?char='+character+'&page=all')
    
    # return
    return list_of_alphabetical_urls



# parse fighter details
def parse_fighter_details(soup, fighter_details_column_names):
    '''
    parse fighter details from soup
    fighter details include first name, last name, nickname, and url
    returns dataframe with first, last, nickname, url

    arguments:
    soup (html): output of get_soup() parser

    returns:
    a dataframe of fighter details
    '''
    # parse fighter name
    # create empty list to store fighters' names
    fighter_names = []
    # loop through and get fighter's first name, last name, nickname
    for tag in soup.find_all('a', class_='b-link b-link_style_black'):
        # append name to fighter_names
        fighter_names.append(tag.text)

    # parse fighter url
    # create empty list to store fighters' urls
    fighter_urls = []
    # loop through and get fighter url
    for tag in soup.find_all('a', class_='b-link b-link_style_black'):
        # append url to list_of_fighter_urls
        # each tag will have three urls that are duplicated
        fighter_urls.append(tag['href'])

    # zip fighter's first name, last name, nickname, and url into a list of tuples
    # zip items in sets of threes
    # e.g. ('Tom', 'Aaron', '', 'http://ufcstats.com/fighter-details/93fe7332d16c6ad9')
    # if there is no first, last, or nickname, the field will be left blank
    fighter_details = list(zip(fighter_names[0::3], fighter_names[1::3], fighter_names[2::3], fighter_urls[0::3]))

    # convert list of tuples to a dataframe
    fighter_details_df = pd.DataFrame(fighter_details, columns=fighter_details_column_names)
    
    # return
    return fighter_details_df



# parse fighter tale of the tape
def parse_fighter_tott(soup):
    '''
    parse fighter tale of the tape from soup
    fighter details contain fighter, height, weight, reach, stance, dob
    clean each element in the list, removing '\n' and ' ' 
    e.g cleans '\n      Jose Aldo\n' into 'Jose Aldo'
    returns a list of fighter tale of the tape

    arguments:
    soup (html): output of get_soup() parser

    returns:
    a list of fighter tale of the tape
    '''
    # create empty list to store fighter tale of the tape
    fighter_tott = []

    # parse fighter name
    fighter_name = soup.find('span', class_='b-content__title-highlight').text
    # append fighter's name to fighter_tott
    fighter_tott.append('Fighter:'+fighter_name)

    # parse fighter's tale of the tape
    tott = soup.find_all('ul', class_='b-list__box-list')[0]
    # loop through each tag to get text and next_sibling text
    for tag in tott.find_all('i'):
        # add text together and append to fighter_tott
        fighter_tott.append(tag.text + tag.next_sibling)
    # clean each element in the list, removing '\n' and '  '
    fighter_tott = [text.replace('\n', '').replace('  ', '') for text in fighter_tott]
    
    # return
    return fighter_tott



# organise fighter tale of the tape
def organise_fighter_tott(tott_from_soup, fighter_tott_column_names, url):
    '''
    organise list of fighter tale of the tape
    remove label of tale of the tape using regex
    e.g. 'Height:5'7"' to '5'7"
    convert and return list as df

    arguments:
    tott_from_soup (list): list of fighter tale of the tale from parse_fighter_tott()
    fighter_tott_column_names (list): list of column names for fighter tale of the tape
    url (str): url of fighter

    results:
    a df of fighter tale of the tape
    '''
    # remove label of results using regex
    fighter_tott_clean = [re.sub('^(.+?): ?', '', text) for text in tott_from_soup]
    # append url to fighter_tott_clean
    fighter_tott_clean.append(url)
    # create empty df to store fighter's details
    fighter_tott_df = pd.DataFrame(columns=fighter_tott_column_names)
    # append fighter's details to fighter_details_df
    fighter_tott_df.loc[(len(fighter_tott_df))] = fighter_tott_clean

    # return
    return fighter_tott_df



# reorder columns
def move_columns(df, cols_to_move=[], ref_col='', place=''):
    '''
    reoder columns in df
    move a list of columns before or after a reference column
    taken from https://towardsdatascience.com/reordering-pandas-dataframe-columns-thumbs-down-on-standard-solutions-1ff0bc2941d5

    arguments:
    df (df): a dataframe
    cols_to_move (list): list of columns to move
    ref_col (str): reference column on where to move list of columns
    place (str): where to place list of columns, enter 'before' or 'after'

    '''
    # get list of all columns in df
    cols = df.columns.tolist()
    
    if place == 'after':
        seg1 = cols[:list(cols).index(ref_col) + 1]
        seg2 = cols_to_move
    if place == 'before':
        seg1 = cols[:list(cols).index(ref_col)]
        seg2 = cols_to_move + [ref_col]

    seg1 = [i for i in seg1 if i not in seg2]
    seg3 = [i for i in cols if i not in seg1 + seg2]

    # return
    return(df[seg1 + seg2 + seg3])