import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Link } from 'react-router-dom';
import type { To } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AreaSummary, OrientationSummary, PhotoSpotPhoto } from '@cornerstone/shared';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { Sheet } from '../Modal/Sheet.js';
import { PhotoDetailsPanel } from './PhotoDetailsPanel.js';
import type { PhotoDetailsSaveResult } from './PhotoDetailsPanel.js';
import { SpotHistoryList } from './SpotHistoryList.js';
import type { OriginState } from '../../navigation/origin.js';
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
  /** Text of the top-bar back link: "Photos" or "Back to <origin>" */
  backLabel: string;
  /** Origin state for the "Open diary entry" link */
  entryLinkState?: OriginState;
  area: AreaSummary | null;
  orientation: OrientationSummary | null;
  /** Visible page heading (focus target): "EG › Flur · Floor" or "No area" */
  title: string;
  /** Ref of the heading, used as the focus fallback at the ends */
  headingRef?: RefObject<HTMLHeadingElement | null>;
  /** Increment to move focus to the heading (the phone chrome is shown first). */
  headingFocusRequest?: number;
  /** The 'No area' group, not a spot: the list heading reads "Photos with no area". */
  isNoAreaGroup: boolean;
  onAnnotate: (photo: PhotoSpotPhoto, returnFocusRef: RefObject<HTMLElement | null>) => void;
  onDetailsSaved: (result: PhotoDetailsSaveResult) => void;
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

