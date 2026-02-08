import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { runMigrations } from './migrate.js';

// Run migrations standalone (without starting the server)
async function main() {
  const dbPath = process.env.DATABASE_URL || './data/cornerstone.db';

  // Ensure parent directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);

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
