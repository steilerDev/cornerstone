import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  Invoice,
  ExtractedLine,
  AutoItemizeWarning,
  PaperlessDocumentSearchResult,
  InvoicePatchForAutoItemize,
  InvoiceStatus,
} from '@cornerstone/shared';
import type { BadgeVariantMap } from '../../components/Badge/Badge.js';
import { fetchInvoiceById } from '../../lib/invoicesApi.js';
import { autoItemize } from '../../lib/invoiceAutoItemizeApi.js';
import { getPaperlessDocument, getPaperlessStatus } from '../../lib/paperlessApi.js';
import { createWorkItemBudget } from '../../lib/workItemBudgetsApi.js';
import { createHouseholdItemBudget } from '../../lib/householdItemBudgetsApi.js';
import { materializeInlineDrafts } from '../../lib/autoItemizeDraftUtils.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { useAutoItemizeLines } from '../../hooks/useAutoItemizeLines.js';
import { Modal } from '../../components/Modal/Modal.js';
import { Spinner } from '../../components/Spinner/Spinner.js';
import { FormError } from '../../components/FormError/FormError.js';
import { SuggestionBadge } from '../../components/SuggestionBadge/SuggestionBadge.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import {
  AutoItemizeLineList,
  AutoItemizePdfPreview,
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
  const { t: tSettings } = useTranslation('settings');
  const { formatCurrency } = useFormatters();

  const createdFromExtractionVariants = useMemo(
    (): BadgeVariantMap => ({
      true: {
        label: t('autoItemize.createdFromAutoItemization'),
        className: badgeStyles.info,
      },
    }),
    [t],
  );

  // Page state — ALL hooks must be called unconditionally before any early return
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [document, setDocument] = useState<PaperlessDocumentSearchResult | null>(null);
  const [warnings, setWarnings] = useState<AutoItemizeWarning[]>([]);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [pageError, setPageError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [paperlessStatus, setPaperlessStatus] = useState<Awaited<
    ReturnType<typeof getPaperlessStatus>
  > | null>(null);
  const [extractedInvoiceDate, setExtractedInvoiceDate] = useState<string | undefined>(undefined);
  const [extractedDueDate, setExtractedDueDate] = useState<string | undefined>(undefined);
  const [extractedInvoiceNumber, setExtractedInvoiceNumber] = useState<string | undefined>(
    undefined,
  );
  const [extractedNotes, setExtractedNotes] = useState<string | undefined>(undefined);

  const [metadataEdits, setMetadataEdits] = useState<MetadataEdits>({
    invoiceNumber: null,
    amount: '',
    date: '',
    dueDate: null,
    notes: null,
    status: 'pending',
  });

  const [isDirty, setIsDirty] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [announceMessage, setAnnounceMessage] = useState('');
  const [lineFieldsEdited, setLineFieldsEdited] = useState(false);

  const { lines, setLines, picker, handlers } = useAutoItemizeLines({
    invoiceId: invoiceId ?? '',
    invoiceAmount: invoice?.amount ?? 0,
    document,
    onFieldsEdited: () => setLineFieldsEdited(true),
  });

  // Timer effect for elapsed seconds counter
  useEffect(() => {
    if (pageStatus !== 'loading') {
      // eslint-disable-next-line @eslint-react/set-state-in-effect
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
    if (!invoiceId || !documentId) return;

    const loadData = async () => {
      setPageStatus('loading');
      setPageError(null);
      setLineFieldsEdited(false);
      setElapsed(0);
      setExtractedInvoiceNumber(undefined);
      setExtractedNotes(undefined);

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

        const inv = await fetchInvoiceById(invoiceId);
        setInvoice(inv);

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

        setMetadataEdits({
          invoiceNumber: inv.invoiceNumber ?? null,
          amount: inv.amount.toString(),
          date: inv.date,
          dueDate: inv.dueDate ?? null,
          notes: inv.notes ?? null,
          status: inv.status,
        });

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
          setPageError(translateApiError(err.error.code, tErrors));
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

  useEffect(() => {
    const metadataChanged = Object.entries(metadataEdits).some(
      ([key, value]) => value !== originalMetadata[key as keyof MetadataEdits],
    );
    const linesChanged = lines.some((line) => !line.included);
    // eslint-disable-next-line @eslint-react/set-state-in-effect
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

      const missingCategories = workingLines.filter(
        (l) => !l.assignedBudgetLineId && !l.budgetCategoryId,
      );
      if (missingCategories.length > 0) {
        setPageError(t('autoItemize.categoryRequiredError'));
        setPageStatus('ready');
        return;
      }

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

      navigate(`/budget/invoices/${invoiceId}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setPageError(translateApiError(err.error.code, tErrors));
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
          setPageError(translateApiError(err.error.code, tErrors));
        } else {
          setPageError(t('autoItemize.loadError'));
        }
        setPageStatus('error');
      }
    };

    void loadData();
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- picker.pickerState identity changes each render; its data is stable
  }, [invoiceId, documentId, t, tErrors]);

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

  if (!invoiceId || !documentId) {
    return <div>{t('autoItemize.error')}</div>;
  }

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

            <div role="status" aria-atomic="true" className={sharedStyles.srOnly}>
              {announceMessage}
            </div>

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
                        setMetadataEdits((prev) => ({ ...prev, amount: e.target.value }))
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
                        setMetadataEdits((prev) => ({ ...prev, date: e.target.value }))
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
                onToggleInclude={handlers.onToggleInclude}
                onFieldChange={handlers.onFieldChange}
                onAssign={handlers.onAssign}
                onClearAssign={handlers.onClearAssign}
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
                onInlineDraftChange={handlers.onInlineDraftChange}
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

          {/* Preview column */}
          <div className={styles.previewColumn}>
            <AutoItemizePdfPreview
              documentId={parseInt(documentId, 10)}
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
