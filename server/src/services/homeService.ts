/**
 * Home service (#2230, EPIC-21 contract 24): read-only aggregates behind `/api/home/*`.
 *
 * - `getHomeWeek`: dated items (starts, ends, payments, deliveries, milestones) from today to
 *   today + 20, built from the same projection, open payments and purchase-date rules as the
 *   attention service. A constant number of bulk queries, never per row.
 * - `getHomePulse`: money figures verbatim from the money service; progress counts from the
 *   same `listWorkItems` query the Tasks list runs.
 * - `getHomeSetup`: which set-up steps are done.
 *
 * "Today" is one UTC date per request (injected `now`). No money figure is computed here.
 */

import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  HOME_AGENDA_DAYS,
  HOME_AGENDA_KINDS,
  HOME_SETUP_ADMIN_STEPS,
  HOME_SETUP_CORE_STEPS,
  HOME_SETUP_STEPS,
} from '@cornerstone/shared';
import type {
  AreaSummary,
  HomeAgendaItem,
  HomeAgendaKind,
  HomePulseResponse,
  HomeSetupResponse,
  HomeSetupStep,
  HomeSetupStepState,
  HomeWeekResponse,
} from '@cornerstone/shared';
import { loadAreaMap, resolveAreaAncestors } from './areaService.js';
import { getHouseholdSettings } from './appSettingsService.js';
import { listBackups } from './backupService.js';
import { computeProjectMoney, getBreakdownMoney, listOpenPayments } from './moneyService.js';
import {
  loadScheduleGraph,
  projectSchedule,
  shownWorkItemDates,
  workItemProjectionOf,
} from './schedulingEngine.js';
import { listWorkItems } from './workItemService.js';
import { attentionLinkOf } from './shared/attentionLinks.js';
import { addDaysUtc, buildScheduleIndex, heldUpCauseOf } from './shared/holdsUp.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

export interface HomeWeekOptions {
  /** Injected clock; defaults to the current instant. */
  now?: Date;
}

export interface HomeSetupOptions {
  isAdmin: boolean;
  config: { vatRate: number; backupDir: string; backupCadence?: string };
  /** Receives backup-check failures (never the path). */
  logger?: { warn: (obj: Record<string, unknown>, msg: string) => void };
}

const kindOrder = (kind: HomeAgendaKind): number => HOME_AGENDA_KINDS.indexOf(kind);
const labelCollator = new Intl.Collator(undefined, { sensitivity: 'base' });

/** Date, then kind, then label (accent- and case-insensitive), then subject id (unique per kind). */
function compareItems(a: HomeAgendaItem, b: HomeAgendaItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const kind = kindOrder(a.kind) - kindOrder(b.kind);
  if (kind !== 0) return kind;
  const label = labelCollator.compare(a.subject.label ?? '', b.subject.label ?? '');
  if (label !== 0) return label;
  return a.subject.id < b.subject.id ? -1 : 1;
}

