// Frontend API helper for Drizzle database operations
const API_BASE = '/api';

// Google Identity Services type declaration
declare global {
  interface Window {
    google: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          prompt: (callback?: (notification: any) => void) => void;
        };
      };
    };
  }
}

export interface User {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  role?: string;
  baseCurrency?: string;
  createdAt?: string;
}

export interface Portfolio {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  monthlyGoal?: number;
  birthDate?: string;
  besEntryDate?: string;
  createdAt?: string;
}

export interface Asset {
  id: string;
  portfolioId: string;
  ownerId: string;
  symbol: string;
  name?: string;
  quantity: number;
  purchasePrice: number;
  purchaseCurrency?: string;
  type?: string;
  tefasType?: string;
  dividendYield?: number;
  dividendGrowth5Y?: number;
  dividendGrowth10Y?: number;
  currentPrice?: number;
  createdAt?: string;
}

// Helper function to get auth headers
function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

// User operations
export async function getUser(id: string): Promise<User | null> {
  const response = await fetch(`${API_BASE}/users/${id}`, {
    headers: getAuthHeaders()
  });
  if (!response.ok) return null;
  return response.json();
}

export async function createUser(data: { id: string; email: string; displayName?: string }): Promise<User> {
  const response = await fetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return response.json();
}

// Portfolio operations
export async function getPortfolios(userId: string): Promise<Portfolio[]> {
  console.log('[API] Fetching portfolios for:', userId);
  console.log('[API] Auth token:', getAuthToken());
  
  const response = await fetch(`${API_BASE}/portfolios/${userId}`, {
    headers: getAuthHeaders()
  });
  
  console.log('[API] Portfolios response status:', response.status);
  
  if (!response.ok) {
    const error = await response.text();
    console.error('[API] Portfolios fetch error:', error);
    return [];
  }
  
  const data = await response.json();
  console.log('[API] Portfolios data:', data);
  return data;
}

export async function createPortfolio(data: { ownerId: string; name: string; description?: string }): Promise<Portfolio> {
  const response = await fetch(`${API_BASE}/portfolios`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function updatePortfolio(id: string, data: Partial<Portfolio>): Promise<Portfolio> {
  const response = await fetch(`${API_BASE}/portfolios/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function deletePortfolio(id: string): Promise<void> {
  await fetch(`${API_BASE}/portfolios/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
}

// Asset operations
export async function getAssetsByUser(userId: string): Promise<Asset[]> {
  const response = await fetch(`${API_BASE}/assets/user/${userId}`, {
    headers: getAuthHeaders()
  });
  if (!response.ok) return [];
  return response.json();
}

export async function getAssetsByPortfolio(portfolioId: string): Promise<Asset[]> {
  const response = await fetch(`${API_BASE}/assets/portfolio/${portfolioId}`, {
    headers: getAuthHeaders()
  });
  if (!response.ok) return [];
  return response.json();
}

export async function createAsset(data: {
  portfolioId: string;
  ownerId: string;
  symbol: string;
  name?: string;
  quantity: number;
  purchasePrice: number;
  purchaseCurrency?: string;
  type?: string;
  tefasType?: string;
}): Promise<Asset> {
  const response = await fetch(`${API_BASE}/assets`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function updateAsset(id: string, data: Partial<Asset>): Promise<Asset> {
  const response = await fetch(`${API_BASE}/assets/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function deleteAsset(id: string): Promise<void> {
  await fetch(`${API_BASE}/assets/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
}

// Google OAuth authentication
export async function signInWithGoogle(): Promise<void> {
  // Load Google Identity Services
  if (!window.google) {
    console.error('[AUTH] Google Identity Services not loaded');
    throw new Error('Google Sign-In not available');
  }
  
  return new Promise((resolve, reject) => {
    window.google.accounts.id.initialize({
      client_id: '642674294207-agfrtso7m3pphppijaju0h9vhsq527sf.apps.googleusercontent.com',
      scope: 'email profile',
      callback: async (response: any) => {
        if (response.credential) {
          try {
            console.log('[AUTH] Google credential received');
            
            // Send credential to backend
            const authResponse = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential: response.credential }),
            });
            
            const authData = await authResponse.json();
            
            if (authResponse.ok && authData.token) {
              console.log('[AUTH] Login response from server:', authData.user);
              console.log('[AUTH] Avatar URL:', authData.user?.avatarUrl);
              
              // Store JWT token
              localStorage.setItem('authToken', authData.token);
              localStorage.setItem('userId', authData.user.id);
              console.log('[AUTH] Login successful', authData.user);
              
              // Redirect to dashboard
              window.location.href = '/';
              resolve();
            } else {
              console.error('[AUTH] Backend auth failed', authData);
              reject(new Error(authData.error || 'Authentication failed'));
            }
          } catch (error) {
            console.error('[AUTH] Error during auth:', error);
            reject(error);
          }
        } else {
          reject(new Error('No credential received'));
        }
      },
    });
    
    // Prompt Google Sign-In popup
    window.google.accounts.id.prompt((notification: any) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        console.warn('[AUTH] Google popup not shown:', notification.getNotDisplayedReason());
      }
    });
  });
}

export function signOut(): Promise<void> {
  localStorage.removeItem('authToken');
  localStorage.removeItem('userId');
  window.location.reload();
  return Promise.resolve();
}

export function getAuthToken(): string | null {
  return localStorage.getItem('authToken');
}

export function getCurrentUserId(): string | null {
  return localStorage.getItem('userId');
}