import { useCallback, useId, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { InvoiceDeposit, InvoiceListRow } from '@cornerstone/shared';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu.js';
import {
  invoiceTransitions,
  progressPaymentTransitions,
} from '../../components/StatusMenu/statusVocabularies.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import {
  changeDepositStatus,
  changeInvoiceStatus,
  depositStatusBody,
  invoiceStatusBody,
} from '../../lib/statusChangeApi.js';
import { undoChange } from '../../lib/undoApi.js';
import shared from '../../styles/shared.module.css';

/** What the Mark paid controls need from the list host. */
export interface InvoiceMarkPaidHost {
  /** Fresh rows and figures for these row keys, without a reload (D5). */
  readonly refreshRows: (keys: readonly string[]) => Promise<void>;
  /** Reload from the first batch (after Undo). */
  readonly refresh: () => void;
  /** The page h1: where focus goes when the control that had it is gone. */
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}

export interface InvoiceMarkPaidActions {
  readonly markInvoicePaid: (inv: InvoiceListRow, title: string) => Promise<void>;
  readonly markProgressPaymentPaid: (
    inv: InvoiceListRow,
    deposit: InvoiceDeposit,
    name: string,
    date: string | null,
  ) => Promise<void>;
  readonly markManyPaid: (selected: readonly InvoiceListRow[], clear: () => void) => Promise<void>;
}

/**
 * The Mark paid requests of the Invoices list, each with Undo: one invoice, one progress payment
 * (with the date chosen in the StatusMenu) and a bulk run over the selected invoices that are
 * still to pay (one PATCH after the other, one Undo toast for all of them).
 */
export function useInvoiceMarkPaid(host: InvoiceMarkPaidHost): InvoiceMarkPaidActions {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { run } = useUndoableStatusChange();
  const { showToast, showUndoToast } = useToast();
  const statusVariants = useStatusBadgeVariants();
  const hostRef = useRef(host);
  hostRef.current = host;

  const markInvoicePaid = useCallback(
    (inv: InvoiceListRow, title: string) =>
      run({
        request: () => changeInvoiceStatus(inv.vendorId, inv.id, invoiceStatusBody('paid')),
        recordName: title,
        statusLabel: statusVariants.invoice.paid.label,
        dedupeKey: `invoice:${inv.id}`,
        onChanged: () => void hostRef.current.refreshRows([inv.id]),
        onUndone: () => hostRef.current.refresh(),
        focusFallback: () => hostRef.current.headingRef.current,
      }),
    [run, statusVariants],
  );

  const markProgressPaymentPaid = useCallback(
    (inv: InvoiceListRow, deposit: InvoiceDeposit, name: string, date: string | null) =>
      run({
        request: () =>
          changeDepositStatus(inv.id, deposit.id, depositStatusBody('pending', 'paid', date)),
        recordName: name,
        statusLabel: statusVariants.progressPayment.paid.label,
        dedupeKey: `progress-payment:${deposit.id}`,
        onChanged: () => void hostRef.current.refreshRows([inv.id]),
        onUndone: () => hostRef.current.refresh(),
        focusFallback: () => hostRef.current.headingRef.current,
      }),
    [run, statusVariants],
  );

  const markManyPaid = useCallback(
    async (selected: readonly InvoiceListRow[], clear: () => void) => {
      const eligible = selected.filter((inv) => inv.status === 'pending');
      const doneIds: string[] = [];
      const tokens: string[] = [];
      const failures: unknown[] = [];
      for (const inv of eligible) {
        try {
          // One after the other: each PATCH has its own Undo token.
          const result = await changeInvoiceStatus(inv.vendorId, inv.id, invoiceStatusBody('paid'));
          doneIds.push(inv.id);
          if (result.undo) tokens.push(result.undo.token);
        } catch (err) {
          failures.push(err);
        }
      }

      // The bar unmounts when the selection empties, so focus moves to the heading first.
      clear();
      hostRef.current.headingRef.current?.focus();

      if (doneIds.length > 0) {
        await hostRef.current.refreshRows(doneIds);
        if (tokens.length > 0) {
          showUndoToast({
            message: t('invoices.list.markPaid.bulkDone', {
              count: doneIds.length,
              status: statusVariants.invoice.paid.label,
            }),
            dedupeKey: 'invoices:bulk-paid',
            focusFallback: () => hostRef.current.headingRef.current,
            onUndo: async () => {
              for (const token of [...tokens].reverse()) {
                // Newest first, so every change is undone on top of the state it left.
                await undoChange(token);
              }
              hostRef.current.refresh();
            },
          });
        }
      }

      if (failures.length > 0) {
        const codes = new Set(
          failures.map((failure) => (failure instanceof ApiClientError ? failure.error.code : '')),
        );
        const [code] = [...codes];
        showToast(
          'error',
          codes.size === 1 && code
            ? translateApiError(code, tErrors)
            : t('invoices.list.markPaid.bulkFailed', { count: failures.length }),
        );
      }
    },
    [showToast, showUndoToast, statusVariants, t, tErrors],
  );

  return useMemo(
    () => ({ markInvoicePaid, markProgressPaymentPaid, markManyPaid }),
    [markInvoicePaid, markProgressPaymentPaid, markManyPaid],
  );
}

