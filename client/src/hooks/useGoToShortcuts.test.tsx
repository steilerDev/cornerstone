/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import enCommon from '../i18n/en/common.json';
import type { NavContext } from '../navigation/navConfig.js';

// Only isRouteVisible is replaced (a set of hidden routes); everything else is the real module.
const hidden = new Set<string>();
const actualNav = await import('../navigation/navConfig.js');
jest.unstable_mockModule('../navigation/navConfig.js', () => ({
  ...actualNav,
  isRouteVisible: (route: string, ctx: NavContext) =>
    hidden.has(route)
      ? false
      : (actualNav.isRouteVisible as (r: string, c: NavContext) => boolean)(route, ctx),
}));

const focusSpy = jest.fn<() => () => void>(() => () => {});
jest.unstable_mockModule('../lib/focusPageHeading.js', () => ({
  focusPageHeadingWhenReady: focusSpy,
  focusPageHeading: () => {},
}));

const { GO_TO_PREFIX, GO_TO_SHORTCUTS, GO_TO_WINDOW_MS, useGoToShortcuts } =
  await import('./useGoToShortcuts.js');
const { ShortcutRegistryProvider, useShortcutRegistry } = await import('./shortcutRegistry.js');
const { navHref } = await import('../navigation/navActive.js');

const CTX: NavContext = { role: 'member', paperlessConfigured: false };

let probe: { registry: ReturnType<typeof useShortcutRegistry>; path: string } = {
  registry: null,
  path: '',
};

function Harness({ ctx = CTX }: { ctx?: NavContext }) {
  useGoToShortcuts(ctx);
  const location = useLocation();
  probe = { registry: useShortcutRegistry(), path: location.pathname };
  return <output data-testid="path">{location.pathname}</output>;
}

function renderGoTo(initial = '/some/other/page', ctx: NavContext = CTX) {
  const wrap = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initial]}>
      <ShortcutRegistryProvider>{children}</ShortcutRegistryProvider>
    </MemoryRouter>
  );
  return render(<Harness ctx={ctx} />, { wrapper: wrap });
}

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

const path = () => screen.getByTestId('path').textContent;

