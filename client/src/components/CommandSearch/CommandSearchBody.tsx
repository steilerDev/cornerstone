import { useEffect, useId, useMemo, useRef } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { SEARCH_QUERY_MAX_LENGTH, SEARCH_QUERY_MIN_LENGTH } from '@cornerstone/shared';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { useFormatters } from '../../lib/formatters.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import sharedStyles from '../../styles/shared.module.css';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { FormError } from '../FormError/FormError.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import { Spinner } from '../Spinner/Spinner.js';
import { isActivatable, optionDomId } from './commandSearchModel.js';
import type { BuiltOptions, CommandOption, ModelDeps } from './commandSearchModel.js';
import { SearchResultRow } from './SearchResultRow.js';
import type { CommandSearchQueryApi, CommandSearchQueryState } from './useCommandSearchQuery.js';
import styles from './CommandSearch.module.css';

/** Everything the input row and the results need; computed once by the host. */
export interface CommandSearchPanelModel {
  readonly listboxId: string;
  readonly inputId: string;
  readonly state: CommandSearchQueryState;
  readonly built: BuiltOptions;
  /** Active option id, already checked against the options on screen. */
  readonly activeId: string | null;
  readonly liveQuery: string;
  readonly wide: boolean;
  readonly query: CommandSearchQueryApi;
  readonly onChoose: (target: string) => void;
}

/** Translation and formatter bundle for the pure model. */
export function useModelDeps(): ModelDeps {
  const { t, i18n } = useTranslation('common');
  const { formatDate, formatDayMonth } = useFormatters();
  return useMemo(
    () => ({
      t: (key, options) => t(key, options as never) as unknown as string,
      language: i18n.language,
      formatDate: (value) => formatDate(value),
      formatDayMonth: (value) => formatDayMonth(value),
    }),
    [t, i18n.language, formatDate, formatDayMonth],
  );
}

function moveActive(model: CommandSearchPanelModel, direction: 1 | -1): void {
  const options = model.built.flat.filter(isActivatable);
  if (options.length === 0) return;
  const index = options.findIndex((option) => option.id === model.activeId);
  const next =
    index === -1
      ? direction === 1
        ? 0
        : options.length - 1
      : (index + direction + options.length) % options.length;
  const option = options[next]!;
  model.query.setActiveId(option.id);
  document
    .getElementById(optionDomId(model.listboxId, option))
    ?.scrollIntoView?.({ block: 'nearest' });
}

function activeOption(model: CommandSearchPanelModel): CommandOption | null {
  return model.built.flat.find((option) => option.id === model.activeId) ?? null;
}

