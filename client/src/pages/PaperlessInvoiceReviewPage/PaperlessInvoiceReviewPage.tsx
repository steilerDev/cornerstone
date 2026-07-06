import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  ExtractedLine,
  PaperlessDocumentSearchResult,
  CreateInvoiceRequest,
} from '@cornerstone/shared';
import { createWorkItemBudget } from '../../lib/workItemBudgetsApi.js';
import { createHouseholdItemBudget } from '../../lib/householdItemBudgetsApi.js';
import { materializeInlineDrafts } from '../../lib/autoItemizeDraftUtils.js';
import type { BadgeVariantMap } from '../../components/Badge/Badge.js';
import { getPaperlessDocument, getPaperlessStatus } from '../../lib/paperlessApi.js';
import { previewAutoItemize, commitAutoItemizeCreate } from '../../lib/invoiceAutoItemizeApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { useAutoItemizeLines } from '../../hooks/useAutoItemizeLines.js';
import { Modal } from '../../components/Modal/Modal.js';
import { Spinner } from '../../components/Spinner/Spinner.js';
import { FormError } from '../../components/FormError/FormError.js';
import { SuggestionBadge } from '../../components/SuggestionBadge/SuggestionBadge.js';
import { SearchPicker } from '../../components/SearchPicker/SearchPicker.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import {
  AutoItemizeLineList,
  AutoItemizePdfPreview,
  BudgetLinePickerModal,
  type LineWithInclude,
} from '../../components/autoItemize/index.js';
import { effectiveLineAmount, CONFIDENCE_LABELS } from '../../lib/budgetConstants.js';
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

  const createdFromExtractionVariants = useMemo(
    (): BadgeVariantMap => ({
      true: {
        label: t('autoItemize.createdFromAutoItemization'),
        className: badgeStyles.info,
      },
    }),
    [t],
  );

  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [document, setDocument] = useState<PaperlessDocumentSearchResult | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [paperlessStatus, setPaperlessStatus] = useState<Awaited<
    ReturnType<typeof getPaperlessStatus>
  > | null>(null);

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

  const [announceMessage, setAnnounceMessage] = useState('');

  const {
    lines,
    setLines,
    picker,
    handlers,
    selectedRowIds,
    onToggleSelect,
    onClearSelection,
    onMergeSelected,
    onRetryMerge,
    onUndoMerge,
  } = useAutoItemizeLines({
    invoiceId: '',
    invoiceAmount: parseFloat(metadataEdits.amount) || 0,
    document,
    documentSummary: metadataEdits.notes,
    onMergeStart: (count) => setAnnounceMessage(t('autoItemize.mergeAnnounceStart', { count })),
    onMergeSuccess: () => setAnnounceMessage(t('autoItemize.mergeAnnounceSuccess')),
  });

  // Load vendors for the SearchPicker on mount.
  useEffect(() => {
    void fetchVendors({ pageSize: 100 }).then((res) =>
      setVendors(res.vendors.map((v) => ({ id: v.id, name: v.name }))),
    );
  }, []);

  // Back-fill suggested vendor name from loaded vendors.
  useEffect(() => {
    if (suggestedVendorId && vendors.length > 0 && !suggestedVendorName) {
      const match = vendors.find((v) => v.id === suggestedVendorId);
      // eslint-disable-next-line @eslint-react/set-state-in-effect
      if (match) setSuggestedVendorName(match.name);
    }
  }, [vendors, suggestedVendorId, suggestedVendorName]);

  // Load document and run preview on mount
  useEffect(() => {
    if (!documentId) return;

    const loadData = async () => {
      setPageStatus('loading');
      setPageError(null);

      try {
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

        const docResponse = await getPaperlessDocument(documentId);
        setDocument({
          ...docResponse.document,
          searchHit: null,
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

        if (previewResult.suggestedVendorId) {
          setSuggestedVendorId(previewResult.suggestedVendorId);
          setVendorId(previewResult.suggestedVendorId);
        }

        // Compute total from extracted line amounts (accounting for VAT gross-up on net lines)
        const computedTotal = linesWithInclude.reduce(
          (sum, line) =>
            sum +
            effectiveLineAmount({ amount: line.totalAmount ?? 0, includesVat: line.includesVat }),
          0,
        );

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
          setPageError(translateApiError(err.error.code, tErrors));
        } else {
          setPageError(t('autoItemize.loadError'));
        }
        setPageStatus('error');
      }
    };

    void loadData();
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- picker.pickerState identity changes each render
  }, [documentId, t, tErrors]);

  const handleCancel = useCallback(() => {
    navigate('/budget/invoices');
  }, [navigate]);

  const handleSave = useCallback(async () => {
    if (!documentId || !document) return;

    if (!vendorId) {
      setVendorError(t('autoItemize.vendorRequired'));
      return;
    }

    setPageStatus('saving');
    setVendorError(null);
    setPageError(null);

    try {
      const includedLines = lines.filter((l) => l.included);

      // Validate categories before materialization (lines with inline draft are exempt)
      const missingCategories = includedLines.filter(
        (l) => !l.assignedBudgetLineId && !l.inlineCreatedBudgetLineDraft && !l.budgetCategoryId,
      );
      if (missingCategories.length > 0) {
        setPageError(t('autoItemize.categoryRequiredError'));
        setPageStatus('ready');
        return;
      }

      const materialized = await materializeInlineDrafts(
        includedLines,
        { workItem: createWorkItemBudget, householdItem: createHouseholdItemBudget },
        { t, tErrors },
      );

      if (!materialized.ok) {
        setPageError(materialized.error);
        setPageStatus('ready');
        return;
      }

      const workingLines = materialized.lines;

      const invoice: CreateInvoiceRequest = {
        invoiceNumber: metadataEdits.invoiceNumber ?? null,
        amount: parseFloat(metadataEdits.amount) || 0,
        date: metadataEdits.date,
        dueDate: metadataEdits.dueDate ?? null,
        status: 'pending',
        notes: metadataEdits.notes ?? null,
      };

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

      const result = await commitAutoItemizeCreate({
        paperlessDocumentId: documentId,
        vendorId,
        invoice,
        lines: linesPayload,
      });

      navigate(`/budget/invoices/${result.invoice.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setPageError(translateApiError(err.error.code, tErrors));
      } else {
        setPageError(t('autoItemize.saveError'));
      }
      setPageStatus('ready');
    }
  }, [documentId, document, vendorId, lines, metadataEdits, navigate, t, tErrors]);

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

  if (!documentId) {
    return <div>{t('autoItemize.error')}</div>;
  }

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
          <FormError variant="banner" message={pageError || t('autoItemize.loadError')} />
          <button type="button" className={sharedStyles.btnPrimary} onClick={handleCancel}>
            {t('autoItemize.backToInvoices')}
          </button>
        </div>
      </div>
    );
  }

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
          <div id="itemize-form" className={styles.formColumn} aria-busy={pageStatus === 'saving'}>
            <a href="#itemize-form" className={styles.skipLink}>
              {t('autoItemize.skipToForm')}
            </a>
            <div role="status" aria-atomic="true" className={sharedStyles.srOnly}>
              {announceMessage}
            </div>

            {pageError && <FormError variant="banner" message={pageError} />}

            {/* Vendor card */}
            <div className={styles.vendorCard}>
              <h2 className={styles.sectionTitle}>{t('autoItemize.vendor')}</h2>
              <div className={styles.fieldRow}>
                <label htmlFor="vendor-picker" className={styles.vendorLabel}>
                  {t('autoItemize.vendor')}
                  <span aria-hidden="true" className={styles.required}>
                    *
                  </span>
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

            {/* Metadata card */}
            <div className={styles.metadataCard}>
              <h2 className={styles.sectionTitle}>{t('autoItemize.invoiceMetadata')}</h2>
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
                      setMetadataEdits((prev) => ({
                        ...prev,
                        invoiceNumber: e.target.value || null,
                      }))
                    }
                    placeholder={t('autoItemize.invoiceNumberPlaceholder')}
                  />
                </div>
              </div>
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
              <div className={styles.fieldRow}>
                <label htmlFor="date" className={styles.label}>
                  {t('autoItemize.date')}
                </label>
                <div className={styles.fieldControl}>
                  <input
                    id="date"
                    type="date"
                    value={metadataEdits.date}
                    onChange={(e) =>
                      setMetadataEdits((prev) => ({ ...prev, date: e.target.value }))
                    }
                  />
                </div>
              </div>
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

            {/* Line items */}
            <AutoItemizeLineList
              lines={lines}
              onToggleInclude={handlers.onToggleInclude}
              onFieldChange={handlers.onFieldChange}
              onAssign={handlers.onAssign}
              onClearAssign={handlers.onClearAssign}
              onInlineDraftChange={handlers.onInlineDraftChange}
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
              confidenceLabels={CONFIDENCE_LABELS}
              vendors={picker.pickerState.vendors ?? []}
              budgetCategories={picker.pickerState.categories ?? []}
              t={t}
              tSettings={tSettings}
              selectedRowIds={selectedRowIds}
              onToggleSelect={onToggleSelect}
              onClearSelection={onClearSelection}
              onMergeSelected={onMergeSelected}
              onRetryMerge={onRetryMerge}
              onUndoMerge={onUndoMerge}
            />

            {/* Actions */}
            <div className={styles.actions}>
              <button
                type="button"
                className={sharedStyles.btnPrimary}
                onClick={() => void handleSave()}
                disabled={pageStatus === 'saving'}
              >
                {pageStatus === 'saving'
                  ? t('autoItemize.saving')
                  : t('autoItemize.createAndItemize')}
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
            <AutoItemizePdfPreview
              documentId={documentId}
              paperlessUrl={paperlessStatus?.paperlessUrl}
              t={t}
            />
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
            onSelectBudgetLine={handlers.onSelectBudgetLine}
            onCreateNewBudgetLine={handlers.onQueueNewBudgetLine}
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
    </>
  );
}

export default PaperlessInvoiceReviewPage;
