

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

// Initialize Firebase Admin
let db: any = null;
try {
  const configPath = join(process.cwd(), 'firebase-applet-config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: config.projectId
    });
  }
  
  // Use getFirestore(databaseId) for named databases, or getFirestore() for default
  db = config.firestoreDatabaseId ? getFirestore(config.firestoreDatabaseId) : getFirestore();
  console.log(`[FIREBASE] Admin initialized. Database ID: ${config.firestoreDatabaseId || '(default)'}`);
} catch (e) {
  console.error('[FIREBASE] Failed to initialize admin:', e);
}

let cachedUsdTryRate: number | null = null;
let lastUsdTryFetchTime = 0;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

export async function getUsdTryRate() {
  const now = Date.now();
  if (cachedUsdTryRate && (now - lastUsdTryFetchTime < CACHE_DURATION)) {
    return cachedUsdTryRate;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/USDTRY=X`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) {
      console.warn(`[USDTRY] Failed to fetch rate, status: ${response.status}. Using fallback 32.5`);
      return cachedUsdTryRate || 32.5;
    }
    const data: any = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const rate = meta?.regularMarketPrice || meta?.previousClose || meta?.price;
    
    if (typeof rate !== 'number' || rate <= 0) {
      console.warn(`[USDTRY] Invalid rate received: ${rate}. Meta: ${JSON.stringify(meta)}. Using fallback 32.5`);
      return cachedUsdTryRate || 32.5;
    }
    
    cachedUsdTryRate = rate;
    lastUsdTryFetchTime = now;
    console.log(`[USDTRY] Current rate updated: ${rate}`);
    return rate;
  } catch (e) {
    console.error(`[USDTRY] Error fetching rate:`, e instanceof Error ? e.message : e);
    return cachedUsdTryRate || 32.5; // Fallback to last known or default
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
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1mo&range=10y&events=div`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1mo&range=10y&events=div`,
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(s)}`,
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(s)}`
    ];

    for (const url of endpoints) {
      try {
        console.log(`[STOCK] Fetching ${s} from ${url}`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(url, { 
          headers: {
            ...headers,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          },
          signal: controller.signal
        });
        clearTimeout(timeout);
        
        if (!response.ok) {
          console.warn(`[STOCK] ${s} fetch failed from ${url}: ${response.status}`);
          continue;
        }

        const data: any = await response.json();
        console.log(`[STOCK] ${s} data received from ${url}`);
        
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}USDT`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
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

class TefasClient {
  private static API_KEY = 'tefas_7x9K2mP4qR8vN3wL6yT1cB5aD0fE';

  private static async fetchFromProxy(symbols: string[]): Promise<any[]> {
    const PROXY_URL = 'http://62.171.147.85:3000/api/tefas/batch';
    try {
      // Global rate limiting: ensure at least 3 seconds between any proxy calls
      const now = Date.now();
      const timeSinceLastCall = now - (this.lastCallTime || 0);
      if (timeSinceLastCall < 3000) {
        await new Promise(resolve => setTimeout(resolve, 3000 - timeSinceLastCall));
      }
      this.lastCallTime = Date.now();

      console.log(`[TEFAS PROXY] Fetching batch: ${symbols.join(',')}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      
      const url = new URL(PROXY_URL);
      url.searchParams.append('funds', symbols.join(','));
      url.searchParams.append('apikey', this.API_KEY);

      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      if (!response.ok) {
        console.warn(`[TEFAS PROXY] Proxy returned HTTP ${response.status}`);
        throw new Error(`Proxy HTTP ${response.status}`);
      }
      const data = await response.json();
      
      let results: any[] = [];
      if (Array.isArray(data)) {
        results = data;
      } else if (data && Array.isArray(data.funds)) {
        results = data.funds;
      } else if (data && data.success === false) {
        console.warn(`[TEFAS PROXY] Proxy reported failure: ${data.error || 'Unknown error'}`);
      }

      console.log(`[TEFAS PROXY] Received ${results.length} items`);
      return results;
    } catch (e) {
      console.error(`[TEFAS PROXY] Error:`, e instanceof Error ? e.message : e);
      return [];
    }
  }

  private static lastCallTime = 0;
  private static isSyncing = false;

  public static async syncAllPrices(): Promise<{ success: boolean; count: number }> {
    if (!db) return { success: false, count: 0 };
    if (this.isSyncing) {
      console.log('[TEFAS SYNC] Sync already in progress, skipping.');
      return { success: false, count: 0 };
    }
    
    try {
      this.isSyncing = true;
      console.log('[TEFAS SYNC] Starting background sync...');
      
      // 1. Discover all symbols from fund_prices AND all user portfolios
      const symbolsSet = new Set<string>();
      
      // From fund_prices
      const priceSnapshot = await db.collection('fund_prices').get();
      priceSnapshot.docs.forEach((doc: any) => symbolsSet.add(doc.id.toUpperCase()));
      
      // From all portfolios (using collectionGroup to find all assets)
      try {
        const assetsSnapshot = await db.collectionGroup('assets').get();
        assetsSnapshot.docs.forEach((doc: any) => {
          const data = doc.data();
          if (data && ['Fund', 'GovernmentContribution'].includes(data.type)) {
            const symbol = data.symbol;
            if (symbol) symbolsSet.add(symbol.toUpperCase());
          }
        });
      } catch (e) {
        console.warn('[TEFAS SYNC] Failed to discover symbols from portfolios:', e);
      }

      const symbols = Array.from(symbolsSet);
      console.log(`[TEFAS SYNC] Discovered ${symbols.length} unique symbols to sync.`);
      
      if (symbols.length === 0) {
        return { success: true, count: 0 };
      }

      // 2. Fetch in batches
      const batchSize = 20;
      let totalUpdated = 0;

      for (let i = 0; i < symbols.length; i += batchSize) {
        const batchSymbols = symbols.slice(i, i + batchSize);
        const results = await this.fetchFromProxy(batchSymbols);
        
        const firestoreBatch = db.batch();
        let batchCount = 0;

        for (const item of results) {
          const symbol = (item.code || item.symbol || '').toString().toUpperCase();
          const price = parseFloat(item.price?.toString().replace(',', '.') || '0');
          
          if (symbol && price > 0) {
            const docRef = db.collection('fund_prices').doc(symbol);
            firestoreBatch.set(docRef, {
              symbol,
              price,
              name: item.title || item.name || '',
              type: item.type || '',
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              date: item.date || new Date().toLocaleDateString('tr-TR'),
              source: 'background_sync'
            }, { merge: true });
            batchCount++;
            totalUpdated++;
          }
        }

        if (batchCount > 0) {
          await firestoreBatch.commit();
        }
        
        if (i + batchSize < symbols.length) {
          const delay = 5000 + Math.random() * 3000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      console.log(`[TEFAS SYNC] Sync completed. Updated ${totalUpdated} funds.`);
      return { success: true, count: totalUpdated };
    } catch (e) {
      console.error('[TEFAS SYNC] Sync failed:', e);
      return { success: false, count: 0 };
    } finally {
      this.isSyncing = false;
    }
  }

  public static async getPriceFromDb(symbol: string): Promise<number | null> {
    const fonkod = symbol.toUpperCase();

    if (!db) return null;

    try {
      const doc = await db.collection('fund_prices').doc(fonkod).get();
      if (doc.exists) {
        const data = doc.data();
        return data?.price || null;
      }
      
      // If not in DB, we DO NOT fetch from proxy here.
      // We just log it and wait for the next background sync to discover and fetch it.
      console.log(`[TEFAS] ${fonkod} not found in DB. Discovery will pick it up in the next sync.`);
    } catch (e: any) {
      console.warn(`[TEFAS] DB fetch error for ${fonkod}:`, e.message || e);
    }

    return null;
  }
}

export async function syncAllTefasPrices() {
  return await TefasClient.syncAllPrices();
}

export async function getTefasPrice(symbol: string) {
  try {
    // ONLY fetch from DB. No live proxy calls for frontend requests.
    const price = await TefasClient.getPriceFromDb(symbol);

    if (price !== null) {
      const rate = await getUsdTryRate();
      return price / rate;
    }
  } catch (error) {
    console.error(`[TEFAS] Error for ${symbol}:`, error);
  }
  return null;
}

export async function getHistoricalPrices(symbol: string, type: string) {
  console.log(`[HISTORICAL] Fetching for ${type}: ${symbol}`);
  const rate = await getUsdTryRate();
  
  if (type === 'Stock') {
    const s = symbol.includes('.') ? symbol : `${symbol}.IS`;
    const endpoints = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1d&range=7d`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1d&range=7d`
    ];

    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
          }
        });
        if (!response.ok) continue;
        const data: any = await response.json();
        const result = data?.chart?.result?.[0];
        const prices = result?.indicators?.quote?.[0]?.close || [];
        
        let finalPrices = prices.filter((p: any) => p !== null);
        if (s.endsWith('.IS')) {
          finalPrices = finalPrices.map((p: number) => p / rate);
        }
        if (finalPrices.length > 0) {
          console.log(`[HISTORICAL] Stock ${symbol} success from ${url}, points: ${finalPrices.length}`);
          return finalPrices;
        }
      } catch (e) {
        console.warn(`[HISTORICAL] Stock error for ${symbol} from ${url}:`, e);
      }
    }
    return [];
  }

  if (type === 'Crypto') {
    try {
      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}USDT&interval=1d&limit=7`);
      if (!response.ok) throw new Error(`Binance HTTP ${response.status}`);
      const data: any = await response.json();
      const finalPrices = data.map((d: any) => parseFloat(d[4])); // Closing price
      console.log(`[HISTORICAL] Crypto ${symbol} success, points: ${finalPrices.length}`);
      return finalPrices;
    } catch (e) {
      console.error(`[HISTORICAL] Crypto error for ${symbol}:`, e);
      return [];
    }
  }

  if (type === 'Fund' || type === 'GovernmentContribution') {
    try {
      const currentPrice = await getTefasPrice(symbol);
      // Return two points to show a flat line instead of a pulse
      const finalPrices = currentPrice ? [currentPrice, currentPrice] : [];
      console.log(`[HISTORICAL] Fund ${symbol} success, points: ${finalPrices.length}`);
      return finalPrices;
    } catch (e) {
      console.error(`[HISTORICAL] Fund error for ${symbol}:`, e);
      return [];
    }
  }

  return [];
}
