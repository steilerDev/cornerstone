import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { AreaPageSummary } from '@cornerstone/shared';
import { AreaColorDot } from '../../components/AreaBreadcrumb/AreaColorDot.js';
import { RelatedList } from '../../components/RelatedList/index.js';
import type { RelatedListRow } from '../../components/RelatedList/index.js';
import type { OriginState } from '../../navigation/origin.js';
import styles from './AreaDetailPage.module.css';

export interface AreaRoomsListProps {
  readonly summary: AreaPageSummary;
  readonly originState: OriginState;
}

/** Rooms (building, floor) or Sub-areas: the direct children, each opening its own page. */
export function AreaRoomsList({ summary, originState }: AreaRoomsListProps) {
  const { t } = useTranslation('areas');

  const rows: RelatedListRow[] = summary.children.map((child) => ({
    id: child.id,
    title: child.name,
    to: routeUrl('area', { id: child.id }),
    leading: <AreaColorDot color={child.color} />,
    facts: (
      <>
        {child.photoCount > 0 ? (
          t('index.count.photos', { count: child.photoCount })
        ) : (
          <span className={styles.muted}>{t('detail.rooms.noPhotos')}</span>
        )}
        {child.openTaskCount > 0
          ? ` · ${t('detail.rooms.open', { count: child.openTaskCount })}`
          : null}
      </>
    ),
  }));

  return (
    <RelatedList
      title={
        summary.area.ancestors.length <= 1
          ? t('detail.sections.rooms')
          : t('detail.sections.subAreas')
      }
      rows={rows}
      emptyMessage=""
      linkState={originState}
      testId="area-rooms"
    />
  );
}
