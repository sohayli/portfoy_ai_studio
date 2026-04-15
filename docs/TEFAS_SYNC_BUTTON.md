# TEFAS Sync Button Integration

Manual TEFAS data sync via backend button.

## Backend Endpoint

**GET** `/api/tefas/scrape`

Triggers Python scraper execution and returns results.

### Request

```bash
curl http://localhost:3000/api/tefas/scrape
```

### Response (Success)

```json
{
  "success": true,
  "saved": 2410,
  "dates": 2,
  "records": 4353,
  "duration": 252.99,
  "message": "Successfully scraped 2410 funds in 252.99s",
  "output": "...",
  "stderr": null
}
```

### Response (Error)

```json
{
  "success": false,
  "error": "Scrape failed",
  "details": "Python script error",
  "stderr": "...",
  "stdout": "..."
}
```

## Implementation Details

### Backend Execution

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

app.get("/api/tefas/scrape", async (req, res) => {
  const scriptPath = path.join(process.cwd(), 'scripts', 'tefas_daily_scraper_with_usd.py');
  
  const { stdout, stderr } = await execAsync(`python3 ${scriptPath}`, {
    timeout: 300000,  // 5 minutes
    maxBuffer: 1024 * 1024 * 10
  });
  
  // Parse output and return stats
  res.json({ success: true, saved: 2410, ... });
});
```

### Timeout Configuration

- **Python scraper duration:** 250-300 seconds (~4-5 minutes)
- **Backend timeout:** 300000ms (5 minutes)
- **Buffer size:** 10MB (for large output)

## Frontend Integration

### React Component Example

```tsx
import { useState } from 'react';

function TefasSyncButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleSync = async () => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/tefas/scrape');
      const data = await response.json();
      
      setResult(data);
      
      if (data.success) {
        alert(`✅ Synced ${data.saved} funds in ${data.duration}s`);
      } else {
        alert(`❌ Failed: ${data.error}`);
      }
    } catch (error) {
      alert('❌ Sync failed');
    }
    
    setLoading(false);
  };

  return (
    <div>
      <button 
        onClick={handleSync}
        disabled={loading}
        className="btn-primary"
      >
        {loading ? 'Syncing...' : 'Sync TEFAS Data'}
      </button>
      
      {result && (
        <div className="result">
          <p>Saved: {result.saved} funds</p>
          <p>Historical dates: {result.dates}</p>
          <p>Total records: {result.records}</p>
        </div>
      )}
    </div>
  );
}
```

### Loading State

- **Button text:** "Syncing..." while loading
- **Disabled:** Button disabled during execution
- **Duration:** ~5 minutes (show progress bar or spinner)

## Usage Flow

### Manual Sync Workflow

1. **User clicks "Sync TEFAS" button**
2. **Frontend sends request:** `GET /api/tefas/scrape`
3. **Backend executes:** `python3 scripts/tefas_daily_scraper_with_usd.py`
4. **Python scraper runs:**
   - Fetch USDTRY rate
   - Fetch YAT funds (1989)
   - Fetch EMK funds (392)
   - Fetch BYF funds (29)
   - Save to database (2410 funds)
5. **Backend parses output**
6. **Response sent to frontend**
7. **UI updated with results**

### Expected Timeline

```
[0s]    Button clicked
[1s]    Backend starts Python script
[10s]   Fetching YAT funds...
[130s]  Fetching EMK funds...
[250s]  Fetching BYF funds...
[253s]  Saving to database...
[255s]  Response sent to frontend
```

## Error Handling

### Common Errors

1. **Python script not found**
   ```
   Error: Script not found at scripts/tefas_daily_scraper_with_usd.py
   ```

2. **Database connection failed**
   ```
   [DB] ❌ Connection failed
   ```

3. **TEFAS rate limiting**
   ```
   [TEFAS] Max attempt limit reached
   ```

4. **Timeout exceeded**
   ```
   Error: Script execution timed out after 300s
   ```

### Retry Logic

If scrape fails, button should:
- Show error message
- Allow retry after 5 minutes
- Log error details for debugging

## Monitoring

### Check Sync Status

```bash
# Backend logs
tail -f /tmp/portfoy-server.log | grep "TEFAS"

# Database status
psql -d portfoy_ai -c "SELECT date, COUNT(*) FROM fund_prices GROUP BY date;"

# Python process
ps aux | grep "tefas_daily_scraper"
```

### Health Check

```bash
curl http://localhost:3000/api/tefas/funds | jq '. | length'
# Expected: 4353+ (historical data)
```

## Performance Optimization

### Async Execution

- Backend uses `promisify(exec)` for async/await
- Non-blocking for other API requests
- 5-minute timeout prevents hanging

### Background Processing

For production, consider:
1. **Queue system** (Bull, BullMQ)
2. **Worker threads** for parallel execution
3. **WebSocket updates** for progress tracking

## Scheduled Sync

### Automatic Daily Sync

```typescript
// Cron job (already active)
cron.schedule('0 12 * * *', async () => {
  await execAsync('python3 scripts/tefas_daily_scraper_with_usd.py');
}, { timezone: 'Europe/Istanbul' });
```

### Manual Override

Button useful for:
- **Immediate updates** (before scheduled time)
- **Recovery** after failed cron job
- **Testing** new scraper version
- **Backfill** historical data

## Security Considerations

### Rate Limiting

- TEFAS WAF protection (2-minute delays between fund types)
- Backend timeout (5 minutes max)
- No concurrent scrapes (one at a time)

### Input Validation

```typescript
// Only allow sync if:
// 1. No other sync running
// 2. Authenticated user (optional)
// 3. Last sync > 1 hour ago (optional)
```

## Future Features

1. **Progress indicator** - Real-time sync progress via WebSocket
2. **Partial sync** - Sync only specific fund types (YAT only)
3. **Scheduled sync** - User-defined schedule (not just 12:00)
4. **Sync history** - Log of all sync attempts with timestamps
5. **Notification** - Email/SMS when sync completes

## Testing

### Manual Test

```bash
curl http://localhost:3000/api/tefas/scrape
```

**Expected:** JSON response after ~5 minutes

### Automated Test

```typescript
describe('TEFAS Sync Endpoint', () => {
  it('should trigger Python scraper', async () => {
    const response = await fetch('/api/tefas/scrape');
    const data = await response.json();
    
    expect(data.success).toBe(true);
    expect(data.saved).toBeGreaterThan(1900);
    expect(data.duration).toBeLessThan(300);
  });
});
```

## Documentation

- Backend endpoint: `server.ts:212`
- Python scraper: `scripts/tefas_daily_scraper_with_usd.py`
- Historical data: `docs/TEFAS_HISTORICAL.md`
- API docs: `docs/TEFAS_API.md`