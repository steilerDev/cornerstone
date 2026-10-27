import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { BudgetSourceDetailResponse, BudgetSourceStatus } from '@cornerstone/shared';
import { BudgetBar } from '../../components/BudgetBar/BudgetBar.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { useDocumentsPanel } from '../../components/DocumentsPanel/index.js';
import { useRevertSubmission } from '../../components/FeedRow/useRevertSubmission.js';
import { ObjectHistorySection } from '../../components/FeedRow/ObjectHistorySection.js';
import { MassMoveModal } from '../../components/MassMoveModal/MassMoveModal.js';
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
import { SourceBudgetLinePanel } from '../../components/SourceBudgetLinePanel/SourceBudgetLinePanel.js';
import type { SourceBudgetLinePanelHandle } from '../../components/SourceBudgetLinePanel/SourceBudgetLinePanel.js';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu.js';
import { fundingSourceTransitions } from '../../components/StatusMenu/statusVocabularies.js';
import { SummaryStrip } from '../../components/SummaryStrip/SummaryStrip.js';
import type { SummaryFact } from '../../components/SummaryStrip/SummaryStrip.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { deleteBudgetSource } from '../../lib/budgetSourcesApi.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { focusPageHeadingWhenReady } from '../../lib/focusPageHeading.js';
import { useFormatters } from '../../lib/formatters.js';
import { formatRate } from '../../lib/formatRate.js';
import { changeFundingSourceStatus } from '../../lib/statusChangeApi.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import sharedStyles from '../../styles/shared.module.css';
import { financingBar } from './financingBar.js';
import { FundingSourceDetailsSection } from './FundingSourceDetailsSection.js';
import { fundingSourcePrimary } from './fundingSourceHeaderActions.js';
import { useFundingSourceRecord, useSourceBudgetLines } from './useFundingSourceRecord.js';
import type { UseFundingSourceRecordResult } from './useFundingSourceRecord.js';
import styles from './FundingSourcePage.module.css';

/** Reads the route id once; the view below always has a funding source id. */
export function FundingSourcePage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to={routeUrl('financing')} replace />;
  return <FundingSourceView id={id} />;
}

function FundingSourceView({ id }: { id: string }) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const state = useFundingSourceRecord(id);
  const { record, isLoading, error } = state;

  const sourceTitle = t('financing.nouns.sourceTitle');
  const h1Text = !isLoading && record ? record.budgetSource.name : sourceTitle;
  useDocumentTitle(h1Text);
  const originState = useOriginState(record ? record.budgetSource.name : null);

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
    <FundingSourceLoaded
      id={id}
      record={record}
      state={state}
      h1Text={h1Text}
      originState={originState}
    />
  );
}

interface FundingSourceLoadedProps {
  readonly id: string;
  readonly record: BudgetSourceDetailResponse;
  readonly state: UseFundingSourceRecordResult;
  readonly h1Text: string;
  readonly originState: ReturnType<typeof useOriginState>;
}

