#!/usr/bin/env python3
"""
TEFAS Daily Fund Price Scraper
Uses tefas-crawler library to fetch fund prices and saves to PostgreSQL
"""

import sys
import time
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import execute_values

sys.path.insert(0, "/Users/hayli/tefas-crawler-temp")

from tefas import Crawler

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "portfoy_ai",
    "user": "hayli",
    "password": "dev123",
}


def get_db_connection():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        print("[DB] ✅ Connected to PostgreSQL")
        return conn
    except Exception as e:
        print(f"[DB] ❌ Connection failed: {e}")
        sys.exit(1)


def fetch_fund_with_retry(tefas, date_str, kind="YAT", max_retries=3):
    for attempt in range(max_retries):
        try:
            print(f"[TEFAS] Attempt {attempt + 1}/{max_retries} for {kind} funds...")
            data = tefas.fetch(start=date_str, kind=kind)

            if data is not None and not data.empty:
                print(f"[TEFAS] ✅ {len(data)} {kind} funds fetched")
                return data

        except Exception as e:
            print(f"[TEFAS] ❌ Attempt {attempt + 1} failed: {str(e)[:100]}")

            if attempt < max_retries - 1:
                wait_time = 120
                print(f"[TEFAS] ⏳ Waiting {wait_time} seconds...")
                time.sleep(wait_time)
            else:
                return None
    return None


def fetch_tefas_data(date_str=None):
    if not date_str:
        date_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    print(f"[TEFAS] 📅 Fetching fund data for: {date_str}")

    all_funds = []

    try:
        print("[TEFAS] 🔄 Initializing crawler...")
        tefas = Crawler()
        time.sleep(10)

        yat_data = fetch_fund_with_retry(tefas, date_str, "YAT", max_retries=2)
        time.sleep(120)

        emk_data = fetch_fund_with_retry(tefas, date_str, "EMK", max_retries=2)
        time.sleep(120)

        byf_data = fetch_fund_with_retry(tefas, date_str, "BYF", max_retries=2)

        for df, kind in [(yat_data, "YAT"), (emk_data, "EMK"), (byf_data, "BYF")]:
            if df is not None and not df.empty:
                print(f"[TEFAS] Processing {len(df)} {kind} funds...")
                for _, row in df.iterrows():
                    all_funds.append(
                        {
                            "symbol": row.get("code", ""),
                            "price": str(row.get("price", 0)),
                            "name": row.get("title", ""),
                            "fundType": kind,
                            "date": str(row.get("date", date_str)),
                        }
                    )

        print(f"[TEFAS] ✅ Total {len(all_funds)} funds fetched")
        return all_funds

    except Exception as e:
        print(f"[TEFAS] ❌ Error: {e}")
        return []


def save_to_database(funds, conn):
    if not funds:
        print("[DB] ⚠️ No funds to save")
        return 0

    print(f"[DB] 💾 Saving {len(funds)} funds...")

    try:
        cursor = conn.cursor()

        upsert_query = """
            INSERT INTO fund_prices (symbol, price, name, fund_type, date, source, updated_at)
            VALUES %s
            ON CONFLICT (symbol) DO UPDATE SET
                price = EXCLUDED.price,
                name = EXCLUDED.name,
                fund_type = EXCLUDED.fund_type,
                date = EXCLUDED.date,
                source = EXCLUDED.source,
                updated_at = EXCLUDED.updated_at
        """

        values = [
            (
                fund["symbol"],
                fund["price"],
                fund["name"],
                fund["fundType"],
                fund["date"],
                "tefas-crawler",
                datetime.now(),
            )
            for fund in funds
        ]

        execute_values(cursor, upsert_query, values)
        conn.commit()

        print(f"[DB] ✅ Saved {len(funds)} funds")

        cursor.execute("SELECT COUNT(*) FROM fund_prices")
        count = cursor.fetchone()[0]
        print(f"[DB] 📊 Total funds in DB: {count}")

        cursor.close()
        return len(funds)

    except Exception as e:
        print(f"[DB] ❌ Save failed: {e}")
        conn.rollback()
        return 0


def scrape_tefas(date_str=None):
    print("=" * 60)
    print("TEFAS Fund Price Scraper")
    print("=" * 60)

    start_time = datetime.now()
    conn = get_db_connection()
    funds = fetch_tefas_data(date_str)

    saved_count = 0
    if funds:
        saved_count = save_to_database(funds, conn)

    conn.close()

    duration = (datetime.now() - start_time).total_seconds()

    print("=" * 60)
    print(f"[SCRAPER] ⏱️ Completed in {duration:.2f} seconds")
    print(f"[SCRAPER] 💾 Saved {saved_count} funds")
    print("=" * 60)


def main():
    if len(sys.argv) > 1:
        scrape_tefas(sys.argv[1])
    else:
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        scrape_tefas(yesterday)


if __name__ == "__main__":
    main()
