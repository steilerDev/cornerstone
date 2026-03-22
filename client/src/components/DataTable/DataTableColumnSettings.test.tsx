import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from './DataTable.js';
import { DataTableColumnSettings } from './DataTableColumnSettings.js';

interface TestItem {
  id: string;
  title: string;
  amount: number;
}

const COLUMNS: ColumnDef<TestItem>[] = [
  { key: 'title', label: 'Title', defaultVisible: true, render: (i) => i.title },
  { key: 'amount', label: 'Amount', defaultVisible: true, render: (i) => i.amount },
  { key: 'id', label: 'ID', defaultVisible: false, render: (i) => i.id },
];

function renderSettings({
  columns = COLUMNS,
  visibleColumns = new Set(['title', 'amount']),
  onToggleColumn = jest.fn(),
  onMoveColumn = jest.fn(),
  onResetToDefaults = jest.fn(),
}: {
  columns?: ColumnDef<TestItem>[];
  visibleColumns?: Set<string>;
  onToggleColumn?: jest.Mock;
  onMoveColumn?: jest.Mock;
  onResetToDefaults?: jest.Mock;
} = {}) {
  return render(
    <DataTableColumnSettings<TestItem>
      columns={columns}
      visibleColumns={visibleColumns}
      onToggleColumn={onToggleColumn}
      onMoveColumn={onMoveColumn}
      onResetToDefaults={onResetToDefaults}
    />,
  );
}

