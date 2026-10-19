import type { CSSProperties, ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrientationResponse } from '@cornerstone/shared';
import { SpotThumbnail } from '../SpotThumbnail/index.js';
import { AreaLink } from '../AreaLink/index.js';
import type { OriginState } from '../../navigation/origin.js';
import { useFormatters } from '../../lib/formatters.js';
import { buildSpotViewerPath, spotKey } from '../../lib/photoSpots.js';
import type { SpotCell, SpotGroup, SpotRow } from '../../lib/photoSpots.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './SpotsTable.module.css';

export interface NoAreaSelectProps {
  selecting: boolean;
  onToggleSelect: () => void;
  toggleRef: RefObject<HTMLButtonElement | null>;
  /** Replaces the 'No area' spot row while selecting. */
  selectContent: ReactNode;
}

export interface SpotsTableProps {
  groups: SpotGroup[];
  orientations: OrientationResponse[];
  linkState?: OriginState;
  noArea?: NoAreaSelectProps;
}

export function SpotsTable({ groups, orientations, linkState, noArea }: SpotsTableProps) {
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
    // Every cell of the 'No area' row opens the group (D-31), at that cell's latest photo.
    const viewerPath =
      cell.areaId === null
        ? buildSpotViewerPath(null, null, spot.latestPhotoId)
        : buildSpotViewerPath(cell.areaId, cell.orientationId, spot.latestPhotoId);
    return (
      <SpotThumbnail
        variant="cell"
        to={viewerPath}
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
                  {group.name === null ? (
                    <span className={styles.groupHeaderRow}>
                      <span className={styles.stickyLabel}>{t('spots.noArea')}</span>
                      {noArea ? (
                        <button
                          type="button"
                          className={styles.textButton}
                          ref={noArea.toggleRef}
                          onClick={noArea.onToggleSelect}
                          data-testid="no-area-select-toggle"
                        >
                          {noArea.selecting ? t('select.done') : t('select.start')}
                        </button>
                      ) : null}
                    </span>
                  ) : (
                    <span className={styles.stickyLabel}>
                      <AreaLink areaId={group.id} className={styles.bandLink}>
                        {group.name}
                      </AreaLink>
                    </span>
                  )}
                </th>
              </tr>
            ) : null}
            {group.rows.map((row) => {
              const label = row.name ?? t('spots.noArea');
              if (row.areaId === null && noArea?.selecting) {
                return (
                  <tr key="none">
                    <td colSpan={colCount + 1} className={styles.selectCell}>
                      {noArea.selectContent}
                    </td>
                  </tr>
                );
              }
              if (row.areaId === null) {
                return (
                  <tr key="none">
                    <th scope="row" className={styles.rowHeader} data-depth={0}>
                      <span className={styles.noAreaCount}>
                        {t('spots.noAreaCount', { count: group.photoCount })}
                      </span>
                    </th>
                    {row.cells.map((cell) => (
                      <td key={cell.orientationId ?? 'none'} className={styles.cell}>
                        {renderCell(row, cell)}
                      </td>
                    ))}
                  </tr>
                );
              }
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
                      <AreaLink areaId={row.areaId} className={styles.rowLink}>
                        {label}
                      </AreaLink>
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
