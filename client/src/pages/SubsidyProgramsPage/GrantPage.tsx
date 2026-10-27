import { useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { SubsidyApplicationStatus, SubsidyProgramDetailResponse } from '@cornerstone/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { useDocumentsPanel } from '../../components/DocumentsPanel/index.js';
import { ObjectHistorySection } from '../../components/FeedRow/ObjectHistorySection.js';
import {
  forwardActionTo,
  ObjectHeader,
  useLogPrimary,
} from '../../components/ObjectHeader/index.js';
import type { ObjectHeaderPrimary } from '../../components/ObjectHeader/index.js';
import { ObjectTabs } from '../../components/ObjectTabs/ObjectTabs.js';
import { useObjectTabs } from '../../components/ObjectTabs/useObjectTabs.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu.js';
import { grantTransitions } from '../../components/StatusMenu/statusVocabularies.js';
import { SummaryStrip } from '../../components/SummaryStrip/SummaryStrip.js';
import type { SummaryFact } from '../../components/SummaryStrip/SummaryStrip.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { focusPageHeadingWhenReady } from '../../lib/focusPageHeading.js';
import { useFormatters } from '../../lib/formatters.js';
import { formatRate } from '../../lib/formatRate.js';
import { todayLocalIsoDate } from '../../lib/localDate.js';
import { changeGrantStatus } from '../../lib/statusChangeApi.js';
import { deleteSubsidyProgram } from '../../lib/subsidyProgramsApi.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import sharedStyles from '../../styles/shared.module.css';
import { GrantDetailsSection } from './GrantDetailsSection.js';
import { GrantEligibilitySection } from './GrantEligibilitySection.js';
import { grantPrimary } from './grantHeaderActions.js';
import { GrantWorkPanel } from './GrantWorkPanel.js';
import { useGrantRecord } from './useGrantRecord.js';
import type { UseGrantRecordResult } from './useGrantRecord.js';
import styles from './GrantPage.module.css';

/** Reads the route id once; the view below always has a grant id. */
export function GrantPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to={routeUrl('financing')} replace />;
  return <GrantView id={id} />;
}

function GrantView({ id }: { id: string }) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const state = useGrantRecord(id);
  const { record, isLoading, error } = state;

  const h1Text =
    !isLoading && record ? record.subsidyProgram.name : t('financing.nouns.grantTitle');
  useDocumentTitle(h1Text);
  const originState = useOriginState(record ? record.subsidyProgram.name : null);

  if (isLoading) {
    return (
      <PageLayout title={h1Text} breadcrumbs={<PageBreadcrumbs />}>
        <Skeleton lines={4} />
      </PageLayout>
    );
  }

  if (error || !record) {
    return (
      <PageLayout title={h1Text} breadcrumbs={<PageBreadcrumbs />}>
        <div className={styles.errorCard} role="alert">
          <p>{error}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={sharedStyles.btnSecondary}
              onClick={() => navigate(routeUrl('financing'))}
            >
              {tc('navigation.backTo', { origin: tc('navigation.financing') })}
            </button>
            <button
              type="button"
              className={sharedStyles.btnSecondary}
              onClick={() => void state.reload()}
            >
              {t('financing.retry')}
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <GrantLoaded id={id} record={record} state={state} h1Text={h1Text} originState={originState} />
  );
}

interface GrantLoadedProps {
  readonly id: string;
  readonly record: SubsidyProgramDetailResponse;
  readonly state: UseGrantRecordResult;
  readonly h1Text: string;
  readonly originState: ReturnType<typeof useOriginState>;
}

