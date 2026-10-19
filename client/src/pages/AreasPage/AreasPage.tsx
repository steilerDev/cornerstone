import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaWithCounts } from '@cornerstone/shared';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { FormError } from '../../components/FormError/FormError.js';
import { HighlightedText } from '../../components/CommandSearch/HighlightedText.js';
import { ObjectForm } from '../../components/ObjectForm/ObjectForm.js';
import type { ObjectFormResult } from '../../components/ObjectForm/types.js';
import { OverflowMenu } from '../../components/OverflowMenu/OverflowMenu.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { moveId, positionOf } from '../../components/ReferenceList/reorder.js';
import type { ReorderSource } from '../../components/ReferenceList/useReorder.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { TreeTable } from '../../components/TreeTable/TreeTable.js';
import type {
  TreeTableCell,
  TreeTableLabels,
  TreeTableRow,
} from '../../components/TreeTable/TreeTable.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { formatDayMonth } from '../../lib/formatters.js';
import { undoChange } from '../../lib/undoApi.js';
import { areaFormPrefill, useAreaFormSchema } from '../../objectForms/areaForm.js';
import sharedStyles from '../../styles/shared.module.css';
import { AreaDeleteDialog } from './AreaDeleteDialog.js';
import {
  areaPath,
  buildAreaTreeRows,
  computeRollups,
  filterAreas,
  siblingsOf,
} from './areaTree.js';
import type { AreaRollup, AreaTreeRow, OpenTotal } from './areaTree.js';
import styles from './AreasPage.module.css';
import { useAreasIndex } from './useAreasIndex.js';

const TEST_ID_PREFIX = 'areas-tree';
const PATH_SEPARATOR = ' › ';
const DEFAULT_EXPANDED_DEPTH = 1;
const MATCH_ANNOUNCE_DELAY_MS = 400;

type FormState =
  | { readonly mode: 'new'; readonly parentId: string | null }
  | { readonly mode: 'edit'; readonly id: string };

interface DeleteState {
  readonly id: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly forceBlocked: boolean;
}

/** One pending focus request, consumed once its target exists and no dialog is open. */
type PendingFocus =
  | {
      readonly kind: 'menu' | 'handle';
      readonly id: string;
      readonly sticky?: boolean;
      readonly scroll?: boolean;
    }
  | { readonly kind: 'rowMenu'; readonly ids: readonly string[] }
  | null;

/**
 * Areas › Areas (index): the house as a tree of buildings, floors and rooms with the tasks,
 * purchases and photos attached to each, rolled up over the sub-areas. New / Edit through the
 * shared ObjectForm, delete with Undo, reorder among siblings by drag, keyboard or the ⋯ menu.
 */
