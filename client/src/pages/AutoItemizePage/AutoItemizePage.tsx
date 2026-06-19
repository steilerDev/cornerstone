import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  Invoice,
  ExtractedLine,
  AutoItemizeWarning,
  PaperlessDocumentSearchResult,
  InvoicePatchForAutoItemize,
  InvoiceStatus,
  WorkItemBudgetLine,
  HouseholdItemBudgetLine,
  ConfidenceLevel,
} from '@cornerstone/shared';
import type { BadgeVariantMap } from '../../components/Badge/Badge.js';
import { fetchInvoiceById } from '../../lib/invoicesApi.js';
import { autoItemize } from '../../lib/invoiceAutoItemizeApi.js';
import {
  getPaperlessDocument,
  getDocumentPreviewUrl,
  getPaperlessStatus,
} from '../../lib/paperlessApi.js';
import { createWorkItemBudget } from '../../lib/workItemBudgetsApi.js';
import { createHouseholdItemBudget } from '../../lib/householdItemBudgetsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { useBudgetLinePicker } from '../../hooks/useBudgetLinePicker.js';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import { Modal } from '../../components/Modal/Modal.js';
import { Spinner } from '../../components/Spinner/Spinner.js';
import { FormError } from '../../components/FormError/FormError.js';
import { SuggestionBadge } from '../../components/SuggestionBadge/SuggestionBadge.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import {
  AutoItemizeLineList,
  BudgetLinePickerModal,
  type LineWithInclude,
} from '../../components/autoItemize/index.js';
import { CONFIDENCE_LABELS, effectiveLineAmount } from '../../lib/budgetConstants.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './AutoItemizePage.module.css';

type PageStatus = 'loading' | 'error' | 'ready' | 'saving';

interface MetadataEdits {
  invoiceNumber: string | null;
  amount: string;
  date: string;
  dueDate: string | null;
  notes: string | null;
  status: InvoiceStatus;
}

