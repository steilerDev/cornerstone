import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

    it('renders Apply button', () => {
      render(<StringFilter value="" onChange={jest.fn()} />);
      expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument();
    });

    it('does not render Clear button when value is empty', () => {
      render(<StringFilter value="" onChange={jest.fn()} />);
      expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
    });

    it('renders Clear button when value is non-empty', () => {
      render(<StringFilter value="test" onChange={jest.fn()} />);
      expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
    });
  });

  describe('input interaction', () => {
    it('updates input value as user types', async () => {
      const user = userEvent.setup();
      render(<StringFilter value="" onChange={jest.fn()} />);
      const input = screen.getByRole('textbox');
      await user.type(input, 'abc');
      expect(input).toHaveValue('abc');
    });

    it('does not call onChange while typing (only on apply)', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<StringFilter value="" onChange={mockOnChange} />);
      await user.type(screen.getByRole('textbox'), 'abc');
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe('Apply button', () => {
    it('calls onChange with current input value when Apply clicked', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<StringFilter value="" onChange={mockOnChange} />);
      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'foo bar');
      await user.click(screen.getByRole('button', { name: /apply/i }));
      expect(mockOnChange).toHaveBeenCalledWith('foo bar');
    });

    it('calls onChange when Enter key pressed in input', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<StringFilter value="" onChange={mockOnChange} />);
      const input = screen.getByRole('textbox');
      await user.type(input, 'search term{Enter}');
      expect(mockOnChange).toHaveBeenCalledWith('search term');
    });
  });

  describe('Clear button', () => {
    it('calls onChange with empty string when Clear clicked', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<StringFilter value="existing" onChange={mockOnChange} />);
      await user.click(screen.getByRole('button', { name: /clear/i }));
      expect(mockOnChange).toHaveBeenCalledWith('');
    });

    it('resets input to empty after Clear clicked', async () => {
      const user = userEvent.setup();
      render(<StringFilter value="existing" onChange={jest.fn()} />);
      await user.click(screen.getByRole('button', { name: /clear/i }));
      expect(screen.getByRole('textbox')).toHaveValue('');
    });
  });
});