describe('useGoToShortcuts (#2253)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    hidden.clear();
    focusSpy.mockClear();
    localStorage.clear();
  });
  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('uses a 1.5 s window and the g prefix', () => {
    expect(GO_TO_WINDOW_MS).toBe(1500);
    expect(GO_TO_PREFIX).toBe('g');
  });

  it('maps the eight letters to the documented routes', () => {
    expect(GO_TO_SHORTCUTS.map((g) => [g.letter, g.route])).toEqual([
      ['h', 'home'],
      ['t', 'workItems'],
      ['s', 'scheduleGantt'],
      ['p', 'householdItems'],
      ['d', 'diary'],
      ['f', 'photos'],
      ['c', 'companies'],
      ['m', 'budgetOverview'],
    ]);
  });

  it('g then s opens the Schedule at its Gantt URL (AC4)', () => {
    renderGoTo();
    press('g');
    press('s');
    expect(path()).toBe(navHref('scheduleGantt'));
    expect(path()).toBe('/schedule/gantt');
  });

  it.each(GO_TO_SHORTCUTS.map((g) => [g.letter, g.route] as const))(
    'g then %s navigates to %s and moves focus to the new page heading',
    (letter, route) => {
      renderGoTo();
      expect(press('g').defaultPrevented).toBe(true);
      expect(press(letter).defaultPrevented).toBe(true);
      expect(path()).toBe(navHref(route));
      expect(focusSpy).toHaveBeenCalledTimes(1);
    },
  );

  it('does nothing when the second key arrives after the 1.5 s window', () => {
    renderGoTo();
    press('g');
    act(() => {
      jest.advanceTimersByTime(GO_TO_WINDOW_MS + 1);
    });
    press('s');
    expect(path()).toBe('/some/other/page');
  });

  it('still works exactly at the window edge', () => {
    renderGoTo();
    press('g');
    act(() => {
      jest.advanceTimersByTime(GO_TO_WINDOW_MS);
    });
    press('s');
    expect(path()).toBe('/schedule/gantt');
  });

  it('a non-target key after g cancels and is not swallowed', () => {
    const reachedPage = jest.fn();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'x') reachedPage();
    });
    renderGoTo();
    press('g');
    const x = press('x');
    expect(x.defaultPrevented).toBe(false);
    expect(reachedPage).toHaveBeenCalledTimes(1);
    press('s');
    expect(path()).toBe('/some/other/page');
  });

  it('g g s navigates (the second g re-arms)', () => {
    renderGoTo();
    press('g');
    press('g');
    press('s');
    expect(path()).toBe('/schedule/gantt');
  });

  it('a lone modifier between g and the letter neither cancels nor arms', () => {
    renderGoTo();
    press('g');
    press('Shift', { shiftKey: true });
    press('s', { shiftKey: true });
    expect(path()).toBe('/schedule/gantt');
  });

  it('a letter without g does nothing', () => {
    renderGoTo();
    const event = press('s');
    expect(path()).toBe('/some/other/page');
    expect(event.defaultPrevented).toBe(false);
  });

  it('pressing the sequence for the current page does nothing', () => {
    renderGoTo('/schedule/gantt');
    press('g');
    press('s');
    expect(path()).toBe('/schedule/gantt');
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it('never fires while typing: g typed in an input does not arm (AC3)', () => {
    renderGoTo();
    const input = document.createElement('input');
    document.body.appendChild(input);
    press('g', {}, input);
    press('s');
    expect(path()).toBe('/some/other/page');
  });

  it('focus moving into an input between g and the letter cancels the sequence (AC3)', () => {
    renderGoTo();
    press('g');
    const input = document.createElement('input');
    document.body.appendChild(input);
    press('s', {}, input);
    expect(path()).toBe('/some/other/page');
    press('s');
    expect(path()).toBe('/some/other/page');
  });

  it('does not fire in a textarea, a select or a contenteditable element', () => {
    renderGoTo();
    for (const tag of ['textarea', 'select']) {
      const el = document.createElement(tag);
      document.body.appendChild(el);
      press('g', {}, el);
      press('s', {}, el);
    }
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.appendChild(editable);
    press('g', {}, editable);
    press('s', {}, editable);
    expect(path()).toBe('/some/other/page');
  });

  it('does not arm while a modal is open and a modal opening after g cancels', () => {
    renderGoTo();
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    press('g');
    modal.remove();
    press('s');
    expect(path()).toBe('/some/other/page');

    press('g');
    document.body.appendChild(modal);
    press('s');
    modal.remove();
    press('s');
    expect(path()).toBe('/some/other/page');
  });

  it('Ctrl+g never arms and Ctrl+s after g is not a target', () => {
    renderGoTo();
    press('g', { ctrlKey: true });
    press('s');
    expect(path()).toBe('/some/other/page');
    press('g');
    press('s', { metaKey: true });
    press('s');
    expect(path()).toBe('/some/other/page');
  });

  it('does nothing while the single-key switch is off, and works again after turning it on', () => {
    renderGoTo();
    probe.registry?.setSingleKeyEnabled(false);
    const g = press('g');
    press('s');
    expect(path()).toBe('/some/other/page');
    expect(g.defaultPrevented).toBe(false);
    probe.registry?.setSingleKeyEnabled(true);
    press('g');
    press('s');
    expect(path()).toBe('/schedule/gantt');
  });

  it('cancels an armed sequence when the switch is turned off in between', () => {
    renderGoTo();
    press('g');
    probe.registry?.setSingleKeyEnabled(false);
    press('x');
    probe.registry?.setSingleKeyEnabled(true);
    press('s');
    expect(path()).toBe('/some/other/page');
  });

  it('still navigates without a registry provider', () => {
    render(
      <MemoryRouter initialEntries={['/some/other/page']}>
        <Harness />
      </MemoryRouter>,
    );
    press('g');
    press('s');
    expect(path()).toBe('/schedule/gantt');
  });

  describe('registry rows', () => {
    it('registers eight goTo rows g h .. g m with "Go to <label>" descriptions', () => {
      renderGoTo();
      const rows = probe.registry!.snapshot().filter((s) => s.group === 'goTo');
      const nav = enCommon.navigation;
      expect(rows.map((r) => [r.key, r.description])).toEqual([
        ['g h', `Go to ${nav.home}`],
        ['g t', `Go to ${nav.tasks}`],
        ['g s', `Go to ${nav.schedule}`],
        ['g p', `Go to ${nav.purchases}`],
        ['g d', `Go to ${nav.siteDiary}`],
        ['g f', `Go to ${nav.photos}`],
        ['g c', `Go to ${nav.companies}`],
        ['g m', `Go to ${nav.money}`],
      ]);
    });

    it('a row handler navigates like the keyboard sequence', () => {
      renderGoTo();
      const row = probe.registry!.snapshot().find((s) => s.key === 'g s')!;
      act(() => row.handler());
      expect(path()).toBe('/schedule/gantt');
    });

    it('removes its rows on unmount', () => {
      const { unmount } = renderGoTo();
      const registry = probe.registry!;
      expect(registry.snapshot()).toHaveLength(8);
      unmount();
      expect(registry.snapshot()).toHaveLength(0);
    });

    it('skips hidden routes: no row and an inert sequence, others still work', () => {
      hidden.add('scheduleGantt');
      renderGoTo();
      const keys = probe.registry!.snapshot().map((s) => s.key);
      expect(keys).toHaveLength(7);
      expect(keys).not.toContain('g s');
      press('g');
      press('s');
      expect(path()).toBe('/some/other/page');
      press('g');
      press('h');
      expect(path()).toBe('/');
    });
  });
});
