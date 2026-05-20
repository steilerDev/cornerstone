/**
 * @jest-environment jsdom
 *
 * Unit tests for ToolPalette.tsx
 *
 * Story #1476: Photo Annotator — Text-based Tools (Text)
 *
 * Tests:
 *   - Text tool button rendered with data-testid
 *   - Font-size selector visibility: hidden for non-text tools, shown for 'text'
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
  activeFontSizeKey: string;
  canUndo: boolean;
  canRedo: boolean;
  onSelectTool: (tool: ToolName) => void;
  onSelectColor: (color: string) => void;
  onSelectStrokeWidth: (key: StrokeWidthKey) => void;
  onSelectFontSize: (key: string) => void;
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
    activeFontSizeKey: 'medium',
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

    it('text tool button is not active by default (selectedTool=select)', () => {
      renderPalette({ selectedTool: 'select' });
      expect(screen.getByTestId('tool-text')).toHaveAttribute('aria-pressed', 'false');
    });

    it('text tool button is active when selectedTool="text"', () => {
      renderPalette({ selectedTool: 'text' });
      expect(screen.getByTestId('tool-text')).toHaveAttribute('aria-pressed', 'true');
    });

    it('clicking text tool button calls onSelectTool with "text"', () => {
      const onSelectTool = jest.fn() as AnyMock;
      renderPalette({ onSelectTool });
      fireEvent.click(screen.getByTestId('tool-text'));
      expect(onSelectTool).toHaveBeenCalledWith('text');
    });
  });

  describe('Font-size selector visibility', () => {
    it('font-size selector is NOT visible when selectedTool is "select"', () => {
      renderPalette({ selectedTool: 'select' });
      expect(screen.queryByTestId('annotator-font-size')).not.toBeInTheDocument();
    });

    it('font-size selector is NOT visible when selectedTool is "rectangle"', () => {
      renderPalette({ selectedTool: 'rectangle' });
      expect(screen.queryByTestId('annotator-font-size')).not.toBeInTheDocument();
    });

    it('font-size selector is NOT visible when selectedTool is "arrow"', () => {
      renderPalette({ selectedTool: 'arrow' });
      expect(screen.queryByTestId('annotator-font-size')).not.toBeInTheDocument();
    });

    it('font-size selector IS visible when selectedTool is "text"', () => {
      renderPalette({ selectedTool: 'text' });
      expect(screen.getByTestId('annotator-font-size')).toBeInTheDocument();
    });

    it('font-size select has exactly 5 options', () => {
      renderPalette({ selectedTool: 'text' });
      const select = screen.getByTestId('annotator-font-size');
      const options = select.querySelectorAll('option');
      expect(options.length).toBe(5);
    });
  });

  describe('Font-size selector active state', () => {
    it('select has value="medium" when activeFontSizeKey="medium"', () => {
      renderPalette({ selectedTool: 'text', activeFontSizeKey: 'medium' });
      const select = screen.getByTestId('annotator-font-size') as HTMLSelectElement;
      expect(select.value).toBe('medium');
    });

    it('select has value="small" when activeFontSizeKey="small"', () => {
      renderPalette({ selectedTool: 'text', activeFontSizeKey: 'small' });
      const select = screen.getByTestId('annotator-font-size') as HTMLSelectElement;
      expect(select.value).toBe('small');
    });

    it('select has value="large" when activeFontSizeKey="large"', () => {
      renderPalette({ selectedTool: 'text', activeFontSizeKey: 'large' });
      const select = screen.getByTestId('annotator-font-size') as HTMLSelectElement;
      expect(select.value).toBe('large');
    });

    it('select has value="xlarge" when activeFontSizeKey="xlarge"', () => {
      renderPalette({ selectedTool: 'text', activeFontSizeKey: 'xlarge' });
      const select = screen.getByTestId('annotator-font-size') as HTMLSelectElement;
      expect(select.value).toBe('xlarge');
    });
  });

  describe('Font-size selector interaction', () => {
    it('changing select to "large" calls onSelectFontSize("large")', () => {
      const onSelectFontSize = jest.fn() as AnyMock;
      renderPalette({ selectedTool: 'text', activeFontSizeKey: 'medium', onSelectFontSize });
      const select = screen.getByTestId('annotator-font-size');
      fireEvent.change(select, { target: { value: 'large' } });
      expect(onSelectFontSize).toHaveBeenCalledWith('large');
    });

    it('changing select to "small" calls onSelectFontSize("small")', () => {
      const onSelectFontSize = jest.fn() as AnyMock;
      renderPalette({ selectedTool: 'text', activeFontSizeKey: 'medium', onSelectFontSize });
      const select = screen.getByTestId('annotator-font-size');
      fireEvent.change(select, { target: { value: 'small' } });
      expect(onSelectFontSize).toHaveBeenCalledWith('small');
    });

    it('changing select to "xlarge" calls onSelectFontSize("xlarge")', () => {
      const onSelectFontSize = jest.fn() as AnyMock;
      renderPalette({ selectedTool: 'text', activeFontSizeKey: 'medium', onSelectFontSize });
      const select = screen.getByTestId('annotator-font-size');
      fireEvent.change(select, { target: { value: 'xlarge' } });
      expect(onSelectFontSize).toHaveBeenCalledWith('xlarge');
    });

    it('changing select to "medium" calls onSelectFontSize("medium")', () => {
      const onSelectFontSize = jest.fn() as AnyMock;
      renderPalette({ selectedTool: 'text', activeFontSizeKey: 'small', onSelectFontSize });
      const select = screen.getByTestId('annotator-font-size');
      fireEvent.change(select, { target: { value: 'medium' } });
      expect(onSelectFontSize).toHaveBeenCalledWith('medium');
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

  // ─── Measurement tool button ──────────────────────────────────────────────

  describe('Measurement tool button', () => {
    it('renders measurement tool button with data-testid="tool-measurement"', () => {
      renderPalette();
      expect(screen.getByTestId('tool-measurement')).toBeInTheDocument();
    });

    it('measurement tool button is not active by default (selectedTool=select)', () => {
      renderPalette({ selectedTool: 'select' });
      expect(screen.getByTestId('tool-measurement')).toHaveAttribute('aria-pressed', 'false');
    });

    it('measurement tool button is active when selectedTool="measurement"', () => {
      renderPalette({ selectedTool: 'measurement' });
      expect(screen.getByTestId('tool-measurement')).toHaveAttribute('aria-pressed', 'true');
    });

    it('clicking measurement tool button calls onSelectTool with "measurement"', () => {
      const onSelectTool = jest.fn() as AnyMock;
      renderPalette({ onSelectTool });
      fireEvent.click(screen.getByTestId('tool-measurement'));
      expect(onSelectTool).toHaveBeenCalledWith('measurement');
    });
  });

  // ─── Freehand tool button ─────────────────────────────────────────────────

  describe('Freehand tool button', () => {
    it('renders freehand tool button with data-testid="tool-freehand"', () => {
      renderPalette();
      expect(screen.getByTestId('tool-freehand')).toBeInTheDocument();
    });

    it('freehand tool button is not active by default (selectedTool=select)', () => {
      renderPalette({ selectedTool: 'select' });
      expect(screen.getByTestId('tool-freehand')).toHaveAttribute('aria-pressed', 'false');
    });

    it('freehand tool button is active when selectedTool="freehand"', () => {
      renderPalette({ selectedTool: 'freehand' });
      expect(screen.getByTestId('tool-freehand')).toHaveAttribute('aria-pressed', 'true');
    });

    it('clicking freehand tool button calls onSelectTool with "freehand"', () => {
      const onSelectTool = jest.fn() as AnyMock;
      renderPalette({ onSelectTool });
      fireEvent.click(screen.getByTestId('tool-freehand'));
      expect(onSelectTool).toHaveBeenCalledWith('freehand');
    });
  });

  // ─── Font-size selector visibility: measurement extends existing tools ────

  describe('Font-size selector visibility — measurement tool', () => {
    it('font-size selector IS visible when selectedTool is "measurement"', () => {
      renderPalette({ selectedTool: 'measurement' });
      expect(screen.getByTestId('annotator-font-size')).toBeInTheDocument();
    });

    it('font-size selector is NOT visible when selectedTool is "freehand"', () => {
      renderPalette({ selectedTool: 'freehand' });
      expect(screen.queryByTestId('annotator-font-size')).not.toBeInTheDocument();
    });

    it('font-size selector remains visible for text tool (not regressed)', () => {
      renderPalette({ selectedTool: 'text' });
      expect(screen.getByTestId('annotator-font-size')).toBeInTheDocument();
    });
  });
});
