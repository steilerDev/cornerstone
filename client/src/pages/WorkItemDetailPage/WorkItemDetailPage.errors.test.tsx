/**
 * @jest-environment jsdom
 *
 * #2129 — error-translation tests for WorkItemDetailPage's budget / subsidy / invoice / move
 * handlers. BudgetSection is replaced by a prop-capturing stub so the page's own handlers can
 * be invoked directly.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, waitFor, act, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { WorkItemDetail, ErrorCode } from '@cornerstone/shared';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { LocalizedError } from '../../lib/localizedError.js';
import enErrors from '../../i18n/en/errors.json';
import enCommon from '../../i18n/en/common.json';
import enWorkItems from '../../i18n/en/workItems.json';
import enBudget from '../../i18n/en/budget.json';
import type * as AuthContextTypes from '../../contexts/AuthContext.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as WorkItemBudgetsApiTypes from '../../lib/workItemBudgetsApi.js';
import type * as NotesApiTypes from '../../lib/notesApi.js';
import type * as SubtasksApiTypes from '../../lib/subtasksApi.js';
import type * as DependenciesApiTypes from '../../lib/dependenciesApi.js';
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

const mockDeleteInvoiceBudgetLine = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockEditAndMoveBudgetLine = jest.fn<(...args: unknown[]) => Promise<unknown>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedBudgetSectionProps: any = null;

// Keep the linked-documents section from failing on mount: its network-error banner would reuse
// the common network copy and collide with the copy these tests count.
jest.unstable_mockModule('../../lib/documentLinksApi.js', () => ({
  listDocumentLinks: jest.fn(() => Promise.resolve([])),
  createDocumentLink: jest.fn(),
  deleteDocumentLink: jest.fn(),
  listAllLinkedDocumentIds: jest.fn(() => Promise.resolve([])),
  updateDocumentLinkAttachmentType: jest.fn(),
}));

jest.unstable_mockModule('../../lib/invoiceBudgetLinesApi.js', () => ({
  fetchInvoiceBudgetLines: jest.fn(),
  createInvoiceBudgetLine: jest.fn(),
  updateInvoiceBudgetLine: jest.fn(),
  deleteInvoiceBudgetLine: mockDeleteInvoiceBudgetLine,
  editAndMoveBudgetLine: mockEditAndMoveBudgetLine,
}));

jest.unstable_mockModule('../../components/budget/BudgetSection.js', () => ({
  // Mirrors the real BudgetSection: it renders its inlineError prop in its own alert banner
  BudgetSection: (props: { inlineError?: string | null; onDismissInlineError?: () => void }) => {
    capturedBudgetSectionProps = props;
    return props.inlineError ? (
      <div role="alert" data-testid="budget-banner">
        {props.inlineError}
        {props.onDismissInlineError && (
          <button type="button" onClick={props.onDismissInlineError}>
            dismiss
          </button>
        )}
      </div>
    ) : null;
  },
}));

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

// Mock useAreas hook — WorkItemDetailPage uses useAreas to render AreaPicker
const mockUseAreas = jest.fn(() => ({
  areas: [],
  isLoading: false,
  error: null,
  refetch: jest.fn(),
  createArea: jest.fn(),
  updateArea: jest.fn(),
  deleteArea: jest.fn(),
}));
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: mockUseAreas,
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
    assignedVendor: null,
    area: null,
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
      <MemoryRouter initialEntries={[`/project/work-items/${id}`]}>
        <Routes>
          <Route path="/project/work-items/:id" element={<WorkItemDetailPageModule.default />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  const SENTINEL = 'RAW-SERVER-SENTINEL';
  const apiError = (status: number, code: ErrorCode) =>
    new ApiClientError(status, { code, message: SENTINEL });

  const budgetLine = (invoiced = false) => ({
    id: 'bl-1',
    workItemId: 'work-1',
    description: null,
    plannedAmount: 500,
    confidence: 'own_estimate' as const,
    confidenceMargin: 0.2,
    budgetCategory: null,
    budgetSource: null,
    vendor: null,
    actualCost: 0,
    actualCostPaid: 0,
    invoiceCount: invoiced ? 1 : 0,
    invoiceLink: invoiced
      ? {
          invoiceBudgetLineId: 'ibl-1',
          invoiceId: 'inv-1',
          invoiceNumber: null,
          invoiceDate: '2026-01-01',
          invoiceStatus: 'pending',
          itemizedAmount: 500,
          vendorId: null,
          vendorName: null,
        }
      : null,
    createdBy: null,
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
    quantity: null,
    unit: null,
    unitPrice: null,
    includesVat: true,
  });

  async function load(invoiced = false) {
    capturedBudgetSectionProps = null;
    mockFetchWorkItemBudgets.mockResolvedValue([budgetLine(invoiced)]);
    mockDeleteInvoiceBudgetLine.mockReset();
    mockEditAndMoveBudgetLine.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    renderPage();
    await waitFor(() => {
      expect(capturedBudgetSectionProps?.budgetLines).toHaveLength(1);
    });
  }

  // Budget-originated errors render once, in the BudgetSection banner, and never in the top banner
  const expectBudgetError = (text: string) =>
    waitFor(() => {
      const matches = screen.getAllByText(text);
      expect(matches).toHaveLength(1);
      expect(matches[0]!.closest('[role="alert"]')).toBe(screen.getByTestId('budget-banner'));
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(capturedBudgetSectionProps.inlineError).toBe(text);
    });

  async function confirmDelete() {
    await act(async () => {
      capturedBudgetSectionProps.budgetSectionHook.handleDeleteBudgetLine('bl-1');
    });
    await act(async () => {
      await capturedBudgetSectionProps.onConfirmDeleteBudgetLine();
    });
  }

  describe('delete budget line', () => {
    it('ApiClientError shows the code copy, never the server text', async () => {
      await load();
      mockDeleteWorkItemBudget.mockRejectedValue(apiError(409, 'CONFLICT'));
      await confirmDelete();
      await expectBudgetError(enErrors.CONFLICT);
    });

    it('NetworkError shows the network copy', async () => {
      await load();
      mockDeleteWorkItemBudget.mockRejectedValue(new NetworkError('RAW-LOCAL', new Error('c')));
      await confirmDelete();
      await expectBudgetError(enCommon.requestErrors.network);
    });

    it('any other error shows the deleteFailed copy', async () => {
      await load();
      mockDeleteWorkItemBudget.mockRejectedValue(new Error('RAW-LOCAL'));
      await confirmDelete();
      await expectBudgetError(enBudget.budgetLineForm.errors.deleteFailed);
    });
  });

  describe('subsidy linking', () => {
    async function link(rejection: unknown) {
      await load();
      mockLinkWorkItemSubsidy.mockRejectedValue(rejection);
      await act(async () => {
        capturedBudgetSectionProps.budgetSectionHook.setSelectedSubsidyId('sub-1');
      });
      await act(async () => {
        await capturedBudgetSectionProps.onLinkSubsidy();
      });
    }

    it('dismissing the budget banner clears the budget error', async () => {
      await link(new Error('RAW-LOCAL'));
      await expectBudgetError(enWorkItems.detail.inlineErrors.linkSubsidy);

      await act(async () => {
        screen.getByRole('button', { name: 'dismiss' }).click();
      });

      expect(screen.queryByTestId('budget-banner')).toBeNull();
      expect(capturedBudgetSectionProps.inlineError ?? null).toBeNull();
    });

    it('a successful budget-line delete clears a stale budget error', async () => {
      await link(new Error('RAW-LOCAL'));
      await expectBudgetError(enWorkItems.detail.inlineErrors.linkSubsidy);

      mockDeleteWorkItemBudget.mockResolvedValue(undefined);
      await confirmDelete();

      await waitFor(() => {
        expect(screen.queryByTestId('budget-banner')).toBeNull();
      });
      expect(capturedBudgetSectionProps.inlineError ?? null).toBeNull();
    });

    it('409 shows the already-linked copy', async () => {
      await link(apiError(409, 'CONFLICT'));
      await expectBudgetError(enWorkItems.detail.inlineErrors.alreadyLinkedSubsidy);
    });

    it('other ApiClientError shows the code copy, never the server text', async () => {
      await link(apiError(500, 'INTERNAL_ERROR'));
      await expectBudgetError(enErrors.INTERNAL_ERROR);
    });

    it('NetworkError shows the network copy', async () => {
      await link(new NetworkError('RAW-LOCAL', new Error('c')));
      await expectBudgetError(enCommon.requestErrors.network);
    });

    it('any other error shows the linkSubsidy copy', async () => {
      await link(new Error('RAW-LOCAL'));
      await expectBudgetError(enWorkItems.detail.inlineErrors.linkSubsidy);
    });

    it('unlink failure shows the unlinkSubsidy copy', async () => {
      await load();
      mockUnlinkWorkItemSubsidy.mockRejectedValue(new Error('RAW-LOCAL'));
      await act(async () => {
        await capturedBudgetSectionProps.onUnlinkSubsidy('sub-1');
      });
      await expectBudgetError(enWorkItems.detail.inlineErrors.unlinkSubsidy);
    });
  });

  describe('invoice unlink', () => {
    it('failure shows the unlinkInvoice copy', async () => {
      await load(true);
      mockDeleteInvoiceBudgetLine.mockRejectedValue(new Error('RAW-LOCAL'));
      await act(async () => {
        await capturedBudgetSectionProps.onUnlinkInvoice('bl-1', 'ibl-1');
      });
      await expectBudgetError(enWorkItems.detail.inlineErrors.unlinkInvoice);
    });
  });

  describe('move budget line', () => {
    async function move(
      invoiced: boolean,
      type: 'work_item' | 'household_item',
      rejection?: unknown,
    ) {
      await load(invoiced);
      if (rejection !== undefined) {
        mockEditAndMoveBudgetLine.mockRejectedValue(rejection);
        mockUpdateWorkItemBudget.mockRejectedValue(rejection);
      }
      let thrown: unknown;
      await act(async () => {
        try {
          await capturedBudgetSectionProps.onMoveBudgetLine('bl-1', type, 'target-1');
        } catch (err) {
          thrown = err;
        }
      });
      return thrown;
    }

    it('invoice-linked move: ApiClientError is rethrown untouched and shown nowhere on the page', async () => {
      const err = apiError(404, 'NOT_FOUND');
      expect(await move(true, 'household_item', err)).toBe(err);
      // The picker owns the message; the page neither banners it nor passes it to BudgetSection
      expect(screen.queryByText(enErrors.NOT_FOUND)).toBeNull();
      expect(screen.queryAllByRole('alert')).toHaveLength(0);
      expect(capturedBudgetSectionProps.inlineError ?? null).toBeNull();
    });

    it('NetworkError is rethrown untouched and not bannered', async () => {
      const err = new NetworkError('RAW-LOCAL', new Error('c'));
      expect(await move(false, 'work_item', err)).toBe(err);
      expect(screen.queryByText(enCommon.requestErrors.network)).toBeNull();
      expect(screen.queryAllByRole('alert')).toHaveLength(0);
    });

    it('cross-table move without an invoice throws a LocalizedError with the translated copy', async () => {
      const thrown = await move(false, 'household_item');
      expect(thrown).toBeInstanceOf(LocalizedError);
      expect((thrown as Error).message).toBe(enBudget.budgetLineForm.moveCrossTableNoInvoiceError);
      expect(mockUpdateWorkItemBudget).not.toHaveBeenCalled();
      expect(screen.queryAllByRole('alert')).toHaveLength(0);
    });

    it('a non-Error rejection is rethrown as-is and not bannered', async () => {
      expect(await move(false, 'work_item', 'plain string')).toBe('plain string');
      expect(screen.queryAllByRole('alert')).toHaveLength(0);
    });
  });
});
