/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { WorkItemDetail, WorkItemSummary } from '@cornerstone/shared';
import type * as AuthContextTypes from '../../contexts/AuthContext.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as NotesApiTypes from '../../lib/notesApi.js';
import type * as SubtasksApiTypes from '../../lib/subtasksApi.js';
import type * as DependenciesApiTypes from '../../lib/dependenciesApi.js';
import type * as TagsApiTypes from '../../lib/tagsApi.js';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as WorkItemDetailPageTypes from './WorkItemDetailPage.js';

// Module-scope mocks
const mockUseAuth = jest.fn<typeof AuthContextTypes.useAuth>();
const mockGetWorkItem = jest.fn<typeof WorkItemsApiTypes.getWorkItem>();
const mockUpdateWorkItem = jest.fn<typeof WorkItemsApiTypes.updateWorkItem>();
const mockDeleteWorkItem = jest.fn<typeof WorkItemsApiTypes.deleteWorkItem>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockListNotes = jest.fn<typeof NotesApiTypes.listNotes>();
const mockCreateNote = jest.fn<typeof NotesApiTypes.createNote>();
const mockUpdateNote = jest.fn<typeof NotesApiTypes.updateNote>();
const mockDeleteNote = jest.fn<typeof NotesApiTypes.deleteNote>();
const mockListSubtasks = jest.fn<typeof SubtasksApiTypes.listSubtasks>();
const mockCreateSubtask = jest.fn<typeof SubtasksApiTypes.createSubtask>();
const mockUpdateSubtask = jest.fn<typeof SubtasksApiTypes.updateSubtask>();
const mockDeleteSubtask = jest.fn<typeof SubtasksApiTypes.deleteSubtask>();
const mockReorderSubtasks = jest.fn<typeof SubtasksApiTypes.reorderSubtasks>();
const mockGetDependencies = jest.fn<typeof DependenciesApiTypes.getDependencies>();
const mockCreateDependency = jest.fn<typeof DependenciesApiTypes.createDependency>();
const mockDeleteDependency = jest.fn<typeof DependenciesApiTypes.deleteDependency>();
const mockFetchTags = jest.fn<typeof TagsApiTypes.fetchTags>();
const mockCreateTag = jest.fn<typeof TagsApiTypes.createTag>();
const mockListUsers = jest.fn<typeof UsersApiTypes.listUsers>();

// Mock AuthContext
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: mockUseAuth,
}));

// Mock all API modules — do NOT mock react-router-dom (causes OOM)
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  getWorkItem: mockGetWorkItem,
  updateWorkItem: mockUpdateWorkItem,
  deleteWorkItem: mockDeleteWorkItem,
  listWorkItems: mockListWorkItems,
}));

jest.unstable_mockModule('../../lib/notesApi.js', () => ({
  listNotes: mockListNotes,
  createNote: mockCreateNote,
  updateNote: mockUpdateNote,
  deleteNote: mockDeleteNote,
}));

jest.unstable_mockModule('../../lib/subtasksApi.js', () => ({
  listSubtasks: mockListSubtasks,
  createSubtask: mockCreateSubtask,
  updateSubtask: mockUpdateSubtask,
  deleteSubtask: mockDeleteSubtask,
  reorderSubtasks: mockReorderSubtasks,
}));

jest.unstable_mockModule('../../lib/dependenciesApi.js', () => ({
  getDependencies: mockGetDependencies,
  createDependency: mockCreateDependency,
  deleteDependency: mockDeleteDependency,
}));

jest.unstable_mockModule('../../lib/tagsApi.js', () => ({
  fetchTags: mockFetchTags,
  createTag: mockCreateTag,
}));

jest.unstable_mockModule('../../lib/usersApi.js', () => ({
  listUsers: mockListUsers,
}));

