/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import type * as AuthApiTypes from './lib/authApi.js';
import type * as BudgetCategoriesApiTypes from './lib/budgetCategoriesApi.js';
import type * as MilestonesApiTypes from './lib/milestonesApi.js';
import type * as TimelineApiTypes from './lib/timelineApi.js';
import type * as WorkItemsApiTypes from './lib/workItemsApi.js';
import type * as HouseholdItemsApiTypes from './lib/householdItemsApi.js';
import type * as VendorsApiTypes from './lib/vendorsApi.js';
import type * as TagsApiTypes from './lib/tagsApi.js';
import type * as UsersApiTypes from './lib/usersApi.js';
import type * as InvoicesApiTypes from './lib/invoicesApi.js';
import type * as WorkItemBudgetsApiTypes from './lib/workItemBudgetsApi.js';
import type * as HouseholdItemBudgetsApiTypes from './lib/householdItemBudgetsApi.js';
import type * as HouseholdItemCategoriesApiTypes from './lib/householdItemCategoriesApi.js';
import type * as AppTypes from './App.js';

const mockGetAuthMe = jest.fn<typeof AuthApiTypes.getAuthMe>();
const mockLogin = jest.fn<typeof AuthApiTypes.login>();
const mockLogout = jest.fn<typeof AuthApiTypes.logout>();

const mockFetchBudgetCategories = jest.fn<typeof BudgetCategoriesApiTypes.fetchBudgetCategories>();
const mockCreateBudgetCategory = jest.fn<typeof BudgetCategoriesApiTypes.createBudgetCategory>();
const mockUpdateBudgetCategory = jest.fn<typeof BudgetCategoriesApiTypes.updateBudgetCategory>();
const mockDeleteBudgetCategory = jest.fn<typeof BudgetCategoriesApiTypes.deleteBudgetCategory>();

const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
const mockGetTimeline = jest.fn<typeof TimelineApiTypes.getTimeline>();

// Must mock BEFORE importing the component
jest.unstable_mockModule('./lib/authApi.js', () => ({
  getAuthMe: mockGetAuthMe,
  login: mockLogin,
  logout: mockLogout,
}));

jest.unstable_mockModule('./lib/budgetCategoriesApi.js', () => ({
  fetchBudgetCategories: mockFetchBudgetCategories,
  createBudgetCategory: mockCreateBudgetCategory,
  updateBudgetCategory: mockUpdateBudgetCategory,
  deleteBudgetCategory: mockDeleteBudgetCategory,
}));

// TimelinePage uses useMilestones which calls listMilestones on mount.
// Without this mock, the test environment (no fetch) throws and the Timeline
// test case times out waiting for the heading to appear.
jest.unstable_mockModule('./lib/milestonesApi.js', () => ({
  listMilestones: mockListMilestones,
  getMilestone: jest.fn<typeof MilestonesApiTypes.getMilestone>(),
  createMilestone: jest.fn<typeof MilestonesApiTypes.createMilestone>(),
  updateMilestone: jest.fn<typeof MilestonesApiTypes.updateMilestone>(),
  deleteMilestone: jest.fn<typeof MilestonesApiTypes.deleteMilestone>(),
  linkWorkItem: jest.fn<typeof MilestonesApiTypes.linkWorkItem>(),
  unlinkWorkItem: jest.fn<typeof MilestonesApiTypes.unlinkWorkItem>(),
  addDependentWorkItem: jest.fn<typeof MilestonesApiTypes.addDependentWorkItem>(),
  removeDependentWorkItem: jest.fn<typeof MilestonesApiTypes.removeDependentWorkItem>(),
}));

// TimelinePage uses useTimeline which calls getTimeline on mount.
// Mock this to prevent fetch calls in the jsdom test environment.
jest.unstable_mockModule('./lib/timelineApi.js', () => ({
  getTimeline: mockGetTimeline,
}));

