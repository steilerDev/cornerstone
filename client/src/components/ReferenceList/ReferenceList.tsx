import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { DeleteImpactEntityType } from '@cornerstone/shared';
import { useEntriesLanguage } from '../../contexts/HouseNameContext.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog.js';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { FormError } from '../FormError/FormError.js';
import { OverflowMenu } from '../OverflowMenu/OverflowMenu.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import styles from './ReferenceList.module.css';
import { ReferenceListDialog } from './ReferenceListDialog.js';
import { moveId, positionOf } from './reorder.js';
import { useReorder } from './useReorder.js';
import type { ReorderSource } from './useReorder.js';

export interface ReferenceListItem {
  readonly id: string;
  /** As displayed (translated for built-in rows). */
  readonly name: string;
  readonly description?: string | null;
  readonly color?: string | null;
  /** Built-in row with a translated name: renaming replaces it in every language. */
  readonly translated?: boolean;
}

export interface ReferenceListValues {
  readonly name: string;
  readonly description?: string | null;
  readonly color?: string | null;
}

export interface ReferenceListLabels {
  /** The h2. */
  readonly title: string;
  /** One line under the h2. */
  readonly description: string;
  /** The New button's aria-label and the New dialog's title. */
  readonly newItem: string;
  readonly editItem: string;
  readonly empty: string;
  readonly loadFailed: string;
  /** Shown on a 409 CONFLICT from create or update. */
  readonly duplicateName: string;
  /** Lead of the blocked delete dialog when DELETE answers 409; omit when delete never 409s. */
  readonly deleteBlocked?: (name: string) => string;
}

export interface ReferenceListFields {
  readonly nameMaxLength: number;
  /** Omit = no description field. */
  readonly descriptionMaxLength?: number;
  readonly color?: boolean;
}

export interface ReferenceListProps {
  /** Section id (hash target); the heading id is `${anchorId}-heading`. */
  readonly anchorId: string;
  readonly sectionTestId: string;
  readonly testIdPrefix: string;
  readonly labels: ReferenceListLabels;
  readonly fields: ReferenceListFields;
  readonly items: readonly ReferenceListItem[];
  readonly status: 'loading' | 'error' | 'ready';
  readonly onRetry: () => void;
  readonly onCreate: (values: ReferenceListValues) => Promise<{ id: string }>;
  readonly onUpdate: (id: string, changes: Partial<ReferenceListValues>) => Promise<unknown>;
  readonly onDelete: (id: string) => Promise<void>;
  readonly onReorder: (ids: string[]) => Promise<void>;
  /** Fetches delete consequences with useDeleteImpact for this type; omit = no counts. */
  readonly deleteImpactType?: DeleteImpactEntityType;
  /** Page-level polite announcement (added, saved, deleted, reorder positions). */
  readonly onAnnounce: (message: string) => void;
}

type DialogState = { readonly mode: 'new' } | { readonly mode: 'edit'; readonly id: string };

interface DeleteState {
  readonly item: ReferenceListItem;
  readonly busy: boolean;
  readonly blocked: boolean;
  readonly error: string | null;
}

/** One pending focus request, consumed once its target exists and no dialog is open. */
type PendingFocus =
  | { readonly kind: 'menu' | 'handle'; readonly id: string; readonly sticky?: boolean }
  | { readonly kind: 'rowMenu'; readonly ids: readonly string[] }
  | { readonly kind: 'heading' }
  | null;

/**
 * An ordered list of simple reference items (name, optional description and color) with a New
 * button, a ⋯ menu per row (Edit, Move up, Move down, Delete) and reordering by pointer or
 * keyboard drag. Every move is one atomic request with the whole id list. All strings come from
 * props or the common namespace.
 */
