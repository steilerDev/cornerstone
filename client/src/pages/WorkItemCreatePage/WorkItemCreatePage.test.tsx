/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { UserResponse } from '@cornerstone/shared';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as DependenciesApiTypes from '../../lib/dependenciesApi.js';
import type * as WorkItemCreatePageTypes from './WorkItemCreatePage.js';
import type { UseAreasResult } from '../../hooks/useAreas.js';

const mockCreateWorkItem = jest.fn<typeof WorkItemsApiTypes.createWorkItem>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockListUsers = jest.fn<typeof UsersApiTypes.listUsers>();
const mockCreateDependency = jest.fn<typeof DependenciesApiTypes.createDependency>();

// Mock only API modules — do NOT mock react-router-dom (causes OOM)
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  createWorkItem: mockCreateWorkItem,
  listWorkItems: mockListWorkItems,
}));

jest.unstable_mockModule('../../lib/usersApi.js', () => ({
  listUsers: mockListUsers,
}));

jest.unstable_mockModule('../../lib/dependenciesApi.js', () => ({
  createDependency: mockCreateDependency,
}));

// WorkItemCreatePage now uses fetchVendors to populate AssignmentPicker
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetchVendors = jest.fn<any>();
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
}));

// WorkItemCreatePage uses useAreas hook to populate AreaPicker
function makeAreasHookResult(overrides: Partial<UseAreasResult> = {}): UseAreasResult {
  return {
    areas: [],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    createArea: jest.fn<UseAreasResult['createArea']>(),
    updateArea: jest.fn<UseAreasResult['updateArea']>(),
    deleteArea: jest.fn<UseAreasResult['deleteArea']>(),
    ...overrides,
  };
}
const mockUseAreas = jest.fn<() => UseAreasResult>(() => makeAreasHookResult());
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: mockUseAreas,
}));

// AreaPicker is mocked so tests can programmatically trigger onChange without
// requiring SearchPicker interaction (which involves complex async dropdown logic).
// The mock renders a <select> that calls onChange on change.
let capturedAreaPickerOnChange: ((id: string) => void) | null = null;
jest.unstable_mockModule('../../components/AreaPicker/AreaPicker.js', () => ({
  AreaPicker: ({
    areas,
    value,
    onChange,
    disabled,
    nullable,
  }: {
    areas: Array<{ id: string; name: string }>;
    value: string;
    onChange: (id: string) => void;
    disabled?: boolean;
    nullable?: boolean;
  }) => {
    capturedAreaPickerOnChange = onChange;
    return (
      <select
        data-testid="area-picker-mock"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Area picker"
      >
        {nullable && <option value="">— None —</option>}
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    );
  },
}));

// Helper to capture current location
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

