/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type * as RowModule from './CostLineGridRow.js';
import type * as ModelModule from './costLineGridModel.js';
import type { CostLineGridOptions, CostLineGridRow } from './types.js';

// ─── Module boundaries ───────────────────────────────────────────────────────

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    resolvedLocale: 'en',
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

const mockSearchEverywhere = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/searchApi.js', () => ({
  searchEverywhere: mockSearchEverywhere,
}));

let CostLineGridRowView: typeof RowModule.CostLineGridRowView;
let blankGridRow: typeof ModelModule.blankGridRow;

beforeEach(async () => {
  jest.clearAllMocks();
  installMatchMedia({ '(min-width: 768px)': true });
  mockSearchEverywhere.mockResolvedValue({ groups: [] });
  ({ CostLineGridRowView } = await import('./CostLineGridRow.js'));
  ({ blankGridRow } = await import('./costLineGridModel.js'));
});

// ─── Harness ─────────────────────────────────────────────────────────────────

const TASK = { type: 'work_item' as const, id: 'w1', label: 'Tiling', area: null };
const BASE_OPTIONS: CostLineGridOptions = {
  targets: false,
  requireTarget: false,
  positiveGross: false,
};
const CATEGORIES = [
  { value: 'cat1', label: 'Materials' },
  { value: 'cat2', label: 'Labor' },
];
const SOURCES = [
  { value: 'src1', label: 'Savings' },
  { value: 'src2', label: 'Loan' },
];
const EXISTING = {
  id: 'bl-9',
  type: 'work_item' as const,
  description: 'Oak flooring',
  gross: 595,
};

function makeRow(over: Partial<CostLineGridRow> = {}): CostLineGridRow {
  return { ...blankGridRow('r1'), description: 'Tile', unitPrice: '10', ...over };
}

type RowProps = Parameters<typeof RowModule.CostLineGridRowView>[0];

function renderRow(over: Partial<RowProps> = {}, wrap: (node: ReactNode) => ReactNode = (n) => n) {
  const handlers = {
    onChange: jest.fn<RowProps['onChange']>(),
    onBlurField: jest.fn<RowProps['onBlurField']>(),
    onDuplicate: jest.fn<RowProps['onDuplicate']>(),
    onRemove: jest.fn<RowProps['onRemove']>(),
    onUseExisting: jest.fn<RowProps['onUseExisting']>(),
    onPaste: jest.fn<RowProps['onPaste']>(),
    onToggleSelect: jest.fn<NonNullable<RowProps['onToggleSelect']>>(),
    onClearExisting: jest.fn<RowProps['onClearExisting']>(),
    onNoticeAction: jest.fn<NonNullable<RowProps['onNoticeAction']>>(),
  };
  const props: RowProps = {
    row: makeRow(),
    index: 2,
    prefix: 'g',
    options: BASE_OPTIONS,
    categoryOptions: CATEGORIES,
    sourceOptions: SOURCES,
    assignAll: null,
    errors: {},
    ambiguous: new Set<string>(),
    gross: 10,
    selected: false,
    canRemove: true,
    ...handlers,
    ...over,
  };
  const view = render(
    <table>
      <tbody>{wrap(<CostLineGridRowView {...props} />)}</tbody>
    </table>,
  );
  return { ...view, ...handlers };
}

