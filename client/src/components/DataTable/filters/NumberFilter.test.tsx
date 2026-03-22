import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
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

    it('does not render an Apply button', () => {
      render(<NumberFilter value="" onChange={jest.fn()} />);
      expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument();
    });

    it('does not render a Clear button', () => {
      render(<NumberFilter value="min:10" onChange={jest.fn()} />);
      expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
    });
  });

  describe('auto-apply on input change', () => {
    it('calls onChange immediately when min input changes', () => {
      const mockOnChange = jest.fn();
      render(<NumberFilter value="" onChange={mockOnChange} />);
      const [minInput] = screen.getAllByRole('spinbutton');
      fireEvent.change(minInput, { target: { value: '100' } });
      expect(mockOnChange).toHaveBeenCalledWith('min:100');
    });

    it('calls onChange immediately when max input changes', () => {
      const mockOnChange = jest.fn();
      render(<NumberFilter value="" onChange={mockOnChange} />);
      const [, maxInput] = screen.getAllByRole('spinbutton');
      fireEvent.change(maxInput, { target: { value: '500' } });
      expect(mockOnChange).toHaveBeenCalledWith('max:500');
    });

    it('calls onChange with "min:X,max:Y" when both values are set', () => {
      const mockOnChange = jest.fn();
      render(<NumberFilter value="" onChange={mockOnChange} />);
      const [minInput, maxInput] = screen.getAllByRole('spinbutton');
      fireEvent.change(minInput, { target: { value: '100' } });
      mockOnChange.mockClear();
      fireEvent.change(maxInput, { target: { value: '500' } });
      expect(mockOnChange).toHaveBeenCalledWith('min:100,max:500');
    });

    it('calls onChange with empty string when min input is cleared', () => {
      const mockOnChange = jest.fn();
      render(<NumberFilter value="min:100" onChange={mockOnChange} />);
      const [minInput] = screen.getAllByRole('spinbutton');
      fireEvent.change(minInput, { target: { value: '' } });
      expect(mockOnChange).toHaveBeenCalledWith('');
    });

    it('calls onChange without requiring a button click', () => {
      const mockOnChange = jest.fn();
      render(<NumberFilter value="" onChange={mockOnChange} />);
      const [minInput] = screen.getAllByRole('spinbutton');
      fireEvent.change(minInput, { target: { value: '42' } });
      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(mockOnChange).toHaveBeenCalledWith('min:42');
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

  describe('configurable min/max bounds (#1139)', () => {
    it('applies custom min to both number inputs and range sliders', () => {
      const { container } = render(
        <NumberFilter value="" onChange={jest.fn()} min={100} max={10000} />,
      );
      const sliders = container.querySelectorAll('input[type="range"]');
      const spinbuttons = screen.getAllByRole('spinbutton');

      expect(sliders[0]).toHaveAttribute('min', '100');
      expect(sliders[1]).toHaveAttribute('min', '100');
      expect(spinbuttons[0]).toHaveAttribute('min', '100');
      expect(spinbuttons[1]).toHaveAttribute('min', '100');
    });

    it('applies custom max to both number inputs and range sliders', () => {
      const { container } = render(
        <NumberFilter value="" onChange={jest.fn()} min={100} max={10000} />,
      );
      const sliders = container.querySelectorAll('input[type="range"]');
      const spinbuttons = screen.getAllByRole('spinbutton');

      expect(sliders[0]).toHaveAttribute('max', '10000');
      expect(sliders[1]).toHaveAttribute('max', '10000');
      expect(spinbuttons[0]).toHaveAttribute('max', '10000');
      expect(spinbuttons[1]).toHaveAttribute('max', '10000');
    });

    it('uses custom min as placeholder for the min number input', () => {
      render(<NumberFilter value="" onChange={jest.fn()} min={100} max={10000} />);
      const [minInput] = screen.getAllByRole('spinbutton');
      expect(minInput).toHaveAttribute('placeholder', '100');
    });

    it('uses custom max as placeholder for the max number input', () => {
      render(<NumberFilter value="" onChange={jest.fn()} min={100} max={10000} />);
      const [, maxInput] = screen.getAllByRole('spinbutton');
      expect(maxInput).toHaveAttribute('placeholder', '10000');
    });

    it('defaults min to 0 when no min prop is provided', () => {
      const { container } = render(<NumberFilter value="" onChange={jest.fn()} />);
      const sliders = container.querySelectorAll('input[type="range"]');
      const [minInput] = screen.getAllByRole('spinbutton');

      expect(sliders[0]).toHaveAttribute('min', '0');
      expect(minInput).toHaveAttribute('min', '0');
      expect(minInput).toHaveAttribute('placeholder', '0');
    });

    it('defaults max to 999999 when no max prop is provided', () => {
      const { container } = render(<NumberFilter value="" onChange={jest.fn()} />);
      const sliders = container.querySelectorAll('input[type="range"]');
      const [, maxInput] = screen.getAllByRole('spinbutton');

      expect(sliders[1]).toHaveAttribute('max', '999999');
      expect(maxInput).toHaveAttribute('max', '999999');
      expect(maxInput).toHaveAttribute('placeholder', '999999');
    });

    it('applies custom step to both number inputs and range sliders', () => {
      const { container } = render(
        <NumberFilter value="" onChange={jest.fn()} step={0.01} />,
      );
      const sliders = container.querySelectorAll('input[type="range"]');
      const spinbuttons = screen.getAllByRole('spinbutton');

      expect(sliders[0]).toHaveAttribute('step', '0.01');
      expect(sliders[1]).toHaveAttribute('step', '0.01');
      expect(spinbuttons[0]).toHaveAttribute('step', '0.01');
      expect(spinbuttons[1]).toHaveAttribute('step', '0.01');
    });

    it('defaults step to 1 when no step prop is provided', () => {
      const { container } = render(<NumberFilter value="" onChange={jest.fn()} />);
      const sliders = container.querySelectorAll('input[type="range"]');
      const [minInput] = screen.getAllByRole('spinbutton');

      expect(sliders[0]).toHaveAttribute('step', '1');
      expect(minInput).toHaveAttribute('step', '1');
    });
  });
});
