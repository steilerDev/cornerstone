import { useTranslation } from 'react-i18next';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { diaryEntryTypeLabelKey } from '../lib/diaryEntryTypeLabel.js';
import { useFormatters } from '../lib/formatters.js';

/**
 * Display title of a diary entry: its title, else "<Type> · <day month>". Null without an entry.
 * Used for the h1, the tab title and the object name in breadcrumbs and origin links.
 */
export function useDiaryEntryTitle(
  entry: Pick<DiaryEntrySummary, 'title' | 'entryType' | 'entryDate'> | null | undefined,
): string | null {
  const { t } = useTranslation();
  const { formatDayMonth } = useFormatters();
  if (!entry) return null;
  const title = entry.title?.trim();
  if (title) return title;
  const k = diaryEntryTypeLabelKey(entry.entryType);
  return t('navigation.diaryEntryUntitled', {
    ns: 'common',
    type: t(k.key, { ns: k.ns }),
    date: formatDayMonth(entry.entryDate),
  });
}
