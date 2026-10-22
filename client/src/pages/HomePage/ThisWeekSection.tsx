import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { HomeAgendaItem } from '@cornerstone/shared';
import { attentionLinkUrl } from '../../components/AttentionList/AttentionRowView.js';
import { AreaBreadcrumb } from '../../components/AreaBreadcrumb/AreaBreadcrumb.js';
import { Badge } from '../../components/Badge/Badge.js';
import type { BadgeVariantMap } from '../../components/Badge/Badge.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { FeedGroup } from '../../components/FeedRow/FeedGroup.js';
import { FeedRow } from '../../components/FeedRow/FeedRow.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import type { UseAttentionResult } from '../../hooks/useAttention.js';
import { useLoadOnce } from '../../hooks/useLoadOnce.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import {
  dropAttentionRepeats,
  groupAgendaByDay,
  splitWeek,
  addDays,
} from '../../lib/home/agenda.js';
import type { AgendaDay } from '../../lib/home/agenda.js';
import { getHomeWeek } from '../../lib/homeApi.js';
import { useFormatters } from '../../lib/formatters.js';
import { scheduleSignalOf } from '../../lib/scheduleDates.js';
import { scheduleSignalBadgeProps } from '../../components/Badge/statusBadgeVariants.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import shared from '../../styles/shared.module.css';
import { SectionError } from './SectionError.js';
import styles from './HomePage.module.css';

export interface ThisWeekSectionProps {
  attention: UseAttentionResult;
}

function localDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

/** This week: the critical line, then the next 7 days by day, and "Next 14 days" on demand. */
export function ThisWeekSection({ attention }: ThisWeekSectionProps) {
  const { t } = useTranslation('home');
  const { formatDayMonth, formatWeekdayMonthDay } = useFormatters();
  const originState = useOriginState();
  const { criticalLine: criticalVariants } = useStatusBadgeVariants();
  const week = useLoadOnce(getHomeWeek);
  const [nextOpen, setNextOpen] = useState(false);
  const nextId = useId();

  const attentionSettled = attention.status !== 'loading';
  const split = useMemo(() => {
    if (!week.data) return null;
    const items = dropAttentionRepeats(
      week.data.items,
      attention.status === 'ready' && attention.data ? attention.data.rows : null,
    );
    const days = groupAgendaByDay(items, week.data.from, week.data.to);
    return splitWeek(days, week.data.today);
  }, [week.data, attention.status, attention.data]);

  const critical = attention.data?.criticalLine ?? null;
  const loading = week.status === 'loading' || !attentionSettled;
  const today = week.data?.today ?? null;

  const dayHeading = (date: string): { heading: string; detail?: string } => {
    if (today !== null && date === today) {
      return { heading: t('week.day.today'), detail: formatDayMonth(date) };
    }
    if (today !== null && date === addDays(today, 1)) {
      return { heading: t('week.day.tomorrow'), detail: formatDayMonth(date) };
    }
    return { heading: formatWeekdayMonthDay(localDate(date)) };
  };

  const renderDays = (days: readonly AgendaDay[]) =>
    days.map((day) => {
      const { heading, detail } = dayHeading(day.date);
      return (
        <FeedGroup
          key={day.date}
          heading={heading}
          headingDetail={detail}
          headingLevel={3}
          testId={`home-week-day-${day.date}`}
        >
          {day.items.map((item) => (
            <AgendaRow key={item.key} item={item} originState={originState} />
          ))}
        </FeedGroup>
      );
    });

  return (
    <FeedGroup
      heading={t(I18N_UNION_KEYS.homeSection.key('this-week'))}
      list={false}
      busy={loading}
      testId="home-this-week"
    >
      {loading ? <Skeleton lines={4} /> : null}
      {!loading && critical ? (
        <div className={styles.criticalLine} data-testid="home-critical-line">
          <Badge variants={criticalVariants} value={critical.level} />
          <span className={styles.criticalText}>
            <span>{t('week.critical.label')} </span>
            <NavAnchor
              to={routeUrl('workItem', { id: critical.workItemId })}
              state={originState}
              className={styles.inlineLink}
            >
              {critical.label}
            </NavAnchor>
            {critical.area ? (
              <span className={styles.muted}>
                {' · '}
                <AreaBreadcrumb area={critical.area} variant="compact" />
              </span>
            ) : null}{' '}
            <span>
              {t(critical.level === 'overdue' ? 'week.critical.overdue' : 'week.critical.mustEnd', {
                date: formatDayMonth(critical.mustEndBy),
                count: Math.abs(critical.daysLeft),
              })}
            </span>
            {critical.criticalCount > 1 ? (
              <span> · {t('week.critical.count', { count: critical.criticalCount })}</span>
            ) : null}
          </span>
        </div>
      ) : null}
      {!loading && week.status === 'error' ? (
        <SectionError section="this-week" onRetry={week.reload} testId="home-this-week-error" />
      ) : null}
      {!loading && split ? (
        <>
          {split.week.length === 0 && !critical ? (
            <EmptyState message={t('week.empty')} />
          ) : (
            <div className={styles.dayGroups}>{renderDays(split.week)}</div>
          )}
          {split.next.length > 0 ? (
            <div id={nextId} hidden={!nextOpen} className={styles.dayGroups}>
              {renderDays(split.next)}
            </div>
          ) : null}
        </>
      ) : null}
      {!loading ? (
        <div className={styles.weekFooter}>
          {split && split.next.length > 0 ? (
            <button
              type="button"
              className={`${shared.btnSecondary} ${styles.disclosure}`}
              aria-expanded={nextOpen}
              aria-controls={nextId}
              onClick={() => setNextOpen((open) => !open)}
              data-testid="home-week-next"
            >
              {t('week.next14')}
              <span aria-hidden="true"> {nextOpen ? '▾' : '▸'}</span>
            </button>
          ) : (
            <span />
          )}
          <NavAnchor
            to={routeUrl('scheduleGantt')}
            className={styles.moreLink}
            data-testid="home-week-schedule"
          >
            {t('week.openSchedule')}
            <span aria-hidden="true"> ›</span>
          </NavAnchor>
        </div>
      ) : null}
    </FeedGroup>
  );
}

