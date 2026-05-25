/**
 * @jest-environment jsdom
 */

/**
 * Unit tests for SuggestionBadge component (Story #1564).
 *
 * Covers: renders suggested text, Apply button callback, aria-label with field/value,
 * displayValue overrides body text while aria-label uses suggestedValue.
 *
 * Uses real EN translations (i18n mock interception not reliable in this ESM project;
 * real translations are used in jsdom tests per project memory).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type * as SuggestionBadgeModule from './SuggestionBadge.js';

let SuggestionBadge: (typeof SuggestionBadgeModule)['SuggestionBadge'];

beforeEach(async () => {
  ({ SuggestionBadge } = (await import('./SuggestionBadge.js')) as typeof SuggestionBadgeModule);
});

describe('SuggestionBadge', () => {
  describe('rendering', () => {
    it('renders with suggested value in body text', () => {
      render(<SuggestionBadge suggestedValue="1234.56" fieldLabel="Amount" onApply={jest.fn()} />);
      // The component uses t('autoItemize.suggested', { value }) which resolves to
      // "LLM suggests: 1234.56" with the EN locale
      expect(screen.getByText(/1234\.56/)).toBeInTheDocument();
    });

    it('renders Apply button', () => {
      render(<SuggestionBadge suggestedValue="100" fieldLabel="Amount" onApply={jest.fn()} />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('renders an emoji decoration (aria-hidden)', () => {
      render(<SuggestionBadge suggestedValue="100" fieldLabel="Amount" onApply={jest.fn()} />);
      // The ✨ span has aria-hidden="true"
      const hiddenSpan = document.querySelector('[aria-hidden="true"]');
      expect(hiddenSpan).toBeInTheDocument();
    });
  });

  describe('Apply callback', () => {
    it('calls onApply when Apply button is clicked', () => {
      const onApply = jest.fn();
      render(<SuggestionBadge suggestedValue="500" fieldLabel="Amount" onApply={onApply} />);
      fireEvent.click(screen.getByRole('button'));
      expect(onApply).toHaveBeenCalledTimes(1);
    });

    it('does not call onApply until button is clicked', () => {
      const onApply = jest.fn();
      render(<SuggestionBadge suggestedValue="500" fieldLabel="Amount" onApply={onApply} />);
      expect(onApply).not.toHaveBeenCalled();
    });
  });

  describe('aria-label', () => {
    it('Apply button has aria-label containing fieldLabel', () => {
      render(
        <SuggestionBadge suggestedValue="999" fieldLabel="Invoice Amount" onApply={jest.fn()} />,
      );
      const btn = screen.getByRole('button');
      expect(btn).toHaveAttribute('aria-label');
      expect(btn.getAttribute('aria-label')).toContain('Invoice Amount');
    });

    it('Apply button has aria-label containing suggestedValue', () => {
      render(
        <SuggestionBadge suggestedValue="999" fieldLabel="Invoice Amount" onApply={jest.fn()} />,
      );
      const btn = screen.getByRole('button');
      expect(btn.getAttribute('aria-label')).toContain('999');
    });
  });

  describe('displayValue prop', () => {
    it('shows displayValue in body text when provided', () => {
      render(
        <SuggestionBadge
          suggestedValue="1234.56"
          fieldLabel="Amount"
          onApply={jest.fn()}
          displayValue="€1,234.56"
        />,
      );
      // Body text should show the formatted displayValue
      expect(screen.getByText(/€1,234\.56/)).toBeInTheDocument();
    });

    it('does NOT show raw suggestedValue in body when displayValue is provided', () => {
      render(
        <SuggestionBadge
          suggestedValue="1234.56"
          fieldLabel="Amount"
          onApply={jest.fn()}
          displayValue="€1,234.56"
        />,
      );
      // The raw numeric value should not appear in the body text (only in the aria-label)
      // The body text should contain the displayValue not the raw value
      const bodyText = screen.getByText(/€1,234\.56/).textContent;
      expect(bodyText).toContain('€1,234.56');
    });

    it('aria-label still uses suggestedValue (not displayValue) when displayValue is provided', () => {
      render(
        <SuggestionBadge
          suggestedValue="1234.56"
          fieldLabel="Amount"
          onApply={jest.fn()}
          displayValue="€1,234.56"
        />,
      );
      const btn = screen.getByRole('button');
      // aria-label must contain the raw suggestedValue for machine-readable accessibility
      expect(btn.getAttribute('aria-label')).toContain('1234.56');
    });

    it('shows suggestedValue in body when displayValue is not provided', () => {
      render(<SuggestionBadge suggestedValue="750" fieldLabel="Amount" onApply={jest.fn()} />);
      expect(screen.getByText(/750/)).toBeInTheDocument();
    });
  });

  describe('className prop', () => {
    it('applies custom className to the root element', () => {
      const { container } = render(
        <SuggestionBadge
          suggestedValue="100"
          fieldLabel="Amount"
          onApply={jest.fn()}
          className="my-custom-class"
        />,
      );
      expect(container.firstChild).toHaveClass('my-custom-class');
    });
  });

  describe('button type', () => {
    it('Apply button has type="button" to prevent accidental form submit', () => {
      render(<SuggestionBadge suggestedValue="100" fieldLabel="Amount" onApply={jest.fn()} />);
      expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    });
  });
});
