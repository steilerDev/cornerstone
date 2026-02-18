/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import type { WorkItemDetail, WorkItemSummary } from '@cornerstone/shared';
import type * as WorkItemDetailPageTypes from './WorkItemDetailPage.js';

// Mock AuthContext
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: jest.fn(),
}));

// Mock all API modules
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  getWorkItem: jest.fn(),
  updateWorkItem: jest.fn(),
  deleteWorkItem: jest.fn(),
  listWorkItems: jest.fn(),
}));

jest.unstable_mockModule('../../lib/notesApi.js', () => ({
  listNotes: jest.fn(),
  createNote: jest.fn(),
  updateNote: jest.fn(),
  deleteNote: jest.fn(),
}));

jest.unstable_mockModule('../../lib/subtasksApi.js', () => ({
  listSubtasks: jest.fn(),
  createSubtask: jest.fn(),
  updateSubtask: jest.fn(),
  deleteSubtask: jest.fn(),
  reorderSubtasks: jest.fn(),
}));

jest.unstable_mockModule('../../lib/dependenciesApi.js', () => ({
  getDependencies: jest.fn(),
  createDependency: jest.fn(),
  deleteDependency: jest.fn(),
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
  useParams: jest.fn(),
  useNavigate: jest.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: jest.fn().mockImplementation((props: any) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  )),
}));

const mockNavigate = jest.fn();

