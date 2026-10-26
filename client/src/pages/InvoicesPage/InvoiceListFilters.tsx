import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { InvoiceStatusSummary } from '@cornerstone/shared';
import { EntityPicker } from '../../components/EntityPicker/EntityPicker.js';
import type {
  ObjectListFilterDef,
  ObjectListFilterRenderContext,
} from '../../components/ObjectList/types.js';
import { useFormatters } from '../../lib/formatters.js';
import shared from '../../styles/shared.module.css';
import {
  INVOICE_FLAG_PARAMS,
  formatAmountRange,
  formatDateRange,
  parseAmountRange,
  parseDateRange,
} from './invoicesListUrl.js';
import type { InvoiceFlagParam } from './invoicesListUrl.js';
import styles from './InvoiceListFilters.module.css';

export interface InvoiceListFiltersInput {
  /** Global refunds due (summary.refundsDue) or null before the first batch. */
  readonly refundsDue: InvoiceStatusSummary | null;
  /** Paperless configured; null while unknown. */
  readonly paperlessConfigured: boolean | null;
}

const SHOW_ONLY_ID = 'showOnly';

/** The plain label of a Show-only flag (the note row names the active ones with it). */
function flagLabel(t: TFunction<'budget'>, flag: InvoiceFlagParam): string {
  switch (flag) {
    case 'notYetSplit':
      return t('invoices.list.filters.notYetSplit');
    case 'withoutDocument':
      return t('invoices.list.filters.withoutDocument');
    case 'refundsDue':
      return t('invoices.list.filters.refundsDueNone');
    case 'due':
      return t('invoices.list.filters.due');
  }
}

interface ShowOnlyCheckboxProps {
  readonly ctx: ObjectListFilterRenderContext;
  readonly label: string;
  readonly testId: string;
}

/** One "Show only" checkbox: checking writes '1', unchecking removes the param. */
function ShowOnlyCheckbox({ ctx, label, testId }: ShowOnlyCheckboxProps) {
  const on = ctx.value === '1';
  // A local draft: a router transition would otherwise revert a URL-bound checkbox mid-click.
  const [checked, setChecked] = useState(on);
  const [prevOn, setPrevOn] = useState(on);
  if (on !== prevOn) {
    setPrevOn(on);
    setChecked(on);
  }
  return (
    <label className={styles.checkRow}>
      <input
        type="checkbox"
        id={ctx.id}
        className={styles.checkbox}
        checked={checked}
        onChange={(e) => {
          setChecked(e.target.checked);
          ctx.onChange(e.target.checked ? '1' : null);
        }}
        data-testid={testId}
      />
      <span>{label}</span>
    </label>
  );
}

interface CompanyFilterProps {
  readonly ctx: ObjectListFilterRenderContext;
}

function CompanyFilter({ ctx }: CompanyFilterProps) {
  const { t } = useTranslation('budget');
  return (
    <EntityPicker
      kind="company"
      id={ctx.id}
      value={ctx.value ?? ''}
      onChange={(id) => ctx.onChange(id === '' ? null : id)}
      // A company id that no longer exists (old link or bookmark) is dropped from the URL.
      onUnknownCompany={() => ctx.onChange(null)}
      create="off"
      placeholder={t('invoices.list.filters.company')}
    />
  );
}

interface DateRangeFilterProps {
  readonly ctx: ObjectListFilterRenderContext;
  readonly testId: string;
}

/** From and To dates; the URL receives `from:…,to:…` on every change. */
function DateRangeFilter({ ctx, testId }: DateRangeFilterProps) {
  const { t } = useTranslation('budget');
  const range = parseDateRange(ctx.value);
  const from = range?.from ?? '';
  const to = range?.to ?? '';
  // Local drafts, synced from the URL when it changes (the DiaryFilters pattern).
  const [fromDraft, setFromDraft] = useState(from);
  const [prevFrom, setPrevFrom] = useState(from);
  if (from !== prevFrom) {
    setPrevFrom(from);
    setFromDraft(from);
  }
  const [toDraft, setToDraft] = useState(to);
  const [prevTo, setPrevTo] = useState(to);
  if (to !== prevTo) {
    setPrevTo(to);
    setToDraft(to);
  }
  return (
    <div className={styles.range}>
      <div className={styles.rangeField}>
        <label htmlFor={`${ctx.id}-from`} className={styles.rangeLabel}>
          {t('invoices.list.filters.from')}
        </label>
        <input
          id={`${ctx.id}-from`}
          type="date"
          className={shared.input}
          value={fromDraft}
          onChange={(e) => {
            setFromDraft(e.target.value);
            ctx.onChange(formatDateRange(e.target.value || null, toDraft || null));
          }}
          data-testid={`${testId}-from`}
        />
      </div>
      <div className={styles.rangeField}>
        <label htmlFor={`${ctx.id}-to`} className={styles.rangeLabel}>
          {t('invoices.list.filters.to')}
        </label>
        <input
          id={`${ctx.id}-to`}
          type="date"
          className={shared.input}
          value={toDraft}
          onChange={(e) => {
            setToDraft(e.target.value);
            ctx.onChange(formatDateRange(fromDraft || null, e.target.value || null));
          }}
          data-testid={`${testId}-to`}
        />
      </div>
    </div>
  );
}

