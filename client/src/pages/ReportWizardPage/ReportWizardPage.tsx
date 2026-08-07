import { useState, useEffect, useMemo, useCallback, useRef, useReducer } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { BudgetSource, SourceReportType, HouseholdSettings } from '@cornerstone/shared';
import i18n from '../../i18n/index.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useLocale } from '../../contexts/LocaleContext.js';
import { fetchBudgetSources } from '../../lib/budgetSourcesApi.js';
import { fetchHouseholdSettings } from '../../lib/settingsApi.js';
import { fetchConfig } from '../../lib/configApi.js';
import {
  getSourceReport,
  markInvoicesClaimed,
  generateReportContent,
} from '../../lib/sourceReportsApi.js';
import { getPaperlessStatus } from '../../lib/paperlessApi.js';
import { createFormatters, toBcp47Locale } from '../../lib/formatters.js';
import { applyLineExclusions } from '../../lib/reportExclusions.js';
import {
  buildReportContent,
  applyOverrides,
  applyAiContent,
  type ReportContent,
} from '../../lib/reportContent/index.js';
import {
  generateReportPdf,
  downloadPdf,
  createPreviewUrl,
  uploadToPaperless,
} from '../../lib/reportPdf/index.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { SubNav } from '../../components/SubNav/SubNav.js';
import { WizardStepper, type WizardStep } from '../../components/WizardStepper/index.js';
import { Modal } from '../../components/Modal/Modal.js';
import { FormError } from '../../components/FormError/FormError.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { Spinner } from '../../components/Spinner/Spinner.js';
import { ReportInvoiceList } from '../../components/reports/ReportInvoiceList.js';
import { ReportPdfPreview } from '../../components/reports/ReportPdfPreview.js';
import { ReportContentEditor } from '../../components/reports/ReportContentEditor.js';
import { BUDGET_TABS } from '../shared/budgetTabs.js';
import { Step1UseCase } from './Step1UseCase.js';
import { Step2Source } from './Step2Source.js';
import { Step4Settings } from './Step4Settings.js';
import { Step5Actions } from './Step5Actions.js';
import {
  wizardReducer,
  createInitialWizardState,
  nextRequestId,
  hasManualEdits,
  isDirty,
  isGeneratingOnly,
  isGeneratingAi,
} from './wizardReducer.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './ReportWizardPage.module.css';

type PageStatus = 'loading' | 'ready' | 'error';

