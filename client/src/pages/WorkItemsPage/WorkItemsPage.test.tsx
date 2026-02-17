/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as TagsApiTypes from '../../lib/tagsApi.js';
import type { WorkItemListResponse, WorkItemSummary } from '@cornerstone/shared';

// Mock API modules BEFORE importing components
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItems: jest.fn(),
  deleteWorkItem: jest.fn(),
  getWorkItem: jest.fn(),
  createWorkItem: jest.fn(),
  updateWorkItem: jest.fn(),
}));

jest.unstable_mockModule('../../lib/usersApi.js', () => ({
  listUsers: jest.fn(),
}));

jest.unstable_mockModule('../../lib/tagsApi.js', () => ({
  fetchTags: jest.fn(),
}));

describe('WorkItemsPage', () => {
  let workItemsApi: typeof WorkItemsApiTypes;
  let usersApi: typeof UsersApiTypes;
  let tagsApi: typeof TagsApiTypes;
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
      assignedUser: { id: 'user-1', displayName: 'John Doe', email: 'john@example.com' },
      tags: [{ id: 'tag-1', name: 'Electrical', color: '#FF0000' }],
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
      assignedUser: null,
      tags: [],
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
    if (!workItemsApi) {
      workItemsApi = await import('../../lib/workItemsApi.js');
      usersApi = await import('../../lib/usersApi.js');
      tagsApi = await import('../../lib/tagsApi.js');
      const module = await import('./WorkItemsPage.js');
      WorkItemsPage = module.default;
    }

    // Reset all mocks
    (
      workItemsApi.listWorkItems as jest.MockedFunction<typeof workItemsApi.listWorkItems>
    ).mockReset();
    (
      workItemsApi.deleteWorkItem as jest.MockedFunction<typeof workItemsApi.deleteWorkItem>
    ).mockReset();
    (usersApi.listUsers as jest.MockedFunction<typeof usersApi.listUsers>).mockReset();
    (tagsApi.fetchTags as jest.MockedFunction<typeof tagsApi.fetchTags>).mockReset();

    // Default mock responses
    (usersApi.listUsers as jest.MockedFunction<typeof usersApi.listUsers>).mockResolvedValue({
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

    (tagsApi.fetchTags as jest.MockedFunction<typeof tagsApi.fetchTags>).mockResolvedValue({
      tags: [{ id: 'tag-1', name: 'Electrical', color: '#FF0000' }],
    });
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/work-items']}>
        <WorkItemsPage />
      </MemoryRouter>,
    );
  }

  describe('Page structure and states', () => {
    it('renders page heading', async () => {
      (
        workItemsApi.listWorkItems as jest.MockedFunction<typeof workItemsApi.listWorkItems>
      ).mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /work items/i, level: 1 })).toBeInTheDocument();
      });
    });

    it('renders "New Work Item" button in header', async () => {
      (
        workItemsApi.listWorkItems as jest.MockedFunction<typeof workItemsApi.listWorkItems>
      ).mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        const buttons = screen.getAllByRole('button', { name: /new work item/i });
        expect(buttons[0]).toBeInTheDocument();
      });
    });

    it('shows loading indicator while fetching data', async () => {
      (
        workItemsApi.listWorkItems as jest.MockedFunction<typeof workItemsApi.listWorkItems>
      ).mockReturnValueOnce(new Promise(() => {})); // Never resolves

      renderPage();

      expect(screen.getByText(/loading work items/i)).toBeInTheDocument();
    });

    it('hides loading indicator after data loads', async () => {
      (
        workItemsApi.listWorkItems as jest.MockedFunction<typeof workItemsApi.listWorkItems>
      ).mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/loading work items/i)).not.toBeInTheDocument();
      });
    });

    it('shows empty state message when no work items exist', async () => {
      (
        workItemsApi.listWorkItems as jest.MockedFunction<typeof workItemsApi.listWorkItems>
      ).mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/no work items yet/i)).toBeInTheDocument();
      });
    });

    it('shows "Create First Work Item" button in empty state', async () => {
      (
        workItemsApi.listWorkItems as jest.MockedFunction<typeof workItemsApi.listWorkItems>
      ).mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create first work item/i })).toBeInTheDocument();
      });
    });

    it('displays error message when API call fails', async () => {
      (
        workItemsApi.listWorkItems as jest.MockedFunction<typeof workItemsApi.listWorkItems>
      ).mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/failed to load work items/i)).toBeInTheDocument();
      });
    });
  });

  describe('Work items list display', () => {
    it('displays work item titles', async () => {
      (
        workItemsApi.listWorkItems as jest.MockedFunction<typeof workItemsApi.listWorkItems>
      ).mockResolvedValue(listResponse);

      renderPage();

      await waitFor(() => {
        // Both table and card layouts render simultaneously; use getAllByText
        expect(screen.getAllByText('Install electrical wiring').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Install plumbing').length).toBeGreaterThan(0);
      });
    });

    it('displays work item statuses using StatusBadge', async () => {
      (
        workItemsApi.listWorkItems as jest.MockedFunction<typeof workItemsApi.listWorkItems>
      ).mockResolvedValue(listResponse);

      renderPage();

      await waitFor(() => {
        // StatusBadge renders in both table and card layouts
        expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Not Started').length).toBeGreaterThan(0);
      });
    });

    it('displays assigned user names', async () => {
      (
        workItemsApi.listWorkItems as jest.MockedFunction<typeof workItemsApi.listWorkItems>
      ).mockResolvedValue(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0);
      });
    });

    it('displays formatted dates', async () => {
      (
        workItemsApi.listWorkItems as jest.MockedFunction<typeof workItemsApi.listWorkItems>
      ).mockResolvedValue(listResponse);

      renderPage();

      await waitFor(() => {
        // Use regex to match date format — exact format depends on locale/timezone
        expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0);
      });
    });
  });

  describe('Search and filters', () => {
    it('renders search input', async () => {
      (
        workItemsApi.listWorkItems as jest.MockedFunction<typeof workItemsApi.listWorkItems>
      ).mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('searchbox', { name: /search work items/i })).toBeInTheDocument();
      });
    });

    it('renders status filter dropdown', async () => {
      (
        workItemsApi.listWorkItems as jest.MockedFunction<typeof workItemsApi.listWorkItems>
      ).mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/status:/i)).toBeInTheDocument();
      });
    });

    it('renders assigned user filter dropdown', async () => {
      (
        workItemsApi.listWorkItems as jest.MockedFunction<typeof workItemsApi.listWorkItems>
      ).mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/assigned to:/i)).toBeInTheDocument();
      });
    });

    it('renders tag filter dropdown', async () => {
      (
        workItemsApi.listWorkItems as jest.MockedFunction<typeof workItemsApi.listWorkItems>
      ).mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/tag:/i)).toBeInTheDocument();
      });
    });

    it('renders sort dropdown', async () => {
      (
        workItemsApi.listWorkItems as jest.MockedFunction<typeof workItemsApi.listWorkItems>
      ).mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/sort by:/i)).toBeInTheDocument();
      });
    });
  });
});
