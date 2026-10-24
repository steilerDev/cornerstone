/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { markEscapeHandled } from '../Modal/useFocusTrap.js';
import type { ShowUndoToastOptions } from '../Toast/ToastContext.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type * as GridModule from './CostLineGrid.js';
import type * as ModelModule from './costLineGridModel.js';
import type { CostLineGridProps, CostLineGridRow, CostLineGridRowErrors } from './types.js';

// ─── Module boundaries ───────────────────────────────────────────────────────

const localeState = { resolved: 'en' };
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    get resolvedLocale() {
      return localeState.resolved;
    },
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  };
  return {
    LocaleProvider: ({ children }: { children: unknown }) => children,
    useLocale: () => localeValue,
  };
});

const mockShowUndoToast = jest.fn<(options: ShowUndoToastOptions) => void>();
jest.unstable_mockModule('../Toast/ToastContext.js', () => ({
  useToast: () => ({ showUndoToast: mockShowUndoToast, showToast: jest.fn() }),
}));

const mockSearchEverywhere = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/searchApi.js', () => ({
  searchEverywhere: mockSearchEverywhere,
}));

const mockFetchWorkItemBudgets = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const mockFetchHouseholdItemBudgets = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  fetchWorkItemBudgets: mockFetchWorkItemBudgets,
  createWorkItemBudget: jest.fn(),
  updateWorkItemBudget: jest.fn(),
  deleteWorkItemBudget: jest.fn(),
}));
jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  fetchHouseholdItemBudgets: mockFetchHouseholdItemBudgets,
  createHouseholdItemBudget: jest.fn(),
  updateHouseholdItemBudget: jest.fn(),
  deleteHouseholdItemBudget: jest.fn(),
}));

let CostLineGrid: typeof GridModule.CostLineGrid;
let blankGridRow: typeof ModelModule.blankGridRow;

beforeEach(async () => {
  jest.clearAllMocks();
  localeState.resolved = 'en';
  installMatchMedia({ '(min-width: 768px)': true });
  ({ CostLineGrid } = await import('./CostLineGrid.js'));
  ({ blankGridRow } = await import('./costLineGridModel.js'));
});

// ─── Harness ─────────────────────────────────────────────────────────────────

const TASK = { type: 'work_item' as const, id: 'w1', label: 'Tiling', area: null };

function makeRow(over: Partial<CostLineGridRow> & { rowId: string }): CostLineGridRow {
  return { ...blankGridRow(over.rowId), ...over };
}

interface Probe {
  rows: readonly CostLineGridRow[];
}

function renderGrid(
  initial: readonly CostLineGridRow[],
  props: Partial<CostLineGridProps> = {},
  probe: Probe = { rows: initial },
) {
  const onAnnounce = jest.fn<(message: string) => void>();
  const onSaveShortcut = jest.fn<() => void>();
  const onEscape = jest.fn<() => void>();
  const onAssignAllChange = jest.fn<(t: unknown) => void>();
  function Harness() {
    const [rows, setRows] = useState<readonly CostLineGridRow[]>(initial);
    probe.rows = rows;
    return (
      <CostLineGrid
        rows={rows}
        onRowsChange={(next) => {
          probe.rows = next;
          setRows(next);
        }}
        options={{ targets: false, requireTarget: false, positiveGross: false }}
        assignAll={null}
        onAssignAllChange={onAssignAllChange}
        showAllErrors={false}
        onAnnounce={onAnnounce}
        onSaveShortcut={onSaveShortcut}
        onEscape={onEscape}
        {...props}
      />
    );
  }
  const view = render(<Harness />);
  return { ...view, probe, onAnnounce, onSaveShortcut, onEscape, onAssignAllChange };
}

const tile = (rowId = 'a') =>
  makeRow({ rowId, description: 'Tile', quantity: '2', unit: 'm2', unitPrice: '10' });

describe('CostLineGrid structure', () => {
  it('shows a table with the row columns and always keeps one blank row at the end', async () => {
    const { probe } = renderGrid([tile()]);
    expect(screen.getByRole('table', { name: 'Lines to add' })).toBeInTheDocument();
    for (const name of ['Description', 'Quantity', 'Unit', 'Unit price', 'Entered as', 'Gross']) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
    }
    await waitFor(() => expect(probe.rows).toHaveLength(2));
    expect(screen.getByTestId('cost-line-grid-description-a')).toHaveValue('Tile');
    expect(screen.getByLabelText('Description, row 1')).toBeInTheDocument();
    expect(screen.getByText(/Paste rows from a spreadsheet/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Assign all to')).not.toBeInTheDocument();
  });

  it('starts from an empty row list', async () => {
    const { probe } = renderGrid([]);
    await waitFor(() => expect(probe.rows).toHaveLength(1));
  });

  it('computes the gross per row and shows a dash while the row is incomplete', () => {
    renderGrid([tile(), makeRow({ rowId: 'b', description: 'Half', quantity: '2' })]);
    expect(screen.getByTestId('cost-line-grid-gross-a')).toHaveTextContent('23.80');
    expect(screen.getByTestId('cost-line-grid-gross-b')).toHaveTextContent('—');
  });

  it('focuses the first description input on mount with autoFocus', () => {
    renderGrid([tile()], { autoFocus: true });
    expect(screen.getByTestId('cost-line-grid-description-a')).toHaveFocus();
  });

  it('renders extra row content, category and funding source selects', async () => {
    const user = userEvent.setup();
    const { probe } = renderGrid([tile()], {
      options: {
        targets: false,
        requireTarget: false,
        positiveGross: false,
        columns: ['category', 'fundingSource'],
      },
      categoryOptions: [{ value: 'c1', label: 'Materials' }],
      sourceOptions: [{ value: 's1', label: 'Savings' }],
      renderRowExtra: (row) => <span>extra-{row.rowId}</span>,
    });
    expect(screen.getByText('extra-a')).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId('cost-line-grid-category-a'), 'c1');
    expect(probe.rows[0]?.budgetCategoryId).toBe('c1');
    await user.selectOptions(screen.getByTestId('cost-line-grid-category-a'), 'None');
    expect(probe.rows[0]?.budgetCategoryId).toBeNull();
    await user.selectOptions(screen.getByTestId('cost-line-grid-source-a'), 's1');
    expect(probe.rows[0]?.budgetSourceId).toBe('s1');
  });

  it('shows an empty funding source option while a row has none', () => {
    renderGrid([makeRow({ rowId: 'a', description: 'x', budgetSourceId: null })], {
      options: {
        targets: false,
        requireTarget: false,
        positiveGross: false,
        columns: ['fundingSource'],
      },
      sourceOptions: [{ value: 's1', label: 'Savings' }],
    });
    expect(
      within(screen.getByTestId('cost-line-grid-source-a')).getAllByRole('option'),
    ).toHaveLength(2);
  });
});

