/**
 * @jest-environment jsdom
 *
 * Breadcrumb-specific tests for HouseholdItemPicker.tsx (Story #1240).
 * Verifies that search results render AreaBreadcrumb (compact variant) as
 * a secondary line via the SearchPicker renderSecondary prop.
 *
 * Mocks are identical to HouseholdItemPicker.test.tsx to stay independent.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type { HouseholdItemSummary } from '@cornerstone/shared';

// ─── Mock modules BEFORE importing component ─────────────────────────────────

const mockListHouseholdItems = jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>();

jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  listHouseholdItems: mockListHouseholdItems,
}));

import type { HouseholdItemPicker as HouseholdItemPickerType } from './HouseholdItemPicker.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal HouseholdItemSummary. The area field is the key variable
 * across tests (null vs populated AreaSummary).
 */
function makeItem(overrides: Partial<HouseholdItemSummary> = {}): HouseholdItemSummary {
  return {
    id: 'hi-1',
    name: 'Sofa',
    description: null,
    category: 'hic-furniture',
    status: 'planned',
    vendor: null,
    area: null,
    quantity: 1,
    orderDate: null,
    targetDeliveryDate: null,
    actualDeliveryDate: null,
    earliestDeliveryDate: null,
    latestDeliveryDate: null,
    isLate: false,
    url: null,
    budgetLineCount: 0,
    totalPlannedAmount: 0,
    budgetSummary: {
      totalPlanned: 0,
      totalActual: 0,
      subsidyReduction: 0,
      netCost: 0,
    },
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const areaWithAncestors = {
  id: 'area-kitchen',
  name: 'Kitchen',
  color: null,
  ancestors: [{ id: 'area-gf', name: 'Ground Floor', color: null }],
};

const areaRootLevel = {
  id: 'area-garage',
  name: 'Garage',
  color: null,
  ancestors: [],
};

// ─── Component import (must be after mocks) ──────────────────────────────────

let HouseholdItemPickerModule: {
  HouseholdItemPicker: typeof HouseholdItemPickerType;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HouseholdItemPicker — AreaBreadcrumb secondary line (Story #1240)', () => {
  beforeEach(async () => {
    mockListHouseholdItems.mockReset();
    // Default: return empty list so tests that don't trigger search still render safely.
    mockListHouseholdItems.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 15, totalItems: 0, totalPages: 0 },
    });

    if (!HouseholdItemPickerModule) {
      HouseholdItemPickerModule = await import('./HouseholdItemPicker.js');
    }
  });

  function renderPicker(
    props: Partial<React.ComponentProps<typeof HouseholdItemPickerModule.HouseholdItemPicker>> = {},
  ) {
    const { HouseholdItemPicker } = HouseholdItemPickerModule;
    return render(<HouseholdItemPicker value="" onChange={jest.fn()} excludeIds={[]} {...props} />);
  }

  // ── Scenario 5: item with area → compact breadcrumb secondary line renders ──

  describe('search results — item with area set', () => {
    it('renders compact breadcrumb text for an item with a single ancestor', async () => {
      const user = userEvent.setup();
      mockListHouseholdItems.mockResolvedValue({
        items: [makeItem({ id: 'hi-1', name: 'Sofa', area: areaWithAncestors })],
        pagination: { page: 1, pageSize: 15, totalItems: 1, totalPages: 1 },
      });

      renderPicker({ showItemsOnFocus: true });

      const input = screen.getByPlaceholderText('Search household items...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Sofa')).toBeInTheDocument();
      });

      // Compact breadcrumb: "Ground Floor › Kitchen" — plain span, text appears once.
      const fullPath = 'Ground Floor \u203a Kitchen';
      expect(screen.getByText(fullPath)).toBeInTheDocument();
    });

    it('renders compact breadcrumb text for a root-level area (no ancestors)', async () => {
      const user = userEvent.setup();
      mockListHouseholdItems.mockResolvedValue({
        items: [makeItem({ id: 'hi-1', name: 'Toolbox', area: areaRootLevel })],
        pagination: { page: 1, pageSize: 15, totalItems: 1, totalPages: 1 },
      });

      renderPicker({ showItemsOnFocus: true });

      const input = screen.getByPlaceholderText('Search household items...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Toolbox')).toBeInTheDocument();
      });

      // Root-level area: breadcrumb text is just "Garage" — plain span, appears once.
      expect(screen.getByText('Garage')).toBeInTheDocument();
    });

    it('does not render a role="tooltip" element for compact breadcrumb (plain span only)', async () => {
      const user = userEvent.setup();
      mockListHouseholdItems.mockResolvedValue({
        items: [makeItem({ id: 'hi-1', name: 'Chair', area: areaWithAncestors })],
        pagination: { page: 1, pageSize: 15, totalItems: 1, totalPages: 1 },
      });

      const { container } = renderPicker({ showItemsOnFocus: true });

      const input = screen.getByPlaceholderText('Search household items...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Chair')).toBeInTheDocument();
      });

      // Compact variant is now a plain span — no Tooltip, no role="tooltip"
      expect(container.querySelector('[role="tooltip"]')).not.toBeInTheDocument();

      // The full path text is present exactly once (no hidden duplicate in a tooltip span)
      const fullPath = 'Ground Floor \u203a Kitchen';
      expect(screen.getByText(fullPath)).toBeInTheDocument();
    });

    it('renders secondary breadcrumbs for multiple results with different areas', async () => {
      const user = userEvent.setup();
      mockListHouseholdItems.mockResolvedValue({
        items: [
          makeItem({ id: 'hi-1', name: 'Sofa', area: areaWithAncestors }),
          makeItem({ id: 'hi-2', name: 'Toolbox', area: areaRootLevel }),
        ],
        pagination: { page: 1, pageSize: 15, totalItems: 2, totalPages: 1 },
      });

      renderPicker({ showItemsOnFocus: true });

      const input = screen.getByPlaceholderText('Search household items...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Sofa')).toBeInTheDocument();
        expect(screen.getByText('Toolbox')).toBeInTheDocument();
      });

      // Sofa's compact breadcrumb — plain span, exactly one occurrence.
      expect(screen.getByText('Ground Floor \u203a Kitchen')).toBeInTheDocument();
      // Toolbox's compact breadcrumb (root-level, no ancestors) — plain span, exactly one.
      expect(screen.getByText('Garage')).toBeInTheDocument();
    });
  });

  // ── Scenario 6: item with area: null → "No area" secondary line renders ──

  describe('search results — item with area: null', () => {
    it('renders "No area" secondary text when item area is null', async () => {
      const user = userEvent.setup();
      mockListHouseholdItems.mockResolvedValue({
        items: [makeItem({ id: 'hi-1', name: 'Sofa', area: null })],
        pagination: { page: 1, pageSize: 15, totalItems: 1, totalPages: 1 },
      });

      renderPicker({ showItemsOnFocus: true });

      const input = screen.getByPlaceholderText('Search household items...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Sofa')).toBeInTheDocument();
      });

      // AreaBreadcrumb with area=null renders "No area"
      expect(screen.getByText('No area')).toBeInTheDocument();
    });

    it('renders "No area" for every null-area item in the results', async () => {
      const user = userEvent.setup();
      mockListHouseholdItems.mockResolvedValue({
        items: [
          makeItem({ id: 'hi-1', name: 'Sofa', area: null }),
          makeItem({ id: 'hi-2', name: 'Chair', area: null }),
        ],
        pagination: { page: 1, pageSize: 15, totalItems: 2, totalPages: 1 },
      });

      renderPicker({ showItemsOnFocus: true });

      const input = screen.getByPlaceholderText('Search household items...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Sofa')).toBeInTheDocument();
        expect(screen.getByText('Chair')).toBeInTheDocument();
      });

      // Both items have null area → two "No area" labels
      const noAreaEls = screen.getAllByText('No area');
      expect(noAreaEls).toHaveLength(2);
    });

    it('does not render a nav element for null-area items in the dropdown', async () => {
      const user = userEvent.setup();
      mockListHouseholdItems.mockResolvedValue({
        items: [makeItem({ id: 'hi-1', name: 'Sofa', area: null })],
        pagination: { page: 1, pageSize: 15, totalItems: 1, totalPages: 1 },
      });

      const { container } = renderPicker({ showItemsOnFocus: true });

      const input = screen.getByPlaceholderText('Search household items...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Sofa')).toBeInTheDocument();
      });

      // null area renders a muted <span>, not a <nav>
      expect(container.querySelector('nav[aria-label="Area path"]')).not.toBeInTheDocument();
    });
  });

  // ── Mixed results: area items and null-area items together ───────────────

  describe('search results — mixed area / no-area items', () => {
    it('renders breadcrumb for area items and "No area" for null-area items side by side', async () => {
      const user = userEvent.setup();
      mockListHouseholdItems.mockResolvedValue({
        items: [
          makeItem({ id: 'hi-1', name: 'Sofa', area: areaWithAncestors }),
          makeItem({ id: 'hi-2', name: 'Chair', area: null }),
        ],
        pagination: { page: 1, pageSize: 15, totalItems: 2, totalPages: 1 },
      });

      renderPicker({ showItemsOnFocus: true });

      const input = screen.getByPlaceholderText('Search household items...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Sofa')).toBeInTheDocument();
        expect(screen.getByText('Chair')).toBeInTheDocument();
      });

      // Sofa shows the compact path — plain span, exactly one occurrence.
      expect(screen.getByText('Ground Floor \u203a Kitchen')).toBeInTheDocument();
      // Chair shows "No area"
      expect(screen.getByText('No area')).toBeInTheDocument();
    });
  });

  // ── Secondary line renders after typing (non-focus-triggered search) ─────

  describe('search-triggered results — area secondary line', () => {
    it('renders area breadcrumb secondary line after typing a search term', async () => {
      const user = userEvent.setup();
      mockListHouseholdItems.mockResolvedValue({
        items: [makeItem({ id: 'hi-1', name: 'Sofa', area: areaWithAncestors })],
        pagination: { page: 1, pageSize: 15, totalItems: 1, totalPages: 1 },
      });

      renderPicker();

      const input = screen.getByPlaceholderText('Search household items...');
      await user.type(input, 'Sofa');

      await waitFor(() => {
        expect(screen.getByText('Sofa')).toBeInTheDocument();
      });

      // Plain span — text appears exactly once.
      expect(screen.getByText('Ground Floor \u203a Kitchen')).toBeInTheDocument();
    });

    it('renders "No area" secondary line after typing when item has null area', async () => {
      const user = userEvent.setup();
      mockListHouseholdItems.mockResolvedValue({
        items: [makeItem({ id: 'hi-1', name: 'Sofa', area: null })],
        pagination: { page: 1, pageSize: 15, totalItems: 1, totalPages: 1 },
      });

      renderPicker();

      const input = screen.getByPlaceholderText('Search household items...');
      await user.type(input, 'Sofa');

      await waitFor(() => {
        expect(screen.getByText('Sofa')).toBeInTheDocument();
      });

      expect(screen.getByText('No area')).toBeInTheDocument();
    });
  });
});
