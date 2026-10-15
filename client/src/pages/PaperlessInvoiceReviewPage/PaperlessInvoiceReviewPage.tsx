import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../contexts/LocaleContext.js';
import { INVOICE_STATUSES, foldSearchText, routeUrl } from '@cornerstone/shared';
import type {
  PaperlessDocumentSearchResult,
  CreateInvoiceRequest,
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
import { fetchVendor, fetchVendors } from '../../lib/vendorsApi.js';
import { useCompanyCreateAction } from '../../objectForms/useCompanyCreateAction.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { forwardOriginState, originHrefOr } from '../../navigation/origin.js';
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
  const { t: tc } = useTranslation('common');
  const location = useLocation();
  const pageTitle = tc('navigation.newInvoice');
  useDocumentTitle(pageTitle);
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
  const [extractedVendorName, setExtractedVendorName] = useState<string | null>(null);
  const [suggestedVendorName, setSuggestedVendorName] = useState<string | null>(null);
  const [vendorError, setVendorError] = useState<string | null>(null);
  // Whether a company with the extracted name exists (looked up on the server); null until known.
  const [extractedMatched, setExtractedMatched] = useState<boolean | null>(null);

  const [announceMessage, setAnnounceMessage] = useState('');
  const [defaultBudgetSourceId, setDefaultBudgetSourceId] = useState('');
  const { createAction: companyCreateAction } = useCompanyCreateAction();

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

  // Look up the suggested company by id, so it is found even outside the first page of results.
  useEffect(() => {
    if (!suggestedVendorId) return;
    let cancelled = false;
    fetchVendor(suggestedVendorId)
      .then((found) => {
        if (!cancelled) setSuggestedVendorName(found.name);
      })
      .catch(() => {
        // Unknown company: the picker shows no title.
      });
    return () => {
      cancelled = true;
    };
  }, [suggestedVendorId]);

  // Ask the server whether a company with the extracted name exists (same folded matcher as the picker).
  useEffect(() => {
    if (extractedVendorName === null) return;
    let cancelled = false;
    fetchVendors({ q: extractedVendorName, pageSize: 50 })
      .then((res) => {
        if (cancelled) return;
        const wanted = foldSearchText(extractedVendorName);
        const found = res.vendors.some((v) => foldSearchText(v.name) === wanted);
        // Not among the first results of a longer list is unknown, not absent: no create row.
        const truncated = res.pagination.totalItems > res.vendors.length;
        setExtractedMatched(found ? true : truncated ? null : false);
      })
      .catch(() => {
        if (!cancelled) setExtractedMatched(null);
      });
    return () => {
      cancelled = true;
    };
  }, [extractedVendorName]);

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

        setExtractedVendorName(previewResult.extractedVendorName?.trim() || null);
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
    navigate(originHrefOr(location.state, routeUrl('invoices')), { replace: true });
  }, [navigate, location.state]);

  // An extracted company name that matches no company stays offered as a create row, prefilled
  // with that name while the field is empty.
  const extractedUnmatched = extractedVendorName !== null && extractedMatched === false;
  const vendorCreateAction = companyCreateAction && {
    ...companyCreateAction,
    show: 'noExactMatch' as const,
    showWhenEmpty: extractedUnmatched,
    getLabel: (query: string) => companyCreateAction.getLabel(query || extractedVendorName || ''),
    onCreate: async (query: string) => {
      const company = await companyCreateAction.onCreate(query || extractedVendorName || '');
      if (company) {
        if (
          extractedVendorName !== null &&
          foldSearchText(company.name) === foldSearchText(extractedVendorName)
        ) {
          setExtractedMatched(true);
        }
        setAnnounceMessage(t('autoItemize.vendorCreatedAnnounce', { name: company.name }));
      }
      return company;
    },
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

      navigate(routeUrl('invoice', { id: result.invoice.id }), {
        replace: true,
        state: forwardOriginState(location.state),
      });
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
    location.state,
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
          <div className={styles.headerMain}>
            <PageBreadcrumbs />
            <h1 className={styles.pageTitle}>{pageTitle}</h1>
            <p className={styles.statusLine} role="status" aria-atomic="true">
              {t('autoItemize.extractionStarted')}
            </p>
          </div>
        </div>
        <div className={styles.loadingState}>
          <Spinner size="lg" />
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
          <div className={styles.headerMain}>
            <PageBreadcrumbs />
            <h1 className={styles.pageTitle}>{pageTitle}</h1>
          </div>
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
          <button
            type="button"
            className={sharedStyles.btnPrimary}
            onClick={() => navigate(routeUrl('invoices'), { replace: true })}
          >
            {tc('navigation.backTo', { origin: tc('navigation.invoices') })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <div className={styles.headerMain}>
            <PageBreadcrumbs />
            <h1 className={styles.pageTitle}>{pageTitle}</h1>
            <p className={styles.statusLine}>{t('autoItemize.extractionComplete')}</p>
          </div>
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
                  searchFn={async (query) => {
                    const res = await fetchVendors({ q: query, pageSize: 50 });
                    return res.vendors;
                  }}
                  showItemsOnFocus
                  renderItem={(vendor) => ({ id: vendor.id, label: vendor.name })}
                  placeholder={t('autoItemize.vendorPlaceholder')}
                  initialTitle={suggestedVendorName ?? undefined}
                  inputAriaProps={{
                    'aria-required': true,
                    'aria-invalid': vendorError ? true : undefined,
                    'aria-describedby': vendorError ? 'vendor-error' : undefined,
                  }}
                  createAction={vendorCreateAction}
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