// WorkItemsPage (and transitively MilestoneWorkItemLinker) imports workItemsApi.
// Mock to prevent fetch calls in the jsdom test environment.
// listWorkItems default value is set in beforeEach.
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
jest.unstable_mockModule('./lib/workItemsApi.js', () => ({
  listWorkItems: mockListWorkItems,
  getWorkItem: jest.fn<typeof WorkItemsApiTypes.getWorkItem>(),
  createWorkItem: jest.fn<typeof WorkItemsApiTypes.createWorkItem>(),
  updateWorkItem: jest.fn<typeof WorkItemsApiTypes.updateWorkItem>(),
  deleteWorkItem: jest.fn<typeof WorkItemsApiTypes.deleteWorkItem>(),
  fetchWorkItemSubsidies: jest.fn<typeof WorkItemsApiTypes.fetchWorkItemSubsidies>(),
  linkWorkItemSubsidy: jest.fn<typeof WorkItemsApiTypes.linkWorkItemSubsidy>(),
  unlinkWorkItemSubsidy: jest.fn<typeof WorkItemsApiTypes.unlinkWorkItemSubsidy>(),
}));

// HouseholdItemsPage calls listHouseholdItems and fetchVendors on mount.
// Mock to prevent fetch calls in the jsdom test environment.
const mockListHouseholdItems = jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>();
jest.unstable_mockModule('./lib/householdItemsApi.js', () => ({
  listHouseholdItems: mockListHouseholdItems,
  getHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.getHouseholdItem>(),
  createHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.createHouseholdItem>(),
  updateHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.updateHouseholdItem>(),
  deleteHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.deleteHouseholdItem>(),
}));

const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
jest.unstable_mockModule('./lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: jest.fn<typeof VendorsApiTypes.fetchVendor>(),
  createVendor: jest.fn<typeof VendorsApiTypes.createVendor>(),
  updateVendor: jest.fn<typeof VendorsApiTypes.updateVendor>(),
  deleteVendor: jest.fn<typeof VendorsApiTypes.deleteVendor>(),
}));

// WorkItemsPage calls fetchTags on mount for the tag filter dropdown.
// Mock to prevent fetch calls in the jsdom test environment.
const mockFetchTags = jest.fn<typeof TagsApiTypes.fetchTags>();
jest.unstable_mockModule('./lib/tagsApi.js', () => ({
  fetchTags: mockFetchTags,
  createTag: jest.fn<typeof TagsApiTypes.createTag>(),
  updateTag: jest.fn<typeof TagsApiTypes.updateTag>(),
  deleteTag: jest.fn<typeof TagsApiTypes.deleteTag>(),
}));

// WorkItemsPage calls listUsers on mount for the assigned-to filter dropdown.
// Mock to prevent fetch calls in the jsdom test environment.
const mockListUsers = jest.fn<typeof UsersApiTypes.listUsers>();
jest.unstable_mockModule('./lib/usersApi.js', () => ({
  listUsers: mockListUsers,
  getProfile: jest.fn<typeof UsersApiTypes.getProfile>(),
  updateProfile: jest.fn<typeof UsersApiTypes.updateProfile>(),
  changePassword: jest.fn<typeof UsersApiTypes.changePassword>(),
  adminUpdateUser: jest.fn<typeof UsersApiTypes.adminUpdateUser>(),
  deactivateUser: jest.fn<typeof UsersApiTypes.deactivateUser>(),
}));

// InvoicesPage calls fetchAllInvoices and createInvoice on mount.
const mockFetchAllInvoices = jest.fn<typeof InvoicesApiTypes.fetchAllInvoices>();
jest.unstable_mockModule('./lib/invoicesApi.js', () => ({
  fetchAllInvoices: mockFetchAllInvoices,
  createInvoice: jest.fn<typeof InvoicesApiTypes.createInvoice>(),
  fetchInvoices: jest.fn<typeof InvoicesApiTypes.fetchInvoices>(),
  updateInvoice: jest.fn<typeof InvoicesApiTypes.updateInvoice>(),
  deleteInvoice: jest.fn<typeof InvoicesApiTypes.deleteInvoice>(),
  fetchInvoiceById: jest.fn<typeof InvoicesApiTypes.fetchInvoiceById>(),
}));

const mockFetchWorkItemBudgets = jest.fn<typeof WorkItemBudgetsApiTypes.fetchWorkItemBudgets>();
jest.unstable_mockModule('./lib/workItemBudgetsApi.js', () => ({
  fetchWorkItemBudgets: mockFetchWorkItemBudgets,
  createWorkItemBudget: jest.fn<typeof WorkItemBudgetsApiTypes.createWorkItemBudget>(),
  updateWorkItemBudget: jest.fn<typeof WorkItemBudgetsApiTypes.updateWorkItemBudget>(),
  deleteWorkItemBudget: jest.fn<typeof WorkItemBudgetsApiTypes.deleteWorkItemBudget>(),
}));

