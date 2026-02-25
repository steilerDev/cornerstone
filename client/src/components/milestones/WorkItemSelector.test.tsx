/**
 * @jest-environment jsdom
 *
 * Unit tests for the WorkItemSelector component.
 * Tests chip rendering, removal, search input behaviour, and the portal-based dropdown.
 *
 * The component calls listWorkItems → fetch internally.
 * We mock global.fetch to intercept API calls without ESM module-level mocking,
 * following the same pattern as MilestonePanel.test.tsx.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type * as WorkItemSelectorTypes from './WorkItemSelector.js';
import type { WorkItemSummary, PaginationMeta } from '@cornerstone/shared';

// ---------------------------------------------------------------------------
// Dynamic import after setup
// ---------------------------------------------------------------------------

let WorkItemSelector: (typeof WorkItemSelectorTypes)['WorkItemSelector'];
type SelectedWorkItem = WorkItemSelectorTypes.SelectedWorkItem;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const defaultPagination: PaginationMeta = {
  page: 1,
  pageSize: 20,
  totalItems: 0,
  totalPages: 0,
};

function makeWorkItemSummary(id: string, title: string): WorkItemSummary {
  return {
    id,
    title,
    status: 'not_started' as const,
    durationDays: null,
    startDate: null,
    endDate: null,
    assignedUser: null,
    tags: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

/**
 * Build a mock Response that returns a JSON work item list.
 */
function makeWorkItemListResponse(
  items: WorkItemSummary[],
  pagination = defaultPagination,
): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      items,
      pagination: { ...pagination, totalItems: items.length, totalPages: items.length > 0 ? 1 : 0 },
    }),
  } as Response;
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

interface RenderProps {
  selectedItems?: SelectedWorkItem[];
  onAdd?: jest.Mock;
  onRemove?: jest.Mock;
  disabled?: boolean;
}

