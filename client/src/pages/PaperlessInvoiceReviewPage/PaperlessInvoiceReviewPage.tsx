import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  ExtractedLine,
  PaperlessDocumentSearchResult,
  CreateInvoiceRequest,
  ConfidenceLevel,
  WorkItemBudgetLine,
  HouseholdItemBudgetLine,
} from '@cornerstone/shared';
import type { BadgeVariantMap } from '../../components/Badge/Badge.js';
import { getPaperlessDocument, getDocumentPreviewUrl, getPaperlessStatus } from '../../lib/paperlessApi.js';
import { previewAutoItemize, commitAutoItemizeCreate } from '../../lib/invoiceAutoItemizeApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { useBudgetLinePicker } from '../../hooks/useBudgetLinePicker.js';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import { Modal } from '../../components/Modal/Modal.js';
import { Spinner } from '../../components/Spinner/Spinner.js';
import { FormError } from '../../components/FormError/FormError.js';
import { SuggestionBadge } from '../../components/SuggestionBadge/SuggestionBadge.js';
import { SearchPicker } from '../../components/SearchPicker/SearchPicker.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import { AutoItemizeLineList, BudgetLinePickerModal, type LineWithInclude } from '../../components/autoItemize/index.js';
import { effectiveLineAmount } from '../../lib/budgetConstants.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './PaperlessInvoiceReviewPage.module.css';

type PageStatus = 'loading' | 'error' | 'ready' | 'saving';

interface MetadataEdits {
  invoiceNumber: string | null;
  amount: string;
  date: string;
  dueDate: string | null;
  notes: string | null;
}

interface LocationState {
  documentId: number;
  documentTitle: string;
}

