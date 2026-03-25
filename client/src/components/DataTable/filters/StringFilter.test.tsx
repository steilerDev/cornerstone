import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { StringFilter } from './StringFilter.js';

describe('StringFilter', () => {
  describe('rendering', () => {
    it('renders a text input with the given initial value', () => {
      render(<StringFilter value="hello" onChange={jest.fn()} />);
      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('hello');
    });

    it('renders with empty value when no initial value provided', () => {
      render(<StringFilter value="" onChange={jest.fn()} />);
      expect(screen.getByRole('textbox')).toHaveValue('');
    });

    it('renders with custom placeholder when provided', () => {
      render(<StringFilter value="" onChange={jest.fn()} placeholder="Search names..." />);
      expect(screen.getByPlaceholderText('Search names...')).toBeInTheDocument();
    });

    it('does not render an Apply button', () => {
      render(<StringFilter value="" onChange={jest.fn()} />);
      expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument();
    });

    it('does not render a Clear button', () => {
      render(<StringFilter value="test" onChange={jest.fn()} />);
      expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
    });
  });

  describe('auto-apply on change', () => {
    it('calls onChange immediately when input value changes', () => {
      const mockOnChange = jest.fn();
      render(<StringFilter value="" onChange={mockOnChange} />);
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'foo' } });
      expect(mockOnChange).toHaveBeenCalledWith('foo');
    });

    it('calls onChange on each keystroke without requiring a button click', () => {
      const mockOnChange = jest.fn();
      render(<StringFilter value="" onChange={mockOnChange} />);
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'a' } });
      fireEvent.change(input, { target: { value: 'ab' } });
      fireEvent.change(input, { target: { value: 'abc' } });
      expect(mockOnChange).toHaveBeenCalledTimes(3);
      expect(mockOnChange).toHaveBeenLastCalledWith('abc');
    });

    it('calls onChange with empty string when input is cleared', () => {
      const mockOnChange = jest.fn();
      render(<StringFilter value="existing" onChange={mockOnChange} />);
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '' } });
      expect(mockOnChange).toHaveBeenCalledWith('');
    });

    it('calls onChange with the full current input value on change', () => {
      const mockOnChange = jest.fn();
      render(<StringFilter value="" onChange={mockOnChange} />);
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'foo bar' } });
      expect(mockOnChange).toHaveBeenCalledWith('foo bar');
    });
  });
});
