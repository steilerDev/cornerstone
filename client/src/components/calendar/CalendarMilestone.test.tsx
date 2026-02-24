/**
 * @jest-environment jsdom
 *
 * Unit tests for CalendarMilestone component.
 * Covers rendering, diamond icon, title display, click handler,
 * keyboard accessibility, and isCompleted styling.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { TimelineMilestone } from '@cornerstone/shared';
import type * as CalendarMilestoneTypes from './CalendarMilestone.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMilestone(overrides: Partial<TimelineMilestone> = {}): TimelineMilestone {
  return {
    id: 1,
    title: 'Foundation Complete',
    targetDate: '2024-06-30',
    isCompleted: false,
    completedAt: null,
    color: null,
    workItemIds: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let CalendarMilestone: typeof CalendarMilestoneTypes.CalendarMilestone;

beforeEach(async () => {
  if (!CalendarMilestone) {
    const module = await import('./CalendarMilestone.js');
    CalendarMilestone = module.CalendarMilestone;
  }
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderMilestone(
  props: Partial<{
    milestone: TimelineMilestone;
    onMilestoneClick: jest.Mock;
  }> = {},
) {
  const milestone = props.milestone ?? makeMilestone();
  return render(
    <CalendarMilestone milestone={milestone} onMilestoneClick={props.onMilestoneClick} />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CalendarMilestone', () => {
  // ── Basic rendering ────────────────────────────────────────────────────────

  describe('basic rendering', () => {
    it('renders with data-testid="calendar-milestone"', () => {
      renderMilestone();
      expect(screen.getByTestId('calendar-milestone')).toBeInTheDocument();
    });

    it('has role="button"', () => {
      renderMilestone();
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('has tabIndex=0 for keyboard accessibility', () => {
      renderMilestone();
      expect(screen.getByRole('button')).toHaveAttribute('tabindex', '0');
    });

    it('renders the milestone title text', () => {
      const milestone = makeMilestone({ title: 'Framing Complete' });
      renderMilestone({ milestone });
      expect(screen.getByText('Framing Complete')).toBeInTheDocument();
    });

    it('renders with title attribute matching milestone title', () => {
      const milestone = makeMilestone({ title: 'Roof Installed' });
      renderMilestone({ milestone });
      expect(screen.getByRole('button')).toHaveAttribute('title', 'Roof Installed');
    });

    it('renders a diamond SVG icon', () => {
      const { container } = renderMilestone();
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      // Diamond icon uses a polygon element
      expect(container.querySelector('polygon')).toBeInTheDocument();
    });
  });

  // ── Aria label ─────────────────────────────────────────────────────────────

  describe('aria-label', () => {
    it('includes title and "incomplete" for non-completed milestone', () => {
      const milestone = makeMilestone({ title: 'Frame Up', isCompleted: false });
      renderMilestone({ milestone });
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'Milestone: Frame Up, incomplete',
      );
    });

    it('includes title and "completed" for completed milestone', () => {
      const milestone = makeMilestone({ title: 'Foundation Done', isCompleted: true });
      renderMilestone({ milestone });
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'Milestone: Foundation Done, completed',
      );
    });
  });

  // ── CSS classes based on completion status ─────────────────────────────────

  describe('completion status CSS classes', () => {
    it('applies "milestoneIncomplete" class when isCompleted=false', () => {
      const milestone = makeMilestone({ isCompleted: false });
      renderMilestone({ milestone });
      const el = screen.getByTestId('calendar-milestone');
      expect(el.className).toContain('milestoneIncomplete');
    });

    it('applies "milestoneComplete" class when isCompleted=true', () => {
      const milestone = makeMilestone({ isCompleted: true });
      renderMilestone({ milestone });
      const el = screen.getByTestId('calendar-milestone');
      expect(el.className).toContain('milestoneComplete');
    });

    it('diamond icon applies "diamondIncomplete" class when isCompleted=false', () => {
      const milestone = makeMilestone({ isCompleted: false });
      const { container } = renderMilestone({ milestone });
      const svg = container.querySelector('svg');
      // SVG className is SVGAnimatedString in jsdom; use getAttribute instead
      expect(svg?.getAttribute('class')).toContain('diamondIncomplete');
    });

    it('diamond icon applies "diamondComplete" class when isCompleted=true', () => {
      const milestone = makeMilestone({ isCompleted: true });
      const { container } = renderMilestone({ milestone });
      const svg = container.querySelector('svg');
      // SVG className is SVGAnimatedString in jsdom; use getAttribute instead
      expect(svg?.getAttribute('class')).toContain('diamondComplete');
    });
  });

  // ── Click handler ──────────────────────────────────────────────────────────

  describe('click handler', () => {
    it('calls onMilestoneClick with milestone id on click', () => {
      const onMilestoneClick = jest.fn();
      const milestone = makeMilestone({ id: 42 });
      renderMilestone({ milestone, onMilestoneClick });

      fireEvent.click(screen.getByTestId('calendar-milestone'));

      expect(onMilestoneClick).toHaveBeenCalledWith(42);
      expect(onMilestoneClick).toHaveBeenCalledTimes(1);
    });

    it('does not throw when onMilestoneClick is undefined', () => {
      const milestone = makeMilestone({ id: 1 });
      renderMilestone({ milestone, onMilestoneClick: undefined });

      expect(() => {
        fireEvent.click(screen.getByTestId('calendar-milestone'));
      }).not.toThrow();
    });

    it('calls correct id for each milestone independently', () => {
      const onMilestoneClick = jest.fn();
      const milestoneA = makeMilestone({ id: 10 });
      const milestoneB = makeMilestone({ id: 20 });

      // Render both and click the first
      const { unmount } = render(
        <CalendarMilestone milestone={milestoneA} onMilestoneClick={onMilestoneClick} />,
      );
      fireEvent.click(screen.getByTestId('calendar-milestone'));
      expect(onMilestoneClick).toHaveBeenLastCalledWith(10);

      unmount();
      cleanup();

      render(
        <CalendarMilestone milestone={milestoneB} onMilestoneClick={onMilestoneClick} />,
      );
      fireEvent.click(screen.getByTestId('calendar-milestone'));
      expect(onMilestoneClick).toHaveBeenLastCalledWith(20);
    });
  });

  // ── Keyboard accessibility ─────────────────────────────────────────────────

  describe('keyboard interaction', () => {
    it('calls onMilestoneClick on Enter key press', () => {
      const onMilestoneClick = jest.fn();
      const milestone = makeMilestone({ id: 7 });
      renderMilestone({ milestone, onMilestoneClick });

      fireEvent.keyDown(screen.getByTestId('calendar-milestone'), { key: 'Enter' });

      expect(onMilestoneClick).toHaveBeenCalledWith(7);
    });

    it('calls onMilestoneClick on Space key press', () => {
      const onMilestoneClick = jest.fn();
      const milestone = makeMilestone({ id: 8 });
      renderMilestone({ milestone, onMilestoneClick });

      fireEvent.keyDown(screen.getByTestId('calendar-milestone'), { key: ' ' });

      expect(onMilestoneClick).toHaveBeenCalledWith(8);
    });

    it('does not call onMilestoneClick on other keys', () => {
      const onMilestoneClick = jest.fn();
      renderMilestone({ onMilestoneClick });

      const el = screen.getByTestId('calendar-milestone');
      fireEvent.keyDown(el, { key: 'Tab' });
      fireEvent.keyDown(el, { key: 'ArrowDown' });
      fireEvent.keyDown(el, { key: 'Escape' });

      expect(onMilestoneClick).not.toHaveBeenCalled();
    });
  });

  // ── SVG aria-hidden ────────────────────────────────────────────────────────

  describe('diamond icon accessibility', () => {
    it('diamond SVG has aria-hidden="true" (decorative)', () => {
      const { container } = renderMilestone();
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
