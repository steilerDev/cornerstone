import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import { CostLineTable } from '../../components/CostLineTable/CostLineTable.js';
import {
  groupForDocument,
  rowFromBudgetLine,
} from '../../components/CostLineTable/costLineRows.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { FormError } from '../../components/FormError/FormError.js';
import { SectionCardFrame } from '../../components/SectionCard/SectionCardFrame.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { useLocale } from '../../contexts/LocaleContext.js';
import { useLoadOnce } from '../../hooks/useLoadOnce.js';
import { fetchAreaCostLines } from '../../lib/areasApi.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import type { OriginState } from '../../navigation/origin.js';
import styles from './AreaDetailPage.module.css';

export interface AreaCostSectionProps {
  readonly areaId: string;
  readonly areaName: string;
  readonly originState: OriginState;
}

/** Cost: every cost line of the tasks and purchases here and below, read-only, gross amounts. */
export function AreaCostSection({ areaId, areaName, originState }: AreaCostSectionProps) {
  const { t } = useTranslation('areas');
  const { vatRate } = useLocale();
  const load = useMemo(() => () => fetchAreaCostLines(areaId), [areaId]);
  const cost = useLoadOnce(load);

  const groups = useMemo(() => {
    const rows = (cost.data ?? []).map((line) =>
      rowFromBudgetLine(
        line,
        line.itemType,
        { type: line.itemType, id: line.itemId, label: line.itemTitle, area: line.itemArea },
        vatRate,
      ),
    );
    // Despite its name, `groupForDocument` groups by owner: one group per task or purchase, each
    // headed by the owner's title link with its area.
    return groupForDocument(rows);
  }, [cost.data, vatRate]);

  let body;
  if (cost.status === 'loading') {
    body = <Skeleton lines={3} />;
  } else if (cost.status === 'error') {
    body = (
      <div className={styles.loadError}>
        <FormError message={t('detail.cost.loadError')} />
        <button type="button" className={styles.retry} onClick={cost.reload}>
          {t('index.retry')}
        </button>
      </div>
    );
  } else if (groups.length === 0) {
    body = <EmptyState message={t('detail.cost.empty', { area: areaName })} />;
  } else {
    body = (
      <CostLineTable
        mode="item"
        groups={groups}
        rowActions={() => []}
        vatRate={vatRate}
        linkState={originState}
        testIdPrefix="area-cost-lines"
      />
    );
  }

  return (
    <SectionCardFrame id="area-cost" title={t('detail.sections.cost')}>
      {body}
      <div className={styles.moreRow}>
        <NavAnchor
          to={routeUrl('budgetOverview')}
          state={originState}
          className={styles.moreLink}
          data-testid="area-cost-overview"
        >
          {t('detail.cost.overview')}
          <span aria-hidden="true"> →</span>
        </NavAnchor>
      </div>
    </SectionCardFrame>
  );
}
