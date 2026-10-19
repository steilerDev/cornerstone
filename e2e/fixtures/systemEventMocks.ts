/**
 * Mock builders for system events (automatic diary entries, #2223).
 *
 * Version 1 rows carry parameters, never English text: `title` is null and `body` is ''. The
 * client renders the sentence in the UI language from `metadata`. Synthetic data only.
 */

export interface MockSystemEventOptions {
  id?: string;
  entryType?: string;
  entryDate?: string;
  createdAt?: string;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  sourceEntityTitle?: string | null;
  sourceEntityExists?: boolean;
  metadata?: Record<string, unknown> | null;
  repeat?: { count: number; firstAt: string; lastAt: string };
  hidden?: boolean;
  title?: string | null;
  body?: string;
}

/** A version 1 task status change ("Kitchen Installation went from Not started to In progress"). */
export function mockSystemEvent(options: MockSystemEventOptions = {}): Record<string, unknown> {
  const createdAt = options.createdAt ?? '2026-03-14T09:00:00.000Z';
  return {
    id: options.id ?? 'mock-system-event-001',
    entryType: options.entryType ?? 'work_item_status',
    entryDate: options.entryDate ?? createdAt.slice(0, 10),
    title: options.title ?? null,
    body: options.body ?? '',
    metadata:
      options.metadata === undefined
        ? {
            v: 1,
            event: 'status_changed',
            from: 'not_started',
            to: 'in_progress',
            subjectLabel: 'Kitchen Installation',
          }
        : options.metadata,
    status: 'saved',
    isAutomatic: true,
    isSigned: false,
    sourceEntityType:
      options.sourceEntityType === undefined ? 'work_item' : options.sourceEntityType,
    sourceEntityId: options.sourceEntityId === undefined ? 'wi-kitchen-01' : options.sourceEntityId,
    sourceEntityTitle:
      options.sourceEntityTitle === undefined ? 'Kitchen Installation' : options.sourceEntityTitle,
    sourceEntityExists: options.sourceEntityExists ?? true,
    ...(options.repeat ? { repeat: options.repeat } : {}),
    ...(options.hidden ? { hidden: true } : {}),
    photoCount: 0,
    createdBy: null,
    createdAt,
    updatedAt: createdAt,
  };
}

/** A diary list response body for the mocked `GET /api/diary-entries`. */
export function mockDiaryList(
  items: Array<Record<string, unknown>>,
  hiddenCount = 0,
): Record<string, unknown> {
  return {
    items,
    hiddenCount,
    pagination: {
      page: 1,
      pageSize: 25,
      totalItems: items.length,
      totalPages: 1,
      total: items.length,
    },
  };
}
