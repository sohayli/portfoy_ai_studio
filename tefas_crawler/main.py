import os
from dotenv import load_dotenv
from crawler import TefasCrawler
from datetime import datetime
import logging
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Initialize Supabase
supabase_url = os.getenv("SUPABASE_URL", "https://uraaixhgpqpqffckocjky.supabase.co")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client | None = (
    create_client(supabase_url, supabase_key) if supabase_key else None
)


def sync_fund(symbol: str, data: list):
    """Sync fund data to Supabase fund_prices table."""
    if not supabase or not data:
        logger.warning(f"Supabase not configured or no data for {symbol}")
        return

    try:
        # Get the latest price (usually the first item in the result)
        latest = data[0]
        price = float(latest.get("FIYAT", 0))
        date_str = latest.get("TARIH")  # e.g. "12.04.2026"
        name = latest.get("FON ADI", symbol.upper())

        if price > 0:
            result = (
                supabase.table("fund_prices")
                .upsert(
                    {
                        "symbol": symbol.upper(),
                        "price": price,
                        "name": name,
                        "date": date_str,
                        "source": "tefas-crawler-python",
                        "updated_at": datetime.now().isoformat(),
                    },
                    on_conflict="symbol",
                )
                .execute()
            )

            logger.info(f"Synced {symbol} to Supabase: {price}")
    except Exception as e:
        logger.error(f"Error syncing {symbol} to Supabase: {e}")


def sync_all_funds(fund_list: list[str]):
    """Sync multiple funds."""
    crawler = TefasCrawler()

    for symbol in fund_list:
        logger.info(f"Processing {symbol}...")
        data = crawler.fetch(symbol)
        if data:
            sync_fund(symbol, data)

        # Delay between different funds to be polite
        import time
        import random

        time.sleep(random.randint(3, 7))


def main():
    if not supabase:
        logger.error("SUPABASE_SERVICE_ROLE_KEY not set. Exiting.")
        return

    # Example funds to sync
    funds_to_sync = ["AVR", "AEI", "NHN", "IPV", "TDF", "KLU", "GZT", "KPC"]

    logger.info(f"Starting TEFAS sync for {len(funds_to_sync)} funds...")
    sync_all_funds(funds_to_sync)
    logger.info("TEFAS sync completed.")


if __name__ == "__main__":
    main()
