import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { TradeListItem } from '@cornerstone/shared';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { useTrades } from '../../hooks/useTrades.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { sortTradesByDisplayName } from '../../lib/tradeSearch.js';
import sharedStyles from '../../styles/shared.module.css';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog.js';
import { FormError } from '../FormError/FormError.js';
import { Modal } from '../Modal/Modal.js';
import { Sheet } from '../Modal/Sheet.js';
import { OverflowMenu } from '../OverflowMenu/OverflowMenu.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import { useToast } from '../Toast/ToastContext.js';
import { TradePicker } from '../TradePicker/TradePicker.js';
import styles from './TradesManager.module.css';

const NAME_MAX_LENGTH = 200;
const MAX_FOCUS_FRAMES = 30;

export type TradesChange =
  | { kind: 'created' | 'renamed'; tradeId: string }
  | { kind: 'merged'; fromId: string; intoId: string }
  | { kind: 'deleted'; tradeId: string };

export interface TradesManagerProps {
  readonly onClose: () => void;
  readonly onChanged?: (change: TradesChange) => void;
  /** Focus target when the opener is gone (the Trades button). */
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly testIdPrefix?: string;
}

/** `ids` are candidates in order: the first whose row still exists wins. */
type PendingFocus = { kind: 'row'; ids: readonly string[] } | { kind: 'input' } | null;

interface DeleteState {
  readonly trade: TradeListItem;
  /** Companies using the trade when the delete is blocked; null = not blocked. */
  readonly blockedCount: number | null;
  readonly busy: boolean;
  readonly error: string | null;
}

interface MergeState {
  readonly trade: TradeListItem;
  readonly targetId: string;
  readonly busy: boolean;
  readonly error: string | null;
}

/**
 * The trades list for the Companies page: add, rename, merge duplicates and delete. A dialog
 * from 768 px, a bottom sheet below. All state lives here, above the container, so a resize
 * keeps what was typed. Mounted conditionally by its host.
 */