describe('Entered as', () => {
  it('names the toggle by its visible text, has no aria-pressed and flips Net/Gross', async () => {
    const user = userEvent.setup();
    renderGrid([tile()]);
    const toggle = screen.getByTestId('cost-line-grid-entered-a');
    expect(toggle).toHaveTextContent('Net');
    expect(toggle).toHaveAccessibleName('Entered as, row 1: Net');
    expect(toggle).not.toHaveAttribute('aria-pressed');
    await user.click(toggle);
    expect(toggle).toHaveTextContent('Gross');
    expect(toggle).toHaveAccessibleName('Entered as, row 1: Gross');
    expect(toggle).not.toHaveAttribute('aria-pressed');
    expect(screen.getByTestId('cost-line-grid-gross-a')).toHaveTextContent('20.00');
  });

  it('sets every row from Entered as for all and gives new rows the same default', async () => {
    const user = userEvent.setup();
    const { probe } = renderGrid([tile('a'), tile('b')], {
      options: { targets: true, requireTarget: false, positiveGross: false },
    });
    await user.click(screen.getByRole('button', { name: 'Gross' }));
    await waitFor(() =>
      expect(probe.rows.filter((r) => r.includesVat)).toHaveLength(probe.rows.length),
    );
    expect(probe.rows.length).toBeGreaterThanOrEqual(3);
    await user.click(screen.getByRole('button', { name: 'Net' }));
    expect(probe.rows.every((r) => !r.includesVat)).toBe(true);
  });

  it('leaves linked rows alone when setting the mode for all', async () => {
    const user = userEvent.setup();
    const linked = makeRow({
      rowId: 'l',
      unitPrice: '119',
      existingLine: { id: 'e1', type: 'work_item', description: 'Old', gross: 119 },
    });
    const { probe } = renderGrid([linked], {
      options: { targets: true, requireTarget: false, positiveGross: false },
    });
    await user.click(screen.getByRole('button', { name: 'Gross' }));
    expect(probe.rows.find((r) => r.rowId === 'l')?.includesVat).toBe(false);
  });
});

describe('Assign all to', () => {
  it('assigns the picked task to all rows', async () => {
    mockSearchEverywhere.mockResolvedValue({
      groups: [{ type: 'work_item', items: [{ id: 'w1', label: 'Tiling', areaPath: [] }] }],
    });
    const user = userEvent.setup();
    const { onAssignAllChange } = renderGrid([tile()], {
      options: { targets: true, requireTarget: true, positiveGross: false },
    });
    await user.type(screen.getByLabelText('Assign all to'), 'Til');
    await user.click(await screen.findByRole('option', { name: /Tiling/ }));
    expect(onAssignAllChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }));
  });

  it('shows the Assign all to name as the placeholder of rows without a target', () => {
    renderGrid([makeRow({ rowId: 'a', description: 'x', unitPrice: '1' })], {
      options: { targets: true, requireTarget: true, positiveGross: false },
      assignAll: { ...TASK, id: 'w9', label: 'Whole house' },
    });
    expect(screen.getByLabelText('Belongs to, row 1')).toHaveAttribute(
      'placeholder',
      'Whole house',
    );
  });

  it('picks a target for a single row', async () => {
    mockSearchEverywhere.mockResolvedValue({
      groups: [{ type: 'household_item', items: [{ id: 'h1', label: 'Sofa', areaPath: [] }] }],
    });
    const user = userEvent.setup();
    const { probe } = renderGrid([makeRow({ rowId: 'a', description: 'x', unitPrice: '1' })], {
      options: { targets: true, requireTarget: true, positiveGross: false },
    });
    await user.type(screen.getByLabelText('Belongs to, row 1'), 'Sof');
    await user.click(await screen.findByRole('option', { name: /Sofa/ }));
    expect(probe.rows[0]!.target).toMatchObject({ type: 'household_item', id: 'h1' });
  });

  it('shows the target name of a linked row', () => {
    renderGrid(
      [
        makeRow({
          rowId: 'l',
          unitPrice: '5',
          target: TASK,
          existingLine: { id: 'e1', type: 'work_item', description: 'Old', gross: 5 },
        }),
      ],
      { options: { targets: true, requireTarget: true, positiveGross: false } },
    );
    expect(screen.getByText('Tiling')).toBeInTheDocument();
  });
});

