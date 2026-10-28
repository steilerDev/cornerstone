import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorkItemListRow, WorkItemStatus } from '@cornerstone/shared';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
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

export interface TaskDeletion {
  /** The task whose delete dialog is open. */
  readonly item: WorkItemListRow | null;
  readonly busy: boolean;
  readonly error: string | null;
  /** 409: the delete cannot go ahead. */
  readonly blocked: boolean;
  readonly confirm: () => void;
  readonly cancel: () => void;
}

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
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
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
      const id = (element.dataset.testid as string).replace(/^tasks-title-(mobile-)?/, '');
      if (skip.has(id)) continue;
      element.focus();
      if (document.activeElement === element) return;
    }
    hostRef.current.headingRef.current?.focus();
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
        focusSkipRef.current = new Set(eligible.map((item) => item.id));
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
  const [deleting, setDeleting] = useState<WorkItemListRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState(false);

  const requestDelete = useCallback((item: WorkItemListRow) => {
    setDeleting(item);
    setDeleteError(null);
    setDeleteBlocked(false);
  }, []);

  const cancelDelete = useCallback(() => {
    if (deleteBusy) return;
    setDeleting(null);
    setDeleteError(null);
  }, [deleteBusy]);

  const confirmDelete = useCallback(() => {
    if (!deleting) return;
    const item = deleting;
    setDeleteBusy(true);
    setDeleteError(null);
    void deleteWorkItem(item.id)
      .then(async () => {
        setDeleting(null);
        await hostRef.current.refreshRows([item.id]);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiClientError) {
          setDeleteBlocked(err.statusCode === 409);
          setDeleteError(translateApiError(err.error.code, tErrors));
        } else if (err instanceof NetworkError) {
          setDeleteError(tCommon('requestErrors.network'));
        } else {
          setDeleteError(tCommon('requestErrors.unexpected'));
        }
      })
      .finally(() => setDeleteBusy(false));
  }, [deleting, tErrors, tCommon]);

  const actions = useMemo(
    (): TaskActions => ({ applyStatus, reopen, requestDelete, bulkSetStatus, bulkSetArea }),
    [applyStatus, reopen, requestDelete, bulkSetStatus, bulkSetArea],
  );
  const deletion = useMemo(
    (): TaskDeletion => ({
      item: deleting,
      busy: deleteBusy,
      error: deleteError,
      blocked: deleteBlocked,
      confirm: confirmDelete,
      cancel: cancelDelete,
    }),
    [deleting, deleteBusy, deleteError, deleteBlocked, confirmDelete, cancelDelete],
  );

  // Shown only under the query it happened in (compared at render, no effect).
  const bulkError =
    bulkFailure && bulkFailure.queryKey === host.queryKey() ? bulkFailure.text : null;

  return { actions, announcement, bulkError, deletion };
}
