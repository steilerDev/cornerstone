/**
 * Performance budget of `getAttention` (#2229): median < 250 ms on a synthetic project about
 * twice a household (~400 tasks in chains, 30 milestones, 400 invoices, 150 purchases, 20 grants,
 * 200 diary entries, 8 sources). Seeded PRNG; the first run is discarded as warm-up.
 *
 * Mutation caught: a per-row query (N+1) or a per-row graph walk that is not bounded by the
 * shared index.
 */

import { describe, it, expect } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { getAttention } from './attentionService.js';

const NOW = new Date('2026-03-10T09:00:00.000Z');
const STAMP = '2026-03-01T00:00:00.000Z';
const ts = { createdAt: STAMP, updatedAt: STAMP };
const BUDGET_MS = 250;

function prng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function day(offset: number): string {
  const d = new Date('2026-03-10T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

describe('getAttention performance', () => {
  it(`median of 7 runs is under ${BUDGET_MS} ms on a synthetic project`, () => {
    const rnd = prng(2229);
    const int = (n: number) => Math.floor(rnd() * n);
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    const db = drizzle(sqlite, { schema });

    db.transaction(() => {
      db.insert(schema.areas)
        .values({ id: 'a-1', name: 'Building', sortOrder: 0, ...ts })
        .run();
      for (let v = 0; v < 10; v++) {
        db.insert(schema.vendors)
          .values({ id: `v-${v}`, name: `Company ${v}`, ...ts })
          .run();
      }
      const statuses = ['not_started', 'in_progress', 'completed'] as const;
      for (let i = 0; i < 400; i++) {
        const status = statuses[int(3)]!;
        const start = day(-20 + int(60));
        db.insert(schema.workItems)
          .values({
            id: `wi-${i}`,
            title: `Task ${i}`,
            status,
            startDate: start,
            endDate: day(-20 + int(60) + 5),
            durationDays: int(10),
            areaId: 'a-1',
            assignedVendorId: `v-${int(10)}`,
            ...ts,
          })
          .run();
        // chains of 10 plus a few cross links
        if (i % 10 !== 0) {
          db.insert(schema.workItemDependencies)
            .values({
              predecessorId: `wi-${i - 1}`,
              successorId: `wi-${i}`,
              dependencyType: 'finish_to_start',
              leadLagDays: 0,
            })
            .run();
        }
      }
      for (let m = 1; m <= 30; m++) {
        db.insert(schema.milestones)
          .values({ id: m, title: `Milestone ${m}`, targetDate: day(-10 + m * 3), ...ts })
          .run();
        db.insert(schema.milestoneWorkItems)
          .values({ milestoneId: m, workItemId: `wi-${(m - 1) * 13}` })
          .run();
        db.insert(schema.workItemMilestoneDeps)
          .values({ workItemId: `wi-${(m - 1) * 13 + 5}`, milestoneId: m })
          .run();
      }
      for (let s = 0; s < 8; s++) {
        db.insert(schema.budgetSources)
          .values({
            id: `src-${s}`,
            name: `Source ${s}`,
            sourceType: (['bank_loan', 'credit_line', 'savings', 'other'] as const)[s % 4]!,
            totalAmount: 50000,
            status: 'active',
            ...ts,
          })
          .run();
      }
      for (let i = 0; i < 400; i++) {
        db.insert(schema.workItemBudgets)
          .values({
            id: `l-${i}`,
            workItemId: `wi-${i}`,
            plannedAmount: 500 + int(5000),
            confidence: 'quote',
            includesVat: true,
            budgetSourceId: `src-${int(8)}`,
            ...ts,
          })
          .run();
      }
      const invStatuses = ['quotation', 'pending', 'pending', 'paid', 'claimed'] as const;
      for (let i = 0; i < 400; i++) {
        db.insert(schema.invoices)
          .values({
            id: `inv-${i}`,
            vendorId: `v-${int(10)}`,
            invoiceNumber: `NR-${i}`,
            amount: 100 + int(9000),
            status: invStatuses[int(5)]!,
            date: day(-60 + int(60)),
            dueDate: rnd() < 0.7 ? day(-20 + int(40)) : null,
            ...ts,
          })
          .run();
        if (rnd() < 0.5) {
          db.insert(schema.invoiceBudgetLines)
            .values({
              id: `ibl-${i}`,
              invoiceId: `inv-${i}`,
              workItemBudgetId: `l-${i}`,
              itemizedAmount: 100,
              ...ts,
            })
            .run();
        }
        if (i % 3 === 0) {
          db.insert(schema.invoiceDeposits)
            .values({
              id: `dep-${i}`,
              invoiceId: `inv-${i}`,
              amount: 50,
              dueDate: day(-10 + int(20)),
              status: (['pending', 'paid'] as const)[int(2)]!,
              ...ts,
            })
            .run();
        }
      }
      for (let i = 0; i < 150; i++) {
        db.insert(schema.householdItems)
          .values({
            id: `hi-${i}`,
            name: `Purchase ${i}`,
            categoryId: 'hic-furniture',
            status: (['planned', 'purchased', 'scheduled', 'arrived'] as const)[int(4)]!,
            targetDeliveryDate: day(-10 + int(30)),
            isLate: rnd() < 0.2,
            vendorId: `v-${int(10)}`,
            ...ts,
          })
          .run();
      }
      for (let i = 0; i < 20; i++) {
        db.insert(schema.subsidyPrograms)
          .values({
            id: `gr-${i}`,
            name: `Grant ${i}`,
            reductionType: 'percentage',
            reductionValue: 10,
            applicationStatus: (['eligible', 'applied', 'approved'] as const)[int(3)]!,
            applicationDeadline: day(-5 + int(30)),
            ...ts,
          })
          .run();
      }
      for (let i = 0; i < 200; i++) {
        const kind = int(3);
        db.insert(schema.diaryEntries)
          .values({
            id: `d-${i}`,
            entryType: kind === 0 ? 'issue' : 'daily_log',
            entryDate: day(-30 + int(30)),
            body: '',
            metadata:
              kind === 0
                ? JSON.stringify({ resolutionStatus: ['open', 'resolved'][int(2)] })
                : null,
            status: kind === 2 ? 'draft' : 'saved',
            isAutomatic: false,
            createdAt: STAMP,
            updatedAt: day(-5 + int(5)) + 'T10:00:00.000Z',
          })
          .run();
      }
    });

    const run = (): number => {
      const t0 = performance.now();
      const res = getAttention(db, {
        userId: 'nobody',
        vatRate: 0.19,
        includeSnoozed: false,
        now: NOW,
      });
      const ms = performance.now() - t0;
      expect(res.rows.length).toBeGreaterThan(20);
      return ms;
    };

    run(); // warm-up
    const times = Array.from({ length: 7 }, run).sort((a, b) => a - b);
    sqlite.close();
    const median = times[3]!;
    expect(median).toBeLessThan(BUDGET_MS);
  });
});
