import csv


def split_x_of_y_and_add_fields(row, original_field, succeeded_field, attempted_field):
    """Split 'X of Y' formatted field and add new succeeded and attempted fields."""
    if original_field in row and ' of ' in row[original_field]:
        succeeded, attempted = row[original_field].split(' of ')
        row[succeeded_field] = succeeded.strip()
        row[attempted_field] = attempted.strip()


def convert_percentage_fields(row):
    """Convert percentage fields to raw numbers by removing '%'."""
    for percent_field in ['SIG.STR. %', 'TD %']:
        if row.get(percent_field, '').strip():
            row[percent_field] = row[percent_field].replace('%', '').strip()


def reformat_csv(input_filepath, output_filepath):
    """Read the input CSV, apply transformations, and write to a new output CSV."""
    with open(input_filepath, newline='', encoding='utf-8') as csvfile, \
            open(output_filepath, mode='w', newline='', encoding='utf-8') as outfile:

        reader = csv.DictReader(csvfile)
        # Ensure the new field names match exactly what you're adding to the row
        extended_fieldnames = reader.fieldnames + [
            'SIG_STR_SUCCEEDED', 'SIG_STR_ATTEMPTED',
            'TOTAL_STR_SUCCEEDED', 'TOTAL_STR_ATTEMPTED',
            'HEAD_SUCCEEDED', 'HEAD_ATTEMPTED',
            'BODY_SUCCEEDED', 'BODY_ATTEMPTED',
            'LEG_SUCCEEDED', 'LEG_ATTEMPTED',
            'DISTANCE_SUCCEEDED', 'DISTANCE_ATTEMPTED',
            'CLINCH_SUCCEEDED', 'CLINCH_ATTEMPTED',
            'GROUND_SUCCEEDED', 'GROUND_ATTEMPTED'
        ]

        writer = csv.DictWriter(outfile, fieldnames=extended_fieldnames)
        writer.writeheader()

        for row in reader:
            convert_percentage_fields(row)  # Apply percentage fields conversion
            # Apply splitting for the specified fields
            fields_to_split = [
                ('SIG.STR.', 'SIG_STR_SUCCEEDED', 'SIG_STR_ATTEMPTED'),
                ('TOTAL STR.', 'TOTAL_STR_SUCCEEDED', 'TOTAL_STR_ATTEMPTED'),
                ('HEAD', 'HEAD_SUCCEEDED', 'HEAD_ATTEMPTED'),
                ('BODY', 'BODY_SUCCEEDED', 'BODY_ATTEMPTED'),
                ('LEG', 'LEG_SUCCEEDED', 'LEG_ATTEMPTED'),
                ('DISTANCE', 'DISTANCE_SUCCEEDED', 'DISTANCE_ATTEMPTED'),
                ('CLINCH', 'CLINCH_SUCCEEDED', 'CLINCH_ATTEMPTED'),
                ('GROUND', 'GROUND_SUCCEEDED', 'GROUND_ATTEMPTED')
            ]
            for original_field, succeeded_field, attempted_field in fields_to_split:
                split_x_of_y_and_add_fields(row, original_field, succeeded_field, attempted_field)

            writer.writerow({k: row.get(k, '') for k in extended_fieldnames})

def main():
    # Adjust the file paths below as needed
    input_csv_path = 'old_csv/ufc_fight_stats.csv'
    output_csv_path = 'new_csv/ufc_fight_stats.csv'
    reformat_csv(input_csv_path, output_csv_path)

if __name__ == '__main__':
    main()