export function AreasPage() {
  const { t, i18n } = useTranslation('areas');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const title = tCommon('navigation.areas');
  useDocumentTitle(title);

  const { areas, status, retry, refetch, reorder, remove } = useAreasIndex();
  const { showUndoToast } = useToast();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const [query, setQuery] = useState('');
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [form, setForm] = useState<FormState | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [reorderPending, setReorderPending] = useState(false);
  const [reorderFailed, setReorderFailed] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<PendingFocus>(null);
  const announceFrameRef = useRef(0);
  const matchTimerRef = useRef(0);

  const ready = status === 'ready';
  const filter = useMemo(() => filterAreas(areas, query), [areas, query]);
  const rollups = useMemo(() => computeRollups(areas), [areas]);
  const byId = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);
  const treeRows = useMemo(
    () =>
      buildAreaTreeRows(areas, {
        visibleIds: filter?.visibleIds ?? null,
        matchIds: filter?.matchIds ?? null,
      }),
    [areas, filter],
  );
  const depthById = useMemo(() => new Map(treeRows.map((row) => [row.id, row.depth])), [treeRows]);

  const pathOf = useCallback(
    (id: string, source: readonly AreaWithCounts[] = areas) =>
      areaPath(source, id)
        .map((segment) => segment.name)
        .join(PATH_SEPARATOR),
    [areas],
  );

  // One always-mounted polite region. Clearing first makes a repeated message read again.
  const announce = useCallback((message: string) => {
    window.cancelAnimationFrame(announceFrameRef.current);
    setAnnouncement('');
    announceFrameRef.current = window.requestAnimationFrame(() => setAnnouncement(message));
  }, []);
  useEffect(
    () => () => {
      window.cancelAnimationFrame(announceFrameRef.current);
      window.clearTimeout(matchTimerRef.current);
    },
    [],
  );

  // A load error takes focus to the heading, never the body.
  useEffect(() => {
    if (status === 'error') headingRef.current?.focus();
  }, [status]);

  // Focus never falls to the body: each action names its target, applied once the target exists
  // and no dialog is open. Moving keyed rows moves DOM nodes, which can blur the moved control,
  // so a reorder's request stays until the request settles.
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending || form !== null || deleteState !== null) return;
    const find = (testId: string) =>
      rootRef.current?.querySelector<HTMLElement>(`[data-testid="${testId}"]`) ?? null;
    let target: HTMLElement | null = null;
    if (pending.kind === 'rowMenu') {
      for (const id of pending.ids) {
        target = find(`${TEST_ID_PREFIX}-menu-${id}`);
        if (target) break;
      }
      target ??= newButtonRef.current;
    } else {
      const part = pending.kind === 'menu' ? 'menu' : 'handle';
      target = find(`${TEST_ID_PREFIX}-${part}-${pending.id}`);
    }
    if (!target?.isConnected) return;
    if (pending.kind !== 'rowMenu' && pending.scroll) {
      find(`${TEST_ID_PREFIX}-row-${pending.id}`)?.scrollIntoView?.({
        block: 'nearest',
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    }
    target.focus();
    const sticky = pending.kind !== 'rowMenu' && pending.sticky;
    if (!(sticky && reorderPending)) pendingFocusRef.current = null;
  }, [areas, form, deleteState, reorderPending, reducedMotion]);

  const isExpanded = useCallback(
    (id: string) => {
      if (filter) return true;
      const override = overrides.get(id);
      if (override !== undefined) return override;
      return (depthById.get(id) ?? 0) <= DEFAULT_EXPANDED_DEPTH;
    },
    [filter, overrides, depthById],
  );

  const toggle = (id: string) => {
    if (filter) return;
    const next = !isExpanded(id);
    setOverrides((previous) => new Map(previous).set(id, next));
  };

  const expandAncestors = (id: string, source: readonly AreaWithCounts[]) => {
    const path = areaPath(source, id);
    const parents = path.slice(0, -1);
    if (parents.length === 0) return;
    setOverrides((previous) => {
      const next = new Map(previous);
      for (const parent of parents) next.set(parent.id, true);
      return next;
    });
  };

  // ---- reorder -------------------------------------------------------------------------------

  const announcePosition = (
    name: string,
    parentId: string | null,
    ids: readonly string[],
    id: string,
  ) => {
    const parent = parentId === null ? t('index.topLevelName') : (byId.get(parentId)?.name ?? '');
    announce(t('index.position', { name, parent, ...positionOf(ids, id) }));
  };

  const commitReorder = async (
    parentId: string | null,
    ids: string[],
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
      await reorder(parentId, ids);
    } catch {
      setReorderFailed(true);
      await refetch();
    } finally {
      setReorderPending(false);
    }
  };

  const moveBy = (area: AreaWithCounts, delta: -1 | 1) => {
    const ids = siblingsOf(areas, area.parentId).map((sibling) => sibling.id);
    const index = ids.indexOf(area.id);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= ids.length || reorderPending || filter) return;
    const next = moveId(ids, area.id, target);
    announcePosition(area.name, area.parentId, next, area.id);
    void commitReorder(area.parentId, next, area.id, 'menu');
  };

  // ---- form ----------------------------------------------------------------------------------

  const formArea = form?.mode === 'edit' ? byId.get(form.id) : undefined;
  const schema = useAreaFormSchema({
    mode: form?.mode ?? 'new',
    ...(formArea ? { area: formArea } : {}),
    areas,
  });
  const formPrefill = useMemo(
    () =>
      form === null
        ? undefined
        : areaFormPrefill(
            { mode: form.mode, ...(formArea ? { area: formArea } : {}) },
            form.mode === 'new' ? form.parentId : null,
          ),
    [form, formArea],
  );

  const openNew = (parentId: string | null = null) => {
    if (!ready) return;
    setForm({ mode: 'new', parentId });
  };

  const handleFormDone = (result: ObjectFormResult) => {
    if (!form) return;
    const added = form.mode === 'new';
    pendingFocusRef.current = { kind: 'menu', id: result.id, scroll: true };
    setForm(null);
    void (async () => {
      const fresh = await refetch();
      const source = fresh ?? areas;
      expandAncestors(result.id, source);
      const name = pathOf(result.id, source) || result.label;
      announce(added ? t('index.status.added', { name }) : t('index.status.saved', { name }));
    })();
  };

  // ---- delete --------------------------------------------------------------------------------

  const deletingArea = deleteState ? byId.get(deleteState.id) : undefined;
  const deleteRollup = deletingArea ? rollups.get(deletingArea.id) : undefined;

  const handleDelete = async () => {
    if (!deleteState || !deletingArea || deleteState.busy) return;
    const { id } = deleteState;
    const path = pathOf(id);
    const name = deletingArea.name;
    const siblings = siblingsOf(areas, deletingArea.parentId).map((sibling) => sibling.id);
    const index = siblings.indexOf(id);
    const neighbours = [siblings[index + 1], siblings[index - 1], deletingArea.parentId].filter(
      (other): other is string => other !== undefined && other !== null,
    );
    setDeleteState({ ...deleteState, busy: true, error: null });
    try {
      const token = await remove(id);
      pendingFocusRef.current = { kind: 'rowMenu', ids: neighbours };
      setDeleteState(null);
      showUndoToast({
        message: t('index.toast.deleted', { name: path }),
        dedupeKey: `area-delete-${id}`,
        focusFallback: () => newButtonRef.current,
        onUndo: async () => {
          await undoChange(token.token);
          pendingFocusRef.current = { kind: 'menu', id };
          const fresh = await refetch();
          if (fresh) expandAncestors(id, fresh);
          announce(t('index.toast.restored', { name: path || name }));
        },
      });
    } catch (error) {
      if (error instanceof ApiClientError && error.error.code === 'AREA_IN_USE') {
        await refetch();
        setDeleteState({ id, busy: false, error: null, forceBlocked: true });
        return;
      }
      const message =
        error instanceof ApiClientError
          ? translateApiError(error.error.code, tErrors)
          : error instanceof NetworkError
            ? tCommon('requestErrors.network')
            : tCommon('requestErrors.unexpected');
      setDeleteState({ id, busy: false, error: message, forceBlocked: false });
    }
  };

  // ---- filter --------------------------------------------------------------------------------

  const handleQueryChange = (value: string) => {
    setQuery(value);
    window.clearTimeout(matchTimerRef.current);
    const result = filterAreas(areas, value);
    if (!result) return;
    matchTimerRef.current = window.setTimeout(() => {
      announce(
        result.matchIds.size > 0
          ? t('index.status.matches', { count: result.matchIds.size })
          : t('index.status.noMatches', { query: value.trim() }),
      );
    }, MATCH_ANNOUNCE_DELAY_MS);
  };

  const clearFilter = () => {
    window.clearTimeout(matchTimerRef.current);
    setQuery('');
    searchRef.current?.focus();
  };

  // ---- tree rows -----------------------------------------------------------------------------

  const openCell = (value: OpenTotal): TreeTableCell => {
    if (value.total === 0) {
      return { content: t('index.count.none'), muted: true };
    }
    return { content: t('index.count.openOfTotal', { open: value.open, total: value.total }) };
  };

  const photosCell = (rollup: AreaRollup): TreeTableCell => {
    const { total, latestDate } = rollup.photos;
    if (total === 0) return { content: t('index.count.none'), muted: true };
    const date = latestDate ? formatDayMonth(latestDate, i18n.language) : null;
    return {
      content: t('index.count.photos', { count: total }),
      ...(date ? { detail: t('index.count.latest', { date }) } : {}),
      phoneContent: date
        ? t('index.count.photosPhone', { count: total, date })
        : t('index.count.photosPhoneNoDate', { count: total }),
    };
  };

  const toTreeRow = (row: AreaTreeRow): TreeTableRow => {
    const cells = [
      openCell(row.rollup.tasks),
      openCell(row.rollup.purchases),
      photosCell(row.rollup),
    ];
    if (row.quiet) {
      let label: string;
      if (row.quiet === 'building') label = t('index.quiet.building');
      else if (row.quiet === 'floor') label = t('index.quiet.floor');
      else label = t('index.quiet.other', { name: row.area.name });
      return { id: row.id, parentId: row.parentId, label, cells, quiet: true };
    }
    return {
      id: row.id,
      parentId: row.parentId,
      label: row.area.name,
      ...(filter ? { name: <HighlightedText text={row.area.name} query={query.trim()} /> } : {}),
      color: row.area.color,
      cells,
      muted: row.muted,
    };
  };
  const tableRows = treeRows.map(toTreeRow);

  const labels: TreeTableLabels = {
    tree: t('index.tree'),
    nameHeader: t('index.columns.name'),
    group: (name) => t('index.row.group', { name }),
    toggle: (name) => t('index.row.subAreas', { name }),
    reorder: (name) => t('index.row.reorder', { name }),
    reorderInstructions: tCommon('referenceList.reorderInstructions'),
    reorderDisabledHint: t('index.reorderHint'),
    position: ({ name, position, total, parentLabel }) =>
      t('index.position', {
        name,
        position,
        total,
        parent: parentLabel ?? t('index.topLevelName'),
      }),
  };

  const columns = [
    { id: 'tasks', label: t('index.columns.tasks') },
    { id: 'purchases', label: t('index.columns.purchases') },
    { id: 'photos', label: t('index.columns.photos') },
  ];

  const renderActions = (row: TreeTableRow) => {
    const area = byId.get(row.id);
    if (!area) return null;
    const siblings = siblingsOf(areas, area.parentId);
    const position = siblings.findIndex((sibling) => sibling.id === area.id);
    const locked = reorderPending || filter !== null;
    return (
      <OverflowMenu
        usePortal
        triggerAriaLabel={t('index.row.actions', { name: area.name })}
        data-testid={`${TEST_ID_PREFIX}-menu-${area.id}`}
        items={[
          {
            id: 'edit',
            label: t('index.menu.edit'),
            onClick: () => setForm({ mode: 'edit', id: area.id }),
            testId: `${TEST_ID_PREFIX}-edit-${area.id}`,
          },
          {
            id: 'add-sub',
            label: t('index.menu.addSub'),
            onClick: () => openNew(area.id),
            testId: `${TEST_ID_PREFIX}-add-sub-${area.id}`,
          },
          {
            id: 'move-up',
            label: t('index.menu.moveUp'),
            onClick: () => moveBy(area, -1),
            ariaDisabled: position <= 0 || locked,
            testId: `${TEST_ID_PREFIX}-move-up-${area.id}`,
          },
          {
            id: 'move-down',
            label: t('index.menu.moveDown'),
            onClick: () => moveBy(area, 1),
            ariaDisabled: position >= siblings.length - 1 || locked,
            testId: `${TEST_ID_PREFIX}-move-down-${area.id}`,
          },
          { kind: 'separator', id: 'separator' },
          {
            id: 'delete',
            label: t('index.menu.delete'),
            variant: 'destructive',
            onClick: () =>
              setDeleteState({ id: area.id, busy: false, error: null, forceBlocked: false }),
            testId: `${TEST_ID_PREFIX}-delete-${area.id}`,
          },
        ]}
      />
    );
  };

  // ---- body ----------------------------------------------------------------------------------

  const renderBody = () => {
    if (status === 'loading') return <Skeleton lines={6} />;
    if (status === 'error') {
      return (
        <div className={styles.loadError}>
          <FormError message={t('index.loadFailed')} />
          <button type="button" className={styles.retry} onClick={retry} data-testid="areas-retry">
            {t('index.retry')}
          </button>
        </div>
      );
    }
    if (areas.length === 0) return <EmptyState message={t('index.empty')} />;
    return (
      <>
        {reorderFailed && (
          <div className={styles.banner} role="alert" data-testid="areas-reorder-error">
            {t('index.reorderFailed')}
          </div>
        )}
        {tableRows.length === 0 ? (
          <div className={styles.noMatch} data-testid="areas-no-match">
            <p className={styles.noMatchText}>
              {t('index.status.noMatches', { query: query.trim() })}
            </p>
            <button
              type="button"
              className={styles.clearButton}
              onClick={clearFilter}
              data-testid="areas-clear-filter"
            >
              {t('index.clearFilter')}
            </button>
          </div>
        ) : (
          <TreeTable
            rows={tableRows}
            columns={columns}
            labels={labels}
            isExpanded={isExpanded}
            onToggle={toggle}
            reorderDisabled={reorderPending || filter !== null}
            onReorder={(parentId, ids, movedId, source) =>
              void commitReorder(parentId, ids, movedId, source)
            }
            onAnnounce={announce}
            renderActions={renderActions}
            testIdPrefix={TEST_ID_PREFIX}
          />
        )}
      </>
    );
  };

  return (
    <PageLayout
      title={title}
      headingRef={headingRef}
      testId="areas-page"
      action={
        <button
          ref={newButtonRef}
          type="button"
          className={styles.newButton}
          aria-disabled={ready ? undefined : 'true'}
          onClick={() => openNew()}
          data-testid="areas-new"
        >
          {t('index.new')}
        </button>
      }
    >
      <div ref={rootRef} className={styles.page}>
        <p className={styles.description}>{t('index.description')}</p>

        <div className={styles.searchBox}>
          <label htmlFor="areas-filter" className={sharedStyles.srOnly}>
            {t('index.filter')}
          </label>
          <input
            ref={searchRef}
            id="areas-filter"
            type="search"
            className={styles.searchInput}
            value={query}
            autoComplete="off"
            data-page-search
            onChange={(event) => handleQueryChange(event.target.value)}
            data-testid="areas-filter"
          />
          {query !== '' && (
            <button
              type="button"
              className={styles.searchClear}
              aria-label={t('index.clearFilter')}
              onClick={clearFilter}
              data-testid="areas-filter-clear"
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>

        {renderBody()}
      </div>

      {form && (
        <ObjectForm
          key={form.mode === 'edit' ? form.id : `new-${form.parentId ?? 'top'}`}
          schema={schema}
          {...(formPrefill ? { prefill: formPrefill } : {})}
          returnFocusRef={newButtonRef}
          onCreated={handleFormDone}
          onCancel={() => setForm(null)}
          testId="areas-form"
        />
      )}

      {deleteState && deletingArea && (
        <AreaDeleteDialog
          areaId={deletingArea.id}
          path={pathOf(deletingArea.id)}
          tasks={deleteRollup?.tasks.total ?? 0}
          purchases={deleteRollup?.purchases.total ?? 0}
          forceBlocked={deleteState.forceBlocked}
          busy={deleteState.busy}
          error={deleteState.error}
          onConfirm={() => void handleDelete()}
          onCancel={() => {
            if (!deleteState.busy) setDeleteState(null);
          }}
          onNavigate={() => setDeleteState(null)}
          returnFocusRef={headingRef}
        />
      )}

      <div role="status" className={sharedStyles.srOnly} data-testid="areas-status">
        {announcement}
      </div>
    </PageLayout>
  );
}

export default AreasPage;
