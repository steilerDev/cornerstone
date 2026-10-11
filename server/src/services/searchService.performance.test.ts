/**
 * Performance budget for the database part of the global search (#2210, AC5):
 * median under 200 ms on a synthetic dataset about twice the realistic household size.
 *
 * Deterministic: a fixed pseudo-random sequence, a single seeding transaction with prepared
 * statements, an in-memory database, and the median of several runs (first run discarded).
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { SEARCH_RESULT_TYPES } from '@cornerstone/shared';
import { runMigrations } from '../db/migrate.js';
import { registerSqlFunctions } from '../db/sqlFunctions.js';
import * as schema from '../db/schema.js';
import { searchDatabase } from './searchService.js';

const BUDGET_MS = 200;
const RUNS = 7;

const WORDS = [
  'Mueller',
  'Müller',
  'Schmidt',
  'Bauer',
  'Fußboden',
  'Strasse',
  'Straße',
  'Köhler',
  'Koehler',
  'Dach',
  'Fenster',
  'Estrich',
  'Putz',
  'Heizung',
  'Garten',
  'Keller',
  'Treppe',
  'Bad',
  'Küche',
  'Kueche',
  'Elektro',
  'Sanitär',
  'Fliesen',
  'Terrasse',
  'Gerüst',
  'Dämmung',
  'Rohbau',
  'Ausbau',
  'Zaun',
  'Tür',
];

describe('searchDatabase performance (AC5)', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let rng = 12345;

  /** Small deterministic LCG so the dataset is identical on every run. */
  function rand(n: number): number {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng % n;
  }

  function words(count: number): string {
    return Array.from({ length: count }, () => WORDS[rand(WORDS.length)]).join(' ');
  }

  function iso(i: number): string {
    return new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString();
  }

  function seed(): void {
    const NOW = iso(0);
    const ts = (i: number) => iso(i % 5000);

    const insTrade = sqlite.prepare('INSERT INTO trades (id, name) VALUES (?, ?)');
    const insArea = sqlite.prepare(
      'INSERT INTO areas (id, name, parent_id, description, created_at, updated_at) VALUES (?,?,?,?,?,?)',
    );
    const insWork = sqlite.prepare(
      `INSERT INTO work_items (id, title, description, status, area_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
    );
    const insHousehold = sqlite.prepare(
      `INSERT INTO household_items (id, name, description, status, area_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
    );
    const insVendor = sqlite.prepare(
      `INSERT INTO vendors (id, name, trade_id, phone, email, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
    );
    const insContact = sqlite.prepare(
      `INSERT INTO vendor_contacts (id, vendor_id, name, phone, email, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
    );
    const insInvoice = sqlite.prepare(
      `INSERT INTO invoices (id, vendor_id, invoice_number, amount, date, status, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    const insWiBudget = sqlite.prepare(
      `INSERT INTO work_item_budgets (id, work_item_id, description, planned_amount, created_at, updated_at)
       VALUES (?,?,?,?,?,?)`,
    );
    const insHiBudget = sqlite.prepare(
      `INSERT INTO household_item_budgets (id, household_item_id, description, planned_amount, created_at, updated_at)
       VALUES (?,?,?,?,?,?)`,
    );
    const insLink = sqlite.prepare(
      `INSERT INTO invoice_budget_lines (id, invoice_id, work_item_budget_id, household_item_budget_id, itemized_amount)
       VALUES (?,?,?,?,?)`,
    );
    const insDiary = sqlite.prepare(
      `INSERT INTO diary_entries (id, entry_type, entry_date, title, body, is_automatic, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    const insMilestone = sqlite.prepare(
      `INSERT INTO milestones (title, description, target_date, created_at, updated_at)
       VALUES (?,?,?,?,?)`,
    );

    sqlite.transaction(() => {
      for (let i = 0; i < 12; i++) insTrade.run(`pt-${i}`, `Perf trade ${i} ${words(1)}`);

      // 160 areas in 3 levels: 10 + 50 + 100
      for (let i = 0; i < 10; i++) insArea.run(`pa-${i}`, words(2), null, words(4), NOW, NOW);
      for (let i = 0; i < 50; i++)
        insArea.run(`pa-m${i}`, words(2), `pa-${i % 10}`, words(4), NOW, NOW);
      for (let i = 0; i < 100; i++)
        insArea.run(`pa-l${i}`, words(2), `pa-m${i % 50}`, words(4), NOW, NOW);

      for (let i = 0; i < 600; i++) {
        insWork.run(
          `pw-${i}`,
          words(3),
          words(12),
          'not_started',
          i % 3 === 0 ? `pa-l${i % 100}` : null,
          NOW,
          ts(i),
        );
      }
      for (let i = 0; i < 300; i++) {
        insHousehold.run(
          `ph-${i}`,
          words(2),
          words(10),
          'planned',
          i % 2 === 0 ? `pa-l${i % 100}` : null,
          NOW,
          ts(i),
        );
      }

      for (let i = 0; i < 120; i++) {
        insVendor.run(
          `pv-${i}`,
          `${words(2)} ${i}`,
          `pt-${i % 12}`,
          `${100 + (i % 800)}-${2000 + i}`,
          `vendor${i}@example.test`,
          NOW,
          ts(i),
        );
      }
      for (let i = 0; i < 300; i++) {
        insContact.run(
          `pc-${i}`,
          `pv-${i % 120}`,
          words(2),
          `${300 + (i % 600)}-${5000 + i}`,
          `contact${i}@example.test`,
          iso(i),
          ts(i),
        );
      }

      for (let i = 0; i < 1000; i++) {
        insInvoice.run(
          `pi-${i}`,
          `pv-${i % 120}`,
          `RE-${2026000 + i}`,
          100 + i,
          '2026-06-01',
          ['pending', 'paid', 'claimed', 'quotation'][i % 4],
          i % 5 === 0 ? words(6) : null,
          NOW,
          ts(i),
        );
      }

      for (let i = 0; i < 2400; i++) {
        insWiBudget.run(`pb-w${i}`, `pw-${i % 600}`, words(3), 10 + i, NOW, ts(i));
      }
      for (let i = 0; i < 600; i++) {
        insHiBudget.run(`pb-h${i}`, `ph-${i % 300}`, words(3), 10 + i, NOW, ts(i));
      }
      for (let i = 0; i < 1500; i++) {
        insLink.run(`pl-${i}`, `pi-${i % 1000}`, `pb-w${i}`, null, 5);
      }

      const body = (n: number) => Array.from({ length: n }, () => words(8)).join('. ');
      for (let i = 0; i < 1600; i++) {
        insDiary.run(
          `pd-${i}`,
          'daily_log',
          '2026-06-01',
          words(3),
          body(16),
          0,
          'saved',
          NOW,
          ts(i),
        );
      }
      for (let i = 0; i < 200; i++) {
        insDiary.run(
          `pd-d${i}`,
          'daily_log',
          '2026-06-01',
          words(3),
          body(16),
          0,
          'draft',
          NOW,
          ts(i),
        );
      }
      for (let i = 0; i < 200; i++) {
        insDiary.run(
          `pd-a${i}`,
          'work_item_status',
          '2026-06-01',
          words(3),
          words(8),
          1,
          'saved',
          NOW,
          ts(i),
        );
      }

      for (let i = 0; i < 80; i++) {
        insMilestone.run(words(3), words(8), '2026-12-01', NOW, ts(i));
      }
    })();
  }

  beforeAll(() => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    sqlite = new Database(':memory:');
    registerSqlFunctions(sqlite);
    runMigrations(sqlite);
    warn.mockRestore();
    sqlite.pragma('foreign_keys = OFF');
    db = drizzle(sqlite, { schema });
    seed();
  });

  afterAll(() => {
    sqlite.close();
  });

  function medianMs(
    q: string,
    limit: number,
    runs = RUNS,
  ): { median: number; all: number[]; total: number } {
    const times: number[] = [];
    let total = 0;
    for (let run = 0; run < runs; run++) {
      const start = performance.now();
      const groups = searchDatabase(db, { q, types: [...SEARCH_RESULT_TYPES], limit });
      times.push(performance.now() - start);
      total = groups.reduce((sum, g) => sum + g.total, 0);
    }
    const measured = (times.length > 1 ? times.slice(1) : times).sort((a, b) => a - b); // discard the first (cold) run
    return { median: measured[Math.floor(measured.length / 2)]!, all: times, total };
  }

  it('seeds the expected dataset size', () => {
    const count = (t: string) =>
      (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
    expect(count('work_items')).toBe(600);
    expect(count('household_items')).toBe(300);
    expect(count('vendors')).toBe(120);
    expect(count('vendor_contacts')).toBe(300);
    expect(count('invoices')).toBe(1000);
    expect(count('work_item_budgets') + count('household_item_budgets')).toBe(3000);
    expect(count('diary_entries')).toBe(2000);
    expect(count('areas')).toBe(160);
    expect(count('milestones')).toBe(80);
  });

  it.each([
    ['a common 2-letter query', 'er'],
    ['an umlaut word', 'müller'],
    ['a phone fragment', '123'],
    ['a query with no match', 'zzzqx'],
  ])('stays within the median budget for %s', (_label, q) => {
    const { median, all, total } = medianMs(q, 5);
    console.warn(
      `search perf "${q}": median ${median.toFixed(1)} ms, runs ${all.map((t) => t.toFixed(1)).join('/')} ms, total hits ${total}`,
    );
    expect(median).toBeLessThan(BUDGET_MS);
  });

  it('returns hits for the matching probes so the timing is meaningful', () => {
    expect(medianMs('er', 5, 1).total).toBeGreaterThan(100);
    expect(medianMs('müller', 5, 1).total).toBeGreaterThan(50);
    expect(medianMs('123', 5, 1).total).toBeGreaterThan(0);
    expect(medianMs('zzzqx', 5, 1).total).toBe(0);
  });

  it('stays within budget at the maximum limit as well', () => {
    const { median } = medianMs('er', 20);
    expect(median).toBeLessThan(BUDGET_MS);
  });
});
