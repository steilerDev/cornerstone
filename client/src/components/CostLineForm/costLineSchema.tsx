import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EditAndMoveBudgetLineRequest } from '@cornerstone/shared';
import { useLocale } from '../../contexts/LocaleContext.js';
import { assignBudgetLine } from '../../lib/budgetLineAssignApi.js';
import { createBudgetLinesBatch } from '../../lib/budgetLinesBatchApi.js';
import {
  createHouseholdItemBudget,
  updateHouseholdItemBudget,
} from '../../lib/householdItemBudgetsApi.js';
import {
  createInvoiceBudgetLine,
  editAndMoveBudgetLine,
  fetchInvoiceBudgetLines,
} from '../../lib/invoiceBudgetLinesApi.js';
import { createWorkItemBudget, updateWorkItemBudget } from '../../lib/workItemBudgetsApi.js';
import type { KnownCompany } from '../../hooks/useCompanyName.js';
import { useCompanyFormSchema } from '../../objectForms/companyForm.js';
import type {
  ObjectFormErrors,
  ObjectFormField,
  ObjectFormResult,
  ObjectFormSchema,
  ObjectFormValues,
} from '../ObjectForm/types.js';
import { CostLineAmountField, CostLineBasisField } from './CostLineFields.js';
import { CostLineCompanyPicker } from './CostLineCompanyPicker.js';
import { CostLineEnteredAs } from './CostLineEnteredAs.js';
import { CostLineExistingField } from './CostLineExistingField.js';
import { CostLineTargetPicker } from './CostLineTargetPicker.js';
import {
  DESCRIPTION_MAX_LENGTH,
  UNIT_MAX_LENGTH,
  initialValues,
  isEmptyPayload,
  readValues,
  toBatchCreate,
  toCreatePayload,
  toEditPayload,
  validateValues,
} from './costLineValues.js';
import type { CostLineValues } from './costLineValues.js';
import type { CostLineFormProps } from './types.js';
import type { CostLineOptions } from './useCostLineOptions.js';

function parseAmount(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text);
}

/**
 * The cost line form as an ObjectForm schema: create (a task, a purchase, or an offer or invoice),
 * edit and assign. Field names equal the API body keys, so a server VALIDATION_ERROR maps onto them.
 */
