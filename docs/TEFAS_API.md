# TEFAS API Integration

TEFAS (Türkiye Fon Alım Satım Platformu) fund prices integration for Portfoy AI Studio.

## API Endpoints

### 1. Bulk Update Fund Prices

**POST** `/api/tefas/bulk-update`

Update multiple fund prices at once.

**Request Body:**
```json
{
  "funds": [
    {
      "symbol": "AVR",
      "price": 1.2345,
      "name": "AvivaSA Emeklilik ve Hayat A.Ş. AVR Fon",
      "fundType": "YAT",
      "date": "2026-04-15"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "updated": 4,
  "failed": 0,
  "message": "Updated 4 funds, 0 failed"
}
```

### 2. Get All Funds

**GET** `/api/tefas/funds`

Returns all fund prices stored in database.

**Response:**
```json
[
  {
    "symbol": "AVR",
    "price": "1.2345",
    "name": "AvivaSA Emeklilik ve Hayat A.Ş. AVR Fon",
    "fundType": "YAT",
    "date": "2026-04-15",
    "source": "tefas",
    "updatedAt": "2026-04-15T20:01:22.638Z"
  }
]
```

### 3. Get Single Fund Price

**GET** `/api/price/tefas/:symbol`

Get current price for a specific fund (converted to USD).

**Response:**
```json
{
  "price": 0.027586962059826498
}
```

## Usage

### Manual Update (Node.js)

```bash
node scripts/update-tefas.js
```

### Python Crawler

Python crawler uses Selenium browser automation to fetch real TEFAS data.

**Requirements:**
```bash
pip install selenium requests
```

**Run:**
```bash
python3 scripts/tefas-crawler.py
```

**Note:** Python crawler requires Chrome/Chromium browser installed.

### CSV Upload (Future Feature)

Upload CSV file with fund prices:

```csv
symbol,price,name,fundType,date
AVR,1.2345,AvivaSA Fon,YAT,2026-04-15
AFA,2.5678,Anadolu Fon,YAT,2026-04-15
```

## Database Schema

**Table:** `fund_prices`

| Column | Type | Description |
|--------|------|-------------|
| symbol | TEXT (PK) | Fund code (e.g., AVR) |
| price | NUMERIC | Fund price in TRY |
| name | TEXT | Fund name |
| fundType | TEXT | Fund type (YAT, EMK, BYF) |
| date | TEXT | Price date |
| source | TEXT | Data source (default: 'tefas') |
| updatedAt | TIMESTAMP | Last update time |

## Automated Sync

**GET** `/api/tefas/sync`

Trigger automatic sync (requires Python crawler running in background).

## Price Conversion

Fund prices are stored in TRY (Turkish Lira) and converted to USD using current USDTRY rate from Yahoo Finance.

**Formula:**
```
price_usd = price_try / usdtry_rate
```

## Fund Types

- **YAT**: Yatırım Fonu (Investment Fund)
- **EMK**: Emeklilik Fonu (Pension Fund)
- **BYF**: BES Fonu (Private Pension Fund)

## Troubleshooting

### TEFAS API Blocked

TEFAS website has anti-scraping protection. Direct API access is blocked.

**Solution:** Use Python crawler with Selenium browser automation.

### Selenium Not Working

1. Install Chrome/Chromium browser
2. Install chromedriver: `brew install chromedriver` (macOS)
3. Update Chrome options in script

### Price Not Updating

Check:
1. Database connection: `psql -d portfoy_ai -c "SELECT * FROM fund_prices;"`
2. Backend server: `curl http://localhost:3000/api/tefas/funds`
3. Manual update: `node scripts/update-tefas.js`

## Example Workflow

1. **Fetch real TEFAS data:** `python3 scripts/tefas-crawler.py`
2. **Check stored data:** `curl http://localhost:3000/api/tefas/funds | jq .`
3. **Get fund price:** `curl http://localhost:3000/api/price/tefas/AVR | jq .`
4. **Update manually:** `node scripts/update-tefas.js`

## API Rate Limits

- **TEFAS:** No official rate limit, but anti-scraping protection
- **Backend:** No rate limit
- **Yahoo Finance:** 15-minute cache for USDTRY rate

## Future Features

1. CSV file upload endpoint
2. Automatic daily sync with cron job
3. WebSocket real-time updates
4. Historical price data storage
5. Price change notifications