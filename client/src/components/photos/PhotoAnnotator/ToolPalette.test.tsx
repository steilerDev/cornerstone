/**
 * @jest-environment jsdom
 *
 * Unit tests for ToolPalette.tsx
 *
 * Story #1476: Photo Annotator — Text-based Tools (Text, Callout)
 *
 * Tests:
 *   - Text and Callout tool buttons rendered with data-testid
 *   - Font-size selector visibility: hidden for non-text tools, shown for 'text' and 'callout'
 *   - Font-size selector active state (aria-checked)
 *   - Clicking a font-size button calls onSelectFontSize with the correct size
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import type { ToolName, StrokeWidthKey } from './useAnnotator.js';

// ─── Local type (mirrors ToolPalette's internal props interface) ──────────────
interface ToolPaletteProps {
  selectedTool: ToolName;
  activeColor: string;
  activeStrokeWidthKey: StrokeWidthKey;
  activeFontSize: number;
  canUndo: boolean;
  canRedo: boolean;
  onSelectTool: (tool: ToolName) => void;
  onSelectColor: (color: string) => void;
  onSelectStrokeWidth: (key: StrokeWidthKey) => void;
  onSelectFontSize: (size: number) => void;
  onUndo: () => void;
  onRedo: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.MockedFunction<(...args: any[]) => any>;

// ─── Mock: react-i18next ──────────────────────────────────────────────────────

jest.unstable_mockModule('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
  Trans: ({ children }: { children: React.ReactNode }) => children,
}));

// ─── Dynamic import ──────────────────────────────────────────────────────────

let ToolPalette: React.ComponentType<ToolPaletteProps>;

// ─── Default props ────────────────────────────────────────────────────────────

function makeProps(overrides: Partial<ToolPaletteProps> = {}): ToolPaletteProps {
  return {
    selectedTool: 'select',
    activeColor: '#dc2626',
    activeStrokeWidthKey: 'medium',
    activeFontSize: 18,
    canUndo: false,
    canRedo: false,
    onSelectTool: jest.fn() as AnyMock,
    onSelectColor: jest.fn() as AnyMock,
    onSelectStrokeWidth: jest.fn() as AnyMock,
    onSelectFontSize: jest.fn() as AnyMock,
    onUndo: jest.fn() as AnyMock,
    onRedo: jest.fn() as AnyMock,
    ...overrides,
  };
}

function renderPalette(overrides: Partial<ToolPaletteProps> = {}) {
  const props = makeProps(overrides);
  return { ...render(React.createElement(ToolPalette, props)), props };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('ToolPalette', () => {
  beforeEach(async () => {
    if (!ToolPalette) {
      const mod = await import('./ToolPalette.js');
      ToolPalette = mod.ToolPalette;
    }
    jest.clearAllMocks();
  });

  describe('Tool buttons', () => {
    it('renders text tool button with data-testid="tool-text"', () => {
      renderPalette();
      expect(screen.getByTestId('tool-text')).toBeInTheDocument();
    });

    it('renders callout tool button with data-testid="tool-callout"', () => {
      renderPalette();
      expect(screen.getByTestId('tool-callout')).toBeInTheDocument();
    });

    it('text tool button is not active by default (selectedTool=select)', () => {
      renderPalette({ selectedTool: 'select' });
      expect(screen.getByTestId('tool-text')).toHaveAttribute('aria-pressed', 'false');
    });

    it('callout tool button is not active by default (selectedTool=select)', () => {
      renderPalette({ selectedTool: 'select' });
      expect(screen.getByTestId('tool-callout')).toHaveAttribute('aria-pressed', 'false');
    });

    it('text tool button is active when selectedTool="text"', () => {
      renderPalette({ selectedTool: 'text' });
      expect(screen.getByTestId('tool-text')).toHaveAttribute('aria-pressed', 'true');
    });

    it('callout tool button is active when selectedTool="callout"', () => {
      renderPalette({ selectedTool: 'callout' });
      expect(screen.getByTestId('tool-callout')).toHaveAttribute('aria-pressed', 'true');
    });

    it('clicking text tool button calls onSelectTool with "text"', () => {
      const onSelectTool = jest.fn() as AnyMock;
      renderPalette({ onSelectTool });
      fireEvent.click(screen.getByTestId('tool-text'));
      expect(onSelectTool).toHaveBeenCalledWith('text');
    });

    it('clicking callout tool button calls onSelectTool with "callout"', () => {
      const onSelectTool = jest.fn() as AnyMock;
      renderPalette({ onSelectTool });
      fireEvent.click(screen.getByTestId('tool-callout'));
      expect(onSelectTool).toHaveBeenCalledWith('callout');
    });
  });

  describe('Font-size selector visibility', () => {
    // The real i18n t('fontSize') → "Font size" in the EN locale,
    // so the radiogroup's accessible name is "Font size".
    // When jest.unstable_mockModule doesn't intercept react-i18next in this ESM setup,
    // the actual translation strings are used. We query by the real translated name.

    it('font-size selector is NOT visible when selectedTool is "select"', () => {
      renderPalette({ selectedTool: 'select' });
      // Font size radiogroup is gated by selectedTool === 'text' || 'callout'
      // Use queryAllByRole to check absence regardless of label string
      const radiogroups = screen.queryAllByRole('radiogroup');
      // Should only have colorPalette and strokeWidth groups — NOT fontSize
      const hasFontSize = radiogroups.some(
        (el) => el.getAttribute('aria-label') === 'fontSize' || el.getAttribute('aria-label') === 'Font size',
      );
      expect(hasFontSize).toBe(false);
    });

    it('font-size selector is NOT visible when selectedTool is "rectangle"', () => {
      renderPalette({ selectedTool: 'rectangle' });
      const radiogroups = screen.queryAllByRole('radiogroup');
      const hasFontSize = radiogroups.some(
        (el) => el.getAttribute('aria-label') === 'fontSize' || el.getAttribute('aria-label') === 'Font size',
      );
      expect(hasFontSize).toBe(false);
    });

    it('font-size selector is NOT visible when selectedTool is "arrow"', () => {
      renderPalette({ selectedTool: 'arrow' });
      const radiogroups = screen.queryAllByRole('radiogroup');
      const hasFontSize = radiogroups.some(
        (el) => el.getAttribute('aria-label') === 'fontSize' || el.getAttribute('aria-label') === 'Font size',
      );
      expect(hasFontSize).toBe(false);
    });

    it('font-size selector IS visible when selectedTool is "text" (more radiogroups than without)', () => {
      // With selectedTool='select': 2 radiogroups (color + stroke)
      // With selectedTool='text': 3 radiogroups (color + stroke + fontSize)
      const { unmount } = renderPalette({ selectedTool: 'select' });
      const groupsWithSelect = screen.queryAllByRole('radiogroup').length;
      unmount();

      renderPalette({ selectedTool: 'text' });
      const groupsWithText = screen.queryAllByRole('radiogroup').length;

      expect(groupsWithText).toBeGreaterThan(groupsWithSelect);
    });

    it('font-size selector IS visible when selectedTool is "callout" (more radiogroups than without)', () => {
      const { unmount } = renderPalette({ selectedTool: 'select' });
      const groupsWithSelect = screen.queryAllByRole('radiogroup').length;
      unmount();

      renderPalette({ selectedTool: 'callout' });
      const groupsWithCallout = screen.queryAllByRole('radiogroup').length;

      expect(groupsWithCallout).toBeGreaterThan(groupsWithSelect);
    });

    it('font-size radiogroup has exactly 4 font-size radio buttons', () => {
      renderPalette({ selectedTool: 'text' });
      const radios = screen.getAllByRole('radio');
      // 6 color swatches + 3 stroke widths + 4 font sizes = 13 total
      // Subtract color and stroke to isolate: we check total is 13
      expect(radios.length).toBe(13);
    });
  });

  describe('Font-size selector active state', () => {
    // Uses real translation strings from EN locale:
    // fontSizeSmall="Small", fontSizeMedium="Medium", fontSizeLarge="Large", fontSizeXlarge="Extra large"
    // NOTE: strokeMedium is also "Medium", so queries must be scoped within the fontSize radiogroup
    // (aria-label="Font size") to avoid ambiguity.

    function getFontSizeGroup() {
      // The fontSize radiogroup uses t('fontSize') → "Font size" in the real EN locale.
      // We find it among all radiogroups by its aria-label.
      const groups = screen.getAllByRole('radiogroup');
      const fsGroup = groups.find(
        (el) =>
          el.getAttribute('aria-label') === 'Font size' ||
          el.getAttribute('aria-label') === 'fontSize',
      );
      if (!fsGroup) throw new Error('Font-size radiogroup not found');
      return fsGroup;
    }

    it('Medium button has aria-checked=true when activeFontSize=18', () => {
      renderPalette({ selectedTool: 'text', activeFontSize: 18 });
      const mediumBtn = within(getFontSizeGroup()).getByRole('radio', { name: /Medium/i });
      expect(mediumBtn).toHaveAttribute('aria-checked', 'true');
    });

    it('Small button has aria-checked=false when activeFontSize=18', () => {
      renderPalette({ selectedTool: 'text', activeFontSize: 18 });
      const smallBtn = within(getFontSizeGroup()).getByRole('radio', { name: /Small/i });
      expect(smallBtn).toHaveAttribute('aria-checked', 'false');
    });

    it('Large button has aria-checked=true when activeFontSize=24', () => {
      renderPalette({ selectedTool: 'callout', activeFontSize: 24 });
      const largeBtn = within(getFontSizeGroup()).getByRole('radio', { name: 'Large' });
      expect(largeBtn).toHaveAttribute('aria-checked', 'true');
    });

    it('XLarge button has aria-checked=true when activeFontSize=32', () => {
      renderPalette({ selectedTool: 'text', activeFontSize: 32 });
      const xlargeBtn = within(getFontSizeGroup()).getByRole('radio', { name: /Extra large/i });
      expect(xlargeBtn).toHaveAttribute('aria-checked', 'true');
    });

    it('Small, Large, and XLarge buttons have aria-checked=false when activeFontSize=18', () => {
      renderPalette({ selectedTool: 'text', activeFontSize: 18 });
      const fsGroup = getFontSizeGroup();
      const smallBtn = within(fsGroup).getByRole('radio', { name: /Small/i });
      const largeBtn = within(fsGroup).getByRole('radio', { name: 'Large' });
      const xlargeBtn = within(fsGroup).getByRole('radio', { name: /Extra large/i });
      expect(smallBtn).toHaveAttribute('aria-checked', 'false');
      expect(largeBtn).toHaveAttribute('aria-checked', 'false');
      expect(xlargeBtn).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('Font-size selector interaction', () => {
    function getFontSizeGroup() {
      const groups = screen.getAllByRole('radiogroup');
      const fsGroup = groups.find(
        (el) =>
          el.getAttribute('aria-label') === 'Font size' ||
          el.getAttribute('aria-label') === 'fontSize',
      );
      if (!fsGroup) throw new Error('Font-size radiogroup not found');
      return fsGroup;
    }

    it('clicking Large button calls onSelectFontSize(24)', () => {
      const onSelectFontSize = jest.fn() as AnyMock;
      renderPalette({ selectedTool: 'text', activeFontSize: 18, onSelectFontSize });
      const largeBtn = within(getFontSizeGroup()).getByRole('radio', { name: 'Large' });
      fireEvent.click(largeBtn);
      expect(onSelectFontSize).toHaveBeenCalledWith(24);
    });

    it('clicking Small button calls onSelectFontSize(12)', () => {
      const onSelectFontSize = jest.fn() as AnyMock;
      renderPalette({ selectedTool: 'callout', activeFontSize: 18, onSelectFontSize });
      const smallBtn = within(getFontSizeGroup()).getByRole('radio', { name: /Small/i });
      fireEvent.click(smallBtn);
      expect(onSelectFontSize).toHaveBeenCalledWith(12);
    });

    it('clicking XLarge button calls onSelectFontSize(32)', () => {
      const onSelectFontSize = jest.fn() as AnyMock;
      renderPalette({ selectedTool: 'text', activeFontSize: 18, onSelectFontSize });
      const xlargeBtn = within(getFontSizeGroup()).getByRole('radio', { name: /Extra large/i });
      fireEvent.click(xlargeBtn);
      expect(onSelectFontSize).toHaveBeenCalledWith(32);
    });

    it('clicking Medium button calls onSelectFontSize(18)', () => {
      const onSelectFontSize = jest.fn() as AnyMock;
      renderPalette({ selectedTool: 'text', activeFontSize: 12, onSelectFontSize });
      const mediumBtn = within(getFontSizeGroup()).getByRole('radio', { name: /Medium/i });
      fireEvent.click(mediumBtn);
      expect(onSelectFontSize).toHaveBeenCalledWith(18);
    });
  });

  describe('Existing tool buttons are still present', () => {
    it('renders select, rectangle, highlight, arrow, line, ellipse buttons', () => {
      renderPalette();
      expect(screen.getByTestId('tool-select')).toBeInTheDocument();
      expect(screen.getByTestId('tool-rectangle')).toBeInTheDocument();
      expect(screen.getByTestId('tool-highlight')).toBeInTheDocument();
      expect(screen.getByTestId('tool-arrow')).toBeInTheDocument();
      expect(screen.getByTestId('tool-line')).toBeInTheDocument();
      expect(screen.getByTestId('tool-ellipse')).toBeInTheDocument();
    });
  });
});
