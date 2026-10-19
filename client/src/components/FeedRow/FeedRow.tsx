import type { ReactNode } from 'react';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { Badge } from '../Badge/Badge.js';
import badgeStyles from '../Badge/Badge.module.css';
import styles from './FeedRow.module.css';

export interface FeedRowLink {
  to: string;
  label: string;
  ariaLabel: string;
  state?: unknown;
}

export interface FeedRowProps {
  /** `li` inside a list, `div` elsewhere (entry page, dashboard card). Default `li`. */
  as?: 'li' | 'div';
  typeLabel: string;
  /** Extra badges after the type badge (repeat count, "After reached"). */
  badges?: ReactNode;
  /** Already formatted; omitted on the entry page. */
  time?: string;
  sentence: string;
  /** Stored legacy text. */
  sentenceMuted?: boolean;
  /** Detail lines under the sentence. */
  details?: string[];
  link?: FeedRowLink | null;
  /** Shown instead of the link when the subject is gone. */
  removedLabel?: string | null;
  /** Dashboard: no link row. */
  compact?: boolean;
  /** Row actions after the link row (P4.11 "Revert submission"). Omitted = nothing rendered. */
  actions?: ReactNode;
  testId: string;
}

const TYPE_VARIANTS_KEY = 'type';

/**
 * One row of a feed: type badge, time, a sentence, detail lines and an optional link row. It is
 * presentational: every string comes in through props, and it is not interactive itself.
 */
export function FeedRow({
  as: Root = 'li',
  typeLabel,
  badges,
  time,
  sentence,
  sentenceMuted = false,
  details = [],
  link = null,
  removedLabel = null,
  compact = false,
  actions,
  testId,
}: FeedRowProps) {
  const linkRow =
    !compact && link ? (
      <NavAnchor
        to={link.to}
        state={link.state}
        className={styles.link}
        aria-label={link.ariaLabel}
        data-testid={`${testId}-link`}
      >
        {link.label}
        <span aria-hidden="true"> ›</span>
      </NavAnchor>
    ) : null;
  const removedRow =
    !compact && !link && removedLabel ? (
      <span className={styles.removed} data-testid={`${testId}-removed`}>
        {removedLabel}
      </span>
    ) : null;
  const hasActions = !compact && actions !== undefined && actions !== null && actions !== false;

  return (
    <Root className={styles.row} data-testid={testId}>
      <div className={styles.meta}>
        <Badge
          variants={{ [TYPE_VARIANTS_KEY]: { label: typeLabel, className: badgeStyles.neutral } }}
          value={TYPE_VARIANTS_KEY}
          testId={`${testId}-type`}
        />
        {badges}
        {time ? <span className={styles.time}>{time}</span> : null}
      </div>
      <p className={sentenceMuted ? `${styles.sentence} ${styles.muted}` : styles.sentence}>
        {sentence}
      </p>
      {details.map((line) => (
        <p key={line} className={styles.detail}>
          {line}
        </p>
      ))}
      {hasActions ? (
        <div className={styles.footer}>
          {linkRow}
          {removedRow}
          <div className={styles.actions} data-testid={`${testId}-actions`}>
            {actions}
          </div>
        </div>
      ) : (
        <>
          {linkRow}
          {removedRow}
        </>
      )}
    </Root>
  );
}
