#!/usr/bin/env python3
"""
TEFAS Fund Price Crawler
Fetches fund prices from TEFAS website and sends to backend API
"""

import requests
import json
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

API_BASE = "http://localhost:3000/api"


def fetch_tefas_with_selenium():
    """Use Selenium to fetch TEFAS data (bypass anti-scraping)"""

    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option("useAutomationExtension", False)

    driver = webdriver.Chrome(options=chrome_options)

    try:
        print("[TEFAS] Navigating to TEFAS website...")
        driver.get("https://www.tefas.gov.tr/FonAnaliz.aspx")

        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "ddlFonKod"))
        )

        fund_dropdown = driver.find_element(By.ID, "ddlFonKod")
        fund_options = fund_dropdown.find_elements(By.TAG_NAME, "option")

        funds = []

        for option in fund_options[1:]:  # Skip first empty option
            try:
                symbol = option.get_attribute("value")
                if not symbol:
                    continue

                print(f"[TEFAS] Fetching {symbol}...")

                driver.execute_script(
                    f"document.getElementById('ddlFonKod').value = '{symbol}'"
                )
                driver.find_element(By.ID, "btnGetir").click()

                time.sleep(2)

                price_element = WebDriverWait(driver, 5).until(
                    EC.presence_of_element_located((By.ID, "lblFonFiyat"))
                )

                price_text = price_element.text.strip()
                price = float(
                    price_text.replace(",", ".").replace(" TL", "").replace(" TRY", "")
                )

                name_element = driver.find_element(By.ID, "lblFonAd")
                name = name_element.text.strip()

                funds.append(
                    {
                        "symbol": symbol,
                        "price": price,
                        "name": name,
                        "fundType": "YAT",
                        "date": datetime.now().strftime("%Y-%m-%d"),
                    }
                )

                print(f"[TEFAS] {symbol}: {price} TRY - {name}")

            except Exception as e:
                print(f"[ERROR] Failed to fetch {symbol}: {e}")
                continue

        return funds

    finally:
        driver.quit()


def fetch_tefas_api():
    """Try TEFAS public API (may be blocked)"""

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Referer": "https://www.tefas.gov.tr/",
    }

    fund_codes = ["AVR", "AFA", "BYF", "EMK", "KBA", "SBF", "YKB", "ZBF"]
    funds = []

    for symbol in fund_codes:
        try:
            url = f"https://www.tefas.gov.tr/TefasDataApi/api/FonAnalizData"
            payload = {"FonKodu": symbol}

            response = requests.post(url, json=payload, headers=headers, timeout=10)

            if response.status_code == 200:
                data = response.json()

                price = float(data.get("FonFiyat", 0))
                name = data.get("FonAd", "")

                funds.append(
                    {
                        "symbol": symbol,
                        "price": price,
                        "name": name,
                        "fundType": "YAT",
                        "date": datetime.now().strftime("%Y-%m-%d"),
                    }
                )

                print(f"[TEFAS API] {symbol}: {price} TRY")

        except Exception as e:
            print(f"[ERROR] API failed for {symbol}: {e}")

    return funds


def update_backend(funds):
    """Send fund data to backend API"""

    if not funds:
        print("[WARNING] No funds to update")
        return

    print(f"\n[UPDATE] Sending {len(funds)} funds to backend...")

    try:
        response = requests.post(
            f"{API_BASE}/tefas/bulk-update",
            json={"funds": funds},
            headers={"Content-Type": "application/json"},
            timeout=30,
        )

        result = response.json()

        if result.get("success"):
            print(f"✅ Updated {result['updated']} funds")
            print(f"❌ Failed {result['failed']} funds")
            print(f"📝 Message: {result['message']}")
        else:
            print(f"❌ Update failed: {result}")

    except Exception as e:
        print(f"[ERROR] Backend update failed: {e}")


def main():
    print("=" * 60)
    print("TEFAS Fund Price Crawler")
    print("=" * 60)

    print("\n[1] Trying TEFAS API...")
    funds = fetch_tefas_api()

    if not funds:
        print("\n[2] API failed. Using Selenium browser automation...")
        print("[INFO] Selenium requires Chrome/Chromium browser")
        funds = fetch_tefas_with_selenium()

    if funds:
        update_backend(funds)

        print("\n[FETCH] Fetching all funds from database...")
        response = requests.get(f"{API_BASE}/tefas/funds", timeout=10)
        all_funds = response.json()

        print(f"\n📊 Total {len(all_funds)} funds in database:")
        for fund in all_funds:
            print(f"  {fund['symbol']}: {fund['price']} TRY - {fund['name']}")
    else:
        print("\n❌ No funds fetched. Check TEFAS website access.")


if __name__ == "__main__":
    main()
