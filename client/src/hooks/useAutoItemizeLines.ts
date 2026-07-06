import { useState, useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  WorkItemBudgetLine,
  HouseholdItemBudgetLine,
  PaperlessDocumentSearchResult,
  ConfidenceLevel,
} from '@cornerstone/shared';
import { useBudgetLinePicker } from './useBudgetLinePicker.js';
import type { UseBudgetLinePickerReturn } from './useBudgetLinePicker.js';
import type { LineWithInclude } from '../components/autoItemize/types.js';
import type { BudgetLineFormState } from './useBudgetSection.js';
import { mergeLines } from '../lib/invoiceAutoItemizeApi.js';
import {
  aggregateMergedLineNumerics,
  buildAvailableCategories,
} from '../lib/autoItemizeMergeUtils.js';

export interface UseAutoItemizeLinesOptions {
  invoiceId: string;
  invoiceAmount: number;
  document?: PaperlessDocumentSearchResult | null;
  /**
   * Called after any mutating line handler (field change, assign, clear, etc.).
   * AutoItemizePage passes `() => setLineFieldsEdited(true)` for dirty tracking.
   */
  onFieldsEdited?: () => void;
  /**
   * Optional document summary (e.g., invoice notes) passed to merge LLM.
   */
  documentSummary?: string | null;
  /**
   * Called when merge starts (for live region announcements).
   */
  onMergeStart?: (count: number) => void;
  /**
   * Called when merge succeeds (for live region announcements).
   */
  onMergeSuccess?: () => void;
}

export interface UseAutoItemizeLinesReturn {
  lines: LineWithInclude[];
  setLines: Dispatch<SetStateAction<LineWithInclude[]>>;
  picker: UseBudgetLinePickerReturn;
  handlers: {
    onToggleInclude: (rowId: string) => void;
    onFieldChange: (rowId: string, field: keyof LineWithInclude, value: unknown) => void;
    onAssign: (rowId: string) => void;
    onSelectBudgetLine: (line: WorkItemBudgetLine | HouseholdItemBudgetLine) => void;
    onQueueNewBudgetLine: () => void;
    onInlineDraftChange: (rowId: string, updates: Partial<BudgetLineFormState>) => void;
    onClearAssign: (rowId: string) => void;
  };
  selectedRowIds: Set<string>;
  onToggleSelect: (rowId: string) => void;
  onClearSelection: () => void;
  onMergeSelected: () => void;
  onRetryMerge: (rowId: string) => void;
  onUndoMerge: (rowId: string) => void;
}

/**
 * Manages all line-state and picker integration for both auto-itemize flows.
 *
 * Internally calls useBudgetLinePicker so the consuming page no longer needs to.
 * All handlers are stable (useCallback with empty deps) — they read from refs
 * that are kept current on every render to avoid stale closures.
 */
