import os
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore
from crawler import TefasCrawler
from datetime import datetime
import logging

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def initialize_firebase():
    """
    Initializes Firebase using a service account key.
    Make sure to place your service-account.json in the same directory
    or set the GOOGLE_APPLICATION_CREDENTIALS environment variable.
    """
    try:
        # If already initialized, return the app
        return firebase_admin.get_app()
    except ValueError:
        # Initialize with service account
        cred_path = os.getenv('FIREBASE_SERVICE_ACCOUNT_PATH', 'service-account.json')
        if os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            return firebase_admin.initialize_app(cred, {
                'projectId': os.getenv('FIREBASE_PROJECT_ID')
            })
        else:
            logger.warning("Firebase service account not found. Running in local-only mode.")
            return None

def sync_fund(db, symbol, data):
    if not db or not data:
        return
    
    try:
        # Get the latest price (usually the first item in the result)
        latest = data[0]
        price = float(latest.get('FIYAT', 0))
        date_str = latest.get('TARIH') # e.g. "12.04.2026"
        
        if price > 0:
            doc_ref = db.collection('fund_prices').document(symbol.upper())
            doc_ref.set({
                'price': price,
                'updatedAt': firestore.SERVER_TIMESTAMP,
                'source': 'tefas-crawler-python',
                'lastDate': date_str
            }, merge=True)
            logger.info(f"Synced {symbol} to Firestore: {price}")
    except Exception as e:
        logger.error(f"Error syncing {symbol} to Firestore: {e}")

def main():
    app = initialize_firebase()
    db = firestore.client() if app else None
    
    crawler = TefasCrawler()
    
    # Example funds to sync
    funds_to_sync = ['AVR', 'AEI', 'NHN', 'IPV', 'TDF']
    
    for symbol in funds_to_sync:
        logger.info(f"Processing {symbol}...")
        data = crawler.fetch(symbol)
        if data:
            sync_fund(db, symbol, data)
        
        # Delay between different funds to be polite
        time.sleep(random.randint(3, 7))

if __name__ == "__main__":
    main()