const mockFetchHouseholdItemBudgets =
  jest.fn<typeof HouseholdItemBudgetsApiTypes.fetchHouseholdItemBudgets>();
jest.unstable_mockModule('./lib/householdItemBudgetsApi.js', () => ({
  fetchHouseholdItemBudgets: mockFetchHouseholdItemBudgets,
  createHouseholdItemBudget:
    jest.fn<typeof HouseholdItemBudgetsApiTypes.createHouseholdItemBudget>(),
  updateHouseholdItemBudget:
    jest.fn<typeof HouseholdItemBudgetsApiTypes.updateHouseholdItemBudget>(),
  deleteHouseholdItemBudget:
    jest.fn<typeof HouseholdItemBudgetsApiTypes.deleteHouseholdItemBudget>(),
}));

// ManagePage calls fetchHouseholdItemCategories on mount.
// Mock to prevent fetch calls in the jsdom test environment.
const mockFetchHouseholdItemCategories =
  jest.fn<typeof HouseholdItemCategoriesApiTypes.fetchHouseholdItemCategories>();
jest.unstable_mockModule('./lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchHouseholdItemCategories,
  createHouseholdItemCategory:
    jest.fn<typeof HouseholdItemCategoriesApiTypes.createHouseholdItemCategory>(),
  updateHouseholdItemCategory:
    jest.fn<typeof HouseholdItemCategoriesApiTypes.updateHouseholdItemCategory>(),
  deleteHouseholdItemCategory:
    jest.fn<typeof HouseholdItemCategoriesApiTypes.deleteHouseholdItemCategory>(),
}));

