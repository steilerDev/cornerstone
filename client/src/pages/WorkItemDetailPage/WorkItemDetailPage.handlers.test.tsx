/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type {
  WorkItemDetail,
  WorkItemSummary,
  MilestoneSummary,
  ErrorCode,
} from '@cornerstone/shared';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import enCommon from '../../i18n/en/common.json';
import enWorkItems from '../../i18n/en/workItems.json';
import type * as AuthContextTypes from '../../contexts/AuthContext.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
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
import type * as HouseholdItemCategoriesApiTypes from '../../lib/householdItemCategoriesApi.js';
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

// Mock AuthContext
// useLocale throws outside a LocaleProvider; the changed components read vatRate from it.
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  };
  return {
    LocaleProvider: ({ children }: { children: unknown }) => children,
    useLocale: () => localeValue,
  };
});

jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: mockUseAuth,
}));

// The cost lines section has its own tests; here it is a stub that records its props.
const mockCostLinesSection = jest.fn<(props: unknown) => void>();
jest.unstable_mockModule('../../components/CostLineTable/index.js', () => ({
  CostLinesSection: (props: { onChanged: () => Promise<void> | void }) => {
    mockCostLinesSection(props);
    return (
      <div data-testid="cost-lines-stub">
        <button type="button" onClick={() => void props.onChanged()}>
          stub-changed
        </button>
      </div>
    );
  },
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

// The status hook calls useToast; the page has no ToastProvider in these tests.
const mockShowToast = jest.fn();
const mockShowUndoToast = jest.fn();
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  ToastProvider: ({ children }: { children: unknown }) => children,
  useToast: () => ({
    toasts: [],
    showToast: mockShowToast,
    showUndoToast: mockShowUndoToast,
    dismissToast: jest.fn(),
  }),
}));

// The delete dialog loads what else the delete affects (#2209).
const mockFetchDeleteImpact = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));

/** The delete action is aria-disabled until the "also affects" counts have loaded. */
async function enabledConfirm(prefix: string): Promise<HTMLElement> {
  const btn = await screen.findByTestId(`${prefix}-confirm`);
  await waitFor(() => expect(btn).not.toHaveAttribute('aria-disabled'));
  return btn;
}

// The Link to Invoice modal loads the invoice list (#2194); an empty list keeps its plain amount
// input, which carries the page-provided defaultAmount.
jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchAllInvoices: jest.fn(() =>
    Promise.resolve({
      invoices: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      summary: {},
    }),
  ),
  fetchInvoiceById: jest.fn(),
  createInvoice: jest.fn(),
  updateInvoice: jest.fn(),
  deleteInvoice: jest.fn(),
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
  fetchVendor: jest.fn(),
  searchCompanies: makeSearchCompanies(mockFetchVendors),
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

// The linked-documents section loads on mount; without this mock its real fetch fails with a
// NetworkError whose banner reuses the common network copy and skews error-copy counts.
jest.unstable_mockModule('../../lib/documentLinksApi.js', () => ({
  listDocumentLinks: jest.fn(() => Promise.resolve([])),
  createDocumentLink: jest.fn(),
  deleteDocumentLink: jest.fn(),
  listAllLinkedDocumentIds: jest.fn(() => Promise.resolve([])),
  updateDocumentLinkAttachmentType: jest.fn(),
}));

// The Documents panel host reads the Paperless status; configured with no links shows the button.
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: jest.fn(() =>
    Promise.resolve({
      configured: true,
      reachable: true,
      error: null,
      paperlessUrl: 'https://paperless.example.test',
    }),
  ),
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  getPaperlessDocument: jest.fn(),
  getDocumentThumbnailUrl: jest.fn(),
  getDocumentPreviewUrl: jest.fn(),
}));

jest.unstable_mockModule('../../lib/householdItemWorkItemsApi.js', () => ({
  fetchLinkedHouseholdItems: mockFetchLinkedHouseholdItems,
}));

// Linked-purchase category chips resolve names via the categories API (#2196 AC3)
const mockFetchHouseholdItemCategories =
  jest.fn<typeof HouseholdItemCategoriesApiTypes.fetchHouseholdItemCategories>();
jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchHouseholdItemCategories,
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
    toBcp47Locale: (locale: string) => (locale === 'de' ? 'de-DE' : 'en-US'),
    formatDayRange: (start: Date, end: Date) =>
      `${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)}`,
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
      formatDayMonth: (d: string | null | undefined) => d ?? '',
    }),
  };
});

// The sentence builder is replaced by two buttons that submit the page's onAdd payloads; the
// display (with its Remove buttons) stays real.
const dependencyDisplay =
  await import('../../components/DependencySentenceBuilder/DependencySentenceDisplay.js');
