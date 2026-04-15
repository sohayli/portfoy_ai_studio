import { db, users, portfolios, assets, fundPrices } from './db';
import { eq } from 'drizzle-orm';

// Auth helper (simple session-based for now)
export async function getCurrentUser(sessionId: string) {
  // TODO: Implement proper session management
  // For now, return null - auth will be handled separately
  return null;
}

// Database helpers
export async function getUserProfile(userId: string) {
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0] || null;
}

export async function createUserProfile(userId: string, email: string, displayName?: string) {
  const result = await db.insert(users).values({
    id: userId,
    email,
    displayName: displayName || email,
    baseCurrency: 'USD',
  }).returning();
  return result[0];
}

// Portfolios
export async function getPortfolios(userId: string) {
  return await db.select().from(portfolios).where(eq(portfolios.ownerId, userId));
}

export async function createPortfolio(userId: string, name: string, description?: string) {
  const result = await db.insert(portfolios).values({
    ownerId: userId,
    name,
    description,
  }).returning();
  return result[0];
}

export async function updatePortfolio(portfolioId: string, updates: { name?: string; description?: string }) {
  const result = await db.update(portfolios)
    .set(updates)
    .where(eq(portfolios.id, portfolioId))
    .returning();
  return result[0];
}

export async function deletePortfolio(portfolioId: string) {
  await db.delete(portfolios).where(eq(portfolios.id, portfolioId));
}

// Assets
export async function getAssets(userId: string) {
  return await db.select().from(assets).where(eq(assets.ownerId, userId));
}

export async function getAssetsByPortfolio(portfolioId: string) {
  return await db.select().from(assets).where(eq(assets.portfolioId, portfolioId));
}

export async function createAsset(asset: {
  portfolio_id: string;
  owner_id: string;
  symbol: string;
  name?: string;
  quantity: number;
  purchase_price: number;
  purchase_currency?: string;
  type?: string;
  tefas_type?: string;
}) {
  const result = await db.insert(assets).values({
    portfolioId: asset.portfolio_id,
    ownerId: asset.owner_id,
    symbol: asset.symbol,
    name: asset.name,
    quantity: asset.quantity.toString(),
    purchasePrice: asset.purchase_price.toString(),
    purchaseCurrency: asset.purchase_currency || 'USD',
    type: asset.type,
    tefasType: asset.tefas_type,
  }).returning();
  return result[0];
}

export async function updateAsset(assetId: string, updates: Partial<{
  quantity: number;
  purchase_price: number;
  current_price: number;
}>) {
  const updateData: any = {};
  if (updates.quantity) updateData.quantity = updates.quantity.toString();
  if (updates.purchase_price) updateData.purchasePrice = updates.purchase_price.toString();
  if (updates.current_price) updateData.currentPrice = updates.current_price.toString();
  
  const result = await db.update(assets)
    .set(updateData)
    .where(eq(assets.id, assetId))
    .returning();
  return result[0];
}

export async function deleteAsset(assetId: string) {
  await db.delete(assets).where(eq(assets.id, assetId));
}

// Fund prices (from TEFAS crawler)
export async function getFundPrice(symbol: string) {
  const result = await db.select().from(fundPrices).where(eq(fundPrices.symbol, symbol)).limit(1);
  return result[0] || null;
}

export async function upsertFundPrice(data: { symbol: string; price: number; name?: string; fundType?: string }) {
  const result = await db.insert(fundPrices)
    .values({
      symbol: data.symbol,
      price: data.price.toString(),
      name: data.name,
      fundType: data.fundType,
    })
    .onConflictDoUpdate({
      target: fundPrices.symbol,
      set: {
        price: data.price.toString(),
        name: data.name,
        updatedAt: new Date(),
      },
    })
    .returning();
  return result[0];
}