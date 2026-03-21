import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateFilter } from './DateFilter.js';

describe('DateFilter', () => {
  describe('rendering', () => {
    it('renders from and to date inputs', () => {
      render(<DateFilter value="" onChange={jest.fn()} />);
      // date inputs don't have a specific role in all implementations; check by label text
      expect(screen.getByText(/from/i)).toBeInTheDocument();
      expect(screen.getByText(/to/i)).toBeInTheDocument();
    });

    it('renders two date-type inputs', () => {
      const { container } = render(<DateFilter value="" onChange={jest.fn()} />);
      const dateInputs = container.querySelectorAll('input[type="date"]');
      expect(dateInputs).toHaveLength(2);
    });

    it('parses "from" value from "from:2026-01-01,to:2026-12-31" format', () => {
      const { container } = render(
        <DateFilter value="from:2026-01-01,to:2026-12-31" onChange={jest.fn()} />,
      );
      const [fromInput] = container.querySelectorAll('input[type="date"]');
      expect((fromInput as HTMLInputElement).value).toBe('2026-01-01');
    });

    it('parses "to" value from "from:2026-01-01,to:2026-12-31" format', () => {
      const { container } = render(
        <DateFilter value="from:2026-01-01,to:2026-12-31" onChange={jest.fn()} />,
      );
      const [, toInput] = container.querySelectorAll('input[type="date"]');
      expect((toInput as HTMLInputElement).value).toBe('2026-12-31');
    });

    it('renders with empty inputs when value is empty', () => {
      const { container } = render(<DateFilter value="" onChange={jest.fn()} />);
      const [fromInput, toInput] = container.querySelectorAll('input[type="date"]');
      expect((fromInput as HTMLInputElement).value).toBe('');
      expect((toInput as HTMLInputElement).value).toBe('');
    });

    it('does not render Apply button', () => {
      render(<DateFilter value="" onChange={jest.fn()} />);
      expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument();
    });

    it('does not render Clear button', () => {
      render(<DateFilter value="from:2026-01-01" onChange={jest.fn()} />);
      expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
    });
  });

  describe('auto-apply on change', () => {
    it('calls onChange with "from:X,to:Y" when both dates are set via input changes', () => {
      const mockOnChange = jest.fn();
      const { container } = render(<DateFilter value="" onChange={mockOnChange} />);
      const [fromInput, toInput] = container.querySelectorAll('input[type="date"]');

      fireEvent.change(fromInput, { target: { value: '2026-01-01' } });
      expect(mockOnChange).toHaveBeenCalledWith('from:2026-01-01');

      mockOnChange.mockClear();
      fireEvent.change(toInput, { target: { value: '2026-12-31' } });
      expect(mockOnChange).toHaveBeenCalledWith('from:2026-01-01,to:2026-12-31');
    });

    it('calls onChange with only "from:X" when only from date is set', () => {
      const mockOnChange = jest.fn();
      const { container } = render(<DateFilter value="" onChange={mockOnChange} />);
      const [fromInput] = container.querySelectorAll('input[type="date"]');
      fireEvent.change(fromInput, { target: { value: '2026-03-15' } });
      expect(mockOnChange).toHaveBeenCalledWith('from:2026-03-15');
    });

    it('calls onChange with only "to:Y" when only to date is set', () => {
      const mockOnChange = jest.fn();
      const { container } = render(<DateFilter value="" onChange={mockOnChange} />);
      const [, toInput] = container.querySelectorAll('input[type="date"]');
      fireEvent.change(toInput, { target: { value: '2026-06-30' } });
      expect(mockOnChange).toHaveBeenCalledWith('to:2026-06-30');
    });

    it('calls onChange with empty string when from date is cleared', () => {
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateFilter value="from:2026-01-01" onChange={mockOnChange} />,
      );
      const [fromInput] = container.querySelectorAll('input[type="date"]');
      fireEvent.change(fromInput, { target: { value: '' } });
      expect(mockOnChange).toHaveBeenCalledWith('');
    });

    it('calls onChange immediately on each input change without requiring a button click', () => {
      const mockOnChange = jest.fn();
      const { container } = render(<DateFilter value="" onChange={mockOnChange} />);
      const [fromInput] = container.querySelectorAll('input[type="date"]');
      fireEvent.change(fromInput, { target: { value: '2026-05-01' } });
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });
  });
});
