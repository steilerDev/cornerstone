import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { AttentionList } from '../../components/AttentionList/AttentionList.js';
import { FeedGroup } from '../../components/FeedRow/FeedGroup.js';
import type { UseAttentionResult } from '../../hooks/useAttention.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';

export interface TidyUpSectionProps {
  attention: UseAttentionResult;
  open: boolean;
  onToggle: () => void;
  /** Focus target when the last chore leaves (the section unmounts): the Needs attention heading. */
  fallbackFocusRef: RefObject<HTMLElement | null>;
}

/** Tidy up: chores that are not urgent. Collapsible; mounted only while there is something to tidy. */
export function TidyUpSection({ attention, open, onToggle, fallbackFocusRef }: TidyUpSectionProps) {
  const { t } = useTranslation('home');
  const { data, removeRow, refresh } = attention;
  if (!data || data.tidyUp.length === 0) return null;

  return (
    <FeedGroup
      heading={t(I18N_UNION_KEYS.homeSection.key('tidy-up'))}
      headingDetail={t('count', { count: data.tidyUp.length })}
      collapse={{ open, onToggle }}
      list={false}
      testId="home-tidy-up"
    >
      <AttentionList
        rows={data.tidyUp}
        today={data.today}
        onRemove={removeRow}
        onRefresh={refresh}
        emptyFocusRef={fallbackFocusRef}
        listId="home-tidy-list"
        testIdPrefix="tidy-up"
      />
    </FeedGroup>
  );
}
