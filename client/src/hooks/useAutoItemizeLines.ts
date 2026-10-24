import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExtractedLine, PaperlessDocumentSearchResult } from '@cornerstone/shared';
import type { AiMergeSource, AiRowData, AiRowDataMap } from '../components/autoItemize/types.js';
import type { CostLineTarget } from '../components/CostLineTable/types.js';
import {
  blankGridRow,
  isBlankRow,
  nextRowId,
  validateGridRows,
  withTrailingBlank,
} from '../components/CostLineForm/costLineGridModel.js';
import { numberToText } from '../components/CostLineForm/pasteRows.js';
import type { NumberLocale } from '../components/CostLineForm/pasteRows.js';
import type { CostLineGridOptions, CostLineGridRow } from '../components/CostLineForm/types.js';
import { useCostLineOptions } from '../components/CostLineForm/useCostLineOptions.js';
import type { CostLineOptions } from '../components/CostLineForm/useCostLineOptions.js';
import { useLocale } from '../contexts/LocaleContext.js';
import {
  applyBudgetSourceToNewLines,
  effectiveRowAmount,
  isNewBudgetLineRow,
  rowFromExtractedLine,
} from '../lib/autoItemizeDraftUtils.js';
import type { CommitContext } from '../lib/autoItemizeDraftUtils.js';
import {
  aggregateMergedLineNumerics,
  buildAvailableCategories,
} from '../lib/autoItemizeMergeUtils.js';
import { mergeLines } from '../lib/invoiceAutoItemizeApi.js';

/** `data-testid` of the grid on both Split with AI pages (the hook focuses cells inside it). */
export const AUTO_ITEMIZE_GRID_PREFIX = 'auto-itemize-grid';

/** The grid of the Split with AI pages: Include toggles, merge selection, category and source. */
export const AUTO_ITEMIZE_GRID_OPTIONS: CostLineGridOptions = {
  targets: true,
  requireTarget: false,
  positiveGross: true,
  columns: ['category', 'fundingSource'],
  include: true,
  select: true,
  existingLines: true,
};

export interface UseAutoItemizeLinesOptions {
  document?: PaperlessDocumentSearchResult | null;
  /**
   * Called after any edit of the rows (field change, link, merge, …).
   * AutoItemizePage passes `() => setLineFieldsEdited(true)` for dirty tracking.
   */
  onFieldsEdited?: () => void;
  /** Optional document summary (e.g., invoice notes) passed to the merge LLM. */
  documentSummary?: string | null;
  /** Called when a merge starts (live region announcement). */
  onMergeStart?: (count: number) => void;
  /** Called when a merge succeeds (live region announcement). */
  onMergeSuccess?: () => void;
  /** Invoice-wide default funding source (#2158) for rows that create new lines. */
  defaultBudgetSourceId?: string | null;
}

export interface UseAutoItemizeLinesReturn {
  readonly rows: readonly CostLineGridRow[];
  /** Side data of the extraction, by row id. */
  readonly data: AiRowDataMap;
  readonly assignAll: CostLineTarget | null;
  readonly setAssignAll: (target: CostLineTarget | null) => void;
  readonly options: CostLineOptions;
  readonly selectedRowIds: ReadonlySet<string>;
  /** true after a Save attempt: the grid shows every error. */
  readonly showAllErrors: boolean;
  /** Replaces the rows with the extracted lines (the first load and Retry). */
  readonly load: (lines: readonly ExtractedLine[]) => void;
  /** The grid's change handler. */
  readonly onRowsChange: (rows: readonly CostLineGridRow[]) => void;
  /** Writes rows back without counting as an edit (partially created cost lines). */
  readonly replaceRows: (rows: readonly CostLineGridRow[]) => void;
  readonly onToggleSelect: (rowId: string) => void;
  readonly onClearSelection: () => void;
  readonly onMergeSelected: () => void;
  /** Notice buttons of a merge row: `retry` and `undo`. */
  readonly onNoticeAction: (rowId: string, actionId: string) => void;
  /** Applies a funding source to every row that creates a new line; returns how many. */
  readonly applyBudgetSource: (sourceId: string) => number;
  /** Validates the rows to save (shows every error, focuses the first). true = valid. */
  readonly validate: () => boolean;
  /** Everything the commit helpers need besides the rows. */
  readonly commitContext: () => CommitContext;
}

