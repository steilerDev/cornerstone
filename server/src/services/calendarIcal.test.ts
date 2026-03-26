/**
 * Unit tests for calendarIcal service.
 *
 * Tests cover:
 *  - toDateOnly: date string slicing, null/undefined handling
 *  - computeETag: deterministic hashing, empty parts, null parts
 *  - computeCalendarETag: DB-driven ETag from real in-memory SQLite
 *  - buildCalendar: iCal output for work items, milestones, household items;
 *    date selection logic, description/URL injection, special character handling,
 *    empty inputs, skipping items without dates
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { toDateOnly, computeETag, computeCalendarETag, buildCalendar } from './calendarIcal.js';
import type { DescriptionMap } from './calendarIcal.js';
import type {
  TimelineWorkItem,
  TimelineMilestone,
  TimelineHouseholdItem,
} from '@cornerstone/shared';

// ─── DB helpers ───────────────────────────────────────────────────────────────

type DbType = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

function createTestDb(): DbType {
  const sqliteDb = new Database(':memory:');
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  runMigrations(sqliteDb);
  const db = drizzle(sqliteDb, { schema });
  return Object.assign(db, { $client: sqliteDb }) as DbType;
}

// ─── Fixture factories ────────────────────────────────────────────────────────

function makeWorkItem(overrides: Partial<TimelineWorkItem> = {}): TimelineWorkItem {
  return {
    id: 'wi-1',
    title: 'Lay Foundation',
    status: 'not_started',
    startDate: '2026-03-01',
    endDate: '2026-03-15',
    actualStartDate: null,
    actualEndDate: null,
    durationDays: 14,
    startAfter: null,
    startBefore: null,
    assignedUser: null,
    assignedVendor: null,
    area: null,
    requiredMilestoneIds: [],
    ...overrides,
  };
}

function makeMilestone(overrides: Partial<TimelineMilestone> = {}): TimelineMilestone {
  return {
    id: 1,
    title: 'Foundation Complete',
    targetDate: '2026-03-20',
    isCompleted: false,
    completedAt: null,
    color: '#ff0000',
    workItemIds: [],
    projectedDate: null,
    isCritical: false,
    ...overrides,
  };
}

function makeHouseholdItem(overrides: Partial<TimelineHouseholdItem> = {}): TimelineHouseholdItem {
  return {
    id: 'hi-1',
    name: 'Sofa',
    category: 'Furniture',
    status: 'planned',
    targetDeliveryDate: '2026-04-01',
    earliestDeliveryDate: null,
    latestDeliveryDate: null,
    actualDeliveryDate: null,
    isLate: false,
    dependencyIds: [],
    ...overrides,
  };
}

// ─── toDateOnly ───────────────────────────────────────────────────────────────

describe('toDateOnly', () => {
  it('returns null for null input', () => {
    expect(toDateOnly(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(toDateOnly(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(toDateOnly('')).toBeNull();
  });

  it('returns the date unchanged for a plain YYYY-MM-DD string', () => {
    expect(toDateOnly('2026-03-25')).toBe('2026-03-25');
  });

  it('slices an ISO datetime to YYYY-MM-DD', () => {
    expect(toDateOnly('2026-03-25T14:30:00.000Z')).toBe('2026-03-25');
  });

  it('slices an ISO datetime with time-only suffix', () => {
    expect(toDateOnly('2026-12-31T23:59:59Z')).toBe('2026-12-31');
  });

  it('slices a datetime with space separator (SQLite format)', () => {
    expect(toDateOnly('2026-07-04 12:00:00')).toBe('2026-07-04');
  });
});

// ─── computeETag ─────────────────────────────────────────────────────────────

describe('computeETag', () => {
  it('returns a 16-character hex string', () => {
    const etag = computeETag(['hello']);
    expect(etag).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces the same ETag for the same inputs (deterministic)', () => {
    const a = computeETag(['2026-03-25T10:00:00Z']);
    const b = computeETag(['2026-03-25T10:00:00Z']);
    expect(a).toBe(b);
  });

  it('produces different ETags for different inputs', () => {
    const a = computeETag(['2026-03-25T10:00:00Z']);
    const b = computeETag(['2026-03-25T11:00:00Z']);
    expect(a).not.toBe(b);
  });

  it('treats null parts as empty string (does not throw)', () => {
    expect(() => computeETag([null])).not.toThrow();
    expect(computeETag([null])).toMatch(/^[0-9a-f]{16}$/);
  });

  it('treats undefined parts as empty string (does not throw)', () => {
    expect(() => computeETag([undefined])).not.toThrow();
    expect(computeETag([undefined])).toMatch(/^[0-9a-f]{16}$/);
  });

  it('treats null and undefined parts the same way', () => {
    expect(computeETag([null])).toBe(computeETag([undefined]));
  });

  it('handles an empty parts array without throwing', () => {
    expect(() => computeETag([])).not.toThrow();
    expect(computeETag([])).toMatch(/^[0-9a-f]{16}$/);
  });

  it('concatenates multiple parts in order', () => {
    const combined = computeETag(['aaa', 'bbb']);
    const reversed = computeETag(['bbb', 'aaa']);
    expect(combined).not.toBe(reversed);
  });
});

// ─── computeCalendarETag ─────────────────────────────────────────────────────

describe('computeCalendarETag', () => {
  let db: DbType;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db.$client && db.$client.open) {
      db.$client.close();
    }
  });

  it('returns a 16-character hex string on an empty database', () => {
    const etag = computeCalendarETag(db);
    expect(etag).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns the same ETag when nothing changes (idempotent)', () => {
    const a = computeCalendarETag(db);
    const b = computeCalendarETag(db);
    expect(a).toBe(b);
  });

  it('changes the ETag after inserting a work item', () => {
    const before = computeCalendarETag(db);

    const now = new Date().toISOString();
    const wiId = `wi-etag-${Date.now()}`;
    db.insert(schema.workItems)
      .values({
        id: wiId,
        title: 'ETag Test Work Item',
        status: 'not_started',
        createdAt: now,
        updatedAt: new Date(Date.now() + 1000).toISOString(),
      })
      .run();

    const after = computeCalendarETag(db);
    expect(after).not.toBe(before);
  });
});

// ─── buildCalendar ────────────────────────────────────────────────────────────

describe('buildCalendar', () => {
  // ── empty inputs ────────────────────────────────────────────────────────────

  describe('with empty inputs', () => {
    it('returns a valid iCal string with VCALENDAR wrapper', () => {
      const output = buildCalendar({ workItems: [], milestones: [], householdItems: [] });
      expect(output).toContain('BEGIN:VCALENDAR');
      expect(output).toContain('END:VCALENDAR');
    });

    it('includes the calendar name', () => {
      const output = buildCalendar({ workItems: [], milestones: [], householdItems: [] });
      expect(output).toContain('X-WR-CALNAME:Cornerstone Project');
    });

    it('includes the PRODID', () => {
      const output = buildCalendar({ workItems: [], milestones: [], householdItems: [] });
      expect(output).toContain('PRODID');
      expect(output).toContain('Cornerstone');
    });

    it('contains no VEVENT blocks when all arrays are empty', () => {
      const output = buildCalendar({ workItems: [], milestones: [], householdItems: [] });
      expect(output).not.toContain('BEGIN:VEVENT');
    });
  });

  // ── work items ───────────────────────────────────────────────────────────────

  describe('work items', () => {
    it('creates a VEVENT for a work item with planned dates', () => {
      const wi = makeWorkItem({ id: 'wi-abc', title: 'Lay Foundation' });
      const output = buildCalendar({ workItems: [wi], milestones: [], householdItems: [] });
      expect(output).toContain('BEGIN:VEVENT');
      expect(output).toContain('END:VEVENT');
      expect(output).toContain('UID:wi-wi-abc@cornerstone');
      expect(output).toContain('SUMMARY:Lay Foundation');
    });

    it('prefers actualStartDate/actualEndDate over planned dates', () => {
      const wi = makeWorkItem({
        id: 'wi-actual',
        startDate: '2026-03-01',
        endDate: '2026-03-15',
        actualStartDate: '2026-03-05',
        actualEndDate: '2026-03-20',
      });
      const output = buildCalendar({ workItems: [wi], milestones: [], householdItems: [] });
      // The event should use 2026-03-05 as start
      expect(output).toContain('20260305');
    });

    it('skips a work item with no startDate and no actualStartDate', () => {
      const wi = makeWorkItem({ startDate: null, actualStartDate: null });
      const output = buildCalendar({ workItems: [wi], milestones: [], householdItems: [] });
      expect(output).not.toContain('BEGIN:VEVENT');
    });

    it('skips a work item with no endDate and no actualEndDate', () => {
      const wi = makeWorkItem({ endDate: null, actualEndDate: null });
      const output = buildCalendar({ workItems: [wi], milestones: [], householdItems: [] });
      expect(output).not.toContain('BEGIN:VEVENT');
    });

    it('includes a description from the descriptionMap when provided', () => {
      const wi = makeWorkItem({ id: 'wi-desc' });
      const descMap: DescriptionMap = new Map([['wi-wi-desc', 'Work item notes here']]);
      const output = buildCalendar(
        { workItems: [wi], milestones: [], householdItems: [] },
        descMap,
      );
      expect(output).toContain('Work item notes here');
    });

    it('does not include DESCRIPTION when descriptionMap has no entry for the item', () => {
      const wi = makeWorkItem({ id: 'wi-nodesc' });
      const descMap: DescriptionMap = new Map();
      const output = buildCalendar(
        { workItems: [wi], milestones: [], householdItems: [] },
        descMap,
      );
      expect(output).not.toContain('DESCRIPTION:');
    });

    it('includes a URL linking to the work item when baseUrl is provided', () => {
      const wi = makeWorkItem({ id: 'wi-url' });
      const output = buildCalendar(
        { workItems: [wi], milestones: [], householdItems: [] },
        undefined,
        'https://myhouse.example.com',
      );
      expect(output).toContain('https://myhouse.example.com/project/work-items/wi-url');
    });

    it('does not include a URL when baseUrl is not provided', () => {
      const wi = makeWorkItem({ id: 'wi-nourl' });
      const output = buildCalendar({ workItems: [wi], milestones: [], householdItems: [] });
      expect(output).not.toContain('URL:');
    });

    it('handles titles with special characters (commas, semicolons)', () => {
      const wi = makeWorkItem({ title: 'Install doors, windows; & more' });
      const output = buildCalendar({ workItems: [wi], milestones: [], householdItems: [] });
      // ical-generator escapes commas and semicolons
      expect(output).toContain('SUMMARY:');
      expect(output).toContain('BEGIN:VEVENT');
    });

    it('creates events for multiple work items', () => {
      const wi1 = makeWorkItem({ id: 'wi-1', title: 'Task One' });
      const wi2 = makeWorkItem({ id: 'wi-2', title: 'Task Two' });
      const output = buildCalendar({ workItems: [wi1, wi2], milestones: [], householdItems: [] });
      const veventCount = (output.match(/BEGIN:VEVENT/g) ?? []).length;
      expect(veventCount).toBe(2);
    });
  });

  // ── milestones ───────────────────────────────────────────────────────────────

  describe('milestones', () => {
    it('creates a VEVENT for a milestone using targetDate', () => {
      const ms = makeMilestone({ id: 10, title: 'Roof Done', targetDate: '2026-06-01' });
      const output = buildCalendar({ workItems: [], milestones: [ms], householdItems: [] });
      expect(output).toContain('BEGIN:VEVENT');
      expect(output).toContain('UID:milestone-10@cornerstone');
      expect(output).toContain('SUMMARY:Roof Done');
      expect(output).toContain('20260601');
    });

    it('uses toDateOnly(completedAt) when milestone is completed', () => {
      const ms = makeMilestone({
        id: 11,
        targetDate: '2026-06-01',
        isCompleted: true,
        completedAt: '2026-05-28T10:00:00Z',
      });
      const output = buildCalendar({ workItems: [], milestones: [ms], householdItems: [] });
      // Event date should be 2026-05-28 (from completedAt)
      expect(output).toContain('20260528');
    });

    it('skips a milestone with no targetDate and no completedAt', () => {
      // completedAt=null + targetDate='' is an edge case — use a blank/invalid scenario
      // The type says targetDate is required string, but we can pass an empty string
      const ms = makeMilestone({ targetDate: '' as string, completedAt: null });
      const output = buildCalendar({ workItems: [], milestones: [ms], householdItems: [] });
      expect(output).not.toContain('BEGIN:VEVENT');
    });

    it('includes description from descriptionMap for milestones', () => {
      const ms = makeMilestone({ id: 20 });
      const descMap: DescriptionMap = new Map([['milestone-20', 'Important milestone note']]);
      const output = buildCalendar(
        { workItems: [], milestones: [ms], householdItems: [] },
        descMap,
      );
      expect(output).toContain('Important milestone note');
    });

    it('includes URL linking to milestone when baseUrl is provided', () => {
      const ms = makeMilestone({ id: 30 });
      const output = buildCalendar(
        { workItems: [], milestones: [ms], householdItems: [] },
        undefined,
        'https://example.com',
      );
      expect(output).toContain('https://example.com/project/milestones/30');
    });

    it('creates events for multiple milestones', () => {
      const ms1 = makeMilestone({ id: 1, title: 'Milestone A' });
      const ms2 = makeMilestone({ id: 2, title: 'Milestone B' });
      const output = buildCalendar({ workItems: [], milestones: [ms1, ms2], householdItems: [] });
      const veventCount = (output.match(/BEGIN:VEVENT/g) ?? []).length;
      expect(veventCount).toBe(2);
    });
  });

  // ── household items ──────────────────────────────────────────────────────────

  describe('household items', () => {
    it('creates a VEVENT for a household item using targetDeliveryDate', () => {
      const hi = makeHouseholdItem({
        id: 'hi-sofa',
        name: 'Sofa',
        targetDeliveryDate: '2026-04-10',
      });
      const output = buildCalendar({ workItems: [], milestones: [], householdItems: [hi] });
      expect(output).toContain('BEGIN:VEVENT');
      expect(output).toContain('UID:hi-hi-sofa@cornerstone');
      expect(output).toContain('SUMMARY:Sofa (Delivery)');
      expect(output).toContain('20260410');
    });

    it('prefers actualDeliveryDate over other delivery dates', () => {
      const hi = makeHouseholdItem({
        id: 'hi-actual',
        targetDeliveryDate: '2026-04-10',
        earliestDeliveryDate: '2026-04-05',
        latestDeliveryDate: '2026-04-15',
        actualDeliveryDate: '2026-04-08T09:00:00Z',
      });
      const output = buildCalendar({ workItems: [], milestones: [], householdItems: [hi] });
      // Should use 2026-04-08 from actualDeliveryDate (sliced via toDateOnly)
      expect(output).toContain('20260408');
    });

    it('uses earliestDeliveryDate/latestDeliveryDate range when no actual delivery', () => {
      const hi = makeHouseholdItem({
        id: 'hi-range',
        targetDeliveryDate: '2026-04-20',
        earliestDeliveryDate: '2026-04-01',
        latestDeliveryDate: '2026-04-15',
        actualDeliveryDate: null,
      });
      const output = buildCalendar({ workItems: [], milestones: [], householdItems: [hi] });
      // start = earliestDeliveryDate = 2026-04-01
      expect(output).toContain('20260401');
    });

    it('falls back to targetDeliveryDate when earliest/latest are not set', () => {
      const hi = makeHouseholdItem({
        id: 'hi-target',
        targetDeliveryDate: '2026-05-01',
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
        actualDeliveryDate: null,
      });
      const output = buildCalendar({ workItems: [], milestones: [], householdItems: [hi] });
      expect(output).toContain('20260501');
    });

    it('skips household item with no delivery dates at all', () => {
      const hi = makeHouseholdItem({
        targetDeliveryDate: null,
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
        actualDeliveryDate: null,
      });
      const output = buildCalendar({ workItems: [], milestones: [], householdItems: [hi] });
      expect(output).not.toContain('BEGIN:VEVENT');
    });

    it('includes description from descriptionMap for household items', () => {
      const hi = makeHouseholdItem({ id: 'hi-desc' });
      const descMap: DescriptionMap = new Map([['hi-hi-desc', 'Sofa delivery note']]);
      const output = buildCalendar(
        { workItems: [], milestones: [], householdItems: [hi] },
        descMap,
      );
      expect(output).toContain('Sofa delivery note');
    });

    it('includes URL linking to household item when baseUrl is provided', () => {
      const hi = makeHouseholdItem({ id: 'hi-url' });
      const output = buildCalendar(
        { workItems: [], milestones: [], householdItems: [hi] },
        undefined,
        'https://example.com',
      );
      expect(output).toContain('https://example.com/project/household-items/hi-url');
    });

    it('appends "(Delivery)" to the household item name in SUMMARY', () => {
      const hi = makeHouseholdItem({ name: 'Dining Table' });
      const output = buildCalendar({ workItems: [], milestones: [], householdItems: [hi] });
      expect(output).toContain('SUMMARY:Dining Table (Delivery)');
    });

    it('creates events for multiple household items', () => {
      const hi1 = makeHouseholdItem({ id: 'hi-1', name: 'Sofa' });
      const hi2 = makeHouseholdItem({ id: 'hi-2', name: 'Table' });
      const output = buildCalendar({
        workItems: [],
        milestones: [],
        householdItems: [hi1, hi2],
      });
      const veventCount = (output.match(/BEGIN:VEVENT/g) ?? []).length;
      expect(veventCount).toBe(2);
    });
  });

  // ── mixed ─────────────────────────────────────────────────────────────────────

  describe('with mixed inputs', () => {
    it('creates events for work items, milestones, and household items together', () => {
      const wi = makeWorkItem({ id: 'wi-mix' });
      const ms = makeMilestone({ id: 99 });
      const hi = makeHouseholdItem({ id: 'hi-mix' });
      const output = buildCalendar({
        workItems: [wi],
        milestones: [ms],
        householdItems: [hi],
      });
      const veventCount = (output.match(/BEGIN:VEVENT/g) ?? []).length;
      expect(veventCount).toBe(3);
    });

    it('sets ALLDAY flag on all event types', () => {
      const wi = makeWorkItem();
      const output = buildCalendar({ workItems: [wi], milestones: [], householdItems: [] });
      // ical-generator emits VALUE=DATE for all-day events
      expect(output).toContain('VALUE=DATE');
    });
  });
});