export function getHomeWeek(db: DbType, opts: HomeWeekOptions = {}): HomeWeekResponse {
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const from = today;
  const to = addDaysUtc(today, HOME_AGENDA_DAYS - 1);
  const inRange = (d: string | null): d is string => d !== null && d >= from && d <= to;

  const graph = loadScheduleGraph(db);
  const projection = projectSchedule(graph, today);
  const index = buildScheduleIndex(graph);
  const criticalSet = new Set(projection.criticalPath);

  const areaMap = loadAreaMap(db);
  const areaCache = new Map<string, AreaSummary>();
  const areaOf = (areaId: string | null): AreaSummary | null => {
    if (areaId === null) return null;
    const cached = areaCache.get(areaId);
    if (cached) return cached;
    const area = areaMap.get(areaId);
    if (!area) return null;
    const summary: AreaSummary = {
      id: area.id,
      name: area.name,
      color: area.color,
      ancestors: resolveAreaAncestors(areaId, areaMap),
    };
    areaCache.set(areaId, summary);
    return summary;
  };

  const items: HomeAgendaItem[] = [];

  // Tasks: starts and ends
  const taskRows = db.all<{
    id: string;
    title: string;
    status: string;
    startDate: string | null;
    endDate: string | null;
    actualStartDate: string | null;
    actualEndDate: string | null;
    areaId: string | null;
    companyName: string | null;
  }>(
    sql`SELECT
      w.id                AS id,
      w.title             AS title,
      w.status            AS status,
      w.start_date        AS startDate,
      w.end_date          AS endDate,
      w.actual_start_date AS actualStartDate,
      w.actual_end_date   AS actualEndDate,
      w.area_id           AS areaId,
      v.name              AS companyName
    FROM work_items w
    LEFT JOIN vendors v ON v.id = w.assigned_vendor_id
    ORDER BY w.rowid`,
  );
  const titleById = new Map<string, string>();
  for (const row of taskRows) titleById.set(row.id, row.title);

  for (const row of taskRows) {
    if (row.status === 'completed') continue;
    const fields = workItemProjectionOf(projection, row);
    const shown = shownWorkItemDates(row, fields);

    // Undated sides stay off the agenda: the projection gives an undated task today's date, but
    // a start/end is listed only when that side has a stored planned date.
    const startsInRange =
      row.status === 'not_started' && row.startDate !== null && inRange(shown.start);
    const endsInRange = row.endDate !== null && row.actualEndDate === null && inRange(shown.end);
    if (!startsInRange && !endsInRange) continue;

    const causeId = fields.isHeldUp ? heldUpCauseOf(index, row.id, projection) : null;
    const heldUpBy = causeId !== null ? { id: causeId, label: titleById.get(causeId)! } : null;
    const subject = {
      type: 'work_item' as const,
      id: row.id,
      label: row.title,
      area: areaOf(row.areaId),
    };
    const link = attentionLinkOf({ rule: 'N1', subjectId: row.id });
    const schedule = {
      isLate: fields.isLate,
      lateDays: fields.lateDays,
      isHeldUp: fields.isHeldUp,
      isCritical: criticalSet.has(row.id),
    };
    const make = (kind: 'starts' | 'ends', date: string): HomeAgendaItem => ({
      key: `${kind}:work_item:${row.id}`,
      kind,
      date,
      subject,
      link,
      companyName: row.companyName,
      amount: null,
      recordKind: null,
      schedule,
      heldUpBy,
    });
    if (startsInRange) items.push(make('starts', shown.start!));
    if (endsInRange) items.push(make('ends', shown.end!));
  }

  // Payments: open payments with a due date in range (same subjects and links as N4/N5)
  for (const item of listOpenPayments(db)) {
    if (!inRange(item.dueDate)) continue;
    const isProgress = item.kind === 'progress' && item.depositId !== null;
    const subjectId = isProgress ? item.depositId! : item.invoiceId;
    items.push({
      key: `payment:${isProgress ? 'progress_payment' : 'invoice'}:${subjectId}`,
      kind: 'payment',
      date: item.dueDate,
      subject: {
        type: isProgress ? 'progress_payment' : 'invoice',
        id: subjectId,
        label: item.invoiceNumber,
        area: null,
      },
      link: attentionLinkOf({
        rule: 'N5',
        subjectId,
        invoiceId: item.invoiceId,
        ...(isProgress ? { depositId: item.depositId! } : {}),
      }),
      companyName: item.vendorName,
      amount: item.amount,
      recordKind: item.invoiceStatus === 'quotation' ? 'offer' : 'invoice',
      schedule: null,
      heldUpBy: null,
    });
  }

  // Deliveries: not yet arrived; date = latest ?? earliest ?? target (the N10 row date)
  const purchaseRows = db.all<{
    id: string;
    name: string;
    targetDeliveryDate: string | null;
    earliestDeliveryDate: string | null;
    latestDeliveryDate: string | null;
    areaId: string | null;
    companyName: string | null;
  }>(
    sql`SELECT
      h.id                     AS id,
      h.name                   AS name,
      h.target_delivery_date   AS targetDeliveryDate,
      h.earliest_delivery_date AS earliestDeliveryDate,
      h.latest_delivery_date   AS latestDeliveryDate,
      h.area_id                AS areaId,
      v.name                   AS companyName
    FROM household_items h
    LEFT JOIN vendors v ON v.id = h.vendor_id
    WHERE h.status != 'arrived' AND h.actual_delivery_date IS NULL`,
  );
  for (const p of purchaseRows) {
    const date = p.latestDeliveryDate ?? p.earliestDeliveryDate ?? p.targetDeliveryDate;
    if (!inRange(date)) continue;
    items.push({
      key: `delivery:household_item:${p.id}`,
      kind: 'delivery',
      date,
      subject: { type: 'household_item', id: p.id, label: p.name, area: areaOf(p.areaId) },
      link: attentionLinkOf({ rule: 'N10', subjectId: p.id }),
      companyName: p.companyName,
      amount: null,
      recordKind: null,
      schedule: null,
      heldUpBy: null,
    });
  }

  // Milestones: not reached, target date in range
  const milestoneRows = db.all<{ id: number; title: string; targetDate: string }>(
    sql`SELECT id AS id, title AS title, target_date AS targetDate
    FROM milestones
    WHERE is_completed = 0 AND completed_at IS NULL
      AND target_date >= ${from} AND target_date <= ${to}`,
  );
  for (const m of milestoneRows) {
    const id = String(m.id);
    items.push({
      key: `milestone:milestone:${id}`,
      kind: 'milestone',
      date: m.targetDate,
      subject: { type: 'milestone', id, label: m.title, area: null },
      link: attentionLinkOf({ rule: 'N3', subjectId: id }),
      companyName: null,
      amount: null,
      recordKind: null,
      schedule: null,
      heldUpBy: null,
    });
  }

  items.sort(compareItems);
  return { today, from, to, items };
}

