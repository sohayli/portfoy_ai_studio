#!/usr/bin/env python3
"""
Setup Supabase tables using direct PostgreSQL connection
Run this script after getting database password from Supabase Dashboard
"""

import os
from supabase import create_client, Client

# Supabase credentials
SUPABASE_URL = "https://uraeixhgqpqffckocjky.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyYWVpeGhncXBxZmZja29jamt5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE0MTI1MSwiZXhwIjoyMDkxNzE3MjUxfQ.LjO9ACUgwSfr5U2UND4577wgLf7hlcJls4JTaOpv9kY"


def check_table_exists(supabase: Client, table_name: str) -> bool:
    """Check if a table exists by trying to query it"""
    try:
        result = supabase.table(table_name).select("*").limit(1).execute()
        return True
    except Exception as e:
        if "relation" in str(e) and "does not exist" in str(e):
            return False
        # Table might exist but be empty or have RLS issues
        return True


def main():
    print("Setting up Supabase for Portfoy AI Studio...")
    print(f"URL: {SUPABASE_URL}")

    # Create Supabase client with service role key
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Check if tables exist
    tables = ["users", "portfolios", "assets", "fund_prices"]

    print("\nChecking existing tables...")
    for table in tables:
        exists = check_table_exists(supabase, table)
        status = "✓ EXISTS" if exists else "✗ NOT FOUND"
        print(f"  {table}: {status}")

    # Try to create tables if they don't exist
    print("\n⚠️  Supabase client cannot create tables programmatically.")
    print("    You need to run SQL schema in Supabase Dashboard.")
    print("\n📋 Instructions:")
    print(
        "    1. Open: https://supabase.com/dashboard/project/uraeixhgqpqffckocjky/sql/new"
    )
    print("    2. Copy the SQL schema from: setup_supabase_schema.sql")
    print("    3. Paste and click 'Run'")
    print("\n💡 Or get database password and run:")
    print("    python3 setup_supabase_db.py")

    # Create schema file for easy copy-paste
    schema_file = "setup_supabase_schema.sql"
    if not os.path.exists(schema_file):
        print(f"\n📝 Creating {schema_file} for you...")
        with open(schema_file, "w") as f:
            f.write(SQL_SCHEMA)
        print(f"✓ SQL schema saved to {schema_file}")

    # Check Google OAuth setup
    print("\n🔐 Google OAuth Setup:")
    print("    1. Dashboard → Authentication → Providers")
    print("    2. Enable Google")
    print("    3. Add callback URL: http://localhost:3000/auth/callback")

    return 0


SQL_SCHEMA = """
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
DO $$ BEGIN
  CREATE POLICY "Users can read own data" ON users FOR SELECT USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own data" ON users FOR INSERT WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS Policies for portfolios
DO $$ BEGIN
  CREATE POLICY "Users can read own portfolios" ON portfolios FOR SELECT USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own portfolios" ON portfolios FOR INSERT WITH CHECK (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own portfolios" ON portfolios FOR UPDATE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own portfolios" ON portfolios FOR DELETE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS Policies for assets
DO $$ BEGIN
  CREATE POLICY "Users can read own assets" ON assets FOR SELECT USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own assets" ON assets FOR INSERT WITH CHECK (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own assets" ON assets FOR UPDATE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own assets" ON assets FOR DELETE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS Policies for fund_prices (publicly readable, service role writable)
DO $$ BEGIN
  CREATE POLICY "Fund prices are publicly readable" ON fund_prices FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can manage fund prices" ON fund_prices FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
"""

if __name__ == "__main__":
    main()
