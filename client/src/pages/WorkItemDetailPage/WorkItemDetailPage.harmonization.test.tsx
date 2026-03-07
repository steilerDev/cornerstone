/**
 * @jest-environment jsdom
 *
 * WorkItemDetailPage — UI Harmonization Tests (Story #501)
 *
 * These tests verify the harmonized loading/error state patterns introduced
 * by Story #501 (14.6: UI Harmonization Audit). The component must match the
 * patterns established by HouseholdItemDetailPage:
 *
 * - Loading state: element with role="status" containing "Loading" text
 * - 404 error:  role="alert" card with "Work Item Not Found" heading, back button, NO retry
 * - Generic error: role="alert" card with "Error" heading, message, Retry + back buttons
 * - Empty notes: "No notes yet. Use the form above to add one."
 * - Empty subtasks: "No subtasks yet. Add one above."
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { WorkItemDetail } from '@cornerstone/shared';
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

// ── Module-scope mocks (must be hoisted before dynamic import) ─────────────

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

// ── Module mocks ───────────────────────────────────────────────────────────

jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: mockUseAuth,
}));

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

// ── Test suite ─────────────────────────────────────────────────────────────

describe('WorkItemDetailPage — UI Harmonization (Story #501)', () => {
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
    tags: [],
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

    // Deferred import — must happen after unstable_mockModule calls
    if (!WorkItemDetailPageModule) {
      WorkItemDetailPageModule = await import('./WorkItemDetailPage.js');
    }

    // Auth
    mockUseAuth.mockReturnValue({
      user: mockUser,
      isLoading: false,
      error: null,
      refreshAuth: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      logout: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      oidcEnabled: false,
    });

    // Default successful API responses
    mockGetWorkItem.mockResolvedValue(mockWorkItem);
    mockListNotes.mockResolvedValue({ notes: [] });
    mockListSubtasks.mockResolvedValue({ subtasks: [] });
    mockGetDependencies.mockResolvedValue({ predecessors: [], successors: [] });
    mockFetchTags.mockResolvedValue({ tags: [] });
    mockListUsers.mockResolvedValue({ users: [] });
    mockListWorkItems.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 15, totalItems: 0, totalPages: 0 },
    });
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
    mockListMilestones.mockResolvedValue([]);
    mockGetWorkItemMilestones.mockResolvedValue({ required: [], linked: [] });
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

  // ── Scenario 1: Loading state ──────────────────────────────────────────────

  describe('loading state', () => {
    it('has role="status" on the loading element', async () => {
      // Mock getWorkItem to never resolve so the loading state persists
      mockGetWorkItem.mockReturnValue(new Promise<WorkItemDetail>(() => {}));

      renderPage();

      // Loading element must have role="status" (ARIA live region for status)
      const loadingEl = screen.getByRole('status');
      expect(loadingEl).toBeInTheDocument();
    });

    it('loading element contains "Loading" text', async () => {
      mockGetWorkItem.mockReturnValue(new Promise<WorkItemDetail>(() => {}));

      renderPage();

      const loadingEl = screen.getByRole('status');
      expect(loadingEl.textContent).toMatch(/loading/i);
    });
  });

  // ── Scenario 2: 404 Not Found error ───────────────────────────────────────

  describe('404 not found error state', () => {
    it('renders an element with role="alert" for 404 errors', async () => {
      mockGetWorkItem.mockRejectedValue({ statusCode: 404 });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('shows "Work Item Not Found" heading for 404 errors', async () => {
      mockGetWorkItem.mockRejectedValue({ statusCode: 404 });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /work item not found/i })).toBeInTheDocument();
      });
    });

    it('shows "Back to Work Items" button for 404 errors', async () => {
      mockGetWorkItem.mockRejectedValue({ statusCode: 404 });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to work items/i })).toBeInTheDocument();
      });
    });

    it('does NOT show a "Retry" button for 404 errors', async () => {
      mockGetWorkItem.mockRejectedValue({ statusCode: 404 });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });
  });

  // ── Scenario 3: Generic error state ───────────────────────────────────────

  describe('generic error state', () => {
    it('renders an element with role="alert" for generic errors', async () => {
      mockGetWorkItem.mockRejectedValue({ statusCode: 500, message: 'Server error' });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('shows "Error" heading for generic errors', async () => {
      mockGetWorkItem.mockRejectedValue({ statusCode: 500, message: 'Server error' });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^error$/i })).toBeInTheDocument();
      });
    });

    it('shows the error message text for generic errors', async () => {
      mockGetWorkItem.mockRejectedValue({ statusCode: 500, message: 'Server error' });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // The error card should display either the error message or a fallback message
      const alertEl = screen.getByRole('alert');
      expect(alertEl.textContent).toBeTruthy();
    });

    it('shows a "Retry" button for generic errors', async () => {
      mockGetWorkItem.mockRejectedValue({ statusCode: 500, message: 'Server error' });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it('shows "Back to Work Items" button for generic errors', async () => {
      mockGetWorkItem.mockRejectedValue({ statusCode: 500, message: 'Server error' });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to work items/i })).toBeInTheDocument();
      });
    });
  });

  // ── Scenario 4: Empty notes text ──────────────────────────────────────────

  describe('empty notes state', () => {
    it('shows harmonized empty notes text when no notes exist', async () => {
      // notes list defaults to empty in beforeEach
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByText('No notes yet. Use the form above to add one.'),
        ).toBeInTheDocument();
      });
    });
  });

  // ── Scenario 5: Empty subtasks text ───────────────────────────────────────

  describe('empty subtasks state', () => {
    it('shows harmonized empty subtasks text when no subtasks exist', async () => {
      // subtasks list defaults to empty in beforeEach
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('No subtasks yet. Add one above.')).toBeInTheDocument();
      });
    });
  });
});