interface AgendaRowProps {
  item: HomeAgendaItem;
  originState: unknown;
}

function AgendaRow({ item, originState }: AgendaRowProps) {
  const { t } = useTranslation('home');
  const { t: tCommon } = useTranslation('common');
  const { formatCurrency } = useFormatters();
  const { scheduleSignal, criticalSignal } = useStatusBadgeVariants();
  const kindSet = I18N_UNION_KEYS.homeAgendaKind;
  const kindLabel = t(kindSet.key(item.kind));
  const kindVariants: BadgeVariantMap = {
    [item.kind]: { label: kindLabel, className: badgeStyles.neutral },
  };
  const signal = item.schedule ? scheduleSignalOf(item.schedule) : null;

  const badges = (
    <>
      <Badge variants={kindVariants} value={item.kind} />
      {signal ? <Badge {...scheduleSignalBadgeProps(signal, scheduleSignal)} /> : null}
      {item.schedule?.isCritical ? <Badge variants={criticalSignal} value="critical" /> : null}
    </>
  );

  const context = (
    <>
      {item.subject.area ? (
        <>
          {' · '}
          <AreaBreadcrumb area={item.subject.area} variant="compact" />
        </>
      ) : null}
      {item.companyName ? ` · ${item.companyName}` : null}
    </>
  );

  const notes = item.heldUpBy
    ? [
        <span key="waits">
          {t('week.waitsFor')}{' '}
          <NavAnchor
            to={routeUrl('workItem', { id: item.heldUpBy.id })}
            state={originState}
            className={styles.inlineLink}
          >
            {item.heldUpBy.label}
          </NavAnchor>
        </span>,
      ]
    : undefined;

  return (
    <FeedRow
      variant="object"
      severity="none"
      badges={badges}
      figure={
        item.amount !== null
          ? { text: formatCurrency(item.amount), srPrefix: tCommon('attention.amountPrefix') }
          : null
      }
      title={item.subject.label ?? kindLabel}
      titleLink={{
        to: attentionLinkUrl(item.link),
        state: originState,
      }}
      context={context}
      notes={notes}
      testId={`home-week-item-${item.key}`}
    />
  );
}
