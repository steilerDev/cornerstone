import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

    it('renders Apply button', () => {
      render(<DateFilter value="" onChange={jest.fn()} />);
      expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument();
    });

    it('does not render Clear button when value is empty', () => {
      render(<DateFilter value="" onChange={jest.fn()} />);
      expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
    });

    it('renders Clear button when value is non-empty', () => {
      render(<DateFilter value="from:2026-01-01" onChange={jest.fn()} />);
      expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
    });
  });

  describe('Apply button', () => {
    it('calls onChange with "from:X,to:Y" when both dates set', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      const { container } = render(<DateFilter value="" onChange={mockOnChange} />);
      const [fromInput, toInput] = container.querySelectorAll('input[type="date"]');
      await user.type(fromInput as HTMLElement, '2026-01-01');
      await user.type(toInput as HTMLElement, '2026-12-31');
      await user.click(screen.getByRole('button', { name: /apply/i }));
      expect(mockOnChange).toHaveBeenCalledWith('from:2026-01-01,to:2026-12-31');
    });

    it('calls onChange with only "from:X" when only from date set', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      const { container } = render(<DateFilter value="" onChange={mockOnChange} />);
      const [fromInput] = container.querySelectorAll('input[type="date"]');
      await user.type(fromInput as HTMLElement, '2026-03-15');
      await user.click(screen.getByRole('button', { name: /apply/i }));
      expect(mockOnChange).toHaveBeenCalledWith('from:2026-03-15');
    });

    it('calls onChange with only "to:Y" when only to date set', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      const { container } = render(<DateFilter value="" onChange={mockOnChange} />);
      const [, toInput] = container.querySelectorAll('input[type="date"]');
      await user.type(toInput as HTMLElement, '2026-06-30');
      await user.click(screen.getByRole('button', { name: /apply/i }));
      expect(mockOnChange).toHaveBeenCalledWith('to:2026-06-30');
    });

    it('calls onChange with empty string when neither date set', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<DateFilter value="" onChange={mockOnChange} />);
      await user.click(screen.getByRole('button', { name: /apply/i }));
      expect(mockOnChange).toHaveBeenCalledWith('');
    });
  });

  describe('Clear button', () => {
    it('calls onChange with empty string and resets inputs', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateFilter value="from:2026-01-01,to:2026-12-31" onChange={mockOnChange} />,
      );
      await user.click(screen.getByRole('button', { name: /clear/i }));
      expect(mockOnChange).toHaveBeenCalledWith('');
      const [fromInput, toInput] = container.querySelectorAll('input[type="date"]');
      expect((fromInput as HTMLInputElement).value).toBe('');
      expect((toInput as HTMLInputElement).value).toBe('');
    });
  });
});
