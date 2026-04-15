#!/usr/bin/env python3
"""
Auto-setup helper - Opens Supabase Dashboard with SQL schema ready to paste
"""

import webbrowser
import pyperclip
import os

SQL_SCHEMA = """
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
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

-- Fund prices table
CREATE TABLE IF NOT EXISTS fund_prices (
  symbol TEXT PRIMARY KEY,
  price NUMERIC,
  name TEXT,
  fund_type TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  date TEXT,
  source TEXT DEFAULT 'tefas'
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_prices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read own data" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own data" ON users FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can read own portfolios" ON portfolios FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own portfolios" ON portfolios FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own portfolios" ON portfolios FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own portfolios" ON portfolios FOR DELETE USING (auth.uid() = owner_id);

CREATE POLICY "Users can read own assets" ON assets FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own assets" ON assets FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own assets" ON assets FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own assets" ON assets FOR DELETE USING (auth.uid() = owner_id);

CREATE POLICY "Fund prices are publicly readable" ON fund_prices FOR SELECT USING (true);
CREATE POLICY "Service role can manage fund prices" ON fund_prices FOR ALL USING (auth.role() = 'service_role');

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
"""


def main():
    print("=" * 60)
    print("  SUPABASE DATABASE SETUP HELPER")
    print("=" * 60)

    # Copy SQL to clipboard
    try:
        pyperclip.copy(SQL_SCHEMA)
        print("\n✓ SQL schema copied to clipboard!")
        print("  (Just paste it in the SQL Editor)")
    except:
        print("\n⚠ Could not copy to clipboard automatically")
        print("  SQL schema is in: setup_supabase_schema.sql")

    # Open Supabase SQL Editor
    sql_editor_url = (
        "https://supabase.com/dashboard/project/uraeixhgqpqffckocjky/sql/new"
    )

    print(f"\n🌐 Opening Supabase SQL Editor...")
    print(f"  URL: {sql_editor_url}")

    webbrowser.open(sql_editor_url)

    print("\n" + "=" * 60)
    print("  INSTRUCTIONS:")
    print("=" * 60)
    print("  1. SQL Editor opened in your browser")
    print("  2. Paste the SQL schema (already in clipboard)")
    print("  3. Click 'Run' button at the bottom")
    print("  4. Wait for 'Success. Nothing to return' message")
    print("=" * 60)

    print("\n✅ After running SQL:")
    print("   - Tables created: users, portfolios, assets, fund_prices")
    print("   - RLS policies enabled")
    print("   - Ready to use!")

    print("\n🔐 NEXT: Enable Google OAuth")
    print("   Dashboard → Authentication → Providers → Google → Enable")
    print("   Add callback: http://localhost:3000/auth/callback")

    input("\nPress Enter after running SQL in dashboard...")


if __name__ == "__main__":
    main()
