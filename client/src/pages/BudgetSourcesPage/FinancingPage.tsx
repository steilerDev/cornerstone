import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { FinancingResponse } from '@cornerstone/shared';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { FormError } from '../../components/FormError/FormError.js';
import { OverflowMenu } from '../../components/OverflowMenu/OverflowMenu.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { useCreateQuery } from '../../hooks/useCreateQuery.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useSectionHashFocus } from '../../hooks/useSectionHashFocus.js';
import { fetchFailureMessage, toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { fetchFinancing } from '../../lib/financingApi.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { hasCreateOpener } from '../../navigation/dialogRoutes.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import type { FinancingFormKind } from '../../objectForms/financingCreateContext.js';
import { useOpenFinancingForm } from '../../objectForms/useOpenFinancingForm.js';
import { FinancingGrantCard } from './FinancingGrantCard.js';
import { FinancingSourceCard } from './FinancingSourceCard.js';
import styles from './FinancingPage.module.css';

const SECTION_ANCHORS = ['sources', 'grants'] as const;
const SKELETON_CARDS = ['a', 'b', 'c'] as const;

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly failure: FetchFailure }
  | { readonly status: 'ready'; readonly data: FinancingResponse };

/**
 * Money › Financing: every funding source (loans and own funds) and every grant as a card, with
 * the money service's figures. Creating goes through the app-level financing dialog.
 */
export function FinancingPage() {
  const { t } = useTranslation('budget');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const location = useLocation();
  const originState = useOriginState();
  const openForm = useOpenFinancingForm();
  const pageTitle = tCommon('navigation.financing');
  useDocumentTitle(pageTitle);

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const printFrameRef = useRef<number | null>(null);
  const addSourceRef = useRef<HTMLButtonElement>(null);
  const addGrantRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchFinancing(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', failure: toFetchFailure(err) });
      });
    return () => controller.abort();
  }, [attempt]);

  // A failed load moves focus to the heading so the alert is reached.
  const failed = state.status === 'error';
  useEffect(() => {
    if (failed) headingRef.current?.focus();
  }, [failed]);

  useEffect(
    () => () => {
      if (printFrameRef.current !== null) cancelAnimationFrame(printFrameRef.current);
    },
    [],
  );

  const loading = state.status === 'loading';
  useSectionHashFocus(SECTION_ANCHORS, !loading);

  const open = (kind: FinancingFormKind, opener: HTMLElement | null) =>
    openForm?.({ kind, returnFocusRef: { current: opener } });

  useCreateQuery({
    onOpen: (request) => {
      // The old Grants URL redirects here with `#grants` and no `kind`: that opens New grant.
      const wantsGrant =
        request.kind === 'grant' || (request.kind === null && location.hash === '#grants');
      const kind: FinancingFormKind = wantsGrant ? 'grant' : 'source';
      open(
        kind,
        hasCreateOpener(location.state)
          ? document.querySelector<HTMLElement>('[data-create-trigger]')
          : null,
      );
    },
  });

  // The menu has closed by the next frame, so it is not part of the printout.
  const print = () => {
    printFrameRef.current = requestAnimationFrame(() => {
      printFrameRef.current = null;
      window.print();
    });
  };

  const action = (
    <div className={styles.headerActions}>
      <NavAnchor
        to={routeUrl('bankReport')}
        state={originState}
        className={styles.primaryLink}
        data-testid="financing-prepare-bank-report"
      >
        {t('financing.actions.prepareBankReport')}
      </NavAnchor>
      <OverflowMenu
        triggerIcon="⋯"
        triggerAriaLabel={tCommon('objectHeader.pageActions')}
        data-testid="financing-page-actions"
        items={[
          {
            id: 'print',
            label: tCommon('objectHeader.print'),
            onClick: print,
            testId: 'financing-action-print',
          },
        ]}
      />
    </div>
  );

  const renderGroup = (
    kind: FinancingFormKind,
    anchor: (typeof SECTION_ANCHORS)[number],
    count: number,
    content: ReactNode,
  ) => (
    <section id={anchor} aria-labelledby={`${anchor}-heading`} className={styles.group}>
      <h2 id={`${anchor}-heading`} tabIndex={-1} className={styles.groupHeading}>
        {t(kind === 'source' ? 'financing.groups.sources' : 'financing.groups.grants')}
        {!loading && <span className={styles.count}> ({count})</span>}
      </h2>
      {content}
    </section>
  );

  const objectsOf = (kind: FinancingFormKind) =>
    t(kind === 'source' ? 'financing.nouns.sources' : 'financing.nouns.grants');

  const skeleton = (
    <ul className={styles.cards}>
      {SKELETON_CARDS.map((id) => (
        <li key={id}>
          <Skeleton lines={5} />
        </li>
      ))}
    </ul>
  );

  let sources: ReactNode = skeleton;
  let grants: ReactNode = skeleton;
  let sourceCount = 0;
  let grantCount = 0;
  if (state.status === 'ready') {
    const { data } = state;
    sourceCount = data.sources.length;
    grantCount = data.grants.length;
    sources =
      sourceCount === 0 ? (
        <EmptyState message={t('financing.empty.sources', { objects: objectsOf('source') })} />
      ) : (
        <ul className={styles.cards}>
          {data.sources.map((source) => (
            <li key={source.id}>
              <FinancingSourceCard source={source} originState={originState} />
            </li>
          ))}
        </ul>
      );
    grants =
      grantCount === 0 ? (
        <EmptyState message={t('financing.empty.grants', { objects: objectsOf('grant') })} />
      ) : (
        <ul className={styles.cards}>
          {data.grants.map((grant) => (
            <li key={grant.id}>
              <FinancingGrantCard grant={grant} originState={originState} />
            </li>
          ))}
        </ul>
      );
  }

  return (
    <PageLayout title={pageTitle} action={action} headingRef={headingRef}>
      <div className={styles.page} data-testid="financing-page">
        <div className={styles.toolbar}>
          <button
            type="button"
            ref={addSourceRef}
            className={styles.addButton}
            onClick={() => open('source', addSourceRef.current)}
            data-testid="financing-add-source"
          >
            {t('financing.actions.addSource', { object: t('financing.nouns.source') })}
          </button>
          <button
            type="button"
            ref={addGrantRef}
            className={styles.addButton}
            onClick={() => open('grant', addGrantRef.current)}
            data-testid="financing-add-grant"
          >
            {t('financing.actions.addGrant', { object: t('financing.nouns.grant') })}
          </button>
        </div>

        {state.status === 'error' ? (
          <div className={styles.error}>
            <FormError
              message={fetchFailureMessage(state.failure, tErrors, t('financing.loadError'))}
            />
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => {
                setState({ status: 'loading' });
                setAttempt((value) => value + 1);
              }}
              data-testid="financing-retry"
            >
              {t('financing.retry')}
            </button>
          </div>
        ) : (
          <>
            {renderGroup('source', 'sources', sourceCount, sources)}
            {renderGroup('grant', 'grants', grantCount, grants)}
          </>
        )}
      </div>
    </PageLayout>
  );
}

export default FinancingPage;
