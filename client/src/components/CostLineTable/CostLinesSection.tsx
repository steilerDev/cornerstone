import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BaseBudgetLine } from '@cornerstone/shared';
import { useLocale } from '../../contexts/LocaleContext.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { useFormatters } from '../../lib/formatters.js';
import { undoChange } from '../../lib/undoApi.js';
import type { OriginState } from '../../navigation/origin.js';
import { dataTableTestId } from '../DataTable/dataTableTestId.js';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog.js';
import { CostLineForm } from '../CostLineForm/CostLineForm.js';
import { CostLineGridDialog } from '../CostLineForm/CostLineGridDialog.js';
import { LinkInvoiceForm } from '../CostLineForm/LinkInvoiceForm.js';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { RelatedListHeader, useRelatedListFocus } from '../RelatedList/index.js';
import { useToast } from '../Toast/ToastContext.js';
import { FormError } from '../FormError/FormError.js';
import type { OverflowMenuItem } from '../OverflowMenu/index.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import sharedStyles from '../../styles/shared.module.css';
import type { CostLineDocumentKind } from './costLineDocumentKind.js';
import {
  groupForDocument,
  groupForItem,
  remainingState,
  rowFromBudgetLine,
  rowFromInvoiceLine,
} from './costLineRows.js';
import { CostLineTable } from './CostLineTable.js';
import type { CostLineSplitHandle } from './CostLineTable.js';
import { useCostLineMutations } from './useCostLineMutations.js';
import { useInvoiceCostLines } from './useInvoiceCostLines.js';
import type { CostLineGroup, CostLineHost, CostLineRow, CostLineTableMode } from './types.js';
import styles from './CostLinesSection.module.css';

export interface CostLinesSectionProps {
  readonly host: CostLineHost;
  /** Item hosts: the page's lines (the page keeps them for its cost overview). */
  readonly lines?: readonly BaseBudgetLine[];
  readonly loading?: boolean;
  /** After every successful change; item hosts reload their lines and grant payback here. */
  readonly onChanged: () => Promise<void> | void;
  readonly linkState?: OriginState;
  readonly headingLevel?: 2 | 3;
  readonly testId?: string;
}

/**
 * The cost lines of one record, for every host: a task or purchase (item host: its lines grouped
 * into Estimates and one group per offer or invoice) or an offer or invoice (document host: its
 * lines with the task or purchase each belongs to, plus Not yet split). Owns the add, edit,
 * duplicate, assign, link, unlink, remove and delete flows, one dialog at a time.
 */
export function CostLinesSection(props: CostLinesSectionProps) {
  const { host } = props;
  if (host.kind === 'invoice') {
    return <DocumentCostLines {...props} host={host} />;
  }
  return <ItemCostLines {...props} host={host} />;
}

type ItemHost = Exclude<CostLineHost, { kind: 'invoice' }>;

function ItemCostLines({
  host,
  lines,
  loading = false,
  onChanged,
  linkState,
  headingLevel,
  testId,
}: CostLinesSectionProps & { host: ItemHost }) {
  const { vatRate } = useLocale();
  const rows = useMemo<readonly CostLineRow[]>(() => {
    const target = { type: host.kind, id: host.id, label: host.label };
    return (lines ?? []).map((line) => rowFromBudgetLine(line, host.kind, target, vatRate));
  }, [host, lines, vatRate]);
  const groups = useMemo(() => groupForItem(rows), [rows]);
  const afterChange = useCallback(async () => {
    await onChanged();
  }, [onChanged]);

  return (
    <CostLinesView
      host={host}
      mode="item"
      rows={rows}
      groups={groups}
      loading={loading && lines === undefined}
      error={null}
      onRetry={afterChange}
      afterChange={afterChange}
      linkState={linkState}
      headingLevel={headingLevel}
      testId={testId}
    />
  );
}

