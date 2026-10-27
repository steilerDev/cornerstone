/**
 * History feed types (contract 17, ADR-040 §6, #2224).
 */

import type { PaginatedResponse } from './pagination.js';
import type { DiaryEntrySummary } from './diary.js';

/** History type filter values, in chip order. Seven stored automatic types plus two derived ones. */
export const HISTORY_EVENT_TYPES = [
  'work_item_status',
  'invoice_status',
  'payment',
  'submission',
  'subsidy_status',
  'invoice_created',
  'milestone_delay',
  'budget_breach',
  'auto_reschedule',
] as const;
export type HistoryEventType = (typeof HISTORY_EVENT_TYPES)[number];

/** Objects whose history can be filtered (the History object filter). */
export const HISTORY_OBJECT_TYPES = [
  'work_item',
  'invoice',
  'milestone',
  'subsidy_program',
  'budget_source',
] as const;
export type HistoryObjectType = (typeof HISTORY_OBJECT_TYPES)[number];

/** Query of GET /api/history (contract 17). */
export interface HistoryQuery {
  page?: number;
  pageSize?: number;
  /** Comma-separated HISTORY_EVENT_TYPES values. */
  type?: string;
  /** Both or neither. */
  entityType?: HistoryObjectType;
  entityId?: string;
  batchId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  /** Also return people's saved diary entries. */
  includeDiary?: boolean;
  /** Any user: R1 off (rows carry hidden: true), R2 and batch collapse on. */
  showHidden?: boolean;
  /** Admins only: raw rows (R1, R2 and batch collapse off). */
  includeHidden?: boolean;
}

/** The filtered object, echoed back so the client can name it after a reload. */
export interface HistoryObjectRef {
  entityType: HistoryObjectType;
  entityId: string;
  /** Live name (task/milestone title, invoice number, grant name); null when gone or unnamed. */
  title: string | null;
  exists: boolean;
}

/** Items are diary entry summaries; submission rows carry `batch`. */
export type HistoryListResponse = PaginatedResponse<DiaryEntrySummary> & {
  /** R1 rows after collapse that match the filters (always present). */
  hiddenCount: number;
  /** Set when entityType/entityId were given. */
  object: HistoryObjectRef | null;
};
