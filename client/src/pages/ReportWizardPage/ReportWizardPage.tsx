import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { BudgetSource, SourceReportType, HouseholdSettings } from '@cornerstone/shared';
import { fetchBudgetSources } from '../../lib/budgetSourcesApi.js';
import { fetchHouseholdSettings } from '../../lib/settingsApi.js';
import { getSourceReport, markInvoicesClaimed } from '../../lib/sourceReportsApi.js';
import { getPaperlessStatus } from '../../lib/paperlessApi.js';
import { useFormatters } from '../../lib/formatters.js';
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
import { ReportInvoiceList } from '../../components/reports/ReportInvoiceList.js';
import { ReportPdfPreview } from '../../components/reports/ReportPdfPreview.js';
import { BUDGET_TABS } from '../shared/budgetTabs.js';
import { Step1UseCase } from './Step1UseCase.js';
import { Step2Source } from './Step2Source.js';
import { Step4Options } from './Step4Options.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './ReportWizardPage.module.css';

type PageStatus = 'loading' | 'ready' | 'error';

export function ReportWizardPage() {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { showToast } = useToast();
  const formatters = useFormatters();
  const [searchParams] = useSearchParams();

  // Step navigation
  const [currentStep, setCurrentStep] = useState(1);
  const [maxReachedStep, setMaxReachedStep] = useState(1);

  // Focus management for step headings
  const stepHeadingsRef = useRef<(HTMLHeadingElement | null)[]>([]);

  // Use case selection
  const [useCase, setUseCase] = useState<SourceReportType | null>(null);

  // Budget sources
  const [budgetSources, setBudgetSources] = useState<BudgetSource[]>([]);
  const [sourcesStatus, setSourcesStatus] = useState<PageStatus>('loading');

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

  // PDF generation
  const [attachDocuments, setAttachDocuments] = useState(true);
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [skippedDocuments, setSkippedDocuments] = useState<SkippedDocument[]>([]);

  // Refs for PDF generation tracking
  const previewUrlRef = useRef<string | null>(null);
  const generationIdRef = useRef<number>(0);
  const hasGeneratedRef = useRef(false);

  // Household settings
  const [household, setHousehold] = useState<HouseholdSettings | null>(null);

  // Claim flow
  const [showClaimConfirm, setShowClaimConfirm] = useState(false);
  const [isMarkingClaimed, setIsMarkingClaimed] = useState(false);
  const [claimError, setClaimError] = useState<string>('');
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [claimedCount, setClaimedCount] = useState(0);
  const [finishedWithoutMarking, setFinishedWithoutMarking] = useState(false);

  // Paperless status
  const [paperlessStatus, setPaperlessStatus] = useState<Awaited<
    ReturnType<typeof getPaperlessStatus>
  > | null>(null);

  // Load initial data
  useEffect(() => {
    const init = async () => {
      try {
        const [sources, settings, status] = await Promise.all([
          fetchBudgetSources(),
          fetchHouseholdSettings(),
          getPaperlessStatus(),
        ]);
        setBudgetSources(sources.budgetSources);
        setHousehold(settings);
        setPaperlessStatus(status);
        setSourcesStatus('ready');
      } catch {
        setSourcesStatus('error');
      }
    };
    void init();
  }, []);

  // Handle use case selection
  const handleUseCaseChange = useCallback(
    (uc: SourceReportType) => {
      setUseCase(uc);
      setMaxReachedStep(2);
      setStep2Amounts(new Map());
      setStep2Loading(true);

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
    },
    [budgetSources],
  );

  // Handle source selection
  const handleSourceChange = useCallback(
    (sid: string) => {
      setSourceId(sid);
      setExcludedInvoiceIds(new Set());
      setMaxReachedStep(3);
      setReportStatus('loading');

      if (useCase) {
        getSourceReport(useCase, sid)
          .then((r) => {
            setReport(r);
            hasGeneratedRef.current = false;
            // Auto-enable cover letter based on source
            setIncludeCoverLetter(Boolean(r.source.contactAddress || r.source.reference));
            setReportStatus('ready');
          })
          .catch((err) => {
            console.error(err);
            setReportStatus('error');
          });
      }
    },
    [useCase],
  );

  // Handle ?sourceId= query parameter deep link
  useEffect(() => {
    if (useCase && sourceIdFromQuery && !report) {
      handleSourceChange(sourceIdFromQuery);
    }
  }, [useCase, sourceIdFromQuery, report, handleSourceChange]);

  // Regenerate PDF on options change (debounced)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const regeneratePdf = useCallback(async () => {
    // Allow regeneration if we have report+useCase (for retries after errors or option changes)
    if (!report || !useCase) return;

    // Capture current generation ID to detect stale results
    const myGenerationId = ++generationIdRef.current;

    setIsRegenerating(true);
    try {
      const included = new Set(
        report.invoices
          .filter((inv) => !excludedInvoiceIds.has(inv.invoiceId))
          .map((inv) => inv.invoiceId),
      );

      const result = await generateReportPdf(
        report,
        included,
        useCase,
        { attachDocuments, includeCoverLetter },
        household,
        t,
        formatters,
      );

      // Bail if a newer generation has started
      if (myGenerationId !== generationIdRef.current) return;

      // Revoke previous URL
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }

      setPreviewBlob(result.blob);
      const newUrl = createPreviewUrl(result.blob);
      setPreviewUrl(newUrl);
      previewUrlRef.current = newUrl;
      setSkippedDocuments(result.skippedDocuments);
      setPreviewError(false);
    } catch (err) {
      console.error(err);
      // Bail if a newer generation has started
      if (myGenerationId !== generationIdRef.current) return;
      setPreviewBlob(null);
      setPreviewUrl(null);
      previewUrlRef.current = null;
      setPreviewError(true);
    } finally {
      setIsRegenerating(false);
    }
  }, [report, useCase, excludedInvoiceIds, attachDocuments, includeCoverLetter, household, t]);

  // PDF generation: immediate on first load, debounced on option changes
  useEffect(() => {
    if (!report || !useCase || reportStatus !== 'ready') return;

    const isFirstGeneration = !hasGeneratedRef.current;

    if (isFirstGeneration) {
      // Immediate generation for first PDF
      hasGeneratedRef.current = true;
      void regeneratePdf();
    } else {
      // Debounced regeneration on option/exclusion changes
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        void regeneratePdf();
      }, 400);

      return () => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
      };
    }
  }, [
    report,
    useCase,
    reportStatus,
    household,
    attachDocuments,
    includeCoverLetter,
    excludedInvoiceIds,
    regeneratePdf,
  ]);

  // Handle claim
  const handleMarkClaimed = async () => {
    if (!report) return;

    const included = report.invoices
      .filter((inv) => !excludedInvoiceIds.has(inv.invoiceId))
      .map((inv) => inv.invoiceId);

    setIsMarkingClaimed(true);
    try {
      await markInvoicesClaimed(included);
      setClaimedCount(included.length);
      setClaimSuccess(true);
      setShowClaimConfirm(false);
    } catch (err) {
      if (err instanceof ApiClientError && err.error.code === 'INVOICES_NOT_CLAIMABLE') {
        setClaimError(translateApiError('INVOICES_NOT_CLAIMABLE', tErrors));
        setShowClaimConfirm(false);
        // Refetch silently
        if (useCase && sourceId) {
          try {
            const updated = await getSourceReport(useCase, sourceId);
            setReport(updated);
            hasGeneratedRef.current = false;
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

  // Handle download
  const handleDownload = () => {
    if (!previewBlob || !selectedSource || !useCase) return;

    const today = new Date().toISOString().slice(0, 10);
    const slug = selectedSource.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '');
    const filename = `${useCase}-${slug}-${today}.pdf`;

    downloadPdf(previewBlob, filename);
  };

  // Handle upload to Paperless
  const handleUploadPaperless = async () => {
    if (!previewBlob || !selectedSource || !useCase) return;

    try {
      const today = new Date().toISOString().slice(0, 10);
      const slug = selectedSource.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '');
      const title = `${useCase}-${slug}-${today}`;

      await uploadToPaperless(previewBlob, title);
      showToast('success', t('sourceReports.uploadSuccess'));
    } catch (err) {
      if (err instanceof ApiClientError) {
        showToast('error', translateApiError(err.error.code, tErrors));
      } else {
        showToast('error', t('sourceReports.uploadFailed'));
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
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

  const steps: WizardStep[] = [
    { id: 'use-case', label: t('sourceReports.stepper.useCase') },
    { id: 'source', label: t('sourceReports.stepper.source') },
    { id: 'invoices', label: t('sourceReports.stepper.invoices') },
    { id: 'options', label: t('sourceReports.stepper.options') },
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
            {reportStatus === 'ready' && report && (
              <>
                <ReportInvoiceList
                  report={report}
                  excludedInvoiceIds={excludedInvoiceIds}
                  onToggle={(id, excluded) => {
                    const newSet = new Set(excludedInvoiceIds);
                    if (excluded) {
                      newSet.add(id);
                    } else {
                      newSet.delete(id);
                    }
                    setExcludedInvoiceIds(newSet);
                  }}
                  onToggleAll={(excludeAll) => {
                    if (excludeAll) {
                      setExcludedInvoiceIds(new Set(report.invoices.map((inv) => inv.invoiceId)));
                    } else {
                      setExcludedInvoiceIds(new Set());
                    }
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
            )}
          </div>
        )}

        {currentStep === 4 && (
          <div className={styles.step4Body}>
            <h2
              ref={(el) => {
                stepHeadingsRef.current[3] = el;
              }}
              tabIndex={-1}
            >
              {steps[3]?.label}
            </h2>
            {previewError && !isRegenerating && (
              <FormError message={t('sourceReports.previewGenerationFailed')} />
            )}
            <div className={styles.step4Layout}>
              <Step4Options
                attachDocuments={attachDocuments}
                onAttachDocumentsChange={setAttachDocuments}
                includeCoverLetter={includeCoverLetter}
                onIncludeCoverLetterChange={setIncludeCoverLetter}
                coverLetterDisabled={coverLetterDisabled}
                useCase={useCase!}
                paperlessStatus={paperlessStatus}
                isMarkingClaimed={isMarkingClaimed}
                claimError={claimError}
                claimSuccess={claimSuccess}
                claimedCount={claimedCount}
                finishedWithoutMarking={finishedWithoutMarking}
                selectedInvoiceCount={report ? report.invoices.length - excludedInvoiceIds.size : 0}
                onDownload={handleDownload}
                onMarkClaimed={() => setShowClaimConfirm(true)}
                onFinishWithoutMarking={() => {
                  setFinishedWithoutMarking(true);
                  setClaimSuccess(true);
                }}
                onUploadPaperless={handleUploadPaperless}
                isSaving={isRegenerating}
                hasError={previewError}
                hasBlob={!!previewBlob}
                t={t}
              />

              <ReportPdfPreview
                blobUrl={previewUrl}
                isRegenerating={isRegenerating}
                hasError={previewError}
                onRetry={() => {
                  if (report && useCase) {
                    // Regenerate PDF
                    void regeneratePdf();
                  }
                }}
                t={t}
              />
            </div>

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

            <div className={styles.buttonRow}>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={() => setCurrentStep(3)}
              >
                {t('common:button.back')}
              </button>
            </div>
          </div>
        )}
      </div>

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
        </Modal>
      )}
    </PageLayout>
  );
}
