import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HOME_COLLAPSED_SECTIONS_KEY,
  HOME_COLLAPSIBLE_SECTION_IDS,
  HOME_HIDDEN_SECTIONS_KEY,
  HOME_HIDEABLE_SECTION_IDS,
  HOME_MOVED_NOTICE_SEEN_KEY,
  HOME_SETUP_DISMISSED_KEY,
  parseHomeSectionIds,
} from '@cornerstone/shared';
import type { HomeCollapsibleSectionId, HomeHideableSectionId } from '@cornerstone/shared';
import { useToast } from '../../components/Toast/ToastContext.js';
import { usePreferences } from '../../hooks/usePreferences.js';

interface Overrides {
  hidden?: HomeHideableSectionId[];
  collapsed?: HomeCollapsibleSectionId[];
  noticeSeen?: boolean;
  setupDismissed?: boolean;
}

export interface UseHomePreferencesResult {
  /** The preferences were fetched (or the fetch failed: defaults apply). */
  loaded: boolean;
  /** The preferences could not be loaded: defaults apply and the one-time notice stays away. */
  failed: boolean;
  hidden: readonly HomeHideableSectionId[];
  collapsed: readonly HomeCollapsibleSectionId[];
  noticeSeen: boolean;
  setupDismissed: boolean;
  setHidden: (next: HomeHideableSectionId[]) => void;
  setCollapsed: (next: HomeCollapsibleSectionId[]) => void;
  markNoticeSeen: () => void;
  dismissSetup: () => void;
}

/**
 * The four Home preferences, parsed leniently. Writes are optimistic: on a failed save the old
 * value comes back and an error toast says so.
 */
export function useHomePreferences(): UseHomePreferencesResult {
  const { t } = useTranslation('home');
  const { showToast } = useToast();
  const { preferences, hasLoaded, error, upsert } = usePreferences();
  const [overrides, setOverrides] = useState<Overrides>({});

  const stored = useMemo(() => {
    const valueOf = (key: string) => preferences.find((p) => p.key === key)?.value;
    return {
      hidden: parseHomeSectionIds(valueOf(HOME_HIDDEN_SECTIONS_KEY), HOME_HIDEABLE_SECTION_IDS),
      collapsed: parseHomeSectionIds(
        valueOf(HOME_COLLAPSED_SECTIONS_KEY),
        HOME_COLLAPSIBLE_SECTION_IDS,
      ),
      noticeSeen: valueOf(HOME_MOVED_NOTICE_SEEN_KEY) === 'true',
      setupDismissed: valueOf(HOME_SETUP_DISMISSED_KEY) === 'true',
    };
  }, [preferences]);

  const write = useCallback(
    (key: string, value: string, field: keyof Overrides, next: Overrides[keyof Overrides]) => {
      setOverrides((prev) => ({ ...prev, [field]: next }));
      upsert(key, value).catch(() => {
        setOverrides((prev) => {
          const rest = { ...prev };
          delete rest[field];
          return rest;
        });
        showToast('error', t('error.saveFailed'));
      });
    },
    [upsert, showToast, t],
  );

  const setHidden = useCallback(
    (next: HomeHideableSectionId[]) =>
      write(HOME_HIDDEN_SECTIONS_KEY, JSON.stringify(next), 'hidden', next),
    [write],
  );
  const setCollapsed = useCallback(
    (next: HomeCollapsibleSectionId[]) =>
      write(HOME_COLLAPSED_SECTIONS_KEY, JSON.stringify(next), 'collapsed', next),
    [write],
  );
  const markNoticeSeen = useCallback(
    () => write(HOME_MOVED_NOTICE_SEEN_KEY, 'true', 'noticeSeen', true),
    [write],
  );
  const dismissSetup = useCallback(
    () => write(HOME_SETUP_DISMISSED_KEY, 'true', 'setupDismissed', true),
    [write],
  );

  return {
    loaded: hasLoaded,
    failed: error !== null,
    hidden: overrides.hidden ?? stored.hidden,
    collapsed: overrides.collapsed ?? stored.collapsed,
    noticeSeen: overrides.noticeSeen ?? stored.noticeSeen,
    setupDismissed: overrides.setupDismissed ?? stored.setupDismissed,
    setHidden,
    setCollapsed,
    markNoticeSeen,
    dismissSetup,
  };
}