export function AutoItemizePage() {
  const { id: invoiceId, documentId } = useParams<{ id: string; documentId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { formatCurrency } = useFormatters();

  // Badge variants for "Created from auto-itemization"
  const createdFromExtractionVariants = useMemo(
    (): BadgeVariantMap => ({
      true: {
        label: t('autoItemize.createdFromAutoItemization'),
        className: badgeStyles.info,
      },
    }),
    [t],
  );

  // Page state - ALL hooks must be called unconditionally before any early return
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [document, setDocument] = useState<PaperlessDocumentSearchResult | null>(null);
  const [lines, setLines] = useState<LineWithInclude[]>([]);
  const [warnings, setWarnings] = useState<AutoItemizeWarning[]>([]);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [pageError, setPageError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [paperlessStatus, setPaperlessStatus] = useState<Awaited<
    ReturnType<typeof getPaperlessStatus>
  > | null>(null);
  const [extractedInvoiceDate, setExtractedInvoiceDate] = useState<string | undefined>(undefined);
  const [extractedDueDate, setExtractedDueDate] = useState<string | undefined>(undefined);
  const [extractedInvoiceNumber, setExtractedInvoiceNumber] = useState<string | undefined>(
    undefined,
  );
  const [extractedNotes, setExtractedNotes] = useState<string | undefined>(undefined);

  // Metadata edits
  const [metadataEdits, setMetadataEdits] = useState<MetadataEdits>({
    invoiceNumber: null,
    amount: '',
    date: '',
    dueDate: null,
    notes: null,
    status: 'pending',
  });

  // Dirty state tracking and cancel confirmation
  const [isDirty, setIsDirty] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [announceMessage, setAnnounceMessage] = useState('');

  // Budget line picker state
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [lineFieldsEdited, setLineFieldsEdited] = useState(false);
  const wasCreatedFromExtractionRef = useRef(false);
  const { t: tSettings } = useTranslation('settings');

  const picker = useBudgetLinePicker({
    invoiceId: invoiceId || '',
    invoiceAmount: invoice?.amount ?? 0,
    eagerLinkInvoice: false,
    onLineCreated: (line, _invoiceBudgetLineId) => {
      if (!activeRowId) return;
      // Determine the type from the returned budget line object
      // WorkItemBudgetLine has workItemId, HouseholdItemBudgetLine has householdItemId
      const lineType = 'workItemId' in line ? 'work_item' : 'household_item';
      // Snapshot the ref value NOW (before setLines) so the updater closure captures
      // the correct value regardless of when React executes the deferred updater.
      // Reading wasCreatedFromExtractionRef.current INSIDE the setLines updater causes a
      // race on WebKit: the ref is reset to false before the updater executes (React 18
      // automatic batching defers updater execution after the synchronous reset).
      const fromExtraction = wasCreatedFromExtractionRef.current;
      wasCreatedFromExtractionRef.current = false;
      // Store the assigned budget line ID, type, and description on the row
      // Note: when eagerLinkInvoice is false, invoiceBudgetLineId will be null
      // Use line.id (the work_item_budget or household_item_budget ID) instead
      setLines((prev) =>
        prev.map((l) =>
          l.rowId === activeRowId
            ? {
                ...l,
                assignedBudgetLineId: line.id,
                assignedBudgetLineType: lineType,
                assignedBudgetLineDescription: line.description,
                createdFromExtraction: fromExtraction,
                inlineCreatedBudgetLineDraft: undefined,
              }
            : l,
        ),
      );
      setLineFieldsEdited(true);
      picker.closePicker();
      setActiveRowId(null);
    },
  });

  // Eagerly load categories, sources, and vendors on mount
  useEffect(() => {
    picker.initializeStaticData();
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- picker is stable, only initialize once on mount
  }, []);

  // Timer effect for elapsed seconds counter
  useEffect(() => {
    if (pageStatus !== 'loading') {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- reset counter when loading stops (not synchronous)
      setElapsed(0);
      return;
    }
    const id = setInterval(() => {
      setElapsed((n) => n + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [pageStatus]);

  // Load invoice and fetch dry-run on mount
  useEffect(() => {
    if (!invoiceId || !documentId) return; // Guard inside effect

    const loadData = async () => {
      setPageStatus('loading');
      setPageError(null);
      setLineFieldsEdited(false);
      setElapsed(0);
      setPdfLoaded(false);
      setPdfFailed(false);
      setExtractedInvoiceNumber(undefined);
      setExtractedNotes(undefined);

      try {
        // Load Paperless status for the fallback link
        try {
          const status = await getPaperlessStatus();
          setPaperlessStatus(status);
        } catch {
          setPaperlessStatus({
            configured: false,
            reachable: false,
            error: 'Failed to check status',
            paperlessUrl: null,
            filterTag: null,
          });
        }

        // Fetch invoice
        const inv = await fetchInvoiceById(invoiceId);
        setInvoice(inv);

        // Fetch document
        const docId = parseInt(documentId, 10);
        if (isNaN(docId)) {
          setPageError(t('autoItemize.invalidDocumentId'));
          setPageStatus('error');
          return;
        }

        const docResponse = await getPaperlessDocument(docId);
        setDocument({
          ...docResponse.document,
          searchHit: null,
        });

        // Initialize metadata edits with current invoice data
        setMetadataEdits({
          invoiceNumber: inv.invoiceNumber ?? null,
          amount: inv.amount.toString(),
          date: inv.date,
          dueDate: inv.dueDate ?? null,
          notes: inv.notes ?? null,
          status: inv.status,
        });

        // Run dry-run auto-itemize
        const _autoItemizeResult = await autoItemize(invoiceId, {
          paperlessDocumentId: docId,
          mode: 'append',
          dryRun: true,
        });

        if ('lines' in _autoItemizeResult && 'warnings' in _autoItemizeResult) {
          const linesWithInclude: LineWithInclude[] = _autoItemizeResult.lines.map((line, idx) => ({
            ...line,
            included: true,
            rowId: `row-${idx}-${Math.random().toString(36).slice(2, 9)}`,
            budgetCategoryId: line.budgetCategoryId ?? null,
            budgetSourceId:
              line.budgetSourceId ?? picker.pickerState.budgetSources?.[0]?.id ?? null,
          }));
          setLines(linesWithInclude);
          setWarnings(_autoItemizeResult.warnings);
          setExtractedInvoiceDate(_autoItemizeResult.extractedInvoiceDate ?? undefined);
          setExtractedDueDate(_autoItemizeResult.extractedDueDate ?? undefined);
          setExtractedInvoiceNumber(_autoItemizeResult.extractedInvoiceNumber ?? undefined);
          setExtractedNotes(_autoItemizeResult.extractedNotes ?? undefined);
          setPageStatus('ready');
        } else {
          setPageError(t('autoItemize.unexpectedResponse'));
          setPageStatus('error');
        }
      } catch (err) {
        if (err instanceof ApiClientError) {
          const errorCode = err.error.code;
          const errorMsg = translateApiError(errorCode, tErrors);
          setPageError(errorMsg);
        } else {
          setPageError(t('autoItemize.loadError'));
        }
        setPageStatus('error');
      }
    };

    void loadData();
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- picker.pickerState identity changes each render; its data is stable so the effect re-runs on the listed deps only
  }, [invoiceId, documentId, t, tErrors]);

  // Track dirty state
  const originalMetadata = useMemo(
    () => ({
      invoiceNumber: invoice?.invoiceNumber ?? null,
      amount: invoice?.amount.toString() ?? '',
      date: invoice?.date ?? '',
      dueDate: invoice?.dueDate ?? null,
      notes: invoice?.notes ?? null,
      status: (invoice?.status ?? 'pending') as InvoiceStatus,
    }),
    [invoice],
  );

  // Re-default budgetSourceId when sources become available
  useEffect(() => {
    if (
      picker.pickerState.budgetSources &&
      picker.pickerState.budgetSources.length > 0 &&
      lines.some((l) => !l.budgetSourceId)
    ) {
      const firstSourceId = picker.pickerState.budgetSources[0]?.id;
      if (firstSourceId) {
        /* eslint-disable @eslint-react/set-state-in-effect -- initializes editable lines from extraction result */
        setLines((prev) =>
          prev.map((l) => (l.budgetSourceId ? l : { ...l, budgetSourceId: firstSourceId })),
        );
        /* eslint-enable @eslint-react/set-state-in-effect */
      }
    }
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- picker.pickerState identity changes each render; data is stable
  }, [picker.pickerState.budgetSources]);

  // Track dirty state without synchronous setState in effect
  useEffect(() => {
    const metadataChanged = Object.entries(metadataEdits).some(
      ([key, value]) => value !== originalMetadata[key as keyof MetadataEdits],
    );
    const linesChanged = lines.some((line) => !line.included);

    // eslint-disable-next-line @eslint-react/set-state-in-effect -- Intentional: dirty state must be recalculated when inputs change
    setIsDirty(metadataChanged || linesChanged || lineFieldsEdited);
  }, [metadataEdits, lines, originalMetadata, lineFieldsEdited]);

  const handleCancel = useCallback(() => {
    if (!invoiceId) return;
    if (isDirty) {
      setShowCancelConfirm(true);
    } else {
      navigate(`/budget/invoices/${invoiceId}`);
    }
  }, [isDirty, invoiceId, navigate]);

  const handleConfirmCancel = useCallback(() => {
    if (!invoiceId) return;
    setShowCancelConfirm(false);
    navigate(`/budget/invoices/${invoiceId}`);
  }, [invoiceId, navigate]);

  const handleSave = useCallback(async () => {
    if (!invoiceId || !documentId || !invoice || !document) return;

    setPageStatus('saving');

    try {
      const docId = parseInt(documentId, 10);
      const includedLines = lines.filter((l) => l.included);
      const workingLines = [...includedLines];

      // Materialize queued create-new lines BEFORE autoItemize call
      for (let i = 0; i < workingLines.length; i++) {
        const line = workingLines[i]!;
        if (!line.inlineCreatedBudgetLineDraft || !line.assignedItemId || !line.assignedItemType) {
          continue;
        }

        const draft = line.inlineCreatedBudgetLineDraft!;

        // Parse and validate netBase
        let netBase: number;
        if (draft.pricingMode === 'unit') {
          const q = parseFloat(draft.quantity);
          const p = parseFloat(draft.unitPrice);
          if (!isFinite(q) || !isFinite(p)) {
            setPageError(t('autoItemize.inlineDraftInvalid'));
            setPageStatus('ready');
            return;
          }
          netBase = Math.round(q * p * 100) / 100;
        } else {
          netBase = parseFloat(draft.plannedAmount);
          if (!isFinite(netBase) || netBase < 0) {
            setPageError(t('autoItemize.inlineDraftInvalid'));
            setPageStatus('ready');
            return;
          }
        }

        // Build payload for budget line creation
        const payload = {
          description: draft.description.trim() || null,
          plannedAmount: netBase,
          confidence: draft.confidence,
          budgetCategoryId:
            line.assignedItemType === 'work_item' ? draft.budgetCategoryId || null : null,
          budgetSourceId: draft.budgetSourceId || null,
          vendorId: draft.vendorId || null,
          quantity: draft.pricingMode === 'unit' ? parseFloat(draft.quantity) || null : null,
          unit: draft.pricingMode === 'unit' ? draft.unit || null : null,
          unitPrice: draft.pricingMode === 'unit' ? parseFloat(draft.unitPrice) || null : null,
          includesVat: draft.includesVat,
        };

        // Create the budget line
        let newBudgetLineId: string;
        try {
          const createFn =
            line.assignedItemType === 'work_item'
              ? createWorkItemBudget
              : createHouseholdItemBudget;
          const createdBudgetLine = await createFn(line.assignedItemId, payload);
          newBudgetLineId = createdBudgetLine.id;
        } catch (err) {
          const errorMsg =
            err instanceof ApiClientError
              ? translateApiError(err.error.code, tErrors)
              : t('autoItemize.inlineDraftCreateFailed');
          setPageError(errorMsg);
          setPageStatus('ready');
          return;
        }

        // Convert the queued line to an assign-existing entry. The single
        // autoItemize call below creates the invoice<->budget-line junction and
        // stores the GROSS itemized amount server-side (effectiveLineAmount on
        // totalAmount + includesVat). We must NOT link here as well, or the
        // junction would be created twice (BUDGET_LINE_ALREADY_LINKED).
        workingLines[i] = {
          ...line,
          assignedBudgetLineId: newBudgetLineId,
          assignedBudgetLineType: line.assignedItemType,
          totalAmount: netBase,
          includesVat: draft.includesVat,
          inlineCreatedBudgetLineDraft: undefined,
          assignedItemId: undefined,
          assignedItemType: undefined,
        };
      }

      // Build invoicePatch only if metadata changed
      const patch: Partial<InvoicePatchForAutoItemize> = {};
      if (metadataEdits.invoiceNumber !== originalMetadata.invoiceNumber) {
        patch.invoiceNumber = metadataEdits.invoiceNumber;
      }
      if (metadataEdits.amount !== originalMetadata.amount) {
        patch.amount = parseFloat(metadataEdits.amount);
      }
      if (metadataEdits.date !== originalMetadata.date) {
        patch.date = metadataEdits.date;
      }
      if (metadataEdits.dueDate !== originalMetadata.dueDate) {
        patch.dueDate = metadataEdits.dueDate;
      }
      if (metadataEdits.notes !== originalMetadata.notes) {
        patch.notes = metadataEdits.notes;
      }
      if (metadataEdits.status !== originalMetadata.status) {
        patch.status = metadataEdits.status;
      }

      // Validate that all included lines have a category (including materialized ones)
      const missingCategories = workingLines.filter(
        (l) => !l.assignedBudgetLineId && !l.budgetCategoryId,
      );
      if (missingCategories.length > 0) {
        setPageError(t('autoItemize.categoryRequiredError'));
        setPageStatus('ready');
        return;
      }

      // Map lines to payload using workingLines (which includes materialized results)
      // Note: vatRate is omitted from the payload (dropped from UI)
      const linesPayload: ExtractedLine[] = workingLines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: l.unitPrice,
        totalAmount: l.totalAmount,
        includesVat: l.includesVat,
        vendorName: l.vendorName,
        confidence: l.confidence,
        budgetCategoryId: l.budgetCategoryId,
        budgetSourceId: l.budgetSourceId || undefined,
        ...(l.assignedBudgetLineId && l.assignedBudgetLineType
          ? {
              assignedBudgetLineId: l.assignedBudgetLineId,
              assignedBudgetLineType: l.assignedBudgetLineType,
              assignmentMode: 'assign-existing' as const,
            }
          : {
              assignmentMode: 'create-new' as const,
            }),
      }));

      await autoItemize(invoiceId, {
        paperlessDocumentId: docId,
        mode,
        dryRun: false,
        lines: linesPayload,
        ...(Object.keys(patch).length > 0 ? { invoicePatch: patch } : {}),
      });

      // Navigate back on success
      navigate(`/budget/invoices/${invoiceId}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const errorCode = err.error.code;
        const errorMsg = translateApiError(errorCode, tErrors);
        setPageError(errorMsg);
      } else {
        setPageError(t('autoItemize.saveError'));
      }
      setPageStatus('ready');
    }
  }, [
    invoiceId,
    documentId,
    lines,
    metadataEdits,
    originalMetadata,
    mode,
    invoice,
    document,
    navigate,
    t,
    tErrors,
  ]);

  const handleApplySuggestion = useCallback(
    (field: keyof MetadataEdits, value: string) => {
      setMetadataEdits((prev) => ({ ...prev, [field]: value }));
      setAnnounceMessage(t('autoItemize.suggestionApplied', { field }));
    },
    [t],
  );

  const handleLineToggle = useCallback((rowId: string) => {
    setLines((prev) =>
      prev.map((line) => (line.rowId === rowId ? { ...line, included: !line.included } : line)),
    );
  }, []);

  const handleLineFieldChange = useCallback(
    (rowId: string, field: keyof LineWithInclude, value: unknown) => {
      setLines((prev) =>
        prev.map((line) => {
          if (line.rowId !== rowId) return line;

          // Type coercion for different field types
          let coercedValue: unknown = value;

          // For number fields, convert empty string to null, else parse
          if (['quantity', 'unitPrice'].includes(field as string)) {
            if (value === '' || value === null) {
              coercedValue = null;
            } else if (typeof value === 'string') {
              const parsed = parseFloat(value);
              coercedValue = isNaN(parsed) ? null : parsed;
            }
          }
          // For totalAmount, always parse as number
          else if (field === 'totalAmount') {
            if (typeof value === 'string') {
              const parsed = parseFloat(value);
              coercedValue = isNaN(parsed) ? 0 : parsed;
            }
          }

          return {
            ...line,
            [field]: coercedValue,
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
      setLineFieldsEdited(true);
    },
    [],
  );

  const handleAssignButtonClick = useCallback(
    (rowId: string) => {
      setActiveRowId(rowId);
      picker.openPicker();
    },
    [picker],
  );

  /**
   * Step 2: User selects a budget line from the filtered list.
   * Do NOT call any API — just store the budget line ID and details on the row.
   */
  const handleSelectBudgetLine = useCallback(
    (budgetLine: WorkItemBudgetLine | HouseholdItemBudgetLine) => {
      if (!activeRowId) return;

      const lineType: 'work_item' | 'household_item' =
        'workItemId' in budgetLine ? 'work_item' : 'household_item';

      setLines((prev) =>
        prev.map((l) =>
          l.rowId === activeRowId
            ? {
                ...l,
                assignedBudgetLineId: budgetLine.id,
                assignedBudgetLineType: lineType,
                assignedBudgetLineDescription: budgetLine.description ?? null,
              }
            : l,
        ),
      );
      setLineFieldsEdited(true);
      picker.closePicker();
      setActiveRowId(null);
    },
    [activeRowId, picker],
  );

  const handleQueueNewBudgetLine = useCallback(() => {
    if (!activeRowId) return;
    const row = lines.find((l) => l.rowId === activeRowId);
    if (!row) return;

    // Resolve vendorId from row's vendorName against already-loaded vendors
    const vendors = picker.pickerState.vendors ?? [];
    const vendorId = row.vendorName
      ? (vendors.find((v) => v.name.toLowerCase() === row.vendorName!.toLowerCase())?.id ?? null)
      : null;

    // Resolve budgetSourceId: use row's value or fall back to discretionary
    const sources = picker.pickerState.budgetSources ?? [];
    const discretionaryId = sources.find((s) => s.isDiscretionary)?.id;
    const budgetSourceId = row.budgetSourceId ?? discretionaryId ?? '';

    // Map numeric confidence (0..1) to ConfidenceLevel enum
    const confidence: ConfidenceLevel =
      row.confidence >= 0.85
        ? 'invoice'
        : row.confidence >= 0.6
          ? 'quote'
          : row.confidence >= 0.3
            ? 'professional_estimate'
            : 'own_estimate';

    const draft: BudgetLineFormState = {
      description: row.description ?? '',
      plannedAmount: String(row.totalAmount ?? ''),
      confidence,
      budgetCategoryId:
        picker.pickerState.type === 'household_item' ? '' : (row.budgetCategoryId ?? ''),
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
        l.rowId === activeRowId
          ? {
              ...l,
              assignedItemId: picker.pickerState.itemId ?? undefined,
              assignedItemType: picker.pickerState.type ?? undefined,
              inlineCreatedBudgetLineDraft: draft,
            }
          : l,
      ),
    );
    setLineFieldsEdited(true);
    picker.closePicker();
    setActiveRowId(null);
  }, [activeRowId, lines, picker]);

  const handleInlineDraftChange = useCallback(
    (rowId: string, updates: Partial<BudgetLineFormState>) => {
      setLines((prev) =>
        prev.map((l) =>
          l.rowId === rowId
            ? {
                ...l,
                ...(updates.includesVat !== undefined ? { includesVat: updates.includesVat } : {}),
                inlineCreatedBudgetLineDraft: l.inlineCreatedBudgetLineDraft
                  ? { ...l.inlineCreatedBudgetLineDraft, ...updates }
                  : l.inlineCreatedBudgetLineDraft,
              }
            : l,
        ),
      );
      setLineFieldsEdited(true);
    },
    [],
  );

  const handleRetry = useCallback(() => {
    if (!invoiceId || !documentId) return;

    setPageStatus('loading');
    setPageError(null);
    setLineFieldsEdited(false);

    const loadData = async () => {
      try {
        const docId = parseInt(documentId, 10);
        const result = await autoItemize(invoiceId, {
          paperlessDocumentId: docId,
          mode: 'append',
          dryRun: true,
        });

        if ('lines' in result && 'warnings' in result) {
          const linesWithInclude: LineWithInclude[] = result.lines.map((line, idx) => ({
            ...line,
            included: true,
            rowId: `row-${idx}-${Math.random().toString(36).slice(2, 9)}`,
            budgetCategoryId: line.budgetCategoryId ?? null,
            budgetSourceId:
              line.budgetSourceId ?? picker.pickerState.budgetSources?.[0]?.id ?? null,
          }));
          setLines(linesWithInclude);
          setWarnings(result.warnings);
          setPageStatus('ready');
        } else {
          setPageError(t('autoItemize.unexpectedResponse'));
          setPageStatus('error');
        }
      } catch (err) {
        if (err instanceof ApiClientError) {
          const errorCode = err.error.code;
          const errorMsg = translateApiError(errorCode, tErrors);
          setPageError(errorMsg);
        } else {
          setPageError(t('autoItemize.loadError'));
        }
        setPageStatus('error');
      }
    };

    void loadData();
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- picker.pickerState identity changes each render; its data is stable so the effect re-runs on the listed deps only
  }, [invoiceId, documentId, t, tErrors]);

  // Suggest amount from warnings
  const amountSuggestion = useMemo(
    () => warnings.find((w) => w.code === 'TOTAL_MISMATCH')?.extractedTotal,
    [warnings],
  );

  const dateSuggestion = useMemo(
    () =>
      extractedInvoiceDate && extractedInvoiceDate !== metadataEdits.date
        ? extractedInvoiceDate
        : undefined,
    [extractedInvoiceDate, metadataEdits.date],
  );

  const dueDateSuggestion = useMemo(
    () =>
      extractedDueDate && extractedDueDate !== (metadataEdits.dueDate ?? '')
        ? extractedDueDate
        : undefined,
    [extractedDueDate, metadataEdits.dueDate],
  );

  const invoiceNumberSuggestion = useMemo(
    () =>
      extractedInvoiceNumber && extractedInvoiceNumber !== (metadataEdits.invoiceNumber ?? '')
        ? extractedInvoiceNumber
        : undefined,
    [extractedInvoiceNumber, metadataEdits.invoiceNumber],
  );

  const notesSuggestion = useMemo(
    () =>
      extractedNotes && extractedNotes !== (metadataEdits.notes ?? '') ? extractedNotes : undefined,
    [extractedNotes, metadataEdits.notes],
  );

  const { computedLineTotal, variance, variancePercent } = useMemo(() => {
    const total = lines
      .filter((l) => l.included)
      .reduce(
        (sum, l) =>
          sum + effectiveLineAmount({ amount: l.totalAmount ?? 0, includesVat: l.includesVat }),
        0,
      );
    const inv = parseFloat(metadataEdits.amount) || invoice?.amount || 0;
    const v = total - inv;
    return {
      computedLineTotal: total,
      variance: v,
      variancePercent: inv > 0 ? Math.abs(v) / inv : 0,
    };
  }, [lines, metadataEdits.amount, invoice?.amount]);

  // Guard for missing params (after all hooks are called)
  if (!invoiceId || !documentId) {
    return <div>{t('autoItemize.error')}</div>;
  }

  // Render content based on page status
  if (pageStatus === 'loading') {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{t('autoItemize.title')}</h1>
        </div>
        <div className={styles.pageBody}>
          <div className={styles.loadingState} aria-busy="true">
            <Spinner size="lg" color="primary" label={t('autoItemize.spinnerLabel')} />
            <p className={styles.analyzingCaption} aria-hidden="true">
              {t('autoItemize.analyzing', { seconds: elapsed })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (pageStatus === 'error' || !invoice || !document) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{t('autoItemize.title')}</h1>
        </div>
        <div className={styles.pageBody}>
          <div className={styles.errorColumn}>
            <FormError variant="banner" message={pageError || t('autoItemize.error')} />
            {pageStatus === 'error' && (
              <button type="button" className={sharedStyles.btnPrimary} onClick={handleRetry}>
                {t('autoItemize.retry')}
              </button>
            )}
            <Link to={`/budget/invoices/${invoiceId}`} className={sharedStyles.btnSecondary}>
              {t('autoItemize.backToInvoice')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.pageContainer} data-layout="full-height">
        <div className={styles.pageHeader}>
          <div>
            <Link to={`/budget/invoices/${invoiceId}`} className={styles.breadcrumb}>
              {t('autoItemize.backToInvoice')}
            </Link>
          </div>
          <h1 className={styles.pageTitle}>{t('autoItemize.title')}</h1>
        </div>

        <div className={styles.pageBody}>
          {/* Form column */}
          <div className={styles.formColumn} aria-busy={(pageStatus as PageStatus) === 'saving'}>
            <a href="#itemize-form" className={styles.skipLink}>
              {t('autoItemize.skipToForm')}
            </a>

            {/* Live region for announcements */}
            <div role="status" aria-atomic="true" className={sharedStyles.srOnly}>
              {announceMessage}
            </div>

            {/* Error banner */}
            {pageError && <FormError variant="banner" message={pageError} />}

            {/* Metadata section */}
            <div className={styles.metadataCard}>
              <h2 className={styles.sectionTitle}>{t('autoItemize.invoiceMetadata')}</h2>

              <div className={styles.fieldRow}>
                <label htmlFor="invoice-number">{t('autoItemize.invoiceNumber')}</label>
                <div>
                  <div className={styles.fieldControl}>
                    <input
                      id="invoice-number"
                      type="text"
                      value={metadataEdits.invoiceNumber ?? ''}
                      onChange={(e) =>
                        setMetadataEdits((prev) => ({
                          ...prev,
                          invoiceNumber: e.target.value || null,
                        }))
                      }
                    />
                  </div>
                  {invoiceNumberSuggestion && (
                    <SuggestionBadge
                      suggestedValue={invoiceNumberSuggestion}
                      fieldLabel={t('autoItemize.invoiceNumber')}
                      displayValue={invoiceNumberSuggestion}
                      onApply={() =>
                        handleApplySuggestion('invoiceNumber', invoiceNumberSuggestion)
                      }
                    />
                  )}
                </div>
              </div>

              <div className={styles.fieldRow}>
                <label htmlFor="amount">{t('autoItemize.amount')}</label>
                <div>
                  <div className={styles.fieldControl}>
                    <input
                      id="amount"
                      type="number"
                      step="0.01"
                      value={metadataEdits.amount}
                      onChange={(e) =>
                        setMetadataEdits((prev) => ({
                          ...prev,
                          amount: e.target.value,
                        }))
                      }
                    />
                  </div>
                  {amountSuggestion && amountSuggestion.toString() !== metadataEdits.amount && (
                    <SuggestionBadge
                      suggestedValue={amountSuggestion.toString()}
                      fieldLabel={t('autoItemize.amount')}
                      displayValue={formatCurrency(amountSuggestion)}
                      onApply={() => handleApplySuggestion('amount', amountSuggestion.toString())}
                    />
                  )}
                </div>
              </div>

              <div className={styles.fieldRow}>
                <label htmlFor="date">{t('autoItemize.date')}</label>
                <div>
                  <div className={styles.fieldControl}>
                    <input
                      id="date"
                      type="date"
                      value={metadataEdits.date}
                      onChange={(e) =>
                        setMetadataEdits((prev) => ({
                          ...prev,
                          date: e.target.value,
                        }))
                      }
                    />
                  </div>
                  {dateSuggestion && (
                    <SuggestionBadge
                      suggestedValue={dateSuggestion}
                      fieldLabel={t('autoItemize.date')}
                      displayValue={dateSuggestion}
                      onApply={() => handleApplySuggestion('date', dateSuggestion)}
                    />
                  )}
                </div>
              </div>

              <div className={styles.fieldRow}>
                <label htmlFor="due-date">{t('autoItemize.dueDate')}</label>
                <div>
                  <div className={styles.fieldControl}>
                    <input
                      id="due-date"
                      type="date"
                      value={metadataEdits.dueDate ?? ''}
                      onChange={(e) =>
                        setMetadataEdits((prev) => ({
                          ...prev,
                          dueDate: e.target.value || null,
                        }))
                      }
                    />
                  </div>
                  {dueDateSuggestion && (
                    <SuggestionBadge
                      suggestedValue={dueDateSuggestion}
                      fieldLabel={t('autoItemize.dueDate')}
                      displayValue={dueDateSuggestion}
                      onApply={() => handleApplySuggestion('dueDate', dueDateSuggestion)}
                    />
                  )}
                </div>
              </div>

              <div className={styles.fieldRow}>
                <label htmlFor="notes">{t('autoItemize.notes')}</label>
                <div>
                  <div className={styles.fieldControl}>
                    <textarea
                      id="notes"
                      value={metadataEdits.notes ?? ''}
                      onChange={(e) =>
                        setMetadataEdits((prev) => ({
                          ...prev,
                          notes: e.target.value || null,
                        }))
                      }
                      rows={3}
                    />
                  </div>
                  {notesSuggestion && (
                    <SuggestionBadge
                      suggestedValue={notesSuggestion}
                      fieldLabel={t('autoItemize.notes')}
                      displayValue={notesSuggestion}
                      onApply={() => handleApplySuggestion('notes', notesSuggestion)}
                      multiLine
                    />
                  )}
                </div>
              </div>

              <div className={styles.fieldRow}>
                <label htmlFor="invoice-status">{t('autoItemize.status')}</label>
                <div className={styles.fieldControl}>
                  <select
                    id="invoice-status"
                    value={metadataEdits.status}
                    onChange={(e) =>
                      setMetadataEdits((prev) => ({
                        ...prev,
                        status: e.target.value as InvoiceStatus,
                      }))
                    }
                  >
                    {(['pending', 'paid', 'claimed', 'quotation'] as InvoiceStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {t(`invoices.statusLabels.${s}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Mode selector */}
            <div className={styles.metadataCard}>
              <h3 className={styles.sectionTitle}>{t('autoItemize.mode')}</h3>
              <div
                className={styles.modeSelector}
                role="group"
                aria-label={t('autoItemize.modeLabel')}
              >
                <label>
                  <input
                    type="radio"
                    name="mode"
                    value="append"
                    checked={mode === 'append'}
                    onChange={(e) => setMode(e.target.value as 'append' | 'replace')}
                  />
                  {t('autoItemize.modeAppend')}
                </label>
                <label>
                  <input
                    type="radio"
                    name="mode"
                    value="replace"
                    checked={mode === 'replace'}
                    onChange={(e) => setMode(e.target.value as 'append' | 'replace')}
                  />
                  {t('autoItemize.modeReplace')}
                </label>
              </div>
            </div>

            {/* Lines list */}
            <div className={styles.metadataCard}>
              <h3 className={styles.sectionTitle}>{t('autoItemize.extractedLines')}</h3>
              <AutoItemizeLineList
                lines={lines}
                onToggleInclude={handleLineToggle}
                onFieldChange={handleLineFieldChange}
                onAssign={handleAssignButtonClick}
                onClearAssign={(rowId) => {
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
                          }
                        : l,
                    ),
                  );
                  setLineFieldsEdited(true);
                }}
                categories={picker.pickerState.categories ?? []}
                budgetSources={picker.pickerState.budgetSources ?? []}
                discretionarySourceId={
                  (picker.pickerState.budgetSources ?? []).find((s) => s.isDiscretionary)?.id
                }
                computedTotal={computedLineTotal}
                variance={variance}
                variancePercent={variancePercent}
                createdFromExtractionVariants={createdFromExtractionVariants}
                formatCurrency={formatCurrency}
                t={t}
                tSettings={tSettings}
                onInlineDraftChange={handleInlineDraftChange}
                confidenceLabels={CONFIDENCE_LABELS}
                vendors={picker.pickerState.vendors ?? []}
                budgetCategories={picker.pickerState.categories ?? []}
              />
            </div>

            {/* Action buttons */}
            <div className={styles.actions}>
              <button
                type="button"
                className={sharedStyles.btnPrimary}
                onClick={handleSave}
                disabled={pageStatus === 'saving'}
              >
                {pageStatus === 'saving' ? t('autoItemize.saving') : t('autoItemize.save')}
              </button>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={handleCancel}
                disabled={pageStatus === 'saving'}
              >
                {t('autoItemize.cancel')}
              </button>
            </div>
          </div>

          {/* Preview column — PDF iframe */}
          <div className={styles.previewColumn}>
            {!pdfFailed ? (
              <div className={styles.pdfPreviewWrapper}>
                {!pdfLoaded && (
                  <div className={styles.pdfLoadingOverlay} aria-hidden="true">
                    <Spinner size="md" color="muted" label={t('autoItemize.pdfPreviewTitle')} />
                  </div>
                )}
                <iframe
                  className={styles.pdfIframe}
                  src={getDocumentPreviewUrl(parseInt(documentId, 10))}
                  title={t('autoItemize.pdfPreviewTitle')}
                  onLoad={() => setPdfLoaded(true)}
                  onErrorCapture={() => setPdfFailed(true)}
                />
              </div>
            ) : (
              <div
                className={styles.pdfFallback}
                role="region"
                aria-label={t('autoItemize.previewUnavailable')}
              >
                <svg
                  aria-hidden="true"
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-text-muted)"
                  strokeWidth="1.5"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className={styles.pdfFallbackLabel}>
                  {t('autoItemize.previewUnavailable')}
                </span>
                {paperlessStatus?.paperlessUrl && (
                  <a
                    href={`${paperlessStatus.paperlessUrl}/documents/${documentId}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.pdfFallbackLink}
                  >
                    {t('autoItemize.openInPaperless')}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Budget line picker modal */}
      {picker.pickerState.isOpen && (
        <Modal
          title={
            picker.pickerState.step === 1
              ? t('autoItemize.pickerTitle')
              : t('autoItemize.pickerStep2Title', {
                  itemTitle: picker.pickerState.itemTitle,
                })
          }
          onClose={picker.closePicker}
        >
          <BudgetLinePickerModal
            pickerState={picker.pickerState}
            setPickerState={picker.setPickerState}
            handleSelectItem={picker.handleSelectItem}
            createBudgetLineButtonRef={picker.createBudgetLineButtonRef}
            onSelectBudgetLine={handleSelectBudgetLine}
            onCreateNewBudgetLine={handleQueueNewBudgetLine}
            onBackToStep1={() =>
              picker.setPickerState((prev) => ({
                ...prev,
                step: 1,
                budgetLines: [],
                isLoading: false,
              }))
            }
            onFormChange={(updates) =>
              picker.setPickerState((prev) => ({
                ...prev,
                createForm: prev.createForm ? { ...prev.createForm, ...updates } : prev.createForm,
              }))
            }
            onCancelCreateForm={() => {
              picker.setPickerState((prev) => ({
                ...prev,
                showCreateForm: false,
                createForm: undefined,
                createError: null,
              }));
              setTimeout(() => {
                picker.createBudgetLineButtonRef.current?.focus();
              }, 0);
            }}
            onCreateBudgetLine={(e) => picker.handleCreateBudgetLine(e)}
            t={t}
            tSettings={tSettings}
            formatCurrency={formatCurrency}
          />
        </Modal>
      )}

      {/* Cancel confirmation modal */}
      {showCancelConfirm && (
        <Modal
          title={t('autoItemize.cancelConfirmTitle')}
          onClose={() => setShowCancelConfirm(false)}
        >
          <p>{t('autoItemize.cancelConfirmBody')}</p>
          <div className={styles.modalActions}>
            <button type="button" className={sharedStyles.btnPrimary} onClick={handleConfirmCancel}>
              {t('autoItemize.discardChanges')}
            </button>
            <button
              type="button"
              className={sharedStyles.btnSecondary}
              onClick={() => setShowCancelConfirm(false)}
            >
              {t('autoItemize.keepEditing')}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
