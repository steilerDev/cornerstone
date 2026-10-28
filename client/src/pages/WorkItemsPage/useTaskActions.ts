import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorkItemListRow, WorkItemStatus } from '@cornerstone/shared';
import { dataTableTestId } from '../../components/DataTable/dataTableTestId.js';
import { useListRowDelete } from '../../hooks/useListRowDelete.js';
import type { ListRowDeletion } from '../../hooks/useListRowDelete.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { changeWorkItemStatus, workItemStatusBody } from '../../lib/statusChangeApi.js';
import { deleteWorkItem, updateWorkItem } from '../../lib/workItemsApi.js';
import type { RefreshedFigures } from './useTasksList.js';

/** What the row and bulk actions need from the list host. */
export interface TaskActionsHost {
  /** Fresh rows and counts for these row keys, without a reload. */
  readonly refreshRows: (keys: readonly string[]) => Promise<RefreshedFigures | null>;
  /** Reload from the first batch (after Undo). */
  readonly refresh: () => void;
  /** The page h1: where focus goes when the control that had it is gone. */
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  /** The key of the list's current query (the bulk banner belongs to the query it ran under). */
  readonly queryKey: () => string;
}

export interface TaskActions {
  /** Not started to In progress (Start) or In progress to Done (Mark done), with the chosen date. */
  readonly applyStatus: (
    item: WorkItemListRow,
    to: WorkItemStatus,
    date: string | null,
  ) => Promise<void>;
  readonly reopen: (item: WorkItemListRow) => Promise<void>;
  readonly requestDelete: (item: WorkItemListRow) => void;
  readonly bulkSetStatus: (
    items: readonly WorkItemListRow[],
    to: WorkItemStatus,
    clear: () => void,
  ) => Promise<void>;
  readonly bulkSetArea: (
    items: readonly WorkItemListRow[],
    areaId: string,
    clear: () => void,
  ) => Promise<void>;
}

export type TaskDeletion = ListRowDeletion<WorkItemListRow>;

export interface UseTaskActionsResult {
  readonly actions: TaskActions;
  /** For the list's one status region; a new `key` is spoken once. */
  readonly announcement: { readonly key: number; readonly text: string } | null;
  /** The partial-failure banner of a bulk run. */
  readonly bulkError: string | null;
  readonly deletion: TaskDeletion;
}

/**
 * The Tasks list's changes: the row command (Start, Mark done, Reopen) with Undo, delete with
 * its confirmation, and the two bulk actions. Each runs its requests, then refreshes the
 * affected rows in place and announces the result.
 */