function FundingSourceLoaded({ id, record, state, h1Text, originState }: FundingSourceLoadedProps) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { formatCurrency, formatSignedCurrency, formatPercent } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const { run: runStatusChange } = useUndoableStatusChange();
  const logPrimary = useLogPrimary('source-primary-log');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<SourceBudgetLinePanelHandle>(null);
  const focusPanelAfterSelectRef = useRef(false);

  const { budgetSource: source, money } = record;
  const own = source.isDiscretionary;
  const over = money.overAllocated > 0;

  const documents = useDocumentsPanel('budget_source', id);
  const tabs = useObjectTabs(['overview', 'cost', 'history']);
  const lines = useSourceBudgetLines(id);
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const deleteConsequences = useDeleteImpact('budget_source', showDelete ? id : null);

  // "Move lines…" selects the Cost tab first; its panel exists once the tab is active.
  useEffect(() => {
    if (focusPanelAfterSelectRef.current && tabs.active === 'cost') {
      focusPanelAfterSelectRef.current = false;
      panelRef.current?.focusFirstCheckbox();
    }
  }, [tabs.active]);

  const transitions = fundingSourceTransitions(tc, source);
  const applyStatus = (to: BudgetSourceStatus) =>
    runStatusChange({
      request: () => changeFundingSourceStatus(id, to),
      recordName: source.name,
      statusLabel: statusVariants.fundingSource[to].label,
      dedupeKey: `budget_source:${id}`,
      onChanged: () => void state.refresh(),
      onUndone: async () => {
        await state.refresh();
      },
    });
  const statusMenuProps = {
    transitions,
    badge: { variants: statusVariants.fundingSource, value: source.status },
    currentLabel: statusVariants.fundingSource[source.status].label,
    focusFallbackRef: headingRef,
    onApply: applyStatus,
  };

  const revert = useRevertSubmission({
    onChanged: () => {
      void state.refresh();
      lines.reload();
    },
    returnFocusRef: headingRef,
  });

  const chosen = fundingSourcePrimary(source.sourceType, forwardActionTo(transitions));
  let primary: ObjectHeaderPrimary<BudgetSourceStatus>;
  if (chosen.kind === 'bankReport') {
    primary = {
      kind: 'link',
      label: t('financing.actions.prepareBankReport'),
      to: routeUrl('bankReport', undefined, { type: 'claim', sourceId: id }),
      state: originState,
      testId: 'source-primary-bank-report',
    };
  } else if (chosen.kind === 'status') {
    primary = {
      kind: 'status',
      status: { ...statusMenuProps, actionTo: chosen.to, testId: 'source-primary-status' },
    };
  } else {
    primary = logPrimary;
  }

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
      await deleteBudgetSource(id);
      showToast('success', t('financing.deleted', { name: source.name }));
      navigate(routeUrl('financing'), { replace: true });
      focusPageHeadingWhenReady();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteBlocked(err.statusCode === 409);
        setDeleteError(translateApiError(err.error.code, tErrors));
      } else {
        setDeleteError(t('financing.sourcePage.deleteError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const costFact = (factId: 'paid' | 'submitted', label: string, amount: number): SummaryFact => ({
    id: factId,
    kind: 'tab',
    href: tabs.hrefFor('cost'),
    onActivate: () => tabs.select('cost', { focusPanel: true }),
    label,
    value: formatCurrency(amount),
    ...(factId === 'paid' ? { figureKind: 'paid' as const } : {}),
  });

  const facts: SummaryFact[] = [];
  facts.push({
    id: 'amount',
    kind: 'static',
    label: t('financing.figures.amount'),
    value: formatCurrency(money.amount),
  });
  facts.push({
    id: 'allocated',
    kind: 'static',
    label: t('financing.figures.allocated'),
    value: formatCurrency(money.allocated),
  });
  facts.push(costFact('paid', t('financing.figures.paid'), money.paid));
  facts.push(costFact('submitted', t('financing.figures.submitted'), money.submitted));
  facts.push({
    id: 'unallocated',
    kind: 'static',
    label: t('financing.figures.unallocated'),
    value: over ? (
      <span className={styles.danger}>{formatSignedCurrency(-money.overAllocated)}</span>
    ) : (
      formatCurrency(money.unallocated)
    ),
    wide: over,
  });
  if (!own && source.interestRate !== null) {
    facts.push({
      id: 'rate',
      kind: 'static',
      label: t('financing.figures.rate'),
      value: formatRate(source.interestRate, formatPercent),
    });
  }
  if (documents.fact) facts.push(documents.fact);

  const bar = financingBar(money, {
    submitted: t('financing.figures.submitted'),
    paid: t('financing.figures.paid'),
    allocated: t('financing.figures.allocated'),
  });
  const legend = [
    {
      key: 'submitted',
      label: t('financing.figures.submitted'),
      amount: money.submitted,
    },
    {
      key: 'paid',
      label: t('financing.figures.paid'),
      amount: money.paid,
    },
    {
      key: 'allocated',
      label: t('financing.figures.allocated'),
      amount: money.allocated,
    },
  ];

  // What the move dialog needs from the selection.
  const move = useMemo(() => {
    const workItemBudgetIds: string[] = [];
    const householdItemBudgetIds: string[] = [];
    let claimedCount = 0;
    for (const line of lines.data?.workItemLines ?? []) {
      if (!selection.has(line.id)) continue;
      workItemBudgetIds.push(line.id);
      if (line.hasClaimedInvoice) claimedCount += 1;
    }
    for (const line of lines.data?.householdItemLines ?? []) {
      if (!selection.has(line.id)) continue;
      householdItemBudgetIds.push(line.id);
      if (line.hasClaimedInvoice) claimedCount += 1;
    }
    return { workItemBudgetIds, householdItemBudgetIds, claimedCount };
  }, [lines.data, selection]);

  const lineCount =
    lines.isLoading || !lines.data
      ? null
      : lines.data.workItemLines.length + lines.data.householdItemLines.length;

  const header = (
    <ObjectHeader
      title={h1Text}
      breadcrumbs={<PageBreadcrumbs />}
      headingRef={headingRef}
      testId="source-header"
      status={<StatusMenu {...statusMenuProps} testId="source-status-badge" />}
      primary={primary}
      menu={own ? {} : { onDelete: openDelete }}
    />
  );

  return (
    <PageLayout header={header}>
      <SummaryStrip
        typeLabel={t('financing.nouns.sourceTitle')}
        facts={facts}
        testId="source-summary"
      />

      <ObjectTabs
        controller={tabs}
        typeLabel={t('financing.nouns.sourceTitle')}
        idPrefix="source-tabs"
        counts={{ cost: lineCount }}
        panels={{
          overview: () => (
            <div className={styles.overview}>
              {over && (
                <div className={styles.warning} data-testid="source-over-allocated">
                  <p className={styles.warningText}>
                    {t('financing.overAllocatedWarning', {
                      amount: formatCurrency(money.overAllocated),
                    })}
                  </p>
                  <button
                    type="button"
                    className={styles.moveLines}
                    onClick={() => {
                      focusPanelAfterSelectRef.current = true;
                      tabs.select('cost');
                    }}
                    data-testid="source-move-lines"
                  >
                    {t('financing.moveLines')}
                  </button>
                </div>
              )}
              <SectionCard
                id="source-allocation"
                title={t('financing.sections.allocation')}
                testId="source-allocation"
              >
                <BudgetBar
                  segments={bar.segments}
                  maxValue={bar.maxValue}
                  overflow={bar.overflow}
                  overflowNote={
                    over
                      ? t('financing.overAllocatedBy', {
                          amount: formatCurrency(money.overAllocated),
                        })
                      : undefined
                  }
                  height="md"
                  formatValue={formatCurrency}
                />
                <ul className={styles.legend} data-testid="source-allocation-legend">
                  {legend.map((item) => (
                    <li key={item.key} className={styles.legendItem}>
                      <span className={styles.swatch} data-segment={item.key} aria-hidden="true" />
                      <span>{item.label}</span>
                      <span className={styles.legendAmount}>{formatCurrency(item.amount)}</span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
              <FundingSourceDetailsSection source={source} onSaved={state.refresh} />
            </div>
          ),
          cost: () => (
            <div className={styles.costCard}>
              <SourceBudgetLinePanel
                ref={panelRef}
                sourceId={id}
                sourceName={source.name}
                data={lines.data}
                isLoading={lines.isLoading}
                error={lines.error}
                onRetry={lines.reload}
                selectedLineIds={selection}
                onSelectionChange={setSelection}
                onMoveLines={() => setMoveOpen(true)}
              />
            </div>
          ),
          history: () => (
            <ObjectHistorySection
              entityType="budget_source"
              entityId={id}
              revision={state.revision}
              testIdPrefix="source-history"
              renderRowActions={revert.renderRowActions}
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

      {revert.dialog}

      {moveOpen && (
        <MassMoveModal
          sourceId={id}
          sourceName={source.name}
          selectedLineIds={selection}
          claimedCount={move.claimedCount}
          workItemBudgetIds={move.workItemBudgetIds}
          householdItemBudgetIds={move.householdItemBudgetIds}
          onClose={() => setMoveOpen(false)}
          onSuccess={(movedCount, targetName) => {
            setMoveOpen(false);
            setSelection(new Set());
            showToast('success', t('financing.moved', { count: movedCount, name: targetName }));
            lines.reload();
            void state.refresh();
          }}
        />
      )}

      {showDelete && (
        <ConfirmDialog
          title={t('financing.delete.titleSource', { object: t('financing.nouns.source') })}
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
          testIdPrefix="source-delete"
        />
      )}
    </PageLayout>
  );
}

export default FundingSourcePage;