describe('CostLineGridRowView normal row', () => {
  it('shows the row number, editable inputs named by column and row, and the gross', () => {
    renderRow();
    expect(screen.getByTestId('g-row-r1')).toHaveAttribute('data-row', 'r1');
    expect(screen.getByLabelText('Description, row 3')).toHaveValue('Tile');
    expect(screen.getByLabelText('Quantity, row 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Unit, row 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Unit price, row 3')).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByLabelText('Description, row 3')).not.toHaveAttribute('inputmode');
    expect(screen.getByTestId('g-gross-r1')).toHaveTextContent('€10.00');
    expect(screen.getByText('3')).toHaveAttribute('aria-hidden', 'true');
  });

  it('reports typed text, blur and paste per field', async () => {
    const user = userEvent.setup();
    const { onChange, onBlurField, onPaste } = renderRow({ row: makeRow({ description: '' }) });
    await user.type(screen.getByTestId('g-description-r1'), 'A');
    expect(onChange).toHaveBeenCalledWith('r1', { description: 'A' });
    await user.type(screen.getByTestId('g-quantity-r1'), '2');
    expect(onChange).toHaveBeenCalledWith('r1', { quantity: '2' });
    await user.type(screen.getByTestId('g-unit-r1'), 'm');
    expect(onChange).toHaveBeenCalledWith('r1', { unit: 'm' });
    await user.type(screen.getByTestId('g-unitPrice-r1'), '5');
    expect(onChange).toHaveBeenCalledWith('r1', { unitPrice: '105' });
    await user.tab();
    expect(onBlurField).toHaveBeenCalledWith('r1', 'unitPrice');
    fireEvent.paste(screen.getByTestId('g-description-r1'), {
      clipboardData: { getData: () => 'x' },
    });
    expect(onPaste).toHaveBeenCalledTimes(1);
    expect(onPaste.mock.calls[0]![1]).toBe('r1');
    // Only the description takes a paste of many rows.
    fireEvent.paste(screen.getByTestId('g-quantity-r1'), {
      clipboardData: { getData: () => 'x' },
    });
    expect(onPaste).toHaveBeenCalledTimes(1);
  });

  it('limits description to 500 and unit to 100 characters', () => {
    renderRow();
    expect(screen.getByTestId('g-description-r1')).toHaveAttribute('maxlength', '500');
    expect(screen.getByTestId('g-unit-r1')).toHaveAttribute('maxlength', '100');
    expect(screen.getByTestId('g-quantity-r1')).not.toHaveAttribute('maxlength');
  });

  it('shows a dash when the gross is not a finite number', () => {
    renderRow({ gross: Number.NaN });
    expect(screen.getByTestId('g-gross-r1')).toHaveTextContent('—');
  });

  it('hands the first description input to firstDescriptionRef', () => {
    const ref = { current: null as HTMLInputElement | null };
    renderRow({ firstDescriptionRef: ref });
    expect(ref.current).toBe(screen.getByTestId('g-description-r1'));
  });

  it('renders the host extra content under the description', () => {
    renderRow({ renderRowExtra: (row) => <span data-testid="extra">extra-{row.rowId}</span> });
    expect(screen.getByTestId('extra')).toHaveTextContent('extra-r1');
  });

  it('duplicates, and removes only while removal is allowed', async () => {
    const user = userEvent.setup();
    const first = renderRow();
    await user.click(screen.getByRole('button', { name: 'Duplicate row 3' }));
    expect(first.onDuplicate).toHaveBeenCalledWith('r1');
    const remove = screen.getByRole('button', { name: 'Remove row 3' });
    expect(remove).not.toHaveAttribute('aria-disabled');
    expect(remove).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText('A grid needs at least one row.')).not.toBeInTheDocument();
    await user.click(remove);
    expect(first.onRemove).toHaveBeenCalledWith('r1');
    first.unmount();

    const last = renderRow({ canRemove: false });
    const inert = screen.getByRole('button', { name: 'Remove row 3' });
    expect(inert).toHaveAttribute('aria-disabled', 'true');
    expect(inert).not.toBeDisabled();
    const reasonId = inert.getAttribute('aria-describedby');
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId!)).toHaveTextContent('A grid needs at least one row.');
    expect(inert).toHaveAccessibleDescription('A grid needs at least one row.');
    await user.click(inert);
    expect(last.onRemove).not.toHaveBeenCalled();
  });

  it('offers no Use existing button unless the host enables existing lines', () => {
    renderRow();
    expect(screen.queryByTestId('g-use-existing-r1')).not.toBeInTheDocument();
  });

  it('opens the existing-line picker from its button and passes the trigger', async () => {
    const user = userEvent.setup();
    const { onUseExisting } = renderRow({ options: { ...BASE_OPTIONS, existingLines: true } });
    const button = screen.getByRole('button', { name: /Use an existing cost line…, Row 3/ });
    await user.click(button);
    expect(onUseExisting).toHaveBeenCalledTimes(1);
    expect(onUseExisting.mock.calls[0]![0]).toBe('r1');
    expect(onUseExisting.mock.calls[0]![1]).toBe(button);
  });
});