function DocumentCostLines({
  host,
  onChanged,
  linkState,
  headingLevel,
  testId,
}: CostLinesSectionProps & { host: Extract<CostLineHost, { kind: 'invoice' }> }) {
  const { vatRate } = useLocale();
  const { lines, remainingAmount, sources, loading, error, reload } = useInvoiceCostLines(host.id);
  const rows = useMemo<readonly CostLineRow[]>(() => {
    const doc = {
      id: host.id,
      status: host.status,
      invoiceNumber: null,
      date: null,
      vendorName: null,
    };
    return lines.map((line) => rowFromInvoiceLine(line, doc, vatRate, sources));
  }, [host.id, host.status, lines, sources, vatRate]);
  const groups = useMemo(() => groupForDocument(rows), [rows]);
  const afterChange = useCallback(async () => {
    await reload();
    await onChanged();
  }, [reload, onChanged]);

  return (
    <CostLinesView
      host={host}
      mode="document"
      rows={rows}
      groups={groups}
      remainingAmount={remainingAmount}
      loading={loading}
      error={error}
      onRetry={reload}
      afterChange={afterChange}
      linkState={linkState}
      headingLevel={headingLevel}
      testId={testId}
    />
  );
}

type Dialog =
  | { readonly kind: 'create' }
  | { readonly kind: 'copy'; readonly row: CostLineRow }
  | { readonly kind: 'edit'; readonly row: CostLineRow }
  | { readonly kind: 'assign'; readonly row: CostLineRow }
  | { readonly kind: 'grid'; readonly mode: 'add' | 'split' }
  | { readonly kind: 'link'; readonly row: CostLineRow }
  | { readonly kind: 'delete'; readonly row: CostLineRow };

interface CostLinesViewProps {
  readonly host: CostLineHost;
  readonly mode: CostLineTableMode;
  readonly rows: readonly CostLineRow[];
  readonly groups: readonly CostLineGroup[];
  readonly remainingAmount?: number;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onRetry: () => Promise<void> | void;
  readonly afterChange: () => Promise<void>;
  readonly linkState?: OriginState;
  readonly headingLevel?: 2 | 3;
  readonly testId?: string;
}

