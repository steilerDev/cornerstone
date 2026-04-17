/**
 * Unit tests for budgetSourceService.moveBudgetSourceBudgetLines()
 *
 * Covers all 15 service-layer scenarios specified for issue #1246.
 * Uses an in-memory SQLite database via buildApp() + full migration stack.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import { moveBudgetSourceBudgetLines } from './budgetSourceService.js';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  budgetSources,
  workItems,
  workItemBudgets,
  householdItems,
  householdItemBudgets,
} from '../db/schema.js';

describe('budgetSourceService.moveBudgetSourceBudgetLines()', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  let counter = 0;
  const uid = (prefix: string) => `${prefix}-${++counter}`;
  const nowTs = () => new Date().toISOString();

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-bsbl-move-svc-test-'));
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

  function createWorkItem(title = 'Test Work Item'): string {
    const id = uid('wi');
    const ts = nowTs();
    app.db
      .insert(workItems)
      .values({
        id,
        title,
        status: 'not_started',
        areaId: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createWorkItemBudgetLine(
    workItemId: string,
    sourceId: string | null,
    createdAt?: string,
  ): string {
    const id = uid('wib');
    const ts = createdAt ?? nowTs();
    app.db
      .insert(workItemBudgets)
      .values({
        id,
        workItemId,
        budgetSourceId: sourceId,
        plannedAmount: 1000,
        confidence: 'own_estimate',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createHouseholdItem(name = 'Test HI'): string {
    const id = uid('hi');
    const ts = nowTs();
    app.db
      .insert(householdItems)
      .values({
        id,
        name,
        categoryId: 'hic-furniture', // seeded by migration 0016
        status: 'planned',
        areaId: null,
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
    createdAt?: string,
  ): string {
    const id = uid('hib');
    const ts = createdAt ?? nowTs();
    app.db
      .insert(householdItemBudgets)
      .values({
        id,
        householdItemId,
        budgetSourceId: sourceId,
        plannedAmount: 1000,
        confidence: 'own_estimate',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function getWibSourceId(wibId: string): string | null {
    const row = app.db
      .select({ budgetSourceId: workItemBudgets.budgetSourceId })
      .from(workItemBudgets)
      .where(eq(workItemBudgets.id, wibId))
      .get();
    return row?.budgetSourceId ?? null;
  }

  function getHibSourceId(hibId: string): string | null {
    const row = app.db
      .select({ budgetSourceId: householdItemBudgets.budgetSourceId })
      .from(householdItemBudgets)
      .where(eq(householdItemBudgets.id, hibId))
      .get();
    return row?.budgetSourceId ?? null;
  }

  function getWibUpdatedAt(wibId: string): string | undefined {
    const row = app.db
      .select({ updatedAt: workItemBudgets.updatedAt })
      .from(workItemBudgets)
      .where(eq(workItemBudgets.id, wibId))
      .get();
    return row?.updatedAt;
  }

  function getHibUpdatedAt(hibId: string): string | undefined {
    const row = app.db
      .select({ updatedAt: householdItemBudgets.updatedAt })
      .from(householdItemBudgets)
      .where(eq(householdItemBudgets.id, hibId))
      .get();
    return row?.updatedAt;
  }

  // ─── Tests ───────────────────────────────────────────────────────────────────

  // 1. 200 — moves work item lines only
  it('moves work item lines only: returns correct counts and updates DB', () => {
    const srcA = createSource('Source A');
    const srcB = createSource('Source B');
    const wi1 = createWorkItem('WI 1');
    const wi2 = createWorkItem('WI 2');
    const wib1 = createWorkItemBudgetLine(wi1, srcA);
    const wib2 = createWorkItemBudgetLine(wi2, srcA);

    const result = moveBudgetSourceBudgetLines(app.db, srcA, {
      targetSourceId: srcB,
      workItemBudgetIds: [wib1, wib2],
      householdItemBudgetIds: [],
    });

    expect(result.movedWorkItemLines).toBe(2);
    expect(result.movedHouseholdItemLines).toBe(0);
    expect(getWibSourceId(wib1)).toBe(srcB);
    expect(getWibSourceId(wib2)).toBe(srcB);
  });

  // 2. 200 — moves household item lines only
  it('moves household item lines only: returns correct counts and updates DB', () => {
    const srcA = createSource('Source A');
    const srcB = createSource('Source B');
    const hi1 = createHouseholdItem('HI 1');
    const hi2 = createHouseholdItem('HI 2');
    const hib1 = createHouseholdItemBudgetLine(hi1, srcA);
    const hib2 = createHouseholdItemBudgetLine(hi2, srcA);

    const result = moveBudgetSourceBudgetLines(app.db, srcA, {
      targetSourceId: srcB,
      workItemBudgetIds: [],
      householdItemBudgetIds: [hib1, hib2],
    });

    expect(result.movedWorkItemLines).toBe(0);
    expect(result.movedHouseholdItemLines).toBe(2);
    expect(getHibSourceId(hib1)).toBe(srcB);
    expect(getHibSourceId(hib2)).toBe(srcB);
  });

  // 3. 200 — moves mixed: 1 WIB + 1 HIB
  it('moves mixed WIB and HIB: response counts both, DB updated for both', () => {
    const srcA = createSource('Source A');
    const srcB = createSource('Source B');
    const wi = createWorkItem();
    const hi = createHouseholdItem();
    const wib = createWorkItemBudgetLine(wi, srcA);
    const hib = createHouseholdItemBudgetLine(hi, srcA);

    const result = moveBudgetSourceBudgetLines(app.db, srcA, {
      targetSourceId: srcB,
      workItemBudgetIds: [wib],
      householdItemBudgetIds: [hib],
    });

    expect(result.movedWorkItemLines).toBe(1);
    expect(result.movedHouseholdItemLines).toBe(1);
    expect(getWibSourceId(wib)).toBe(srcB);
    expect(getHibSourceId(hib)).toBe(srcB);
  });

  // 4. 200 — response always includes both count fields even when one is 0
  it('response includes both movedWorkItemLines and movedHouseholdItemLines even when one is 0', () => {
    const srcA = createSource();
    const srcB = createSource();
    const wi = createWorkItem();
    const wib = createWorkItemBudgetLine(wi, srcA);

    const result = moveBudgetSourceBudgetLines(app.db, srcA, {
      targetSourceId: srcB,
      workItemBudgetIds: [wib],
      householdItemBudgetIds: [],
    });

    expect(result).toHaveProperty('movedWorkItemLines');
    expect(result).toHaveProperty('movedHouseholdItemLines');
    expect(result.movedWorkItemLines).toBe(1);
    expect(result.movedHouseholdItemLines).toBe(0);
  });

  // 5. 400 EMPTY_SELECTION — both arrays empty
  it('throws EmptySelectionError when both arrays are empty', () => {
    const srcA = createSource();
    const srcB = createSource();

    expect(() =>
      moveBudgetSourceBudgetLines(app.db, srcA, {
        targetSourceId: srcB,
        workItemBudgetIds: [],
        householdItemBudgetIds: [],
      }),
    ).toThrow(expect.objectContaining({ code: 'EMPTY_SELECTION', statusCode: 400 }));
  });

  // 6. 400 SAME_SOURCE — thrown BEFORE target existence check
  it('throws SameSourceError (SAME_SOURCE 400) when targetSourceId === sourceId, before checking target existence', () => {
    const srcA = createSource('Source A');
    // Note: srcA exists as both source and target — SAME_SOURCE must fire before any target lookup

    expect(() =>
      moveBudgetSourceBudgetLines(app.db, srcA, {
        targetSourceId: srcA,
        workItemBudgetIds: [],
        householdItemBudgetIds: [],
      }),
    ).toThrow(expect.objectContaining({ code: 'SAME_SOURCE', statusCode: 400 }));
  });

  // 6b. SAME_SOURCE is thrown even when a non-existent targetSourceId equals sourceId
  // (ensures order: SameSource check runs before target lookup)
  it('throws SameSourceError before NOT_FOUND even if sourceId itself does not equal any separate target', () => {
    // Use a fresh non-existent string that equals sourceId — we test with a real src so it passes step 1
    const srcA = createSource('Source A');

    // targetSourceId === sourceId → SameSourceError (not NotFoundError for target)
    expect(() =>
      moveBudgetSourceBudgetLines(app.db, srcA, {
        targetSourceId: srcA, // same as sourceId, which exists
        workItemBudgetIds: ['some-wib'],
        householdItemBudgetIds: [],
      }),
    ).toThrow(expect.objectContaining({ code: 'SAME_SOURCE' }));
  });

  // 7. 404 — sourceId not found
  it('throws NotFoundError (NOT_FOUND 404) when sourceId does not exist', () => {
    const srcB = createSource('Target');

    expect(() =>
      moveBudgetSourceBudgetLines(app.db, 'nonexistent-source', {
        targetSourceId: srcB,
        workItemBudgetIds: [],
        householdItemBudgetIds: [],
      }),
    ).toThrow(expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 }));
  });

  // 8. 404 — targetSourceId not found
  it('throws NotFoundError (NOT_FOUND 404) when targetSourceId does not exist', () => {
    const srcA = createSource('Source A');

    expect(() =>
      moveBudgetSourceBudgetLines(app.db, srcA, {
        targetSourceId: 'nonexistent-target',
        workItemBudgetIds: [],
        householdItemBudgetIds: [],
      }),
    ).toThrow(expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 }));
  });

  // 9. 409 STALE_OWNERSHIP — WIB id does not exist; DB unchanged for other rows
  it('throws StaleOwnershipError when WIB id does not exist, and other rows in DB remain unchanged', () => {
    const srcA = createSource('Source A');
    const srcB = createSource('Source B');
    const wi = createWorkItem();
    const wib = createWorkItemBudgetLine(wi, srcA);

    expect(() =>
      moveBudgetSourceBudgetLines(app.db, srcA, {
        targetSourceId: srcB,
        workItemBudgetIds: ['nonexistent-wib', wib],
        householdItemBudgetIds: [],
      }),
    ).toThrow(expect.objectContaining({ code: 'STALE_OWNERSHIP', statusCode: 409 }));

    // The valid WIB row must remain on srcA (rollback)
    expect(getWibSourceId(wib)).toBe(srcA);
  });

  // 10. 409 STALE_OWNERSHIP — WIB belongs to different source; row still references original
  it('throws StaleOwnershipError when WIB belongs to a different source, row remains on original source', () => {
    const srcA = createSource('Source A');
    const srcB = createSource('Source B');
    const srcC = createSource('Source C');
    const wi = createWorkItem();
    const wib = createWorkItemBudgetLine(wi, srcC); // belongs to srcC, not srcA

    expect(() =>
      moveBudgetSourceBudgetLines(app.db, srcA, {
        targetSourceId: srcB,
        workItemBudgetIds: [wib],
        householdItemBudgetIds: [],
      }),
    ).toThrow(expect.objectContaining({ code: 'STALE_OWNERSHIP', statusCode: 409 }));

    // Row still references its original source (srcC)
    expect(getWibSourceId(wib)).toBe(srcC);
  });

  // 11. 409 STALE_OWNERSHIP — HIB id does not exist
  it('throws StaleOwnershipError when HIB id does not exist', () => {
    const srcA = createSource('Source A');
    const srcB = createSource('Source B');

    expect(() =>
      moveBudgetSourceBudgetLines(app.db, srcA, {
        targetSourceId: srcB,
        workItemBudgetIds: [],
        householdItemBudgetIds: ['nonexistent-hib'],
      }),
    ).toThrow(expect.objectContaining({ code: 'STALE_OWNERSHIP', statusCode: 409 }));
  });

  // 12. 409 STALE_OWNERSHIP — HIB belongs to different source
  it('throws StaleOwnershipError when HIB belongs to a different source, row remains on original source', () => {
    const srcA = createSource('Source A');
    const srcB = createSource('Source B');
    const srcC = createSource('Source C');
    const hi = createHouseholdItem();
    const hib = createHouseholdItemBudgetLine(hi, srcC); // belongs to srcC, not srcA

    expect(() =>
      moveBudgetSourceBudgetLines(app.db, srcA, {
        targetSourceId: srcB,
        workItemBudgetIds: [],
        householdItemBudgetIds: [hib],
      }),
    ).toThrow(expect.objectContaining({ code: 'STALE_OWNERSHIP', statusCode: 409 }));

    expect(getHibSourceId(hib)).toBe(srcC);
  });

  // 13. 409 STALE_OWNERSHIP — partial valid + invalid → atomic rollback
  it('atomic rollback: 2 valid WIB + 1 nonexistent → throw, both valid rows remain on source A', () => {
    const srcA = createSource('Source A');
    const srcB = createSource('Source B');
    const wi1 = createWorkItem('WI 1');
    const wi2 = createWorkItem('WI 2');
    const wib1 = createWorkItemBudgetLine(wi1, srcA);
    const wib2 = createWorkItemBudgetLine(wi2, srcA);

    expect(() =>
      moveBudgetSourceBudgetLines(app.db, srcA, {
        targetSourceId: srcB,
        workItemBudgetIds: [wib1, wib2, 'nonexistent-wib'],
        householdItemBudgetIds: [],
      }),
    ).toThrow(expect.objectContaining({ code: 'STALE_OWNERSHIP' }));

    // Both valid rows must still reference srcA (transaction rolled back)
    expect(getWibSourceId(wib1)).toBe(srcA);
    expect(getWibSourceId(wib2)).toBe(srcA);
  });

  // 14. 409 STALE_OWNERSHIP — mixed arrays: WIB valid, HIB wrong source → atomic rollback
  it('atomic rollback: valid WIB + HIB on wrong source → WIB NOT moved despite being valid', () => {
    const srcA = createSource('Source A');
    const srcB = createSource('Source B');
    const srcC = createSource('Source C');

    const wi = createWorkItem();
    const wib = createWorkItemBudgetLine(wi, srcA); // valid for srcA

    const hi = createHouseholdItem();
    const hib = createHouseholdItemBudgetLine(hi, srcC); // belongs to srcC, not srcA

    expect(() =>
      moveBudgetSourceBudgetLines(app.db, srcA, {
        targetSourceId: srcB,
        workItemBudgetIds: [wib],
        householdItemBudgetIds: [hib],
      }),
    ).toThrow(expect.objectContaining({ code: 'STALE_OWNERSHIP' }));

    // WIB must NOT have been moved despite passing validation (rollback)
    expect(getWibSourceId(wib)).toBe(srcA);
    // HIB still on original source
    expect(getHibSourceId(hib)).toBe(srcC);
  });

  // 15. 200 — updatedAt bumped on moved rows
  it('updatedAt is bumped on moved WIB and HIB rows', async () => {
    const srcA = createSource('Source A');
    const srcB = createSource('Source B');

    // Use a timestamp in the past to ensure the update produces a newer value
    const oldTs = '2020-01-01T00:00:00.000Z';
    const wi = createWorkItem();
    const hi = createHouseholdItem();
    const wib = createWorkItemBudgetLine(wi, srcA, oldTs);
    const hib = createHouseholdItemBudgetLine(hi, srcA, oldTs);

    // Ensure at least 1ms has passed so the new timestamp is strictly greater
    await new Promise((resolve) => setTimeout(resolve, 5));

    moveBudgetSourceBudgetLines(app.db, srcA, {
      targetSourceId: srcB,
      workItemBudgetIds: [wib],
      householdItemBudgetIds: [hib],
    });

    const newWibUpdatedAt = getWibUpdatedAt(wib);
    const newHibUpdatedAt = getHibUpdatedAt(hib);

    expect(newWibUpdatedAt).toBeDefined();
    expect(newHibUpdatedAt).toBeDefined();
    expect(newWibUpdatedAt! > oldTs).toBe(true);
    expect(newHibUpdatedAt! > oldTs).toBe(true);
  });
});
