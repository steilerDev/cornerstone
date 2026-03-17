import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  DashboardCardId,
  BudgetOverview,
  BudgetSource,
  TimelineResponse,
  Invoice,
  InvoiceStatusBreakdown,
  SubsidyProgram,
  DiaryEntrySummary,
} from '@cornerstone/shared';
import { fetchBudgetOverview } from '../../lib/budgetOverviewApi.js';
import { fetchBudgetSources } from '../../lib/budgetSourcesApi.js';
import { fetchSubsidyPrograms } from '../../lib/subsidyProgramsApi.js';
import { getTimeline } from '../../lib/timelineApi.js';
import { fetchAllInvoices } from '../../lib/invoicesApi.js';
import { listDiaryEntries } from '../../lib/diaryApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { usePreferences } from '../../hooks/usePreferences.js';
import { ProjectSubNav } from '../../components/ProjectSubNav/ProjectSubNav.js';
import { DashboardCard } from '../../components/DashboardCard/DashboardCard.js';
import { BudgetSummaryCard } from '../../components/BudgetSummaryCard/BudgetSummaryCard.js';
import { SourceUtilizationCard } from '../../components/SourceUtilizationCard/SourceUtilizationCard.js';
import { UpcomingMilestonesCard } from '../../components/TimelineStatusCards/UpcomingMilestonesCard.js';
import { WorkItemProgressCard } from '../../components/TimelineStatusCards/WorkItemProgressCard.js';
import { CriticalPathCard } from '../../components/TimelineStatusCards/CriticalPathCard.js';
import { MiniGanttCard } from '../../components/MiniGanttCard/MiniGanttCard.js';
import { QuickActionsCard } from '../../components/QuickActionsCard/QuickActionsCard.js';
import { InvoicePipelineCard } from '../../components/InvoicePipelineCard/InvoicePipelineCard.js';
import { SubsidyPipelineCard } from '../../components/SubsidyPipelineCard/SubsidyPipelineCard.js';
import { RecentDiaryCard } from '../../components/RecentDiaryCard/RecentDiaryCard.js';
import styles from './DashboardPage.module.css';

type DataSourceKey =
  | 'budgetOverview'
  | 'budgetSources'
  | 'timeline'
  | 'invoices'
  | 'subsidyPrograms'
  | 'diaryEntries';

type DashboardSection = 'primary' | 'timeline' | 'budget-details';

interface DataSourceState {
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
}


