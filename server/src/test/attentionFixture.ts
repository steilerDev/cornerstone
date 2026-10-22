/**
 * Synthetic attention fixture (#2229, test-only). T = 2026-03-10. Invented names only.
 *
 * Every rule has a positive and a negative record (see the QA spec table). Ids are chosen so the
 * expected row keys can be read straight off the ids.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';

export type FixtureDb = BetterSQLite3Database<typeof schema>;

export const FIXTURE_TODAY = '2026-03-10';
export const FIXTURE_NOW = '2026-03-10T09:00:00.000Z';

const STAMP = '2026-03-01T00:00:00.000Z';
const ts = { createdAt: STAMP, updatedAt: STAMP };

export const FIXTURE_USER = {
  id: 'user-zed',
  email: 'zed.person@example.test',
  displayName: 'Zed Person',
};

type WorkItemInsert = typeof schema.workItems.$inferInsert;

function task(db: FixtureDb, id: string, o: Partial<WorkItemInsert> = {}): void {
  db.insert(schema.workItems)
    .values({
      id,
      title: `Task ${id}`,
      status: 'not_started',
      ...ts,
      ...o,
    })
    .run();
}

function dependency(db: FixtureDb, predecessorId: string, successorId: string, leadLag = 0) {
  db.insert(schema.workItemDependencies)
    .values({
      predecessorId,
      successorId,
      dependencyType: 'finish_to_start',
      leadLagDays: leadLag,
    })
    .run();
}

function milestone(
  db: FixtureDb,
  id: number,
  targetDate: string,
  o: Partial<typeof schema.milestones.$inferInsert> = {},
): void {
  db.insert(schema.milestones)
    .values({ id, title: `Milestone ${id}`, targetDate, ...ts, ...o })
    .run();
}

function invoice(
  db: FixtureDb,
  id: string,
  amount: number,
  status: 'quotation' | 'pending' | 'paid' | 'claimed',
  o: Partial<typeof schema.invoices.$inferInsert> = {},
): void {
  db.insert(schema.invoices)
    .values({
      id,
      vendorId: 'v-a',
      invoiceNumber: `NR-${id}`,
      amount,
      status,
      date: '2026-03-01',
      ...ts,
      ...o,
    })
    .run();
}

function deposit(
  db: FixtureDb,
  id: string,
  invoiceId: string,
  amount: number,
  status: 'pending' | 'paid' | 'claimed',
  dueDate: string,
  entryType: 'deposit' | 'refund' = 'deposit',
): void {
  db.insert(schema.invoiceDeposits)
    .values({ id, invoiceId, amount, status, dueDate, entryType, ...ts })
    .run();
}

function diary(db: FixtureDb, id: string, o: Partial<typeof schema.diaryEntries.$inferInsert>) {
  db.insert(schema.diaryEntries)
    .values({
      id,
      entryType: 'daily_log',
      entryDate: '2026-03-08',
      title: null,
      body: '',
      metadata: null,
      status: 'saved',
      isAutomatic: false,
      ...ts,
      ...o,
    })
    .run();
}

function grant(
  db: FixtureDb,
  id: string,
  status: 'eligible' | 'applied' | 'approved' | 'received' | 'rejected',
  deadline: string | null,
): void {
  db.insert(schema.subsidyPrograms)
    .values({
      id,
      name: `Grant ${id}`,
      reductionType: 'percentage',
      reductionValue: 10,
      applicationStatus: status,
      applicationDeadline: deadline,
      ...ts,
    })
    .run();
}

function purchase(
  db: FixtureDb,
  id: string,
  o: Partial<typeof schema.householdItems.$inferInsert>,
): void {
  db.insert(schema.householdItems)
    .values({ id, name: `Purchase ${id}`, categoryId: 'hic-furniture', ...ts, ...o })
    .run();
}

/** The rows the fixture must produce. */
export const EXPECTED_ROW_KEYS = [
  'N1:work_item:wi-1',
  'N2:group:2026-03-02',
  'N2:work_item:wi-7',
  'N2:work_item:wi-d',
  'N2:work_item:wi-f1',
  'N2:work_item:wi-h1',
  'N2:work_item:wi-h2',
  'N2:work_item:wi-h3',
  'N3:milestone:2',
  'N3:milestone:3',
  'N4:invoice:inv-1',
  'N4:progress_payment:dep-1',
  'N5:invoice:inv-2',
  'N5:invoice:inv-2b',
  'N5:progress_payment:dep-2',
  'N6:invoice:inv-5',
  'N8:budget_source:src-loan',
  'N9:invoice:off-1',
  'N9:invoice:off-3',
  'N10:household_item:hi-1',
  'N10:household_item:hi-2',
  'N10:household_item:hi-3',
  'N11:subsidy_program:gr-1',
  'N11:subsidy_program:gr-2',
  'N12:diary_entry:d-bad',
  'N12:diary_entry:d-none',
  'N12:diary_entry:d-open',
  'N12:diary_entry:d-prog',
] as const;