export function ReferenceList({
  anchorId,
  sectionTestId,
  testIdPrefix,
  labels,
  fields,
  items,
  status,
  onRetry,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
  deleteImpactType,
  onAnnounce,
}: ReferenceListProps) {
  const { t } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const entriesLanguage = useEntriesLanguage() ?? undefined;
  const headingId = `${anchorId}-heading`;
  const instructionsId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const pendingFocusRef = useRef<PendingFocus>(null);

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [reorderPending, setReorderPending] = useState(false);
  const [reorderFailed, setReorderFailed] = useState(false);

  const ready = status === 'ready';
  const ids = items.map((item) => item.id);
  const byId = new Map(items.map((item) => [item.id, item]));
  const nameOf = (id: string) => byId.get(id)?.name ?? '';

  const deleteImpact = useDeleteImpact(deleteImpactType ?? null, deleteState?.item.id ?? null);

  // Focus never falls to the body: each action names its target, applied once the target exists
  // and no dialog is open (a dialog's own focus restore runs first, then this overrides it). React
  // moves keyed rows by moving DOM nodes, which can blur the moved control, so a reorder's
  // request stays until the request settles.
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending || dialog !== null || deleteState !== null) return;
    const find = (testId: string) =>
      sectionRef.current?.querySelector<HTMLElement>(`[data-testid="${testId}"]`) ?? null;
    let target: HTMLElement | null = null;
    if (pending.kind === 'menu') target = find(`${testIdPrefix}-menu-${pending.id}`);
    else if (pending.kind === 'handle') target = find(`${testIdPrefix}-handle-${pending.id}`);
    else if (pending.kind === 'rowMenu') {
      for (const id of pending.ids) {
        target = find(`${testIdPrefix}-menu-${id}`);
        if (target) break;
      }
      target ??= headingRef.current;
    } else target = headingRef.current;
    if (!target?.isConnected) return;
    target.focus();
    const sticky = (pending.kind === 'menu' || pending.kind === 'handle') && pending.sticky;
    if (!(sticky && reorderPending)) pendingFocusRef.current = null;
  }, [items, dialog, deleteState, reorderPending, testIdPrefix]);

  const commitReorder = async (
    nextIds: string[],
    movedId: string,
    source: ReorderSource | 'menu',
  ) => {
    if (reorderPending) return;
    setReorderFailed(false);
    setReorderPending(true);
    pendingFocusRef.current = {
      kind: source === 'menu' ? 'menu' : 'handle',
      id: movedId,
      sticky: true,
    };
    try {
      await onReorder(nextIds);
    } catch {
      setReorderFailed(true);
    } finally {
      setReorderPending(false);
    }
  };

  const reorder = useReorder({
    ids,
    disabled: reorderPending || !ready,
    listRef,
    onCommit: (nextIds, movedId, source) => void commitReorder(nextIds, movedId, source),
    onAnnounce,
    labelOf: nameOf,
  });

  const moveBy = (id: string, delta: -1 | 1) => {
    const index = ids.indexOf(id);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= ids.length || reorderPending) return;
    const next = moveId(ids, id, target);
    onAnnounce(t('referenceList.dropped', { name: nameOf(id), ...positionOf(next, id) }));
    void commitReorder(next, id, 'menu');
  };

  const handleRetry = () => {
    headingRef.current?.focus();
    onRetry();
  };

  const openNew = () => {
    if (!ready) return;
    setDialog({ mode: 'new' });
  };

  const handleDialogSubmit = async (values: ReferenceListValues | Partial<ReferenceListValues>) => {
    if (!dialog) return;
    if (dialog.mode === 'new') {
      const created = await onCreate(values as ReferenceListValues);
      pendingFocusRef.current = { kind: 'menu', id: created.id };
      setDialog(null);
      onAnnounce(t('referenceList.added', { name: values.name ?? '' }));
    } else {
      await onUpdate(dialog.id, values);
      pendingFocusRef.current = { kind: 'menu', id: dialog.id };
      setDialog(null);
      onAnnounce(t('referenceList.saved', { name: values.name ?? nameOf(dialog.id) }));
    }
  };

  const focusAfterRemoving = (id: string): PendingFocus => {
    const index = ids.indexOf(id);
    const neighbours = [ids[index + 1], ids[index - 1]].filter((other) => other !== undefined);
    return neighbours.length > 0 ? { kind: 'rowMenu', ids: neighbours } : { kind: 'heading' };
  };

  const handleDelete = async () => {
    if (!deleteState || deleteState.busy || deleteState.blocked) return;
    const { item } = deleteState;
    setDeleteState({ ...deleteState, busy: true, error: null });
    try {
      await onDelete(item.id);
      pendingFocusRef.current = focusAfterRemoving(item.id);
      setDeleteState(null);
      onAnnounce(t('referenceList.deleted', { name: item.name }));
    } catch (err) {
      if (err instanceof ApiClientError && err.statusCode === 409 && labels.deleteBlocked) {
        setDeleteState({ item, busy: false, blocked: true, error: null });
      } else {
        const message =
          err instanceof ApiClientError
            ? translateApiError(err.error.code, tErrors)
            : err instanceof NetworkError
              ? t('requestErrors.network')
              : t('requestErrors.unexpected');
        setDeleteState({ item, busy: false, blocked: false, error: message });
      }
    }
  };

  const editingItem = dialog?.mode === 'edit' ? byId.get(dialog.id) : undefined;

  const renderBody = () => {
    if (status === 'loading') return <Skeleton lines={3} />;
    if (status === 'error') {
      return (
        <div className={styles.loadError}>
          <FormError message={labels.loadFailed} />
          <button
            type="button"
            className={styles.retry}
            onClick={handleRetry}
            data-testid={`${testIdPrefix}-retry`}
          >
            {t('button.retry')}
          </button>
        </div>
      );
    }
    if (items.length === 0) return <EmptyState message={labels.empty} />;
    return (
      <>
        {reorderFailed && (
          <div className={styles.banner} role="alert" data-testid={`${testIdPrefix}-reorder-error`}>
            {t('referenceList.reorderFailed')}
          </div>
        )}
        <span hidden id={instructionsId}>
          {t('referenceList.reorderInstructions')}
        </span>
        <ul
          ref={listRef}
          className={styles.list}
          aria-label={labels.title}
          data-has-color={fields.color ? 'true' : undefined}
          data-reordering={reorder.drag ? 'true' : undefined}
        >
          {reorder.orderedIds.map((id) => {
            const item = byId.get(id);
            if (!item) return null;
            const position = ids.indexOf(id);
            const { drag } = reorder;
            const dropping =
              drag && drag.overIndex !== drag.fromIndex && drag.overIndex === position;
            const drop = dropping
              ? drag.overIndex > drag.fromIndex
                ? 'after'
                : 'before'
              : undefined;
            const picked = reorder.pickedId === id || drag?.id === id;
            const textLang = item.translated ? undefined : entriesLanguage;
            return (
              <li
                key={id}
                className={styles.row}
                data-testid={`${testIdPrefix}-row-${id}`}
                data-dragging={picked ? 'true' : undefined}
                data-drop={drop}
              >
                <button
                  type="button"
                  className={styles.handle}
                  aria-label={t('referenceList.reorderHandle', { name: item.name })}
                  aria-describedby={instructionsId}
                  data-testid={`${testIdPrefix}-handle-${id}`}
                  {...reorder.handleProps(id)}
                >
                  <span aria-hidden="true">⠿</span>
                </button>
                {fields.color && (
                  <span
                    aria-hidden="true"
                    className={styles.swatch}
                    data-color={item.color ? 'set' : undefined}
                    style={
                      item.color
                        ? ({ '--reference-color': item.color } as CSSProperties)
                        : undefined
                    }
                  />
                )}
                <span className={styles.text}>
                  <span className={styles.name} title={item.name} lang={textLang}>
                    {item.name}
                  </span>
                  {item.description && (
                    <span className={styles.itemDescription} lang={textLang}>
                      {item.description}
                    </span>
                  )}
                </span>
                <OverflowMenu
                  usePortal
                  triggerAriaLabel={t('referenceList.actionsFor', { name: item.name })}
                  data-testid={`${testIdPrefix}-menu-${id}`}
                  items={[
                    {
                      id: 'edit',
                      label: t('button.edit'),
                      onClick: () => setDialog({ mode: 'edit', id }),
                      testId: `${testIdPrefix}-edit-${id}`,
                    },
                    {
                      id: 'move-up',
                      label: t('referenceList.moveUp'),
                      onClick: () => moveBy(id, -1),
                      ariaDisabled: position <= 0 || reorderPending,
                      testId: `${testIdPrefix}-move-up-${id}`,
                    },
                    {
                      id: 'move-down',
                      label: t('referenceList.moveDown'),
                      onClick: () => moveBy(id, 1),
                      ariaDisabled: position >= ids.length - 1 || reorderPending,
                      testId: `${testIdPrefix}-move-down-${id}`,
                    },
                    { kind: 'separator', id: 'separator' },
                    {
                      id: 'delete',
                      label: t('button.delete'),
                      variant: 'destructive',
                      onClick: () =>
                        setDeleteState({ item, busy: false, blocked: false, error: null }),
                      testId: `${testIdPrefix}-delete-${id}`,
                    },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      </>
    );
  };

  return (
    <section
      id={anchorId}
      ref={sectionRef}
      aria-labelledby={headingId}
      className={styles.card}
      data-testid={sectionTestId}
    >
      <div className={styles.header}>
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.title}>
          {labels.title}
        </h2>
        <button
          type="button"
          className={styles.newButton}
          aria-label={labels.newItem}
          aria-disabled={ready ? undefined : 'true'}
          onClick={openNew}
          data-testid={`${testIdPrefix}-new`}
        >
          {t('referenceList.new')}
        </button>
      </div>
      <p className={styles.description}>{labels.description}</p>
      {renderBody()}

      {dialog && (
        <ReferenceListDialog
          key={dialog.mode === 'edit' ? dialog.id : 'new'}
          mode={dialog.mode}
          item={editingItem}
          labels={labels}
          fields={fields}
          testIdPrefix={testIdPrefix}
          entriesLanguage={entriesLanguage}
          onSubmit={handleDialogSubmit}
          onClose={() => setDialog(null)}
        />
      )}

      {deleteState && (
        <ConfirmDialog
          title={t('confirmDialog.deleteTitle', { name: deleteState.item.name })}
          lead={deleteState.blocked ? labels.deleteBlocked?.(deleteState.item.name) : undefined}
          consequences={deleteImpactType && !deleteState.blocked ? deleteImpact : undefined}
          irreversible={!deleteState.blocked}
          blocked={deleteState.blocked}
          confirmLabel={t('button.delete')}
          busyLabel={t('confirmDialog.deleting')}
          tone="danger"
          busy={deleteState.busy}
          error={deleteState.error}
          onConfirm={() => void handleDelete()}
          onCancel={() => {
            if (!deleteState.busy) setDeleteState(null);
          }}
          returnFocusRef={headingRef}
          testIdPrefix={`${testIdPrefix}-delete-dialog`}
        />
      )}
    </section>
  );
}

export default ReferenceList;
