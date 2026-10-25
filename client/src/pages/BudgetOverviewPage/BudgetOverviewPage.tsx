import { useEffect, useRef, useState } from 'react';
import { useHref, useLinkClickHandler } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { BudgetBreakdown, MoneySummary } from '@cornerstone/shared';
import { routeUrl } from '@cornerstone/shared';
import { fetchBudgetOverviewResponse, fetchBudgetBreakdown } from '../../lib/budgetOverviewApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUserText } from '../../hooks/useUserText.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { Badge } from '../../components/Badge/Badge.js';
import { MoneyFigure } from '../../components/MoneyFigure/MoneyFigure.js';
import { OverflowMenu } from '../../components/OverflowMenu/OverflowMenu.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { SummaryStrip } from '../../components/SummaryStrip/SummaryStrip.js';
import type { SummaryFact } from '../../components/SummaryStrip/SummaryStrip.js';
import { CostBreakdownTable } from '../../components/CostBreakdownTable/CostBreakdownTable.js';
import {
  ESTIMATE_SCENARIO,
  breakdownSourceKeys,
  isBreakdownFiltered,
} from '../../components/CostBreakdownTable/breakdownSettings.js';
import { FundingSection } from './FundingSection.js';
import { useBreakdownSettings } from './useBreakdownSettings.js';
import styles from './BudgetOverviewPage.module.css';

const DEBOUNCE_MS = 50;

function deselectedKey(deselected: ReadonlySet<string>): string {
  return [...deselected].sort().join(',');
}

