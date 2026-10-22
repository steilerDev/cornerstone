import { useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { AttentionList } from '../../components/AttentionList/AttentionList.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { FeedGroup } from '../../components/FeedRow/FeedGroup.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { NEEDS_ATTENTION_LIMIT } from '../../attention/attentionContext.js';
import type { UseAttentionResult } from '../../hooks/useAttention.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import shared from '../../styles/shared.module.css';
import { CatchUpDialog } from './CatchUpDialog.js';
import { SectionError } from './SectionError.js';
import styles from './HomePage.module.css';

export { NEEDS_ATTENTION_LIMIT };

export interface AttentionSectionProps {
  attention: UseAttentionResult;
  headingRef: RefObject<HTMLHeadingElement | null>;
}

/** Needs attention: the catch-up line, the first rows, "Show all" and the hidden-for-now line. */
export function AttentionSection({ attention, headingRef }: AttentionSectionProps) {
  const { t } = useTranslation('home');
  const { t: tCommon } = useTranslation('common');
  const { data, status, includeSnoozed, setIncludeSnoozed, removeRow, refresh, retry } = attention;
  const [catchUpOpen, setCatchUpOpen] = useState(false);
  const reviewRef = useRef<HTMLButtonElement>(null);

  // Closing the dialog returns to "Review all"; when that line is gone, to the section heading.
  const returnFocusRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return reviewRef.current ?? headingRef.current;
      },
    }),
    [headingRef],
  );

  const set = I18N_UNION_KEYS.homeSection;
  const loadingFirst = status === 'loading' && data === null;
  const failed = status === 'error' && data === null;

  return (
    <FeedGroup
      heading={t(set.key('needs-attention'))}
      headingDetail={data ? t('count', { count: data.count }) : undefined}
      headingRef={headingRef}
      list={false}
      busy={loadingFirst}
      testId="home-needs-attention"
    >
      {loadingFirst ? <Skeleton lines={3} /> : null}
      {failed ? (
        <SectionError
          section="needs-attention"
          onRetry={retry}
          testId="home-needs-attention-error"
        />
      ) : null}
      {data ? (
        <>
          {data.catchUp ? (
            <div className={styles.catchUpLine} data-testid="home-catch-up-line">
              <span aria-hidden="true" className={styles.catchUpGlyph}>
                {'⏱'}
              </span>
              <span>
                {tCommon('attention.catchUp.line', { count: data.catchUp.lateTaskCount })}
              </span>
              <span aria-hidden="true">·</span>
              <button
                ref={reviewRef}
                type="button"
                className={shared.btnSecondaryCompact}
                onClick={() => setCatchUpOpen(true)}
                data-testid="home-catch-up-review"
              >
                {tCommon('attention.catchUp.review')}
              </button>
            </div>
          ) : null}
          {data.rows.length === 0 ? (
            <EmptyState icon="✓" message={t('attention.empty')} />
          ) : (
            <AttentionList
              rows={data.rows}
              today={data.today}
              initialLimit={NEEDS_ATTENTION_LIMIT}
              totalCount={data.count}
              onRemove={removeRow}
              onRefresh={refresh}
              emptyFocusRef={headingRef}
              listId="home-attention-list"
              testIdPrefix="needs-attention"
            />
          )}
          {data.snoozedCount > 0 || includeSnoozed ? (
            <p className={styles.hiddenLine} data-testid="home-attention-hidden">
              <span>{t('attention.hidden', { count: data.snoozedCount })}</span>
              <button
                type="button"
                className={shared.btnText}
                onClick={() => setIncludeSnoozed(!includeSnoozed)}
                data-testid="home-attention-hidden-toggle"
              >
                {includeSnoozed ? t('attention.hiddenHide') : t('attention.hiddenShow')}
              </button>
            </p>
          ) : null}
          {catchUpOpen ? (
            <CatchUpDialog
              data={data}
              onRemove={removeRow}
              onRefresh={refresh}
              onClose={() => setCatchUpOpen(false)}
              returnFocusRef={returnFocusRef}
            />
          ) : null}
        </>
      ) : null}
    </FeedGroup>
  );
}
