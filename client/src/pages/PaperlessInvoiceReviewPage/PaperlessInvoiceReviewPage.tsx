import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../contexts/LocaleContext.js';
import { INVOICE_STATUSES } from '@cornerstone/shared';
import type {
  PaperlessDocumentSearchResult,
  CreateInvoiceRequest,
  Vendor,
  InvoiceStatus,
} from '@cornerstone/shared';
import { createWorkItemBudget } from '../../lib/workItemBudgetsApi.js';
import { createHouseholdItemBudget } from '../../lib/householdItemBudgetsApi.js';
import {
  applyBudgetSourceToNewLines,
  buildCommitLines,
  effectiveRowAmount,
  isNewBudgetLineRow,
  materializeInlineDrafts,
  mergeMaterializedLines,
} from '../../lib/autoItemizeDraftUtils.js';
import type { BadgeVariantMap } from '../../components/Badge/Badge.js';
import { getPaperlessDocument, getPaperlessStatus } from '../../lib/paperlessApi.js';
import { previewAutoItemize, commitAutoItemizeCreate } from '../../lib/invoiceAutoItemizeApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { useAutoItemizeLines } from '../../hooks/useAutoItemizeLines.js';
import { Modal } from '../../components/Modal/Modal.js';
import { VendorCreateModal } from '../../components/VendorCreateModal/VendorCreateModal.js';
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
  status: InvoiceStatus;
}

