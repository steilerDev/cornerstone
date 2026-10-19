import { useLayoutEffect, useRef } from 'react';
import type { FocusEvent, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './PhotoStrip.module.css';

export interface PhotoStripTile {
  /** Server photo id, or capture item id. */
  key: string;
  kind: 'server' | 'pending';
  /** Server thumbnailUrl or the item's previewUrl. */
  thumbnailUrl: string;
  state: 'waiting' | 'uploading' | 'uploaded' | 'failed' | 'blocked';
  progress: number | null;
  /** Already resolved name ("Kitchen · Ground floor" when ambiguous). */
  areaLabel: string | null;
  orientationLabel: string | null;
  annotated: boolean;
  /** "Not saved on this device". */
  notPersisted: boolean;
}

export interface PhotoStripProps {
  tiles: readonly PhotoStripTile[];
  selectedKeys: ReadonlySet<string>;
  onToggleSelect: (key: string) => void;
  onOpen: (key: string) => void;
  onRetry: (key: string) => void;
  onRemove: (key: string) => void;
  /** Focus target after the last tile is removed (e.g. "Choose from library"). */
  emptyFocusRef: RefObject<HTMLElement | null>;
  testIdPrefix?: string;
}

interface PendingFocus {
  key: string;
  index: number;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Thumbnails of a draft's photos (stored and not yet uploaded) with select, retry and remove. */
export function PhotoStrip({
  tiles,
  selectedKeys,
  onToggleSelect,
  onOpen,
  onRetry,
  onRemove,
  emptyFocusRef,
  testIdPrefix = 'photo-strip',
}: PhotoStripProps) {
  const { t } = useTranslation('photos');
  const listRef = useRef<HTMLUListElement>(null);
  const pendingFocusRef = useRef<PendingFocus | null>(null);
  const knownKeysRef = useRef<ReadonlySet<string> | null>(null);

  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending && !tiles.some((tile) => tile.key === pending.key)) {
      pendingFocusRef.current = null;
      if (tiles.length === 0) {
        emptyFocusRef.current?.focus();
      } else {
        const buttons = listRef.current?.querySelectorAll<HTMLElement>('[data-open-button]');
        buttons?.[Math.min(pending.index, tiles.length - 1)]?.focus();
      }
    }

    // A newly appended tile scrolls into view (never on the first render).
    const known = knownKeysRef.current;
    knownKeysRef.current = new Set(tiles.map((tile) => tile.key));
    if (known && tiles.length > 0) {
      const last = tiles[tiles.length - 1];
      if (last && !known.has(last.key)) {
        const items = listRef.current?.querySelectorAll<HTMLElement>('[data-tile-key]');
        items?.[items.length - 1]?.scrollIntoView?.({
          block: 'nearest',
          inline: 'nearest',
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
      }
    }
  }, [tiles, emptyFocusRef]);

  if (tiles.length === 0) return null;

  // Focus that moved elsewhere means the pending removal was not (or no longer) a removal.
  const handleFocus = (event: FocusEvent<HTMLUListElement>) => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    const owner = (event.target as HTMLElement).closest<HTMLElement>('[data-tile-key]');
    if (owner?.dataset.tileKey !== pending.key) pendingFocusRef.current = null;
  };

  return (
    <ul ref={listRef} className={styles.strip} onFocus={handleFocus} data-testid={testIdPrefix}>
      {tiles.map((tile, index) => {
        const n = index + 1;
        const nameParts = [t('tile.name', { n, total: tiles.length })];
        if (tile.areaLabel) nameParts.push(tile.areaLabel);
        if (tile.orientationLabel) nameParts.push(tile.orientationLabel);
        if (tile.annotated) nameParts.push(t('tile.annotated'));
        if (tile.state === 'uploading') {
          nameParts.push(t('tile.uploadingSuffix', { percent: tile.progress ?? 0 }));
        } else if (tile.state === 'failed') {
          nameParts.push(t('tile.failedSuffix'));
        } else if (tile.state === 'blocked') {
          nameParts.push(t('tile.blockedSuffix'));
        }
        const canSelect = tile.state !== 'blocked';
        const selected = selectedKeys.has(tile.key);
        const id = `${testIdPrefix}-${tile.key}`;
        return (
          <li
            key={tile.key}
            className={styles.tile}
            data-tile-key={tile.key}
            data-state={tile.state}
            data-selected={selected ? 'true' : 'false'}
            data-testid={`${id}-tile`}
          >
            <button
              type="button"
              className={styles.open}
              data-open-button=""
              aria-label={nameParts.join(', ')}
              onClick={() => onOpen(tile.key)}
              data-testid={`${id}-open`}
            >
              <img src={tile.thumbnailUrl} alt="" className={styles.image} loading="lazy" />
              {tile.areaLabel ? (
                <span className={styles.tag} aria-hidden="true">
                  {tile.areaLabel}
                </span>
              ) : null}
              {tile.annotated ? (
                <svg
                  className={styles.annotated}
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  data-testid={`${id}-annotated`}
                >
                  <path d="M2 14l3-.8L13 5.2 10.8 3 2.8 11z" />
                  <path d="M9.6 4.2l2.2 2.2" />
                </svg>
              ) : null}
              {tile.state === 'waiting' ? (
                <span className={styles.status} aria-hidden="true">
                  {t('tile.waiting')}
                </span>
              ) : null}
              {tile.state === 'failed' ? (
                <span className={`${styles.status} ${styles.statusDanger}`} aria-hidden="true">
                  {t('tile.failed')}
                </span>
              ) : null}
              {tile.state === 'blocked' ? (
                <span className={`${styles.status} ${styles.statusDanger}`} aria-hidden="true">
                  {t('tile.blocked')}
                </span>
              ) : null}
              {tile.state === 'uploading' ? (
                <span className={styles.progressWrap} aria-hidden="true">
                  <progress className={styles.progress} max={100} value={tile.progress ?? 0} />
                  <span className={styles.percent}>
                    {t('tile.uploadingPercent', { percent: tile.progress ?? 0 })}
                  </span>
                </span>
              ) : null}
              {tile.notPersisted ? (
                <span className={styles.notPersisted} data-testid={`${id}-not-persisted`}>
                  {t('tile.notPersisted')}
                </span>
              ) : null}
            </button>
            {canSelect ? (
              <input
                type="checkbox"
                className={styles.select}
                checked={selected}
                onChange={() => onToggleSelect(tile.key)}
                aria-label={t('tile.select', { n })}
                data-testid={`${id}-select`}
              />
            ) : null}
            <button
              type="button"
              className={styles.remove}
              aria-label={t('tile.remove', { n })}
              onClick={() => {
                pendingFocusRef.current = { key: tile.key, index };
                onRemove(tile.key);
              }}
              data-testid={`${id}-remove`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M3 3l8 8M11 3l-8 8" />
              </svg>
            </button>
            {tile.state === 'failed' ? (
              <button
                type="button"
                className={styles.retry}
                aria-label={t('tile.retry', { n })}
                onClick={() => onRetry(tile.key)}
                data-testid={`${id}-retry`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M13 8a5 5 0 1 1-1.5-3.6" />
                  <path d="M13 2.5v3h-3" />
                </svg>
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
