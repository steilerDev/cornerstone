import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type {
  DashboardCardId,
  BudgetOverview,
  BudgetSource,
  TimelineResponse,
  Invoice,
  InvoiceStatusBreakdown,
  SubsidyProgram,
} from '@cornerstone/shared';
import { fetchBudgetOverview } from '../../lib/budgetOverviewApi.js';
import { fetchBudgetSources } from '../../lib/budgetSourcesApi.js';
import { fetchSubsidyPrograms } from '../../lib/subsidyProgramsApi.js';
import { getTimeline } from '../../lib/timelineApi.js';
import { fetchAllInvoices } from '../../lib/invoicesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { usePreferences } from '../../hooks/usePreferences.js';
import { ProjectSubNav } from '../../components/ProjectSubNav/ProjectSubNav.js';
import { DashboardCard } from '../../components/DashboardCard/DashboardCard.js';
import { BudgetSummaryCard } from '../../components/BudgetSummaryCard/BudgetSummaryCard.js';
import { BudgetAlertsCard } from '../../components/BudgetAlertsCard/BudgetAlertsCard.js';
import { SourceUtilizationCard } from '../../components/SourceUtilizationCard/SourceUtilizationCard.js';
import { UpcomingMilestonesCard } from '../../components/TimelineStatusCards/UpcomingMilestonesCard.js';
import { WorkItemProgressCard } from '../../components/TimelineStatusCards/WorkItemProgressCard.js';
import { CriticalPathCard } from '../../components/TimelineStatusCards/CriticalPathCard.js';
import { MiniGanttCard } from '../../components/MiniGanttCard/MiniGanttCard.js';
import { QuickActionsCard } from '../../components/QuickActionsCard/QuickActionsCard.js';
import { InvoicePipelineCard } from '../../components/InvoicePipelineCard/InvoicePipelineCard.js';
import { SubsidyPipelineCard } from '../../components/SubsidyPipelineCard/SubsidyPipelineCard.js';
import styles from './DashboardPage.module.css';

type DataSourceKey =
  | 'budgetOverview'
  | 'budgetSources'
  | 'timeline'
  | 'invoices'
  | 'subsidyPrograms';

type DashboardSection = 'primary' | 'timeline' | 'budget-details';

interface DataSourceState {
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
}

const CARD_DEFINITIONS: {
  id: DashboardCardId;
  title: string;
  section: DashboardSection;
  dataSource?: DataSourceKey;
  emptyMessage?: string;
  emptyAction?: {
    label: string;
    href: string;
  };
}[] = [
  {
    id: 'budget-summary',
    title: 'Budget Summary',
    section: 'primary',
    dataSource: 'budgetOverview',
  },
  { id: 'budget-alerts', title: 'Budget Alerts', section: 'primary', dataSource: 'budgetOverview' },
  {
    id: 'source-utilization',
    title: 'Source Utilization',
    section: 'budget-details',
    dataSource: 'budgetSources',
    emptyMessage: 'No budget sources configured',
    emptyAction: { label: 'Add a budget source', href: '/budget/sources' },
  },
  {
    id: 'upcoming-milestones',
    title: 'Upcoming Milestones',
    section: 'timeline',
    dataSource: 'timeline',
    emptyMessage: 'No upcoming milestones',
  },
  {
    id: 'work-item-progress',
    title: 'Work Item Progress',
    section: 'timeline',
    dataSource: 'timeline',
  },
  { id: 'critical-path', title: 'Critical Path', section: 'timeline', dataSource: 'timeline' },
  { id: 'mini-gantt', title: 'Mini Gantt', section: 'timeline', dataSource: 'timeline' },
  {
    id: 'invoice-pipeline',
    title: 'Invoice Pipeline',
    section: 'primary',
    dataSource: 'invoices',
    emptyMessage: 'No invoices yet',
    emptyAction: { label: 'Create an invoice', href: '/budget/invoices' },
  },
  {
    id: 'subsidy-pipeline',
    title: 'Subsidy Pipeline',
    section: 'budget-details',
    dataSource: 'subsidyPrograms',
    emptyMessage: 'No subsidy programs found',
    emptyAction: { label: 'Add a subsidy program', href: '/budget/subsidies' },
  },
  { id: 'quick-actions', title: 'Quick Actions', section: 'primary' },
];

