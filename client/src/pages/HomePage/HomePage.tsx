import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import { HOME_ATTENTION_STALE_MS } from '../../attention/attentionContext.js';
import { useShellAttention } from '../../attention/useShellAttention.js';
import { OverflowMenu } from '../../components/OverflowMenu/OverflowMenu.js';
import type { OverflowMenuEntry } from '../../components/OverflowMenu/OverflowMenu.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { useHouseName } from '../../contexts/HouseNameContext.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useLoadOnce } from '../../hooks/useLoadOnce.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { HOME_HELP_URL } from '../../lib/externalLinks.js';
import { useFormatters } from '../../lib/formatters.js';
import { getHomeSetup } from '../../lib/homeApi.js';
import { todayLocalIsoDate } from '../../lib/localDate.js';
import { useRealLocationKey } from '../../navigation/realLocation.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { AttentionSection } from './AttentionSection.js';
import { CustomizeDialog } from './CustomizeDialog.js';
import { LatestSection } from './LatestSection.js';
import { MovedNotice } from './MovedNotice.js';
import { PulseSection } from './PulseSection.js';
import { SetupChecklist } from './SetupChecklist.js';
import { ThisWeekSection } from './ThisWeekSection.js';
import { TidyUpSection } from './TidyUpSection.js';
import { WhereAreYou } from './WhereAreYou.js';
import { useHomePreferences } from './useHomePreferences.js';
import styles from './HomePage.module.css';

/**
 * Home: "What needs me?" first. Needs attention, Tidy up, This week, Pulse and Latest from the
 * site, or the set-up checklist until the build has its basics. The sections load on their own,
 * so one failing section never blanks the page.
 */
export function HomePage() {
  const { t } = useTranslation('home');
  const { t: tCommon } = useTranslation('common');
  const { formatLongDate } = useFormatters();
  const { houseName } = useHouseName();
  const originState = useOriginState();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const attention = useShellAttention();
  const attentionCount = attention.data?.count ?? 0;
  useDocumentTitle(tCommon('navigation.home'), {
    prefix: attentionCount > 0 ? t('count', { count: attentionCount }) : null,
  });

  const [today] = useState<string>(() => todayLocalIsoDate());

  const prefs = useHomePreferences();
  const setup = useLoadOnce(getHomeSetup);

  // Home stays as fresh as before (the request is deduplicated with the provider's first load),
  // and "Hidden for now" does not outlive Home: the bell lists unsnoozed rows only.
  const { refreshStale, setIncludeSnoozed } = attention;
  useEffect(() => {
    refreshStale(HOME_ATTENTION_STALE_MS);
  }, [refreshStale]);
  const includeSnoozedRef = useRef(attention.includeSnoozed);
  useEffect(() => {
    includeSnoozedRef.current = attention.includeSnoozed;
  }, [attention.includeSnoozed]);
  useEffect(
    () => () => {
      if (includeSnoozedRef.current) setIncludeSnoozed(false);
    },
    [setIncludeSnoozed],
  );

  // A create dialog routed over Home (company, task, ...) changes the real location when it
  // closes: reload the checklist silently so finished steps tick off.
  const realKey = useRealLocationKey();
  const previousKeyRef = useRef(realKey);
  const refreshSetup = setup.refresh;
  useEffect(() => {
    if (previousKeyRef.current === realKey) return;
    previousKeyRef.current = realKey;
    refreshSetup();
  }, [realKey, refreshSetup]);
  const attentionHeadingRef = attention.homeHeadingRef;
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const mode: 'loading' | 'setup' | 'sections' =
    !prefs.loaded || setup.status === 'loading'
      ? 'loading'
      : setup.data?.coreComplete === false && !prefs.setupDismissed
        ? 'setup'
        : 'sections';

  const subtitle = houseName
    ? t('page.subtitle', { house: houseName, date: formatLongDate(today) })
    : t('page.subtitleNoHouse', { date: formatLongDate(today) });

  const menuItems = useMemo<OverflowMenuEntry[]>(
    () => [
      {
        id: 'customize',
        label: t('page.customize'),
        onClick: () => setCustomizeOpen(true),
        testId: 'home-menu-customize',
      },
      {
        kind: 'link',
        id: 'what-moved',
        label: t('page.whatMoved'),
        href: HOME_HELP_URL,
        newTab: true,
        srSuffix: t('page.opensNewTab'),
        testId: 'home-menu-what-moved',
      },
    ],
    [t],
  );

  const isHidden = (id: (typeof prefs.hidden)[number]) => prefs.hidden.includes(id);
  const tidyOpen = !prefs.collapsed.includes('tidy-up');

  return (
    <PageLayout
      title={tCommon('navigation.home')}
      maxWidth="column"
      subtitle={subtitle}
      action={
        <OverflowMenu
          items={menuItems}
          triggerIcon="⋯"
          triggerAriaLabel={t('page.actions')}
          triggerRef={menuTriggerRef}
          data-testid="home-page-menu"
        />
      }
      testId="home-page"
    >
      <div className={styles.column}>
        {!isDesktop ? <WhereAreYou /> : null}
        {prefs.loaded && !prefs.failed && !prefs.noticeSeen ? (
          <MovedNotice onDismiss={prefs.markNoticeSeen} />
        ) : null}
        {mode === 'loading' ? <Skeleton lines={6} /> : null}
        {mode === 'setup' && setup.data ? (
          <SetupChecklist
            setup={setup.data}
            onRefetch={setup.refresh}
            onSkip={prefs.dismissSetup}
          />
        ) : null}
        {mode === 'sections' ? (
          <>
            <AttentionSection attention={attention} headingRef={attentionHeadingRef} />
            {!isHidden('tidy-up') ? (
              <TidyUpSection
                attention={attention}
                open={tidyOpen}
                onToggle={() => prefs.setCollapsed(tidyOpen ? ['tidy-up'] : [])}
                fallbackFocusRef={attentionHeadingRef}
              />
            ) : null}
            {!isHidden('this-week') ? <ThisWeekSection attention={attention} /> : null}
            {!isHidden('pulse') ? <PulseSection /> : null}
            {!isHidden('latest-from-site') ? <LatestSection /> : null}
          </>
        ) : null}
        <div className={styles.footer}>
          <NavAnchor
            to={routeUrl('history')}
            state={originState}
            className={styles.footerLink}
            data-testid="home-footer-history"
          >
            {t('footer.history')}
            <span aria-hidden="true"> → </span>
            <span className={styles.muted}>{t('footer.historyTo')}</span>
          </NavAnchor>
        </div>
      </div>
      {customizeOpen ? (
        <CustomizeDialog
          hidden={prefs.hidden}
          onChange={prefs.setHidden}
          onClose={() => setCustomizeOpen(false)}
          returnFocusRef={menuTriggerRef}
        />
      ) : null}
    </PageLayout>
  );
}

export default HomePage;
