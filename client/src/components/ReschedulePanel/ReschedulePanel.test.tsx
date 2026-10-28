/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import type { ScheduleImpact } from '@cornerstone/shared';
import type * as WorkItemsApiModule from '../../lib/workItemsApi.js';
import type * as ReschedulePreviewModule from '../../hooks/useReschedulePreview.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeMilestone, makeTask } from '../../test/scheduleFixtures.js';

const mockUpdateWorkItem = jest.fn<typeof WorkItemsApiModule.updateWorkItem>();
const showToast = jest.fn<(variant: string, message: string) => void>();
const showUndoToast =
  jest.fn<(options: { message: string; onUndo: () => Promise<void> | void }) => void>();
const retry = jest.fn<() => void>();
const previewCalls: Array<[string, number | null]> = [];
const previewState: {
  status: 'idle' | 'loading' | 'ready' | 'error';
  impact: ScheduleImpact | null;
} = { status: 'idle', impact: null };

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());
const realWorkItemsApi = await import('../../lib/workItemsApi.js');
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  ...realWorkItemsApi,
  updateWorkItem: mockUpdateWorkItem,
}));
jest.unstable_mockModule('../../hooks/useReschedulePreview.js', () => ({
  RESCHEDULE_PREVIEW_DEBOUNCE_MS: 300,
  useReschedulePreview: (
    taskId: string,
    durationDays: number | null,
  ): ReturnType<typeof ReschedulePreviewModule.useReschedulePreview> => {
    previewCalls.push([taskId, durationDays]);
    return { ...previewState, retry } as never;
  },
}));
jest.unstable_mockModule('../Toast/ToastContext.js', () => ({
  useToast: () => ({ showToast, showUndoToast }),
}));

const { ReschedulePanel } = await import('./ReschedulePanel.js');
const { ApiClientError } = await import('../../lib/apiClient.js');

const TASK = makeTask('t1', {
  title: 'Roof',
  durationDays: 4,
  startDate: '2026-03-02',
  endDate: '2026-03-06',
});

function impactOf(o: Partial<ScheduleImpact> = {}): ScheduleImpact {
  return {
    movedItems: [],
    milestones: [],
    projectEnd: { previousDate: null, newDate: null },
    holdsUp: { count: 0, startingWithin14Days: 0 },
    ...o,
  };
}

function moved(id: string, o: Partial<ScheduleImpact['movedItems'][number]> = {}) {
  return {
    workItemId: id,
    previousEndDate: '2026-03-10',
    newEndDate: '2026-03-15',
    deltaDays: 5,
    isLate: false,
    ...o,
  };
}

const TIMELINE = {
  workItems: [
    makeTask('b', { title: 'Windows', endDate: '2026-03-01' }),
    makeTask('c', { title: 'Doors' }),
  ],
  milestones: [makeMilestone(1, { title: 'Shell closed' })],
};

function setup(props: Partial<Parameters<typeof ReschedulePanel>[0]> = {}) {
  const handlers = {
    onPreviewChange: jest.fn<(p: unknown) => void>(),
    onSaved: jest.fn<() => void>(),
    onUndone: jest.fn<() => void>(),
    onCancel: jest.fn<() => void>(),
  };
  const utils = render(
    <ReschedulePanel task={TASK} timeline={TIMELINE} {...handlers} {...props} />,
  );
  return { ...utils, ...handlers };
}

const lastPreviewArgs = () => previewCalls.at(-1)!;
const duration = () => screen.getByTestId('reschedule-duration') as HTMLInputElement;
const endInput = () => screen.getByTestId('reschedule-end') as HTMLInputElement;
const save = () => screen.getByTestId('reschedule-save');
const typeDuration = (value: string) => fireEvent.change(duration(), { target: { value } });
const typeEnd = (value: string) => fireEvent.change(endInput(), { target: { value } });
const pass = (ms = 300) => act(() => void jest.advanceTimersByTime(ms));

