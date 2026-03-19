/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as TagsApiTypes from '../../lib/tagsApi.js';
import type { WorkItemListResponse, WorkItemSummary } from '@cornerstone/shared';

const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockDeleteWorkItem = jest.fn<typeof WorkItemsApiTypes.deleteWorkItem>();
const mockGetWorkItem = jest.fn<typeof WorkItemsApiTypes.getWorkItem>();
const mockCreateWorkItem = jest.fn<typeof WorkItemsApiTypes.createWorkItem>();
const mockUpdateWorkItem = jest.fn<typeof WorkItemsApiTypes.updateWorkItem>();
const mockListUsers = jest.fn<typeof UsersApiTypes.listUsers>();
const mockFetchTags = jest.fn<typeof TagsApiTypes.fetchTags>();

// Mock API modules BEFORE importing components
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItems: mockListWorkItems,
  deleteWorkItem: mockDeleteWorkItem,
  getWorkItem: mockGetWorkItem,
  createWorkItem: mockCreateWorkItem,
  updateWorkItem: mockUpdateWorkItem,
}));

jest.unstable_mockModule('../../lib/usersApi.js', () => ({
  listUsers: mockListUsers,
}));

jest.unstable_mockModule('../../lib/tagsApi.js', () => ({
  fetchTags: mockFetchTags,
}));

