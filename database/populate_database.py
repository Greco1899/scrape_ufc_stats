import csv
import sqlite3
from sqlite3 import Error

def create_connection(db_file):
    """Connect to database"""
    conn = None
    try:
        conn = sqlite3.connect(db_file)
    except Error as e:
        print(e)
    return conn

def insert_csv_data(conn, csv_file, insert_sql):
    """Populate database with CSV data"""
    try:
        c = conn.cursor()
        with open(csv_file, encoding='utf-8') as csvfile:
            csv_reader = csv.DictReader(csvfile)
            for row in csv_reader:
                data_tuple = tuple(row[col] for col in csv_reader.fieldnames)
                c.execute(insert_sql, data_tuple)
        conn.commit()
    except Error as e:
        print(f"Error inserting data from {csv_file}: {e}")

def main():
    """Populate database"""
    database = "ufc_database.db"

    csv_files_and_sql = {
        "../ufc_event_details.csv": "INSERT OR IGNORE INTO event_details (event, url, date, location) VALUES (?, ?, ?, ?)",
        "../ufc_fight_details.csv": "INSERT OR IGNORE INTO fight_details (event, bout, url) VALUES (?, ?, ?)",
        "../ufc_fight_results.csv": "INSERT OR IGNORE INTO fight_results (event, bout, outcome, weightclass, method, round, time, time_format, referee, details, url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        "../ufc_fight_stats.csv": "INSERT OR IGNORE INTO fight_stats (event, bout, round, fighter, kd, sig_str, sig_str_pct, total_str, td, td_pct, sub_att, rev, ctrl, head, body, leg, distance, clinch, ground) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        "../ufc_fighter_details.csv": "INSERT OR IGNORE INTO fighter_details (first, last, nickname, url) VALUES (?, ?, ?, ?)",
        "../ufc_fighter_tott.csv": "INSERT OR IGNORE INTO fighter_stats (fighter, height, weight, reach, stance, dob, url) VALUES (?, ?, ?, ?, ?, ?, ?)"
    }

    conn = create_connection(database)

    if not conn:
        print("Error, cannot create the database connection")
        return

    for csv_file, insert_sql in csv_files_and_sql.items():
        adjusted_csv_path = f"{csv_file}"
        insert_csv_data(conn, adjusted_csv_path, insert_sql)

    conn.close()

if __name__ == '__main__':
    main()