export function useCostLineSchema(
  { host, mode, copyFrom, onSaved }: CostLineFormProps,
  options: CostLineOptions,
): ObjectFormSchema {
  const { t } = useTranslation('costLines');
  const { vatRate } = useLocale();
  const companySchema = useCompanyFormSchema();
  // A company created from the picker's child step: the picker unmounts meanwhile, so its name lives here.
  const [createdCompany, setCreatedCompany] = useState<KnownCompany | null>(null);
  const [initial] = useState<ObjectFormValues>(() => initialValues(host, mode, copyFrom, null));

  const row = mode.kind === 'create' ? null : mode.row;
  const onDocument = host.kind === 'invoice';
  const targetEssential = (onDocument && mode.kind !== 'edit') || mode.kind === 'assign';
  const hasExisting = (values: ObjectFormValues) => readValues(values).existingLineId !== null;

  const object = t('object.one');
  const title = t(
    mode.kind === 'create'
      ? 'form.titleNew'
      : mode.kind === 'edit'
        ? 'form.titleEdit'
        : 'form.titleAssign',
    { object },
  );

  const sourceOptions = [
    ...options.sourceOptions.filter((option) => option.value === options.discretionarySourceId),
    ...options.sourceOptions.filter((option) => option.value !== options.discretionarySourceId),
  ];

  const fields: ObjectFormField[] = [
    {
      name: 'description',
      label: t('form.description'),
      kind: 'text',
      essential: true,
      required: true,
      maxLength: DESCRIPTION_MAX_LENGTH,
    },
  ];

  if (targetEssential || mode.kind === 'edit') {
    fields.push({
      name: 'target',
      label: t('form.belongsTo'),
      kind: 'custom',
      essential: targetEssential,
      required: targetEssential,
      keep: true,
      render: (ctx) => (
        <CostLineTargetPicker
          id={ctx.id}
          value={(ctx.value as CostLineValues['target']) ?? null}
          onChange={ctx.setValue}
          disabled={ctx.busy}
          inputAriaProps={{
            'aria-invalid': ctx.invalid || undefined,
            'aria-describedby': ctx.describedBy,
          }}
          testId="cost-line-target"
        />
      ),
    });
  }

  if (onDocument && mode.kind === 'create') {
    fields.push({
      name: 'existingLineId',
      label: t('form.existing'),
      kind: 'custom',
      essential: true,
      hint: t('form.existingHint'),
      visibleWhen: (values) => readValues(values).target !== null,
      render: (ctx) => {
        const target = readValues(ctx.values).target;
        if (target === null) return null;
        return (
          <CostLineExistingField
            id={ctx.id}
            target={target}
            value={(ctx.value as CostLineValues['existingLineId']) ?? null}
            onChange={ctx.setValue}
            busy={ctx.busy}
            invalid={ctx.invalid}
            describedBy={ctx.describedBy}
          />
        );
      },
    });
  }

  const unitPriced = (values: ObjectFormValues) =>
    !hasExisting(values) && readValues(values).pricing === 'unit';
  const direct = (values: ObjectFormValues) =>
    hasExisting(values) || readValues(values).pricing === 'direct';

  fields.push(
    {
      name: 'quantity',
      label: t('form.quantity'),
      kind: 'number',
      essential: true,
      width: 'half',
      min: 0,
      visibleWhen: unitPriced,
    },
    {
      name: 'unit',
      label: t('form.unit'),
      kind: 'text',
      essential: true,
      width: 'half',
      maxLength: UNIT_MAX_LENGTH,
      visibleWhen: unitPriced,
    },
    {
      name: 'unitPrice',
      label: t('form.unitPrice'),
      kind: 'number',
      essential: true,
      min: 0,
      visibleWhen: unitPriced,
    },
    {
      name: 'amount',
      label: t('form.amount'),
      kind: 'custom',
      essential: true,
      visibleWhen: direct,
      render: (ctx) => <CostLineAmountField ctx={ctx} values={readValues(ctx.values)} />,
    },
    {
      name: 'includesVat',
      label: t('form.enteredAs'),
      kind: 'custom',
      group: true,
      essential: true,
      keep: true,
      visibleWhen: (values) => !hasExisting(values),
      render: (ctx) => (
        <CostLineEnteredAs
          id={ctx.id}
          values={readValues(ctx.values)}
          onChange={ctx.setValue}
          busy={ctx.busy}
          describedBy={ctx.describedBy}
        />
      ),
    },
    {
      name: 'pricing',
      label: t('form.pricing'),
      kind: 'select',
      keep: true,
      visibleWhen: (values) => !hasExisting(values),
      options: [
        { value: 'unit', label: t('form.pricingUnit') },
        { value: 'direct', label: t('form.pricingDirect') },
      ],
    },
    {
      name: 'budgetCategoryId',
      label: t('form.category'),
      kind: 'select',
      keep: true,
      optionsLoading: options.loading,
      notice: options.failed ? t('section.loadError') : undefined,
      options: options.loading
        ? []
        : [{ value: '', label: t('form.categoryNone') }, ...options.categoryOptions],
    },
  );

  // Lines created on an offer or invoice take their Basis from that document (D6).
  if (!(onDocument && mode.kind === 'create')) {
    fields.push({
      name: 'confidence',
      label: t('form.basis'),
      kind: 'custom',
      keep: true,
      render: (ctx) => <CostLineBasisField ctx={ctx} row={row} />,
    });
  }

  fields.push(
    {
      name: 'budgetSourceId',
      label: t('form.fundingSource'),
      kind: 'select',
      keep: true,
      optionsLoading: options.loading,
      defaultFromOptions: mode.kind === 'create' ? 'first' : undefined,
      options: options.loading ? [] : sourceOptions,
    },
    {
      name: 'vendorId',
      label: t('form.company'),
      kind: 'custom',
      keep: true,
      render: (ctx) => (
        <CostLineCompanyPicker
          ctx={ctx}
          companySchema={companySchema}
          known={
            createdCompany ??
            (row !== null && row.vendorId !== null && row.vendorName !== null
              ? { id: row.vendorId, name: row.vendorName }
              : null)
          }
          onCreatedCompany={setCreatedCompany}
          placeholder={t('form.companyNone')}
        />
      ),
    },
  );

  const validateMessages = {
    description: t('form.errorDescription'),
    quantity: t('form.errorQuantity'),
    unitPrice: t('form.errorUnitPrice'),
    amount: t('form.errorAmount'),
    amountPositive: t('form.errorAmountPositive'),
    belongsTo: t('form.errorBelongsTo'),
    moveType: t('form.errorMoveType'),
  };

  const submit = async (rawValues: ObjectFormValues): Promise<ObjectFormResult> => {
    const values = readValues(rawValues);
    const label = values.description.trim();
    let id: string;

    if (mode.kind === 'create') {
      id = await createLine(values);
    } else if (mode.kind === 'edit') {
      id = await editLine(mode.row, rawValues);
    } else {
      id = await assignLine(mode.row, values, rawValues);
    }
    onSaved();
    return { id, href: '', label };
  };

  const createLine = async (values: CostLineValues): Promise<string> => {
    if (host.kind === 'work_item') {
      return (await createWorkItemBudget(host.id, toCreatePayload(values, host))).id;
    }
    if (host.kind === 'household_item') {
      return (await createHouseholdItemBudget(host.id, toCreatePayload(values, host))).id;
    }
    // Document host: the target is required by the validation above.
    const target = values.target;
    if (target === null) return '';
    if (values.existingLineId) {
      const existing = values.existingLineId;
      const typed = parseAmount(values.amount);
      let itemizedAmount = existing.gross;
      if (Number.isFinite(typed)) {
        itemizedAmount = typed;
      } else {
        // Empty = the line's own gross, capped at what is left on the document.
        const { remainingAmount } = await fetchInvoiceBudgetLines(host.id);
        if (remainingAmount > 0) itemizedAmount = Math.min(existing.gross, remainingAmount);
      }
      const link = await createInvoiceBudgetLine(host.id, {
        invoiceId: host.id,
        ...(existing.type === 'work_item'
          ? { workItemBudgetId: existing.id }
          : { householdItemBudgetId: existing.id }),
        itemizedAmount,
      });
      return link.budgetLine.id;
    }
    const response = await createBudgetLinesBatch({
      invoiceId: host.id,
      lines: [toBatchCreate(values, host, target, options.discretionarySourceId)],
    });
    return response.lines[0]?.budgetLineId ?? '';
  };

  const editLine = async (line: NonNullable<typeof row>, rawValues: ObjectFormValues) => {
    const payload = toEditPayload(rawValues, initial, line, vatRate);
    if (isEmptyPayload(payload)) return line.id;
    return sendEdit(line, payload);
  };

  const sendEdit = async (
    line: NonNullable<typeof row>,
    payload: EditAndMoveBudgetLineRequest,
  ): Promise<string> => {
    if (line.invoiceId !== null && line.invoiceBudgetLineId !== null) {
      await editAndMoveBudgetLine(line.invoiceId, line.invoiceBudgetLineId, payload);
      return line.id;
    }
    // A line without an offer or invoice is edited on its task or purchase.
    const parentId = line.target?.id ?? host.id;
    const { itemizedAmount: _itemized, ...body } = payload;
    if (line.lineType === 'work_item') await updateWorkItemBudget(parentId, line.id, body);
    else await updateHouseholdItemBudget(parentId, line.id, body);
    return line.id;
  };

  const assignLine = async (
    line: NonNullable<typeof row>,
    values: CostLineValues,
    rawValues: ObjectFormValues,
  ): Promise<string> => {
    const target = values.target;
    if (target === null) return line.id;
    await assignBudgetLine(line.id, {
      targetType: target.type,
      targetId: target.id,
      budgetCategoryId: values.budgetCategoryId || null,
    });
    // The assign call moved the line and set its category; anything else changed travels in an edit.
    const {
      newWorkItemId: _workItem,
      newHouseholdItemId: _householdItem,
      budgetCategoryId: _category,
      ...rest
    } = toEditPayload(rawValues, initial, line, vatRate);
    if (!isEmptyPayload(rest)) await sendEdit(line, rest);
    return line.id;
  };

  const mapError = (code: string, rawValues: ObjectFormValues): ObjectFormErrors | null => {
    if (code === 'ITEMIZED_SUM_EXCEEDS_INVOICE') {
      const amountShown = direct(rawValues);
      return { [amountShown ? 'amount' : 'unitPrice']: t('form.errorOverInvoice') };
    }
    if (code === 'BUDGET_LINE_ALREADY_LINKED') {
      return { existingLineId: t('linkInvoice.errorAlreadyLinked') };
    }
    return null;
  };

  return {
    id: 'costLine',
    title,
    fields,
    initialValues: initial,
    addAnother: mode.kind === 'create',
    validate: (values) => validateValues(values, { host, mode, messages: validateMessages }),
    submit,
    mapError,
    addedMessage: () => t('form.added'),
  };
}