export function BudgetOverviewPage() {
  const { t } = useTranslation('budget');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { formatCurrency, formatSignedCurrency } = useFormatters();
  const { budgetVerdict } = useStatusBadgeVariants();
  const userText = useUserText();
  const originState = useOriginState();
  const pageTitle = tCommon('navigation.money');
  useDocumentTitle(pageTitle);

  const bankTo = routeUrl('bankReport', undefined, { type: 'budget-overview' });
  const bankHref = useHref(bankTo);
  const bankClick = useLinkClickHandler<HTMLAnchorElement>(bankTo);

  const breakdownSettings = useBreakdownSettings();
  const { settings } = breakdownSettings;
  const deselectedId = deselectedKey(settings.deselected);

  const [money, setMoney] = useState<MoneySummary | null>(null);
  const [breakdown, setBreakdown] = useState<BudgetBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [breakdownLoadFailed, setBreakdownLoadFailed] = useState(false);
  const [refetching, setRefetching] = useState(false);
  const [refetchError, setRefetchError] = useState(false);
  const [announcement, setAnnouncement] = useState<{ id: number; text: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const fetchedKeyRef = useRef<string | null>(null);
  const announceSeqRef = useRef(0);

  const scenario = ESTIMATE_SCENARIO[settings.estimate];

  const loadAll = async () => {
    setIsLoading(true);
    setError('');
    const key = deselectedId;
    const deselected = key === '' ? undefined : key.split(',');
    const [overviewResult, breakdownResult] = await Promise.allSettled([
      fetchBudgetOverviewResponse(),
      fetchBudgetBreakdown(deselected),
    ]);
    if (overviewResult.status === 'rejected') {
      const err: unknown = overviewResult.reason;
      setError(
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('overview.errorMessage'),
      );
    } else {
      setMoney(overviewResult.value.money);
    }
    if (breakdownResult.status === 'fulfilled') {
      setBreakdown(breakdownResult.value);
      setBreakdownLoadFailed(false);
      fetchedKeyRef.current = key;
    } else {
      setBreakdownLoadFailed(true);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- loads once on mount; later source changes refetch the breakdown only
  }, []);

  const refetchBreakdown = async (key: string, signal: AbortSignal) => {
    try {
      const next = await fetchBudgetBreakdown(key === '' ? undefined : key.split(','));
      if (signal.aborted) return;
      fetchedKeyRef.current = key;
      setBreakdown(next);
      setBreakdownLoadFailed(false);
      setRefetchError(false);
      const off = new Set(key === '' ? [] : key.split(','));
      const sources = breakdownSourceKeys(next, off);
      const selected = sources.filter((k) => !off.has(k)).length;
      const amount = formatCurrency(next.total.expectedCost[scenario]);
      announceSeqRef.current += 1;
      setAnnouncement({
        id: announceSeqRef.current,
        text:
          selected === sources.length
            ? t('overview.breakdown.announceAll', { amount })
            : t('overview.breakdown.announceSome', {
                selected,
                total: sources.length,
                amount,
              }),
      });
    } catch {
      if (signal.aborted) return;
      // The previous breakdown stays visible.
      if (breakdown === null) setBreakdownLoadFailed(true);
      else setRefetchError(true);
    } finally {
      if (!signal.aborted) setRefetching(false);
    }
  };

  const scheduleRefetch = useDebouncedCallback((key: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    void refetchBreakdown(key, controller.signal);
  }, DEBOUNCE_MS);

  // Only the funding-source filter reaches the server; every other setting selects client-side.
  useEffect(() => {
    if (isLoading || fetchedKeyRef.current === null) return;
    if (fetchedKeyRef.current === deselectedId) {
      // Back to the fetched key: drop a pending refetch of an intermediate key.
      scheduleRefetch.cancel();
      setRefetching(false);
      return;
    }
    abortRef.current?.abort();

    setRefetching(true);

    scheduleRefetch.trigger(deselectedId);
    return () => abortRef.current?.abort();
  }, [deselectedId, isLoading, scheduleRefetch]);

  const retryBreakdown = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRefetching(true);
    void refetchBreakdown(deselectedId, controller.signal);
  };

  const pageActions = (
    <OverflowMenu
      triggerIcon="⋯"
      triggerAriaLabel={tCommon('objectHeader.pageActions')}
      data-testid="money-page-actions"
      items={[
        {
          id: 'print',
          label: tCommon('objectHeader.print'),
          onClick: () => window.print(),
          testId: 'money-action-print',
        },
        {
          kind: 'link',
          id: 'bank-overview',
          label: t('overview.bankOverview'),
          href: bankHref,
          onClick: bankClick,
          testId: 'money-action-bank-overview',
        },
      ]}
    />
  );

  if (isLoading) {
    return (
      <PageLayout title={pageTitle} action={pageActions}>
        <Skeleton lines={10} loadingLabel={t('overview.loading')} />
      </PageLayout>
    );
  }

  if (error || money === null) {
    return (
      <PageLayout title={pageTitle} action={pageActions}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>{t('overview.error')}</h2>
          <p>{error}</p>
          <button type="button" className={styles.retryButton} onClick={() => void loadAll()}>
            {t('overview.retry')}
          </button>
        </div>
      </PageLayout>
    );
  }

  const lts = money.leftToSpend;
  const hasFigure = lts.verdict !== null;
  const settingsActive = isBreakdownFiltered(settings);
  const cappedGrants = money.grants.filter((g) => g.counted && g.capped);

  const facts: SummaryFact[] = [
    {
      id: 'funding-total',
      kind: 'static',
      label: t('overview.facts.fundingTotal'),
      value: formatCurrency(money.fundingTotal),
      testId: 'money-fact-funding-total',
    },
    {
      id: 'expected-cost',
      kind: 'static',
      label: t('overview.facts.expectedCost'),
      value: formatCurrency(money.expectedCost.expected),
      testId: 'money-fact-expected-cost',
    },
    {
      id: 'expected-grants',
      kind: 'static',
      label: t('overview.facts.expectedGrants'),
      value: formatCurrency(money.expectedGrants.expected),
      testId: 'money-fact-expected-grants',
    },
    {
      id: 'paid',
      kind: 'link',
      to: routeUrl('invoices'),
      state: originState,
      label: t('overview.facts.paid'),
      value: formatCurrency(money.paid),
      figureKind: 'paid',
      testId: 'money-fact-paid',
    },
    {
      id: 'still-to-pay',
      kind: 'link',
      to: routeUrl('invoices', undefined, { openOnly: 'true' }),
      state: originState,
      label: t('overview.facts.stillToPay'),
      value: formatCurrency(money.stillToPay),
      figureKind: 'still-to-pay',
      testId: 'money-fact-still-to-pay',
    },
  ];

  const sourceKeys = breakdown ? breakdownSourceKeys(breakdown, settings.deselected) : [];
  const printPairs = [
    [
      t('overview.breakdown.printSummary.view'),
      t(I18N_UNION_KEYS.breakdownView.key(settings.view)),
    ],
    [
      t('overview.breakdown.printSummary.payment'),
      t(I18N_UNION_KEYS.breakdownPayment.key(settings.payment)),
    ],
    [
      t('overview.breakdown.printSummary.estimates'),
      t(I18N_UNION_KEYS.breakdownEstimate.key(settings.estimate)),
    ],
    ...(settings.grants && settings.payment === 'all'
      ? [[t('overview.breakdown.printSummary.columns'), t('overview.breakdown.colGrants')]]
      : []),
    [
      t('overview.breakdown.printSummary.sources'),
      t('overview.breakdown.sourceCount', {
        selected: sourceKeys.filter((k) => !settings.deselected.has(k)).length,
        total: sourceKeys.length,
      }),
    ],
  ];

  return (
    <PageLayout title={pageTitle} action={pageActions}>
      <div className={styles.page}>
        <p className={styles.printSummary} data-testid="money-print-summary">
          {printPairs
            .map(([label, value]) => t('overview.breakdown.printSummary.pair', { label, value }))
            .join(' · ')}
        </p>

        <MoneyFigure
          testId="money-headline"
          label={t('overview.headline.label')}
          labelSuffix={settingsActive ? t('overview.headline.wholeProject') : null}
          figure={hasFigure ? formatCurrency(lts.expected) : null}
          noFigureLabel={t('overview.headline.noFigure')}
          negative={hasFigure && lts.expected < 0}
          figureKind="left-to-spend"
          verdict={
            lts.verdict === null ? undefined : (
              <Badge
                variants={budgetVerdict}
                value={lts.verdict}
                testId="money-headline-verdict-badge"
              />
            )
          }
          range={
            hasFigure
              ? t('overview.headline.range', {
                  from: formatSignedCurrency(lts.worst),
                  to: formatSignedCurrency(lts.best),
                })
              : null
          }
          detail={hasFigure ? undefined : t('overview.headline.needsSetup')}
          explanation={{
            toggleLabel: t('overview.headline.howCalculated'),
            content: (
              <>
                <p>{t('overview.headline.formula')}</p>
                <p>{t('overview.headline.rangeExplained')}</p>
                {cappedGrants.length > 0 ? (
                  <>
                    <p>{t('overview.headline.cappedLead')}</p>
                    <ul>
                      {cappedGrants.map((grant) => (
                        <li key={grant.id} {...userText()}>
                          {grant.name}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            ),
          }}
        />

        <SummaryStrip
          testId="money-summary"
          typeLabel={tCommon('navigation.money')}
          columns={5}
          facts={facts}
        />

        <FundingSection sources={money.sources} />

        {refetchError ? (
          <div className={styles.breakdownErrorBanner} role="alert">
            {t('overview.breakdown.refetchError')}
            <button type="button" onClick={() => setRefetchError(false)}>
              {t('overview.breakdown.dismissError')}
            </button>
          </div>
        ) : null}
        <CostBreakdownTable
          breakdown={breakdownLoadFailed ? null : breakdown}
          settings={settings}
          onViewChange={breakdownSettings.setView}
          onPaymentChange={breakdownSettings.setPayment}
          onEstimateChange={breakdownSettings.setEstimate}
          onGrantsChange={breakdownSettings.setGrants}
          onSourceToggle={breakdownSettings.toggleSource}
          onSelectAllSources={breakdownSettings.selectAllSources}
          onResetSettings={breakdownSettings.reset}
          refetching={refetching}
          announcement={announcement}
          loadError={
            breakdownLoadFailed
              ? { message: t('overview.breakdown.refetchError'), onRetry: retryBreakdown }
              : null
          }
        />
      </div>
    </PageLayout>
  );
}

export default BudgetOverviewPage;
