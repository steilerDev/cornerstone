import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  BudgetSource,
  SourceReportType,
  HouseholdSettings,
  GenerateReportContentResponse,
} from '@cornerstone/shared';
import i18n from '../../i18n/index.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useLocale, type ResolvedLocale } from '../../contexts/LocaleContext.js';
import { fetchBudgetSources } from '../../lib/budgetSourcesApi.js';
import { fetchHouseholdSettings } from '../../lib/settingsApi.js';
import { fetchConfig } from '../../lib/configApi.js';
import {
  getSourceReport,
  markInvoicesClaimed,
  generateReportContent,
} from '../../lib/sourceReportsApi.js';
import { getPaperlessStatus } from '../../lib/paperlessApi.js';
import { createFormatters } from '../../lib/formatters.js';
import { applyLineExclusions } from '../../lib/reportExclusions.js';
import {
  buildReportContent,
  applyOverrides,
  applyAiContent,
  type ReportContent,
  type ReportContentOverrides,
} from '../../lib/reportContent/index.js';
import {
  generateReportPdf,
  downloadPdf,
  createPreviewUrl,
  uploadToPaperless,
  type SkippedDocument,
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

  // Step navigation
  const [currentStep, setCurrentStep] = useState(1);
  const [maxReachedStep, setMaxReachedStep] = useState(1);

  // Focus management for step headings
  const stepHeadingsRef = useRef<(HTMLHeadingElement | null)[]>([]);

  // Report language selection (derived default: override takes precedence, falls back to resolvedLocale)
  const [reportLanguageOverride, setReportLanguageOverride] = useState<ResolvedLocale | null>(null);
  const reportLanguage = reportLanguageOverride ?? resolvedLocale;

  // Use case selection
  const [useCase, setUseCase] = useState<SourceReportType | null>(null);

  // Budget sources
  const [budgetSources, setBudgetSources] = useState<BudgetSource[]>([]);
  const [sourcesStatus, setSourcesStatus] = useState<PageStatus>('loading');

  // LLM configuration
  const [llmEnabled, setLlmEnabled] = useState(false);

  // AI generation state
  const [aiContent, setAiContent] = useState<GenerateReportContentResponse | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiElapsed, setAiElapsed] = useState(0);
  const [aiError, setAiError] = useState<string>('');
  const [showAiOverwriteConfirm, setShowAiOverwriteConfirm] = useState(false);
  const pendingAiGenerationRef = useRef<(() => void) | null>(null);

  // Step 2 amounts
  const [step2Amounts, setStep2Amounts] = useState<Map<string, number>>(new Map());
  const [step2Loading, setStep2Loading] = useState(false);

  // Source selection
  const sourceIdFromQuery = searchParams.get('sourceId');
  const [sourceId, setSourceId] = useState<string | null>(sourceIdFromQuery);
  const selectedSource = useMemo(
    () => budgetSources.find((s) => s.id === sourceId) || null,
    [budgetSources, sourceId],
  );

  // Report data
  const [report, setReport] = useState<Awaited<ReturnType<typeof getSourceReport>> | null>(null);
  const [reportStatus, setReportStatus] = useState<PageStatus>('loading');

  // Invoice selection
  const [excludedInvoiceIds, setExcludedInvoiceIds] = useState<Set<string>>(new Set());

  // Line-level exclusions
  const [excludedLineIds, setExcludedLineIds] = useState<Set<string>>(new Set());

  // PDF generation & options
  const [attachDocuments, setAttachDocuments] = useState(true);
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);

  // Editable content overrides
  const [overrides, setOverrides] = useState<ReportContentOverrides>({});

  // Discard confirmation modal
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const pendingChangeRef = useRef<(() => void) | null>(null);

  // #1943: the ?sourceId= deep link auto-selects a source AT MOST ONCE per page load. Without
  // this guard, clearing `report` as part of a use-case change re-satisfies this effect's
  // `!report` condition and silently re-fires handleSourceChange with the ORIGINAL query-string
  // source id — re-selecting a source and pushing maxReachedStep back to 3, undoing the very
  // reset handleUseCaseChange performs (see #1943 AC8). The ref persists for the component's
  // full lifetime and is never reset: sourceIdFromQuery is derived from the URL's search params
  // once and this page never calls setSearchParams, so the deep-link source id is immutable for
  // as long as this component instance is mounted.
  const deepLinkAppliedRef = useRef(false);

  // #1943 (M1): tokens the report-fetch race between handleUseCaseChange and handleSourceChange.
  // Neither fetch aborts its predecessor, so an out-of-order resolution — a use-case-A fetch
  // that settles AFTER a later use-case-B fetch for the same source — would let the stale A
  // report win the `setReport`/`setReportStatus` write, reaching step 3 with a report from the
  // wrong use case even though the reset above already cleared it. Bumping this token wherever
  // a fetch starts and checking it in every callback before writing state discards any response
  // that isn't from the most recently started fetch, in either the success or error path.
  const reportRequestRef = useRef(0);
  const aiGenerationTokenRef = useRef(0);

  // PDF preview modal
  const [showPdfPreviewModal, setShowPdfPreviewModal] = useState(false);
  const [activeAction, setActiveAction] = useState<'preview' | 'download' | 'paperless' | null>(
    null,
  );
  const [actionError, setActionError] = useState<string>('');
  const modalPreviewUrlRef = useRef<string | null>(null);
  const [modalPreviewUrl, setModalPreviewUrl] = useState<string | null>(null);
  const [skippedDocuments, setSkippedDocuments] = useState<SkippedDocument[]>([]);

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
      const hasEdits = Object.keys(overrides).length > 0 || aiContent !== null;
      const isDirty = hasEdits || isGeneratingAi;
      if (isDirty) {
        pendingChangeRef.current = () => {
          setOverrides({});
          setAiContent(null);
          if (isGeneratingAi) {
            aiGenerationTokenRef.current += 1;
            setIsGeneratingAi(false);
            setAiError('');
          }
          applyChange();
        };
        setShowDiscardConfirm(true);
      } else {
        applyChange();
      }
    },
    [overrides, aiContent, isGeneratingAi],
  );

  // Handle use case selection
  const handleUseCaseChange = useCallback(
    (uc: SourceReportType) => {
      guardedUpdate(() => {
        setUseCase(uc);
        setMaxReachedStep(2);
        setStep2Amounts(new Map());
        setStep2Loading(true);

        // #1943: a use-case change invalidates any report fetched under the previous use
        // case (and the source-gated Step 2 Next control, which only checks `sourceId`).
        // Clear both so the wizard can't carry a stale report into a later step.
        // #1943 (M1): also bump the request token so an in-flight fetch from the previous
        // use case can never win the race against a report fetched after this reset.
        reportRequestRef.current += 1;
        setReport(null);
        setReportStatus('loading');
        setSourceId(null);
        setExcludedInvoiceIds(new Set());
        setExcludedLineIds(new Set());
        setSkippedDocuments([]);
        setAiError('');

        // Fetch amounts for all sources in parallel
        Promise.all(
          budgetSources.map((source) =>
            getSourceReport(uc, source.id)
              .then((r) => ({ sourceId: source.id, amount: r.totalAmount }))
              .catch(() => ({ sourceId: source.id, amount: 0 })),
          ),
        )
          .then((results) => {
            const map = new Map(results.map((r) => [r.sourceId, r.amount]));
            setStep2Amounts(map);
          })
          .finally(() => {
            setStep2Loading(false);
          });
      });
    },
    [budgetSources, guardedUpdate],
  );

  // Handle source selection
  const handleSourceChange = useCallback(
    (sid: string) => {
      guardedUpdate(() => {
        setSourceId(sid);
        setExcludedInvoiceIds(new Set());
        setExcludedLineIds(new Set());
        setSkippedDocuments([]);
        setMaxReachedStep(3);
        setReportStatus('loading');

        // #1943 (M1): bump the token before starting this fetch so it can only ever be the
        // authoritative response for its own request generation — any earlier fetch (whether
        // started under this use case or a previous one) is discarded below on resolution.
        const requestId = ++reportRequestRef.current;

        if (useCase) {
          getSourceReport(useCase, sid)
            .then((r) => {
              if (reportRequestRef.current !== requestId) return;
              setReport(r);
              // Auto-enable cover letter based on source
              setIncludeCoverLetter(Boolean(r.source.contactAddress || r.source.reference));
              setReportStatus('ready');
            })
            .catch((err) => {
              if (reportRequestRef.current !== requestId) return;
              console.error(err);
              setReportStatus('error');
            });
        }
      });
    },
    [useCase, guardedUpdate],
  );

  // Handle ?sourceId= query parameter deep link
  useEffect(() => {
    if (useCase && sourceIdFromQuery && !report && !deepLinkAppliedRef.current) {
      deepLinkAppliedRef.current = true;
      handleSourceChange(sourceIdFromQuery);
    }
  }, [useCase, sourceIdFromQuery, report, handleSourceChange]);

  // Report-language-specific translation and formatters
  const reportT = useMemo(() => i18n.getFixedT(reportLanguage, 'budget'), [reportLanguage]);

  const reportFormatters = useMemo(
    () => createFormatters(reportLanguage === 'de' ? 'de-DE' : 'en-US', currency),
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

      const result = await generateReportPdf(
        report,
        includedInvoiceIds,
        effectiveContent,
        { attachDocuments },
        reportT,
      );

      setSkippedDocuments(result.skippedDocuments);
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
    reportT,
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
            setReport(updated);
            // Reset excluded to only include still-present invoices
            const stillPresent = new Set<string>();
            for (const id of excludedInvoiceIds) {
              if (updated.invoices.some((inv) => inv.invoiceId === id)) {
                stillPresent.add(id);
              }
            }
            setExcludedInvoiceIds(stillPresent);
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
    if (!isGeneratingAi) {
      setAiElapsed(0);
      return;
    }

    const id = setInterval(() => {
      setAiElapsed((n) => n + 1);
    }, 1000);

    return () => clearInterval(id);
  }, [isGeneratingAi]);

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
    if (!report || !useCase) return;

    const effectiveReport = applyLineExclusions(report, excludedLineIds);
    const includedInvoiceIds = Array.from(
      new Set(
        effectiveReport.invoices
          .filter((inv) => !excludedInvoiceIds.has(inv.invoiceId))
          .map((inv) => inv.invoiceId),
      ),
    );

    if (includedInvoiceIds.length === 0) {
      setAiError(tErrors('EMPTY_SELECTION'));
      return;
    }

    // #1946: Capture token BEFORE setting isGeneratingAi
    const token = ++aiGenerationTokenRef.current;
    setIsGeneratingAi(true);
    setAiError('');

    try {
      const result = await generateReportContent({
        type: useCase,
        sourceId: sourceId!,
        language: reportLanguage,
        includedInvoiceIds,
        excludedLineIds: Array.from(excludedLineIds),
      });

      // Token mismatch: user discarded this generation while in flight
      if (aiGenerationTokenRef.current !== token) return;

      setAiContent(result);
      setOverrides({});
    } catch (err) {
      // Token mismatch: do not surface error for discarded generation
      if (aiGenerationTokenRef.current !== token) return;

      if (err instanceof ApiClientError) {
        setAiError(translateApiError(err.error.code, tErrors));
      } else {
        setAiError(t('sourceReports.editable.aiGenerationFailed'));
      }
    } finally {
      if (aiGenerationTokenRef.current === token) {
        setIsGeneratingAi(false);
      }
    }
  }, [report, useCase, excludedLineIds, excludedInvoiceIds, sourceId, reportLanguage, t, tErrors]);

  // Handle generate with AI button click
  const handleGenerateWithAiClick = useCallback(() => {
    const isDirty = Object.keys(overrides).length > 0;

    if (isDirty) {
      pendingAiGenerationRef.current = runAiGeneration;
      setShowAiOverwriteConfirm(true);
    } else {
      void runAiGeneration();
    }
  }, [overrides, runAiGeneration]);

  const steps: WizardStep[] = [
    { id: 'use-case', label: t('sourceReports.stepper.useCase') },
    { id: 'source', label: t('sourceReports.stepper.source') },
    { id: 'invoices', label: t('sourceReports.stepper.invoices') },
    { id: 'settings', label: t('sourceReports.stepper.settings') },
    { id: 'actions', label: t('sourceReports.stepper.options') },
  ];

  const coverLetterDisabled = !selectedSource?.contactAddress && !selectedSource?.reference;

  return (
    <PageLayout title={t('sourceReports.title')}>
      <SubNav tabs={BUDGET_TABS} ariaLabel={t('sourceReports.subNavAriaLabel')} />

      <WizardStepper
        steps={steps}
        currentStep={currentStep}
        maxReachedStep={maxReachedStep}
        onStepClick={(step) => setCurrentStep(step)}
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
                onClick={() => setCurrentStep(2)}
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
                onClick={() => setCurrentStep(1)}
              >
                {t('common:button.back')}
              </button>
              <button
                type="button"
                className={sharedStyles.btnPrimary}
                onClick={() => setCurrentStep(3)}
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
                      onToggle={(id, excluded) => {
                        guardedUpdate(() => {
                          const newSet = new Set(excludedInvoiceIds);
                          if (excluded) {
                            newSet.add(id);
                          } else {
                            newSet.delete(id);
                          }
                          setExcludedInvoiceIds(newSet);
                        });
                      }}
                      onToggleAll={(excludeAll) => {
                        guardedUpdate(() => {
                          if (excludeAll) {
                            setExcludedInvoiceIds(
                              new Set(report.invoices.map((inv) => inv.invoiceId)),
                            );
                          } else {
                            setExcludedInvoiceIds(new Set());
                          }
                        });
                      }}
                      onToggleLine={(lineId, excluded) => {
                        guardedUpdate(() => {
                          const newSet = new Set(excludedLineIds);
                          if (excluded) {
                            newSet.add(lineId);
                          } else {
                            newSet.delete(lineId);
                          }
                          setExcludedLineIds(newSet);
                        });
                      }}
                      t={t}
                    />
                    <div className={styles.buttonRow}>
                      <button
                        type="button"
                        className={sharedStyles.btnSecondary}
                        onClick={() => setCurrentStep(2)}
                      >
                        {t('common:button.back')}
                      </button>
                      <button
                        type="button"
                        className={sharedStyles.btnPrimary}
                        onClick={() => {
                          setMaxReachedStep((s) => Math.max(s, 4));
                          setCurrentStep(4);
                        }}
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
                guardedUpdate(() => setReportLanguageOverride(lang))
              }
              attachDocuments={attachDocuments}
              onAttachDocumentsChange={(value) => {
                guardedUpdate(() => setAttachDocuments(value));
              }}
              includeCoverLetter={includeCoverLetter}
              onIncludeCoverLetterChange={(value) => {
                guardedUpdate(() => setIncludeCoverLetter(value));
              }}
              coverLetterDisabled={coverLetterDisabled}
              t={t}
            />
            <div className={styles.buttonRow}>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={() => setCurrentStep(3)}
              >
                {t('common:button.back')}
              </button>
              <button
                type="button"
                className={sharedStyles.btnPrimary}
                onClick={() => {
                  setMaxReachedStep((s) => Math.max(s, 5));
                  setCurrentStep(5);
                }}
              >
                {t('common:button.next')}
              </button>
            </div>
          </div>
        )}

        {currentStep === 5 && effectiveContent && (
          <div className={styles.step4Body}>
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
                  disabled={isGeneratingAi}
                  aria-describedby="enhanceWithAiDescription"
                >
                  {isGeneratingAi && (
                    <span aria-hidden="true">
                      <Spinner size="sm" color="muted" />
                    </span>
                  )}
                  {t('sourceReports.editable.enhanceWithAi')}
                </button>
                <span id="enhanceWithAiDescription" className={sharedStyles.srOnly}>
                  {t('sourceReports.editable.enhanceWithAiDescription')}
                </span>

                {isGeneratingAi && (
                  <p className={styles.aiGeneratingCaption} aria-live="polite">
                    {t('sourceReports.editable.generating', { seconds: aiElapsed })}
                  </p>
                )}

                {aiError && <FormError message={aiError} />}

                {aiContent && !isGeneratingAi && (
                  <p className={styles.aiGeneratedNote}>
                    {t('sourceReports.editable.aiGeneratedNote')}
                  </p>
                )}
              </div>
            )}

            <ReportContentEditor
              content={effectiveContent}
              overrides={overrides}
              onFieldChange={(key, value) => {
                setOverrides((prev) => ({ ...prev, [key]: value }));
              }}
              onFieldReset={(key) => {
                setOverrides((prev) => {
                  const next = { ...prev };
                  delete next[key];
                  return next;
                });
              }}
              t={t}
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
                onClick={() => setCurrentStep(4)}
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
            isGeneratingAi && Object.keys(overrides).length === 0 && aiContent === null
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
            {isGeneratingAi && Object.keys(overrides).length === 0 && aiContent === null
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
