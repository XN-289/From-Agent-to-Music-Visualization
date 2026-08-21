import { defineConfig } from 'drizzle-kit';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DB_PATH ?? './data/music-agent.db';
mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: dbPath,
  },
});