/** Positive integer document id from `?documentId=`, else null. */
function parseDocumentId(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function PaperlessInvoiceReviewPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { t: tSettings } = useTranslation('settings');
  const { vatRate } = useLocale();
  const vatRateRef = useRef(vatRate);
  vatRateRef.current = vatRate;
  const { formatCurrency } = useFormatters();

  const [searchParams] = useSearchParams();
  const documentId = parseDocumentId(searchParams.get('documentId'));

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
    status: 'pending',
  });

  // Vendor selection
  const [vendorId, setVendorId] = useState<string>('');
  const [suggestedVendorId, setSuggestedVendorId] = useState<string | null>(null);
  const [suggestedVendorName, setSuggestedVendorName] = useState<string | null>(null);
  const [vendorError, setVendorError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);

  const [announceMessage, setAnnounceMessage] = useState('');
  const [defaultBudgetSourceId, setDefaultBudgetSourceId] = useState('');
  const [extractedVendorName, setExtractedVendorName] = useState<string | null>(null);
  const [vendorCreate, setVendorCreate] = useState<{ initialName: string } | null>(null);
  const createResolverRef = useRef<((v: { id: string; name: string } | null) => void) | null>(null);

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
    defaultBudgetSourceId: defaultBudgetSourceId || null,
  });

  const handleDefaultBudgetSourceChange = (sourceId: string) => {
    setDefaultBudgetSourceId(sourceId);
    if (!sourceId) return;
    const appliedCount = lines.filter(isNewBudgetLineRow).length;
    setLines((prev) => applyBudgetSourceToNewLines(prev, sourceId));
    if (appliedCount === 0) return;
    const name =
      (picker.pickerState.budgetSources ?? []).find((s) => s.id === sourceId)?.name ?? '';
    setAnnounceMessage(t('autoItemize.budgetSourceApplied', { count: appliedCount, name }));
  };

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
    if (documentId === null) return;

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

        setExtractedVendorName(previewResult.extractedVendorName ?? null);

        if (previewResult.suggestedVendorId) {
          setSuggestedVendorId(previewResult.suggestedVendorId);
          setVendorId(previewResult.suggestedVendorId);
        }

        // Compute total from extracted line amounts (accounting for VAT gross-up on net lines)
        const computedTotal = linesWithInclude.reduce(
          (sum, line) =>
            sum +
            effectiveLineAmount(
              { amount: line.totalAmount ?? 0, includesVat: line.includesVat },
              vatRateRef.current,
            ),
          0,
        );

        setMetadataEdits((prev) => ({
          ...prev,
          invoiceNumber: previewResult.extractedInvoiceNumber ?? null,
          amount: computedTotal > 0 ? String(computedTotal) : '',
          date: previewResult.extractedInvoiceDate ?? new Date().toISOString().split('T')[0] ?? '',
          dueDate: previewResult.extractedDueDate ?? null,
          notes: previewResult.extractedNotes ?? null,
        }));

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

  const settleCreate = (v: { id: string; name: string } | null) => {
    const resolve = createResolverRef.current;
    createResolverRef.current = null;
    resolve?.(v);
  };

  const handleRequestCreateVendor = (query: string) =>
    new Promise<{ id: string; name: string } | null>((resolve) => {
      createResolverRef.current = resolve;
      setVendorCreate({ initialName: extractedVendorName ?? query });
    });

  const handleVendorCreated = (vendor: Vendor) => {
    const option = { id: vendor.id, name: vendor.name };
    setVendors((prev) => [...prev, option]);
    setVendorCreate(null);
    setAnnounceMessage(t('autoItemize.vendorCreatedAnnounce', { name: vendor.name }));
    settleCreate(option);
  };

  const handleVendorCreateClose = () => {
    setVendorCreate(null);
    settleCreate(null);
  };

  const handleSave = useCallback(async () => {
    if (documentId === null || !document) return;

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
        setLines((prev) => mergeMaterializedLines(prev, materialized.lines));
        setPageError(materialized.error);
        setPageStatus('ready');
        return;
      }

      setLines((prev) => mergeMaterializedLines(prev, materialized.lines));
      const workingLines = materialized.lines;

      const invoice: CreateInvoiceRequest = {
        invoiceNumber: metadataEdits.invoiceNumber ?? null,
        amount: parseFloat(metadataEdits.amount) || 0,
        date: metadataEdits.date,
        dueDate: metadataEdits.dueDate ?? null,
        status: metadataEdits.status,
        notes: metadataEdits.notes ?? null,
      };

      const linesPayload = buildCommitLines(workingLines, vatRate);

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
  }, [
    documentId,
    document,
    vendorId,
    lines,
    metadataEdits,
    navigate,
    setLines,
    t,
    tErrors,
    vatRate,
  ]);

  // Compute totals and variance (must be before any early returns for React rules)
  const computedTotal = useMemo(
    () =>
      lines.filter((l) => l.included).reduce((sum, l) => sum + effectiveRowAmount(l, vatRate), 0),
    [lines, vatRate],
  );

  const { variance, variancePercent } = useMemo(() => {
    const inv = parseFloat(metadataEdits.amount) || 0;
    const v = computedTotal - inv;
    return {
      variance: v,
      variancePercent: inv > 0 ? Math.abs(v) / inv : 0,
    };
  }, [computedTotal, metadataEdits.amount]);

  const missingDocument = documentId === null;

  const isSaving = pageStatus === 'saving';

  if (!missingDocument && pageStatus === 'loading') {
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

  if (documentId === null || pageStatus === 'error' || !document) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <div>
            <button type="button" className={sharedStyles.btnSecondary} onClick={handleCancel}>
              {t('autoItemize.cancel')}
            </button>
          </div>
          <h1 className={styles.pageTitle}>
            {missingDocument ? t('autoItemize.missingDocumentTitle') : t('autoItemize.error')}
          </h1>
        </div>
        <div className={styles.errorState}>
          <FormError
            variant="banner"
            message={
              missingDocument
                ? t('autoItemize.missingDocument')
                : pageError || t('autoItemize.loadError')
            }
          />
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
          <div id="itemize-form" className={styles.formColumn} aria-busy={isSaving}>
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
                  inputAriaProps={{
                    'aria-required': true,
                    'aria-invalid': vendorError ? true : undefined,
                    'aria-describedby': vendorError ? 'vendor-error' : undefined,
                  }}
                  createAction={{
                    getLabel: (q) =>
                      q
                        ? t('autoItemize.addNewVendorNamed', { name: q })
                        : t('autoItemize.addNewVendor'),
                    onCreate: handleRequestCreateVendor,
                  }}
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
                <label htmlFor="invoice-number">{t('autoItemize.invoiceNumber')}</label>
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
                    disabled={isSaving}
                  />
                </div>
              </div>
              <div className={styles.fieldRow}>
                <label htmlFor="amount">{t('autoItemize.amount')}</label>
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
                    disabled={isSaving}
                  />
                </div>
              </div>
              <div className={styles.fieldRow}>
                <label htmlFor="date">{t('autoItemize.date')}</label>
                <div className={styles.fieldControl}>
                  <input
                    id="date"
                    type="date"
                    value={metadataEdits.date}
                    disabled={isSaving}
                    onChange={(e) =>
                      setMetadataEdits((prev) => ({ ...prev, date: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className={styles.fieldRow}>
                <label htmlFor="due-date">{t('autoItemize.dueDate')}</label>
                <div className={styles.fieldControl}>
                  <input
                    id="due-date"
                    type="date"
                    value={metadataEdits.dueDate ?? ''}
                    disabled={isSaving}
                    onChange={(e) =>
                      setMetadataEdits((prev) => ({ ...prev, dueDate: e.target.value || null }))
                    }
                  />
                </div>
              </div>
              <div className={styles.fieldRow}>
                <label htmlFor="invoice-status">{t('autoItemize.status')}</label>
                <div className={styles.fieldControl}>
                  <select
                    id="invoice-status"
                    value={metadataEdits.status}
                    disabled={isSaving}
                    onChange={(e) =>
                      setMetadataEdits((prev) => ({
                        ...prev,
                        status: e.target.value as InvoiceStatus,
                      }))
                    }
                  >
                    {INVOICE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(I18N_UNION_KEYS.statusVocabularyInvoice.key(s), {
                          ns: I18N_UNION_KEYS.statusVocabularyInvoice.ns,
                        })}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.fieldRow}>
                <label htmlFor="invoice-budget-source">{t('autoItemize.budgetSource')}</label>
                <div className={styles.fieldControl}>
                  <select
                    id="invoice-budget-source"
                    value={defaultBudgetSourceId}
                    disabled={isSaving}
                    onChange={(e) => handleDefaultBudgetSourceChange(e.target.value)}
                  >
                    <option value="">{t('autoItemize.budgetSourceNone')}</option>
                    {(picker.pickerState.budgetSources ?? []).map((src) => (
                      <option key={src.id} value={src.id}>
                        {src.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.fieldRow}>
                <label htmlFor="notes">{t('autoItemize.notes')}</label>
                <div className={styles.fieldControl}>
                  <textarea
                    id="notes"
                    value={metadataEdits.notes ?? ''}
                    onChange={(e) =>
                      setMetadataEdits((prev) => ({ ...prev, notes: e.target.value || null }))
                    }
                    placeholder={t('autoItemize.notesPlaceholder')}
                    rows={3}
                    disabled={isSaving}
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
                disabled={isSaving}
              >
                {isSaving ? t('autoItemize.saving') : t('autoItemize.createAndItemize')}
              </button>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={handleCancel}
                disabled={isSaving}
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

      {vendorCreate && (
        <VendorCreateModal
          initialName={vendorCreate.initialName}
          onCreated={handleVendorCreated}
          onClose={handleVendorCreateClose}
        />
      )}

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