function getTimelineSummary(isLoading: boolean, timeline: TimelineResponse | null): string {
  if (isLoading) return '…';
  const count = timeline?.workItems.length ?? 0;
  return count === 0
    ? 'No items scheduled'
    : `${count} work item${count === 1 ? '' : 's'} scheduled`;
}

function getBudgetDetailsSummary(isLoading: boolean, sources: BudgetSource[]): string {
  if (isLoading) return '…';
  const count = sources.length;
  return count === 0
    ? 'No sources configured'
    : `${count} source${count === 1 ? '' : 's'} configured`;
}

export function DashboardPage() {
  const [dataStates, setDataStates] = useState<Record<DataSourceKey, DataSourceState>>({
    budgetOverview: { isLoading: true, error: null, isEmpty: false },
    budgetSources: { isLoading: true, error: null, isEmpty: false },
    subsidyPrograms: { isLoading: true, error: null, isEmpty: false },
    timeline: { isLoading: true, error: null, isEmpty: false },
    invoices: { isLoading: true, error: null, isEmpty: false },
  });
  const [budgetOverview, setBudgetOverview] = useState<BudgetOverview | null>(null);
  const [budgetSources, setBudgetSources] = useState<BudgetSource[]>([]);
  const [timelineData, setTimelineData] = useState<TimelineResponse | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceSummary, setInvoiceSummary] = useState<InvoiceStatusBreakdown | null>(null);
  const [subsidyPrograms, setSubsidyPrograms] = useState<SubsidyProgram[]>([]);

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

  // Fetch all data sources in parallel
  useEffect(() => {
    void loadAllData();
  }, []);

  const loadAllData = async () => {
    const results = await Promise.allSettled([
      fetchBudgetOverview(),
      fetchBudgetSources(),
      fetchSubsidyPrograms(),
      getTimeline(),
      fetchAllInvoices({ pageSize: 10 }),
    ]);

    const [
      budgetOverviewResult,
      budgetSourcesResult,
      subsidyProgramsResult,
      timelineResult,
      invoicesResult,
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
  };

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
        emptyMessage={card.emptyMessage ?? 'No data available'}
        emptyAction={card.emptyAction}
      >
        {card.id === 'budget-summary' && budgetOverview ? (
          <BudgetSummaryCard overview={budgetOverview} />
        ) : card.id === 'budget-alerts' && budgetOverview ? (
          <BudgetAlertsCard categorySummaries={budgetOverview.categorySummaries} />
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
        ) : card.id === 'quick-actions' ? (
          <QuickActionsCard />
        ) : (
          <p className={styles.cardPlaceholder}>Content coming soon.</p>
        )}
      </DashboardCard>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>Project</h1>
        {hasHiddenCards && (
          <div className={styles.customizeContainer} ref={customizeRef}>
            <button
              type="button"
              className={styles.customizeButton}
              onClick={() => setCustomizeOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={customizeOpen}
            >
              Customize
            </button>

            {customizeOpen && (
              <div className={styles.customizeDropdown} role="menu">
                <h3 className={styles.customizeHeading}>Hidden Cards</h3>
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
                    Show {card.title}
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
        aria-label="Dashboard overview"
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
        aria-label="Dashboard overview"
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
              <span className={styles.sectionSummaryTitle}>Timeline</span>
              <span className={styles.sectionSummaryText}>
                {getTimelineSummary(dataStates.timeline.isLoading, timelineData)}
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
              <span className={styles.sectionSummaryTitle}>Budget Details</span>
              <span className={styles.sectionSummaryText}>
                {getBudgetDetailsSummary(dataStates.budgetSources.isLoading, budgetSources)}
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
