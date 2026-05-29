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
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { useBudgetLinePicker } from '../../hooks/useBudgetLinePicker.js';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import { Modal } from '../../components/Modal/Modal.js';
import { Spinner } from '../../components/Spinner/Spinner.js';
import { FormError } from '../../components/FormError/FormError.js';
import { SuggestionBadge } from '../../components/SuggestionBadge/SuggestionBadge.js';
import { Badge } from '../../components/Badge/Badge.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import { ParentPicker } from '../../components/ParentPicker/ParentPicker.js';
import { BudgetLineForm } from '../../components/budget/BudgetLineForm.js';
import { CONFIDENCE_LABELS } from '../../lib/budgetConstants.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './AutoItemizePage.module.css';

type PageStatus = 'loading' | 'error' | 'ready' | 'saving';

interface LineWithInclude extends ExtractedLine {
  included: boolean;
  rowId: string;
  workItemBudgetId?: string | null;
  householdItemBudgetId?: string | null;
  assignedItemId?: string;
  assignedItemType?: 'work_item' | 'household_item';
  assignedBudgetLineId?: string;
  assignedBudgetLineType?: 'work_item' | 'household_item';
  assignedBudgetLineDescription?: string | null;
  createdFromExtraction?: boolean;
  inlineCreatedBudgetLineDraft?: BudgetLineFormState;
  budgetCategoryId?: string | null;
  budgetSourceId?: string | null;
}

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
  const wasCreatedFromExtraction = useRef(false);
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
      // Reading wasCreatedFromExtraction.current INSIDE the setLines updater causes a
      // race on WebKit: the ref is reset to false before the updater executes (React 18
      // automatic batching defers updater execution after the synchronous reset).
      const fromExtraction = wasCreatedFromExtraction.current;
      wasCreatedFromExtraction.current = false;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        setLines((prev) =>
          prev.map((l) => (l.budgetSourceId ? l : { ...l, budgetSourceId: firstSourceId })),
        );
      }
    }
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

      // Validate that all included lines with create-new mode have a category
      const missingCategories = includedLines.filter(
        (l) => !l.assignedBudgetLineId && !l.budgetCategoryId,
      );
      if (missingCategories.length > 0) {
        setPageError(t('autoItemize.categoryRequiredError'));
        setPageStatus('ready');
        return;
      }

      // Map lines to payload, including assignedBudgetLineId and assignedBudgetLineType
      // Note: vatRate is omitted from the payload (dropped from UI)
      const linesPayload: ExtractedLine[] = includedLines.map((l) => ({
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

  const handleCreateNewBudgetLine = useCallback(() => {
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

    const prefill: Partial<BudgetLineFormState> = {
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

    wasCreatedFromExtraction.current = true;
    void picker.showCreateBudgetLineForm(prefill);
  }, [activeRowId, lines, picker]);

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
    const total = lines.filter((l) => l.included).reduce((sum, l) => sum + (l.totalAmount ?? 0), 0);
    const inv = parseFloat(metadataEdits.amount) || invoice?.amount || 0;
    const v = total - inv;
    return {
      computedLineTotal: total,
      variance: v,
      variancePercent: inv > 0 ? Math.abs(v) / inv : 0,
    };
  }, [lines, metadataEdits.amount, invoice?.amount]);

  // Render variance indicator
  const renderVarianceIndicator = () => {
    if (variancePercent <= 0.01) {
      return (
        <span className={styles.varianceMatch}>
          <span aria-hidden="true">✓</span> {t('autoItemize.varianceMatch')}
        </span>
      );
    }
    if (variancePercent <= 0.05) {
      return (
        <span className={styles.varianceWarning}>
          <span aria-hidden="true">⚠</span>{' '}
          {t('autoItemize.varianceWarning', { amount: formatCurrency(Math.abs(variance)) })}
        </span>
      );
    }
    return (
      <span className={styles.varianceDanger}>
        <span aria-hidden="true">✕</span>{' '}
        {t('autoItemize.varianceDanger', { amount: formatCurrency(Math.abs(variance)) })}
      </span>
    );
  };

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

  // Hoist discretionary funding note condition computation
  const budgetSources = picker.pickerState.budgetSources ?? [];
  const discretionarySourceId = budgetSources.find((s) => s.isDiscretionary)?.id;
  const hasDiscretionaryLines =
    discretionarySourceId !== undefined &&
    lines.length > 0 &&
    lines.some((l) => l.budgetSourceId === discretionarySourceId);

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
              {hasDiscretionaryLines && (
                <p
                  role="note"
                  className={styles.discretionaryNote}
                  aria-label={t('autoItemize.discretionaryFundingNote')}
                >
                  <svg
                    className={styles.discretionaryNoteIcon}
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <circle cx="8" cy="8" r="6.5" />
                    <line x1="8" y1="5.5" x2="8" y2="5.5" strokeLinecap="round" strokeWidth="2" />
                    <line x1="8" y1="7.5" x2="8" y2="11" strokeLinecap="round" />
                  </svg>
                  <span>{t('autoItemize.discretionaryFundingNote')}</span>
                </p>
              )}
              <ul
                role="list"
                className={styles.lineList}
                aria-label={t('autoItemize.lineItemsListLabel')}
              >
                {lines.map((line) => {
                  const pct = Math.round(line.confidence * 100);
                  const confidenceColor =
                    line.confidence >= 0.85
                      ? 'var(--color-success)'
                      : line.confidence >= 0.6
                        ? 'var(--color-warning)'
                        : 'var(--color-danger)';

                  return (
                    <li
                      key={line.rowId}
                      className={`${styles.lineCard} ${!line.included ? styles.lineCardExcluded : ''}`}
                    >
                      {/* Top row: description + confidence dot */}
                      <div className={styles.cardTopRow}>
                        <textarea
                          className={styles.cardDescriptionInput}
                          value={line.description}
                          rows={2}
                          onChange={(e) =>
                            handleLineFieldChange(line.rowId, 'description', e.target.value)
                          }
                          aria-label={t('autoItemize.editDescriptionAriaLabel')}
                        />
                        <span
                          role="img"
                          className={styles.confidenceDot}
                          style={{ backgroundColor: confidenceColor }}
                          title={`${pct}%`}
                          aria-label={t('autoItemize.confidenceLabel', { pct })}
                        />
                      </div>

                      {/* Middle row: metric grid */}
                      <div className={styles.cardMetricGrid}>
                        <div className={styles.cardMetricCell}>
                          <span className={styles.cardMetricLabel}>
                            {t('autoItemize.quantity')}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            className={styles.cardMetricInput}
                            value={line.quantity ?? ''}
                            placeholder="—"
                            onChange={(e) =>
                              handleLineFieldChange(line.rowId, 'quantity', e.target.value)
                            }
                            aria-label={t('autoItemize.editQuantityAriaLabel')}
                          />
                        </div>
                        <div className={styles.cardMetricCell}>
                          <span className={styles.cardMetricLabel}>{t('autoItemize.unit')}</span>
                          <input
                            type="text"
                            className={styles.cardMetricInput}
                            value={line.unit ?? ''}
                            placeholder="—"
                            onChange={(e) =>
                              handleLineFieldChange(line.rowId, 'unit', e.target.value)
                            }
                            aria-label={t('autoItemize.editUnitAriaLabel')}
                          />
                        </div>
                        <div className={styles.cardMetricCell}>
                          <span className={styles.cardMetricLabel}>
                            {t('autoItemize.unitPrice')}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            className={styles.cardMetricInput}
                            value={line.unitPrice ?? ''}
                            placeholder="—"
                            onChange={(e) =>
                              handleLineFieldChange(line.rowId, 'unitPrice', e.target.value)
                            }
                            aria-label={t('autoItemize.editUnitPriceAriaLabel')}
                          />
                        </div>
                        <div className={styles.cardMetricCell}>
                          <span className={styles.cardMetricLabel}>{t('autoItemize.amount')}</span>
                          <input
                            type="number"
                            step="0.01"
                            className={styles.cardMetricInput}
                            value={line.totalAmount ?? 0}
                            onChange={(e) =>
                              handleLineFieldChange(line.rowId, 'totalAmount', e.target.value)
                            }
                            aria-label={t('autoItemize.editTotalAmountAriaLabel')}
                          />
                        </div>
                      </div>

                      {/* Bottom row: include + VAT + assign */}
                      <div className={styles.cardBottomRow}>
                        <label className={styles.cardIncludeLabel}>
                          <input
                            type="checkbox"
                            checked={line.included}
                            onChange={() => handleLineToggle(line.rowId)}
                          />
                          {t('autoItemize.included')}
                        </label>
                        <label className={styles.cardIncludeLabel}>
                          <input
                            type="checkbox"
                            checked={line.includesVat !== false}
                            onChange={(e) =>
                              handleLineFieldChange(line.rowId, 'includesVat', e.target.checked)
                            }
                          />
                          {t('autoItemize.includesVat')}
                        </label>

                        <div className={styles.cardAssignZone}>
                          {!line.assignedBudgetLineId && !line.inlineCreatedBudgetLineDraft ? (
                            <button
                              type="button"
                              className={`${sharedStyles.btnPrimaryCompact} ${styles.assignButtonInTable}`}
                              onClick={() => handleAssignButtonClick(line.rowId)}
                            >
                              {t('autoItemize.assignButton')}
                            </button>
                          ) : line.assignedBudgetLineId ? (
                            <div className={styles.assignedBadgeWrapper}>
                              <div className={styles.assignedBadge}>
                                <span title={line.assignedBudgetLineDescription || undefined}>
                                  {line.assignedBudgetLineDescription || t('autoItemize.assigned')}
                                </span>
                                <button
                                  type="button"
                                  className={styles.clearAssignButton}
                                  onClick={() => {
                                    setLines((prev) =>
                                      prev.map((l) =>
                                        l.rowId === line.rowId
                                          ? {
                                              ...l,
                                              assignedBudgetLineId: undefined,
                                              assignedBudgetLineType: undefined,
                                              assignedBudgetLineDescription: undefined,
                                              createdFromExtraction: undefined,
                                            }
                                          : l,
                                      ),
                                    );
                                    setLineFieldsEdited(true);
                                  }}
                                  aria-label={t('autoItemize.clearAssignmentAriaLabel')}
                                >
                                  ✕
                                </button>
                              </div>
                              {line.createdFromExtraction && (
                                <Badge
                                  variants={createdFromExtractionVariants}
                                  value="true"
                                  testId="auto-created-badge"
                                />
                              )}
                            </div>
                          ) : (
                            <div className={styles.assignedBadge}>
                              <span>{t('autoItemize.creatingNew')}</span>
                              <button
                                type="button"
                                className={styles.clearAssignButton}
                                onClick={() => {
                                  setLines((prev) =>
                                    prev.map((l) =>
                                      l.rowId === line.rowId
                                        ? { ...l, inlineCreatedBudgetLineDraft: undefined }
                                        : l,
                                    ),
                                  );
                                  setLineFieldsEdited(true);
                                }}
                                aria-label={t('autoItemize.clearAssignmentAriaLabel')}
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>

                        <div className={styles.cardBottomRowPickerRow}>
                          {/* Category picker */}
                          <div className={styles.cardMetricCell}>
                            <label
                              htmlFor={`category-${line.rowId}`}
                              className={styles.cardPickerLabel}
                            >
                              {t('autoItemize.categoryLabel')}
                            </label>
                            <select
                              id={`category-${line.rowId}`}
                              className={styles.cardMetricInput}
                              value={line.budgetCategoryId ?? ''}
                              onChange={(e) =>
                                handleLineFieldChange(
                                  line.rowId,
                                  'budgetCategoryId',
                                  e.target.value || null,
                                )
                              }
                              aria-label={t('autoItemize.categoryAriaLabel')}
                            >
                              <option value="">{t('autoItemize.categoryPlaceholder')}</option>
                              {picker.pickerState.categories?.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {getCategoryDisplayName(tSettings, cat.name, cat.translationKey)}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Funding Source picker */}
                          <div className={styles.cardMetricCell}>
                            <label
                              htmlFor={`source-${line.rowId}`}
                              className={styles.cardPickerLabel}
                            >
                              {t('autoItemize.fundingSourceLabel')}
                            </label>
                            <select
                              id={`source-${line.rowId}`}
                              className={styles.cardMetricInput}
                              value={line.budgetSourceId ?? ''}
                              onChange={(e) =>
                                handleLineFieldChange(line.rowId, 'budgetSourceId', e.target.value)
                              }
                              aria-label={t('autoItemize.fundingSourceAriaLabel')}
                            >
                              {picker.pickerState.budgetSources?.map((src) => (
                                <option key={src.id} value={src.id}>
                                  {src.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Totals card */}
              <div className={styles.totalsCard}>
                <span>{t('autoItemize.total')}</span>
                <span className={styles.totalsAmount}>{formatCurrency(computedLineTotal)}</span>
                {renderVarianceIndicator()}
              </div>
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
          <div className={styles.pickerContent}>
            {/* Step 1: Select item type and item */}
            {picker.pickerState.step === 1 && (
              <div className={styles.pickerStep}>
                <ParentPicker
                  selectedType={picker.pickerState.type ?? 'work_item'}
                  selectedId={picker.pickerState.itemId ?? null}
                  onChange={(type, id) => {
                    picker.handleSelectItem(id, type);
                  }}
                />
              </div>
            )}

            {/* Step 2: Select budget line and set itemized amounts */}
            {picker.pickerState.step === 2 && (
              <div className={styles.pickerStep}>
                {picker.pickerState.isLoading && (
                  <div className={styles.loadingState}>
                    {t('invoiceDetail.budgetLines.picker.loadingLines')}
                  </div>
                )}

                {picker.pickerState.error && (
                  <div className={styles.errorBanner} role="alert">
                    {picker.pickerState.error}
                  </div>
                )}

                {!picker.pickerState.isLoading &&
                  picker.pickerState.budgetLines.length === 0 &&
                  !picker.pickerState.error &&
                  !picker.pickerState.showCreateForm && (
                    <div className={styles.emptyState}>
                      <p>{t('invoiceDetail.budgetLines.picker.noUnlinkedLines')}</p>
                    </div>
                  )}

                {!picker.pickerState.isLoading &&
                  picker.pickerState.showCreateForm &&
                  picker.pickerState.createForm && (
                    <div className={styles.createBudgetLineForm}>
                      <fieldset className={styles.createBudgetLineFieldset}>
                        <legend className={styles.srOnly}>
                          {t('invoiceDetail.budgetLines.createFormLegend')}
                        </legend>
                        <BudgetLineForm
                          form={picker.pickerState.createForm}
                          onSubmit={(e) => picker.handleCreateBudgetLine(e)}
                          onFormChange={(updates) =>
                            picker.setPickerState((prev) => ({
                              ...prev,
                              createForm: prev.createForm
                                ? { ...prev.createForm, ...updates }
                                : prev.createForm,
                            }))
                          }
                          onCancel={() => {
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
                          error={picker.pickerState.createError ?? null}
                          isSaving={picker.pickerState.isCreatingBudgetLine ?? false}
                          isEditing={false}
                          confidenceLabels={CONFIDENCE_LABELS}
                          budgetSources={picker.pickerState.budgetSources ?? []}
                          vendors={picker.pickerState.vendors ?? []}
                          budgetCategories={
                            picker.pickerState.type === 'work_item'
                              ? (picker.pickerState.categories ?? [])
                              : undefined
                          }
                        />
                      </fieldset>
                    </div>
                  )}

                {!picker.pickerState.isLoading &&
                  picker.pickerState.budgetLines.length > 0 &&
                  !picker.pickerState.showCreateForm && (
                    <div className={styles.budgetLineList}>
                      {picker.pickerState.budgetLines.map((line) => (
                        <button
                          key={line.id}
                          type="button"
                          className={styles.pickerBudgetLineRow}
                          onClick={() => void handleSelectBudgetLine(line)}
                        >
                          <div className={styles.budgetLineInfo}>
                            <div className={styles.budgetLineDesc}>
                              {line.description ||
                                t('invoiceDetail.budgetLines.picker.unnamedBudgetLine')}
                            </div>
                            <div className={styles.budgetLineDetails}>
                              {line.budgetCategory && (
                                <span className={styles.budgetLineCategory}>
                                  {getCategoryDisplayName(
                                    tSettings,
                                    line.budgetCategory.name,
                                    line.budgetCategory.translationKey,
                                  )}
                                </span>
                              )}
                              <span className={styles.budgetLinePlanned}>
                                {t('invoiceDetail.budgetLines.picker.plannedLabel', {
                                  amount: formatCurrency(line.plannedAmount),
                                })}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                {!picker.pickerState.isLoading && !picker.pickerState.showCreateForm && (
                  <button
                    type="button"
                    ref={picker.createBudgetLineButtonRef}
                    className={styles.addButton}
                    onClick={handleCreateNewBudgetLine}
                  >
                    {t('invoiceDetail.budgetLines.picker.createLine')}
                  </button>
                )}

                <button
                  type="button"
                  className={styles.backButton}
                  onClick={() =>
                    picker.setPickerState((prev) => ({
                      ...prev,
                      step: 1,
                      budgetLines: [],
                      isLoading: false,
                    }))
                  }
                >
                  {t('invoiceDetail.budgetLines.picker.backButton')}
                </button>
              </div>
            )}
          </div>
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
