/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { useRef, useState } from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { TimelineResponse } from '@cornerstone/shared';
import type * as StatusChangeApiModule from '../../lib/statusChangeApi.js';
import type { GanttPreviewGhost } from '../../components/GanttChart/GanttChart.js';
import { installMatchMedia, type MatchMediaControl } from '../../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import {
  makeMilestone,
  makePurchase,
  makeTask,
  makeTimeline,
} from '../../test/scheduleFixtures.js';

const run = jest.fn<(options: Record<string, unknown>) => Promise<void>>();
const changeWorkItemStatus = jest.fn<typeof StatusChangeApiModule.changeWorkItemStatus>();
const changeHouseholdItemStatus = jest.fn<typeof StatusChangeApiModule.changeHouseholdItemStatus>();
const changeMilestoneStatus = jest.fn<typeof StatusChangeApiModule.changeMilestoneStatus>();
const applyTo = { current: 'completed' };
const reschedulePanelProps: { current: Record<string, unknown> | null } = { current: null };

const realStatusChangeApi = await import('../../lib/statusChangeApi.js');

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());
jest.unstable_mockModule('../../lib/localDate.js', () => ({
  todayLocalIsoDate: () => '2026-03-10',
}));
jest.unstable_mockModule('../../hooks/useUndoableStatusChange.js', () => ({
  useUndoableStatusChange: () => ({ run }),
}));
jest.unstable_mockModule('../../lib/statusChangeApi.js', () => ({
  ...realStatusChangeApi,
  changeWorkItemStatus,
  changeHouseholdItemStatus,
  changeMilestoneStatus,
}));
jest.unstable_mockModule('../../components/StatusMenu/StatusMenu.js', () => ({
  StatusMenu: (props: {
    badge: { value: string };
    currentLabel: string;
    testId: string;
    onApply: (to: string, date?: string) => void;
  }) => (
    <button
      type="button"
      data-testid={props.testId}
      data-value={props.badge.value}
      onClick={() => props.onApply(applyTo.current, '2026-03-09')}
    >
      {props.currentLabel}
    </button>
  ),
}));
jest.unstable_mockModule('../../components/CallButton/CallButton.js', () => ({
  CallButton: (props: { phone: string; name: string; testId: string }) => (
    <a href={`tel:${props.phone}`} data-testid={props.testId}>
      Call {props.name}
    </a>
  ),
}));
jest.unstable_mockModule('../../components/ReschedulePanel/ReschedulePanel.js', () => ({
  ReschedulePanel: (props: Record<string, unknown>) => {
    reschedulePanelProps.current = props;
    return <div data-testid="reschedule-stub" />;
  },
}));

const { ScheduleItemPanel } = await import('./ScheduleItemPanel.js');
const { SIDE_PANEL_DOCKED_QUERY } = await import('../../components/Modal/SidePanel.js');

let media: MatchMediaControl;

const DATA: TimelineResponse = makeTimeline({
  workItems: [
    makeTask('a', {
      title: 'Roof',
      status: 'in_progress',
      durationDays: 4,
      requiredMilestoneIds: [2],
      assignedVendor: {
        id: 'v1',
        name: 'Roof Co',
        trade: { id: 'tr', name: 'Roofing', color: null, translationKey: null } as never,
        phone: '+49 30 123',
      },
      assignedUser: { id: 'u1', displayName: 'Sam Builder', email: 'sam@example.test' } as never,
    }),
    makeTask('b', { title: 'Windows', status: 'completed' }),
    makeTask('late', {
      title: 'Plaster',
      isLate: true,
      lateDays: 3,
      startDate: '2026-02-20',
      endDate: '2026-02-25',
      projectedStartDate: '2026-03-02',
      projectedEndDate: '2026-03-06',
    }),
    makeTask('held', { title: 'Paint', isHeldUp: true }),
    makeTask('bare', {
      title: 'Bare',
      projectedStartDate: null,
      projectedEndDate: null,
      durationDays: null,
      assignedVendor: { id: 'v2', name: 'No Trade Co', trade: null, phone: null },
    }),
    makeTask('endOnly', {
      title: 'EndOnly',
      projectedStartDate: null,
      projectedEndDate: '2026-03-12',
    }),
    makeTask('done', { title: 'Done task', status: 'completed' }),
  ],
  dependencies: [
    { predecessorId: 'b', successorId: 'a', dependencyType: 'finish_to_start', leadLagDays: 0 },
    { predecessorId: 'a', successorId: 'late', dependencyType: 'start_to_start', leadLagDays: 0 },
  ],
  milestones: [
    makeMilestone(1, { title: 'Dry shell', workItemIds: ['a'], isCritical: true }),
    makeMilestone(2, { title: 'Gate', projectedDate: '2026-03-25' }),
    makeMilestone(3, {
      title: 'Reached',
      isCompleted: true,
      completedAt: '2026-03-01T09:00:00.000Z',
    }),
  ],
  householdItems: [
    makePurchase('sofa', {
      name: 'Sofa',
      earliestDeliveryDate: '2026-03-12',
      latestDeliveryDate: '2026-03-20',
      targetDeliveryDate: '2026-03-15',
      dependencyIds: [{ predecessorType: 'work_item', predecessorId: 'a' }],
    }),
    makePurchase('lamp', {
      name: 'Lamp',
      isLate: true,
      latestDeliveryDate: '2026-03-05',
      earliestDeliveryDate: '2026-03-05',
    }),
    makePurchase('chair', { name: 'Chair', actualDeliveryDate: '2026-03-03', status: 'arrived' }),
    makePurchase('table', { name: 'Table', earliestDeliveryDate: '2026-03-18' }),
    makePurchase('nodate', { name: 'Nodate' }),
  ],
  criticalPath: ['a'],
  holdsUp: {
    workItems: {
      a: { count: 2, startingWithin14Days: 1 },
      b: { count: 0, startingWithin14Days: 0 },
    },
    milestones: { '1': { count: 3, startingWithin14Days: 0 } },
  } as never,
});