describe('WorkItemCreatePage', () => {
  let WorkItemCreatePageModule: typeof WorkItemCreatePageTypes;

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
    mockCreateWorkItem.mockReset();
    mockListWorkItems.mockReset();
    mockCreateDependency.mockReset();
    mockListUsers.mockReset();
    mockFetchVendors.mockReset();
    capturedAreaPickerOnChange = null;
    // Reset useAreas to default empty state to avoid test pollution from
    // tests that set mockReturnValue with custom areas.
    mockUseAreas.mockReturnValue(makeAreasHookResult());

    if (!WorkItemCreatePageModule) {
      WorkItemCreatePageModule = await import('./WorkItemCreatePage.js');
    }

    mockListUsers.mockResolvedValue({ users: mockUsers });
    // Default: empty list response for WorkItemPicker in DependencySentenceBuilder
    mockListWorkItems.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 15, totalItems: 0, totalPages: 0 },
    });
    // Default: empty vendors list
    mockFetchVendors.mockResolvedValue({
      vendors: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    });
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/project/work-items/new']}>
        <Routes>
          <Route path="/project/work-items/new" element={<WorkItemCreatePageModule.default />} />
          <Route path="/project/work-items/:id" element={<div>Work Item Detail</div>} />
          <Route path="/project/work-items" element={<div>Work Items List</div>} />
        </Routes>
        <LocationDisplay />
      </MemoryRouter>,
    );
  }

  describe('initial render', () => {
    it('shows loading state initially', async () => {
      renderPage();

      expect(screen.getByText('Loading...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });
    });

    it('renders form with all required fields after loading', async () => {
      renderPage();

      // Wait for any field to appear (indicates form loaded)
      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      // Check heading is present
      expect(screen.getByRole('heading', { name: 'Create Work Item' })).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/assigned to/i)).toBeInTheDocument();
      // startDate and endDate are NOT shown at creation — they are computed by the scheduling engine
      expect(screen.queryByLabelText(/start date/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/end date/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/duration/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/start after/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/start before/i)).toBeInTheDocument();
      // Tags section removed in migration 0028 (tags table dropped)
      expect(screen.queryByText('Tags')).not.toBeInTheDocument();
    });

    it('does not render start date or end date inputs (computed by scheduling engine)', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      // These are read-only computed fields shown on WorkItemDetailPage, not editable at creation
      expect(screen.queryByLabelText(/^start date$/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^end date$/i)).not.toBeInTheDocument();
    });

    it('renders duration and constraint inputs as editable fields', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      const durationInput = screen.getByLabelText(/duration/i) as HTMLInputElement;
      expect(durationInput).toBeInTheDocument();
      expect(durationInput.type).toBe('number');
      expect(durationInput).not.toBeDisabled();

      const startAfterInput = screen.getByLabelText(/start after/i) as HTMLInputElement;
      expect(startAfterInput).toBeInTheDocument();
      expect(startAfterInput.type).toBe('date');
      expect(startAfterInput).not.toBeDisabled();

      const startBeforeInput = screen.getByLabelText(/start before/i) as HTMLInputElement;
      expect(startBeforeInput).toBeInTheDocument();
      expect(startBeforeInput.type).toBe('date');
      expect(startBeforeInput).not.toBeDisabled();
    });

    it('renders submit and cancel buttons', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create work item/i })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('renders back button', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to work items/i })).toBeInTheDocument();
      });
    });

    it('filters out deactivated users from assignment dropdown', async () => {
      renderPage();

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
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create work item/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /create work item/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Title is required')).toBeInTheDocument();
      });

      expect(mockCreateWorkItem).not.toHaveBeenCalled();
    });

    it('shows validation error when start after is after start before', async () => {
      const user = userEvent.setup();
      renderPage();

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

      expect(mockCreateWorkItem).not.toHaveBeenCalled();
    });

    it('validates negative duration on submit', async () => {
      const user = userEvent.setup();
      renderPage();

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
      expect(mockCreateWorkItem).not.toHaveBeenCalled();
    });
  });

  describe('form submission', () => {
    it('navigates to work item detail page on successful creation', async () => {
      const user = userEvent.setup();
      mockCreateWorkItem.mockResolvedValue({
        id: 'work-1',
        title: 'Test Work Item',
        description: null,
        status: 'not_started',
        startDate: null,
        endDate: null,
        durationDays: null,
        actualStartDate: null,
        actualEndDate: null,
        startAfter: null,
        startBefore: null,
        assignedUser: null,
        assignedVendor: null,
        area: null,
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
        budgets: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/title/i), 'Test Work Item');

      const submitButton = screen.getByRole('button', { name: /create work item/i });
      await user.click(submitButton);

      // After successful creation, navigates to /work-items/work-1
      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/project/work-items/work-1');
      });
    });

    it('shows error banner on creation failure', async () => {
      const user = userEvent.setup();
      mockCreateWorkItem.mockRejectedValue(new Error('Network error'));

      renderPage();

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

  describe('dependencies section', () => {
    it('renders the dependency sentence builder on the create form', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      // The sentence builder should be rendered in the form
      expect(screen.getByRole('combobox', { name: /predecessor verb/i })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /successor verb/i })).toBeInTheDocument();
    });

    it('does not render direction toggle buttons (old UX removed)', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      expect(
        screen.queryByRole('button', { name: /this item depends on/i }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /this item blocks/i })).not.toBeInTheDocument();
    });

    it('shows pending dependency in sentence format after adding', async () => {
      const user = userEvent.setup();
      // Provide a work item for the picker to show
      mockListWorkItems.mockResolvedValue({
        items: [
          {
            id: 'wi-1',
            title: 'Foundation',
            status: 'completed' as const,
            startDate: null,
            endDate: null,
            durationDays: null,
            actualStartDate: null,
            actualEndDate: null,
            assignedUser: null,
            assignedVendor: null,
            area: null,
            budgetLineCount: 0,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
        pagination: { page: 1, pageSize: 15, totalItems: 1, totalPages: 1 },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      // Focus slot 1 picker to open it
      const pickerInputs = screen.getAllByPlaceholderText(/search/i);
      await user.click(pickerInputs[0]);

      await waitFor(() => {
        expect(screen.getByText('Foundation')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Foundation'));

      // Click Add button
      const addButton = screen.getByRole('button', { name: /^add$/i });
      await user.click(addButton);

      // A pending dependency chip should appear with sentence text
      await waitFor(() => {
        expect(screen.getByRole('list', { name: /pending dependencies/i })).toBeInTheDocument();
      });

      // Verify the sentence format is used (not old direction pill format)
      const list = screen.getByRole('list', { name: /pending dependencies/i });
      expect(list.textContent).toMatch(/must finish before|must start before/i);
    });
  });

  describe('navigation', () => {
    it('navigates back to work items list on back button click', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to work items/i })).toBeInTheDocument();
      });

      const backButton = screen.getByRole('button', { name: /back to work items/i });
      await user.click(backButton);

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/project/work-items');
      });
    });

    it('navigates back to work items list on cancel button click', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/project/work-items');
      });
    });
  });

  // ── Area breadcrumb preview (Story #1238) ─────────────────────────────────

  describe('area breadcrumb preview', () => {
    it('does not show a breadcrumb nav before any area is selected', async () => {
      // No area selected by default; areaId state is ''
      mockUseAreas.mockReturnValue(
        makeAreasHookResult({
          areas: [
            {
              id: 'a1',
              name: 'Kitchen',
              parentId: null,
              color: null,
              description: null,
              sortOrder: 0,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          ],
        }),
      );
      mockListWorkItems.mockResolvedValue({
        items: [],
        pagination: { page: 1, pageSize: 15, totalItems: 0, totalPages: 0 },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      // No area selected → breadcrumb nav should not be present
      expect(screen.queryByRole('navigation', { name: /area path/i })).not.toBeInTheDocument();
    });

    it('shows area name in breadcrumb after an area is selected', async () => {
      const kitchenArea = {
        id: 'a1',
        name: 'Kitchen',
        parentId: null,
        color: null,
        description: null,
        sortOrder: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      mockUseAreas.mockReturnValue(makeAreasHookResult({ areas: [kitchenArea] }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      // Trigger area selection via the mocked AreaPicker's onChange
      expect(capturedAreaPickerOnChange).not.toBeNull();
      capturedAreaPickerOnChange!('a1');

      await waitFor(() => {
        // AreaBreadcrumb in default variant renders a nav with aria-label "Area path"
        expect(screen.getByRole('navigation', { name: /area path/i })).toBeInTheDocument();
      });

      const breadcrumbNav = screen.getByRole('navigation', { name: /area path/i });
      expect(within(breadcrumbNav).getByText('Kitchen')).toBeInTheDocument();
    });

    it('shows ancestor chain when selected area has a parent', async () => {
      const groundFloor = {
        id: 'a0',
        name: 'Ground Floor',
        parentId: null,
        color: null,
        description: null,
        sortOrder: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      const kitchen = {
        id: 'a1',
        name: 'Kitchen',
        parentId: 'a0',
        color: null,
        description: null,
        sortOrder: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      mockUseAreas.mockReturnValue(makeAreasHookResult({ areas: [groundFloor, kitchen] }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      // Select the child area
      capturedAreaPickerOnChange!('a1');

      await waitFor(() => {
        expect(screen.getByRole('navigation', { name: /area path/i })).toBeInTheDocument();
      });

      // Both ancestor and area name should be visible in the breadcrumb nav
      const breadcrumbNav = screen.getByRole('navigation', { name: /area path/i });
      expect(within(breadcrumbNav).getByText('Ground Floor')).toBeInTheDocument();
      expect(within(breadcrumbNav).getByText('Kitchen')).toBeInTheDocument();
    });

    it('hides breadcrumb preview after area is cleared', async () => {
      const kitchenArea = {
        id: 'a1',
        name: 'Kitchen',
        parentId: null,
        color: null,
        description: null,
        sortOrder: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      mockUseAreas.mockReturnValue(makeAreasHookResult({ areas: [kitchenArea] }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      // Select an area first
      capturedAreaPickerOnChange!('a1');

      await waitFor(() => {
        expect(screen.getByRole('navigation', { name: /area path/i })).toBeInTheDocument();
      });

      // Now clear the selection (AreaPicker nullable → '' means no area)
      capturedAreaPickerOnChange!('');

      await waitFor(() => {
        expect(
          screen.queryByRole('navigation', { name: /area path/i }),
        ).not.toBeInTheDocument();
      });
    });
  });

  // ── buildAreaSummary helper (tested via rendered output) ──────────────────

  describe('buildAreaSummary — tested via rendered breadcrumb', () => {
    it('builds correct ancestor chain for a 3-level hierarchy (root-first order)', async () => {
      // areas: a (root) → b (child of a) → c (child of b)
      const a = {
        id: 'a',
        name: 'House',
        parentId: null,
        color: null,
        description: null,
        sortOrder: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      const b = {
        id: 'b',
        name: 'Ground Floor',
        parentId: 'a',
        color: null,
        description: null,
        sortOrder: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      const c = {
        id: 'c',
        name: 'Kitchen',
        parentId: 'b',
        color: null,
        description: null,
        sortOrder: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      mockUseAreas.mockReturnValue(
        makeAreasHookResult({ areas: [c, b, a] }), // deliberately shuffled to confirm walk-up logic
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      // Select deepest area c
      capturedAreaPickerOnChange!('c');

      await waitFor(() => {
        expect(screen.getByRole('navigation', { name: /area path/i })).toBeInTheDocument();
      });

      // Root-first order: House › Ground Floor › Kitchen
      const nav = screen.getByRole('navigation', { name: /area path/i });
      const listItems = nav.querySelectorAll('li');
      const segmentTexts = Array.from(listItems)
        .filter((li) => !li.getAttribute('aria-hidden'))
        .map((li) => li.textContent);

      expect(segmentTexts).toEqual(['House', 'Ground Floor', 'Kitchen']);
    });

    it('renders "No area" fallback for an unknown areaId (buildAreaSummary returns null)', async () => {
      mockUseAreas.mockReturnValue(
        makeAreasHookResult({
          areas: [
            {
              id: 'a1',
              name: 'Known Area',
              parentId: null,
              color: null,
              description: null,
              sortOrder: 0,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          ],
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      // Select an ID that does not exist in the areas list
      capturedAreaPickerOnChange!('does-not-exist');

      // buildAreaSummary returns null for unknown IDs.
      // WorkItemCreatePage renders <AreaBreadcrumb area={null} variant="default" /> in that case,
      // which shows "No area" (muted span) and no nav element.
      await waitFor(() => {
        // No nav breadcrumb — AreaBreadcrumb renders a plain span for null area
        expect(
          screen.queryByRole('navigation', { name: /area path/i }),
        ).not.toBeInTheDocument();
        expect(screen.getByText('No area')).toBeInTheDocument();
      });
    });
  });
});
