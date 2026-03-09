import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { DashboardCardId, BudgetOverview } from '@cornerstone/shared';
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
import styles from './DashboardPage.module.css';

type DataSourceKey =
  | 'budgetOverview'
  | 'budgetSources'
  | 'timeline'
  | 'invoices'
  | 'subsidyPrograms';

interface DataSourceState {
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
}

const CARD_DEFINITIONS: {
  id: DashboardCardId;
  title: string;
  dataSource?: DataSourceKey;
  emptyMessage?: string;
  emptyAction?: {
    label: string;
    href: string;
  };
}[] = [
  { id: 'budget-summary', title: 'Budget Summary', dataSource: 'budgetOverview' },
  { id: 'budget-alerts', title: 'Budget Alerts', dataSource: 'budgetOverview' },
  {
    id: 'source-utilization',
    title: 'Source Utilization',
    dataSource: 'budgetSources',
    emptyMessage: 'No budget sources configured',
    emptyAction: { label: 'Add a budget source', href: '/budget/sources' },
  },
  { id: 'timeline-status', title: 'Timeline Status', dataSource: 'timeline' },
  { id: 'mini-gantt', title: 'Mini Gantt', dataSource: 'timeline' },
  {
    id: 'invoice-pipeline',
    title: 'Invoice Pipeline',
    dataSource: 'invoices',
    emptyMessage: 'No invoices yet',
    emptyAction: { label: 'Create an invoice', href: '/budget/invoices' },
  },
  {
    id: 'subsidy-pipeline',
    title: 'Subsidy Pipeline',
    dataSource: 'subsidyPrograms',
    emptyMessage: 'No subsidy programs found',
    emptyAction: { label: 'Add a subsidy program', href: '/budget/subsidies' },
  },
  { id: 'quick-actions', title: 'Quick Actions' },
];

export function DashboardPage() {
  const [dataStates, setDataStates] = useState<Record<DataSourceKey, DataSourceState>>({
    budgetOverview: { isLoading: true, error: null, isEmpty: false },
    budgetSources: { isLoading: true, error: null, isEmpty: false },
    subsidyPrograms: { isLoading: true, error: null, isEmpty: false },
    timeline: { isLoading: true, error: null, isEmpty: false },
    invoices: { isLoading: true, error: null, isEmpty: false },
  });
  const [budgetOverview, setBudgetOverview] = useState<BudgetOverview | null>(null);

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
      setBudgetOverview(budgetOverviewResult.value.overview);
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
      setDataStates((prev) => ({
        ...prev,
        invoices: {
          isLoading: false,
          error: null,
          isEmpty: invoicesResult.value.invoices.length === 0,
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

      {/* Card grid */}
      <div className={styles.grid}>
        {visibleCards.map((card) => {
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
              ) : (
                <p className={styles.cardPlaceholder}>Content coming soon.</p>
              )}
            </DashboardCard>
          );
        })}
      </div>
    </div>
  );
}

export default DashboardPage;
