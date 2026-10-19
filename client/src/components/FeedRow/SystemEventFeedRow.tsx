import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import { renderSystemEvent } from '../../lib/systemEventText.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { Badge } from '../Badge/Badge.js';
import badgeStyles from '../Badge/Badge.module.css';
import { FeedRow } from './FeedRow.js';

export interface SystemEventFeedRowProps {
  entry: DiaryEntrySummary;
  as?: 'li' | 'div';
  /** `detail`: no time (entry page). `compact`: no link row (dashboard). */
  variant?: 'list' | 'detail' | 'compact';
}

/** A system event (automatic diary entry) as a FeedRow; all wording from `renderSystemEvent`. */
export function SystemEventFeedRow({ entry, as, variant = 'list' }: SystemEventFeedRowProps) {
  const { t } = useTranslation(['diary', 'common']);
  const { formatDate, formatCurrency, formatTime } = useFormatters();
  const originState = useOriginState();
  const view = useMemo(
    () =>
      renderSystemEvent(entry, t, {
        formatDate: (d) => formatDate(d),
        formatCurrency,
      }),
    [entry, t, formatDate, formatCurrency],
  );

  const badges = (
    <>
      {view.extraBadge ? (
        <Badge
          variants={{ extra: { label: view.extraBadge, className: badgeStyles.neutral } }}
          value="extra"
          testId={`system-event-${entry.id}-extra`}
        />
      ) : null}
      {view.repeat ? (
        <span aria-hidden="true">
          <Badge
            variants={{ repeat: { label: view.repeat.badge, className: badgeStyles.neutral } }}
            value="repeat"
          />
        </span>
      ) : null}
      {view.afterReached ? (
        <Badge
          variants={{
            afterReached: { label: view.afterReached.badge, className: badgeStyles.neutral },
          }}
          value="afterReached"
        />
      ) : null}
    </>
  );

  return (
    <FeedRow
      as={as}
      typeLabel={view.typeLabel}
      badges={badges}
      time={variant === 'detail' ? undefined : formatTime(entry.createdAt)}
      sentence={view.sentence}
      sentenceMuted={view.isLegacyText}
      details={[view.detail, view.repeat?.detail, view.afterReached?.detail].filter(
        (line): line is string => Boolean(line),
      )}
      link={variant === 'compact' || !view.link ? null : { ...view.link, state: originState }}
      removedLabel={
        view.removed && variant !== 'compact' ? t('event.removed', { ns: 'diary' }) : null
      }
      compact={variant === 'compact'}
      testId={`system-event-${entry.id}`}
    />
  );
}