/** The row command of a pending invoice: "Mark paid" (nothing for any other status). */
export function InvoiceMarkPaidCommand({
  inv,
  title,
  actions,
  testId,
}: {
  readonly inv: InvoiceListRow;
  readonly title: string;
  readonly actions: InvoiceMarkPaidActions;
  readonly testId: string;
}) {
  const { t } = useTranslation('budget');
  const { t: tCommon } = useTranslation('common');
  const statusVariants = useStatusBadgeVariants();
  if (inv.status !== 'pending') return null;
  return (
    <StatusMenu
      appearance="action"
      actionTo="paid"
      transitions={invoiceTransitions(tCommon, inv)}
      badge={{ variants: statusVariants.invoice, value: inv.status }}
      currentLabel={statusVariants.invoice[inv.status].label}
      nameSuffix={t('invoices.list.markPaid.nameSuffix', { title, company: inv.vendorName })}
      onApply={() => actions.markInvoicePaid(inv, title)}
      testId={testId}
    />
  );
}

/** The command of a pending progress payment: "Mark paid" with the date step (refunds have none). */
export function ProgressPaymentMarkPaidCommand({
  inv,
  deposit,
  name,
  actions,
  testId,
}: {
  readonly inv: InvoiceListRow;
  readonly deposit: InvoiceDeposit;
  /** "Progress payment 1 of 2": the toast's record name. */
  readonly name: string;
  readonly actions: InvoiceMarkPaidActions;
  readonly testId: string;
}) {
  const { t } = useTranslation('budget');
  const { t: tCommon } = useTranslation('common');
  const statusVariants = useStatusBadgeVariants();
  if (deposit.status !== 'pending' || deposit.entryType !== 'deposit') return null;
  return (
    <StatusMenu
      appearance="action"
      actionTo="paid"
      transitions={progressPaymentTransitions(tCommon, deposit)}
      badge={{ variants: statusVariants.progressPayment, value: deposit.status }}
      currentLabel={statusVariants.progressPayment[deposit.status].label}
      nameSuffix={t('invoices.list.markPaid.nameSuffix', {
        title: name,
        company: inv.vendorName,
      })}
      onApply={(_to, date) => actions.markProgressPaymentPaid(inv, deposit, name, date)}
      testId={testId}
    />
  );
}

/**
 * The one bulk action: "Mark paid (n)" over the selected invoices that are still to pay. Offers
 * and the rest are skipped and named in the description; with none eligible the button is
 * `aria-disabled` and says why (never native `disabled`).
 */
export function InvoiceBulkMarkPaid({
  selected,
  clear,
  actions,
}: {
  readonly selected: readonly InvoiceListRow[];
  readonly clear: () => void;
  readonly actions: InvoiceMarkPaidActions;
}) {
  const { t } = useTranslation('budget');
  const { t: tCommon } = useTranslation('common');
  const reasonId = useId();
  const runningRef = useRef(false);
  const eligible = selected.filter((inv) => inv.status === 'pending').length;
  const skipped = selected.length - eligible;
  const reason =
    eligible === 0
      ? t('invoices.list.markPaid.bulkNone')
      : skipped > 0
        ? t('invoices.list.markPaid.bulkSkipped', { count: skipped })
        : null;
  const label = t('invoices.list.markPaid.bulk', {
    action: tCommon(I18N_UNION_KEYS.statusActionInvoice.key('markPaid')),
    count: eligible,
  });

  return (
    <>
      <button
        type="button"
        className={shared.btnSecondaryCompact}
        aria-disabled={eligible === 0 || undefined}
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => {
          if (eligible === 0 || runningRef.current) return;
          runningRef.current = true;
          void actions.markManyPaid(selected, clear).finally(() => {
            runningRef.current = false;
          });
        }}
        data-testid="invoices-bulk-mark-paid"
      >
        {label}
      </button>
      {reason ? (
        <span id={reasonId} className={shared.srOnly}>
          {reason}
        </span>
      ) : null}
    </>
  );
}
