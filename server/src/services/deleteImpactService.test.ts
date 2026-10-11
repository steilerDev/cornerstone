/**
 * Unit tests for deleteImpactService.ts (#2209, contract 19).
 * Every kind of every entity type is seeded with a distinct count, and a parity test per type
 * runs the real delete and asserts the counted rows were really deleted or nulled.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { DELETE_IMPACT_ENTITY_TYPES } from '@cornerstone/shared';
import type { DeleteImpactEffect } from '@cornerstone/shared';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { NotFoundError } from '../errors/AppError.js';
import { getDeleteImpact } from './deleteImpactService.js';
import * as areaService from './areaService.js';
import * as orientationService from './orientationService.js';
import * as vendorService from './vendorService.js';
import * as invoiceService from './invoiceService.js';
import * as subsidyProgramService from './subsidyProgramService.js';
import * as budgetSourceService from './budgetSourceService.js';
import * as milestoneService from './milestoneService.js';
import * as workItemService from './workItemService.js';
import * as householdItemService from './householdItemService.js';
import * as diaryService from './diaryService.js';

describe('deleteImpactService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let tempDir: string;
  let userId: string;
  let seq = 0;

  const NOW = '2026-08-07T10:00:00.000Z';

  /** Insert one row with raw SQL, filling the NOT NULL timestamp columns when the table has them. */
  function ins(table: string, row: Record<string, unknown>): void {
    const cols = (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (c) => c.name,
    );
    const full: Record<string, unknown> = { ...row };
    if (cols.includes('created_at') && full.created_at === undefined) full.created_at = NOW;
    if (cols.includes('updated_at') && full.updated_at === undefined) full.updated_at = NOW;
    const keys = Object.keys(full);
    sqlite
      .prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
      .run(...keys.map((k) => full[k]));
  }

  function id(prefix: string): string {
    return `${prefix}-${++seq}`;
  }

  function count(table: string, where = '1=1', ...params: unknown[]): number {
    return (
      sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...params) as {
        n: number;
      }
    ).n;
  }

  function photo(extra: Record<string, unknown>): string {
    const pid = id('photo');
    ins('photos', {
      id: pid,
      entity_type: 'diary_entry',
      entity_id: 'x',
      filename: `${pid}.jpg`,
      original_filename: 'p.jpg',
      mime_type: 'image/jpeg',
      file_size: 10,
      ...extra,
    });
    return pid;
  }

  function newWorkItem(title = 'Task'): string {
    return workItemService.createWorkItem(db, userId, { title }).id;
  }

  function newHouseholdItem(): string {
    return householdItemService.createHouseholdItem(db, userId, { name: 'Sofa' }, 0.19).id;
  }

  function newVendor(): string {
    const vid = id('vendor');
    ins('vendors', { id: vid, name: vid });
    return vid;
  }

  function newInvoice(vendorId: string): string {
    return invoiceService.createInvoice(
      db,
      vendorId,
      { invoiceNumber: id('INV'), amount: 100, date: '2026-08-01', status: 'pending' },
      userId,
    ).id;
  }

  function wiBudget(workItemId: string, extra: Record<string, unknown> = {}): string {
    const bid = id('wib');
    ins('work_item_budgets', { id: bid, work_item_id: workItemId, planned_amount: 10, ...extra });
    return bid;
  }

  function hiBudget(householdItemId: string, extra: Record<string, unknown> = {}): string {
    const bid = id('hib');
    ins('household_item_budgets', {
      id: bid,
      household_item_id: householdItemId,
      planned_amount: 10,
      ...extra,
    });
    return bid;
  }

  function invoiceLine(invoiceId: string, budget: { wi?: string; hi?: string }): void {
    ins('invoice_budget_lines', {
      id: id('ibl'),
      invoice_id: invoiceId,
      work_item_budget_id: budget.wi ?? null,
      household_item_budget_id: budget.hi ?? null,
      itemized_amount: 5,
    });
  }

  function link(entityType: string, entityId: string, n: number): void {
    for (let i = 0; i < n; i++) {
      ins('document_links', {
        id: id('dl'),
        entity_type: entityType,
        entity_id: entityId,
        paperless_document_id: 1000 + ++seq,
      });
    }
  }

  function milestone(): number {
    return milestoneService.createMilestone(
      db,
      { title: id('M'), targetDate: '2026-09-01' },
      userId,
    ).id;
  }

  function kinds(effects: DeleteImpactEffect[]): Record<string, number> {
    return Object.fromEntries(effects.map((e) => [e.kind, e.count]));
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'delete-impact-test-'));
    sqlite = new Database(join(tempDir, 'test.db'));
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    userId = id('user');
    ins('users', {
      id: userId,
      email: `${userId}@example.com`,
      display_name: 'Tester',
      role: 'member',
      auth_provider: 'local',
      password_hash: 'x',
    });
    seq = 0;
  });

  afterEach(() => {
    sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('area', () => {
    function seedArea() {
      const root = id('area');
      const child = id('area');
      const grandchild = id('area');
      ins('areas', { id: root, name: 'Root' });
      ins('areas', { id: child, name: 'Child', parent_id: root });
      ins('areas', { id: grandchild, name: 'Grandchild', parent_id: child });
      photo({ area_id: root });
      photo({ area_id: child });
      photo({ area_id: child });
      photo({ area_id: null });
      return { root, child, grandchild };
    }

    it('counts descendants (self excluded) and photos in the whole subtree', () => {
      const { root } = seedArea();
      const res = getDeleteImpact(db, 'area', root);
      expect(res).toEqual({
        entityType: 'area',
        id: root,
        effects: [
          { kind: 'childAreas', count: 2 },
          { kind: 'photosLoseArea', count: 3 },
        ],
      });
    });

    it('omits zero counts: a leaf area without photos has no effects', () => {
      const { grandchild } = seedArea();
      expect(getDeleteImpact(db, 'area', grandchild).effects).toEqual([]);
    });

    it('counts only that subtree for a middle node', () => {
      const { child } = seedArea();
      expect(kinds(getDeleteImpact(db, 'area', child).effects)).toEqual({
        childAreas: 1,
        photosLoseArea: 2,
      });
    });

    it('404 for a missing area', () => {
      expect(() => getDeleteImpact(db, 'area', 'nope')).toThrow(NotFoundError);
    });

    it('parity: the real delete removes the counted descendants and nulls the counted photos', () => {
      const { root } = seedArea();
      const impact = kinds(getDeleteImpact(db, 'area', root).effects);
      areaService.deleteArea(db, root);
      expect(count('areas')).toBe(3 - 1 - impact.childAreas!);
      expect(count('photos', 'area_id IS NULL')).toBe(1 + impact.photosLoseArea!);
    });
  });

  describe('orientation', () => {
    it('counts photos with that orientation and 404s for a missing one', () => {
      ins('orientations', { id: 'o1', name: 'North' });
      ins('orientations', { id: 'o2', name: 'South' });
      photo({ orientation_id: 'o1' });
      photo({ orientation_id: 'o1' });
      photo({ orientation_id: 'o2' });
      expect(getDeleteImpact(db, 'orientation', 'o1').effects).toEqual([
        { kind: 'photosLoseOrientation', count: 2 },
      ]);
      expect(getDeleteImpact(db, 'orientation', 'o2').effects).toEqual([
        { kind: 'photosLoseOrientation', count: 1 },
      ]);
      expect(() => getDeleteImpact(db, 'orientation', 'zz')).toThrow(NotFoundError);
    });

    it('omits a zero count', () => {
      ins('orientations', { id: 'o1', name: 'North' });
      expect(getDeleteImpact(db, 'orientation', 'o1').effects).toEqual([]);
    });

    it('parity: the real delete nulls the counted photos', () => {
      ins('orientations', { id: 'o1', name: 'North' });
      photo({ orientation_id: 'o1' });
      photo({ orientation_id: 'o1' });
      const n = getDeleteImpact(db, 'orientation', 'o1').effects[0]!.count;
      orientationService.deleteOrientation(db, 'o1');
      expect(count('photos', 'orientation_id IS NULL')).toBe(n);
    });
  });

  describe('vendor', () => {
    function seedVendor() {
      const v = newVendor();
      const other = newVendor();
      for (let i = 0; i < 2; i++) ins('vendor_contacts', { id: id('vc'), vendor_id: v, name: 'C' });
      ins('vendor_contacts', { id: id('vc'), vendor_id: other, name: 'Other' });
      for (let i = 0; i < 3; i++) {
        const w = newWorkItem();
        sqlite.prepare('UPDATE work_items SET assigned_vendor_id = ? WHERE id = ?').run(v, w);
      }
      const hi = newHouseholdItem();
      sqlite.prepare('UPDATE household_items SET vendor_id = ? WHERE id = ?').run(v, hi);
      for (let i = 0; i < 4; i++) hiBudget(hi, { vendor_id: v });
      hiBudget(hi, { vendor_id: other });
      return { v, other };
    }

    it('counts contacts, tasks, purchases and cost lines in the fixed order', () => {
      const { v } = seedVendor();
      expect(getDeleteImpact(db, 'vendor', v).effects).toEqual([
        { kind: 'contacts', count: 2 },
        { kind: 'tasksUnassigned', count: 3 },
        { kind: 'purchasesUnassigned', count: 1 },
        { kind: 'costLinesUnassigned', count: 4 },
      ]);
    });

    it('does not count rows of another vendor', () => {
      const { other } = seedVendor();
      expect(kinds(getDeleteImpact(db, 'vendor', other).effects)).toEqual({
        contacts: 1,
        costLinesUnassigned: 1,
      });
    });

    it('404 for a missing vendor', () => {
      expect(() => getDeleteImpact(db, 'vendor', 'nope')).toThrow(NotFoundError);
    });

    it('parity: the real delete removes contacts and unassigns tasks, purchases and cost lines', () => {
      const { v } = seedVendor();
      const impact = kinds(getDeleteImpact(db, 'vendor', v).effects);
      vendorService.deleteVendor(db, v);
      expect(count('vendor_contacts')).toBe(1); // only the other vendor's contact is left
      expect(impact.contacts).toBe(2);
      expect(count('work_items', 'assigned_vendor_id IS NULL')).toBe(impact.tasksUnassigned);
      expect(count('household_items', 'vendor_id IS NULL')).toBe(impact.purchasesUnassigned);
      expect(count('household_item_budgets', 'vendor_id IS NULL')).toBe(impact.costLinesUnassigned);
    });
  });

  describe('invoice', () => {
    function seedInvoice() {
      const v = newVendor();
      const inv = newInvoice(v);
      const wi = newWorkItem();
      const hi = newHouseholdItem();
      for (let i = 0; i < 2; i++) {
        ins('invoice_deposits', {
          id: id('dep'),
          invoice_id: inv,
          amount: 10,
          due_date: '2026-09-01',
        });
      }
      invoiceLine(inv, { wi: wiBudget(wi) });
      invoiceLine(inv, { wi: wiBudget(wi) });
      invoiceLine(inv, { hi: hiBudget(hi) });
      link('invoice', inv, 3);
      link('invoice', 'someone-else', 1);
      return { inv, v };
    }

    it('counts progress payments, cost lines and document links in the fixed order', () => {
      const { inv } = seedInvoice();
      expect(getDeleteImpact(db, 'invoice', inv).effects).toEqual([
        { kind: 'progressPayments', count: 2 },
        { kind: 'costLinesUnlinked', count: 3 },
        { kind: 'documentLinks', count: 3 },
      ]);
    });

    it('404 for a missing invoice', () => {
      expect(() => getDeleteImpact(db, 'invoice', 'nope')).toThrow(NotFoundError);
    });

    it('parity: the real delete removes the counted rows', () => {
      const { inv, v } = seedInvoice();
      const impact = kinds(getDeleteImpact(db, 'invoice', inv).effects);
      invoiceService.deleteInvoice(db, v, inv);
      expect(impact).toEqual({ progressPayments: 2, costLinesUnlinked: 3, documentLinks: 3 });
      expect(count('invoice_deposits', 'invoice_id = ?', inv)).toBe(0);
      expect(count('invoice_budget_lines', 'invoice_id = ?', inv)).toBe(0);
      expect(count('document_links', "entity_type = 'invoice' AND entity_id = ?", inv)).toBe(0);
      expect(count('document_links')).toBe(1);
    });
  });

  describe('subsidy_program', () => {
    function seedSubsidy() {
      const s = subsidyProgramService.createSubsidyProgram(
        db,
        { name: 'Grant', reductionType: 'percentage', reductionValue: 10 },
        userId,
      ).id;
      for (let i = 0; i < 2; i++) {
        ins('household_item_subsidies', {
          household_item_id: newHouseholdItem(),
          subsidy_program_id: s,
        });
      }
      link('subsidy_program', s, 3);
      return s;
    }

    it('counts linked purchases and document links', () => {
      const s = seedSubsidy();
      expect(getDeleteImpact(db, 'subsidy_program', s).effects).toEqual([
        { kind: 'purchasesUnlinked', count: 2 },
        { kind: 'documentLinks', count: 3 },
      ]);
    });

    it('does not count work-item links (they block the delete instead)', () => {
      const s = seedSubsidy();
      ins('work_item_subsidies', { work_item_id: newWorkItem(), subsidy_program_id: s });
      expect(kinds(getDeleteImpact(db, 'subsidy_program', s).effects)).toEqual({
        purchasesUnlinked: 2,
        documentLinks: 3,
      });
    });

    it('404 for a missing program', () => {
      expect(() => getDeleteImpact(db, 'subsidy_program', 'nope')).toThrow(NotFoundError);
    });

    it('parity: the real delete removes the counted junction rows and links', () => {
      const s = seedSubsidy();
      subsidyProgramService.deleteSubsidyProgram(db, s);
      expect(count('household_item_subsidies')).toBe(0);
      expect(count('document_links')).toBe(0);
    });
  });

  describe('budget_source', () => {
    function seedSource() {
      const b = id('src');
      ins('budget_sources', { id: b, name: 'Bank', source_type: 'bank_loan', total_amount: 1000 });
      const inv = newInvoice(newVendor());
      for (let i = 0; i < 2; i++) {
        ins('invoice_deposits', {
          id: id('dep'),
          invoice_id: inv,
          amount: 10,
          due_date: '2026-09-01',
          budget_source_id: b,
        });
      }
      ins('invoice_deposits', {
        id: id('dep'),
        invoice_id: inv,
        amount: 10,
        due_date: '2026-09-01',
        budget_source_id: null,
      });
      link('budget_source', b, 1);
      return b;
    }

    it('counts progress payments and document links', () => {
      const b = seedSource();
      expect(getDeleteImpact(db, 'budget_source', b).effects).toEqual([
        { kind: 'progressPaymentsUnassigned', count: 2 },
        { kind: 'documentLinks', count: 1 },
      ]);
    });

    it('404 for a missing source', () => {
      expect(() => getDeleteImpact(db, 'budget_source', 'nope')).toThrow(NotFoundError);
    });

    it('parity: the real delete unassigns the counted payments and removes the links', () => {
      const b = seedSource();
      budgetSourceService.deleteBudgetSource(db, b);
      expect(count('invoice_deposits', 'budget_source_id IS NULL')).toBe(3);
      expect(count('document_links')).toBe(0);
    });
  });

  describe('milestone', () => {
    function seedMilestone() {
      const m = milestone();
      const other = milestone();
      for (let i = 0; i < 2; i++)
        ins('milestone_work_items', { milestone_id: m, work_item_id: newWorkItem() });
      for (let i = 0; i < 3; i++)
        ins('work_item_milestone_deps', { milestone_id: m, work_item_id: newWorkItem() });
      ins('household_item_deps', {
        household_item_id: newHouseholdItem(),
        predecessor_type: 'milestone',
        predecessor_id: String(m),
      });
      // decoys: another milestone and a work-item predecessor with the same id string
      ins('milestone_work_items', { milestone_id: other, work_item_id: newWorkItem() });
      ins('household_item_deps', {
        household_item_id: newHouseholdItem(),
        predecessor_type: 'work_item',
        predecessor_id: String(m),
      });
      return m;
    }

    it('counts linked tasks, waits and purchase dependencies in the fixed order', () => {
      const m = seedMilestone();
      expect(getDeleteImpact(db, 'milestone', String(m)).effects).toEqual([
        { kind: 'tasksUnlinked', count: 2 },
        { kind: 'dependencies', count: 3 },
        { kind: 'purchaseDependencies', count: 1 },
      ]);
    });

    it('404 for a missing milestone and for a non-integer id', () => {
      expect(() => getDeleteImpact(db, 'milestone', '9999')).toThrow(NotFoundError);
      expect(() => getDeleteImpact(db, 'milestone', 'abc')).toThrow(NotFoundError);
      expect(() => getDeleteImpact(db, 'milestone', '1.5')).toThrow(NotFoundError);
    });

    it('parity: the real delete removes the counted links and dependencies', () => {
      const m = seedMilestone();
      milestoneService.deleteMilestone(db, m);
      expect(count('milestone_work_items', 'milestone_id = ?', m)).toBe(0);
      expect(count('work_item_milestone_deps', 'milestone_id = ?', m)).toBe(0);
      expect(
        count(
          'household_item_deps',
          "predecessor_type = 'milestone' AND predecessor_id = ?",
          String(m),
        ),
      ).toBe(0);
      // the decoy work-item predecessor row is untouched
      expect(count('household_item_deps')).toBe(1);
    });
  });

  describe('work_item', () => {
    function seedWorkItem() {
      const w = newWorkItem();
      const other = newWorkItem();
      const b1 = wiBudget(w);
      wiBudget(w);
      wiBudget(other);
      const inv = newInvoice(newVendor());
      invoiceLine(inv, { wi: b1 });
      for (let i = 0; i < 3; i++)
        ins('work_item_subtasks', { id: id('st'), work_item_id: w, title: 'S' });
      for (let i = 0; i < 2; i++)
        ins('work_item_notes', { id: id('n'), work_item_id: w, content: 'N' });
      ins('work_item_dependencies', { predecessor_id: w, successor_id: newWorkItem() });
      ins('work_item_dependencies', { predecessor_id: newWorkItem(), successor_id: w });
      ins('work_item_dependencies', { predecessor_id: other, successor_id: newWorkItem() });
      ins('milestone_work_items', { milestone_id: milestone(), work_item_id: w });
      for (let i = 0; i < 2; i++)
        ins('work_item_milestone_deps', { milestone_id: milestone(), work_item_id: w });
      ins('household_item_deps', {
        household_item_id: newHouseholdItem(),
        predecessor_type: 'work_item',
        predecessor_id: w,
      });
      ins('work_item_subsidies', {
        work_item_id: w,
        subsidy_program_id: subsidyProgramService.createSubsidyProgram(
          db,
          { name: id('G'), reductionType: 'fixed', reductionValue: 5 },
          userId,
        ).id,
      });
      link('work_item', w, 2);
      return { w, other };
    }

    it('counts every cascade kind in the fixed order', () => {
      const { w } = seedWorkItem();
      expect(getDeleteImpact(db, 'work_item', w).effects).toEqual([
        { kind: 'costLines', count: 2 },
        { kind: 'invoiceLinks', count: 1 },
        { kind: 'subtasks', count: 3 },
        { kind: 'notes', count: 2 },
        { kind: 'taskDependencies', count: 2 },
        { kind: 'milestoneLinks', count: 1 },
        { kind: 'milestoneWaits', count: 2 },
        { kind: 'purchaseDependencies', count: 1 },
        { kind: 'grantLinks', count: 1 },
        { kind: 'documentLinks', count: 2 },
      ]);
    });

    it('counts a dependency where the item is only the successor', () => {
      const a = newWorkItem();
      ins('work_item_dependencies', { predecessor_id: newWorkItem(), successor_id: a });
      expect(getDeleteImpact(db, 'work_item', a).effects).toEqual([
        { kind: 'taskDependencies', count: 1 },
      ]);
    });

    it('a bare work item has no effects', () => {
      expect(getDeleteImpact(db, 'work_item', newWorkItem()).effects).toEqual([]);
    });

    it('404 for a missing work item', () => {
      expect(() => getDeleteImpact(db, 'work_item', 'nope')).toThrow(NotFoundError);
    });

    it('parity: the real delete removes every counted row', () => {
      const { w } = seedWorkItem();
      const before = kinds(getDeleteImpact(db, 'work_item', w).effects);
      workItemService.deleteWorkItem(db, w);
      expect(before.costLines).toBe(2);
      expect(count('work_item_budgets', 'work_item_id = ?', w)).toBe(0);
      expect(count('invoice_budget_lines', 'work_item_budget_id IS NOT NULL')).toBe(0);
      expect(count('work_item_subtasks', 'work_item_id = ?', w)).toBe(0);
      expect(count('work_item_notes', 'work_item_id = ?', w)).toBe(0);
      expect(count('work_item_dependencies', 'predecessor_id = ? OR successor_id = ?', w, w)).toBe(
        0,
      );
      expect(count('milestone_work_items', 'work_item_id = ?', w)).toBe(0);
      expect(count('work_item_milestone_deps', 'work_item_id = ?', w)).toBe(0);
      expect(
        count('household_item_deps', "predecessor_type = 'work_item' AND predecessor_id = ?", w),
      ).toBe(0);
      expect(count('work_item_subsidies', 'work_item_id = ?', w)).toBe(0);
      expect(count('document_links', "entity_type = 'work_item' AND entity_id = ?", w)).toBe(0);
    });
  });

  describe('household_item', () => {
    function seedHousehold() {
      const h = newHouseholdItem();
      const b1 = hiBudget(h);
      hiBudget(h);
      invoiceLine(newInvoice(newVendor()), { hi: b1 });
      for (let i = 0; i < 3; i++)
        ins('household_item_notes', { id: id('hn'), household_item_id: h, content: 'N' });
      ins('household_item_deps', {
        household_item_id: h,
        predecessor_type: 'work_item',
        predecessor_id: newWorkItem(),
      });
      ins('household_item_deps', {
        household_item_id: h,
        predecessor_type: 'milestone',
        predecessor_id: String(milestone()),
      });
      ins('household_item_subsidies', {
        household_item_id: h,
        subsidy_program_id: subsidyProgramService.createSubsidyProgram(
          db,
          { name: id('G'), reductionType: 'fixed', reductionValue: 5 },
          userId,
        ).id,
      });
      link('household_item', h, 1);
      return h;
    }

    it('counts every cascade kind in the fixed order', () => {
      const h = seedHousehold();
      expect(getDeleteImpact(db, 'household_item', h).effects).toEqual([
        { kind: 'costLines', count: 2 },
        { kind: 'invoiceLinks', count: 1 },
        { kind: 'notes', count: 3 },
        { kind: 'taskDependencies', count: 2 },
        { kind: 'grantLinks', count: 1 },
        { kind: 'documentLinks', count: 1 },
      ]);
    });

    it('404 for a missing household item', () => {
      expect(() => getDeleteImpact(db, 'household_item', 'nope')).toThrow(NotFoundError);
    });

    it('parity: the real delete removes every counted row', () => {
      const h = seedHousehold();
      householdItemService.deleteHouseholdItem(db, h);
      expect(count('household_item_budgets', 'household_item_id = ?', h)).toBe(0);
      expect(count('invoice_budget_lines', 'household_item_budget_id IS NOT NULL')).toBe(0);
      expect(count('household_item_notes', 'household_item_id = ?', h)).toBe(0);
      expect(count('household_item_deps', 'household_item_id = ?', h)).toBe(0);
      expect(count('household_item_subsidies', 'household_item_id = ?', h)).toBe(0);
      expect(count('document_links', "entity_type = 'household_item' AND entity_id = ?", h)).toBe(
        0,
      );
    });
  });

  describe('diary_entry', () => {
    function seedDiary() {
      const d = diaryService.createDiaryEntry(db, userId, {
        entryType: 'daily_log',
        entryDate: '2026-08-01',
        body: 'Poured concrete',
      }).id;
      photo({ entity_type: 'diary_entry', entity_id: d });
      photo({ entity_type: 'diary_entry', entity_id: d });
      photo({ entity_type: 'work_item', entity_id: d });
      return d;
    }

    it("counts only that entry's diary photos", () => {
      const d = seedDiary();
      expect(getDeleteImpact(db, 'diary_entry', d).effects).toEqual([{ kind: 'photos', count: 2 }]);
    });

    it('404 for a missing entry', () => {
      expect(() => getDeleteImpact(db, 'diary_entry', 'nope')).toThrow(NotFoundError);
    });

    it('parity: the real delete removes the counted photos', async () => {
      const d = seedDiary();
      await diaryService.deleteDiaryEntry(db, d, join(tempDir, 'photos'));
      expect(count('photos', "entity_type = 'diary_entry' AND entity_id = ?", d)).toBe(0);
      expect(count('photos')).toBe(1);
    });
  });

  it('covers every whitelisted entity type with a case above', () => {
    expect(new Set(DELETE_IMPACT_ENTITY_TYPES)).toEqual(
      new Set([
        'area',
        'orientation',
        'vendor',
        'invoice',
        'subsidy_program',
        'budget_source',
        'milestone',
        'work_item',
        'household_item',
        'diary_entry',
      ]),
    );
  });
});
