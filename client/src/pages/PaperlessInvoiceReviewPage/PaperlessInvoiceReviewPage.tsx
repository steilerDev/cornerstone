import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  ExtractedLine,
  PaperlessDocumentSearchResult,
  CreateInvoiceRequest,
  ConfidenceLevel,
} from '@cornerstone/shared';
import type { BadgeVariantMap } from '../../components/Badge/Badge.js';
import {
  getPaperlessDocument,
  getPaperlessStatus,
} from '../../lib/paperlessApi.js';
import { previewAutoItemize, commitAutoItemizeCreate } from '../../lib/invoiceAutoItemizeApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
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

  // Metadata edits
  const [metadataEdits, setMetadataEdits] = useState<MetadataEdits>({
    invoiceNumber: null,
    amount: '',
    date: new Date().toISOString().split('T')[0],
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
  const [lineFieldsEdited, setLineFieldsEdited] = useState(false);
  const wasCreatedFromExtraction = useRef(false);

  // Budget line picker state
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const picker = useBudgetLinePicker({
    invoiceId: '',
    invoiceAmount: parseFloat(metadataEdits.amount) || 0,
    eagerLinkInvoice: false,
    onLineCreated: (line, _invoiceBudgetLineId) => {
      if (!activeRowId) return;
      const lineType = 'workItemId' in line ? 'work_item' : 'household_item';
      const fromExtraction = wasCreatedFromExtraction.current;
      wasCreatedFromExtraction.current = false;
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

  // Initialize static data on mount
  useEffect(() => {
    picker.initializeStaticData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setLineFieldsEdited(false);

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
          date: new Date().toISOString().split('T')[0],
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

        // Set suggested vendor if available
        if (previewResult.suggestedVendorId) {
          setSuggestedVendorId(previewResult.suggestedVendorId);
          // Look up vendor name from loaded vendors or use ID as fallback
          const vendorName =
            vendors.find((v) => v.id === previewResult.suggestedVendorId)?.name ||
            previewResult.suggestedVendorId;
          setSuggestedVendorName(vendorName);
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
          date: previewResult.extractedInvoiceDate ?? new Date().toISOString().split('T')[0],
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
  }, [documentId, t, tErrors, vendors, picker.pickerState.budgetSources]);

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
                  <SuggestionBadge label="LLM" />
                </div>
              )}
            </div>
          </div>

          {/* Budget line items (from extraction) */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>{t('autoItemize.lineItems')}</h3>
            {lines.length === 0 ? (
              <p className={styles.emptyMessage}>{t('autoItemize.noLineItems')}</p>
            ) : (
              <div className={styles.linesList}>
                {lines.map((line) => (
                  <div
                    key={line.rowId}
                    className={`${styles.lineItem} ${!line.included ? styles.lineItemExcluded : ''}`}
                  >
                    <BudgetLineForm
                      line={line}
                      isIncluded={line.included}
                      onToggleInclude={() => handleLineToggle(line.rowId)}
                      onFieldChange={(field, value) =>
                        handleLineFieldChange(line.rowId, field, value)
                      }
                      onAssign={() => handleAssignButtonClick(line.rowId)}
                      picker={picker}
                      confidence={CONFIDENCE_LABELS[line.confidence] || line.confidence}
                      createdFromExtractionVariants={createdFromExtractionVariants}
                    />
                  </div>
                ))}
              </div>
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
  );
}

export default PaperlessInvoiceReviewPage;