export function useTaskActions(host: TaskActionsHost): UseTaskActionsResult {
  const { t } = useTranslation('workItems');
  const statusVariants = useStatusBadgeVariants();
  const { run } = useUndoableStatusChange();
  const hostRef = useRef(host);
  hostRef.current = host;

  const [announcement, setAnnouncement] = useState<{
    readonly key: number;
    readonly text: string;
  } | null>(null);
  const announce = useCallback((text: string) => {
    setAnnouncement((previous) => ({ key: (previous?.key ?? 0) + 1, text }));
  }, []);
  const [bulkFailure, setBulkFailure] = useState<{
    readonly text: string;
    readonly queryKey: string;
  } | null>(null);

  // After a bulk run the bar unmounts: focus goes to the first visible title that was not acted
  // on, else the h1. Requested with a tick so the effect runs after the selection cleared.
  const focusSkipRef = useRef<ReadonlySet<string> | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => {
    const skip = focusSkipRef.current;
    if (skip === null) return;
    focusSkipRef.current = null;
    const titles = document.querySelectorAll<HTMLElement>('a[data-testid^="tasks-title-"]');
    // Table and cards are both mounted and the inactive one is hidden by CSS: take the first
    // title that really accepts focus, else the h1.
    for (const element of titles) {
      if (skip.has(element.dataset.testid as string)) continue;
      element.focus();
      if (document.activeElement === element) return;
    }
    (hostRef.current.headingRef.current as HTMLElement).focus();
  }, [focusTick]);

  /** "‹title› started." and, when the Time grouping is on, " Late now n." from the fresh counts. */
  const announceChange = useCallback(
    (text: string, figures: RefreshedFigures | null) => {
      const late = figures?.lateCount ?? null;
      announce(late !== null ? `${text} ${t('list.announce.lateNow', { count: late })}` : text);
    },
    [announce, t],
  );

  const changeStatus = useCallback(
    async (
      item: WorkItemListRow,
      to: WorkItemStatus,
      date: string | null,
      doneText: string,
    ): Promise<void> => {
      let refreshed: Promise<void> | undefined;
      await run({
        request: () => changeWorkItemStatus(item.id, workItemStatusBody(to, date)),
        recordName: item.title,
        statusLabel: statusVariants.task[to].label,
        dedupeKey: `task:${item.id}`,
        onChanged: () => {
          refreshed = hostRef.current
            .refreshRows([item.id])
            .then((figures) => announceChange(doneText, figures));
        },
        onUndone: () => hostRef.current.refresh(),
        focusFallback: () => hostRef.current.headingRef.current,
      });
      await refreshed;
    },
    [run, statusVariants, announceChange],
  );

  const applyStatus = useCallback(
    (item: WorkItemListRow, to: WorkItemStatus, date: string | null) =>
      changeStatus(
        item,
        to,
        date,
        to === 'completed'
          ? t('list.announce.markedDone', { title: item.title })
          : t('list.announce.started', { title: item.title }),
      ),
    [changeStatus, t],
  );

  const reopen = useCallback(
    (item: WorkItemListRow) =>
      changeStatus(item, 'in_progress', null, t('list.announce.reopened', { title: item.title })),
    [changeStatus, t],
  );

  // --- Bulk ---
  const runBulk = useCallback(
    async (
      eligible: readonly WorkItemListRow[],
      request: (item: WorkItemListRow) => Promise<unknown>,
      clear: () => void,
    ) => {
      setBulkFailure(null);
      if (eligible.length === 0) {
        clear();
        return;
      }
      const results = await Promise.allSettled(eligible.map(request));
      const done = eligible.filter((_item, index) => results[index]!.status === 'fulfilled');
      const figures = await hostRef.current.refreshRows(done.map((item) => item.id));
      const summary = t('list.bulk.updated', { count: done.length, total: eligible.length });
      if (done.length === eligible.length) {
        announceChange(summary, figures);
        // Title testids of the acted rows on both surfaces (the one in use is hidden-agnostic).
        focusSkipRef.current = new Set(
          eligible.flatMap((item) => [
            dataTableTestId('tasks-title', item.id, 'table'),
            dataTableTestId('tasks-title', item.id, 'card'),
          ]),
        );
        clear();
        setFocusTick((tick) => tick + 1);
        return;
      }
      // Partly failed: the selection and the bar stay, so the rest can be tried again.
      const partial = t('list.bulk.partial', { count: done.length, total: eligible.length });
      setBulkFailure({ text: partial, queryKey: hostRef.current.queryKey() });
      announce(partial);
    },
    [t, announce, announceChange],
  );

  const bulkSetStatus = useCallback(
    (items: readonly WorkItemListRow[], to: WorkItemStatus, clear: () => void) =>
      runBulk(
        items.filter((item) => item.status !== to),
        (item) => updateWorkItem(item.id, { status: to }),
        clear,
      ),
    [runBulk],
  );

  const bulkSetArea = useCallback(
    (items: readonly WorkItemListRow[], areaId: string, clear: () => void) =>
      runBulk(
        items.filter((item) => item.area?.id !== areaId),
        (item) => updateWorkItem(item.id, { areaId }),
        clear,
      ),
    [runBulk],
  );

  // --- Delete ---
  const { request: requestDelete, deletion } = useListRowDelete<WorkItemListRow>({
    remove: (item) => deleteWorkItem(item.id),
    onDeleted: (item) => {
      void hostRef.current.refreshRows([item.id]);
    },
  });

  const actions = useMemo(
    (): TaskActions => ({ applyStatus, reopen, requestDelete, bulkSetStatus, bulkSetArea }),
    [applyStatus, reopen, requestDelete, bulkSetStatus, bulkSetArea],
  );
  // Shown only under the query it happened in (compared at render, no effect).
  const bulkError =
    bulkFailure && bulkFailure.queryKey === host.queryKey() ? bulkFailure.text : null;

  return { actions, announcement, bulkError, deletion };
}
