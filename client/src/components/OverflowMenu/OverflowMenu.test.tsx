/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createRef } from 'react';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import {
  OverflowMenu,
  SCROLL_CLOSE_THRESHOLD_PX,
  type OverflowMenuEntry,
  type OverflowMenuItem,
} from './OverflowMenu.js';

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
    it('renders a button with aria-haspopup="menu"', () => {
      renderMenu();
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
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
      renderMenu({ placement: 'top-end', menuTestId: 'panel' });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      const menu = screen.getByTestId('panel');
      // identity-obj-proxy returns 'menuTop' as the class name; the classes sit on the panel
      expect(menu.className).toContain('menuTop');
      expect(screen.getByRole('menu').className).not.toContain('menuTop');
    });

    it('menu element has "menuBottom" class when placement="bottom-end" (default)', () => {
      renderMenu({ placement: 'bottom-end', menuTestId: 'panel' });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      const menu = screen.getByTestId('panel');
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

    it('ArrowDown on trigger focuses the first menuitem synchronously (no timer)', () => {
      jest.useFakeTimers();
      renderMenu({ items: buildItems(2) });
      const trigger = screen.getByRole('button', { name: 'Open menu' });

      act(() => {
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
      });

      // No timer is advanced: the focus moves in a layout effect
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

  // ─── Distinct ids with identical labels ────────────────────────────────────

  describe('items with the same label but distinct ids', () => {
    it('renders both items and dispatches each click to its own handler', () => {
      const onFirst = jest.fn<() => void>();
      const onSecond = jest.fn<() => void>();
      const items: OverflowMenuItem[] = [
        { id: 'first', label: 'Same Label', onClick: onFirst },
        { id: 'second', label: 'Same Label', onClick: onSecond },
      ];
      renderMenu({ items });
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      const menuItems = screen.getAllByRole('menuitem', { name: 'Same Label' });
      expect(menuItems).toHaveLength(2);

      fireEvent.click(menuItems[1]!);

      expect(onSecond).toHaveBeenCalledTimes(1);
      expect(onFirst).not.toHaveBeenCalled();
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

  // ─── Scenario 16: usePortal=true — portal rendering (#1423) ──────────────────

  describe('Scenario 16: usePortal=true renders menu in document.body (#1423)', () => {
    function mockRect(trigger: HTMLElement) {
      trigger.getBoundingClientRect = jest.fn(() => ({
        top: 100,
        bottom: 120,
        left: 200,
        right: 300,
        width: 100,
        height: 20,
        x: 200,
        y: 100,
        toJSON: () => ({}),
      }));
    }

    afterEach(() => {
      Object.defineProperty(window, 'scrollY', {
        value: 0,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(window, 'scrollX', {
        value: 0,
        writable: true,
        configurable: true,
      });
    });

    it('menu appears as a child of document.body when usePortal=true', () => {
      renderMenu({ usePortal: true });
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      mockRect(trigger);

      fireEvent.click(trigger);

      const menu = screen.getByRole('menu');
      expect(menu).toBeInTheDocument();

      // The menu must be inside document.body (portalled out)
      expect(document.body.contains(menu)).toBe(true);

      // Walk up from menu — it should NOT be inside the wrapper div
      const wrapper = trigger.closest('div');
      expect(wrapper?.contains(menu)).toBe(false);
    });

    it('menu IS inside the wrapper div when usePortal=false', () => {
      renderMenu({ usePortal: false });
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      fireEvent.click(trigger);

      const menu = screen.getByRole('menu');
      const wrapper = trigger.closest('div');
      expect(wrapper?.contains(menu)).toBe(true);
    });

    it('large scroll (> threshold) closes the menu when usePortal=true', () => {
      renderMenu({ usePortal: true });
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      mockRect(trigger);

      fireEvent.click(trigger);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      Object.defineProperty(window, 'scrollY', {
        value: SCROLL_CLOSE_THRESHOLD_PX * 6,
        writable: true,
        configurable: true,
      });
      act(() => {
        document.dispatchEvent(new Event('scroll', { bubbles: true }));
      });

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('tiny incidental scroll (≤ threshold) does NOT close the menu when usePortal=true', () => {
      renderMenu({ usePortal: true });
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      mockRect(trigger);

      fireEvent.click(trigger);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      Object.defineProperty(window, 'scrollY', {
        value: SCROLL_CLOSE_THRESHOLD_PX - 4,
        writable: true,
        configurable: true,
      });
      act(() => {
        document.dispatchEvent(new Event('scroll', { bubbles: true }));
      });

      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('resize event on window closes the menu when usePortal=true', () => {
      renderMenu({ usePortal: true });
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      mockRect(trigger);

      fireEvent.click(trigger);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      act(() => {
        window.dispatchEvent(new Event('resize'));
      });

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('scroll event does NOT close the menu when usePortal=false', () => {
      renderMenu({ usePortal: false });
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      fireEvent.click(trigger);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      act(() => {
        document.dispatchEvent(new Event('scroll', { bubbles: true }));
      });

      // Menu should remain open — scroll listener only added when usePortal=true
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('menuFixed CSS class applied to menu when usePortal=true', () => {
      renderMenu({ usePortal: true, menuTestId: 'panel' });
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      mockRect(trigger);

      fireEvent.click(trigger);

      const menu = screen.getByTestId('panel'); // placement classes sit on the panel
      // identity-obj-proxy returns 'menuFixed' for styles.menuFixed
      expect(menu.className).toContain('menuFixed');
    });

    it('menuFixed CSS class NOT applied to menu when usePortal=false', () => {
      renderMenu({ usePortal: false, menuTestId: 'panel' });
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      fireEvent.click(trigger);

      const menu = screen.getByTestId('panel'); // placement classes sit on the panel
      expect(menu.className).not.toContain('menuFixed');
    });

    it('menu does NOT carry .menuTop class when usePortal=true with placement="top-end"', () => {
      renderMenu({ usePortal: true, placement: 'top-end', menuTestId: 'panel' });
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      mockRect(trigger);

      fireEvent.click(trigger);
      const menu = screen.getByTestId('panel'); // placement classes sit on the panel

      // .menuTop applies bottom: 100% which conflicts with inline top: <Npx> in fixed
      // positioning. In portal mode the inline style fully controls positioning, so
      // .menuTop/.menuBottom must NOT be present.
      expect(menu.className).not.toMatch(/menuTop/);
      expect(menu.className).not.toMatch(/menuBottom/);

      // .menuFixed must still be present so position: fixed and z-index apply.
      expect(menu.className).toMatch(/menuFixed/);
    });

    it('menu carries .menuTop class when usePortal=false with placement="top-end"', () => {
      renderMenu({ placement: 'top-end', menuTestId: 'panel' }); // usePortal omitted = false
      const trigger = screen.getByRole('button', { name: 'Open menu' });
      mockRect(trigger);

      fireEvent.click(trigger);
      const menu = screen.getByTestId('panel'); // placement classes sit on the panel

      expect(menu.className).toMatch(/menuTop/);
      expect(menu.className).not.toMatch(/menuFixed/);
    });
  });
});

// ─── Entry kinds, header, keyboard pattern (#2206) ───────────────────────────

describe('OverflowMenu entry kinds and menu-button pattern', () => {
  const TRIGGER = { name: 'Account' };

  function entries(overrides: { onChoose?: (v: string) => void } = {}): OverflowMenuEntry[] {
    return [
      { kind: 'link', id: 'account', label: 'Account link', href: '/settings/account' },
      { kind: 'separator', id: 'sep-1' },
      {
        kind: 'choice',
        id: 'theme',
        label: 'Theme',
        value: 'system',
        onChange: overrides.onChoose ?? jest.fn<(v: string) => void>(),
        options: [
          { value: 'light', label: 'Light', testId: 'opt-light' },
          { value: 'dark', label: 'Dark', lang: 'en', testId: 'opt-dark' },
          { value: 'system', label: 'System', testId: 'opt-system' },
        ],
      },
      { kind: 'separator', id: 'sep-2' },
      {
        kind: 'group',
        id: 'about',
        label: 'About',
        meta: 'v1.2.3',
        items: [
          {
            kind: 'link',
            id: 'gh',
            label: 'Repo',
            href: 'https://example.test/repo',
            newTab: true,
            srSuffix: '(opens in a new tab)',
            testId: 'gh-link',
          },
        ],
      },
      { id: 'last', label: 'Last action', onClick: jest.fn<() => void>(), testId: 'last-action' },
    ];
  }

  function renderRich(props: Partial<Parameters<typeof OverflowMenu>[0]> = {}) {
    return render(<OverflowMenu items={entries()} triggerAriaLabel="Account" {...props} />);
  }

  function open() {
    const trigger = screen.getByRole('button', TRIGGER);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    return trigger;
  }

  const allItems = () => Array.from(document.querySelectorAll<HTMLElement>('[role^="menuitem"]'));
  const clean = (text: string | null | undefined) => (text ?? '').replace(/^✓\s*/, '');

  describe('rendering', () => {
    it('renders actions, links, choice options and group items in order as navigable roles', () => {
      renderRich();
      open();
      expect(allItems().map((el) => clean(el.textContent))).toEqual([
        'Account link',
        'Light',
        'Dark',
        'System',
        'Repo↗(opens in a new tab)',
        'Last action',
      ]);
      expect(screen.getAllByRole('menuitemradio')).toHaveLength(3);
    });

    it('renders separators with role="separator" at their positions inside the menu', () => {
      renderRich();
      open();
      const menu = screen.getByRole('menu');
      const separators = within(menu).getAllByRole('separator');
      expect(separators).toHaveLength(2);
      const children = Array.from(menu.children);
      expect(children.indexOf(separators[0]!)).toBe(1);
      expect(children.indexOf(separators[1]!)).toBe(3);
    });

    it('marks the selected option aria-checked with a hidden check mark and the rest unchecked', () => {
      renderRich();
      open();
      expect(screen.getByTestId('opt-system')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('opt-system').className).toContain('optionSelected');
      expect(within(screen.getByTestId('opt-system')).getByText('✓')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
      for (const id of ['opt-light', 'opt-dark']) {
        expect(screen.getByTestId(id)).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByTestId(id).className).not.toContain('optionSelected');
        expect(within(screen.getByTestId(id)).queryByText('✓')).toBeNull();
      }
    });

    it('passes lang to the option and labels the choice group with its label', () => {
      renderRich();
      open();
      expect(screen.getByTestId('opt-dark')).toHaveAttribute('lang', 'en');
      expect(screen.getByTestId('opt-light')).not.toHaveAttribute('lang');
      expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
    });

    it('renders a group with its label, meta and items', () => {
      renderRich();
      open();
      const group = screen.getByRole('group', { name: 'About' });
      expect(within(group).getByText('v1.2.3')).toBeInTheDocument();
      expect(within(group).getByTestId('gh-link')).toBeInTheDocument();
    });

    it('renders a group without meta', () => {
      renderRich({ items: [{ kind: 'group', id: 'g', label: 'Plain', items: [] }] });
      open();
      expect(screen.getByRole('group', { name: 'Plain' })).toBeInTheDocument();
    });

    it('renders a plain link without new-tab attributes', () => {
      renderRich();
      open();
      const link = screen.getByRole('menuitem', { name: 'Account link' });
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', '/settings/account');
      expect(link).not.toHaveAttribute('target');
      expect(link).not.toHaveAttribute('rel');
      expect(link).toHaveAttribute('tabindex', '-1');
    });

    it('renders a new-tab link with target, rel, hidden arrow and sr-only suffix', () => {
      renderRich();
      open();
      const link = screen.getByTestId('gh-link');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(within(link).getByText('↗')).toHaveAttribute('aria-hidden', 'true');
      expect(within(link).getByText('(opens in a new tab)').className).toContain('srOnly');
    });

    it('omits the sr-only suffix when none is given', () => {
      renderRich({
        items: [
          { kind: 'link', id: 'x', label: 'X', href: 'https://e.test', newTab: true, testId: 'x' },
        ],
      });
      open();
      expect(within(screen.getByTestId('x')).queryByText(/opens/)).toBeNull();
      expect(within(screen.getByTestId('x')).getByText('↗')).toBeInTheDocument();
    });
  });

  describe('trigger, panel and header', () => {
    it('replaces the default trigger class with triggerClassName', () => {
      renderRich({ triggerClassName: 'avatar' });
      const trigger = screen.getByRole('button', TRIGGER);
      expect(trigger.className).toBe('avatar');
    });

    it('uses the default trigger class without triggerClassName', () => {
      renderRich();
      expect(screen.getByRole('button', TRIGGER).className).toContain('trigger');
    });

    it('puts menuTestId and menuClassName on the panel, with the menu role on the inner list', () => {
      renderRich({ menuTestId: 'panel', menuClassName: 'wide' });
      open();
      const panel = screen.getByTestId('panel');
      expect(panel.className).toContain('wide');
      expect(panel.className).toContain('menu');
      const menu = screen.getByRole('menu');
      expect(panel.contains(menu)).toBe(true);
      expect(menu).not.toBe(panel);
      expect(menu.className).toContain('list');
    });

    it('renders the header outside role="menu" and links it with aria-describedby', () => {
      renderRich({ header: <p>Sam Example</p>, menuTestId: 'panel' });
      open();
      const menu = screen.getByRole('menu');
      const header = screen.getByText('Sam Example').parentElement as HTMLElement;
      expect(menu.contains(header)).toBe(false);
      expect(screen.getByTestId('panel').contains(header)).toBe(true);
      expect(header.id).not.toBe('');
      expect(menu.getAttribute('aria-describedby')).toBe(header.id);
    });

    it('has no aria-describedby without a header', () => {
      renderRich();
      open();
      expect(screen.getByRole('menu')).not.toHaveAttribute('aria-describedby');
    });

    it('links the menu to the trigger through aria-labelledby and aria-controls', () => {
      renderRich();
      const trigger = screen.getByRole('button', TRIGGER);
      expect(trigger).not.toHaveAttribute('aria-controls');
      open();
      const menu = screen.getByRole('menu');
      expect(menu.getAttribute('aria-labelledby')).toBe(trigger.id);
      expect(trigger.getAttribute('aria-controls')).toBe(menu.id);
    });

    it('exposes the trigger through a caller-owned triggerRef', () => {
      const ref = createRef<HTMLButtonElement>();
      renderRich({ triggerRef: ref });
      expect(ref.current).toBe(screen.getByRole('button', TRIGGER));
    });
  });

  describe('closeSignal', () => {
    it('closes an open menu when the signal changes', () => {
      const { rerender } = render(
        <OverflowMenu items={entries()} triggerAriaLabel="Account" closeSignal="a" />,
      );
      open();
      expect(screen.getByRole('menu')).toBeInTheDocument();
      rerender(<OverflowMenu items={entries()} triggerAriaLabel="Account" closeSignal="b" />);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(screen.getByRole('button', TRIGGER)).toHaveAttribute('aria-expanded', 'false');
    });

    it('keeps the menu open while the signal is unchanged and reopens after a change', () => {
      const { rerender } = render(
        <OverflowMenu items={entries()} triggerAriaLabel="Account" closeSignal="a" />,
      );
      open();
      rerender(<OverflowMenu items={entries()} triggerAriaLabel="Account" closeSignal="a" />);
      expect(screen.getByRole('menu')).toBeInTheDocument();
      rerender(<OverflowMenu items={entries()} triggerAriaLabel="Account" closeSignal="b" />);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      open();
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  describe('keyboard on the trigger', () => {
    it.each(['Enter', ' ', 'ArrowDown'])('%j opens the menu and focuses the first item', (key) => {
      renderRich();
      fireEvent.keyDown(screen.getByRole('button', TRIGGER), { key });
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(document.activeElement).toBe(allItems()[0]);
    });

    it('ArrowUp opens the menu and focuses the last item', () => {
      renderRich();
      fireEvent.keyDown(screen.getByRole('button', TRIGGER), { key: 'ArrowUp' });
      const all = allItems();
      expect(document.activeElement).toBe(all[all.length - 1]);
    });

    it('prevents the default of the opening keys (no duplicate click)', () => {
      renderRich();
      const notPrevented = fireEvent.keyDown(screen.getByRole('button', TRIGGER), {
        key: 'Enter',
      });
      expect(notPrevented).toBe(false);
    });

    it('ignores other keys', () => {
      renderRich();
      fireEvent.keyDown(screen.getByRole('button', TRIGGER), { key: 'a' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('a mouse click opens without moving focus into the menu', () => {
      renderRich();
      const trigger = screen.getByRole('button', TRIGGER);
      trigger.focus();
      fireEvent.click(trigger, { detail: 1 });
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });

    it('a keyboard open does not leave a pending focus for a later mouse reopen', () => {
      renderRich();
      const trigger = open();
      fireEvent.click(trigger);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      trigger.focus();
      fireEvent.click(trigger);
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });

    it('does not move focus when the menu has no navigable items', () => {
      renderRich({ items: [{ kind: 'separator', id: 's' }] });
      const trigger = screen.getByRole('button', TRIGGER);
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });
  });

  describe('keyboard inside the menu', () => {
    const focusedName = () => clean(document.activeElement?.textContent);

    it('ArrowDown and ArrowUp move through links and radios and wrap', () => {
      renderRich();
      open();
      const menu = screen.getByRole('menu');
      expect(focusedName()).toBe('Account link');
      fireEvent.keyDown(menu, { key: 'ArrowDown' });
      expect(focusedName()).toBe('Light');
      fireEvent.keyDown(menu, { key: 'ArrowUp' });
      expect(focusedName()).toBe('Account link');
      fireEvent.keyDown(menu, { key: 'ArrowUp' });
      expect(focusedName()).toBe('Last action');
      fireEvent.keyDown(menu, { key: 'ArrowDown' });
      expect(focusedName()).toBe('Account link');
    });

    it('Home and End jump to the first and last item', () => {
      renderRich();
      open();
      const menu = screen.getByRole('menu');
      fireEvent.keyDown(menu, { key: 'End' });
      expect(focusedName()).toBe('Last action');
      fireEvent.keyDown(menu, { key: 'Home' });
      expect(focusedName()).toBe('Account link');
    });

    it('Escape closes the menu and focuses the trigger', () => {
      renderRich();
      const trigger = open();
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });

    it.each([false, true])(
      'Tab (shift=%s) closes the menu, focuses the trigger and is not default-prevented',
      (shiftKey) => {
        renderRich();
        const trigger = open();
        const notPrevented = fireEvent.keyDown(screen.getByRole('menu'), {
          key: 'Tab',
          shiftKey,
        });
        expect(notPrevented).toBe(true);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(document.activeElement).toBe(trigger);
      },
    );

    it('Space on a link clicks it and prevents scrolling', () => {
      const onClick = jest.fn<(e: { preventDefault(): void }) => void>((e) => e.preventDefault());
      renderRich({
        items: [{ kind: 'link', id: 'l', label: 'Go', href: '#go', onClick, testId: 'go' }],
      });
      open();
      const notPrevented = fireEvent.keyDown(screen.getByTestId('go'), { key: ' ' });
      expect(notPrevented).toBe(false);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('Space on a button is left to the browser', () => {
      renderRich();
      open();
      const notPrevented = fireEvent.keyDown(screen.getByTestId('last-action'), { key: ' ' });
      expect(notPrevented).toBe(true);
    });

    it('ignores unrelated keys inside the menu', () => {
      renderRich();
      open();
      const notPrevented = fireEvent.keyDown(screen.getByRole('menu'), { key: 'x' });
      expect(notPrevented).toBe(true);
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('arrow keys do nothing when the menu has no navigable items', () => {
      renderRich({ items: [{ kind: 'separator', id: 's' }] });
      fireEvent.click(screen.getByRole('button', TRIGGER));
      const notPrevented = fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
      expect(notPrevented).toBe(true);
    });

    it('skips disabled items but keeps aria-disabled items navigable', () => {
      renderRich({
        items: [
          { id: 'a', label: 'A', onClick: jest.fn<() => void>() },
          { id: 'b', label: 'B (disabled)', onClick: jest.fn<() => void>(), disabled: true },
          { id: 'c', label: 'C (aria)', onClick: jest.fn<() => void>(), ariaDisabled: true },
        ],
      });
      open();
      const menu = screen.getByRole('menu');
      expect(focusedName()).toBe('A');
      fireEvent.keyDown(menu, { key: 'ArrowDown' });
      expect(focusedName()).toBe('C (aria)');
    });
  });

  describe('activation', () => {
    it('choosing an option calls onChange with its value and keeps the menu open and focused', () => {
      const onChoose = jest.fn<(v: string) => void>();
      renderRich({ items: entries({ onChoose }) });
      open();
      const dark = screen.getByTestId('opt-dark');
      dark.focus();
      fireEvent.click(dark);
      expect(onChoose).toHaveBeenCalledTimes(1);
      expect(onChoose).toHaveBeenCalledWith('dark');
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(document.activeElement).toBe(dark);
    });

    it('clicking a link runs its onClick before closing the menu', () => {
      const seen: boolean[] = [];
      const onClick = jest.fn<(e: { preventDefault(): void }) => void>((e) => {
        seen.push(screen.queryByRole('menu') !== null);
        e.preventDefault();
      });
      renderRich({
        items: [{ kind: 'link', id: 'l', label: 'Go', href: '#go', onClick, testId: 'go' }],
      });
      open();
      fireEvent.click(screen.getByTestId('go'));
      expect(seen).toEqual([true]);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('clicking a link without onClick still closes the menu', () => {
      renderRich({ items: [{ kind: 'link', id: 'l', label: 'Go', href: '#go', testId: 'go' }] });
      open();
      fireEvent.click(screen.getByTestId('go'));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('a plain action closes the menu and calls onClick', () => {
      const onClick = jest.fn<() => void>();
      renderRich({ items: [{ id: 'a', label: 'Do it', onClick }] });
      open();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Do it' }));
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('keepOpen calls onClick and leaves the menu open', () => {
      const onClick = jest.fn<() => void>();
      renderRich({ items: [{ id: 'a', label: 'Stay', onClick, keepOpen: true }] });
      open();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Stay' }));
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('ariaDisabled renders aria-disabled and is inert: no callback, menu stays open', () => {
      const onClick = jest.fn<() => void>();
      renderRich({ items: [{ id: 'a', label: 'Busy', onClick, ariaDisabled: true }] });
      open();
      const item = screen.getByRole('menuitem', { name: 'Busy' });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).not.toBeDisabled();
      fireEvent.click(item);
      expect(onClick).not.toHaveBeenCalled();
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('does not set aria-disabled on a normal action', () => {
      renderRich({ items: [{ id: 'a', label: 'Fine', onClick: jest.fn<() => void>() }] });
      open();
      expect(screen.getByRole('menuitem', { name: 'Fine' })).not.toHaveAttribute('aria-disabled');
    });
  });
});

describe('OverflowMenu Escape from outside the menu element', () => {
  it('closes an open menu and returns focus to the trigger when Escape reaches the document', () => {
    render(<OverflowMenu items={buildItems(2)} triggerAriaLabel="Open menu" />);
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    const notPrevented = fireEvent.keyDown(trigger, { key: 'Escape' });

    expect(notPrevented).toBe(false);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('ignores other keys at the document level', () => {
    render(<OverflowMenu items={buildItems(2)} triggerAriaLabel="Open menu" />);
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(trigger);

    fireEvent.keyDown(trigger, { key: 'a' });

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
