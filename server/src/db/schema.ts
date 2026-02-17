/**
 * Drizzle ORM schema definitions.
 *
 * This file is intentionally minimal during initial scaffolding.
 * Schema entities will be added incrementally as each epic is implemented.
 * See the GitHub Wiki Schema page for the full planned schema.
 */

import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
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

/**
 * Work items table - stores construction work items/tasks.
 * EPIC-03: Work Items Core CRUD & Properties
 */
export const workItems = sqliteTable(
  'work_items',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', {
      enum: ['not_started', 'in_progress', 'completed', 'blocked'],
    })
      .notNull()
      .default('not_started'),
    startDate: text('start_date'),
    endDate: text('end_date'),
    durationDays: integer('duration_days'),
    startAfter: text('start_after'),
    startBefore: text('start_before'),
    assignedUserId: text('assigned_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    statusIdx: index('idx_work_items_status').on(table.status),
    assignedUserIdIdx: index('idx_work_items_assigned_user_id').on(table.assignedUserId),
    createdAtIdx: index('idx_work_items_created_at').on(table.createdAt),
  }),
);

/**
 * Tags table - shared tags for organizing work items and household items.
 * Tags are a global resource that can be applied to multiple entities.
 */
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').unique().notNull(),
  color: text('color'),
  createdAt: text('created_at').notNull(),
});

/**
 * Work item tags junction table - many-to-many relationship between work items and tags.
 */
export const workItemTags = sqliteTable(
  'work_item_tags',
  {
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workItemId, table.tagId] }),
    tagIdIdx: index('idx_work_item_tags_tag_id').on(table.tagId),
  }),
);

/**
 * Work item notes table - stores notes/comments on work items.
 * Notes are ordered by creation time descending (newest first).
 */
export const workItemNotes = sqliteTable(
  'work_item_notes',
  {
    id: text('id').primaryKey(),
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    workItemIdIdx: index('idx_work_item_notes_work_item_id').on(table.workItemId),
  }),
);

/**
 * Work item subtasks table - stores checklist items within a work item.
 * Subtasks are ordered by sort_order ascending.
 */
export const workItemSubtasks = sqliteTable(
  'work_item_subtasks',
  {
    id: text('id').primaryKey(),
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    isCompleted: integer('is_completed', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    workItemIdIdx: index('idx_work_item_subtasks_work_item_id').on(table.workItemId),
  }),
);

/**
 * Work item dependencies table - defines predecessor/successor relationships for scheduling.
 * Enforces acyclic graph constraint at application level.
 */
export const workItemDependencies = sqliteTable(
  'work_item_dependencies',
  {
    predecessorId: text('predecessor_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    successorId: text('successor_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    dependencyType: text('dependency_type', {
      enum: ['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'],
    })
      .notNull()
      .default('finish_to_start'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.predecessorId, table.successorId] }),
    successorIdIdx: index('idx_work_item_dependencies_successor_id').on(table.successorId),
  }),
);