describe('CostLineGridRowView columns', () => {
  it('has no category or funding source cell by default', () => {
    renderRow();
    expect(screen.queryByTestId('g-category-r1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('g-source-r1')).not.toBeInTheDocument();
  });

  it('edits the category, mapping None back to null', async () => {
    const user = userEvent.setup();
    const { onChange } = renderRow({
      options: { ...BASE_OPTIONS, columns: ['category'] },
      row: makeRow({ budgetCategoryId: 'cat1' }),
    });
    const select = screen.getByLabelText('Cost category, row 3');
    expect(select).toHaveValue('cat1');
    await user.selectOptions(select, 'cat2');
    expect(onChange).toHaveBeenCalledWith('r1', { budgetCategoryId: 'cat2' });
    await user.selectOptions(select, 'None');
    expect(onChange).toHaveBeenCalledWith('r1', { budgetCategoryId: null });
    expect(screen.queryByTestId('g-source-r1')).not.toBeInTheDocument();
  });

  it('shows an empty category as None', () => {
    renderRow({ options: { ...BASE_OPTIONS, columns: ['category'] } });
    expect(screen.getByLabelText('Cost category, row 3')).toHaveValue('');
  });

  it('edits the funding source and offers a blank choice only while none is set', async () => {
    const user = userEvent.setup();
    const empty = renderRow({ options: { ...BASE_OPTIONS, columns: ['fundingSource'] } });
    const blank = screen.getByLabelText('Funding source, row 3');
    expect(within(blank).getAllByRole('option')).toHaveLength(3);
    await user.selectOptions(blank, 'src2');
    expect(empty.onChange).toHaveBeenCalledWith('r1', { budgetSourceId: 'src2' });
    empty.unmount();

    const set = renderRow({
      options: { ...BASE_OPTIONS, columns: ['fundingSource'] },
      row: makeRow({ budgetSourceId: 'src1' }),
    });
    const select = screen.getByLabelText('Funding source, row 3');
    expect(within(select).getAllByRole('option')).toHaveLength(2);
    expect(select).toHaveValue('src1');
    // A native select cannot pick the missing blank option; the cleared value maps to null.
    fireEvent.change(select, { target: { value: 'src2' } });
    expect(set.onChange).toHaveBeenCalledWith('r1', { budgetSourceId: 'src2' });
    expect(screen.queryByTestId('g-category-r1')).not.toBeInTheDocument();
  });

  it('maps a cleared funding source value to null', () => {
    const { onChange } = renderRow({
      options: { ...BASE_OPTIONS, columns: ['fundingSource'] },
      row: makeRow({ budgetSourceId: null }),
    });
    const select = screen.getByLabelText('Funding source, row 3');
    fireEvent.change(select, { target: { value: 'src1' } });
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('r1', { budgetSourceId: null });
  });
});

describe('CostLineGridRowView Entered as toggle', () => {
  it('names itself by its visible text and exposes no pressed state', () => {
    renderRow();
    const toggle = screen.getByTestId('g-entered-r1');
    expect(toggle).toHaveTextContent('Net');
    expect(toggle).toHaveAccessibleName('Net, entered as, row 3');
    expect(toggle.getAttribute('aria-label')?.startsWith(toggle.textContent ?? '?')).toBe(true);
    expect(toggle).not.toHaveAttribute('aria-pressed');
  });

  it('flips between Net and Gross', async () => {
    const user = userEvent.setup();
    const net = renderRow();
    await user.click(screen.getByTestId('g-entered-r1'));
    expect(net.onChange).toHaveBeenCalledWith('r1', { includesVat: true });
    net.unmount();

    const gross = renderRow({ row: makeRow({ includesVat: true }) });
    const toggle = screen.getByTestId('g-entered-r1');
    expect(toggle).toHaveTextContent('Gross');
    expect(toggle).toHaveAccessibleName('Gross, entered as, row 3');
    expect(toggle.getAttribute('aria-label')?.startsWith(toggle.textContent ?? '?')).toBe(true);
    expect(toggle).not.toHaveAttribute('aria-pressed');
    await user.click(toggle);
    expect(gross.onChange).toHaveBeenCalledWith('r1', { includesVat: false });
  });
});

describe('CostLineGridRowView include and select columns', () => {
  it('has neither checkbox column when both are off', () => {
    renderRow();
    expect(screen.queryByTestId('g-include-r1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('g-select-r1')).not.toBeInTheDocument();
    expect(screen.getByTestId('g-row-r1')).not.toHaveClass('rowExcluded');
  });

  it('toggles Include and marks an excluded row', async () => {
    const user = userEvent.setup();
    const { onChange } = renderRow({
      options: { ...BASE_OPTIONS, include: true },
      row: makeRow({ included: true }),
    });
    const box = screen.getByLabelText('Include, row 3');
    expect(box).toBeChecked();
    expect(box.closest('label')).toHaveClass('checkHit');
    expect(screen.getByTestId('g-row-r1').className).not.toMatch(/rowExcluded/);
    await user.click(box);
    expect(onChange).toHaveBeenCalledWith('r1', { included: false });
  });

  it('styles an excluded row only when Include is on', () => {
    renderRow({
      options: { ...BASE_OPTIONS, include: true },
      row: makeRow({ included: false }),
    });
    expect(screen.getByTestId('g-include-r1')).not.toBeChecked();
    expect(screen.getByTestId('g-row-r1').className).toMatch(/rowExcluded/);
  });

  it('does not style a row as excluded when Include is off, whatever its flag', () => {
    renderRow({ row: makeRow({ included: false }) });
    expect(screen.getByTestId('g-row-r1').className).not.toMatch(/rowExcluded/);
  });

  it('selects an unlinked row through onToggleSelect', async () => {
    const user = userEvent.setup();
    const { onToggleSelect } = renderRow({
      options: { ...BASE_OPTIONS, select: true },
      selected: true,
    });
    const box = screen.getByLabelText('Select, row 3');
    expect(box).toBeChecked();
    expect(box).not.toHaveAttribute('aria-disabled');
    expect(box.closest('label')).toHaveClass('checkHit');
    expect(box.closest('label')).not.toHaveClass('checkHitDisabled');
    await user.click(box);
    expect(onToggleSelect).toHaveBeenCalledWith('r1');
  });

  it('tolerates a select column without a toggle handler', async () => {
    const user = userEvent.setup();
    renderRow({ options: { ...BASE_OPTIONS, select: true }, onToggleSelect: undefined });
    await user.click(screen.getByLabelText('Select, row 3'));
    expect(screen.getByLabelText('Select, row 3')).toBeInTheDocument();
  });

  it('makes the Select box of a linked row inert and explains why', async () => {
    const user = userEvent.setup();
    const { onToggleSelect } = renderRow({
      options: { ...BASE_OPTIONS, select: true },
      row: makeRow({ existingLine: EXISTING }),
      selected: true,
      selectLinkedReason: 'A linked line cannot be merged.',
    });
    const box = screen.getByLabelText('Select, row 3');
    expect(box).toHaveAttribute('aria-disabled', 'true');
    expect(box).not.toBeDisabled();
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription('A linked line cannot be merged.');
    expect(box.closest('label')).toHaveClass('checkHit', 'checkHitDisabled');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    box.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    await user.click(box);
    // (jsdom flips a controlled box on a prevented click, so only the contract is asserted.)
    expect(box).toHaveAttribute('aria-disabled', 'true');
    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it('gives the inert Select box no description without a reason', () => {
    renderRow({
      options: { ...BASE_OPTIONS, select: true },
      row: makeRow({ existingLine: EXISTING }),
    });
    const box = screen.getByLabelText('Select, row 3');
    expect(box).toHaveAttribute('aria-disabled', 'true');
    expect(box).not.toHaveAttribute('aria-describedby');
  });
});

describe('CostLineGridRowView linked row', () => {
  const linked = () => makeRow({ existingLine: EXISTING, unitPrice: '595' });

  it('replaces the inputs with the linked line and a way back', async () => {
    const user = userEvent.setup();
    const { onClearExisting } = renderRow({ row: linked() });
    expect(screen.getByText('Links Oak flooring')).toBeInTheDocument();
    expect(screen.queryByTestId('g-description-r1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('g-quantity-r1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('g-unit-r1')).not.toBeInTheDocument();
    expect(screen.getByTestId('g-unitPrice-r1')).toBeInTheDocument();
    expect(screen.getByTestId('g-unitPrice-r1').closest('td')).toHaveAttribute('colspan', '3');
    await user.click(screen.getByRole('button', { name: 'Use a new line instead' }));
    expect(onClearExisting).toHaveBeenCalledWith('r1');
  });

  it('has no Entered as toggle and no Use existing button', () => {
    renderRow({ row: linked(), options: { ...BASE_OPTIONS, existingLines: true } });
    expect(screen.queryByTestId('g-entered-r1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('g-use-existing-r1')).not.toBeInTheDocument();
  });

  it('names a linked line without a description', () => {
    renderRow({ row: makeRow({ existingLine: { ...EXISTING, description: null } }) });
    expect(screen.getByText('Links Line without a description')).toBeInTheDocument();
  });

  it('shows the row target label in the Belongs to cell, falling back to Assign all to', () => {
    const withTarget = renderRow({
      row: makeRow({ existingLine: EXISTING, target: TASK }),
      options: { ...BASE_OPTIONS, targets: true },
      assignAll: { type: 'household_item', id: 'h1', label: 'Sofa', area: null },
    });
    expect(screen.getByText('Tiling')).toBeInTheDocument();
    expect(screen.queryByText('Sofa')).not.toBeInTheDocument();
    withTarget.unmount();

    renderRow({
      row: makeRow({ existingLine: EXISTING, target: null }),
      options: { ...BASE_OPTIONS, targets: true },
      assignAll: { type: 'household_item', id: 'h1', label: 'Sofa', area: null },
    });
    expect(screen.getByText('Sofa')).toBeInTheDocument();
  });

  it('renders an empty Belongs to cell when nothing is assigned', () => {
    renderRow({
      row: makeRow({ existingLine: EXISTING, target: null }),
      options: { ...BASE_OPTIONS, targets: true },
    });
    expect(screen.getByTestId('g-row-r1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Belongs to, row 3')).not.toBeInTheDocument();
  });
});

describe('CostLineGridRowView Belongs to', () => {
  it('has no Belongs to cell unless targets are on', () => {
    renderRow();
    expect(screen.queryByLabelText('Belongs to, row 3')).not.toBeInTheDocument();
  });

  it('shows a picker with the Assign all to label as its placeholder', () => {
    renderRow({
      options: { ...BASE_OPTIONS, targets: true },
      assignAll: TASK,
    });
    expect(screen.getByLabelText('Belongs to, row 3')).toHaveAttribute('placeholder', 'Tiling');
  });

  it('falls back to the generic placeholder', () => {
    renderRow({ options: { ...BASE_OPTIONS, targets: true } });
    expect(screen.getByLabelText('Belongs to, row 3')).toHaveAttribute(
      'placeholder',
      'Search tasks and purchases',
    );
    expect(screen.getByLabelText('Belongs to, row 3')).not.toHaveAttribute('aria-invalid');
  });

  it('shows the picked target and picks one through the search', async () => {
    const user = userEvent.setup();
    mockSearchEverywhere.mockResolvedValue({
      groups: [{ type: 'work_item', items: [{ id: 'w2', label: 'Painting', areaPath: [] }] }],
    });
    const { onChange } = renderRow({ options: { ...BASE_OPTIONS, targets: true } });
    await user.type(screen.getByLabelText('Belongs to, row 3'), 'Pai');
    await user.click(await screen.findByRole('option', { name: /Painting/ }));
    expect(onChange).toHaveBeenCalledWith('r1', {
      target: { type: 'work_item', id: 'w2', label: 'Painting', area: null },
    });
  });

  it('links the target error to the picker', () => {
    renderRow({
      options: { ...BASE_OPTIONS, targets: true },
      errors: { target: 'Choose where this belongs.' },
    });
    const input = screen.getByLabelText('Belongs to, row 3');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Error: Choose where this belongs.');
  });
});

describe('CostLineGridRowView errors', () => {
  it('shows no error text for a clean row', () => {
    renderRow();
    expect(screen.queryByText(/^Error:/)).not.toBeInTheDocument();
    expect(screen.getByTestId('g-description-r1')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByTestId('g-description-r1')).not.toHaveAttribute('aria-describedby');
  });

  it('shows a given error on its field, invalid and described', () => {
    renderRow({ errors: { unitPrice: 'Enter a unit price of 0 or more.' } });
    const input = screen.getByTestId('g-unitPrice-r1');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Error: Enter a unit price of 0 or more.');
    expect(screen.getByTestId('g-description-r1')).not.toHaveAttribute('aria-invalid');
  });

  it('shows server errors per field in the same cells', () => {
    renderRow({
      errors: {
        description: 'Enter a description.',
        quantity: 'Enter a quantity.',
        unit: 'Unit is too long.',
        unitPrice: 'Enter a unit price of 0 or more.',
      },
    });
    expect(screen.getByTestId('g-description-r1')).toHaveAccessibleDescription(
      'Error: Enter a description.',
    );
    expect(screen.getByTestId('g-quantity-r1')).toHaveAccessibleDescription(
      'Error: Enter a quantity.',
    );
    expect(screen.getByTestId('g-unit-r1')).toHaveAccessibleDescription('Error: Unit is too long.');
    expect(screen.getByTestId('g-unitPrice-r1')).toHaveAccessibleDescription(
      'Error: Enter a unit price of 0 or more.',
    );
  });

  it('flags an ambiguous pasted number on its field', () => {
    renderRow({ ambiguous: new Set(['quantity']) });
    expect(screen.getByTestId('g-quantity-r1')).toHaveAccessibleDescription(
      'Error: Check this number: it can be read two ways.',
    );
    expect(screen.getByTestId('g-unitPrice-r1')).not.toHaveAttribute('aria-invalid');
  });

  it('prefers a real error over the ambiguity note', () => {
    renderRow({
      errors: { quantity: 'Enter a quantity.' },
      ambiguous: new Set(['quantity']),
    });
    expect(screen.getByTestId('g-quantity-r1')).toHaveAccessibleDescription(
      'Error: Enter a quantity.',
    );
  });

  it('reveals the errors the host passes after a save attempt, none before', () => {
    const view = renderRow({ errors: {} });
    expect(screen.queryByText(/^Error:/)).not.toBeInTheDocument();
    view.unmount();
    renderRow({ errors: { description: 'Enter a description.' } });
    expect(screen.getByText('Error: Enter a description.')).toBeInTheDocument();
  });
});

describe('CostLineGridRowView notice row', () => {
  it('shows a busy notice as a status without inputs, and reads the row number', () => {
    renderRow({
      row: makeRow({ notice: { tone: 'busy', text: 'Merging lines…' } }),
    });
    expect(screen.getByRole('status')).toHaveTextContent('Merging lines…');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('g-description-r1')).not.toBeInTheDocument();
    expect(screen.getByTestId('g-row-r1')).toHaveAttribute('data-row', 'r1');
    expect(screen.getByText('3')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows an error notice as an alert with its actions', async () => {
    const user = userEvent.setup();
    const { onNoticeAction } = renderRow({
      row: makeRow({
        notice: {
          tone: 'error',
          text: 'The merge failed.',
          actions: [
            { id: 'retry', label: 'Try again' },
            { id: 'undo', label: 'Keep separate' },
          ],
        },
      }),
    });
    expect(screen.getByRole('alert')).toHaveTextContent('The merge failed.');
    await user.click(screen.getByTestId('g-notice-retry-r1'));
    expect(onNoticeAction).toHaveBeenLastCalledWith('r1', 'retry');
    await user.click(screen.getByRole('button', { name: 'Keep separate' }));
    expect(onNoticeAction).toHaveBeenLastCalledWith('r1', 'undo');
  });

  it('ignores an action click when the host has no handler', async () => {
    const user = userEvent.setup();
    renderRow({
      row: makeRow({
        notice: { tone: 'error', text: 'Failed.', actions: [{ id: 'retry', label: 'Try again' }] },
      }),
      onNoticeAction: undefined,
    });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
