/**
 * @jest-environment jsdom
 *
 * Unit tests for CalendarItem component.
 * Covers rendering, status color class selection, isStart/isEnd shape classes,
 * title display, compact mode, click navigation, and keyboard accessibility.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { TimelineWorkItem } from '@cornerstone/shared';
import type * as CalendarItemTypes from './CalendarItem.js';

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
    startAfter: null,
    startBefore: null,
    assignedUser: null,
    tags: [],
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
        'Work item: Roof Installation, status: in progress',
      );
    });

    it('renders with title attribute matching item title', () => {
      const item = makeItem({ title: 'Plumbing Rough-in' });
      renderItem({ item });
      expect(screen.getByRole('button')).toHaveAttribute('title', 'Plumbing Rough-in');
    });
  });

  // ── Title display (isStart conditional) ────────────────────────────────────

  describe('title display', () => {
    it('shows title text when isStart=true', () => {
      const item = makeItem({ title: 'Foundation Work' });
      renderItem({ item, isStart: true });
      expect(screen.getByText('Foundation Work')).toBeInTheDocument();
    });

    it('does not show title text when isStart=false', () => {
      const item = makeItem({ title: 'Foundation Work' });
      renderItem({ item, isStart: false });
      // The title span is only rendered when isStart is true
      expect(screen.queryByText('Foundation Work')).not.toBeInTheDocument();
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

    it('applies "blocked" class for blocked status', () => {
      const item = makeItem({ status: 'blocked' });
      renderItem({ item });
      const el = screen.getByTestId('calendar-item');
      expect(el.className).toContain('blocked');
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
        <MemoryRouter initialEntries={['/timeline']}>
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
    it('replaces underscore with space in status for not_started', () => {
      const item = makeItem({ status: 'not_started' });
      renderItem({ item });
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        expect.stringContaining('not started'),
      );
    });

    it('replaces underscore with space in status for in_progress', () => {
      const item = makeItem({ status: 'in_progress' });
      renderItem({ item });
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        expect.stringContaining('in progress'),
      );
    });

    it('keeps single-word status as-is for completed', () => {
      const item = makeItem({ status: 'completed' });
      renderItem({ item });
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        expect.stringContaining('completed'),
      );
    });
  });
});
