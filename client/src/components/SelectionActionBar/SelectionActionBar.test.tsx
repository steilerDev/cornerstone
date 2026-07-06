/**
 * @jest-environment jsdom
 *
 * Unit tests for SelectionActionBar (Story #1797 — shared selection action bar).
 *
 * Covers:
 * - Renders countLabel and clearLabel
 * - Clear button calls onClear
 * - Renders children (primary action buttons) inside the actions area
 * - Applies extra className when provided
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import { SelectionActionBar } from './SelectionActionBar.js';

describe('SelectionActionBar', () => {
  it('renders the countLabel text', () => {
    render(
      <SelectionActionBar countLabel="2 selected" onClear={jest.fn()} clearLabel="Clear selection">
        <button type="button">Merge</button>
      </SelectionActionBar>,
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('renders a "Clear selection" button with the clearLabel text', () => {
    render(
      <SelectionActionBar countLabel="2 selected" onClear={jest.fn()} clearLabel="Clear selection">
        <button type="button">Merge</button>
      </SelectionActionBar>,
    );
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
  });

  it('calls onClear when the clear button is clicked', () => {
    const onClear = jest.fn();
    render(
      <SelectionActionBar countLabel="2 selected" onClear={onClear} clearLabel="Clear selection">
        <button type="button">Merge</button>
      </SelectionActionBar>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('renders children (primary action buttons) inside the bar', () => {
    render(
      <SelectionActionBar countLabel="2 selected" onClear={jest.fn()} clearLabel="Clear selection">
        <button type="button">Merge</button>
      </SelectionActionBar>,
    );
    expect(screen.getByRole('button', { name: 'Merge' })).toBeInTheDocument();
  });

  it('renders multiple children when passed as a fragment', () => {
    render(
      <SelectionActionBar countLabel="3 selected" onClear={jest.fn()} clearLabel="Clear selection">
        <button type="button">Merge</button>
        <span>Extra hint</span>
      </SelectionActionBar>,
    );
    expect(screen.getByRole('button', { name: 'Merge' })).toBeInTheDocument();
    expect(screen.getByText('Extra hint')).toBeInTheDocument();
  });

  it('applies an extra className when provided', () => {
    const { container } = render(
      <SelectionActionBar
        countLabel="2 selected"
        onClear={jest.fn()}
        clearLabel="Clear selection"
        className="extra-class"
      >
        <button type="button">Merge</button>
      </SelectionActionBar>,
    );
    const bar = container.firstElementChild;
    expect(bar?.getAttribute('class') ?? '').toContain('extra-class');
  });

  it('does not throw when className is omitted', () => {
    expect(() =>
      render(
        <SelectionActionBar countLabel="1 selected" onClear={jest.fn()} clearLabel="Clear">
          <button type="button">Merge</button>
        </SelectionActionBar>,
      ),
    ).not.toThrow();
  });
});
