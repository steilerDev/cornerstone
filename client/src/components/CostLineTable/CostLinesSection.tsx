import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BaseBudgetLine } from '@cornerstone/shared';
import { useLocale } from '../../contexts/LocaleContext.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { useFormatters } from '../../lib/formatters.js';
import type { OriginState } from '../../navigation/origin.js';
import { dataTableTestId } from '../DataTable/dataTableTestId.js';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog.js';
import { CostLineForm } from '../CostLineForm/CostLineForm.js';
import { CostLineGridDialog } from '../CostLineForm/CostLineGridDialog.js';
import { LinkInvoiceForm } from '../CostLineForm/LinkInvoiceForm.js';
import { EmptyState } from '../EmptyState/EmptyState.js';
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
import type { CostLineMutation } from './useCostLineMutations.js';
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
  | { readonly kind: 'confirm'; readonly action: CostLineMutation; readonly row: CostLineRow };

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
  const splitHandleRef = useRef<CostLineSplitHandle | null>(null);
  const mutations = useCostLineMutations(afterChange);

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

  /** Focus the ⋯ of the row (visible copy of the two surfaces) or fall back to the heading. */
  const focusRowMenu = (rowId: string | undefined) => {
    window.setTimeout(() => {
      if (rowId !== undefined) {
        const matches = document.querySelectorAll<HTMLElement>(
          `[data-testid="${dataTableTestId(`${testId}-actions`, rowId, 'table')}"], [data-testid="${dataTableTestId(`${testId}-actions`, rowId, 'card')}"]`,
        );
        const shown = Array.from(matches).find((el) => el.getClientRects().length > 0);
        if (shown) {
          shown.focus();
          return;
        }
      }
      headingRef.current?.focus();
    }, 0);
  };

  const confirmAction = async (action: CostLineMutation, row: CostLineRow) => {
    const index = rows.findIndex((candidate) => candidate.id === row.id);
    const neighbour = rows[index + 1] ?? rows[index - 1];
    const worked = await mutations.run(action, row);
    if (!worked) return;
    setDialog(null);
    focusRowMenu(neighbour?.id);
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
    if (row.invoiceId === null) {
      return [
        item('edit', t('action.edit'), { kind: 'edit', row }),
        item('duplicate', t('action.duplicate'), { kind: 'copy', row }),
        item('link', t('action.linkInvoice'), { kind: 'link', row }),
        item(
          'delete',
          t('action.delete'),
          { kind: 'confirm', action: 'delete', row },
          'destructive',
        ),
      ];
    }
    const orphan = row.target === null;
    return [
      ...(orphan ? [item('assign', t('action.assign'), { kind: 'assign', row })] : []),
      item('edit', t('action.edit'), { kind: 'edit', row }),
      item('duplicate', t('action.duplicate'), { kind: 'copy', row }),
      isDocument
        ? item(
            'remove',
            t(I18N_UNION_KEYS.costLineRemoveFromDocument.key(documentKind)),
            { kind: 'confirm', action: 'remove', row },
            'destructive',
          )
        : item(
            'unlink',
            t('action.unlink'),
            { kind: 'confirm', action: 'unlink', row },
            'destructive',
          ),
    ];
  };

  const Heading = headingLevel === 3 ? 'h3' : 'h2';
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
      case 'confirm':
        return renderConfirm(dialog.action, dialog.row);
    }
  };

  const renderConfirm = (action: CostLineMutation, row: CostLineRow) => {
    const common = {
      busy: mutations.busy,
      error: mutations.error,
      onConfirm: () => void confirmAction(action, row),
      onCancel: close,
      returnFocusRef: openerRef,
    };
    if (action === 'delete') {
      return (
        <ConfirmDialog
          {...common}
          title={tCommon('confirmDialog.deleteTitle', { name: lineName(row) })}
          irreversible
          blocked={mutations.blocked}
          confirmLabel={tCommon('button.delete')}
          busyLabel={tCommon('confirmDialog.deleting')}
          testIdPrefix="cost-line-delete"
        />
      );
    }
    if (action === 'unlink') {
      return (
        <ConfirmDialog
          {...common}
          title={t('confirm.unlinkTitle', { name: lineName(row), invoice: documentTitle(row) })}
          lead={t('confirm.unlinkLead')}
          tone="danger"
          confirmLabel={t('confirm.unlink')}
          busyLabel={t('confirm.unlinking')}
          testIdPrefix="cost-line-unlink"
        />
      );
    }
    return (
      <ConfirmDialog
        {...common}
        title={t('confirm.removeTitle', { name: lineName(row), invoice: host.label })}
        lead={
          row.target
            ? t('confirm.removeLead', { target: row.target.label })
            : t(I18N_UNION_KEYS.costLineRemoveLeadNoTarget.key(documentKind))
        }
        tone="danger"
        confirmLabel={t('confirm.remove')}
        busyLabel={t('confirm.removing')}
        testIdPrefix="cost-line-remove"
      />
    );
  };

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
      className={styles.section}
      aria-labelledby={headingId}
      data-testid={`${testId}-section`}
    >
      <Heading id={headingId} ref={headingRef} tabIndex={-1} className={styles.heading}>
        {t('section.title')}
      </Heading>
      <div className={styles.actions}>
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
      </div>
      {body}
      <p role="status" className={sharedStyles.srOnly} data-testid={`${testId}-status`}>
        {status}
      </p>
      {renderDialog()}
    </section>
  );
}
