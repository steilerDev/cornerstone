import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { AreaPageSummary } from '@cornerstone/shared';
import type { SummaryFact } from '../../components/SummaryStrip/SummaryStrip.js';
import { useFormatters } from '../../lib/formatters.js';
import type { OriginState } from '../../navigation/origin.js';
import { jumpToSection } from './jumpToSection.js';
import styles from './AreaDetailPage.module.css';

export interface UseAreaSummaryFactsOptions {
  readonly summary: AreaPageSummary;
  readonly originState: OriginState;
}

/** The strip of the area page: Tasks, Expected cost, Photos, Companies (all over the subtree). */
export function useAreaSummaryFacts({
  summary,
  originState,
}: UseAreaSummaryFactsOptions): SummaryFact[] {
  const { t } = useTranslation('areas');
  const { formatCurrency, formatDate } = useFormatters();
  const areaId = summary.area.id;
  const { counts, money } = summary;

  const { workItems, photos } = counts;
  const tasks: SummaryFact = {
    id: 'tasks',
    kind: 'link',
    to: routeUrl('workItems', undefined, { areaId }),
    state: originState,
    label: t('detail.strip.tasks'),
    value:
      workItems.total === 0 ? null : (
        <>
          {t('detail.strip.open', { count: workItems.open })}
          {workItems.late > 0 ? (
            <span className={styles.remark}>
              {' · '}
              {t('detail.strip.late', { count: workItems.late })}
            </span>
          ) : null}
        </>
      ),
    emptyText: t('detail.strip.noTasks'),
  };

  const cost: SummaryFact = {
    id: 'cost',
    kind: 'tab',
    href: '#area-cost',
    onActivate: () => jumpToSection('area-cost'),
    label: t('detail.strip.cost'),
    value:
      money.expectedCost === 0 ? null : (
        <>
          {formatCurrency(money.expectedCost)}
          {money.paid > 0 ? (
            <span className={styles.remark}>
              {' · '}
              {t('detail.strip.paid')}{' '}
              <span data-figure="paid" data-testid="area-paid-figure">
                {formatCurrency(money.paid)}
              </span>
            </span>
          ) : null}
        </>
      ),
  };

  const photosFact: SummaryFact = {
    id: 'photos',
    kind: 'link',
    to: routeUrl('photos', undefined, { areaId }),
    state: originState,
    label: t('detail.strip.photos'),
    value:
      photos.total === 0 ? null : (
        <>
          {String(photos.total)}
          {photos.latestDate ? (
            <span className={styles.remark}>
              {' · '}
              {t('detail.strip.latest', { date: formatDate(photos.latestDate) })}
            </span>
          ) : null}
        </>
      ),
    emptyText: t('detail.strip.noneYet'),
  };

  const companies: SummaryFact = {
    id: 'companies',
    kind: 'tab',
    href: '#area-companies',
    onActivate: () => jumpToSection('area-companies'),
    label: t('detail.strip.companies'),
    value: counts.companies === 0 ? null : String(counts.companies),
    emptyText: t('detail.strip.noneYet'),
  };

  return [tasks, cost, photosFact, companies];
}
