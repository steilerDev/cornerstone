/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n/index.js';
import type * as ThemeToggleTypes from './ThemeToggle.js';

type Pref = 'light' | 'dark' | 'system';
let mockTheme: Pref = 'system';
const mockSetTheme = jest.fn<(theme: Pref) => void>();

jest.unstable_mockModule('../../contexts/ThemeContext.js', () => ({
  useTheme: () => ({ theme: mockTheme, resolvedTheme: 'light', setTheme: mockSetTheme }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('ThemeToggle', () => {
  let Module: typeof ThemeToggleTypes;

  beforeEach(async () => {
    if (!Module) {
      Module = await import('./ThemeToggle.js');
    }
    mockTheme = 'system';
    mockSetTheme.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('exports the cycle Light, Dark, System', () => {
    expect(Module.THEME_CYCLE).toEqual(['light', 'dark', 'system']);
  });

  it.each([
    ['light', 'Light', 'Dark'],
    ['dark', 'Dark', 'System'],
    ['system', 'System', 'Light'],
  ] as const)(
    'with %s it shows the current label and offers the next mode in aria-label and title',
    (theme, current, next) => {
      mockTheme = theme;
      render(<Module.ThemeToggle />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'button');
      expect(button).toHaveTextContent(current);
      expect(button).toHaveAccessibleName(`Switch to ${next} mode`);
      expect(button.getAttribute('title')).toContain(current);
      expect(button.getAttribute('title')).toContain(next);
    },
  );

  it.each([
    ['light', 'dark'],
    ['dark', 'system'],
    ['system', 'light'],
  ] as const)('clicking from %s selects %s exactly once', async (from, to) => {
    mockTheme = from;
    const user = userEvent.setup();
    render(<Module.ThemeToggle />);

    await user.click(screen.getByRole('button'));

    expect(mockSetTheme).toHaveBeenCalledTimes(1);
    expect(mockSetTheme).toHaveBeenCalledWith(to);
  });

  it.each(['light', 'dark', 'system'] as const)('draws one hidden icon for %s', (theme) => {
    mockTheme = theme;
    const { container } = render(<Module.ThemeToggle />);

    const icons = container.querySelectorAll('svg');
    expect(icons).toHaveLength(1);
    expect(icons[0]).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses a different icon for each preference', () => {
    const markup: string[] = [];
    for (const theme of ['light', 'dark', 'system'] as const) {
      mockTheme = theme;
      const { container, unmount } = render(<Module.ThemeToggle />);
      markup.push(container.querySelector('svg')?.innerHTML ?? '');
      unmount();
    }
    expect(new Set(markup).size).toBe(3);
  });

  it('translates the label and the action into German', async () => {
    await act(async () => {
      await i18n.changeLanguage('de');
    });
    mockTheme = 'light';
    render(<Module.ThemeToggle />);

    const button = screen.getByRole('button');
    expect(button).toHaveTextContent(i18n.t('theme.light', { ns: 'common' }));
    expect(button).toHaveAccessibleName(
      i18n.t('theme.switchTo', { ns: 'common', mode: i18n.t('theme.dark', { ns: 'common' }) }),
    );
    expect(button).not.toHaveAccessibleName('Switch to Dark mode');
  });
});
