import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { runMigrations } from './migrate.js';
import type * as BetterSqlite3Namespace from 'better-sqlite3';

// Run migrations standalone (without starting the server)
async function main() {
  const dbPath = process.env.DATABASE_URL || './data/cornerstone.db';

  // Ensure parent directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  // Use dynamic import for CJS module
  // Node.js ESM wraps CJS default exports in { default: ... }
  const module: { default: typeof BetterSqlite3Namespace } = (await import(
    'better-sqlite3'
  )) as never;
  // @ts-ignore - TypeScript can't infer the correct constructor type after dynamic import
  const db = new module.default(dbPath);

  try {
    runMigrations(db);
    console.warn('Migrations completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
