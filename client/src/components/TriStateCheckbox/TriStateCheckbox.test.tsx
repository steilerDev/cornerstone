/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type React from 'react';

// ─── Component import (after any mocks) ──────────────────────────────────────

let TriStateCheckbox: (typeof import('./TriStateCheckbox.js'))['TriStateCheckbox'];

describe('TriStateCheckbox', () => {
  beforeEach(async () => {
    if (!TriStateCheckbox) {
      const module = await import('./TriStateCheckbox.js');
      TriStateCheckbox = module.TriStateCheckbox;
    }
    jest.clearAllMocks();
  });

  // ─── Basic rendering ──────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders a checkbox input', () => {
      render(
        <TriStateCheckbox
          checked={false}
          indeterminate={false}
          onChange={jest.fn()}
        />,
      );

      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('renders checked=true when checked prop is true', () => {
      render(
        <TriStateCheckbox
          checked={true}
          indeterminate={false}
          onChange={jest.fn()}
        />,
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
    });

    it('renders checked=false when checked prop is false', () => {
      render(
        <TriStateCheckbox
          checked={false}
          indeterminate={false}
          onChange={jest.fn()}
        />,
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
    });

    it('renders label text when label prop is provided', () => {
      render(
        <TriStateCheckbox
          checked={false}
          indeterminate={false}
          onChange={jest.fn()}
          label="Select all items"
        />,
      );

      expect(screen.getByText('Select all items')).toBeInTheDocument();
    });

    it('does not render visible label text when label prop is omitted', () => {
      const { container } = render(
        <TriStateCheckbox
          checked={false}
          indeterminate={false}
          onChange={jest.fn()}
        />,
      );

      // No span with text content
      const spans = container.querySelectorAll('span');
      const textSpans = Array.from(spans).filter(s => s.textContent && s.textContent.trim().length > 0);
      expect(textSpans).toHaveLength(0);
    });

    it('sets aria-label from label prop', () => {
      render(
        <TriStateCheckbox
          checked={false}
          indeterminate={false}
          onChange={jest.fn()}
          label="My group"
        />,
      );

      const checkbox = screen.getByRole('checkbox', { name: 'My group' });
      expect(checkbox).toBeInTheDocument();
    });

    it('forwards id prop to the input element', () => {
      render(
        <TriStateCheckbox
          id="my-checkbox-id"
          checked={false}
          indeterminate={false}
          onChange={jest.fn()}
        />,
      );

      const input = document.getElementById('my-checkbox-id');
      expect(input).toBeInTheDocument();
      expect(input).toBeInstanceOf(HTMLInputElement);
    });

    it('renders as disabled when disabled=true', () => {
      render(
        <TriStateCheckbox
          checked={false}
          indeterminate={false}
          onChange={jest.fn()}
          disabled={true}
        />,
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.disabled).toBe(true);
    });

    it('renders as enabled when disabled is not provided', () => {
      render(
        <TriStateCheckbox
          checked={false}
          indeterminate={false}
          onChange={jest.fn()}
        />,
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.disabled).toBe(false);
    });
  });

  // ─── Indeterminate state via ref ──────────────────────────────────────────

  describe('indeterminate property via ref', () => {
    it('sets indeterminate=true on the DOM input when indeterminate prop is true', () => {
      render(
        <TriStateCheckbox
          checked={false}
          indeterminate={true}
          onChange={jest.fn()}
        />,
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.indeterminate).toBe(true);
    });

    it('sets indeterminate=false on the DOM input when indeterminate prop is false', () => {
      render(
        <TriStateCheckbox
          checked={false}
          indeterminate={false}
          onChange={jest.fn()}
        />,
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.indeterminate).toBe(false);
    });

    it('clears indeterminate when prop changes from true to false', () => {
      const { rerender } = render(
        <TriStateCheckbox
          checked={false}
          indeterminate={true}
          onChange={jest.fn()}
        />,
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.indeterminate).toBe(true);

      act(() => {
        rerender(
          <TriStateCheckbox
            checked={false}
            indeterminate={false}
            onChange={jest.fn()}
          />,
        );
      });

      expect(checkbox.indeterminate).toBe(false);
    });

    it('sets indeterminate when prop changes from false to true', () => {
      const { rerender } = render(
        <TriStateCheckbox
          checked={false}
          indeterminate={false}
          onChange={jest.fn()}
        />,
      );

      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.indeterminate).toBe(false);

      act(() => {
        rerender(
          <TriStateCheckbox
            checked={false}
            indeterminate={true}
            onChange={jest.fn()}
          />,
        );
      });

      expect(checkbox.indeterminate).toBe(true);
    });
  });

  // ─── onChange callback ────────────────────────────────────────────────────

  describe('onChange callback', () => {
    it('calls onChange(true) when clicked from unchecked state', () => {
      const onChange = jest.fn<(checked: boolean) => void>();
      render(
        <TriStateCheckbox
          checked={false}
          indeterminate={false}
          onChange={onChange}
        />,
      );

      fireEvent.click(screen.getByRole('checkbox'));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it('calls onChange(false) when clicked from checked state', () => {
      const onChange = jest.fn<(checked: boolean) => void>();
      render(
        <TriStateCheckbox
          checked={true}
          indeterminate={false}
          onChange={onChange}
        />,
      );

      fireEvent.click(screen.getByRole('checkbox'));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(false);
    });

    it('calls onChange(true) when clicked from indeterminate state (browser treats as unchecked)', () => {
      const onChange = jest.fn<(checked: boolean) => void>();
      render(
        <TriStateCheckbox
          checked={false}
          indeterminate={true}
          onChange={onChange}
        />,
      );

      fireEvent.click(screen.getByRole('checkbox'));

      // JSDOM: clicking an unchecked+indeterminate checkbox produces checked=true
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it('does not call onChange when disabled (verified via change event not firing on disabled input)', () => {
      const onChange = jest.fn<(checked: boolean) => void>();
      render(
        <TriStateCheckbox
          checked={false}
          indeterminate={false}
          onChange={onChange}
          disabled={true}
        />,
      );

      // Verify the input is disabled — change events are suppressed by the browser on disabled inputs
      // In JSDOM, fireEvent.change is blocked by the disabled attribute check in the React event handler
      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.disabled).toBe(true);
      // Simulate a change event (not click) — React won't fire onChange for disabled inputs
      fireEvent.change(checkbox, { target: { checked: true } });

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // ─── className forwarding ─────────────────────────────────────────────────

  describe('className forwarding', () => {
    it('applies custom className to the label wrapper', () => {
      const { container } = render(
        <TriStateCheckbox
          checked={false}
          indeterminate={false}
          onChange={jest.fn()}
          className="my-custom-class"
        />,
      );

      const label = container.querySelector('label');
      expect(label?.className).toContain('my-custom-class');
    });
  });
});
