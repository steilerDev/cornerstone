/**
 * @jest-environment jsdom
 *
 * Unit tests for MilestonePanel component.
 * Tests portal rendering, list/create/edit/linker views, delete confirmation,
 * Escape key navigation, and overlay click-to-close.
 *
 * NOTE: Uses global.fetch mock for the getMilestone API call made by the component.
 * The MilestoneWorkItemLinker child also calls listWorkItems → fetch, so fetch
 * is set up to handle both /api/milestones/:id and /api/work-items endpoints.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type {
  MilestoneSummary,
  MilestoneDetail,
  WorkItemSummary,
  PaginationMeta,
} from '@cornerstone/shared';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MILESTONE_1: MilestoneSummary = {
  id: 1,
  title: 'Foundation Complete',
  description: null,
  targetDate: '2024-06-30',
  isCompleted: false,
  completedAt: null,
  color: null,
  workItemCount: 2,
  createdBy: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const MILESTONE_2: MilestoneSummary = {
  id: 2,
  title: 'Framing Done',
  description: 'Framing complete',
  targetDate: '2024-09-15',
  isCompleted: true,
  completedAt: '2024-09-14T12:00:00Z',
  color: '#EF4444',
  workItemCount: 0,
  createdBy: { id: 'user-1', displayName: 'Alice', email: 'alice@example.com' },
  createdAt: '2024-02-01T00:00:00Z',
  updatedAt: '2024-09-14T12:00:00Z',
};

const MILESTONE_DETAIL: MilestoneDetail = {
  id: 1,
  title: 'Foundation Complete',
  description: null,
  targetDate: '2024-06-30',
  isCompleted: false,
  completedAt: null,
  color: null,
  workItems: [] as WorkItemSummary[],
  createdBy: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Hook mock helpers
// ---------------------------------------------------------------------------

/** Helper: create a jest.Mock that resolves with the given value. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockResolved(value: any): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jest.fn<() => Promise<any>>().mockResolvedValue(value) as unknown as jest.Mock;
}

/** Helper: create a jest.Mock that returns (but never resolves) a pending Promise. */
function mockPending(): jest.Mock {
  return jest
    .fn<() => Promise<any>>()
    .mockReturnValue(new Promise(() => {})) as unknown as jest.Mock;
}