function Host({
  initial,
  data = DATA,
  onClose,
  onChanged,
  onPreviewChange,
}: {
  initial: Parameters<typeof ScheduleItemPanel>[0]['subject'];
  data?: TimelineResponse;
  onClose: () => void;
  onChanged: () => void;
  onPreviewChange: (ghosts: readonly GanttPreviewGhost[]) => void;
}) {
  const [subject, setSubject] = useState(initial);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <MemoryRouter>
      <button ref={ref} type="button">
        opener
      </button>
      <button type="button" onClick={() => setSubject('task:late')}>
        switch
      </button>
      <ScheduleItemPanel
        subject={subject}
        data={data}
        returnFocusRef={ref}
        onClose={() => {
          onClose();
          setSubject(null);
        }}
        onChanged={onChanged}
        onPreviewChange={onPreviewChange}
      />
    </MemoryRouter>
  );
}

function setup(
  initial: Parameters<typeof ScheduleItemPanel>[0]['subject'],
  data: TimelineResponse = DATA,
) {
  const handlers = {
    onClose: jest.fn<() => void>(),
    onChanged: jest.fn<() => void>(),
    onPreviewChange: jest.fn<(g: readonly GanttPreviewGhost[]) => void>(),
  };
  const utils = render(<Host initial={initial} data={data} {...handlers} />);
  return { ...utils, ...handlers };
}

const panel = () => screen.getByTestId('schedule-panel');

beforeEach(() => {
  media = installMatchMedia({ [SIDE_PANEL_DOCKED_QUERY]: true, '(min-width: 768px)': true });
  run.mockReset();
  run.mockResolvedValue(undefined);
  changeWorkItemStatus.mockReset();
  changeHouseholdItemStatus.mockReset();
  changeMilestoneStatus.mockReset();
  reschedulePanelProps.current = null;
  applyTo.current = 'completed';
});

afterEach(() => {
  media.restore();
  delete document.documentElement.dataset.scrollLocked;
});

