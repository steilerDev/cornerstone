import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '../Badge/Badge.js';
import type { BadgeVariantMap } from '../Badge/Badge.js';
import { FormError } from '../FormError/FormError.js';
import { AnchoredPanel, Sheet } from '../Modal/index.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { useFormatters } from '../../lib/formatters.js';
import { focusPageHeading } from '../../lib/focusPageHeading.js';
import { todayLocalIsoDate } from '../../lib/localDate.js';
import styles from './StatusMenu.module.css';

export interface StatusMenuDateConfig {
  /** Translated question, e.g. "When was it finished?". */
  readonly question: string;
  /** YYYY-MM-DD; the chip is hidden when null, equal to today or after today. */
  readonly plannedDate?: string | null;
  /** "As planned" (default) or "On target". */
  readonly plannedLabel?: string;
  /** Earliest pickable date, e.g. the actual start when marking done. */
  readonly minDate?: string | null;
}

export interface StatusMenuTransition<S extends string> {
  readonly to: S;
  /** Translated row label. */
  readonly label: string;
  readonly direction: 'forward' | 'backward';
  /** Present: the row opens the date step; absent: the row applies at once. */
  readonly date?: StatusMenuDateConfig;
}

export interface StatusMenuProps<S extends string> {
  /** Transitions allowed from the current status (see `statusVocabularies`). */
  readonly transitions: readonly StatusMenuTransition<S>[];
  /** Chip look: the variant map comes from `useStatusBadgeVariants`. */
  readonly badge: { readonly variants: BadgeVariantMap; readonly value: string };
  /** Shown as "Now: ‹currentLabel›"; usually `variants[value].label`. */
  readonly currentLabel: string;
  /** Applies the change. The surface is already closed when this runs. */
  readonly onApply: (to: S, date: string | null) => Promise<void>;
  readonly appearance?: 'chip' | 'button' | 'action';
  /** `action` appearance: which transition the button runs. */
  readonly actionTo?: S;
  /** `button` appearance: label, e.g. "Set status". */
  readonly buttonLabel?: string;
  /** Receives focus when the control turns into a plain Badge while it had focus. */
  readonly focusFallbackRef?: RefObject<HTMLElement | null>;
  readonly testId: string;
}

type Step = 'list' | 'date';
type InitialRow = 'first' | 'last';

function Caret() {
  return (
    <svg
      className={styles.caret}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 3.5 5 6.5 8 3.5" />
    </svg>
  );
}

/**
 * The one status control for every vocabulary. Zero allowed transitions render a plain Badge;
 * otherwise a chip / button / action opens a menu (desktop popover, phone sheet) whose rows
 * apply a transition, with a date step for the transitions that record an actual date.
 */
