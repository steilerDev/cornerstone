/**
 * @jest-environment jsdom
 *
 * ConvertLinesTable (#2240): the editable, grouped offered / proposed / keep table of the Convert
 * page. Both surfaces (table, cards) are always mounted.
 *
 * Mutations these tests catch:
 *  - keying callbacks and testids by `row.id` (the task budget id) instead of the invoice line id;
 *  - a kept line staying editable, or showing its proposal instead of the offered amount;
 *  - an invalid line without `aria-invalid` / `aria-describedby` pointing at its error;
 *  - a testid emitted on both surfaces without the `-mobile-` card form (duplicate ids);
 *  - a hard-coded visible string instead of `labels`;
 *  - the handle focusing a hidden surface's input.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createRef } from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { makeLinkedRow } from '../../test/costLineFixtures.js';
import { ConvertLinesTable } from './ConvertLinesTable.js';
import type {
  ConvertLineView,
  ConvertLinesLabels,
  ConvertLinesTableHandle,
  ConvertLinesTableProps,
} from './ConvertLinesTable.js';
import { groupForDocument } from './costLineRows.js';
import type { CostLineRow } from './types.js';

const ROOF = { type: 'work_item' as const, id: 'w1', label: 'Roof' };

const rows: CostLineRow[] = [
  makeLinkedRow({
    id: 'wb-1',
    invoiceBudgetLineId: 'ibl-1',
    description: 'Tiles',
    gross: 600,
    quantity: 12,
    unit: 'm2',
    unitPrice: 50,
    target: ROOF,
  }),
  makeLinkedRow({
    id: 'wb-2',
    invoiceBudgetLineId: 'ibl-2',
    description: null,
    gross: 300,
    quantity: null,
    unit: null,
    unitPrice: null,
    target: ROOF,
  }),
  makeLinkedRow({
    id: 'hb-1',
    invoiceBudgetLineId: 'ibl-3',
    lineType: 'household_item',
    description: 'Delivery',
    gross: 100,
    target: null,
  }),
];

const labels: ConvertLinesLabels = {
  caption: 'CAP-text',
  line: 'COL-line',
  offered: 'COL-offered',
  proposed: 'COL-proposed',
  keep: 'COL-keep',
  keepVisible: 'KEEP-visible',
  keepAria: (name) => `keep-aria:${name}`,
  proposedAria: (name) => `proposed-aria:${name}`,
  lineInvalid: 'LINE-invalid-text',
  total: 'TOTAL-text',
  noDescription: 'NO-description',
};

function lineViews(over: Record<string, Partial<ConvertLineView>> = {}) {
  const base: Record<string, ConvertLineView> = {
    'ibl-1': { offered: 600, proposed: '630.00', keep: false },
    'ibl-2': { offered: 300, proposed: '315.00', keep: false },
    'ibl-3': { offered: 100, proposed: '105.00', keep: false },
  };
  return new Map(Object.entries(base).map(([k, v]) => [k, { ...v, ...(over[k] ?? {}) }]));
}

function renderTable(props: Partial<ConvertLinesTableProps> = {}) {
  const groups = groupForDocument(rows);
  const onChangeProposed = jest.fn();
  const onToggleKeep = jest.fn();
  const view = render(
    <MemoryRouter>
      <LocaleProvider>
        <ConvertLinesTable
          groups={groups}
          lines={lineViews()}
          invalidKeys={new Set()}
          groupProposedTotals={
            new Map([
              [groups[0]!.id, 945],
              [groups[1]!.id, 105],
            ])
          }
          offeredTotal={1000}
          proposedTotal={1050}
          remainder={<span>REMAINDER-text</span>}
          onChangeProposed={onChangeProposed}
          onToggleKeep={onToggleKeep}
          labels={labels}
          {...props}
        />
      </LocaleProvider>
    </MemoryRouter>,
  );
  return { ...view, onChangeProposed, onToggleKeep, groups };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('structure', () => {
  it('mounts both surfaces with the table caption and column headers from labels', () => {
    renderTable();
    expect(screen.getByRole('table')).toHaveAccessibleName('CAP-text');
    for (const text of ['COL-line', 'COL-offered', 'COL-proposed', 'COL-keep']) {
      expect(
        within(screen.getByRole('table')).getByRole('columnheader', { name: text }),
      ).toBeVisible();
    }
  });

  it('heads each group with its task name as plain text, never a link', () => {
    const { groups } = renderTable();
    const head = screen.getByTestId(`convert-lines-group-${groups[0]!.id}`);
    expect(head).toHaveAttribute('scope', 'rowgroup');
    expect(within(head).getByText('Roof')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('heads lines with no task or purchase with the Not assigned badge', () => {
    renderTable();
    const head = screen.getByTestId('convert-lines-group-unassigned');
    expect(within(head).getByText('Not assigned')).toBeInTheDocument();
  });

  it('shows each group on the card surface with its own mobile testid', () => {
    const { groups } = renderTable();
    const head = screen.getByTestId(`convert-lines-group-mobile-${groups[0]!.id}`);
    expect(head.tagName).toBe('H3');
    expect(within(head).getByText('Roof')).toBeInTheDocument();
  });

  it('shows the group subtotals and the totals footer on both surfaces', () => {
    const { groups } = renderTable();
    expect(screen.getByTestId(`convert-lines-group-total-${groups[0]!.id}`)).toHaveTextContent(
      '€945.00',
    );
    expect(
      screen.getByTestId(`convert-lines-group-total-mobile-${groups[1]!.id}`),
    ).toHaveTextContent('€105.00');
    for (const surface of ['', 'mobile-']) {
      expect(screen.getByTestId(`convert-lines-total-offered-${surface}all`)).toHaveTextContent(
        '€1,000.00',
      );
      expect(screen.getByTestId(`convert-lines-total-proposed-${surface}all`)).toHaveTextContent(
        '€1,050.00',
      );
      expect(screen.getByTestId(`convert-lines-remainder-${surface}all`)).toHaveTextContent(
        'REMAINDER-text',
      );
    }
    expect(screen.getAllByText('TOTAL-text').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the offered amount per line and quantity facts only for unit-priced lines', () => {
    renderTable();
    const first = screen.getByTestId('convert-lines-row-ibl-1');
    expect(first).toHaveTextContent('€600.00');
    expect(first).toHaveTextContent('12');
    expect(first).toHaveTextContent('Tiles');
    const second = screen.getByTestId('convert-lines-row-ibl-2');
    expect(second).toHaveTextContent('€300.00');
    expect(second).not.toHaveTextContent('×');
  });

  it('shows the visible Keep label only on the card surface', () => {
    renderTable();
    const card = screen.getByTestId('convert-lines-row-mobile-ibl-1');
    expect(within(card).getByText('KEEP-visible')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('convert-lines-row-ibl-1')).queryByText('KEEP-visible'),
    ).toBeNull();
    expect(within(card).getByText('COL-offered')).toBeInTheDocument();
  });

  it('has unique test ids and unique element ids across both surfaces', () => {
    const { container } = renderTable({ invalidKeys: new Set(['ibl-2']) });
    expect(findDuplicateTestIds(container)).toEqual([]);
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a custom testIdPrefix replaces every default id', () => {
    const { container } = renderTable({ testIdPrefix: 'alt' });
    expect(screen.getByTestId('alt')).toBeInTheDocument();
    expect(screen.getByTestId('alt-input-ibl-1')).toBeInTheDocument();
    expect(screen.getByTestId('alt-keep-mobile-ibl-1')).toBeInTheDocument();
    expect(container.querySelector('[data-testid^="convert-lines"]')).toBeNull();
  });
});

describe('inputs', () => {
  it('addresses inputs and checkboxes by invoice line id, on both surfaces', () => {
    renderTable();
    for (const id of ['ibl-1', 'ibl-2', 'ibl-3']) {
      expect(screen.getByTestId(`convert-lines-input-${id}`)).toHaveValue(
        id === 'ibl-1' ? 630 : id === 'ibl-2' ? 315 : 105,
      );
      expect(screen.getByTestId(`convert-lines-input-mobile-${id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`convert-lines-keep-${id}`)).not.toBeChecked();
      expect(screen.getByTestId(`convert-lines-keep-mobile-${id}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('convert-lines-input-wb-1')).toBeNull();
  });

  it('names inputs and checkboxes from labels, using the no-description label when needed', () => {
    renderTable();
    expect(screen.getByTestId('convert-lines-input-ibl-1')).toHaveAccessibleName(
      'proposed-aria:Tiles',
    );
    expect(screen.getByTestId('convert-lines-keep-ibl-1')).toHaveAccessibleName('keep-aria:Tiles');
    expect(screen.getByTestId('convert-lines-input-ibl-2')).toHaveAccessibleName(
      'proposed-aria:NO-description',
    );
  });

  it('typing reports the invoice line id and the typed value', () => {
    const { onChangeProposed } = renderTable();
    fireEvent.change(screen.getByTestId('convert-lines-input-ibl-2'), { target: { value: '250' } });
    expect(onChangeProposed).toHaveBeenCalledWith('ibl-2', '250');
    fireEvent.change(screen.getByTestId('convert-lines-input-mobile-ibl-3'), {
      target: { value: '9' },
    });
    expect(onChangeProposed).toHaveBeenLastCalledWith('ibl-3', '9');
  });

  it('scrolling over a focused input blurs it so the wheel cannot change the amount', () => {
    renderTable();
    const input = screen.getByTestId('convert-lines-input-ibl-1');
    input.focus();
    expect(input).toHaveFocus();
    fireEvent.wheel(input);
    expect(input).not.toHaveFocus();
  });

  it('toggling Keep reports the invoice line id and the new state', () => {
    const { onToggleKeep } = renderTable();
    fireEvent.click(screen.getByTestId('convert-lines-keep-ibl-1'));
    expect(onToggleKeep).toHaveBeenCalledWith('ibl-1', true);
    fireEvent.click(screen.getByTestId('convert-lines-keep-mobile-ibl-2'));
    expect(onToggleKeep).toHaveBeenLastCalledWith('ibl-2', true);
  });

  it('a kept line is disabled and shows its offered amount, not its proposal', () => {
    renderTable({ lines: lineViews({ 'ibl-1': { keep: true, proposed: '1.00' } }) });
    for (const id of ['convert-lines-input-ibl-1', 'convert-lines-input-mobile-ibl-1']) {
      expect(screen.getByTestId(id)).toBeDisabled();
      expect(screen.getByTestId(id)).toHaveValue(600);
    }
    expect(screen.getByTestId('convert-lines-keep-ibl-1')).toBeChecked();
    expect(screen.getByTestId('convert-lines-input-ibl-2')).toBeEnabled();
  });

  it('disabled turns off every input and checkbox', () => {
    renderTable({ disabled: true });
    for (const el of screen.getAllByRole('spinbutton', { hidden: true })) expect(el).toBeDisabled();
    for (const el of screen.getAllByRole('checkbox', { hidden: true })) expect(el).toBeDisabled();
  });

  it('an invalid line is aria-invalid and described by its error on both surfaces', () => {
    renderTable({ invalidKeys: new Set(['ibl-2']) });
    for (const prefix of ['convert-lines-input-', 'convert-lines-input-mobile-']) {
      const input = screen.getByTestId(`${prefix}ibl-2`);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      const errorId = input.getAttribute('aria-describedby')!;
      expect(document.getElementById(errorId)).toHaveTextContent('LINE-invalid-text');
    }
    expect(screen.getByTestId('convert-lines-error-ibl-2')).toHaveTextContent('LINE-invalid-text');
    expect(screen.getByTestId('convert-lines-error-mobile-ibl-2')).toBeInTheDocument();
    const valid = screen.getByTestId('convert-lines-input-ibl-1');
    expect(valid).not.toHaveAttribute('aria-invalid');
    expect(valid).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByTestId('convert-lines-error-ibl-1')).toBeNull();
  });
});

describe('focus handle', () => {
  const originalRects = HTMLElement.prototype.getClientRects;
  beforeEach(() => {
    // jsdom has no layout: report boxes only for inputs of the surface named in `visibleSurface`.
    HTMLElement.prototype.getClientRects = originalRects;
  });
  afterEach(() => {
    HTMLElement.prototype.getClientRects = originalRects;
  });

  function showOnly(surface: 'table' | 'card') {
    HTMLElement.prototype.getClientRects = function (this: HTMLElement) {
      const inCard = this.closest('[class*="cardSurface"]') !== null;
      const shown = surface === 'card' ? inCard : !inCard;
      return (shown ? [{}] : []) as unknown as DOMRectList;
    };
  }

  function withHandle(props: Partial<ConvertLinesTableProps> = {}) {
    const ref = createRef<ConvertLinesTableHandle>();
    const view = renderTable({ ref, ...props });
    return { ref, ...view };
  }

  it('focusFirstInvalid focuses the first invalid input on the visible table surface', () => {
    showOnly('table');
    const { ref } = withHandle({ invalidKeys: new Set(['ibl-2', 'ibl-3']) });
    expect(ref.current!.focusFirstInvalid()).toBe(true);
    expect(screen.getByTestId('convert-lines-input-ibl-2')).toHaveFocus();
  });

  it('focusFirstInvalid focuses the card input when the card surface is the visible one', () => {
    showOnly('card');
    const { ref } = withHandle({ invalidKeys: new Set(['ibl-2']) });
    expect(ref.current!.focusFirstInvalid()).toBe(true);
    expect(screen.getByTestId('convert-lines-input-mobile-ibl-2')).toHaveFocus();
  });

  it('focusFirstInvalid returns false when nothing is invalid', () => {
    showOnly('table');
    const { ref } = withHandle();
    expect(ref.current!.focusFirstInvalid()).toBe(false);
    expect(document.body).toHaveFocus();
  });

  it('focusFirstEditable skips kept (disabled) lines', () => {
    showOnly('table');
    const { ref } = withHandle({
      lines: lineViews({ 'ibl-1': { keep: true }, 'ibl-2': { keep: true } }),
    });
    expect(ref.current!.focusFirstEditable()).toBe(true);
    expect(screen.getByTestId('convert-lines-input-ibl-3')).toHaveFocus();
  });

  it('focusFirstEditable returns false when every line is kept or nothing is shown', () => {
    showOnly('table');
    const kept = withHandle({
      lines: lineViews({
        'ibl-1': { keep: true },
        'ibl-2': { keep: true },
        'ibl-3': { keep: true },
      }),
    });
    expect(kept.ref.current!.focusFirstEditable()).toBe(false);
    kept.unmount();
    HTMLElement.prototype.getClientRects = () => [] as unknown as DOMRectList;
    const hidden = withHandle();
    expect(hidden.ref.current!.focusFirstEditable()).toBe(false);
  });
});
