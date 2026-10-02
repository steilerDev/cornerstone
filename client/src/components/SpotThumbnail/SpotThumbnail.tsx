import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { To } from 'react-router-dom';
import sharedStyles from '../../styles/shared.module.css';
import styles from './SpotThumbnail.module.css';

export interface SpotThumbnailProps {
  /** cell: 16:9, unbordered (table); card: 4:3, bordered card with title line */
  variant: 'cell' | 'card';
  /** Link target; omitted renders the empty, non-interactive placeholder */
  to?: To;
  linkState?: unknown;
  /** Forwarded to the link (focus restore) */
  id?: string;
  src?: string | null;
  count?: number;
  /** Visible short date */
  dateLabel?: string;
  /** Link accessible name (required when `to` is set) */
  ariaLabel?: string;
  /** Card variant: line above the date (e.g. orientation name) */
  title?: string | null;
  /** Card empty state: muted title */
  titleMuted?: boolean;
  emptyLabel: string;
  /** Visually hidden context placed before the empty label */
  emptySrPrefix?: string;
  /** Screen-reader text for the image-error fallback */
  imageUnavailableLabel: string;
  testId?: string;
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

function ThumbImage({
  src,
  unavailableLabel,
}: {
  src: string | null | undefined;
  unavailableLabel: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className={styles.fallback}>
        <PictureOffIcon />
        <span className={sharedStyles.srOnly}>{unavailableLabel}</span>
      </span>
    );
  }
  return (
    <img className={styles.image} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
  );
}

export function SpotThumbnail({
  variant,
  to,
  linkState,
  id,
  src,
  count,
  dateLabel,
  ariaLabel,
  title,
  titleMuted = false,
  emptyLabel,
  emptySrPrefix,
  imageUnavailableLabel,
  testId = 'spot-thumbnail',
}: SpotThumbnailProps) {
  const variantClass = variant === 'card' ? styles.card : styles.cell;

  if (to === undefined) {
    return (
      <div className={`${styles.root} ${variantClass} ${styles.empty}`} data-testid={testId}>
        {variant === 'card' && title ? (
          <div className={`${styles.body} ${styles.bodyEmpty}`}>
            <span className={`${styles.title} ${titleMuted ? styles.titleMuted : ''}`}>
              {title}
            </span>
          </div>
        ) : null}
        <div className={styles.emptyBox}>
          {emptySrPrefix ? <span className={sharedStyles.srOnly}>{emptySrPrefix}</span> : null}
          {emptyLabel}
        </div>
        <div className={styles.dateReserve} aria-hidden="true" />
      </div>
    );
  }

  return (
    <Link
      id={id}
      to={to}
      state={linkState}
      className={`${styles.root} ${variantClass} ${styles.link}`}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <span className={styles.thumb}>
        <span className={styles.thumbImageWrap} key={src ?? ''}>
          <ThumbImage src={src} unavailableLabel={imageUnavailableLabel} />
        </span>
        {count !== undefined ? (
          <span className={styles.count} aria-hidden="true">
            {count}
          </span>
        ) : null}
      </span>
      <span className={styles.body}>
        {variant === 'card' && title ? <span className={styles.title}>{title}</span> : null}
        {dateLabel ? <span className={styles.date}>{dateLabel}</span> : null}
      </span>
    </Link>
  );
}