export function TradesManager({
  onClose,
  onChanged,
  returnFocusRef,
  testIdPrefix = 'trades-manager',
}: TradesManagerProps) {
  const { t, i18n } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { showToast } = useToast();
  const wide = useMediaQuery('(min-width: 768px)');
  const sheetId = useId();
  const newInputId = useId();
  const newErrorId = useId();
  const mergePickerId = useId();

  const {
    trades,
    isInitialLoading,
    error: loadError,
    refetch,
    createTrade,
    updateTrade,
    deleteTrade,
    mergeTrade,
  } = useTrades();

  const newInputRef = useRef<HTMLInputElement>(null);
  const pendingFocusRef = useRef<PendingFocus>(null);

  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [mergeState, setMergeState] = useState<MergeState | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const confirmOpen = mergeState !== null || deleteState !== null;

  const displayName = (trade: Pick<TradeListItem, 'name' | 'translationKey'>) =>
    getCategoryDisplayName(t, trade.name, trade.translationKey);
  const sorted = sortTradesByDisplayName(trades, displayName, i18n.language);

  // Focus never falls to the body: every path names its target, consumed once it exists. The
  // dialogs restore focus to the New-trade field (a stable element inside this dialog) first;
  // this effect then moves it to the intended row, retrying for a bounded number of frames
  // until the list has re-rendered, and re-checks once after the dialogs' own restore ran.
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => {
    if (!pendingFocusRef.current) return;
    let frames = 0;
    let handle = 0;
    let verified = false;
    const find = (pending: NonNullable<PendingFocus>) => {
      if (pending.kind === 'input') return newInputRef.current;
      for (const id of pending.ids) {
        const el = document.querySelector<HTMLElement>(
          `[data-testid="${testIdPrefix}-actions-${id}"]`,
        );
        if (el) return el;
      }
      return null;
    };
    const tick = () => {
      const pending = pendingFocusRef.current;
      if (!pending) return;
      const target = find(pending);
      if (target) {
        target.focus();
        if (document.activeElement === target) {
          // One more frame to confirm nothing (a late restore) pulled focus away.
          if (verified) {
            pendingFocusRef.current = null;
            return;
          }
          verified = true;
        }
      }
      frames += 1;
      if (frames < MAX_FOCUS_FRAMES) {
        handle = window.requestAnimationFrame(tick);
      } else {
        pendingFocusRef.current = null;
        if (!document.activeElement || document.activeElement === document.body) {
          newInputRef.current?.focus();
        }
      }
    };
    tick();
    return () => window.cancelAnimationFrame(handle);
  }, [focusTick, trades, confirmOpen, editingId, testIdPrefix]);

  const requestFocus = (next: PendingFocus) => {
    pendingFocusRef.current = next;
    setFocusTick((n) => n + 1);
  };

  // The rows to try after `id` disappears: the next, then the previous (else the input).
  const focusAfterRemoving = (id: string): PendingFocus => {
    const index = sorted.findIndex((tr) => tr.id === id);
    const ids = [sorted[index + 1], sorted[index - 1]]
      .filter((tr) => tr !== undefined)
      .map((tr) => tr.id);
    return ids.length > 0 ? { kind: 'row', ids } : { kind: 'input' };
  };

  // Safety net: when the list changes (a refetch may have removed the row that had focus),
  // focus that fell to the body goes to the New-trade field. Focus inside any dialog or on a
  // menu is a legitimate move and is left alone; so is a pending, explicit focus request.
  useEffect(() => {
    const handle = window.requestAnimationFrame(() => {
      if (pendingFocusRef.current) return;
      const active = document.activeElement;
      if (!active || active === document.body) newInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(handle);
  }, [trades]);

  const errorText = (err: unknown): string =>
    err instanceof ApiClientError
      ? translateApiError(err.error.code, tErrors)
      : tCommon('requestErrors.network');

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (adding) return;
    const name = newName.trim();
    if (!name) {
      setAddError(t('tradesManager.nameRequired'));
      newInputRef.current?.focus();
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const trade = await createTrade({ name });
      setNewName('');
      setAnnouncement(t('tradesManager.added', { name: trade.name }));
      requestFocus({ kind: 'input' });
      onChanged?.({ kind: 'created', tradeId: trade.id });
    } catch (err) {
      setAddError(
        err instanceof ApiClientError && err.statusCode === 409
          ? t('tradesManager.duplicateName')
          : errorText(err),
      );
      requestFocus({ kind: 'input' });
    } finally {
      setAdding(false);
    }
  };

  const startRename = (trade: TradeListItem) => {
    setEditingId(trade.id);
    setEditValue(displayName(trade));
    setEditError(null);
  };

  const finishRename = (id: string) => {
    requestFocus({ kind: 'row', ids: [id] });
    setEditingId(null);
    setEditError(null);
  };

  const handleSave = async (trade: TradeListItem) => {
    if (saving) return;
    const name = editValue.trim();
    if (!name) {
      setEditError(t('tradesManager.nameRequired'));
      return;
    }
    // Unchanged: no request, so a built-in trade keeps its translation key.
    if (name === displayName(trade)) {
      finishRename(trade.id);
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const updated = await updateTrade(trade.id, { name });
      setAnnouncement(t('tradesManager.renamed', { name: updated.name }));
      onChanged?.({ kind: 'renamed', tradeId: trade.id });
      finishRename(trade.id);
    } catch (err) {
      setEditError(
        err instanceof ApiClientError && err.statusCode === 409
          ? t('tradesManager.duplicateName')
          : errorText(err),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>, trade: TradeListItem) => {
    if (event.key === 'Escape') {
      // Cancels the rename only; the dialog's own Escape handling must not also run.
      event.preventDefault();
      event.stopPropagation();
      finishRename(trade.id);
    }
  };

  const openMerge = (trade: TradeListItem) => {
    setDeleteState(null);
    setMergeState({ trade, targetId: '', busy: false, error: null });
  };

  const handleMerge = async () => {
    if (!mergeState || mergeState.busy || !mergeState.targetId) return;
    const { trade, targetId } = mergeState;
    const target = trades.find((tr) => tr.id === targetId);
    setMergeState({ ...mergeState, busy: true, error: null });
    try {
      await mergeTrade(trade.id, targetId);
      showToast(
        'success',
        t('tradesManager.merge.done', {
          name: displayName(trade),
          target: target ? displayName(target) : '',
        }),
      );
      requestFocus({ kind: 'row', ids: [targetId] });
      onChanged?.({ kind: 'merged', fromId: trade.id, intoId: targetId });
      setMergeState(null);
    } catch (err) {
      setMergeState({ ...mergeState, busy: false, error: errorText(err) });
    }
  };

  const openDelete = (trade: TradeListItem) => {
    setDeleteState({
      trade,
      blockedCount: trade.vendorCount > 0 ? trade.vendorCount : null,
      busy: false,
      error: null,
    });
  };

  const handleDelete = async () => {
    if (!deleteState || deleteState.busy || deleteState.blockedCount !== null) return;
    const { trade } = deleteState;
    setDeleteState({ ...deleteState, busy: true, error: null });
    try {
      await deleteTrade(trade.id);
      showToast('success', t('tradesManager.deleteDialog.done', { name: displayName(trade) }));
      requestFocus(focusAfterRemoving(trade.id));
      onChanged?.({ kind: 'deleted', tradeId: trade.id });
      setDeleteState(null);
    } catch (err) {
      if (err instanceof ApiClientError && err.statusCode === 409) {
        // Another user assigned the trade meanwhile: switch to the blocked form (count only).
        const raw = (err.error.details as { vendorCount?: unknown } | undefined)?.vendorCount;
        const count = typeof raw === 'number' && raw > 0 ? raw : Math.max(trade.vendorCount, 1);
        setDeleteState({ trade, blockedCount: count, busy: false, error: null });
      } else {
        setDeleteState({ ...deleteState, busy: false, error: errorText(err) });
      }
    }
  };

  const mergeTarget = mergeState ? trades.find((tr) => tr.id === mergeState.targetId) : undefined;

  const list = (() => {
    if (isInitialLoading) return <Skeleton lines={5} />;
    if (loadError) {
      return (
        <div className={styles.loadError}>
          <FormError message={t('tradesManager.loadError')} />
          <button type="button" className={sharedStyles.btnSecondary} onClick={refetch}>
            {t('tradesManager.tryAgain')}
          </button>
        </div>
      );
    }
    if (sorted.length === 0) return <p className={styles.empty}>{t('tradesManager.empty')}</p>;
    return (
      <ul className={styles.list} aria-label={t('tradesManager.listLabel')}>
        {sorted.map((trade) => {
          const name = displayName(trade);
          const editing = editingId === trade.id;
          return (
            <li
              key={trade.id}
              className={styles.row}
              data-testid={`${testIdPrefix}-row-${trade.id}`}
            >
              {editing ? (
                <form
                  className={styles.renameForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSave(trade);
                  }}
                >
                  <label
                    className={styles.srOnlyLabel}
                    htmlFor={`${newInputId}-rename-${trade.id}`}
                  >
                    {t('tradesManager.renameLabel', { name })}
                  </label>
                  <input
                    id={`${newInputId}-rename-${trade.id}`}
                    className={styles.input}
                    type="text"
                    value={editValue}
                    maxLength={NAME_MAX_LENGTH}
                    autoFocus
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => setEditValue(event.target.value)}
                    onKeyDown={(event) => handleRenameKeyDown(event, trade)}
                    aria-invalid={editError ? true : undefined}
                    aria-describedby={`${newInputId}-rename-error`}
                    data-testid={`${testIdPrefix}-rename-input`}
                  />
                  {trade.translationKey !== null && (
                    <p className={styles.hint}>{t('tradesManager.renameHint')}</p>
                  )}
                  <div id={`${newInputId}-rename-error`}>
                    <FormError variant="field" message={editError} />
                  </div>
                  <div className={styles.renameActions}>
                    <button
                      type="submit"
                      className={sharedStyles.btnSecondary}
                      aria-disabled={saving ? 'true' : undefined}
                      data-testid={`${testIdPrefix}-rename-save`}
                    >
                      {saving ? t('tradesManager.saving') : t('tradesManager.save')}
                    </button>
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() => finishRename(trade.id)}
                      data-testid={`${testIdPrefix}-rename-cancel`}
                    >
                      {t('tradesManager.cancel')}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className={styles.rowText}>
                    <span className={styles.rowName}>{name}</span>
                    <span className={styles.rowMeta}>
                      {trade.vendorCount === 0
                        ? t('tradesManager.noCompanies')
                        : t('tradesManager.companyCount', { count: trade.vendorCount })}
                    </span>
                  </div>
                  <OverflowMenu
                    usePortal
                    triggerAriaLabel={t('tradesManager.actionsFor', { name })}
                    data-testid={`${testIdPrefix}-actions-${trade.id}`}
                    items={[
                      {
                        id: 'rename',
                        label: t('tradesManager.rename'),
                        onClick: () => startRename(trade),
                        testId: `${testIdPrefix}-rename-${trade.id}`,
                      },
                      {
                        id: 'merge',
                        label: t('tradesManager.mergeDuplicates'),
                        onClick: () => openMerge(trade),
                        disabled: trades.length < 2,
                        testId: `${testIdPrefix}-merge-${trade.id}`,
                      },
                      {
                        id: 'delete',
                        label: t('tradesManager.deleteAction'),
                        variant: 'destructive',
                        onClick: () => openDelete(trade),
                        testId: `${testIdPrefix}-delete-${trade.id}`,
                      },
                    ]}
                  />
                </>
              )}
            </li>
          );
        })}
      </ul>
    );
  })();

  const body = (
    <div className={styles.body} data-testid={testIdPrefix}>
      <form className={styles.newForm} onSubmit={(event) => void handleAdd(event)} noValidate>
        <label className={styles.label} htmlFor={newInputId}>
          {t('tradesManager.newLabel')}
        </label>
        <div className={styles.newRow}>
          <input
            id={newInputId}
            ref={newInputRef}
            className={styles.input}
            type="text"
            value={newName}
            maxLength={NAME_MAX_LENGTH}
            onChange={(event) => setNewName(event.target.value)}
            aria-invalid={addError ? true : undefined}
            aria-describedby={newErrorId}
            data-testid={`${testIdPrefix}-new-input`}
          />
          <button
            type="submit"
            className={sharedStyles.btnSecondary}
            aria-disabled={adding ? 'true' : undefined}
            data-testid={`${testIdPrefix}-add`}
          >
            {adding ? t('tradesManager.adding') : t('tradesManager.add')}
          </button>
        </div>
        <div id={newErrorId}>
          <FormError variant="field" message={addError} />
        </div>
      </form>
      {list}
      <div role="status" className={sharedStyles.srOnly}>
        {announcement}
      </div>
    </div>
  );

  const footer = (
    <button
      type="button"
      className={`${sharedStyles.btnSecondary} ${styles.done}`}
      onClick={onClose}
      data-testid={`${testIdPrefix}-done`}
    >
      {t('tradesManager.done')}
    </button>
  );

  const dialogs = (
    <>
      {mergeState && (
        <ConfirmDialog
          title={t('tradesManager.merge.title', { name: displayName(mergeState.trade) })}
          lead={t('tradesManager.merge.lead', { name: displayName(mergeState.trade) })}
          confirmLabel={t('tradesManager.merge.confirm')}
          busyLabel={t('tradesManager.merge.busy')}
          tone="danger"
          busy={mergeState.busy}
          error={mergeState.error}
          actionDisabledReason={
            mergeState.targetId ? undefined : t('tradesManager.merge.chooseFirst')
          }
          onConfirm={() => void handleMerge()}
          onCancel={() => {
            requestFocus({ kind: 'row', ids: [mergeState.trade.id] });
            setMergeState(null);
          }}
          returnFocusRef={newInputRef}
          testIdPrefix={`${testIdPrefix}-merge-dialog`}
        >
          <div className={styles.mergeField}>
            <label className={styles.label} htmlFor={mergePickerId}>
              {t('tradesManager.merge.keepLabel')}
            </label>
            <TradePicker
              id={mergePickerId}
              trades={trades}
              excludeIds={[mergeState.trade.id]}
              value={mergeState.targetId}
              onChange={(id) => setMergeState((s) => (s ? { ...s, targetId: id } : s))}
              disabled={mergeState.busy}
            />
            <div role="status" className={styles.mergeStatus}>
              {mergeTarget
                ? mergeState.trade.vendorCount === 0
                  ? t('tradesManager.merge.noneMove', { target: displayName(mergeTarget) })
                  : t('tradesManager.merge.moveCount', {
                      count: mergeState.trade.vendorCount,
                      target: displayName(mergeTarget),
                    })
                : ''}
            </div>
          </div>
        </ConfirmDialog>
      )}
      {deleteState && (
        <ConfirmDialog
          title={t('tradesManager.deleteDialog.title', { name: displayName(deleteState.trade) })}
          lead={
            deleteState.blockedCount !== null
              ? t('tradesManager.deleteDialog.blocked', { count: deleteState.blockedCount })
              : undefined
          }
          irreversible={deleteState.blockedCount === null}
          blocked={deleteState.blockedCount !== null}
          confirmLabel={t('tradesManager.deleteDialog.confirm')}
          busyLabel={t('tradesManager.deleteDialog.busy')}
          tone="danger"
          busy={deleteState.busy}
          error={deleteState.error}
          onConfirm={() => void handleDelete()}
          onCancel={() => {
            requestFocus({ kind: 'row', ids: [deleteState.trade.id] });
            setDeleteState(null);
          }}
          returnFocusRef={newInputRef}
          testIdPrefix={`${testIdPrefix}-delete-dialog`}
        >
          {deleteState.blockedCount !== null && (
            <button
              type="button"
              className={styles.textButton}
              onClick={() => openMerge(deleteState.trade)}
              data-testid={`${testIdPrefix}-merge-instead`}
            >
              {t('tradesManager.deleteDialog.mergeInstead')}
            </button>
          )}
        </ConfirmDialog>
      )}
    </>
  );

  return (
    <>
      {wide ? (
        <Modal
          title={t('tradesManager.title')}
          onClose={onClose}
          className={styles.dialog}
          initialFocusRef={newInputRef}
          dismissible={!confirmOpen}
          returnFocusRef={returnFocusRef}
          footer={footer}
        >
          {body}
        </Modal>
      ) : (
        <Sheet
          id={sheetId}
          open
          onClose={onClose}
          title={t('tradesManager.title')}
          variant="bottom"
          restoreFocusOnUnmount
          footer={footer}
          initialFocusRef={newInputRef}
          dismissible={!confirmOpen}
          returnFocusRef={returnFocusRef}
          testId={`${testIdPrefix}-sheet`}
        >
          {body}
        </Sheet>
      )}
      {dialogs}
    </>
  );
}

export default TradesManager;