export function StatusMenu<S extends string>({
  transitions,
  badge,
  currentLabel,
  onApply,
  appearance = 'chip',
  actionTo,
  buttonLabel,
  focusFallbackRef,
  testId,
}: StatusMenuProps<S>) {
  const { t } = useTranslation('common');
  const { formatDate, formatDayMonth } = useFormatters();
  const location = useLocation();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('list');
  const [dateTransition, setDateTransition] = useState<StatusMenuTransition<S> | null>(null);
  const [today, setToday] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const [pickValue, setPickValue] = useState('');
  const [pickError, setPickError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // State (not a ref): the portaled content mounts after the first render of an open menu.
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const todayChipRef = useRef<HTMLButtonElement | null>(null);
  const pickInputRef = useRef<HTMLInputElement | null>(null);
  const initialRowRef = useRef<InitialRow>('first');
  const openerValueRef = useRef<S | null>(null);
  const pendingFocusRef = useRef(false);

  const panelId = useId();
  const describeId = useId();
  const headerId = useId();
  const menuId = useId();

  const isBadge = transitions.length === 0;
  const forward = transitions.filter((tr) => tr.direction === 'forward');
  const backward = transitions.filter((tr) => tr.direction === 'backward');

  // A control that had focus and turns into a plain Badge hands focus on (never to body).
  useLayoutEffect(() => {
    if (!isBadge) return;
    if (pendingFocusRef.current) {
      pendingFocusRef.current = false;
      const fallback = focusFallbackRef?.current;
      if (fallback?.isConnected) fallback.focus();
      else focusPageHeading();
    }
  }, [isBadge, focusFallbackRef]);

  const resetSurface = () => {
    setOpen(false);
    setStep('list');
    setDateTransition(null);
    setPickOpen(false);
    setPickValue('');
    setPickError(null);
  };

  const closeToTrigger = () => {
    resetSurface();
    triggerRef.current?.focus();
  };

  // Focus: the initial row on open, Today on the date step, the opener row on return.
  useEffect(() => {
    if (!open || !contentEl) return;
    if (step === 'date') {
      todayChipRef.current?.focus();
      return;
    }
    const rows = contentEl.querySelectorAll<HTMLElement>('[role="menuitem"]');
    const target =
      openerValueRef.current !== null
        ? contentEl.querySelector<HTMLElement>(
            `[data-testid="${testId}-option-${openerValueRef.current}"]`,
          )
        : initialRowRef.current === 'last'
          ? rows[rows.length - 1]
          : rows[0];
    openerValueRef.current = null;
    target?.focus();
  }, [open, step, testId, contentEl]);

  useEffect(() => {
    if (pickOpen) pickInputRef.current?.focus();
  }, [pickOpen]);

  const apply = async (to: S, date: string | null) => {
    if (to === badge.value) {
      closeToTrigger();
      return;
    }
    pendingFocusRef.current = true;
    closeToTrigger();
    setBusy(true);
    try {
      await onApply(to, date);
    } catch {
      // The caller already reported the failure; the control just goes idle.
    } finally {
      setBusy(false);
      pendingFocusRef.current = false;
    }
  };

  const openSurface = (initial: InitialRow) => {
    if (busy) return;
    initialRowRef.current = initial;
    openerValueRef.current = null;
    if (appearance === 'action' && actionTo !== undefined) {
      const tr = transitions.find((candidate) => candidate.to === actionTo);
      if (!tr) return;
      if (!tr.date) {
        void apply(tr.to, null);
        return;
      }
      setToday(todayLocalIsoDate());
      setDateTransition(tr);
      setStep('date');
    } else {
      setStep('list');
    }
    setOpen(true);
  };

  const chooseRow = (tr: StatusMenuTransition<S>) => {
    if (!tr.date) {
      void apply(tr.to, null);
      return;
    }
    openerValueRef.current = tr.to;
    setToday(todayLocalIsoDate());
    setDateTransition(tr);
    setPickOpen(false);
    setPickValue('');
    setPickError(null);
    setStep('date');
  };

  const backToList = () => {
    // openerValueRef already holds the row that opened the step (set in chooseRow).
    setDateTransition(null);
    setPickOpen(false);
    setPickValue('');
    setPickError(null);
    setStep('list');
  };

  const submitPick = () => {
    if (!dateTransition) return;
    const value = pickInputRef.current?.value ?? pickValue;
    if (!value) return;
    const nowIso = todayLocalIsoDate();
    if (value > nowIso) {
      setPickError(t('statusMenu.dateInFuture'));
      return;
    }
    const min = dateTransition.date?.minDate;
    if (min && value < min) {
      setPickError(t('statusMenu.dateBeforeStart'));
      return;
    }
    void apply(dateTransition.to, value);
  };

  const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowUp' && appearance !== 'action') {
      e.preventDefault();
      openSurface('last');
    } else if (e.key === 'ArrowDown' && appearance !== 'action') {
      e.preventDefault();
      openSurface('first');
    }
  };

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Keep the keys the menu handles from leaking through the portal to ancestors (rows,
    // forms); Escape and Tab must reach the panel's own listeners.
    if (e.key !== 'Escape' && e.key !== 'Tab') e.stopPropagation();
    if (step !== 'list' || !contentEl) return;
    const rows = Array.from(contentEl.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (rows.length === 0) return;
    const index = rows.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % rows.length;
    else if (e.key === 'ArrowUp') next = index <= 0 ? rows.length - 1 : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = rows.length - 1;
    else if (e.key === 'Tab') {
      // Tab closes and continues from the trigger.
      closeToTrigger();
      return;
    }
    if (next !== null) {
      e.preventDefault();
      rows[next]?.focus();
    }
  };

  if (isBadge) {
    return <Badge variants={badge.variants} value={badge.value} testId={testId} />;
  }

  const variantClass = badge.variants[badge.value]?.className;
  const variantIcon = badge.variants[badge.value]?.icon;
  const actionTransition =
    appearance === 'action' ? transitions.find((tr) => tr.to === actionTo) : undefined;

  const triggerLabel =
    appearance === 'chip'
      ? currentLabel
      : appearance === 'action'
        ? (actionTransition?.label ?? '')
        : (buttonLabel ?? t('statusMenu.setStatus'));

  const triggerClassName =
    appearance === 'chip'
      ? [styles.chip, variantClass].filter(Boolean).join(' ')
      : styles.plainButton;

  const dateConfig = dateTransition?.date;
  const planned = dateConfig?.plannedDate ?? null;
  const showPlanned = planned !== null && planned !== '' && today !== '' && planned < today;
  const plannedLabel = dateConfig?.plannedLabel ?? t('statusMenu.asPlanned');

  const listRows = (
    <>
      {forward.map((tr) => (
        <button
          key={tr.to}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={styles.row}
          aria-haspopup={tr.date ? 'dialog' : undefined}
          onClick={() => chooseRow(tr)}
          data-testid={`${testId}-option-${tr.to}`}
        >
          <span className={styles.rowLabel}>{tr.label}</span>
          {tr.date && (
            <span className={styles.rowChevron} aria-hidden="true">
              ›
            </span>
          )}
        </button>
      ))}
      {backward.length > 0 && forward.length > 0 && (
        <div role="separator" className={styles.separator} />
      )}
      {backward.map((tr) => (
        <button
          key={tr.to}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={styles.row}
          onClick={() => chooseRow(tr)}
          data-testid={`${testId}-option-${tr.to}`}
        >
          <span className={styles.rowLabel}>{tr.label}</span>
        </button>
      ))}
    </>
  );

  const header = (
    <div id={headerId} className={styles.header}>
      {t('statusMenu.nowLabel', { status: currentLabel })}
    </div>
  );

  const dateStep = dateTransition && (
    <div className={styles.dateStep}>
      <div className={styles.dateQuestion}>{dateConfig?.question}</div>
      <div className={styles.chips}>
        <button
          ref={todayChipRef}
          type="button"
          className={styles.dateChip}
          onClick={() => void apply(dateTransition.to, todayLocalIsoDate())}
          data-testid={`${testId}-date-today`}
        >
          {t('statusMenu.today')}
        </button>
        {showPlanned && planned && (
          <button
            type="button"
            className={styles.dateChip}
            aria-label={t('statusMenu.plannedChipAria', {
              label: plannedLabel,
              date: formatDate(planned, undefined, 'long'),
            })}
            onClick={() => void apply(dateTransition.to, planned)}
            data-testid={`${testId}-date-planned`}
          >
            {plannedLabel} · <span className={styles.chipDate}>{formatDayMonth(planned)}</span>
          </button>
        )}
        <button
          type="button"
          className={styles.dateChip}
          aria-expanded={pickOpen}
          onClick={() => {
            setPickOpen((v) => !v);
            setPickError(null);
          }}
          data-testid={`${testId}-date-pick`}
        >
          {t('statusMenu.pickDate')}
        </button>
      </div>
      {pickOpen && (
        <div className={styles.pick}>
          <label className={styles.pickLabel}>
            <span>{t('statusMenu.dateLabel')}</span>
            <input
              ref={pickInputRef}
              type="date"
              className={styles.dateInput}
              value={pickValue}
              max={today}
              min={dateConfig?.minDate ?? undefined}
              aria-invalid={pickError ? true : undefined}
              onChange={(e) => {
                setPickValue(e.target.value);
                setPickError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitPick();
                }
              }}
              data-testid={`${testId}-date-input`}
            />
          </label>
          <FormError message={pickError} variant="field" />
          <button
            type="button"
            className={styles.setDateButton}
            onClick={submitPick}
            data-testid={`${testId}-date-set`}
          >
            {t('statusMenu.setDate')}
          </button>
        </div>
      )}
      {appearance !== 'action' && (
        <button
          type="button"
          className={styles.backButton}
          onClick={backToList}
          data-testid={`${testId}-back`}
        >
          ‹ {t('statusMenu.back')}
        </button>
      )}
    </div>
  );

  const surfaceBody = (
    <div
      ref={setContentEl}
      className={styles.content}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onMenuKeyDown}
    >
      {step === 'list' ? (
        <>
          {header}
          <div role="menu" id={menuId} aria-labelledby={headerId}>
            {listRows}
          </div>
        </>
      ) : (
        dateStep
      )}
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-haspopup={
          appearance === 'action' ? (actionTransition?.date ? 'dialog' : undefined) : 'menu'
        }
        aria-expanded={open}
        aria-controls={open ? (step === 'list' ? menuId : panelId) : undefined}
        aria-describedby={describeId}
        aria-disabled={busy ? 'true' : undefined}
        aria-busy={busy ? 'true' : undefined}
        onClick={() => {
          if (busy) return;
          if (open) closeToTrigger();
          else openSurface('first');
        }}
        onKeyDown={onTriggerKeyDown}
        data-testid={testId}
      >
        {appearance === 'chip' && variantIcon}
        {triggerLabel}
        {appearance !== 'action' && <Caret />}
      </button>
      <span id={describeId} hidden>
        {t('statusMenu.changeStatus')}
      </span>
      {isDesktop ? (
        <AnchoredPanel
          open={open}
          anchorRef={triggerRef}
          id={panelId}
          role={step === 'date' ? 'dialog' : undefined}
          ariaLabel={step === 'date' ? dateConfig?.question : undefined}
          trapFocus={step === 'date'}
          closeSignal={location.key}
          onDismiss={(reason) => {
            if (reason === 'escape') closeToTrigger();
            else resetSurface();
          }}
          testId={`${testId}-panel`}
        >
          {surfaceBody}
        </AnchoredPanel>
      ) : (
        // Stays mounted (inert and hidden while closed) so it slides in and out like MoreSheet.
        <Sheet
          id={panelId}
          open={open}
          onClose={closeToTrigger}
          title={step === 'list' ? t('statusMenu.changeStatusTitle') : (dateConfig?.question ?? '')}
          returnFocusRef={triggerRef}
          testId={`${testId}-panel`}
        >
          {surfaceBody}
        </Sheet>
      )}
    </>
  );
}
