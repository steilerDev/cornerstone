/**
 * Drizzle ORM schema definitions.
 *
 * This file is intentionally minimal during initial scaffolding.
 * Schema entities will be added incrementally as each epic is implemented.
 * See the GitHub Wiki Schema page for the full planned schema.
 */

import { sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { isNotNull } from 'drizzle-orm';

/**
 * Users table - stores user accounts for authentication.
 * Supports both local (email+password) and OIDC authentication.
 */
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').unique().notNull(),
    displayName: text('display_name').notNull(),
    role: text('role', { enum: ['admin', 'member'] })
      .notNull()
      .default('member'),
    authProvider: text('auth_provider', { enum: ['local', 'oidc'] }).notNull(),
    passwordHash: text('password_hash'),
    oidcSubject: text('oidc_subject'),
    deactivatedAt: text('deactivated_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    oidcLookupIdx: uniqueIndex('idx_users_oidc_lookup')
      .on(table.authProvider, table.oidcSubject)
      .where(isNotNull(table.oidcSubject)),
  }),
);

/**
 * Sessions table - stores active user sessions.
 * Sessions are ephemeral; expired sessions are garbage-collected.
 */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    userIdIdx: index('idx_sessions_user_id').on(table.userId),
    expiresAtIdx: index('idx_sessions_expires_at').on(table.expiresAt),
  }),
);
