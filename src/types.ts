export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  baseCurrency: 'USD';
}

export interface Portfolio {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  createdAt: any;
  monthlyGoal?: number;
}

export interface Asset {
  id: string;
  portfolioId: string;
  symbol: string;
  name: string;
  quantity: number;
  purchasePrice: number;
  purchaseCurrency: 'USD';
  type: 'Stock' | 'Crypto' | 'Commodity' | 'Cash' | 'Fund';
  currentPrice?: number;
  tefasType?: 'YAT' | 'EMK' | 'BYF';
  dividendYield?: number; // Annual percentage (e.g., 0.05 for 5%)
  dividendGrowth5Y?: number; // 5 Year CAGR (e.g., 0.10 for 10%)
  dividendGrowth10Y?: number; // 10 Year CAGR
}
