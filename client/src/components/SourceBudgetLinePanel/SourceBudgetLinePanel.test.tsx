/**
 * @jest-environment jsdom
 */
import type React from 'react';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createRef, useState } from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { markEscapeHandled } from '../Modal/useFocusTrap.js';
import type { SourceBudgetLinePanelHandle } from './SourceBudgetLinePanel.js';
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
    includesVat: true,
    createdBy: null,
    hasClaimedInvoice: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeResponse(
  workItemLines: BudgetSourceBudgetLine[] = [],
  householdItemLines: BudgetSourceBudgetLine[] = [],
): BudgetSourceBudgetLinesResponse {
  return { workItemLines, householdItemLines };
}

/**
 * SourceBudgetLinePanel (#2242, D21, FB1): ONE area > item > line tree for tasks and purchases,
 * with a tri-state checkbox per area and item, a checkbox per line, the shared SelectionActionBar
 * (Move to another source) and Escape to clear.
 *
 * Mutations these tests catch: tasks and purchases split into two sections again; the kind word
 * missing from the item heading; the area checkbox not cascading to descendants; indeterminate
 * state not shown for a partly selected item or area; a click on the item link or a line
 * checkbox also toggling the whole item (block click must ignore input/a/button/label); Escape
 * clearing the selection although a dialog already handled it; Clear selection not putting focus
 * on the first checkbox; the read-only (checkbox-less) mode coming back.
 */

interface PanelProps {
  sourceId: string;
  sourceName: string;
  data: BudgetSourceBudgetLinesResponse | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedLineIds: Set<string>;
  onSelectionChange: (newSet: Set<string>) => void;
  onMoveLines: () => void;
  ref?: React.Ref<SourceBudgetLinePanelHandle>;
}

const KITCHEN = {
  id: 'area-k',
  name: 'Kitchen',
  color: '#336699',
  ancestors: [{ id: 'area-h', name: 'House', color: null }],
};

