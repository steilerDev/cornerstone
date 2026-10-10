import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterChipGroup } from '../FilterChipGroup/index.js';
import { SpotThumbnail } from '../SpotThumbnail/index.js';
import type { OriginState } from '../../navigation/origin.js';
import { useFormatters } from '../../lib/formatters.js';
import { buildSpotViewerPath, spotKey } from '../../lib/photoSpots.js';
import type { SpotGroup } from '../../lib/photoSpots.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './SpotsGrid.module.css';

export interface SpotsGridProps {
  groups: SpotGroup[];
  linkState?: OriginState;
}

const ALL = 'all';

export function SpotsGrid({ groups, linkState }: SpotsGridProps) {
  const { t } = useTranslation('photos');
  const { formatDate } = useFormatters();
  const [selected, setSelected] = useState<string>(ALL);
  const [announcement, setAnnouncement] = useState('');

  const groupLabel = (g: SpotGroup) => g.name ?? t('spots.noArea');
  const visibleGroups = selected === ALL ? groups : groups.filter((g) => g.id === selected);

  const handleChange = (value: string) => {
    setSelected(value);
    const next = value === ALL ? groups : groups.filter((g) => g.id === value);
    const label = value === ALL ? t('spots.allGroups') : groupLabel(next[0] ?? groups[0]!);
    const count = next.reduce((sum, g) => sum + g.rows.reduce((s, r) => s + r.cells.length, 0), 0);
    setAnnouncement(t('spots.groupAnnouncement', { group: label, count }));
  };

  return (
    <div className={styles.root}>
      <FilterChipGroup
        ariaLabel={t('spots.groupsLabel')}
        options={[
          { value: ALL, label: t('spots.allGroups') },
          ...groups.map((g) => ({ value: g.id, label: groupLabel(g) })),
        ]}
        value={selected}
        onChange={handleChange}
        testIdPrefix="spot-group-chip"
      />
      <div role="status" aria-atomic="true" className={sharedStyles.srOnly}>
        {announcement}
      </div>
      {visibleGroups.map((group) =>
        group.rows.map((row) => {
          const areaName = row.name ?? t('spots.noArea');
          return (
            <section key={`${group.id}-${row.areaId ?? 'none'}`} className={styles.block}>
              <h2 className={styles.heading}>
                {row.color ? (
                  // User-chosen area colour is data, not a design value: the one allowed inline style.
                  <span
                    className={styles.dot}
                    aria-hidden="true"
                    style={{ '--area-color': row.color } as CSSProperties}
                  />
                ) : null}
                <span className={row.name === null ? styles.headingMuted : undefined}>
                  {areaName}
                </span>
              </h2>
              <div className={styles.grid}>
                {row.cells.map((cell) => {
                  const key = spotKey(cell.areaId, cell.orientationId);
                  const orientationName = cell.orientationName ?? t('spots.noOrientation');
                  const { spot } = cell;
                  if (!spot) {
                    return (
                      <SpotThumbnail
                        key={key}
                        variant="card"
                        title={orientationName}
                        titleMuted
                        emptyLabel={t('spots.noPhotos')}
                        emptySrPrefix={t('spots.emptyCellPrefix', {
                          area: areaName,
                          orientation: orientationName,
                        })}
                        imageUnavailableLabel={t('viewer.imageUnavailable')}
                        testId={`spot-card-${key}`}
                      />
                    );
                  }
                  return (
                    <SpotThumbnail
                      key={key}
                      variant="card"
                      to={buildSpotViewerPath(cell.areaId, cell.orientationId, spot.latestPhotoId)}
                      linkState={linkState}
                      id={`spot-${key}`}
                      src={spot.latestThumbnailUrl}
                      count={spot.photoCount}
                      dateLabel={formatDate(spot.latestEntryDate)}
                      title={orientationName}
                      ariaLabel={t('spots.cellLabel', {
                        area: areaName,
                        orientation: orientationName,
                        count: spot.photoCount,
                        date: formatDate(spot.latestEntryDate, undefined, 'long'),
                      })}
                      emptyLabel={t('spots.noPhotos')}
                      imageUnavailableLabel={t('viewer.imageUnavailable')}
                      testId={`spot-card-${key}`}
                    />
                  );
                })}
              </div>
            </section>
          );
        }),
      )}
    </div>
  );
}
