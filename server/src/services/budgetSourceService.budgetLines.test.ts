/**
 * Unit tests for budgetSourceService.getBudgetSourceBudgetLines()
 * and its private helpers: buildWorkItemBudgetLine, buildHouseholdItemBudgetLine,
 * getWorkItemLineInvoiceData, getHouseholdItemLineInvoiceData,
 * getWorkItemLineInvoiceLink, getHouseholdItemLineInvoiceLink, compareBudgetSourceLines.
 *
 * Uses an in-memory SQLite database via buildApp() + full migration stack.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../app.js';
import { getBudgetSourceBudgetLines } from './budgetSourceService.js';
import * as userService from './userService.js';
import type { FastifyInstance } from 'fastify';
import type { BudgetSourceBudgetLinesResponse } from '@cornerstone/shared';
import {
  budgetSources,
  workItems,
  workItemBudgets,
  householdItems,
  householdItemBudgets,
  invoices,
  invoiceBudgetLines,
  vendors,
  budgetCategories,
  areas,
} from '../db/schema.js';

describe('budgetSourceService.getBudgetSourceBudgetLines()', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  // Counter to ensure unique IDs across tests
  let counter = 0;
  const uid = (prefix: string) => `${prefix}-${++counter}`;

  const now = () => new Date().toISOString();
  const nowTs = () => now();

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-bsbl-svc-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function createSource(name = 'Test Source', totalAmount = 100_000): string {
    const id = uid('src');
    const ts = nowTs();
    app.db
      .insert(budgetSources)
      .values({
        id,
        name,
        sourceType: 'bank_loan',
        totalAmount,
        interestRate: null,
        terms: null,
        notes: null,
        status: 'active',
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createArea(name: string, color = '#ff0000', parentId: string | null = null): string {
    const id = uid('area');
    const ts = nowTs();
    app.db
      .insert(areas)
      .values({
        id,
        name,
        color,
        parentId,
        description: null,
        sortOrder: 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createVendor(name = 'Test Vendor'): string {
    const id = uid('vnd');
    const ts = nowTs();
    app.db.insert(vendors).values({ id, name, createdAt: ts, updatedAt: ts }).run();
    return id;
  }

  function createBudgetCategory(name = 'Test Category'): string {
    const id = uid('bcat');
    const ts = nowTs();
    app.db
      .insert(budgetCategories)
      .values({ id, name, sortOrder: 0, createdAt: ts, updatedAt: ts })
      .run();
    return id;
  }

  function createWorkItem(areaId?: string | null, title = 'Test Work Item'): string {
    const id = uid('wi');
    const ts = nowTs();
    app.db
      .insert(workItems)
      .values({
        id,
        title,
        status: 'not_started',
        areaId: areaId ?? null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createWorkItemBudgetLine(
    workItemId: string,
    sourceId: string | null,
    opts: {
      plannedAmount?: number;
      confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
      budgetCategoryId?: string | null;
      vendorId?: string | null;
      createdBy?: string | null;
      createdAt?: string;
    } = {},
  ): string {
    const id = uid('wib');
    const ts = opts.createdAt ?? nowTs();
    app.db
      .insert(workItemBudgets)
      .values({
        id,
        workItemId,
        budgetSourceId: sourceId,
        plannedAmount: opts.plannedAmount ?? 1000,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: opts.budgetCategoryId ?? null,
        vendorId: opts.vendorId ?? null,
        createdBy: opts.createdBy ?? null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createHouseholdItem(areaId?: string | null, name = 'Test HI'): string {
    const id = uid('hi');
    const ts = nowTs();
    app.db
      .insert(householdItems)
      .values({
        id,
        name,
        categoryId: 'hic-furniture', // seeded by migration 0016
        status: 'planned',
        areaId: areaId ?? null,
        quantity: 1,
        isLate: false,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createHouseholdItemBudgetLine(
    householdItemId: string,
    sourceId: string | null,
    opts: {
      plannedAmount?: number;
      confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
      budgetCategoryId?: string | null;
      vendorId?: string | null;
      createdBy?: string | null;
      createdAt?: string;
    } = {},
  ): string {
    const id = uid('hib');
    const ts = opts.createdAt ?? nowTs();
    app.db
      .insert(householdItemBudgets)
      .values({
        id,
        householdItemId,
        budgetSourceId: sourceId,
        plannedAmount: opts.plannedAmount ?? 1000,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: opts.budgetCategoryId ?? null,
        vendorId: opts.vendorId ?? null,
        createdBy: opts.createdBy ?? null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createInvoice(
    vendorId: string,
    status: 'pending' | 'paid' | 'claimed' | 'quotation',
    amount = 500,
  ): string {
    const id = uid('inv');
    const ts = nowTs();
    app.db
      .insert(invoices)
      .values({
        id,
        vendorId,
        amount,
        date: '2026-01-15',
        status,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function linkInvoiceToWorkItemBudget(
    invoiceId: string,
    workItemBudgetId: string,
    itemizedAmount: number,
  ): string {
    const id = randomUUID();
    const ts = nowTs();
    app.db
      .insert(invoiceBudgetLines)
      .values({
        id,
        invoiceId,
        workItemBudgetId,
        householdItemBudgetId: null,
        itemizedAmount,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function linkInvoiceToHouseholdItemBudget(
    invoiceId: string,
    householdItemBudgetId: string,
    itemizedAmount: number,
  ): string {
    const id = randomUUID();
    const ts = nowTs();
    app.db
      .insert(invoiceBudgetLines)
      .values({
        id,
        invoiceId,
        workItemBudgetId: null,
        householdItemBudgetId,
        itemizedAmount,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  // ─── Tests ───────────────────────────────────────────────────────────────────

  // 1. Source not found → throws NotFoundError
  it('throws NotFoundError when source does not exist', () => {
    expect(() => getBudgetSourceBudgetLines(app.db, 'nonexistent-src-id')).toThrow(
      'Budget source not found',
    );
  });

  // 2. Empty source → empty arrays
  it('returns empty arrays when source has no budget lines', () => {
    const sourceId = createSource('Empty Source');

    const result = getBudgetSourceBudgetLines(app.db, sourceId);

    expect(result.workItemLines).toEqual([]);
    expect(result.householdItemLines).toEqual([]);
  });

  // 3. Work item line, no invoice → zero aggregates, no invoiceLink
  it('work item line with no invoice: hasClaimedInvoice=false, all amounts zero, invoiceLink=null', () => {
    const sourceId = createSource();
    const wiId = createWorkItem();
    createWorkItemBudgetLine(wiId, sourceId, { plannedAmount: 5000 });

    const result: BudgetSourceBudgetLinesResponse = getBudgetSourceBudgetLines(app.db, sourceId);

    expect(result.workItemLines).toHaveLength(1);
    const line = result.workItemLines[0];
    expect(line.hasClaimedInvoice).toBe(false);
    expect(line.actualCost).toBe(0);
    expect(line.actualCostPaid).toBe(0);
    expect(line.invoiceCount).toBe(0);
    expect(line.invoiceLink).toBeNull();
    expect(line.plannedAmount).toBe(5000);
  });

  // 4. Work item line, claimed invoice linked → hasClaimedInvoice=true, actualCost, invoiceLink with status 'claimed'
  it('work item line with claimed invoice: hasClaimedInvoice=true, actualCost === itemizedAmount, invoiceCount=1, invoiceLink populated', () => {
    const sourceId = createSource();
    const vendorId = createVendor();
    const wiId = createWorkItem();
    const lineId = createWorkItemBudgetLine(wiId, sourceId, { plannedAmount: 2000 });
    const invoiceId = createInvoice(vendorId, 'claimed', 1500);
    linkInvoiceToWorkItemBudget(invoiceId, lineId, 1500);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);

    expect(result.workItemLines).toHaveLength(1);
    const line = result.workItemLines[0];
    expect(line.hasClaimedInvoice).toBe(true);
    expect(line.actualCost).toBe(1500);
    expect(line.actualCostPaid).toBe(1500); // claimed counts as paid
    expect(line.invoiceCount).toBe(1);
    expect(line.invoiceLink).not.toBeNull();
    expect(line.invoiceLink?.invoiceStatus).toBe('claimed');
    expect(line.invoiceLink?.itemizedAmount).toBe(1500);
    expect(line.invoiceLink?.invoiceId).toBe(invoiceId);
  });

  // 5. Work item line, paid invoice → hasClaimedInvoice=false, actualCostPaid > 0
  it('work item line with paid invoice: hasClaimedInvoice=false, actualCostPaid > 0', () => {
    const sourceId = createSource();
    const vendorId = createVendor();
    const wiId = createWorkItem();
    const lineId = createWorkItemBudgetLine(wiId, sourceId, { plannedAmount: 2000 });
    const invoiceId = createInvoice(vendorId, 'paid', 800);
    linkInvoiceToWorkItemBudget(invoiceId, lineId, 800);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const line = result.workItemLines[0];

    expect(line.hasClaimedInvoice).toBe(false);
    expect(line.actualCostPaid).toBe(800);
    expect(line.actualCost).toBe(800);
    expect(line.invoiceLink?.invoiceStatus).toBe('paid');
  });

  // 6. Work item line, pending invoice → hasClaimedInvoice=false, actualCostPaid=0
  it('work item line with pending invoice: hasClaimedInvoice=false, actualCostPaid=0, actualCost>0', () => {
    const sourceId = createSource();
    const vendorId = createVendor();
    const wiId = createWorkItem();
    const lineId = createWorkItemBudgetLine(wiId, sourceId, { plannedAmount: 2000 });
    const invoiceId = createInvoice(vendorId, 'pending', 600);
    linkInvoiceToWorkItemBudget(invoiceId, lineId, 600);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const line = result.workItemLines[0];

    // pending does not count as paid
    expect(line.hasClaimedInvoice).toBe(false);
    expect(line.actualCostPaid).toBe(0);
    // pending invoice still contributes to actualCost (all statuses sum)
    expect(line.actualCost).toBe(600);
  });

  // 7. Work item line, quotation invoice → hasClaimedInvoice=false
  it('work item line with quotation invoice: hasClaimedInvoice=false, actualCostPaid=0', () => {
    const sourceId = createSource();
    const vendorId = createVendor();
    const wiId = createWorkItem();
    const lineId = createWorkItemBudgetLine(wiId, sourceId, { plannedAmount: 3000 });
    const invoiceId = createInvoice(vendorId, 'quotation', 900);
    linkInvoiceToWorkItemBudget(invoiceId, lineId, 900);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const line = result.workItemLines[0];

    expect(line.hasClaimedInvoice).toBe(false);
    expect(line.actualCostPaid).toBe(0);
  });

  // 8. Work item with area → area populated
  it('work item line with area: area field is populated with id, name, color', () => {
    const sourceId = createSource();
    const areaId = createArea('Kitchen', '#aabbcc');
    const wiId = createWorkItem(areaId);
    createWorkItemBudgetLine(wiId, sourceId);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const line = result.workItemLines[0];

    expect(line.area).not.toBeNull();
    expect(line.area?.id).toBe(areaId);
    expect(line.area?.name).toBe('Kitchen');
    expect(line.area?.color).toBe('#aabbcc');
  });

  // 9. Work item with no area (areaId null) → area: null
  it('work item line with no area: area is null', () => {
    const sourceId = createSource();
    const wiId = createWorkItem(null);
    createWorkItemBudgetLine(wiId, sourceId);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const line = result.workItemLines[0];

    expect(line.area).toBeNull();
  });

  // 10. Household item line → appears in householdItemLines, correct parentId and parentName
  it('household item line appears in householdItemLines with correct parentId and parentName', () => {
    const sourceId = createSource();
    const hiId = createHouseholdItem(null, 'My Couch');
    createHouseholdItemBudgetLine(hiId, sourceId, { plannedAmount: 1200 });

    const result = getBudgetSourceBudgetLines(app.db, sourceId);

    expect(result.workItemLines).toHaveLength(0);
    expect(result.householdItemLines).toHaveLength(1);
    const line = result.householdItemLines[0];
    expect(line.parentId).toBe(hiId);
    expect(line.parentName).toBe('My Couch');
    expect(line.plannedAmount).toBe(1200);
  });

  // 11. Household item with area populated
  it('household item line with area: area field is populated', () => {
    const sourceId = createSource();
    const areaId = createArea('Living Room', '#00ff00');
    const hiId = createHouseholdItem(areaId, 'Sofa');
    createHouseholdItemBudgetLine(hiId, sourceId);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const line = result.householdItemLines[0];

    expect(line.area).not.toBeNull();
    expect(line.area?.id).toBe(areaId);
    expect(line.area?.name).toBe('Living Room');
    expect(line.area?.color).toBe('#00ff00');
  });

  // 12. Mixed source: one WI line + one HI line → both present in respective arrays
  it('mixed source: work item and household item lines both present in their respective arrays', () => {
    const sourceId = createSource();
    const wiId = createWorkItem();
    createWorkItemBudgetLine(wiId, sourceId, { plannedAmount: 500 });
    const hiId = createHouseholdItem();
    createHouseholdItemBudgetLine(hiId, sourceId, { plannedAmount: 300 });

    const result = getBudgetSourceBudgetLines(app.db, sourceId);

    expect(result.workItemLines).toHaveLength(1);
    expect(result.householdItemLines).toHaveLength(1);
  });

  // 13. Sorting by area name: nulls last
  it('sorting: work item lines sorted by area name (nulls last)', () => {
    const sourceId = createSource();
    const areaZebra = createArea('Zebra');
    const areaAlpha = createArea('Alpha');

    // Insert in reverse alphabetical order to test sorting
    const wiZebra = createWorkItem(areaZebra, 'Zebra WI');
    createWorkItemBudgetLine(wiZebra, sourceId);

    const wiNull = createWorkItem(null, 'Null Area WI');
    createWorkItemBudgetLine(wiNull, sourceId);

    const wiAlpha = createWorkItem(areaAlpha, 'Alpha WI');
    createWorkItemBudgetLine(wiAlpha, sourceId);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const lines = result.workItemLines;

    expect(lines).toHaveLength(3);
    expect(lines[0].area?.name).toBe('Alpha');
    expect(lines[1].area?.name).toBe('Zebra');
    expect(lines[2].area).toBeNull(); // null last
  });

  // 14. Sorting: two lines in same area → sorted by parentName
  it('sorting: two lines in same area sorted by parentName ascending', () => {
    const sourceId = createSource();
    const areaId = createArea('Bathroom');

    const wiBath = createWorkItem(areaId, 'Bathroom fixtures');
    createWorkItemBudgetLine(wiBath, sourceId);

    const wiAttic = createWorkItem(areaId, 'Attic insulation');
    createWorkItemBudgetLine(wiAttic, sourceId);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const lines = result.workItemLines;

    expect(lines[0].parentName).toBe('Attic insulation');
    expect(lines[1].parentName).toBe('Bathroom fixtures');
  });

  // 15. Sorting: two lines on same work item (same parentName) → earlier createdAt first
  it('sorting: two lines on same work item sorted by createdAt ascending', () => {
    const sourceId = createSource();
    const wiId = createWorkItem(null, 'Shared Work Item');

    // Insert older line first
    const olderTs = '2026-01-01T00:00:00.000Z';
    const newerTs = '2026-06-01T00:00:00.000Z';

    createWorkItemBudgetLine(wiId, sourceId, { plannedAmount: 100, createdAt: olderTs });
    createWorkItemBudgetLine(wiId, sourceId, { plannedAmount: 200, createdAt: newerTs });

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const lines = result.workItemLines;

    expect(lines).toHaveLength(2);
    expect(lines[0].createdAt).toBe(olderTs);
    expect(lines[1].createdAt).toBe(newerTs);
  });

  // 16. Lines from a different source are excluded
  it('lines from a different source are not included in results', () => {
    const sourceA = createSource('Source A');
    const sourceB = createSource('Source B');

    const wiA = createWorkItem(null, 'WI for Source A');
    createWorkItemBudgetLine(wiA, sourceA, { plannedAmount: 1000 });

    const wiB = createWorkItem(null, 'WI for Source B');
    createWorkItemBudgetLine(wiB, sourceB, { plannedAmount: 2000 });

    const resultA = getBudgetSourceBudgetLines(app.db, sourceA);
    expect(resultA.workItemLines).toHaveLength(1);
    expect(resultA.workItemLines[0].parentName).toBe('WI for Source A');

    const resultB = getBudgetSourceBudgetLines(app.db, sourceB);
    expect(resultB.workItemLines).toHaveLength(1);
    expect(resultB.workItemLines[0].parentName).toBe('WI for Source B');
  });

  // 17. parentName matches work item title
  it('parentName matches work item title', () => {
    const sourceId = createSource();
    const wiId = createWorkItem(null, 'Flooring Installation');
    createWorkItemBudgetLine(wiId, sourceId);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    expect(result.workItemLines[0].parentName).toBe('Flooring Installation');
  });

  // 18. parentName matches household item name
  it('parentName matches household item name', () => {
    const sourceId = createSource();
    const hiId = createHouseholdItem(null, 'Dining Table');
    createHouseholdItemBudgetLine(hiId, sourceId);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    expect(result.householdItemLines[0].parentName).toBe('Dining Table');
  });

  // 19. budgetCategory and vendor populated when IDs set
  it('budgetCategory and vendor are populated when IDs are set on the budget line', () => {
    const sourceId = createSource();
    const vendorId = createVendor('Acme Corp');
    const catId = createBudgetCategory('Electrical');
    const wiId = createWorkItem();
    createWorkItemBudgetLine(wiId, sourceId, {
      budgetCategoryId: catId,
      vendorId,
    });

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const line = result.workItemLines[0];

    expect(line.vendor).not.toBeNull();
    expect(line.vendor?.name).toBe('Acme Corp');
    expect(line.budgetCategory).not.toBeNull();
    expect(line.budgetCategory?.name).toBe('Electrical');
  });

  // 20. createdBy populated when user exists
  it('createdBy is populated when the user exists', async () => {
    const sourceId = createSource();
    const user = await userService.createLocalUser(
      app.db,
      'creator@example.com',
      'Creator User',
      'password',
      'member',
    );
    const wiId = createWorkItem();
    createWorkItemBudgetLine(wiId, sourceId, { createdBy: user.id });

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const line = result.workItemLines[0];

    expect(line.createdBy).not.toBeNull();
    expect(line.createdBy?.id).toBe(user.id);
    expect(line.createdBy?.displayName).toBe('Creator User');
  });

  // Extra: budgetSource field is populated on returned line (self-referential)
  it('budgetSource summary is populated on the returned line', () => {
    const sourceId = createSource('My Source');
    const wiId = createWorkItem();
    createWorkItemBudgetLine(wiId, sourceId);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const line = result.workItemLines[0];

    expect(line.budgetSource).not.toBeNull();
    expect(line.budgetSource?.id).toBe(sourceId);
    expect(line.budgetSource?.name).toBe('My Source');
  });

  // Extra: household item line invoice data (claimed)
  it('household item line with claimed invoice: hasClaimedInvoice=true', () => {
    const sourceId = createSource();
    const vendorId = createVendor();
    const hiId = createHouseholdItem();
    const lineId = createHouseholdItemBudgetLine(hiId, sourceId, { plannedAmount: 400 });
    const invoiceId = createInvoice(vendorId, 'claimed', 350);
    linkInvoiceToHouseholdItemBudget(invoiceId, lineId, 350);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const line = result.householdItemLines[0];

    expect(line.hasClaimedInvoice).toBe(true);
    expect(line.actualCost).toBe(350);
    expect(line.actualCostPaid).toBe(350);
    expect(line.invoiceLink).not.toBeNull();
    expect(line.invoiceLink?.invoiceStatus).toBe('claimed');
  });

  // Extra: parentId matches work item id
  it('parentId on work item line matches the work item id', () => {
    const sourceId = createSource();
    const wiId = createWorkItem();
    createWorkItemBudgetLine(wiId, sourceId);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    expect(result.workItemLines[0].parentId).toBe(wiId);
  });

  // Extra: parentId on household item line matches household item id
  it('parentId on household item line matches the household item id', () => {
    const sourceId = createSource();
    const hiId = createHouseholdItem();
    createHouseholdItemBudgetLine(hiId, sourceId);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    expect(result.householdItemLines[0].parentId).toBe(hiId);
  });

  // Area ancestors: root-level area has empty ancestor chain
  it('area ancestors: root-level area has empty ancestor chain', () => {
    const sourceId = createSource();
    const rootArea = createArea('Kitchen', '#aabbcc');
    const wiId = createWorkItem(rootArea);
    createWorkItemBudgetLine(wiId, sourceId);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const line = result.workItemLines[0];

    expect(line.area).not.toBeNull();
    expect(line.area?.id).toBe(rootArea);
    expect(line.area?.ancestors).toEqual([]);
  });

  // Area ancestors: 2-level hierarchy (Parent -> Child)
  it('area ancestors: 2-level hierarchy resolves parent as ancestor', () => {
    const sourceId = createSource();
    const parentArea = createArea('House', '#111111');
    const childArea = createArea('Kitchen', '#222222', parentArea);
    const wiId = createWorkItem(childArea);
    createWorkItemBudgetLine(wiId, sourceId);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const line = result.workItemLines[0];

    expect(line.area).not.toBeNull();
    expect(line.area?.id).toBe(childArea);
    expect(line.area?.ancestors).toHaveLength(1);
    expect(line.area?.ancestors[0].id).toBe(parentArea);
    expect(line.area?.ancestors[0].name).toBe('House');
  });

  // Area ancestors: 3-level hierarchy (Grandparent -> Parent -> Child)
  it('area ancestors: 3-level hierarchy resolves all ancestors in root-first order', () => {
    const sourceId = createSource();
    const grandparent = createArea('House', '#111111');
    const parent = createArea('First Floor', '#222222', grandparent);
    const child = createArea('Kitchen', '#333333', parent);
    const wiId = createWorkItem(child);
    createWorkItemBudgetLine(wiId, sourceId);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const line = result.workItemLines[0];

    expect(line.area).not.toBeNull();
    expect(line.area?.id).toBe(child);
    expect(line.area?.ancestors).toHaveLength(2);
    // Root-first order: House, then First Floor
    expect(line.area?.ancestors[0].id).toBe(grandparent);
    expect(line.area?.ancestors[0].name).toBe('House');
    expect(line.area?.ancestors[1].id).toBe(parent);
    expect(line.area?.ancestors[1].name).toBe('First Floor');
  });

  // Area ancestors: household item with 2-level hierarchy
  it('area ancestors: household item with 2-level hierarchy resolves ancestors', () => {
    const sourceId = createSource();
    const parentArea = createArea('House', '#444444');
    const childArea = createArea('Living Room', '#555555', parentArea);
    const hiId = createHouseholdItem(childArea, 'Sofa');
    createHouseholdItemBudgetLine(hiId, sourceId);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const line = result.householdItemLines[0];

    expect(line.area).not.toBeNull();
    expect(line.area?.id).toBe(childArea);
    expect(line.area?.ancestors).toHaveLength(1);
    expect(line.area?.ancestors[0].id).toBe(parentArea);
    expect(line.area?.ancestors[0].name).toBe('House');
  });

  // Area ancestors: area color is preserved in ancestors
  it('area ancestors: ancestor color is preserved in ancestor objects', () => {
    const sourceId = createSource();
    const parentArea = createArea('House', '#ff0000');
    const childArea = createArea('Kitchen', '#00ff00', parentArea);
    const wiId = createWorkItem(childArea);
    createWorkItemBudgetLine(wiId, sourceId);

    const result = getBudgetSourceBudgetLines(app.db, sourceId);
    const line = result.workItemLines[0];

    expect(line.area?.ancestors).toHaveLength(1);
    expect(line.area?.ancestors[0].color).toBe('#ff0000');
  });
});
