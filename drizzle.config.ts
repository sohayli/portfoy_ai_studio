import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: '/Users/hayli/portfoy_ai_studio/src/lib/schema.ts',
  out: '/Users/hayli/portfoy_ai_studio/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: 'localhost',
    port: 5432,
    user: 'hayli',
    password: 'dev123',
    database: 'portfoy_ai',
  },
});