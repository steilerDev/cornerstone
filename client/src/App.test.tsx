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
import type * as ScheduleApiTypes from './lib/scheduleApi.js';
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

// TimelinePage imports scheduleApi for the auto-schedule feature.
// Mock to prevent fetch calls in the jsdom test environment.
jest.unstable_mockModule('./lib/scheduleApi.js', () => ({
  runSchedule: jest.fn<typeof ScheduleApiTypes.runSchedule>(),
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

    // Default: budget categories returns empty list
    mockFetchBudgetCategories.mockResolvedValue({ categories: [] });

    // Default: milestones returns empty list (used by TimelinePage via useMilestones)
    mockListMilestones.mockResolvedValue([]);

    // Default: timeline returns empty data (used by TimelinePage via useTimeline)
    mockGetTimeline.mockResolvedValue({
      workItems: [],
      dependencies: [],
      milestones: [],
      criticalPath: [],
      dateRange: null,
    });

    // Default: work items returns empty paginated list (used by WorkItemsPage and
    // MilestoneWorkItemLinker via listWorkItems)
    mockListWorkItems.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });

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

  it('shows Dashboard page at root path /', async () => {
    render(<App />);

    // Wait for lazy-loaded Dashboard component to resolve
    const heading = await screen.findByRole('heading', { name: /dashboard/i });
    expect(heading).toBeInTheDocument();
  });

  it('navigates to Work Items page when /work-items path is accessed', async () => {
    window.history.pushState({}, 'Work Items', '/work-items');
    render(<App />);

    // Wait for lazy-loaded WorkItems component to resolve
    const heading = await screen.findByRole('heading', { name: /work items/i, level: 1 });
    expect(heading).toBeInTheDocument();
  });

  it('navigates to Budget Categories page when /budget/categories path is accessed', async () => {
    window.history.pushState({}, 'Budget Categories', '/budget/categories');
    render(<App />);

    // Wait for lazy-loaded BudgetCategories component to resolve
    // h1 now says "Budget" (shared across all budget pages); h2 says "Categories"
    const heading = await screen.findByRole('heading', { name: /^budget$/i, level: 1 });
    expect(heading).toBeInTheDocument();
  });

  it('navigates to Timeline page when /timeline path is accessed', async () => {
    window.history.pushState({}, 'Timeline', '/timeline');
    render(<App />);

    // Wait for lazy-loaded Timeline component to resolve.
    // Use an extended timeout because TimelinePage has more static imports
    // (useMilestones, MilestonePanel) which makes the lazy load slower in CI.
    const heading = await screen.findByRole('heading', { name: /timeline/i }, { timeout: 5000 });
    expect(heading).toBeInTheDocument();
  });

  it('navigates to Household Items page when /household-items path is accessed', async () => {
    window.history.pushState({}, 'Household Items', '/household-items');
    render(<App />);

    // Wait for lazy-loaded HouseholdItems component to resolve
    const heading = await screen.findByRole('heading', { name: /household items/i });
    expect(heading).toBeInTheDocument();
  });

  it('navigates to Documents page when /documents path is accessed', async () => {
    window.history.pushState({}, 'Documents', '/documents');
    render(<App />);

    // Wait for lazy-loaded Documents component to resolve
    const heading = await screen.findByRole('heading', { name: /documents/i });
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
