# TEFAS Daily Scraper

Automated TEFAS fund price scraper that fetches data daily and saves to PostgreSQL.

## Overview

- **Source:** TEFAS (Turkey Electronic Fund Trading Platform) - fundturkey.com.tr
- **Library:** tefas-crawler (https://github.com/burakyilmaz321/tefas-crawler)
- **Database:** PostgreSQL `fund_prices` table
- **Fund Types:** YAT (Securities), EMK (Pension), BYF (Exchange Traded)
- **Total Funds:** ~1941 funds (1554 YAT + 367 EMK + 22 BYF)

## Installation

### Python Dependencies

```bash
pip3 install tefas-crawler psycopg2-binary pandas
```

### PostgreSQL Setup

Database table already exists in schema:
```sql
CREATE TABLE fund_prices (
    symbol TEXT PRIMARY KEY,
    price NUMERIC,
    name TEXT,
    fund_type TEXT,
    date TEXT,
    source TEXT DEFAULT 'tefas-crawler',
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## Usage

### Manual Execution

```bash
# Scrape yesterday's data (recommended)
python3 scripts/tefas_daily_scraper.py

# Scrape specific date
python3 scripts/tefas_daily_scraper.py 2025-01-15
```

### Output Example

```
============================================================
TEFAS Fund Price Scraper
============================================================
[DB] ✅ Connected to PostgreSQL
[TEFAS] 📅 Fetching fund data for: 2025-01-15
[TEFAS] 🔄 Initializing crawler...
[TEFAS] ✅ 1554 YAT funds fetched
[TEFAS] ✅ 366 EMK funds fetched
[TEFAS] ✅ 21 BYF funds fetched
[TEFAS] Processing 1554 YAT funds...
[TEFAS] Processing 366 EMK funds...
[TEFAS] Processing 21 BYF funds...
[TEFAS] ✅ Total 1941 funds fetched
[DB] 💾 Saving 1941 funds...
[DB] ✅ Saved 1941 funds
[DB] 📊 Total funds in DB: 1941
============================================================
[SCRAPER] ⏱️ Completed in 252.79 seconds
[SCRAPER] 💾 Saved 1941 funds
============================================================
```

## Cron Job Setup

### Daily Schedule (Recommended)

Run scraper every day at 09:00 and 18:00 Istanbul time:

```bash
# Edit crontab
crontab -e

# Add these lines
0 9 * * * /usr/bin/python3 /Users/hayli/portfoy_ai_studio/scripts/tefas_daily_scraper.py >> /tmp/tefas-scraper.log 2>&1
0 18 * * * /usr/bin/python3 /Users/hayli/portfoy_ai_studio/scripts/tefas_daily_scraper.py >> /tmp/tefas-scraper.log 2>&1
```

### Morning Only

```bash
0 9 * * * /usr/bin/python3 /Users/hayli/portfoy_ai_studio/scripts/tefas_daily_scraper.py
```

### View Cron Logs

```bash
tail -50 /tmp/tefas-scraper.log
```

## Rate Limiting

TEFAS website has WAF (Web Application Firewall) protection. Scraper uses:

- **2-minute delays** between fund type requests (YAT → EMK → BYF)
- **Retry logic** with 120-second waits
- **Max 2 retries** per fund type
- **Total time:** ~4-5 minutes for full scrape

## Performance

- **Duration:** 250-300 seconds (~4-5 minutes)
- **Funds:** 1941 total
- **Throughput:** ~4 funds/second
- **Retry Rate:** ~5% (WAF triggers occasionally)

## Data Quality

### Fund Types

- **YAT (Yatırım Fonu):** Securities Mutual Funds (1554)
- **EMK (Emeklilik Fonu):** Pension Funds (367)
- **BYF (Borsa Yatırım Fonu):** Exchange Traded Funds (22)

### Price Accuracy

- Prices in TRY (Turkish Lira)
- Automatically converted to USD via `/api/price/tefas/:symbol`
- USDTRY rate from Yahoo Finance

## API Endpoints

### Get All Funds

```bash
curl http://localhost:3000/api/tefas/funds | jq .
```

### Get Single Fund Price (USD)

```bash
curl http://localhost:3000/api/price/tefas/AAK | jq .
```

### Manual Scrape Trigger (via Node backend)

```bash
curl http://localhost:3000/api/tefas/scrape
```

## Troubleshooting

### Rate Limiting Errors

```
[TEFAS] ❌ Attempt 1 failed: Max attempt limit reached
```

**Solution:** Wait 2-3 minutes and retry. TEFAS has aggressive rate limiting.

### Database Connection Error

```
[DB] ❌ Connection failed
```

**Solution:** Check PostgreSQL is running:
```bash
brew services start postgresql@16
psql -d portfoy_ai -c "SELECT 1"
```

### No Data Fetched

```
[TEFAS] ⚠️ No funds to save
```

**Solutions:**
1. Try different date: `python3 scripts/tefas_daily_scraper.py 2025-01-15`
2. Wait 5 minutes and retry
3. Check TEFAS website accessibility

## Future Improvements

1. **Proxy rotation** to bypass WAF
2. **Historical data fetch** for backfill
3. **Error notifications** (email/SMS)
4. **Data validation** before insert
5. **Incremental updates** (only changed funds)

## File Locations

```
/Users/hayli/portfoy_ai_studio/
├── scripts/
│   ├── tefas_daily_scraper.py     # Main scraper
│   ├── tefas_scraper.py           # Original version
│   └── tefas_scraper_slow.py      # Slow mode version
├── services/
│   └── tefas-scraper.ts           # TypeScript scraper (not used)
├── docs/
│   ├── TEFAS_API.md               # API documentation
│   └── TEFAS_SCRAPER.md           # This file
└── server.ts                      # Backend API endpoints
```

## Maintenance

### Update Scraper

```bash
pip3 install --upgrade tefas-crawler
```

### Clean Old Data

```sql
DELETE FROM fund_prices WHERE updated_at < NOW() - INTERVAL '30 days';
```

### Backup Database

```bash
pg_dump portfoy_ai > /tmp/portfoy_ai_backup.sql
```

## Support

- **TEFAS Crawler GitHub:** https://github.com/burakyilmaz321/tefas-crawler
- **TEFAS Website:** https://fundturkey.com.tr
- **Issues:** Check `/tmp/tefas-scraper.log`