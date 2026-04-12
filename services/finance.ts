

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

// Initialize Firebase Admin
let db: admin.firestore.Firestore | null = null;
try {
  const configPath = join(process.cwd(), 'firebase-applet-config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: config.projectId,
    });
  }
  db = admin.firestore();
  if (config.firestoreDatabaseId) {
    db = admin.firestore(config.firestoreDatabaseId);
  }
} catch (e) {
  console.error('[FIREBASE] Failed to initialize admin:', e);
}

export async function getUsdTryRate() {
  try {
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/USDTRY=X`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    if (!response.ok) {
      console.warn(`[USDTRY] Failed to fetch rate, status: ${response.status}. Using fallback 32.5`);
      return 32.5;
    }
    const data: any = await response.json();
    const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof rate !== 'number' || rate <= 0) {
      console.warn(`[USDTRY] Invalid rate received: ${rate}. Using fallback 32.5`);
      return 32.5;
    }
    return rate;
  } catch (e) {
    console.error(`[USDTRY] Error fetching rate:`, e instanceof Error ? e.message : e);
    return 32.5; // Fallback
  }
}

export async function getStockPrice(symbol: string) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Referer': 'https://finance.yahoo.com/',
    'Cache-Control': 'no-cache',
    'Origin': 'https://finance.yahoo.com'
  };

  const fetchSingle = async (s: string) => {
    const endpoints = [
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(s)}`,
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(s)}`,
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1mo&range=10y&events=div`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1mo&range=10y&events=div`
    ];

    for (const url of endpoints) {
      try {
        const response = await fetch(url, { 
          headers: {
            ...headers,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        
        if (!response.ok) {
          console.warn(`[STOCK] ${s} fetch failed from ${url}: ${response.status}`);
          continue;
        }

        const data: any = await response.json();
        
        // Handle quote API response
        if (url.includes('/quote')) {
          const quote = data?.quoteResponse?.result?.[0];
          if (quote) {
            return { quote, price: quote.regularMarketPrice || quote.price };
          }
        } 
        // Handle chart API response
        else {
          const result = data?.chart?.result?.[0];
          if (result) {
            const meta = result.meta;
            return { meta, result, price: meta.regularMarketPrice || meta.price || meta.previousClose };
          }
        }
      } catch (e) {
        console.warn(`[STOCK] Error fetching ${s} from ${url}:`, e instanceof Error ? e.message : e);
      }
    }
    return null;
  };

  const maxRetries = 2;
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 1000));

      let data = await fetchSingle(symbol);
      
      // If not found and looks like a Turkish stock without .IS, try adding it
      if (!data && !symbol.includes('.') && symbol.length >= 3 && symbol.length <= 5) {
        console.log(`[STOCK] ${symbol} not found, trying ${symbol}.IS`);
        data = await fetchSingle(`${symbol}.IS`);
        if (data) symbol = `${symbol}.IS`; // Update symbol for conversion logic
      }

      if (!data) {
        throw new Error(`No data found for ${symbol}`);
      }

      const { quote, result, price, meta } = data;
      const dividends = result?.events?.dividends;
      
      let dividendYield = quote?.trailingAnnualDividendYield || 0;
      let dividendGrowth5Y = 0;
      let dividendGrowth10Y = 0;

      if (dividends) {
        const divList = Object.values(dividends)
          .map((d: any) => ({ date: new Date(d.date * 1000), amount: d.amount }))
          .sort((a, b) => b.date.getTime() - a.date.getTime());

        const now = new Date();
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(now.getFullYear() - 1);
        
        const lastYearDividends = divList
          .filter(d => d.date >= oneYearAgo)
          .reduce((acc, d) => acc + d.amount, 0);
        
        if (dividendYield === 0) {
          dividendYield = price > 0 ? lastYearDividends / price : 0;
        }

        const calculateAnnualDiv = (yearsAgo: number) => {
          const targetYear = now.getFullYear() - yearsAgo;
          const yearDivs = divList.filter(d => d.date.getFullYear() === targetYear);
          return yearDivs.reduce((acc, d) => acc + d.amount, 0);
        };

        const currentAnnual = lastYearDividends || calculateAnnualDiv(0);
        const fiveYearsAgoAnnual = calculateAnnualDiv(5) || calculateAnnualDiv(6);
        const tenYearsAgoAnnual = calculateAnnualDiv(10) || calculateAnnualDiv(11);

        if (currentAnnual > 0 && fiveYearsAgoAnnual > 0) {
          dividendGrowth5Y = (Math.pow(currentAnnual / fiveYearsAgoAnnual, 1/5) - 1);
        }
        if (currentAnnual > 0 && tenYearsAgoAnnual > 0) {
          dividendGrowth10Y = (Math.pow(currentAnnual / tenYearsAgoAnnual, 1/10) - 1);
        }
      }
      
      let finalPrice = price || 0;
      if (symbol.toUpperCase().endsWith('.IS')) {
        const rate = await getUsdTryRate();
        finalPrice = finalPrice / rate;
      }

      if (isNaN(finalPrice) || finalPrice === null) {
        throw new Error(`Invalid price calculated for ${symbol}`);
      }

      return {
        price: finalPrice,
        dividendYield: isFinite(dividendYield) ? dividendYield : 0,
        dividendGrowth5Y: isFinite(dividendGrowth5Y) ? dividendGrowth5Y : 0,
        dividendGrowth10Y: isFinite(dividendGrowth10Y) ? dividendGrowth10Y : 0,
        name: quote?.longName || quote?.shortName || meta?.longName || meta?.shortName || symbol
      };
    } catch (e) {
      lastError = e;
      console.warn(`[STOCK] Attempt ${attempt + 1} failed for ${symbol}:`, e instanceof Error ? e.message : e);
    }
  }

  throw lastError || new Error(`Failed to fetch stock price for ${symbol}`);
}

export async function getCryptoPrice(symbol: string) {
  const maxRetries = 2;
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}USDT`);
      if (!response.ok) throw new Error(`Binance HTTP ${response.status}`);
      const data: any = await response.json();
      return { price: parseFloat(data.price) };
    } catch (e) {
      lastError = e;
      console.warn(`[CRYPTO] Attempt ${attempt + 1} failed for ${symbol}:`, e);
      if (attempt < maxRetries - 1) await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw lastError || new Error(`Failed to fetch crypto price for ${symbol}`);
}

