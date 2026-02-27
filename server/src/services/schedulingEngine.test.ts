import { describe, it, expect } from '@jest/globals';
import { schedule } from './schedulingEngine.js';
import type {
  ScheduleParams,
  SchedulingWorkItem,
  SchedulingDependency,
} from './schedulingEngine.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Creates a minimal SchedulingWorkItem with defaults suitable for most tests.
 */
function makeItem(
  id: string,
  durationDays: number | null = 5,
  overrides: Partial<SchedulingWorkItem> = {},
): SchedulingWorkItem {
  return {
    id,
    status: 'not_started',
    startDate: null,
    endDate: null,
    actualStartDate: null,
    actualEndDate: null,
    durationDays,
    startAfter: null,
    startBefore: null,
    ...overrides,
  };
}

/**
 * Creates a SchedulingDependency with defaults.
 */
function makeDep(
  predecessorId: string,
  successorId: string,
  dependencyType: SchedulingDependency['dependencyType'] = 'finish_to_start',
  leadLagDays = 0,
): SchedulingDependency {
  return { predecessorId, successorId, dependencyType, leadLagDays };
}

/**
 * Build minimal ScheduleParams for a full-mode run.
 */
function fullParams(
  workItems: SchedulingWorkItem[],
  dependencies: SchedulingDependency[] = [],
  today = '2026-01-01',
): ScheduleParams {
  return { mode: 'full', workItems, dependencies, today };
}

// ─── Scheduling Engine Unit Tests ─────────────────────────────────────────────