function makeHooks(
  overrides: Partial<{
    createMilestone: jest.Mock;
    updateMilestone: jest.Mock;
    deleteMilestone: jest.Mock;
    linkWorkItem: jest.Mock;
    unlinkWorkItem: jest.Mock;
  }> = {},
) {
  return {
    createMilestone: overrides.createMilestone ?? mockResolved(MILESTONE_1),
    updateMilestone: overrides.updateMilestone ?? mockResolved(MILESTONE_1),
    deleteMilestone: overrides.deleteMilestone ?? mockResolved(true),
    linkWorkItem: overrides.linkWorkItem ?? mockResolved(true),
    unlinkWorkItem: overrides.unlinkWorkItem ?? mockResolved(true),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MilestonePanel', () => {
  let MilestonePanel: React.ComponentType<{
    milestones: MilestoneSummary[];
    isLoading: boolean;
    error: string | null;
    onClose: jest.Mock;
    hooks: ReturnType<typeof makeHooks>;
    onMutated: jest.Mock;
    onMilestoneSelect?: jest.Mock;
  }>;

  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(async () => {
    if (!MilestonePanel) {
      const module = await import('./MilestonePanel.js');
      MilestonePanel = module.MilestonePanel as typeof MilestonePanel;
    }
    // Set up fetch mock — handles getMilestone (GET /api/milestones/:id) and
    // listWorkItems (GET /api/work-items) calls from child MilestoneWorkItemLinker
    mockFetch = jest.fn<typeof fetch>();
    mockFetch.mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/milestones/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ milestone: MILESTONE_DETAIL }),
        } as Response;
      }
      if (urlStr.includes('/api/work-items')) {
        const emptyPagination: PaginationMeta = {
          page: 1,
          pageSize: 20,
          totalItems: 0,
          totalPages: 0,
        };
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [], pagination: emptyPagination }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response;
    });
    global.fetch = mockFetch;
  });

  afterEach(() => {
    // Use RTL cleanup to properly unmount React trees (including portals)
    cleanup();
    global.fetch = undefined as unknown as typeof fetch;
  });

  function renderPanel(
    overrides: {
      milestones?: MilestoneSummary[];
      isLoading?: boolean;
      error?: string | null;
      onClose?: jest.Mock;
      hooks?: ReturnType<typeof makeHooks>;
      onMutated?: jest.Mock;
      onMilestoneSelect?: jest.Mock;
    } = {},
  ) {
    const onClose = overrides.onClose ?? jest.fn();
    const onMutated = overrides.onMutated ?? jest.fn();
    const hooks = overrides.hooks ?? makeHooks();

    return render(
      <MilestonePanel
        milestones={overrides.milestones ?? [MILESTONE_1]}
        isLoading={overrides.isLoading ?? false}
        error={overrides.error ?? null}
        onClose={onClose}
        hooks={hooks}
        onMutated={onMutated}
        onMilestoneSelect={overrides.onMilestoneSelect}
      />,
    );
  }

  // ── Portal rendering ───────────────────────────────────────────────────────

  describe('portal rendering', () => {
    it('renders into document.body via portal', () => {
      const { container } = renderPanel();
      // Portal content should NOT be in the test container
      expect(container.querySelector('[data-testid="milestone-panel"]')).not.toBeInTheDocument();
      // But it should be in the document
      expect(document.querySelector('[data-testid="milestone-panel"]')).toBeInTheDocument();
    });

    it('has role="dialog"', () => {
      renderPanel();
      expect(screen.getByRole('dialog', { name: /milestones/i })).toBeInTheDocument();
    });

    it('has aria-modal="true"', () => {
      renderPanel();
      const panel = screen.getByTestId('milestone-panel');
      expect(panel.getAttribute('aria-modal')).toBe('true');
    });
  });

  // ── List view ──────────────────────────────────────────────────────────────

  describe('list view', () => {
    it('shows "Milestones" title in list view', () => {
      renderPanel();
      expect(screen.getByRole('heading', { name: /^milestones$/i })).toBeInTheDocument();
    });

    it('renders milestone list items', () => {
      renderPanel({ milestones: [MILESTONE_1, MILESTONE_2] });
      expect(screen.getAllByTestId('milestone-list-item')).toHaveLength(2);
    });

    it('renders milestone title in list', () => {
      renderPanel({ milestones: [MILESTONE_1] });
      expect(screen.getByText('Foundation Complete')).toBeInTheDocument();
    });

    it('sorts milestones by target date ascending', () => {
      renderPanel({ milestones: [MILESTONE_2, MILESTONE_1] }); // 2 comes before 1 in the array
      const items = screen.getAllByTestId('milestone-list-item');
      // MILESTONE_1 (June 30) should appear before MILESTONE_2 (Sep 15)
      expect(items[0]).toHaveTextContent('Foundation Complete');
      expect(items[1]).toHaveTextContent('Framing Done');
    });

    it('renders "No milestones yet" when list is empty', () => {
      renderPanel({ milestones: [] });
      expect(screen.getByTestId('milestone-list-empty')).toBeInTheDocument();
    });

    it('renders work item count for milestone with linked items', () => {
      renderPanel({ milestones: [MILESTONE_1] }); // workItemCount = 2
      expect(screen.getByText(/2 items/)).toBeInTheDocument();
    });

    it('does not render item count for milestone with 0 linked items', () => {
      renderPanel({ milestones: [MILESTONE_2] }); // workItemCount = 0
      expect(screen.queryByText(/0 item/)).not.toBeInTheDocument();
    });

    it('renders the "+ New Milestone" button', () => {
      renderPanel();
      expect(screen.getByTestId('milestone-new-button')).toBeInTheDocument();
    });

    it('renders loading state when isLoading=true', () => {
      renderPanel({ milestones: [], isLoading: true });
      expect(screen.getByText(/loading milestones/i)).toBeInTheDocument();
    });

    it('renders error message when error is set', () => {
      renderPanel({ milestones: [], error: 'Failed to load' });
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load');
    });

    it('calls onMilestoneSelect when milestone item is clicked', () => {
      const onMilestoneSelect = jest.fn();
      renderPanel({ onMilestoneSelect });

      // Use the specific milestone item button (has the full date in aria-label)
      fireEvent.click(screen.getByRole('button', { name: /foundation complete.*incomplete/i }));

      expect(onMilestoneSelect).toHaveBeenCalledWith(1);
    });

    it('renders close button', () => {
      renderPanel();
      expect(screen.getByRole('button', { name: /close milestones panel/i })).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', () => {
      const onClose = jest.fn();
      renderPanel({ onClose });

      fireEvent.click(screen.getByRole('button', { name: /close milestones panel/i }));

      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when overlay backdrop is clicked', () => {
      const onClose = jest.fn();
      renderPanel({ onClose });

      const panel = screen.getByTestId('milestone-panel');
      // Click on the overlay (currentTarget === target)
      fireEvent.click(panel);

      expect(onClose).toHaveBeenCalled();
    });
  });

  // ── Create view ────────────────────────────────────────────────────────────

  describe('create view', () => {
    it('switches to create view when "+ New Milestone" is clicked', () => {
      renderPanel();

      fireEvent.click(screen.getByTestId('milestone-new-button'));

      expect(screen.getByRole('heading', { name: /new milestone/i })).toBeInTheDocument();
    });

    it('shows the MilestoneForm in create mode', () => {
      renderPanel();

      fireEvent.click(screen.getByTestId('milestone-new-button'));

      expect(screen.getByTestId('milestone-form')).toBeInTheDocument();
    });

    it('calls hooks.createMilestone and onMutated on valid form submit', async () => {
      const createMilestone = mockResolved(MILESTONE_1);
      const onMutated = jest.fn();
      const hooks = makeHooks({ createMilestone });

      renderPanel({ hooks, onMutated });
      fireEvent.click(screen.getByTestId('milestone-new-button'));

      // Fill in form
      fireEvent.change(screen.getByLabelText(/name/i), {
        target: { value: 'New Milestone' },
      });
      fireEvent.change(screen.getByLabelText(/target date/i), {
        target: { value: '2024-10-01' },
      });
      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      await waitFor(() => {
        expect(createMilestone).toHaveBeenCalled();
        expect(onMutated).toHaveBeenCalled();
      });
    });

    it('goes back to list view after successful create', async () => {
      const createMilestone = mockResolved(MILESTONE_1);
      const hooks = makeHooks({ createMilestone });

      renderPanel({ hooks });
      fireEvent.click(screen.getByTestId('milestone-new-button'));

      fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'New' } });
      fireEvent.change(screen.getByLabelText(/target date/i), {
        target: { value: '2024-10-01' },
      });
      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^milestones$/i })).toBeInTheDocument();
      });
    });

    it('shows error banner when createMilestone returns null', async () => {
      const createMilestone = mockResolved(null);
      const hooks = makeHooks({ createMilestone });

      renderPanel({ hooks });
      fireEvent.click(screen.getByTestId('milestone-new-button'));

      fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'New' } });
      fireEvent.change(screen.getByLabelText(/target date/i), {
        target: { value: '2024-10-01' },
      });
      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  // ── Edit view ──────────────────────────────────────────────────────────────

  describe('edit view', () => {
    it('switches to edit view when edit button is clicked', async () => {
      renderPanel();

      fireEvent.click(screen.getByRole('button', { name: /edit foundation complete/i }));

      expect(screen.getByRole('heading', { name: /edit milestone/i })).toBeInTheDocument();
    });

    it('pre-fills form with milestone data in edit view', async () => {
      renderPanel();

      fireEvent.click(screen.getByRole('button', { name: /edit foundation complete/i }));

      const titleInput = screen.getByLabelText(/name/i) as HTMLInputElement;
      expect(titleInput.value).toBe('Foundation Complete');
    });

    it('shows delete button in edit view', () => {
      renderPanel();

      fireEvent.click(screen.getByRole('button', { name: /edit foundation complete/i }));

      // The delete button in edit footer has text "Delete Milestone"
      expect(screen.getByRole('button', { name: /delete milestone/i })).toBeInTheDocument();
    });

    it('loads milestone detail via fetch when entering edit view', async () => {
      renderPanel();

      fireEvent.click(screen.getByRole('button', { name: /edit foundation complete/i }));

      await waitFor(() => {
        const fetchedUrls = mockFetch.mock.calls.map((call) => String(call[0]));
        expect(fetchedUrls.some((url) => url.includes('/api/milestones/1'))).toBe(true);
      });
    });

    it('calls hooks.updateMilestone on form submit in edit view', async () => {
      const updateMilestone = mockResolved(MILESTONE_1);
      const hooks = makeHooks({ updateMilestone });

      renderPanel({ hooks });
      fireEvent.click(screen.getByRole('button', { name: /edit foundation complete/i }));

      // The form is pre-filled, so just submit
      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      await waitFor(() => {
        expect(updateMilestone).toHaveBeenCalledWith(1, expect.any(Object));
      });
    });
  });

  // ── Delete confirmation ────────────────────────────────────────────────────

  describe('delete confirmation', () => {
    it('opens delete confirmation when delete action button is clicked from list', () => {
      renderPanel();

      fireEvent.click(screen.getByRole('button', { name: /delete foundation complete/i }));

      expect(screen.getByRole('dialog', { name: /delete milestone/i })).toBeInTheDocument();
    });

    it('shows milestone name in delete confirmation', () => {
      renderPanel();

      fireEvent.click(screen.getByRole('button', { name: /delete foundation complete/i }));

      // The milestone name appears in a <strong> tag within the delete dialog
      const deleteDialog = screen.getByRole('dialog', { name: /delete milestone/i });
      expect(deleteDialog).toHaveTextContent('Foundation Complete');
    });

    it('calls hooks.deleteMilestone and onMutated when delete is confirmed', async () => {
      const deleteMilestone = mockResolved(true);
      const onMutated = jest.fn();
      const hooks = makeHooks({ deleteMilestone });

      renderPanel({ hooks, onMutated });

      fireEvent.click(screen.getByRole('button', { name: /delete foundation complete/i }));
      fireEvent.click(screen.getByTestId('milestone-delete-confirm'));

      await waitFor(() => {
        expect(deleteMilestone).toHaveBeenCalledWith(1);
        expect(onMutated).toHaveBeenCalled();
      });
    });

    it('closes delete dialog when Cancel is clicked', () => {
      renderPanel();

      fireEvent.click(screen.getByRole('button', { name: /delete foundation complete/i }));
      expect(screen.getByRole('dialog', { name: /delete milestone/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByRole('dialog', { name: /delete milestone/i })).not.toBeInTheDocument();
    });

    it('shows "Deleting…" text when deleteMilestone is in progress', async () => {
      // Make deleteMilestone never resolve so we can see the mid-delete state
      const deleteMilestone = mockPending();
      const hooks = makeHooks({ deleteMilestone });

      renderPanel({ hooks });
      fireEvent.click(screen.getByRole('button', { name: /delete foundation complete/i }));

      fireEvent.click(screen.getByTestId('milestone-delete-confirm'));

      await waitFor(() => {
        expect(screen.getByTestId('milestone-delete-confirm')).toHaveTextContent('Deleting…');
      });
    });
  });

  // ── Linker view ────────────────────────────────────────────────────────────

  describe('linker view', () => {
    it('switches to linker view when link button is clicked', async () => {
      renderPanel();

      fireEvent.click(
        screen.getByRole('button', { name: /manage linked work items for foundation complete/i }),
      );

      await waitFor(() => {
        // The linker view shows the MilestoneWorkItemLinker component
        expect(screen.getByTestId('milestone-work-item-linker')).toBeInTheDocument();
      });
    });

    it('loads milestone detail via fetch when entering linker view', async () => {
      renderPanel();

      fireEvent.click(
        screen.getByRole('button', { name: /manage linked work items for foundation complete/i }),
      );

      await waitFor(() => {
        const fetchedUrls = mockFetch.mock.calls.map((call) => String(call[0]));
        expect(fetchedUrls.some((url) => url.includes('/api/milestones/1'))).toBe(true);
      });
    });

    it('shows the MilestoneWorkItemLinker component', async () => {
      renderPanel();

      fireEvent.click(
        screen.getByRole('button', { name: /manage linked work items for foundation complete/i }),
      );

      await waitFor(() => {
        expect(screen.getByTestId('milestone-work-item-linker')).toBeInTheDocument();
      });
    });
  });

  // ── Escape key navigation ──────────────────────────────────────────────────

  describe('Escape key navigation', () => {
    it('closes panel when Escape is pressed in list view', () => {
      const onClose = jest.fn();
      renderPanel({ onClose });

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).toHaveBeenCalled();
    });

    it('returns to list view from create view when Escape is pressed', () => {
      renderPanel();

      fireEvent.click(screen.getByTestId('milestone-new-button'));
      expect(screen.getByRole('heading', { name: /new milestone/i })).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.getByRole('heading', { name: /^milestones$/i })).toBeInTheDocument();
    });

    it('returns to list view from edit view when Escape is pressed', () => {
      renderPanel();

      fireEvent.click(screen.getByRole('button', { name: /edit foundation complete/i }));
      expect(screen.getByRole('heading', { name: /edit milestone/i })).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.getByRole('heading', { name: /^milestones$/i })).toBeInTheDocument();
    });

    it('dismisses delete dialog before navigating back when Escape is pressed', () => {
      const onClose = jest.fn();
      renderPanel({ onClose });

      fireEvent.click(screen.getByRole('button', { name: /delete foundation complete/i }));
      expect(screen.getByRole('dialog', { name: /delete milestone/i })).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      // Delete dialog should close, but panel stays open
      expect(screen.queryByRole('dialog', { name: /delete milestone/i })).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('does not close panel when Escape closes delete dialog (second Escape closes panel)', () => {
      const onClose = jest.fn();
      renderPanel({ onClose });

      fireEvent.click(screen.getByRole('button', { name: /delete foundation complete/i }));

      // First Escape dismisses delete dialog
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();

      // Second Escape closes the panel
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });
  });
});
