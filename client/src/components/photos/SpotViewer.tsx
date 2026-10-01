import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { Link } from 'react-router-dom';
import type { To } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AreaSummary, OrientationSummary, PhotoSpotPhoto } from '@cornerstone/shared';
import { DiaryEntryTypeBadge } from '../diary/DiaryEntryTypeBadge/DiaryEntryTypeBadge.js';
import { SpotHistoryList } from './SpotHistoryList.js';
import { useFormatters } from '../../lib/formatters.js';
import { formatAreaPath } from '../../lib/photoSpots.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './SpotViewer.module.css';

export interface SpotViewerProps {
  /** Newest first: index 0 is the latest photo */
  photos: PhotoSpotPhoto[];
  index: number;
  onSelect: (index: number) => void;
  onBack: () => void;
  backTo: To;
  backState: unknown;
  area: AreaSummary | null;
  orientation: OrientationSummary | null;
  /** Visually hidden page heading rendered by the page (focus target) */
  headingSlot: ReactNode;
  /** Ref of the heading in `headingSlot`, used as the focus fallback at the ends */
  headingRef?: RefObject<HTMLElement | null>;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.matches('input, select, textarea') ||
    target.isContentEditable ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      className={styles.chevron}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  );
}

function PictureOffIcon() {
  return (
    <svg
      className={styles.fallbackIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="M21 15l-5-5L5 21" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

function StagePhoto({
  photo,
  alt,
  unavailableLabel,
}: {
  photo: PhotoSpotPhoto;
  alt: string;
  unavailableLabel: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={styles.imageFallback}>
        <PictureOffIcon />
        <span className={sharedStyles.srOnly}>{unavailableLabel}</span>
      </div>
    );
  }
  return (
    <img
      className={styles.image}
      src={photo.fileUrl}
      alt={alt}
      onError={() => setFailed(true)}
      data-testid="spot-viewer-image"
    />
  );
}

export function SpotViewer({
  photos,
  index,
  onSelect,
  onBack,
  backTo,
  backState,
  area,
  orientation,
  headingSlot,
  headingRef,
}: SpotViewerProps) {
  const { t } = useTranslation('photos');
  const { formatDate } = useFormatters();
  const prevRef = useRef<HTMLButtonElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const total = photos.length;
  const photo = photos[index]!;
  const entry = photo.diaryEntry;
  const longDate = formatDate(entry.entryDate, undefined, 'long');
  const areaPath = area ? formatAreaPath(area) : t('spots.noArea');
  const orientationName = orientation?.name ?? t('spots.noOrientation');
  const caption = photo.caption?.trim() || null;
  const alt =
    caption ??
    t('viewer.photoAlt', { area: areaPath, orientation: orientationName, date: longDate });

  const atEarliest = index >= total - 1;
  const atLatest = index <= 0;

  // Keyboard: Left = earlier, Right = later, Escape = back.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;
      // Ignore keys pressed while focus is in other UI (e.g. the open sidebar).
      const target = e.target;
      if (
        target instanceof Node &&
        target !== document.body &&
        !rootRef.current?.contains(target)
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        if (index < total - 1) {
          e.preventDefault();
          onSelect(index + 1);
        }
      } else if (e.key === 'ArrowRight') {
        if (index > 0) {
          e.preventDefault();
          onSelect(index - 1);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [index, total, onSelect, onBack]);

  // A button that becomes disabled drops focus: hand it to the opposite button, else the heading.
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return;
    if (active === prevRef.current && atEarliest) {
      if (!atLatest) nextRef.current?.focus();
      else headingRef?.current?.focus();
    } else if (active === nextRef.current && atLatest) {
      if (!atEarliest) prevRef.current?.focus();
      else headingRef?.current?.focus();
    }
  }, [index, atEarliest, atLatest, headingRef]);

  return (
    <div className={styles.viewer} ref={rootRef}>
      <div className={styles.stage}>
        <div className={styles.topBar}>
          <Link
            to={backTo}
            state={backState}
            className={styles.backLink}
            data-testid="spot-viewer-back"
          >
            <Chevron direction="left" />
            {t('viewer.backToSpots')}
          </Link>
          {headingSlot}
          <span className={styles.position} data-testid="spot-viewer-position">
            {t('viewer.position', { current: index + 1, total })}
          </span>
        </div>

        <div className={styles.photoRow}>
          <button
            type="button"
            ref={prevRef}
            className={`${styles.navButton} ${styles.navPrev}`}
            aria-label={t('viewer.previous')}
            disabled={atEarliest}
            onClick={() => onSelect(index + 1)}
            data-testid="spot-viewer-prev"
          >
            <Chevron direction="left" />
          </button>
          <div className={styles.imageWrap}>
            <StagePhoto
              key={photo.id}
              photo={photo}
              alt={alt}
              unavailableLabel={t('viewer.imageUnavailable')}
            />
          </div>
          <button
            type="button"
            ref={nextRef}
            className={`${styles.navButton} ${styles.navNext}`}
            aria-label={t('viewer.next')}
            disabled={atLatest}
            onClick={() => onSelect(index - 1)}
            data-testid="spot-viewer-next"
          >
            <Chevron direction="right" />
          </button>
        </div>

        <p className={styles.keyHint}>{t('viewer.keyHint')}</p>
        <div role="status" aria-atomic="true" className={sharedStyles.srOnly}>
          {t('viewer.announcement', { current: index + 1, total, date: longDate })}
        </div>
      </div>

      <aside className={styles.details} aria-label={t('viewer.detailsLabel')}>
        <div className={styles.dateBlock}>
          <span className={styles.label}>{t('viewer.diaryDate')}</span>
          <span className={styles.dateValue} data-testid="spot-viewer-date">
            {longDate}
          </span>
        </div>

        <dl className={styles.facts}>
          <dt className={styles.factLabel}>{t('viewer.area')}</dt>
          <dd className={styles.factValue} data-testid="spot-viewer-area">
            {area ? (
              <span className={styles.areaValue}>
                {area.color ? (
                  // User-chosen area colour is data, not a design value: the one allowed inline style.
                  <span
                    className={styles.dot}
                    aria-hidden="true"
                    style={{ '--area-color': area.color } as CSSProperties}
                  />
                ) : null}
                {areaPath}
              </span>
            ) : (
              <span className={styles.muted}>{t('spots.noArea')}</span>
            )}
          </dd>
          <dt className={styles.factLabel}>{t('viewer.orientation')}</dt>
          <dd className={styles.factValue} data-testid="spot-viewer-orientation">
            {orientation ? (
              orientation.name
            ) : (
              <span className={styles.muted}>{t('spots.noOrientation')}</span>
            )}
          </dd>
          <dt className={styles.factLabel}>{t('viewer.caption')}</dt>
          <dd className={styles.factValue} data-testid="spot-viewer-caption">
            {caption ?? <span className={styles.muted}>{t('viewer.noCaption')}</span>}
          </dd>
        </dl>

        <div className={styles.entryCard}>
          <h3 className={styles.cardHeading}>{t('viewer.fromDiaryEntry')}</h3>
          <div className={styles.entryRow}>
            <DiaryEntryTypeBadge entryType={entry.entryType} />
            <span className={styles.entryTitle}>
              {entry.title?.trim() || t('viewer.untitledEntry')}
            </span>
          </div>
          <span className={styles.entryMeta}>{longDate}</span>
          <Link
            to={`/diary/${entry.id}`}
            className={styles.entryLink}
            data-testid="spot-viewer-diary-link"
          >
            {t('viewer.openDiaryEntry')}
          </Link>
        </div>

        <h2 className={styles.sectionHeading}>{t('viewer.sameSpotOverTime')}</h2>
        <SpotHistoryList photos={photos} currentIndex={index} onSelect={onSelect} />
      </aside>
    </div>
  );
}
