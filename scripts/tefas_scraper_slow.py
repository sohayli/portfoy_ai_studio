#!/usr/bin/env python3
"""
TEFAS Daily Fund Price Scraper (Modified for Better Rate Limit Handling)
Uses tefas-crawler library to fetch fund prices and saves to PostgreSQL
"""

import sys
import os
import time
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import execute_values

# Add tefas-crawler path if needed
sys.path.insert(0, "/Users/hayli/tefas-crawler-temp")

from tefas import Crawler

# Database connection settings
DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "portfoy_ai",
    "user": "hayli",
    "password": "dev123",
}


def get_db_connection():
    """Create PostgreSQL database connection"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        print("[DB] ✅ Connected to PostgreSQL")
        return conn
    except Exception as e:
        print(f"[DB] ❌ Connection failed: {e}")
        sys.exit(1)


def fetch_fund_with_retry(tefas, date_str, kind="YAT", max_retries=3):
    """Fetch funds with better retry logic"""

    for attempt in range(max_retries):
        try:
            print(f"[TEFAS] Attempt {attempt + 1}/{max_retries} for {kind} funds...")

            data = tefas.fetch(start=date_str, kind=kind)

            if data is not None and len(data) > 0:
                print(f"[TEFAS] ✅ {len(data)} {kind} funds fetched")
                return data

            print(f"[TEFAS] ⚠️ No data returned for {kind}")

        except Exception as e:
            print(f"[TEFAS] ❌ Attempt {attempt + 1} failed: {str(e)[:100]}")

            if attempt < max_retries - 1:
                wait_time = 120  # Wait 2 minutes between retries
                print(f"[TEFAS] ⏳ Waiting {wait_time} seconds before retry...")
                time.sleep(wait_time)
            else:
                print(f"[TEFAS] ❌ Max retries reached for {kind}")
                return None

    return None


def fetch_tefas_data_slow(date_str=None):
    """Fetch all fund data from TEFAS with slow, careful rate limiting"""

    if not date_str:
        # Use a recent past date (yesterday)
        date_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    print(f"[TEFAS] 📅 Fetching fund data for: {date_str}")
    print("[TEFAS] ⚠️ Using slow mode to avoid rate limiting...")

    all_funds = []

    try:
        # Initialize crawler
        print("[TEFAS] 🔄 Initializing crawler...")
        tefas = Crawler()

        # Wait before first request
        time.sleep(10)

        # Fetch YAT funds
        yat_data = fetch_fund_with_retry(tefas, date_str, "YAT", max_retries=2)

        if yat_data:
            time.sleep(120)  # Wait 2 minutes between fund types

            # Fetch EMK funds
            emk_data = fetch_fund_with_retry(tefas, date_str, "EMK", max_retries=2)

            if emk_data:
                time.sleep(120)  # Wait 2 minutes

                # Fetch BYF funds
                byf_data = fetch_fund_with_retry(tefas, date_str, "BYF", max_retries=2)

        # Process fetched data
        for df, kind in [(yat_data, "YAT"), (emk_data, "EMK"), (byf_data, "BYF")]:
            if df is not None and len(df) > 0:
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
        print(f"[TEFAS] ❌ Critical error: {e}")
        import traceback

        traceback.print_exc()
        return []


def save_to_database(funds, conn):
    """Save fund data to PostgreSQL database"""

    if not funds:
        print("[DB] ⚠️ No funds to save")
        return 0

    print(f"[DB] 💾 Saving {len(funds)} funds to database...")

    try:
        cursor = conn.cursor()

        # Upsert fund data
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

        # Prepare data for bulk insert
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

        # Bulk upsert
        execute_values(cursor, upsert_query, values)

        conn.commit()

        saved_count = len(funds)
        print(f"[DB] ✅ Successfully saved {saved_count} funds")

        # Verify saved data
        cursor.execute("SELECT COUNT(*) FROM fund_prices")
        count = cursor.fetchone()[0]
        print(f"[DB] 📊 Total funds in database: {count}")

        cursor.close()
        return saved_count

    except Exception as e:
        print(f"[DB] ❌ Save failed: {e}")
        import traceback

        traceback.print_exc()
        conn.rollback()
        return 0


def scrape_tefas(date_str=None, slow_mode=True):
    """Main function to scrape and save TEFAS data"""

    print("=" * 60)
    print("TEFAS Fund Price Scraper")
    print("=" * 60)

    start_time = datetime.now()

    # Get database connection
    conn = get_db_connection()

    # Fetch TEFAS data
    if slow_mode:
        funds = fetch_tefas_data_slow(date_str)
    else:
        # Fast mode (may trigger rate limiting)
        from scripts.tefas_scraper import fetch_tefas_data

        funds = fetch_tefas_data(date_str)

    # Save to database
    saved_count = 0
    if funds:
        saved_count = save_to_database(funds, conn)

    # Close connection
    conn.close()

    duration = (datetime.now() - start_time).total_seconds()

    print("=" * 60)
    print(f"[SCRAPER] ⏱️ Completed in {duration:.2f} seconds")
    print(f"[SCRAPER] 💾 Saved {saved_count} funds to database")
    print("=" * 60)

    return saved_count


def main():
    """Entry point for command line usage"""

    if len(sys.argv) > 1:
        date_arg = sys.argv[1]
        scrape_tefas(date_arg, slow_mode=True)
    else:
        # Default: scrape yesterday (to avoid current day issues)
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        scrape_tefas(yesterday, slow_mode=True)


if __name__ == "__main__":
    main()
