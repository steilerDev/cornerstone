/**
 * @jest-environment jsdom
 *
 * CalendarView — grid events for ids the view does not know (#2232 coverage).
 *
 * The grids report item and milestone ids back to CalendarView. A stale grid event (an item
 * removed by a refetch between render and event) must not open a tooltip or throw. The real
 * grids only emit known ids, so the grid is replaced with a stub that captures the callbacks.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { TimelineWorkItem, TimelineMilestone } from '@cornerstone/shared';
import type * as CalendarViewTypes from './CalendarView.js';
import type * as MonthGridTypes from './MonthGrid.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let captured: MonthGridTypes.MonthGridProps | null = null;

jest.unstable_mockModule('./MonthGrid.js', () => ({
  MonthGrid: (props: MonthGridTypes.MonthGridProps) => {
    captured = props;
    return <div data-testid="stub-month-grid" />;
  },
}));

let CalendarView: typeof CalendarViewTypes.CalendarView;

const KNOWN_TASK: TimelineWorkItem = {
  id: 'wi-known',
  title: 'Test Known Task',
  status: 'not_started',
  startDate: '2026-03-05',
  endDate: '2026-03-05',
  projectedStartDate: '2026-03-05',
  projectedEndDate: '2026-03-05',
  isLate: false,
  lateDays: null,
  isHeldUp: false,
  durationDays: 1,
  actualStartDate: null,
  actualEndDate: null,
  startAfter: null,
  startBefore: null,
  assignedUser: null,
  assignedVendor: null,
  area: null,
};

const KNOWN_MILESTONE: TimelineMilestone = {
  id: 1,
  title: 'Test Known Milestone',
  targetDate: '2026-03-10',
  isCompleted: false,
  completedAt: null,
  color: null,
  workItemIds: [],
  projectedDate: null,
  isLate: false,
  lateDays: null,
  isEarly: false,
  earlyDays: null,
  isCritical: false,
};

function grid(): MonthGridTypes.MonthGridProps {
  if (!captured) throw new Error('The stub grid has not rendered');
  return captured;
}

beforeEach(async () => {
  jest.useFakeTimers();
  captured = null;
  if (!CalendarView) {
    CalendarView = (await import('./CalendarView.js')).CalendarView;
  }
  render(
    <MemoryRouter>
      <CalendarView workItems={[KNOWN_TASK]} milestones={[KNOWN_MILESTONE]} />
    </MemoryRouter>,
  );
});

afterEach(() => {
  jest.useRealTimers();
});

describe('CalendarView — grid events for unknown ids (#2232 coverage)', () => {
  it('opens no tooltip when hovering an item that is no longer in the data', () => {
    act(() => {
      grid().onItemMouseEnter?.('wi-removed', 100, 100);
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.queryByTestId('gantt-tooltip')).not.toBeInTheDocument();
  });

  it('opens no tooltip when hovering a milestone that is no longer in the data', () => {
    act(() => {
      grid().onMilestoneMouseEnter?.(999, 100, 100);
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.queryByTestId('gantt-tooltip')).not.toBeInTheDocument();
  });

  it('opens no tooltip on a first tap of an item that is no longer in the data', () => {
    const onNavigate = jest.fn();
    act(() => {
      grid().onTouchTap?.('wi-removed', onNavigate);
    });
    expect(screen.queryByTestId('gantt-tooltip')).not.toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('still shows the tooltip for a known item through the same callbacks', () => {
    act(() => {
      grid().onItemMouseEnter?.('wi-known', 100, 100);
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.getByTestId('gantt-tooltip')).toHaveTextContent('Test Known Task');
  });
});
