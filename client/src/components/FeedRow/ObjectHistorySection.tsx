import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { DiaryEntrySummary, HistoryObjectType } from '@cornerstone/shared';
import { fetchFailureMessage, toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { listHistory } from '../../lib/historyApi.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import sharedStyles from '../../styles/shared.module.css';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { FormError } from '../FormError/FormError.js';
import { SectionCard } from '../SectionCard/SectionCard.js';
import { SystemEventFeedRow } from './SystemEventFeedRow.js';
import styles from './ObjectHistorySection.module.css';

const HISTORY_PAGE_SIZE = 20;

type HistoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly failure: FetchFailure }
  | {
      readonly status: 'ready';
      readonly items: readonly DiaryEntrySummary[];
      readonly totalItems: number;
    };

/** The page's own words (already translated). */
export interface ObjectHistoryLabels {
  readonly title: string;
  readonly empty: string;
  readonly loadError: string;
  readonly retry: string;
  readonly showAll: string;
}

export interface ObjectHistorySectionProps {
  readonly entityType: HistoryObjectType;
  readonly entityId: string;
  /** Changes whenever the page record was refreshed; the feed loads again. */
  readonly revision: number;
  readonly labels: ObjectHistoryLabels;
  /** Section id; the "show all" link is `${testIdPrefix}-show-all`. */
  readonly testIdPrefix: string;
  /** Row actions after a row's link row (Revert submission); forwarded to the feed row. */
  readonly renderRowActions?: (entry: DiaryEntrySummary) => ReactNode;
}

/**
 * The History tab of an object page: the latest events of one object (batch rows collapsed by
 * the server), read only, with a link to the full History page filtered to the object.
 */
export function ObjectHistorySection({
  entityType,
  entityId,
  revision,
  labels,
  testIdPrefix,
  renderRowActions,
}: ObjectHistorySectionProps) {
  const { t: tErrors } = useTranslation('errors');
  const [state, setState] = useState<HistoryState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listHistory({ entityType, entityId, pageSize: HISTORY_PAGE_SIZE }, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'ready',
          items: response.items,
          totalItems: response.pagination.totalItems,
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', failure: toFetchFailure(err) });
      });
    return () => controller.abort();
  }, [entityType, entityId, revision, attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  let body;
  if (state.status === 'error') {
    body = (
      <div>
        <FormError message={fetchFailureMessage(state.failure, tErrors, labels.loadError)} />
        <button type="button" className={sharedStyles.btnText} onClick={retry}>
          {labels.retry}
        </button>
      </div>
    );
  } else if (state.status === 'ready' && state.items.length === 0) {
    body = <EmptyState message={labels.empty} />;
  } else if (state.status === 'ready') {
    body = (
      <>
        <ul className={styles.historyList}>
          {state.items.map((entry) => (
            <SystemEventFeedRow
              key={entry.id}
              as="li"
              entry={entry}
              actions={renderRowActions?.(entry)}
            />
          ))}
        </ul>
        {state.totalItems > state.items.length ? (
          <NavAnchor
            to={routeUrl('history', undefined, { object: `${entityType}:${entityId}` })}
            data-testid={`${testIdPrefix}-show-all`}
          >
            {labels.showAll}
          </NavAnchor>
        ) : null}
      </>
    );
  } else {
    body = null;
  }

  return (
    <SectionCard id={testIdPrefix} title={labels.title} loading={state.status === 'loading'}>
      {body}
    </SectionCard>
  );
}

export default ObjectHistorySection;
