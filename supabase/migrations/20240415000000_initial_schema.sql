-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  base_currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Portfolios table
CREATE TABLE IF NOT EXISTS portfolios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  monthly_goal NUMERIC,
  birth_date TEXT,
  bes_entry_date TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assets table
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT,
  quantity NUMERIC NOT NULL DEFAULT 0,
  purchase_price NUMERIC NOT NULL DEFAULT 0,
  purchase_currency TEXT DEFAULT 'USD',
  type TEXT,
  tefas_type TEXT,
  dividend_yield NUMERIC,
  dividend_growth_5y NUMERIC,
  dividend_growth_10y NUMERIC,
  current_price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fund prices table (from TEFAS crawler)
CREATE TABLE IF NOT EXISTS fund_prices (
  symbol TEXT PRIMARY KEY,
  price NUMERIC,
  name TEXT,
  fund_type TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  date TEXT,
  source TEXT DEFAULT 'tefas'
);

-- Enable RLS (Row Level Security)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_prices ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
CREATE POLICY "Users can read own data" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own data" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for portfolios
CREATE POLICY "Users can read own portfolios" ON portfolios FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own portfolios" ON portfolios FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own portfolios" ON portfolios FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own portfolios" ON portfolios FOR DELETE USING (auth.uid() = owner_id);

-- RLS Policies for assets
CREATE POLICY "Users can read own assets" ON assets FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own assets" ON assets FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own assets" ON assets FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own assets" ON assets FOR DELETE USING (auth.uid() = owner_id);

-- RLS Policies for fund_prices (publicly readable, service role writable)
CREATE POLICY "Fund prices are publicly readable" ON fund_prices FOR SELECT USING (true);
CREATE POLICY "Service role can manage fund prices" ON fund_prices FOR ALL USING (auth.role() = 'service_role');

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;