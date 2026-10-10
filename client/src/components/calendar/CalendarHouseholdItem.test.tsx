/**
 * @jest-environment jsdom
 *
 * Unit tests for CalendarHouseholdItem component.
 * Covers rendering, amber/green badge differentiation for delivered vs. non-delivered,
 * click navigation, keyboard accessibility, tooltip callbacks, and aria-label.
 *
 * EPIC-09: Story 9.1 — Household Item Timeline Dependencies & Delivery Date Scheduling
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render as rtlRender, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { TimelineHouseholdItem } from '@cornerstone/shared';
import type * as CalendarHouseholdItemTypes from './CalendarHouseholdItem.js';

import type { ReactElement } from 'react';
import { LocaleProvider } from '../../contexts/LocaleContext.js';

function render(ui: ReactElement, options?: Parameters<typeof rtlRender>[1]) {
  return rtlRender(<LocaleProvider>{ui}</LocaleProvider>, options);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeHouseholdItem(overrides: Partial<TimelineHouseholdItem> = {}): TimelineHouseholdItem {
  return {
    id: 'hi-1',
    name: 'Leather Sofa',
    category: 'furniture',
    status: 'planned',
    targetDeliveryDate: null,
    earliestDeliveryDate: '2026-05-15',
    latestDeliveryDate: '2026-06-01',
    actualDeliveryDate: null,
    isLate: false,
    dependencyIds: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let CalendarHouseholdItem: typeof CalendarHouseholdItemTypes.CalendarHouseholdItem;

beforeEach(async () => {
  if (!CalendarHouseholdItem) {
    const module = await import('./CalendarHouseholdItem.js');
    CalendarHouseholdItem = module.CalendarHouseholdItem;
  }
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderHI(
  props: Partial<{
    item: TimelineHouseholdItem;
    onMouseEnter: jest.Mock;
    onMouseLeave: jest.Mock;
    onMouseMove: jest.Mock;
    isTouchDevice: boolean;
    activeTouchId: string | null;
    onTouchTap: jest.Mock;
  }> = {},
) {
  const item = props.item ?? makeHouseholdItem();
  return render(
    <MemoryRouter>
      <CalendarHouseholdItem
        item={item}
        onMouseEnter={props.onMouseEnter}
        onMouseLeave={props.onMouseLeave}
        onMouseMove={props.onMouseMove}
        isTouchDevice={props.isTouchDevice}
        activeTouchId={props.activeTouchId}
        onTouchTap={props.onTouchTap}
      />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CalendarHouseholdItem', () => {
  // ── Basic rendering ────────────────────────────────────────────────────────

  describe('basic rendering', () => {
    it('renders with data-testid="calendar-hi-item"', () => {
      renderHI();
      expect(screen.getByTestId('calendar-hi-item')).toBeInTheDocument();
    });

    it('has role="button"', () => {
      renderHI();
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('has tabIndex=0 for keyboard accessibility', () => {
      renderHI();
      expect(screen.getByRole('button')).toHaveAttribute('tabindex', '0');
    });

    it('renders the household item name', () => {
      renderHI({ item: makeHouseholdItem({ name: 'Kitchen Island' }) });
      expect(screen.getByText('Kitchen Island')).toBeInTheDocument();
    });

    it('renders a circle SVG icon', () => {
      renderHI();
      // Check for the SVG icon element
      const item = screen.getByTestId('calendar-hi-item');
      const svg = item.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  // ── aria-label ─────────────────────────────────────────────────────────────

  describe('aria-label', () => {
    it('aria-label includes the item name', () => {
      renderHI({ item: makeHouseholdItem({ name: 'Dining Table' }) });
      const button = screen.getByRole('button');
      expect(button.getAttribute('aria-label')).toContain('Dining Table');
    });

    it('aria-label includes the status', () => {
      renderHI({ item: makeHouseholdItem({ status: 'planned' }) });
      const button = screen.getByRole('button');
      expect(button.getAttribute('aria-label')).toContain('Planned');
    });

    it('aria-label includes purchased status', () => {
      renderHI({ item: makeHouseholdItem({ status: 'purchased' }) });
      const button = screen.getByRole('button');
      expect(button.getAttribute('aria-label')).toContain('Ordered');
    });

    it('aria-label includes the date the chip is drawn on (targetDeliveryDate)', () => {
      renderHI({ item: makeHouseholdItem({ targetDeliveryDate: '2026-05-15' }) });
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'Purchase: Leather Sofa, Planned, delivery May 15, 2026',
      );
    });

    it('the actual delivery date wins over the target date in the aria-label', () => {
      renderHI({
        item: makeHouseholdItem({
          status: 'arrived',
          targetDeliveryDate: '2026-05-15',
          actualDeliveryDate: '2026-05-17',
        }),
      });
      const label = screen.getByRole('button').getAttribute('aria-label');
      expect(label).toContain('May 17, 2026');
      expect(label).not.toContain('May 15, 2026');
    });

    it('includes the area name when the purchase has an area', () => {
      renderHI({
        item: makeHouseholdItem({
          targetDeliveryDate: '2026-05-15',
          area: { id: 'a1', name: 'Test Kitchen', color: null, ancestors: [] },
        }),
      });
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'Purchase: Leather Sofa, Planned, Test Kitchen, delivery May 15, 2026',
      );
    });

    it('omits the area when the purchase has none', () => {
      renderHI({ item: makeHouseholdItem({ targetDeliveryDate: '2026-05-15', area: null }) });
      expect(screen.getByRole('button').getAttribute('aria-label')).not.toContain(', ,');
      expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
        'Purchase: Leather Sofa, Planned, delivery May 15, 2026',
      );
    });

    it('aria-label says "delivery not scheduled" when there is no target or actual date', () => {
      renderHI({
        item: makeHouseholdItem({ targetDeliveryDate: null, actualDeliveryDate: null }),
      });
      const button = screen.getByRole('button');
      expect(button.getAttribute('aria-label')).toContain('delivery not scheduled');
    });
  });

  // ── Colour by status (Badge purchase classes) ─────────────────────────────

  describe('CSS class per purchase status', () => {
    it.each(['planned', 'purchased', 'scheduled', 'arrived'] as const)(
      'status %s uses the Badge %s class and exposes data-status',
      (status) => {
        renderHI({ item: makeHouseholdItem({ status }) });
        const el = screen.getByTestId('calendar-hi-item');
        expect(el.className).toContain(status);
        expect(el).toHaveAttribute('data-status', status);
      },
    );

    it('a planned purchase does not carry another status class', () => {
      renderHI({ item: makeHouseholdItem({ status: 'planned' }) });
      const className = screen.getByTestId('calendar-hi-item').className;
      expect(className).not.toContain('arrived');
      expect(className).not.toContain('purchased');
      expect(className).not.toContain('scheduled');
    });
  });

  // ── Focus shows the tooltip (#2198) ───────────────────────────────────────

  describe('focus and blur', () => {
    it('focus calls onMouseEnter with the id and the centre of the element rect', () => {
      const onMouseEnter = jest.fn();
      renderHI({ onMouseEnter });
      const el = screen.getByTestId('calendar-hi-item');
      el.getBoundingClientRect = () =>
        ({ left: 10, top: 20, width: 100, height: 20, right: 110, bottom: 40 }) as DOMRect;
      fireEvent.focus(el);
      expect(onMouseEnter).toHaveBeenCalledWith('hi-1', 60, 30);
    });

    it('blur calls onMouseLeave', () => {
      const onMouseLeave = jest.fn();
      renderHI({ onMouseLeave });
      fireEvent.blur(screen.getByTestId('calendar-hi-item'));
      expect(onMouseLeave).toHaveBeenCalledTimes(1);
    });

    it('focus and blur without handlers do not throw', () => {
      renderHI();
      const el = screen.getByTestId('calendar-hi-item');
      expect(() => {
        fireEvent.focus(el);
        fireEvent.blur(el);
      }).not.toThrow();
    });
  });

  // ── Click navigation ───────────────────────────────────────────────────────

  describe('click navigation', () => {
    it('click navigates to /project/household-items/:id (non-touch)', () => {
      // Use a MemoryRouter so we can verify navigation happened without erroring
      render(
        <MemoryRouter initialEntries={['/schedule']}>
          <CalendarHouseholdItem item={makeHouseholdItem({ id: 'hi-42' })} />
        </MemoryRouter>,
      );

      const button = screen.getByTestId('calendar-hi-item');
      // Should not throw on click
      expect(() => {
        fireEvent.click(button);
      }).not.toThrow();
    });

    it('click calls onTouchTap instead of navigating on touch devices', () => {
      const onTouchTap = jest.fn();
      renderHI({
        item: makeHouseholdItem({ id: 'hi-touch' }),
        isTouchDevice: true,
        onTouchTap,
      });

      const button = screen.getByTestId('calendar-hi-item');
      fireEvent.click(button);

      expect(onTouchTap).toHaveBeenCalledTimes(1);
      // First arg is the item id
      const firstArg = (onTouchTap.mock.calls[0] as unknown[])[0];
      expect(firstArg).toBe('hi-touch');
    });

    it('click navigates directly when isTouchDevice=false (even if onTouchTap is provided)', () => {
      const onTouchTap = jest.fn();
      render(
        <MemoryRouter>
          <CalendarHouseholdItem
            item={makeHouseholdItem({ id: 'hi-nontouch' })}
            isTouchDevice={false}
            onTouchTap={onTouchTap}
          />
        </MemoryRouter>,
      );

      const button = screen.getByTestId('calendar-hi-item');
      fireEvent.click(button);

      // onTouchTap should NOT be called when isTouchDevice is false
      expect(onTouchTap).not.toHaveBeenCalled();
    });
  });

  // ── Keyboard accessibility ─────────────────────────────────────────────────

  describe('keyboard accessibility', () => {
    it('Enter key triggers navigation (does not throw)', () => {
      render(
        <MemoryRouter>
          <CalendarHouseholdItem item={makeHouseholdItem({ id: 'hi-enter' })} />
        </MemoryRouter>,
      );

      const button = screen.getByTestId('calendar-hi-item');
      expect(() => {
        fireEvent.keyDown(button, { key: 'Enter' });
      }).not.toThrow();
    });

    it('Space key triggers navigation (does not throw)', () => {
      render(
        <MemoryRouter>
          <CalendarHouseholdItem item={makeHouseholdItem({ id: 'hi-space' })} />
        </MemoryRouter>,
      );

      const button = screen.getByTestId('calendar-hi-item');
      expect(() => {
        fireEvent.keyDown(button, { key: ' ' });
      }).not.toThrow();
    });

    it('Space key calls onTouchTap when isTouchDevice=true', () => {
      const onTouchTap = jest.fn();
      renderHI({
        item: makeHouseholdItem({ id: 'hi-space-touch' }),
        isTouchDevice: true,
        onTouchTap,
      });

      const button = screen.getByTestId('calendar-hi-item');
      fireEvent.keyDown(button, { key: ' ' });

      expect(onTouchTap).toHaveBeenCalledTimes(1);
    });

    it('Tab key does NOT trigger navigation or callbacks', () => {
      const onTouchTap = jest.fn();
      renderHI({ onTouchTap, isTouchDevice: true });

      const button = screen.getByTestId('calendar-hi-item');
      fireEvent.keyDown(button, { key: 'Tab' });
      fireEvent.keyDown(button, { key: 'Escape' });

      expect(onTouchTap).not.toHaveBeenCalled();
    });
  });

  // ── Mouse enter/leave/move callbacks ──────────────────────────────────────

  describe('mouse event callbacks', () => {
    it('mouseEnter fires onMouseEnter with itemId and coordinates', () => {
      const onMouseEnter = jest.fn();
      renderHI({
        item: makeHouseholdItem({ id: 'hi-hover' }),
        onMouseEnter,
      });

      const button = screen.getByTestId('calendar-hi-item');
      fireEvent.mouseEnter(button, { clientX: 100, clientY: 200 });

      expect(onMouseEnter).toHaveBeenCalledTimes(1);
      const args = onMouseEnter.mock.calls[0] as unknown[];
      expect(args[0]!).toBe('hi-hover'); // itemId
      // Note: jsdom fireEvent doesn't propagate clientX/Y to synthetic events perfectly,
      // but we can verify the callback was called with the correct first argument.
    });

    it('mouseLeave fires onMouseLeave', () => {
      const onMouseLeave = jest.fn();
      renderHI({ onMouseLeave });

      const button = screen.getByTestId('calendar-hi-item');
      fireEvent.mouseLeave(button);

      expect(onMouseLeave).toHaveBeenCalledTimes(1);
    });

    it('mouseMove fires onMouseMove', () => {
      const onMouseMove = jest.fn();
      renderHI({ onMouseMove });

      const button = screen.getByTestId('calendar-hi-item');
      fireEvent.mouseMove(button);

      expect(onMouseMove).toHaveBeenCalledTimes(1);
    });

    it('does not throw when onMouseEnter is not provided', () => {
      renderHI({ onMouseEnter: undefined });

      const button = screen.getByTestId('calendar-hi-item');
      expect(() => {
        fireEvent.mouseEnter(button);
      }).not.toThrow();
    });

    it('does not throw when onMouseLeave is not provided', () => {
      renderHI({ onMouseLeave: undefined });

      const button = screen.getByTestId('calendar-hi-item');
      expect(() => {
        fireEvent.mouseLeave(button);
      }).not.toThrow();
    });

    it('does not throw when onMouseMove is not provided', () => {
      renderHI({ onMouseMove: undefined });

      const button = screen.getByTestId('calendar-hi-item');
      expect(() => {
        fireEvent.mouseMove(button);
      }).not.toThrow();
    });
  });
});