function CostLinesView({
  host,
  mode,
  rows,
  groups,
  remainingAmount,
  loading,
  error,
  onRetry,
  afterChange,
  linkState,
  headingLevel = 2,
  testId = 'cost-lines',
}: CostLinesViewProps) {
  const { t } = useTranslation('costLines');
  const { t: tCommon } = useTranslation('common');
  const { vatRate } = useLocale();
  const { formatDate } = useFormatters();
  const headingId = useId();
  const isDocument = host.kind === 'invoice';
  const documentKind: CostLineDocumentKind =
    host.kind === 'invoice' && host.status === 'quotation' ? 'offer' : 'invoice';

  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [status, setStatus] = useState('');
  const openerRef = useRef<HTMLElement | null>(null);
  const addRef = useRef<HTMLButtonElement | null>(null);
  const gridRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const splitHandleRef = useRef<CostLineSplitHandle | null>(null);
  const mutations = useCostLineMutations(afterChange);
  const { showUndoToast } = useToast();
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);

  const remaining = isDocument && remainingAmount !== undefined ? remainingAmount : 0;
  const canSplit = isDocument && remainingState(remaining) === 'notYetSplit';

  const open = (next: Dialog, opener: HTMLElement | null) => {
    openerRef.current = opener;
    mutations.clearError();
    setDialog(next);
  };

  const close = () => {
    mutations.clearError();
    setDialog(null);
  };

  const saved = (message: string) => {
    setStatus(message);
    void afterChange();
  };

  /** The visible ⋯ of a row (table or card copy). */
  const getTrigger = useCallback(
    (rowId: string): HTMLElement | null => {
      const matches = document.querySelectorAll<HTMLElement>(
        `[data-testid="${dataTableTestId(`${testId}-actions`, rowId, 'table')}"], [data-testid="${dataTableTestId(`${testId}-actions`, rowId, 'card')}"]`,
      );
      return Array.from(matches).find((el) => el.getClientRects().length > 0) ?? null;
    },
    [testId],
  );
  const focusFallback = useCallback(() => addRef.current ?? headingRef.current, []);
  const focus = useRelatedListFocus({
    ids: rowIds,
    container: sectionRef,
    getTrigger,
    fallback: focusFallback,
  });

  /** Delete keeps its confirmation. */
  const confirmDelete = async (row: CostLineRow) => {
    const before = rowIds;
    const result = await mutations.run('delete', row);
    if (!result.ok) return;
    setDialog(null);
    window.setTimeout(() => focus.afterRemove(before, row.id), 0);
  };

  /** Unlink and Remove act at once and offer Undo. */
  const removeWithUndo = async (action: 'unlink' | 'remove', row: CostLineRow) => {
    const before = rowIds;
    const result = await mutations.run(action, row);
    if (!result.ok) return;
    const token = result.undo.token;
    // Unlink keeps the line's id: it moves into the Estimates group instead of leaving.
    focus.afterRemove(before, row.id, { moves: action === 'unlink' });
    showUndoToast({
      message: t(action === 'unlink' ? 'undo.unlinked' : 'undo.removed', {
        name: lineName(row),
        document: action === 'unlink' ? documentTitle(row) : host.label,
      }),
      dedupeKey: `cost-line-${action}-${row.id}`,
      focusFallback,
      onUndo: async () => {
        await undoChange(token);
        await afterChange();
        focus.afterUndo(row.id);
      },
    });
  };

  const documentTitle = (row: CostLineRow): string => {
    const kind = t(row.invoiceStatus === 'quotation' ? 'object.offerTitle' : 'object.invoiceTitle');
    return row.invoiceNumber
      ? t('table.groupInvoice', { kind, number: row.invoiceNumber })
      : t('table.groupInvoiceNoNumber', { kind, date: formatDate(row.invoiceDate) });
  };

  const lineName = (row: CostLineRow) => row.description ?? t('table.noDescription');

  const rowActions = (row: CostLineRow): readonly OverflowMenuItem[] => {
    const item = (
      id: string,
      label: string,
      next: Dialog,
      variant?: 'destructive',
    ): OverflowMenuItem => ({
      id,
      label,
      variant,
      onClick: () => open(next, openerRef.current),
    });
    const immediate = (id: 'remove' | 'unlink', label: string): OverflowMenuItem => ({
      id,
      label,
      onClick: () => void removeWithUndo(id, row),
    });
    if (row.invoiceId === null) {
      return [
        item('edit', t('action.edit'), { kind: 'edit', row }),
        item('duplicate', t('action.duplicate'), { kind: 'copy', row }),
        item('link', t('action.linkInvoice'), { kind: 'link', row }),
        item('delete', t('action.delete'), { kind: 'delete', row }, 'destructive'),
      ];
    }
    const orphan = row.target === null;
    return [
      ...(orphan ? [item('assign', t('action.assign'), { kind: 'assign', row })] : []),
      item('edit', t('action.edit'), { kind: 'edit', row }),
      item('duplicate', t('action.duplicate'), { kind: 'copy', row }),
      isDocument
        ? immediate('remove', t(I18N_UNION_KEYS.costLineRemoveFromDocument.key(documentKind)))
        : immediate('unlink', t('action.unlink')),
    ];
  };

  const objectWord = t('object.one');

  const renderDialog = () => {
    if (dialog === null) return null;
    switch (dialog.kind) {
      case 'create':
      case 'copy':
        return (
          <CostLineForm
            host={host}
            mode={{ kind: 'create' }}
            copyFrom={dialog.kind === 'copy' ? dialog.row : undefined}
            onSaved={() => saved(t('section.saved'))}
            onClose={close}
            returnFocusRef={openerRef}
          />
        );
      case 'edit':
      case 'assign':
        return (
          <CostLineForm
            host={host}
            mode={{ kind: dialog.kind, row: dialog.row }}
            onSaved={() => saved(t('section.saved'))}
            onClose={close}
            returnFocusRef={openerRef}
          />
        );
      case 'grid':
        return (
          <CostLineGridDialog
            host={host}
            mode={dialog.mode}
            remainingAmount={isDocument ? remainingAmount : undefined}
            onSaved={(count) => saved(t('section.savedCount', { count }))}
            onClose={() => {
              close();
              if (dialog.mode === 'split')
                window.setTimeout(() => splitHandleRef.current?.focus(), 0);
            }}
            returnFocusRef={dialog.mode === 'split' ? undefined : openerRef}
          />
        );
      case 'link':
        return (
          <LinkInvoiceForm
            row={dialog.row}
            onSaved={(title) => saved(t('linkInvoice.linked', { invoice: title }))}
            onClose={close}
            returnFocusRef={openerRef}
          />
        );
      case 'delete':
        return renderDeleteConfirm(dialog.row);
    }
  };

  const renderDeleteConfirm = (row: CostLineRow) => (
    <ConfirmDialog
      busy={mutations.busy}
      error={mutations.error}
      onConfirm={() => void confirmDelete(row)}
      onCancel={close}
      returnFocusRef={openerRef}
      title={tCommon('confirmDialog.deleteTitle', { name: lineName(row) })}
      irreversible
      blocked={mutations.blocked}
      confirmLabel={tCommon('button.delete')}
      busyLabel={tCommon('confirmDialog.deleting')}
      testIdPrefix="cost-line-delete"
    />
  );

  let body;
  if (loading) {
    body = <Skeleton lines={3} />;
  } else if (error !== null) {
    body = (
      <div className={styles.failure}>
        <FormError message={error} />
        <button type="button" className={styles.secondary} onClick={() => void onRetry()}>
          {t('section.retry')}
        </button>
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        message={t('section.emptyTitle')}
        description={
          isDocument
            ? t(I18N_UNION_KEYS.costLineEmptyBodyDocument.key(documentKind))
            : t('section.emptyBodyItem')
        }
        action={
          canSplit
            ? {
                label: t('table.split'),
                onClick: () => open({ kind: 'grid', mode: 'split' }, null),
              }
            : undefined
        }
      />
    );
  } else {
    body = (
      <CostLineTable
        mode={mode}
        groups={groups}
        remainingAmount={isDocument ? remainingAmount : undefined}
        documentKind={documentKind}
        onSplit={canSplit ? () => open({ kind: 'grid', mode: 'split' }, null) : undefined}
        splitButtonRef={splitHandleRef}
        rowActions={rowActions}
        onRowActionsTrigger={(_row, el) => {
          openerRef.current = el;
        }}
        vatRate={vatRate}
        linkState={linkState}
        testIdPrefix={testId}
      />
    );
  }

  return (
    <section
      ref={sectionRef}
      className={styles.section}
      aria-labelledby={headingId}
      data-testid={`${testId}-section`}
    >
      <RelatedListHeader
        title={t('section.title')}
        count={loading || error !== null ? undefined : rows.length}
        headingLevel={headingLevel}
        headingId={headingId}
        headingRef={headingRef}
        flush
      >
        <button
          type="button"
          ref={addRef}
          className={styles.secondary}
          onClick={(event) => open({ kind: 'create' }, event.currentTarget)}
          data-testid={`${testId}-add`}
        >
          {t('section.add', { object: objectWord })}
        </button>
        <button
          type="button"
          ref={gridRef}
          className={styles.secondary}
          onClick={(event) => open({ kind: 'grid', mode: 'add' }, event.currentTarget)}
          data-testid={`${testId}-add-grid`}
        >
          {t('section.addGrid')}
        </button>
      </RelatedListHeader>
      {dialog === null && mutations.error !== null ? <FormError message={mutations.error} /> : null}
      {body}
      <p role="status" className={sharedStyles.srOnly} data-testid={`${testId}-status`}>
        {status}
      </p>
      {renderDialog()}
    </section>
  );
}
