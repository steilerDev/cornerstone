import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { SystemEventFeedRow } from '../../components/FeedRow/SystemEventFeedRow.js';
import { FormError } from '../../components/FormError/FormError.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { listHistory } from '../../lib/historyApi.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './InvoiceDetailPage.module.css';

const HISTORY_PAGE_SIZE = 20;

type HistoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | {
      readonly status: 'ready';
      readonly items: readonly DiaryEntrySummary[];
      readonly totalItems: number;
    };

export interface InvoiceHistoryPanelProps {
  readonly invoiceId: string;
  /** Changes whenever the page record was refreshed; the feed loads again. */
  readonly revision: number;
}

/** The History tab: the latest events of this offer or invoice, read only. */
export function InvoiceHistoryPanel({ invoiceId, revision }: InvoiceHistoryPanelProps) {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const [state, setState] = useState<HistoryState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listHistory(
      { entityType: 'invoice', entityId: invoiceId, pageSize: HISTORY_PAGE_SIZE },
      controller.signal,
    )
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
        setState({
          status: 'error',
          message:
            err instanceof ApiClientError
              ? translateApiError(err.error.code, tErrors)
              : t('invoicePage.history.loadError'),
        });
      });
    return () => controller.abort();
  }, [invoiceId, revision, attempt, t, tErrors]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  let body;
  if (state.status === 'error') {
    body = (
      <div>
        <FormError message={state.message} />
        <button type="button" className={sharedStyles.btnText} onClick={retry}>
          {t('invoicePage.history.retry')}
        </button>
      </div>
    );
  } else if (state.status === 'ready' && state.items.length === 0) {
    body = <EmptyState message={t('invoicePage.history.empty')} />;
  } else if (state.status === 'ready') {
    body = (
      <>
        <ul className={styles.historyList}>
          {state.items.map((entry) => (
            <SystemEventFeedRow key={entry.id} as="li" entry={entry} />
          ))}
        </ul>
        {state.totalItems > state.items.length ? (
          <NavAnchor
            to={routeUrl('history', undefined, { object: `invoice:${invoiceId}` })}
            data-testid="invoice-history-show-all"
          >
            {t('invoicePage.history.showAll')}
          </NavAnchor>
        ) : null}
      </>
    );
  } else {
    body = null;
  }

  return (
    <SectionCard
      id="invoice-history"
      title={t('invoicePage.history.title')}
      loading={state.status === 'loading'}
    >
      {body}
    </SectionCard>
  );
}