/**
 * TEFAS Price Fetching Logic
 * Consolidated here for simplicity as requested.
 */

interface TefasSession {
  cookie: string;
  expiry: number;
  userAgent: string;
}

class TefasClient {
  private static sessions: Record<string, TefasSession> = {};
  private static USER_AGENTS = [
    {
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      ch: '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      platform: '"Windows"'
    },
    {
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      ch: '"Chromium";v="123", "Google Chrome";v="123", "Not-A.Brand";v="99"',
      platform: '"macOS"'
    },
    {
      ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      ch: '"Chromium";v="122", "Google Chrome";v="122", "Not-A.Brand";v="99"',
      platform: '"Linux"'
    }
  ];

  private static getUAConfig() {
    return this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
  }

  private static async sleep(ms: number) {
    const jitter = Math.floor(Math.random() * 2000); // Increased jitter
    return new Promise(resolve => setTimeout(resolve, ms + jitter));
  }

  private static async getSession(domain: string, symbol: string, force: boolean = false): Promise<{ cookie: string; config: any }> {
    const now = Date.now();
    const sessionKey = `${domain}_${symbol.toUpperCase()}`;
    
    if (!force && this.sessions[sessionKey] && this.sessions[sessionKey].expiry > now) {
      const config = this.USER_AGENTS.find(a => a.ua === this.sessions[sessionKey].userAgent) || this.USER_AGENTS[0];
      return { cookie: this.sessions[sessionKey].cookie, config };
    }

    const config = this.getUAConfig();
    try {
      const targetPage = `${domain}/FonAnaliz.aspx`;
      const response = await fetch(targetPage, {
        headers: {
          'User-Agent': config.ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Ch-Ua': config.ch,
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': config.platform,
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1'
        }
      });

      let cookieHeader = '';
      const rawCookie = response.headers.get('set-cookie');
      if (rawCookie) {
        cookieHeader = rawCookie.split(',').map(c => c.split(';')[0].trim()).join('; ');
      }

      if (cookieHeader) {
        this.sessions[sessionKey] = {
          cookie: cookieHeader,
          expiry: now + 5 * 60 * 1000, // Even shorter expiry
          userAgent: config.ua
        };
      }
      return { cookie: cookieHeader, config };
    } catch (e) {
      return { cookie: '', config };
    }
  }