export function DashboardPage() {
  const { t } = useTranslation('dashboard');

  const CARD_DEFINITIONS = [
    {
      id: 'budget-summary' as DashboardCardId,
      title: t('cards.budgetSummary.title'),
      section: 'primary' as DashboardSection,
      dataSource: 'budgetOverview' as DataSourceKey,
    },
    {
      id: 'source-utilization' as DashboardCardId,
      title: t('cards.sourceUtilization.title'),
      section: 'budget-details' as DashboardSection,
      dataSource: 'budgetSources' as DataSourceKey,
      emptyMessage: t('cards.sourceUtilization.emptyMessage'),
      emptyAction: { label: t('cards.sourceUtilization.emptyAction'), href: '/budget/sources' },
    },
    {
      id: 'upcoming-milestones' as DashboardCardId,
      title: t('cards.upcomingMilestones.title'),
      section: 'timeline' as DashboardSection,
      dataSource: 'timeline' as DataSourceKey,
      emptyMessage: t('cards.upcomingMilestones.emptyMessage'),
    },
    {
      id: 'work-item-progress' as DashboardCardId,
      title: t('cards.workItemProgress.title'),
      section: 'timeline' as DashboardSection,
      dataSource: 'timeline' as DataSourceKey,
    },
    {
      id: 'critical-path' as DashboardCardId,
      title: t('cards.criticalPath.title'),
      section: 'timeline' as DashboardSection,
      dataSource: 'timeline' as DataSourceKey,
    },
    {
      id: 'mini-gantt' as DashboardCardId,
      title: t('cards.miniGantt.title'),
      section: 'timeline' as DashboardSection,
      dataSource: 'timeline' as DataSourceKey,
    },
    {
      id: 'invoice-pipeline' as DashboardCardId,
      title: t('cards.invoicePipeline.title'),
      section: 'primary' as DashboardSection,
      dataSource: 'invoices' as DataSourceKey,
      emptyMessage: t('cards.invoicePipeline.emptyMessage'),
      emptyAction: { label: t('cards.invoicePipeline.emptyAction'), href: '/budget/invoices' },
    },
    {
      id: 'subsidy-pipeline' as DashboardCardId,
      title: t('cards.subsidyPipeline.title'),
      section: 'budget-details' as DashboardSection,
      dataSource: 'subsidyPrograms' as DataSourceKey,
      emptyMessage: t('cards.subsidyPipeline.emptyMessage'),
      emptyAction: { label: t('cards.subsidyPipeline.emptyAction'), href: '/budget/subsidies' },
    },
    {
      id: 'recent-diary' as DashboardCardId,
      title: t('cards.recentDiary.title'),
      section: 'primary' as DashboardSection,
      dataSource: 'diaryEntries' as DataSourceKey,
    },
    {
      id: 'quick-actions' as DashboardCardId,
      title: t('cards.quickActions.title'),
      section: 'primary' as DashboardSection,
    },
  ] as const;

  const [dataStates, setDataStates] = useState<Record<DataSourceKey, DataSourceState>>({
    budgetOverview: { isLoading: true, error: null, isEmpty: false },
    budgetSources: { isLoading: true, error: null, isEmpty: false },
    subsidyPrograms: { isLoading: true, error: null, isEmpty: false },
    timeline: { isLoading: true, error: null, isEmpty: false },
    invoices: { isLoading: true, error: null, isEmpty: false },
    diaryEntries: { isLoading: true, error: null, isEmpty: false },
  });
  const [budgetOverview, setBudgetOverview] = useState<BudgetOverview | null>(null);
  const [budgetSources, setBudgetSources] = useState<BudgetSource[]>([]);
  const [timelineData, setTimelineData] = useState<TimelineResponse | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceSummary, setInvoiceSummary] = useState<InvoiceStatusBreakdown | null>(null);
  const [subsidyPrograms, setSubsidyPrograms] = useState<SubsidyProgram[]>([]);
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntrySummary[]>([]);

  const { preferences, upsert: upsertPreference } = usePreferences();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const customizeRef = useRef<HTMLDivElement>(null);

  // Parse hidden cards from preferences
  const hiddenCardIds = useMemo(() => {
    const pref = preferences.find((p) => p.key === 'dashboard.hiddenCards');
    if (!pref) return new Set<DashboardCardId>();
    try {
      const ids = JSON.parse(pref.value) as DashboardCardId[];
      return new Set(ids);
    } catch {
      return new Set<DashboardCardId>();
    }
  }, [preferences]);

  // Close customize dropdown on outside click
  useEffect(() => {
    if (!customizeOpen) return;
    function handleClick(e: MouseEvent) {
      if (customizeRef.current && !customizeRef.current.contains(e.target as Node)) {
        setCustomizeOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [customizeOpen]);

  // Close on Escape
  useEffect(() => {
    if (!customizeOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setCustomizeOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [customizeOpen]);

  const loadAllData = useCallback(async () => {
    const results = await Promise.allSettled([
      fetchBudgetOverview(),
      fetchBudgetSources(),
      fetchSubsidyPrograms(),
      getTimeline(),
      fetchAllInvoices({ pageSize: 10 }),
      listDiaryEntries({ pageSize: 5 }),
    ]);

    const [
      budgetOverviewResult,
      budgetSourcesResult,
      subsidyProgramsResult,
      timelineResult,
      invoicesResult,
      diaryEntriesResult,
    ] = results;

    // Update budget overview state
    if (budgetOverviewResult.status === 'fulfilled') {
      setBudgetOverview(budgetOverviewResult.value);
      setDataStates((prev) => ({
        ...prev,
        budgetOverview: {
          isLoading: false,
          error: null,
          isEmpty: false,
        },
      }));
    } else {
      const error = budgetOverviewResult.reason;
      const message =
        error instanceof ApiClientError ? error.error.message : 'Failed to load budget overview';
      setDataStates((prev) => ({
        ...prev,
        budgetOverview: {
          isLoading: false,
          error: message,
          isEmpty: false,
        },
      }));
    }

    // Update budget sources state
    if (budgetSourcesResult.status === 'fulfilled') {
      setBudgetSources(budgetSourcesResult.value.budgetSources);
      setDataStates((prev) => ({
        ...prev,
        budgetSources: {
          isLoading: false,
          error: null,
          isEmpty: budgetSourcesResult.value.budgetSources.length === 0,
        },
      }));
    } else {
      const error = budgetSourcesResult.reason;
      const message =
        error instanceof ApiClientError ? error.error.message : 'Failed to load budget sources';
      setDataStates((prev) => ({
        ...prev,
        budgetSources: {
          isLoading: false,
          error: message,
          isEmpty: false,
        },
      }));
    }

    // Update subsidy programs state
    if (subsidyProgramsResult.status === 'fulfilled') {
      setSubsidyPrograms(subsidyProgramsResult.value.subsidyPrograms);
      setDataStates((prev) => ({
        ...prev,
        subsidyPrograms: {
          isLoading: false,
          error: null,
          isEmpty: subsidyProgramsResult.value.subsidyPrograms.length === 0,
        },
      }));
    } else {
      const error = subsidyProgramsResult.reason;
      const message =
        error instanceof ApiClientError ? error.error.message : 'Failed to load subsidy programs';
      setDataStates((prev) => ({
        ...prev,
        subsidyPrograms: {
          isLoading: false,
          error: message,
          isEmpty: false,
        },
      }));
    }

    // Update timeline state
    if (timelineResult.status === 'fulfilled') {
      setTimelineData(timelineResult.value);
      setDataStates((prev) => ({
        ...prev,
        timeline: {
          isLoading: false,
          error: null,
          isEmpty: false,
        },
      }));
    } else {
      const error = timelineResult.reason;
      const message =
        error instanceof ApiClientError ? error.error.message : 'Failed to load timeline';
      setDataStates((prev) => ({
        ...prev,
        timeline: {
          isLoading: false,
          error: message,
          isEmpty: false,
        },
      }));
    }

    // Update invoices state
    if (invoicesResult.status === 'fulfilled') {
      setInvoices(invoicesResult.value.invoices);
      setInvoiceSummary(invoicesResult.value.summary);
      setDataStates((prev) => ({
        ...prev,
        invoices: {
          isLoading: false,
          error: null,
          isEmpty:
            invoicesResult.value.invoices.filter((inv) => inv.status === 'pending').length === 0,
        },
      }));
    } else {
      const error = invoicesResult.reason;
      const message =
        error instanceof ApiClientError ? error.error.message : 'Failed to load invoices';
      setDataStates((prev) => ({
        ...prev,
        invoices: {
          isLoading: false,
          error: message,
          isEmpty: false,
        },
      }));
    }

    // Update diary entries state
    if (diaryEntriesResult.status === 'fulfilled') {
      setDiaryEntries(diaryEntriesResult.value.items);
      setDataStates((prev) => ({
        ...prev,
        diaryEntries: {
          isLoading: false,
          error: null,
          isEmpty: diaryEntriesResult.value.items.length === 0,
        },
      }));
    } else {
      const error = diaryEntriesResult.reason;
      const message =
        error instanceof ApiClientError ? error.error.message : 'Failed to load diary entries';
      setDataStates((prev) => ({
        ...prev,
        diaryEntries: {
          isLoading: false,
          error: message,
          isEmpty: false,
        },
      }));
    }
  }, []);

  // Fetch all data sources on mount with cancellation guard
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      await loadAllData();
      if (cancelled) return;
    }

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [loadAllData]);

  const handleDismissCard = useCallback(
    async (cardId: DashboardCardId) => {
      const nextHidden = new Set(hiddenCardIds);
      nextHidden.add(cardId);
      const value = JSON.stringify(Array.from(nextHidden));
      try {
        await upsertPreference('dashboard.hiddenCards', value);
      } catch {
        // Error handled by usePreferences
      }
    },
    [hiddenCardIds, upsertPreference],
  );

  const handleReEnableCard = useCallback(
    async (cardId: DashboardCardId) => {
      const nextHidden = new Set(hiddenCardIds);
      nextHidden.delete(cardId);
      const value = JSON.stringify(Array.from(nextHidden));
      try {
        await upsertPreference('dashboard.hiddenCards', value);
      } catch {
        // Error handled by usePreferences
      }
    },
    [hiddenCardIds, upsertPreference],
  );

  // Get visible cards
  const visibleCards = CARD_DEFINITIONS.filter((card) => !hiddenCardIds.has(card.id));
  const hasHiddenCards = hiddenCardIds.size > 0;
  const hiddenCards = CARD_DEFINITIONS.filter((card) => hiddenCardIds.has(card.id));

  // Helper to render a card
  const renderCard = (card: (typeof visibleCards)[number]) => {
    const dataState = card.dataSource ? dataStates[card.dataSource] : undefined;
    return (
      <DashboardCard
        key={card.id}
        id={card.id}
        title={card.title}
        onDismiss={() => void handleDismissCard(card.id)}
        isLoading={dataState?.isLoading}
        error={dataState?.error}
        onRetry={() => void loadAllData()}
        isEmpty={dataState?.isEmpty}
        emptyMessage={card.emptyMessage ?? t('cards.common.emptyDefault')}
        emptyAction={card.emptyAction}
      >
        {card.id === 'budget-summary' && budgetOverview ? (
          <BudgetSummaryCard overview={budgetOverview} />
        ) : card.id === 'source-utilization' ? (
          <SourceUtilizationCard sources={budgetSources} />
        ) : card.id === 'upcoming-milestones' && timelineData ? (
          <UpcomingMilestonesCard milestones={timelineData.milestones} />
        ) : card.id === 'work-item-progress' && timelineData ? (
          <WorkItemProgressCard workItems={timelineData.workItems} />
        ) : card.id === 'critical-path' && timelineData ? (
          <CriticalPathCard
            criticalPath={timelineData.criticalPath}
            workItems={timelineData.workItems}
          />
        ) : card.id === 'mini-gantt' && timelineData ? (
          <MiniGanttCard timeline={timelineData} />
        ) : card.id === 'invoice-pipeline' && invoiceSummary ? (
          <InvoicePipelineCard invoices={invoices} summary={invoiceSummary} />
        ) : card.id === 'subsidy-pipeline' ? (
          <SubsidyPipelineCard subsidyPrograms={subsidyPrograms} />
        ) : card.id === 'recent-diary' ? (
          <RecentDiaryCard
            entries={diaryEntries}
            isLoading={dataState?.isLoading ?? false}
            error={dataState?.error ?? null}
          />
        ) : card.id === 'quick-actions' ? (
          <QuickActionsCard />
        ) : null}
      </DashboardCard>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>{t('page.title')}</h1>
        {hasHiddenCards && (
          <div className={styles.customizeContainer} ref={customizeRef}>
            <button
              type="button"
              className={styles.customizeButton}
              onClick={() => setCustomizeOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={customizeOpen}
            >
              {t('page.customize')}
            </button>

            {customizeOpen && (
              <div className={styles.customizeDropdown} role="menu">
                <h3 className={styles.customizeHeading}>{t('page.hiddenCards')}</h3>
                {hiddenCards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className={styles.reEnableButton}
                    onClick={() => {
                      void handleReEnableCard(card.id);
                      setCustomizeOpen(false);
                    }}
                    role="menuitem"
                  >
                    {t('page.showCard', { title: card.title })}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ProjectSubNav />

      {/* Desktop/tablet: flat grid */}
      <div
        role="region"
        aria-label={t('aria.dashboardOverview')}
        aria-live="polite"
        aria-atomic="false"
        className={styles.grid}
      >
        {visibleCards.map((card) => renderCard(card))}
      </div>

      {/* Mobile: sectioned layout */}
      <div
        className={styles.mobileSections}
        role="region"
        aria-label={t('aria.dashboardOverview')}
        data-testid="dashboard-mobile-sections"
        aria-live="polite"
        aria-atomic="false"
      >
        {/* Primary section — always expanded */}
        <div className={styles.mobileSection}>
          {visibleCards.filter((c) => c.section === 'primary').map((card) => renderCard(card))}
        </div>

        {/* Timeline section — collapsible */}
        {visibleCards.some((c) => c.section === 'timeline') && (
          <details className={styles.sectionDetails}>
            <summary className={styles.sectionSummary}>
              <span className={styles.sectionSummaryTitle}>{t('sections.timeline.title')}</span>
              <span className={styles.sectionSummaryText}>
                {dataStates.timeline.isLoading
                  ? '…'
                  : timelineData?.workItems.length === 0
                    ? t('sections.timeline.summaryNoItems')
                    : t('sections.timeline.summaryItems', { count: timelineData?.workItems.length ?? 0 })}
              </span>
              <span className={styles.sectionChevron} aria-hidden="true">
                ›
              </span>
            </summary>
            <div className={styles.sectionCards}>
              {visibleCards.filter((c) => c.section === 'timeline').map((card) => renderCard(card))}
            </div>
          </details>
        )}

        {/* Budget Details section — collapsible */}
        {visibleCards.some((c) => c.section === 'budget-details') && (
          <details className={styles.sectionDetails}>
            <summary className={styles.sectionSummary}>
              <span className={styles.sectionSummaryTitle}>{t('sections.budgetDetails.title')}</span>
              <span className={styles.sectionSummaryText}>
                {dataStates.budgetSources.isLoading
                  ? '…'
                  : budgetSources.length === 0
                    ? t('sections.budgetDetails.summaryNoSources')
                    : t('sections.budgetDetails.summarySources', { count: budgetSources.length })}
              </span>
              <span className={styles.sectionChevron} aria-hidden="true">
                ›
              </span>
            </summary>
            <div className={styles.sectionCards}>
              {visibleCards
                .filter((c) => c.section === 'budget-details')
                .map((card) => renderCard(card))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

export default DashboardPage;
