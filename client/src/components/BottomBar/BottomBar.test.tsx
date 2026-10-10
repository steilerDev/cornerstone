/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { createRef } from 'react';
import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createRouterLog, RecordingRouter } from '../../test/recordingRouter';
import { resolveNavActive } from '../../navigation/navActive.js';
import { navSections } from '../../navigation/navConfig.js';
import { BottomBar } from './BottomBar.js';

const sections = navSections({ role: 'admin', paperlessConfigured: true });

class FakeViewport extends EventTarget {
  height = window.innerHeight;
  scale = 1;
}

const originalViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');

afterEach(() => {
  if (originalViewport) Object.defineProperty(window, 'visualViewport', originalViewport);
  else delete (window as unknown as Record<string, unknown>).visualViewport;
  delete document.documentElement.dataset.shellBar;
});

function renderBar(
  path: string,
  props: Partial<ComponentProps<typeof BottomBar>> = {},
  entries: string[] = [path],
) {
  const log = createRouterLog();
  const moreButtonRef = createRef<HTMLButtonElement>();
  const onMoreClick = jest.fn();
  const utils = render(
    <RecordingRouter entries={entries} log={log}>
      <BottomBar
        active={resolveNavActive(path, sections)}
        moreOpen={false}
        moreControlsId="more-id"
        moreButtonRef={moreButtonRef}
        onMoreClick={onMoreClick}
        {...props}
      />
    </RecordingRouter>,
  );
  return { log, onMoreClick, moreButtonRef, ...utils };
}

