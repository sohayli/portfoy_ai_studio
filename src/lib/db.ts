import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgres://hayli:dev123@localhost:5432/portfoy_ai';

const client = postgres(connectionString);

export const db = drizzle(client, { schema });

// Export schema types and tables
export * from './schema';