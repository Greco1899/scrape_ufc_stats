import csv
import datetime
import re

def extract_event_number(event_name):
    # Use regex to find a number following 'UFC'
    match = re.search(r'UFC (\d+):', event_name)
    return match.group(1) if match else ''

def reformat_date(original_date):
    # Convert to datetime object and then back to the desired string format
    date_obj = datetime.datetime.strptime(original_date.strip('"'), "%B %d, %Y")
    return date_obj.strftime("%m-%d-%Y")

def split_location(location):
    # Split the location into city and country
    parts = location.split(", ")
    return parts[0], parts[-1]

def reformat_csv(input_filepath, output_filepath):
    with open(input_filepath, newline='', encoding='utf-8') as csvfile, \
            open(output_filepath, mode='w', newline='', encoding='utf-8') as outfile:
        reader = csv.DictReader(csvfile)
        fieldnames = reader.fieldnames + ['EVENT_NUMBER', 'LOCATION_CITY', 'LOCATION_COUNTRY']

        writer = csv.DictWriter(outfile, fieldnames=fieldnames)
        writer.writeheader()

        for row in reader:
            # Extract EVENT_NUMBER
            row['EVENT_NUMBER'] = extract_event_number(row['EVENT'])
            # Reformat DATE field
            row['DATE'] = reformat_date(row['DATE'])
            # Split LOCATION field
            city, country = split_location(row['LOCATION'])
            row['LOCATION_CITY'] = city
            row['LOCATION_COUNTRY'] = country
            writer.writerow(row)

def main():
    # Adjust the file paths below as needed
    input_csv_path = 'old_csv/ufc_event_details.csv'
    output_csv_path = 'new_csv/ufc_event_details.csv'
    reformat_csv(input_csv_path, output_csv_path)

if __name__ == '__main__':
    main()
