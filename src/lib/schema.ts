import { pgTable, text, timestamp, uuid, numeric, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Changed from uuid to text to support Google user IDs
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  baseCurrency: text('base_currency').default('USD'),
  role: text('role').default('user'), // user, admin, superadmin
  createdAt: timestamp('created_at').defaultNow(),
});

// Portfolios table
export const portfolios = pgTable('portfolios', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(), // Changed to text
  name: text('name').notNull(),
  description: text('description'),
  monthlyGoal: numeric('monthly_goal'),
  birthDate: text('birth_date'),
  besEntryDate: text('bes_entry_date'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Assets table
export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }).notNull(),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(), // Changed to text
  symbol: text('symbol').notNull(),
  name: text('name'),
  quantity: numeric('quantity').notNull().default('0'),
  purchasePrice: numeric('purchase_price').notNull().default('0'),
  purchaseCurrency: text('purchase_currency').default('USD'),
  type: text('type'),
  tefasType: text('tefas_type'),
  dividendYield: numeric('dividend_yield'),
  dividendGrowth5Y: numeric('dividend_growth_5y'),
  dividendGrowth10Y: numeric('dividend_growth_10y'),
  currentPrice: numeric('current_price'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Fund prices table (from TEFAS crawler) - Historical tracking
export const fundPrices = pgTable('fund_prices', {
  symbol: text('symbol').notNull(),
  date: text('date').notNull(),
  price: numeric('price'),
  priceUsd: numeric('price_usd'),
  name: text('name'),
  fundType: text('fund_type'),
  updatedAt: timestamp('updated_at').defaultNow(),
  source: text('source').default('tefas'),
}, (table) => ({
  pk: primaryKey({ columns: [table.symbol, table.date] }),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  portfolios: many(portfolios),
  assets: many(assets),
}));

export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
  owner: one(users, {
    fields: [portfolios.ownerId],
    references: [users.id],
  }),
  assets: many(assets),
}));

export const assetsRelations = relations(assets, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [assets.portfolioId],
    references: [portfolios.id],
  }),
  owner: one(users, {
    fields: [assets.ownerId],
    references: [users.id],
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Portfolio = typeof portfolios.$inferSelect;
export type NewPortfolio = typeof portfolios.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type FundPrice = typeof fundPrices.$inferSelect;
export type NewFundPrice = typeof fundPrices.$inferInsert;