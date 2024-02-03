import sqlite3
from sqlite3 import Error

def create_connection(db_file):
    """Create database connection to SQLite"""
    conn = None
    try:
        conn = sqlite3.connect(db_file)
    except Error as e:
        print(e)
    return conn

def create_table(conn, create_table_sql):
    """Create table in database"""
    try:
        c = conn.cursor()
        c.execute(create_table_sql)
    except Error as e:
        print(e)

def main():
    """Create database and tables"""
    database = "ufc_database.db"

    sql_create_event_details_table = """CREATE TABLE IF NOT EXISTS event_details (
                                    event TEXT PRIMARY KEY,
                                    url TEXT NOT NULL,
                                    date TEXT,
                                    location TEXT
                                );"""

    sql_create_fight_details_table = """CREATE TABLE IF NOT EXISTS fight_details (
                                    url TEXT PRIMARY KEY,
                                    event TEXT NOT NULL,
                                    bout TEXT,
                                    FOREIGN KEY (event) REFERENCES event_details (event)
                                );"""

    sql_create_fight_results_table = """CREATE TABLE IF NOT EXISTS fight_results (
                                        url TEXT PRIMARY KEY,
                                        event TEXT NOT NULL,
                                        bout TEXT,
                                        outcome TEXT,
                                        weightclass TEXT,
                                        method TEXT,
                                        round INTEGER,
                                        time TEXT,
                                        time_format TEXT,
                                        referee TEXT,
                                        details TEXT,
                                        FOREIGN KEY (event) REFERENCES event_details (event),
                                        FOREIGN KEY (bout) REFERENCES fight_details (bout)
                                    );"""

    sql_create_fight_stats_table = """CREATE TABLE IF NOT EXISTS fight_stats (
                                      event TEXT NOT NULL,
                                      bout TEXT,
                                      round INTEGER,
                                      fighter TEXT,
                                      kd INTEGER,
                                      sig_str TEXT,
                                      sig_str_pct TEXT,
                                      total_str TEXT,
                                      td TEXT,
                                      td_pct TEXT,
                                      sub_att INTEGER,
                                      rev INTEGER,
                                      ctrl TEXT,
                                      head TEXT,
                                      body TEXT,
                                      leg TEXT,
                                      distance TEXT,
                                      clinch TEXT,
                                      ground TEXT,
                                      FOREIGN KEY (event) REFERENCES event_details (event),
                                      FOREIGN KEY (bout) REFERENCES fight_results (bout)
                                  );"""

    sql_create_fighter_details_table = """CREATE TABLE IF NOT EXISTS fighter_details (
                                   url TEXT PRIMARY KEY,
                                   first TEXT,
                                   last TEXT,
                                   nickname TEXT
                               );"""

    sql_create_fighter_stats_table = """CREATE TABLE IF NOT EXISTS fighter_stats (
                                        url TEXT PRIMARY KEY,
                                        fighter TEXT NOT NULL,
                                        height TEXT,
                                        weight TEXT,
                                        reach TEXT,
                                        stance TEXT,
                                        dob TEXT,
                                        FOREIGN KEY (url) REFERENCES fighter_details (url)
                                    );"""

    #Connect to DB
    conn = create_connection(database)

    #Create tables
    if conn is not None:
        create_table(conn, sql_create_event_details_table)
        create_table(conn, sql_create_fight_details_table)
        create_table(conn, sql_create_fight_results_table)
        create_table(conn, sql_create_fight_stats_table)
        create_table(conn, sql_create_fighter_details_table)
        create_table(conn, sql_create_fighter_stats_table)
    else:
        print("Error, cannot create the database connection")

    conn.close()

if __name__ == '__main__':
    main()
