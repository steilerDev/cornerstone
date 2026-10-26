import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  InvoiceChipCounts,
  InvoiceListRow,
  InvoiceListTotals,
  InvoiceStatusBreakdown,
} from '@cornerstone/shared';
import { useObjectList } from '../../components/ObjectList/useObjectList.js';
import type { ObjectListController } from '../../components/ObjectList/useObjectList.js';
import { queryKey } from '../../components/ObjectList/objectListUrl.js';
import type {
  ObjectListChipOption,
  ObjectListChipsConfig,
  ObjectListConfig,
  ObjectListLabels,
  ObjectListPage,
  ObjectListQuery,
  ObjectListSearchingAll,
} from '../../components/ObjectList/types.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { fetchAllInvoices } from '../../lib/invoicesApi.js';
import { useInvoiceListFilters } from './InvoiceListFilters.js';
import { chipCountKey, invoiceListApiParams } from './invoicesListUrl.js';

/** The figures that come with every batch: the global summary, the chip counts and the list totals. */
export interface InvoiceListMeta {
  readonly summary: InvoiceStatusBreakdown;
  readonly chipCounts: InvoiceChipCounts;
  readonly listTotals: InvoiceListTotals;
}

/** `ids` of GET /api/invoices is capped at 100 keys; above that the host reloads instead. */
const MAX_REFRESH_IDS = 100;

const getKey = (inv: InvoiceListRow): string => inv.id;

export interface UseInvoicesListOptions {
  /** Paperless configured (the "Without document" filter), null while unknown. */
  readonly paperlessConfigured: boolean | null;
}

export interface UseInvoicesListResult {
  readonly list: ObjectListController<InvoiceListRow, InvoiceListMeta>;
  /** The config for ObjectList: the chips carry their counts once a batch has applied. */
  readonly config: ObjectListConfig<InvoiceListRow>;
  readonly labels: ObjectListLabels;
  /** The figures of the current query; the last row refresh wins until the next batch. */
  readonly meta: InvoiceListMeta | null;
  /** Rows of the current chip without search or filters ("n of m" in the heading). */
  readonly scopeTotal: number | null;
  readonly searchingAll: ObjectListSearchingAll | null;
  /**
   * Fresh rows and figures after a change, without a reload: the rows that still match are
   * patched in place, a row that left the list is removed (the template moves focus), and the
   * footer, chip counts and totals follow. Falls back to one reload when that is not possible.
   */
  readonly refreshRows: (keys: readonly string[]) => Promise<void>;
}

/**
 * The Invoices list: URL state and the batch-loaded rows (`useObjectList`), the ObjectList config
 * (chips with counts, group by, sort, filters), the labels and the figures that come with the rows.
 */
