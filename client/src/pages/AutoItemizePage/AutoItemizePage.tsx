import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../contexts/LocaleContext.js';
import type {
  Invoice,
  AutoItemizeWarning,
  PaperlessDocumentSearchResult,
  InvoicePatchForAutoItemize,
  InvoiceStatus,
} from '@cornerstone/shared';
import { fetchInvoiceById } from '../../lib/invoicesApi.js';
import { autoItemize } from '../../lib/invoiceAutoItemizeApi.js';
import { getPaperlessDocument, getPaperlessStatus } from '../../lib/paperlessApi.js';
import { createWorkItemBudget } from '../../lib/workItemBudgetsApi.js';
import { createHouseholdItemBudget } from '../../lib/householdItemBudgetsApi.js';
import {
  buildCommitLines,
  effectiveRowAmount,
  materializeNewRows,
  mergeMaterializedRows,
  rowTarget,
} from '../../lib/autoItemizeDraftUtils.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useInvoiceDisplayTitle } from '../../hooks/useInvoiceDisplayTitle.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { pathnameOf, readOrigin } from '../../navigation/origin.js';
import { useAutoItemizeLines } from '../../hooks/useAutoItemizeLines.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { Spinner } from '../../components/Spinner/Spinner.js';
import { FormError } from '../../components/FormError/FormError.js';
import { SuggestionBadge } from '../../components/SuggestionBadge/SuggestionBadge.js';
import { AutoItemizePdfPreview } from '../../components/autoItemize/index.js';
import { AutoItemizeLines } from '../../components/CostLineForm/AutoItemizeLines.js';
import { isBlankRow } from '../../components/CostLineForm/costLineGridModel.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './AutoItemizePage.module.css';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { INVOICE_STATUSES, routeUrl } from '@cornerstone/shared';

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
  const { t: tc } = useTranslation('common');
  const location = useLocation();
  const { vatRate, resolvedLocale } = useLocale();
  const locale = resolvedLocale === 'de' ? 'de' : 'en';
  const { formatCurrency } = useFormatters();

  // Page state — ALL hooks must be called unconditionally before any early return
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const pageTitle = tc('navigation.splitWithAi');
  useDocumentTitle(pageTitle);
  const invoiceTitle = useInvoiceDisplayTitle(invoice);
  const crumbs = <PageBreadcrumbs objectNames={{ invoice: invoiceTitle }} />;
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

  const lineState = useAutoItemizeLines({
    document,
    onFieldsEdited: () => setLineFieldsEdited(true),
    documentSummary: metadataEdits.notes,
    onMergeStart: (count) => setAnnounceMessage(t('autoItemize.mergeAnnounceStart', { count })),
    onMergeSuccess: () => setAnnounceMessage(t('autoItemize.mergeAnnounceSuccess')),
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
          lineState.load(_autoItemizeResult.lines);
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
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- lineState.load is stable per locale; the effect re-runs on the listed deps only
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
    const linesChanged = lineState.rows.some((row) => !row.included && !isBlankRow(row));
    // eslint-disable-next-line @eslint-react/set-state-in-effect
    setIsDirty(metadataChanged || linesChanged || lineFieldsEdited);
  }, [metadataEdits, lineState.rows, originalMetadata, lineFieldsEdited]);

  /** Back to the invoice: one step back when the page was opened from it, else replace. */
  const returnToInvoice = useCallback(() => {
    if (!invoiceId) return;
    const invoiceUrl = routeUrl('invoice', { id: invoiceId });
    if (pathnameOf(readOrigin(location.state)?.to ?? '') === invoiceUrl) {
      navigate(-1);
    } else {
      navigate(invoiceUrl, { replace: true });
    }
  }, [invoiceId, navigate, location.state]);

  const handleCancel = useCallback(() => {
    if (!invoiceId) return;
    if (isDirty) {
      setShowCancelConfirm(true);
    } else {
      returnToInvoice();
    }
  }, [isDirty, invoiceId, returnToInvoice]);

  const handleConfirmCancel = useCallback(() => {
    if (!invoiceId) return;
    setShowCancelConfirm(false);
    returnToInvoice();
  }, [invoiceId, returnToInvoice]);

  const handleSave = useCallback(async () => {
    if (!invoiceId || !documentId || !invoice || !document) return;

    setPageStatus('saving');

    try {
      const docId = parseInt(documentId, 10);
      const includedRows = lineState.rows.filter((row) => row.included && !isBlankRow(row));

      // A merge that is running or failed cannot be saved: the row has no description yet.
      const unmerged = includedRows.find((row) => row.notice !== undefined);
      if (unmerged?.notice) {
        setPageError(unmerged.notice.text);
        setPageStatus('ready');
        return;
      }
      if (!lineState.validate()) {
        setPageError(null);
        setPageStatus('ready');
        return;
      }

      const context = lineState.commitContext();
      const missingCategories = includedRows.filter(
        (row) =>
          row.existingLine === null &&
          rowTarget(row, context.assignAll) === null &&
          !row.budgetCategoryId,
      );
      if (missingCategories.length > 0) {
        setPageError(t('autoItemize.categoryRequiredError'));
        setPageStatus('ready');
        return;
      }

      const materialized = await materializeNewRows(
        includedRows,
        context,
        lineState.data,
        { workItem: createWorkItemBudget, householdItem: createHouseholdItemBudget },
        { t, tErrors },
      );

      // Keep the cost lines created so far: a retry must not create them again.
      lineState.replaceRows(mergeMaterializedRows(lineState.rows, materialized.rows));
      if (!materialized.ok) {
        setPageError(materialized.error);
        setPageStatus('ready');
        return;
      }
      const workingRows = materialized.rows;

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

      const linesPayload = buildCommitLines(workingRows, lineState.data, context);

      await autoItemize(invoiceId, {
        paperlessDocumentId: docId,
        mode,
        dryRun: false,
        lines: linesPayload,
        ...(Object.keys(patch).length > 0 ? { invoicePatch: patch } : {}),
      });

      returnToInvoice();
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
    lineState,
    metadataEdits,
    originalMetadata,
    mode,
    invoice,
    document,
    returnToInvoice,
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
          lineState.load(result.lines);
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
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- lineState.load is stable per locale
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
    const total = lineState.rows
      .filter((row) => row.included && !isBlankRow(row))
      .reduce((sum, row) => sum + effectiveRowAmount(row, vatRate, locale), 0);
    const inv = parseFloat(metadataEdits.amount) || invoice?.amount || 0;
    const v = total - inv;
    return {
      computedLineTotal: total,
      variance: v,
      variancePercent: inv > 0 ? Math.abs(v) / inv : 0,
    };
  }, [lineState.rows, metadataEdits.amount, invoice?.amount, vatRate, locale]);

  if (!invoiceId || !documentId) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <div className={styles.headerMain}>
            {crumbs}
            <h1 className={styles.pageTitle}>{pageTitle}</h1>
          </div>
        </div>
        <div className={styles.pageBody}>
          <div className={styles.errorColumn}>
            <FormError variant="banner" message={t('autoItemize.error')} />
          </div>
        </div>
      </div>
    );
  }

  if (pageStatus === 'loading') {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <div className={styles.headerMain}>
            {crumbs}
            <h1 className={styles.pageTitle}>{pageTitle}</h1>
          </div>
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
          <div className={styles.headerMain}>
            {crumbs}
            <h1 className={styles.pageTitle}>{pageTitle}</h1>
          </div>
        </div>
        <div className={styles.pageBody}>
          <div className={styles.errorColumn}>
            <FormError variant="banner" message={pageError || t('autoItemize.error')} />
            {pageStatus === 'error' && (
              <button type="button" className={sharedStyles.btnPrimary} onClick={handleRetry}>
                {t('autoItemize.retry')}
              </button>
            )}
            <Link to={routeUrl('invoice', { id: invoiceId })} className={sharedStyles.btnSecondary}>
              {tc('navigation.backTo', { origin: invoiceTitle ?? tc('navigation.invoice') })}
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
          <div className={styles.headerMain}>
            {crumbs}
            <h1 className={styles.pageTitle}>{pageTitle}</h1>
          </div>
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
              <AutoItemizeLines
                state={lineState}
                computedTotal={computedLineTotal}
                variance={variance}
                variancePercent={variancePercent}
                onAnnounce={setAnnounceMessage}
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

      {/* Discard confirmation */}
      {showCancelConfirm && (
        <ConfirmDialog
          title={tc('confirmDialog.discardChangesTitle')}
          lead={t('autoItemize.cancelConfirmBody')}
          confirmLabel={tc('confirmDialog.discard')}
          busyLabel={tc('confirmDialog.discarding')}
          cancelLabel={tc('confirmDialog.keepEditing')}
          busy={false}
          onConfirm={handleConfirmCancel}
          onCancel={() => setShowCancelConfirm(false)}
          testIdPrefix="auto-itemize-discard"
        />
      )}
    </>
  );
}
