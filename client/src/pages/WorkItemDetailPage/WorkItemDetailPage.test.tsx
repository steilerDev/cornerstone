/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { WorkItemDetail, WorkItemSummary } from '@cornerstone/shared';
import type * as AuthContextTypes from '../../contexts/AuthContext.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as WorkItemBudgetsApiTypes from '../../lib/workItemBudgetsApi.js';
import type * as NotesApiTypes from '../../lib/notesApi.js';
import type * as SubtasksApiTypes from '../../lib/subtasksApi.js';
import type * as DependenciesApiTypes from '../../lib/dependenciesApi.js';
import type * as TagsApiTypes from '../../lib/tagsApi.js';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as BudgetCategoriesApiTypes from '../../lib/budgetCategoriesApi.js';
import type * as BudgetSourcesApiTypes from '../../lib/budgetSourcesApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as SubsidyProgramsApiTypes from '../../lib/subsidyProgramsApi.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as WorkItemMilestonesApiTypes from '../../lib/workItemMilestonesApi.js';
import type * as HouseholdItemWorkItemsApiTypes from '../../lib/householdItemWorkItemsApi.js';
import type * as WorkItemDetailPageTypes from './WorkItemDetailPage.js';

// Module-scope mocks
const mockUseAuth = jest.fn<typeof AuthContextTypes.useAuth>();
const mockGetWorkItem = jest.fn<typeof WorkItemsApiTypes.getWorkItem>();
const mockUpdateWorkItem = jest.fn<typeof WorkItemsApiTypes.updateWorkItem>();
const mockDeleteWorkItem = jest.fn<typeof WorkItemsApiTypes.deleteWorkItem>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockFetchWorkItemSubsidies = jest.fn<typeof WorkItemsApiTypes.fetchWorkItemSubsidies>();
const mockLinkWorkItemSubsidy = jest.fn<typeof WorkItemsApiTypes.linkWorkItemSubsidy>();
const mockUnlinkWorkItemSubsidy = jest.fn<typeof WorkItemsApiTypes.unlinkWorkItemSubsidy>();
const mockFetchWorkItemSubsidyPayback =
  jest.fn<typeof WorkItemsApiTypes.fetchWorkItemSubsidyPayback>();
const mockFetchWorkItemBudgets = jest.fn<typeof WorkItemBudgetsApiTypes.fetchWorkItemBudgets>();
const mockCreateWorkItemBudget = jest.fn<typeof WorkItemBudgetsApiTypes.createWorkItemBudget>();
const mockUpdateWorkItemBudget = jest.fn<typeof WorkItemBudgetsApiTypes.updateWorkItemBudget>();
const mockDeleteWorkItemBudget = jest.fn<typeof WorkItemBudgetsApiTypes.deleteWorkItemBudget>();
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
const mockFetchBudgetCategories = jest.fn<typeof BudgetCategoriesApiTypes.fetchBudgetCategories>();
const mockFetchBudgetSources = jest.fn<typeof BudgetSourcesApiTypes.fetchBudgetSources>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchSubsidyPrograms = jest.fn<typeof SubsidyProgramsApiTypes.fetchSubsidyPrograms>();
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
const mockGetWorkItemMilestones =
  jest.fn<typeof WorkItemMilestonesApiTypes.getWorkItemMilestones>();
const mockAddRequiredMilestone = jest.fn<typeof WorkItemMilestonesApiTypes.addRequiredMilestone>();
const mockRemoveRequiredMilestone =
  jest.fn<typeof WorkItemMilestonesApiTypes.removeRequiredMilestone>();
const mockAddLinkedMilestone = jest.fn<typeof WorkItemMilestonesApiTypes.addLinkedMilestone>();
const mockRemoveLinkedMilestone =
  jest.fn<typeof WorkItemMilestonesApiTypes.removeLinkedMilestone>();
const mockFetchLinkedHouseholdItems =
  jest.fn<typeof HouseholdItemWorkItemsApiTypes.fetchLinkedHouseholdItems>();

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
  fetchWorkItemSubsidies: mockFetchWorkItemSubsidies,
  linkWorkItemSubsidy: mockLinkWorkItemSubsidy,
  unlinkWorkItemSubsidy: mockUnlinkWorkItemSubsidy,
  fetchWorkItemSubsidyPayback: mockFetchWorkItemSubsidyPayback,
}));

jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  fetchWorkItemBudgets: mockFetchWorkItemBudgets,
  createWorkItemBudget: mockCreateWorkItemBudget,
  updateWorkItemBudget: mockUpdateWorkItemBudget,
  deleteWorkItemBudget: mockDeleteWorkItemBudget,
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