describe('ScheduleItemPanel visibility', () => {
  it('renders nothing for a null subject or a row that is not in the timeline', () => {
    const { unmount } = setup(null);
    expect(screen.queryByTestId('schedule-panel')).toBeNull();
    unmount();
    setup('task:ghost');
    expect(screen.queryByTestId('schedule-panel')).toBeNull();
  });

  it('shows the title as the panel heading and closes with the close button', () => {
    const { onClose } = setup('task:a');
    expect(within(panel()).getByRole('heading', { level: 2, name: 'Roof' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('schedule-panel-close'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ScheduleItemPanel task', () => {
  it('shows status, the open link, dates, duration, company with trade, call button and owner', () => {
    setup('task:a');
    expect(screen.getByTestId('schedule-panel-status')).toHaveAttribute(
      'data-value',
      'in_progress',
    );
    expect(screen.getByTestId('schedule-panel-open-link')).toHaveTextContent('Open task');
    expect(screen.getByTestId('schedule-panel-open-link').getAttribute('href')).toContain('/a');
    expect(screen.getByTestId('schedule-panel-when')).toHaveTextContent('4 days');
    expect(screen.getByTestId('schedule-panel-company')).toHaveTextContent('Roof Co');
    expect(screen.getByTestId('schedule-panel-who')).toHaveTextContent('Roofing');
    expect(screen.getByTestId('schedule-panel-call')).toHaveAttribute('href', 'tel:+49 30 123');
    expect(screen.getByTestId('schedule-panel-who')).toHaveTextContent('Sam Builder');
  });

  it('shows a company without trade or phone, and "No company yet" without a company', () => {
    const { unmount } = setup('task:bare');
    expect(screen.getByTestId('schedule-panel-company')).toHaveTextContent('No Trade Co');
    expect(screen.queryByTestId('schedule-panel-call')).toBeNull();
    expect(screen.getByTestId('schedule-panel-when')).toHaveTextContent('No dates yet');
    unmount();
    setup('task:held');
    expect(screen.getByTestId('schedule-panel-who')).toHaveTextContent('No company yet');
  });

  it('shows one date when the task has only an end', () => {
    setup('task:endOnly');
    expect(screen.getByTestId('schedule-panel-when').querySelectorAll('p')).toHaveLength(2);
  });

  it('a late task shows the Late chip and the planned-versus-now line', () => {
    setup('task:late');
    expect(screen.getByTestId('schedule-panel-signal')).toHaveTextContent(/Late/);
    expect(screen.getByTestId('schedule-panel-when')).toHaveTextContent(/Planned .*; now ends /);
  });

  it('a held-up task shows the Held up chip', () => {
    setup('task:held');
    expect(screen.getByTestId('schedule-panel-signal')).toHaveTextContent(/Held up/);
  });

  it('a completed task has no signal chip and no Reschedule button', () => {
    setup('task:b');
    expect(screen.queryByTestId('schedule-panel-signal')).toBeNull();
    expect(screen.queryByTestId('schedule-panel-reschedule')).toBeNull();
  });

  it('shows the Critical chip for a task on the critical path only', () => {
    const { unmount } = setup('task:a');
    expect(screen.getByTestId('schedule-panel-critical')).toBeInTheDocument();
    unmount();
    setup('task:held');
    expect(screen.queryByTestId('schedule-panel-critical')).toBeNull();
  });

  it('lists what it waits for and what it holds up with ← and → and relation sentences', () => {
    setup('task:a');
    const waits = screen.getByTestId('schedule-panel-waits-for');
    expect(within(waits).getByTestId('schedule-panel-relation-task:b')).toHaveTextContent(
      'Finishes before this starts',
    );
    expect(within(waits).getByTestId('schedule-panel-relation-task:b')).toHaveTextContent('←');
    expect(within(waits).getByTestId('schedule-panel-relation-milestone:2')).toHaveTextContent(
      'Starts once it is reached',
    );
    const holds = screen.getByTestId('schedule-panel-holds-up');
    expect(within(holds).getByTestId('schedule-panel-relation-task:late')).toHaveTextContent(
      'Starts after this starts',
    );
    expect(within(holds).getByTestId('schedule-panel-relation-task:late')).toHaveTextContent('→');
    expect(within(holds).getByTestId('schedule-panel-relation-milestone:1')).toHaveTextContent(
      'Counts toward',
    );
    expect(within(holds).getByTestId('schedule-panel-relation-purchase:sofa')).toHaveTextContent(
      'Delivery waits for this',
    );
  });

  it('marks the holds-up count with data-figure only when above zero', () => {
    const { unmount } = setup('task:a');
    const figure = screen.getByTestId('schedule-panel-holds-up-figure');
    expect(figure).toHaveAttribute('data-figure', 'holds-up');
    expect(figure).toHaveTextContent('Holds up 2 tasks');
    unmount();
    setup('task:done');
    expect(screen.queryByTestId('schedule-panel-holds-up-figure')).toBeNull();
    expect(screen.getByTestId('schedule-panel-holds-up')).toHaveTextContent(
      'Nothing waits for this.',
    );
  });

  it('says nothing is waited for when there are no predecessors', () => {
    setup('task:held');
    expect(screen.getByTestId('schedule-panel-waits-for')).toHaveTextContent(
      'Nothing. It can start any time.',
    );
  });

  it('applies a status change through the undoable runner and reloads', async () => {
    const { onChanged } = setup('task:a');
    fireEvent.click(screen.getByTestId('schedule-panel-status'));
    expect(run).toHaveBeenCalledTimes(1);
    const options = run.mock.calls[0]![0] as {
      request: () => Promise<unknown>;
      recordName: string;
      dedupeKey: string;
      onChanged: () => void;
      onUndone: () => void;
    };
    expect(options.recordName).toBe('Roof');
    expect(options.dedupeKey).toBe('task:a');
    changeWorkItemStatus.mockResolvedValue({} as never);
    await options.request();
    expect(changeWorkItemStatus).toHaveBeenCalledWith('a', expect.anything());
    options.onChanged();
    options.onUndone();
    expect(onChanged).toHaveBeenCalledTimes(2);
  });
});

describe('ScheduleItemPanel milestone', () => {
  it('shows target and projection, contributing tasks and the tasks it holds up', () => {
    setup('milestone:2');
    expect(screen.getByTestId('schedule-panel-open-link')).toHaveTextContent('Open milestone');
    expect(screen.getByTestId('schedule-panel-when')).toHaveTextContent(/Target /);
    expect(screen.getByTestId('schedule-panel-when')).toHaveTextContent(/Projected /);
    expect(screen.getByTestId('schedule-panel-holds-up')).toHaveTextContent(
      'Waiting for this milestone',
    );
    expect(screen.queryByTestId('schedule-panel-who')).toBeNull();
    expect(screen.queryByTestId('schedule-panel-reschedule')).toBeNull();
  });

  it('shows the reached date for a reached milestone', () => {
    setup('milestone:3');
    expect(screen.getByTestId('schedule-panel-when')).toHaveTextContent(/Reached /);
    expect(screen.getByTestId('schedule-panel-when')).not.toHaveTextContent(/Projected/);
  });

  it('a milestone with a projection less its target is just the target line', () => {
    setup('milestone:1');
    expect(screen.getByTestId('schedule-panel-when').querySelectorAll('p')).toHaveLength(1);
  });

  it('shows the Critical chip and the holds-up figure keyed by the stringified id', () => {
    setup('milestone:1');
    expect(screen.getByTestId('schedule-panel-critical')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-panel-holds-up-figure')).toHaveTextContent(
      'Holds up 3 tasks',
    );
    expect(screen.getByTestId('schedule-panel-waits-for')).toHaveTextContent('Counts toward');
  });

  it('applies a milestone status change', async () => {
    applyTo.current = 'reached';
    setup('milestone:2');
    fireEvent.click(screen.getByTestId('schedule-panel-status'));
    const options = run.mock.calls[0]![0] as {
      request: () => Promise<unknown>;
      statusLabel: string;
      dedupeKey: string;
    };
    expect(options.dedupeKey).toBe('milestone:2');
    changeMilestoneStatus.mockResolvedValue({} as never);
    await options.request();
    expect(changeMilestoneStatus).toHaveBeenCalledWith(2, expect.anything());
  });

  it('labels a revert of a reached milestone as upcoming', () => {
    applyTo.current = 'upcoming';
    setup('milestone:3');
    fireEvent.click(screen.getByTestId('schedule-panel-status'));
    expect((run.mock.calls[0]![0] as { statusLabel: string }).statusLabel).toBeTruthy();
  });
});

describe('ScheduleItemPanel purchase', () => {
  it('shows the delivery window and the target, waits for its predecessors and has no holds-up section', () => {
    setup('purchase:sofa');
    expect(screen.getByTestId('schedule-panel-open-link')).toHaveTextContent('Open purchase');
    expect(screen.getByTestId('schedule-panel-when')).toHaveTextContent(/Delivery between /);
    expect(screen.getByTestId('schedule-panel-when')).toHaveTextContent(/Target /);
    expect(screen.getByTestId('schedule-panel-waits-for')).toHaveTextContent(
      'Must be done before the delivery',
    );
    expect(screen.queryByTestId('schedule-panel-holds-up')).toBeNull();
    expect(screen.queryByTestId('schedule-panel-who')).toBeNull();
  });

  it('shows a delivered purchase, a single delivery date and no dates', () => {
    const { unmount } = setup('purchase:chair');
    expect(screen.getByTestId('schedule-panel-when')).toHaveTextContent(/Delivered /);
    unmount();
    const second = setup('purchase:table');
    expect(screen.getByTestId('schedule-panel-when')).toHaveTextContent(/^When\s*Delivery /);
    second.unmount();
    setup('purchase:nodate');
    expect(screen.getByTestId('schedule-panel-when')).toHaveTextContent('No dates yet');
  });

  it('a late purchase shows the Late chip, an on-time one does not', () => {
    const { unmount } = setup('purchase:lamp');
    expect(screen.getByTestId('schedule-panel-signal')).toHaveTextContent(/Late/);
    unmount();
    setup('purchase:sofa');
    expect(screen.queryByTestId('schedule-panel-signal')).toBeNull();
  });

  it('applies a purchase status change', async () => {
    applyTo.current = 'arrived';
    setup('purchase:sofa');
    fireEvent.click(screen.getByTestId('schedule-panel-status'));
    const options = run.mock.calls[0]![0] as { request: () => Promise<unknown>; dedupeKey: string };
    expect(options.dedupeKey).toBe('purchase:sofa');
    changeHouseholdItemStatus.mockResolvedValue({} as never);
    await options.request();
    expect(changeHouseholdItemStatus).toHaveBeenCalledWith('sofa', expect.anything());
  });
});

describe('ScheduleItemPanel Reschedule', () => {
  it('opens the Reschedule view with a Back button and a new title', () => {
    setup('task:held');
    fireEvent.click(screen.getByTestId('schedule-panel-reschedule'));
    expect(screen.getByTestId('reschedule-stub')).toBeInTheDocument();
    expect(within(panel()).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Reschedule Paint',
    );
    expect(screen.queryByTestId('schedule-panel-reschedule')).toBeNull();
    expect(screen.getByTestId('reschedule-back')).toBeInTheDocument();
  });

  it('is not offered for a task without a shown start', () => {
    setup('task:endOnly');
    expect(screen.queryByTestId('schedule-panel-reschedule')).toBeNull();
  });

  it('Back (and Cancel) return to the info view with focus on the Reschedule button', () => {
    setup('task:held');
    fireEvent.click(screen.getByTestId('schedule-panel-reschedule'));
    fireEvent.click(screen.getByTestId('reschedule-back'));
    expect(screen.getByTestId('schedule-panel-reschedule')).toHaveFocus();
    fireEvent.click(screen.getByTestId('schedule-panel-reschedule'));
    act(() => (reschedulePanelProps.current!.onCancel as () => void)());
    expect(screen.getByTestId('schedule-panel-reschedule')).toHaveFocus();
  });

  it('Saved reloads the timeline and returns focus to the panel heading', () => {
    const { onChanged } = setup('task:held');
    fireEvent.click(screen.getByTestId('schedule-panel-reschedule'));
    act(() => (reschedulePanelProps.current!.onSaved as () => void)());
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(within(panel()).getByRole('heading', { level: 2, name: 'Paint' })).toHaveFocus();
  });

  it('Undone reloads the timeline without leaving the view', () => {
    const { onChanged } = setup('task:held');
    fireEvent.click(screen.getByTestId('schedule-panel-reschedule'));
    act(() => (reschedulePanelProps.current!.onUndone as () => void)());
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('reschedule-stub')).toBeInTheDocument();
  });

  it('turns a preview into chart ghosts and clears them on leaving', () => {
    const { onPreviewChange } = setup('task:held');
    fireEvent.click(screen.getByTestId('schedule-panel-reschedule'));
    const change = reschedulePanelProps.current!.onPreviewChange as (
      p: { impact: unknown; newEnd: string } | null,
    ) => void;
    act(() =>
      change({
        newEnd: '2026-03-12',
        impact: {
          movedItems: [],
          milestones: [],
          projectEnd: { previousDate: null, newDate: null },
          holdsUp: { count: 0, startingWithin14Days: 0 },
        },
      }),
    );
    expect(onPreviewChange).toHaveBeenLastCalledWith([
      { rowKey: 'task:held', start: '2026-03-02', end: '2026-03-12' },
    ]);
    act(() => change(null));
    expect(onPreviewChange).toHaveBeenLastCalledWith([]);
    onPreviewChange.mockClear();
    fireEvent.click(screen.getByTestId('reschedule-back'));
    expect(onPreviewChange).toHaveBeenCalledWith([]);
  });

  it('switching to another row leaves the Reschedule view', () => {
    setup('task:held');
    fireEvent.click(screen.getByTestId('schedule-panel-reschedule'));
    fireEvent.click(screen.getByText('switch'));
    expect(screen.queryByTestId('reschedule-stub')).toBeNull();
    expect(within(panel()).getByRole('heading', { level: 2 })).toHaveTextContent('Plaster');
  });
});

describe('ScheduleItemPanel focus and viewports', () => {
  it('moves focus to the new heading when the shown row changes', () => {
    setup('task:held');
    fireEvent.click(screen.getByText('switch'));
    expect(within(panel()).getByRole('heading', { level: 2, name: 'Plaster' })).toHaveFocus();
  });

  it('is a dialog (side sheet) below 1440 px', () => {
    media.set(SIDE_PANEL_DOCKED_QUERY, false);
    setup('task:a');
    expect(screen.getByRole('dialog')).toBe(panel());
  });
});