export function PaperlessInvoiceReviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { t: tSettings } = useTranslation('settings');
  const { formatCurrency } = useFormatters();

  const state = (location.state || {}) as LocationState;
  const documentId = state.documentId;

  // Badge variants
  const createdFromExtractionVariants = useMemo(
    (): BadgeVariantMap => ({
      true: {
        label: t('autoItemize.createdFromAutoItemization'),
        className: badgeStyles.info,
      },
    }),
    [t],
  );

  // Page state
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [document, setDocument] = useState<PaperlessDocumentSearchResult | null>(null);
  const [lines, setLines] = useState<LineWithInclude[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);

  // Metadata edits (date initialized in effect)
  const [metadataEdits, setMetadataEdits] = useState<MetadataEdits>({
    invoiceNumber: null,
    amount: '',
    date: '',
    dueDate: null,
    notes: null,
  });

  // Vendor selection
  const [vendorId, setVendorId] = useState<string>('');
  const [suggestedVendorId, setSuggestedVendorId] = useState<string | null>(null);
  const [suggestedVendorName, setSuggestedVendorName] = useState<string | null>(null);
  const [vendorError, setVendorError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);

  // PDF preview state
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [paperlessStatus, setPaperlessStatus] = useState<Awaited<
    ReturnType<typeof getPaperlessStatus>
  > | null>(null);

  // Dirty state tracking
  const wasCreatedFromExtractionRef = useRef(false);

  // Budget line picker state
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const picker = useBudgetLinePicker({
    invoiceId: '',
    invoiceAmount: parseFloat(metadataEdits.amount) || 0,
    eagerLinkInvoice: false,
    onLineCreated: (line, _invoiceBudgetLineId) => {
      if (!activeRowId) return;
      const lineType = 'workItemId' in line ? 'work_item' : 'household_item';
      const fromExtraction = wasCreatedFromExtractionRef.current;
      wasCreatedFromExtractionRef.current = false;
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
      picker.closePicker();
      setActiveRowId(null);
    },
  });

  // Initialize static data on mount
  useEffect(() => {
    picker.initializeStaticData();
    // eslint-disable-next-line @eslint-react/exhaustive-deps
  }, []);

  // Load vendors on mount
  useEffect(() => {
    void fetchVendors({ pageSize: 100 }).then((res) =>
      setVendors(res.vendors.map((v) => ({ id: v.id, name: v.name }))),
    );
  }, []);

  // Load document and run preview on mount
  useEffect(() => {
    if (!documentId) return;

    const loadData = async () => {
      setPageStatus('loading');
      setPageError(null);
      setPdfLoaded(false);
      setPdfFailed(false);

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

        // Fetch document
        const docResponse = await getPaperlessDocument(documentId);
        setDocument({
          ...docResponse.document,
          searchHit: null,
        });

        // Initialize metadata edits with default values
        setMetadataEdits({
          invoiceNumber: null,
          amount: '',
          date: new Date().toISOString().split('T')[0] ?? '',
          dueDate: null,
          notes: null,
        });

        // Run preview auto-itemize
        const previewResult = await previewAutoItemize({
          paperlessDocumentId: documentId,
        });

        const linesWithInclude: LineWithInclude[] = previewResult.lines.map((line, idx) => ({
          ...line,
          included: true,
          rowId: `row-${idx}-${Math.random().toString(36).slice(2, 9)}`,
          budgetCategoryId: line.budgetCategoryId ?? null,
          budgetSourceId: line.budgetSourceId ?? picker.pickerState.budgetSources?.[0]?.id ?? null,
        }));

        setLines(linesWithInclude);

        // Set suggested vendor ID if available (name resolution deferred to separate effect)
        if (previewResult.suggestedVendorId) {
          setSuggestedVendorId(previewResult.suggestedVendorId);
          setVendorId(previewResult.suggestedVendorId);
        }

        // Compute total from extracted line amounts (accounting for VAT-gross-up on net lines)
        const computedTotal = linesWithInclude.reduce((sum, line) => {
          return (
            sum +
            effectiveLineAmount({ amount: line.totalAmount ?? 0, includesVat: line.includesVat })
          );
        }, 0);

        // Initialize metadata from extraction
        setMetadataEdits({
          invoiceNumber: previewResult.extractedInvoiceNumber ?? null,
          amount: computedTotal > 0 ? String(computedTotal) : '',
          date: previewResult.extractedInvoiceDate ?? new Date().toISOString().split('T')[0] ?? '',
          dueDate: previewResult.extractedDueDate ?? null,
          notes: previewResult.extractedNotes ?? null,
        });

        setPageStatus('ready');
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
    // eslint-disable-next-line @eslint-react/exhaustive-deps
  }, [documentId, t, tErrors]);

  // Back-fill suggested vendor name from loaded vendors
  useEffect(() => {
    if (suggestedVendorId && vendors.length > 0 && !suggestedVendorName) {
      const match = vendors.find((v) => v.id === suggestedVendorId);
      if (match) setSuggestedVendorName(match.name);
    }
  }, [vendors, suggestedVendorId, suggestedVendorName]);

  const handleCancel = useCallback(() => {
    navigate('/budget/invoices');
  }, [navigate]);

  const handleSave = useCallback(async () => {
    if (!documentId || !document) return;

    // Vendor validation — inline field error (not silent)
    if (!vendorId) {
      setVendorError(t('autoItemize.vendorRequired'));
      return;
    }

    setPageStatus('saving');
    setVendorError(null);
    setPageError(null);

    try {
      const includedLines = lines.filter((l) => l.included);

      // Validate that all included lines with create-new mode have a category
      const missingCategories = includedLines.filter(
        (l) => !l.assignedBudgetLineId && !l.budgetCategoryId,
      );
      if (missingCategories.length > 0) {
        setPageError(t('autoItemize.categoryRequiredError'));
        setPageStatus('ready');
        return;
      }

      // Build invoice creation request
      const invoice: CreateInvoiceRequest = {
        invoiceNumber: metadataEdits.invoiceNumber ?? null,
        amount: parseFloat(metadataEdits.amount) || 0,
        date: metadataEdits.date,
        dueDate: metadataEdits.dueDate ?? null,
        status: 'pending',
        notes: metadataEdits.notes ?? null,
      };

      // Map lines to payload
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

      // Commit the invoice creation
      const result = await commitAutoItemizeCreate({
        paperlessDocumentId: documentId,
        vendorId,
        invoice,
        lines: linesPayload,
      });

      // Navigate to the created invoice
      navigate(`/budget/invoices/${result.invoice.id}`);
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
  }, [documentId, document, vendorId, lines, metadataEdits, navigate, t, tErrors]);

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
          };
        }),
      );
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
    const vendors_list = picker.pickerState.vendors ?? [];
    const vendorIdForLine = row.vendorName
      ? (vendors_list.find((v) => v.name.toLowerCase() === row.vendorName!.toLowerCase())?.id ??
        null)
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
      vendorId: vendorIdForLine ?? '',
      pricingMode: row.quantity != null && row.unitPrice != null ? 'unit' : 'direct',
      quantity: row.quantity != null ? String(row.quantity) : '',
      unit: row.unit ?? '',
      unitPrice: row.unitPrice != null ? String(row.unitPrice) : '',
      includesVat: row.includesVat !== false,
    };

    wasCreatedFromExtractionRef.current = true;
    void picker.showCreateBudgetLineForm(prefill);
  }, [activeRowId, lines, picker]);

  // Compute totals and variance (must be before any early returns for React rules)
  const computedTotal = useMemo(
    () =>
      lines
        .filter((l) => l.included)
        .reduce(
          (sum, l) =>
            sum + effectiveLineAmount({ amount: l.totalAmount ?? 0, includesVat: l.includesVat }),
          0,
        ),
    [lines],
  );

  const { variance, variancePercent } = useMemo(() => {
    const inv = parseFloat(metadataEdits.amount) || 0;
    const v = computedTotal - inv;
    return {
      variance: v,
      variancePercent: inv > 0 ? Math.abs(v) / inv : 0,
    };
  }, [computedTotal, metadataEdits.amount]);

  // Guard for missing documentId
  if (!documentId) {
    return <div>{t('autoItemize.error')}</div>;
  }

  // Render loading state
  if (pageStatus === 'loading') {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <div>
            <button
              type="button"
              className={sharedStyles.btnSecondary}
              onClick={handleCancel}
              disabled
            >
              {t('autoItemize.cancel')}
            </button>
          </div>
          <h1 className={styles.pageTitle}>{t('autoItemize.extractionStarted')}</h1>
        </div>
        <div className={styles.loadingState}>
          <Spinner size="lg" />
          <h2 className={styles.loadingMessage}>{t('autoItemize.extractingFromDocument')}</h2>
        </div>
      </div>
    );
  }

  // Render error state
  if (pageStatus === 'error' || !document) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <div>
            <button type="button" className={sharedStyles.btnSecondary} onClick={handleCancel}>
              {t('autoItemize.cancel')}
            </button>
          </div>
          <h1 className={styles.pageTitle}>{t('autoItemize.error')}</h1>
        </div>
        <div className={styles.errorState}>
          <FormError
            variant="banner"
            message={pageError || t('autoItemize.loadError')}
          />
          <button type="button" className={sharedStyles.btnPrimary} onClick={handleCancel}>
            {t('autoItemize.backToInvoices')}
          </button>
        </div>
      </div>
    );
  }

  // Ready state - render review form
  return (
    <>
      <div className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <div>
            <Link to="/budget/invoices" className={styles.breadcrumb}>
              {t('autoItemize.backToInvoices')}
            </Link>
          </div>
          <h1 className={styles.pageTitle}>{t('autoItemize.extractionComplete')}</h1>
        </div>

        <div className={styles.pageBody}>
          {/* Form column */}
          <div
            id="itemize-form"
            className={styles.formColumn}
            aria-busy={pageStatus === 'saving'}
          >
            <a href="#itemize-form" className={styles.skipLink}>
              {t('autoItemize.skipToForm')}
            </a>

            {/* Page-level error banner */}
            {pageError && <FormError variant="banner" message={pageError} />}

            {/* Vendor card */}
            <div className={styles.vendorCard}>
              <h2 className={styles.sectionTitle}>{t('autoItemize.vendor')}</h2>
              <div className={styles.fieldRow}>
                <label htmlFor="vendor-picker" className={styles.vendorLabel}>
                  {t('autoItemize.vendor')}
                  <span aria-hidden="true" className={styles.required}>*</span>
                  <span className={sharedStyles.srOnly}>{t('common.required')}</span>
                </label>
                <SearchPicker
                  id="vendor-picker"
                  value={vendorId}
                  onChange={(id) => {
                    setVendorId(id);
                    setVendorError(null);
                  }}
                  excludeIds={[]}
                  searchFn={async (query) =>
                    vendors.filter((v) => v.name.toLowerCase().includes(query.toLowerCase()))
                  }
                  renderItem={(vendor) => ({ id: vendor.id, label: vendor.name })}
                  placeholder={t('autoItemize.vendorPlaceholder')}
                  initialTitle={suggestedVendorName ?? undefined}
                  aria-required="true"
                  aria-invalid={vendorError ? 'true' : undefined}
                  aria-describedby={vendorError ? 'vendor-error' : undefined}
                />
                {vendorError && (
                  <div id="vendor-error">
                    <FormError variant="field" message={vendorError} />
                  </div>
                )}
                {suggestedVendorId && vendorId === suggestedVendorId && (
                  <div className={styles.suggestionRow}>
                    <SuggestionBadge
                      suggestedValue={suggestedVendorId}
                      fieldLabel={t('autoItemize.vendor')}
                      displayValue={suggestedVendorName ?? suggestedVendorId}
                      onApply={() => setVendorId(suggestedVendorId)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Metadata card — invoice number, amount, date, due-date, notes */}
            <div className={styles.metadataCard}>
              <h2 className={styles.sectionTitle}>{t('autoItemize.invoiceMetadata')}</h2>
              {/* Invoice Number */}
              <div className={styles.fieldRow}>
                <label htmlFor="invoice-number" className={styles.label}>
                  {t('autoItemize.invoiceNumber')}
                </label>
                <div className={styles.fieldControl}>
                  <input
                    id="invoice-number"
                    type="text"
                    value={metadataEdits.invoiceNumber ?? ''}
                    onChange={(e) =>
                      setMetadataEdits((prev) => ({ ...prev, invoiceNumber: e.target.value || null }))
                    }
                    placeholder={t('autoItemize.invoiceNumberPlaceholder')}
                  />
                </div>
              </div>
              {/* Amount */}
              <div className={styles.fieldRow}>
                <label htmlFor="amount" className={styles.label}>
                  {t('autoItemize.amount')}
                </label>
                <div className={styles.fieldControl}>
                  <input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={metadataEdits.amount}
                    onChange={(e) =>
                      setMetadataEdits((prev) => ({ ...prev, amount: e.target.value }))
                    }
                    placeholder="0.00"
                  />
                </div>
              </div>
              {/* Date */}
              <div className={styles.fieldRow}>
                <label htmlFor="date" className={styles.label}>
                  {t('autoItemize.date')}
                </label>
                <div className={styles.fieldControl}>
                  <input
                    id="date"
                    type="date"
                    value={metadataEdits.date}
                    onChange={(e) => setMetadataEdits((prev) => ({ ...prev, date: e.target.value }))}
                  />
                </div>
              </div>
              {/* Due Date */}
              <div className={styles.fieldRow}>
                <label htmlFor="due-date" className={styles.label}>
                  {t('autoItemize.dueDate')}
                </label>
                <div className={styles.fieldControl}>
                  <input
                    id="due-date"
                    type="date"
                    value={metadataEdits.dueDate ?? ''}
                    onChange={(e) =>
                      setMetadataEdits((prev) => ({ ...prev, dueDate: e.target.value || null }))
                    }
                  />
                </div>
              </div>
              {/* Notes */}
              <div className={styles.fieldRow}>
                <label htmlFor="notes" className={styles.label}>
                  {t('autoItemize.notes')}
                </label>
                <div className={styles.fieldControl}>
                  <textarea
                    id="notes"
                    value={metadataEdits.notes ?? ''}
                    onChange={(e) =>
                      setMetadataEdits((prev) => ({ ...prev, notes: e.target.value || null }))
                    }
                    placeholder={t('autoItemize.notesPlaceholder')}
                    rows={3}
                  />
                </div>
              </div>
            </div>

            {/* Line items — shared component */}
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
                        }
                      : l,
                  ),
                );
              }}
              categories={picker.pickerState.categories ?? []}
              budgetSources={picker.pickerState.budgetSources ?? []}
              discretionarySourceId={
                (picker.pickerState.budgetSources ?? []).find((s) => s.isDiscretionary)?.id
              }
              computedTotal={computedTotal}
              variance={variance}
              variancePercent={variancePercent}
              createdFromExtractionVariants={createdFromExtractionVariants}
              formatCurrency={formatCurrency}
              t={t}
              tSettings={tSettings}
            />

            {/* Actions — inline in form column, no sticky bar */}
            <div className={styles.actions}>
              <button
                type="button"
                className={sharedStyles.btnPrimary}
                onClick={() => void handleSave()}
                disabled={pageStatus === 'saving'}
              >
                {pageStatus === 'saving' ? t('autoItemize.saving') : t('autoItemize.createAndItemize')}
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

          {/* Preview column */}
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
                  src={getDocumentPreviewUrl(documentId)}
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
                <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none"
                  stroke="var(--color-text-muted)" strokeWidth="1.5">
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
            onCreateNewBudgetLine={handleCreateNewBudgetLine}
            onBackToStep1={() =>
              picker.setPickerState((prev) => ({ ...prev, step: 1, budgetLines: [], isLoading: false }))
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
    </>
  );
}

export default PaperlessInvoiceReviewPage;
