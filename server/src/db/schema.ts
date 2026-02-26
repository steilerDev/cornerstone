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
  real,
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
 * EPIC-05 Story 5.9: budget fields removed (moved to work_item_budgets table).
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
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
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
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
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
 * EPIC-06: Added lead_lag_days for scheduling offset support.
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
    leadLagDays: integer('lead_lag_days').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.predecessorId, table.successorId] }),
    successorIdIdx: index('idx_work_item_dependencies_successor_id').on(table.successorId),
  }),
);

// ─── EPIC-05: Budget Management ───────────────────────────────────────────────

/**
 * Budget categories table - organizes construction costs into categories.
 * Pre-seeded with 10 default categories; users can add more.
 */
export const budgetCategories = sqliteTable('budget_categories', {
  id: text('id').primaryKey(),
  name: text('name').unique().notNull(),
  description: text('description'),
  color: text('color'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * Vendors table - tracks contractors and vendors involved in the project.
 */
export const vendors = sqliteTable(
  'vendors',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    specialty: text('specialty'),
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    notes: text('notes'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    nameIdx: index('idx_vendors_name').on(table.name),
  }),
);

/**
 * Budget sources table - financing sources (bank loans, credit lines, savings, etc.).
 */
export const budgetSources = sqliteTable('budget_sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sourceType: text('source_type', {
    enum: ['bank_loan', 'credit_line', 'savings', 'other'],
  }).notNull(),
  totalAmount: real('total_amount').notNull(),
  interestRate: real('interest_rate'),
  terms: text('terms'),
  notes: text('notes'),
  status: text('status', { enum: ['active', 'exhausted', 'closed'] })
    .notNull()
    .default('active'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * Work item budget lines table - tracks individual budget estimates/allocations for work items.
 * EPIC-05 Story 5.9: replaces the flat budget fields that were on work_items.
 * Each line can reference a vendor, budget category, and budget source.
 */
export const workItemBudgets = sqliteTable(
  'work_item_budgets',
  {
    id: text('id').primaryKey(),
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    description: text('description'),
    plannedAmount: real('planned_amount').notNull().default(0),
    confidence: text('confidence', {
      enum: ['own_estimate', 'professional_estimate', 'quote', 'invoice'],
    })
      .notNull()
      .default('own_estimate'),
    budgetCategoryId: text('budget_category_id').references(() => budgetCategories.id, {
      onDelete: 'set null',
    }),
    budgetSourceId: text('budget_source_id').references(() => budgetSources.id, {
      onDelete: 'set null',
    }),
    vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    workItemIdIdx: index('idx_work_item_budgets_work_item_id').on(table.workItemId),
    vendorIdIdx: index('idx_work_item_budgets_vendor_id').on(table.vendorId),
    budgetCategoryIdIdx: index('idx_work_item_budgets_budget_category_id').on(
      table.budgetCategoryId,
    ),
    budgetSourceIdIdx: index('idx_work_item_budgets_budget_source_id').on(table.budgetSourceId),
  }),
);

/**
 * Invoices table - tracks vendor invoices for payment management.
 * EPIC-05 Story 5.9: added workItemBudgetId FK; changed 'overdue' status to 'claimed'.
 */
export const invoices = sqliteTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    vendorId: text('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    invoiceNumber: text('invoice_number'),
    amount: real('amount').notNull(),
    date: text('date').notNull(),
    dueDate: text('due_date'),
    status: text('status', { enum: ['pending', 'paid', 'claimed'] })
      .notNull()
      .default('pending'),
    notes: text('notes'),
    workItemBudgetId: text('work_item_budget_id').references(() => workItemBudgets.id, {
      onDelete: 'set null',
    }),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    vendorIdIdx: index('idx_invoices_vendor_id').on(table.vendorId),
    statusIdx: index('idx_invoices_status').on(table.status),
    dateIdx: index('idx_invoices_date').on(table.date),
    workItemBudgetIdIdx: index('idx_invoices_work_item_budget_id').on(table.workItemBudgetId),
  }),
);

/**
 * Subsidy programs table - government/institutional programs reducing construction costs.
 */
export const subsidyPrograms = sqliteTable('subsidy_programs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  eligibility: text('eligibility'),
  reductionType: text('reduction_type', { enum: ['percentage', 'fixed'] }).notNull(),
  reductionValue: real('reduction_value').notNull(),
  applicationStatus: text('application_status', {
    enum: ['eligible', 'applied', 'approved', 'received', 'rejected'],
  })
    .notNull()
    .default('eligible'),
  applicationDeadline: text('application_deadline'),
  notes: text('notes'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * Subsidy program categories junction table - links subsidy programs to budget categories (M:N).
 */
export const subsidyProgramCategories = sqliteTable(
  'subsidy_program_categories',
  {
    subsidyProgramId: text('subsidy_program_id')
      .notNull()
      .references(() => subsidyPrograms.id, { onDelete: 'cascade' }),
    budgetCategoryId: text('budget_category_id')
      .notNull()
      .references(() => budgetCategories.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.subsidyProgramId, table.budgetCategoryId] }),
  }),
);

/**
 * Work item subsidies junction table - links work items to subsidy programs (M:N).
 */
export const workItemSubsidies = sqliteTable(
  'work_item_subsidies',
  {
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    subsidyProgramId: text('subsidy_program_id')
      .notNull()
      .references(() => subsidyPrograms.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workItemId, table.subsidyProgramId] }),
    subsidyProgramIdIdx: index('idx_work_item_subsidies_subsidy_program_id').on(
      table.subsidyProgramId,
    ),
  }),
);

// ─── EPIC-06: Timeline, Gantt Chart & Dependency Management ───────────────────

/**
 * Milestones table - major project progress points with optional work item associations.
 * Uses auto-incrementing integer PK (unlike other entities that use TEXT UUIDs).
 * EPIC-06: Supports Gantt chart visualization and milestone tracking.
 */
export const milestones = sqliteTable(
  'milestones',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    description: text('description'),
    targetDate: text('target_date').notNull(),
    isCompleted: integer('is_completed', { mode: 'boolean' }).notNull().default(false),
    completedAt: text('completed_at'),
    color: text('color'),
    // created_by is nullable to support ON DELETE SET NULL (user deletion preserves milestone)
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    targetDateIdx: index('idx_milestones_target_date').on(table.targetDate),
  }),
);

/**
 * Milestone-work items junction table - M:N relationship between milestones and work items.
 * Represents "Linked" work items: work items that contribute to a milestone's completion.
 * EPIC-06: Cascades on delete for both sides.
 */
export const milestoneWorkItems = sqliteTable(
  'milestone_work_items',
  {
    milestoneId: integer('milestone_id')
      .notNull()
      .references(() => milestones.id, { onDelete: 'cascade' }),
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.milestoneId, table.workItemId] }),
    workItemIdIdx: index('idx_milestone_work_items_work_item_id').on(table.workItemId),
  }),
);

/**
 * Work item milestone dependencies table - work items that depend on a milestone completing
 * before they can start. Represents "Required Milestones" (inverse of "Linked").
 * EPIC-06 UAT Fix 4: Added for bidirectional milestone-work item dependency tracking.
 */
export const workItemMilestoneDeps = sqliteTable(
  'work_item_milestone_deps',
  {
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    milestoneId: integer('milestone_id')
      .notNull()
      .references(() => milestones.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workItemId, table.milestoneId] }),
    milestoneIdIdx: index('idx_wi_milestone_deps_milestone').on(table.milestoneId),
  }),
);
