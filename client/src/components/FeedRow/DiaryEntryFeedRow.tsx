import { routeUrl } from '@cornerstone/shared';
import { DIARY_LIST_THUMBNAIL_LIMIT } from '@cornerstone/shared';
import type { DailyLogMetadata, DeliveryMetadata, DiaryEntrySummary } from '@cornerstone/shared';
import { useTranslation } from 'react-i18next';
import { useDiaryEntryTitle } from '../../hooks/useDiaryEntryTitle.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useFormatters } from '../../lib/formatters.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { AreaBreadcrumb } from '../AreaBreadcrumb/AreaBreadcrumb.js';
import { Badge } from '../Badge/Badge.js';
import badgeStyles from '../Badge/Badge.module.css';
import { FeedRow } from './FeedRow.js';

export interface DiaryEntryFeedRowProps {
  entry: DiaryEntrySummary;
  as?: 'li' | 'div';
}

/** First non-empty line of the entry text, trimmed. */
function firstLine(body: string | null | undefined): string | undefined {
  if (!body) return undefined;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

/** A manual diary entry (or a draft) as a photo-first FeedRow. */
export function DiaryEntryFeedRow({ entry, as }: DiaryEntryFeedRowProps) {
  const { t } = useTranslation('diary');
  const { formatDate, formatDayMonth } = useFormatters();
  const originState = useOriginState();
  const title = useDiaryEntryTitle(entry) ?? '';
  const { diaryType } = useStatusBadgeVariants();

  const isDraft = entry.status === 'draft';
  const metadata = (entry.metadata ?? {}) as DailyLogMetadata & DeliveryMetadata;
  const company =
    entry.entryType === 'daily_log'
      ? metadata.vendorName
      : entry.entryType === 'delivery'
        ? metadata.vendor
        : null;
  const workers = entry.entryType === 'daily_log' ? metadata.workersOnSite : null;
  const facts: string[] = [];
  if (company) facts.push(company);
  if (typeof workers === 'number' && Number.isInteger(workers) && workers >= 1) {
    facts.push(t('metadata.workerCount', { count: workers }));
  }

  const thumbnails = (entry.thumbnails ?? [])
    .slice(0, DIARY_LIST_THUMBNAIL_LIMIT)
    .map(({ id, thumbnailUrl }) => ({ id, src: thumbnailUrl }));
  const thumbnailsMore =
    thumbnails.length > 0 ? Math.max(0, entry.photoCount - thumbnails.length) : 0;

  return (
    <FeedRow
      variant="entry"
      as={as}
      typeBadge={diaryType[entry.entryType]}
      badges={
        isDraft ? (
          <Badge
            variants={{ draft: { label: t('draft.badgeLabel'), className: badgeStyles.draft } }}
            value="draft"
            testId={`draft-badge-${entry.id}`}
          />
        ) : null
      }
      title={title}
      titleLink={{
        to: isDraft
          ? routeUrl('diaryEntryEdit', { id: entry.id })
          : routeUrl('diaryEntry', { id: entry.id }),
        ariaLabel: t('row.linkName', { title, date: formatDate(entry.entryDate) }),
        state: originState,
      }}
      dateLabel={formatDayMonth(entry.entryDate)}
      sentence={firstLine(entry.body)}
      facts={facts}
      signedLabel={entry.isSigned ? t('row.signed') : undefined}
      areas={(entry.photoAreas ?? []).map((area) => ({
        id: area.id,
        content: (
          <AreaBreadcrumb
            variant="path"
            segments={[...area.ancestors.map((a) => ({ id: a.id, name: a.name })), area]}
          />
        ),
      }))}
      areasMoreLabel={(count) => t('row.more', { count })}
      thumbnails={thumbnails}
      thumbnailsMore={thumbnailsMore}
      thumbnailsMoreLabel={(count) => t('row.more', { count })}
      thumbnailsLabel={
        entry.photoCount > 0 ? t('row.photos', { count: entry.photoCount }) : undefined
      }
      testId={`diary-entry-${entry.id}`}
    />
  );
}
