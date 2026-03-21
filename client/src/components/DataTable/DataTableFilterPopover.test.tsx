import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from './DataTable.js';
import { DataTableFilterPopover } from './DataTableFilterPopover.js';

interface TestItem {
  id: string;
  name: string;
}

// Build a fake DOMRect for triggerRect prop
function makeTriggerRect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    bottom: 40,
    top: 20,
    left: 100,
    right: 200,
    width: 100,
    height: 20,
    x: 100,
    y: 20,
    toJSON: () => ({}),
    ...overrides,
  } as DOMRect;
}

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

describe('DataTableFilterPopover', () => {
  describe('rendering', () => {
    it('renders with role="dialog"', () => {
      render(
        <DataTableFilterPopover
          column={makeColumn()}
          value=""
          onApply={jest.fn()}
          triggerRect={makeTriggerRect()}
        />,
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('uses fixed positioning based on triggerRect', () => {
      render(
        <DataTableFilterPopover
          column={makeColumn()}
          value=""
          onApply={jest.fn()}
          triggerRect={makeTriggerRect({ bottom: 60, left: 150 })}
        />,
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveStyle({ position: 'fixed', top: '64px', left: '150px' });
    });

    it('clamps left position to at least 16px', () => {
      render(
        <DataTableFilterPopover
          column={makeColumn()}
          value=""
          onApply={jest.fn()}
          triggerRect={makeTriggerRect({ bottom: 40, left: 5 })}
        />,
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveStyle({ left: '16px' });
    });

    it('renders StringFilter for filterType="string"', () => {
      render(
        <DataTableFilterPopover
          column={makeColumn({ filterType: 'string' })}
          value=""
          onApply={jest.fn()}
          triggerRect={makeTriggerRect()}
        />,
      );
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('renders NumberFilter for filterType="number"', () => {
      render(
        <DataTableFilterPopover
          column={makeColumn({ filterType: 'number' })}
          value=""
          onApply={jest.fn()}
          triggerRect={makeTriggerRect()}
        />,
      );
      const spinbuttons = screen.getAllByRole('spinbutton');
      expect(spinbuttons.length).toBeGreaterThan(0);
    });

    it('renders BooleanFilter for filterType="boolean"', () => {
      render(
        <DataTableFilterPopover
          column={makeColumn({ filterType: 'boolean' })}
          value=""
          onApply={jest.fn()}
          triggerRect={makeTriggerRect()}
        />,
      );
      expect(screen.getByRole('button', { name: /yes/i })).toBeInTheDocument();
    });

    it('renders EnumFilter for filterType="enum" with options', () => {
      render(
        <DataTableFilterPopover
          column={makeColumn({
            filterType: 'enum',
            enumOptions: [
              { value: 'a', label: 'Option A' },
              { value: 'b', label: 'Option B' },
            ],
          })}
          value=""
          onApply={jest.fn()}
          triggerRect={makeTriggerRect()}
        />,
      );
      expect(screen.getByText('Option A')).toBeInTheDocument();
    });
  });

  describe('outside click', () => {
    it('calls onApply when clicking outside the popover', async () => {
      const mockOnApply = jest.fn();
      render(
        <div>
          <button data-testid="outside">Outside</button>
          <DataTableFilterPopover
            column={makeColumn({ filterType: 'string' })}
            value="existing"
            onApply={mockOnApply}
            triggerRect={makeTriggerRect()}
          />
        </div>,
      );

      act(() => {
        const event = new MouseEvent('mousedown', { bubbles: true });
        document.querySelector('[data-testid="outside"]')?.dispatchEvent(event);
      });

      expect(mockOnApply).toHaveBeenCalled();
    });
  });

  describe('escape key', () => {
    it('calls onApply when Escape key pressed', () => {
      const mockOnApply = jest.fn();
      render(
        <DataTableFilterPopover
          column={makeColumn({ filterType: 'string' })}
          value="test"
          onApply={mockOnApply}
          triggerRect={makeTriggerRect()}
        />,
      );

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        document.dispatchEvent(event);
      });

      expect(mockOnApply).toHaveBeenCalled();
    });
  });

  describe('aria-label', () => {
    it('includes the column label in aria-label on dialog', () => {
      render(
        <DataTableFilterPopover
          column={makeColumn({ label: 'Budget Amount' })}
          value=""
          onApply={jest.fn()}
          triggerRect={makeTriggerRect()}
        />,
      );
      expect(screen.getByRole('dialog')).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Budget Amount'),
      );
    });
  });
});