describe('WorkItemDetailPage', () => {
  let WorkItemDetailPageModule: typeof WorkItemDetailPageTypes;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let authContext: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let workItemsApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let notesApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let subtasksApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dependenciesApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tagsApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let usersApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let routerDom: any;

  const mockWorkItem: WorkItemDetail = {
    id: 'work-1',
    title: 'Test Work Item',
    description: 'This is a test work item',
    status: 'in_progress',
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    durationDays: 30,
    startAfter: null,
    startBefore: null,
    assignedUser: {
      id: 'user-1',
      displayName: 'Assigned User',
      email: 'assigned@example.com',
    },
    tags: [{ id: 'tag-1', name: 'Frontend', color: '#FF5733', createdAt: '2024-01-01T00:00:00Z' }],
    createdBy: {
      id: 'user-1',
      displayName: 'Creator User',
      email: 'creator@example.com',
    },
    subtasks: [],
    dependencies: {
      predecessors: [],
      successors: [],
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
  };

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    displayName: 'Test User',
    role: 'member' as const,
    authProvider: 'local' as const,
    createdAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    if (!WorkItemDetailPageModule) {
      WorkItemDetailPageModule = await import('./WorkItemDetailPage.js');
      authContext = await import('../../contexts/AuthContext.js');
      workItemsApi = await import('../../lib/workItemsApi.js');
      notesApi = await import('../../lib/notesApi.js');
      subtasksApi = await import('../../lib/subtasksApi.js');
      dependenciesApi = await import('../../lib/dependenciesApi.js');
      tagsApi = await import('../../lib/tagsApi.js');
      usersApi = await import('../../lib/usersApi.js');
      routerDom = await import('react-router-dom');
    }

    (routerDom.useParams as jest.MockedFunction<typeof routerDom.useParams>).mockReturnValue({
      id: 'work-1',
    });
    (routerDom.useNavigate as jest.MockedFunction<typeof routerDom.useNavigate>).mockReturnValue(
      mockNavigate as ReturnType<typeof routerDom.useNavigate>,
    );
    (authContext.useAuth as jest.MockedFunction<typeof authContext.useAuth>).mockReturnValue({
      user: mockUser,
      isLoading: false,
      error: null,
      refreshAuth: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      logout: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      oidcEnabled: false,
    });

    // Setup default successful API responses
    (
      workItemsApi.getWorkItem as jest.MockedFunction<typeof workItemsApi.getWorkItem>
    ).mockResolvedValue(mockWorkItem);
    (notesApi.listNotes as jest.MockedFunction<typeof notesApi.listNotes>).mockResolvedValue({
      notes: [],
    });
    (
      subtasksApi.listSubtasks as jest.MockedFunction<typeof subtasksApi.listSubtasks>
    ).mockResolvedValue({ subtasks: [] });
    (
      dependenciesApi.getDependencies as jest.MockedFunction<typeof dependenciesApi.getDependencies>
    ).mockResolvedValue({ predecessors: [], successors: [] });
    (tagsApi.fetchTags as jest.MockedFunction<typeof tagsApi.fetchTags>).mockResolvedValue({
      tags: [],
    });
    (usersApi.listUsers as jest.MockedFunction<typeof usersApi.listUsers>).mockResolvedValue({
      users: [],
    });
  });

  describe('initial render', () => {
    it('shows loading state initially', async () => {
      render(<WorkItemDetailPageModule.default />);

      expect(screen.getByText('Loading work item...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Loading work item...')).not.toBeInTheDocument();
      });
    });

    it('renders work item title after loading', async () => {
      render(<WorkItemDetailPageModule.default />);

      await waitFor(() => {
        expect(screen.getByText('Test Work Item')).toBeInTheDocument();
      });
    });

    it('renders work item description', async () => {
      render(<WorkItemDetailPageModule.default />);

      await waitFor(() => {
        expect(screen.getByText('This is a test work item')).toBeInTheDocument();
      });
    });

    it('renders all property sections', async () => {
      render(<WorkItemDetailPageModule.default />);

      await waitFor(() => {
        expect(screen.getByText('Description')).toBeInTheDocument();
      });

      expect(screen.getByText('Schedule')).toBeInTheDocument();
      expect(screen.getByText('Constraints')).toBeInTheDocument();
      expect(screen.getByText('Assignment')).toBeInTheDocument();
      expect(screen.getByText('Tags')).toBeInTheDocument();
      expect(screen.getByText('Notes')).toBeInTheDocument();
      expect(screen.getByText('Subtasks')).toBeInTheDocument();
      expect(screen.getByText('Dependencies')).toBeInTheDocument();
    });
  });

  describe('error states', () => {
    it('shows error message when work item not found', async () => {
      (
        workItemsApi.getWorkItem as jest.MockedFunction<typeof workItemsApi.getWorkItem>
      ).mockRejectedValue({ statusCode: 404 });

      render(<WorkItemDetailPageModule.default />);

      await waitFor(() => {
        expect(screen.getByText('Work item not found')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /back to work items/i })).toBeInTheDocument();
    });

    it('shows generic error message on other errors', async () => {
      (
        workItemsApi.getWorkItem as jest.MockedFunction<typeof workItemsApi.getWorkItem>
      ).mockRejectedValue(new Error('Network error'));

      render(<WorkItemDetailPageModule.default />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load work item. Please try again.')).toBeInTheDocument();
      });
    });
  });

  describe('work item with no description', () => {
    it('shows placeholder text when description is null', async () => {
      const workItemNoDescription = { ...mockWorkItem, description: null };
      (
        workItemsApi.getWorkItem as jest.MockedFunction<typeof workItemsApi.getWorkItem>
      ).mockResolvedValue(workItemNoDescription);

      render(<WorkItemDetailPageModule.default />);

      await waitFor(() => {
        expect(screen.getByText('No description')).toBeInTheDocument();
      });
    });
  });

  describe('notes display', () => {
    it('shows empty state when no notes exist', async () => {
      render(<WorkItemDetailPageModule.default />);

      await waitFor(() => {
        expect(screen.getByText('No notes yet')).toBeInTheDocument();
      });
    });

    it('renders existing notes', async () => {
      (notesApi.listNotes as jest.MockedFunction<typeof notesApi.listNotes>).mockResolvedValue({
        notes: [
          {
            id: 'note-1',
            content: 'First note',
            createdBy: {
              id: 'user-1',
              displayName: 'Test User',
            },
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
      });

      render(<WorkItemDetailPageModule.default />);

      await waitFor(() => {
        expect(screen.getByText('First note')).toBeInTheDocument();
      });

      expect(screen.getByText('Test User')).toBeInTheDocument();
    });
  });

  describe('subtasks display', () => {
    it('shows empty state when no subtasks exist', async () => {
      render(<WorkItemDetailPageModule.default />);

      await waitFor(() => {
        expect(screen.getByText('No subtasks yet')).toBeInTheDocument();
      });
    });

    it('renders existing subtasks', async () => {
      (
        subtasksApi.listSubtasks as jest.MockedFunction<typeof subtasksApi.listSubtasks>
      ).mockResolvedValue({
        subtasks: [
          {
            id: 'subtask-1',
            title: 'First subtask',
            isCompleted: false,
            sortOrder: 0,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
      });

      render(<WorkItemDetailPageModule.default />);

      await waitFor(() => {
        expect(screen.getByText('First subtask')).toBeInTheDocument();
      });
    });
  });

  describe('dependencies display', () => {
    it('shows empty state when no dependencies exist', async () => {
      render(<WorkItemDetailPageModule.default />);

      await waitFor(() => {
        expect(screen.getByText('No predecessors')).toBeInTheDocument();
      });

      expect(screen.getByText('No successors')).toBeInTheDocument();
    });

    it('renders existing predecessors', async () => {
      const predecessorWorkItem: WorkItemSummary = {
        id: 'work-0',
        title: 'Foundation work',
        status: 'completed',
        startDate: null,
        endDate: null,
        durationDays: null,
        assignedUser: null,
        tags: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      (
        dependenciesApi.getDependencies as jest.MockedFunction<
          typeof dependenciesApi.getDependencies
        >
      ).mockResolvedValue({
        predecessors: [
          {
            workItem: predecessorWorkItem,
            dependencyType: 'finish_to_start',
          },
        ],
        successors: [],
      });

      render(<WorkItemDetailPageModule.default />);

      await waitFor(() => {
        expect(screen.getByText('Foundation work')).toBeInTheDocument();
      });

      // Query within predecessors list to avoid matching the form dropdown
      const predecessorsList = screen.getByText('Predecessors (Blocking This)').closest('div');
      expect(predecessorsList).toHaveTextContent('Finish-to-Start');
    });
  });
});
