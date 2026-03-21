import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NumberFilter } from './NumberFilter.js';

describe('NumberFilter', () => {
  describe('rendering', () => {
    it('renders min and max number inputs', () => {
      render(<NumberFilter value="" onChange={jest.fn()} />);
      const inputs = screen.getAllByRole('spinbutton');
      expect(inputs).toHaveLength(2);
    });

    it('renders min label', () => {
      render(<NumberFilter value="" onChange={jest.fn()} />);
      expect(screen.getByText(/min/i)).toBeInTheDocument();
    });

    it('renders max label', () => {
      render(<NumberFilter value="" onChange={jest.fn()} />);
      expect(screen.getByText(/max/i)).toBeInTheDocument();
    });

    it('parses existing min value from "min:100,max:500" format', () => {
      render(<NumberFilter value="min:100,max:500" onChange={jest.fn()} />);
      const inputs = screen.getAllByRole('spinbutton');
      expect(inputs[0]).toHaveValue(100);
    });

    it('parses existing max value from "min:100,max:500" format', () => {
      render(<NumberFilter value="min:100,max:500" onChange={jest.fn()} />);
      const inputs = screen.getAllByRole('spinbutton');
      expect(inputs[1]).toHaveValue(500);
    });

    it('initializes with empty inputs when value is empty string', () => {
      render(<NumberFilter value="" onChange={jest.fn()} />);
      const inputs = screen.getAllByRole('spinbutton');
      expect(inputs[0]).toHaveValue(null);
      expect(inputs[1]).toHaveValue(null);
    });

    it('renders Apply button', () => {
      render(<NumberFilter value="" onChange={jest.fn()} />);
      expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument();
    });

    it('does not render Clear button when value is empty', () => {
      render(<NumberFilter value="" onChange={jest.fn()} />);
      expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
    });

    it('renders Clear button when value is non-empty', () => {
      render(<NumberFilter value="min:10" onChange={jest.fn()} />);
      expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
    });
  });

  describe('input interaction', () => {
    it('updates min input as user types', async () => {
      const user = userEvent.setup();
      render(<NumberFilter value="" onChange={jest.fn()} />);
      const [minInput] = screen.getAllByRole('spinbutton');
      await user.clear(minInput);
      await user.type(minInput, '50');
      expect(minInput).toHaveValue(50);
    });

    it('updates max input as user types', async () => {
      const user = userEvent.setup();
      render(<NumberFilter value="" onChange={jest.fn()} />);
      const [, maxInput] = screen.getAllByRole('spinbutton');
      await user.clear(maxInput);
      await user.type(maxInput, '999');
      expect(maxInput).toHaveValue(999);
    });
  });

  describe('Apply button', () => {
    it('calls onChange with "min:X,max:Y" when both values set', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<NumberFilter value="" onChange={mockOnChange} />);
      const [minInput, maxInput] = screen.getAllByRole('spinbutton');
      await user.type(minInput, '100');
      await user.type(maxInput, '500');
      await user.click(screen.getByRole('button', { name: /apply/i }));
      expect(mockOnChange).toHaveBeenCalledWith('min:100,max:500');
    });

    it('calls onChange with only "min:X" when only min set', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<NumberFilter value="" onChange={mockOnChange} />);
      const [minInput] = screen.getAllByRole('spinbutton');
      await user.type(minInput, '100');
      await user.click(screen.getByRole('button', { name: /apply/i }));
      expect(mockOnChange).toHaveBeenCalledWith('min:100');
    });

    it('calls onChange with only "max:Y" when only max set', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<NumberFilter value="" onChange={mockOnChange} />);
      const [, maxInput] = screen.getAllByRole('spinbutton');
      await user.type(maxInput, '300');
      await user.click(screen.getByRole('button', { name: /apply/i }));
      expect(mockOnChange).toHaveBeenCalledWith('max:300');
    });

    it('calls onChange with empty string when neither min nor max set', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<NumberFilter value="" onChange={mockOnChange} />);
      await user.click(screen.getByRole('button', { name: /apply/i }));
      expect(mockOnChange).toHaveBeenCalledWith('');
    });
  });

  describe('Clear button', () => {
    it('calls onChange with empty string and resets inputs', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<NumberFilter value="min:100,max:500" onChange={mockOnChange} />);
      await user.click(screen.getByRole('button', { name: /clear/i }));
      expect(mockOnChange).toHaveBeenCalledWith('');
      const inputs = screen.getAllByRole('spinbutton');
      expect(inputs[0]).toHaveValue(null);
      expect(inputs[1]).toHaveValue(null);
    });
  });
});