describe('App', () => {
  // Dynamic imports
  let App: typeof AppTypes.App;

  beforeEach(async () => {
    // Dynamic import modules (only once)
    if (!App) {
      const appModule = await import('./App.js');
      App = appModule.App;
    }

    // Reset mocks
    mockGetAuthMe.mockReset();
    mockLogin.mockReset();
    mockLogout.mockReset();
    mockFetchBudgetCategories.mockReset();
    mockCreateBudgetCategory.mockReset();
    mockUpdateBudgetCategory.mockReset();
    mockDeleteBudgetCategory.mockReset();
    mockListMilestones.mockReset();
    mockGetTimeline.mockReset();
    mockListWorkItems.mockReset();
    mockListHouseholdItems.mockReset();
    mockFetchVendors.mockReset();
    mockFetchTags.mockReset();
    mockListUsers.mockReset();
    mockFetchAllInvoices.mockReset();
    mockFetchWorkItemBudgets.mockReset();
    mockFetchHouseholdItemBudgets.mockReset();
    mockFetchHouseholdItemCategories.mockReset();

    // Default: budget categories returns empty list
    mockFetchBudgetCategories.mockResolvedValue({ categories: [] });

    // Default: milestones returns empty list (used by TimelinePage via useMilestones)
    mockListMilestones.mockResolvedValue([]);

    // Default: timeline returns empty data (used by TimelinePage via useTimeline)
    mockGetTimeline.mockResolvedValue({
      workItems: [],
      dependencies: [],
      milestones: [],
      householdItems: [],
      criticalPath: [],
      dateRange: null,
    });

    // Default: work items returns empty paginated list (used by WorkItemsPage and
    // MilestoneWorkItemLinker via listWorkItems)
    mockListWorkItems.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });

    // Default: household items returns empty paginated list (used by HouseholdItemsPage)
    mockListHouseholdItems.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
    });

    // Default: vendors returns empty list (used by HouseholdItemsPage vendor filter)
    mockFetchVendors.mockResolvedValue({
      vendors: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
    });

    // Default: tags returns empty list (used by WorkItemsPage tag filter)
    mockFetchTags.mockResolvedValue({ tags: [] });

    // Default: users returns empty list (used by WorkItemsPage assigned-to filter)
    mockListUsers.mockResolvedValue({ users: [] });

    // Default: invoices returns empty data (used by InvoicesPage)
    mockFetchAllInvoices.mockResolvedValue({
      invoices: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
      summary: {
        pending: { count: 0, totalAmount: 0 },
        paid: { count: 0, totalAmount: 0 },
        claimed: { count: 0, totalAmount: 0 },
      },
    });
    mockFetchWorkItemBudgets.mockResolvedValue([]);
    mockFetchHouseholdItemBudgets.mockResolvedValue([]);
    mockFetchHouseholdItemCategories.mockResolvedValue({ categories: [] });

    // Default: authenticated user (no setup required)
    mockGetAuthMe.mockResolvedValue({
      user: {
        id: 'test-user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'member',
        authProvider: 'local',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        deactivatedAt: null,
      },
      setupRequired: false,
      oidcEnabled: false,
    });
  });

  it('renders without crashing', async () => {
    render(<App />);
    expect(document.body).toBeInTheDocument();
    // Wait for auth check and lazy-loaded component to resolve
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument(), {
      timeout: 5000,
    });
  });

  it('renders the AppShell layout with sidebar and header', async () => {
    render(<App />);

    // Wait for auth loading to complete
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument(), {
      timeout: 5000,
    });

    // Sidebar should be present
    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toBeInTheDocument();

    // Header should be present
    const header = screen.getByRole('banner');
    expect(header).toBeInTheDocument();

    // Main content area should be present
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
  });

  it('shows Project page at root path / (redirects to /project/overview)', async () => {
    render(<App />);

    // Wait for lazy-loaded DashboardPage component to resolve
    // Root redirects to /project which redirects to /project/overview
    const heading = await screen.findByRole('heading', { name: /^project$/i });
    expect(heading).toBeInTheDocument();
  });

  it('navigates to Work Items page when /project/work-items path is accessed', async () => {
    window.history.pushState({}, 'Work Items', '/project/work-items');
    render(<App />);

    // Wait for lazy-loaded WorkItems component to resolve
    // The WorkItemsPage h1 now reads "Project" (shared sub-nav heading)
    const heading = await screen.findByRole('heading', { name: /^project$/i, level: 1 });
    expect(heading).toBeInTheDocument();
  });

  it('navigates to Manage page when /budget/categories path is accessed (redirect)', async () => {
    window.history.pushState({}, 'Budget Categories', '/budget/categories');
    render(<App />);

    // /budget/categories now redirects to /settings/manage?tab=budget-categories
    // ManagePage renders an h1 heading of "Manage"
    // Extended timeout: requires lazy-load of ManagePage after redirect from /budget/categories
    const heading = await screen.findByRole(
      'heading',
      { name: /^manage$/i, level: 1 },
      { timeout: 5000 },
    );
    expect(heading).toBeInTheDocument();
  });

  it('navigates to Schedule page when /schedule/gantt path is accessed', async () => {
    window.history.pushState({}, 'Schedule', '/schedule/gantt');
    render(<App />);

    // Wait for lazy-loaded TimelinePage component to resolve.
    // Use an extended timeout because TimelinePage has more static imports
    // (useMilestones, MilestonePanel) which makes the lazy load slower in CI.
    const heading = await screen.findByRole('heading', { name: /schedule/i }, { timeout: 5000 });
    expect(heading).toBeInTheDocument();
  });

  it('navigates to Household Items page when /project/household-items path is accessed', async () => {
    window.history.pushState({}, 'Household Items', '/project/household-items');
    render(<App />);

    // Wait for lazy-loaded HouseholdItems component to resolve.
    // The HouseholdItemsPage h1 now reads "Project" (shared sub-nav heading).
    // Use level: 1 to match the page title h1 (not the h2 empty state "No household items yet").
    const heading = await screen.findByRole(
      'heading',
      { name: /^project$/i, level: 1 },
      { timeout: 5000 },
    );
    expect(heading).toBeInTheDocument();
  });

  it('navigates to Invoices page when /budget/invoices path is accessed', async () => {
    window.history.pushState({}, 'Invoices', '/budget/invoices');
    render(<App />);

    // Wait for lazy-loaded Invoices component to resolve
    // The InvoicesPage h1 now reads "Budget" (shared sub-nav heading)
    const heading = await screen.findByRole(
      'heading',
      { name: /^budget$/i, level: 1 },
      { timeout: 5000 },
    );
    expect(heading).toBeInTheDocument();
  });

  it('shows NotFoundPage for unrecognized routes', async () => {
    window.history.pushState({}, 'Unknown', '/unknown-route');
    render(<App />);

    // Wait for lazy-loaded NotFound component to resolve
    const heading = await screen.findByRole('heading', { name: /404.*not found/i });
    expect(heading).toBeInTheDocument();
  });
});
