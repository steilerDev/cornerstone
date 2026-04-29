import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { BudgetOverview, BudgetBreakdown, BudgetSource } from '@cornerstone/shared';
import { fetchBudgetOverview, fetchBudgetBreakdown } from '../../lib/budgetOverviewApi.js';
import { fetchBudgetSources } from '../../lib/budgetSourcesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { SubNav, type SubNavTab } from '../../components/SubNav/SubNav.js';
import { CostBreakdownTable } from '../../components/CostBreakdownTable/CostBreakdownTable.js';
import styles from './BudgetOverviewPage.module.css';

const BUDGET_TABS: SubNavTab[] = [
  { labelKey: 'subnav.budget.overview', to: '/budget/overview' },
  { labelKey: 'subnav.budget.invoices', to: '/budget/invoices' },
  { labelKey: 'subnav.budget.sources', to: '/budget/sources' },
  { labelKey: 'subnav.budget.subsidies', to: '/budget/subsidies' },
];


// ---- Main component ----

export function BudgetOverviewPage() {
  const { t } = useTranslation('budget');
  const navigate = useNavigate();

  const [overview, setOverview] = useState<BudgetOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Auto-scroll to top when error appears
  useEffect(() => {
    if (error) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [error]);

  // Breakdown state
  const [breakdown, setBreakdown] = useState<BudgetBreakdown | null>(null);
  const [isBreakdownLoading, setIsBreakdownLoading] = useState(false);
  const [isBreakdownRefetching, setIsBreakdownRefetching] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string>('');

  // Refs for debounce + AbortController
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Budget sources state
  const [budgetSources, setBudgetSources] = useState<BudgetSource[]>([]);

  // Add dropdown state
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  // Source filter state (from URL)
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive deselected source IDs from URL ?deselectedSources= param
  // 'unassigned' is the literal key for null-source lines
  const deselectedSourceIds = useMemo<Set<string>>(() => {
    const raw = searchParams.get('deselectedSources');
    if (!raw) return new Set();
    return new Set(raw.split(',').filter(Boolean));
  }, [searchParams]);

  const handleSourceToggle = useCallback(
    (sourceId: string | null) => {
      const key = sourceId ?? 'unassigned';
      setSearchParams((prev) => {
        const current = new Set(prev.get('deselectedSources')?.split(',').filter(Boolean) ?? []);
        if (current.has(key)) {
          current.delete(key);
        } else {
          current.add(key);
        }
        const params = new URLSearchParams(prev);
        if (current.size === 0) {
          params.delete('deselectedSources');
        } else {
          params.set('deselectedSources', [...current].join(','));
        }
        return params;
      });
    },
    [setSearchParams],
  );

  const handleSelectAllSources = useCallback(() => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.delete('deselectedSources');
      return params;
    });
  }, [setSearchParams]);

  // Standalone fetch function for debounced refetch
  const fetchBreakdown = useCallback(
    async (sourceIds: Set<string>, signal?: AbortSignal) => {
      const deselectedArray = sourceIds.size > 0 ? [...sourceIds] : undefined;
      try {
        const bd = await fetchBudgetBreakdown(deselectedArray);
        if (signal?.aborted) return; // double-check after await
        setBreakdown(bd);
        setBreakdownError(''); // Clear any prior error
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return; // expected, ignore
        // Keep previous breakdown visible; surface error for AC #14
        setBreakdownError(t('overview.costBreakdown.refetchError'));
      } finally {
        if (!signal?.aborted) setIsBreakdownRefetching(false);
      }
    },
    [t],
  );

  // Debounced refetch on deselectedSourceIds change
  const DEBOUNCE_MS = 50;
  useEffect(() => {
    // 1. Clear any pending debounced fetch
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // 2. Abort any in-flight fetch
    if (abortRef.current) abortRef.current.abort();

    // Only trigger refetch after initial load completes
    if (isLoading) return;

    // 3. Schedule new fetch after debounce window
    setIsBreakdownRefetching(true);
    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      void fetchBreakdown(deselectedSourceIds, controller.signal);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [deselectedSourceIds, isLoading, fetchBreakdown]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!addOpen) return;
    function handleClick(e: MouseEvent) {
      if (addRef.current && !addRef.current.contains(e.target as Node)) {
        setAddOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [addOpen]);

  // Close dropdown on Escape
  useEffect(() => {
    if (!addOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAddOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [addOpen]);

  useEffect(() => {
    void loadOverview();
  }, []);

  const loadOverview = async () => {
    setIsLoading(true);
    setError('');

    try {
      const data = await fetchBudgetOverview();
      setOverview(data);

      // Fetch breakdown data (non-critical, so silent failure)
      setIsBreakdownLoading(true);
      try {
        const deselectedArray = deselectedSourceIds.size > 0 ? [...deselectedSourceIds] : undefined;
        const bd = await fetchBudgetBreakdown(deselectedArray);
        setBreakdown(bd);
      } catch {
        // breakdown is non-critical; silently fail and show empty state if it fails
      } finally {
        setIsBreakdownLoading(false);
      }

      // Fetch budget sources (non-critical, so silent failure)
      try {
        const sourcesData = await fetchBudgetSources();
        setBudgetSources(sourcesData.budgetSources);
      } catch {
        // sources is non-critical; silently fail
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('overview.errorMessage'));
      }
    } finally {
      setIsLoading(false);
    }
  };


  // Action dropdown (reused across loading, error, and main states)
  const actionDropdown = (
    <div className={styles.addContainer} ref={addRef}>
      <button
        type="button"
        className={styles.addButton}
        onClick={() => setAddOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={addOpen}
        aria-label={t('overview.actions.addButton')}
        data-testid="budget-overview-add-button"
      >
        {t('overview.actions.addButton')}
      </button>
      {addOpen && (
        <div className={styles.addDropdown} role="menu">
          <button
            type="button"
            className={styles.addMenuItem}
            role="menuitem"
            onClick={() => {
              setAddOpen(false);
              void navigate('/budget/invoices');
            }}
            data-testid="budget-overview-add-invoice"
          >
            {t('overview.actions.addInvoice')}
          </button>
          <button
            type="button"
            className={styles.addMenuItem}
            role="menuitem"
            onClick={() => {
              setAddOpen(false);
              void navigate('/settings/vendors');
            }}
            data-testid="budget-overview-add-vendor"
          >
            {t('overview.actions.addVendor')}
          </button>
        </div>
      )}
    </div>
  );

  // ---- Loading state ----
  if (isLoading) {
    return (
      <PageLayout
        title={t('overview.title')}
        action={actionDropdown}
        subNav={<SubNav tabs={BUDGET_TABS} ariaLabel="Budget section navigation" />}
      >
        <div className={styles.loading} role="status" aria-label={t('overview.loading')}>
          {t('overview.loading')}
        </div>
      </PageLayout>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <PageLayout
        title={t('overview.title')}
        action={actionDropdown}
        subNav={<SubNav tabs={BUDGET_TABS} ariaLabel="Budget section navigation" />}
      >
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>{t('overview.error')}</h2>
          <p>{error}</p>
          <button type="button" className={styles.retryButton} onClick={() => void loadOverview()}>
            {t('overview.retry')}
          </button>
        </div>
      </PageLayout>
    );
  }

  if (!overview) {
    return null;
  }

  const hasData = overview.minPlanned > 0 || overview.actualCost > 0 || overview.sourceCount > 0;

  return (
    <PageLayout
      title={t('overview.title')}
      action={actionDropdown}
      subNav={<SubNav tabs={BUDGET_TABS} ariaLabel="Budget section navigation" />}
    >
      {/* Empty state */}
      {!hasData && (
        <div className={styles.emptyState}>
          <p className={styles.emptyStateTitle}>{t('overview.emptyStateTitle')}</p>
          <p className={styles.emptyStateDescription}>{t('overview.emptyStateDescription')}</p>
        </div>
      )}

      {/* Cost Breakdown Table */}
      {overview &&
        (isBreakdownLoading ? (
          <div
            className={styles.breakdownLoading}
            role="status"
            aria-label={t('overview.costBreakdown.loading')}
          >
            <p>{t('overview.costBreakdown.loading')}</p>
          </div>
        ) : breakdown ? (
          <>
            {breakdownError && (
              <div className={styles.breakdownErrorBanner} role="alert">
                {breakdownError}
                <button
                  type="button"
                  onClick={() => setBreakdownError('')}
                  aria-label={t('overview.costBreakdown.dismissError')}
                >
                  {t('overview.costBreakdown.dismissError')}
                </button>
              </div>
            )}
            <div className={isBreakdownRefetching ? styles.breakdownRefetching : undefined}>
              <CostBreakdownTable
                breakdown={breakdown}
                overview={overview}
                deselectedSourceIds={deselectedSourceIds}
                onSourceToggle={handleSourceToggle}
                onSelectAllSources={handleSelectAllSources}
              />
            </div>
          </>
        ) : null)}
    </PageLayout>
  );
}

export default BudgetOverviewPage;
