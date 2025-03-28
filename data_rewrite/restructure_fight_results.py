import csv
import re

def split_fighters(bout):
    fighters = bout.split(' vs. ')
    return fighters[0].strip(), fighters[1].strip()

def split_outcome(outcome):
    results = outcome.split('/')
    return results[0].strip(), results[1].strip()

def extract_judges(details):
    judges_scores = re.findall(r'([a-zA-Z\s]+)\s(\d+\s-\s\d+)', details)
    # Flatten the list of tuples for easier insertion into the CSV
    return [item for sublist in judges_scores for item in sublist]

def reformat_csv(input_filepath, output_filepath):
    with open(input_filepath, newline='', encoding='utf-8') as csvfile, \
            open(output_filepath, mode='w', newline='', encoding='utf-8') as outfile:

        reader = csv.DictReader(csvfile)
        # Add new columns to the existing ones
        fieldnames = reader.fieldnames + ['FIGHTER_1', 'FIGHTER_2', 'FIGHTER_1_RESULT', 'FIGHTER_2_RESULT', 'JUDGE_1',
                                          'JUDGE_1_SCORE', 'JUDGE_2', 'JUDGE_2_SCORE', 'JUDGE_3', 'JUDGE_3_SCORE']

        writer = csv.DictWriter(outfile, fieldnames=fieldnames)
        writer.writeheader()

        for row in reader:
            # Split BOUT into FIGHTER_1 and FIGHTER_2
            fighter_1, fighter_2 = split_fighters(row['BOUT'])
            # Split OUTCOME into FIGHTER_1_RESULT and FIGHTER_2_RESULT
            result_1, result_2 = split_outcome(row['OUTCOME'])
            # Extract judges' scores
            judges_info = extract_judges(row['DETAILS'])

            # Update row with new data
            row.update({
                'FIGHTER_1': fighter_1,
                'FIGHTER_2': fighter_2,
                'FIGHTER_1_RESULT': result_1,
                'FIGHTER_2_RESULT': result_2
            })

            # Add judges' scores if present
            for i in range(min(len(judges_info) // 2, 3)):
                row[f'JUDGE_{i + 1}'] = judges_info[i * 2]
                row[f'JUDGE_{i + 1}_SCORE'] = judges_info[i * 2 + 1]

            writer.writerow(row)

def main():
    # Adjust the file paths below as needed
    input_csv_path = 'old_csv/ufc_fight_results.csv'
    output_csv_path = 'new_csv/ufc_fight_results.csv'
    reformat_csv(input_csv_path, output_csv_path)

if __name__ == '__main__':
    main()
