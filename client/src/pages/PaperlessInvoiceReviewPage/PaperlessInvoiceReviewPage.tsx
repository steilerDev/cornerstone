import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import { getPaperlessDocument } from '../../lib/paperlessApi.js';
import { previewAutoItemize, commitAutoItemizeCreate } from '../../lib/invoiceAutoItemizeApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { useBudgetLinePicker } from '../../hooks/useBudgetLinePicker.js';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { Modal } from '../../components/Modal/Modal.js';
import { Spinner } from '../../components/Spinner/Spinner.js';
import { FormError } from '../../components/FormError/FormError.js';
import { SuggestionBadge } from '../../components/SuggestionBadge/SuggestionBadge.js';
import { SearchPicker } from '../../components/SearchPicker/SearchPicker.js';
import { Badge } from '../../components/Badge/Badge.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import { ParentPicker } from '../../components/ParentPicker/ParentPicker.js';
import { BudgetLineForm } from '../../components/budget/BudgetLineForm.js';
import { CONFIDENCE_LABELS, effectiveLineAmount } from '../../lib/budgetConstants.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './PaperlessInvoiceReviewPage.module.css';

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

      try {
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
          return sum + effectiveLineAmount({ amount: line.totalAmount ?? 0, includesVat: line.includesVat });
        }, 0);

        // Initialize metadata from extraction
        setMetadataEdits({
          invoiceNumber: previewResult.extractedInvoiceNumber ?? null,
          amount: computedTotal > 0 ? String(computedTotal) : '',
          date: previewResult.extractedInvoiceDate ?? (new Date().toISOString().split('T')[0] ?? ''),
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
    if (!documentId || !vendorId || !document) {
      if (!vendorId) {
        setVendorError(t('autoItemize.vendorRequired'));
      }
      return;
    }

    setPageStatus('saving');
    setVendorError(null);

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
  }, [documentId, vendorId, document, lines, metadataEdits, navigate, t, tErrors]);

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
      ? (vendors_list.find((v) => v.name.toLowerCase() === row.vendorName!.toLowerCase())?.id ?? null)
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

  // Guard for missing documentId
  if (!documentId) {
    return <div>{t('autoItemize.error')}</div>;
  }

  // Render loading state
  if (pageStatus === 'loading') {
    return (
      <PageLayout
        title={t('autoItemize.extractionStarted')}
        action={
          <button
            type="button"
            className={sharedStyles.btnSecondary}
            onClick={handleCancel}
            disabled
          >
            {t('autoItemize.cancel')}
          </button>
        }
      >
        <div className={styles.pageContainer}>
          <div className={styles.loadingState}>
            <Spinner />
            <h2 className={styles.loadingMessage}>{t('autoItemize.extractingFromDocument')}</h2>
          </div>
        </div>
      </PageLayout>
    );
  }

  // Render error state
  if (pageStatus === 'error' || !document) {
    return (
      <PageLayout
        title={t('autoItemize.error')}
        action={
          <button
            type="button"
            className={sharedStyles.btnSecondary}
            onClick={handleCancel}
          >
            {t('autoItemize.cancel')}
          </button>
        }
      >
        <div className={styles.pageContainer}>
          <div className={styles.errorState} role="alert">
            <p className={styles.errorText}>{pageError || t('autoItemize.loadError')}</p>
            <button
              type="button"
              className={sharedStyles.btnPrimary}
              onClick={handleCancel}
            >
              {t('autoItemize.backToInvoices')}
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  // Ready state - render review form
  return (
    <>
    <PageLayout
      title={t('autoItemize.extractionComplete')}
      action={
        <button
          type="button"
          className={sharedStyles.btnSecondary}
          onClick={handleCancel}
          disabled={pageStatus === 'saving'}
        >
          {t('autoItemize.cancel')}
        </button>
      }
    >
      <div className={styles.pageContainer}>
        <div className={styles.mainColumn}>
          {/* Vendor selection (new for Paperless flow) */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>{t('autoItemize.vendor')}</h3>

            {vendorError && <FormError message={vendorError} />}

            <div className={styles.field}>
              <label htmlFor="vendor-picker" className={styles.label}>
                {t('autoItemize.vendor')}{' '}
                <span className={styles.required}>*</span>
              </label>
              <SearchPicker
                id="vendor-picker"
                value={vendorId}
                onChange={setVendorId}
                excludeIds={[]}
                searchFn={async (query) => {
                  return vendors.filter((v) =>
                    v.name.toLowerCase().includes(query.toLowerCase()),
                  );
                }}
                renderItem={(vendor) => ({
                  id: vendor.id,
                  label: vendor.name,
                })}
                placeholder={t('autoItemize.vendorPlaceholder')}
                initialTitle={suggestedVendorName ?? undefined}
              />
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

          {/* Budget line items (from extraction) */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>{t('autoItemize.extractedLines')}</h3>
            {lines.length === 0 ? (
              <p className={styles.emptyMessage}>{t('autoItemize.noLineItems')}</p>
            ) : (
              <ul
                role="list"
                className={styles.lineList}
                aria-label={t('autoItemize.lineItemsListLabel')}
              >
                {lines.map((line) => {
                  const pct = Math.round(line.confidence * 100);
                  const confidenceLevel =
                    line.confidence >= 0.85
                      ? 'high'
                      : line.confidence >= 0.6
                        ? 'medium'
                        : 'low';

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
                          data-confidence={confidenceLevel}
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
            )}
          </div>
        </div>

        {/* Save button */}
        <div className={styles.actionBar}>
          <button
            type="button"
            className={sharedStyles.btnPrimary}
            onClick={handleSave}
            disabled={pageStatus === 'saving' || !vendorId}
          >
            {pageStatus === 'saving' ? t('autoItemize.saving') : t('autoItemize.createAndItemize')}
          </button>
        </div>
      </div>
    </PageLayout>

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
  </>
  );
}

export default PaperlessInvoiceReviewPage;