function handleKeyDown(model: CommandSearchPanelModel, event: KeyboardEvent<HTMLInputElement>) {
  if (event.nativeEvent.isComposing) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    moveActive(model, event.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const option = activeOption(model);
  if (event.shiftKey) {
    if (option?.kind === 'item' && option.type === 'vendor' && option.item.phone) {
      document.getElementById(`${optionDomId(model.listboxId, option)}-call`)?.click();
    }
    return;
  }
  if (option === null) {
    model.query.flush();
    return;
  }
  if (option.kind === 'more') {
    model.query.showMore(option.type);
    return;
  }
  document.getElementById(optionDomId(model.listboxId, option))?.click();
}

function MagnifierGlyph() {
  return (
    <svg
      className={styles.magnifier}
      width="20"
      height="20"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

export interface CommandSearchInputRowProps {
  readonly model: CommandSearchPanelModel;
  readonly inputRef: RefObject<HTMLInputElement | null>;
}

/** Magnifier, the combobox input and its trailing slot (spinner, Esc hint or Clear). */
export function CommandSearchInputRow({ model, inputRef }: CommandSearchInputRowProps) {
  const { t } = useTranslation('common');
  const { state, wide, query } = model;
  const composingRef = useRef(false);
  const refetching = state.status === 'loading' && state.response !== null;
  const activeDomId = (() => {
    const option = activeOption(model);
    return option ? optionDomId(model.listboxId, option) : undefined;
  })();

  return (
    <div
      className={wide ? styles.inputRow : `${styles.inputRow} ${styles.inputRowSheet}`}
      data-testid="command-search-input-row"
    >
      <MagnifierGlyph />
      <input
        ref={inputRef}
        id={model.inputId}
        type="text"
        role="combobox"
        className={styles.input}
        value={state.query}
        aria-label={t('commandSearch.inputLabel')}
        placeholder={t('commandSearch.placeholder')}
        aria-expanded={model.built.flat.length > 0}
        aria-controls={model.listboxId}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-activedescendant={activeDomId}
        maxLength={SEARCH_QUERY_MAX_LENGTH}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        inputMode="search"
        enterKeyHint="go"
        onChange={(event) => query.setQuery(event.target.value, composingRef.current)}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          query.setQuery(event.currentTarget.value, false);
        }}
        onKeyDown={(event) => handleKeyDown(model, event)}
        data-testid="command-search-input"
      />
      {refetching && (
        <span className={styles.spinner} aria-hidden="true">
          <Spinner size="sm" color="muted" label={t('loading')} />
        </span>
      )}
      {state.query === '' && wide && (
        <kbd className={styles.kbd} aria-hidden="true">
          {t('commandSearch.escKey')}
        </kbd>
      )}
      {state.query !== '' && (
        <button
          type="button"
          className={styles.clear}
          aria-label={t('commandSearch.clear')}
          onClick={() => {
            query.setQuery('', false);
            inputRef.current?.focus();
          }}
          data-testid="command-search-clear"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      )}
    </div>
  );
}

function liveMessage(model: CommandSearchPanelModel, t: (key: string, o?: object) => string) {
  const { state, built, liveQuery } = model;
  if (state.status !== 'ready' || state.response === null || liveQuery !== state.settledQuery) {
    return '';
  }
  const items = built.groups.reduce(
    (sum, group) => sum + group.options.filter((option) => option.kind === 'item').length,
    0,
  );
  const count = built.destinations.length + items;
  const more = built.groups.some((group) => group.options.some((o) => o.kind === 'more'));
  const unavailable = built.groups.some((group) => group.status === 'unavailable');
  const base =
    count === 0
      ? t('commandSearch.noResultsLive', { query: liveQuery })
      : more
        ? t('commandSearch.resultCountMore', { count })
        : t('commandSearch.resultCount', { count });
  return unavailable ? `${base} ${t('commandSearch.documentsUnavailableLive')}` : base;
}

export interface CommandSearchResultsProps {
  readonly model: CommandSearchPanelModel;
  readonly deps: ModelDeps;
}

/** The listbox (destinations and result groups), the states around it and the live region. */
export function CommandSearchResults({ model, deps }: CommandSearchResultsProps): ReactNode {
  const { t } = useTranslation('common');
  const { state, built, wide, liveQuery, query } = model;
  const originState = useOriginState();
  const regionRef = useRef<HTMLDivElement>(null);
  const scopeId = useId();
  const callHintId = `${scopeId}-call-hint`;
  const newTabHintId = `${scopeId}-newtab-hint`;
  const trimmedLength = liveQuery.length;
  const longEnough = trimmedLength >= SEARCH_QUERY_MIN_LENGTH;

  // A new settled response starts at the top.
  useEffect(() => {
    const region = regionRef.current;
    const scroller = wide ? region : region?.parentElement;
    if (scroller) scroller.scrollTop = 0;
  }, [state.settledQuery, wide]);

  const renderRow = (option: CommandOption) => (
    <SearchResultRow
      key={option.id}
      option={option}
      listboxId={model.listboxId}
      active={option.id === model.activeId}
      itemQuery={state.settledQuery ?? liveQuery}
      liveQuery={liveQuery}
      deps={deps}
      originState={originState}
      callHintId={callHintId}
      newTabHintId={newTabHintId}
      onActivate={query.setActiveId}
      onChoose={model.onChoose}
      onShowMore={query.showMore}
    />
  );

  const noItems = built.groups.every((group) => group.options.length === 0);
  const ready = state.status === 'ready' && state.response !== null;
  const showEmpty =
    ready && noItems && built.destinations.length === 0 && built.groups.length === 0;
  const showNothingElse = ready && noItems && !showEmpty;

  return (
    <div
      ref={regionRef}
      className={wide ? `${styles.results} ${styles.resultsPalette}` : styles.results}
      data-testid="command-search-results"
    >
      <span id={callHintId} hidden>
        {t('commandSearch.callHint')}
      </span>
      <span id={newTabHintId} hidden>
        {t('commandSearch.opensInNewTab')}
      </span>
      <div
        id={model.listboxId}
        role="listbox"
        aria-label={t('commandSearch.results')}
        aria-busy={state.status === 'loading' || undefined}
        onMouseDown={(event) => event.preventDefault()}
        data-testid="command-search-listbox"
      >
        {built.destinations.length > 0 && (
          <ResultGroup
            headerId={`${scopeId}-h-goto`}
            title={t('commandSearch.goTo')}
            testId="command-search-group-goto"
          >
            {built.destinations.map(renderRow)}
          </ResultGroup>
        )}
        {built.groups.map((group) => {
          const headerId = `${scopeId}-h-${group.type}`;
          return (
            <ResultGroup
              key={group.type}
              headerId={headerId}
              title={t(I18N_UNION_KEYS.searchResultGroup.key(group.type))}
              count={
                group.total > group.shown
                  ? t('commandSearch.groupCount', { shown: group.shown, total: group.total })
                  : null
              }
              testId={`command-search-group-${group.type}`}
            >
              {group.status === 'unavailable' && (
                <div
                  role="presentation"
                  className={styles.documentsNote}
                  data-testid="command-search-documents-unavailable"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M8 2l6.5 11.5h-13L8 2zM8 6.5v3M8 11.5v.01" />
                  </svg>
                  <span>{t('commandSearch.documentsUnavailable')}</span>
                </div>
              )}
              {group.options.map(renderRow)}
              {group.capped && (
                <div role="presentation" className={styles.note}>
                  {t('commandSearch.capped', { shown: group.shown, total: group.total })}
                </div>
              )}
            </ResultGroup>
          );
        })}
      </div>

      {trimmedLength === 0 && <p className={styles.hint}>{t('commandSearch.hintEmpty')}</p>}
      {trimmedLength === 1 && <p className={styles.hint}>{t('commandSearch.hintTooShort')}</p>}
      {longEnough && state.showSkeleton && (
        <div aria-hidden="true" className={styles.skeleton}>
          <Skeleton lines={3} />
        </div>
      )}
      {showEmpty && (
        <div data-testid="command-search-empty">
          <EmptyState
            message={t('commandSearch.noResults', { query: liveQuery })}
            description={t('commandSearch.noResultsHint')}
          />
        </div>
      )}
      {showNothingElse && (
        <p className={styles.hint}>{t('commandSearch.nothingElse', { query: liveQuery })}</p>
      )}
      {state.status === 'error' && (
        <div className={styles.errorBlock}>
          <FormError variant="banner" message={t('commandSearch.error')} />
          <button
            type="button"
            className={`${sharedStyles.btnSecondary} ${styles.retry}`}
            onClick={query.retry}
            data-testid="command-search-retry"
          >
            {t('commandSearch.retry')}
          </button>
        </div>
      )}

      <div role="status" className={sharedStyles.srOnly} data-testid="command-search-status">
        {liveMessage(model, t as (key: string, o?: object) => string)}
      </div>
    </div>
  );
}

interface ResultGroupProps {
  readonly headerId: string;
  readonly title: string;
  readonly count?: string | null;
  readonly testId: string;
  readonly children: ReactNode;
}

function ResultGroup({ headerId, title, count, testId, children }: ResultGroupProps) {
  return (
    <div role="group" aria-labelledby={headerId} data-testid={testId}>
      <div id={headerId} className={styles.groupHeader}>
        <span>{title}</span>
        {count ? <span className={styles.groupCount}>{count}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** Keyboard legend under the results; fine pointers only, hidden from assistive tech. */
export function CommandSearchFooter({ model }: { readonly model: CommandSearchPanelModel }) {
  const { t } = useTranslation('common');
  const finePointer = useMediaQuery('(pointer: fine)');
  if (!model.wide || !finePointer) return null;
  const option = activeOption(model);
  const callable = option?.kind === 'item' && option.type === 'vendor' && option.item.phone;
  return (
    <div className={styles.footer} aria-hidden="true" data-testid="command-search-footer">
      {[
        t('commandSearch.footerMove'),
        t('commandSearch.footerOpen'),
        t('commandSearch.footerClose'),
        ...(callable ? [t('commandSearch.footerCall')] : []),
      ].join(' · ')}
    </div>
  );
}
