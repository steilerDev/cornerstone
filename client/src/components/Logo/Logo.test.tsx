/** @jest-environment jsdom */
// Tests for Logo component — Bug #318 fix verification.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as ThemeContextTypes from '../../contexts/ThemeContext.js';
import type * as LogoTypes from './Logo.js';

describe('Logo component', () => {
  // Modules are imported dynamically AFTER the module registry is ready.
  let ThemeContext: typeof ThemeContextTypes;
  let Logo: typeof LogoTypes.Logo;

  beforeEach(async () => {
    if (!Logo) {
      ThemeContext = await import('../../contexts/ThemeContext.js');
      const logoModule = await import('./Logo.js');
      Logo = logoModule.Logo;
    }
    // Default to light mode by clearing any stored theme preference
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  // Helper: wrap Logo in ThemeProvider so useTheme() has context.
  // ThemeProvider reads localStorage for the preference; default (missing) resolves to 'system',
  // which resolves to 'light' in jsdom (matchMedia prefers-color-scheme defaults to light).
  function renderWithTheme(ui: ReactNode, theme?: 'light' | 'dark') {
    if (theme) {
      localStorage.setItem('theme', theme);
    }
    const { ThemeProvider } = ThemeContext;
    return render(<ThemeProvider>{ui}</ThemeProvider>);
  }

  // ── variant = 'icon' (default) ─────────────────────────────────────────────

  describe('icon variant (default)', () => {
    it('renders an img with alt="Cornerstone"', () => {
      renderWithTheme(<Logo />);
      const img = screen.getByRole('img', { name: 'Cornerstone' });
      expect(img).toBeInTheDocument();
    });

    it('uses /icon.svg in light mode', () => {
      renderWithTheme(<Logo />, 'light');
      const img = screen.getByRole('img', { name: 'Cornerstone' });
      expect(img).toHaveAttribute('src', '/icon.svg');
    });

    it('uses /icon-dark.svg in dark mode', () => {
      renderWithTheme(<Logo />, 'dark');
      const img = screen.getByRole('img', { name: 'Cornerstone' });
      expect(img).toHaveAttribute('src', '/icon-dark.svg');
    });

    it('sets both width and height to size (square)', () => {
      renderWithTheme(<Logo size={32} />);
      const img = screen.getByRole('img', { name: 'Cornerstone' });
      expect(img).toHaveAttribute('width', '32');
      expect(img).toHaveAttribute('height', '32');
    });

    it('defaults to size=32', () => {
      renderWithTheme(<Logo />);
      const img = screen.getByRole('img', { name: 'Cornerstone' });
      expect(img).toHaveAttribute('width', '32');
      expect(img).toHaveAttribute('height', '32');
    });

    it('passes custom className to img', () => {
      renderWithTheme(<Logo className="my-class" />);
      const img = screen.getByRole('img', { name: 'Cornerstone' });
      expect(img).toHaveAttribute('class', 'my-class');
    });

    it('explicit variant="icon" behaves same as default', () => {
      renderWithTheme(<Logo variant="icon" size={24} />, 'light');
      const img = screen.getByRole('img', { name: 'Cornerstone' });
      expect(img).toHaveAttribute('src', '/icon.svg');
      expect(img).toHaveAttribute('width', '24');
    });
  });

  // ── variant = 'full' ───────────────────────────────────────────────────────

  describe('full variant', () => {
    it('uses /logo.svg in light mode', () => {
      renderWithTheme(<Logo variant="full" />, 'light');
      const img = screen.getByRole('img', { name: 'Cornerstone' });
      expect(img).toHaveAttribute('src', '/logo.svg');
    });

    it('uses /logo-dark.svg in dark mode', () => {
      renderWithTheme(<Logo variant="full" />, 'dark');
      const img = screen.getByRole('img', { name: 'Cornerstone' });
      expect(img).toHaveAttribute('src', '/logo-dark.svg');
    });

    it('sets only height (not width) to preserve aspect ratio', () => {
      renderWithTheme(<Logo variant="full" size={72} />);
      const img = screen.getByRole('img', { name: 'Cornerstone' });
      expect(img).toHaveAttribute('height', '72');
      // width must not be set — browser scales width from intrinsic ratio
      expect(img).not.toHaveAttribute('width');
    });

    it('defaults to height=32 when no size specified', () => {
      renderWithTheme(<Logo variant="full" />);
      const img = screen.getByRole('img', { name: 'Cornerstone' });
      expect(img).toHaveAttribute('height', '32');
      expect(img).not.toHaveAttribute('width');
    });

    it('uses the specified size as height', () => {
      renderWithTheme(<Logo variant="full" size={64} />);
      const img = screen.getByRole('img', { name: 'Cornerstone' });
      expect(img).toHaveAttribute('height', '64');
    });

    it('passes custom className to img', () => {
      renderWithTheme(<Logo variant="full" className="logo-class" />);
      const img = screen.getByRole('img', { name: 'Cornerstone' });
      expect(img).toHaveAttribute('class', 'logo-class');
    });
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('icon variant has accessible alt text', () => {
      renderWithTheme(<Logo />);
      expect(screen.getByAltText('Cornerstone')).toBeInTheDocument();
    });

    it('full variant has accessible alt text', () => {
      renderWithTheme(<Logo variant="full" />);
      expect(screen.getByAltText('Cornerstone')).toBeInTheDocument();
    });
  });
});