jest.unstable_mockModule('../../lib/budgetCategoriesApi.js', () => ({
  fetchBudgetCategories: mockFetchBudgetCategories,
}));

jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
}));

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
}));

jest.unstable_mockModule('../../lib/subsidyProgramsApi.js', () => ({
  fetchSubsidyPrograms: mockFetchSubsidyPrograms,
}));

jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  listMilestones: mockListMilestones,
  getMilestone: jest.fn(),
  createMilestone: jest.fn(),
  updateMilestone: jest.fn(),
  deleteMilestone: jest.fn(),
  linkWorkItem: jest.fn(),
  unlinkWorkItem: jest.fn(),
  addDependentWorkItem: jest.fn(),
  removeDependentWorkItem: jest.fn(),
}));

jest.unstable_mockModule('../../lib/workItemMilestonesApi.js', () => ({
  getWorkItemMilestones: mockGetWorkItemMilestones,
  addRequiredMilestone: mockAddRequiredMilestone,
  removeRequiredMilestone: mockRemoveRequiredMilestone,
  addLinkedMilestone: mockAddLinkedMilestone,
  removeLinkedMilestone: mockRemoveLinkedMilestone,
}));

jest.unstable_mockModule('../../lib/householdItemWorkItemsApi.js', () => ({
  fetchLinkedHouseholdItems: mockFetchLinkedHouseholdItems,
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
    actualStartDate: null,
    actualEndDate: null,
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
    budgets: [],
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
    mockFetchWorkItemSubsidies.mockReset();
    mockLinkWorkItemSubsidy.mockReset();
    mockUnlinkWorkItemSubsidy.mockReset();
    mockFetchWorkItemSubsidyPayback.mockReset();
    mockFetchWorkItemBudgets.mockReset();
    mockCreateWorkItemBudget.mockReset();
    mockUpdateWorkItemBudget.mockReset();
    mockDeleteWorkItemBudget.mockReset();
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
    mockFetchBudgetCategories.mockReset();
    mockFetchBudgetSources.mockReset();
    mockFetchVendors.mockReset();
    mockFetchSubsidyPrograms.mockReset();
    mockListMilestones.mockReset();
    mockGetWorkItemMilestones.mockReset();
    mockAddRequiredMilestone.mockReset();
    mockRemoveRequiredMilestone.mockReset();
    mockAddLinkedMilestone.mockReset();
    mockRemoveLinkedMilestone.mockReset();
    mockFetchLinkedHouseholdItems.mockReset();

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
    // WorkItemPicker in DependencySentenceBuilder may call listWorkItems on focus
    mockListWorkItems.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 15, totalItems: 0, totalPages: 0 },
    });
    // Budget-related defaults
    mockFetchBudgetCategories.mockResolvedValue({ categories: [] });
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
    mockFetchVendors.mockResolvedValue({
      vendors: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    });
    mockFetchWorkItemBudgets.mockResolvedValue([]);
    mockFetchSubsidyPrograms.mockResolvedValue({ subsidyPrograms: [] });
    mockFetchWorkItemSubsidies.mockResolvedValue([]);
    mockFetchWorkItemSubsidyPayback.mockResolvedValue({
      workItemId: 'work-1',
      minTotalPayback: 0,
      maxTotalPayback: 0,
      subsidies: [],
    });
    // Milestone-related defaults
    mockListMilestones.mockResolvedValue([]);
    mockGetWorkItemMilestones.mockResolvedValue({ required: [], linked: [] });
    // Household item work items defaults
    mockFetchLinkedHouseholdItems.mockResolvedValue([]);
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
        expect(
          screen.getByRole('heading', { name: 'Test Work Item', level: 1 }),
        ).toBeInTheDocument();
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
      expect(screen.getByRole('heading', { name: 'Budget', level: 2 })).toBeInTheDocument();
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

  describe('Schedule section — read-only date fields', () => {
    it('renders Schedule section heading', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Schedule')).toBeInTheDocument();
      });
    });

    it('renders startDate as read-only text (not an input)', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Start Date')).toBeInTheDocument();
      });

      // startDate '2024-01-01' should appear as formatted text, not an input
      // (Constraints section has startAfter/startBefore date inputs, not startDate/endDate)
      const startDateLabel = screen.getByText('Start Date');
      // The sibling/nearby element should be a span, not an input
      const propertyValue = startDateLabel.closest('[class]')?.querySelector('span:last-child');
      expect(propertyValue?.tagName).not.toBe('INPUT');
    });

    it('renders endDate as read-only text (not an input)', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('End Date')).toBeInTheDocument();
      });

      const endDateLabel = screen.getByText('End Date');
      const propertyValue = endDateLabel.closest('[class]')?.querySelector('span:last-child');
      expect(propertyValue?.tagName).not.toBe('INPUT');
    });

    it('renders "Not scheduled" for null startDate', async () => {
      const workItemNoStart = { ...mockWorkItem, startDate: null };
      mockGetWorkItem.mockResolvedValue(workItemNoStart);

      renderPage();

      await waitFor(() => {
        // Should find "Not scheduled" text near the start date label
        expect(screen.getAllByText('Not scheduled').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders "Not scheduled" for null endDate', async () => {
      const workItemNoEnd = { ...mockWorkItem, endDate: null };
      mockGetWorkItem.mockResolvedValue(workItemNoEnd);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Not scheduled').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders "Not scheduled" for both dates when both are null', async () => {
      const workItemNoDates = { ...mockWorkItem, startDate: null, endDate: null };
      mockGetWorkItem.mockResolvedValue(workItemNoDates);

      renderPage();

      await waitFor(() => {
        // Both dates should show "Not scheduled"
        expect(screen.getAllByText('Not scheduled')).toHaveLength(2);
      });
    });

    it('renders description text explaining dates are computed by scheduling engine', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/computed by the scheduling engine/i)).toBeInTheDocument();
      });
    });
  });

  describe('Constraints section', () => {
    it('renders Constraints section heading', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Constraints')).toBeInTheDocument();
      });
    });

    it('renders duration input in Constraints section (editable number input)', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Duration (days)')).toBeInTheDocument();
      });

      // Duration should be an editable number input — find inputs with type="number"
      // that are siblings to the Duration label inside the constraints section
      const durationLabel = screen.getByText('Duration (days)');
      // The label and input are siblings inside a property div
      const propertyDiv = durationLabel.parentElement;
      const durationInput = propertyDiv?.querySelector('input[type="number"]');
      expect(durationInput).toBeInTheDocument();
      expect((durationInput as HTMLInputElement)?.disabled).toBe(false);
    });

    it('renders startAfter date input in Constraints section', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Start After')).toBeInTheDocument();
      });

      const startAfterLabel = screen.getByText('Start After');
      const propertyDiv = startAfterLabel.parentElement;
      const dateInput = propertyDiv?.querySelector('input[type="date"]');
      expect(dateInput).toBeInTheDocument();
      expect((dateInput as HTMLInputElement)?.disabled).toBe(false);
    });

    it('renders startBefore date input in Constraints section', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Start Before')).toBeInTheDocument();
      });

      const startBeforeLabel = screen.getByText('Start Before');
      const propertyDiv = startBeforeLabel.parentElement;
      const dateInput = propertyDiv?.querySelector('input[type="date"]');
      expect(dateInput).toBeInTheDocument();
      expect((dateInput as HTMLInputElement)?.disabled).toBe(false);
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
    });

    it('renders existing predecessors with sentence group header', async () => {
      const predecessorWorkItem: WorkItemSummary = {
        id: 'work-0',
        title: 'Foundation work',
        status: 'completed',
        startDate: null,
        endDate: null,
        durationDays: null,
        actualStartDate: null,
        actualEndDate: null,
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
            leadLagDays: 0,
          },
        ],
        successors: [],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Foundation work')).toBeInTheDocument();
      });

      // The new sentence builder shows predecessors under a group header like:
      // "Must finish before this can start:"
      expect(screen.getByText(/must finish before/i)).toBeInTheDocument();
    });

    it('renders existing successors with sentence group header', async () => {
      const successorWorkItem: WorkItemSummary = {
        id: 'work-3',
        title: 'Roofing',
        status: 'not_started',
        startDate: null,
        endDate: null,
        durationDays: null,
        actualStartDate: null,
        actualEndDate: null,
        assignedUser: null,
        tags: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockGetDependencies.mockResolvedValue({
        predecessors: [],
        successors: [
          {
            workItem: successorWorkItem,
            dependencyType: 'finish_to_start',
            leadLagDays: 0,
          },
        ],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Roofing')).toBeInTheDocument();
      });

      // Successors show "This must finish before ... can start:" header
      expect(screen.getByText(/this must finish before/i)).toBeInTheDocument();
    });

    it('renders dependency sentence builder form', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      // The sentence builder contains verb selects
      expect(screen.getByRole('combobox', { name: /predecessor verb/i })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /successor verb/i })).toBeInTheDocument();
      // Conjunction words indicate the sentence builder form is rendered
      expect(screen.getByText('must')).toBeInTheDocument();
      expect(screen.getByText('before')).toBeInTheDocument();
      expect(screen.getByText('can')).toBeInTheDocument();
    });

    it('does not render direction toggle buttons (old UX removed)', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      // Old direction toggle buttons should NOT be present
      expect(
        screen.queryByRole('button', { name: /this item depends on/i }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /this item blocks/i })).not.toBeInTheDocument();
    });
  });

  // ── Linked/Dependent Household Items section (Story #415) ──────────────────

  describe('Linked Household Items section', () => {
    it('renders "Dependent Household Items" section heading', async () => {
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Test Work Item', level: 1 }),
        ).toBeInTheDocument();
      });

      // Section heading appears on the page
      expect(screen.getByText('Dependent Household Items')).toBeInTheDocument();
    });

    it('shows empty state text when no household items are linked', async () => {
      mockFetchLinkedHouseholdItems.mockResolvedValue([]);

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Test Work Item', level: 1 }),
        ).toBeInTheDocument();
      });

      expect(screen.getByText('No household items depend on this work item.')).toBeInTheDocument();
    });

    it('renders linked household items when data is present', async () => {
      mockFetchLinkedHouseholdItems.mockResolvedValue([
        {
          id: 'hi-1',
          name: 'Leather Sofa',
          category: 'furniture' as const,
          status: 'planned' as const,
          targetDeliveryDate: null,
          earliestDeliveryDate: '2026-05-15',
          latestDeliveryDate: '2026-06-01',
        },
      ]);

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Test Work Item', level: 1 }),
        ).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Leather Sofa')).toBeInTheDocument();
      });
    });

    it('shows earliestDeliveryDate and latestDeliveryDate as a date range', async () => {
      mockFetchLinkedHouseholdItems.mockResolvedValue([
        {
          id: 'hi-2',
          name: 'Dining Table',
          category: 'furniture' as const,
          status: 'purchased' as const,
          targetDeliveryDate: '2026-06-01',
          earliestDeliveryDate: '2026-05-20',
          latestDeliveryDate: '2026-06-10',
        },
      ]);

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Test Work Item', level: 1 }),
        ).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Dining Table')).toBeInTheDocument();
      });

      // The date range should be rendered (e.g., "May 20, 2026 – Jun 10, 2026")
      // We check for the "–" separator that indicates a range
      const dateRangeEl = screen.getByText(/–/);
      expect(dateRangeEl).toBeInTheDocument();
    });

    it('falls back to targetDeliveryDate when no scheduling window dates', async () => {
      mockFetchLinkedHouseholdItems.mockResolvedValue([
        {
          id: 'hi-3',
          name: 'Lamp',
          category: 'decor' as const,
          status: 'planned' as const,
          targetDeliveryDate: '2026-04-15',
          earliestDeliveryDate: null,
          latestDeliveryDate: null,
        },
      ]);

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Test Work Item', level: 1 }),
        ).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Lamp')).toBeInTheDocument();
      });

      // Should fall back to rendering targetDeliveryDate (no "–" separator)
      // The text contains the formatted expected date without a range separator
      expect(screen.queryByText(/–/)).not.toBeInTheDocument();
    });

    it('renders multiple linked household items', async () => {
      mockFetchLinkedHouseholdItems.mockResolvedValue([
        {
          id: 'hi-a',
          name: 'Sofa',
          category: 'furniture' as const,
          status: 'planned' as const,
          targetDeliveryDate: null,
          earliestDeliveryDate: '2026-05-15',
          latestDeliveryDate: '2026-06-01',
        },
        {
          id: 'hi-b',
          name: 'Chair',
          category: 'furniture' as const,
          status: 'purchased' as const,
          targetDeliveryDate: null,
          earliestDeliveryDate: '2026-06-10',
          latestDeliveryDate: '2026-07-01',
        },
      ]);

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Test Work Item', level: 1 }),
        ).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Sofa')).toBeInTheDocument();
      });

      expect(screen.getByText('Chair')).toBeInTheDocument();
    });

    it('shows count badge in section heading when items exist', async () => {
      mockFetchLinkedHouseholdItems.mockResolvedValue([
        {
          id: 'hi-count',
          name: 'Fridge',
          category: 'appliances' as const,
          status: 'purchased' as const,
          targetDeliveryDate: null,
          earliestDeliveryDate: '2026-04-01',
          latestDeliveryDate: '2026-04-15',
        },
      ]);

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Test Work Item', level: 1 }),
        ).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Fridge')).toBeInTheDocument();
      });

      // Count badge "1" should be visible in the heading area
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });
});
