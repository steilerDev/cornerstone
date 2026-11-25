import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useRef } from 'react';
import type { ComponentProps } from 'react';
import type { ColumnDef } from './DataTable.js';
import { DataTableFilterPopover } from './DataTableFilterPopover.js';
import { LocaleProvider } from '../../contexts/LocaleContext.js';

interface TestItem {
  id: string;
  name: string;
}

type Props = Omit<ComponentProps<typeof DataTableFilterPopover<TestItem>>, 'anchorRef' | 'id'> &
  Partial<Pick<ComponentProps<typeof DataTableFilterPopover<TestItem>>, 'id'>>;

function makeColumn(overrides: Partial<ColumnDef<TestItem>> = {}): ColumnDef<TestItem> {
  return {
    key: 'name',
    label: 'Name',
    filterType: 'string',
    filterParamKey: 'name',
    filterable: true,
    render: (item) => item.name,
    ...overrides,
  };
}

/** The popover is anchored to the trigger button, as the table header does. */
function Harness(props: Props) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={anchorRef} type="button" data-testid="anchor">
        Filter
      </button>
      <DataTableFilterPopover<TestItem> id="filter-panel" {...props} anchorRef={anchorRef} />
    </div>
  );
}

function renderPopover(overrides: Partial<Props> = {}) {
  const props: Props = {
    column: makeColumn(),
    value: '',
    onApply: jest.fn(),
    onDismiss: jest.fn(),
    ...overrides,
  };
  render(<Harness {...props} />);
  return props;
}

