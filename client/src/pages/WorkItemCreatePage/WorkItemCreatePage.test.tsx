/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TagResponse, UserResponse } from '@cornerstone/shared';
import type * as WorkItemCreatePageTypes from './WorkItemCreatePage.js';

// Mock all API modules BEFORE importing component
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  createWorkItem: jest.fn(),
}));

jest.unstable_mockModule('../../lib/tagsApi.js', () => ({
  fetchTags: jest.fn(),
  createTag: jest.fn(),
}));

jest.unstable_mockModule('../../lib/usersApi.js', () => ({
  listUsers: jest.fn(),
}));

// Mock react-router-dom
jest.unstable_mockModule('react-router-dom', () => ({
  ...jest.requireActual<object>('react-router-dom'),
  useNavigate: jest.fn(),
}));

const mockNavigate = jest.fn();

describe('WorkItemCreatePage', () => {
  let WorkItemCreatePageModule: typeof WorkItemCreatePageTypes;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let workItemsApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tagsApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let usersApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let routerDom: any;

  const mockTags: TagResponse[] = [
    { id: 'tag-1', name: 'Frontend', color: '#FF5733', createdAt: '2024-01-01T00:00:00Z' },
    { id: 'tag-2', name: 'Backend', color: '#33FF57', createdAt: '2024-01-01T00:00:00Z' },
  ];

  const mockUsers: UserResponse[] = [
    {
      id: 'user-1',
      email: 'active@example.com',
      displayName: 'Active User',
      role: 'member',
      authProvider: 'local',
      createdAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'user-2',
      email: 'deactivated@example.com',
      displayName: 'Deactivated User',
      role: 'member',
      authProvider: 'local',
      createdAt: '2024-01-01T00:00:00Z',
      deactivatedAt: '2024-06-01T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();

    if (!WorkItemCreatePageModule) {
      WorkItemCreatePageModule = await import('./WorkItemCreatePage.js');
      workItemsApi = await import('../../lib/workItemsApi.js');
      tagsApi = await import('../../lib/tagsApi.js');
      usersApi = await import('../../lib/usersApi.js');
      routerDom = await import('react-router-dom');
    }

    (routerDom.useNavigate as jest.MockedFunction<typeof routerDom.useNavigate>).mockReturnValue(
      mockNavigate as ReturnType<typeof routerDom.useNavigate>,
    );
    (tagsApi.fetchTags as jest.MockedFunction<typeof tagsApi.fetchTags>).mockResolvedValue({
      tags: mockTags,
    });
    (usersApi.listUsers as jest.MockedFunction<typeof usersApi.listUsers>).mockResolvedValue({
      users: mockUsers,
    });
  });

  describe('initial render', () => {
    it('shows loading state initially', async () => {
      render(<WorkItemCreatePageModule.default />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });
    });

    it('renders form with all required fields after loading', async () => {
      render(<WorkItemCreatePageModule.default />);

      // Wait for any field to appear (indicates form loaded)
      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      // Check heading is present
      expect(screen.getByRole('heading', { name: 'Create Work Item' })).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/assigned to/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/duration/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/start after/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/start before/i)).toBeInTheDocument();
      expect(screen.getByText('Tags')).toBeInTheDocument();
    });

    it('renders submit and cancel buttons', async () => {
      render(<WorkItemCreatePageModule.default />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create work item/i })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('renders back button', async () => {
      render(<WorkItemCreatePageModule.default />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to work items/i })).toBeInTheDocument();
      });
    });

    it('filters out deactivated users from assignment dropdown', async () => {
      render(<WorkItemCreatePageModule.default />);

      await waitFor(() => {
        expect(screen.getByLabelText(/assigned to/i)).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/assigned to/i) as HTMLSelectElement;
      const options = Array.from(select.options).map((opt) => opt.textContent);

      expect(options).toContain('Active User');
      expect(options).not.toContain('Deactivated User');
    });
  });

  describe('validation', () => {
    it('shows validation error when submitting with empty title', async () => {
      const user = userEvent.setup();
      render(<WorkItemCreatePageModule.default />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create work item/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /create work item/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Title is required')).toBeInTheDocument();
      });

      expect(workItemsApi.createWorkItem).not.toHaveBeenCalled();
    });

    it('shows validation error when start date is after end date', async () => {
      const user = userEvent.setup();
      render(<WorkItemCreatePageModule.default />);

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/title/i), 'Test Work Item');
      await user.type(screen.getByLabelText(/start date/i), '2024-12-31');
      await user.type(screen.getByLabelText(/end date/i), '2024-01-01');

      const submitButton = screen.getByRole('button', { name: /create work item/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/start date must be before or equal to end date/i),
        ).toBeInTheDocument();
      });

      expect(workItemsApi.createWorkItem).not.toHaveBeenCalled();
    });

    it('shows validation error when start after is after start before', async () => {
      const user = userEvent.setup();
      render(<WorkItemCreatePageModule.default />);

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/title/i), 'Test Work Item');
      await user.type(screen.getByLabelText(/start after/i), '2024-12-31');
      await user.type(screen.getByLabelText(/start before/i), '2024-01-01');

      const submitButton = screen.getByRole('button', { name: /create work item/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/start after date must be before or equal to start before date/i),
        ).toBeInTheDocument();
      });

      expect(workItemsApi.createWorkItem).not.toHaveBeenCalled();
    });

    it('validates negative duration on submit', async () => {
      const user = userEvent.setup();
      render(<WorkItemCreatePageModule.default />);

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/title/i), 'Test Work Item');

      // Directly set the value via the input element (bypasses HTML5 min validation)
      const durationInput = screen.getByLabelText(/duration/i) as HTMLInputElement;
      durationInput.value = '-5';
      durationInput.dispatchEvent(new Event('change', { bubbles: true }));

      const submitButton = screen.getByRole('button', { name: /create work item/i });
      await user.click(submitButton);

      // Validation should prevent submission
      expect(workItemsApi.createWorkItem).not.toHaveBeenCalled();
    });
  });

  describe('form submission', () => {
    it('navigates to work item detail page on successful creation', async () => {
      const user = userEvent.setup();
      (
        workItemsApi.createWorkItem as jest.MockedFunction<typeof workItemsApi.createWorkItem>
      ).mockResolvedValue({
        id: 'work-1',
        title: 'Test Work Item',
        description: null,
        status: 'not_started',
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUser: null,
        tags: [],
        createdBy: {
          id: 'user-1',
          displayName: 'Test User',
          email: 'test@example.com',
        },
        subtasks: [],
        dependencies: {
          predecessors: [],
          successors: [],
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      render(<WorkItemCreatePageModule.default />);

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/title/i), 'Test Work Item');

      const submitButton = screen.getByRole('button', { name: /create work item/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/work-items/work-1');
      });
    });

    it('shows error banner on creation failure', async () => {
      const user = userEvent.setup();
      (
        workItemsApi.createWorkItem as jest.MockedFunction<typeof workItemsApi.createWorkItem>
      ).mockRejectedValue(new Error('Network error'));

      render(<WorkItemCreatePageModule.default />);

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/title/i), 'Test Work Item');

      const submitButton = screen.getByRole('button', { name: /create work item/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText('Failed to create work item. Please try again.'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('navigation', () => {
    it('navigates back to work items list on back button click', async () => {
      const user = userEvent.setup();
      render(<WorkItemCreatePageModule.default />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to work items/i })).toBeInTheDocument();
      });

      const backButton = screen.getByRole('button', { name: /back to work items/i });
      await user.click(backButton);

      expect(mockNavigate).toHaveBeenCalledWith('/work-items');
    });

    it('navigates back to work items list on cancel button click', async () => {
      const user = userEvent.setup();
      render(<WorkItemCreatePageModule.default />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith('/work-items');
    });
  });
});