describe('BottomBar', () => {
  it('is a navigation landmark named Main navigation with the five slots in order', () => {
    renderBar('/');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav).toBe(screen.getByTestId('bottom-bar'));
    const items = within(nav).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Home',
      'Site diary',
      'New',
      'Photos',
      'More',
    ]);
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.getAttribute('data-testid')),
    ).toEqual(['bottom-bar-home', 'bottom-bar-diary', 'bottom-bar-new', 'bottom-bar-photos']);
  });

  it('links Home, Site diary and Photos to their section routes', () => {
    renderBar('/project/work-items');
    expect(screen.getByTestId('bottom-bar-home')).toHaveAttribute('href', '/');
    expect(screen.getByTestId('bottom-bar-diary')).toHaveAttribute('href', '/diary');
    expect(screen.getByTestId('bottom-bar-photos')).toHaveAttribute('href', '/photos');
  });

  it('points the New slot at /diary/new and never marks it current', () => {
    renderBar('/diary/new');
    const slot = screen.getByTestId('bottom-bar-new');
    expect(slot).toHaveAttribute('href', '/diary/new');
    expect(slot).not.toHaveAttribute('aria-current');
  });

  it.each([
    ['/', 'bottom-bar-home'],
    ['/diary', 'bottom-bar-diary'],
    ['/photos', 'bottom-bar-photos'],
  ])('marks the slot for %s as the current page', (path, testId) => {
    renderBar(path);
    const current = screen.getByTestId(testId);
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.className).toContain('slotActive');
    expect(document.querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(screen.getByTestId('bottom-bar-more')).not.toHaveAttribute('aria-current');
  });

  it.each([
    ['tasks', '/project/work-items'],
    ['money', '/budget/overview'],
    ['settings', '/settings/profile'],
    ['companies', '/companies'],
    ['a task detail', '/project/work-items/w-1'],
  ])('highlights More (aria-current=true) on %s', (_label, path) => {
    renderBar(path);
    const more = screen.getByTestId('bottom-bar-more');
    expect(more).toHaveAttribute('aria-current', 'true');
    expect(more.className).toContain('slotActive');
    expect(
      within(screen.getByTestId('bottom-bar'))
        .getAllByRole('link')
        .filter((a) => a.hasAttribute('aria-current')),
    ).toHaveLength(0);
  });

  it('highlights nothing when no section is active', () => {
    renderBar('/definitely/not/a/route', { active: null });
    expect(document.querySelectorAll('[aria-current]')).toHaveLength(0);
  });

  it('replaces the history entry only when the current slot is clicked on its exact page', () => {
    const exact = renderBar('/diary');
    fireEvent.click(screen.getByTestId('bottom-bar-diary'));
    expect(exact.log.actions).toEqual(['REPLACE /diary']);
    exact.unmount();

    const detail = renderBar('/diary/e-1');
    fireEvent.click(screen.getByTestId('bottom-bar-diary'));
    expect(detail.log.actions).toEqual(['PUSH /diary']);
    detail.unmount();

    const other = renderBar('/diary');
    fireEvent.click(screen.getByTestId('bottom-bar-photos'));
    expect(other.log.actions).toEqual(['PUSH /photos']);
  });

  it('exposes More as a dialog opener wired to the sheet id and calls onMoreClick', () => {
    const { onMoreClick, moreButtonRef } = renderBar('/', { moreOpen: true });
    const more = screen.getByTestId('bottom-bar-more');
    expect(more.tagName).toBe('BUTTON');
    expect(more).toHaveAttribute('aria-haspopup', 'dialog');
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(more).toHaveAttribute('aria-controls', 'more-id');
    expect(moreButtonRef.current).toBe(more);
    fireEvent.click(more);
    expect(onMoreClick).toHaveBeenCalledTimes(1);
  });

  it('reports More collapsed when the sheet is closed', () => {
    renderBar('/');
    expect(screen.getByTestId('bottom-bar-more')).toHaveAttribute('aria-expanded', 'false');
  });

  describe('home badge', () => {
    it('renders nothing when undefined or 0', () => {
      const { unmount } = renderBar('/');
      expect(screen.getByTestId('bottom-bar-home').querySelector('[class*="badge"]')).toBeNull();
      expect(screen.getByTestId('bottom-bar-home')).not.toHaveAttribute('aria-label');
      unmount();
      renderBar('/', { homeBadge: 0 });
      expect(screen.getByTestId('bottom-bar-home').querySelector('[class*="badge"]')).toBeNull();
      expect(screen.getByTestId('bottom-bar-home')).not.toHaveAttribute('aria-label');
    });

    it('shows the count, hides it from assistive tech and names the link with the plural form', () => {
      renderBar('/', { homeBadge: 1 });
      const home = screen.getByTestId('bottom-bar-home');
      const badge = home.querySelector('[class*="badge"]');
      expect(badge).toHaveTextContent('1');
      expect(badge).toHaveAttribute('aria-hidden', 'true');
      expect(home).toHaveAttribute('aria-label', 'Home, 1 needs attention');
    });

    it('uses the plural name for several items', () => {
      renderBar('/', { homeBadge: 7 });
      expect(screen.getByTestId('bottom-bar-home')).toHaveAttribute(
        'aria-label',
        'Home, 7 need attention',
      );
    });

    it('caps the visible count at 99+', () => {
      renderBar('/', { homeBadge: 100 });
      expect(
        screen.getByTestId('bottom-bar-home').querySelector('[class*="badge"]'),
      ).toHaveTextContent('99+');
      expect(
        screen.getByTestId('bottom-bar-home').querySelector('[class*="badge"]')?.textContent,
      ).toBe('99+');
    });

    it('shows 99 as is', () => {
      renderBar('/', { homeBadge: 99 });
      expect(
        screen.getByTestId('bottom-bar-home').querySelector('[class*="badge"]')?.textContent,
      ).toBe('99');
    });
  });

  describe('on-screen keyboard', () => {
    it('sets html[data-shell-bar=shown] and removes it on unmount', () => {
      const { unmount } = renderBar('/');
      expect(document.documentElement.dataset.shellBar).toBe('shown');
      expect(screen.getByTestId('bottom-bar')).toHaveAttribute('data-keyboard-open', 'false');
      unmount();
      expect(document.documentElement.dataset.shellBar).toBeUndefined();
    });

    it('hides the bar while the keyboard is open and shows it again afterwards', () => {
      const vv = new FakeViewport();
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
      renderBar('/');
      act(() => {
        vv.height = window.innerHeight * 0.5;
        vv.dispatchEvent(new Event('resize'));
      });
      expect(screen.getByTestId('bottom-bar')).toHaveAttribute('data-keyboard-open', 'true');
      expect(document.documentElement.dataset.shellBar).toBe('hidden');
      act(() => {
        vv.height = window.innerHeight;
        vv.dispatchEvent(new Event('resize'));
      });
      expect(screen.getByTestId('bottom-bar')).toHaveAttribute('data-keyboard-open', 'false');
      expect(document.documentElement.dataset.shellBar).toBe('shown');
    });
  });
});
