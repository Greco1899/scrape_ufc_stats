import csv
import re

def extract_event_number(event_name):
    # Use regex to find a number following 'UFC'
    match = re.search(r'UFC (\d+):', event_name)
    return match.group(1) if match else ''

def split_fighters(bout):
    # Split the bout into two fighters
    fighters = bout.split(' vs. ')
    return fighters[0], fighters[1] if len(fighters) > 1 else ('', '')

def reformat_csv(input_filepath, output_filepath):
    with open(input_filepath, newline='', encoding='utf-8') as csvfile, \
            open(output_filepath, mode='w', newline='', encoding='utf-8') as outfile:
        reader = csv.DictReader(csvfile)
        fieldnames = reader.fieldnames + ['EVENT_NUMBER', 'MAIN_FIGHTER_1', 'MAIN_FIGHTER_2']

        writer = csv.DictWriter(outfile, fieldnames=fieldnames)
        writer.writeheader()

        for row in reader:
            # Extract EVENT_NUMBER
            row['EVENT_NUMBER'] = extract_event_number(row['EVENT'])
            # Split BOUT field into MAIN_FIGHTER_1 and MAIN_FIGHTER_2
            main_fighter_1, main_fighter_2 = split_fighters(row['BOUT'])
            row['MAIN_FIGHTER_1'] = main_fighter_1
            row['MAIN_FIGHTER_2'] = main_fighter_2
            writer.writerow(row)


def main():
    # Adjust the file paths below as needed
    input_csv_path = 'old_csv/ufc_fight_details.csv'
    output_csv_path = 'new_csv/ufc_fight_details.csv'
    reformat_csv(input_csv_path, output_csv_path)

if __name__ == '__main__':
    main()