export function getHomePulse(db: DbType, vatRate: number): HomePulseResponse {
  const money = computeProjectMoney(db, vatRate).summary;
  const total = (status?: 'completed' | 'in_progress'): number =>
    listWorkItems(db, { pageSize: 1, ...(status ? { status } : {}) }).pagination.totalItems;
  return {
    leftToSpend: money.leftToSpend,
    stillToPay: money.stillToPay,
    stillToPayCount: money.stillToPayCount,
    progress: { total: total(), done: total('completed'), inProgress: total('in_progress') },
  };
}

function exists(db: DbType, query: ReturnType<typeof sql>): boolean {
  return db.get<{ found: number } | undefined>(query) !== undefined;
}

export async function getHomeSetup(db: DbType, opts: HomeSetupOptions): Promise<HomeSetupResponse> {
  const { isAdmin, config } = opts;
  const done = new Map<HomeSetupStep, boolean | null>();

  const householdName = getHouseholdSettings(db).householdName?.trim();
  done.set('house', householdName !== undefined && householdName !== '');
  done.set('areas', exists(db, sql`SELECT 1 AS found FROM areas LIMIT 1`));
  done.set(
    'funding',
    exists(
      db,
      sql`SELECT 1 AS found FROM budget_sources WHERE status = 'active' AND total_amount > 0 LIMIT 1`,
    ),
  );
  done.set('companies', exists(db, sql`SELECT 1 AS found FROM vendors LIMIT 1`));

  // Tasks: a dated task with a money figure. The money run only happens when a dated task exists.
  const datedIds = db
    .all<{ id: string }>(
      sql`SELECT id AS id FROM work_items WHERE start_date IS NOT NULL OR end_date IS NOT NULL`,
    )
    .map((r) => r.id);
  let tasksDone = false;
  if (datedIds.length > 0) {
    const breakdown = getBreakdownMoney(computeProjectMoney(db, config.vatRate));
    tasksDone = datedIds.some((id) => (breakdown.workItems[id]?.expectedCost.expected ?? 0) > 0);
  }
  done.set('tasks', tasksDone);

  done.set(
    'firstLog',
    exists(
      db,
      sql`SELECT 1 AS found FROM diary_entries WHERE status = 'saved' AND is_automatic = 0 LIMIT 1`,
    ),
  );

  if (isAdmin) {
    const users = db.get<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM users WHERE deactivated_at IS NULL`,
    );
    done.set('household', users.n > 1);

    if (config.backupCadence?.trim()) {
      done.set('backups', true);
    } else {
      try {
        done.set('backups', (await listBackups(config.backupDir)).length > 0);
      } catch (err) {
        opts.logger?.warn(
          { errorName: err instanceof Error ? err.name : 'unknown' },
          'Home setup: backup directory could not be checked',
        );
        done.set('backups', null);
      }
    }
  }

  const adminSteps: readonly HomeSetupStep[] = HOME_SETUP_ADMIN_STEPS;
  const steps: HomeSetupStepState[] = [];
  for (const id of HOME_SETUP_STEPS) {
    if (!isAdmin && adminSteps.includes(id)) continue;
    steps.push({ id, done: done.get(id) as boolean | null });
  }
  const coreComplete = HOME_SETUP_CORE_STEPS.every((id) => done.get(id) === true);
  return { coreComplete, steps };
}
