# TEFAS Historical Price Tracking

Automated TEFAS fund price scraper with **historical data retention**.

## Overview

- **Historical Tracking:** All price data preserved (no deletion)
- **Composite Primary Key:** `symbol + date` (allows multiple dates per fund)
- **Daily Updates:** New records inserted every day at 09:00 and 18:00 Istanbul time
- **Latest Price API:** Returns most recent price from historical data

## Database Schema

```sql
fund_prices:
- symbol (TEXT) ← Part of primary key
- date (TEXT) ← Part of primary key
- price (NUMERIC) ← TRY price
- price_usd (NUMERIC) ← USD price
- name (TEXT)
- fund_type (TEXT)
- updated_at (TIMESTAMP)
- source (TEXT)

Primary Key: (symbol, date)  ← Allows historical tracking
Index: symbol  ← Fast lookup for latest price
```

## Historical Data Example

**AAK Fund Price History:**

| Date | Price (TRY) | Price (USD) | Change |
|------|------------|------------|--------|
| 2026-04-15 | 35.33 | 0.789 USD | Current |
| 2025-01-15 | 24.43 | 0.546 USD | +44% |

**Total Historical Data:**
- 2 dates tracked
- 4353 records total
- 2412 funds on 2026-04-15
- 1941 funds on 2025-01-15

## Usage

### Daily Scraper (Insert Mode)

```bash
# Today's prices (recommended at noon)
python3 scripts/tefas_daily_scraper_with_usd.py

# Specific date
python3 scripts/tefas_daily_scraper_with_usd.py 2026-04-15
```

**Output:**
```
[DB] 📊 Historical dates: 2 days
[DB] 📊 Total records: 4353
```

### Cron Job Setup

```bash
crontab -e

# Every day at 12:00 (noon) Istanbul time
0 12 * * * /usr/bin/python3 /Users/hayli/portfoy_ai_studio/scripts/tefas_daily_scraper_with_usd.py

# Optional: Evening update at 18:00
0 18 * * * /usr/bin/python3 /Users/hayli/portfoy_ai_studio/scripts/tefas_daily_scraper_with_usd.py
```

## API Endpoints

### 1. Get Latest Fund Price

```bash
GET /api/price/tefas/:symbol

# Example
curl http://localhost:3000/api/price/tefas/AAK

# Response (latest price)
{"price": 0.7896761354367099}  # USD from 2026-04-15
```

**Logic:**
- Query: `WHERE symbol='AAK' ORDER BY date DESC LIMIT 1`
- Returns most recent price (not oldest)
- No runtime conversion (USD stored in DB)

### 2. Get All Historical Data

```bash
GET /api/tefas/funds

# Response
[
  {
    "symbol": "AAK",
    "date": "2026-04-15",
    "price": "35.335717",
    "priceUsd": "0.789676"
  },
  {
    "symbol": "AAK",
    "date": "2025-01-15",
    "price": "24.437774",
    "priceUsd": "0.546128"
  }
]
```

### 3. Get Historical Price for Specific Date

```sql
-- Manual query
SELECT symbol, date, price, price_usd 
FROM fund_prices 
WHERE symbol='AAK' AND date='2025-01-15';
```

## Data Retention Policy

**Default Behavior:**
- **No deletion** - All historical data preserved
- **Daily inserts** - New records created each day
- **Upsert logic** - Same date update allowed (ON CONFLICT DO UPDATE)

**Manual Cleanup (Optional):**

```sql
-- Delete old data (older than 1 year)
DELETE FROM fund_prices 
WHERE date < (CURRENT_DATE - INTERVAL '1 year')::text;

-- Keep only last 90 days
DELETE FROM fund_prices 
WHERE date < (CURRENT_DATE - INTERVAL '90 days')::text;
```

## Historical Analysis

### Price Change Query

```sql
-- Calculate daily price change
SELECT 
  symbol,
  date,
  price_usd,
  LAG(price_usd) OVER (PARTITION BY symbol ORDER BY date) as prev_price,
  ROUND((price_usd - LAG(price_usd) OVER (PARTITION BY symbol ORDER BY date)) / LAG(price_usd) OVER (PARTITION BY symbol ORDER BY date) * 100, 2) as change_pct
FROM fund_prices
WHERE symbol = 'AAK'
ORDER BY date DESC;
```

### Top Growing Funds

```sql
-- Find funds with highest growth
SELECT 
  symbol,
  name,
  MIN(date) as first_date,
  MAX(date) as last_date,
  MIN(price_usd) as start_price,
  MAX(price_usd) as end_price,
  ROUND((MAX(price_usd) - MIN(price_usd)) / MIN(price_usd) * 100, 2) as growth_pct
FROM fund_prices
GROUP BY symbol, name
ORDER BY growth_pct DESC
LIMIT 20;
```

## Performance

**Database Size:**
- 4353 records = ~0.5 MB
- Estimated growth: ~2500 records/day
- 1 year projection: ~900,000 records (~100 MB)

**Query Performance:**
- Latest price: `< 10ms` (index on symbol)
- Historical range: `< 50ms`
- Bulk insert: ~5 seconds for 2410 funds

## Backup Strategy

```bash
# Daily backup
pg_dump -t fund_prices portfoy_ai > ~/backups/fund_prices_$(date +%Y%m%d).sql

# Restore
psql portfoy_ai < ~/backups/fund_prices_20260415.sql
```

## Monitoring

```bash
# Check historical dates
psql -d portfoy_ai -c "SELECT date, COUNT(*) FROM fund_prices GROUP BY date ORDER BY date DESC;"

# Check database size
psql -d portfoy_ai -c "SELECT pg_size_pretty(pg_total_relation_size('fund_prices'));"

# Check latest update
psql -d portfoy_ai -c "SELECT MAX(updated_at) FROM fund_prices;"
```

## Troubleshooting

### Duplicate Date Error

```
ERROR: duplicate key value violates unique constraint "fund_prices_pkey"
```

**Solution:** Same date update uses ON CONFLICT DO UPDATE (handled automatically)

### Missing Historical Data

```bash
# Backfill historical data
python3 scripts/tefas_daily_scraper_with_usd.py 2025-01-01
python3 scripts/tefas_daily_scraper_with_usd.py 2025-02-01
# ... repeat for each missing date
```

### Wrong Latest Price

**Check:**
```sql
SELECT symbol, date, price_usd FROM fund_prices 
WHERE symbol='AAK' ORDER BY date DESC LIMIT 1;
```

**Expected:** Most recent date first

## Future Features

1. **Price Charts** - Historical price visualization
2. **Price Alerts** - Notification on significant changes
3. **Automated Reports** - Daily/weekly fund performance reports
4. **API for Historical Range** - `/api/history/tefas/:symbol?start=2025-01-01&end=2026-04-15`

## File Locations

```
scripts/
├── tefas_daily_scraper_with_usd.py  # Main scraper (historical mode)
├── tefas_daily_scraper.py           # Original (upsert mode)
docs/
├── TEFAS_SCRAPER.md                 # Basic documentation
└── TEFAS_HISTORICAL.md              # This file
```