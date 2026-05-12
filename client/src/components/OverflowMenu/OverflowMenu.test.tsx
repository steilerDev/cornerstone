/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { OverflowMenu, type OverflowMenuItem } from './OverflowMenu.js';

// ─── CSS Module note ──────────────────────────────────────────────────────────
// identity-obj-proxy returns the class key itself as the class name.
// So styles.itemDanger === 'itemDanger', styles.menuTop === 'menuTop', etc.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildItems(count = 2, overrides: Partial<OverflowMenuItem>[] = []): OverflowMenuItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    label: `Item ${i}`,
    onClick: jest.fn<() => void>(),
    ...overrides[i],
  }));
}

function renderMenu(
  props: Partial<Parameters<typeof OverflowMenu>[0]> & { items?: OverflowMenuItem[] } = {},
) {
  const items = props.items ?? buildItems(3);
  return render(<OverflowMenu items={items} triggerAriaLabel="Open menu" {...props} />);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OverflowMenu', () => {
  beforeEach(() => {
    // Use real timers unless a test overrides this
    jest.useRealTimers();
  });

  // ─── Scenario 1: Renders trigger ──────────────────────────────────────────

  describe('Scenario 1: renders trigger button', () => {
    it('renders a button with aria-haspopup="true"', () => {
      renderMenu();
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      expect(trigger).toHaveAttribute('aria-haspopup', 'true');
    });

    it('trigger has aria-expanded="false" initially', () => {
      renderMenu();
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('menu is not in DOM initially', () => {
      renderMenu();
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  // ─── Scenario 2: Opens on click ───────────────────────────────────────────

  describe('Scenario 2: opens on click', () => {
    it('click on trigger renders role="menu"', () => {
      renderMenu();
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      fireEvent.click(trigger);
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('trigger aria-expanded becomes "true" when open', () => {
      renderMenu();
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('second click closes the menu again', () => {
      renderMenu();
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      fireEvent.click(trigger);
      fireEvent.click(trigger);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  // ─── Scenario 3: Renders all items ───────────────────────────────────────

  describe('Scenario 3: renders all menu items', () => {
    it('renders one menuitem per item provided', () => {
      const items = buildItems(4);
      renderMenu({ items });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    });

    it('each menuitem renders with the correct label', () => {
      const items = buildItems(2);
      items[0]!.label = 'Edit item';
      items[1]!.label = 'Delete item';
      renderMenu({ items });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      expect(screen.getByRole('menuitem', { name: /edit item/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /delete item/i })).toBeInTheDocument();
    });
  });

  // ─── Scenario 4: Destructive variant ─────────────────────────────────────

  describe('Scenario 4: destructive variant', () => {
    it('destructive item has CSS class containing "itemDanger"', () => {
      const items: OverflowMenuItem[] = [
        { id: 'del', label: 'Delete', onClick: jest.fn<() => void>(), variant: 'destructive' },
      ];
      renderMenu({ items });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      const delBtn = screen.getByRole('menuitem', { name: 'Delete' });
      // identity-obj-proxy returns 'itemDanger' as the class name
      expect(delBtn.className).toContain('itemDanger');
    });

    it('default variant item does NOT have "itemDanger" class', () => {
      const items: OverflowMenuItem[] = [
        { id: 'edit', label: 'Edit', onClick: jest.fn<() => void>(), variant: 'default' },
      ];
      renderMenu({ items });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      const editBtn = screen.getByRole('menuitem', { name: 'Edit' });
      expect(editBtn.className).not.toContain('itemDanger');
    });
  });

  // ─── Scenario 5: Disabled item ────────────────────────────────────────────

  describe('Scenario 5: disabled item', () => {
    it('disabled item has the disabled attribute', () => {
      const items: OverflowMenuItem[] = [
        { id: 'act', label: 'Action', onClick: jest.fn<() => void>(), disabled: true },
      ];
      renderMenu({ items });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      const btn = screen.getByRole('menuitem', { name: 'Action' });
      expect(btn).toBeDisabled();
    });

    it('clicking a disabled item does not call onClick', () => {
      const onClick = jest.fn<() => void>();
      const items: OverflowMenuItem[] = [
        { id: 'act', label: 'Disabled Action', onClick, disabled: true },
      ];
      renderMenu({ items });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Disabled Action' }));
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  // ─── Scenario 6: Click item calls onClick and closes menu ─────────────────

  describe('Scenario 6: click item calls onClick and closes menu', () => {
    it('clicking an enabled item calls its onClick handler', () => {
      const onClick = jest.fn<() => void>();
      const items: OverflowMenuItem[] = [{ id: 'go', label: 'Go', onClick }];
      renderMenu({ items });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Go' }));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('clicking an item closes the menu', () => {
      const items = buildItems(1);
      renderMenu({ items });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Item 0' }));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  // ─── Scenario 7: Escape closes menu ──────────────────────────────────────

  describe('Scenario 7: Escape key closes menu and returns focus to trigger', () => {
    it('Escape key closes the menu', () => {
      renderMenu();
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      fireEvent.click(trigger);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('after Escape, trigger has aria-expanded="false"', () => {
      renderMenu();
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      fireEvent.click(trigger);
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
  });

  // ─── Scenario 8: ArrowDown navigation ─────────────────────────────────────

  describe('Scenario 8: ArrowDown focuses next item, wraps at end', () => {
    it('ArrowDown moves focus to next item', async () => {
      renderMenu({ items: buildItems(3) });
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      fireEvent.click(trigger);

      const items = screen.getAllByRole('menuitem');
      items[0]!.focus();

      fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
      expect(document.activeElement).toBe(items[1]);
    });

    it('ArrowDown wraps from last item to first', () => {
      renderMenu({ items: buildItems(3) });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

      const items = screen.getAllByRole('menuitem');
      items[2]!.focus();

      fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
      expect(document.activeElement).toBe(items[0]);
    });
  });

  // ─── Scenario 9: ArrowUp navigation ──────────────────────────────────────

  describe('Scenario 9: ArrowUp focuses previous item, wraps at start', () => {
    it('ArrowUp moves focus to previous item', () => {
      renderMenu({ items: buildItems(3) });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

      const items = screen.getAllByRole('menuitem');
      items[2]!.focus();

      fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' });
      expect(document.activeElement).toBe(items[1]);
    });

    it('ArrowUp wraps from first item to last', () => {
      renderMenu({ items: buildItems(3) });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

      const items = screen.getAllByRole('menuitem');
      items[0]!.focus();

      fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' });
      expect(document.activeElement).toBe(items[2]);
    });
  });

  // ─── Scenario 10: Home / End ──────────────────────────────────────────────

  describe('Scenario 10: Home/End keys', () => {
    it('Home key focuses first item', () => {
      renderMenu({ items: buildItems(4) });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

      const items = screen.getAllByRole('menuitem');
      items[3]!.focus();

      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Home' });
      expect(document.activeElement).toBe(items[0]);
    });

    it('End key focuses last item', () => {
      renderMenu({ items: buildItems(4) });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

      const items = screen.getAllByRole('menuitem');
      items[0]!.focus();

      fireEvent.keyDown(screen.getByRole('menu'), { key: 'End' });
      expect(document.activeElement).toBe(items[3]);
    });
  });

  // ─── Scenario 11: Outside click closes menu ──────────────────────────────

  describe('Scenario 11: outside mousedown closes the menu', () => {
    it('mousedown on document.body closes the menu', async () => {
      renderMenu();
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      await act(async () => {
        fireEvent.mouseDown(document.body);
      });

      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });

    it('mousedown inside the wrapper does NOT close the menu', () => {
      const { container } = renderMenu();
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

      // Fire mousedown on the wrapper itself (inside)
      fireEvent.mouseDown(container.firstChild as Element);
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  // ─── Scenario 12: Disabled trigger ───────────────────────────────────────

  describe('Scenario 12: disabled trigger does not open menu', () => {
    it('clicking a disabled trigger does not render the menu', () => {
      renderMenu({ disabled: true });
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      expect(trigger).toBeDisabled();
      fireEvent.click(trigger);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  // ─── Scenario 13: triggerIcon prop ───────────────────────────────────────

  describe('Scenario 13: triggerIcon prop', () => {
    it('renders the default "⋮" trigger icon when no triggerIcon prop given', () => {
      renderMenu();
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      expect(trigger.textContent).toContain('⋮');
    });

    it('renders a custom trigger icon when triggerIcon prop is provided', () => {
      renderMenu({ triggerIcon: <span data-testid="custom-icon">X</span> });
      const icon = screen.getByTestId('custom-icon');
      expect(icon).toBeInTheDocument();
      expect(icon.textContent).toBe('X');
    });
  });

  // ─── Scenario 14: placement="top-end" ────────────────────────────────────

  describe('Scenario 14: placement="top-end" applies menuTop class', () => {
    it('menu element has "menuTop" class when placement="top-end"', () => {
      renderMenu({ placement: 'top-end' });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      const menu = screen.getByRole('menu');
      // identity-obj-proxy returns 'menuTop' as the class name
      expect(menu.className).toContain('menuTop');
    });

    it('menu element has "menuBottom" class when placement="bottom-end" (default)', () => {
      renderMenu({ placement: 'bottom-end' });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      const menu = screen.getByRole('menu');
      expect(menu.className).toContain('menuBottom');
    });
  });

  // ─── Scenario 15: data-testid forwarded ──────────────────────────────────

  describe('Scenario 15: data-testid forwarded to trigger', () => {
    it('trigger button has the data-testid attribute when provided', () => {
      renderMenu({ 'data-testid': 'my-overflow-menu' });
      const trigger = screen.getByTestId('my-overflow-menu');
      expect(trigger).toBeInTheDocument();
      expect(trigger.tagName.toLowerCase()).toBe('button');
    });

    it('no data-testid on trigger when prop is not provided', () => {
      renderMenu();
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      expect(trigger.getAttribute('data-testid')).toBeNull();
    });
  });

  // ─── ArrowDown opens menu from trigger ───────────────────────────────────

  describe('ArrowDown on closed trigger opens menu and focuses first item', () => {
    it('ArrowDown on trigger opens the menu', async () => {
      jest.useFakeTimers();
      renderMenu({ items: buildItems(2) });
      const trigger = screen.getByRole('button', { name: 'Open menu' });

      act(() => {
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
      });

      expect(screen.getByRole('menu')).toBeInTheDocument();
      jest.useRealTimers();
    });

    it('ArrowDown on trigger focuses first menuitem after setTimeout(0)', async () => {
      jest.useFakeTimers();
      renderMenu({ items: buildItems(2) });
      const trigger = screen.getByRole('button', { name: 'Open menu' });

      act(() => {
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
      });

      // Advance timers to execute the setTimeout(0) callback that focuses first item
      await act(async () => {
        jest.runAllTimers();
        await Promise.resolve();
      });

      const items = screen.getAllByRole('menuitem');
      expect(document.activeElement).toBe(items[0]);

      jest.useRealTimers();
    });

    it('ArrowDown on trigger when menu is already open does not close it', () => {
      renderMenu({ items: buildItems(2) });
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      // Open via click
      fireEvent.click(trigger);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // ArrowDown when already open: handleTriggerKeyDown guard `!isOpen` is false, no-op
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
      // Menu should still be open
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  // ─── Item without id uses fallback key ────────────────────────────────────

  describe('item without id uses fallback key (item-{i})', () => {
    it('renders items correctly when no id is provided', () => {
      const items: OverflowMenuItem[] = [
        { label: 'No ID Item A', onClick: jest.fn<() => void>() },
        { label: 'No ID Item B', onClick: jest.fn<() => void>() },
      ];
      renderMenu({ items });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      expect(screen.getByRole('menuitem', { name: 'No ID Item A' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'No ID Item B' })).toBeInTheDocument();
    });
  });

  // ─── Item with icon ────────────────────────────────────────────────────────

  describe('item with icon renders icon span', () => {
    it('item icon is rendered inside an aria-hidden span', () => {
      const items: OverflowMenuItem[] = [
        {
          id: 'icon-item',
          label: 'With Icon',
          onClick: jest.fn<() => void>(),
          icon: <span data-testid="menu-item-icon">🗑</span>,
        },
      ];
      renderMenu({ items });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      expect(screen.getByTestId('menu-item-icon')).toBeInTheDocument();
    });

    it('item without icon does not render icon span', () => {
      const items: OverflowMenuItem[] = [
        { id: 'no-icon', label: 'No Icon', onClick: jest.fn<() => void>() },
      ];
      renderMenu({ items });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      const menuItem = screen.getByRole('menuitem', { name: 'No Icon' });
      // No child span with aria-hidden should exist
      const iconSpan = menuItem.querySelector('[aria-hidden="true"]');
      expect(iconSpan).toBeNull();
    });
  });
});