describe('SourceBudgetLinePanel', () => {
  let Panel: React.ComponentType<PanelProps>;
  const onRetry = jest.fn();
  const onMoveLines = jest.fn();
  const onSelectionSpy = jest.fn<(next: Set<string>) => void>();

  beforeEach(async () => {
    onRetry.mockReset();
    onMoveLines.mockReset();
    onSelectionSpy.mockReset();
    if (!Panel) {
      const module = await import('./SourceBudgetLinePanel.js');
      Panel = module.SourceBudgetLinePanel as unknown as React.ComponentType<PanelProps>;
    }
  });

  /** A stateful host so selection changes re-render the panel like the real page. */
  function Host(props: Partial<PanelProps> & { initial?: string[] }) {
    const [selected, setSelected] = useState(new Set(props.initial ?? []));
    return (
      <Panel
        sourceId="src-1"
        sourceName="Home Loan"
        data={null}
        isLoading={false}
        error={null}
        onRetry={onRetry}
        onMoveLines={onMoveLines}
        {...props}
        selectedLineIds={selected}
        onSelectionChange={(next) => {
          onSelectionSpy(next);
          setSelected(next);
        }}
      />
    );
  }

  function renderPanel(props: Partial<PanelProps> & { initial?: string[] } = {}) {
    return render(
      <MemoryRouter initialEntries={['/budget/financing/sources/src-1?tab=cost']}>
        <LocaleProvider>
          <Host {...props} />
        </LocaleProvider>
        <OriginProbe />
      </MemoryRouter>,
    );
  }

  const box = (name: string | RegExp) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

  /** Kitchen (under House): task Tiling with 2 lines, purchase Sink with 1; one line without area. */
  const data = () =>
    makeResponse(
      [
        makeLine({
          id: 'l-1',
          parentId: 'wi-1',
          parentName: 'Tiling',
          area: KITCHEN,
          description: 'Tiles',
        }),
        makeLine({
          id: 'l-2',
          parentId: 'wi-1',
          parentName: 'Tiling',
          area: KITCHEN,
          description: 'Grout',
          createdAt: '2026-02-01T00:00:00.000Z',
        }),
        makeLine({
          id: 'l-4',
          parentId: 'wi-2',
          parentName: 'Fence',
          area: null,
          description: 'Posts',
        }),
      ],
      [
        makeLine({
          id: 'l-3',
          parentId: 'hi-1',
          parentName: 'Sink',
          area: KITCHEN,
          description: 'Basin',
        }),
      ],
    );

  describe('states', () => {
    it('shows a labelled skeleton region while loading', () => {
      renderPanel({ isLoading: true });
      expect(screen.getByRole('region', { name: 'Loading budget lines…' })).toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).toBeNull();
    });

    it('shows the error with Retry that calls onRetry', () => {
      renderPanel({ error: 'Could not load budget lines.' });
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load budget lines.');
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it.each([null, makeResponse()])('shows the empty state for %j', (value) => {
      renderPanel({ data: value });
      expect(screen.getByText('No budget lines assigned')).toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).toBeNull();
    });
  });

  describe('tree', () => {
    it('is one region named for the source with ONE tree: area h2, item h3 with the kind word', () => {
      renderPanel({ data: data() });

      const region = screen.getByRole('region', { name: 'Budget lines for Home Loan' });
      expect(region).toHaveAttribute('id', 'source-lines-src-1');
      expect(
        within(region)
          .getAllByRole('heading', { level: 2 })
          .map((h) => h.textContent),
      ).toEqual(['House', 'Kitchen', 'No Area']);
      expect(
        within(region)
          .getAllByRole('heading', { level: 3 })
          .map((h) => h.textContent),
      ).toEqual(['PurchaseSink', 'TaskTiling', 'TaskFence']);
      // no kind-level section headings any more
      expect(within(region).queryAllByRole('heading', { level: 1 })).toEqual([]);
    });

    it('nests Kitchen below House (depth) and counts the lines of each area', () => {
      const { container } = renderPanel({ data: data() });

      const groups = Array.from(container.querySelectorAll<HTMLElement>('[style*="--area-depth"]'));
      expect(groups.map((g) => g.style.getPropertyValue('--area-depth'))).toEqual(['0', '1', '0']);
      expect(screen.getByText('3 lines')).toBeInTheDocument(); // Kitchen
      expect(screen.getAllByText('1 line')).toHaveLength(1); // No Area
    });

    it('lists the lines of an item oldest first, with description, confidence, status and amount', () => {
      renderPanel({ data: data() });

      const lines = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
      const tiles = lines.findIndex((text) => text.includes('Tiles'));
      const grout = lines.findIndex((text) => text.includes('Grout'));
      expect(tiles).toBeLessThan(grout);
      expect(lines[tiles]).toContain('Own estimate');
      expect(lines[tiles]).toContain('Not invoiced');
      expect(lines[tiles]).toContain('1,500.00');
    });

    it('shows the invoiced cost for a line with invoices, and a dash for no description', () => {
      renderPanel({
        data: makeResponse([
          makeLine({
            id: 'l-9',
            description: null,
            invoiceCount: 1,
            actualCost: 900,
            invoiceLink: { invoiceId: 'i', invoiceStatus: 'paid' } as never,
          }),
        ]),
      });
      const row = screen.getByRole('listitem');
      expect(row).toHaveTextContent('—');
      expect(row).toHaveTextContent('900.00');
      expect(row).toHaveTextContent('Paid');
    });

    it('draws a colour dot for a coloured area and the grey dot for No Area (House has no colour)', () => {
      const { container } = renderPanel({ data: data() });
      expect(
        container.querySelectorAll('[aria-hidden="true"][style*="background-color"]'),
      ).toHaveLength(2);
    });

    it('links each item to its page with the origin, and names the link after the item', () => {
      renderPanel({ data: data() });

      const task = screen.getByRole('link', { name: 'Open Tiling' });
      const purchase = screen.getByRole('link', { name: 'Open Sink' });
      expect(task).toHaveAttribute('href', '/project/work-items/wi-1');
      expect(purchase).toHaveAttribute('href', '/project/household-items/hi-1');
      fireEvent.click(task);
      expect(probedPath()).toBe('/project/work-items/wi-1');
      expect(probedOrigin()?.to).toContain('/budget/financing/sources/src-1');
    });

    it('has no read-only mode: every line has a checkbox', () => {
      renderPanel({ data: data() });
      expect(screen.getAllByRole('checkbox')).toHaveLength(
        4 /* lines */ + 3 /* items */ + 3 /* areas */,
      );
    });
  });

  describe('area tree shapes', () => {
    const area = (id: string, name: string, ancestors: { id: string; name: string }[] = []) =>
      ({
        id,
        name,
        color: null,
        ancestors: ancestors.map((a) => ({ ...a, color: null })),
      }) as never;
    const HOUSE_ANC = { id: 'a-house', name: 'House' };
    const FLOOR_ANC = { id: 'a-floor', name: 'Ground floor' };

    it('sorts root areas and sibling areas by name, shows an area that only has sub-areas, and a line directly in a parent', () => {
      renderPanel({
        data: makeResponse([
          makeLine({
            id: 'l-a',
            parentId: 'w1',
            parentName: 'A',
            area: area('a-kitchen', 'Kitchen', [HOUSE_ANC, FLOOR_ANC]),
          }),
          makeLine({
            id: 'l-b',
            parentId: 'w2',
            parentName: 'B',
            area: area('a-bath', 'Bath', [HOUSE_ANC, FLOOR_ANC]),
          }),
          makeLine({ id: 'l-c', parentId: 'w3', parentName: 'C', area: area('a-house', 'House') }),
          makeLine({
            id: 'l-d',
            parentId: 'w4',
            parentName: 'D',
            area: area('a-garden', 'Garden'),
          }),
        ]),
      });

      expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
        'Garden',
        'House',
        'Ground floor',
        'Bath',
        'Kitchen',
      ]);
      // House counts only its own line; the checkbox of House cascades to the whole subtree
      fireEvent.click(box('Select all in House'));
      expect(onSelectionSpy).toHaveBeenLastCalledWith(new Set(['l-a', 'l-b', 'l-c']));
      expect(box('Select all in Ground floor').checked).toBe(true);
    });

    it('finds the chain of an ancestor-only area even when earlier lines have no area or no chain', () => {
      renderPanel({
        data: makeResponse([
          makeLine({ id: 'l-1', parentId: 'w1', parentName: 'A', area: null }),
          makeLine({
            id: 'l-2',
            parentId: 'w2',
            parentName: 'B',
            area: area('a-garden', 'Garden'),
          }),
          makeLine({
            id: 'l-3',
            parentId: 'w3',
            parentName: 'C',
            area: area('a-kitchen', 'Kitchen', [HOUSE_ANC, FLOOR_ANC]),
          }),
        ]),
      });

      expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
        'Garden',
        'House',
        'Ground floor',
        'Kitchen',
        'No Area',
      ]);
    });

    it('treats an area without an ancestors list as a root', () => {
      const bare = { id: 'a-x', name: 'Shed', color: null } as never;
      renderPanel({ data: makeResponse([makeLine({ id: 'l-x', area: bare })]) });
      expect(screen.getByRole('heading', { level: 2, name: 'Shed' })).toBeInTheDocument();
    });

    it('unchecking a selected line removes only that line', () => {
      renderPanel({ data: data(), initial: ['l-1', 'l-2'] });
      fireEvent.click(box('Select Tiles'));
      expect(onSelectionSpy).toHaveBeenLastCalledWith(new Set(['l-2']));
    });
  });

  describe('selection', () => {
    it('selects one line and shows the bar with its count and the Move action', () => {
      renderPanel({ data: data() });
      expect(screen.queryByTestId('source-lines-src-1-selection-bar')).toBeNull();

      fireEvent.click(box('Select Tiles'));

      expect(onSelectionSpy).toHaveBeenLastCalledWith(new Set(['l-1']));
      expect(screen.getByTestId('source-lines-src-1-selection-bar')).toHaveTextContent(
        '1 line selected',
      );
      fireEvent.click(screen.getByTestId('source-lines-src-1-move'));
      expect(onMoveLines).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('source-lines-src-1-move')).toHaveTextContent(
        'Move to another source',
      );
    });

    it('a partly selected item and area show the indeterminate state, not a mixed aria-checked', () => {
      renderPanel({ data: data(), initial: ['l-1'] });

      expect(box('Select all under Tiling').indeterminate).toBe(true);
      expect(box('Select all under Tiling').checked).toBe(false);
      expect(box('Select all in Kitchen').indeterminate).toBe(true);
      expect(box('Select all in House').indeterminate).toBe(true);
      expect(box('Select all under Sink').indeterminate).toBe(false);
      expect(screen.getByRole('region').querySelector('[aria-checked="mixed"]')).toBeNull();
    });

    it('the item checkbox selects and clears all of its lines', () => {
      renderPanel({ data: data() });

      fireEvent.click(box('Select all under Tiling'));
      expect(onSelectionSpy).toHaveBeenLastCalledWith(new Set(['l-1', 'l-2']));
      expect(box('Select all under Tiling').checked).toBe(true);

      fireEvent.click(box('Select all under Tiling'));
      expect(onSelectionSpy).toHaveBeenLastCalledWith(new Set());
    });

    it('the area checkbox cascades to the lines of its sub-areas, and back', () => {
      renderPanel({ data: data() });

      fireEvent.click(box('Select all in House'));
      expect(onSelectionSpy).toHaveBeenLastCalledWith(new Set(['l-1', 'l-2', 'l-3']));
      expect(box('Select all in Kitchen').checked).toBe(true);
      expect(box('Select all in No Area').checked).toBe(false);

      fireEvent.click(box('Select all in House'));
      expect(onSelectionSpy).toHaveBeenLastCalledWith(new Set());
    });

    it('keeps selections of other areas when one area is cleared', () => {
      renderPanel({ data: data(), initial: ['l-1', 'l-2', 'l-3', 'l-4'] });
      fireEvent.click(box('Select all in No Area'));
      expect(onSelectionSpy).toHaveBeenLastCalledWith(new Set(['l-1', 'l-2', 'l-3']));
    });

    it('a click on the empty space of an item block toggles the item, but not on the link, a checkbox or a label', () => {
      const { container } = renderPanel({ data: data() });
      const block = container.querySelector('[class*="parentItemBlock"]') as HTMLElement;

      fireEvent.click(block.querySelector('h3')!);
      expect(onSelectionSpy).toHaveBeenCalledTimes(1);

      onSelectionSpy.mockClear();
      fireEvent.click(within(block).getByRole('link'));
      fireEvent.click(box('Select Grout'));
      // only the line checkbox changed the selection, once
      expect(onSelectionSpy).toHaveBeenCalledTimes(1);
      expect(onSelectionSpy).toHaveBeenLastCalledWith(expect.any(Set));
    });

    it('the heading and the item link are not inside any checkbox role', () => {
      const { container } = renderPanel({ data: data() });
      expect(container.querySelector('[role="checkbox"]')).toBeNull();
      for (const heading of screen.getAllByRole('heading')) {
        expect(heading.closest('[role="checkbox"]')).toBeNull();
      }
    });
  });

  describe('Escape and Clear selection', () => {
    it('Escape inside the panel clears the selection', () => {
      renderPanel({ data: data(), initial: ['l-1'] });

      fireEvent.keyDown(box('Select Tiles'), { key: 'Escape' });

      expect(onSelectionSpy).toHaveBeenLastCalledWith(new Set());
      expect(screen.queryByTestId('source-lines-src-1-selection-bar')).toBeNull();
    });

    it('Escape does nothing without a selection', () => {
      renderPanel({ data: data() });
      fireEvent.keyDown(box('Select Tiles'), { key: 'Escape' });
      expect(onSelectionSpy).not.toHaveBeenCalled();
    });

    it('another key does nothing', () => {
      renderPanel({ data: data(), initial: ['l-1'] });
      fireEvent.keyDown(box('Select Tiles'), { key: 'a' });
      expect(onSelectionSpy).not.toHaveBeenCalled();
    });

    it('Escape that a dialog or picker already handled, or that was prevented, does not clear it', () => {
      renderPanel({ data: data(), initial: ['l-1'] });

      const handled = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      markEscapeHandled(handled);
      fireEvent(box('Select Tiles'), handled);
      expect(onSelectionSpy).not.toHaveBeenCalled();

      const prevented = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      prevented.preventDefault();
      fireEvent(box('Select Tiles'), prevented);
      expect(onSelectionSpy).not.toHaveBeenCalled();
      expect(screen.getByTestId('source-lines-src-1-selection-bar')).toBeInTheDocument();
    });

    it('Clear selection empties the selection and puts focus on the first checkbox', async () => {
      renderPanel({ data: data(), initial: ['l-1', 'l-2'] });

      fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));

      expect(onSelectionSpy).toHaveBeenLastCalledWith(new Set());
      await waitFor(() => expect(screen.getAllByRole('checkbox')[0]).toHaveFocus());
      expect(screen.queryByTestId('source-lines-src-1-selection-bar')).toBeNull();
    });
  });

  describe('handle', () => {
    it('focusFirstCheckbox moves focus to the first area checkbox once the page settles', async () => {
      const ref = createRef<SourceBudgetLinePanelHandle>();
      render(
        <MemoryRouter>
          <LocaleProvider>
            <Host data={data()} ref={ref} />
          </LocaleProvider>
        </MemoryRouter>,
      );

      act(() => ref.current!.focusFirstCheckbox());

      await waitFor(() => expect(box('Select all in House')).toHaveFocus());
    });

    it('with no tree to land in, focusFirstCheckbox leaves focus on the (empty) region', async () => {
      const ref = createRef<SourceBudgetLinePanelHandle>();
      render(
        <MemoryRouter>
          <LocaleProvider>
            <Host data={null} ref={ref} />
          </LocaleProvider>
        </MemoryRouter>,
      );

      expect(() => act(() => ref.current!.focusFirstCheckbox())).not.toThrow();
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });
      expect(document.getElementById('source-lines-src-1')).toHaveFocus();
    });

    describe('while the lines are loading (UX round 1)', () => {
      function setup(initial: Partial<PanelProps>) {
        const ref = createRef<SourceBudgetLinePanelHandle>();
        const tree = (props: Partial<PanelProps>) => (
          <MemoryRouter>
            <LocaleProvider>
              <Host ref={ref} {...props} />
            </LocaleProvider>
          </MemoryRouter>
        );
        const view = render(tree(initial));
        return {
          ref,
          unmount: view.unmount,
          rerender: (props: Partial<PanelProps>) => view.rerender(tree(props)),
        };
      }
      const region = () => document.getElementById('source-lines-src-1')!;

      it('every state is a programmatically focusable region', () => {
        for (const props of [
          { isLoading: true },
          { error: 'Could not load budget lines.' },
          { data: null },
          { data: data() },
        ] as Partial<PanelProps>[]) {
          const { unmount } = setup(props);
          expect(region()).toHaveAttribute('tabindex', '-1');
          expect(region()).toHaveAttribute('role', 'region');
          unmount();
        }
      });

      it('focuses the region while loading and the first checkbox once the lines arrive', async () => {
        const { ref, rerender } = setup({ isLoading: true });

        act(() => ref.current!.focusFirstCheckbox());
        await waitFor(() => expect(region()).toHaveFocus());
        expect(screen.queryByRole('checkbox')).toBeNull();

        rerender({ isLoading: false, data: data() });

        await waitFor(() => expect(box('Select all in House')).toHaveFocus());
      });

      it.each([
        ['no lines', { isLoading: false, data: makeResponse() }],
        ['a failed load', { isLoading: false, error: 'Could not load budget lines.' }],
      ] as [string, Partial<PanelProps>][])(
        'stays on the region when the load ends with %s',
        async (_name, after) => {
          const { ref, rerender } = setup({ isLoading: true });
          act(() => ref.current!.focusFirstCheckbox());
          await waitFor(() => expect(region()).toHaveFocus());

          rerender(after);

          await waitFor(() => expect(region()).toBeInTheDocument());
          expect(region()).toHaveFocus();
        },
      );

      it('a request made after the load goes straight to the first checkbox', async () => {
        const { ref } = setup({ data: data() });
        act(() => ref.current!.focusFirstCheckbox());
        await waitFor(() => expect(box('Select all in House')).toHaveFocus());
      });

      it('does not steal focus later: a finished load without a request leaves focus alone', async () => {
        const { rerender } = setup({ isLoading: true });
        rerender({ isLoading: false, data: data() });
        await act(async () => {
          await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        });
        expect(document.body).toHaveFocus();
      });
    });

    it('does not select anything by itself (Move lines never pre-selects)', async () => {
      const ref = createRef<SourceBudgetLinePanelHandle>();
      render(
        <MemoryRouter>
          <LocaleProvider>
            <Host data={data()} ref={ref} />
          </LocaleProvider>
        </MemoryRouter>,
      );
      act(() => ref.current!.focusFirstCheckbox());
      await waitFor(() => expect(box('Select all in House')).toHaveFocus());
      expect(onSelectionSpy).not.toHaveBeenCalled();
      expect(screen.queryByTestId('source-lines-src-1-selection-bar')).toBeNull();
    });
  });
});
