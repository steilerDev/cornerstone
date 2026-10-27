import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { InvoiceDeposit, InvoiceDepositEntryType, InvoiceDetail } from '@cornerstone/shared';
import type { UseInvoiceCostLinesResult } from '../../components/CostLineTable/useInvoiceCostLines.js';
import { InvoiceDepositFormModal } from './InvoiceDepositFormModal.js';
import { invoiceSources } from './invoiceSources.js';

type DialogState =
  | { readonly kind: 'add'; readonly entryType: InvoiceDepositEntryType }
  | { readonly kind: 'edit'; readonly deposit: InvoiceDeposit; readonly name: string };

export interface UsePaymentDialogsArgs {
  readonly invoice: InvoiceDetail;
  readonly costLines: UseInvoiceCostLinesResult;
  /** After a save: the page refresh. */
  readonly onSaved: () => Promise<unknown> | void;
}

export interface PaymentDialogs {
  readonly openAdd: (entryType: InvoiceDepositEntryType, opener: HTMLElement | null) => void;
  readonly openEdit: (deposit: InvoiceDeposit, name: string, opener: HTMLElement | null) => void;
  /** Render once in the page (null while closed). */
  readonly dialog: ReactNode;
}

/**
 * Add / edit dialog state of the progress payments and refunds, held at page level because the
 * header action and the Payments tab both open it.
 */
export function usePaymentDialogs({
  invoice,
  costLines,
  onSaved,
}: UsePaymentDialogsArgs): PaymentDialogs {
  const [state, setState] = useState<DialogState | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const sources = useMemo(
    () => invoiceSources(costLines.lines, costLines.budgetSources),
    [costLines.lines, costLines.budgetSources],
  );

  const openAdd = useCallback<PaymentDialogs['openAdd']>((entryType, opener) => {
    openerRef.current = opener;
    setState({ kind: 'add', entryType });
  }, []);

  const openEdit = useCallback<PaymentDialogs['openEdit']>((deposit, name, opener) => {
    openerRef.current = opener;
    setState({ kind: 'edit', deposit, name });
  }, []);

  const restoreFocus = useCallback(() => {
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) opener.focus();
  }, []);

  const close = useCallback(() => {
    setState(null);
    // The dialog unmounts first; focus returns to the opener when it is still on the page.
    window.setTimeout(restoreFocus, 0);
  }, [restoreFocus]);

  const saved = useCallback(async () => {
    setState(null);
    await onSaved();
    restoreFocus();
  }, [onSaved, restoreFocus]);

  const dialog: ReactNode =
    state === null ? null : (
      <InvoiceDepositFormModal
        invoiceId={invoice.id}
        mode={state.kind}
        deposit={state.kind === 'edit' ? state.deposit : null}
        name={state.kind === 'edit' ? state.name : undefined}
        lockEntryType
        initialValues={
          state.kind === 'add'
            ? { entryType: state.entryType, budgetSourceId: sources[0]?.id ?? null }
            : undefined
        }
        budgetSources={[...costLines.budgetSources]}
        budgetLineSourceCount={sources.length}
        largestBudgetSourceId={sources[0]?.id ?? null}
        invoiceAmount={invoice.amount}
        existingEntries={invoice.deposits}
        onSaved={() => void saved()}
        onClose={close}
      />
    );

  return { openAdd, openEdit, dialog };
}
