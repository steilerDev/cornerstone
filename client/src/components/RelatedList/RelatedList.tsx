import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { UndoToken } from '@cornerstone/shared';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { FormError } from '../FormError/FormError.js';
import { OverflowMenu, type OverflowMenuItem } from '../OverflowMenu/OverflowMenu.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import { useToast } from '../Toast/ToastContext.js';
import { Tooltip } from '../Tooltip/Tooltip.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { undoChange } from '../../lib/undoApi.js';
import { useUserText } from '../../hooks/useUserText.js';
import { RelatedListHeader } from './RelatedListHeader.js';
import { useRelatedListFocus } from './useRelatedListFocus.js';
import type { RelatedListAction, RelatedListProps, RelatedListRow } from './types.js';
import styles from './RelatedList.module.css';

const DEFAULT_COLLAPSED_LIMIT = 10;

/**
 * The one list of simple one-line relations (dependencies, milestones, offers and invoices,
 * payments, contact persons, covered items): count in the heading, a secondary Add/Link, one
 * stretched title link per row, an Edit icon only when the relation has attributes, and a row
 * menu whose Remove applies at once with an Undo toast.
 */
export function RelatedList({
  title,
  headingLevel = 2,
  rows,
  count,
  loadError,
  onRetry,
  action,
  emptyMessage,
  onEdit,
  onRemove,
  onRestored,
  linkState,
  collapsedLimit = DEFAULT_COLLAPSED_LIMIT,
  testId,
}: RelatedListProps) {
  const { t } = useTranslation('common');
  const { showUndoToast } = useToast();
  const userText = useUserText();
  const headingId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const expandFocusRef = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const rowList = useMemo(() => rows ?? [], [rows]);
  const ids = rowList.map((row) => row.id);
  const isEmpty = rows !== null && rows.length === 0;

  const getTrigger = useCallback(
    (id: string) =>
      sectionRef.current?.querySelector<HTMLElement>(
        `[data-testid="${CSS.escape(`${testId}-actions-${id}`)}"]`,
      ) ?? null,
    [testId],
  );
  const fallback = useCallback(
    () =>
      emptyRef.current?.querySelector<HTMLElement>('button, a') ??
      addRef.current ??
      headingRef.current,
    [],
  );
  const focus = useRelatedListFocus({ ids, container: sectionRef, getTrigger, fallback });

  const limit = collapsedLimit;
  const collapsible = rowList.length > limit;
  const visibleRows = collapsible && !expanded ? rowList.slice(0, limit) : rowList;

  useLayoutEffect(() => {
    if (!expanded || !expandFocusRef.current) return;
    expandFocusRef.current = false;
    // Only expandable when there are more than `limit` rows, so this row exists.
    const first = rowList[limit]!;
    const target =
      sectionRef.current!.querySelector<HTMLElement>(
        `[data-testid="${CSS.escape(`${testId}-link-${first.id}`)}"]`,
      ) ?? getTrigger(first.id);
    target?.focus();
  }, [expanded, rowList, limit, testId, getTrigger]);

  function focusOpener() {
    const opener = openerRef.current?.isConnected ? openerRef.current : fallback();
    opener?.focus();
  }

  function openPicker(opener: HTMLElement | null) {
    openerRef.current = opener;
    setPickerOpen(true);
  }

  function closePicker() {
    setPickerOpen(false);
    focusOpener();
  }

  function activate(current: RelatedListAction, opener: HTMLButtonElement) {
    if (current.disabledReason) return;
    if (current.kind === 'picker') {
      openPicker(opener);
    } else {
      current.onActivate(opener);
    }
  }

  function handlePickerKeyDown(event: ReactKeyboardEvent) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    closePicker();
  }

  async function handleRemove(row: RelatedListRow, remove: NonNullable<typeof onRemove>) {
    setRemoveError(null);
    const before = ids;
    let token: UndoToken;
    try {
      token = await remove(row);
    } catch {
      setRemoveError(t('relatedList.removeFailed', { title: row.title }));
      return;
    }
    focus.afterRemove(before, row.id);
    showUndoToast({
      message: t('relatedList.removed', { title: row.title, list: title }),
      dedupeKey: `${testId}-remove-${row.id}`,
      focusFallback: fallback,
      onUndo: async () => {
        await undoChange(token.token);
        await onRestored?.(row);
        focus.afterUndo(row.id);
      },
    });
  }

  function renderAddButton(current: RelatedListAction) {
    const reasonId = `${headingId}-reason`;
    return (
      <>
        <button
          ref={addRef}
          type="button"
          className={styles.add}
          aria-disabled={current.disabledReason ? 'true' : undefined}
          aria-describedby={current.disabledReason ? reasonId : undefined}
          aria-expanded={current.kind === 'picker' ? pickerOpen : undefined}
          data-testid={`${testId}-add`}
          onClick={(event) => activate(current, event.currentTarget)}
        >
          {current.label}
        </button>
        {current.disabledReason ? (
          <span id={reasonId} className={styles.srOnly}>
            {current.disabledReason}
          </span>
        ) : null}
      </>
    );
  }

  function renderRow(row: RelatedListRow) {
    const items: OverflowMenuItem[] = [...(row.menuItems ?? [])];
    if (onRemove && row.removable !== false) {
      items.push({
        id: 'remove',
        label: t('relatedList.remove'),
        variant: 'default',
        testId: `${testId}-remove-${row.id}`,
        onClick: () => void handleRemove(row, onRemove),
      });
    }
    const showEdit = onEdit !== undefined && row.editable !== false;
    const editLabel = t('relatedList.edit', { title: row.title });
    return (
      <li key={row.id} className={styles.row} data-testid={`${testId}-row-${row.id}`}>
        <div className={styles.main}>
          <div className={styles.titleCell}>
            {row.to ? (
              <NavAnchor
                to={row.to}
                state={linkState}
                data-testid={`${testId}-link-${row.id}`}
                {...userText(styles.link)}
              >
                {row.title}
              </NavAnchor>
            ) : (
              <span {...userText(styles.plainTitle)}>{row.title}</span>
            )}
          </div>
          {row.badges || row.facts ? (
            <div className={styles.meta}>
              {row.badges}
              {row.facts ? <span className={styles.facts}>{row.facts}</span> : null}
            </div>
          ) : null}
        </div>
        {row.amount ? <div className={styles.amount}>{row.amount}</div> : null}
        {showEdit ? (
          <div className={styles.editCell}>
            <Tooltip content={editLabel}>
              <button
                type="button"
                className={styles.edit}
                aria-label={editLabel}
                data-testid={`${testId}-edit-${row.id}`}
                onClick={(event) => onEdit(row, event.currentTarget)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            </Tooltip>
          </div>
        ) : null}
        {items.length > 0 ? (
          <div className={styles.menuCell}>
            <OverflowMenu
              items={items}
              triggerAriaLabel={t('relatedList.rowActions', { title: row.title })}
              data-testid={`${testId}-actions-${row.id}`}
              usePortal
            />
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <section
      ref={sectionRef}
      className={styles.root}
      aria-labelledby={headingId}
      data-testid={testId}
    >
      <div className={styles.card}>
        <RelatedListHeader
          title={title}
          {...(rows !== null && !loadError ? { count: count ?? rows.length } : {})}
          headingLevel={headingLevel}
          headingId={headingId}
          headingRef={headingRef}
        >
          {action && rows !== null && !loadError && !isEmpty ? renderAddButton(action) : null}
        </RelatedListHeader>

        {pickerOpen && action?.kind === 'picker' ? (
          <div className={styles.picker} onKeyDown={handlePickerKeyDown}>
            {action.renderPicker({ close: closePicker })}
          </div>
        ) : null}

        <FormError message={removeError} />

        {loadError ? (
          <div className={styles.loadError}>
            <FormError message={loadError} />
            {onRetry ? (
              <button type="button" className={styles.retry} onClick={onRetry}>
                {t('relatedList.retry')}
              </button>
            ) : null}
          </div>
        ) : rows === null ? (
          <Skeleton lines={3} />
        ) : isEmpty ? (
          <div ref={emptyRef}>
            <EmptyState
              message={emptyMessage}
              {...(action
                ? {
                    action: {
                      label: action.label,
                      onClick: () =>
                        activate(
                          action,
                          emptyRef.current!.querySelector<HTMLButtonElement>('button')!,
                        ),
                    },
                  }
                : {})}
            />
          </div>
        ) : (
          <>
            <ul className={styles.list}>{visibleRows.map(renderRow)}</ul>
            {collapsible && !expanded ? (
              <button
                type="button"
                className={styles.showAll}
                aria-expanded={false}
                data-testid={`${testId}-show-all`}
                onClick={() => {
                  expandFocusRef.current = true;
                  setExpanded(true);
                }}
              >
                {t('relatedList.showAll', { count: rowList.length })}
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