describe('Scheduling Engine', () => {
  // ─── Edge cases: empty/minimal input ──────────────────────────────────────

  describe('edge cases', () => {
    it('should return empty result when no work items are provided', () => {
      const result = schedule(fullParams([]));
      expect(result.scheduledItems).toEqual([]);
      expect(result.criticalPath).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.cycleNodes).toBeUndefined();
    });

    it('should schedule a single work item with no dependencies', () => {
      const result = schedule(fullParams([makeItem('A', 10)], [], '2026-03-01'));

      expect(result.scheduledItems).toHaveLength(1);
      const item = result.scheduledItems[0];
      expect(item.workItemId).toBe('A');
      expect(item.scheduledStartDate).toBe('2026-03-01');
      expect(item.scheduledEndDate).toBe('2026-03-11');
      expect(item.totalFloat).toBe(0);
      expect(item.isCritical).toBe(true);
      expect(result.criticalPath).toEqual(['A']);
    });

    it('should schedule all items starting today when no dependencies exist', () => {
      const items = [makeItem('A', 3), makeItem('B', 7), makeItem('C', 2)];
      const result = schedule(fullParams(items, [], '2026-01-10'));

      expect(result.scheduledItems).toHaveLength(3);
      // All independent items start on today
      for (const si of result.scheduledItems) {
        expect(si.scheduledStartDate).toBe('2026-01-10');
      }
    });

    it('should handle a single completed item with matching dates without warnings', () => {
      const item = makeItem('A', 5, {
        status: 'completed',
        startDate: '2026-01-01',
        endDate: '2026-01-06',
      });
      const result = schedule(fullParams([item], [], '2026-01-01'));
      const warnings = result.warnings.filter((w) => w.type === 'already_completed');
      expect(warnings).toHaveLength(0);
    });
  });

  // ─── Full mode ────────────────────────────────────────────────────────────

  describe('full mode', () => {
    it('should compute correct ES/EF/LS/LF for a simple linear chain', () => {
      // A (5d) -> B (3d) -> C (4d)
      // Today = 2026-01-01
      // A: ES=2026-01-01, EF=2026-01-06
      // B: ES=2026-01-06, EF=2026-01-09
      // C: ES=2026-01-09, EF=2026-01-13
      const items = [makeItem('A', 5), makeItem('B', 3), makeItem('C', 4)];
      const deps = [makeDep('A', 'B'), makeDep('B', 'C')];
      const result = schedule(fullParams(items, deps, '2026-01-01'));

      expect(result.scheduledItems).toHaveLength(3);
      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));

      expect(byId['A'].scheduledStartDate).toBe('2026-01-01');
      expect(byId['A'].scheduledEndDate).toBe('2026-01-06');

      expect(byId['B'].scheduledStartDate).toBe('2026-01-06');
      expect(byId['B'].scheduledEndDate).toBe('2026-01-09');

      expect(byId['C'].scheduledStartDate).toBe('2026-01-09');
      expect(byId['C'].scheduledEndDate).toBe('2026-01-13');
    });

    it('should identify all items as critical in a single linear chain', () => {
      const items = [makeItem('A', 5), makeItem('B', 3)];
      const deps = [makeDep('A', 'B')];
      const result = schedule(fullParams(items, deps, '2026-01-01'));

      expect(result.criticalPath).toContain('A');
      expect(result.criticalPath).toContain('B');
      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      expect(byId['A'].isCritical).toBe(true);
      expect(byId['B'].isCritical).toBe(true);
    });

    it('should identify non-critical items when a parallel path has slack', () => {
      // A (10d) -> C (1d)   [critical: 11 days total]
      // B  (1d) -> C (1d)   [B has 9 days float]
      const items = [makeItem('A', 10), makeItem('B', 1), makeItem('C', 1)];
      const deps = [makeDep('A', 'C'), makeDep('B', 'C')];
      const result = schedule(fullParams(items, deps, '2026-01-01'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      expect(byId['A'].isCritical).toBe(true);
      expect(byId['C'].isCritical).toBe(true);
      expect(byId['B'].isCritical).toBe(false);
      expect(byId['B'].totalFloat).toBe(9);
    });

    it('should carry previousStartDate and previousEndDate from the work item', () => {
      const item = makeItem('A', 5, { startDate: '2025-12-01', endDate: '2025-12-06' });
      const result = schedule(fullParams([item], [], '2026-01-01'));

      const si = result.scheduledItems[0];
      expect(si.previousStartDate).toBe('2025-12-01');
      expect(si.previousEndDate).toBe('2025-12-06');
    });

    it('should carry null previousStartDate/previousEndDate when not set on work item', () => {
      const result = schedule(fullParams([makeItem('A', 5)], [], '2026-01-01'));
      const si = result.scheduledItems[0];
      expect(si.previousStartDate).toBeNull();
      expect(si.previousEndDate).toBeNull();
    });
  });

  // ─── Cascade mode ─────────────────────────────────────────────────────────

  describe('cascade mode', () => {
    it('should schedule only the anchor and its downstream successors', () => {
      // Upstream: X -> A -> B -> C (X is not downstream of A)
      const items = [makeItem('X', 2), makeItem('A', 5), makeItem('B', 3), makeItem('C', 4)];
      const deps = [makeDep('X', 'A'), makeDep('A', 'B'), makeDep('B', 'C')];
      const params: ScheduleParams = {
        mode: 'cascade',
        anchorWorkItemId: 'A',
        workItems: items,
        dependencies: deps,
        today: '2026-01-01',
      };
      const result = schedule(params);

      const ids = result.scheduledItems.map((si) => si.workItemId);
      expect(ids).toContain('A');
      expect(ids).toContain('B');
      expect(ids).toContain('C');
      // X is upstream — should not be scheduled in cascade from A
      expect(ids).not.toContain('X');
    });

    it('should schedule only the anchor when it has no successors', () => {
      const items = [makeItem('A', 5), makeItem('B', 3)];
      // No dependency from A to B
      const params: ScheduleParams = {
        mode: 'cascade',
        anchorWorkItemId: 'B',
        workItems: items,
        dependencies: [],
        today: '2026-01-01',
      };
      const result = schedule(params);

      expect(result.scheduledItems).toHaveLength(1);
      expect(result.scheduledItems[0].workItemId).toBe('B');
    });

    it('should throw when anchorWorkItemId is missing in cascade mode', () => {
      const items = [makeItem('A', 5)];
      const params: ScheduleParams = {
        mode: 'cascade',
        workItems: items,
        dependencies: [],
        today: '2026-01-01',
      };
      expect(() => schedule(params)).toThrow('anchorWorkItemId is required for cascade mode');
    });

    it('should return empty result when anchor ID does not exist in work items', () => {
      const items = [makeItem('A', 5)];
      const params: ScheduleParams = {
        mode: 'cascade',
        anchorWorkItemId: 'nonexistent',
        workItems: items,
        dependencies: [],
        today: '2026-01-01',
      };
      const result = schedule(params);
      expect(result.scheduledItems).toEqual([]);
    });
  });

  // ─── Dependency types ─────────────────────────────────────────────────────

  describe('dependency types', () => {
    const today = '2026-01-01';

    it('finish_to_start: successor starts when predecessor finishes', () => {
      // A: 5d, starts 2026-01-01, ends 2026-01-06
      // B: 3d (FS from A), starts 2026-01-06, ends 2026-01-09
      const result = schedule(
        fullParams(
          [makeItem('A', 5), makeItem('B', 3)],
          [makeDep('A', 'B', 'finish_to_start')],
          today,
        ),
      );

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      expect(byId['B'].scheduledStartDate).toBe('2026-01-06');
      expect(byId['B'].scheduledEndDate).toBe('2026-01-09');
    });

    it('start_to_start: successor starts when predecessor starts', () => {
      // A: 5d, starts 2026-01-01
      // B: 3d (SS from A), starts 2026-01-01, ends 2026-01-04
      const result = schedule(
        fullParams(
          [makeItem('A', 5), makeItem('B', 3)],
          [makeDep('A', 'B', 'start_to_start')],
          today,
        ),
      );

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      expect(byId['B'].scheduledStartDate).toBe('2026-01-01');
      expect(byId['B'].scheduledEndDate).toBe('2026-01-04');
    });

    it('finish_to_finish: successor finishes when predecessor finishes', () => {
      // A: 5d, starts 2026-01-01, ends 2026-01-06
      // B: 3d (FF from A), EF >= A.EF => B.EF >= 2026-01-06 => B.ES = 2026-01-03
      const result = schedule(
        fullParams(
          [makeItem('A', 5), makeItem('B', 3)],
          [makeDep('A', 'B', 'finish_to_finish')],
          today,
        ),
      );

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      // B must finish same time or after A finishes:
      // B.EF >= A.EF (2026-01-06) => B.ES >= 2026-01-06 - 3 = 2026-01-03
      expect(byId['B'].scheduledStartDate).toBe('2026-01-03');
      expect(byId['B'].scheduledEndDate).toBe('2026-01-06');
    });

    it('start_to_finish: successor finishes when predecessor starts', () => {
      // A: 5d, starts 2026-01-01
      // B: 3d (SF from A), B.EF >= A.ES => B.EF >= 2026-01-01 => B.ES >= 2025-12-29
      // However, the today floor applies to all not_started items (including those
      // with predecessors), so B.ES is floored to today (2026-01-01).
      const result = schedule(
        fullParams(
          [makeItem('A', 5), makeItem('B', 3)],
          [makeDep('A', 'B', 'start_to_finish')],
          today,
        ),
      );

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      // SF(A,B): B.EF >= A.ES + 0 = 2026-01-01 => CPM gives B.ES = 2025-12-29
      // Today floor pushes B.ES to 2026-01-01; B.EF = 2026-01-01 + 3 = 2026-01-04
      expect(byId['B'].scheduledStartDate).toBe('2026-01-01');
      expect(byId['B'].scheduledEndDate).toBe('2026-01-04');
    });
  });

  // ─── Lead/lag days ────────────────────────────────────────────────────────

  describe('lead/lag days', () => {
    const today = '2026-01-01';

    it('positive lag adds delay to FS dependency', () => {
      // A: 5d ends 2026-01-06, B: 3d FS+2 => B starts 2026-01-08
      const result = schedule(
        fullParams(
          [makeItem('A', 5), makeItem('B', 3)],
          [makeDep('A', 'B', 'finish_to_start', 2)],
          today,
        ),
      );

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      expect(byId['B'].scheduledStartDate).toBe('2026-01-08'); // 2026-01-06 + 2
      expect(byId['B'].scheduledEndDate).toBe('2026-01-11');
    });

    it('negative lead allows overlap with FS dependency', () => {
      // A: 5d ends 2026-01-06, B: 3d FS-2 => B starts 2026-01-04
      const result = schedule(
        fullParams(
          [makeItem('A', 5), makeItem('B', 3)],
          [makeDep('A', 'B', 'finish_to_start', -2)],
          today,
        ),
      );

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      expect(byId['B'].scheduledStartDate).toBe('2026-01-04'); // 2026-01-06 - 2
    });

    it('positive lag on SS dependency delays successor start', () => {
      // A: 5d starts 2026-01-01, B: 3d SS+3 => B starts 2026-01-04
      const result = schedule(
        fullParams(
          [makeItem('A', 5), makeItem('B', 3)],
          [makeDep('A', 'B', 'start_to_start', 3)],
          today,
        ),
      );

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      expect(byId['B'].scheduledStartDate).toBe('2026-01-04');
    });

    it('positive lag on FF dependency shifts successor finish', () => {
      // A: 5d ends 2026-01-06, B: 3d FF+2 => B.EF >= 2026-01-08 => B.ES >= 2026-01-05
      const result = schedule(
        fullParams(
          [makeItem('A', 5), makeItem('B', 3)],
          [makeDep('A', 'B', 'finish_to_finish', 2)],
          today,
        ),
      );

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      expect(byId['B'].scheduledEndDate).toBe('2026-01-08'); // A.EF(2026-01-06) + 2
    });
  });

  // ─── Multiple predecessors ────────────────────────────────────────────────

  describe('multiple predecessors', () => {
    it('should use max of predecessor-derived ES when multiple predecessors exist', () => {
      // A: 10d -> C, B: 2d -> C
      // A ends 2026-01-11, B ends 2026-01-03
      // C.ES = max(2026-01-11, 2026-01-03) = 2026-01-11
      const items = [makeItem('A', 10), makeItem('B', 2), makeItem('C', 5)];
      const deps = [makeDep('A', 'C'), makeDep('B', 'C')];
      const result = schedule(fullParams(items, deps, '2026-01-01'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      expect(byId['C'].scheduledStartDate).toBe('2026-01-11');
    });

    it('should compute float correctly when shorter path limits successor', () => {
      // Diamond: A -> B, A -> C, B -> D, C -> D
      // A: 2d, B: 8d, C: 1d, D: 1d
      // After A (ends day 2): B ends day 10, C ends day 3
      // D starts at max(10, 3) = day 10
      // B: LS=2, LF=10 => float=0 (critical)
      // C: LF must be <=10 (D's LS), so C.LF=10, C.LS=9, float=9-2=7 => not critical
      const items = [makeItem('A', 2), makeItem('B', 8), makeItem('C', 1), makeItem('D', 1)];
      const deps = [makeDep('A', 'B'), makeDep('A', 'C'), makeDep('B', 'D'), makeDep('C', 'D')];
      const result = schedule(fullParams(items, deps, '2026-01-01'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      expect(byId['B'].isCritical).toBe(true);
      expect(byId['C'].isCritical).toBe(false);
      expect(byId['C'].totalFloat).toBeGreaterThan(0);
    });
  });

  // ─── Circular dependency detection ───────────────────────────────────────

  describe('circular dependency detection', () => {
    it('should detect a simple 2-node cycle (A -> B -> A)', () => {
      const items = [makeItem('A', 5), makeItem('B', 3)];
      const deps = [makeDep('A', 'B'), makeDep('B', 'A')];
      const result = schedule(fullParams(items, deps));

      expect(result.cycleNodes).toBeDefined();
      expect(result.cycleNodes!.length).toBeGreaterThan(0);
      expect(result.scheduledItems).toEqual([]);
    });

    it('should detect a 3-node cycle (A -> B -> C -> A)', () => {
      const items = [makeItem('A', 5), makeItem('B', 3), makeItem('C', 4)];
      const deps = [makeDep('A', 'B'), makeDep('B', 'C'), makeDep('C', 'A')];
      const result = schedule(fullParams(items, deps));

      expect(result.cycleNodes).toBeDefined();
      expect(result.cycleNodes!.length).toBeGreaterThan(0);
      expect(result.scheduledItems).toEqual([]);
      expect(result.criticalPath).toEqual([]);
    });

    it('should return cycleNodes containing the nodes in the cycle', () => {
      const items = [makeItem('A', 5), makeItem('B', 3), makeItem('C', 4)];
      const deps = [makeDep('A', 'B'), makeDep('B', 'C'), makeDep('C', 'A')];
      const result = schedule(fullParams(items, deps));

      const cycleSet = new Set(result.cycleNodes);
      // All three nodes should be identified as part of the cycle
      expect(cycleSet.has('A') || cycleSet.has('B') || cycleSet.has('C')).toBe(true);
    });

    it('should detect self-referential dependency (A -> A)', () => {
      const items = [makeItem('A', 5)];
      const deps = [makeDep('A', 'A')];
      const result = schedule(fullParams(items, deps));

      expect(result.cycleNodes).toBeDefined();
      expect(result.cycleNodes!.length).toBeGreaterThan(0);
    });

    it('should emit no warnings when cycle is detected', () => {
      const items = [makeItem('A', 5), makeItem('B', 3)];
      const deps = [makeDep('A', 'B'), makeDep('B', 'A')];
      const result = schedule(fullParams(items, deps));

      expect(result.warnings).toEqual([]);
    });
  });

  // ─── Start-after constraint ───────────────────────────────────────────────

  describe('start_after constraint (hard constraint)', () => {
    it('should shift ES to startAfter when it is later than predecessor-derived date', () => {
      // A: 5d ends 2026-01-06. B has startAfter = 2026-01-10
      const items = [makeItem('A', 5), makeItem('B', 3, { startAfter: '2026-01-10' })];
      const deps = [makeDep('A', 'B')];
      const result = schedule(fullParams(items, deps, '2026-01-01'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      expect(byId['B'].scheduledStartDate).toBe('2026-01-10');
      expect(byId['B'].scheduledEndDate).toBe('2026-01-13');
    });

    it('should not shift ES when startAfter is earlier than dependency-derived date', () => {
      // A: 5d ends 2026-01-06. B has startAfter = 2026-01-01 (no effect)
      const items = [makeItem('A', 5), makeItem('B', 3, { startAfter: '2026-01-01' })];
      const deps = [makeDep('A', 'B')];
      const result = schedule(fullParams(items, deps, '2026-01-01'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      expect(byId['B'].scheduledStartDate).toBe('2026-01-06');
    });

    it('should apply startAfter to an independent item with no predecessors', () => {
      const item = makeItem('A', 3, { startAfter: '2026-06-15' });
      const result = schedule(fullParams([item], [], '2026-01-01'));

      const si = result.scheduledItems[0];
      expect(si.scheduledStartDate).toBe('2026-06-15');
      expect(si.scheduledEndDate).toBe('2026-06-18');
    });
  });

  // ─── Start-before constraint ──────────────────────────────────────────────

  describe('start_before constraint (soft constraint / warning)', () => {
    it('should emit start_before_violated warning when scheduled start exceeds startBefore', () => {
      // A: 10d ends 2026-01-11. B has startBefore = 2026-01-05
      const items = [makeItem('A', 10), makeItem('B', 3, { startBefore: '2026-01-05' })];
      const deps = [makeDep('A', 'B')];
      const result = schedule(fullParams(items, deps, '2026-01-01'));

      const warnB = result.warnings.filter(
        (w) => w.workItemId === 'B' && w.type === 'start_before_violated',
      );
      expect(warnB).toHaveLength(1);
      expect(warnB[0].message).toContain('2026-01-05');
    });

    it('should still schedule the item even when startBefore is violated', () => {
      // Soft constraint: scheduling continues, item gets its dependency-driven date
      const items = [makeItem('A', 10), makeItem('B', 3, { startBefore: '2026-01-05' })];
      const deps = [makeDep('A', 'B')];
      const result = schedule(fullParams(items, deps, '2026-01-01'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      expect(byId['B'].scheduledStartDate).toBe('2026-01-11');
      expect(result.scheduledItems).toHaveLength(2);
    });

    it('should not emit start_before_violated warning when start is on time', () => {
      const item = makeItem('A', 3, { startBefore: '2026-06-01' });
      const result = schedule(fullParams([item], [], '2026-01-01'));

      const warnings = result.warnings.filter(
        (w) => w.workItemId === 'A' && w.type === 'start_before_violated',
      );
      expect(warnings).toHaveLength(0);
    });
  });

  // ─── Zero-duration items ──────────────────────────────────────────────────

  describe('zero-duration / no-duration items', () => {
    it('should emit no_duration warning when durationDays is null', () => {
      const item = makeItem('A', null);
      const result = schedule(fullParams([item], [], '2026-01-01'));

      const warnings = result.warnings.filter(
        (w) => w.workItemId === 'A' && w.type === 'no_duration',
      );
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('zero-duration');
    });

    it('should schedule null-duration item as zero-duration (ES === EF)', () => {
      const item = makeItem('A', null);
      const result = schedule(fullParams([item], [], '2026-04-01'));

      const si = result.scheduledItems[0];
      expect(si.scheduledStartDate).toBe('2026-04-01');
      expect(si.scheduledEndDate).toBe('2026-04-01');
    });

    it('should allow successors to be scheduled after a zero-duration milestone', () => {
      const items = [makeItem('M', null), makeItem('B', 5)];
      const deps = [makeDep('M', 'B')];
      const result = schedule(fullParams(items, deps, '2026-01-01'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      // M has 0 duration; B starts from M.EF = 2026-01-01
      expect(byId['B'].scheduledStartDate).toBe('2026-01-01');
    });
  });

  // ─── Completed items ──────────────────────────────────────────────────────

  describe('completed items', () => {
    it('should emit already_completed warning when start date would change', () => {
      const item = makeItem('A', 5, {
        status: 'completed',
        startDate: '2025-11-01',
        endDate: '2025-11-06',
      });
      // Schedule with today = 2026-01-01 => engine computes ES = 2026-01-01 (different from stored)
      const result = schedule(fullParams([item], [], '2026-01-01'));

      const warnings = result.warnings.filter(
        (w) => w.workItemId === 'A' && w.type === 'already_completed',
      );
      expect(warnings).toHaveLength(1);
    });

    it('should not emit already_completed warning when dates match', () => {
      const item = makeItem('A', 5, {
        status: 'completed',
        startDate: '2026-01-01',
        endDate: '2026-01-06',
      });
      const result = schedule(fullParams([item], [], '2026-01-01'));

      const warnings = result.warnings.filter(
        (w) => w.workItemId === 'A' && w.type === 'already_completed',
      );
      expect(warnings).toHaveLength(0);
    });

    it('should not emit already_completed when item is not completed status', () => {
      const item = makeItem('A', 5, {
        status: 'in_progress',
        startDate: '2025-11-01',
        endDate: '2025-11-06',
      });
      const result = schedule(fullParams([item], [], '2026-01-01'));

      const warnings = result.warnings.filter((w) => w.type === 'already_completed');
      expect(warnings).toHaveLength(0);
    });

    it('should still compute CPM dates for completed items (engine is read-only)', () => {
      const item = makeItem('A', 5, {
        status: 'completed',
        startDate: '2025-11-01',
        endDate: '2025-11-06',
      });
      const result = schedule(fullParams([item], [], '2026-01-01'));

      // Engine computes what the dates would be (ES=today), but does not modify the DB
      expect(result.scheduledItems).toHaveLength(1);
      expect(result.scheduledItems[0].scheduledStartDate).toBe('2026-01-01');
    });
  });

  // ─── Critical path ────────────────────────────────────────────────────────

  describe('critical path identification', () => {
    it('should mark all items in a single chain as critical', () => {
      const items = [makeItem('A', 2), makeItem('B', 3), makeItem('C', 4)];
      const deps = [makeDep('A', 'B'), makeDep('B', 'C')];
      const result = schedule(fullParams(items, deps, '2026-01-01'));

      expect(result.criticalPath).toEqual(['A', 'B', 'C']);
    });

    it('should include criticalPath in topological order', () => {
      const items = [makeItem('A', 5), makeItem('B', 3), makeItem('C', 1)];
      const deps = [makeDep('A', 'B'), makeDep('B', 'C')];
      const result = schedule(fullParams(items, deps, '2026-01-01'));

      // Verify that the order in criticalPath is topological (A before B before C)
      const idx = (id: string) => result.criticalPath.indexOf(id);
      expect(idx('A')).toBeLessThan(idx('B'));
      expect(idx('B')).toBeLessThan(idx('C'));
    });

    it('should have totalFloat=0 for all items on the critical path', () => {
      const items = [makeItem('A', 5), makeItem('B', 3), makeItem('C', 2)];
      const deps = [makeDep('A', 'B'), makeDep('B', 'C')];
      const result = schedule(fullParams(items, deps, '2026-01-01'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      for (const id of result.criticalPath) {
        expect(byId[id].totalFloat).toBe(0);
      }
    });

    it('should return empty criticalPath when there are no items', () => {
      const result = schedule(fullParams([], [], '2026-01-01'));
      expect(result.criticalPath).toEqual([]);
    });
  });

  // ─── Complex project network ──────────────────────────────────────────────

  describe('complex project network', () => {
    it('should correctly schedule a realistic multi-path diamond network', () => {
      // Network: A(5) -> B(8), A(5) -> C(3), B(8) -> D(2), C(3) -> D(2)
      // Today = 2026-01-01
      // A: ES=01-01, EF=01-06
      // B: ES=01-06, EF=01-14 (longest path)
      // C: ES=01-06, EF=01-09
      // D: ES=max(01-14, 01-09)=01-14, EF=01-16
      const items = [makeItem('A', 5), makeItem('B', 8), makeItem('C', 3), makeItem('D', 2)];
      const deps = [makeDep('A', 'B'), makeDep('A', 'C'), makeDep('B', 'D'), makeDep('C', 'D')];
      const result = schedule(fullParams(items, deps, '2026-01-01'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));

      // A starts today
      expect(byId['A'].scheduledStartDate).toBe('2026-01-01');
      expect(byId['A'].scheduledEndDate).toBe('2026-01-06');

      // B: FS from A, 8 days
      expect(byId['B'].scheduledStartDate).toBe('2026-01-06');
      expect(byId['B'].scheduledEndDate).toBe('2026-01-14');

      // C: FS from A, 3 days
      expect(byId['C'].scheduledStartDate).toBe('2026-01-06');
      expect(byId['C'].scheduledEndDate).toBe('2026-01-09');

      // D: max of B.EF and C.EF
      expect(byId['D'].scheduledStartDate).toBe('2026-01-14');
      expect(byId['D'].scheduledEndDate).toBe('2026-01-16');

      // Critical path: A -> B -> D (longer path)
      expect(result.criticalPath).toContain('A');
      expect(result.criticalPath).toContain('B');
      expect(result.criticalPath).toContain('D');

      // C has positive float
      expect(byId['C'].totalFloat).toBeGreaterThan(0);
      expect(byId['C'].isCritical).toBe(false);
    });

    it('should schedule 10 items in a chain correctly', () => {
      // Chain of 10 items each with 1 day duration
      const n = 10;
      const items = Array.from({ length: n }, (_, i) => makeItem(`item-${i}`, 1));
      const deps: SchedulingDependency[] = [];
      for (let i = 0; i < n - 1; i++) {
        deps.push(makeDep(`item-${i}`, `item-${i + 1}`));
      }

      const result = schedule(fullParams(items, deps, '2026-01-01'));

      expect(result.scheduledItems).toHaveLength(n);
      expect(result.criticalPath).toHaveLength(n);

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      // First item starts on 2026-01-01, last ends on 2026-01-10+1=2026-01-11
      expect(byId['item-0'].scheduledStartDate).toBe('2026-01-01');
      expect(byId['item-9'].scheduledStartDate).toBe('2026-01-10');
      expect(byId['item-9'].scheduledEndDate).toBe('2026-01-11');
    });

    it('should handle a network with disconnected subgraphs', () => {
      // Two independent chains: A->B and C->D
      const items = [makeItem('A', 3), makeItem('B', 2), makeItem('C', 5), makeItem('D', 1)];
      const deps = [makeDep('A', 'B'), makeDep('C', 'D')];
      const result = schedule(fullParams(items, deps, '2026-01-01'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));

      // First chain: A -> B
      expect(byId['A'].scheduledStartDate).toBe('2026-01-01');
      expect(byId['B'].scheduledStartDate).toBe('2026-01-04');

      // Second chain: C -> D (independent, starts today)
      expect(byId['C'].scheduledStartDate).toBe('2026-01-01');
      expect(byId['D'].scheduledStartDate).toBe('2026-01-06');
    });

    it('should handle 50+ work items without error', () => {
      const n = 50;
      // Build a fan-out + fan-in network: 1 root -> 48 parallel -> 1 sink
      const root = makeItem('root', 2);
      const sink = makeItem('sink', 1);
      const parallel = Array.from({ length: n - 2 }, (_, i) => makeItem(`p-${i}`, 3));

      const items = [root, ...parallel, sink];
      const deps: SchedulingDependency[] = [
        ...parallel.map((p) => makeDep('root', p.id)),
        ...parallel.map((p) => makeDep(p.id, 'sink')),
      ];

      const result = schedule(fullParams(items, deps, '2026-01-01'));

      expect(result.scheduledItems).toHaveLength(n);
      expect(result.cycleNodes).toBeUndefined();
    });
  });

  // ─── Response shape validation ────────────────────────────────────────────

  describe('response shape', () => {
    it('should include all required fields in each ScheduledItem', () => {
      const item = makeItem('A', 5, { startDate: '2026-01-01', endDate: '2026-01-06' });
      const result = schedule(fullParams([item], [], '2026-01-01'));

      expect(result.scheduledItems).toHaveLength(1);
      const si = result.scheduledItems[0];

      expect(si).toHaveProperty('workItemId');
      expect(si).toHaveProperty('previousStartDate');
      expect(si).toHaveProperty('previousEndDate');
      expect(si).toHaveProperty('scheduledStartDate');
      expect(si).toHaveProperty('scheduledEndDate');
      expect(si).toHaveProperty('latestStartDate');
      expect(si).toHaveProperty('latestFinishDate');
      expect(si).toHaveProperty('totalFloat');
      expect(si).toHaveProperty('isCritical');
      expect(si).toHaveProperty('isLate');
    });

    it('should include all required fields in each warning', () => {
      const item = makeItem('A', null); // triggers no_duration warning
      const result = schedule(fullParams([item], [], '2026-01-01'));

      expect(result.warnings.length).toBeGreaterThan(0);
      const w = result.warnings[0];
      expect(w).toHaveProperty('workItemId');
      expect(w).toHaveProperty('type');
      expect(w).toHaveProperty('message');
    });

    it('should not mutate the input work items array', () => {
      const items = [makeItem('A', 5)];
      const original = JSON.stringify(items);
      schedule(fullParams(items, [], '2026-01-01'));
      expect(JSON.stringify(items)).toBe(original);
    });
  });

  // ─── Backward pass validation (LS/LF) ────────────────────────────────────

  describe('backward pass (LS/LF computation)', () => {
    it('should compute latestStartDate and latestFinishDate correctly for a linear chain', () => {
      // A(5) -> B(3) -> C(4)
      // Project end = 2026-01-13 (C.EF)
      // C: LF=2026-01-13, LS=2026-01-09
      // B: LF=2026-01-09, LS=2026-01-06
      // A: LF=2026-01-06, LS=2026-01-01
      const items = [makeItem('A', 5), makeItem('B', 3), makeItem('C', 4)];
      const deps = [makeDep('A', 'B'), makeDep('B', 'C')];
      const result = schedule(fullParams(items, deps, '2026-01-01'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      expect(byId['C'].latestStartDate).toBe('2026-01-09');
      expect(byId['C'].latestFinishDate).toBe('2026-01-13');
      expect(byId['B'].latestStartDate).toBe('2026-01-06');
      expect(byId['B'].latestFinishDate).toBe('2026-01-09');
      expect(byId['A'].latestStartDate).toBe('2026-01-01');
      expect(byId['A'].latestFinishDate).toBe('2026-01-06');
    });

    it('should clamp totalFloat to 0 (not negative) for infeasible constraints', () => {
      // A(10d) with startAfter set far in the future and startBefore in the past
      // Float could compute negative for the SS backward pass
      // We just verify totalFloat is always >= 0
      const item = makeItem('A', 10, {
        startAfter: '2026-06-01',
        startBefore: '2026-01-01',
      });
      const result = schedule(fullParams([item], [], '2026-01-01'));

      const si = result.scheduledItems[0];
      expect(si.totalFloat).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── Cascade with predecessor-only boundary edges ─────────────────────────

  describe('cascade boundary (predecessor edges excluded from scheduled set)', () => {
    it('should handle edges from outside the cascade set gracefully', () => {
      // X -> A -> B where cascade starts at A (X is not in the set)
      // The edge X->A should be excluded from topological sort but A still starts today
      const items = [makeItem('X', 5), makeItem('A', 3), makeItem('B', 2)];
      const deps = [makeDep('X', 'A'), makeDep('A', 'B')];
      const params: ScheduleParams = {
        mode: 'cascade',
        anchorWorkItemId: 'A',
        workItems: items,
        dependencies: deps,
        today: '2026-01-10',
      };
      const result = schedule(params);

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      // A has no predecessors within the cascade set, starts today
      expect(byId['A'].scheduledStartDate).toBe('2026-01-10');
      expect(byId['B'].scheduledStartDate).toBe('2026-01-13');
    });
  });

  // ─── Actual dates (Issue #296) ─────────────────────────────────────────────

  describe('actualStartDate and actualEndDate overrides', () => {
    it('uses actualStartDate as ES instead of CPM-computed value', () => {
      // A is not_started but has an explicit actualStartDate far in the past.
      // The actualStartDate must take absolute precedence over CPM/today floor.
      const item = makeItem('A', 5, {
        status: 'in_progress',
        actualStartDate: '2026-01-03',
        actualEndDate: null,
      });
      const result = schedule(fullParams([item], [], '2026-01-10'));

      const si = result.scheduledItems[0];
      // actualStartDate overrides the engine's computation (today=2026-01-10)
      expect(si.scheduledStartDate).toBe('2026-01-03');
      // Without actualEndDate, EF = actualStartDate + duration
      expect(si.scheduledEndDate).toBe('2026-01-08');
    });

    it('uses actualEndDate as EF instead of actualStartDate + duration', () => {
      // Item started 2026-01-01 but took longer — finished 2026-01-10 instead of 2026-01-06
      const item = makeItem('A', 5, {
        status: 'completed',
        actualStartDate: '2026-01-01',
        actualEndDate: '2026-01-10',
      });
      const result = schedule(fullParams([item], [], '2026-01-10'));

      const si = result.scheduledItems[0];
      expect(si.scheduledStartDate).toBe('2026-01-01');
      // actualEndDate overrides the ES+duration calculation
      expect(si.scheduledEndDate).toBe('2026-01-10');
    });

    it('propagates actual dates to downstream dependencies', () => {
      // A (in_progress, actualStartDate=2026-01-03, actualEndDate=2026-01-15) -> B (5d)
      // B.ES must come from A.actualEndDate, not A.CPM-computed-EF
      const a = makeItem('A', 5, {
        status: 'in_progress',
        actualStartDate: '2026-01-03',
        actualEndDate: '2026-01-15', // Late — extends 10 days past the 5d duration
      });
      const b = makeItem('B', 5, { status: 'not_started' });
      const deps = [makeDep('A', 'B', 'finish_to_start')];
      const result = schedule(fullParams([a, b], deps, '2026-01-10'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      // A's EF = actualEndDate = 2026-01-15; B starts from A.EF
      expect(byId['A'].scheduledStartDate).toBe('2026-01-03');
      expect(byId['A'].scheduledEndDate).toBe('2026-01-15');
      expect(byId['B'].scheduledStartDate).toBe('2026-01-15');
      expect(byId['B'].scheduledEndDate).toBe('2026-01-20');
    });

    it('propagates actualStartDate-only to downstream dependencies (no actualEndDate)', () => {
      // A (in_progress, actualStartDate=2026-01-05, no actualEndDate, duration=3) -> B (4d)
      // A.EF = 2026-01-05 + 3 = 2026-01-08; B starts from A.EF via FS dependency
      // But B is not_started and today=2026-01-10, so today floor pushes B.ES to 2026-01-10
      const a = makeItem('A', 3, {
        status: 'in_progress',
        actualStartDate: '2026-01-05',
        actualEndDate: null,
      });
      const b = makeItem('B', 4, { status: 'not_started' });
      const deps = [makeDep('A', 'B', 'finish_to_start')];
      const result = schedule(fullParams([a, b], deps, '2026-01-10'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      expect(byId['A'].scheduledStartDate).toBe('2026-01-05');
      expect(byId['A'].scheduledEndDate).toBe('2026-01-08');
      // B.ES = max(A.EF=2026-01-08, today=2026-01-10) = 2026-01-10
      expect(byId['B'].scheduledStartDate).toBe('2026-01-10');
      expect(byId['B'].scheduledEndDate).toBe('2026-01-14');
    });

    it('item with only actualEndDate but no actualStartDate overrides EF (AC-2)', () => {
      // Fix for Bug #319 AC-2: actualEndDate alone DOES override EF.
      // ES still comes from CPM (today floor for not_started, or root logic for others).
      // The actual end date is authoritative — no clamping, isLate = false.
      const item = makeItem('A', 5, {
        status: 'in_progress',
        actualStartDate: null,
        actualEndDate: '2025-12-20', // past end date — actual dates are authoritative
        startDate: '2025-12-15',
      });
      // today=2026-01-01 => in_progress root item uses item.startDate as ES
      const result = schedule(fullParams([item], [], '2026-01-01'));

      const si = result.scheduledItems[0];
      // ES = item.startDate (non-completed root node)
      expect(si.scheduledStartDate).toBe('2025-12-15');
      // EF = actualEndDate (overrides ES + duration)
      expect(si.scheduledEndDate).toBe('2025-12-20');
      // Actual dates are authoritative — not considered late
      expect(si.isLate).toBe(false);
    });
  });

  // ─── Today floor for not_started items (Issue #296) ────────────────────────

  describe('today floor for not_started items', () => {
    it('floors ES to today for not_started root items with no startDate', () => {
      const item = makeItem('A', 5, { status: 'not_started', startDate: null });
      const result = schedule(fullParams([item], [], '2026-05-01'));

      expect(result.scheduledItems[0].scheduledStartDate).toBe('2026-05-01');
    });

    it('floors ES to today even when CPM would produce an earlier date', () => {
      // not_started item with startDate in the past — today floor should win
      const item = makeItem('A', 5, {
        status: 'not_started',
        startDate: '2026-01-01', // Past date
      });
      const result = schedule(fullParams([item], [], '2026-05-01'));

      // The root item uses item.startDate as base for non-completed roots.
      // Then today floor is applied: max('2026-01-01', '2026-05-01') = '2026-05-01'
      expect(result.scheduledItems[0].scheduledStartDate).toBe('2026-05-01');
    });

    it('does not apply today floor to in_progress items', () => {
      // An in_progress item may legitimately have a past start date.
      // The today floor only applies to not_started items.
      const item = makeItem('A', 5, {
        status: 'in_progress',
        startDate: '2026-01-01', // Past start date, this is normal for in_progress
      });
      const result = schedule(fullParams([item], [], '2026-05-01'));

      // Root non-completed item uses its startDate; today floor NOT applied
      expect(result.scheduledItems[0].scheduledStartDate).toBe('2026-01-01');
    });

    it('does not apply today floor to completed items', () => {
      // Completed items always compute from today (for already_completed warning detection),
      // but that path is distinct from the not_started floor.
      const item = makeItem('A', 5, {
        status: 'completed',
        startDate: '2026-01-01',
        endDate: '2026-01-06',
      });
      const result = schedule(fullParams([item], [], '2026-05-01'));

      // Completed root: ES = today (not item.startDate), but NOT because of not_started floor
      expect(result.scheduledItems[0].scheduledStartDate).toBe('2026-05-01');
    });

    it('takes max of startAfter and today floor for not_started items', () => {
      // not_started item with startAfter far in the future — startAfter should win
      const item = makeItem('A', 5, {
        status: 'not_started',
        startAfter: '2026-08-01',
      });
      const result = schedule(fullParams([item], [], '2026-05-01'));

      // today=2026-05-01, startAfter=2026-08-01 => max = 2026-08-01
      expect(result.scheduledItems[0].scheduledStartDate).toBe('2026-08-01');
    });

    it('takes max of today floor and startAfter when today is later than startAfter', () => {
      // today is later than startAfter → today floor wins
      const item = makeItem('A', 5, {
        status: 'not_started',
        startAfter: '2026-01-01',
      });
      const result = schedule(fullParams([item], [], '2026-05-01'));

      expect(result.scheduledItems[0].scheduledStartDate).toBe('2026-05-01');
    });

    it('applies today floor to not_started successor with dependencies', () => {
      // A (completed) -> B (not_started, 3d)
      // A.EF = 2026-04-10 (in the past), today = 2026-05-01
      // B.ES would be 2026-04-10 from dependency, but today floor pushes it to 2026-05-01
      const a = makeItem('A', 5, {
        status: 'completed',
        actualStartDate: '2026-04-05',
        actualEndDate: '2026-04-10',
      });
      const b = makeItem('B', 3, { status: 'not_started' });
      const deps = [makeDep('A', 'B', 'finish_to_start')];
      const result = schedule(fullParams([a, b], deps, '2026-05-01'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      // B.ES from dep = A.EF = 2026-04-10, but today floor = 2026-05-01 => today wins
      expect(byId['B'].scheduledStartDate).toBe('2026-05-01');
      expect(byId['B'].scheduledEndDate).toBe('2026-05-04');
    });
  });

  // ─── Bug #319: Scheduling engine rule violations ───────────────────────────
  //
  // Tests for the 4-rule priority system:
  // Rule 1: Actual dates always override (actualStartDate → ES, actualEndDate → EF)
  // Rule 2: not_started items: scheduledStartDate >= today
  // Rule 3: in_progress items: scheduledEndDate >= today
  // Rule 4: isLate detection — true when Rules 2/3 clamped dates

  describe('Bug #319: scheduling rule priority system', () => {
    // ── Rule 1: actualStartDate always overrides ─────────────────────────────

    it('AC-1: actualStartDate overrides CPM-computed ES regardless of dependencies', () => {
      // Predecessor A ends 2026-01-15, but B has actualStartDate = 2026-01-05 (before A ends)
      // actualStartDate must take precedence over everything
      const a = makeItem('A', 10, {
        status: 'completed',
        actualStartDate: '2026-01-05',
        actualEndDate: '2026-01-15',
      });
      const b = makeItem('B', 5, {
        status: 'in_progress',
        actualStartDate: '2026-01-05',
        actualEndDate: null,
      });
      const deps = [makeDep('A', 'B')];
      const result = schedule(fullParams([a, b], deps, '2026-01-10'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      // B.actualStartDate must override A.EF dependency constraint
      expect(byId['B'].scheduledStartDate).toBe('2026-01-05');
    });

    it('AC-2: actualEndDate alone overrides EF even without actualStartDate', () => {
      // in_progress item: actualStartDate not set, actualEndDate is past
      // Rule 1 should override EF even without actualStartDate
      const item = makeItem('A', 5, {
        status: 'in_progress',
        actualStartDate: null,
        actualEndDate: '2025-12-31', // past end date
        startDate: '2025-12-26',
      });
      const result = schedule(fullParams([item], [], '2026-01-10'));

      const si = result.scheduledItems[0];
      // EF must be the actualEndDate, not the today-floored computation
      expect(si.scheduledEndDate).toBe('2025-12-31');
    });

    it('AC-3: both actual dates set → both override, even if duration differs', () => {
      // Item has 5d duration but actual dates span 20 days
      const item = makeItem('A', 5, {
        status: 'completed',
        actualStartDate: '2026-01-01',
        actualEndDate: '2026-01-21', // 20 days, not 5
      });
      const result = schedule(fullParams([item], [], '2026-01-15'));

      const si = result.scheduledItems[0];
      expect(si.scheduledStartDate).toBe('2026-01-01');
      expect(si.scheduledEndDate).toBe('2026-01-21');
    });

    // ── Rule 2: not_started today floor ──────────────────────────────────────

    it('AC-4: not_started items: scheduledStartDate >= today', () => {
      // not_started item with CPM-derived date in the past
      const a = makeItem('A', 3, {
        status: 'completed',
        actualStartDate: '2025-12-01',
        actualEndDate: '2025-12-04',
      });
      const b = makeItem('B', 5, { status: 'not_started' });
      const deps = [makeDep('A', 'B')];
      // today is 2026-01-10, A.EF = 2025-12-04, so B.ES from dep < today
      const result = schedule(fullParams([a, b], deps, '2026-01-10'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      expect(byId['B'].scheduledStartDate).toBe('2026-01-10');
    });

    // ── Rule 3: in_progress today floor ──────────────────────────────────────

    it('AC-5: in_progress items: scheduledEndDate >= today when end would be in past', () => {
      // in_progress item started in the past, short duration, would end in the past
      const item = makeItem('A', 3, {
        status: 'in_progress',
        startDate: '2025-12-01', // Start in the past
      });
      // today = 2026-01-10; CPM EF would be 2025-12-04 (in the past)
      const result = schedule(fullParams([item], [], '2026-01-10'));

      const si = result.scheduledItems[0];
      expect(si.scheduledEndDate).toBe('2026-01-10');
    });

    it('AC-6: in_progress item with future end date is NOT clamped', () => {
      // in_progress item that naturally ends in the future — no clamping needed
      const item = makeItem('A', 30, {
        status: 'in_progress',
        startDate: '2026-01-01',
      });
      // today = 2026-01-10; CPM EF = 2026-01-31 (already in future)
      const result = schedule(fullParams([item], [], '2026-01-10'));

      const si = result.scheduledItems[0];
      expect(si.scheduledEndDate).toBe('2026-01-31'); // No clamping
      expect(si.isLate).toBe(false);
    });

    // ── Rule 4: isLate detection ──────────────────────────────────────────────

    it('AC-7: isLate = true when Rule 2 clamps a not_started item start to today', () => {
      // not_started item would start in the past without the today floor
      const item = makeItem('A', 5, {
        status: 'not_started',
        startDate: '2025-12-01', // Past date
      });
      const result = schedule(fullParams([item], [], '2026-01-10'));

      const si = result.scheduledItems[0];
      expect(si.isLate).toBe(true);
    });

    it('AC-8: isLate = true when Rule 3 clamps an in_progress item end to today', () => {
      // in_progress item with past end date — Rule 3 clamps it to today
      const item = makeItem('A', 3, {
        status: 'in_progress',
        startDate: '2025-12-01',
      });
      const result = schedule(fullParams([item], [], '2026-01-10'));

      const si = result.scheduledItems[0];
      expect(si.isLate).toBe(true);
    });

    it('AC-9: isLate = false when no clamping occurs (dates naturally in future)', () => {
      // not_started item with future start date — no clamping needed
      const item = makeItem('A', 5, {
        status: 'not_started',
        startDate: '2026-06-01', // Future date
      });
      const result = schedule(fullParams([item], [], '2026-01-10'));

      const si = result.scheduledItems[0];
      expect(si.isLate).toBe(false);
    });

    it('AC-10: Rule 1 > Rule 3 — actualEndDate in past stays, isLate = false', () => {
      // in_progress item with actualEndDate in the past.
      // Rule 1 (actualEndDate) takes precedence — end date stays as actual, isLate = false.
      const item = makeItem('A', 5, {
        status: 'in_progress',
        actualStartDate: null,
        actualEndDate: '2025-12-15', // Past end date — but it's an actual date
        startDate: '2025-12-10',
      });
      const result = schedule(fullParams([item], [], '2026-01-10'));

      const si = result.scheduledItems[0];
      // Actual end date stays — not clamped to today
      expect(si.scheduledEndDate).toBe('2025-12-15');
      // Not considered late — actual dates are authoritative
      expect(si.isLate).toBe(false);
    });

    it('AC-11: downstream successors use clamped dates from Rule 2', () => {
      // A (not_started) with past start is clamped to today=2026-01-10
      // B depends on A via FS — B.ES must come from A's clamped EF
      const a = makeItem('A', 5, {
        status: 'not_started',
        startDate: '2025-12-01', // Past — will be clamped to today
      });
      const b = makeItem('B', 3, { status: 'not_started' });
      const deps = [makeDep('A', 'B')];
      const result = schedule(fullParams([a, b], deps, '2026-01-10'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      // A.ES clamped to today=2026-01-10, A.EF = 2026-01-15
      expect(byId['A'].scheduledStartDate).toBe('2026-01-10');
      expect(byId['A'].scheduledEndDate).toBe('2026-01-15');
      // B starts from A's clamped EF
      expect(byId['B'].scheduledStartDate).toBe('2026-01-15');
      expect(byId['B'].scheduledEndDate).toBe('2026-01-18');
    });

    it('AC-12: ScheduledItem has isLate field as boolean', () => {
      const item = makeItem('A', 5, { status: 'not_started' });
      const result = schedule(fullParams([item], [], '2026-01-10'));

      const si = result.scheduledItems[0];
      expect(typeof si.isLate).toBe('boolean');
    });

    it('AC-13: isCritical (CPM float) remains unchanged by Rule 2/3/4', () => {
      // Two parallel chains; the longer one should be critical regardless of today floor
      // A (10d, not_started past) -> C (1d)
      // B (1d, not_started past) -> C
      // A is critical (longest path), B has float
      const a = makeItem('A', 10, { status: 'not_started', startDate: '2025-12-01' });
      const b = makeItem('B', 1, { status: 'not_started', startDate: '2025-12-01' });
      const c = makeItem('C', 1, { status: 'not_started' });
      const deps = [makeDep('A', 'C'), makeDep('B', 'C')];
      const result = schedule(fullParams([a, b, c], deps, '2026-01-10'));

      const byId = Object.fromEntries(result.scheduledItems.map((si) => [si.workItemId, si]));
      // A has been clamped (isLate=true) but isCritical is still about CPM float
      expect(byId['A'].isCritical).toBe(true);
      expect(byId['B'].isCritical).toBe(false);
      // B and A both got clamped by today floor
      expect(byId['A'].isLate).toBe(true);
      expect(byId['B'].isLate).toBe(true);
    });

    // ── isLate = false for not_started when no clamping needed ───────────────

    it('isLate = false for not_started item when start is exactly today', () => {
      const item = makeItem('A', 5, { status: 'not_started' });
      // No startDate → root uses today directly (no clamping needed)
      const result = schedule(fullParams([item], [], '2026-01-10'));

      const si = result.scheduledItems[0];
      expect(si.scheduledStartDate).toBe('2026-01-10');
      expect(si.isLate).toBe(false); // No clamping occurred
    });

    it('isLate = false for completed items (no floor applies to completed status)', () => {
      const item = makeItem('A', 5, {
        status: 'completed',
        startDate: '2025-01-01',
        endDate: '2025-01-06',
      });
      const result = schedule(fullParams([item], [], '2026-01-10'));

      const si = result.scheduledItems[0];
      // Completed items don't get today floor applied
      expect(si.isLate).toBe(false);
    });

    it('isLate = false for items with actualStartDate (Rule 1 applies)', () => {
      // Rule 1 sets isLate = false unconditionally
      const item = makeItem('A', 5, {
        status: 'in_progress',
        actualStartDate: '2025-12-01',
        actualEndDate: null,
      });
      const result = schedule(fullParams([item], [], '2026-01-10'));

      const si = result.scheduledItems[0];
      expect(si.isLate).toBe(false);
    });
  });
});