beforeEach(() => {
  jest.useFakeTimers();
  previewCalls.length = 0;
  previewState.status = 'idle';
  previewState.impact = null;
  mockUpdateWorkItem.mockReset();
  mockUpdateWorkItem.mockResolvedValue({} as never);
  showToast.mockReset();
  showUndoToast.mockReset();
  retry.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ReschedulePanel form', () => {
  it('starts with the shown start, the current end and duration, focus on the end date, nothing saveable', () => {
    const { onPreviewChange } = setup();
    expect(screen.getByTestId('reschedule-start')).toHaveTextContent('2026');
    expect(endInput().value).toBe('2026-03-06');
    expect(duration().value).toBe('4');
    expect(endInput()).toHaveFocus();
    expect(save()).toBeDisabled();
    expect(lastPreviewArgs()).toEqual(['t1', null]);
    expect(onPreviewChange).toHaveBeenLastCalledWith(null);
  });

  it('derives the duration from the dates when the task has none, at least 1', () => {
    setup({
      task: { ...TASK, durationDays: null, projectedEndDate: '2026-03-12', endDate: '2026-03-12' },
    });
    expect(duration().value).toBe('10');
  });

  it('a task without a duration or end gets one day', () => {
    setup({ task: { ...TASK, durationDays: null, projectedEndDate: null, endDate: null } });
    expect(duration().value).toBe('1');
  });

  it('uses the actual start when the task has begun', () => {
    setup({ task: { ...TASK, actualStartDate: '2026-03-03' } });
    expect(endInput().value).toBe('2026-03-07');
  });

  it('editing the duration asks for that duration and moves the end date after a pause', () => {
    setup();
    typeDuration('6');
    expect(lastPreviewArgs()).toEqual(['t1', 6]);
    expect(endInput().value).toBe('2026-03-06');
    pass();
    expect(endInput().value).toBe('2026-03-08');
  });

  it('editing the end date asks for the matching duration and moves the duration after a pause', () => {
    setup();
    typeEnd('2026-03-12');
    expect(lastPreviewArgs()).toEqual(['t1', 10]);
    pass();
    expect(duration().value).toBe('10');
  });

  it('does not follow into an unusable value', () => {
    setup();
    typeDuration('abc');
    pass();
    expect(endInput().value).toBe('2026-03-06');
    typeEnd('');
    pass();
    expect(duration().value).toBe('');
  });

  it('no change back to the original duration asks nothing', () => {
    setup();
    typeDuration('6');
    typeDuration('4');
    expect(lastPreviewArgs()).toEqual(['t1', null]);
  });

  it('a duration under 1 shows the minimum error on the duration field and asks nothing', () => {
    setup();
    typeDuration('0');
    expect(duration()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('The duration must be at least 1 day.')).toBeInTheDocument();
    expect(duration().getAttribute('aria-describedby')).toBeTruthy();
    expect(lastPreviewArgs()).toEqual(['t1', null]);
  });

  it('a non-number duration shows the minimum error', () => {
    setup();
    typeDuration('');
    expect(screen.getByText('The duration must be at least 1 day.')).toBeInTheDocument();
  });

  it('a duration over 3650 shows the maximum error', () => {
    setup();
    typeDuration('3651');
    expect(screen.getByText('The duration can be at most 3650 days.')).toBeInTheDocument();
    expect(lastPreviewArgs()).toEqual(['t1', null]);
  });

  it('an end before the start shows the error on the end field', () => {
    setup();
    typeEnd('2026-03-01');
    expect(endInput()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText("The end date can't be before the start.")).toBeInTheDocument();
    expect(duration()).not.toHaveAttribute('aria-invalid');
  });

  it('an end equal to the start is a zero duration: minimum error', () => {
    setup();
    typeEnd('2026-03-02');
    expect(screen.getByText('The duration must be at least 1 day.')).toBeInTheDocument();
    expect(endInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('a cleared end date shows no error and asks nothing', () => {
    setup();
    typeEnd('');
    expect(endInput()).not.toHaveAttribute('aria-invalid');
    expect(lastPreviewArgs()).toEqual(['t1', null]);
  });

  it('Cancel calls onCancel', () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByTestId('reschedule-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('ReschedulePanel preview', () => {
  it('shows a checking note while loading', () => {
    previewState.status = 'loading';
    setup();
    typeDuration('6');
    expect(screen.getByTestId('reschedule-preview')).toHaveTextContent('Checking impact…');
    expect(screen.getByTestId('reschedule-preview')).toHaveAttribute('role', 'status');
  });

  it('reports the impact and the new end to the host and enables Save', () => {
    previewState.status = 'ready';
    previewState.impact = impactOf();
    const { onPreviewChange } = setup();
    typeDuration('6');
    expect(onPreviewChange).toHaveBeenLastCalledWith({
      impact: previewState.impact,
      newEnd: '2026-03-08',
    });
    expect(save()).not.toBeDisabled();
  });

  it('shows a holds-up figure only when something is held up, with the soon part', () => {
    previewState.status = 'ready';
    previewState.impact = impactOf({ holdsUp: { count: 3, startingWithin14Days: 2 } });
    setup();
    typeDuration('6');
    const figure = screen.getByTestId('reschedule-preview-holds-up');
    expect(figure).toHaveAttribute('data-figure', 'holds-up');
    expect(figure).toHaveTextContent('3');
    expect(figure.parentElement).toHaveTextContent(/2/);
  });

  it('says none start soon when held-up tasks are all later', () => {
    previewState.status = 'ready';
    previewState.impact = impactOf({ holdsUp: { count: 1, startingWithin14Days: 0 } });
    setup();
    typeDuration('6');
    expect(screen.getByTestId('reschedule-preview-holds-up').parentElement).toBeInTheDocument();
  });

  it('has no holds-up figure when nothing is held up', () => {
    previewState.status = 'ready';
    previewState.impact = impactOf();
    setup();
    typeDuration('6');
    expect(screen.queryByTestId('reschedule-preview-holds-up')).toBeNull();
    expect(screen.getByTestId('reschedule-preview-summary')).toHaveTextContent(
      'Nothing else moves.',
    );
  });

  it.each([
    ['tasks only', { movedItems: [moved('b')] }, 'Moves 1 task.'],
    [
      'milestones only',
      {
        milestones: [
          {
            milestoneId: 1,
            previousProjectedDate: '2026-03-20',
            newProjectedDate: '2026-03-25',
            deltaDays: 5,
          },
        ],
      },
      'Moves 1 milestone.',
    ],
    [
      'both',
      {
        movedItems: [moved('b'), moved('c')],
        milestones: [
          {
            milestoneId: 1,
            previousProjectedDate: '2026-03-20',
            newProjectedDate: '2026-03-25',
            deltaDays: 5,
          },
        ],
      },
      'Moves 2 tasks and 1 milestone.',
    ],
  ])('summarises %s', (_name, partial, expected) => {
    previewState.status = 'ready';
    previewState.impact = impactOf(partial);
    setup();
    typeDuration('6');
    expect(screen.getByTestId('reschedule-preview-summary')).toHaveTextContent(expected);
  });

  it('says when completion moves and when it stays', () => {
    previewState.status = 'ready';
    previewState.impact = impactOf({
      projectEnd: { previousDate: '2026-04-01', newDate: '2026-04-06' },
    });
    setup();
    typeDuration('6');
    expect(screen.getByTestId('reschedule-preview-summary')).toHaveTextContent(
      /Completion moves from .* to /,
    );
    previewState.impact = impactOf({
      projectEnd: { previousDate: '2026-04-01', newDate: '2026-04-01' },
    });
    typeDuration('7');
    expect(screen.getByTestId('reschedule-preview-summary')).toHaveTextContent(
      /Completion stays on /,
    );
    previewState.impact = impactOf({ projectEnd: { previousDate: null, newDate: '2026-04-01' } });
    typeDuration('8');
    expect(screen.getByTestId('reschedule-preview-summary')).toHaveTextContent(
      /Completion stays on /,
    );
  });

  it('lists moved tasks and milestones with titles, dates and the direction', () => {
    previewState.status = 'ready';
    previewState.impact = impactOf({
      movedItems: [
        moved('b'),
        moved('c', { deltaDays: -2, newEndDate: '2026-03-08' }),
        moved('zzz', { deltaDays: 1 }),
      ],
      milestones: [
        {
          milestoneId: 1,
          previousProjectedDate: '2026-03-20',
          newProjectedDate: '2026-03-25',
          deltaDays: 5,
        },
        {
          milestoneId: 9,
          previousProjectedDate: '2026-03-20',
          newProjectedDate: '2026-03-21',
          deltaDays: 1,
        },
      ],
    });
    setup();
    typeDuration('6');
    const b = screen.getByTestId('reschedule-preview-item-b');
    expect(b).toHaveTextContent('Windows');
    expect(b).toHaveTextContent('5 days later');
    expect(screen.getByTestId('reschedule-preview-item-c')).toHaveTextContent('2 days earlier');
    expect(screen.getByTestId('reschedule-preview-item-zzz')).toHaveTextContent('zzz');
    expect(screen.getByTestId('reschedule-preview-item-zzz')).toHaveTextContent('1 day later');
    expect(screen.getByTestId('reschedule-preview-milestone-1')).toHaveTextContent('Shell closed');
    expect(screen.getByTestId('reschedule-preview-milestone-9')).toHaveTextContent('9');
  });

  it('marks a late-moved task with a Late badge and not an on-time one', () => {
    previewState.status = 'ready';
    previewState.impact = impactOf({
      movedItems: [
        moved('b', { isLate: true, newEndDate: '2026-03-04' }),
        moved('c', { isLate: true }),
        moved('zzz', { isLate: true }),
        moved('d'),
      ],
    });
    setup();
    typeDuration('6');
    expect(
      within(screen.getByTestId('reschedule-preview-item-b')).getByText(/Late/),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('reschedule-preview-item-c')).getByText(/Late/),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('reschedule-preview-item-zzz')).getByText(/Late/),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('reschedule-preview-item-d')).queryByText(/Late/)).toBeNull();
  });

  it('shows five rows and a Show all button for longer lists', () => {
    previewState.status = 'ready';
    previewState.impact = impactOf({
      movedItems: Array.from({ length: 7 }, (_, i) => moved(`x${i}`)),
    });
    setup();
    typeDuration('6');
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    fireEvent.click(screen.getByTestId('reschedule-show-all'));
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
    expect(screen.queryByTestId('reschedule-show-all')).toBeNull();
  });

  it('has no list or Show all button for a short list', () => {
    previewState.status = 'ready';
    previewState.impact = impactOf({ movedItems: [moved('b')] });
    setup();
    typeDuration('6');
    expect(screen.queryByTestId('reschedule-show-all')).toBeNull();
  });

  it('shows the failure with a retry that asks again, and keeps Save disabled', () => {
    previewState.status = 'error';
    setup();
    typeDuration('6');
    expect(screen.getByText("The impact couldn't be checked.")).toBeInTheDocument();
    expect(save()).toBeDisabled();
    fireEvent.click(screen.getByTestId('reschedule-retry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('ReschedulePanel save', () => {
  function ready() {
    previewState.status = 'ready';
    previewState.impact = impactOf();
  }

  it('stores the duration and end date, offers Undo and reports saved', async () => {
    ready();
    const { onSaved } = setup();
    typeDuration('6');
    await act(async () => {
      fireEvent.click(save());
    });
    expect(mockUpdateWorkItem).toHaveBeenCalledWith('t1', {
      durationDays: 6,
      endDate: '2026-03-08',
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(showUndoToast).toHaveBeenCalledTimes(1);
    expect(showUndoToast.mock.calls[0]![0].message).toBe('Roof rescheduled.');
  });

  it('Undo stores the previous duration and end date, then calls onUndone', async () => {
    ready();
    const { onUndone } = setup();
    typeDuration('6');
    await act(async () => {
      fireEvent.click(save());
    });
    mockUpdateWorkItem.mockClear();
    await act(async () => {
      await showUndoToast.mock.calls[0]![0].onUndo();
    });
    expect(mockUpdateWorkItem).toHaveBeenCalledWith('t1', {
      durationDays: 4,
      endDate: '2026-03-06',
    });
    expect(onUndone).toHaveBeenCalledTimes(1);
  });

  it('a failed save with an API error shows its translated text and stays editable', async () => {
    ready();
    mockUpdateWorkItem.mockRejectedValue(
      new ApiClientError(409, { code: 'CIRCULAR_DEPENDENCY', message: 'server words' }),
    );
    const { onSaved } = setup();
    typeDuration('6');
    await act(async () => {
      fireEvent.click(save());
    });
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0]![0]).toBe('error');
    expect(showToast.mock.calls[0]![1]).not.toBe('server words');
    expect(onSaved).not.toHaveBeenCalled();
    expect(showUndoToast).not.toHaveBeenCalled();
    expect(save()).not.toBeDisabled();
  });

  it('any other failure shows the generic save message', async () => {
    ready();
    mockUpdateWorkItem.mockRejectedValue(new Error('offline'));
    setup();
    typeDuration('6');
    await act(async () => {
      fireEvent.click(save());
    });
    expect(showToast).toHaveBeenCalledWith('error', "The new dates couldn't be saved.");
  });

  it('ignores a submit while saving and a submit that cannot be saved', async () => {
    ready();
    let release!: () => void;
    mockUpdateWorkItem.mockReturnValue(
      new Promise((resolve) => (release = () => resolve({} as never))),
    );
    setup();
    typeDuration('6');
    fireEvent.submit(screen.getByTestId('reschedule-panel'));
    fireEvent.submit(screen.getByTestId('reschedule-panel'));
    expect(mockUpdateWorkItem).toHaveBeenCalledTimes(1);
    expect(save()).toHaveAttribute('aria-disabled', 'true');
    await act(async () => release());
    typeDuration('4');
    fireEvent.submit(screen.getByTestId('reschedule-panel'));
    expect(mockUpdateWorkItem).toHaveBeenCalledTimes(1);
  });

  it('uses a custom test id', () => {
    setup({ testId: 'my-panel' });
    expect(screen.getByTestId('my-panel')).toBeInTheDocument();
  });
});
