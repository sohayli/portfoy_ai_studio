

export async function getUsdTryRate() {
  try {
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/USDTRY=X`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
      }
    });
    if (!response.ok) return 32.5; // Fallback rate
    const data: any = await response.json();
    return data.chart.result[0].meta.regularMarketPrice;
  } catch (e) {
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
    // Try quote API first
    const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(s)}`;
    const quoteResponse = await fetch(quoteUrl, { headers });
    let quoteData: any = null;
    if (quoteResponse.ok) quoteData = await quoteResponse.json();
    const quote = quoteData?.quoteResponse?.result?.[0];

    // Try chart API
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1mo&range=11y&events=div`;
    const chartResponse = await fetch(chartUrl, { headers });
    let chartData: any = null;
    if (chartResponse.ok) chartData = await chartResponse.json();
    const result = chartData?.chart?.result?.[0];

    if (!quote && !result) return null;

    const meta = result?.meta || quote;
    let price = quote?.regularMarketPrice || meta?.regularMarketPrice || meta?.price;
    if (price === undefined || price === null) {
      price = quote?.regularMarketPreviousClose || meta?.previousClose;
    }

    return { quote, result, price, meta };
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
}

class TefasClient {
  private static sessions: Record<string, TefasSession> = {};
  private static USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  private static async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private static async getSession(domain: string, force: boolean = false): Promise<string> {
    const now = Date.now();
    if (!force && this.sessions[domain] && this.sessions[domain].expiry > now) {
      return this.sessions[domain].cookie;
    }

    try {
      const targetPage = `${domain}/FonAnaliz.aspx`;
      const response = await fetch(targetPage, {
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      let cookieHeader = '';
      const setCookieFunc = (response.headers as any).getSetCookie;
      if (typeof setCookieFunc === 'function') {
        const setCookies = setCookieFunc.call(response.headers);
        cookieHeader = setCookies.map((c: string) => c.split(';')[0].trim()).join('; ');
      } else {
        const rawCookie = response.headers.get('set-cookie');
        if (rawCookie) cookieHeader = rawCookie;
      }

      if (cookieHeader) {
        this.sessions[domain] = {
          cookie: cookieHeader,
          expiry: now + 15 * 60 * 1000
        };
      }
      return cookieHeader;
    } catch (e) {
      return '';
    }
  }

  private static async request(domain: string, endpoint: string, body: URLSearchParams, attempt: number = 0): Promise<any> {
    const cookie = await this.getSession(domain, attempt > 0);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${domain}${endpoint}`, {
        method: 'POST',
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': domain,
          'Referer': `${domain}/FonAnaliz.aspx`,
          ...(cookie ? { 'Cookie': cookie } : {})
        },
        body: body,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 403 || response.status === 405) {
          delete this.sessions[domain];
          throw new Error(`WAF Block (HTTP ${response.status})`);
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      if (text.includes('Request Rejected') || text.includes('WAF')) {
        delete this.sessions[domain];
        throw new Error('Request Rejected by WAF');
      }

      return JSON.parse(text);
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  }

  public static async fetchWithRetry(symbol: string, fundType: string): Promise<number | null> {
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
    const fonkod = symbol.toUpperCase();

    for (const domain of domains) {
      // Exponential backoff retry logic
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) {
            const delay = Math.pow(2, attempt) * 1000;
            await this.sleep(delay);
          }

          const payload = new URLSearchParams({
            'fontip': fundType,
            'sfonkod': fonkod,
            'bastarih': startDateStr,
            'bittarih': endDateStr,
            'fonturkod': ''
          });

          const result = await this.request(domain, '/api/DB/BindHistoryInfo', payload, attempt);
          
          if (result.data && Array.isArray(result.data) && result.data.length > 0) {
            const sorted = [...result.data].sort((a, b) => {
              const dateA = new Date(a.TARIH.split('.').reverse().join('-')).getTime();
              const dateB = new Date(b.TARIH.split('.').reverse().join('-')).getTime();
              return dateB - dateA;
            });
            
            if (sorted[0].FIYAT) {
              return parseFloat(sorted[0].FIYAT);
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
