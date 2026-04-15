import 'dotenv/config';
import { db, fundPrices } from '../src/lib/db';
import { eq } from 'drizzle-orm';

let cachedUsdTryRate: number | null = null;
let lastUsdTryFetchTime = 0;
const CACHE_DURATION = 15 * 60 * 1000;

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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) {
      console.warn(`[USDTRY] Failed: ${response.status}. Using fallback 32.5`);
      return cachedUsdTryRate || 32.5;
    }
    const data: any = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const rate = meta?.regularMarketPrice || meta?.previousClose || meta?.price;
    
    if (typeof rate !== 'number' || rate <= 0) {
      return cachedUsdTryRate || 32.5;
    }
    
    cachedUsdTryRate = rate;
    lastUsdTryFetchTime = now;
    console.log(`[USDTRY] Rate: ${rate}`);
    return rate;
  } catch (e) {
    console.error(`[USDTRY] Error:`, e instanceof Error ? e.message : e);
    return cachedUsdTryRate || 32.5;
  }
}

export async function getStockPrice(symbol: string) {
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    'Cache-Control': 'no-cache',
  };

  const fetchSingle = async (s: string) => {
    const endpoints = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1mo&range=10y&events=div`,
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(s)}`,
    ];

    for (const url of endpoints) {
      try {
        const response = await fetch(url, { headers });
        if (!response.ok) continue;
        const data: any = await response.json();
        
        if (url.includes('/quote')) {
          const quote = data?.quoteResponse?.result?.[0];
          if (quote) return { quote, price: quote.regularMarketPrice };
        } else {
          const result = data?.chart?.result?.[0];
          if (result) return { meta: result.meta, price: result.meta.regularMarketPrice };
        }
      } catch (e) {
        console.warn(`[STOCK] ${s} error:`, e);
      }
    }
    return null;
  };

  try {
    let data = await fetchSingle(symbol);
    if (!data && !symbol.includes('.')) {
      data = await fetchSingle(`${symbol}.IS`);
      if (data) symbol = `${symbol}.IS`;
    }

    if (!data) throw new Error(`No data for ${symbol}`);

    const { quote, price, meta } = data;
    const dividends = (data as any).result?.events?.dividends;
    
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
      
      if (dividendYield === 0) dividendYield = price > 0 ? lastYearDividends / price : 0;
    }
    
    let finalPrice = price || 0;
    if (symbol.toUpperCase().endsWith('.IS')) {
      const rate = await getUsdTryRate();
      finalPrice = finalPrice / rate;
    }

    return {
      price: finalPrice,
      dividendYield: isFinite(dividendYield) ? dividendYield : 0,
      dividendGrowth5Y,
      dividendGrowth10Y,
      name: quote?.longName || meta?.longName || symbol,
    };
  } catch (e) {
    throw new Error(`Failed to fetch ${symbol}`);
  }
}

export async function getCryptoPrice(symbol: string) {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}USDT`);
    if (!response.ok) throw new Error(`Binance HTTP ${response.status}`);
    const data: any = await response.json();
    return { price: parseFloat(data.price) };
  } catch (e) {
    throw new Error(`Failed crypto ${symbol}`);
  }
}

export async function getTefasPrice(symbol: string) {
  try {
    const result = await db.select().from(fundPrices).where(eq(fundPrices.symbol, symbol.toUpperCase())).limit(1);
    
    if (result.length > 0) {
      const price = parseFloat(result[0].price || '0');
      const rate = await getUsdTryRate();
      return price / rate;
    }
    
    return null;
  } catch (error) {
    console.error(`[TEFAS] Error ${symbol}:`, error);
    return null;
  }
}

export async function syncAllTefasPrices(): Promise<{ success: boolean; count: number }> {
  console.log('[TEFAS SYNC] Use Python crawler for fund price updates');
  return { success: true, count: 0 };
}

export async function getHistoricalPrices(symbol: string, type: string) {
  console.log(`[HISTORICAL] ${type}: ${symbol}`);
  const rate = await getUsdTryRate();
  
  if (type === 'Stock') {
    try {
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=7d`);
      if (!response.ok) return [];
      const data: any = await response.json();
      const prices = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
      
      let finalPrices = prices.filter((p: any) => p !== null);
      if (symbol.endsWith('.IS')) finalPrices = finalPrices.map((p: number) => p / rate);
      return finalPrices;
    } catch (e) {
      return [];
    }
  }

  if (type === 'Crypto') {
    try {
      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}USDT&interval=1d&limit=7`);
      if (!response.ok) return [];
      const data: any = await response.json();
      return data.map((d: any) => parseFloat(d[4]));
    } catch (e) {
      return [];
    }
  }

  if (type === 'Fund' || type === 'GovernmentContribution') {
    const currentPrice = await getTefasPrice(symbol);
    return currentPrice ? [currentPrice, currentPrice] : [];
  }

  return [];
}