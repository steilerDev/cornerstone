import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BooleanFilter } from './BooleanFilter.js';

describe('BooleanFilter', () => {
  describe('rendering', () => {
    it('renders All, Yes, and No buttons', () => {
      render(<BooleanFilter value="" onChange={jest.fn()} />);
      expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /yes/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /no/i })).toBeInTheDocument();
    });

    it('renders buttons in a group with aria-label', () => {
      render(<BooleanFilter value="" onChange={jest.fn()} />);
      expect(screen.getByRole('group')).toBeInTheDocument();
    });
  });

  describe('aria-pressed state', () => {
    it('All button has aria-pressed="true" when value is empty string', () => {
      render(<BooleanFilter value="" onChange={jest.fn()} />);
      expect(screen.getByRole('button', { name: /all/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('Yes button has aria-pressed="true" when value is "true"', () => {
      render(<BooleanFilter value="true" onChange={jest.fn()} />);
      expect(screen.getByRole('button', { name: /yes/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('No button has aria-pressed="true" when value is "false"', () => {
      render(<BooleanFilter value="false" onChange={jest.fn()} />);
      expect(screen.getByRole('button', { name: /no/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('All button has aria-pressed="false" when value is "true"', () => {
      render(<BooleanFilter value="true" onChange={jest.fn()} />);
      expect(screen.getByRole('button', { name: /all/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('Yes button has aria-pressed="false" when value is "false"', () => {
      render(<BooleanFilter value="false" onChange={jest.fn()} />);
      expect(screen.getByRole('button', { name: /yes/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('No button has aria-pressed="false" when value is "true"', () => {
      render(<BooleanFilter value="true" onChange={jest.fn()} />);
      expect(screen.getByRole('button', { name: /no/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  });

  describe('click handlers', () => {
    it('clicking "Yes" fires onChange with "true"', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<BooleanFilter value="" onChange={mockOnChange} />);
      await user.click(screen.getByRole('button', { name: /yes/i }));
      expect(mockOnChange).toHaveBeenCalledWith('true');
    });

    it('clicking "No" fires onChange with "false"', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<BooleanFilter value="true" onChange={mockOnChange} />);
      await user.click(screen.getByRole('button', { name: /no/i }));
      expect(mockOnChange).toHaveBeenCalledWith('false');
    });

    it('clicking "All" fires onChange with empty string', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<BooleanFilter value="true" onChange={mockOnChange} />);
      await user.click(screen.getByRole('button', { name: /all/i }));
      expect(mockOnChange).toHaveBeenCalledWith('');
    });

    it('clicking same active button calls onChange again with same value', async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      render(<BooleanFilter value="true" onChange={mockOnChange} />);
      await user.click(screen.getByRole('button', { name: /yes/i }));
      expect(mockOnChange).toHaveBeenCalledWith('true');
    });
  });
});
