import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { SearchResponse } from '@cornerstone/shared';
import { useAuth } from '../../contexts/AuthContext.js';
import { focusPageHeadingWhenReady } from '../../lib/focusPageHeading.js';
import type { NavActive } from '../../navigation/navActive.js';
import type { NavContext, NavSection } from '../../navigation/navConfig.js';
import { useRealLocation } from '../../navigation/realLocation.js';
import { Modal } from '../Modal/Modal.js';
import { Sheet } from '../Modal/Sheet.js';
import { usePaperlessBaseUrl } from './CommandSearchContext.js';
import {
  CommandSearchFooter,
  CommandSearchInputRow,
  CommandSearchResults,
  useModelDeps,
} from './CommandSearchBody.js';
import type { CommandSearchPanelModel } from './CommandSearchBody.js';
import { buildOptions, firstActivatableId } from './commandSearchModel.js';
import type { BuildInput } from './commandSearchModel.js';
import { useCommandSearchQuery } from './useCommandSearchQuery.js';
import styles from './CommandSearch.module.css';

export interface CommandSearchProps {
  /** AppShell's top-bar breakpoint: the palette from 1024 px, the full-screen sheet below. */
  readonly wide: boolean;
  readonly initialQuery: string;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly navContext: NavContext;
  readonly sections: readonly NavSection[];
  readonly active: NavActive | null;
}

const NO_EXPANDED: BuildInput['expanded'] = new Map();

/**
 * Command search host: owns the query state above the container (a resize across 1024 px keeps
 * the query and results) and picks the palette dialog or the full-screen sheet. It is mounted
 * only while open, so the query clears on close.
 */
export function CommandSearch({
  wide,
  initialQuery,
  returnFocusRef,
  onClose,
  navContext,
  sections,
  active,
}: CommandSearchProps) {
  const { t } = useTranslation('common');
  const { refreshAuth } = useAuth();
  const deps = useModelDeps();
  const location = useRealLocation();
  const getPaperlessBaseUrl = usePaperlessBaseUrl();
  const listboxId = useId();
  const inputId = useId();
  const sheetId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // "Search everywhere" returns to the list's own field, which wins over the opener.
  const skipOpenerRef = useRef(returnFocusRef !== undefined);
  const [initialReturnTarget] = useState(() => returnFocusRef?.current ?? null);
  const returnTargetRef = useRef<HTMLElement | null>(initialReturnTarget);

  const [paperlessBaseUrl, setPaperlessBaseUrl] = useState<string | null | undefined>(undefined);

  // Read lazily by the query hook when a response arrives.
  const latestRef = useRef<Omit<BuildInput, 'response' | 'expanded'> | null>(null);
  const query = useCommandSearchQuery({
    initialQuery,
    onUnauthorized: () => void refreshAuth(),
    firstOptionId: (response: SearchResponse) => {
      const latest = latestRef.current;
      if (!latest) return null;
      return firstActivatableId(buildOptions({ ...latest, response, expanded: NO_EXPANDED }).flat);
    },
  });
  const { state } = query;
  const liveQuery = state.query.trim();

  const baseInput = useMemo(
    () => ({
      ...deps,
      liveQuery,
      ctx: navContext,
      sections,
      active,
      paperlessBaseUrl,
    }),
    [deps, liveQuery, navContext, sections, active, paperlessBaseUrl],
  );
  useEffect(() => {
    latestRef.current = baseInput;
  }, [baseInput]);

  const built = useMemo(
    () => buildOptions({ ...baseInput, response: state.response, expanded: state.expanded }),
    [baseInput, state.response, state.expanded],
  );
  const activeId = built.flat.some((option) => option.id === state.activeId)
    ? state.activeId
    : null;

  // Paperless links need the browser-facing base URL; ask once, the first time a document shows.
  const hasDocuments =
    state.response?.groups.some((g) => g.type === 'paperless_document' && g.items.length > 0) ??
    false;
  useEffect(() => {
    if (!hasDocuments || paperlessBaseUrl !== undefined) return;
    let cancelled = false;
    void getPaperlessBaseUrl().then((base) => {
      if (!cancelled) setPaperlessBaseUrl(base);
    });
    return () => {
      cancelled = true;
    };
  }, [hasDocuments, paperlessBaseUrl, getPaperlessBaseUrl]);

  // A prefilled query starts selected so typing replaces it.
  useEffect(() => {
    if (initialQuery !== '') inputRef.current?.select();
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- mount only
  }, []);

  // The container swaps across the breakpoint: keep the caret in the field.
  const mountedRef = useRef(false);
  useLayoutEffect(() => {
    if (mountedRef.current) inputRef.current?.focus();
    mountedRef.current = true;
  }, [wide]);

  const currentUrl = `${location.pathname}${location.search}`;
  const model: CommandSearchPanelModel = {
    listboxId,
    inputId,
    state,
    built,
    activeId,
    liveQuery,
    wide,
    query,
    onChoose: (target) => {
      // Focus lands on the destination heading, never on <body>.
      skipOpenerRef.current = true;
      returnTargetRef.current = null;
      focusPageHeadingWhenReady();
      // A same-URL replace also makes a new location key, which closes the search; closing here
      // too is a safeguard that does not depend on that router behaviour.
      if (target === currentUrl) onClose();
    },
  };

  if (wide) {
    return (
      <Modal
        variant="palette"
        hideTitle
        title={t('commandSearch.title')}
        onClose={onClose}
        initialFocusRef={inputRef}
        returnFocusRef={returnTargetRef}
        skipOpenerRef={skipOpenerRef}
      >
        <CommandSearchInputRow model={model} inputRef={inputRef} />
        <CommandSearchResults model={model} deps={deps} />
        <CommandSearchFooter model={model} />
      </Modal>
    );
  }

  return (
    <Sheet
      id={sheetId}
      open
      variant="fullScreen"
      hideTitle
      title={t('commandSearch.title')}
      onClose={onClose}
      headerStart={<CommandSearchInputRow model={model} inputRef={inputRef} />}
      initialFocusRef={inputRef}
      returnFocusRef={returnTargetRef}
      skipOpenerRef={skipOpenerRef}
      restoreFocusOnUnmount
      testId="command-search-sheet"
      contentMaxWidth="calc(var(--spacing-16) * 10)"
    >
      <div className={styles.sheetColumn}>
        <CommandSearchResults model={model} deps={deps} />
      </div>
    </Sheet>
  );
}
