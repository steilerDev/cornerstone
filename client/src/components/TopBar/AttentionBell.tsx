import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { matchLocation, routeUrl } from '@cornerstone/shared';
import { ATTENTION_STALE_MS, NEEDS_ATTENTION_LIMIT } from '../../attention/attentionContext.js';
import { useShellAttention } from '../../attention/useShellAttention.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { AttentionList } from '../AttentionList/AttentionList.js';
import { CountBadge } from '../Badge/CountBadge.js';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { FormError } from '../FormError/FormError.js';
import { AnchoredPanel } from '../Modal/AnchoredPanel.js';
import type { AnchoredPanelDismissReason } from '../Modal/AnchoredPanel.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import styles from './AttentionBell.module.css';

/**
 * Desktop top-bar bell: the Needs-attention count and a popover with the same rows as Home.
 * Reads the one shell attention state, so the count, Home and the popover never disagree.
 */
export function AttentionBell() {
  const { t } = useTranslation('common');
  const { t: tHome } = useTranslation('home');
  const attention = useShellAttention();
  const [open, setOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const focusOnAttachRef = useRef(false);
  const focusHomeOnCloseRef = useRef(false);
  const panelId = useId();
  const location = useLocation();
  const onHome = matchLocation(location.pathname)?.entry.id === 'home';

  const { data, status, refreshStale } = attention;
  const count = data && data.count > 0 ? data.count : 0;
  // "Hidden for now" on Home can leave includeSnoozed on: the bell lists unsnoozed rows only.
  const rows = useMemo(() => data?.rows.filter((r) => r.snoozedUntil === null) ?? [], [data]);

  const close = useCallback(() => setOpen(false), []);

  const headingCallbackRef = useCallback((el: HTMLHeadingElement | null) => {
    headingRef.current = el;
    if (el && focusOnAttachRef.current) {
      focusOnAttachRef.current = false;
      el.focus({ preventScroll: true });
    }
  }, []);

  const onToggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    focusOnAttachRef.current = true;
    setOpen(true);
    refreshStale(ATTENTION_STALE_MS);
  };

  // Synchronous Escape path only: the bell is mounted while its panel is open.
  const focusBell = () => (bellRef.current as HTMLButtonElement).focus();

  const onDismiss = (reason: AnchoredPanelDismissReason) => {
    setOpen(false);
    if (reason === 'escape') {
      focusBell();
    } else if (reason === 'outside') {
      // Only when focus would otherwise be lost: never steal it from what the user just pressed.
      requestAnimationFrame(() => {
        // The bell can unmount before this frame (narrow viewport, sign-out): optional chain.
        if (document.activeElement === document.body) bellRef.current?.focus();
      });
    } else if (focusHomeOnCloseRef.current) {
      focusHomeOnCloseRef.current = false;
      requestAnimationFrame(() => attention.homeHeadingRef.current?.focus());
    }
  };

  const firstLoad = status === 'loading' && data === null;
  const failed = status === 'error' && data === null;

  return (
    <>
      <button
        type="button"
        ref={bellRef}
        className={styles.bell}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={count > 0 ? t('topBar.attentionCount', { count }) : t('topBar.attention')}
        onClick={onToggle}
        data-testid="top-bar-attention"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3L4 11z" />
          <path d="M6.5 14a1.5 1.5 0 0 0 3 0" />
        </svg>
        <CountBadge count={count} className={styles.bellBadge} testId="top-bar-attention-badge" />
      </button>
      <AnchoredPanel
        open={open}
        anchorRef={bellRef}
        role="dialog"
        id={panelId}
        ariaLabel={t('topBar.attention')}
        trapFocus
        placement="bottom-end"
        layer="dialog"
        closeSignal={location.key}
        onDismiss={onDismiss}
        testId="top-bar-attention-panel"
      >
        <div className={styles.popover}>
          <div className={styles.header}>
            <h2 ref={headingCallbackRef} tabIndex={-1} className={styles.heading}>
              {t('topBar.attention')}
            </h2>
            {data ? (
              <span className={styles.count}>{tHome('count', { count: data.count })}</span>
            ) : null}
          </div>
          <div className={styles.body} aria-busy={firstLoad}>
            {firstLoad ? <Skeleton lines={3} /> : null}
            {failed ? (
              <>
                <FormError message={t('topBar.attentionLoadFailed')} />
                <button
                  type="button"
                  className={styles.retry}
                  onClick={attention.retry}
                  data-testid="top-bar-attention-retry"
                >
                  {t('topBar.attentionRetry')}
                </button>
              </>
            ) : null}
            {data && rows.length === 0 ? (
              <EmptyState icon="✓" message={tHome('attention.empty')} />
            ) : null}
            {data && rows.length > 0 ? (
              <AttentionList
                rows={rows}
                today={data.today}
                initialLimit={NEEDS_ATTENTION_LIMIT}
                totalCount={data.count}
                onRemove={attention.removeRow}
                onRefresh={attention.refresh}
                emptyFocusRef={headingRef}
                onNavigate={close}
                listId="bell-attention-list"
                testIdPrefix="bell-attention"
              />
            ) : null}
          </div>
          <div className={styles.footer}>
            <NavAnchor
              to={routeUrl('home')}
              replace={onHome}
              className={styles.openHome}
              onNavigate={() => {
                focusHomeOnCloseRef.current = onHome;
              }}
              data-testid="top-bar-attention-open-home"
            >
              {t('topBar.attentionOpenHome')}
            </NavAnchor>
          </div>
        </div>
      </AnchoredPanel>
    </>
  );
}

export default AttentionBell;
