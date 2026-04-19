/**
 * @jest-environment jsdom
 */
import type React from 'react';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import type { BudgetSourceBudgetLine, BudgetSourceBudgetLinesResponse } from '@cornerstone/shared';

// ─── Mock: formatters ──────────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  return {
    formatCurrency: fmtCurrency,
    formatDate: (d: string | null | undefined, fallback = '—') => d ?? fallback,
    formatTime: () => '—',
    formatDateTime: () => '—',
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: (d: string | null | undefined, fallback = '—') => d ?? fallback,
      formatTime: () => '—',
      formatDateTime: () => '—',
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

// react-i18next is not mocked — the real module is used against the
// i18next instance initialized by setupTests.ts. Mocking via
// jest.unstable_mockModule + jest.requireActual creates a separate module
// reference that does not share the initialized instance, so keys come
// back unresolved.

// ─── Shared helpers ─────────────────────────────────────────────────────────────

function makeLine(overrides: Partial<BudgetSourceBudgetLine> = {}): BudgetSourceBudgetLine {
  return {
    id: 'line-1',
    parentId: 'parent-1',
    parentName: 'Kitchen Renovation',
    area: null,
    description: 'Floor tiles',
    plannedAmount: 1500,
    confidence: 'own_estimate',
    confidenceMargin: 0.2,
    budgetCategory: null,
    budgetSource: null,
    vendor: null,
    actualCost: 0,
    actualCostPaid: 0,
    invoiceCount: 0,
    invoiceLink: null,
    quantity: null,
    unit: null,
    unitPrice: null,
    includesVat: null,
    createdBy: null,
    hasClaimedInvoice: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeArea(overrides: { id?: string; name?: string; color?: string | null } = {}) {
  return {
    id: overrides.id ?? 'area-1',
    name: overrides.name ?? 'Kitchen',
    color: overrides.color !== undefined ? overrides.color : '#ff0000',
    ancestors: [],
  };
}

function makeResponse(
  workItemLines: BudgetSourceBudgetLine[] = [],
  householdItemLines: BudgetSourceBudgetLine[] = [],
): BudgetSourceBudgetLinesResponse {
  return { workItemLines, householdItemLines };
}

// ─── Component import (after mocks) ─────────────────────────────────────────────

interface SourceBudgetLinePanelProps {
  sourceId: string;
  sourceName: string;
  data: BudgetSourceBudgetLinesResponse | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedLineIds?: Set<string>;
  onSelectionChange?: (newSet: Set<string>) => void;
  onMoveLines?: () => void;
}

describe('SourceBudgetLinePanel', () => {
  let SourceBudgetLinePanel: React.ComponentType<SourceBudgetLinePanelProps>;

  beforeEach(async () => {
    if (!SourceBudgetLinePanel) {
      const module = await import('./SourceBudgetLinePanel.js');
      SourceBudgetLinePanel =
        module.SourceBudgetLinePanel as React.ComponentType<SourceBudgetLinePanelProps>;
    }
  });

  function renderPanel(props: Partial<SourceBudgetLinePanelProps> = {}) {
    const defaultProps: SourceBudgetLinePanelProps = {
      sourceId: 'src-1',
      sourceName: 'Home Loan',
      data: null,
      isLoading: false,
      error: null,
      onRetry: jest.fn(),
    };
    return render(
      <MemoryRouter>
        <LocaleProvider>
          <SourceBudgetLinePanel {...defaultProps} {...props} />
        </LocaleProvider>
      </MemoryRouter>,
    );
  }

  // ─── Loading state (scenario 1) ─────────────────────────────────────────────

  describe('loading state', () => {
    it('renders Skeleton when isLoading=true', () => {
      renderPanel({ isLoading: true });

      // Skeleton renders with role="status" for the loading indicator
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('does not render section headers when isLoading=true', () => {
      renderPanel({ isLoading: true });

      expect(screen.queryByText('Work Item Lines')).not.toBeInTheDocument();
      expect(screen.queryByText('Household Item Lines')).not.toBeInTheDocument();
    });

    it('renders a region with aria-label containing loading label when isLoading=true', () => {
      renderPanel({ isLoading: true, sourceId: 'src-42' });

      const region = document.getElementById('source-lines-src-42');
      expect(region).toBeInTheDocument();
      expect(region?.getAttribute('role')).toBe('region');
    });
  });

  // ─── Error state (scenario 2) ────────────────────────────────────────────────

  describe('error state', () => {
    it('shows alert banner with error message', () => {
      renderPanel({ error: 'Could not load budget lines.' });

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Could not load budget lines.')).toBeInTheDocument();
    });

    it('shows Retry button in error state', () => {
      renderPanel({ error: 'Could not load budget lines.' });

      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('calls onRetry when Retry button is clicked', () => {
      const onRetry = jest.fn();
      renderPanel({ error: 'Could not load budget lines.', onRetry });

      fireEvent.click(screen.getByRole('button', { name: /retry/i }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('renders error region with correct id and role', () => {
      renderPanel({ error: 'Some error', sourceId: 'src-err' });

      const region = document.getElementById('source-lines-src-err');
      expect(region).toBeInTheDocument();
      expect(region?.getAttribute('role')).toBe('region');
    });

    it('error region aria-label contains the source name', () => {
      renderPanel({ error: 'Some error', sourceName: 'Home Loan' });

      const region = screen.getByRole('region');
      expect(region.getAttribute('aria-label')).toContain('Home Loan');
    });
  });

  // ─── Empty state (scenario 3) ────────────────────────────────────────────────

  describe('empty state', () => {
    it('renders EmptyState message when both arrays are empty', () => {
      renderPanel({ data: makeResponse([], []) });

      expect(screen.getByText('No budget lines assigned')).toBeInTheDocument();
    });

    it('does not render section headers when both arrays are empty', () => {
      renderPanel({ data: makeResponse([], []) });

      expect(screen.queryByText('Work Item Lines')).not.toBeInTheDocument();
      expect(screen.queryByText('Household Item Lines')).not.toBeInTheDocument();
    });

    it('renders region with correct id when empty', () => {
      renderPanel({ data: makeResponse([], []), sourceId: 'src-empty' });

      const region = document.getElementById('source-lines-src-empty');
      expect(region).toBeInTheDocument();
    });
  });

  // ─── WI lines only (scenario 4) ─────────────────────────────────────────────

  describe('work item lines only', () => {
    it('renders "Work Item Lines" section header', () => {
      const line = makeLine({ parentId: 'p1', parentName: 'Kitchen' });
      renderPanel({ data: makeResponse([line], []) });

      expect(screen.getByText('Work Item Lines')).toBeInTheDocument();
    });

    it('does NOT render "Household Item Lines" header when HI array is empty', () => {
      const line = makeLine({ parentId: 'p1', parentName: 'Kitchen' });
      renderPanel({ data: makeResponse([line], []) });

      expect(screen.queryByText('Household Item Lines')).not.toBeInTheDocument();
    });
  });

  // ─── HI lines only (scenario 5) ─────────────────────────────────────────────

  describe('household item lines only', () => {
    it('renders "Household Item Lines" section header', () => {
      const line = makeLine({ parentId: 'p1', parentName: 'Sofa' });
      renderPanel({ data: makeResponse([], [line]) });

      expect(screen.getByText('Household Item Lines')).toBeInTheDocument();
    });

    it('does NOT render "Work Item Lines" header when WI array is empty', () => {
      const line = makeLine({ parentId: 'p1', parentName: 'Sofa' });
      renderPanel({ data: makeResponse([], [line]) });

      expect(screen.queryByText('Work Item Lines')).not.toBeInTheDocument();
    });
  });

  // ─── Both sections (scenario 6) ─────────────────────────────────────────────

  describe('both sections present', () => {
    it('renders both "Work Item Lines" and "Household Item Lines" headers', () => {
      const wiLine = makeLine({ id: 'wi-1', parentId: 'p1', parentName: 'Kitchen' });
      const hiLine = makeLine({ id: 'hi-1', parentId: 'p2', parentName: 'Sofa' });
      renderPanel({ data: makeResponse([wiLine], [hiLine]) });

      expect(screen.getByText('Work Item Lines')).toBeInTheDocument();
      expect(screen.getByText('Household Item Lines')).toBeInTheDocument();
    });
  });

  // ─── Grouping — No Area last (scenario 7) ────────────────────────────────────

  describe('grouping — "No Area" appears after named areas', () => {
    it('"No Area" group appears after named area groups', () => {
      const namedLine = makeLine({
        id: 'l1',
        parentId: 'p1',
        parentName: 'Parent A',
        area: makeArea({ id: 'area-1', name: 'Kitchen' }),
      });
      const unassignedLine1 = makeLine({
        id: 'l2',
        parentId: 'p2',
        parentName: 'Parent B',
        area: null,
      });
      const unassignedLine2 = makeLine({
        id: 'l3',
        parentId: 'p2',
        parentName: 'Parent B',
        area: null,
      });

      renderPanel({ data: makeResponse([namedLine, unassignedLine1, unassignedLine2], []) });

      // Both area headers should appear — named area and "No Area"
      const kitchenHeaders = screen.getAllByText('Kitchen');
      expect(kitchenHeaders.length).toBeGreaterThan(0);
      expect(screen.getByText('No Area')).toBeInTheDocument();

      // Verify order: "Kitchen" should appear before "No Area" in the DOM
      const allText = document.body.textContent ?? '';
      const kitchenPos = allText.indexOf('Kitchen');
      const unassignedPos = allText.indexOf('No Area');
      expect(kitchenPos).toBeLessThan(unassignedPos);
    });
  });

  // ─── Grouping — area alphabetical (scenario 8) ─────────────────────────────

  describe('grouping — areas sorted alphabetically', () => {
    it('renders "Bathroom" before "Kitchen" when alphabetically earlier', () => {
      const bathroomLine = makeLine({
        id: 'l1',
        parentId: 'p1',
        parentName: 'Tile Work',
        area: makeArea({ id: 'area-b', name: 'Bathroom' }),
      });
      const kitchenLine = makeLine({
        id: 'l2',
        parentId: 'p2',
        parentName: 'Cabinet Work',
        area: makeArea({ id: 'area-k', name: 'Kitchen' }),
      });

      // Pass Kitchen before Bathroom in array — component must sort them
      renderPanel({ data: makeResponse([kitchenLine, bathroomLine], []) });

      expect(screen.getByText('Bathroom')).toBeInTheDocument();
      expect(screen.getByText('Kitchen')).toBeInTheDocument();

      const allText = document.body.textContent ?? '';
      const bathroomPos = allText.indexOf('Bathroom');
      const kitchenPos = allText.indexOf('Kitchen');
      expect(bathroomPos).toBeLessThan(kitchenPos);
    });
  });

  // ─── Parent item sub-grouping (scenario 9) ───────────────────────────────────

  describe('parent item sub-grouping', () => {
    it('groups lines under a single parent header when they share parentId', () => {
      const line1 = makeLine({
        id: 'l1',
        parentId: 'p-shared',
        parentName: 'Bathroom Renovation',
        description: 'Floor tiles',
      });
      const line2 = makeLine({
        id: 'l2',
        parentId: 'p-shared',
        parentName: 'Bathroom Renovation',
        description: 'Wall tiles',
        createdAt: '2026-01-02T00:00:00.000Z',
      });

      renderPanel({ data: makeResponse([line1, line2], []) });

      // Single parent header for shared parentId
      expect(screen.getAllByText('Bathroom Renovation')).toHaveLength(1);
      // Both lines appear under it
      expect(screen.getByText('Floor tiles')).toBeInTheDocument();
      expect(screen.getByText('Wall tiles')).toBeInTheDocument();
    });
  });

  // ─── Null description → '—' (scenario 10) ───────────────────────────────────

  describe('null description renders dash placeholder', () => {
    it('shows "—" when line.description is null', () => {
      const line = makeLine({ description: null });
      renderPanel({ data: makeResponse([line], []) });

      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  // ─── Confidence badge label (scenario 11) ────────────────────────────────────

  describe('confidence badge', () => {
    it('shows "Own estimate" badge for own_estimate confidence', () => {
      const line = makeLine({ confidence: 'own_estimate' });
      renderPanel({ data: makeResponse([line], []) });

      expect(screen.getByText('Own estimate')).toBeInTheDocument();
    });

    it('shows "Pro estimate" badge for professional_estimate confidence', () => {
      const line = makeLine({ confidence: 'professional_estimate' });
      renderPanel({ data: makeResponse([line], []) });

      expect(screen.getByText('Pro estimate')).toBeInTheDocument();
    });

    it('shows "Quote" badge for quote confidence', () => {
      const line = makeLine({ confidence: 'quote' });
      renderPanel({ data: makeResponse([line], []) });

      expect(screen.getByText('Quote')).toBeInTheDocument();
    });

    it('shows "Invoice" badge for invoice confidence', () => {
      const line = makeLine({ confidence: 'invoice' });
      renderPanel({ data: makeResponse([line], []) });

      expect(screen.getByText('Invoice')).toBeInTheDocument();
    });
  });

  // ─── Invoice status column (replaces old badge tests) ──────────────────────

  describe('invoice status column', () => {
    it('renders status as "Paid" when invoiceLink exists with paid status', () => {
      const line = makeLine({
        invoiceLink: {
          invoiceBudgetLineId: 'ibl-1',
          invoiceId: 'inv-1',
          invoiceNumber: 'INV-001',
          invoiceDate: '2026-01-01',
          invoiceStatus: 'paid',
          itemizedAmount: 100,
        },
      });
      renderPanel({ data: makeResponse([line], []) });

      expect(screen.getByText('Paid')).toBeInTheDocument();
    });

    it('renders status as "Claimed" when invoiceLink exists with claimed status', () => {
      const line = makeLine({
        invoiceLink: {
          invoiceBudgetLineId: 'ibl-1',
          invoiceId: 'inv-1',
          invoiceNumber: 'INV-001',
          invoiceDate: '2026-01-01',
          invoiceStatus: 'claimed',
          itemizedAmount: 100,
        },
      });
      renderPanel({ data: makeResponse([line], []) });

      expect(screen.getByText('Claimed')).toBeInTheDocument();
    });

    it('renders status as "Not invoiced" when invoiceLink is null', () => {
      const line = makeLine({ invoiceLink: null });
      renderPanel({ data: makeResponse([line], []) });

      expect(screen.getByText('Not invoiced')).toBeInTheDocument();
    });
  });

  // ─── Currency formatting (scenario 14) ───────────────────────────────────────

  describe('currency formatting', () => {
    it('renders planned amount via formatCurrency', () => {
      const line = makeLine({ plannedAmount: 2500 });
      renderPanel({ data: makeResponse([line], []) });

      // Mock formatCurrency produces €2,500.00
      expect(screen.getByText('€2,500.00')).toBeInTheDocument();
    });

    it('renders zero amount as €0.00', () => {
      const line = makeLine({ plannedAmount: 0 });
      renderPanel({ data: makeResponse([line], []) });

      expect(screen.getByText('€0.00')).toBeInTheDocument();
    });
  });

  // ─── Panel root accessibility (scenario 15) ──────────────────────────────────

  describe('panel root accessibility', () => {
    it('renders panel with role="region"', () => {
      renderPanel({ data: makeResponse([makeLine()], []) });

      expect(screen.getByRole('region')).toBeInTheDocument();
    });

    it('region aria-label contains the source name', () => {
      renderPanel({ data: makeResponse([makeLine()], []), sourceName: 'Primary Loan' });

      const region = screen.getByRole('region');
      expect(region.getAttribute('aria-label')).toContain('Primary Loan');
    });

    it('region id is source-lines-{sourceId}', () => {
      renderPanel({ data: makeResponse([makeLine()], []), sourceId: 'src-99' });

      const region = document.getElementById('source-lines-src-99');
      expect(region).toBeInTheDocument();
    });
  });

  // ─── List roles (scenario 16) ────────────────────────────────────────────────

  describe('list ARIA roles', () => {
    it('renders ul with role="list"', () => {
      renderPanel({ data: makeResponse([makeLine()], []) });

      expect(screen.getByRole('list')).toBeInTheDocument();
    });

    it('each line is rendered as li with role="listitem"', () => {
      const line1 = makeLine({ id: 'l1', description: 'First item' });
      const line2 = makeLine({
        id: 'l2',
        description: 'Second item',
        createdAt: '2026-01-02T00:00:00.000Z',
      });
      renderPanel({ data: makeResponse([line1, line2], []) });

      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    it('each li contains a description span', () => {
      const line = makeLine({ description: 'Flooring' });
      renderPanel({ data: makeResponse([line], []) });

      expect(screen.getByText('Flooring')).toBeInTheDocument();
    });
  });

  // ─── Area color dot ──────────────────────────────────────────────────────────

  describe('area color dot', () => {
    it('renders color dot for named area with color', () => {
      const line = makeLine({ area: makeArea({ color: '#ff0000' }) });
      renderPanel({ data: makeResponse([line], []) });

      // The color dot has aria-hidden="true" and inline style
      const dots = document.querySelectorAll('[aria-hidden="true"]');
      const colorDots = Array.from(dots).filter(
        (el) => (el as HTMLElement).style.backgroundColor !== '',
      );
      expect(colorDots.length).toBeGreaterThan(0);
    });

    it('renders grey dot for unassigned area', () => {
      const line = makeLine({ area: null });
      renderPanel({ data: makeResponse([line], []) });

      // The unassigned dot uses var(--color-text-disabled)
      const dots = document.querySelectorAll('[aria-hidden="true"]');
      const unassignedDot = Array.from(dots).find((el) =>
        (el as HTMLElement).style.backgroundColor?.includes('var(--color-text-disabled)'),
      );
      expect(unassignedDot).toBeDefined();
    });
  });

  // ─── Area line count ─────────────────────────────────────────────────────────

  describe('area line count', () => {
    it('shows line count for named area with 2 lines', () => {
      const line1 = makeLine({
        id: 'l1',
        parentId: 'p1',
        parentName: 'Kitchen',
        area: makeArea({ id: 'a1', name: 'Main Area' }),
      });
      const line2 = makeLine({
        id: 'l2',
        parentId: 'p2',
        parentName: 'Bathroom',
        area: makeArea({ id: 'a1', name: 'Main Area' }),
        createdAt: '2026-01-02T00:00:00.000Z',
      });
      renderPanel({ data: makeResponse([line1, line2], []) });

      // areaLineCount_other = "{{count}} lines"
      expect(screen.getByText('2 lines')).toBeInTheDocument();
    });
  });

  // ─── Type and status columns (replacing badges) ─────────────────────────

  describe('type and status columns', () => {
    it('renders type column with confidence label for own_estimate', () => {
      const line = makeLine({ confidence: 'own_estimate' });
      renderPanel({ data: makeResponse([line], []) });

      expect(screen.getByText('Own estimate')).toBeInTheDocument();
    });

    it('renders status column with "Not invoiced" when invoiceLink is null', () => {
      const line = makeLine({ invoiceLink: null });
      renderPanel({ data: makeResponse([line], []) });

      expect(screen.getByText('Not invoiced')).toBeInTheDocument();
    });

    it('renders status column with invoice status when invoiceLink is present', () => {
      const line = makeLine({
        invoiceLink: {
          invoiceBudgetLineId: 'ibl-1',
          invoiceId: 'inv-1',
          invoiceNumber: 'INV-001',
          invoiceDate: '2026-01-01',
          invoiceStatus: 'paid',
          itemizedAmount: 100,
        },
      });
      renderPanel({ data: makeResponse([line], []) });

      expect(screen.getByText('Paid')).toBeInTheDocument();
    });
  });

  // ─── Selection mode: backwards compat (scenario 17) ──────────────────────────

  describe('non-selectable mode (selectedLineIds undefined)', () => {
    it('renders no checkboxes when selectedLineIds is not provided', () => {
      const line = makeLine({ id: 'l1', parentId: 'p1', parentName: 'Kitchen' });
      renderPanel({ data: makeResponse([line], []) });

      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('renders no action bar when selectedLineIds is not provided', () => {
      const line = makeLine({ id: 'l1', parentId: 'p1', parentName: 'Kitchen' });
      renderPanel({ data: makeResponse([line], []) });

      expect(screen.queryByText(/line selected/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Move to another source/i)).not.toBeInTheDocument();
    });
  });

  // ─── Selection mode: empty set (scenario 18) ─────────────────────────────────

  describe('selection mode with empty set', () => {
    it('renders checkboxes but no action bar when selectedLineIds is empty Set', () => {
      const line = makeLine({ id: 'l1', parentId: 'p1', parentName: 'Kitchen' });
      renderPanel({
        data: makeResponse([line], []),
        selectedLineIds: new Set<string>(),
        onSelectionChange: jest.fn(),
        onMoveLines: jest.fn(),
      });

      // Checkboxes are rendered (per-line + area group)
      expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
      // But action bar count is not shown
      expect(screen.queryByText(/line selected/i)).not.toBeInTheDocument();
    });
  });

  // ─── Selection mode: action bar count (scenario 19) ──────────────────────────

  describe('selection mode action bar count', () => {
    it('shows "1 line selected" when one line is selected', () => {
      const line = makeLine({ id: 'l1', parentId: 'p1', parentName: 'Kitchen' });
      renderPanel({
        data: makeResponse([line], []),
        selectedLineIds: new Set<string>(['l1']),
        onSelectionChange: jest.fn(),
        onMoveLines: jest.fn(),
      });

      expect(screen.getByText('1 line selected')).toBeInTheDocument();
    });

    it('shows "3 lines selected" when three lines are selected', () => {
      const line1 = makeLine({ id: 'l1', parentId: 'p1', parentName: 'Kitchen' });
      const line2 = makeLine({
        id: 'l2',
        parentId: 'p1',
        parentName: 'Kitchen',
        createdAt: '2026-01-02T00:00:00.000Z',
      });
      const line3 = makeLine({
        id: 'l3',
        parentId: 'p1',
        parentName: 'Kitchen',
        createdAt: '2026-01-03T00:00:00.000Z',
      });
      renderPanel({
        data: makeResponse([line1, line2, line3], []),
        selectedLineIds: new Set<string>(['l1', 'l2', 'l3']),
        onSelectionChange: jest.fn(),
        onMoveLines: jest.fn(),
      });

      expect(screen.getByText('3 lines selected')).toBeInTheDocument();
    });
  });

  // ─── Selection mode: individual line checkbox (scenario 20) ──────────────────

  describe('individual line checkbox interactions', () => {
    it('checking a line calls onSelectionChange with Set including that line id', () => {
      const line = makeLine({ id: 'line-abc', parentId: 'p1', parentName: 'Kitchen' });
      const onSelectionChange = jest.fn<(s: Set<string>) => void>();
      renderPanel({
        data: makeResponse([line], []),
        selectedLineIds: new Set<string>(),
        onSelectionChange,
        onMoveLines: jest.fn(),
      });

      // Find the per-line checkbox (aria-label contains the description)
      const checkbox = screen.getByRole('checkbox', { name: /Select Floor tiles/i });
      fireEvent.click(checkbox);

      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      const newSet = onSelectionChange.mock.calls[0]![0];
      expect(newSet.has('line-abc')).toBe(true);
    });

    it('unchecking a line calls onSelectionChange with id removed from Set', () => {
      const line = makeLine({ id: 'line-abc', parentId: 'p1', parentName: 'Kitchen' });
      const onSelectionChange = jest.fn<(s: Set<string>) => void>();
      renderPanel({
        data: makeResponse([line], []),
        selectedLineIds: new Set<string>(['line-abc']),
        onSelectionChange,
        onMoveLines: jest.fn(),
      });

      const checkbox = screen.getByRole('checkbox', { name: /Select Floor tiles/i });
      fireEvent.click(checkbox);

      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      const newSet = onSelectionChange.mock.calls[0]![0];
      expect(newSet.has('line-abc')).toBe(false);
    });
  });

  // ─── Selection mode: area group checkbox (scenario 21) ───────────────────────

  describe('area group checkbox', () => {
    it('clicking all-unchecked area group checkbox adds all area line ids to selection', () => {
      const line1 = makeLine({
        id: 'l1',
        parentId: 'p1',
        parentName: 'Kitchen',
        area: makeArea({ id: 'a1', name: 'Main' }),
      });
      const line2 = makeLine({
        id: 'l2',
        parentId: 'p1',
        parentName: 'Kitchen',
        area: makeArea({ id: 'a1', name: 'Main' }),
        createdAt: '2026-01-02T00:00:00.000Z',
      });
      const onSelectionChange = jest.fn<(s: Set<string>) => void>();
      renderPanel({
        data: makeResponse([line1, line2], []),
        selectedLineIds: new Set<string>(),
        onSelectionChange,
        onMoveLines: jest.fn(),
      });

      // Area group checkbox has aria-label containing the area name
      const areaCheckbox = screen.getByRole('checkbox', { name: /Select all in Main/i });
      fireEvent.click(areaCheckbox);

      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      const newSet = onSelectionChange.mock.calls[0]![0];
      expect(newSet.has('l1')).toBe(true);
      expect(newSet.has('l2')).toBe(true);
    });

    it('clicking all-checked area group checkbox removes all area line ids from selection', () => {
      const line1 = makeLine({
        id: 'l1',
        parentId: 'p1',
        parentName: 'Kitchen',
        area: makeArea({ id: 'a1', name: 'Main' }),
      });
      const line2 = makeLine({
        id: 'l2',
        parentId: 'p1',
        parentName: 'Kitchen',
        area: makeArea({ id: 'a1', name: 'Main' }),
        createdAt: '2026-01-02T00:00:00.000Z',
      });
      const onSelectionChange = jest.fn<(s: Set<string>) => void>();
      renderPanel({
        data: makeResponse([line1, line2], []),
        selectedLineIds: new Set<string>(['l1', 'l2']),
        onSelectionChange,
        onMoveLines: jest.fn(),
      });

      const areaCheckbox = screen.getByRole('checkbox', { name: /Select all in Main/i });
      fireEvent.click(areaCheckbox);

      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      const newSet = onSelectionChange.mock.calls[0]![0];
      expect(newSet.has('l1')).toBe(false);
      expect(newSet.has('l2')).toBe(false);
    });

    it('area group checkbox has indeterminate=true when only some lines are selected', () => {
      const line1 = makeLine({
        id: 'l1',
        parentId: 'p1',
        parentName: 'Kitchen',
        area: makeArea({ id: 'a1', name: 'Main' }),
      });
      const line2 = makeLine({
        id: 'l2',
        parentId: 'p1',
        parentName: 'Kitchen',
        area: makeArea({ id: 'a1', name: 'Main' }),
        createdAt: '2026-01-02T00:00:00.000Z',
      });
      renderPanel({
        data: makeResponse([line1, line2], []),
        selectedLineIds: new Set<string>(['l1']),
        onSelectionChange: jest.fn(),
        onMoveLines: jest.fn(),
      });

      const areaCheckbox = screen.getByRole('checkbox', {
        name: /Select all in Main/i,
      }) as HTMLInputElement;
      expect(areaCheckbox.indeterminate).toBe(true);
    });
  });

  // ─── Selection mode: move button (scenario 22) ───────────────────────────────

  describe('action bar "Move to another source…" button', () => {
    it('clicking "Move to another source…" calls onMoveLines', () => {
      const line = makeLine({ id: 'l1', parentId: 'p1', parentName: 'Kitchen' });
      const onMoveLines = jest.fn();
      renderPanel({
        data: makeResponse([line], []),
        selectedLineIds: new Set<string>(['l1']),
        onSelectionChange: jest.fn(),
        onMoveLines,
      });

      const moveButton = screen.getByRole('button', { name: /Move to another source/i });
      fireEvent.click(moveButton);

      expect(onMoveLines).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Parent item links (scenario 23) ───────────────────────────────────────────

  describe('parent item header links', () => {
    it('renders parent item name as link with href to work item detail for work item lines', () => {
      const line = makeLine({
        id: 'l1',
        parentId: 'work-item-42',
        parentName: 'Kitchen Renovation',
      });
      renderPanel({ data: makeResponse([line], []) });

      const link = screen.getByRole('link', { name: /Kitchen Renovation/i }) as HTMLAnchorElement;
      expect(link).toBeInTheDocument();
      expect(link.getAttribute('href')).toBe('/project/work-items/work-item-42');
    });

    it('renders parent item name as link with href to household item detail for household item lines', () => {
      const line = makeLine({
        id: 'l1',
        parentId: 'household-item-99',
        parentName: 'Sofa Purchase',
      });
      renderPanel({ data: makeResponse([], [line]) });

      const link = screen.getByRole('link', { name: /Sofa Purchase/i }) as HTMLAnchorElement;
      expect(link).toBeInTheDocument();
      expect(link.getAttribute('href')).toBe('/project/household-items/household-item-99');
    });
  });
});
