#!/usr/bin/env python3
"""
TEFAS Daily Fund Price Scraper
Uses tefas-crawler library to fetch fund prices and saves to PostgreSQL
"""

import sys
import os
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import execute_values
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


def fetch_tefas_data(date_str=None):
    """Fetch all fund data from TEFAS for given date"""

    if not date_str:
        date_str = datetime.now().strftime("%Y-%m-%d")

    print(f"[TEFAS] 📅 Fetching fund data for: {date_str}")

    try:
        tefas = Crawler()

        # Fetch all funds (YAT, EMK, BYF types)
        print("[TEFAS] 🔄 Fetching YAT funds...")
        yat_data = tefas.fetch(start=date_str, kind="YAT")

        print("[TEFAS] 🔄 Fetching EMK funds...")
        emk_data = tefas.fetch(start=date_str, kind="EMK")

        print("[TEFAS] 🔄 Fetching BYF funds...")
        byf_data = tefas.fetch(start=date_str, kind="BYF")

        # Combine all fund types
        all_funds = []

        for df in [yat_data, emk_data, byf_data]:
            if df is not None and len(df) > 0:
                for _, row in df.iterrows():
                    all_funds.append(
                        {
                            "symbol": row.get("code", ""),
                            "price": str(row.get("price", 0)),
                            "name": row.get("title", ""),
                            "fundType": row.get("kind", "YAT"),
                            "date": row.get("date", date_str),
                        }
                    )

        print(f"[TEFAS] ✅ Total {len(all_funds)} funds fetched")
        return all_funds

    except Exception as e:
        print(f"[TEFAS] ❌ Fetch failed: {e}")
        return []


def save_to_database(funds, conn):
    """Save fund data to PostgreSQL database"""

    if not funds:
        print("[DB] ⚠️ No funds to save")
        return

    print(f"[DB] 💾 Saving {len(funds)} funds to database...")

    try:
        cursor = conn.cursor()

        # Clear old data for same date (optional - for fresh update)
        # date = funds[0]['date'] if funds else datetime.now().strftime('%Y-%m-%d')
        # cursor.execute("DELETE FROM fund_prices WHERE date = %s", (date,))

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

        print(f"[DB] ✅ Successfully saved {len(funds)} funds")

        # Verify saved data
        cursor.execute("SELECT COUNT(*) FROM fund_prices")
        count = cursor.fetchone()[0]
        print(f"[DB] 📊 Total funds in database: {count}")

        cursor.close()

    except Exception as e:
        print(f"[DB] ❌ Save failed: {e}")
        conn.rollback()


def scrape_yesterday():
    """Scrape yesterday's data (useful for catching missed days)"""
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    return scrape_tefas(yesterday)


def scrape_tefas(date_str=None):
    """Main function to scrape and save TEFAS data"""

    print("=" * 60)
    print("TEFAS Fund Price Scraper")
    print("=" * 60)

    start_time = datetime.now()

    # Get database connection
    conn = get_db_connection()

    # Fetch TEFAS data
    funds = fetch_tefas_data(date_str)

    # Save to database
    if funds:
        save_to_database(funds, conn)

    # Close connection
    conn.close()

    duration = (datetime.now() - start_time).total_seconds()

    print("=" * 60)
    print(f"[SCRAPER] ⏱️ Completed in {duration:.2f} seconds")
    print("=" * 60)


def main():
    """Entry point for command line usage"""

    if len(sys.argv) > 1:
        # If date provided as argument
        date_arg = sys.argv[1]
        scrape_tefas(date_arg)
    else:
        # Default: scrape today
        scrape_tefas()


if __name__ == "__main__":
    main()
