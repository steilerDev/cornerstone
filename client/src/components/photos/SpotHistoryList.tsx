import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { PhotoSpotPhoto } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import styles from './SpotHistoryList.module.css';

export interface SpotHistoryListProps {
  photos: PhotoSpotPhoto[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export function SpotHistoryList({ photos, currentIndex, onSelect }: SpotHistoryListProps) {
  const { t } = useTranslation(['photos', 'diary']);
  const { formatDate } = useFormatters();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const currentRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView?.({
      block: 'nearest',
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [currentIndex, reducedMotion]);

  return (
    <ul className={styles.list}>
      {photos.map((photo, i) => {
        const entry = photo.diaryEntry;
        const type = t(I18N_UNION_KEYS.diaryEntryType.key(entry.entryType), { ns: 'diary' });
        const title = entry.title?.trim() || null;
        const secondary = title ? t('viewer.historyItemSecondary', { type, title }) : type;
        const isCurrent = i === currentIndex;
        return (
          <li key={photo.id}>
            <button
              type="button"
              ref={isCurrent ? currentRef : undefined}
              className={styles.item}
              aria-current={isCurrent ? 'true' : undefined}
              aria-label={
                title
                  ? t('viewer.historyItemLabel', {
                      date: formatDate(entry.entryDate, undefined, 'long'),
                      type,
                      title,
                    })
                  : t('viewer.historyItemLabelUntitled', {
                      date: formatDate(entry.entryDate, undefined, 'long'),
                      type,
                    })
              }
              onClick={() => onSelect(i)}
              data-testid={`spot-history-item-${photo.id}`}
            >
              <span className={styles.thumb}>
                <img className={styles.thumbImage} src={photo.thumbnailUrl} alt="" loading="lazy" />
              </span>
              <span className={styles.text}>
                <span className={styles.date}>{formatDate(entry.entryDate)}</span>
                <span className={styles.secondary} title={secondary}>
                  {secondary}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