describe('WorkItemDetailPage', () => {
  let WorkItemDetailPageModule: typeof WorkItemDetailPageTypes;

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
    // Reset all mocks
    mockUseAuth.mockReset();
    mockGetWorkItem.mockReset();
    mockUpdateWorkItem.mockReset();
    mockDeleteWorkItem.mockReset();
    mockListWorkItems.mockReset();
    mockListNotes.mockReset();
    mockCreateNote.mockReset();
    mockUpdateNote.mockReset();
    mockDeleteNote.mockReset();
    mockListSubtasks.mockReset();
    mockCreateSubtask.mockReset();
    mockUpdateSubtask.mockReset();
    mockDeleteSubtask.mockReset();
    mockReorderSubtasks.mockReset();
    mockGetDependencies.mockReset();
    mockCreateDependency.mockReset();
    mockDeleteDependency.mockReset();
    mockFetchTags.mockReset();
    mockCreateTag.mockReset();
    mockListUsers.mockReset();

    if (!WorkItemDetailPageModule) {
      WorkItemDetailPageModule = await import('./WorkItemDetailPage.js');
    }

    mockUseAuth.mockReturnValue({
      user: mockUser,
      isLoading: false,
      error: null,
      refreshAuth: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      logout: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      oidcEnabled: false,
    });

    // Setup default successful API responses
    mockGetWorkItem.mockResolvedValue(mockWorkItem);
    mockListNotes.mockResolvedValue({ notes: [] });
    mockListSubtasks.mockResolvedValue({ subtasks: [] });
    mockGetDependencies.mockResolvedValue({ predecessors: [], successors: [] });
    mockFetchTags.mockResolvedValue({ tags: [] });
    mockListUsers.mockResolvedValue({ users: [] });
  });

  function renderPage(id = 'work-1') {
    return render(
      <MemoryRouter initialEntries={[`/work-items/${id}`]}>
        <Routes>
          <Route path="/work-items/:id" element={<WorkItemDetailPageModule.default />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  describe('initial render', () => {
    it('shows loading state initially', async () => {
      renderPage();

      expect(screen.getByText('Loading work item...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Loading work item...')).not.toBeInTheDocument();
      });
    });

    it('renders work item title after loading', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Test Work Item')).toBeInTheDocument();
      });
    });

    it('renders work item description', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('This is a test work item')).toBeInTheDocument();
      });
    });

    it('renders all property sections', async () => {
      renderPage();

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
      mockGetWorkItem.mockRejectedValue({ statusCode: 404 });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Work item not found')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /back to work items/i })).toBeInTheDocument();
    });

    it('shows generic error message on other errors', async () => {
      mockGetWorkItem.mockRejectedValue(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Failed to load work item. Please try again.')).toBeInTheDocument();
      });
    });
  });

  describe('work item with no description', () => {
    it('shows placeholder text when description is null', async () => {
      const workItemNoDescription = { ...mockWorkItem, description: null };
      mockGetWorkItem.mockResolvedValue(workItemNoDescription);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('No description')).toBeInTheDocument();
      });
    });
  });

  describe('notes display', () => {
    it('shows empty state when no notes exist', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('No notes yet')).toBeInTheDocument();
      });
    });

    it('renders existing notes', async () => {
      mockListNotes.mockResolvedValue({
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

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('First note')).toBeInTheDocument();
      });

      expect(screen.getByText('Test User')).toBeInTheDocument();
    });
  });

  describe('subtasks display', () => {
    it('shows empty state when no subtasks exist', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('No subtasks yet')).toBeInTheDocument();
      });
    });

    it('renders existing subtasks', async () => {
      mockListSubtasks.mockResolvedValue({
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

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('First subtask')).toBeInTheDocument();
      });
    });
  });

  describe('dependencies display', () => {
    it('shows empty state when no dependencies exist', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('No dependencies')).toBeInTheDocument();
      });

      expect(screen.getByText('No items blocked')).toBeInTheDocument();
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

      mockGetDependencies.mockResolvedValue({
        predecessors: [
          {
            workItem: predecessorWorkItem,
            dependencyType: 'finish_to_start',
          },
        ],
        successors: [],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Foundation work')).toBeInTheDocument();
      });

      // Query within "Depends On" list to avoid matching the form dropdown
      const predecessorsList = screen.getByText('Depends On').closest('div');
      expect(predecessorsList).toHaveTextContent('Finish-to-Start');
    });
  });
});
