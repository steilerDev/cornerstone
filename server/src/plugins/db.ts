import fp from 'fastify-plugin';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';

// Type augmentation: makes fastify.db available across all routes/plugins
declare module 'fastify' {
  interface FastifyInstance {
    db: BetterSQLite3Database<typeof schema> & { $client: Database.Database };
  }
}

export default fp(
  async function dbPlugin(fastify) {
    const dbPath = process.env.DATABASE_URL || '/app/data/cornerstone.db';

    // Ensure parent directory exists
    mkdirSync(dirname(dbPath), { recursive: true });

    fastify.log.info({ dbPath }, 'Opening SQLite database');

    const sqlite = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance
    sqlite.pragma('journal_mode = WAL');
    fastify.log.info('WAL mode enabled');

    // Run pending migrations (throws on failure, preventing startup)
    runMigrations(sqlite);
    fastify.log.info('Database migrations completed');

    // Create the Drizzle ORM instance wrapping the connection
    const db = drizzle(sqlite, { schema });

    // Decorate the Fastify instance so all routes can access fastify.db
    fastify.decorate('db', db);

    // Close the connection on server shutdown
    fastify.addHook('onClose', () => {
      fastify.log.info('Closing SQLite database connection');
      sqlite.close();
    });
  },
  {
    name: 'db',
  },
);