function GrantLoaded({ id, record, state, h1Text, originState }: GrantLoadedProps) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { formatCurrency, formatDate, formatPercent } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const { run: runStatusChange } = useUndoableStatusChange();
  const logPrimary = useLogPrimary('grant-primary-log');
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Today is read once, when the page mounts (not on every render).
  const [today] = useState(() => todayLocalIsoDate());

  const { subsidyProgram: grant, money } = record;
  const fixed = grant.reductionType === 'fixed';
  const documents = useDocumentsPanel('subsidy_program', id);
  const tabs = useObjectTabs(['overview', 'work', 'history']);

  const [showDelete, setShowDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const deleteConsequences = useDeleteImpact('subsidy_program', showDelete ? id : null);

  const transitions = grantTransitions(tc, grant);
  const applyStatus = (to: SubsidyApplicationStatus) =>
    runStatusChange({
      request: () => changeGrantStatus(id, to),
      recordName: grant.name,
      statusLabel: statusVariants.grant[to].label,
      dedupeKey: `subsidy_program:${id}`,
      onChanged: () => void state.refresh(),
      onUndone: async () => {
        await state.refresh();
      },
    });
  const statusMenuProps = {
    transitions,
    badge: { variants: statusVariants.grant, value: grant.applicationStatus },
    currentLabel: statusVariants.grant[grant.applicationStatus].label,
    focusFallbackRef: headingRef,
    onApply: applyStatus,
  };

  const chosen = grantPrimary(forwardActionTo(transitions));
  const primary: ObjectHeaderPrimary<SubsidyApplicationStatus> =
    chosen.kind === 'status'
      ? {
          kind: 'status',
          status: { ...statusMenuProps, actionTo: chosen.to, testId: 'grant-primary-status' },
        }
      : logPrimary;

  const openDelete = () => {
    setDeleteError('');
    setDeleteBlocked(false);
    setShowDelete(true);
  };
  const closeDelete = () => {
    setShowDelete(false);
    setDeleteError('');
    setDeleteBlocked(false);
  };
  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteSubsidyProgram(id);
      showToast('success', t('financing.deleted', { name: grant.name }));
      navigate(routeUrl('financing'), { replace: true });
      focusPageHeadingWhenReady();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteBlocked(err.statusCode === 409);
        setDeleteError(translateApiError(err.error.code, tErrors));
      } else {
        setDeleteError(t('financing.grantPage.deleteError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const overdue =
    grant.applicationDeadline !== null &&
    grant.applicationDeadline < today &&
    grant.applicationStatus !== 'received' &&
    grant.applicationStatus !== 'rejected';

  const facts: SummaryFact[] = [];
  facts.push({
    id: 'rate',
    kind: 'static',
    label: t('financing.figures.rate'),
    value: fixed ? (
      <>
        <span className={sharedStyles.srOnly}>{t('financing.grant.fixedReductionField')} </span>
        {formatCurrency(grant.reductionValue)}
      </>
    ) : (
      formatRate(grant.reductionValue, formatPercent)
    ),
  });
  facts.push({
    id: 'cap',
    kind: 'static',
    label: t('financing.grant.cap'),
    value:
      grant.maximumAmount === null
        ? t('financing.grant.noCap')
        : formatCurrency(grant.maximumAmount),
  });
  facts.push({
    id: 'expected',
    kind: 'static',
    label: t('financing.grant.expected'),
    value: formatCurrency(money.expected.expected),
  });
  facts.push({
    id: 'deadline',
    kind: 'static',
    label: t('financing.grant.deadline'),
    value:
      grant.applicationDeadline === null ? null : (
        <>
          {formatDate(grant.applicationDeadline)}
          {overdue && (
            <>
              {' '}
              <span className={styles.danger}>{t('financing.grant.overdue')}</span>
            </>
          )}
        </>
      ),
  });
  if (documents.fact) facts.push(documents.fact);

  const covered = formatCurrency(money.eligibleCost.expected);
  const cap = grant.maximumAmount === null ? null : formatCurrency(grant.maximumAmount);
  let explanation: string;
  if (fixed) {
    explanation =
      cap === null
        ? t('financing.grant.explanationFixedNoCap', {
            amount: formatCurrency(grant.reductionValue),
          })
        : t('financing.grant.explanationFixed', {
            amount: formatCurrency(grant.reductionValue),
            cap,
          });
  } else {
    const rate = formatRate(grant.reductionValue, formatPercent);
    explanation =
      cap === null
        ? t('financing.grant.explanationNoCap', { rate, covered })
        : t('financing.grant.explanation', { rate, covered, cap });
  }

  const header = (
    <ObjectHeader
      title={h1Text}
      breadcrumbs={<PageBreadcrumbs />}
      headingRef={headingRef}
      testId="grant-header"
      status={<StatusMenu {...statusMenuProps} testId="grant-status-badge" />}
      primary={primary}
      menu={{ onDelete: openDelete }}
    />
  );

  return (
    <PageLayout header={header}>
      <SummaryStrip
        typeLabel={t('financing.nouns.grantTitle')}
        facts={facts}
        columns={5}
        testId="grant-summary"
      />

      <ObjectTabs
        controller={tabs}
        typeLabel={t('financing.nouns.grantTitle')}
        idPrefix="grant-tabs"
        panels={{
          overview: () => (
            <div className={styles.overview}>
              <GrantDetailsSection grant={grant} onSaved={state.refresh} />
              <GrantEligibilitySection grant={grant} onSaved={state.refresh} />
              <SectionCard
                id="grant-explanation"
                title={t('financing.grant.explanationTitle')}
                testId="grant-explanation"
              >
                <p className={styles.explanation} data-testid="grant-explanation-text">
                  {explanation}
                </p>
              </SectionCard>
            </div>
          ),
          work: () => (
            <GrantWorkPanel
              grantId={id}
              expectedAmount={money.expected.expected}
              onChanged={() => void state.refresh()}
              originState={originState}
            />
          ),
          history: () => (
            <ObjectHistorySection
              entityType="subsidy_program"
              entityId={id}
              revision={state.revision}
              testIdPrefix="grant-history"
              labels={{
                title: t('financing.history.title'),
                empty: t('financing.history.empty'),
                loadError: t('financing.history.loadError'),
                retry: t('financing.history.retry'),
                showAll: t('financing.history.showAll'),
              }}
            />
          ),
        }}
      />

      {documents.panel}

      {showDelete && (
        <ConfirmDialog
          title={t('financing.delete.titleGrant', { object: t('financing.nouns.grant') })}
          consequences={deleteConsequences}
          irreversible
          confirmLabel={tc('button.delete')}
          busyLabel={tc('confirmDialog.deleting')}
          busy={isDeleting}
          blocked={deleteBlocked}
          error={deleteError || null}
          onConfirm={() => void handleDelete()}
          onCancel={closeDelete}
          returnFocusRef={headingRef}
          testIdPrefix="grant-delete"
        />
      )}
    </PageLayout>
  );
}

export default GrantPage;
