import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTablePagination } from './DataTablePagination.js';

function renderPagination({
  currentPage = 1,
  totalPages = 5,
  totalItems = 100,
  pageSize = 25,
  onPageChange = jest.fn(),
  onPageSizeChange,
}: {
  currentPage?: number;
  totalPages?: number;
  totalItems?: number;
  pageSize?: number;
  onPageChange?: jest.Mock;
  onPageSizeChange?: jest.Mock;
} = {}) {
  return render(
    <DataTablePagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalItems={totalItems}
      pageSize={pageSize}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
    />,
  );
}

describe('DataTablePagination', () => {
  describe('rendering', () => {
    it('renders nothing when totalPages <= 1', () => {
      const { container } = renderPagination({ totalPages: 1 });
      expect(container).toBeEmptyDOMElement();
    });

    it('renders pagination when totalPages > 1', () => {
      renderPagination({ totalPages: 3 });
      expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });

    it('renders page number buttons', () => {
      renderPagination({ totalPages: 3, currentPage: 1 });
      expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument();
    });

    it('marks current page button with aria-current="page"', () => {
      renderPagination({ totalPages: 3, currentPage: 2 });
      expect(screen.getByRole('button', { name: '2' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('does not mark other pages with aria-current', () => {
      renderPagination({ totalPages: 3, currentPage: 2 });
      expect(screen.getByRole('button', { name: '1' })).not.toHaveAttribute('aria-current');
    });

    it('shows "Showing X–Y of N items" info text', () => {
      renderPagination({ currentPage: 2, totalPages: 4, totalItems: 100, pageSize: 25 });
      // Showing 26–50 of 100 items
      expect(screen.getByText(/26/)).toBeInTheDocument();
      expect(screen.getByText(/50/)).toBeInTheDocument();
      expect(screen.getByText(/100/)).toBeInTheDocument();
    });

    it('caps "to" value at totalItems on last page', () => {
      renderPagination({ currentPage: 4, totalPages: 4, totalItems: 90, pageSize: 25 });
      // Page 4: showing 76–90 of 90
      expect(screen.getByText(/76/)).toBeInTheDocument();
      expect(screen.getByText(/90/)).toBeInTheDocument();
    });
  });

  describe('boundary disabling', () => {
    it('Prev button is disabled when on page 1', () => {
      renderPagination({ currentPage: 1, totalPages: 5 });
      expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    });

    it('Prev button is enabled when not on page 1', () => {
      renderPagination({ currentPage: 2, totalPages: 5 });
      expect(screen.getByRole('button', { name: /previous/i })).not.toBeDisabled();
    });

    it('Next button is disabled when on last page', () => {
      renderPagination({ currentPage: 5, totalPages: 5 });
      expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    });

    it('Next button is enabled when not on last page', () => {
      renderPagination({ currentPage: 3, totalPages: 5 });
      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    });
  });

  describe('page navigation', () => {
    it('clicking page 2 calls onPageChange(2)', async () => {
      const user = userEvent.setup();
      const mockOnPageChange = jest.fn();
      renderPagination({ currentPage: 1, totalPages: 5, onPageChange: mockOnPageChange });
      await user.click(screen.getByRole('button', { name: '2' }));
      expect(mockOnPageChange).toHaveBeenCalledWith(2);
    });

    it('clicking Next calls onPageChange with currentPage + 1', async () => {
      const user = userEvent.setup();
      const mockOnPageChange = jest.fn();
      renderPagination({ currentPage: 3, totalPages: 5, onPageChange: mockOnPageChange });
      await user.click(screen.getByRole('button', { name: /next/i }));
      expect(mockOnPageChange).toHaveBeenCalledWith(4);
    });

    it('clicking Prev calls onPageChange with currentPage - 1', async () => {
      const user = userEvent.setup();
      const mockOnPageChange = jest.fn();
      renderPagination({ currentPage: 3, totalPages: 5, onPageChange: mockOnPageChange });
      await user.click(screen.getByRole('button', { name: /previous/i }));
      expect(mockOnPageChange).toHaveBeenCalledWith(2);
    });
  });

  describe('page number windowing', () => {
    it('shows all pages when totalPages <= 5', () => {
      renderPagination({ currentPage: 1, totalPages: 4 });
      [1, 2, 3, 4].forEach((n) => {
        expect(screen.getByRole('button', { name: String(n) })).toBeInTheDocument();
      });
    });

    it('shows 5 page buttons when totalPages > 5', () => {
      renderPagination({ currentPage: 5, totalPages: 20 });
      // Count page number buttons (exclude prev/next)
      const allButtons = screen.getAllByRole('button');
      const pageButtons = allButtons.filter((b) => /^\d+$/.test(b.textContent || ''));
      expect(pageButtons).toHaveLength(5);
    });

    it('shows pages starting from 1 when on page 1 of many', () => {
      renderPagination({ currentPage: 1, totalPages: 20 });
      expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument();
    });

    it('shows last 5 pages when near the end', () => {
      renderPagination({ currentPage: 19, totalPages: 20 });
      expect(screen.getByRole('button', { name: '16' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '20' })).toBeInTheDocument();
    });
  });

  describe('page size selector', () => {
    it('does not render page size selector when onPageSizeChange not provided', () => {
      renderPagination();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('renders page size selector when onPageSizeChange provided', () => {
      renderPagination({ onPageSizeChange: jest.fn() });
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('shows current pageSize as selected value in selector', () => {
      renderPagination({ pageSize: 50, onPageSizeChange: jest.fn() });
      expect(screen.getByRole('combobox')).toHaveValue('50');
    });

    it('calls onPageSizeChange with parsed integer when size selected', async () => {
      const user = userEvent.setup();
      const mockOnPageSizeChange = jest.fn();
      renderPagination({ pageSize: 25, onPageSizeChange: mockOnPageSizeChange });
      await user.selectOptions(screen.getByRole('combobox'), '100');
      expect(mockOnPageSizeChange).toHaveBeenCalledWith(100);
    });

    it('renders all page size options: 10, 25, 50, 100', () => {
      renderPagination({ onPageSizeChange: jest.fn() });
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      const optionValues = Array.from(select.options).map((o) => o.value);
      expect(optionValues).toEqual(['10', '25', '50', '100']);
    });
  });
});
