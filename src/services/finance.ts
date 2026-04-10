import { Asset } from '../types';

export const fetchStockPrice = async (symbol: string): Promise<{ 
  price: number; 
  name: string; 
  dividendYield?: number; 
  dividendGrowth5Y?: number; 
  dividendGrowth10Y?: number 
} | null> => {
  try {
    const response = await fetch(`/api/price/stock/${symbol}`);
    if (!response.ok) throw new Error('Failed to fetch');
    return await response.json();
  } catch (error) {
    console.error(`Error fetching stock price for ${symbol}:`, error);
    return null;
  }
};

export const fetchCryptoPrice = async (symbol: string): Promise<number | null> => {
  try {
    const response = await fetch(`/api/price/crypto/${symbol}`);
    if (!response.ok) throw new Error('Failed to fetch');
    const data = await response.json();
    return data.price;
  } catch (error) {
    console.error(`Error fetching crypto price for ${symbol}:`, error);
    return null;
  }
};

export const fetchTefasPrice = async (symbol: string, type: Asset['tefasType']): Promise<number | null> => {
  try {
    const response = await fetch(`/api/price/tefas/${symbol}?type=${type}`);
    if (!response.ok) throw new Error('Failed to fetch');
    const data = await response.json();
    return data.price;
  } catch (error) {
    console.error(`Error fetching TEFAS price for ${symbol}:`, error);
    return null;
  }
};
