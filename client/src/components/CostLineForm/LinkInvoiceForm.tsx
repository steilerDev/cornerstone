import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Invoice } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import { createInvoiceBudgetLine } from '../../lib/invoiceBudgetLinesApi.js';
import { invoiceDisplayTitle } from '../../lib/invoiceTitle.js';
import { fetchAllInvoices } from '../../lib/invoicesApi.js';
import { roundMoney } from '../../lib/money.js';
import { ObjectForm } from '../ObjectForm/ObjectForm.js';
import type { ObjectFormSchema } from '../ObjectForm/types.js';
import { SearchPicker } from '../SearchPicker/SearchPicker.js';
import type { LinkInvoiceFormProps } from './types.js';

const INVOICE_PAGE_SIZE = 50;
const NO_EXCLUDED: string[] = [];

/**
 * "Link to offer or invoice": links a cost line that has no offer or invoice to one, with the amount it takes
 * (gross). Replaces the former link modal.
 */
export function LinkInvoiceForm({ row, onSaved, onClose, returnFocusRef }: LinkInvoiceFormProps) {
  const { t } = useTranslation('costLines');
  const { formatCurrency } = useFormatters();
  // Every invoice a search returned, so a picked id resolves to its invoice.
  const knownRef = useRef(new Map<string, Invoice>());
  const [picked, setPicked] = useState<Invoice | undefined>(undefined);
  const nouns = { invoice: t('object.invoice'), offer: t('object.offer') };

  const titleOf = (invoice: Invoice) => invoiceDisplayTitle(invoice, nouns);

  const search = async (query: string, _excluded: string[], signal: AbortSignal) => {
    // A leading '#' still matches the number.
    const term = query.trim().replace(/^#/, '');
    const response = await fetchAllInvoices(
      {
        ...(term && { q: term }),
        pageSize: INVOICE_PAGE_SIZE,
        ...(row.vendorId && { vendorId: row.vendorId }),
      },
      { signal },
    );
    for (const invoice of response.invoices) knownRef.current.set(invoice.id, invoice);
    return response.invoices;
  };

  const leftText = (invoice: Invoice) => {
    const remaining = roundMoney(invoice.remainingAmount);
    if (remaining > 0) return t('linkInvoice.leftToSplit', { amount: formatCurrency(remaining) });
    if (remaining === 0) return t('linkInvoice.fullySplit');
    return t('linkInvoice.overBy', { amount: formatCurrency(Math.abs(remaining)) });
  };

  const schema: ObjectFormSchema = {
    id: 'costLineLinkInvoice',
    title: t('linkInvoice.title'),
    initialValues: { invoiceId: '', itemizedAmount: String(row.gross) },
    fields: [
      {
        name: 'invoiceId',
        label: t('linkInvoice.invoice'),
        kind: 'custom',
        essential: true,
        required: true,
        render: (ctx) => (
          <SearchPicker<Invoice>
            id={ctx.id}
            value={ctx.value as string}
            onChange={(id) => {
              ctx.setValue(id);
              setPicked(knownRef.current.get(id));
            }}
            excludeIds={NO_EXCLUDED}
            disabled={ctx.busy}
            placeholder={t('linkInvoice.invoicePlaceholder')}
            noResultsMessage={t('linkInvoice.noInvoices')}
            searchFn={search}
            renderItem={(invoice) => ({ id: invoice.id, label: titleOf(invoice) })}
            renderSecondary={leftText}
            showItemsOnFocus
            inputAriaProps={{
              'aria-invalid': ctx.invalid || undefined,
              'aria-describedby': ctx.describedBy,
            }}
          />
        ),
      },
      {
        name: 'itemizedAmount',
        label: t('linkInvoice.amount'),
        kind: 'number',
        essential: true,
        required: true,
        min: 0,
        hint: picked
          ? t('linkInvoice.amountHint', {
              amount: formatCurrency(Math.max(0, roundMoney(picked.remainingAmount))),
            })
          : undefined,
      },
    ],
    validate: (values) => {
      const errors: Record<string, string> = {};
      if (values.invoiceId === '') {
        errors.invoiceId = t('linkInvoice.errorPick');
      }
      const amount = Number(values.itemizedAmount);
      if (!(amount > 0)) errors.itemizedAmount = t('form.errorAmountPositive');
      return errors;
    },
    submit: async (values) => {
      const invoiceId = values.invoiceId as string;
      const invoice = knownRef.current.get(invoiceId)!;
      await createInvoiceBudgetLine(invoiceId, {
        invoiceId,
        ...(row.lineType === 'work_item'
          ? { workItemBudgetId: row.id }
          : { householdItemBudgetId: row.id }),
        itemizedAmount: Number(values.itemizedAmount),
      });
      const label = titleOf(invoice);
      onSaved(label);
      return { id: invoiceId, href: '', label };
    },
    mapError: (code) => {
      if (code === 'ITEMIZED_SUM_EXCEEDS_INVOICE') {
        return { itemizedAmount: t('form.errorOverInvoice') };
      }
      if (code === 'BUDGET_LINE_ALREADY_LINKED') {
        return { invoiceId: t('linkInvoice.errorAlreadyLinked') };
      }
      return null;
    },
  };

  return (
    <ObjectForm
      schema={schema}
      onCreated={onClose}
      onCancel={onClose}
      returnFocusRef={returnFocusRef}
      testId="link-invoice-form"
    />
  );
}

export default LinkInvoiceForm;