export function useInvoicesList(options: UseInvoicesListOptions): UseInvoicesListResult {
  const { paperlessConfigured } = options;
  const { t } = useTranslation('budget');
  const { t: tCommon } = useTranslation('common');
  const statusVariants = useStatusBadgeVariants();

  // The filter defs for the controller carry only the param names; the panel's defs (with the
  // refunds-due count) are built below, once the figures are known.
  const paramFilters = useInvoiceListFilters({ refundsDue: null, paperlessConfigured: null });

  const chipWords = useMemo(
    () => ({
      pending: t('invoices.list.chips.pending'),
      quotation: t('invoices.list.chips.quotation'),
      paid: t('invoices.list.chips.paid'),
      claimed: t('invoices.list.chips.claimed'),
    }),
    [t],
  );

  const baseConfig = useMemo(
    (): ObjectListConfig<InvoiceListRow> & { readonly chips: ObjectListChipsConfig } => ({
      listKey: 'invoices',
      testIdPrefix: 'invoices',
      chips: {
        defaultValue: 'pending',
        options: [
          { value: 'pending', label: chipWords.pending },
          { value: 'quotation', label: chipWords.quotation },
          { value: 'paid', label: chipWords.paid },
          { value: 'claimed', label: chipWords.claimed },
        ],
      },
      groupBy: {
        options: [
          {
            value: 'status',
            label: t('invoices.list.groupBy.status'),
            groupOf: (inv) => ({
              key: inv.status,
              label: statusVariants.invoice[inv.status].label,
              done: inv.status === 'paid' || inv.status === 'claimed',
            }),
            order: ['pending', 'quotation', 'paid', 'claimed'],
          },
          {
            value: 'company',
            label: t('invoices.list.groupBy.company'),
            groupOf: (inv) => ({ key: inv.vendorId, label: inv.vendorName }),
          },
        ],
      },
      sort: {
        options: [
          { value: 'due_date', label: t('invoices.list.sort.dueDate') },
          { value: 'date', label: t('invoices.list.sort.date') },
          { value: 'amount', label: t('invoices.list.sort.amount') },
          { value: 'vendor_name', label: t('invoices.list.sort.company') },
          { value: 'invoice_number', label: t('invoices.list.sort.number') },
        ],
        defaultValue: 'due_date',
        defaultOrder: 'asc',
      },
      filters: paramFilters,
    }),
    [t, chipWords, statusVariants, paramFilters],
  );

  const fetchPage = useCallback(
    async (
      query: ObjectListQuery,
      page: number,
      pageSize: number,
    ): Promise<ObjectListPage<InvoiceListRow, InvoiceListMeta>> => {
      const response = await fetchAllInvoices({ ...invoiceListApiParams(query), page, pageSize });
      return {
        items: response.invoices,
        totalItems: response.pagination.totalItems,
        meta: {
          summary: response.summary,
          chipCounts: response.chipCounts,
          listTotals: response.listTotals,
        },
      };
    },
    [],
  );

  const list = useObjectList<InvoiceListRow, InvoiceListMeta>({
    config: baseConfig,
    fetchPage,
    getKey,
  });
  const listRef = useRef(list);
  listRef.current = list;

  // --- Figures: the batch's own, or the newer ones a row refresh fetched for this batch ---
  const [metaOverride, setMetaOverride] = useState<{
    readonly seq: number;
    readonly meta: InvoiceListMeta;
  } | null>(null);
  const meta: InvoiceListMeta | null =
    (metaOverride?.seq === list.fetchSequence ? metaOverride.meta : list.meta) ?? null;

  const refreshRows = useCallback(async (keys: readonly string[]) => {
    const current = listRef.current;
    if (keys.length === 0) return;
    if (keys.length > MAX_REFRESH_IDS) {
      current.refresh();
      return;
    }
    const startKey = queryKey(current.query);
    const params = invoiceListApiParams(current.query);
    const results = await Promise.all([
      fetchAllInvoices({ ...params, ids: keys }),
      fetchAllInvoices({ ...params, page: 1, pageSize: 1 }),
    ]).catch(() => null);
    const latest = listRef.current;
    if (!results) {
      latest.refresh();
      return;
    }
    // The query changed meanwhile: the answer belongs to a list that is no longer shown.
    if (queryKey(latest.query) !== startKey) return;
    const [rows, figures] = results;
    const fresh = new Map(rows.invoices.map((row) => [row.id, row]));
    const loaded = new Set(latest.items.map(getKey));
    const left = keys.filter((key) => !fresh.has(key) && loaded.has(key));
    // Rows still on the server, or several leaving at once (the total would be off): reload.
    if (left.length > 1 || (left.length === 1 && latest.hasMore)) {
      latest.refresh();
      return;
    }
    for (const [id, row] of fresh) latest.updateItem(id, () => row);
    for (const id of left) latest.removeItem(id);
    setMetaOverride({
      seq: latest.fetchSequence,
      meta: {
        summary: figures.summary,
        chipCounts: figures.chipCounts,
        listTotals: figures.listTotals,
      },
    });
  }, []);

  // --- The ObjectList config: chips with counts, the panel's filter defs ---
  const filters = useInvoiceListFilters({
    refundsDue: meta?.summary.refundsDue ?? null,
    paperlessConfigured,
  });
  const filtersActive = list.filtersActive;
  const config = useMemo((): ObjectListConfig<InvoiceListRow> => {
    const countOf = (key: ReturnType<typeof chipCountKey>): number | null => {
      if (!meta) return null;
      return filtersActive ? meta.chipCounts.matching[key] : meta.chipCounts.totals[key];
    };
    const withCount = (label: string, key: ReturnType<typeof chipCountKey>): string => {
      const count = countOf(key);
      return count === null ? label : t('invoices.list.chips.withCount', { label, count });
    };
    const baseChips = baseConfig.chips;
    const options: ObjectListChipOption[] = baseChips.options.map((option) => ({
      ...option,
      label: withCount(option.label, chipCountKey(option.value)),
    }));
    return {
      ...baseConfig,
      chips: {
        ...baseChips,
        options,
        allLabel: withCount(t('invoices.list.chips.all'), 'all'),
      },
      filters,
    };
  }, [baseConfig, filters, meta, filtersActive, t]);

  const chip = list.query.chip;
  const labels = useMemo(
    (): ObjectListLabels => ({
      title: tCommon('navigation.invoices'),
      search: t('invoices.list.search'),
      resultCount: (count) => t('invoices.list.resultCount', { count }),
      selectAll: t('invoices.list.selectAll'),
      empty: chip === 'pending' ? t('invoices.list.emptyToPay') : t('invoices.list.empty'),
      emptyDescription:
        chip === 'pending'
          ? t('invoices.list.emptyToPayDescription')
          : t('invoices.list.emptyDescription'),
      noMatch: t('invoices.list.noMatch'),
      loadFailed: t('invoices.list.loadFailed'),
    }),
    [t, tCommon, chip],
  );

  const scopeTotal = meta ? meta.chipCounts.totals[chipCountKey(chip)] : null;

  const searchingAll = useMemo((): ObjectListSearchingAll | null => {
    if (!meta || !list.query.searchingAll) return null;
    const { outsideToPay } = meta.chipCounts;
    const chips = [
      outsideToPay.offers > 0 ? chipWords.quotation : null,
      outsideToPay.paid > 0 ? chipWords.paid : null,
      outsideToPay.submitted > 0 ? chipWords.claimed : null,
    ].filter((label): label is string => label !== null);
    return { outside: outsideToPay.all, chips };
  }, [meta, list.query.searchingAll, chipWords]);

  return { list, config, labels, meta, scopeTotal, searchingAll, refreshRows };
}