function draftNumber(draft: string): number | null {
  if (draft.trim() === '') return null;
  const number = Number(draft);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** Minimum and Maximum amounts; committed on blur and Enter. */
function AmountRangeFilter({ ctx, testId }: DateRangeFilterProps) {
  const { t } = useTranslation('budget');
  const range = parseAmountRange(ctx.value);
  const min = range?.min == null ? '' : String(range.min);
  const max = range?.max == null ? '' : String(range.max);
  const [minDraft, setMinDraft] = useState(min);
  const [prevMin, setPrevMin] = useState(min);
  if (min !== prevMin) {
    setPrevMin(min);
    setMinDraft(min);
  }
  const [maxDraft, setMaxDraft] = useState(max);
  const [prevMax, setPrevMax] = useState(max);
  if (max !== prevMax) {
    setPrevMax(max);
    setMaxDraft(max);
  }

  const commit = () => {
    const next = formatAmountRange(draftNumber(minDraft), draftNumber(maxDraft));
    if (next !== (ctx.value || null)) ctx.onChange(next);
  };
  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
  };

  return (
    <div className={styles.range}>
      <div className={styles.rangeField}>
        <label htmlFor={`${ctx.id}-min`} className={styles.rangeLabel}>
          {t('invoices.list.filters.min')}
        </label>
        <input
          id={`${ctx.id}-min`}
          type="number"
          min="0"
          step="0.01"
          className={shared.input}
          value={minDraft}
          onChange={(e) => setMinDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onEnter}
          onWheel={(e) => e.currentTarget.blur()}
          data-testid={`${testId}-min`}
        />
      </div>
      <div className={styles.rangeField}>
        <label htmlFor={`${ctx.id}-max`} className={styles.rangeLabel}>
          {t('invoices.list.filters.max')}
        </label>
        <input
          id={`${ctx.id}-max`}
          type="number"
          min="0"
          step="0.01"
          className={shared.input}
          value={maxDraft}
          onChange={(e) => setMaxDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onEnter}
          onWheel={(e) => e.currentTarget.blur()}
          data-testid={`${testId}-max`}
        />
      </div>
    </div>
  );
}

/**
 * The filter defs of the Invoices Filters panel, in order: the four "Show only" flags (one shared
 * fieldset), Company, Invoice date, Due date and Amount.
 */
export function useInvoiceListFilters(
  input: InvoiceListFiltersInput,
): readonly ObjectListFilterDef[] {
  const { t } = useTranslation('budget');
  const { formatCurrency } = useFormatters();
  const { refundsDue, paperlessConfigured } = input;
  const refundsCount = refundsDue?.count ?? 0;
  const refundsAmount = refundsDue?.totalAmount ?? 0;

  return useMemo(() => {
    const fieldset = { id: SHOW_ONLY_ID, legend: t('invoices.list.filters.showOnly') };
    const flagDef = (
      flag: InvoiceFlagParam,
      label: string,
      shown: (on: boolean) => boolean,
    ): ObjectListFilterDef => ({
      param: flag,
      label,
      fieldset,
      render: (ctx) =>
        shown(ctx.value === '1') ? (
          <ShowOnlyCheckbox ctx={ctx} label={label} testId={`invoices-filter-${flag}`} />
        ) : null,
    });
    // On with nothing due any more (a bookmark): the plain word, never "(0 · €0.00)".
    const refundsLabel =
      refundsCount > 0
        ? t('invoices.list.filters.refundsDue', {
            count: refundsCount,
            amount: formatCurrency(refundsAmount),
          })
        : t('invoices.list.filters.refundsDueNone');
    return [
      flagDef('notYetSplit', t('invoices.list.filters.notYetSplit'), () => true),
      flagDef(
        'withoutDocument',
        t('invoices.list.filters.withoutDocument'),
        (on) => paperlessConfigured === true || on,
      ),
      {
        param: 'refundsDue',
        label: t('invoices.list.filters.refundsDueNone'),
        fieldset,
        render: (ctx) =>
          refundsCount > 0 || ctx.value === '1' ? (
            <ShowOnlyCheckbox ctx={ctx} label={refundsLabel} testId="invoices-filter-refundsDue" />
          ) : null,
      },
      flagDef('due', t('invoices.list.filters.due'), () => true),
      {
        param: 'vendorId',
        label: t('invoices.list.filters.company'),
        render: (ctx) => <CompanyFilter ctx={ctx} />,
      },
      {
        param: 'date',
        label: t('invoices.list.filters.invoiceDate'),
        render: (ctx) => <DateRangeFilter ctx={ctx} testId="invoices-filter-date" />,
      },
      {
        param: 'dueDate',
        label: t('invoices.list.filters.dueDate'),
        render: (ctx) => <DateRangeFilter ctx={ctx} testId="invoices-filter-dueDate" />,
      },
      {
        param: 'amount',
        label: t('invoices.list.filters.amount'),
        render: (ctx) => <AmountRangeFilter ctx={ctx} testId="invoices-filter-amount" />,
      },
    ];
  }, [t, formatCurrency, refundsCount, refundsAmount, paperlessConfigured]);
}

/** Labels of the active Show-only flags, in def order ("Not yet split", "Due or overdue"). */
export function useActiveShowOnlyLabels(
  filters: Readonly<Record<string, string>>,
): readonly string[] {
  const { t } = useTranslation('budget');
  return INVOICE_FLAG_PARAMS.filter((flag) => filters[flag] === '1').map((flag) =>
    flagLabel(t, flag),
  );
}
