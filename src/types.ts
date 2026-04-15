export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  baseCurrency: 'USD';
  birthDate?: string; // ISO format
  besEntryDate?: string; // ISO format
  role?: string; // user, admin, superadmin
}

export interface Portfolio {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  createdAt: any;
  monthlyGoal?: number;
  birthDate?: string; // ISO format
  besEntryDate?: string; // ISO format
}

export interface Asset {
  id: string;
  portfolioId: string;
  symbol: string;
  name: string;
  quantity: number;
  purchasePrice: number;
  purchaseCurrency: 'USD';
  type: 'Stock' | 'Crypto' | 'Commodity' | 'Cash' | 'Fund' | 'GovernmentContribution';
  currentPrice?: number;
  tefasType?: 'YAT' | 'EMK' | 'BYF';
  dividendYield?: number; // Annual percentage (e.g., 0.05 for 5%)
  dividendGrowth5Y?: number; // 5 Year CAGR (e.g., 0.10 for 10%)
  dividendGrowth10Y?: number; // 10 Year CAGR
}