describe('DataTableFilterPopover', () => {
  describe('rendering', () => {
    it('renders as an anchored panel with role="dialog", portaled to the body', () => {
      renderPopover();
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('data-anchored-panel');
      expect(dialog).toHaveAttribute('id', 'filter-panel');
      expect(dialog.parentElement).toBe(document.body.querySelector('[data-floating-ui-portal]'));
      expect(document.body.contains(dialog)).toBe(true);
    });

    it('is addressable by a per-column test id', () => {
      renderPopover({ column: makeColumn({ key: 'status' }) });
      expect(screen.getByTestId('data-table-filter-panel-status')).toBe(screen.getByRole('dialog'));
    });

    it('leaves stacking and positioning to the panel: no inline z-index of its own', () => {
      renderPopover();
      expect(screen.getByRole('dialog').style.zIndex).toBe('');
      const content = screen
        .getByRole('textbox')
        .closest('[class*="filterPopover"]') as HTMLElement;
      expect(content.style.zIndex).toBe('');
      expect(content.style.position).toBe('');
    });

    it('renders StringFilter for filterType="string"', () => {
      renderPopover({ column: makeColumn({ filterType: 'string' }) });
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('renders NumberFilter for filterType="number"', () => {
      renderPopover({ column: makeColumn({ filterType: 'number' }) });
      expect(screen.getAllByRole('spinbutton').length).toBeGreaterThan(0);
    });

    it('renders BooleanFilter for filterType="boolean"', () => {
      renderPopover({ column: makeColumn({ filterType: 'boolean' }) });
      expect(screen.getByRole('button', { name: /yes/i })).toBeInTheDocument();
    });

    it('renders EnumFilter for filterType="enum" with options', () => {
      renderPopover({
        column: makeColumn({
          filterType: 'enum',
          enumOptions: [
            { value: 'a', label: 'Option A' },
            { value: 'b', label: 'Option B' },
          ],
        }),
      });
      expect(screen.getByText('Option A')).toBeInTheDocument();
    });

    it('takes the number range from the server filter meta, falling back to the column bounds', () => {
      renderPopover({
        column: makeColumn({ filterType: 'number', numberMin: 1, numberMax: 9 }),
        filterMeta: { name: { min: 5, max: 50 } },
      });
      expect(screen.getAllByRole('spinbutton')[0]).toHaveAttribute('min', '5');
      expect(screen.getAllByRole('spinbutton')[0]).toHaveAttribute('max', '50');
    });

    it('uses the column number bounds when the server sent no meta for the column', () => {
      renderPopover({ column: makeColumn({ filterType: 'number', numberMin: 1, numberMax: 9 }) });
      expect(screen.getAllByRole('spinbutton')[0]).toHaveAttribute('min', '1');
      expect(screen.getAllByRole('spinbutton')[0]).toHaveAttribute('max', '9');
    });

    it('renders DateFilter for filterType="date"', () => {
      render(
        <LocaleProvider>
          <Harness
            column={makeColumn({ filterType: 'date' })}
            value=""
            onApply={jest.fn()}
            onDismiss={jest.fn()}
          />
        </LocaleProvider>,
      );
      expect(screen.getByRole('dialog').querySelector('input, button')).not.toBeNull();
      expect(screen.getByRole('dialog').textContent).toMatch(/\d{4}/);
    });

    it('renders an empty panel for a column without a usable filter definition', () => {
      renderPopover({ column: makeColumn({ filterType: 'enum', enumOptions: undefined }) });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).toBeNull();
      cleanup();
      renderPopover({ column: makeColumn({ filterType: 'entity' }) });
      expect(screen.queryByRole('textbox')).toBeNull();
      cleanup();
      renderPopover({
        column: makeColumn({
          filterType: 'unknown' as unknown as ColumnDef<TestItem>['filterType'],
        }),
      });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('does not render an Apply button inside the popover', () => {
      renderPopover();
      expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument();
    });

    it('does not render a Clear button inside the popover', () => {
      renderPopover({ value: 'existing value' });
      expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
    });

    it('passes initial value to the rendered filter component', () => {
      renderPopover({ value: 'hello' });
      expect(screen.getByRole('textbox')).toHaveValue('hello');
    });
  });

  describe('auto-apply', () => {
    it('calls onApply immediately when string filter input changes', () => {
      const { onApply } = renderPopover();
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } });
      expect(onApply).toHaveBeenCalledWith('test');
    });

    it('calls onApply immediately when enum filter checkbox is toggled', () => {
      const { onApply } = renderPopover({
        column: makeColumn({
          filterType: 'enum',
          enumOptions: [
            { value: 'a', label: 'Option A' },
            { value: 'b', label: 'Option B' },
          ],
        }),
      });
      fireEvent.click(screen.getByText('Option A'));
      expect(onApply).toHaveBeenCalledWith('a');
    });
  });

  describe('aria-label', () => {
    it('includes the column label in aria-label on dialog', () => {
      renderPopover({ column: makeColumn({ label: 'Budget Amount' }) });
      expect(screen.getByRole('dialog')).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Budget Amount'),
      );
    });
  });

  describe('dismissal', () => {
    it('reports "escape" when Escape is pressed', () => {
      const { onDismiss } = renderPopover();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onDismiss).toHaveBeenCalledWith('escape');
    });

    it('reports "outside" for a press outside the panel', () => {
      const { onDismiss } = renderPopover();
      fireEvent.mouseDown(document.body);
      expect(onDismiss).toHaveBeenCalledWith('outside');
    });

    it('does not dismiss for a press on the anchor button (the header toggles it)', () => {
      const { onDismiss } = renderPopover();
      fireEvent.mouseDown(screen.getByTestId('anchor'));
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('does not dismiss for a press inside the panel', () => {
      const { onDismiss } = renderPopover();
      fireEvent.mouseDown(screen.getByRole('textbox'));
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('does not dismiss for a press inside a SearchPicker dropdown', () => {
      const { onDismiss } = renderPopover();
      const dropdown = document.createElement('div');
      dropdown.setAttribute('data-search-picker-dropdown', '');
      const option = document.createElement('button');
      dropdown.appendChild(option);
      document.body.appendChild(dropdown);
      fireEvent.mouseDown(option);
      expect(onDismiss).not.toHaveBeenCalled();
      dropdown.remove();
    });
  });

  describe('events stay inside the panel', () => {
    it('a click inside does not reach the header cell (it would sort the column)', () => {
      const onCellClick = jest.fn();
      const onCellMouseDown = jest.fn();
      const anchorRef = { current: null as HTMLButtonElement | null };
      render(
        <table>
          <thead>
            <tr>
              <th onClick={onCellClick} onMouseDown={onCellMouseDown}>
                <button
                  type="button"
                  ref={(el) => {
                    anchorRef.current = el;
                  }}
                >
                  Filter
                </button>
                <DataTableFilterPopover<TestItem>
                  column={makeColumn()}
                  value=""
                  onApply={jest.fn()}
                  anchorRef={anchorRef}
                  id="p"
                  onDismiss={jest.fn()}
                />
              </th>
            </tr>
          </thead>
        </table>,
      );
      fireEvent.mouseDown(screen.getByRole('textbox'));
      fireEvent.click(screen.getByRole('textbox'));
      expect(onCellClick).not.toHaveBeenCalled();
      expect(onCellMouseDown).not.toHaveBeenCalled();
    });
  });

  describe('entity filter', () => {
    it('shows the resolved label of the active value as the selected entity', () => {
      renderPopover({
        column: makeColumn({
          filterType: 'entity',
          entitySearchFn: async () => [],
          entityRenderItem: (item) => ({
            id: (item as TestItem).id,
            label: (item as TestItem).name,
          }),
          entitySelectedLabel: 'Acme Roofing',
        }),
        value: 'v-1',
      });

      expect(screen.getByText('Acme Roofing')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Clear selection/ })).toBeInTheDocument();
    });

    it('shows the search input when no value is active', () => {
      renderPopover({
        column: makeColumn({
          filterType: 'entity',
          entitySearchFn: async () => [],
          entityRenderItem: (item) => ({
            id: (item as TestItem).id,
            label: (item as TestItem).name,
          }),
          entitySelectedLabel: undefined,
        }),
      });

      expect(screen.queryByRole('button', { name: /^Clear selection/ })).not.toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });
});
