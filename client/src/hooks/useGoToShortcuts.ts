import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ServedRouteId } from '@cornerstone/shared';
import { focusPageHeadingWhenReady } from '../lib/focusPageHeading.js';
import { navHref } from '../navigation/navActive.js';
import { isRouteVisible } from '../navigation/navConfig.js';
import type { NavContext, NavLabelKey } from '../navigation/navConfig.js';
import { useShortcutRegistry } from './shortcutRegistry.js';
import { isShortcutSuppressed } from './useKeyboardShortcuts.js';
import type { KeyboardShortcut } from './useKeyboardShortcuts.js';

export interface GoToTarget {
  readonly letter: string;
  /** Named `route`, never `to` (the pattern baseline counts `to` destinations). */
  readonly route: ServedRouteId;
  readonly labelKey: NavLabelKey;
}

export const GO_TO_SHORTCUTS: readonly GoToTarget[] = [
  { letter: 'h', route: 'home', labelKey: 'navigation.home' },
  { letter: 't', route: 'workItems', labelKey: 'navigation.tasks' },
  { letter: 's', route: 'scheduleGantt', labelKey: 'navigation.schedule' },
  { letter: 'p', route: 'householdItems', labelKey: 'navigation.purchases' },
  { letter: 'd', route: 'diary', labelKey: 'navigation.siteDiary' },
  { letter: 'f', route: 'photos', labelKey: 'navigation.photos' },
  { letter: 'c', route: 'companies', labelKey: 'navigation.companies' },
  { letter: 'm', route: 'budgetOverview', labelKey: 'navigation.money' },
];
export const GO_TO_PREFIX = 'g';
export const GO_TO_WINDOW_MS = 1500;

const MODIFIER_ONLY = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

/**
 * Registers the "Go to" rows (`g h` ... `g m`) and runs the `g` then letter sequence. Targets the
 * role cannot reach, or the deployment does not serve, are neither listed nor active.
 */
export function useGoToShortcuts(navContext: NavContext): void {
  const { t } = useTranslation('common');
  const registry = useShortcutRegistry();
  const id = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  const armedAtRef = useRef<number | null>(null);

  const visible = useMemo(
    () => GO_TO_SHORTCUTS.filter((target) => isRouteVisible(target.route, navContext)),
    [navContext],
  );
  const visibleRef = useRef(visible);

  useEffect(() => {
    pathnameRef.current = location.pathname;
    visibleRef.current = visible;
  });

  const go = useCallback(
    (route: ServedRouteId) => {
      const url = navHref(route);
      if (pathnameRef.current !== url) {
        navigate(url);
        focusPageHeadingWhenReady();
      }
    },
    [navigate],
  );

  const entries = useMemo<KeyboardShortcut[]>(
    () =>
      visible.map((target) => ({
        key: `${GO_TO_PREFIX} ${target.letter}`,
        description: t('keyboardShortcuts.goTo', { destination: t(target.labelKey) }),
        handler: () => go(target.route),
      })),
    [visible, t, go],
  );

  // Registered directly: useKeyboardShortcuts' single-key matcher would never match 'g s'.
  useEffect(() => registry?.register(id, entries, { group: 'goTo' }), [registry, id, entries]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (MODIFIER_ONLY.has(event.key)) return; // a lone modifier neither arms nor cancels
      if (isShortcutSuppressed(event) || registry?.singleKeyEnabled() === false) {
        armedAtRef.current = null; // field focus, modal, chord, switch off: cancel
        return;
      }
      const armedAt = armedAtRef.current;
      armedAtRef.current = null;
      if (armedAt !== null && Date.now() - armedAt <= GO_TO_WINDOW_MS) {
        const target = visibleRef.current.find((candidate) => candidate.letter === event.key);
        if (target) {
          event.preventDefault();
          go(target.route);
          return;
        }
        // Any other key cancels silently and is not swallowed.
      }
      if (event.key === GO_TO_PREFIX) {
        event.preventDefault();
        armedAtRef.current = Date.now();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [registry, go]);
}
