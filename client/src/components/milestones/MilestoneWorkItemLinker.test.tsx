/**
 * @jest-environment jsdom
 *
 * Unit tests for MilestoneWorkItemLinker component.
 * Tests linked work item chip rendering, search with debounce,
 * link/unlink interactions, and keyboard navigation.
 *
 * NOTE: Uses global.fetch mocks rather than jest.unstable_mockModule to avoid
 * the ESM module instance mismatch issue (see useMilestones.test.tsx notes).
 * The component calls listWorkItems → apiClient.get → fetch, so fetch-level
 * mocking reliably intercepts all API calls.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { WorkItemSummary, PaginationMeta } from '@cornerstone/shared';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WI_1: WorkItemSummary = {
  id: 'wi-1',
  title: 'Pour Foundation',
  status: 'in_progress',
  startDate: '2024-06-01',
  endDate: '2024-06-15',
  durationDays: 14,
  assignedUser: null,
  tags: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const WI_2: WorkItemSummary = {
  id: 'wi-2',
  title: 'Install Framing',
  status: 'not_started',
  startDate: null,
  endDate: null,
  durationDays: null,
  assignedUser: null,
  tags: [],
  createdAt: '2024-01-02T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
};

const WI_3: WorkItemSummary = {
  id: 'wi-3',
  title: 'Roof Installation',
  status: 'not_started',
  startDate: null,
  endDate: null,
  durationDays: null,
  assignedUser: null,
  tags: [],
  createdAt: '2024-01-03T00:00:00Z',
  updatedAt: '2024-01-03T00:00:00Z',
};

/** Helper: build pagination meta for N items */
function pagination(totalItems: number): PaginationMeta {
  return { page: 1, pageSize: 20, totalItems, totalPages: Math.max(1, totalItems) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MilestoneWorkItemLinker', () => {
  let MilestoneWorkItemLinker: React.ComponentType<{
    milestoneId: number;
    linkedWorkItems: WorkItemSummary[];
    isLinking: boolean;
    onLink: (id: string) => void;
    onUnlink: (id: string) => void;
    onBack: () => void;
  }>;

  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(async () => {
    jest.useFakeTimers();
    if (!MilestoneWorkItemLinker) {
      const module = await import('./MilestoneWorkItemLinker.js');
      MilestoneWorkItemLinker = module.MilestoneWorkItemLinker;
    }
    mockFetch = jest.fn<typeof fetch>();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    global.fetch = undefined as unknown as typeof fetch;
  });

  /** Helper: configure fetch to return a work item list response */
  function setupFetchWithItems(items: WorkItemSummary[]) {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items,
        pagination: pagination(items.length),
      }),
    } as Response);
  }

  /** Helper: configure fetch to reject with a network error */
  function setupFetchFailure() {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
  }

  function renderLinker(
    overrides: {
      milestoneId?: number;
      linkedWorkItems?: WorkItemSummary[];
      isLinking?: boolean;
      onLink?: jest.Mock;
      onUnlink?: jest.Mock;
      onBack?: jest.Mock;
    } = {},
  ) {
    const onLink = overrides.onLink ?? jest.fn();
    const onUnlink = overrides.onUnlink ?? jest.fn();
    const onBack = overrides.onBack ?? jest.fn();
    return render(
      <MilestoneWorkItemLinker
        milestoneId={overrides.milestoneId ?? 1}
        linkedWorkItems={overrides.linkedWorkItems ?? []}
        isLinking={overrides.isLinking ?? false}
        onLink={onLink}
        onUnlink={onUnlink}
        onBack={onBack}
      />,
    );
  }

  // ── Basic rendering ────────────────────────────────────────────────────────

  describe('basic rendering', () => {
    it('renders the linker container', () => {
      renderLinker();
      expect(screen.getByTestId('milestone-work-item-linker')).toBeInTheDocument();
    });

    it('renders the back button', () => {
      renderLinker();
      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    });

    it('renders the "Linked Work Items" heading', () => {
      renderLinker();
      expect(screen.getByRole('heading', { name: /linked work items/i })).toBeInTheDocument();
    });

    it('renders search input', () => {
      renderLinker();
      expect(screen.getByLabelText(/search work items to link/i)).toBeInTheDocument();
    });

    it('renders "No work items linked" when no items linked', () => {
      renderLinker({ linkedWorkItems: [] });
      expect(screen.getByText('No work items linked')).toBeInTheDocument();
    });
  });

  // ── Linked item chips ──────────────────────────────────────────────────────

  describe('linked item chips', () => {
    it('renders a chip for each linked work item', () => {
      renderLinker({ linkedWorkItems: [WI_1, WI_2] });
      expect(screen.getByText('Pour Foundation')).toBeInTheDocument();
      expect(screen.getByText('Install Framing')).toBeInTheDocument();
    });

    it('renders a remove button for each chip', () => {
      renderLinker({ linkedWorkItems: [WI_1, WI_2] });
      const removeButtons = screen.getAllByRole('button', { name: /remove/i });
      expect(removeButtons).toHaveLength(2);
    });

    it('chip remove button has aria-label with item title', () => {
      renderLinker({ linkedWorkItems: [WI_1] });
      expect(screen.getByRole('button', { name: /remove pour foundation/i })).toBeInTheDocument();
    });

    it('does not show "No work items linked" when items are linked', () => {
      renderLinker({ linkedWorkItems: [WI_1] });
      expect(screen.queryByText('No work items linked')).not.toBeInTheDocument();
    });

    it('shows linked item count in the label', () => {
      renderLinker({ linkedWorkItems: [WI_1, WI_2] });
      expect(screen.getByText(/\(2\)/)).toBeInTheDocument();
    });

    it('truncates long titles to 30 chars + ellipsis', () => {
      const longTitleItem: WorkItemSummary = {
        ...WI_1,
        title: 'A very long work item title that exceeds the limit here',
      };
      renderLinker({ linkedWorkItems: [longTitleItem] });
      // The chip should show truncated text
      expect(screen.getByText('A very long work item title th…')).toBeInTheDocument();
    });

    it('disables chip remove buttons when isLinking=true', () => {
      renderLinker({ linkedWorkItems: [WI_1], isLinking: true });
      const removeButton = screen.getByRole('button', { name: /remove pour foundation/i });
      expect(removeButton).toBeDisabled();
    });
  });

  // ── Unlink interactions ────────────────────────────────────────────────────

  describe('unlink interactions', () => {
    it('calls onUnlink with work item id when chip remove is clicked', () => {
      const onUnlink = jest.fn();
      renderLinker({ linkedWorkItems: [WI_1], onUnlink });

      fireEvent.click(screen.getByRole('button', { name: /remove pour foundation/i }));

      expect(onUnlink).toHaveBeenCalledWith('wi-1');
    });

    it('calls onUnlink with last chip id on Backspace when search is empty', async () => {
      const onUnlink = jest.fn();
      renderLinker({ linkedWorkItems: [WI_1, WI_2], onUnlink });

      const input = screen.getByLabelText(/search work items to link/i);
      fireEvent.keyDown(input, { key: 'Backspace' });

      expect(onUnlink).toHaveBeenCalledWith('wi-2');
    });

    it('does not call onUnlink on Backspace when search has text', () => {
      const onUnlink = jest.fn();
      renderLinker({ linkedWorkItems: [WI_1], onUnlink });

      const input = screen.getByLabelText(/search work items to link/i);
      fireEvent.change(input, { target: { value: 'pour' } });
      fireEvent.keyDown(input, { key: 'Backspace' });

      expect(onUnlink).not.toHaveBeenCalled();
    });

    it('does not call onUnlink on Backspace when no items linked', () => {
      const onUnlink = jest.fn();
      renderLinker({ linkedWorkItems: [], onUnlink });

      const input = screen.getByLabelText(/search work items to link/i);
      fireEvent.keyDown(input, { key: 'Backspace' });

      expect(onUnlink).not.toHaveBeenCalled();
    });
  });

  // ── Back button ────────────────────────────────────────────────────────────

  describe('back button', () => {
    it('calls onBack when back button is clicked', () => {
      const onBack = jest.fn();
      renderLinker({ onBack });

      fireEvent.click(screen.getByRole('button', { name: /back/i }));

      expect(onBack).toHaveBeenCalled();
    });
  });

  // ── Search functionality ───────────────────────────────────────────────────

  describe('search functionality', () => {
    it('opens dropdown when input gains focus', async () => {
      setupFetchWithItems([WI_2, WI_3]);

      renderLinker();

      const input = screen.getByLabelText(/search work items to link/i);
      fireEvent.focus(input);

      // Advance fake timers to trigger debounce
      await act(async () => {
        jest.runOnlyPendingTimers();
      });

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });

    it('calls fetch with search query after debounce', async () => {
      setupFetchWithItems([]);

      renderLinker();

      const input = screen.getByLabelText(/search work items to link/i);
      fireEvent.change(input, { target: { value: 'foundation' } });

      // Before debounce completes, fetch should not have been called with q param
      // (may have been called once on focus with empty query, but not with 'foundation' yet)
      const callsWithFoundation = mockFetch.mock.calls.filter((call) => {
        const url = String(call[0]);
        return url.includes('q=foundation');
      });
      expect(callsWithFoundation).toHaveLength(0);

      // Advance timers past debounce (250ms)
      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        const urlsWithFoundation = mockFetch.mock.calls
          .map((call) => String(call[0]))
          .filter((url) => url.includes('q=foundation'));
        expect(urlsWithFoundation.length).toBeGreaterThan(0);
      });
    });

    it('shows search results in dropdown', async () => {
      setupFetchWithItems([WI_2, WI_3]);

      renderLinker();

      const input = screen.getByLabelText(/search work items to link/i);
      fireEvent.change(input, { target: { value: 'framing' } });

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText('Install Framing')).toBeInTheDocument();
        expect(screen.getByText('Roof Installation')).toBeInTheDocument();
      });
    });

    it('excludes already-linked items from search results', async () => {
      // WI_1 is linked, so even if API returns it, it should be filtered out
      setupFetchWithItems([WI_1, WI_2]);

      renderLinker({ linkedWorkItems: [WI_1] });

      const input = screen.getByLabelText(/search work items to link/i);
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.focus(input);

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        // WI_1 chip is shown but not in dropdown results
        expect(screen.getByText('Install Framing')).toBeInTheDocument();
      });

      // WI_1 should only appear as a chip (not as a search result option)
      const foundationTexts = screen.queryAllByText('Pour Foundation');
      // It may appear once (as chip), but not as a search result option
      expect(foundationTexts.length).toBeLessThanOrEqual(1);
    });

    it('shows "No matching work items" when search returns empty results', async () => {
      setupFetchWithItems([]);

      renderLinker();

      const input = screen.getByLabelText(/search work items to link/i);
      fireEvent.change(input, { target: { value: 'nonexistent' } });

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText('No matching work items')).toBeInTheDocument();
      });
    });

    it('shows "No available work items" when search is empty and no results', async () => {
      setupFetchWithItems([]);

      renderLinker();

      const input = screen.getByLabelText(/search work items to link/i);
      fireEvent.focus(input);

      await act(async () => {
        jest.runOnlyPendingTimers();
      });

      await waitFor(() => {
        expect(screen.getByText('No available work items')).toBeInTheDocument();
      });
    });

    it('shows search error message when fetch fails', async () => {
      setupFetchFailure();

      renderLinker();

      const input = screen.getByLabelText(/search work items to link/i);
      fireEvent.change(input, { target: { value: 'test' } });

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to load work items')).toBeInTheDocument();
      });
    });

    it('closes dropdown on Escape key', async () => {
      setupFetchWithItems([WI_2]);

      renderLinker();

      const input = screen.getByLabelText(/search work items to link/i);
      fireEvent.focus(input);

      await act(async () => {
        jest.runOnlyPendingTimers();
      });

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      fireEvent.keyDown(input, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  // ── Link interactions ──────────────────────────────────────────────────────

  describe('link interactions', () => {
    it('calls onLink when a result item is clicked', async () => {
      const onLink = jest.fn();
      setupFetchWithItems([WI_2]);

      renderLinker({ onLink });

      const input = screen.getByLabelText(/search work items to link/i);
      fireEvent.focus(input);

      await act(async () => {
        jest.runOnlyPendingTimers();
      });

      await waitFor(() => {
        expect(screen.getByText('Install Framing')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Install Framing'));

      expect(onLink).toHaveBeenCalledWith('wi-2');
    });

    it('clears search input after selecting an item', async () => {
      setupFetchWithItems([WI_2]);

      renderLinker();

      const input = screen.getByLabelText(/search work items to link/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'framing' } });

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText('Install Framing')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Install Framing'));

      expect(input.value).toBe('');
    });

    it('disables search input when isLinking=true', () => {
      renderLinker({ isLinking: true });
      const input = screen.getByLabelText(/search work items to link/i);
      expect(input).toBeDisabled();
    });

    it('uses appropriate placeholder when no items linked', () => {
      renderLinker({ linkedWorkItems: [] });
      const input = screen.getByLabelText(/search work items to link/i);
      expect(input.getAttribute('placeholder')).toBe('Search work items…');
    });

    it('uses "Add more…" placeholder when items are already linked', () => {
      renderLinker({ linkedWorkItems: [WI_1] });
      const input = screen.getByLabelText(/search work items to link/i);
      expect(input.getAttribute('placeholder')).toBe('Add more…');
    });
  });
});