/** Only the blank row at the end was added: the grid does this by itself on mount. */
function onlyTrailingBlank(
  previous: readonly CostLineGridRow[],
  next: readonly CostLineGridRow[],
): boolean {
  return (
    next.length === previous.length + 1 &&
    previous.every((row, index) => next[index] === row) &&
    isBlankRow(next[next.length - 1]!)
  );
}

/**
 * State of the Split with AI pages' cost line grid: the rows (`CostLineGridRow`), the extraction's
 * side data, Assign all to, merge selection and the merge flow. Handlers are stable (refs keep them
 * current) so the pages and the grid never see a stale closure.
 */
export function useAutoItemizeLines({
  document,
  onFieldsEdited,
  documentSummary,
  onMergeStart,
  onMergeSuccess,
  defaultBudgetSourceId,
}: UseAutoItemizeLinesOptions): UseAutoItemizeLinesReturn {
  const { t } = useTranslation('budget');
  const { t: tCostLines } = useTranslation('costLines');
  const { resolvedLocale, vatRate } = useLocale();
  const locale: NumberLocale = resolvedLocale === 'de' ? 'de' : 'en';
  const options = useCostLineOptions();

  const [storedRows, setStoredRows] = useState<readonly CostLineGridRow[]>(() => [
    blankGridRow(nextRowId()),
  ]);
  const [data, setData] = useState<AiRowDataMap>(() => new Map());
  const [assignAll, setAssignAll] = useState<CostLineTarget | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<ReadonlySet<string>>(() => new Set());
  const [showAllErrors, setShowAllErrors] = useState(false);

  // Mutable refs — updated every render so stable callbacks always see fresh values.
  const dataRef = useRef(data);
  dataRef.current = data;
  const selectedRef = useRef(selectedRowIds);
  selectedRef.current = selectedRowIds;
  const assignAllRef = useRef(assignAll);
  assignAllRef.current = assignAll;
  const onFieldsEditedRef = useRef(onFieldsEdited);
  onFieldsEditedRef.current = onFieldsEdited;
  const documentRef = useRef(document);
  documentRef.current = document;
  const documentSummaryRef = useRef(documentSummary);
  documentSummaryRef.current = documentSummary;
  const onMergeStartRef = useRef(onMergeStart);
  onMergeStartRef.current = onMergeStart;
  const onMergeSuccessRef = useRef(onMergeSuccess);
  onMergeSuccessRef.current = onMergeSuccess;
  const defaultSourceRef = useRef(defaultBudgetSourceId);
  defaultSourceRef.current = defaultBudgetSourceId;
  const tRef = useRef(t);
  tRef.current = t;
  const tCostLinesRef = useRef(tCostLines);
  tCostLinesRef.current = tCostLines;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const vatRateRef = useRef(vatRate);
  vatRateRef.current = vatRate;
  const localeRef = useRef(locale);
  localeRef.current = locale;

  // Rows that create a new line and have no funding source follow the default, else Discretionary.
  const fallbackSourceId =
    defaultBudgetSourceId || options.discretionarySourceId || options.sources[0]?.id || null;
  const rows = useMemo(
    () =>
      fallbackSourceId === null
        ? storedRows
        : storedRows.map((row) =>
            row.existingLine === null && row.budgetSourceId === null && !isBlankRow(row)
              ? { ...row, budgetSourceId: fallbackSourceId }
              : row,
          ),
    [storedRows, fallbackSourceId],
  );
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const load = useCallback(
    (lines: readonly ExtractedLine[]) => {
      const created = lines.map((line) => ({
        line,
        row: rowFromExtractedLine(line, nextRowId(), locale),
      }));
      setStoredRows(
        withTrailingBlank(
          created.map((entry) => entry.row),
          nextRowId,
        ),
      );
      setData(new Map(created.map(({ line, row }) => [row.rowId, { extracted: line }])));
      setSelectedRowIds(new Set());
    },
    [locale],
  );

  const onRowsChange = useCallback((next: readonly CostLineGridRow[]) => {
    const previous = rowsRef.current;
    setStoredRows(next);
    setSelectedRowIds((current) => {
      const present = new Set(next.map((row) => row.rowId));
      const kept = [...current].filter((rowId) => present.has(rowId));
      return kept.length === current.size ? current : new Set(kept);
    });
    if (!onlyTrailingBlank(previous, next)) onFieldsEditedRef.current?.();
  }, []);

  const replaceRows = useCallback((next: readonly CostLineGridRow[]) => setStoredRows(next), []);

  const onToggleSelect = useCallback((rowId: string) => {
    const row = rowsRef.current.find((candidate) => candidate.rowId === rowId);
    if (!row || row.existingLine !== null || row.notice) return;
    setSelectedRowIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const onClearSelection = useCallback(() => setSelectedRowIds(new Set()), []);

  // ─── Merge ───────────────────────────────────────────────────────────────────

  const busyNotice = useCallback(
    (count: number): CostLineGridRow['notice'] => ({
      tone: 'busy',
      text: tRef.current('autoItemize.mergingCaption', { count }),
    }),
    [],
  );

  const performMerge = useCallback((sources: readonly AiMergeSource[], targetRowId: string) => {
    const available = buildAvailableCategories(
      [...dataRef.current.values()].map((entry) => entry.extracted.category),
      optionsRef.current.categories.map((category) => category.name),
    );
    void mergeLines({
      descriptions: sources.map((source) => source.row.description),
      documentSummary: documentSummaryRef.current ?? undefined,
      availableCategories: available,
    })
      .then((response) => {
        setStoredRows((previous) =>
          previous.map((row) =>
            row.rowId === targetRowId
              ? {
                  ...row,
                  description: response.description,
                  budgetCategoryId: response.budgetCategoryId,
                  notice: undefined,
                }
              : row,
          ),
        );
        setData((previous) => {
          const current = previous.get(targetRowId);
          if (!current) return previous;
          const merged: AiRowData = {
            extracted: {
              ...current.extracted,
              description: response.description,
              category: response.category,
            },
          };
          return new Map(previous).set(targetRowId, merged);
        });
        onFieldsEditedRef.current?.();
        onMergeSuccessRef.current?.();
        // Focus the description after the merge completes.
        setTimeout(() => {
          globalThis.document
            .querySelector<HTMLElement>(
              `[data-testid="${AUTO_ITEMIZE_GRID_PREFIX}-description-${targetRowId}"]`,
            )
            ?.focus();
        }, 0);
      })
      .catch(() => {
        setStoredRows((previous) =>
          previous.map((row) =>
            row.rowId === targetRowId
              ? {
                  ...row,
                  notice: {
                    tone: 'error',
                    text: tRef.current('autoItemize.mergeErrorMessage'),
                    actions: [
                      { id: 'undo', label: tRef.current('autoItemize.mergeUndoButton') },
                      { id: 'retry', label: tRef.current('autoItemize.mergeRetryButton') },
                    ],
                  },
                }
              : row,
          ),
        );
        // Land on the recovery affordance.
        setTimeout(() => {
          globalThis.document
            .querySelector<HTMLElement>(
              `[data-testid="${AUTO_ITEMIZE_GRID_PREFIX}-notice-retry-${targetRowId}"]`,
            )
            ?.focus();
        }, 0);
      });
  }, []);

  const onMergeSelected = useCallback(() => {
    const selected = rowsRef.current.filter((row) => selectedRef.current.has(row.rowId));
    if (selected.length < 2) return;
    onMergeStartRef.current?.(selected.length);

    const selectedIds = new Set(selected.map((row) => row.rowId));
    const sources: AiMergeSource[] = selected.map((row) => ({
      row,
      data: dataRef.current.get(row.rowId),
    }));
    const numerics = aggregateMergedLineNumerics(
      sources.map(({ row, data: sourceData }) => ({
        grossAmount: effectiveRowAmount(row, vatRateRef.current, locale),
        certainty: sourceData?.extracted.confidence ?? row.aiCertainty ?? 1,
        vendorName: sourceData?.extracted.vendorName,
        budgetSourceId: row.budgetSourceId,
      })),
    );
    const mergedId = nextRowId();
    const mergedRow: CostLineGridRow = {
      ...blankGridRow(mergedId),
      // A merged row is one amount: the sum of the rows' gross amounts.
      unitPrice: numberToText(numerics.totalAmount, locale),
      includesVat: true,
      budgetSourceId: defaultSourceRef.current || numerics.budgetSourceId || null,
      aiCertainty: numerics.certainty,
      notice: busyNotice(selected.length),
    };
    const mergedData: AiRowData = {
      extracted: {
        description: '',
        totalAmount: numerics.totalAmount,
        includesVat: true,
        vendorName: numerics.vendorName,
        confidence: numerics.certainty,
      },
      mergeSources: sources,
    };

    setStoredRows((previous) => {
      const firstIndex = previous.findIndex((row) => selectedIds.has(row.rowId));
      const kept = previous.filter((row) => !selectedIds.has(row.rowId));
      kept.splice(Math.max(firstIndex, 0), 0, mergedRow);
      return kept;
    });
    setData((previous) => new Map(previous).set(mergedId, mergedData));
    setSelectedRowIds(new Set());
    performMerge(sources, mergedId);
  }, [locale, busyNotice, performMerge]);

  const onNoticeAction = useCallback(
    (rowId: string, actionId: string) => {
      const sources = dataRef.current.get(rowId)?.mergeSources;
      if (!sources) return;
      if (actionId === 'retry') {
        setStoredRows((previous) =>
          previous.map((row) =>
            row.rowId === rowId ? { ...row, notice: busyNotice(sources.length) } : row,
          ),
        );
        performMerge(sources, rowId);
        return;
      }
      if (actionId === 'undo') {
        setStoredRows((previous) => {
          const index = previous.findIndex((row) => row.rowId === rowId);
          if (index === -1) return previous;
          const next = [...previous];
          next.splice(index, 1, ...sources.map((source) => source.row));
          return next;
        });
        setData((previous) => {
          const next = new Map(previous);
          next.delete(rowId);
          for (const source of sources) if (source.data) next.set(source.row.rowId, source.data);
          return next;
        });
        onFieldsEditedRef.current?.();
      }
    },
    [busyNotice, performMerge],
  );

  // ─── Save helpers ────────────────────────────────────────────────────────────

  const applyBudgetSource = useCallback((sourceId: string) => {
    const count = rowsRef.current.filter(isNewBudgetLineRow).length;
    setStoredRows((previous) => applyBudgetSourceToNewLines(previous, sourceId));
    // Rows a merge replaced follow the default too, so "Restore original lines" matches.
    setData((previous) => {
      const next = new Map<string, AiRowData>();
      for (const [rowId, entry] of previous) {
        next.set(
          rowId,
          entry.mergeSources
            ? {
                ...entry,
                mergeSources: entry.mergeSources.map((source) => ({
                  ...source,
                  row: applyBudgetSourceToNewLines([source.row], sourceId)[0]!,
                })),
              }
            : entry,
        );
      }
      return next;
    });
    return count;
  }, []);

  const validate = useCallback(() => {
    const messages = {
      description: tCostLinesRef.current('form.errorDescription'),
      quantity: tCostLinesRef.current('form.errorQuantity'),
      unitPrice: tCostLinesRef.current('form.errorUnitPrice'),
      number: tCostLinesRef.current('grid.errorNumber'),
      amountPositive: tCostLinesRef.current('form.errorAmountPositive'),
      belongsTo: tCostLinesRef.current('form.errorBelongsTo'),
    };
    const errors = validateGridRows(
      rowsRef.current,
      AUTO_ITEMIZE_GRID_OPTIONS,
      assignAllRef.current,
      { locale, vatRate: vatRateRef.current },
      messages,
    );
    setShowAllErrors(true);
    if (errors.size > 0) {
      requestAnimationFrame(() => {
        globalThis.document
          .querySelector<HTMLElement>(
            `[data-testid="${AUTO_ITEMIZE_GRID_PREFIX}"] [aria-invalid="true"]`,
          )
          ?.focus();
      });
    }
    return errors.size === 0;
  }, [locale]);

  const commitContext = useCallback(
    (): CommitContext => ({
      assignAll: assignAllRef.current,
      locale: localeRef.current,
      vatRate: vatRateRef.current,
      documentType: documentRef.current?.documentType,
      defaultBudgetSourceId: defaultSourceRef.current ?? null,
      discretionarySourceId: optionsRef.current.discretionarySourceId,
    }),
    [],
  );

  return {
    rows,
    data,
    assignAll,
    setAssignAll,
    options,
    selectedRowIds,
    showAllErrors,
    load,
    onRowsChange,
    replaceRows,
    onToggleSelect,
    onClearSelection,
    onMergeSelected,
    onNoticeAction,
    applyBudgetSource,
    validate,
    commitContext,
  };
}
