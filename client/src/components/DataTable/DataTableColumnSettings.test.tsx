import { describe, it, expect, jest } from '@jest/globals';
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

    it('stays open on other key presses', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      fireEvent.keyDown(document, { key: 'a' });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
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

  describe('anchored panel (#2257)', () => {
    const trigger = () => screen.getByRole('button', { name: /column settings/i });

    it('opens as a role="dialog" anchored panel portaled outside the trigger parent', async () => {
      const { container } = renderSettings();
      await userEvent.click(trigger());
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('data-anchored-panel');
      expect(dialog).toHaveAttribute('data-testid', 'data-table-column-settings-panel');
      expect(container.contains(dialog)).toBe(false);
    });

    it('is named by the settings title and wired to the trigger with aria-controls', async () => {
      renderSettings();
      expect(trigger()).toHaveAttribute('aria-controls');
      await userEvent.click(trigger());
      const dialog = screen.getByRole('dialog', { name: /columns/i });
      expect(dialog.id).toBe(trigger().getAttribute('aria-controls'));
    });

    it('moves focus to the first control in the panel when it opens', async () => {
      renderSettings();
      await userEvent.click(trigger());
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
      expect(document.activeElement).not.toBe(trigger());
    });

    it('Escape closes the panel and returns focus to the trigger', async () => {
      renderSettings();
      await userEvent.click(trigger());
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(trigger()).toHaveFocus();
      expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    });

    it('an outside press closes the panel without stealing focus back', async () => {
      renderSettings();
      await userEvent.click(trigger());
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('a press inside the panel keeps it open', async () => {
      renderSettings();
      await userEvent.click(trigger());
      fireEvent.mouseDown(screen.getAllByRole('checkbox')[0]!);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('a press inside a SearchPicker dropdown does not close the panel', async () => {
      renderSettings();
      await userEvent.click(trigger());
      const dropdown = document.createElement('div');
      dropdown.setAttribute('data-search-picker-dropdown', '');
      const option = document.createElement('button');
      dropdown.appendChild(option);
      document.body.appendChild(dropdown);
      fireEvent.mouseDown(option);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      dropdown.remove();
    });

    it('the panel carries no inline z-index or fixed positioning of its own content', async () => {
      renderSettings();
      await userEvent.click(trigger());
      const content = screen.getByRole('dialog').firstElementChild as HTMLElement;
      expect(content.style.zIndex).toBe('');
      expect(content.style.position).toBe('');
    });

    it('works without a router (no route-change signal is wired)', async () => {
      renderSettings();
      await userEvent.click(trigger());
      expect(screen.getByRole('dialog')).toBeInTheDocument();
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

    it('applies a drop indicator CSS class when dragging over a valid target item', async () => {
      await openPopover();

      const checkboxItems = document.querySelectorAll('[draggable="true"]');
      const draggableItem = checkboxItems[0] as HTMLElement; // Amount (col index 1)
      const dataTransfer = { effectAllowed: '', dropEffect: '' };

      fireEvent.dragStart(draggableItem, { dataTransfer });

      // Use a different target item (checkboxItems[1] = ID column, col index 2)
      const targetItem = checkboxItems[1] as HTMLElement;

      // In jsdom getBoundingClientRect always returns zeros, so clientY > 0 always
      // evaluates to "below" — assert that SOME drop indicator class is applied.
      fireEvent.dragOver(targetItem, { dataTransfer, clientY: 50 });

      expect(targetItem.className).toMatch(/columnCheckboxItemDrop(Above|Below)/);
    });

    it('applies drop-below CSS class when clientY is in the lower half (jsdom geometry)', async () => {
      await openPopover();

      const checkboxItems = document.querySelectorAll('[draggable="true"]');
      const draggableItem = checkboxItems[0] as HTMLElement;
      const dataTransfer = { effectAllowed: '', dropEffect: '' };

      fireEvent.dragStart(draggableItem, { dataTransfer });

      const targetItem = checkboxItems[1] as HTMLElement;

      // In jsdom, getBoundingClientRect returns all zeros. clientY > 0 means
      // clientY >= midpoint (0 + 0/2 = 0), so position is always 'below'
      fireEvent.dragOver(targetItem, { dataTransfer, clientY: 50 });

      expect(targetItem.className).toContain('columnCheckboxItemDropBelow');
    });

    it('clears drop indicator classes on dragLeave', async () => {
      await openPopover();

      const checkboxItems = document.querySelectorAll('[draggable="true"]');
      const draggableItem = checkboxItems[0] as HTMLElement;
      const dataTransfer = { effectAllowed: '', dropEffect: '' };

      fireEvent.dragStart(draggableItem, { dataTransfer });

      const targetItem = checkboxItems[1] as HTMLElement;

      fireEvent.dragOver(targetItem, { dataTransfer, clientY: 50 });
      // Confirm indicator class was applied
      expect(targetItem.className).toMatch(/columnCheckboxItemDrop(Above|Below)/);

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

      const mockBCR = (): DOMRect =>
        ({
          top: 100,
          bottom: 140,
          height: 40,
          left: 0,
          right: 200,
          width: 200,
          x: 0,
          y: 100,
          toJSON: () => ({}),
        }) as DOMRect;
      const origGetBCR = HTMLElement.prototype.getBoundingClientRect;
      HTMLElement.prototype.getBoundingClientRect = mockBCR;

      try {
        fireEvent.dragOver(targetItem, { dataTransfer, clientY: 130 }); // lower half → below
      } finally {
        HTMLElement.prototype.getBoundingClientRect = origGetBCR;
      }

      fireEvent.drop(targetItem);

      expect(mockMoveColumn).toHaveBeenCalledWith(1, 2);
    });
  });
});