function renderSelector({
  selectedItems = [],
  onAdd = jest.fn(),
  onRemove = jest.fn(),
  disabled = false,
}: RenderProps = {}) {
  return render(
    <WorkItemSelector
      selectedItems={selectedItems}
      onAdd={onAdd}
      onRemove={onRemove}
      disabled={disabled}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkItemSelector', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(async () => {
    if (!WorkItemSelector) {
      const mod = await import('./WorkItemSelector.js');
      WorkItemSelector = mod.WorkItemSelector;
    }

    // Mock global.fetch to intercept /api/work-items calls
    mockFetch = jest.fn<typeof fetch>();
    // Default: return empty list
    mockFetch.mockResolvedValue(makeWorkItemListResponse([]));
    global.fetch = mockFetch;
  });

  afterEach(() => {
    cleanup();
    global.fetch = undefined as unknown as typeof fetch;
  });

  // ── Container rendering ────────────────────────────────────────────────────

  describe('container', () => {
    it('renders the work-item-selector container', () => {
      renderSelector();
      expect(screen.getByTestId('work-item-selector')).toBeInTheDocument();
    });

    it('renders search input with aria-label', () => {
      renderSelector();
      expect(
        screen.getByRole('textbox', { name: /search work items to add/i }),
      ).toBeInTheDocument();
    });

    it('renders "No work items selected" placeholder when no items selected', () => {
      renderSelector();
      expect(screen.getByText(/no work items selected/i)).toBeInTheDocument();
    });

    it('hides placeholder when items are selected', () => {
      renderSelector({ selectedItems: [{ id: 'wi-1', name: 'Foundation Work' }] });
      expect(screen.queryByText(/no work items selected/i)).not.toBeInTheDocument();
    });
  });

  // ── Chip rendering ─────────────────────────────────────────────────────────

  describe('chip rendering', () => {
    it('renders a chip for each selected item', () => {
      renderSelector({
        selectedItems: [
          { id: 'wi-1', name: 'Foundation Work' },
          { id: 'wi-2', name: 'Framing Work' },
        ],
      });
      expect(screen.getByText('Foundation Work')).toBeInTheDocument();
      expect(screen.getByText('Framing Work')).toBeInTheDocument();
    });

    it('renders remove button for each chip with aria-label', () => {
      renderSelector({
        selectedItems: [{ id: 'wi-1', name: 'Foundation Work' }],
      });
      expect(screen.getByRole('button', { name: /remove foundation work/i })).toBeInTheDocument();
    });

    it('truncates chip label longer than 30 characters with ellipsis', () => {
      const longName = 'A very long work item name that exceeds thirty characters easily';
      renderSelector({ selectedItems: [{ id: 'wi-1', name: longName }] });
      // The displayed text should be truncated (starts with the first 30 chars)
      const chipLabel = screen.getByTitle(longName);
      expect(chipLabel).toBeInTheDocument();
      // The visible text is truncated to 30 chars + ellipsis
      expect(chipLabel.textContent).toHaveLength(31); // 30 chars + ellipsis char
    });

    it('does not truncate chip labels of 30 characters or fewer', () => {
      const exactName = 'Exactly thirty characters name'; // 30 chars
      renderSelector({ selectedItems: [{ id: 'wi-1', name: exactName }] });
      const chipLabel = screen.getByTitle(exactName);
      expect(chipLabel.textContent).toBe(exactName);
    });
  });

  // ── Chip removal ──────────────────────────────────────────────────────────

  describe('chip removal', () => {
    it('calls onRemove with the item id when remove button is clicked', () => {
      const onRemove = jest.fn();
      renderSelector({
        selectedItems: [{ id: 'wi-1', name: 'Foundation Work' }],
        onRemove,
      });

      fireEvent.click(screen.getByRole('button', { name: /remove foundation work/i }));

      expect(onRemove).toHaveBeenCalledWith('wi-1');
    });

    it('calls onRemove with the correct id when multiple chips are present', () => {
      const onRemove = jest.fn();
      renderSelector({
        selectedItems: [
          { id: 'wi-1', name: 'Foundation Work' },
          { id: 'wi-2', name: 'Framing Work' },
        ],
        onRemove,
      });

      fireEvent.click(screen.getByRole('button', { name: /remove framing work/i }));

      expect(onRemove).toHaveBeenCalledWith('wi-2');
      expect(onRemove).not.toHaveBeenCalledWith('wi-1');
    });

    it('disables remove buttons when disabled=true', () => {
      renderSelector({
        selectedItems: [{ id: 'wi-1', name: 'Foundation Work' }],
        disabled: true,
      });
      expect(screen.getByRole('button', { name: /remove foundation work/i })).toBeDisabled();
    });

    it('calls onRemove with the last item id when Backspace is pressed on empty input', () => {
      const onRemove = jest.fn();
      renderSelector({
        selectedItems: [
          { id: 'wi-1', name: 'Foundation' },
          { id: 'wi-2', name: 'Framing' },
        ],
        onRemove,
      });

      const input = screen.getByRole('textbox', { name: /search work items/i });
      fireEvent.keyDown(input, { key: 'Backspace' });

      // Should remove the last item (wi-2)
      expect(onRemove).toHaveBeenCalledWith('wi-2');
    });

    it('does not call onRemove on Backspace when input has text', () => {
      const onRemove = jest.fn();
      renderSelector({
        selectedItems: [{ id: 'wi-1', name: 'Foundation' }],
        onRemove,
      });

      const input = screen.getByRole('textbox', { name: /search work items/i });
      fireEvent.change(input, { target: { value: 'search term' } });
      fireEvent.keyDown(input, { key: 'Backspace' });

      expect(onRemove).not.toHaveBeenCalled();
    });
  });

  // ── Search input ───────────────────────────────────────────────────────────

  describe('search input', () => {
    it('shows "Search work items…" placeholder when no items selected', () => {
      renderSelector();
      const input = screen.getByRole('textbox', { name: /search work items/i }) as HTMLInputElement;
      expect(input.placeholder).toBe('Search work items\u2026');
    });

    it('shows "Add more…" placeholder when items are selected', () => {
      renderSelector({ selectedItems: [{ id: 'wi-1', name: 'Foundation' }] });
      const input = screen.getByRole('textbox', { name: /search work items/i }) as HTMLInputElement;
      expect(input.placeholder).toBe('Add more\u2026');
    });

    it('disables input when disabled=true', () => {
      renderSelector({ disabled: true });
      expect(screen.getByRole('textbox', { name: /search work items/i })).toBeDisabled();
    });

    it('calls fetch with /api/work-items when input receives focus', async () => {
      renderSelector();
      const input = screen.getByRole('textbox', { name: /search work items/i });

      fireEvent.focus(input);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/work-items'),
          expect.anything(),
        );
      });
    });

    it('calls fetch with search query in URL when user types (debounced)', async () => {
      renderSelector();
      const input = screen.getByRole('textbox', { name: /search work items/i });

      fireEvent.change(input, { target: { value: 'foundation' } });

      // After debounce fires (default 250ms), fetch should be called with q=foundation
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('q=foundation'),
          expect.anything(),
        );
      });
    });

    it('input has aria-haspopup="listbox"', () => {
      renderSelector();
      const input = screen.getByRole('textbox', { name: /search work items/i });
      expect(input.getAttribute('aria-haspopup')).toBe('listbox');
    });

    it('input has autocomplete="off"', () => {
      renderSelector();
      const input = screen.getByRole('textbox', { name: /search work items/i });
      expect(input.getAttribute('autocomplete')).toBe('off');
    });
  });

  // ── Dropdown display ───────────────────────────────────────────────────────

  describe('dropdown display', () => {
    it('shows "No available work items" when API returns empty list and no search term', async () => {
      mockFetch.mockResolvedValue(makeWorkItemListResponse([]));
      renderSelector();

      const input = screen.getByRole('textbox', { name: /search work items/i });
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByText(/no available work items/i)).toBeInTheDocument();
      });
    });

    it('shows "No matching work items" when search term given but no results', async () => {
      mockFetch.mockResolvedValue(makeWorkItemListResponse([]));
      renderSelector();

      const input = screen.getByRole('textbox', { name: /search work items/i });
      fireEvent.change(input, { target: { value: 'xyz123' } });

      await waitFor(() => {
        expect(screen.getByText(/no matching work items/i)).toBeInTheDocument();
      });
    });

    it('shows returned work items in dropdown', async () => {
      mockFetch.mockResolvedValue(
        makeWorkItemListResponse([
          makeWorkItemSummary('wi-1', 'Foundation Work'),
          makeWorkItemSummary('wi-2', 'Framing Work'),
        ]),
      );

      renderSelector();
      const input = screen.getByRole('textbox', { name: /search work items/i });
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByText('Foundation Work')).toBeInTheDocument();
        expect(screen.getByText('Framing Work')).toBeInTheDocument();
      });
    });

    it('excludes already-selected items from dropdown results', async () => {
      mockFetch.mockResolvedValue(
        makeWorkItemListResponse([
          makeWorkItemSummary('wi-1', 'Foundation Work'),
          makeWorkItemSummary('wi-2', 'Framing Work'),
        ]),
      );

      renderSelector({ selectedItems: [{ id: 'wi-1', name: 'Foundation Work' }] });
      const input = screen.getByRole('textbox', { name: /search work items/i });
      fireEvent.focus(input);

      await waitFor(() => {
        // wi-2 appears in dropdown; wi-1 is already selected and filtered out
        expect(screen.getByText('Framing Work')).toBeInTheDocument();
      });

      // wi-1 should NOT appear in the dropdown (it's already selected as a chip,
      // but the chip text itself may appear; we check the dropdown list specifically)
      const listbox = screen.getByRole('listbox');
      expect(listbox).not.toHaveTextContent('Foundation Work');
    });

    it('calls onAdd with the selected item when dropdown item is clicked', async () => {
      const onAdd = jest.fn();
      mockFetch.mockResolvedValue(makeWorkItemListResponse([makeWorkItemSummary('wi-2', 'Framing Work')]));

      renderSelector({ onAdd });
      const input = screen.getByRole('textbox', { name: /search work items/i });
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByText('Framing Work')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Framing Work'));

      expect(onAdd).toHaveBeenCalledWith({ id: 'wi-2', name: 'Framing Work' });
    });

    it('shows error message when fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      renderSelector();
      const input = screen.getByRole('textbox', { name: /search work items/i });
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByText(/failed to load work items/i)).toBeInTheDocument();
      });
    });

    it('closes dropdown when Escape is pressed in input', async () => {
      mockFetch.mockResolvedValue(makeWorkItemListResponse([makeWorkItemSummary('wi-1', 'Foundation Work')]));

      renderSelector();
      const input = screen.getByRole('textbox', { name: /search work items/i });
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByText('Foundation Work')).toBeInTheDocument();
      });

      fireEvent.keyDown(input, { key: 'Escape' });

      // Dropdown should close; the chip container remains
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });
});
