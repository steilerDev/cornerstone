import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrientationResponse } from '@cornerstone/shared';
import { SpotThumbnail } from '../SpotThumbnail/index.js';
import type { OriginState } from '../../navigation/origin.js';
import { useFormatters } from '../../lib/formatters.js';
import { buildSpotViewerPath, spotKey } from '../../lib/photoSpots.js';
import type { SpotCell, SpotGroup, SpotRow } from '../../lib/photoSpots.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './SpotsTable.module.css';

export interface SpotsTableProps {
  groups: SpotGroup[];
  orientations: OrientationResponse[];
  linkState?: OriginState;
}

export function SpotsTable({ groups, orientations, linkState }: SpotsTableProps) {
  const { t } = useTranslation('photos');
  const { formatDate } = useFormatters();
  const colCount = orientations.length + 1;

  const renderCell = (row: SpotRow, cell: SpotCell) => {
    const key = spotKey(cell.areaId, cell.orientationId);
    const areaName = row.name ?? t('spots.noArea');
    const orientationName = cell.orientationName ?? t('spots.noOrientation');
    const { spot } = cell;
    if (!spot) {
      return (
        <SpotThumbnail
          variant="cell"
          emptyLabel={t('spots.noPhotos')}
          emptySrPrefix={t('spots.emptyCellPrefix', {
            area: areaName,
            orientation: orientationName,
          })}
          imageUnavailableLabel={t('viewer.imageUnavailable')}
          testId={`spot-cell-${key}`}
        />
      );
    }
    return (
      <SpotThumbnail
        variant="cell"
        to={buildSpotViewerPath(cell.areaId, cell.orientationId, spot.latestPhotoId)}
        linkState={linkState}
        id={`spot-${key}`}
        src={spot.latestThumbnailUrl}
        count={spot.photoCount}
        dateLabel={formatDate(spot.latestEntryDate)}
        ariaLabel={t('spots.cellLabel', {
          area: areaName,
          orientation: orientationName,
          count: spot.photoCount,
          date: formatDate(spot.latestEntryDate, undefined, 'long'),
        })}
        emptyLabel={t('spots.noPhotos')}
        imageUnavailableLabel={t('viewer.imageUnavailable')}
        testId={`spot-cell-${key}`}
      />
    );
  };

  return (
    <div className={styles.tableScroll}>
      <table
        className={styles.table}
        style={{ '--spot-col-count': orientations.length + 1 } as CSSProperties}
      >
        <caption className={sharedStyles.srOnly}>{t('spots.tableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.corner}>
              {t('spots.areaColumn')}
            </th>
            {orientations.map((o) => (
              <th key={o.id} scope="col" className={styles.colHeader}>
                {o.name}
              </th>
            ))}
            <th scope="col" className={styles.colHeader}>
              {t('spots.noOrientation')}
            </th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.id}>
            {group.hasHeader ? (
              <tr>
                <th scope="rowgroup" colSpan={colCount + 1} className={styles.groupHeader}>
                  <span className={styles.stickyLabel}>{group.name}</span>
                </th>
              </tr>
            ) : null}
            {group.rows.map((row) => {
              const label = row.name ?? t('spots.noArea');
              return (
                <tr key={row.areaId ?? 'none'}>
                  <th
                    scope="row"
                    className={styles.rowHeader}
                    data-depth={Math.min(row.depth, 3)}
                    title={label}
                  >
                    <span className={styles.rowLabel}>
                      {row.color ? (
                        // User-chosen area colour is data, not a design value: the one allowed inline style.
                        <span
                          className={styles.dot}
                          aria-hidden="true"
                          style={{ '--area-color': row.color } as CSSProperties}
                        />
                      ) : null}
                      <span className={row.name === null ? styles.rowLabelMuted : undefined}>
                        {label}
                      </span>
                    </span>
                  </th>
                  {row.cells.map((cell) => (
                    <td key={cell.orientationId ?? 'none'} className={styles.cell}>
                      {renderCell(row, cell)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}
