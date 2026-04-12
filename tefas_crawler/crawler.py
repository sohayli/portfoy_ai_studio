import requests
import time
import random
import json
from datetime import datetime, timedelta
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class TefasCrawler:
    def __init__(self):
        self.sessions = {}
        self.user_agents = [
            {
                "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "ch": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
                "platform": '"Windows"'
            },
            {
                "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
                "ch": '"Chromium";v="123", "Google Chrome";v="123", "Not-A.Brand";v="99"',
                "platform": '"macOS"'
            },
            {
                "ua": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "ch": '"Chromium";v="122", "Google Chrome";v="122", "Not-A.Brand";v="99"',
                "platform": '"Linux"'
            }
        ]

    def _get_random_config(self):
        return random.choice(self.user_agents)

    def _sleep_with_jitter(self, base_ms):
        jitter = random.randint(0, 2000)
        time.sleep((base_ms + jitter) / 1000.0)

    def get_session(self, domain, symbol, force=False):
        now = datetime.now()
        session_key = f"{domain}_{symbol.upper()}"
        
        if not force and session_key in self.sessions:
            if self.sessions[session_key]['expiry'] > now:
                return self.sessions[session_key]

        config = self._get_random_config()
        try:
            headers = {
                'User-Agent': config['ua'],
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Ch-Ua': config['ch'],
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': config['platform'],
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1'
            }
            
            response = requests.get(f"{domain}/FonAnaliz.aspx", headers=headers, timeout=20)
            cookies = response.cookies.get_dict()
            cookie_str = "; ".join([f"{k}={v}" for k, v in cookies.items()])

            if cookie_str:
                self.sessions[session_key] = {
                    'cookie': cookie_str,
                    'expiry': now + timedelta(minutes=5),
                    'config': config
                }
                return self.sessions[session_key]
        except Exception as e:
            logger.error(f"Session Error for {domain}: {e}")
        
        return {'cookie': '', 'config': config}

    def fetch(self, symbol, start_date=None, end_date=None, fund_type='YAT'):
        """
        Fetches historical data for a given fund symbol.
        fund_type: 'YAT' (Investment), 'EMK' (Pension), 'BYF' (ETF)
        """
        domains = ['https://www.tefas.gov.tr', 'https://fundturkey.com.tr']
        
        if not end_date:
            end_date = datetime.now().strftime("%d.%m.%Y")
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime("%d.%m.%Y")

        for domain in domains:
            for attempt in range(3):
                try:
                    # Initial delay to avoid burst detection
                    self._sleep_with_jitter(2000 if attempt > 0 else 1000)
                    
                    session = self.get_session(domain, symbol, force=(attempt > 0))
                    config = session['config']
                    
                    headers = {
                        'User-Agent': config['ua'],
                        'Accept': 'application/json, text/javascript, */*; q=0.01',
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'X-Requested-With': 'XMLHttpRequest',
                        'Origin': domain,
                        'Referer': f"{domain}/FonAnaliz.aspx",
                        'Sec-Ch-Ua': config['ch'],
                        'Sec-Ch-Ua-Platform': config['platform'],
                        'Sec-Fetch-Dest': 'empty',
                        'Sec-Fetch-Mode': 'cors',
                        'Sec-Fetch-Site': 'same-origin',
                        'Cookie': session['cookie']
                    }

                    payload = {
                        'fontip': fund_type,
                        'sfontur': '',
                        'kurucu': '',
                        'fongrup': '',
                        'bastarih': start_date,
                        'bittarih': end_date,
                        'fontanim': symbol.upper(),
                        'fongrupkod': '',
                        'islemkod': ''
                    }

                    logger.info(f"Fetching {symbol} from {domain} (Attempt {attempt+1})")
                    response = requests.post(
                        f"{domain}/api/DB/GetFonTarihselVeriler", 
                        headers=headers, 
                        data=payload, 
                        timeout=20
                    )

                    if response.status_code in [403, 405] or "Request Rejected" in response.text:
                        logger.warning(f"WAF Blocked on {domain} for {symbol}")
                        continue

                    data = response.json()
                    if data and 'result' in data:
                        logger.info(f"Successfully fetched {len(data['result'])} records for {symbol}")
                        return data['result']

                except Exception as e:
                    logger.error(f"Error on {domain} for {symbol}: {e}")
        
        return None