  private static async request(domain: string, endpoint: string, body: string, symbol: string, attempt: number = 0): Promise<any> {
    // Add initial delay even for first attempt to avoid burst
    if (attempt === 0) {
      await this.sleep(1000 + Math.random() * 2000);
    }

    const { cookie, config } = await this.getSession(domain, symbol, attempt > 0);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(`${domain}${endpoint}`, {
        method: 'POST',
        headers: {
          'User-Agent': config.ua,
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': domain,
          'Referer': `${domain}/FonAnaliz.aspx`,
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
          'Sec-Ch-Ua': config.ch,
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': config.platform,
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          ...(cookie ? { 'Cookie': cookie } : {})
        },
        body: body,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 403 || response.status === 405) {
          const sessionKey = `${domain}_${symbol.toUpperCase()}`;
          delete this.sessions[sessionKey];
          throw new Error(`WAF Block (HTTP ${response.status})`);
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      if (text.includes('Request Rejected') || text.includes('WAF')) {
        const sessionKey = `${domain}_${symbol.toUpperCase()}`;
        delete this.sessions[sessionKey];
        throw new Error('Request Rejected by WAF');
      }

      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error(`Invalid JSON response from ${domain}`);
      }
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  }

  public static async syncAllPrices(): Promise<{ success: boolean; count: number }> {
    if (!db) return { success: false, count: 0 };

    const fundTypes = ['YAT', 'EMK', 'BYF'];
    let totalSynced = 0;

    for (const type of fundTypes) {
      try {
        await this.sleep(3000); // Delay between types to avoid WAF
        console.log(`[TEFAS SYNC] Syncing type: ${type}`);
        const payload = new URLSearchParams({
          'fontip': type,
          'siralama': 'GETIRI_1Y',
          'yon': 'DESC'
        });

        const result = await this.request('https://www.tefas.gov.tr', '/api/DB/BindComparisonFundReturns', payload.toString(), 'SYNC', 0);
        
        if (result.data && Array.isArray(result.data)) {
          const batch = db.batch();
          let batchCount = 0;

          for (const fund of result.data) {
            const symbol = (fund.FONKODU || fund.FONKOD || '').toString().toUpperCase();
            const price = parseFloat(fund.FIYAT?.toString().replace(',', '.') || '0');
            const name = fund.FONUNVAN || fund.FONADI || '';

            if (symbol && price > 0) {
              const docRef = db.collection('fund_prices').doc(symbol);
              batch.set(docRef, {
                symbol,
                price,
                name,
                type,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                date: fund.TARIH || new Date().toLocaleDateString('tr-TR')
              }, { merge: true });
              
              batchCount++;
              totalSynced++;

              if (batchCount >= 400) {
                await batch.commit();
                batchCount = 0;
              }
            }
          }

          if (batchCount > 0) {
            await batch.commit();
          }
          console.log(`[TEFAS SYNC] Synced ${totalSynced} funds for type ${type}`);
        }
      } catch (e) {
        console.error(`[TEFAS SYNC] Error syncing type ${type}:`, e);
      }
    }

    return { success: true, count: totalSynced };
  }

  public static async fetchWithRetry(symbol: string, fundType: string): Promise<number | null> {
    const fonkod = symbol.toUpperCase();

    // First, try database
    if (db) {
      try {
        const doc = await db.collection('fund_prices').doc(fonkod).get();
        if (doc.exists) {
          const data = doc.data();
          const updatedAt = data?.updatedAt?.toDate();
          if (updatedAt && (Date.now() - updatedAt.getTime()) < 24 * 60 * 60 * 1000) {
            console.log(`[TEFAS] Found ${fonkod} in DB: ${data?.price}`);
            return data?.price;
          }
        }
      } catch (e: any) {
        if (e.code === 5 || e.message?.includes('NOT_FOUND')) {
          console.warn(`[TEFAS] Firestore database or collection not found. This is expected if syncing hasn't completed or database is provisioning.`);
        } else {
          console.warn(`[TEFAS] DB fetch error for ${fonkod}:`, e.message || e);
        }
      }
    }

    const domains = ['https://www.tefas.gov.tr', 'https://fundturkey.com.tr'];
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const formatDate = (date: Date) => {
      const d = date.getDate().toString().padStart(2, '0');
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      const y = date.getFullYear();
      return `${d}.${m}.${y}`;
    };

    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    for (const domain of domains) {
      // Exponential backoff retry logic with longer delays
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) {
            const delay = Math.pow(3, attempt) * 2000; // 6s, 18s
            await this.sleep(delay);
          }

          const payload = new URLSearchParams({
            'fontip': fundType,
            'sfonkod': fonkod,
            'bastarih': startDateStr,
            'bittarih': endDateStr,
            'fonturkod': ''
          });

          const result = await this.request(domain, '/api/DB/BindHistoryInfo', payload.toString(), fonkod, attempt);
          
          if (result.data && Array.isArray(result.data) && result.data.length > 0) {
            // Filter by symbol first to ensure we are looking at the right fund
            const fundData = result.data.filter(item => {
              const itemSymbol = (item.FONKODU || item.FONKOD || '').toString().toUpperCase();
              return itemSymbol === fonkod;
            });

            if (fundData.length === 0) {
              console.warn(`[TEFAS] Symbol mismatch: requested ${fonkod}, but not found in response. Clearing session.`);
              const sessionKey = `${domain}_${fonkod}`;
              delete this.sessions[sessionKey];
              continue; 
            }

            const sorted = [...fundData].sort((a, b) => {
              const dateA = new Date(a.TARIH.split('.').reverse().join('-')).getTime();
              const dateB = new Date(b.TARIH.split('.').reverse().join('-')).getTime();
              return dateB - dateA;
            });
            
            if (sorted[0].FIYAT) {
              // Handle Turkish comma decimal separator
              const rawPrice = sorted[0].FIYAT.toString().replace(',', '.');
              return parseFloat(rawPrice);
            }
          }
        } catch (e) {
          console.warn(`[TEFAS] Attempt ${attempt + 1} failed for ${fonkod} on ${domain}:`, e instanceof Error ? e.message : e);
        }
      }
    }
    return null;
  }
}

export async function syncAllTefasPrices() {
  return await TefasClient.syncAllPrices();
}

export async function getTefasPrice(symbol: string, type: string = 'YAT') {
  try {
    let price = await TefasClient.fetchWithRetry(symbol, type);

    if (price === null) {
      const fallbacks = ['YAT', 'EMK', 'BYF'].filter(t => t !== type);
      for (const fType of fallbacks) {
        price = await TefasClient.fetchWithRetry(symbol, fType);
        if (price !== null) break;
      }
    }

    if (price !== null) {
      const rate = await getUsdTryRate();
      return price / rate;
    }
  } catch (error) {
    console.error(`[TEFAS] Error for ${symbol}:`, error);
  }
  return null;
}
