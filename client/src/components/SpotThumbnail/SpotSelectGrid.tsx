import { SpotThumbnail } from './SpotThumbnail.js';
import styles from './SpotSelectGrid.module.css';

export interface SpotSelectGridItem {
  id: string;
  thumbnailUrl: string;
  label: string;
  locked: boolean;
}

export interface SpotSelectGridProps {
  items: SpotSelectGridItem[];
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** `role="group"` accessible name. */
  groupLabel: string;
  lockedLabel: string;
  imageUnavailableLabel: string;
  /** Tiles: `${testIdPrefix}-${id}`. */
  testIdPrefix: string;
}

/** Grid of selectable photo tiles, in the given order (newest first). */
export function SpotSelectGrid({
  items,
  selectedIds,
  onToggle,
  groupLabel,
  lockedLabel,
  imageUnavailableLabel,
  testIdPrefix,
}: SpotSelectGridProps) {
  return (
    <ul className={styles.grid} role="group" aria-label={groupLabel}>
      {items.map((item) => (
        <li key={item.id} className={styles.item}>
          <SpotThumbnail
            variant="cell"
            src={item.thumbnailUrl}
            emptyLabel=""
            imageUnavailableLabel={imageUnavailableLabel}
            testId={`${testIdPrefix}-${item.id}`}
            select={{
              selected: selectedIds.has(item.id),
              onToggle: () => onToggle(item.id),
              label: item.label,
              ...(item.locked ? { disabledLabel: lockedLabel } : {}),
            }}
          />
        </li>
      ))}
    </ul>
  );
}