export function useAutoItemizeLines({
  invoiceId,
  invoiceAmount,
  document,
  onFieldsEdited,
  documentSummary,
  onMergeStart,
  onMergeSuccess,
}: UseAutoItemizeLinesOptions): UseAutoItemizeLinesReturn {
  const [lines, setLines] = useState<LineWithInclude[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set());

  // Mutable refs — updated every render so stable callbacks always see fresh values.
  const activeRowIdRef = useRef<string | null>(null);
  const wasCreatedFromExtractionRef = useRef(false);
  const linesRef = useRef(lines);
  linesRef.current = lines;
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

  // Filled in after picker is created (breaks the circular dep on picker.closePicker /
  // picker.openPicker without needing closePicker in useCallback deps).
  const openPickerRef = useRef<() => void>(() => {});
  const closePickerRef = useRef<() => void>(() => {});

  // Stable callback: picker calls this after a budget line is created via its form.
  // Note: useBudgetLinePicker also calls closePicker() after invoking onLineCreated,
  // so we do not need to do so here.
  const onLineCreated = useCallback(
    (line: WorkItemBudgetLine | HouseholdItemBudgetLine) => {
      const rowId = activeRowIdRef.current;
      if (!rowId) return;
      const lineType: 'work_item' | 'household_item' =
        'workItemId' in line ? 'work_item' : 'household_item';
      const fromExtraction = wasCreatedFromExtractionRef.current;
      wasCreatedFromExtractionRef.current = false;
      setLines((prev) =>
        prev.map((l) =>
          l.rowId === rowId
            ? {
                ...l,
                assignedBudgetLineId: line.id,
                assignedBudgetLineType: lineType,
                assignedBudgetLineDescription: line.description,
                createdFromExtraction: fromExtraction,
                inlineCreatedBudgetLineDraft: undefined,
                inlineHideConfidence: undefined,
              }
            : l,
        ),
      );
      onFieldsEditedRef.current?.();
      activeRowIdRef.current = null;
    },
    [], // empty: all reads from stable refs or state setters
  );

  const picker = useBudgetLinePicker({
    invoiceId,
    invoiceAmount,
    eagerLinkInvoice: false,
    onLineCreated,
  });

  // Keep picker function refs current every render.
  openPickerRef.current = picker.openPicker;
  closePickerRef.current = picker.closePicker;

  // Initialize categories, sources, and vendors once on mount.
  useEffect(() => {
    void picker.initializeStaticData();
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- initialize once on mount
  }, []);

  // Re-default budgetSourceId for lines that lack one once sources become available.
  useEffect(() => {
    const sources = picker.pickerState.budgetSources;
    if (!sources || sources.length === 0) return;
    const firstSourceId = sources[0]?.id;
    if (!firstSourceId) return;
    if (!linesRef.current.some((l) => !l.budgetSourceId)) return;
    /* eslint-disable @eslint-react/set-state-in-effect */
    setLines((prev) =>
      prev.map((l) => (l.budgetSourceId ? l : { ...l, budgetSourceId: firstSourceId })),
    );
    /* eslint-enable @eslint-react/set-state-in-effect */
  }, [picker.pickerState.budgetSources]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const onToggleInclude = useCallback((rowId: string) => {
    setLines((prev) => prev.map((l) => (l.rowId === rowId ? { ...l, included: !l.included } : l)));
  }, []);

  const onFieldChange = useCallback(
    (rowId: string, field: keyof LineWithInclude, value: unknown) => {
      setLines((prev) =>
        prev.map((line) => {
          if (line.rowId !== rowId) return line;
          let coercedValue: unknown = value;
          if (['quantity', 'unitPrice'].includes(field as string)) {
            if (value === '' || value === null) {
              coercedValue = null;
            } else if (typeof value === 'string') {
              const parsed = parseFloat(value);
              coercedValue = isNaN(parsed) ? null : parsed;
            }
          } else if (field === 'totalAmount') {
            if (typeof value === 'string') {
              const parsed = parseFloat(value);
              coercedValue = isNaN(parsed) ? 0 : parsed;
            }
          }
          return {
            ...line,
            [field]: coercedValue,
            // When the user toggles includesVat on the line card, mirror it into
            // the inline draft form so the two never drift out of sync.
            ...(field === 'includesVat' && line.inlineCreatedBudgetLineDraft
              ? {
                  inlineCreatedBudgetLineDraft: {
                    ...line.inlineCreatedBudgetLineDraft,
                    includesVat: coercedValue as boolean,
                  },
                }
              : {}),
          };
        }),
      );
      onFieldsEditedRef.current?.();
    },
    [],
  );

  const onAssign = useCallback((rowId: string) => {
    activeRowIdRef.current = rowId;
    openPickerRef.current();
  }, []);

  const onSelectBudgetLine = useCallback(
    (budgetLine: WorkItemBudgetLine | HouseholdItemBudgetLine) => {
      const rowId = activeRowIdRef.current;
      if (!rowId) return;
      const lineType: 'work_item' | 'household_item' =
        'workItemId' in budgetLine ? 'work_item' : 'household_item';
      setLines((prev) =>
        prev.map((l) =>
          l.rowId === rowId
            ? {
                ...l,
                assignedBudgetLineId: budgetLine.id,
                assignedBudgetLineType: lineType,
                assignedBudgetLineDescription: budgetLine.description ?? null,
              }
            : l,
        ),
      );
      onFieldsEditedRef.current?.();
      closePickerRef.current();
      activeRowIdRef.current = null;
    },
    [],
  );

  const onQueueNewBudgetLine = useCallback(() => {
    const rowId = activeRowIdRef.current;
    if (!rowId) return;
    const row = linesRef.current.find((l) => l.rowId === rowId);
    if (!row) return;

    const ps = picker.pickerState;
    const vendors = ps.vendors ?? [];
    const sources = ps.budgetSources ?? [];
    const discretionaryId = sources.find((s) => s.isDiscretionary)?.id;
    const budgetSourceId = row.budgetSourceId ?? discretionaryId ?? '';

    const vendorId = row.vendorName
      ? (vendors.find((v) => v.name.toLowerCase() === row.vendorName!.toLowerCase())?.id ?? null)
      : null;

    // Derive confidence from Paperless document type when available (both flows),
    // falling back to the ML extraction score.
    let confidence: ConfidenceLevel;
    let isConfidenceAutoApplied = false;
    const docType = documentRef.current?.documentType;
    if (docType === 'Invoice') {
      confidence = 'invoice';
      isConfidenceAutoApplied = true;
    } else if (docType === 'Quotation') {
      confidence = 'quote';
      isConfidenceAutoApplied = true;
    } else {
      confidence =
        row.confidence >= 0.85
          ? 'invoice'
          : row.confidence >= 0.6
            ? 'quote'
            : row.confidence >= 0.3
              ? 'professional_estimate'
              : 'own_estimate';
    }

    const draft: BudgetLineFormState = {
      description: row.description ?? '',
      plannedAmount: String(row.totalAmount ?? ''),
      confidence,
      budgetCategoryId: ps.type === 'household_item' ? '' : (row.budgetCategoryId ?? ''),
      budgetSourceId,
      vendorId: vendorId ?? '',
      pricingMode: row.quantity != null && row.unitPrice != null ? 'unit' : 'direct',
      quantity: row.quantity != null ? String(row.quantity) : '',
      unit: row.unit ?? '',
      unitPrice: row.unitPrice != null ? String(row.unitPrice) : '',
      includesVat: row.includesVat !== false,
    };

    setLines((prev) =>
      prev.map((l) =>
        l.rowId === rowId
          ? {
              ...l,
              assignedItemId: ps.itemId ?? undefined,
              assignedItemType: ps.type ?? undefined,
              inlineCreatedBudgetLineDraft: draft,
              inlineHideConfidence: isConfidenceAutoApplied,
            }
          : l,
      ),
    );
    onFieldsEditedRef.current?.();
    closePickerRef.current();
    activeRowIdRef.current = null;
  }, [picker.pickerState]);

  const onInlineDraftChange = useCallback(
    (rowId: string, updates: Partial<BudgetLineFormState>) => {
      setLines((prev) =>
        prev.map((l) =>
          l.rowId === rowId
            ? {
                ...l,
                // Mirror includesVat changes from the inline form back to the
                // parent line so the two never drift out of sync.
                ...(updates.includesVat !== undefined ? { includesVat: updates.includesVat } : {}),
                inlineCreatedBudgetLineDraft: l.inlineCreatedBudgetLineDraft
                  ? { ...l.inlineCreatedBudgetLineDraft, ...updates }
                  : l.inlineCreatedBudgetLineDraft,
              }
            : l,
        ),
      );
      onFieldsEditedRef.current?.();
    },
    [],
  );

  const onClearAssign = useCallback((rowId: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.rowId === rowId
          ? {
              ...l,
              assignedBudgetLineId: undefined,
              assignedBudgetLineType: undefined,
              assignedBudgetLineDescription: undefined,
              createdFromExtraction: undefined,
              assignedItemId: undefined,
              assignedItemType: undefined,
              inlineCreatedBudgetLineDraft: undefined,
              inlineHideConfidence: undefined,
            }
          : l,
      ),
    );
    onFieldsEditedRef.current?.();
  }, []);

  // ─── Merge Handlers ────────────────────────────────────────────────────────────

  const onToggleSelect = useCallback((rowId: string) => {
    const line = linesRef.current.find((l) => l.rowId === rowId);
    if (!line || line.assignedBudgetLineId || line.inlineCreatedBudgetLineDraft) return;
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }, []);

  const onClearSelection = useCallback(() => {
    setSelectedRowIds(new Set());
  }, []);

  const performMerge = useCallback(
    (sourceLines: LineWithInclude[], targetRowId: string) => {
      const descriptions = sourceLines.map((l) => l.description);
      const ps = picker.pickerState;
      const projectCategoryNames = (ps.categories ?? []).map((cat) =>
        cat.translationKey ? cat.name : cat.name,
      );
      const availableCategories = buildAvailableCategories(linesRef.current, projectCategoryNames);

      void mergeLines({
        descriptions,
        documentSummary: documentSummaryRef.current ?? undefined,
        availableCategories,
      })
        .then((response) => {
          setLines((prev) =>
            prev.map((l) =>
              l.rowId === targetRowId
                ? {
                    ...l,
                    description: response.description,
                    category: response.category,
                    budgetCategoryId: response.budgetCategoryId,
                    mergeStatus: undefined,
                    mergeSourceLines: undefined,
                  }
                : l,
            ),
          );

          onFieldsEditedRef.current?.();
          onMergeSuccessRef.current?.();

          // Focus the description textarea after merge completes
          setTimeout(() => {
            globalThis.document.getElementById(`line-description-${targetRowId}`)?.focus();
          }, 0);
        })
        .catch(() => {
          setLines((prev) =>
            prev.map((l) => (l.rowId === targetRowId ? { ...l, mergeStatus: 'error' } : l)),
          );
          // focus the retry button so the user lands on the recovery affordance
          setTimeout(
            () => globalThis.document.getElementById(`merge-retry-${targetRowId}`)?.focus(),
            0,
          );
        });
    },
    [picker.pickerState],
  );

  const onMergeSelected = useCallback(() => {
    if (selectedRowIds.size < 2) return;

    const selectedIndices = linesRef.current
      .map((l, i) => (selectedRowIds.has(l.rowId) ? i : -1))
      .filter((i) => i >= 0);

    const sourceIndex = Math.min(...selectedIndices);
    const selectedLines = selectedIndices.map((i) => linesRef.current[i]!);

    onMergeStartRef.current?.(selectedLines.length);

    const numerics = aggregateMergedLineNumerics(selectedLines);
    const newRowId = `row-merged-${Math.random().toString(36).slice(2, 9)}`;

    const mergedLine: LineWithInclude = {
      ...numerics,
      rowId: newRowId,
      included: true,
      createdFromExtraction: true,
      description: '',
      budgetCategoryId: null,
      assignedBudgetLineId: undefined,
      assignedBudgetLineType: undefined,
      mergeStatus: 'pending',
      mergeSourceLines: selectedLines,
    };

    setLines((prev) => {
      const nextLines = prev.filter((l) => !selectedRowIds.has(l.rowId));
      nextLines.splice(sourceIndex, 0, mergedLine);
      return nextLines;
    });

    setSelectedRowIds(new Set());

    performMerge(selectedLines, newRowId);
  }, [selectedRowIds, performMerge]);

  const onRetryMerge = useCallback(
    (rowId: string) => {
      const line = linesRef.current.find((l) => l.rowId === rowId);
      if (!line || !line.mergeSourceLines) return;

      setLines((prev) =>
        prev.map((l) =>
          l.rowId === rowId
            ? {
                ...l,
                mergeStatus: 'pending',
              }
            : l,
        ),
      );

      performMerge(line.mergeSourceLines, rowId);
    },
    [performMerge],
  );

  const onUndoMerge = useCallback((rowId: string) => {
    setLines((prev) => {
      const mergedLineIndex = prev.findIndex((l) => l.rowId === rowId);
      if (mergedLineIndex === -1) return prev;

      const mergedLine = prev[mergedLineIndex];
      if (!mergedLine?.mergeSourceLines) return prev;

      const nextLines = prev.filter((l) => l.rowId !== rowId);
      nextLines.splice(mergedLineIndex, 0, ...mergedLine.mergeSourceLines);
      return nextLines;
    });
    onFieldsEditedRef.current?.();
  }, []);

  return {
    lines,
    setLines,
    picker,
    handlers: {
      onToggleInclude,
      onFieldChange,
      onAssign,
      onSelectBudgetLine,
      onQueueNewBudgetLine,
      onInlineDraftChange,
      onClearAssign,
    },
    selectedRowIds,
    onToggleSelect,
    onClearSelection,
    onMergeSelected,
    onRetryMerge,
    onUndoMerge,
  };
}