// ─── Mock: formatters — provides useFormatters() hook ────────────────────────

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  const fmtDate = (d: string | null | undefined, fallback = '—') => {
    if (!d) return fallback;
    const [year, month, day] = d.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return fallback;
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  const fmtTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  const fmtDateTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  return {
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    formatTime: fmtTime,
    formatDateTime: fmtDateTime,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: fmtDate,
      formatTime: fmtTime,
      formatDateTime: fmtDateTime,
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

describe('WorkItemsPage', () => {
  let WorkItemsPage: React.ComponentType;

  // Sample data
  const sampleWorkItems: WorkItemSummary[] = [
    {
      id: 'work-1',
      title: 'Install electrical wiring',
      status: 'in_progress',
      startDate: '2026-01-01',
      endDate: '2026-01-15',
      durationDays: 14,
      actualStartDate: null,
      actualEndDate: null,
      assignedUser: { id: 'user-1', displayName: 'John Doe', email: 'john@example.com' },
      assignedVendor: null,
      area: null,
      budgetLineCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'work-2',
      title: 'Install plumbing',
      status: 'not_started',
      startDate: null,
      endDate: null,
      durationDays: null,
      actualStartDate: null,
      actualEndDate: null,
      assignedUser: null,
      assignedVendor: null,
      area: null,
      budgetLineCount: 0,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
  ];

  const emptyResponse: WorkItemListResponse = {
    items: [],
    pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
  };

  const listResponse: WorkItemListResponse = {
    items: sampleWorkItems,
    pagination: { page: 1, pageSize: 25, totalPages: 1, totalItems: 2 },
  };

  beforeEach(async () => {
    // Import modules once
    if (!WorkItemsPage) {
      const module = await import('./WorkItemsPage.js');
      WorkItemsPage = module.default;
    }

    // Reset all mocks
    mockListWorkItems.mockReset();
    mockDeleteWorkItem.mockReset();
    mockListUsers.mockReset();
    mockFetchTags.mockReset();

    // Default mock responses
    mockListUsers.mockResolvedValue({
      users: [
        {
          id: 'user-1',
          email: 'john@example.com',
          displayName: 'John Doe',
          role: 'member',
          authProvider: 'local',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deactivatedAt: null,
        },
      ],
    });

    mockFetchTags.mockResolvedValue({
      tags: [{ id: 'tag-1', name: 'Electrical', color: '#FF0000' }],
    });
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/project/work-items']}>
        <WorkItemsPage />
      </MemoryRouter>,
    );
  }

  describe('Page structure and states', () => {
    it('renders page heading', async () => {
      mockListWorkItems.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^project$/i, level: 1 })).toBeInTheDocument();
      });
    });

    it('renders "New Work Item" button in header', async () => {
      mockListWorkItems.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        const buttons = screen.getAllByRole('button', { name: /new work item/i });
        expect(buttons[0]).toBeInTheDocument();
      });
    });

    it('shows loading indicator while fetching data', async () => {
      mockListWorkItems.mockReturnValueOnce(new Promise(() => {})); // Never resolves

      renderPage();

      expect(screen.getByText(/loading work items/i)).toBeInTheDocument();
    });

    it('hides loading indicator after data loads', async () => {
      mockListWorkItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/loading work items/i)).not.toBeInTheDocument();
      });
    });

    it('shows empty state message when no work items exist', async () => {
      mockListWorkItems.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/no work items yet/i)).toBeInTheDocument();
      });
    });

    it('shows "Create First Work Item" button in empty state', async () => {
      mockListWorkItems.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create first work item/i })).toBeInTheDocument();
      });
    });

    it('displays error message when API call fails', async () => {
      mockListWorkItems.mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/failed to load work items/i)).toBeInTheDocument();
      });
    });
  });

  describe('Work items list display', () => {
    it('displays work item titles', async () => {
      mockListWorkItems.mockResolvedValue(listResponse);

      renderPage();

      await waitFor(() => {
        // Both table and card layouts render simultaneously; use getAllByText
        expect(screen.getAllByText('Install electrical wiring').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Install plumbing').length).toBeGreaterThan(0);
      });
    });

    it('displays work item statuses using StatusBadge', async () => {
      mockListWorkItems.mockResolvedValue(listResponse);

      renderPage();

      await waitFor(() => {
        // StatusBadge renders in both table and card layouts
        expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Not Started').length).toBeGreaterThan(0);
      });
    });

    it('displays assigned user names', async () => {
      mockListWorkItems.mockResolvedValue(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0);
      });
    });

    it('displays formatted dates', async () => {
      mockListWorkItems.mockResolvedValue(listResponse);

      renderPage();

      await waitFor(() => {
        // Use regex to match date format — exact format depends on locale/timezone
        expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0);
      });
    });
  });

  describe('Search and filters', () => {
    it('renders search input', async () => {
      mockListWorkItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('searchbox', { name: /search work items/i })).toBeInTheDocument();
      });
    });

    it('renders status filter dropdown', async () => {
      mockListWorkItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/status:/i)).toBeInTheDocument();
      });
    });

    it('renders assigned user filter dropdown', async () => {
      mockListWorkItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/assigned to:/i)).toBeInTheDocument();
      });
    });

    it.skip('renders tag filter dropdown — tags table dropped in migration 0028', () => {
      // Tags (work_item_tags, household_item_tags, tags tables) were dropped in migration 0028.
      // Tag filtering is no longer available on the work items page.
    });

    it('renders sort dropdown', async () => {
      mockListWorkItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/sort by:/i)).toBeInTheDocument();
      });
    });
  });

  describe('Budget line count pill', () => {
    it('renders a span with budgetLineCountZero class and text "0" for a work item with budgetLineCount 0', async () => {
      mockListWorkItems.mockResolvedValueOnce(listResponse);

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Install electrical wiring').length).toBeGreaterThan(0);
      });

      // identity-obj-proxy returns class names as-is, so the class attribute value is "budgetLineCountZero"
      const zeroSpans = container.querySelectorAll('[class="budgetLineCountZero"]');
      expect(zeroSpans.length).toBeGreaterThan(0);
      expect(zeroSpans[0].textContent).toBe('0');
    });

    it('renders a span with budgetLineCountPositive class and text "3" for a work item with budgetLineCount 3', async () => {
      const itemWithBudget: WorkItemSummary = {
        id: 'work-3',
        title: 'Install flooring',
        status: 'not_started',
        startDate: null,
        endDate: null,
        durationDays: null,
        actualStartDate: null,
        actualEndDate: null,
        assignedUser: null,
        assignedVendor: null,
        area: null,
        budgetLineCount: 3,
        createdAt: '2026-01-03T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
      };

      const responseWithBudget: WorkItemListResponse = {
        items: [itemWithBudget],
        pagination: { page: 1, pageSize: 25, totalPages: 1, totalItems: 1 },
      };

      mockListWorkItems.mockResolvedValueOnce(responseWithBudget);

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Install flooring').length).toBeGreaterThan(0);
      });

      const positiveSpans = container.querySelectorAll('[class="budgetLineCountPositive"]');
      expect(positiveSpans.length).toBeGreaterThan(0);
      expect(positiveSpans[0].textContent).toBe('3');
    });

    it('applies aria-label containing the budget line count to the pill span', async () => {
      const itemWithBudget: WorkItemSummary = {
        id: 'work-3',
        title: 'Install flooring',
        status: 'not_started',
        startDate: null,
        endDate: null,
        durationDays: null,
        actualStartDate: null,
        actualEndDate: null,
        assignedUser: null,
        assignedVendor: null,
        area: null,
        budgetLineCount: 3,
        createdAt: '2026-01-03T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
      };

      const responseWithBudget: WorkItemListResponse = {
        items: [itemWithBudget],
        pagination: { page: 1, pageSize: 25, totalPages: 1, totalItems: 1 },
      };

      mockListWorkItems.mockResolvedValueOnce(responseWithBudget);

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Install flooring').length).toBeGreaterThan(0);
      });

      const positiveSpans = container.querySelectorAll('[class="budgetLineCountPositive"]');
      expect(positiveSpans.length).toBeGreaterThan(0);
      expect(positiveSpans[0].getAttribute('aria-label')).toContain('3');
    });

    it('applies aria-label containing "0" for the zero-count pill span', async () => {
      mockListWorkItems.mockResolvedValueOnce(listResponse);

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Install electrical wiring').length).toBeGreaterThan(0);
      });

      const zeroSpans = container.querySelectorAll('[class="budgetLineCountZero"]');
      expect(zeroSpans.length).toBeGreaterThan(0);
      expect(zeroSpans[0].getAttribute('aria-label')).toContain('0');
    });

    it('renders the budget lines cell td with budgetLinesCell class', async () => {
      mockListWorkItems.mockResolvedValueOnce(listResponse);

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Install electrical wiring').length).toBeGreaterThan(0);
      });

      const budgetCells = container.querySelectorAll('td[class="budgetLinesCell"]');
      expect(budgetCells.length).toBeGreaterThan(0);
    });
  });

  describe('No Budget toggle button', () => {
    it('renders the No Budget filter as a <button> element (not a checkbox)', async () => {
      mockListWorkItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByLabelText(/show only work items without budget lines/i),
        ).toBeInTheDocument();
      });

      const toggle = screen.getByLabelText(/show only work items without budget lines/i);
      expect(toggle.tagName).toBe('BUTTON');
    });

    it('renders the toggle with aria-pressed attribute', async () => {
      mockListWorkItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByLabelText(/show only work items without budget lines/i),
        ).toBeInTheDocument();
      });

      const toggle = screen.getByLabelText(/show only work items without budget lines/i);
      expect(toggle).toHaveAttribute('aria-pressed');
    });

    it('renders the toggle with aria-pressed="false" when noBudget is not in URL params', async () => {
      mockListWorkItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByLabelText(/show only work items without budget lines/i),
        ).toBeInTheDocument();
      });

      const toggle = screen.getByLabelText(/show only work items without budget lines/i);
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
    });

    it('has an aria-label attribute on the toggle button', async () => {
      mockListWorkItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByLabelText(/show only work items without budget lines/i),
        ).toBeInTheDocument();
      });

      const toggle = screen.getByLabelText(/show only work items without budget lines/i);
      expect(toggle.getAttribute('aria-label')).toBeTruthy();
    });

    it('clicking the toggle sets aria-pressed to "true"', async () => {
      mockListWorkItems.mockResolvedValue(listResponse);

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByLabelText(/show only work items without budget lines/i),
        ).toBeInTheDocument();
      });

      const toggle = screen.getByLabelText(/show only work items without budget lines/i);
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(toggle).toHaveAttribute('aria-pressed', 'true');
      });
    });

    it('does not render any checkbox input for budget filtering', async () => {
      mockListWorkItems.mockResolvedValueOnce(listResponse);

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Install electrical wiring').length).toBeGreaterThan(0);
      });

      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      // None of the checkboxes should be related to budget filtering
      const budgetCheckboxes = Array.from(checkboxes).filter((el) => {
        const label = el.getAttribute('aria-label') || '';
        const id = el.getAttribute('id') || '';
        return label.toLowerCase().includes('budget') || id.toLowerCase().includes('budget');
      });
      expect(budgetCheckboxes).toHaveLength(0);
    });
  });
});