function PencilIcon() {
  return (
    <svg
      className={styles.toolIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 3L21 7M3 21H7L20 8L16 4L3 17V21Z" />
    </svg>
  );
}

function EyeIcon({ slashed }: { slashed: boolean }) {
  return (
    <svg
      className={styles.toolIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {slashed ? (
        <path d="M1 1l22 22M9.88 9.88A3 3 0 1012.32 15.32M9.379 5.407A10.863 10.863 0 0112 5c7 0 11 8 11 8a13.986 13.986 0 01-1.811 2.834m-2.409 1.879A10 10 0 0023.07 12s-4-8-11-8-9.2 3.6-10.6 5.6" />
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
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

function photoUrl(photo: PhotoSpotPhoto, original: boolean): string {
  if (!original) return photo.fileUrl;
  return `${photo.fileUrl}${photo.fileUrl.includes('?') ? '&' : '?'}variant=original`;
}

function StagePhoto({
  src,
  alt,
  unavailableLabel,
  onClick,
}: {
  src: string;
  alt: string;
  unavailableLabel: string;
  onClick?: () => void;
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
      src={src}
      alt={alt}
      onClick={onClick}
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
  backLabel,
  entryLinkState,
  area,
  orientation,
  title,
  headingRef,
  headingFocusRequest = 0,
  isNoAreaGroup,
  onAnnotate,
  onDetailsSaved,
}: SpotViewerProps) {
  const { t } = useTranslation(['photos', 'photoViewer']);
  const { formatDate } = useFormatters();
  const isPhone = useMediaQuery('(max-width: 767px)');
  const prevRef = useRef<HTMLButtonElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const annotateRef = useRef<HTMLButtonElement | null>(null);
  const detailsBtnRef = useRef<HTMLButtonElement | null>(null);
  const reasonId = useId();
  const detailsSheetId = useId();

  const [chromeVisible, setChromeVisible] = useState(true);
  const [editing, setEditing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [original, setOriginal] = useState<{ photoId: string; on: boolean }>({
    photoId: '',
    on: false,
  });

  const total = photos.length;
  const photo = photos[index]!;
  const entry = photo.diaryEntry;
  const longDate = formatDate(entry.entryDate, undefined, 'long');
  const areaPath = area ? formatAreaPath(area) : t('photos:spots.noArea');
  const photoOrientation = photo.orientation ?? orientation;
  const orientationName = photoOrientation?.name ?? t('photos:spots.noOrientation');
  const caption = photo.caption?.trim() || null;
  const alt =
    caption ??
    t('photos:viewer.photoAlt', { area: areaPath, orientation: orientationName, date: longDate });

  const atEarliest = index >= total - 1;
  const atLatest = index <= 0;

  const showingOriginal = original.photoId === photo.id && original.on;
  const hasMarkup = photo.annotatedAt !== null;
  const locked = entry.isSigned;
  const missingDimensions = !photo.width || !photo.height;
  const annotateDisabled = locked || missingDimensions;
  const annotateReason = locked
    ? t('photoViewer:annotateDisabledSigned')
    : missingDimensions
      ? t('photoViewer:annotateDisabledMissingDimensions')
      : null;

  const chromeHidden = isPhone && !chromeVisible;
  const dialogOpen = editing || detailsOpen;

  // Keyboard: Left = earlier, Right = later, Escape = back.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (dialogOpen || isTypingTarget(e.target)) return;
      // Ignore keys pressed while focus is in other UI (e.g. the open sidebar).
      const target = e.target;
      if (
        target instanceof Node &&
        target !== document.body &&
        !rootRef.current!.contains(target)
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
  }, [index, total, onSelect, onBack, dialogOpen]);

  // A button that becomes disabled drops focus: hand it to the opposite button, else the heading.
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return;
    if (active === prevRef.current && atEarliest) {
      if (!atLatest) nextRef.current?.focus();
      else headingRef?.current!.focus();
    } else if (active === nextRef.current && atLatest) {
      if (!atEarliest) prevRef.current?.focus();
      else headingRef?.current!.focus();
    }
  }, [index, atEarliest, atLatest, headingRef]);

  // The page asks for the heading (after a photo moved away): reveal the phone chrome first.
  const handledRequestRef = useRef(headingFocusRequest);
  useEffect(() => {
    if (handledRequestRef.current === headingFocusRequest) return undefined;
    handledRequestRef.current = headingFocusRequest;
    setChromeVisible(true);
    const frame = window.requestAnimationFrame(() => headingRef?.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [headingFocusRequest, headingRef]);

  const onChromeFocus = useCallback(() => setChromeVisible(true), []);

  const panelPhoto = {
    id: photo.id,
    caption: photo.caption,
    areaId: photo.areaId,
    orientationId: photo.orientationId,
    orientation: photo.orientation,
  };
  const panel = (
    <PhotoDetailsPanel
      photo={panelPhoto}
      area={area}
      diaryDate={entry.entryDate}
      entry={entry}
      entryLinkState={entryLinkState}
      locked={locked}
      onSaved={onDetailsSaved}
      onEditingChange={setEditing}
      testIdPrefix="spot-viewer-details-panel"
    >
      <h2 className={styles.sectionHeading}>
        {isNoAreaGroup ? t('photos:viewer.noAreaOverTime') : t('photos:viewer.sameSpotOverTime')}
      </h2>
      <SpotHistoryList photos={photos} currentIndex={index} onSelect={onSelect} />
    </PhotoDetailsPanel>
  );

  const chromeClass = chromeHidden ? styles.chromeHidden : '';

  return (
    <div className={styles.viewer} ref={rootRef}>
      <div className={styles.stage}>
        <div className={`${styles.topBar} ${chromeClass}`} onFocus={onChromeFocus}>
          <Link
            to={backTo}
            state={backState}
            className={styles.backLink}
            data-testid="spot-viewer-back"
          >
            <Chevron direction="left" />
            {backLabel}
          </Link>
          <h1
            tabIndex={-1}
            ref={headingRef}
            className={styles.title}
            data-testid="spot-viewer-title"
          >
            {title}
          </h1>
          <span className={styles.position} data-testid="spot-viewer-position">
            {t('photos:viewer.position', { current: index + 1, total })}
          </span>
        </div>

        <div className={styles.photoRow}>
          <button
            type="button"
            ref={prevRef}
            className={`${styles.navButton} ${styles.navPrev} ${chromeClass}`}
            aria-label={t('photos:viewer.previous')}
            disabled={atEarliest}
            onFocus={onChromeFocus}
            onClick={() => onSelect(index + 1)}
            data-testid="spot-viewer-prev"
          >
            <Chevron direction="left" />
          </button>
          <div className={styles.imageWrap}>
            <StagePhoto
              key={`${photo.id}-${showingOriginal ? 'o' : 'a'}`}
              src={photoUrl(photo, showingOriginal)}
              alt={alt}
              unavailableLabel={t('photos:viewer.imageUnavailable')}
              onClick={isPhone ? () => setChromeVisible((v) => !v) : undefined}
            />
          </div>
          <button
            type="button"
            ref={nextRef}
            className={`${styles.navButton} ${styles.navNext} ${chromeClass}`}
            aria-label={t('photos:viewer.next')}
            disabled={atLatest}
            onFocus={onChromeFocus}
            onClick={() => onSelect(index - 1)}
            data-testid="spot-viewer-next"
          >
            <Chevron direction="right" />
          </button>
        </div>

        <div
          className={`${styles.toolbar} ${chromeClass}`}
          onFocus={onChromeFocus}
          data-testid="spot-viewer-toolbar"
        >
          <button
            type="button"
            ref={annotateRef}
            className={styles.textButton}
            aria-disabled={annotateDisabled || undefined}
            aria-describedby={annotateReason ? reasonId : undefined}
            onClick={() => {
              if (annotateDisabled) return;
              onAnnotate(photo, annotateRef);
            }}
            data-testid="spot-viewer-annotate"
          >
            <PencilIcon />
            <span>{t('photoViewer:annotateLabel')}</span>
          </button>
          {hasMarkup ? (
            <button
              type="button"
              className={`${styles.iconButton} ${showingOriginal ? styles.iconButtonActive : ''}`}
              aria-pressed={showingOriginal}
              aria-label={
                showingOriginal ? t('photoViewer:viewAnnotated') : t('photoViewer:viewOriginal')
              }
              onClick={() => setOriginal({ photoId: photo.id, on: !showingOriginal })}
              data-testid="spot-viewer-view-original"
            >
              <EyeIcon slashed={showingOriginal} />
            </button>
          ) : null}
          {isPhone ? (
            <button
              type="button"
              ref={detailsBtnRef}
              className={`${styles.textButton} ${styles.detailsButton}`}
              aria-haspopup="dialog"
              onClick={() => setDetailsOpen(true)}
              data-testid="spot-viewer-details"
            >
              {t('photos:viewer.details')}
            </button>
          ) : null}
          {annotateReason ? (
            <p id={reasonId} className={styles.reason}>
              {annotateReason}
            </p>
          ) : null}
        </div>

        <p className={styles.keyHint}>{t('photos:viewer.keyHint')}</p>
        <div role="status" aria-atomic="true" className={sharedStyles.srOnly}>
          {t('photos:viewer.announcement', { current: index + 1, total, date: longDate })}
        </div>
      </div>

      {isPhone ? (
        <Sheet
          id={detailsSheetId}
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          title={t('photos:viewer.detailsLabel')}
          returnFocusRef={detailsBtnRef}
          testId="spot-viewer-details-sheet"
        >
          {detailsOpen ? <div className={styles.details}>{panel}</div> : null}
        </Sheet>
      ) : (
        <div className={styles.details}>{panel}</div>
      )}
    </div>
  );
}
