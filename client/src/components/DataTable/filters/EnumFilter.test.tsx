import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EnumOption } from '../DataTable.js';
import { EnumFilter } from './EnumFilter.js';

const OPTIONS: EnumOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'pending', label: 'Pending' },
];

describe('EnumFilter', () => {
  describe('rendering', () => {
    it('renders a checkbox for each option', () => {
      render(<EnumFilter value="" onChange={jest.fn()} options={OPTIONS} />);
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(3);
    });

    it('renders option labels', () => {
      render(<EnumFilter value="" onChange={jest.fn()} options={OPTIONS} />);
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Inactive')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('pre-checks options that are in the initial value', () => {
      render(<EnumFilter value="active,pending" onChange={jest.fn()} options={OPTIONS} />);
      expect(screen.getByRole('checkbox', { name: 'Active' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Inactive' })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Pending' })).toBeChecked();
    });

    it('does not render an Apply button', () => {
      render(<EnumFilter value="" onChange={jest.fn()} options={OPTIONS} />);
      expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument();
    });

    it('does not render a Clear button', () => {
      render(<EnumFilter value="active" onChange={jest.fn()} options={OPTIONS} />);
      expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
    });

    it('renders Select All quick action button', () => {
      render(<EnumFilter value="" onChange={jest.fn()} options={OPTIONS} />);
      expect(screen.getByRole('button', { name: /select all/i })).toBeInTheDocument();
    });

    it('renders Select None quick action button', () => {
      render(<EnumFilter value="" onChange={jest.fn()} options={OPTIONS} />);
      expect(screen.getByRole('button', { name: /select none/i })).toBeInTheDocument();
    });
  });

  describe('auto-apply on checkbox change', () => {
    it('calls onChange immediately when an unchecked option is checked', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<EnumFilter value="" onChange={mockOnChange} options={OPTIONS} />);
      await user.click(screen.getByRole('checkbox', { name: 'Active' }));
      expect(mockOnChange).toHaveBeenCalledWith('active');
    });

    it('calls onChange immediately when a checked option is unchecked', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<EnumFilter value="active" onChange={mockOnChange} options={OPTIONS} />);
      await user.click(screen.getByRole('checkbox', { name: 'Active' }));
      expect(mockOnChange).toHaveBeenCalledWith('');
    });

    it('calls onChange with comma-separated values when multiple options are selected', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<EnumFilter value="" onChange={mockOnChange} options={OPTIONS} />);
      await user.click(screen.getByRole('checkbox', { name: 'Active' }));
      await user.click(screen.getByRole('checkbox', { name: 'Pending' }));
      // Second call should contain both active and pending
      const lastCallArg = (
        mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1] as [string]
      )[0];
      expect(lastCallArg.split(',')).toEqual(expect.arrayContaining(['active', 'pending']));
      expect(lastCallArg.split(',')).toHaveLength(2);
    });

    it('calls onChange after each individual checkbox click, not batched', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<EnumFilter value="" onChange={mockOnChange} options={OPTIONS} />);
      await user.click(screen.getByRole('checkbox', { name: 'Active' }));
      await user.click(screen.getByRole('checkbox', { name: 'Inactive' }));
      expect(mockOnChange).toHaveBeenCalledTimes(2);
    });

    it('checkbox is visually checked after clicking an unchecked option', async () => {
      const user = userEvent.setup();
      render(<EnumFilter value="" onChange={jest.fn()} options={OPTIONS} />);
      const activeCheckbox = screen.getByRole('checkbox', { name: 'Active' });
      expect(activeCheckbox).not.toBeChecked();
      await user.click(activeCheckbox);
      expect(activeCheckbox).toBeChecked();
    });

    it('checkbox is visually unchecked after clicking a checked option', async () => {
      const user = userEvent.setup();
      render(<EnumFilter value="active" onChange={jest.fn()} options={OPTIONS} />);
      const activeCheckbox = screen.getByRole('checkbox', { name: 'Active' });
      expect(activeCheckbox).toBeChecked();
      await user.click(activeCheckbox);
      expect(activeCheckbox).not.toBeChecked();
    });
  });

  describe('Select All quick action', () => {
    it('calls onChange with all option values when Select All clicked', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<EnumFilter value="" onChange={mockOnChange} options={OPTIONS} />);
      await user.click(screen.getByRole('button', { name: /select all/i }));
      const callArg = (mockOnChange.mock.calls[0] as [string])[0];
      expect(callArg.split(',')).toEqual(expect.arrayContaining(['active', 'inactive', 'pending']));
      expect(callArg.split(',')).toHaveLength(3);
    });

    it('checks all checkboxes when Select All clicked', async () => {
      const user = userEvent.setup();
      render(<EnumFilter value="" onChange={jest.fn()} options={OPTIONS} />);
      await user.click(screen.getByRole('button', { name: /select all/i }));
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach((cb) => expect(cb).toBeChecked());
    });
  });

  describe('Select None quick action', () => {
    it('calls onChange with empty string when Select None clicked', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<EnumFilter value="active,pending" onChange={mockOnChange} options={OPTIONS} />);
      await user.click(screen.getByRole('button', { name: /select none/i }));
      expect(mockOnChange).toHaveBeenCalledWith('');
    });

    it('unchecks all checkboxes when Select None clicked', async () => {
      const user = userEvent.setup();
      render(<EnumFilter value="active,pending" onChange={jest.fn()} options={OPTIONS} />);
      await user.click(screen.getByRole('button', { name: /select none/i }));
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
    });
  });
});
