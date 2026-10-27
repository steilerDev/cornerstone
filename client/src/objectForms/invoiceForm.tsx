import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { INVOICE_STATUSES, routeUrl } from '@cornerstone/shared';
import type { InvoiceDetail, InvoiceStatus } from '@cornerstone/shared';
import { EntityPicker } from '../components/EntityPicker/EntityPicker.js';
import { itemValue, parseItemValue } from '../components/EntityPicker/entityPickerKinds.js';
import type {
  ObjectFormErrors,
  ObjectFormField,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import { useLocale } from '../contexts/LocaleContext.js';
import { useDocumentIntegration } from '../hooks/useDocumentIntegration.js';
import { useStatusBadgeVariants } from '../hooks/useStatusBadgeVariants.js';
import { I18N_UNION_KEYS } from '../i18n/unionKeys.js';
import { useFormatters } from '../lib/formatters.js';
import { invoiceDisplayTitle } from '../lib/invoiceTitle.js';
import { createInvoice, updateInvoice } from '../lib/invoicesApi.js';
import { todayLocalIsoDate } from '../lib/localDate.js';
import { useCompanyFormSchema } from './companyForm.js';
import type { CompanyOption } from './companyForm.js';
import { InvoiceDocumentField } from './InvoiceDocumentField.js';
import type {
  InvoiceCreateRequest,
  InvoiceFormItem,
  InvoiceFormKind,
} from './invoiceCreateContext.js';

export type InvoiceFormOptions =
  | { readonly mode: 'create'; readonly request: InvoiceCreateRequest }
  | {
      readonly mode: 'edit';
      readonly invoice: InvoiceDetail;
      /** After a successful save: the page refresh (the PATCH response lacks the money figures). */
      readonly onSaved: () => Promise<unknown>;
    };

const NOTES_MAX = 10000;
const NUMBER_MAX = 100;

/** The statuses an invoice can take: an offer is only ever created or converted, never chosen. */
const INVOICE_ONLY_STATUSES = INVOICE_STATUSES.filter((status) => status !== 'quotation');

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Field values that a create request seeds (company and the task/purchase), by field name. */
export function invoiceFormPrefill(request: InvoiceCreateRequest): ObjectFormValues {
  return {
    ...(request.company ? { vendorId: request.company.id } : {}),
    ...(request.item ? { costLine: itemValue(request.item) } : {}),
  };
}

/**
 * The New invoice / New offer form and the Edit details form of an invoice or offer: one schema,
 * `mode` picks the difference. An offer has no Status (it is sent as `quotation`); an invoice
 * offers To pay, Paid and Submitted.
 */
export function useInvoiceFormSchema(options: InvoiceFormOptions): ObjectFormSchema {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const companySchema = useCompanyFormSchema();
  const statusVariants = useStatusBadgeVariants();
  const { formatCurrency } = useFormatters();
  const { currency } = useLocale();
  const create = options.mode === 'create';
  const request = options.mode === 'create' ? options.request : null;
  const invoice = options.mode === 'edit' ? options.invoice : null;
  const integration = useDocumentIntegration({ enabled: create });
  const [today] = useState(() => todayLocalIsoDate());
  const [createdCompany, setCreatedCompany] = useState<CompanyOption | null>(null);
  const [unknownCompany, setUnknownCompany] = useState(false);
  const [item, setItem] = useState<InvoiceFormItem | null>(request?.item ?? null);
  const [documentLabel, setDocumentLabel] = useState('');
  const [pendingDocumentId, setPendingDocumentId] = useState(request?.documentId);

  const kind: InvoiceFormKind = request
    ? request.kind
    : invoice!.status === 'quotation'
      ? 'offer'
      : 'invoice';
  const preselected =
    request?.company ?? (invoice ? { id: invoice.vendorId, name: invoice.vendorName } : undefined);

  const fields: ObjectFormField[] = [];

  if (create && !(integration.loaded && !integration.available)) {
    fields.push({
      name: 'paperlessDocumentId',
      label: t('invoiceForm.document.label'),
      kind: 'custom',
      essential: true,
      optionsLoading: !integration.loaded,
      render: (ctx) => (
        <InvoiceDocumentField
          ctx={ctx}
          integration={integration}
          pendingDocumentId={pendingDocumentId}
          onPendingConsumed={() => setPendingDocumentId(undefined)}
          defaultDate={today}
          label={documentLabel}
          onPicked={setDocumentLabel}
        />
      ),
    });
  }

  fields.push(
    {
      name: 'vendorId',
      label: t('invoiceForm.company.label'),
      kind: 'custom',
      essential: true,
      required: true,
      keep: true,
      notice: unknownCompany ? t('invoiceForm.company.unknown') : undefined,
      render: (ctx) => {
        const value = text(ctx.value);
        return (
          <EntityPicker
            kind="company"
            id={ctx.id}
            value={value}
            selectedLabel={preselected && value === preselected.id ? preselected.name : undefined}
            knownCompany={createdCompany}
            disabled={ctx.busy}
            inputAriaProps={{
              'aria-required': true,
              'aria-invalid': ctx.invalid || undefined,
              'aria-describedby': ctx.describedBy,
            }}
            onChange={(next) => {
              setUnknownCompany(false);
              ctx.setValue(next);
            }}
            onUnknownCompany={() => {
              setUnknownCompany(true);
              ctx.setValue('');
            }}
            // The form continues in a child step (dialogs never stack); the new company is set
            // on this field when it is saved.
            create={(query) => {
              ctx.createChild({
                schema: companySchema,
                prefill: { name: query },
                onCreated: (result) => {
                  setCreatedCompany({ id: result.id, name: result.label });
                  setUnknownCompany(false);
                  ctx.setValue(result.id);
                },
              });
              return Promise.resolve(null);
            }}
          />
        );
      },
    },
    {
      name: 'invoiceNumber',
      label: t('invoiceForm.number.label'),
      kind: 'text',
      essential: true,
      width: 'half',
      maxLength: NUMBER_MAX,
      placeholder: t('invoiceForm.number.placeholder'),
    },
    {
      name: 'amount',
      label: t('invoiceForm.amount.label'),
      kind: 'number',
      essential: true,
      required: true,
      width: 'half',
      min: 0,
      step: 0.01,
      inputMode: 'decimal',
      hint: t('invoiceForm.amount.hint', { currency }),
    },
    {
      name: 'date',
      label: t('invoiceForm.date.label'),
      kind: 'date',
      essential: true,
      required: true,
      width: 'half',
      keep: true,
    },
    {
      name: 'dueDate',
      label: t('invoiceForm.dueDate.label'),
      kind: 'date',
      essential: true,
      width: 'half',
    },
  );

  if (kind === 'invoice') {
    fields.push({
      name: 'status',
      label: t('invoiceForm.status.label'),
      kind: 'select',
      essential: true,
      width: 'half',
      keep: true,
      options: INVOICE_ONLY_STATUSES.map((status) => ({
        value: status,
        label: statusVariants.invoice[status].label,
      })),
    });
  }

  if (create) {
    fields.push({
      name: 'costLine',
      label: t('invoiceForm.forItem.label'),
      kind: 'custom',
      essential: true,
      hint: (values) =>
        item && text(values.costLine) && Number(values.amount) > 0
          ? t('invoiceForm.forItem.hintFilled', {
              amount: formatCurrency(Number(values.amount)),
              title: item.label,
            })
          : t('invoiceForm.forItem.hint'),
      render: (ctx) => (
        <EntityPicker
          kind="taskOrPurchase"
          id={ctx.id}
          value={text(ctx.value)}
          selectedLabel={item?.label}
          disabled={ctx.busy}
          inputAriaProps={{
            'aria-invalid': ctx.invalid || undefined,
            'aria-describedby': ctx.describedBy,
          }}
          onChange={(next, option) => {
            const parsed = parseItemValue(next);
            setItem(parsed && option ? { ...parsed, label: option.label } : null);
            ctx.setValue(next);
          }}
        />
      ),
    });
  }

  fields.push({
    name: 'notes',
    label: t('invoiceForm.notes.label'),
    kind: 'textarea',
    essential: !create,
    maxLength: NOTES_MAX,
  });

  const initialValues: ObjectFormValues = invoice
    ? {
        vendorId: invoice.vendorId,
        invoiceNumber: invoice.invoiceNumber ?? '',
        amount: String(invoice.amount),
        date: invoice.date.slice(0, 10),
        dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : '',
        ...(kind === 'invoice' ? { status: invoice.status } : {}),
        notes: invoice.notes ?? '',
      }
    : {
        paperlessDocumentId: '',
        vendorId: '',
        invoiceNumber: '',
        amount: '',
        date: today,
        dueDate: '',
        status: 'pending',
        costLine: '',
        notes: '',
      };

  const validate = (values: ObjectFormValues): ObjectFormErrors => {
    const errors: Record<string, string> = {};
    const amount = Number(text(values.amount));
    if (!text(values.vendorId)) errors.vendorId = t('invoiceForm.errors.companyRequired');
    if (!(Number.isFinite(amount) && amount > 0)) {
      errors.amount = text(values.costLine)
        ? t('invoiceForm.errors.amountForCostLine')
        : t('invoiceForm.errors.amountRequired');
    }
    const date = text(values.date);
    const dueDate = text(values.dueDate);
    if (!date) errors.date = t('invoiceForm.errors.dateRequired');
    if (dueDate && date && dueDate < date) errors.dueDate = t('invoiceForm.errors.dueBeforeDate');
    return errors;
  };

  const base = {
    fields,
    initialValues,
    validate,
  };

  if (options.mode === 'edit') {
    const { invoice: edited, onSaved } = options;
    return {
      ...base,
      id: 'invoice-edit',
      title: t('invoiceDetail.modal.editTitle'),
      submit: async (values) => {
        await updateInvoice(edited.vendorId, edited.id, {
          invoiceNumber: text(values.invoiceNumber).trim() || null,
          amount: Number(text(values.amount)),
          date: text(values.date),
          dueDate: text(values.dueDate) || null,
          ...(kind === 'invoice' ? { status: text(values.status) as InvoiceStatus } : {}),
          notes: text(values.notes).trim() || null,
          vendorId: text(values.vendorId),
        });
        // The PATCH succeeded: a failed page refresh is the page's own error state, not a failed save.
        await onSaved().catch(() => undefined);
        return { id: edited.id, href: routeUrl('invoice', { id: edited.id }), label: '' };
      },
      mapError: (code, _values, details) => {
        if (code === 'ITEMIZED_SUM_EXCEEDS_INVOICE') {
          const raw = details?.itemizedTotal;
          const itemizedTotal = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
          return {
            amount:
              itemizedTotal !== null
                ? t('invoiceForm.errors.amountBelowItemized', {
                    itemizedTotal: formatCurrency(itemizedTotal),
                  })
                : t('invoiceForm.errors.amountBelowItemizedNoTotal'),
          };
        }
        if (code === 'NOT_FOUND') return { vendorId: t('invoiceForm.company.unknown') };
        return null;
      },
    };
  }

  const nouns = { invoice: tc('navigation.invoice'), offer: tc('navigation.offer') };
  return {
    ...base,
    id: kind,
    title: t(I18N_UNION_KEYS.invoiceFormTitle.key(kind)),
    addAnother: true,
    submit: async (values) => {
      const target = parseItemValue(text(values.costLine));
      const documentId = text(values.paperlessDocumentId);
      const created = await createInvoice(text(values.vendorId), {
        invoiceNumber: text(values.invoiceNumber).trim() || null,
        amount: Number(text(values.amount)),
        date: text(values.date),
        dueDate: text(values.dueDate) || null,
        status: kind === 'offer' ? 'quotation' : (text(values.status) as InvoiceStatus),
        notes: text(values.notes).trim() || null,
        ...(target ? { costLine: { targetType: target.type, targetId: target.id } } : {}),
        ...(documentId ? { paperlessDocumentId: Number(documentId) } : {}),
      });
      return {
        id: created.id,
        href: routeUrl('invoice', { id: created.id }),
        label: invoiceDisplayTitle(created, nouns),
      };
    },
    addedMessage: (result) => t(I18N_UNION_KEYS.invoiceFormAdded.key(kind), { name: result.label }),
  };
}
