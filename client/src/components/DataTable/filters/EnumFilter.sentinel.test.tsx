import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EnumOption } from '../DataTable.js';
import { EnumFilter, ENUM_NONE_SENTINEL } from './EnumFilter.js';

/**
 * Unit tests for the __none__ sentinel row in EnumFilter.
 *
 * Story #1277 — No Area sentinel filter.
 * Covers rendering, interaction, aria attributes, Select All/None behaviour.
 */

const OPTIONS: EnumOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'pending', label: 'Pending' },
];

const NONE_LABEL = 'No Area';
const NONE_DESCRIPTION = 'Items with no area assigned';

describe('EnumFilter — sentinel row', () => {
  // ─── Scenario 1: enumIncludeNone=false / undefined → no sentinel rendered ───

  describe('sentinel not rendered when enumIncludeNone is falsy', () => {
    it('does not render sentinel row when enumIncludeNone is not set', () => {
      render(<EnumFilter value="" onChange={jest.fn()} options={OPTIONS} />);
      expect(screen.queryByRole('checkbox', { name: /no area/i })).not.toBeInTheDocument();
    });

    it('does not render sentinel row when enumIncludeNone=false', () => {
      render(
        <EnumFilter
          value=""
          onChange={jest.fn()}
          options={OPTIONS}
          enumIncludeNone={false}
          enumNoneLabel={NONE_LABEL}
        />,
      );
      expect(screen.queryByText(NONE_LABEL)).not.toBeInTheDocument();
    });

    it('does not render sentinel row when enumIncludeNone=true but enumNoneLabel is missing', () => {
      // The component guards: `enumIncludeNone && enumNoneLabel` — label is required
      render(
        <EnumFilter
          value=""
          onChange={jest.fn()}
          options={OPTIONS}
          enumIncludeNone={true}
          enumNoneLabel={undefined}
        />,
      );
      // Only the 3 option checkboxes should exist
      expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    });

    it('total checkbox count equals option count when sentinel is absent', () => {
      render(<EnumFilter value="" onChange={jest.fn()} options={OPTIONS} />);
      expect(screen.getAllByRole('checkbox')).toHaveLength(OPTIONS.length);
    });
  });

  // ─── Scenario 2: Sentinel rendered with enumIncludeNone=true ────────────────

  describe('sentinel rendered when enumIncludeNone=true and label provided', () => {
    it('renders the sentinel checkbox when enumIncludeNone=true and enumNoneLabel set', () => {
      render(
        <EnumFilter
          value=""
          onChange={jest.fn()}
          options={OPTIONS}
          enumIncludeNone={true}
          enumNoneLabel={NONE_LABEL}
        />,
      );
      expect(screen.getByRole('checkbox', { name: NONE_LABEL })).toBeInTheDocument();
    });

    it('sentinel checkbox has id="enum-__none__"', () => {
      render(
        <EnumFilter
          value=""
          onChange={jest.fn()}
          options={OPTIONS}
          enumIncludeNone={true}
          enumNoneLabel={NONE_LABEL}
        />,
      );
      // The label element links via htmlFor="enum-__none__"
      const sentinel = document.getElementById(`enum-${ENUM_NONE_SENTINEL}`);
      expect(sentinel).not.toBeNull();
      expect(sentinel?.tagName).toBe('INPUT');
      expect(sentinel).toHaveAttribute('type', 'checkbox');
    });

    it('total checkbox count is options.length + 1 (sentinel included)', () => {
      render(
        <EnumFilter
          value=""
          onChange={jest.fn()}
          options={OPTIONS}
          enumIncludeNone={true}
          enumNoneLabel={NONE_LABEL}
        />,
      );
      expect(screen.getAllByRole('checkbox')).toHaveLength(OPTIONS.length + 1);
    });
  });

  // ─── Scenario 3: aria-label = enumNoneDescription when provided ─────────────

  it('sentinel checkbox aria-label equals enumNoneDescription when provided', () => {
    render(
      <EnumFilter
        value=""
        onChange={jest.fn()}
        options={OPTIONS}
        enumIncludeNone={true}
        enumNoneLabel={NONE_LABEL}
        enumNoneDescription={NONE_DESCRIPTION}
      />,
    );
    const sentinel = screen.getByRole('checkbox', { name: NONE_DESCRIPTION });
    expect(sentinel).toBeInTheDocument();
  });

  // ─── Scenario 4: aria-label = enumNoneLabel when description not provided ───

  it('sentinel checkbox aria-label falls back to enumNoneLabel when enumNoneDescription is absent', () => {
    render(
      <EnumFilter
        value=""
        onChange={jest.fn()}
        options={OPTIONS}
        enumIncludeNone={true}
        enumNoneLabel={NONE_LABEL}
      />,
    );
    const sentinel = screen.getByRole('checkbox', { name: NONE_LABEL });
    expect(sentinel).toBeInTheDocument();
  });

  // ─── Scenario 5: Sentinel label text visible in DOM ─────────────────────────

  it('sentinel label text is visible in the DOM', () => {
    render(
      <EnumFilter
        value=""
        onChange={jest.fn()}
        options={OPTIONS}
        enumIncludeNone={true}
        enumNoneLabel={NONE_LABEL}
      />,
    );
    expect(screen.getByText(NONE_LABEL)).toBeInTheDocument();
  });

  // ─── Scenario 6: Selecting sentinel alone → onChange("__none__") ─────────────

  it('clicking unchecked sentinel calls onChange with "__none__"', async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();
    render(
      <EnumFilter
        value=""
        onChange={mockOnChange}
        options={OPTIONS}
        enumIncludeNone={true}
        enumNoneLabel={NONE_LABEL}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: NONE_LABEL }));
    expect(mockOnChange).toHaveBeenCalledWith('__none__');
  });

  // ─── Scenario 7: Selecting sentinel + option → value contains both ───────────

  it('selecting sentinel then an option produces onChange value containing both', async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();
    render(
      <EnumFilter
        value=""
        onChange={mockOnChange}
        options={OPTIONS}
        enumIncludeNone={true}
        enumNoneLabel={NONE_LABEL}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: NONE_LABEL }));
    await user.click(screen.getByRole('checkbox', { name: 'Active' }));

    const lastCall = (mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1] as [string])[0];
    const parts = lastCall.split(',');
    expect(parts).toContain(ENUM_NONE_SENTINEL);
    expect(parts).toContain('active');
    expect(parts).toHaveLength(2);
  });

  it('selecting an option then sentinel produces onChange value containing both', async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();
    render(
      <EnumFilter
        value=""
        onChange={mockOnChange}
        options={OPTIONS}
        enumIncludeNone={true}
        enumNoneLabel={NONE_LABEL}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Active' }));
    await user.click(screen.getByRole('checkbox', { name: NONE_LABEL }));

    const lastCall = (mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1] as [string])[0];
    const parts = lastCall.split(',');
    expect(parts).toContain(ENUM_NONE_SENTINEL);
    expect(parts).toContain('active');
    expect(parts).toHaveLength(2);
  });

  // ─── Scenario 8: Unselecting sentinel removes __none__, preserves others ─────

  it('unselecting the sentinel removes __none__ but preserves other selected values', async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();
    render(
      <EnumFilter
        value={`${ENUM_NONE_SENTINEL},active`}
        onChange={mockOnChange}
        options={OPTIONS}
        enumIncludeNone={true}
        enumNoneLabel={NONE_LABEL}
      />,
    );

    // Sentinel should be checked initially
    expect(screen.getByRole('checkbox', { name: NONE_LABEL })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Active' })).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: NONE_LABEL }));

    const lastCall = (mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1] as [string])[0];
    expect(lastCall).not.toContain(ENUM_NONE_SENTINEL);
    expect(lastCall).toContain('active');
  });

  // ─── Scenario 9: Select All does NOT include __none__ ────────────────────────

  it('clicking Select All does not include __none__ in the onChange value', async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();
    render(
      <EnumFilter
        value=""
        onChange={mockOnChange}
        options={OPTIONS}
        enumIncludeNone={true}
        enumNoneLabel={NONE_LABEL}
      />,
    );

    await user.click(screen.getByRole('button', { name: /select all/i }));

    const callArg = (mockOnChange.mock.calls[0] as [string])[0];
    expect(callArg).not.toContain(ENUM_NONE_SENTINEL);
    // Should contain all regular option values
    const parts = callArg.split(',');
    expect(parts).toContain('active');
    expect(parts).toContain('inactive');
    expect(parts).toContain('pending');
  });

  it('clicking Select All does not check the sentinel checkbox', async () => {
    const user = userEvent.setup();
    render(
      <EnumFilter
        value=""
        onChange={jest.fn()}
        options={OPTIONS}
        enumIncludeNone={true}
        enumNoneLabel={NONE_LABEL}
      />,
    );

    await user.click(screen.getByRole('button', { name: /select all/i }));

    expect(screen.getByRole('checkbox', { name: NONE_LABEL })).not.toBeChecked();
  });

  // ─── Scenario 10: Select None clears everything including sentinel ────────────

  it('clicking Select None calls onChange with empty string (clears all including sentinel)', async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();
    render(
      <EnumFilter
        value={`${ENUM_NONE_SENTINEL},active,pending`}
        onChange={mockOnChange}
        options={OPTIONS}
        enumIncludeNone={true}
        enumNoneLabel={NONE_LABEL}
      />,
    );

    await user.click(screen.getByRole('button', { name: /select none/i }));

    expect(mockOnChange).toHaveBeenCalledWith('');
  });

  it('clicking Select None unchecks sentinel when it was checked', async () => {
    const user = userEvent.setup();
    render(
      <EnumFilter
        value={`${ENUM_NONE_SENTINEL},active`}
        onChange={jest.fn()}
        options={OPTIONS}
        enumIncludeNone={true}
        enumNoneLabel={NONE_LABEL}
      />,
    );

    expect(screen.getByRole('checkbox', { name: NONE_LABEL })).toBeChecked();

    await user.click(screen.getByRole('button', { name: /select none/i }));

    expect(screen.getByRole('checkbox', { name: NONE_LABEL })).not.toBeChecked();
  });

  // ─── Scenario 11: Initial value="__none__" → sentinel appears checked ────────

  it('sentinel checkbox is checked when initial value is "__none__"', () => {
    render(
      <EnumFilter
        value="__none__"
        onChange={jest.fn()}
        options={OPTIONS}
        enumIncludeNone={true}
        enumNoneLabel={NONE_LABEL}
      />,
    );
    expect(screen.getByRole('checkbox', { name: NONE_LABEL })).toBeChecked();
    // Regular options should be unchecked
    expect(screen.getByRole('checkbox', { name: 'Active' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Inactive' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Pending' })).not.toBeChecked();
  });

  // ─── Scenario 12: Initial value="__none__,active" → both sentinel + "active" checked

  it('sentinel and "active" are both checked when initial value is "__none__,active"', () => {
    render(
      <EnumFilter
        value={`${ENUM_NONE_SENTINEL},active`}
        onChange={jest.fn()}
        options={OPTIONS}
        enumIncludeNone={true}
        enumNoneLabel={NONE_LABEL}
      />,
    );
    expect(screen.getByRole('checkbox', { name: NONE_LABEL })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Active' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Inactive' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Pending' })).not.toBeChecked();
  });

  it('initial value "active,__none__" (sentinel last) checks both sentinel and "active"', () => {
    render(
      <EnumFilter
        value={`active,${ENUM_NONE_SENTINEL}`}
        onChange={jest.fn()}
        options={OPTIONS}
        enumIncludeNone={true}
        enumNoneLabel={NONE_LABEL}
      />,
    );
    expect(screen.getByRole('checkbox', { name: NONE_LABEL })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Active' })).toBeChecked();
  });

  // ─── ENUM_NONE_SENTINEL constant is correct ───────────────────────────────────

  it('ENUM_NONE_SENTINEL export equals "__none__"', () => {
    expect(ENUM_NONE_SENTINEL).toBe('__none__');
  });
});