describe('DataTableColumnSettings', () => {
  describe('trigger button', () => {
    it('renders a gear/settings button', () => {
      renderSettings();
      expect(screen.getByRole('button', { name: /column settings/i })).toBeInTheDocument();
    });

    it('button has aria-expanded="false" initially', () => {
      renderSettings();
      expect(screen.getByRole('button', { name: /column settings/i })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });

    it('button has aria-haspopup="dialog"', () => {
      renderSettings();
      expect(screen.getByRole('button', { name: /column settings/i })).toHaveAttribute(
        'aria-haspopup',
        'dialog',
      );
    });
  });

  describe('popover open/close', () => {
    it('does not show popover initially', () => {
      renderSettings();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows popover after clicking the trigger button', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('button has aria-expanded="true" when popover is open', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      expect(screen.getByRole('button', { name: /column settings/i })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    });

    it('hides popover after clicking trigger button again', async () => {
      const user = userEvent.setup();
      renderSettings();
      const triggerBtn = screen.getByRole('button', { name: /column settings/i });
      await user.click(triggerBtn);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await user.click(triggerBtn);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('hides popover on Escape key press', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('hides popover on outside click', async () => {
      renderSettings();
      const triggerBtn = screen.getByRole('button', { name: /column settings/i });
      await userEvent.click(triggerBtn);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      act(() => {
        const event = new MouseEvent('mousedown', { bubbles: true });
        document.body.dispatchEvent(event);
      });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('checkbox list', () => {
    it('renders a checkbox for each column', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(COLUMNS.length);
    });

    it('renders column labels', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
      expect(screen.getByText('ID')).toBeInTheDocument();
    });

    it('checks visible columns', async () => {
      const user = userEvent.setup();
      renderSettings({ visibleColumns: new Set(['title', 'amount']) });
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      expect(screen.getByRole('checkbox', { name: 'Title' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Amount' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'ID' })).not.toBeChecked();
    });

    it('calls onToggleColumn with column key when checkbox clicked', async () => {
      const user = userEvent.setup();
      const mockToggle = jest.fn();
      renderSettings({ onToggleColumn: mockToggle });
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      await user.click(screen.getByRole('checkbox', { name: 'Title' }));
      expect(mockToggle).toHaveBeenCalledWith('title');
    });

    it('calls onToggleColumn for a hidden column when its checkbox clicked', async () => {
      const user = userEvent.setup();
      const mockToggle = jest.fn();
      renderSettings({ onToggleColumn: mockToggle });
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      await user.click(screen.getByRole('checkbox', { name: 'ID' }));
      expect(mockToggle).toHaveBeenCalledWith('id');
    });
  });

  describe('reset button', () => {
    it('renders a "Reset to defaults" button in the popover', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      expect(screen.getByRole('button', { name: /reset to defaults/i })).toBeInTheDocument();
    });

    it('calls onResetToDefaults when reset button clicked', async () => {
      const user = userEvent.setup();
      const mockReset = jest.fn();
      renderSettings({ onResetToDefaults: mockReset });
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      await user.click(screen.getByRole('button', { name: /reset to defaults/i }));
      expect(mockReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('SVG icon in trigger button (#1136)', () => {
    it('renders an SVG element inside the trigger button', () => {
      renderSettings();
      const triggerBtn = screen.getByRole('button', { name: /column settings/i });
      expect(triggerBtn.querySelector('svg')).not.toBeNull();
    });

    it('does NOT contain an emoji character in the trigger button text', () => {
      renderSettings();
      const triggerBtn = screen.getByRole('button', { name: /column settings/i });
      // The gear emoji ⚙️ was the prior implementation; verify it is no longer present
      expect(triggerBtn.textContent).not.toContain('⚙️');
    });

    it('SVG has aria-hidden="true" so it is invisible to assistive technology', () => {
      renderSettings();
      const triggerBtn = screen.getByRole('button', { name: /column settings/i });
      const svg = triggerBtn.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('drag-and-drop column reordering (#1140)', () => {
    async function openPopover() {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      return user;
    }

    it('sets effectAllowed to "move" on dragStart', async () => {
      await openPopover();

      // The "Amount" item (index 1) is draggable; "Title" (index 0) is not
      const checkboxItems = document.querySelectorAll('[draggable="true"]');
      expect(checkboxItems.length).toBeGreaterThan(0);

      const draggableItem = checkboxItems[0] as HTMLElement;
      const dataTransfer = { effectAllowed: '', dropEffect: '' };

      fireEvent.dragStart(draggableItem, { dataTransfer });

      expect(dataTransfer.effectAllowed).toBe('move');
    });

    it('applies drop-above CSS class when dragging over the upper half of an item', async () => {
      await openPopover();

      const checkboxItems = document.querySelectorAll('[draggable="true"]');
      const draggableItem = checkboxItems[0] as HTMLElement;
      const dataTransfer = { effectAllowed: '', dropEffect: '' };

      fireEvent.dragStart(draggableItem, { dataTransfer });

      // Use a different target item to avoid dragging-onto-self guard
      // (checkboxItems[1] is the "ID" column at col index 2)
      const targetItem = checkboxItems[1] as HTMLElement;

      // Prototype mock ensures getBoundingClientRect is intercepted by React event delegation
      const origGetBCR = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = jest.fn().mockReturnValue({
        top: 100,
        bottom: 140,
        height: 40,
        left: 0,
        right: 200,
        width: 200,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      } as DOMRect);

      try {
        fireEvent.dragOver(targetItem, {
          dataTransfer,
          clientY: 110, // 10px below top — upper half of a 40px element (midpoint = 120)
        });
        expect(targetItem.className).toContain('columnCheckboxItemDropAbove');
      } finally {
        Element.prototype.getBoundingClientRect = origGetBCR;
      }
    });

    it('applies drop-below CSS class when dragging over the lower half of an item', async () => {
      await openPopover();

      const checkboxItems = document.querySelectorAll('[draggable="true"]');
      const draggableItem = checkboxItems[0] as HTMLElement;
      const dataTransfer = { effectAllowed: '', dropEffect: '' };

      fireEvent.dragStart(draggableItem, { dataTransfer });

      const targetItem = checkboxItems[1] as HTMLElement;

      const origGetBCR = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = jest.fn().mockReturnValue({
        top: 100,
        bottom: 140,
        height: 40,
        left: 0,
        right: 200,
        width: 200,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      } as DOMRect);

      try {
        fireEvent.dragOver(targetItem, {
          dataTransfer,
          clientY: 130, // 30px below top — lower half of a 40px element (midpoint = 120)
        });
        expect(targetItem.className).toContain('columnCheckboxItemDropBelow');
      } finally {
        Element.prototype.getBoundingClientRect = origGetBCR;
      }
    });

    it('clears drop indicator classes on dragLeave', async () => {
      await openPopover();

      const checkboxItems = document.querySelectorAll('[draggable="true"]');
      const draggableItem = checkboxItems[0] as HTMLElement;
      const dataTransfer = { effectAllowed: '', dropEffect: '' };

      fireEvent.dragStart(draggableItem, { dataTransfer });

      const targetItem = checkboxItems[1] as HTMLElement;

      const origGetBCR = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = jest.fn().mockReturnValue({
        top: 100,
        bottom: 140,
        height: 40,
        left: 0,
        right: 200,
        width: 200,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      } as DOMRect);

      try {
        fireEvent.dragOver(targetItem, { dataTransfer, clientY: 110 });
        // Should have a drop indicator class after dragOver
        expect(targetItem.className).toMatch(/columnCheckboxItemDrop(Above|Below)/);
      } finally {
        Element.prototype.getBoundingClientRect = origGetBCR;
      }

      fireEvent.dragLeave(targetItem);
      // After leave, neither above nor below class should be present
      expect(targetItem.className).not.toContain('columnCheckboxItemDropAbove');
      expect(targetItem.className).not.toContain('columnCheckboxItemDropBelow');
    });

    it('calls onMoveColumn with correct indices on drop', async () => {
      const mockMoveColumn = jest.fn();
      const user = userEvent.setup();
      render(
        <DataTableColumnSettings<TestItem>
          columns={COLUMNS}
          visibleColumns={new Set(['title', 'amount'])}
          onToggleColumn={jest.fn()}
          onMoveColumn={mockMoveColumn}
          onResetToDefaults={jest.fn()}
        />,
      );
      await user.click(screen.getByRole('button', { name: /column settings/i }));

      const checkboxItems = document.querySelectorAll('[draggable="true"]');
      // We have 2 draggable items (index 1: Amount, index 2: ID — index 0 Title is not draggable)
      const draggedItem = checkboxItems[0] as HTMLElement; // Amount (col index 1)
      const targetItem = checkboxItems[1] as HTMLElement; // ID (col index 2)
      const dataTransfer = { effectAllowed: '', dropEffect: '' };

      fireEvent.dragStart(draggedItem, { dataTransfer });

      const origGetBCR = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = jest.fn().mockReturnValue({
        top: 100,
        bottom: 140,
        height: 40,
        left: 0,
        right: 200,
        width: 200,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      } as DOMRect);

      try {
        fireEvent.dragOver(targetItem, { dataTransfer, clientY: 130 }); // lower half → below
      } finally {
        Element.prototype.getBoundingClientRect = origGetBCR;
      }

      fireEvent.drop(targetItem);

      expect(mockMoveColumn).toHaveBeenCalledWith(1, 2);
    });
  });
});