export function ReportWizardPage() {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { showToast } = useToast();
  const { user } = useAuth();
  const { resolvedLocale, currency } = useLocale();
  const [searchParams] = useSearchParams();

  const sourceIdFromQuery = searchParams.get('sourceId');
  const [wizardState, dispatch] = useReducer(
    wizardReducer,
    sourceIdFromQuery,
    createInitialWizardState,
  );

  const {
    useCase,
    sourceId,
    step2Amounts,
    step2Loading,
    report,
    reportStatus,
    excludedInvoiceIds,
    excludedLineIds,
    overrides,
    aiContent,
    aiError,
    hiddenColumns,
    reportLanguageOverride,
    attachDocuments,
    includeCoverLetter,
    currentStep,
    maxReachedStep,
    skippedDocuments,
  } = wizardState;

  const isGeneratingAiValue = isGeneratingAi(wizardState);
  const isDirtyValue = isDirty(wizardState);

  // Focus management for step headings
  const stepHeadingsRef = useRef<(HTMLHeadingElement | null)[]>([]);

  // Report language selection (derived default: override takes precedence, falls back to resolvedLocale)
  const reportLanguage = reportLanguageOverride ?? resolvedLocale;

  // Budget sources
  const [budgetSources, setBudgetSources] = useState<BudgetSource[]>([]);
  const [sourcesStatus, setSourcesStatus] = useState<PageStatus>('loading');

  // LLM configuration
  const [llmEnabled, setLlmEnabled] = useState(false);

  // AI generation state (UI-only, not wizard state)
  const [aiElapsed, setAiElapsed] = useState(0);
  const [showAiOverwriteConfirm, setShowAiOverwriteConfirm] = useState(false);
  const pendingAiGenerationRef = useRef<(() => void) | null>(null);

  // Source selection (derived)
  const selectedSource = useMemo(
    () => budgetSources.find((s) => s.id === sourceId) || null,
    [budgetSources, sourceId],
  );

  // Discard confirmation modal
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const pendingChangeRef = useRef<(() => void) | null>(null);

  // Upgraded from useRef(false) per #1947 M-D decision. Holds the sourceId that was applied
  // by the deep-link effect, or null if the effect has not yet fired. The ref is the sole guard;
  // '!report' is dropped from the condition below, removing report from the effect's deps.
  const deepLinkAppliedRef = useRef<string | null>(null);

  // PDF preview modal
  const [showPdfPreviewModal, setShowPdfPreviewModal] = useState(false);
  const [activeAction, setActiveAction] = useState<'preview' | 'download' | 'paperless' | null>(
    null,
  );
  const [actionError, setActionError] = useState<string>('');
  const modalPreviewUrlRef = useRef<string | null>(null);
  const [modalPreviewUrl, setModalPreviewUrl] = useState<string | null>(null);

  // Household settings
  const [household, setHousehold] = useState<HouseholdSettings | null>(null);

  // Claim flow
  const [showClaimConfirm, setShowClaimConfirm] = useState(false);
  const [isMarkingClaimed, setIsMarkingClaimed] = useState(false);
  const [claimError, setClaimError] = useState<string>('');
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [claimedInvoiceCount, setClaimedInvoiceCount] = useState(0);
  const [claimedDepositCount, setClaimedDepositCount] = useState(0);
  const [finishedWithoutMarking, setFinishedWithoutMarking] = useState(false);

  // Paperless status
  const [paperlessStatus, setPaperlessStatus] = useState<Awaited<
    ReturnType<typeof getPaperlessStatus>
  > | null>(null);

  // Load initial data
  useEffect(() => {
    const init = async () => {
      try {
        const [sources, settings, status, config] = await Promise.all([
          fetchBudgetSources(),
          fetchHouseholdSettings(),
          getPaperlessStatus(),
          fetchConfig(),
        ]);
        setBudgetSources(sources.budgetSources);
        setHousehold(settings);
        setPaperlessStatus(status);
        setLlmEnabled(config.llmEnabled);
        setSourcesStatus('ready');
      } catch {
        setSourcesStatus('error');
      }
    };
    void init();
  }, []);

  // Guard for mutations: if overrides, aiContent, or an in-flight generation exist, show confirm modal; else apply change immediately
  const guardedUpdate = useCallback(
    (applyChange: () => void) => {
      if (isDirtyValue) {
        pendingChangeRef.current = () => {
          dispatch({ type: 'DISCARD_EDITS' });
          applyChange();
        };
        setShowDiscardConfirm(true);
      } else {
        applyChange();
      }
    },
    [isDirtyValue],
  );

  // Handle use case selection
  const handleUseCaseChange = useCallback(
    (uc: SourceReportType) => {
      guardedUpdate(() => {
        const step2RequestId = nextRequestId();
        dispatch({ type: 'SELECT_USE_CASE', payload: { useCase: uc, step2RequestId } });

        void Promise.all(
          budgetSources.map((source) =>
            getSourceReport(uc, source.id)
              .then((r) => ({ sourceId: source.id, amount: r.totalAmount }))
              .catch(() => ({ sourceId: source.id, amount: 0 })),
          ),
        ).then((results) => {
          const amounts = new Map(results.map((r) => [r.sourceId, r.amount]));
          dispatch({
            type: 'STEP2_AMOUNTS_LOADED',
            payload: { requestId: step2RequestId, amounts },
          });
        });
      });
    },
    [budgetSources, guardedUpdate],
  );

  // Handle source selection
  const handleSourceChange = useCallback(
    (sid: string) => {
      guardedUpdate(() => {
        const requestId = nextRequestId();
        dispatch({ type: 'SELECT_SOURCE', payload: { sourceId: sid, requestId } });

        if (useCase) {
          void getSourceReport(useCase, sid)
            .then((r) => {
              dispatch({ type: 'REPORT_LOADED', payload: { requestId, report: r } });
            })
            .catch((err) => {
              console.error(err);
              dispatch({ type: 'REPORT_ERROR', payload: { requestId } });
            });
        }
      });
    },
    [useCase, guardedUpdate],
  );

  // Handle ?sourceId= query parameter deep link
  useEffect(() => {
    if (useCase && sourceIdFromQuery && deepLinkAppliedRef.current !== sourceIdFromQuery) {
      deepLinkAppliedRef.current = sourceIdFromQuery;
      handleSourceChange(sourceIdFromQuery);
    }
  }, [useCase, sourceIdFromQuery, handleSourceChange]);

  // Report-language-specific translation and formatters
  const reportT = useMemo(() => i18n.getFixedT(reportLanguage, 'budget'), [reportLanguage]);

  const reportFormatters = useMemo(
    () => createFormatters(toBcp47Locale(reportLanguage), currency),
    [reportLanguage, currency],
  );

  // Baseline content (with AI content applied, no manual overrides applied)
  const baselineContent = useMemo<ReportContent | null>(() => {
    if (!report || !useCase) return null;

    const effectiveReport = applyLineExclusions(report, excludedLineIds);
    const includedInvoiceIds = new Set(
      effectiveReport.invoices
        .filter((inv) => !excludedInvoiceIds.has(inv.invoiceId))
        .map((inv) => inv.invoiceId),
    );

    const derived = buildReportContent(
      effectiveReport,
      includedInvoiceIds,
      useCase,
      reportT,
      reportFormatters,
      { includeCoverLetter, household, user },
    );

    return applyAiContent(derived, aiContent);
  }, [
    report,
    useCase,
    excludedLineIds,
    excludedInvoiceIds,
    reportT,
    reportFormatters,
    includeCoverLetter,
    household,
    user,
    aiContent,
  ]);

  // Effective content (with overrides applied)
  const effectiveContent = useMemo<ReportContent | null>(() => {
    if (!baselineContent) return null;
    return applyOverrides(baselineContent, overrides);
  }, [baselineContent, overrides]);

  // Generate PDF from effective content (used by preview, download, paperless)
  const generatePdfFromContent = useCallback(async () => {
    if (!report || !useCase || !effectiveContent) return null;

    try {
      const effectiveReport = applyLineExclusions(report, excludedLineIds);
      const includedInvoiceIds = new Set(
        effectiveReport.invoices
          .filter((inv) => !excludedInvoiceIds.has(inv.invoiceId))
          .map((inv) => inv.invoiceId),
      );

      const result = await generateReportPdf(report, includedInvoiceIds, effectiveContent, {
        attachDocuments,
        hiddenColumns,
      });

      dispatch({ type: 'PDF_GENERATED', payload: { skippedDocuments: result.skippedDocuments } });
      return result;
    } catch (err) {
      console.error(err);
      return null;
    }
  }, [
    report,
    useCase,
    effectiveContent,
    excludedLineIds,
    excludedInvoiceIds,
    attachDocuments,
    hiddenColumns,
  ]);

  // Handle preview PDF
  const handlePreviewPdf = useCallback(async () => {
    setActiveAction('preview');
    setActionError('');
    setShowPdfPreviewModal(true);

    const result = await generatePdfFromContent();
    if (!result) {
      setActionError(t('sourceReports.previewGenerationFailed'));
      setActiveAction(null);
      return;
    }

    // Revoke old modal URL
    if (modalPreviewUrlRef.current) {
      URL.revokeObjectURL(modalPreviewUrlRef.current);
    }

    const newUrl = createPreviewUrl(result.blob);
    setModalPreviewUrl(newUrl);
    modalPreviewUrlRef.current = newUrl;
    setActiveAction(null);
  }, [generatePdfFromContent, t]);

  // Handle download
  const handleDownload = useCallback(async () => {
    if (!selectedSource || !useCase) return;

    setActiveAction('download');
    setActionError('');

    const result = await generatePdfFromContent();
    if (!result) {
      showToast('error', t('sourceReports.downloadFailed'));
      setActiveAction(null);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const slug = selectedSource.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '');
    const filename = `${useCase}-${slug}-${today}.pdf`;

    downloadPdf(result.blob, filename);
    setActiveAction(null);
  }, [generatePdfFromContent, selectedSource, useCase, t, showToast]);

  // Handle upload to Paperless
  const handleUploadPaperless = useCallback(async () => {
    if (!selectedSource || !useCase) return;

    setActiveAction('paperless');
    setActionError('');

    try {
      const result = await generatePdfFromContent();
      if (!result) {
        showToast('error', t('sourceReports.uploadFailed'));
        setActiveAction(null);
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const slug = selectedSource.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '');
      const title = `${useCase}-${slug}-${today}`;

      await uploadToPaperless(result.blob, title);
      showToast('success', t('sourceReports.uploadSuccess'));
    } catch (err) {
      if (err instanceof ApiClientError) {
        showToast('error', translateApiError(err.error.code, tErrors));
      } else {
        showToast('error', t('sourceReports.uploadFailed'));
      }
    } finally {
      setActiveAction(null);
    }
  }, [generatePdfFromContent, selectedSource, useCase, t, showToast, tErrors]);

  // Handle mark claimed
  const handleMarkClaimed = async () => {
    if (!report || !sourceId) return;

    // Invoice IDs that have no excluded budget lines
    // (an invoice with any excluded line must not flip status — the excluded portion stays claimable)
    const invoiceIds = report.invoices
      .filter(
        (inv) =>
          !excludedInvoiceIds.has(inv.invoiceId) &&
          !inv.budgetLines.some((line) => excludedLineIds.has(line.id)),
      )
      .map((inv) => inv.invoiceId);

    // All deposits with status !== 'claimed' from included invoices
    // (intentionally includes deposits of invoices omitted from invoiceIds)
    const depositIds = report.invoices
      .filter((inv) => !excludedInvoiceIds.has(inv.invoiceId))
      .flatMap((inv) => inv.deposits ?? [])
      .filter((dep) => dep.status !== 'claimed')
      .map((dep) => dep.id);

    // Guard: if both are empty, show error and close modal
    if (invoiceIds.length === 0 && depositIds.length === 0) {
      setClaimError(t('sourceReports.claimNothingClaimable'));
      setShowClaimConfirm(false);
      return;
    }

    setIsMarkingClaimed(true);
    try {
      const response = await markInvoicesClaimed(sourceId, invoiceIds, depositIds);
      setClaimedInvoiceCount(response.claimedInvoiceIds.length);
      setClaimedDepositCount(response.claimedDepositIds.length);
      setClaimSuccess(true);
      setShowClaimConfirm(false);
    } catch (err) {
      if (err instanceof ApiClientError && err.error.code === 'INVOICES_NOT_CLAIMABLE') {
        // Try to map invoice IDs to numbers for a more specific error message
        const failedInvoiceIds = err.error.details?.invoiceIds as string[] | undefined;
        if (failedInvoiceIds && failedInvoiceIds.length > 0) {
          const invoiceNumbers = failedInvoiceIds
            .map((id) => {
              const inv = report.invoices.find((i) => i.invoiceId === id);
              return inv?.invoiceNumber ?? id;
            })
            .filter(Boolean);

          if (invoiceNumbers.length > 0) {
            setClaimError(
              t('sourceReports.claimFailedWithInvoices', {
                invoiceNumbers: invoiceNumbers.join(', '),
              }),
            );
          } else {
            setClaimError(translateApiError('INVOICES_NOT_CLAIMABLE', tErrors));
          }
        } else {
          setClaimError(translateApiError('INVOICES_NOT_CLAIMABLE', tErrors));
        }
        setShowClaimConfirm(false);
        // Refetch silently
        if (useCase && sourceId) {
          try {
            const updated = await getSourceReport(useCase, sourceId);
            dispatch({ type: 'REPORT_REFRESHED', payload: { report: updated } });
          } catch {
            // Ignore refetch errors
          }
        }
      } else if (err instanceof ApiClientError) {
        setClaimError(translateApiError(err.error.code, tErrors));
        setShowClaimConfirm(false);
      } else {
        setClaimError(t('sourceReports.claimFailed'));
        setShowClaimConfirm(false);
      }
    } finally {
      setIsMarkingClaimed(false);
    }
  };

  // AI elapsed timer effect
  useEffect(() => {
    if (!isGeneratingAiValue) return;
    const id = setInterval(() => {
      setAiElapsed((n) => n + 1);
    }, 1000);
    return () => {
      clearInterval(id);
      setAiElapsed(0);
    };
  }, [isGeneratingAiValue]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (modalPreviewUrlRef.current) {
        URL.revokeObjectURL(modalPreviewUrlRef.current);
      }
    };
  }, []);

  // Move focus to the active step panel's heading on step change
  useEffect(() => {
    const heading = stepHeadingsRef.current[currentStep - 1];
    if (heading) {
      requestAnimationFrame(() => {
        heading.focus();
      });
    }
  }, [currentStep]);

  // Run AI generation
  const runAiGeneration = useCallback(async () => {
    if (!report || !useCase || !sourceId) return;

    const effectiveReport = applyLineExclusions(report, excludedLineIds);
    const includedInvoiceIds = Array.from(
      new Set(
        effectiveReport.invoices
          .filter((inv) => !excludedInvoiceIds.has(inv.invoiceId))
          .map((inv) => inv.invoiceId),
      ),
    );

    if (includedInvoiceIds.length === 0) {
      dispatch({ type: 'AI_GENERATION_BLOCKED', payload: { error: tErrors('EMPTY_SELECTION') } });
      return;
    }

    const requestId = nextRequestId();
    dispatch({ type: 'AI_GENERATION_STARTED', payload: { requestId } });

    try {
      const result = await generateReportContent({
        type: useCase,
        sourceId,
        language: reportLanguage,
        includedInvoiceIds,
        excludedLineIds: Array.from(excludedLineIds),
      });
      dispatch({ type: 'AI_GENERATION_COMPLETE', payload: { requestId, result } });
    } catch (err) {
      let errorMessage: string;
      if (err instanceof ApiClientError) {
        errorMessage = translateApiError(err.error.code, tErrors);
      } else {
        errorMessage = t('sourceReports.editable.aiGenerationFailed');
      }
      dispatch({ type: 'AI_GENERATION_ERROR', payload: { requestId, error: errorMessage } });
    }
  }, [report, useCase, excludedLineIds, excludedInvoiceIds, sourceId, reportLanguage, t, tErrors]);

  // Handle generate with AI button click
  const handleGenerateWithAiClick = useCallback(() => {
    const dirty = hasManualEdits(wizardState);
    if (dirty) {
      pendingAiGenerationRef.current = runAiGeneration;
      setShowAiOverwriteConfirm(true);
    } else {
      void runAiGeneration();
    }
  }, [wizardState, runAiGeneration]);

  const steps: WizardStep[] = [
    { id: 'use-case', label: t('sourceReports.stepper.useCase') },
    { id: 'source', label: t('sourceReports.stepper.source') },
    { id: 'invoices', label: t('sourceReports.stepper.invoices') },
    { id: 'settings', label: t('sourceReports.stepper.settings') },
    { id: 'actions', label: t('sourceReports.stepper.actions') },
  ];

  const coverLetterDisabled = !selectedSource?.contactAddress && !selectedSource?.reference;

  return (
    <PageLayout title={t('sourceReports.title')}>
      <SubNav tabs={BUDGET_TABS} ariaLabel={t('sourceReports.subNavAriaLabel')} />

      <WizardStepper
        steps={steps}
        currentStep={currentStep}
        maxReachedStep={maxReachedStep}
        onStepClick={(step) => dispatch({ type: 'GO_TO_STEP', payload: { step } })}
        ariaLabel={t('sourceReports.stepperAriaLabel')}
        mobileStepLabel={(current, total) => t('sourceReports.mobileStepLabel', { current, total })}
      />

      <div className={styles.metadataCard}>
        {sourcesStatus === 'error' && <FormError message={t('sourceReports.errorLoadingData')} />}

        {currentStep === 1 && (
          <div>
            <h2
              ref={(el) => {
                stepHeadingsRef.current[0] = el;
              }}
              tabIndex={-1}
            >
              {steps[0]?.label}
            </h2>
            <Step1UseCase value={useCase} onChange={handleUseCaseChange} t={t} />
            {useCase && (
              <button
                type="button"
                className={sharedStyles.btnPrimary}
                onClick={() => dispatch({ type: 'GO_TO_STEP', payload: { step: 2 } })}
              >
                {t('common:button.next')}
              </button>
            )}
          </div>
        )}

        {currentStep === 2 && (
          <div>
            <h2
              ref={(el) => {
                stepHeadingsRef.current[1] = el;
              }}
              tabIndex={-1}
            >
              {steps[1]?.label}
            </h2>
            <Step2Source
              sources={budgetSources}
              amounts={step2Amounts}
              isLoading={step2Loading}
              value={sourceId}
              useCase={useCase!}
              onChange={handleSourceChange}
              t={t}
            />
            <div className={styles.buttonRow}>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={() => dispatch({ type: 'GO_TO_STEP', payload: { step: 1 } })}
              >
                {t('common:button.back')}
              </button>
              <button
                type="button"
                className={sharedStyles.btnPrimary}
                onClick={() => dispatch({ type: 'GO_TO_STEP', payload: { step: 3 } })}
                disabled={!sourceId}
              >
                {t('common:button.next')}
              </button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div>
            <h2
              ref={(el) => {
                stepHeadingsRef.current[2] = el;
              }}
              tabIndex={-1}
            >
              {steps[2]?.label}
            </h2>
            {reportStatus === 'loading' && <Skeleton lines={5} />}
            {reportStatus === 'error' && (
              <div>
                <FormError message={t('sourceReports.errorLoadingReport')} />
                <button
                  type="button"
                  className={sharedStyles.btnSecondary}
                  onClick={() => {
                    if (useCase && sourceId) {
                      handleSourceChange(sourceId);
                    }
                  }}
                >
                  {t('common:button.retry')}
                </button>
              </div>
            )}
            {reportStatus === 'ready' &&
              report &&
              (() => {
                const effectiveReport = applyLineExclusions(report, excludedLineIds);
                return (
                  <>
                    <ReportInvoiceList
                      report={effectiveReport}
                      excludedInvoiceIds={excludedInvoiceIds}
                      excludedLineIds={excludedLineIds}
                      onToggle={(id, excluded) =>
                        guardedUpdate(() =>
                          dispatch({
                            type: 'TOGGLE_INVOICE',
                            payload: { invoiceId: id, excluded },
                          }),
                        )
                      }
                      onToggleAll={(excludeAll) =>
                        guardedUpdate(() =>
                          dispatch({ type: 'TOGGLE_ALL_INVOICES', payload: { excludeAll } }),
                        )
                      }
                      onToggleLine={(lineId, excluded) =>
                        guardedUpdate(() =>
                          dispatch({ type: 'TOGGLE_LINE', payload: { lineId, excluded } }),
                        )
                      }
                      t={t}
                    />
                    <div className={styles.buttonRow}>
                      <button
                        type="button"
                        className={sharedStyles.btnSecondary}
                        onClick={() => dispatch({ type: 'GO_TO_STEP', payload: { step: 2 } })}
                      >
                        {t('common:button.back')}
                      </button>
                      <button
                        type="button"
                        className={sharedStyles.btnPrimary}
                        onClick={() => dispatch({ type: 'GO_TO_STEP', payload: { step: 4 } })}
                        disabled={excludedInvoiceIds.size === report.invoices.length}
                        title={
                          excludedInvoiceIds.size === report.invoices.length
                            ? t('sourceReports.selectAtLeastOne')
                            : undefined
                        }
                      >
                        {t('common:button.next')}
                      </button>
                    </div>
                  </>
                );
              })()}
          </div>
        )}

        {currentStep === 4 && (
          <div>
            <h2
              ref={(el) => {
                stepHeadingsRef.current[3] = el;
              }}
              tabIndex={-1}
            >
              {steps[3]?.label}
            </h2>
            <Step4Settings
              reportLanguage={reportLanguage}
              onReportLanguageChange={(lang) =>
                guardedUpdate(() => dispatch({ type: 'SET_REPORT_LANGUAGE', payload: { lang } }))
              }
              attachDocuments={attachDocuments}
              onAttachDocumentsChange={(value) =>
                guardedUpdate(() => dispatch({ type: 'SET_ATTACH_DOCUMENTS', payload: { value } }))
              }
              includeCoverLetter={includeCoverLetter}
              onIncludeCoverLetterChange={(value) =>
                guardedUpdate(() =>
                  dispatch({ type: 'SET_INCLUDE_COVER_LETTER', payload: { value } }),
                )
              }
              coverLetterDisabled={coverLetterDisabled}
              t={t}
            />
            <div className={styles.buttonRow}>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={() => dispatch({ type: 'GO_TO_STEP', payload: { step: 3 } })}
              >
                {t('common:button.back')}
              </button>
              <button
                type="button"
                className={sharedStyles.btnPrimary}
                onClick={() => dispatch({ type: 'GO_TO_STEP', payload: { step: 5 } })}
              >
                {t('common:button.next')}
              </button>
            </div>
          </div>
        )}

        {currentStep === 5 && effectiveContent && (
          <div className={styles.step5Body}>
            <h2
              ref={(el) => {
                stepHeadingsRef.current[4] = el;
              }}
              tabIndex={-1}
            >
              {steps[4]?.label}
            </h2>

            {/* AI Generation row (only when the LLM is configured) */}
            {llmEnabled && (
              <div className={styles.aiGenerateRow}>
                <button
                  type="button"
                  className={sharedStyles.btnSecondary}
                  onClick={handleGenerateWithAiClick}
                  disabled={isGeneratingAiValue}
                  aria-describedby="enhanceWithAiDescription"
                >
                  {isGeneratingAiValue && (
                    <span aria-hidden="true">
                      <Spinner size="sm" color="muted" />
                    </span>
                  )}
                  {t('sourceReports.editable.enhanceWithAi')}
                </button>
                <span id="enhanceWithAiDescription" className={sharedStyles.srOnly}>
                  {t('sourceReports.editable.enhanceWithAiDescription')}
                </span>

                {isGeneratingAiValue && (
                  <p className={styles.aiGeneratingCaption} aria-live="polite">
                    {t('sourceReports.editable.generating', { seconds: aiElapsed })}
                  </p>
                )}

                {aiError && <FormError message={aiError} />}

                {aiContent && !isGeneratingAiValue && (
                  <p className={styles.aiGeneratedNote}>
                    {t('sourceReports.editable.aiGeneratedNote')}
                  </p>
                )}
              </div>
            )}

            <ReportContentEditor
              content={effectiveContent}
              overrides={overrides}
              onFieldChange={(key, value) =>
                dispatch({ type: 'SET_OVERRIDE', payload: { key, value } })
              }
              onFieldReset={(key) => dispatch({ type: 'RESET_OVERRIDE', payload: { key } })}
              hiddenColumns={hiddenColumns}
              onToggleColumn={(column) => dispatch({ type: 'TOGGLE_COLUMN', payload: { column } })}
              attachDocuments={attachDocuments}
              t={t}
              lang={reportLanguage !== resolvedLocale ? reportLanguage : undefined}
              uiLang={reportLanguage !== resolvedLocale ? resolvedLocale : undefined}
            />

            {skippedDocuments.length > 0 && (
              <div className={styles.skippedNote}>
                {skippedDocuments.map((doc) => (
                  <div key={`${doc.invoiceId}-${doc.documentId}`} className={styles.skippedItem}>
                    {doc.vendorName} ({doc.invoiceNumber ?? '—'}) —{' '}
                    {t(`sourceReports.table.${doc.reason}`)}
                  </div>
                ))}
              </div>
            )}

            <Step5Actions
              useCase={useCase!}
              paperlessStatus={paperlessStatus}
              isMarkingClaimed={isMarkingClaimed}
              claimError={claimError}
              claimSuccess={claimSuccess}
              claimedInvoiceCount={claimedInvoiceCount}
              claimedDepositCount={claimedDepositCount}
              finishedWithoutMarking={finishedWithoutMarking}
              selectedInvoiceCount={report ? report.invoices.length - excludedInvoiceIds.size : 0}
              onPreviewPdf={handlePreviewPdf}
              onDownload={handleDownload}
              onMarkClaimed={() => setShowClaimConfirm(true)}
              onFinishWithoutMarking={() => {
                setFinishedWithoutMarking(true);
                setClaimSuccess(true);
              }}
              onUploadPaperless={handleUploadPaperless}
              activeAction={activeAction}
              t={t}
            />

            <div className={styles.buttonRow}>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={() => dispatch({ type: 'GO_TO_STEP', payload: { step: 4 } })}
              >
                {t('common:button.back')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Discard edits confirmation modal */}
      {showDiscardConfirm && (
        <Modal
          title={
            isGeneratingOnly(wizardState)
              ? t('sourceReports.editable.discardConfirmTitleGenerating')
              : t('sourceReports.editable.discardConfirmTitle')
          }
          onClose={() => {
            setShowDiscardConfirm(false);
            pendingChangeRef.current = null;
          }}
          footer={
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={sharedStyles.btnPrimary}
                onClick={() => {
                  pendingChangeRef.current?.();
                  setShowDiscardConfirm(false);
                  pendingChangeRef.current = null;
                }}
              >
                {t('sourceReports.editable.discardAndContinue')}
              </button>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={() => {
                  setShowDiscardConfirm(false);
                  pendingChangeRef.current = null;
                }}
              >
                {t('sourceReports.editable.keepEditing')}
              </button>
            </div>
          }
        >
          <p>
            {isGeneratingOnly(wizardState)
              ? t('sourceReports.editable.discardConfirmBodyGenerating')
              : t('sourceReports.editable.discardConfirmBody')}
          </p>
        </Modal>
      )}

      {/* Claim confirmation modal */}
      {showClaimConfirm && report && (
        <Modal
          title={t('sourceReports.confirmClaimTitle')}
          onClose={() => setShowClaimConfirm(false)}
          footer={
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={() => setShowClaimConfirm(false)}
              >
                {t('common:button.cancel')}
              </button>
              <button
                type="button"
                className={sharedStyles.btnPrimary}
                onClick={handleMarkClaimed}
                disabled={isMarkingClaimed}
              >
                {t('common:button.confirm')}
              </button>
            </div>
          }
        >
          <p>
            {t('sourceReports.confirmClaimBody', {
              count: report.invoices.length - excludedInvoiceIds.size,
              pendingCount: report.invoices.filter(
                (inv) => inv.status === 'pending' && !excludedInvoiceIds.has(inv.invoiceId),
              ).length,
            })}
          </p>

          {(() => {
            // Find invoices with excluded lines (and not excluded at invoice level)
            const invoicesWithExcludedItems = report.invoices.filter(
              (inv) =>
                !excludedInvoiceIds.has(inv.invoiceId) &&
                inv.budgetLines.some((line) => excludedLineIds.has(line.id)),
            );

            return invoicesWithExcludedItems.length > 0 ? (
              <div className={styles.warningBlock} role="alert">
                <div className={styles.warningIconContainer}>
                  <svg
                    className={styles.warningIcon}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                  </svg>
                </div>
                <p className={styles.warningBody}>
                  {t('sourceReports.confirmClaimExcludedItemsWarning', {
                    count: invoicesWithExcludedItems.length,
                  })}
                </p>
              </div>
            ) : null;
          })()}
        </Modal>
      )}

      {/* PDF preview modal */}
      {showPdfPreviewModal && (
        <Modal
          title={t('sourceReports.editable.previewModalTitle')}
          className={styles.previewModalContent}
          onClose={() => {
            if (modalPreviewUrlRef.current) {
              URL.revokeObjectURL(modalPreviewUrlRef.current);
              modalPreviewUrlRef.current = null;
              setModalPreviewUrl(null);
            }
            setShowPdfPreviewModal(false);
            setActionError('');
          }}
        >
          {modalPreviewUrl || actionError ? (
            <ReportPdfPreview
              blobUrl={modalPreviewUrl}
              isRegenerating={activeAction === 'preview'}
              hasError={!!actionError}
              onRetry={handlePreviewPdf}
              t={t}
            />
          ) : (
            <p>{t('sourceReports.loadingPreview')}</p>
          )}

          {skippedDocuments.length > 0 && (
            <div className={styles.skippedNote}>
              {skippedDocuments.map((doc) => (
                <div key={`${doc.invoiceId}-${doc.documentId}`} className={styles.skippedItem}>
                  {doc.vendorName} ({doc.invoiceNumber ?? '—'}) —{' '}
                  {t(`sourceReports.table.${doc.reason}`)}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* AI overwrite confirmation modal */}
      {showAiOverwriteConfirm && (
        <Modal
          title={t('sourceReports.editable.aiOverwriteConfirmTitle')}
          onClose={() => {
            setShowAiOverwriteConfirm(false);
            pendingAiGenerationRef.current = null;
          }}
          footer={
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={sharedStyles.btnPrimary}
                onClick={() => {
                  setShowAiOverwriteConfirm(false);
                  pendingAiGenerationRef.current?.();
                  pendingAiGenerationRef.current = null;
                }}
              >
                {t('sourceReports.editable.aiOverwriteAndGenerate')}
              </button>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={() => {
                  setShowAiOverwriteConfirm(false);
                  pendingAiGenerationRef.current = null;
                }}
              >
                {t('sourceReports.editable.keepEditing')}
              </button>
            </div>
          }
        >
          <p>{t('sourceReports.editable.aiOverwriteConfirmBody')}</p>
        </Modal>
      )}
    </PageLayout>
  );
}
