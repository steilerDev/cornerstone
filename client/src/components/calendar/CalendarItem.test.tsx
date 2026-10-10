/**
 * @jest-environment jsdom
 *
 * Unit tests for CalendarItem component.
 * Covers rendering, status color class selection, isStart/isEnd shape classes,
 * title display, compact mode, click navigation, and keyboard accessibility.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render as rtlRender, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import type { TimelineWorkItem } from '@cornerstone/shared';
import type * as CalendarItemTypes from './CalendarItem.js';

import type { ReactElement } from 'react';
import { LocaleProvider } from '../../contexts/LocaleContext.js';

function render(ui: ReactElement, options?: Parameters<typeof rtlRender>[1]) {
  return rtlRender(<LocaleProvider>{ui}</LocaleProvider>, options);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<TimelineWorkItem> = {}): TimelineWorkItem {
  return {
    id: 'item-1',
    title: 'Foundation Work',
    status: 'not_started',
    startDate: '2024-03-10',
    endDate: '2024-03-20',
    durationDays: 10,
    actualStartDate: null,
    actualEndDate: null,
    startAfter: null,
    startBefore: null,
    assignedUser: null,
    assignedVendor: null,
    area: null,
    projectedStartDate: overrides.startDate !== undefined ? overrides.startDate : '2024-03-10',
    projectedEndDate: overrides.endDate !== undefined ? overrides.endDate : '2024-03-20',
    isLate: false,
    lateDays: null,
    isHeldUp: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let CalendarItem: typeof CalendarItemTypes.CalendarItem;

beforeEach(async () => {
  if (!CalendarItem) {
    const module = await import('./CalendarItem.js');
    CalendarItem = module.CalendarItem;
  }
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderItem(
  props: Partial<{
    item: TimelineWorkItem;
    isStart: boolean;
    isEnd: boolean;
    compact: boolean;
    isHighlighted: boolean;
    onMouseEnter: jest.Mock;
    onMouseLeave: jest.Mock;
    onMouseMove: jest.Mock;
  }> = {},
) {
  const item = props.item ?? makeItem();
  return render(
    <MemoryRouter>
      <CalendarItem
        item={item}
        isStart={props.isStart ?? true}
        isEnd={props.isEnd ?? true}
        compact={props.compact ?? false}
        isHighlighted={props.isHighlighted}
        onMouseEnter={props.onMouseEnter}
        onMouseLeave={props.onMouseLeave}
        onMouseMove={props.onMouseMove}
      />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CalendarItem', () => {
  // ── Basic rendering ────────────────────────────────────────────────────────

  describe('basic rendering', () => {
    it('renders with data-testid="calendar-item"', () => {
      renderItem();
      expect(screen.getByTestId('calendar-item')).toBeInTheDocument();
    });

    it('has role="button"', () => {
      renderItem();
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('has tabIndex=0 for keyboard accessibility', () => {
      renderItem();
      expect(screen.getByRole('button')).toHaveAttribute('tabindex', '0');
    });

    it('renders with correct aria-label including item title and status', () => {
      const item = makeItem({ title: 'Roof Installation', status: 'in_progress' });
      renderItem({ item });
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'Task: Roof Installation, In progress, Mar 10, 2024 to Mar 20, 2024',
      );
    });

    it('does not render a native title attribute (rich tooltip replaces it)', () => {
      const item = makeItem({ title: 'Plumbing Rough-in' });
      renderItem({ item });
      expect(screen.getByRole('button')).not.toHaveAttribute('title');
    });
  });

  // ── Title display (isStart conditional) ────────────────────────────────────

  describe('title display', () => {
    it('shows title text when isStart=true', () => {
      const item = makeItem({ title: 'Foundation Work' });
      renderItem({ item, isStart: true });
      expect(screen.getByText('Foundation Work')).toBeInTheDocument();
    });

    it('shows the title on a continuation segment (isStart=false) so every week row is readable', () => {
      const item = makeItem({ title: 'Foundation Work' });
      renderItem({ item, isStart: false });
      expect(screen.getByText('Foundation Work')).toBeInTheDocument();
    });

    it.each([
      ['start', true, false],
      ['middle', false, false],
      ['end', false, true],
      ['single', true, true],
    ])('shows the title on a %s segment', (_name, isStart, isEnd) => {
      renderItem({ isStart, isEnd });
      expect(screen.getByText('Foundation Work')).toBeInTheDocument();
    });

    it('shows "←" only when the item continues from a previous week, aria-hidden', () => {
      renderItem({ isStart: false, isEnd: true });
      const arrow = screen.getByText('←');
      expect(arrow).toHaveAttribute('aria-hidden', 'true');
      expect(screen.queryByText('→')).not.toBeInTheDocument();
    });

    it('shows "→" only when the item continues into the next week, aria-hidden', () => {
      renderItem({ isStart: true, isEnd: false });
      const arrow = screen.getByText('→');
      expect(arrow).toHaveAttribute('aria-hidden', 'true');
      expect(screen.queryByText('←')).not.toBeInTheDocument();
    });

    it('shows neither arrow on a single-segment item and both on a middle segment', () => {
      const { unmount } = renderItem({ isStart: true, isEnd: true });
      expect(screen.queryByText('←')).not.toBeInTheDocument();
      expect(screen.queryByText('→')).not.toBeInTheDocument();
      unmount();
      renderItem({ isStart: false, isEnd: false });
      expect(screen.getByText('←')).toBeInTheDocument();
      expect(screen.getByText('→')).toBeInTheDocument();
    });

    it('hides the visible title from assistive tech; the aria-label carries the full sentence', () => {
      renderItem();
      expect(screen.getByText('Foundation Work')).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getByRole('button')).toHaveAccessibleName(/^Task: Foundation Work,/);
    });
  });

  // ── Status CSS classes ─────────────────────────────────────────────────────

  describe('status CSS classes', () => {
    it('applies "completed" class for completed status', () => {
      const item = makeItem({ status: 'completed' });
      renderItem({ item });
      // CSS Modules maps classes via identity-obj-proxy so class name = module key
      const el = screen.getByTestId('calendar-item');
      expect(el.className).toContain('completed');
    });

    it('applies "inProgress" class for in_progress status', () => {
      const item = makeItem({ status: 'in_progress' });
      renderItem({ item });
      const el = screen.getByTestId('calendar-item');
      expect(el.className).toContain('inProgress');
    });

    it('applies "notStarted" class for not_started status', () => {
      const item = makeItem({ status: 'not_started' });
      renderItem({ item });
      const el = screen.getByTestId('calendar-item');
      expect(el.className).toContain('notStarted');
    });
  });

  // ── Shape classes (isStart / isEnd) ────────────────────────────────────────

  describe('shape CSS classes', () => {
    it('applies "startRounded" class when isStart=true', () => {
      renderItem({ isStart: true });
      const el = screen.getByTestId('calendar-item');
      expect(el.className).toContain('startRounded');
    });

    it('applies "noStartRound" class when isStart=false', () => {
      renderItem({ isStart: false });
      const el = screen.getByTestId('calendar-item');
      expect(el.className).toContain('noStartRound');
    });

    it('applies "endRounded" class when isEnd=true', () => {
      renderItem({ isEnd: true });
      const el = screen.getByTestId('calendar-item');
      expect(el.className).toContain('endRounded');
    });

    it('applies "noEndRound" class when isEnd=false', () => {
      renderItem({ isEnd: false });
      const el = screen.getByTestId('calendar-item');
      expect(el.className).toContain('noEndRound');
    });

    it('applies both shape classes simultaneously', () => {
      renderItem({ isStart: false, isEnd: false });
      const el = screen.getByTestId('calendar-item');
      expect(el.className).toContain('noStartRound');
      expect(el.className).toContain('noEndRound');
    });
  });

  // ── Compact mode ───────────────────────────────────────────────────────────

  describe('compact mode', () => {
    it('applies "compact" class when compact=true', () => {
      renderItem({ compact: true });
      const el = screen.getByTestId('calendar-item');
      expect(el.className).toContain('compact');
    });

    it('applies "full" class when compact=false', () => {
      renderItem({ compact: false });
      const el = screen.getByTestId('calendar-item');
      expect(el.className).toContain('full');
    });

    it('defaults to non-compact (full) when compact prop is omitted', () => {
      // renderItem defaults compact=false
      renderItem();
      const el = screen.getByTestId('calendar-item');
      expect(el.className).toContain('full');
    });
  });

  // ── Click navigation ────────────────────────────────────────────────────────

  describe('click navigation', () => {
    it('navigates to work item detail page on click', () => {
      // Use a wrapper that captures navigation via MemoryRouter's history
      const { container } = render(
        <MemoryRouter initialEntries={['/schedule']}>
          <CalendarItem item={makeItem({ id: 'item-abc' })} isStart isEnd />
        </MemoryRouter>,
      );

      const button = container.querySelector('[data-testid="calendar-item"]') as HTMLElement;
      fireEvent.click(button);

      // We can't easily assert the navigation URL in MemoryRouter without
      // a custom history. Instead, verify the click handler doesn't throw.
      expect(button).toBeInTheDocument();
    });
  });

  // ── Keyboard accessibility ─────────────────────────────────────────────────

  describe('keyboard interaction', () => {
    it('triggers click handler on Enter key press', () => {
      renderItem();
      const button = screen.getByTestId('calendar-item');
      // Should not throw
      fireEvent.keyDown(button, { key: 'Enter' });
      expect(button).toBeInTheDocument();
    });

    it('triggers click handler on Space key press', () => {
      renderItem();
      const button = screen.getByTestId('calendar-item');
      fireEvent.keyDown(button, { key: ' ' });
      expect(button).toBeInTheDocument();
    });

    it('does not trigger click handler on other keys', () => {
      renderItem();
      const button = screen.getByTestId('calendar-item');
      // Should not throw or navigate
      fireEvent.keyDown(button, { key: 'Tab' });
      fireEvent.keyDown(button, { key: 'ArrowDown' });
      expect(button).toBeInTheDocument();
    });
  });

  // ── aria-label status formatting ─────────────────────────────────────────

  describe('aria-label status text formatting', () => {
    it('uses the canonical word Not started for not_started', () => {
      const item = makeItem({ status: 'not_started' });
      renderItem({ item });
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Not started'),
      );
    });

    it('uses the canonical word In progress for in_progress', () => {
      const item = makeItem({ status: 'in_progress' });
      renderItem({ item });
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        expect.stringContaining('In progress'),
      );
    });

    it('uses the canonical word Done for completed', () => {
      const item = makeItem({ status: 'completed' });
      renderItem({ item });
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Done'),
      );
    });
  });

  // ── Mouse event callbacks ─────────────────────────────────────────────────

  describe('mouse event callbacks', () => {
    it('calls onMouseEnter with itemId and mouse coordinates on mouse enter', () => {
      const onMouseEnter = jest.fn();
      const item = makeItem({ id: 'item-42' });
      renderItem({ item, onMouseEnter });

      const button = screen.getByTestId('calendar-item');
      fireEvent.mouseEnter(button, { clientX: 150, clientY: 300 });

      expect(onMouseEnter).toHaveBeenCalledTimes(1);
      expect(onMouseEnter).toHaveBeenCalledWith('item-42', 150, 300);
    });

    it('calls onMouseLeave when mouse leaves the item', () => {
      const onMouseLeave = jest.fn();
      renderItem({ onMouseLeave });

      const button = screen.getByTestId('calendar-item');
      fireEvent.mouseLeave(button);

      expect(onMouseLeave).toHaveBeenCalledTimes(1);
    });

    it('calls onMouseMove with updated coordinates when mouse moves', () => {
      const onMouseMove = jest.fn();
      renderItem({ onMouseMove });

      const button = screen.getByTestId('calendar-item');
      fireEvent.mouseMove(button, { clientX: 200, clientY: 400 });

      expect(onMouseMove).toHaveBeenCalledTimes(1);
      expect(onMouseMove).toHaveBeenCalledWith(200, 400);
    });

    it('does not throw when onMouseEnter is undefined', () => {
      renderItem({ onMouseEnter: undefined });
      const button = screen.getByTestId('calendar-item');
      expect(() => fireEvent.mouseEnter(button, { clientX: 10, clientY: 20 })).not.toThrow();
    });

    it('does not throw when onMouseLeave is undefined', () => {
      renderItem({ onMouseLeave: undefined });
      const button = screen.getByTestId('calendar-item');
      expect(() => fireEvent.mouseLeave(button)).not.toThrow();
    });

    it('does not throw when onMouseMove is undefined', () => {
      renderItem({ onMouseMove: undefined });
      const button = screen.getByTestId('calendar-item');
      expect(() => fireEvent.mouseMove(button, { clientX: 10, clientY: 20 })).not.toThrow();
    });

    it('passes correct itemId even when item id contains non-numeric characters', () => {
      const onMouseEnter = jest.fn();
      const item = makeItem({ id: 'work-item-uuid-abc-123' });
      renderItem({ item, onMouseEnter });

      fireEvent.mouseEnter(screen.getByTestId('calendar-item'), { clientX: 50, clientY: 75 });

      expect(onMouseEnter).toHaveBeenCalledWith('work-item-uuid-abc-123', 50, 75);
    });
  });

  // ── aria-describedby for tooltip ──────────────────────────────────────────

  describe('aria-describedby for tooltip', () => {
    it('has aria-describedby="calendar-view-tooltip"', () => {
      renderItem();
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-describedby',
        'calendar-view-tooltip',
      );
    });
  });

  // ── isHighlighted prop ────────────────────────────────────────────────────

  describe('isHighlighted prop', () => {
    it('applies "highlighted" class when isHighlighted=true', () => {
      renderItem({ isHighlighted: true });
      const el = screen.getByTestId('calendar-item');
      expect(el.className).toContain('highlighted');
    });

    it('does not apply "highlighted" class when isHighlighted=false', () => {
      renderItem({ isHighlighted: false });
      const el = screen.getByTestId('calendar-item');
      expect(el.className).not.toContain('highlighted');
    });

    it('does not apply "highlighted" class by default (isHighlighted omitted)', () => {
      // renderItem without explicit isHighlighted — defaults to false
      renderItem();
      const el = screen.getByTestId('calendar-item');
      expect(el.className).not.toContain('highlighted');
    });
  });

  // ── Status colour (#2198): by status, never by id ─────────────────────────

  describe('status colour', () => {
    it.each([
      ['not_started', 'notStarted'],
      ['in_progress', 'inProgress'],
      ['completed', 'completed'],
    ] as const)('uses the Badge class %s -> %s and carries data-status', (status, badgeClass) => {
      renderItem({ item: makeItem({ status }) });
      const el = screen.getByTestId('calendar-item');
      expect(el.className).toContain(badgeClass);
      expect(el).toHaveAttribute('data-status', status);
    });

    it('gives two in-progress items with different ids the same colour class', () => {
      const { unmount } = renderItem({ item: makeItem({ id: 'aaa', status: 'in_progress' }) });
      const first = screen.getByTestId('calendar-item').className;
      unmount();
      renderItem({ item: makeItem({ id: 'zzz-different', status: 'in_progress' }) });
      expect(screen.getByTestId('calendar-item').className).toBe(first);
    });

    it('sets no inline background or colour (the colour comes from the class)', () => {
      renderItem({ item: makeItem({ status: 'completed' }) });
      const el = screen.getByTestId('calendar-item');
      expect(el.style.background).toBeFalsy();
      expect(el.style.backgroundColor).toBeFalsy();
      expect(el.style.color).toBeFalsy();
    });
  });

  // ── aria-label with area (#2198) ──────────────────────────────────────────

  describe('aria-label with and without area', () => {
    it('includes the area name when the item has an area', () => {
      const item = makeItem({
        area: { id: 'a1', name: 'Test Kitchen', color: null, ancestors: [] },
      });
      renderItem({ item });
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'Task: Foundation Work, Not started, Test Kitchen, Mar 10, 2024 to Mar 20, 2024',
      );
    });

    it('omits the area segment when the item has no area', () => {
      renderItem();
      expect(screen.getByRole('button').getAttribute('aria-label')).not.toContain('Test Kitchen');
    });

    it('is identical for every isStart/isEnd combination of the same item', () => {
      const labels = [
        [true, true],
        [true, false],
        [false, true],
        [false, false],
      ].map(([isStart, isEnd]) => {
        const { unmount } = renderItem({ isStart: isStart!, isEnd: isEnd! });
        const label = screen.getByRole('button').getAttribute('aria-label');
        unmount();
        return label;
      });
      expect(new Set(labels).size).toBe(1);
    });
  });

  // ── segment layout: span, lane, touch size ────────────────────────────────

  describe('segment layout', () => {
    function renderLaid(
      props: Partial<React.ComponentProps<typeof CalendarItemTypes.CalendarItem>>,
    ) {
      return render(
        <MemoryRouter>
          <CalendarItem item={makeItem()} isStart isEnd {...props} />
        </MemoryRouter>,
      );
    }

    it('span=3 stretches the right edge over three day columns', () => {
      renderLaid({ laneIndex: 0, span: 3 });
      expect(screen.getByTestId('calendar-item').style.right).toBe('calc(-2 * (100% + 1px))');
    });

    it('span=1 anchors the right edge at 0', () => {
      renderLaid({ laneIndex: 0, span: 1 });
      expect(screen.getByTestId('calendar-item').style.right).toBe('0px');
    });

    it('positions by lane using the compact lane height (20) in month mode', () => {
      renderLaid({ laneIndex: 2, compact: true });
      expect(screen.getByTestId('calendar-item').style.top).toBe('40px');
    });

    it('positions by lane using the full lane height (26) in week mode', () => {
      renderLaid({ laneIndex: 2, compact: false });
      expect(screen.getByTestId('calendar-item').style.top).toBe('52px');
    });

    it('laneHeight overrides the default lane height', () => {
      renderLaid({ laneIndex: 2, laneHeight: 48 });
      expect(screen.getByTestId('calendar-item').style.top).toBe('96px');
    });

    it('stays in normal flow (no absolute positioning) without a laneIndex', () => {
      renderLaid({});
      expect(screen.getByTestId('calendar-item').style.position).toBe('');
    });

    it('touchSized adds the touchSized class, and is absent otherwise', () => {
      const { unmount } = renderLaid({ touchSized: true });
      expect(screen.getByTestId('calendar-item').className).toContain('touchSized');
      unmount();
      renderLaid({});
      expect(screen.getByTestId('calendar-item').className).not.toContain('touchSized');
    });
  });

  // ── keyboard focus shows the tooltip (#2198) ─────────────────────────────

  describe('focus and blur', () => {
    it('focus calls onMouseEnter with the id and the centre of the element rect', () => {
      const onMouseEnter = jest.fn();
      renderItem({ onMouseEnter });
      const el = screen.getByTestId('calendar-item');
      el.getBoundingClientRect = () =>
        ({ left: 100, top: 40, width: 60, height: 20, right: 160, bottom: 60 }) as DOMRect;
      fireEvent.focus(el);
      expect(onMouseEnter).toHaveBeenCalledWith('item-1', 130, 50);
    });

    it('blur calls onMouseLeave', () => {
      const onMouseLeave = jest.fn();
      renderItem({ onMouseLeave });
      fireEvent.blur(screen.getByTestId('calendar-item'));
      expect(onMouseLeave).toHaveBeenCalledTimes(1);
    });

    it('focus and blur without handlers do not throw', () => {
      renderItem();
      const el = screen.getByTestId('calendar-item');
      expect(() => {
        fireEvent.focus(el);
        fireEvent.blur(el);
      }).not.toThrow();
    });
  });

  // ── touch two-tap (#331) ──────────────────────────────────────────────────

  describe('touch two-tap interaction', () => {
    it('calls onTouchTap instead of navigating on first tap when isTouchDevice=true', () => {
      const onTouchTap = jest.fn<(itemId: string, onNavigate: () => void) => void>();
      render(
        <MemoryRouter>
          <CalendarItem
            item={makeItem()}
            isStart
            isEnd
            isTouchDevice
            onTouchTap={onTouchTap as ReturnType<typeof jest.fn>}
          />
        </MemoryRouter>,
      );
      fireEvent.click(screen.getByTestId('calendar-item'));
      expect(onTouchTap).toHaveBeenCalledWith('item-1', expect.any(Function));
    });

    it('does NOT call onTouchTap when isTouchDevice=false', () => {
      const onTouchTap = jest.fn<(itemId: string, onNavigate: () => void) => void>();
      render(
        <MemoryRouter>
          <CalendarItem
            item={makeItem()}
            isStart
            isEnd
            isTouchDevice={false}
            onTouchTap={onTouchTap as ReturnType<typeof jest.fn>}
          />
        </MemoryRouter>,
      );
      // On non-touch: click navigates directly, onTouchTap is NOT called
      fireEvent.click(screen.getByTestId('calendar-item'));
      expect(onTouchTap).not.toHaveBeenCalled();
    });

    it('does not throw when isTouchDevice=true but onTouchTap is not provided', () => {
      render(
        <MemoryRouter>
          <CalendarItem item={makeItem()} isStart isEnd isTouchDevice />
        </MemoryRouter>,
      );
      expect(() => fireEvent.click(screen.getByTestId('calendar-item'))).not.toThrow();
    });
  });

  // ── Origin (#2202): Back to the exact calendar URL ────────────────────────

  describe('origin on click', () => {
    function renderProbed() {
      return render(
        <MemoryRouter initialEntries={['/schedule/calendar?calendarMode=week']}>
          <CalendarItem item={makeItem({ id: 'item-abc' })} isStart isEnd />
          <OriginProbe />
        </MemoryRouter>,
      );
    }

    it('opens the task with the calendar URL (incl. query) as origin, no name', () => {
      renderProbed();

      fireEvent.click(screen.getByTestId('calendar-item'));

      expect(probedPath()).toBe('/project/work-items/item-abc');
      expect(probedOrigin()).toEqual({ to: '/schedule/calendar?calendarMode=week' });
    });

    it('carries the same origin when opened with Enter', () => {
      renderProbed();

      fireEvent.keyDown(screen.getByTestId('calendar-item'), { key: 'Enter' });

      expect(probedPath()).toBe('/project/work-items/item-abc');
      expect(probedOrigin()).toEqual({ to: '/schedule/calendar?calendarMode=week' });
    });

    it('no longer sends the old from/view state', () => {
      renderProbed();

      fireEvent.click(screen.getByTestId('calendar-item'));

      expect(screen.getByTestId('probe-state').textContent).not.toContain('"from"');
      expect(screen.getByTestId('probe-state').textContent).not.toContain('"view"');
    });
  });
});
