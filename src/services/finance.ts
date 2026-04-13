import { Asset } from '../types';

export const fetchStockPrice = async (symbol: string): Promise<{ 
  price: number; 
  name: string; 
  dividendYield?: number; 
  dividendGrowth5Y?: number; 
  dividendGrowth10Y?: number 
} | null> => {
  try {
    const response = await fetch(`/api/price/stock/${encodeURIComponent(symbol)}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error body');
      throw new Error(`Failed to fetch stock price: ${response.status} ${errorText}`);
    }
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      throw new Error(`Expected JSON but got ${contentType}: ${text.substring(0, 100)}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching stock price for ${symbol}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
};

export const fetchCryptoPrice = async (symbol: string): Promise<number | null> => {
  try {
    const response = await fetch(`/api/price/crypto/${encodeURIComponent(symbol)}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    if (!response.ok) throw new Error(`Failed to fetch crypto price: ${response.status}`);
    const data = await response.json();
    return data.price;
  } catch (error) {
    console.error(`Error fetching crypto price for ${symbol}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
};

export const fetchTefasPrice = async (symbol: string): Promise<number | null> => {
  const maxRetries = 3;
  let delay = 1000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }

      const response = await fetch(`/api/price/tefas/${encodeURIComponent(symbol)}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error body');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`Expected JSON but got ${contentType}: ${text.substring(0, 100)}`);
      }

      const data = await response.json();
      return data.price;
    } catch (error) {
      console.warn(`[TEFAS] Attempt ${attempt + 1} failed for ${symbol}:`, error instanceof Error ? error.message : String(error));
      if (attempt === maxRetries - 1) {
        console.error(`[TEFAS] All ${maxRetries} attempts failed for ${symbol}`);
      }
    }
  }
  return null;
};

export const fetchPriceHistory = async (symbol: string, type: string): Promise<number[]> => {
  try {
    const response = await fetch(`/api/history/${encodeURIComponent(type)}/${encodeURIComponent(symbol)}?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.history || [];
  } catch (error) {
    console.error(`Error fetching history for ${symbol}:`, error);
    return [];
  }
};