/** Every invoice or offer that is not fully split (inv-8, inv-8b and inv-10 are). */
export const EXPECTED_H2_KEYS = [
  'H2:invoice:inv-1',
  'H2:invoice:inv-2',
  'H2:invoice:inv-2b',
  'H2:invoice:inv-3',
  'H2:invoice:inv-4',
  'H2:invoice:inv-5',
  'H2:invoice:inv-6',
  'H2:invoice:inv-7',
  'H2:invoice:inv-9',
  'H2:invoice:off-1',
  'H2:invoice:off-2',
  'H2:invoice:off-3',
  'H2:invoice:off-4',
] as const;

export const EXPECTED_TIDY_KEYS = [
  'H1:diary_entry:d-draft-issue',
  'H1:diary_entry:dr-old',
  ...EXPECTED_H2_KEYS,
  'H4:work_item:wi-6',
] as const;

export function seedAttentionFixture(db: FixtureDb): void {
  // Users, areas, companies
  db.insert(schema.users)
    .values({
      id: FIXTURE_USER.id,
      email: FIXTURE_USER.email,
      displayName: FIXTURE_USER.displayName,
      role: 'member',
      authProvider: 'local',
      passwordHash: 'hashed',
      ...ts,
    })
    .run();
  db.insert(schema.areas)
    .values({ id: 'a-1', name: 'Building', parentId: null, sortOrder: 0, ...ts })
    .run();
  db.insert(schema.areas)
    .values({ id: 'a-2', name: 'Ground floor', parentId: 'a-1', sortOrder: 0, ...ts })
    .run();
  for (const [id, name] of [
    ['v-a', 'Company A'],
    ['v-b', 'Company B'],
  ] as const) {
    db.insert(schema.vendors)
      .values({ id, name, ...ts })
      .run();
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────
  task(db, 'wi-1', {
    title: 'Task A',
    status: 'in_progress',
    startDate: '2026-02-20',
    endDate: '2026-03-05',
    assignedVendorId: 'v-a',
    createdBy: FIXTURE_USER.id,
    areaId: 'a-2',
  });
  task(db, 'wi-2', { startDate: '2026-03-06' });
  task(db, 'wi-3', { startDate: '2026-04-30' });
  task(db, 'wi-4', { startDate: '2026-03-20' });
  task(db, 'wi-9', {
    status: 'completed',
    startDate: '2026-03-01',
    endDate: '2026-03-04',
    actualStartDate: '2026-03-01',
    actualEndDate: '2026-03-04',
  });
  dependency(db, 'wi-1', 'wi-2');
  dependency(db, 'wi-2', 'wi-3');
  dependency(db, 'wi-1', 'wi-9');
  task(db, 'wi-5', {
    status: 'in_progress',
    startDate: '2026-03-01',
    endDate: '2026-03-15',
    assignedUserId: FIXTURE_USER.id,
  });
  task(db, 'wi-6', {
    status: 'in_progress',
    startDate: '2026-03-01',
    endDate: '2026-03-08',
    actualEndDate: '2026-03-08',
  });
  task(db, 'wi-6b', {
    status: 'in_progress',
    startDate: '2026-03-01',
    endDate: '2026-03-10',
    actualEndDate: '2026-03-10',
  });
  task(db, 'wi-7', { startDate: '2026-03-07' });
  task(db, 'wi-8', { startDate: '2026-03-12' });
  task(db, 'wi-undated');
  for (const n of [1, 2, 3, 4]) task(db, `wi-g${n}`, { startDate: '2026-03-02' });
  for (const n of [1, 2, 3]) task(db, `wi-h${n}`, { startDate: '2026-03-03' });
  // A late predecessor and a successor that is late only because of it (negative lag): folded
  task(db, 'wi-f1', { startDate: '2026-03-01' });
  task(db, 'wi-f2', { startDate: '2026-02-20' });
  dependency(db, 'wi-f1', 'wi-f2', -10);
  // Contributor with a duration: planned end 03-19, forecast end 03-20
  task(db, 'wi-d', { startDate: '2026-03-09', durationDays: 10 });

  // ── Milestones ─────────────────────────────────────────────────────────────
  milestone(db, 1, '2026-03-25'); // gate: wi-1 contributes, wi-4 waits
  db.insert(schema.milestoneWorkItems).values({ milestoneId: 1, workItemId: 'wi-1' }).run();
  db.insert(schema.workItemMilestoneDeps).values({ workItemId: 'wi-4', milestoneId: 1 }).run();
  milestone(db, 2, '2026-03-01'); // N3: target passed, no contributors; wi-8 waits for it
  db.insert(schema.workItemMilestoneDeps).values({ workItemId: 'wi-8', milestoneId: 2 }).run();
  milestone(db, 3, '2026-03-19'); // N3: forecast 03-20 is after the target
  db.insert(schema.milestoneWorkItems).values({ milestoneId: 3, workItemId: 'wi-d' }).run();
  milestone(db, 4, '2026-02-01', { isCompleted: true, completedAt: '2026-02-02T00:00:00.000Z' });
  milestone(db, 5, '2026-04-01'); // future, contributor ends before the target
  db.insert(schema.milestoneWorkItems).values({ milestoneId: 5, workItemId: 'wi-5' }).run();

  // ── Funding sources and budget lines ───────────────────────────────────────
  for (const [id, name, sourceType, totalAmount] of [
    ['src-loan', 'Loan A', 'bank_loan', 10000],
    ['src-own', 'Savings A', 'savings', 8000],
    ['src-credit', 'Credit A', 'credit_line', 3000],
    ['src-small', 'Loan B', 'bank_loan', 100],
  ] as const) {
    db.insert(schema.budgetSources)
      .values({ id, name, sourceType, totalAmount, status: 'active', ...ts })
      .run();
  }
  for (const [id, workItemId, plannedAmount, budgetSourceId] of [
    ['l-loan', 'wi-5', 5000, 'src-loan'],
    ['l-own', 'wi-5', 500, 'src-own'],
    ['l-big', 'wi-3', 5000, 'src-small'],
    ['l-split', 'wi-5', 100, null],
  ] as const) {
    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId,
        plannedAmount,
        confidence: 'invoice',
        includesVat: true,
        budgetSourceId,
        ...ts,
      })
      .run();
  }

  // ── Invoices and offers ────────────────────────────────────────────────────
  invoice(db, 'inv-1', 1000, 'pending', { dueDate: '2026-03-01', date: '2026-02-20' });
  invoice(db, 'inv-2', 800, 'pending', { dueDate: '2026-03-17' });
  invoice(db, 'inv-2b', 600, 'pending', { dueDate: '2026-03-10' });
  invoice(db, 'inv-3', 500, 'pending', { dueDate: '2026-03-18' });
  invoice(db, 'inv-4', 3000, 'pending', { date: '2026-03-09', vendorId: 'v-b' });
  deposit(db, 'dep-1', 'inv-4', 400, 'pending', '2026-03-05');
  deposit(db, 'dep-x', 'inv-4', 500, 'paid', '2026-03-01');
  deposit(db, 'dep-r', 'inv-4', 100, 'pending', '2026-03-01', 'refund');
  invoice(db, 'off-1', 2000, 'quotation', { dueDate: '2026-03-12' });
  deposit(db, 'dep-2', 'off-1', 300, 'pending', '2026-03-14');
  invoice(db, 'off-2', 1200, 'quotation', { dueDate: '2026-03-20' });
  invoice(db, 'off-3', 1500, 'quotation', { dueDate: '2026-03-01', date: '2026-02-01' });
  invoice(db, 'off-4', 900, 'quotation');
  invoice(db, 'inv-5', 700, 'pending', { date: '2026-02-08' });
  invoice(db, 'inv-6', 700, 'pending', { date: '2026-02-09' });
  invoice(db, 'inv-7', 200, 'paid', { date: '2025-12-01' });
  invoice(db, 'inv-8', 5000, 'paid');
  invoice(db, 'inv-8b', 500, 'paid');
  invoice(db, 'inv-9', 500, 'pending', { dueDate: '2026-04-30', date: '2026-03-05' });
  invoice(db, 'inv-10', 100.99, 'pending', { dueDate: '2026-05-01', date: '2026-03-05' });
  for (const [id, invoiceId, line, amount] of [
    ['ibl-1', 'inv-8', 'l-loan', 5000],
    ['ibl-2', 'inv-8b', 'l-own', 500],
    ['ibl-3', 'inv-10', 'l-split', 100],
  ] as const) {
    db.insert(schema.invoiceBudgetLines)
      .values({ id, invoiceId, workItemBudgetId: line, itemizedAmount: amount, ...ts })
      .run();
  }

  // ── Purchases ──────────────────────────────────────────────────────────────
  purchase(db, 'hi-1', {
    status: 'purchased',
    isLate: true,
    targetDeliveryDate: '2026-03-05',
    latestDeliveryDate: '2026-03-05',
    vendorId: 'v-b',
    areaId: 'a-2',
  });
  purchase(db, 'hi-2', { status: 'planned', targetDeliveryDate: '2026-03-15' });
  purchase(db, 'hi-3', { status: 'planned', earliestDeliveryDate: '2026-03-17' });
  purchase(db, 'hi-4', { status: 'planned', targetDeliveryDate: '2026-03-18' });
  purchase(db, 'hi-5', {
    status: 'arrived',
    isLate: true,
    targetDeliveryDate: '2026-03-01',
    latestDeliveryDate: '2026-03-01',
  });
  purchase(db, 'hi-6', {
    status: 'purchased',
    targetDeliveryDate: '2026-03-10',
    latestDeliveryDate: '2026-03-01',
    actualDeliveryDate: '2026-03-09',
  });

  // ── Grants ─────────────────────────────────────────────────────────────────
  grant(db, 'gr-1', 'eligible', '2026-03-24');
  grant(db, 'gr-2', 'applied', '2026-03-10');
  grant(db, 'gr-3', 'approved', '2026-03-12');
  grant(db, 'gr-4', 'eligible', '2026-03-09');
  grant(db, 'gr-5', 'eligible', '2026-03-25');

  // ── Diary: defects, drafts, system events, photos ──────────────────────────
  const issue = (id: string, metadata: string | null, o = {}) =>
    diary(db, id, {
      entryType: 'issue',
      entryDate: '2026-03-02',
      title: `Defect ${id}`,
      metadata,
      ...o,
    });
  issue('d-open', JSON.stringify({ severity: 'high', resolutionStatus: 'open' }));
  issue('d-prog', JSON.stringify({ severity: 'low', resolutionStatus: 'in_progress' }));
  issue('d-none', JSON.stringify({ severity: 'medium' }));
  issue('d-resolved', JSON.stringify({ severity: 'high', resolutionStatus: 'resolved' }));
  issue('d-bad', 'not json {');
  issue('d-draft-issue', JSON.stringify({ resolutionStatus: 'open' }), {
    status: 'draft',
    updatedAt: '2026-03-08T10:00:00.000Z',
  });
  issue('d-auto', JSON.stringify({ resolutionStatus: 'open' }), { isAutomatic: true });
  diary(db, 'dr-old', { status: 'draft', updatedAt: '2026-03-08T10:00:00.000Z' });
  diary(db, 'dr-23h', { status: 'draft', updatedAt: '2026-03-09T10:00:00.000Z' });
  diary(db, 'dr-saved', { status: 'saved', updatedAt: '2026-01-01T00:00:00.000Z' });
  diary(db, 'dr-auto', {
    entryType: 'invoice_status',
    status: 'draft',
    isAutomatic: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  for (const [id, areaId] of [
    ['photo-area', 'a-2'],
    ['photo-none', null],
  ] as const) {
    db.insert(schema.photos)
      .values({
        id,
        entityType: 'diary_entry',
        entityId: 'dr-old',
        filename: `${id}.jpg`,
        originalFilename: `${id}.jpg`,
        mimeType: 'image/jpeg',
        fileSize: 1000,
        areaId,
        createdAt: '2026-03-09T12:00:00.000Z',
        updatedAt: '2026-03-09T12:00:00.000Z',
      })
      .run();
  }
}