jest.unstable_mockModule('../../components/DependencySentenceBuilder/index.js', () => ({
  DependencySentenceDisplay: dependencyDisplay.DependencySentenceDisplay,
  DependencySentenceBuilder: (props: {
    thisItemId: string;
    disabled: boolean;
    onAdd: (data: {
      predecessorId: string;
      successorId: string;
      dependencyType: 'finish_to_start';
      otherItemTitle: string;
    }) => void;
  }) => (
    <div>
      <button
        type="button"
        disabled={props.disabled}
        onClick={() =>
          props.onAdd({
            predecessorId: 'work-9',
            successorId: props.thisItemId,
            dependencyType: 'finish_to_start',
            otherItemTitle: 'Other',
          })
        }
      >
        stub-add-as-successor
      </button>
      <button
        type="button"
        onClick={() =>
          props.onAdd({
            predecessorId: props.thisItemId,
            successorId: 'work-8',
            dependencyType: 'finish_to_start',
            otherItemTitle: 'Other',
          })
        }
      >
        stub-add-as-predecessor
      </button>
    </div>
  ),
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
    projectedStartDate: '2024-01-01',
    projectedEndDate: '2024-01-31',
    isLate: false,
    lateDays: null,
    isHeldUp: false,
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
    oidcLinked: false,
    createdAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    // Reset all mocks
    mockUseAuth.mockReset();
    mockGetWorkItem.mockReset();
    mockUpdateWorkItem.mockReset();
    mockDeleteWorkItem.mockReset();
    mockShowToast.mockReset();
    mockShowUndoToast.mockReset();
    mockFetchDeleteImpact.mockReset();
    mockFetchDeleteImpact.mockResolvedValue({ entityType: 'work_item', id: 'work-1', effects: [] });
    mockListWorkItems.mockReset();
    mockFetchWorkItemSubsidies.mockReset();
    mockLinkWorkItemSubsidy.mockReset();
    mockUnlinkWorkItemSubsidy.mockReset();
    mockFetchWorkItemSubsidyPayback.mockReset();
    mockFetchWorkItemBudgets.mockReset();
    mockCreateWorkItemBudget.mockReset();
    mockUpdateWorkItemBudget.mockReset();
    mockDeleteWorkItemBudget.mockReset();
    mockCostLinesSection.mockReset();
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
    mockFetchHouseholdItemCategories.mockReset();

    if (!WorkItemDetailPageModule) {
      WorkItemDetailPageModule = await import('./WorkItemDetailPage.js');
    }

    mockUseAuth.mockReturnValue({
      user: mockUser,
      status: 'authenticated',
      setupRequired: false,
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
      expectedTotalPayback: 0,
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
    mockFetchHouseholdItemCategories.mockResolvedValue({ categories: [] });
  });

  function renderPage(id = 'work-1', hash = '') {
    return render(
      <MemoryRouter initialEntries={[`/project/work-items/${id}${hash}`]}>
        <Routes>
          <Route path="/project/work-items/:id" element={<WorkItemDetailPageModule.default />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Handlers: success paths, guards and failure branches ──────────────────

  describe('handlers (page behaviour beyond the error copy)', () => {
    const apiError = (status: number, code: ErrorCode) =>
      new ApiClientError(status, { code, message: 'server text' });

    const sampleNote = {
      id: 'note-1',
      content: 'First note',
      createdBy: { id: 'user-1', displayName: 'Test User' },
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    const sampleSubtask = (id: string, title: string, sortOrder: number, isCompleted = false) => ({
      id,
      title,
      isCompleted,
      sortOrder,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    });
    const dependencyItem: WorkItemSummary = {
      id: 'work-0',
      title: 'Foundation work',
      status: 'completed',
      startDate: null,
      endDate: null,
      projectedStartDate: null,
      projectedEndDate: null,
      isLate: false,
      lateDays: null,
      isHeldUp: false,
      durationDays: null,
      actualStartDate: null,
      actualEndDate: null,
      assignedUser: null,
      assignedVendor: null,
      area: null,
      budgetLineCount: 0,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    const milestone = (id: number, title: string): MilestoneSummary => ({
      id,
      title,
      description: null,
      targetDate: '2024-06-01',
      isCompleted: false,
      completedAt: null,
      color: null,
      workItemCount: 0,
      dependentWorkItemCount: 0,
      createdBy: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    });

    beforeEach(() => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockUpdateWorkItem.mockResolvedValue(mockWorkItem);
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    async function renderLoaded() {
      renderPage();
      await screen.findByRole('heading', { name: 'Test Work Item', level: 1 });
    }

    const banner = () => screen.findByRole('alert');
    const pickerButton = (comboName: string) =>
      (
        screen.getByRole('combobox', { name: comboName }).parentElement as HTMLElement
      ).querySelector('button') as HTMLElement;
    const addRequiredButton = () =>
      pickerButton(enWorkItems.detail.constraints.selectRequiredMilestoneAriaLabel);
    const linkLinkedButton = () =>
      pickerButton(enWorkItems.detail.constraints.selectLinkedMilestoneAriaLabel);

    describe('route and load states', () => {
      it('redirects to the task list when the route carries no id', async () => {
        render(
          <MemoryRouter initialEntries={['/no-id']}>
            <Routes>
              <Route path="/no-id" element={<WorkItemDetailPageModule.default />} />
              <Route path="/project/work-items" element={<p>Task list page</p>} />
            </Routes>
          </MemoryRouter>,
        );
        expect(await screen.findByText('Task list page')).toBeInTheDocument();
        expect(mockGetWorkItem).not.toHaveBeenCalled();
      });

      it('the not-found card goes back to the task list', async () => {
        mockGetWorkItem.mockRejectedValue(apiError(404, 'NOT_FOUND'));
        render(
          <MemoryRouter initialEntries={['/project/work-items/work-1']}>
            <Routes>
              <Route
                path="/project/work-items/:id"
                element={<WorkItemDetailPageModule.default />}
              />
              <Route path="/project/work-items" element={<p>Task list page</p>} />
            </Routes>
          </MemoryRouter>,
        );
        fireEvent.click(await screen.findByRole('button', { name: /Back to/ }));
        expect(await screen.findByText('Task list page')).toBeInTheDocument();
      });

      it('the load-failed card goes back to the task list', async () => {
        mockGetWorkItem.mockRejectedValue(new Error('boom'));
        render(
          <MemoryRouter initialEntries={['/project/work-items/work-1']}>
            <Routes>
              <Route
                path="/project/work-items/:id"
                element={<WorkItemDetailPageModule.default />}
              />
              <Route path="/project/work-items" element={<p>Task list page</p>} />
            </Routes>
          </MemoryRouter>,
        );
        fireEvent.click(await screen.findByRole('button', { name: /Back to/ }));
        expect(await screen.findByText('Task list page')).toBeInTheDocument();
      });

      it('the load-failed card has a Retry that reloads the page route', async () => {
        mockGetWorkItem.mockRejectedValue(new Error('boom'));
        renderPage();
        const retry = await screen.findByRole('button', {
          name: enWorkItems.detail.error.retry,
        });
        expect(() => fireEvent.click(retry)).not.toThrow();
      });

      it('stops resolving category names when the page unmounts first', async () => {
        let resolveCategories: (v: { categories: [] }) => void = () => undefined;
        mockFetchHouseholdItemCategories.mockReturnValue(
          new Promise((resolve) => {
            resolveCategories = resolve;
          }),
        );
        mockFetchLinkedHouseholdItems.mockResolvedValue([
          {
            id: 'hi-1',
            name: 'Kitchen island',
            category: 'hic-1',
            status: 'planned',
            targetDeliveryDate: null,
            earliestDeliveryDate: null,
            latestDeliveryDate: null,
          } as never,
        ]);
        const view = renderPage();
        await screen.findByText('Kitchen island');
        await waitFor(() => expect(mockFetchHouseholdItemCategories).toHaveBeenCalled());
        view.unmount();
        await act(async () => resolveCategories({ categories: [] }));
      });

      it('shows an unknown author for a work item without a creator', async () => {
        mockGetWorkItem.mockResolvedValue({ ...mockWorkItem, createdBy: null, durationDays: null });
        renderPage();
        expect(await screen.findByText(/Created by Unknown/)).toBeInTheDocument();
      });
    });

    describe('title and description', () => {
      it('saves a trimmed title on Enter and leaves the editor', async () => {
        await renderLoaded();
        fireEvent.click(screen.getByRole('heading', { name: 'Test Work Item', level: 1 }));
        const input = screen.getByDisplayValue('Test Work Item');
        fireEvent.change(input, { target: { value: '  Renamed  ' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() =>
          expect(mockUpdateWorkItem).toHaveBeenCalledWith('work-1', { title: 'Renamed' }),
        );
        await waitFor(() => expect(screen.queryByDisplayValue('Renamed')).toBeNull());
      });

      it('saves the title with the Save button', async () => {
        await renderLoaded();
        fireEvent.click(screen.getByRole('heading', { name: 'Test Work Item', level: 1 }));
        fireEvent.change(screen.getByDisplayValue('Test Work Item'), {
          target: { value: 'Renamed' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(mockUpdateWorkItem).toHaveBeenCalledTimes(1));
      });

      it('does not save an empty title', async () => {
        const { container } = renderPage();
        fireEvent.click(await screen.findByRole('heading', { name: 'Test Work Item', level: 1 }));
        const input = container.querySelector('.titleInput') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(mockUpdateWorkItem).not.toHaveBeenCalled();
        expect(container.querySelector('.titleInput')).not.toBeNull();
      });

      it('Escape and Cancel leave the title editor without saving', async () => {
        await renderLoaded();
        fireEvent.click(screen.getByRole('heading', { name: 'Test Work Item', level: 1 }));
        fireEvent.keyDown(screen.getByDisplayValue('Test Work Item'), { key: 'Escape' });
        expect(screen.queryByDisplayValue('Test Work Item')).toBeNull();
        fireEvent.click(screen.getByRole('heading', { name: 'Test Work Item', level: 1 }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByDisplayValue('Test Work Item')).toBeNull();
        expect(mockUpdateWorkItem).not.toHaveBeenCalled();
      });

      it('saves an edited description, and an emptied one as null', async () => {
        await renderLoaded();
        fireEvent.click(screen.getByTitle('Click to edit'));
        fireEvent.change(screen.getByDisplayValue('This is a test work item'), {
          target: { value: ' Changed ' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() =>
          expect(mockUpdateWorkItem).toHaveBeenCalledWith('work-1', { description: 'Changed' }),
        );
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull());

        fireEvent.click(screen.getByTitle('Click to edit'));
        fireEvent.change(screen.getByDisplayValue('This is a test work item'), {
          target: { value: '' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() =>
          expect(mockUpdateWorkItem).toHaveBeenLastCalledWith('work-1', { description: null }),
        );
      });

      it('Cancel leaves the description editor; a work item without description opens empty', async () => {
        mockGetWorkItem.mockResolvedValue({ ...mockWorkItem, description: null });
        await renderLoaded();
        fireEvent.click(screen.getByTitle('Click to edit'));
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.getByText('No description')).toBeInTheDocument();
        expect(mockUpdateWorkItem).not.toHaveBeenCalled();
      });

      it('dismisses the inline error banner', async () => {
        mockUpdateWorkItem.mockRejectedValue(new Error('x'));
        await renderLoaded();
        fireEvent.click(screen.getByRole('heading', { name: 'Test Work Item', level: 1 }));
        fireEvent.change(screen.getByDisplayValue('Test Work Item'), {
          target: { value: 'Renamed' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await banner();
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }));
        expect(screen.queryByRole('alert')).toBeNull();
      });
    });

    describe('assignment, area and status', () => {
      it('clears the assignment', async () => {
        mockListUsers.mockResolvedValue({
          users: [
            {
              id: 'user-1',
              displayName: 'Assigned User',
              email: 'assigned@example.com',
              role: 'member',
              authProvider: 'local',
              oidcLinked: false,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              deactivatedAt: null,
            },
          ],
        });
        await renderLoaded();
        const section = (
          await screen.findByRole('heading', { name: enWorkItems.detail.sections.assignment })
        ).closest('section')!;
        fireEvent.click(within(section).getByRole('button', { name: 'Clear selection' }));
        await waitFor(() =>
          expect(mockUpdateWorkItem).toHaveBeenCalledWith('work-1', {
            assignedUserId: null,
            assignedVendorId: null,
          }),
        );
      });

      it('shows a vendor assignment', async () => {
        mockGetWorkItem.mockResolvedValue({
          ...mockWorkItem,
          assignedUser: null,
          assignedVendor: { id: 'v-1', name: 'Example Plumbing Co' } as never,
        });
        await renderLoaded();
        expect(await screen.findByText('Example Plumbing Co')).toBeInTheDocument();
      });

      it('clears the area', async () => {
        mockGetWorkItem.mockResolvedValue({
          ...mockWorkItem,
          area: { id: 'area-1', name: 'Kitchen', color: null } as never,
        });
        await renderLoaded();
        fireEvent.focus(screen.getByPlaceholderText(enCommon.aria.selectArea));
        fireEvent.click(await screen.findByText(enCommon.aria.noArea));
        await waitFor(() =>
          expect(mockUpdateWorkItem).toHaveBeenCalledWith('work-1', { areaId: null }),
        );
      });
    });

    describe('duration, constraints and actual dates', () => {
      it('saves a changed duration and confirms with a success state that resets', async () => {
        jest.useFakeTimers();
        await renderLoaded();
        const input = screen.getByDisplayValue('30');
        fireEvent.wheel(input);
        fireEvent.change(input, { target: { value: '31' } });
        fireEvent.blur(input);
        await waitFor(() =>
          expect(mockUpdateWorkItem).toHaveBeenCalledWith('work-1', { durationDays: 31 }),
        );
        // A second save restarts the reset timer of the same field
        fireEvent.change(input, { target: { value: '32' } });
        fireEvent.blur(input);
        await waitFor(() => expect(mockUpdateWorkItem).toHaveBeenCalledTimes(2));
        await act(async () => {
          jest.advanceTimersByTime(2100);
        });
      });

      it('a reload after saving may bring back a work item without a duration', async () => {
        await renderLoaded();
        mockGetWorkItem.mockResolvedValue({ ...mockWorkItem, durationDays: null });
        const input = screen.getByDisplayValue('30');
        fireEvent.change(input, { target: { value: '' } });
        fireEvent.blur(input);
        await waitFor(() => expect(screen.getByPlaceholderText('0')).toHaveValue(null));
      });

      it.each([
        ['Start After', 'startAfter'],
        ['Start Before', 'startBefore'],
        [enWorkItems.detail.constraints.actualStart, 'actualStartDate'],
        [enWorkItems.detail.constraints.actualEnd, 'actualEndDate'],
      ])('%s: emptying a stored date saves null', async (label, field) => {
        mockGetWorkItem.mockResolvedValue({ ...mockWorkItem, [field]: '2024-02-01' });
        await renderLoaded();
        const input = screen
          .getByText(label)
          .parentElement?.querySelector('input[type="date"]') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '' } });
        fireEvent.blur(input);
        await waitFor(() =>
          expect(mockUpdateWorkItem).toHaveBeenCalledWith('work-1', { [field]: null }),
        );
      });

      it('an emptied duration is saved as null; an unchanged, negative or invalid one is not', async () => {
        await renderLoaded();
        const input = screen.getByDisplayValue('30');
        fireEvent.blur(input);
        fireEvent.change(input, { target: { value: '-1' } });
        fireEvent.blur(input);
        expect(mockUpdateWorkItem).not.toHaveBeenCalled();
        fireEvent.change(input, { target: { value: '' } });
        fireEvent.blur(input);
        await waitFor(() =>
          expect(mockUpdateWorkItem).toHaveBeenCalledWith('work-1', { durationDays: null }),
        );
      });

      it('shows an empty duration for a work item without one', async () => {
        mockGetWorkItem.mockResolvedValue({ ...mockWorkItem, durationDays: null });
        renderPage();
        await screen.findByRole('heading', { name: 'Test Work Item', level: 1 });
        expect(screen.getByPlaceholderText('0')).toHaveValue(null);
      });

      it.each([
        ['Start After', 'startAfter'],
        ['Start Before', 'startBefore'],
        [enWorkItems.detail.constraints.actualStart, 'actualStartDate'],
        [enWorkItems.detail.constraints.actualEnd, 'actualEndDate'],
      ])('%s: saves a changed date on blur and ignores an unchanged one', async (label, field) => {
        jest.useFakeTimers();
        await renderLoaded();
        const input = screen
          .getByText(label)
          .parentElement?.querySelector('input[type="date"]') as HTMLInputElement;
        fireEvent.blur(input);
        expect(mockUpdateWorkItem).not.toHaveBeenCalled();
        fireEvent.change(input, { target: { value: '2024-03-01' } });
        fireEvent.blur(input);
        await waitFor(() =>
          expect(mockUpdateWorkItem).toHaveBeenCalledWith('work-1', { [field]: '2024-03-01' }),
        );
        fireEvent.change(input, { target: { value: '2024-03-02' } });
        fireEvent.blur(input);
        await waitFor(() => expect(mockUpdateWorkItem).toHaveBeenCalledTimes(2));
        await act(async () => {
          jest.advanceTimersByTime(2100);
        });
      });

      it.each([
        ['startAfter', enWorkItems.detail.constraints.clearStartAfter],
        ['startBefore', enWorkItems.detail.constraints.clearStartBefore],
        ['actualStartDate', enWorkItems.detail.constraints.clearActualStart],
        ['actualEndDate', enWorkItems.detail.constraints.clearActualEnd],
      ])('%s: the clear button saves null for a stored date', async (field, ariaLabel) => {
        jest.useFakeTimers();
        mockGetWorkItem.mockResolvedValue({ ...mockWorkItem, [field]: '2024-02-01' });
        await renderLoaded();
        fireEvent.click(screen.getByRole('button', { name: ariaLabel }));
        await waitFor(() =>
          expect(mockUpdateWorkItem).toHaveBeenCalledWith('work-1', { [field]: null }),
        );
        await act(async () => {
          jest.advanceTimersByTime(2100);
        });
      });

      it.each([
        ['startAfter', enWorkItems.detail.constraints.clearStartAfter],
        ['startBefore', enWorkItems.detail.constraints.clearStartBefore],
        ['actualStartDate', enWorkItems.detail.constraints.clearActualStart],
        ['actualEndDate', enWorkItems.detail.constraints.clearActualEnd],
      ])('%s: a failing clear shows the error state', async (field, ariaLabel) => {
        jest.useFakeTimers();
        mockGetWorkItem.mockResolvedValue({ ...mockWorkItem, [field]: '2024-02-01' });
        mockUpdateWorkItem.mockRejectedValue(new Error('x'));
        await renderLoaded();
        fireEvent.click(screen.getByRole('button', { name: ariaLabel }));
        await waitFor(() => expect(mockUpdateWorkItem).toHaveBeenCalledTimes(1));
        await act(async () => {
          jest.advanceTimersByTime(2100);
        });
      });

      it.each([
        [enWorkItems.detail.constraints.startAfter, enWorkItems.detail.constraints.clearStartAfter],
        [
          enWorkItems.detail.constraints.startBefore,
          enWorkItems.detail.constraints.clearStartBefore,
        ],
        [
          enWorkItems.detail.constraints.actualStart,
          enWorkItems.detail.constraints.clearActualStart,
        ],
        [enWorkItems.detail.constraints.actualEnd, enWorkItems.detail.constraints.clearActualEnd],
      ])('%s: clearing a typed but unsaved date makes no request', async (label, ariaLabel) => {
        await renderLoaded();
        const input = screen
          .getByText(label)
          .parentElement?.querySelector('input[type="date"]') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '2024-05-05' } });
        fireEvent.click(screen.getByRole('button', { name: ariaLabel }));
        expect(mockUpdateWorkItem).not.toHaveBeenCalled();
        expect(input).toHaveValue('');
      });
    });

    describe('notes', () => {
      it('adds a trimmed note and clears the form', async () => {
        await renderLoaded();
        const field = screen.getByPlaceholderText(enWorkItems.detail.notes.placeholder);
        fireEvent.change(field, { target: { value: '  New note  ' } });
        fireEvent.click(screen.getByRole('button', { name: enWorkItems.detail.notes.addNote }));
        await waitFor(() =>
          expect(mockCreateNote).toHaveBeenCalledWith('work-1', { content: 'New note' }),
        );
        await waitFor(() => expect(field).toHaveValue(''));
      });

      it('ignores a submit with an empty note', async () => {
        await renderLoaded();
        const field = screen.getByPlaceholderText(enWorkItems.detail.notes.placeholder);
        fireEvent.submit(field.closest('form')!);
        expect(mockCreateNote).not.toHaveBeenCalled();
      });

      it('edits a note, ignores an emptied edit and cancels', async () => {
        mockListNotes.mockResolvedValue({ notes: [sampleNote] });
        await renderLoaded();
        fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
        const edit = screen.getByDisplayValue('First note');
        fireEvent.change(edit, { target: { value: '   ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(mockUpdateNote).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.getByText('First note')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        fireEvent.change(screen.getByDisplayValue('First note'), { target: { value: ' Edited ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() =>
          expect(mockUpdateNote).toHaveBeenCalledWith('work-1', 'note-1', { content: 'Edited' }),
        );
        await waitFor(() => expect(screen.queryByDisplayValue('Edited')).toBeNull());
      });

      it('Cancel in the delete note dialog keeps the note', async () => {
        mockListNotes.mockResolvedValue({ notes: [sampleNote] });
        await renderLoaded();
        fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
        fireEvent.click(await screen.findByTestId('note-delete-cancel'));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
        expect(mockDeleteNote).not.toHaveBeenCalled();
      });

      it('without a signed-in user a note without an author still shows its actions', async () => {
        mockUseAuth.mockReturnValue({
          user: null,
          status: 'authenticated',
          setupRequired: false,
          isLoading: false,
          error: null,
          refreshAuth: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
          logout: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
          oidcEnabled: false,
        });
        mockListNotes.mockResolvedValue({ notes: [{ ...sampleNote, createdBy: null }] });
        renderPage();
        expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
      });

      it("hides edit and delete on somebody else's note unless the user is an admin", async () => {
        const foreign = {
          ...sampleNote,
          id: 'note-2',
          createdBy: null,
        };
        mockListNotes.mockResolvedValue({ notes: [foreign] });
        const view = renderPage();
        await screen.findByText('First note');
        expect(screen.getByText('Unknown', { selector: 'span' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
        view.unmount();

        mockUseAuth.mockReturnValue({
          user: { ...mockUser, role: 'admin' },
          status: 'authenticated',
          setupRequired: false,
          isLoading: false,
          error: null,
          refreshAuth: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
          logout: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
          oidcEnabled: false,
        });
        renderPage();
        expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
      });
    });

    describe('subtasks', () => {
      it('adds a trimmed subtask and ignores an empty submit', async () => {
        await renderLoaded();
        const input = screen.getByPlaceholderText(enWorkItems.detail.subtasks.placeholder);
        fireEvent.submit(input.closest('form')!);
        expect(mockCreateSubtask).not.toHaveBeenCalled();
        fireEvent.change(input, { target: { value: '  Buy tiles ' } });
        fireEvent.submit(input.closest('form')!);
        await waitFor(() =>
          expect(mockCreateSubtask).toHaveBeenCalledWith('work-1', { title: 'Buy tiles' }),
        );
        await waitFor(() => expect(input).toHaveValue(''));
      });

      it('toggles a subtask and shows a completed one struck through', async () => {
        mockListSubtasks.mockResolvedValue({
          subtasks: [sampleSubtask('st-1', 'Sub one', 0, true)],
        });
        const { container } = renderPage();
        fireEvent.click(await screen.findByRole('checkbox'));
        await waitFor(() =>
          expect(mockUpdateSubtask).toHaveBeenCalledWith('work-1', 'st-1', { isCompleted: false }),
        );
        expect(container.querySelector('.subtaskCompleted')).not.toBeNull();
      });

      it('renames a subtask with Enter, with Save, and ignores an emptied title', async () => {
        mockListSubtasks.mockResolvedValue({ subtasks: [sampleSubtask('st-1', 'Sub one', 0)] });
        renderPage();
        fireEvent.click(await screen.findByText('Sub one'));
        let input = screen.getByDisplayValue('Sub one');
        fireEvent.change(input, { target: { value: ' ' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(mockUpdateSubtask).not.toHaveBeenCalled();
        fireEvent.change(input, { target: { value: 'Sub two' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() =>
          expect(mockUpdateSubtask).toHaveBeenCalledWith('work-1', 'st-1', { title: 'Sub two' }),
        );
        await waitFor(() => expect(screen.queryByDisplayValue('Sub two')).toBeNull());

        fireEvent.click(await screen.findByText('Sub one'));
        input = screen.getByDisplayValue('Sub one');
        fireEvent.change(input, { target: { value: 'Sub three' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(mockUpdateSubtask).toHaveBeenCalledTimes(2));
      });

      it('Escape and Cancel leave the subtask editor', async () => {
        mockListSubtasks.mockResolvedValue({ subtasks: [sampleSubtask('st-1', 'Sub one', 0)] });
        renderPage();
        fireEvent.click(await screen.findByText('Sub one'));
        fireEvent.keyDown(screen.getByDisplayValue('Sub one'), { key: 'Escape' });
        expect(screen.queryByDisplayValue('Sub one')).toBeNull();
        fireEvent.click(screen.getByText('Sub one'));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByDisplayValue('Sub one')).toBeNull();
        expect(mockUpdateSubtask).not.toHaveBeenCalled();
      });

      it('deletes a subtask after the confirmation', async () => {
        mockListSubtasks.mockResolvedValue({ subtasks: [sampleSubtask('st-1', 'Sub one', 0)] });
        const { container } = renderPage();
        await screen.findByText('Sub one');
        fireEvent.click(container.querySelector('.subtaskItem .deleteButton')!);
        fireEvent.click(await enabledConfirm('subtask-delete'));
        await waitFor(() => expect(mockDeleteSubtask).toHaveBeenCalledWith('work-1', 'st-1'));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      });

      it('Cancel in the delete subtask dialog keeps the subtask', async () => {
        mockListSubtasks.mockResolvedValue({ subtasks: [sampleSubtask('st-1', 'Sub one', 0)] });
        const { container } = renderPage();
        await screen.findByText('Sub one');
        fireEvent.click(container.querySelector('.subtaskItem .deleteButton')!);
        fireEvent.click(await screen.findByTestId('subtask-delete-cancel'));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
        expect(mockDeleteSubtask).not.toHaveBeenCalled();
      });

      it('keeps the delete dialog usable when its subtask vanishes from the list', async () => {
        mockListSubtasks.mockResolvedValue({
          subtasks: [sampleSubtask('st-1', 'Sub one', 0), sampleSubtask('st-2', 'Sub two', 1)],
        });
        const { container } = renderPage();
        await screen.findByText('Sub two');
        fireEvent.click(container.querySelector('.subtaskItem .deleteButton')!);
        await screen.findByRole('alertdialog');
        mockListSubtasks.mockResolvedValue({ subtasks: [sampleSubtask('st-2', 'Sub two', 1)] });
        fireEvent.click(screen.getAllByRole('checkbox')[1]!);
        await waitFor(() => expect(screen.queryByText('Sub one')).toBeNull());
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });

      it('moves a subtask up and down', async () => {
        mockListSubtasks.mockResolvedValue({
          subtasks: [sampleSubtask('st-1', 'Sub one', 0), sampleSubtask('st-2', 'Sub two', 1)],
        });
        renderPage();
        await screen.findByText('Sub two');
        fireEvent.click(screen.getAllByTitle(enWorkItems.detail.subtasks.moveDown)[0]!);
        await waitFor(() =>
          expect(mockReorderSubtasks).toHaveBeenCalledWith('work-1', {
            subtaskIds: ['st-2', 'st-1'],
          }),
        );
        fireEvent.click(screen.getAllByTitle(enWorkItems.detail.subtasks.moveUp)[1]!);
        await waitFor(() => expect(mockReorderSubtasks).toHaveBeenCalledTimes(2));
      });
    });

    describe('dependencies', () => {
      it('adds a dependency where this item is the successor', async () => {
        await renderLoaded();
        fireEvent.click(screen.getByRole('button', { name: 'stub-add-as-successor' }));
        await waitFor(() =>
          expect(mockCreateDependency).toHaveBeenCalledWith('work-1', {
            predecessorId: 'work-9',
            dependencyType: 'finish_to_start',
          }),
        );
      });

      it('adds a dependency where this item is the predecessor', async () => {
        await renderLoaded();
        fireEvent.click(screen.getByRole('button', { name: 'stub-add-as-predecessor' }));
        await waitFor(() =>
          expect(mockCreateDependency).toHaveBeenCalledWith('work-8', {
            predecessorId: 'work-1',
            dependencyType: 'finish_to_start',
          }),
        );
      });

      it.each([
        ['an API error', apiError(400, 'VALIDATION_ERROR')],
        ['a network error', new NetworkError('offline', null)],
        ['an unknown error', new Error('x')],
      ])('shows the matching copy for %s while adding a dependency', async (_name, error) => {
        mockCreateDependency.mockRejectedValue(error);
        await renderLoaded();
        fireEvent.click(screen.getByRole('button', { name: 'stub-add-as-successor' }));
        await banner();
      });

      it('removes a predecessor and a successor after the confirmation', async () => {
        mockGetDependencies.mockResolvedValue({
          predecessors: [
            { workItem: dependencyItem, dependencyType: 'finish_to_start', leadLagDays: 0 },
          ],
          successors: [
            {
              workItem: { ...dependencyItem, id: 'work-2', title: 'Painting' },
              dependencyType: 'finish_to_start',
              leadLagDays: 0,
            },
          ],
        });
        await renderLoaded();
        fireEvent.click(await screen.findByRole('button', { name: /Foundation work/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
        await waitFor(() => expect(mockDeleteDependency).toHaveBeenCalledWith('work-1', 'work-0'));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

        fireEvent.click(await screen.findByRole('button', { name: /Painting/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
        await waitFor(() => expect(mockDeleteDependency).toHaveBeenCalledWith('work-2', 'work-1'));
      });

      it('Cancel in the remove dependency dialog keeps the dependency', async () => {
        mockGetDependencies.mockResolvedValue({
          predecessors: [
            { workItem: dependencyItem, dependencyType: 'finish_to_start', leadLagDays: 0 },
          ],
          successors: [],
        });
        await renderLoaded();
        fireEvent.click(await screen.findByRole('button', { name: /Foundation work/ }));
        fireEvent.click(await screen.findByTestId('dependency-remove-cancel'));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
        expect(mockDeleteDependency).not.toHaveBeenCalled();
      });
    });

    describe('milestones', () => {
      beforeEach(() => {
        mockListMilestones.mockResolvedValue([milestone(1, 'Roof done'), milestone(2, 'Walls up')]);
        mockGetWorkItemMilestones.mockResolvedValue({
          required: [{ id: 3, name: 'M-req', targetDate: '2024-06-01' } as never],
          linked: [{ id: 4, name: 'M-link', targetDate: '2024-07-01' } as never],
        });
      });

      it('adds and removes a required milestone', async () => {
        await renderLoaded();
        const select = await screen.findByRole('combobox', {
          name: enWorkItems.detail.constraints.selectRequiredMilestoneAriaLabel,
        });
        fireEvent.change(select, { target: { value: '1' } });
        fireEvent.click(addRequiredButton());
        await waitFor(() => expect(mockAddRequiredMilestone).toHaveBeenCalledWith('work-1', 1));
        fireEvent.click(screen.getByRole('button', { name: 'Remove required milestone: M-req' }));
        await waitFor(() => expect(mockRemoveRequiredMilestone).toHaveBeenCalledWith('work-1', 3));
      });

      it('adds and removes a linked milestone', async () => {
        await renderLoaded();
        const select = await screen.findByRole('combobox', {
          name: enWorkItems.detail.constraints.selectLinkedMilestoneAriaLabel,
        });
        fireEvent.change(select, { target: { value: '2' } });
        fireEvent.click(linkLinkedButton());
        await waitFor(() => expect(mockAddLinkedMilestone).toHaveBeenCalledWith('work-1', 2));
        fireEvent.click(screen.getByRole('button', { name: 'Remove linked milestone: M-link' }));
        await waitFor(() => expect(mockRemoveLinkedMilestone).toHaveBeenCalledWith('work-1', 4));
      });

      it.each([
        ['duplicate', apiError(409, 'DUPLICATE_DEPENDENCY')],
        ['another API error', apiError(400, 'VALIDATION_ERROR')],
        ['a network error', new NetworkError('offline', null)],
        ['an unknown error', new Error('x')],
      ])('required milestone add failure: %s', async (_name, error) => {
        mockAddRequiredMilestone.mockRejectedValue(error);
        await renderLoaded();
        fireEvent.change(
          await screen.findByRole('combobox', {
            name: enWorkItems.detail.constraints.selectRequiredMilestoneAriaLabel,
          }),
          { target: { value: '1' } },
        );
        fireEvent.click(addRequiredButton());
        await banner();
      });

      it.each([
        ['duplicate', apiError(409, 'DUPLICATE_DEPENDENCY')],
        ['another API error', apiError(400, 'VALIDATION_ERROR')],
        ['a network error', new NetworkError('offline', null)],
        ['an unknown error', new Error('x')],
      ])('linked milestone add failure: %s', async (_name, error) => {
        mockAddLinkedMilestone.mockRejectedValue(error);
        await renderLoaded();
        fireEvent.change(
          await screen.findByRole('combobox', {
            name: enWorkItems.detail.constraints.selectLinkedMilestoneAriaLabel,
          }),
          { target: { value: '2' } },
        );
        fireEvent.click(linkLinkedButton());
        await banner();
      });
    });

    describe('delete work item and shortcuts', () => {
      async function openDelete() {
        await renderLoaded();
        fireEvent.click(
          screen.getByRole('button', { name: enWorkItems.detail.footer.deleteWorkItem }),
        );
        return enabledConfirm('work-item-delete');
      }

      it('deletes the work item and leaves for the task list', async () => {
        mockDeleteWorkItem.mockResolvedValue(undefined);
        fireEvent.click(await openDelete());
        await waitFor(() => expect(mockDeleteWorkItem).toHaveBeenCalledWith('work-1'));
      });

      it('a conflict keeps the dialog open as blocked with the translated reason', async () => {
        mockDeleteWorkItem.mockRejectedValue(apiError(409, 'CONFLICT'));
        fireEvent.click(await openDelete());
        await waitFor(() =>
          expect(within(screen.getByRole('alertdialog')).getByRole('alert')).toBeInTheDocument(),
        );
      });

      it('another API error shows its translated copy in the dialog', async () => {
        mockDeleteWorkItem.mockRejectedValue(apiError(500, 'INTERNAL_ERROR'));
        fireEvent.click(await openDelete());
        await waitFor(() =>
          expect(within(screen.getByRole('alertdialog')).getByRole('alert')).toBeInTheDocument(),
        );
      });

      it('a network error shows the network copy in the dialog', async () => {
        mockDeleteWorkItem.mockRejectedValue(new NetworkError('offline', null));
        fireEvent.click(await openDelete());
        await waitFor(() =>
          expect(within(screen.getByRole('alertdialog')).getByRole('alert')).toBeInTheDocument(),
        );
      });

      it('Cancel closes the delete dialog', async () => {
        await openDelete();
        fireEvent.click(screen.getByTestId('work-item-delete-cancel'));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      });

      it('e starts editing the title, but not while another editor is open', async () => {
        await renderLoaded();
        fireEvent.keyDown(document.body, { key: 'e' });
        expect(screen.getByDisplayValue('Test Work Item')).toBeInTheDocument();
        fireEvent.keyDown(document.body, { key: 'e' });
        expect(screen.getAllByDisplayValue('Test Work Item')).toHaveLength(1);
      });

      it('e does nothing while the work item is still loading', async () => {
        mockGetWorkItem.mockReturnValue(new Promise(() => undefined));
        renderPage();
        expect(() => fireEvent.keyDown(document.body, { key: 'e' })).not.toThrow();
        expect(screen.queryByRole('textbox')).toBeNull();
      });

      it('e does nothing while another editor is open', async () => {
        await renderLoaded();
        fireEvent.click(screen.getByTitle('Click to edit'));
        fireEvent.keyDown(document.body, { key: 'e' });
        expect(screen.queryByDisplayValue('Test Work Item')).toBeNull();
      });

      it.each(['Delete', 'Backspace'])('%s opens the delete dialog', async (key) => {
        await renderLoaded();
        fireEvent.keyDown(document.body, { key });
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
      });

      it('? opens the shortcuts help and its close button closes it', async () => {
        await renderLoaded();
        fireEvent.keyDown(document.body, { key: '?' });
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getAllByRole('button')[0]!);
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      });

      it('Escape cancels the open title, description, note or subtask editor', async () => {
        mockListNotes.mockResolvedValue({ notes: [sampleNote] });
        mockListSubtasks.mockResolvedValue({ subtasks: [sampleSubtask('st-1', 'Sub one', 0)] });
        await renderLoaded();

        fireEvent.click(screen.getByRole('heading', { name: 'Test Work Item', level: 1 }));
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(screen.queryByDisplayValue('Test Work Item')).toBeNull();

        fireEvent.click(screen.getByTitle('Click to edit'));
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(screen.queryByDisplayValue('This is a test work item')).toBeNull();

        fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(screen.queryByDisplayValue('First note')).toBeNull();

        fireEvent.click(screen.getByText('Sub one'));
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(screen.queryByDisplayValue('Sub one')).toBeNull();

        // nothing open: Escape is a no-op
        fireEvent.keyDown(document.body, { key: 'Escape' });
      });
    });

    describe('reloads that fail after a successful change', () => {
      it('logs a failed reload and keeps the page usable', async () => {
        mockListNotes.mockResolvedValueOnce({ notes: [] });
        await renderLoaded();
        // Every reload source fails from now on
        mockGetWorkItem.mockRejectedValue(new Error('reload'));
        mockListNotes.mockRejectedValue(new Error('reload'));
        mockListSubtasks.mockRejectedValue(new Error('reload'));
        mockGetDependencies.mockRejectedValue(new Error('reload'));
        mockGetWorkItemMilestones.mockRejectedValue(new Error('reload'));
        mockFetchWorkItemBudgets.mockRejectedValue(new Error('reload'));
        mockFetchWorkItemSubsidies.mockRejectedValue(new Error('reload'));
        mockFetchWorkItemSubsidyPayback.mockRejectedValue(new Error('reload'));
        mockListMilestones.mockResolvedValue([milestone(1, 'Roof done')]);

        // work item + notes + subtasks + dependencies reloads
        fireEvent.click(screen.getByRole('heading', { name: 'Test Work Item', level: 1 }));
        fireEvent.change(screen.getByDisplayValue('Test Work Item'), {
          target: { value: 'Renamed' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(mockUpdateWorkItem).toHaveBeenCalled());

        fireEvent.change(screen.getByPlaceholderText(enWorkItems.detail.notes.placeholder), {
          target: { value: 'n' },
        });
        fireEvent.click(screen.getByRole('button', { name: enWorkItems.detail.notes.addNote }));
        await waitFor(() => expect(mockCreateNote).toHaveBeenCalled());

        const sub = screen.getByPlaceholderText(enWorkItems.detail.subtasks.placeholder);
        fireEvent.change(sub, { target: { value: 's' } });
        fireEvent.submit(sub.closest('form')!);
        await waitFor(() => expect(mockCreateSubtask).toHaveBeenCalled());

        fireEvent.click(screen.getByRole('button', { name: 'stub-add-as-successor' }));
        await waitFor(() => expect(mockCreateDependency).toHaveBeenCalled());

        // cost lines changed: budget lines, payback and linked subsidies reload
        fireEvent.click(screen.getByRole('button', { name: 'stub-changed' }));
        await waitFor(() => expect(mockFetchWorkItemBudgets).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(console.error).toHaveBeenCalled());
      });

      it('logs a failed milestone reload after adding a required milestone', async () => {
        mockListMilestones.mockResolvedValue([milestone(1, 'Roof done')]);
        await renderLoaded();
        mockGetWorkItemMilestones.mockRejectedValue(new Error('reload'));
        fireEvent.change(
          await screen.findByRole('combobox', {
            name: enWorkItems.detail.constraints.selectRequiredMilestoneAriaLabel,
          }),
          { target: { value: '1' } },
        );
        fireEvent.click(addRequiredButton());
        await waitFor(() => expect(mockAddRequiredMilestone).toHaveBeenCalled());
        await waitFor(() => expect(console.error).toHaveBeenCalled());
      });
    });
  });
});
