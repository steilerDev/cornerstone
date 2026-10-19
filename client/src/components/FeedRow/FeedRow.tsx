import type { ReactNode } from 'react';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { Badge } from '../Badge/Badge.js';
import type { BadgeVariant } from '../Badge/Badge.js';
import badgeStyles from '../Badge/Badge.module.css';
import { CheckIcon } from '../Badge/statusBadgeVariants.js';
import shared from '../../styles/shared.module.css';
import styles from './FeedRow.module.css';

export interface FeedRowLink {
  to: string;
  label: string;
  ariaLabel: string;
  state?: unknown;
}

export interface FeedRowThumbnail {
  id: string;
  src: string;
}

export interface FeedRowEntryProps {
  variant: 'entry';
  as?: 'li' | 'div';
  /** Coloured type chip (from useStatusBadgeVariants().diaryType[type]). */
  typeBadge: BadgeVariant;
  /** Extra badges after the type (Draft). */
  badges?: ReactNode;
  /** Visible title; the row's only link. */
  title: string;
  titleLink: { to: string; ariaLabel: string; state?: unknown };
  dateLabel: string;
  /** One line (ellipsis); omitted when empty. */
  sentence?: string;
  /** Muted facts joined by " · " (company, "2 workers"). */
  facts?: string[];
  /** "Signed", rendered last with an aria-hidden CheckIcon. */
  signedLabel?: string;
  /** Chip contents (text only), at most 3 shown; the rest as one "+n" chip. */
  areas?: { id: string; content: ReactNode }[];
  areasMoreLabel?: (count: number) => string;
  /** Up to 5 used. */
  thumbnails?: FeedRowThumbnail[];
  /** > 0: a 6th "+n" tile (aria-hidden). */
  thumbnailsMore?: number;
  thumbnailsMoreLabel?: (count: number) => string;
  /** Visually hidden sentence, e.g. "3 photos". */
  thumbnailsLabel?: string;
  testId: string;
}

const MAX_THUMBNAILS = 5;
const MAX_AREA_CHIPS = 3;

export interface FeedRowEventProps {
  variant?: 'event';
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

export type FeedRowProps = FeedRowEventProps | FeedRowEntryProps;

const TYPE_VARIANTS_KEY = 'type';

/**
 * One row of a feed: type badge, time, a sentence, detail lines and an optional link row. It is
 * presentational: every string comes in through props, and it is not interactive itself.
 */
export function FeedRow(props: FeedRowProps) {
  if (props.variant === 'entry') return <EntryFeedRow {...props} />;
  return <EventFeedRow {...props} />;
}

function EventFeedRow({
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
}: FeedRowEventProps) {
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

/**
 * A manual diary entry as a photo-first row: thumbnail strip, coloured type chip, the title as the
 * row's one stretched link, a one-line text, muted facts and text-only area chips.
 */
function EntryFeedRow({
  as: Root = 'li',
  typeBadge,
  badges,
  title,
  titleLink,
  dateLabel,
  sentence,
  facts = [],
  signedLabel,
  areas = [],
  areasMoreLabel,
  thumbnails = [],
  thumbnailsMore = 0,
  thumbnailsMoreLabel,
  thumbnailsLabel,
  testId,
}: FeedRowEntryProps) {
  const shownThumbs = thumbnails.slice(0, MAX_THUMBNAILS);
  const shownAreas = areas.slice(0, MAX_AREA_CHIPS);
  const hiddenAreas = areas.length - shownAreas.length;
  const hasFacts = facts.length > 0 || Boolean(signedLabel);

  return (
    <Root
      className={styles.entryRow}
      data-has-strip={shownThumbs.length > 0 ? 'true' : undefined}
      data-testid={testId}
    >
      {shownThumbs.length > 0 ? (
        <div className={styles.strip} aria-hidden="true" data-testid={`${testId}-thumbs`}>
          {shownThumbs.map((thumb) => (
            <img
              key={thumb.id}
              src={thumb.src}
              alt=""
              loading="lazy"
              decoding="async"
              className={styles.thumb}
            />
          ))}
          {thumbnailsMore > 0 ? (
            <span className={styles.thumbMore} data-testid={`${testId}-thumbs-more`}>
              {thumbnailsMoreLabel ? thumbnailsMoreLabel(thumbnailsMore) : `+${thumbnailsMore}`}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className={styles.entryBody}>
        <div className={styles.meta}>
          <Badge
            variants={{ [TYPE_VARIANTS_KEY]: typeBadge }}
            value={TYPE_VARIANTS_KEY}
            testId={`${testId}-type`}
          />
          {badges}
          <span className={styles.time}>{dateLabel}</span>
        </div>
        <NavAnchor
          to={titleLink.to}
          state={titleLink.state}
          className={styles.titleLink}
          aria-label={titleLink.ariaLabel}
          data-testid={`${testId}-link`}
        >
          {title}
        </NavAnchor>
        {sentence ? <p className={styles.oneLine}>{sentence}</p> : null}
        {hasFacts ? (
          <p className={styles.facts}>
            {facts.join(' · ')}
            {signedLabel ? (
              <span data-testid={`${testId}-signed`}>
                {facts.length > 0 ? ' · ' : null}
                <CheckIcon /> {signedLabel}
              </span>
            ) : null}
          </p>
        ) : null}
        {shownAreas.length > 0 ? (
          <ul className={styles.chips} data-testid={`${testId}-areas`}>
            {shownAreas.map((area) => (
              <li key={area.id} className={styles.chip}>
                {area.content}
              </li>
            ))}
            {hiddenAreas > 0 ? (
              <li className={styles.chip}>
                {areasMoreLabel ? areasMoreLabel(hiddenAreas) : `+${hiddenAreas}`}
              </li>
            ) : null}
          </ul>
        ) : null}
        {thumbnailsLabel ? <span className={shared.srOnly}>{thumbnailsLabel}</span> : null}
      </div>
    </Root>
  );
}
