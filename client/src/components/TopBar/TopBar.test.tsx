/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import type * as TopBarTypes from './TopBar.js';
import type * as CommandSearchContextTypes from '../CommandSearch/CommandSearchContext.js';

jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      email: 'sam@example.test',
      displayName: 'Sam Jo Example',
      role: 'member',
    },
    oidcEnabled: false,
    isLoading: false,
    error: null,
    refreshAuth: jest.fn(),
    logout: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }),
}));

jest.unstable_mockModule('../../contexts/ThemeContext.js', () => ({
  useTheme: () => ({ theme: 'system', resolvedTheme: 'light', setTheme: jest.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: () => ({
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  }),
  RESOLVED_LOCALES: ['en', 'de'],
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('TopBar', () => {
  let TopBarModule: typeof TopBarTypes;
  let CommandSearchModule: typeof CommandSearchContextTypes;
  const platformDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'platform');

  function setPlatform(value: string) {
    Object.defineProperty(window.navigator, 'platform', { value, configurable: true });
  }

  beforeEach(async () => {
    if (!TopBarModule) {
      TopBarModule = await import('./TopBar.js');
      CommandSearchModule = await import('../CommandSearch/CommandSearchContext.js');
    }
  });

  afterEach(() => {
    // Restore the instance override (jsdom defines platform on the prototype)
    if (platformDescriptor) {
      Object.defineProperty(window.navigator, 'platform', platformDescriptor);
    } else {
      delete (window.navigator as unknown as Record<string, unknown>).platform;
    }
    jest.restoreAllMocks();
  });

  function renderBar(slotRef: (el: HTMLDivElement | null) => void = () => {}) {
    const log = createRouterLog();
    const utils = render(
      <RecordingRouter entries={['/project/overview']} log={log}>
        <TopBarModule.TopBar breadcrumbSlotRef={slotRef} />
      </RecordingRouter>,
    );
    return { log, ...utils };
  }

  function renderWithSearch(isOpen = false) {
    const onOpen = jest.fn<(o: CommandSearchContextTypes.CommandSearchOpenOptions) => void>();
    const log = createRouterLog();
    render(
      <RecordingRouter entries={['/project/overview']} log={log}>
        <CommandSearchModule.CommandSearchProvider
          isOpen={isOpen}
          onOpen={onOpen}
          onClose={() => {}}
        >
          <TopBarModule.TopBar breadcrumbSlotRef={() => {}} />
        </CommandSearchModule.CommandSearchProvider>
      </RecordingRouter>,
    );
    return { onOpen };
  }

  it('is a single banner landmark containing the bar test id', () => {
    renderBar();
    const banner = screen.getByRole('banner');
    expect(banner).toBe(screen.getByTestId('top-bar'));
    expect(screen.getAllByRole('banner')).toHaveLength(1);
  });

  it('hands the breadcrumb slot element to the callback ref, empty and first in the bar', () => {
    const slotRef = jest.fn<(el: HTMLDivElement | null) => void>();
    renderBar(slotRef);
    const slot = screen.getByTestId('top-bar-slot');
    expect(slotRef.mock.calls.some(([el]) => el === slot)).toBe(true);
    expect(slot).toBeEmptyDOMElement();
    expect(screen.getByTestId('top-bar').firstElementChild).toBe(slot);
  });

  it('orders Search, New, the attention bell and the avatar after the slot', () => {
    renderBar();
    const bar = screen.getByTestId('top-bar');
    const ids = Array.from(bar.querySelectorAll('[data-testid]')).map((el) =>
      el.getAttribute('data-testid'),
    );
    const wanted = [
      'top-bar-slot',
      'top-bar-search',
      'top-bar-new',
      'top-bar-attention',
      'user-menu-trigger',
    ];
    expect(ids.filter((id) => wanted.includes(id ?? ''))).toEqual(wanted);
  });

  describe('New menu (#2212)', () => {
    it('is a live menu button named New, collapsed until opened', () => {
      renderBar();
      const button = screen.getByTestId('top-bar-new');
      expect(button).toHaveAttribute('aria-haspopup', 'menu');
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(button).not.toHaveAttribute('aria-disabled');
      expect(button).toHaveAttribute('data-create-trigger');
    });

    it('opens the create entries in menu order on click', () => {
      renderBar();
      fireEvent.click(screen.getByTestId('top-bar-new'));
      expect(screen.getByTestId('top-bar-new')).toHaveAttribute('aria-expanded', 'true');
      const ids = within(screen.getByRole('menu'))
        .getAllByRole('menuitem')
        .map((el) => el.getAttribute('data-testid'));
      expect(ids).toEqual([
        'create-menu-diaryEntry',
        'create-menu-task',
        'create-menu-purchase',
        'create-menu-invoice',
        'create-menu-offer',
        'create-menu-company',
        'create-menu-milestone',
      ]);
    });
  });

  describe('Search (#2211)', () => {
    it('is a live dialog trigger, focusable, not aria-disabled', () => {
      renderBar();
      const button = screen.getByTestId('top-bar-search');
      expect(button).not.toHaveAttribute('aria-disabled');
      expect(button).not.toHaveAttribute('disabled');
      expect(button).toHaveAttribute('type', 'button');
      expect(button).toHaveAttribute('aria-haspopup', 'dialog');
      expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K');
      button.focus();
      expect(button).toHaveFocus();
    });

    it('opens the command search on click', () => {
      const { onOpen } = renderWithSearch();
      fireEvent.click(screen.getByTestId('top-bar-search'));
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onOpen).toHaveBeenCalledWith({});
    });

    it('does nothing, and does not throw, without a command search provider', () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { log } = renderBar();
      fireEvent.click(screen.getByTestId('top-bar-search'));
      expect(log.actions).toEqual([]);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(error).not.toHaveBeenCalled();
    });
  });

  describe('placeholders', () => {
    const TEST_IDS = ['top-bar-attention'];

    it.each(TEST_IDS)('%s is aria-disabled, focusable and not natively disabled', (id) => {
      renderBar();
      const button = screen.getByTestId(id);
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).not.toHaveAttribute('disabled');
      expect(button).toHaveAttribute('type', 'button');
      button.focus();
      expect(button).toHaveFocus();
    });

    it.each(TEST_IDS)('%s does nothing when clicked', (id) => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { log } = renderBar();
      fireEvent.click(screen.getByTestId(id));
      expect(log.actions).toEqual([]);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(error).not.toHaveBeenCalled();
    });

    it('does not claim a popup or shortcut it does not have yet', () => {
      renderBar();
      for (const id of TEST_IDS) {
        expect(screen.getByTestId(id)).not.toHaveAttribute('aria-haspopup');
        expect(screen.getByTestId(id)).not.toHaveAttribute('aria-keyshortcuts');
      }
    });
  });

  describe('accessible names', () => {
    it('names Search exactly "Search" (the key hint is hidden from assistive tech)', () => {
      renderBar();
      expect(screen.getByTestId('top-bar-search')).toHaveAccessibleName('Search');
      expect(screen.getByTestId('top-bar-search').querySelector('kbd')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
    });

    it('names New exactly "New" (the caret is hidden)', () => {
      renderBar();
      expect(screen.getByTestId('top-bar-new')).toHaveAccessibleName('New');
    });

    it('names the bell "Needs attention"', () => {
      renderBar();
      expect(screen.getByRole('button', { name: 'Needs attention' })).toBe(
        screen.getByTestId('top-bar-attention'),
      );
    });

    it('names the avatar after the signed-in user', () => {
      renderBar();
      expect(screen.getByRole('button', { name: /^Account menu for / })).toBe(
        screen.getByTestId('user-menu-trigger'),
      );
    });

    it('hides the decorative icons', () => {
      renderBar();
      for (const svg of screen.getByTestId('top-bar').querySelectorAll('svg')) {
        expect(svg).toHaveAttribute('aria-hidden', 'true');
      }
    });
  });

  describe('search shortcut hint', () => {
    it('shows Ctrl K on Linux', () => {
      setPlatform('Linux x86_64');
      renderBar();
      expect(within(screen.getByTestId('top-bar-search')).getByText('Ctrl K')).toBeInTheDocument();
      expect(screen.queryByText('⌘K')).not.toBeInTheDocument();
    });

    it('shows ⌘K on macOS', () => {
      setPlatform('MacIntel');
      renderBar();
      expect(within(screen.getByTestId('top-bar-search')).getByText('⌘K')).toBeInTheDocument();
      expect(screen.queryByText('Ctrl K')).not.toBeInTheDocument();
    });
  });

  describe('no primary button (AC4)', () => {
    it('gives no control in the bar a primary button class', () => {
      renderBar();
      const classes = Array.from(screen.getByTestId('top-bar').querySelectorAll('*')).map(
        (el) => el.getAttribute('class') ?? '',
      );
      expect(classes.filter((c) => /btnPrimary/.test(c))).toEqual([]);
      expect(screen.getByTestId('top-bar-new').className).toContain('newButton');
    });
  });
});
