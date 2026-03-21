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

    it('renders Apply button', () => {
      render(<EnumFilter value="" onChange={jest.fn()} options={OPTIONS} />);
      expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument();
    });

    it('does not render Clear button when value is empty', () => {
      render(<EnumFilter value="" onChange={jest.fn()} options={OPTIONS} />);
      expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
    });

    it('renders Clear button when value is non-empty', () => {
      render(<EnumFilter value="active" onChange={jest.fn()} options={OPTIONS} />);
      expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
    });
  });

  describe('checkbox interaction', () => {
    it('clicking an unchecked option checks it', async () => {
      const user = userEvent.setup();
      render(<EnumFilter value="" onChange={jest.fn()} options={OPTIONS} />);
      const activeCheckbox = screen.getByRole('checkbox', { name: 'Active' });
      expect(activeCheckbox).not.toBeChecked();
      await user.click(activeCheckbox);
      expect(activeCheckbox).toBeChecked();
    });

    it('clicking a checked option unchecks it', async () => {
      const user = userEvent.setup();
      render(<EnumFilter value="active" onChange={jest.fn()} options={OPTIONS} />);
      const activeCheckbox = screen.getByRole('checkbox', { name: 'Active' });
      expect(activeCheckbox).toBeChecked();
      await user.click(activeCheckbox);
      expect(activeCheckbox).not.toBeChecked();
    });

    it('does not call onChange immediately on checkbox click (only on apply)', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<EnumFilter value="" onChange={mockOnChange} options={OPTIONS} />);
      await user.click(screen.getByRole('checkbox', { name: 'Active' }));
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe('Apply button', () => {
    it('calls onChange with comma-separated selected values', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<EnumFilter value="" onChange={mockOnChange} options={OPTIONS} />);
      await user.click(screen.getByRole('checkbox', { name: 'Active' }));
      await user.click(screen.getByRole('checkbox', { name: 'Pending' }));
      await user.click(screen.getByRole('button', { name: /apply/i }));
      // The order depends on Set iteration order (insertion order)
      const callArg = (mockOnChange.mock.calls[0] as [string])[0];
      expect(callArg.split(',')).toEqual(expect.arrayContaining(['active', 'pending']));
      expect(callArg.split(',')).toHaveLength(2);
    });

    it('calls onChange with empty string when no options checked', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<EnumFilter value="" onChange={mockOnChange} options={OPTIONS} />);
      await user.click(screen.getByRole('button', { name: /apply/i }));
      expect(mockOnChange).toHaveBeenCalledWith('');
    });

    it('includes pre-selected and newly added values on apply', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<EnumFilter value="active" onChange={mockOnChange} options={OPTIONS} />);
      await user.click(screen.getByRole('checkbox', { name: 'Inactive' }));
      await user.click(screen.getByRole('button', { name: /apply/i }));
      const callArg = (mockOnChange.mock.calls[0] as [string])[0];
      expect(callArg.split(',')).toEqual(expect.arrayContaining(['active', 'inactive']));
    });
  });

  describe('Clear button', () => {
    it('calls onChange with empty string', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<EnumFilter value="active,pending" onChange={mockOnChange} options={OPTIONS} />);
      await user.click(screen.getByRole('button', { name: /clear/i }));
      expect(mockOnChange).toHaveBeenCalledWith('');
    });

    it('unchecks all checkboxes after clear', async () => {
      const user = userEvent.setup();
      render(<EnumFilter value="active,pending" onChange={jest.fn()} options={OPTIONS} />);
      await user.click(screen.getByRole('button', { name: /clear/i }));
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
    });
  });
});
