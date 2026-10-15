import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { act, render, screen, fireEvent } from '@testing-library/react';
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

    it('does not render an Apply button inside the popover', () => {
      render(
        <DataTableFilterPopover
          column={makeColumn({ filterType: 'string' })}
          value=""
          onApply={jest.fn()}
          triggerRect={makeTriggerRect()}
        />,
      );
      expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument();
    });

    it('does not render a Clear button inside the popover', () => {
      render(
        <DataTableFilterPopover
          column={makeColumn({ filterType: 'string' })}
          value="existing value"
          onApply={jest.fn()}
          triggerRect={makeTriggerRect()}
        />,
      );
      expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
    });

    it('passes initial value to the rendered filter component', () => {
      render(
        <DataTableFilterPopover
          column={makeColumn({ filterType: 'string' })}
          value="hello"
          onApply={jest.fn()}
          triggerRect={makeTriggerRect()}
        />,
      );
      expect(screen.getByRole('textbox')).toHaveValue('hello');
    });
  });

  describe('auto-apply', () => {
    it('calls onApply immediately when string filter input changes', () => {
      const mockOnApply = jest.fn();
      render(
        <DataTableFilterPopover
          column={makeColumn({ filterType: 'string' })}
          value=""
          onApply={mockOnApply}
          triggerRect={makeTriggerRect()}
        />,
      );
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } });
      expect(mockOnApply).toHaveBeenCalledWith('test');
    });

    it('calls onApply immediately when enum filter checkbox is toggled', () => {
      const mockOnApply = jest.fn();
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
          onApply={mockOnApply}
          triggerRect={makeTriggerRect()}
        />,
      );
      fireEvent.click(screen.getByText('Option A'));
      expect(mockOnApply).toHaveBeenCalledWith('a');
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

  describe('entity filter', () => {
    it('shows the resolved label of the active value as the selected entity', () => {
      render(
        <DataTableFilterPopover
          column={makeColumn({
            filterType: 'entity',
            entitySearchFn: async () => [],
            entityRenderItem: (item) => ({
              id: (item as TestItem).id,
              label: (item as TestItem).name,
            }),
            entitySelectedLabel: 'Acme Roofing',
          })}
          value="v-1"
          onApply={jest.fn()}
          triggerRect={makeTriggerRect()}
        />,
      );

      expect(screen.getByText('Acme Roofing')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
    });

    it('shows the search input when no value is active', () => {
      render(
        <DataTableFilterPopover
          column={makeColumn({
            filterType: 'entity',
            entitySearchFn: async () => [],
            entityRenderItem: (item) => ({
              id: (item as TestItem).id,
              label: (item as TestItem).name,
            }),
            entitySelectedLabel: undefined,
          })}
          value=""
          onApply={jest.fn()}
          triggerRect={makeTriggerRect()}
        />,
      );

      expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });

  describe('viewport clamping', () => {
    const realInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    let offsetWidth = 300;
    let offsetSpy: { mockRestore: () => void } | null = null;

    function setViewport(width: number, popoverWidth = 300) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      offsetWidth = popoverWidth;
      offsetSpy?.mockRestore();
      offsetSpy = jest
        .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
        .mockImplementation(() => offsetWidth);
    }

    afterEach(() => {
      offsetSpy?.mockRestore();
      offsetSpy = null;
      if (realInnerWidth) Object.defineProperty(window, 'innerWidth', realInnerWidth);
    });

    function renderAt(left: number) {
      render(
        <DataTableFilterPopover
          column={makeColumn()}
          value=""
          onApply={jest.fn()}
          triggerRect={makeTriggerRect({ left })}
        />,
      );
      return screen.getByRole('dialog');
    }

    it('keeps the right edge 16px inside the viewport for a trigger near the right edge', () => {
      setViewport(800, 300);
      const dialog = renderAt(700);
      // 800 - 300 - 16 = 484
      expect(dialog.style.left).toBe('484px');
      expect(parseFloat(dialog.style.left) + offsetWidth).toBe(800 - 16);
    });

    it('leaves a trigger that fits where it is', () => {
      setViewport(800, 300);
      expect(renderAt(150).style.left).toBe('150px');
    });

    it('clamps a trigger near the left edge to 16px', () => {
      setViewport(800, 300);
      expect(renderAt(4).style.left).toBe('16px');
    });

    it('prefers the 16px gutter when the popover is wider than the viewport allows', () => {
      setViewport(300, 400);
      expect(renderAt(120).style.left).toBe('16px');
    });

    it('caps maxWidth to the viewport minus both gutters, so a 320px viewport keeps the right edge inside 304px', () => {
      setViewport(320, 300);
      const dialog = renderAt(150);

      expect(dialog.style.left).toBe('16px');
      expect(dialog.style.maxWidth).toBe('min(300px, calc(100vw - 32px))');
      // jsdom does not lay out: resolve the cap by hand (min(300px, 320px - 32px) = 288px)
      const cap = Math.min(300, 320 - 2 * 16);
      expect(cap).toBe(288);
      expect(parseFloat(dialog.style.left) + Math.min(offsetWidth, cap)).toBeLessThanOrEqual(
        320 - 16,
      );
    });

    it('re-clamps when the window is resized', () => {
      setViewport(1200, 300);
      const dialog = renderAt(700);
      expect(dialog.style.left).toBe('700px');

      act(() => {
        setViewport(800, 300);
        window.dispatchEvent(new Event('resize'));
      });
      expect(dialog.style.left).toBe('484px');

      act(() => {
        setViewport(1600, 300);
        window.dispatchEvent(new Event('resize'));
      });
      expect(dialog.style.left).toBe('700px');
    });

    it('re-measures when the trigger moves and stops listening after unmount', () => {
      setViewport(800, 300);
      const { rerender, unmount } = render(
        <DataTableFilterPopover
          column={makeColumn()}
          value=""
          onApply={jest.fn()}
          triggerRect={makeTriggerRect({ left: 100 })}
        />,
      );
      rerender(
        <DataTableFilterPopover
          column={makeColumn()}
          value=""
          onApply={jest.fn()}
          triggerRect={makeTriggerRect({ left: 600 })}
        />,
      );
      expect(screen.getByRole('dialog').style.left).toBe('484px');

      const removeSpy = jest.spyOn(window, 'removeEventListener');
      unmount();
      expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
      removeSpy.mockRestore();
    });

    describe('ResizeObserver', () => {
      // setupTests defines a writable, non-configurable no-op polyfill: assign, never redefine
      const realRO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
      const instances: Array<{
        callback: () => void;
        observe: jest.Mock;
        disconnect: jest.Mock;
      }> = [];

      class FakeResizeObserver {
        callback: () => void;
        observe = jest.fn();
        disconnect = jest.fn();
        constructor(callback: () => void) {
          this.callback = callback;
          instances.push(this);
        }
      }

      function mockObserver() {
        instances.length = 0;
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
      }

      afterEach(() => {
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = realRO;
      });

      it('observes the popover element itself', () => {
        mockObserver();
        setViewport(800, 190);
        const dialog = renderAt(700);

        expect(instances).toHaveLength(1);
        expect(instances[0]!.observe).toHaveBeenCalledWith(dialog);
      });

      it('re-clamps when the popover grows (190px to 300px after a selection)', () => {
        mockObserver();
        setViewport(800, 190);
        const dialog = renderAt(700);
        // 800 - 190 - 16 = 594
        expect(dialog.style.left).toBe('594px');

        offsetWidth = 300;
        act(() => {
          instances[0]!.callback();
        });

        expect(dialog.style.left).toBe('484px');
        expect(parseFloat(dialog.style.left) + offsetWidth).toBe(800 - 16);
      });

      it('disconnects the observer when the popover closes (unmounts)', () => {
        mockObserver();
        setViewport(800, 190);
        render(
          <DataTableFilterPopover
            column={makeColumn()}
            value=""
            onApply={jest.fn()}
            triggerRect={makeTriggerRect({ left: 100 })}
          />,
        ).unmount();

        expect(instances[0]!.disconnect).toHaveBeenCalledTimes(1);
      });

      it('disconnects the old observer and observes again when the trigger moves', () => {
        mockObserver();
        setViewport(800, 190);
        const props = { column: makeColumn(), value: '', onApply: jest.fn() };
        const { rerender } = render(
          <DataTableFilterPopover {...props} triggerRect={makeTriggerRect({ left: 100 })} />,
        );
        rerender(
          <DataTableFilterPopover {...props} triggerRect={makeTriggerRect({ left: 200 })} />,
        );

        expect(instances).toHaveLength(2);
        expect(instances[0]!.disconnect).toHaveBeenCalled();
        expect(instances[1]!.observe).toHaveBeenCalled();
      });

      it('does not crash and still clamps when ResizeObserver is unavailable', () => {
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = undefined;
        setViewport(800, 300);

        const dialog = renderAt(700);

        expect(dialog.style.left).toBe('484px');
      });
    });
  });
});
