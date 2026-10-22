import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { AttentionRow } from '@cornerstone/shared';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useDiscardDraft } from '../../capture/useDiscardDraft.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import shared from '../../styles/shared.module.css';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog.js';
import { useToast } from '../Toast/ToastContext.js';
import { AttentionRowView } from './AttentionRowView.js';
import type { AttentionLeaveReason } from './AttentionRowView.js';
import styles from './AttentionList.module.css';

export interface AttentionListProps {
  rows: readonly AttentionRow[];
  /** The server's date for this computation. */
  today: string;
  /** Rows shown before "Show all (n)"; undefined shows all. */
  initialLimit?: number;
  /** The n in "Show all (n)" (Home passes the section count). */
  totalCount?: number;
  /** Optimistic removal (`useAttention().removeRow`). */
  onRemove: (key: string, reason: AttentionLeaveReason) => void;
  /** Silent refetch (`useAttention().refresh`). */
  onRefresh: () => void;
  /** Focus target when the list becomes empty (the section heading). */
  emptyFocusRef: RefObject<HTMLElement | null>;
  /** Runs before an action navigates (the catch-up dialog closes itself). */
  onNavigate?: () => void;
  /** Show N2 group rows behind a disclosure (default) or with their tasks always listed. */
  showGroups?: boolean;
  listId: string;
  /** e.g. `needs-attention`, `tidy-up`, `catch-up`. */
  testIdPrefix: string;
}

interface PendingFocus {
  index: number;
  /** A dialog restores focus first; focus after it. */
  afterDialog: boolean;
}

/**
 * The rows of "Needs attention" / "Tidy up" (Home, the catch-up dialog, later the bell): wording,
 * status actions with Undo, "Not now" with Undo, group disclosure, the focus rule when a row
 * leaves, and "Show all". It owns no data: the host passes rows and the removal callbacks.
 */
export function AttentionList({
  rows,
  today,
  initialLimit,
  totalCount,
  onRemove,
  onRefresh,
  emptyFocusRef,
  onNavigate,
  showGroups = true,
  listId,
  testIdPrefix,
}: AttentionListProps) {
  const { t } = useTranslation('common');
  const { t: tDiary } = useTranslation('diary');
  const { t: tErrors } = useTranslation('errors');
  const { showToast } = useToast();
  const { discard, waitingCount } = useDiscardDraft();

  const listRef = useRef<HTMLUListElement>(null);
  const pendingFocusRef = useRef<PendingFocus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [discarding, setDiscarding] = useState<AttentionRow | null>(null);
  const [discardBusy, setDiscardBusy] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  const consequences = useDeleteImpact('diary_entry', discarding ? discarding.subject.id : null);

  const limited = initialLimit !== undefined && rows.length > initialLimit;
  const visible = limited && !expanded ? rows.slice(0, initialLimit) : rows;
  const visibleKeys = visible.map((row) => row.key).join('|');

  const recordLeave = useCallback(
    (key: string, afterDialog: boolean) => {
      pendingFocusRef.current = { index: visible.findIndex((row) => row.key === key), afterDialog };
    },
    [visible],
  );

  // After a row leaves: the row now at its index, else the previous one, else the heading.
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    const focusTarget = () => {
      const targets = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>('[data-row-focus]') ?? [],
      );
      const target =
        targets[Math.max(0, pending.index)] ??
        targets[Math.max(0, pending.index) - 1] ??
        emptyFocusRef.current;
      target?.focus();
    };
    if (pending.afterDialog) {
      const frame = requestAnimationFrame(focusTarget);
      return () => cancelAnimationFrame(frame);
    }
    focusTarget();
  }, [visibleKeys, emptyFocusRef]);

  const handleLeave = useCallback(
    (row: AttentionRow, reason: AttentionLeaveReason) => {
      recordLeave(row.key, false);
      onRemove(row.key, reason);
    },
    [recordLeave, onRemove],
  );

  const confirmDiscard = async (row: AttentionRow) => {
    setDiscardBusy(true);
    setDiscardError(null);
    try {
      await discard(row.subject.id);
      recordLeave(row.key, true);
      setDiscarding(null);
      setDiscardBusy(false);
      onRemove(row.key, 'done');
      onRefresh();
      showToast('success', tDiary('unfinished.discarded'));
    } catch (err) {
      setDiscardError(
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : tDiary('capture.discardFailed'),
      );
      setDiscardBusy(false);
    }
  };

  if (rows.length === 0) return null;

  const waiting = discarding ? waitingCount(discarding.subject.id) : 0;
  const lead = waiting > 0 ? t('attention.discardWaiting', { count: waiting }) : undefined;
  const shownCount = totalCount ?? rows.length;

  return (
    <>
      <ul ref={listRef} id={listId} className={styles.list} data-testid={`${testIdPrefix}-list`}>
        {visible.map((row) => (
          <AttentionRowView
            key={row.key}
            row={row}
            today={today}
            testId={`${testIdPrefix}-row-${row.key}`}
            onLeave={handleLeave}
            onRefresh={onRefresh}
            onNavigate={onNavigate}
            onDiscard={(target) => {
              setDiscardError(null);
              setDiscarding(target);
            }}
            showGroups={showGroups}
          />
        ))}
      </ul>

      {limited ? (
        <button
          type="button"
          className={styles.showAll}
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => {
            const next = !expanded;
            setExpanded(next);
            setAnnouncement(
              next
                ? t('attention.showingAll', { count: shownCount })
                : t('attention.showingFirst', { count: initialLimit }),
            );
          }}
          data-testid={`${testIdPrefix}-show-all`}
        >
          {expanded ? t('attention.showFewer') : t('attention.showAll', { count: shownCount })}
        </button>
      ) : null}
      <span role="status" className={shared.srOnly}>
        {announcement}
      </span>

      {discarding ? (
        <ConfirmDialog
          title={t('confirmDialog.discardEntryTitle')}
          lead={lead}
          consequences={consequences}
          tone="danger"
          confirmLabel={t('confirmDialog.discard')}
          busyLabel={t('confirmDialog.discarding')}
          cancelLabel={t('confirmDialog.keepEntry')}
          busy={discardBusy}
          error={discardError}
          returnFocusRef={emptyFocusRef}
          onConfirm={() => void confirmDiscard(discarding)}
          onCancel={() => {
            setDiscardError(null);
            setDiscarding(null);
          }}
          testIdPrefix={`${testIdPrefix}-discard`}
        />
      ) : null}
    </>
  );
}