describe('validation display', () => {
  it('shows an error only after the cell is blurred', async () => {
    const user = userEvent.setup();
    renderGrid([makeRow({ rowId: 'a', description: 'x', unitPrice: '' })]);
    expect(screen.queryByText(/Enter a unit price/)).not.toBeInTheDocument();
    const price = screen.getByTestId('cost-line-grid-unitPrice-a');
    await user.click(price);
    await user.tab();
    const message = await screen.findByText('Error: Enter a unit price of 0 or more.');
    expect(price).toHaveAttribute('aria-invalid', 'true');
    expect(price.getAttribute('aria-describedby')).toBe(message.id);
  });

  it('shows every error after a failed save attempt', () => {
    renderGrid([makeRow({ rowId: 'a', description: 'x', unitPrice: '' })], {
      showAllErrors: true,
      options: { targets: true, requireTarget: true, positiveGross: false },
    });
    expect(screen.getByText('Error: Enter a unit price of 0 or more.')).toBeInTheDocument();
    expect(screen.getByText('Error: Pick a task or purchase.')).toBeInTheDocument();
    expect(screen.getByLabelText('Belongs to, row 1')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows server errors per cell', () => {
    const serverErrors = new Map<string, CostLineGridRowErrors>([
      ['a', { description: 'Server says no', target: 'No target' }],
    ]);
    renderGrid([tile()], {
      serverErrors,
      options: { targets: true, requireTarget: false, positiveGross: false },
    });
    expect(screen.getByText('Error: Server says no')).toBeInTheDocument();
    expect(screen.getByText('Error: No target')).toBeInTheDocument();
  });
});

describe('keyboard', () => {
  it('Enter goes to the same column of the next existing row', async () => {
    const user = userEvent.setup();
    renderGrid([tile('a'), tile('b')]);
    await user.click(screen.getByTestId('cost-line-grid-quantity-a'));
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('cost-line-grid-quantity-b')).toHaveFocus();
  });

  it('Enter on the last row adds a row and focuses the same column of it', async () => {
    const user = userEvent.setup();
    const { probe } = renderGrid([tile('a')]);
    await waitFor(() => expect(probe.rows).toHaveLength(2));
    const before = probe.rows.length;
    await user.click(screen.getByTestId(`cost-line-grid-quantity-${probe.rows[1]!.rowId}`));
    await user.keyboard('{Enter}');
    expect(probe.rows.length).toBe(before + 1);
    expect(
      screen.getByTestId(`cost-line-grid-quantity-${probe.rows[before]!.rowId}`),
    ).toHaveFocus();
  });

  it('Shift+Enter and the vertical arrows move to existing rows', async () => {
    const user = userEvent.setup();
    renderGrid([tile('a'), tile('b')]);
    await user.click(screen.getByTestId('cost-line-grid-unit-b'));
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(screen.getByTestId('cost-line-grid-unit-a')).toHaveFocus();
  });

  it('Shift+Enter on the first row and ArrowRight do nothing', async () => {
    const user = userEvent.setup();
    renderGrid([tile('a'), tile('b')]);
    await user.click(screen.getByTestId('cost-line-grid-unit-a'));
    await user.keyboard('{Shift>}{Enter}{/Shift}{ArrowUp}{ArrowRight}');
    expect(screen.getByTestId('cost-line-grid-unit-a')).toHaveFocus();
  });

  it('ArrowDown on the last row does not add a row', async () => {
    const user = userEvent.setup();
    const { probe } = renderGrid([tile('a')]);
    await waitFor(() => expect(probe.rows).toHaveLength(2));
    await user.click(screen.getByTestId(`cost-line-grid-unit-${probe.rows[1]!.rowId}`));
    await user.keyboard('{ArrowDown}');
    expect(probe.rows).toHaveLength(2);
  });

  it('Tab from the last control of the last row adds a row and enters its description', async () => {
    const user = userEvent.setup();
    const { probe } = renderGrid([tile('a')]);
    await waitFor(() => expect(probe.rows).toHaveLength(2));
    const lastId = probe.rows[1]!.rowId;
    act(() => screen.getByTestId(`cost-line-grid-remove-${lastId}`).focus());
    await user.tab();
    expect(probe.rows).toHaveLength(3);
    expect(screen.getByTestId(`cost-line-grid-description-${probe.rows[2]!.rowId}`)).toHaveFocus();
  });

  it('Tab elsewhere keeps its native behaviour', async () => {
    const user = userEvent.setup();
    const { probe } = renderGrid([tile('a')]);
    await waitFor(() => expect(probe.rows).toHaveLength(2));
    await user.click(screen.getByTestId('cost-line-grid-description-a'));
    await user.tab();
    expect(screen.getByTestId('cost-line-grid-quantity-a')).toHaveFocus();
    expect(probe.rows).toHaveLength(2);
  });

  it('Ctrl+D duplicates the row below it and selects its description', async () => {
    const user = userEvent.setup();
    const { probe } = renderGrid([tile('a'), tile('b')]);
    await user.click(screen.getByTestId('cost-line-grid-description-a'));
    await user.keyboard('{Control>}d{/Control}');
    expect(probe.rows[1]).toMatchObject({ description: 'Tile', quantity: '2' });
    expect(probe.rows[1]!.rowId).not.toBe('a');
    expect(screen.getByTestId(`cost-line-grid-description-${probe.rows[1]!.rowId}`)).toHaveFocus();
  });

  it('Cmd+D duplicates too and the visible Duplicate button does the same', async () => {
    const user = userEvent.setup();
    const { probe } = renderGrid([tile('a')]);
    await user.click(screen.getByTestId('cost-line-grid-description-a'));
    await user.keyboard('{Meta>}d{/Meta}');
    expect(probe.rows.filter((r) => r.description === 'Tile')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Duplicate row 1' }));
    expect(probe.rows.filter((r) => r.description === 'Tile')).toHaveLength(3);
  });

  it('Ctrl+Backspace removes an empty row but not a filled one', async () => {
    const user = userEvent.setup();
    const { probe, onAnnounce } = renderGrid([
      tile('a'),
      makeRow({ rowId: 'e' }),
      makeRow({ rowId: 'f', description: 'Keep' }),
    ]);
    await user.click(screen.getByTestId('cost-line-grid-description-a'));
    await user.keyboard('{Control>}{Backspace}{/Control}');
    expect(probe.rows.some((r) => r.rowId === 'a')).toBe(true);
    await user.click(screen.getByTestId('cost-line-grid-description-e'));
    await user.keyboard('{Control>}{Backspace}{/Control}');
    expect(probe.rows.some((r) => r.rowId === 'e')).toBe(false);
    expect(onAnnounce).toHaveBeenCalledWith('Row 2 removed.');
  });

  it('Ctrl+S and Ctrl+Enter save and Escape reports to the host', async () => {
    const user = userEvent.setup();
    const { onSaveShortcut, onEscape } = renderGrid([tile('a')]);
    await user.click(screen.getByTestId('cost-line-grid-description-a'));
    await user.keyboard('{Control>}s{/Control}');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSaveShortcut).toHaveBeenCalledTimes(2);
    await user.keyboard('{Escape}');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('works without optional host callbacks', async () => {
    const user = userEvent.setup();
    renderGrid([tile('a')], { onSaveShortcut: undefined, onEscape: undefined });
    await user.click(screen.getByTestId('cost-line-grid-description-a'));
    await user.keyboard('{Control>}s{/Control}{Escape}');
    expect(screen.getByTestId('cost-line-grid-description-a')).toBeInTheDocument();
  });

  it('ignores keys already handled by an inner control', () => {
    const { onEscape } = renderGrid([tile('a')]);
    const input = screen.getByTestId('cost-line-grid-description-a');
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    event.preventDefault();
    act(() => {
      input.dispatchEvent(event);
    });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('keeps Enter native in selects and only handles Escape there', async () => {
    const user = userEvent.setup();
    const { onEscape } = renderGrid([tile('a'), tile('b')], {
      options: {
        targets: false,
        requireTarget: false,
        positiveGross: false,
        columns: ['category'],
      },
      categoryOptions: [{ value: 'c1', label: 'Materials' }],
    });
    act(() => screen.getByTestId('cost-line-grid-category-a').focus());
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('cost-line-grid-category-a')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onEscape).toHaveBeenCalled();
  });

  it('ignores key events that do not come from a cell of its own table', () => {
    const { onSaveShortcut } = renderGrid([tile('a')]);
    const table = screen.getByTestId('cost-line-grid-table');
    fireEvent.keyDown(table, { key: 's', ctrlKey: true });
    expect(onSaveShortcut).not.toHaveBeenCalled();
  });
});

describe('removing rows', () => {
  it('removes a row at once, announces it and offers Undo that restores it in place', async () => {
    const user = userEvent.setup();
    const { probe, onAnnounce } = renderGrid([tile('a'), tile('b')]);
    await user.click(screen.getByRole('button', { name: 'Remove row 1' }));
    expect(probe.rows.map((r) => r.rowId)).not.toContain('a');
    expect(screen.queryByTestId('cost-line-grid-row-a')).not.toBeInTheDocument();
    expect(onAnnounce).toHaveBeenCalledWith('Row 1 removed.');
    expect(screen.getByTestId('cost-line-grid-description-b')).toHaveFocus();
    expect(mockShowUndoToast).toHaveBeenCalledTimes(1);
    const toast = mockShowUndoToast.mock.calls[0]![0];
    expect(toast.message).toBe('Row 1 removed.');
    await act(async () => {
      await toast.onUndo();
    });
    expect(probe.rows[0]?.rowId).toBe('a');
    expect(screen.getByTestId('cost-line-grid-description-a')).toHaveFocus();
  });

  it('disables Remove on the only row', async () => {
    const user = userEvent.setup();
    const { probe } = renderGrid([makeRow({ rowId: 'a' })]);
    const remove = screen.getByTestId('cost-line-grid-remove-a');
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    await user.click(remove);
    expect(mockShowUndoToast).not.toHaveBeenCalled();
    expect(probe.rows).toHaveLength(1);
  });

  it('removes the last typed row and keeps a trailing blank row', async () => {
    const user = userEvent.setup();
    const { probe } = renderGrid([tile('a')]);
    await waitFor(() => expect(probe.rows).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'Remove row 1' }));
    expect(probe.rows).toHaveLength(1);
    expect(probe.rows[0]!.description).toBe('');
  });
});

describe('paste', () => {
  async function pasteInto(testId: string, text: string) {
    const user = userEvent.setup();
    await user.click(screen.getByTestId(testId));
    await user.paste(text);
    return user;
  }

  it('does not intercept a single value', async () => {
    const { probe } = renderGrid([makeRow({ rowId: 'a' })]);
    await pasteInto('cost-line-grid-description-a', 'Just text');
    expect(probe.rows[0]!.description).toBe('Just text');
  });

  it('inserts 4-column rows at a blank row without a dialog and announces it', async () => {
    const { probe, onAnnounce } = renderGrid([makeRow({ rowId: 'a' })]);
    const text = 'Tile\t2\tm2\t10.5\nGlue\t1\tkg\t3';
    await pasteInto('cost-line-grid-description-a', text);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(probe.rows.slice(0, 2)).toMatchObject([
      { description: 'Tile', quantity: '2', unit: 'm2', unitPrice: '10.5' },
      { description: 'Glue', quantity: '1', unit: 'kg', unitPrice: '3' },
    ]);
    expect(probe.rows[2]!.description).toBe('');
    expect(onAnnounce).toHaveBeenCalledWith('Pasted 2 rows. None need attention.');
  });

  it('inserts 2-column rows after a filled row', async () => {
    const { probe } = renderGrid([tile('a'), tile('z')]);
    await pasteInto('cost-line-grid-description-a', 'Paint\t80');
    expect(probe.rows.map((r) => r.description).slice(0, 3)).toEqual(['Tile', 'Paint', 'Tile']);
    expect(probe.rows[1]).toMatchObject({ quantity: '', unitPrice: '80' });
  });

  it('inserts 50 rows without a dialog', async () => {
    const { probe } = renderGrid([makeRow({ rowId: 'a' })]);
    const text = Array.from({ length: 50 }, (_v, i) => `Item ${i + 1}\t${i + 1}`).join('\n');
    await pasteInto('cost-line-grid-description-a', text);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(probe.rows.filter((r) => r.description.startsWith('Item'))).toHaveLength(50);
  });

  it('opens the mapping preview for 3 columns and inserts the mapped rows', async () => {
    const { probe, onAnnounce } = renderGrid([makeRow({ rowId: 'a' })]);
    const user = await pasteInto('cost-line-grid-description-a', 'Tile\t2\t10\nGlue\t1\t3');
    const dialog = await screen.findByRole('dialog', { name: 'Check pasted rows' });
    expect(within(dialog).getByTestId('paste-preview-status')).toHaveTextContent(
      '2 rows, 0 problems',
    );
    await user.click(within(dialog).getByTestId('paste-preview-insert'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(probe.rows[0]).toMatchObject({ description: 'Tile', quantity: '2', unitPrice: '10' });
    expect(onAnnounce).toHaveBeenCalledWith('Pasted 2 rows. None need attention.');
  });

  it('cancelling the preview inserts nothing', async () => {
    const { probe } = renderGrid([makeRow({ rowId: 'a' })]);
    const user = await pasteInto('cost-line-grid-description-a', 'Tile\t2\t10');
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(probe.rows[0]!.description).toBe('');
  });

  it('flags an ambiguous number after inserting and clears the flag when it is edited', async () => {
    const { probe, onAnnounce } = renderGrid([makeRow({ rowId: 'a' })]);
    const user = await pasteInto('cost-line-grid-description-a', 'Tile\t1.234');
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByTestId('paste-preview-insert'));
    expect(onAnnounce).toHaveBeenCalledWith('Pasted 1 row. 1 row needs attention.');
    expect(
      await screen.findByText('Error: Check this number: it can be read two ways.'),
    ).toBeInTheDocument();
    const price = screen.getByTestId(`cost-line-grid-unitPrice-${probe.rows[0]!.rowId}`);
    await user.clear(price);
    await user.type(price, '1234');
    expect(screen.queryByText(/it can be read two ways/)).not.toBeInTheDocument();
  });

  it('refuses more than 200 rows with an error above the table', async () => {
    const { probe } = renderGrid([makeRow({ rowId: 'a' })]);
    const text = Array.from({ length: 201 }, (_v, i) => `Item ${i}\t1`).join('\n');
    await pasteInto('cost-line-grid-description-a', text);
    expect(screen.getByText('Paste at most 200 rows at a time.')).toBeInTheDocument();
    expect(probe.rows[0]!.description).toBe('');
  });

  it('ignores a paste that has no content rows and clears an earlier error', async () => {
    const { probe } = renderGrid([makeRow({ rowId: 'a' })]);
    const big = Array.from({ length: 201 }, (_v, i) => `Item ${i}\t1`).join('\n');
    const user = await pasteInto('cost-line-grid-description-a', big);
    expect(screen.getByText('Paste at most 200 rows at a time.')).toBeInTheDocument();
    await user.click(screen.getByTestId('cost-line-grid-description-a'));
    await user.paste('\t\n\t');
    expect(screen.queryByText('Paste at most 200 rows at a time.')).not.toBeInTheDocument();
    expect(probe.rows[0]!.description).toBe('');
  });

  it('keeps decimal commas out of the stored text under the English locale', async () => {
    const { probe } = renderGrid([makeRow({ rowId: 'a' })]);
    await pasteInto('cost-line-grid-description-a', 'Tile\t10,5');
    expect(probe.rows[0]!.unitPrice).toBe('10.5');
  });
});

describe('existing cost lines', () => {
  const options = {
    targets: true,
    requireTarget: true,
    positiveGross: true,
    existingLines: true,
  };
  const line = (id: string, description: string | null, plannedAmount: number) => ({
    id,
    description,
    plannedAmount,
    includesVat: true,
    invoiceLink: null,
  });

  it('asks to pick a target first when the row has none', async () => {
    const user = userEvent.setup();
    renderGrid([tile('a')], { options });
    await user.click(screen.getByRole('button', { name: /Use an existing cost line…, Row 1/ }));
    expect(
      await screen.findByText('Pick a task or purchase in this row first.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('links a line of the row target and lets the user go back to a new line', async () => {
    mockFetchWorkItemBudgets.mockResolvedValue([
      line('e1', 'Old tiles', 119),
      line('e2', null, 50),
    ]);
    const user = userEvent.setup();
    const { probe } = renderGrid([makeRow({ rowId: 'a', description: 'x', target: TASK })], {
      options,
    });
    await user.click(screen.getByTestId('cost-line-grid-use-existing-a'));
    const dialog = await screen.findByRole('dialog', { name: 'Use an existing cost line' });
    expect(await within(dialog).findByText('Old tiles')).toBeInTheDocument();
    expect(within(dialog).getByText('Line without a description')).toBeInTheDocument();
    await user.click(within(dialog).getByTestId('cost-line-existing-use-e1'));
    expect(probe.rows[0]).toMatchObject({
      existingLine: { id: 'e1', type: 'work_item', gross: 119 },
      unitPrice: '119',
      quantity: '',
    });
    expect(screen.getByText('Links Old tiles')).toBeInTheDocument();
    expect(screen.queryByTestId('cost-line-grid-use-existing-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cost-line-grid-entered-a')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('cost-line-grid-clear-existing-a'));
    expect(probe.rows[0]!.existingLine).toBeNull();
    expect(screen.getByTestId('cost-line-grid-description-a')).toBeInTheDocument();
  });

  it('hides lines other rows already use, uses the Assign all to target and lists household lines', async () => {
    mockFetchHouseholdItemBudgets.mockResolvedValue([
      line('h1', 'Sofa', 300),
      line('h2', 'Rug', 80),
    ]);
    const user = userEvent.setup();
    renderGrid(
      [
        makeRow({
          rowId: 'taken',
          unitPrice: '300',
          existingLine: { id: 'h1', type: 'household_item', description: 'Sofa', gross: 300 },
        }),
        makeRow({ rowId: 'a', description: 'x' }),
      ],
      {
        options,
        assignAll: { type: 'household_item', id: 'hi1', label: 'Living room', area: null },
      },
    );
    await user.click(screen.getByTestId('cost-line-grid-use-existing-a'));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Rug')).toBeInTheDocument();
    expect(within(dialog).queryByText('Sofa')).not.toBeInTheDocument();
  });

  it('says so when the target has no unlinked lines or loading fails', async () => {
    mockFetchWorkItemBudgets.mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderGrid([makeRow({ rowId: 'a', description: 'x', target: TASK })], { options });
    await user.click(screen.getByTestId('cost-line-grid-use-existing-a'));
    expect(
      await screen.findByText('Tiling has no lines without an offer or invoice.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    mockFetchWorkItemBudgets.mockRejectedValueOnce(new Error('boom'));
    await user.click(screen.getByTestId('cost-line-grid-use-existing-a'));
    expect(await screen.findByText('The cost lines could not be loaded.')).toBeInTheDocument();
  });
});

describe('linked rows: inert select checkbox and unlinking', () => {
  const linkedRow = (rowId = 'l') =>
    makeRow({
      rowId,
      unitPrice: '5',
      existingLine: { id: 'e1', type: 'work_item', description: 'Old tiles', gross: 5 },
    });
  const selectOptions = {
    targets: false,
    requireTarget: false,
    positiveGross: false,
    select: true,
  };

  it('keeps the select box of a linked row inert and points it at the reason', async () => {
    const user = userEvent.setup();
    const onToggleSelect = jest.fn<(rowId: string) => void>();
    renderGrid([linkedRow()], {
      options: selectOptions,
      selectedRowIds: new Set(['l']),
      onToggleSelect,
      selectLinkedReason: 'Linked lines cannot be merged.',
    });
    const box = screen.getByTestId('cost-line-grid-select-l') as HTMLInputElement;
    expect(box).toHaveAttribute('aria-disabled', 'true');
    expect(box.className).toMatch(/checkDisabled/);
    expect(box.checked).toBe(false);
    // The click is prevented (fireEvent returns false when the default was cancelled). jsdom
    // still flips a controlled checkbox's live `checked` after a cancelled click, so the stable
    // proofs are the cancelled default, the unchanged selection and the unchecked render.
    expect(fireEvent.click(box)).toBe(false);
    await user.click(box);
    expect(onToggleSelect).not.toHaveBeenCalled();
    const reasonId = box.getAttribute('aria-describedby');
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId!)).toHaveTextContent('Linked lines cannot be merged.');
    expect(box).toHaveAccessibleDescription('Linked lines cannot be merged.');
  });

  it('leaves out the description reference when no reason is given', async () => {
    const user = userEvent.setup();
    const onToggleSelect = jest.fn<(rowId: string) => void>();
    renderGrid([linkedRow()], { options: selectOptions, onToggleSelect });
    const box = screen.getByTestId('cost-line-grid-select-l') as HTMLInputElement;
    expect(box).toHaveAttribute('aria-disabled', 'true');
    expect(box).not.toHaveAttribute('aria-describedby');
    expect(box.checked).toBe(false);
    expect(fireEvent.click(box)).toBe(false);
    await user.click(box);
    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it('still lets an unlinked row be selected next to a linked one', async () => {
    const user = userEvent.setup();
    const onToggleSelect = jest.fn<(rowId: string) => void>();
    renderGrid([tile('a'), linkedRow()], { options: selectOptions, onToggleSelect });
    await user.click(screen.getByTestId('cost-line-grid-select-l'));
    await user.click(screen.getByTestId('cost-line-grid-select-a'));
    expect(onToggleSelect.mock.calls).toEqual([['a']]);
  });

  it('restores quantity, unit and price when unlinking a line that replaced them', async () => {
    mockFetchWorkItemBudgets.mockResolvedValue([
      {
        id: 'e1',
        description: 'Old tiles',
        plannedAmount: 119,
        includesVat: true,
        invoiceLink: null,
      },
    ]);
    const user = userEvent.setup();
    const { probe } = renderGrid(
      [
        makeRow({
          rowId: 'a',
          description: 'Tile',
          quantity: '3',
          unit: 'm2',
          unitPrice: '7',
          target: TASK,
        }),
      ],
      { options: { targets: true, requireTarget: true, positiveGross: true, existingLines: true } },
    );
    await user.click(screen.getByTestId('cost-line-grid-use-existing-a'));
    const dialog = await screen.findByRole('dialog', { name: 'Use an existing cost line' });
    await user.click(await within(dialog).findByTestId('cost-line-existing-use-e1'));
    expect(probe.rows[0]).toMatchObject({ quantity: '', unit: '', unitPrice: '119' });
    await user.click(screen.getByTestId('cost-line-grid-clear-existing-a'));
    expect(probe.rows[0]).toMatchObject({
      existingLine: null,
      quantity: '3',
      unit: 'm2',
      unitPrice: '7',
    });
    expect(screen.getByTestId('cost-line-grid-description-a')).toHaveFocus();
  });

  it('falls back to blanks when nothing was remembered for the row', async () => {
    const user = userEvent.setup();
    const { probe } = renderGrid([linkedRow()]);
    await user.click(screen.getByTestId('cost-line-grid-clear-existing-l'));
    expect(probe.rows[0]).toMatchObject({
      existingLine: null,
      quantity: '',
      unit: '',
      unitPrice: '',
    });
    expect(screen.getByTestId('cost-line-grid-description-l')).toHaveFocus();
  });
});

describe('Split with AI row features', () => {
  it('shows Include and select checkboxes per row', async () => {
    const user = userEvent.setup();
    const onToggleSelect = jest.fn<(rowId: string) => void>();
    const { probe } = renderGrid([tile('a')], {
      options: {
        targets: false,
        requireTarget: false,
        positiveGross: false,
        include: true,
        select: true,
      },
      selectedRowIds: new Set(['a']),
      onToggleSelect,
    });
    expect(screen.getByRole('columnheader', { name: 'Include' })).toBeInTheDocument();
    expect(screen.getByTestId('cost-line-grid-select-a')).toBeChecked();
    await user.click(screen.getByTestId('cost-line-grid-select-a'));
    expect(onToggleSelect).toHaveBeenCalledWith('a');
    await user.click(screen.getByTestId('cost-line-grid-include-a'));
    expect(probe.rows[0]!.included).toBe(false);
  });

  it('tolerates a missing selection set', () => {
    renderGrid([tile('a')], {
      options: { targets: false, requireTarget: false, positiveGross: false, select: true },
    });
    expect(screen.getByTestId('cost-line-grid-select-a')).not.toBeChecked();
  });

  it('shows notice rows instead of inputs, with actions and the alert role for errors', async () => {
    const user = userEvent.setup();
    const onNoticeAction = jest.fn<(rowId: string, actionId: string) => void>();
    renderGrid(
      [
        makeRow({ rowId: 'n1', notice: { tone: 'busy', text: 'Merging…' } }),
        makeRow({
          rowId: 'n2',
          notice: {
            tone: 'error',
            text: 'Merge failed',
            actions: [{ id: 'retry', label: 'Try again' }],
          },
        }),
      ],
      { onNoticeAction },
    );
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Merging…');
    expect(screen.getByRole('alert')).toHaveTextContent('Merge failed');
    expect(screen.queryByTestId('cost-line-grid-description-n1')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onNoticeAction).toHaveBeenCalledWith('n2', 'retry');
  });

  it('survives a notice action without a host handler', async () => {
    const user = userEvent.setup();
    renderGrid([
      makeRow({
        rowId: 'n2',
        notice: { tone: 'error', text: 'x', actions: [{ id: 'undo', label: 'Undo merge' }] },
      }),
    ]);
    await user.click(screen.getByRole('button', { name: 'Undo merge' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('footer for document hosts', () => {
  it('shows the total and what is not yet split', () => {
    renderGrid([tile('a')], { remainingAmount: 100 });
    expect(screen.getByTestId('cost-line-grid-total')).toHaveTextContent('23.80');
    expect(screen.getByTestId('cost-line-grid-remainder')).toHaveTextContent(
      'Not yet split · €76.20',
    );
  });

  it('says how much the lines are over', () => {
    renderGrid([tile('a')], { remainingAmount: 10 });
    expect(screen.getByTestId('cost-line-grid-remainder')).toHaveTextContent(
      'Lines are €13.80 over',
    );
  });

  it('shows no remainder row when the lines match exactly and skips incomplete rows', () => {
    renderGrid(
      [
        makeRow({ rowId: 'a', description: 'x', unitPrice: '100', includesVat: true }),
        makeRow({ rowId: 'b', description: 'incomplete', unitPrice: '' }),
      ],
      { remainingAmount: 100 },
    );
    expect(screen.queryByTestId('cost-line-grid-remainder')).not.toBeInTheDocument();
    expect(screen.getByTestId('cost-line-grid-total')).toHaveTextContent('100.00');
  });

  it('has no footer without a remaining amount', () => {
    renderGrid([tile('a')]);
    expect(screen.queryByTestId('cost-line-grid-total')).not.toBeInTheDocument();
  });
});

describe('more keyboard and cell paths', () => {
  it('Tab on a control that is not the last of the last row keeps its native behaviour', async () => {
    const user = userEvent.setup();
    const { probe } = renderGrid([tile('a')]);
    await waitFor(() => expect(probe.rows).toHaveLength(2));
    const lastId = probe.rows[1]!.rowId;
    await user.click(screen.getByTestId(`cost-line-grid-description-${lastId}`));
    await user.tab();
    expect(probe.rows).toHaveLength(2);
    expect(screen.getByTestId(`cost-line-grid-quantity-${lastId}`)).toHaveFocus();
  });

  it('ignores an Escape that an inner control already handled', () => {
    const { onEscape } = renderGrid([tile('a')]);
    const input = screen.getByTestId('cost-line-grid-description-a');
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    markEscapeHandled(event);
    act(() => {
      input.dispatchEvent(event);
    });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('ignores keys from the portaled list of the row target picker', async () => {
    mockSearchEverywhere.mockResolvedValue({
      groups: [{ type: 'work_item', items: [{ id: 'w1', label: 'Tiling', areaPath: [] }] }],
    });
    const user = userEvent.setup();
    const { onSaveShortcut } = renderGrid([tile('a')], {
      options: { targets: true, requireTarget: false, positiveGross: false },
    });
    await user.type(screen.getByLabelText('Belongs to, row 1'), 'Til');
    const option = await screen.findByRole('option', { name: /Tiling/ });
    fireEvent.keyDown(option, { key: 's', ctrlKey: true });
    expect(onSaveShortcut).not.toHaveBeenCalled();
  });

  it('falls back to the first control of a row that lacks the column once the grid renders', async () => {
    const user = userEvent.setup();
    renderGrid([
      tile('a'),
      makeRow({
        rowId: 'l',
        unitPrice: '5',
        existingLine: { id: 'e1', type: 'work_item', description: 'Old', gross: 5 },
      }),
    ]);
    await user.click(screen.getByTestId('cost-line-grid-quantity-a'));
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('cost-line-grid-clear-existing-l')).toHaveFocus();
  });

  it('lets the select checkbox be clicked without a host handler', async () => {
    const user = userEvent.setup();
    renderGrid([tile('a')], {
      options: { targets: false, requireTarget: false, positiveGross: false, select: true },
    });
    await user.click(screen.getByTestId('cost-line-grid-select-a'));
    expect(screen.getByTestId('cost-line-grid-select-a')).not.toBeChecked();
  });

  it('names a linked line without a description', () => {
    renderGrid([
      makeRow({
        rowId: 'l',
        unitPrice: '5',
        existingLine: { id: 'e1', type: 'work_item', description: null, gross: 5 },
      }),
    ]);
    expect(screen.getByText('Links Line without a description')).toBeInTheDocument();
  });

  it('parses and keeps German numbers under the German locale', async () => {
    localeState.resolved = 'de';
    const { probe } = renderGrid([makeRow({ rowId: 'a' })]);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('cost-line-grid-description-a'));
    await user.paste('Fliese\t2\tm2\t1.234,5');
    expect(probe.rows[0]).toMatchObject({ quantity: '2', unitPrice: '1234,5' });
  });

  it('shows a source select option set that always includes the current empty value', async () => {
    const user = userEvent.setup();
    const { probe } = renderGrid(
      [makeRow({ rowId: 'a', description: 'x', budgetSourceId: null })],
      {
        options: {
          targets: false,
          requireTarget: false,
          positiveGross: false,
          columns: ['fundingSource'],
        },
        sourceOptions: [{ value: 's1', label: 'Savings' }],
      },
    );
    await user.selectOptions(screen.getByTestId('cost-line-grid-source-a'), 's1');
    expect(probe.rows[0]!.budgetSourceId).toBe('s1');
  });
});

describe('refs and test id prefix', () => {
  it('hands the first description input to the host and honours testIdPrefix', () => {
    const ref = { current: null as HTMLInputElement | null };
    renderGrid([tile('a')], { firstDescriptionRef: ref, testIdPrefix: 'my-grid' });
    expect(ref.current).toBe(screen.getByTestId('my-grid-description-a'));
  });
});

describe('guards that stay reachable', () => {
  const linked = (rowId: string) =>
    makeRow({
      rowId,
      unitPrice: '5',
      existingLine: { id: `e-${rowId}`, type: 'work_item', description: 'Old', gross: 5 },
    });

  it('does not throw on mount with autoFocus when the first row has no description input', () => {
    renderGrid([linked('l')], { autoFocus: true });
    expect(screen.queryByTestId('cost-line-grid-description-l')).not.toBeInTheDocument();
    expect(screen.getByTestId('cost-line-grid')).toBeInTheDocument();
  });

  it('does not throw on mount with autoFocus when the first row is a notice row', () => {
    renderGrid([makeRow({ rowId: 'n', notice: { tone: 'busy', text: 'Working…' } })], {
      autoFocus: true,
    });
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Working…');
  });

  it('keeps the only row when Ctrl+Backspace is pressed on it', async () => {
    const user = userEvent.setup();
    const noop = jest.fn();
    renderGrid([makeRow({ rowId: 'only' })], { onRowsChange: noop });
    await user.click(screen.getByTestId('cost-line-grid-description-only'));
    await user.keyboard('{Control>}{Backspace}{/Control}');
    expect(mockShowUndoToast).not.toHaveBeenCalled();
    expect(screen.getByTestId('cost-line-grid-description-only')).toBeInTheDocument();
  });

  it('ignores a focus request for a row that is gone by the time the grid renders', async () => {
    const user = userEvent.setup();
    // The host drops the row the Tab key asked for.
    renderGrid([tile('a')], { onRowsChange: jest.fn() });
    const row = screen.getByTestId('cost-line-grid-quantity-a').closest('tr')!;
    const controls = Array.from(
      row.querySelectorAll<HTMLElement>('input:not([type="checkbox"]), select, button'),
    );
    controls[controls.length - 1]!.focus();
    await user.keyboard('{Tab}');
    // Any later render applies the pending focus; its row does not exist, so nothing moves.
    fireEvent.blur(screen.getByTestId('cost-line-grid-quantity-a'));
    expect(screen.getByTestId('cost-line-grid')).toBeInTheDocument();
  });

  it('leaves focus alone when Enter lands on a notice row without any control', async () => {
    const user = userEvent.setup();
    renderGrid([tile('a'), makeRow({ rowId: 'n', notice: { tone: 'busy', text: 'Merging…' } })]);
    await user.click(screen.getByTestId('cost-line-grid-quantity-a'));
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('cost-line-grid-quantity-a')).toHaveFocus();
  });

  it('moves focus to the action of a notice row that has one', async () => {
    const user = userEvent.setup();
    renderGrid([
      tile('a'),
      makeRow({
        rowId: 'n',
        notice: { tone: 'error', text: 'Failed', actions: [{ id: 'retry', label: 'Try again' }] },
      }),
    ]);
    await user.click(screen.getByTestId('cost-line-grid-quantity-a'));
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus();
  });

  it('ignores keys pressed on a notice row button', async () => {
    const user = userEvent.setup();
    const { onSaveShortcut } = renderGrid([
      makeRow({
        rowId: 'n',
        notice: { tone: 'error', text: 'Failed', actions: [{ id: 'retry', label: 'Try again' }] },
      }),
    ]);
    screen.getByRole('button', { name: 'Try again' }).focus();
    await user.keyboard('{Control>}s{/Control}');
    expect(onSaveShortcut).not.toHaveBeenCalled();
  });
});
