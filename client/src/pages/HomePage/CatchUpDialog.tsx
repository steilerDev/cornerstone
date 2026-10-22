import { useEffect, useId, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { AttentionResponse } from '@cornerstone/shared';
import { AttentionList } from '../../components/AttentionList/AttentionList.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { Modal } from '../../components/Modal/Modal.js';
import { Sheet } from '../../components/Modal/Sheet.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { catchUpRows } from '../../lib/attention/catchUpRows.js';
import shared from '../../styles/shared.module.css';
import styles from './HomePage.module.css';

export interface CatchUpDialogProps {
  data: AttentionResponse;
  onRemove: (key: string, reason: 'done' | 'notNow') => void;
  onRefresh: () => void;
  onClose: () => void;
  /** "Review all", or the section heading when that line is gone. */
  returnFocusRef: RefObject<HTMLElement | null>;
}

/**
 * The late tasks one by one: every late task row (a group's tasks each get their own row) with
 * Mark done / Start / Reschedule / Not now. A Modal from 768 px, a full-screen Sheet below.
 */
export function CatchUpDialog({
  data,
  onRemove,
  onRefresh,
  onClose,
  returnFocusRef,
}: CatchUpDialogProps) {
  const { t } = useTranslation('home');
  const wide = useMediaQuery('(min-width: 768px)');
  const sheetId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const rows = useMemo(() => catchUpRows(data), [data]);
  const title = t('catchUp.title', { count: rows.length });

  // The list is replaced by the empty state when the last task leaves: focus goes to Close.
  const hadRowsRef = useRef(rows.length > 0);
  useEffect(() => {
    if (rows.length > 0) hadRowsRef.current = true;
    else if (hadRowsRef.current) {
      hadRowsRef.current = false;
      closeRef.current!.focus();
    }
  }, [rows.length]);

  const body = (
    <div className={styles.catchUpBody}>
      <div role="status" className={shared.srOnly}>
        {rows.length === 0 ? t('catchUp.none') : t('catchUp.left', { count: rows.length })}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="✓" message={t('catchUp.empty')} />
      ) : (
        <AttentionList
          rows={rows}
          today={data.today}
          showGroups={false}
          onRemove={onRemove}
          onRefresh={onRefresh}
          onNavigate={onClose}
          emptyFocusRef={closeRef}
          listId="home-catch-up-list"
          testIdPrefix="catch-up"
        />
      )}
    </div>
  );

  const footer = (
    <button
      ref={closeRef}
      type="button"
      className={`${shared.btnSecondary} ${styles.dialogClose}`}
      onClick={onClose}
      data-testid="home-catch-up-close"
    >
      {t('catchUp.close')}
    </button>
  );

  return wide ? (
    <Modal title={title} onClose={onClose} footer={footer} returnFocusRef={returnFocusRef}>
      {body}
    </Modal>
  ) : (
    <Sheet
      id={sheetId}
      open
      onClose={onClose}
      title={title}
      variant="fullScreen"
      footer={footer}
      returnFocusRef={returnFocusRef}
      restoreFocusOnUnmount
      testId="home-catch-up-sheet"
    >
      {body}
    </Sheet>
  );
}
