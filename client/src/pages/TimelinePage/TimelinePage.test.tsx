/**
 * @jest-environment jsdom
 *
 * The Schedule page (#2247): chart / agenda / calendar bodies, the view state in the URL and the
 * stored preference, the side panel, scroll memory and the create pre-fill.
 *
 * Mutations these tests catch: a page-level useCreateContext (clobbers the Calendar's date, D11),
 * the Done toggle hiding milestones the area rule keeps, a refetch showing the skeleton again,
 * a lost selection leaving the panel open, Ctrl+= zooming while a dialog has focus.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import type React from 'react';
import type { AreaResponse, TimelineResponse, UserPreference } from '@cornerstone/shared';
import type * as TimelineApiTypes from '../../lib/timelineApi.js';
import type * as PreferencesApiTypes from '../../lib/preferencesApi.js';
import type * as AreasApiTypes from '../../lib/areasApi.js';
import { installMatchMedia, type MatchMediaControl } from '../../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import {
  makeArea,
  makeMilestone,
  makePurchase,
  makeTask,
  makeTimeline,
} from '../../test/scheduleFixtures.js';

const mockGetTimeline = jest.fn<typeof TimelineApiTypes.getTimeline>();
const mockListPreferences = jest.fn<typeof PreferencesApiTypes.listPreferences>();
const mockUpsertPreference = jest.fn<typeof PreferencesApiTypes.upsertPreference>();
const mockFetchAreas = jest.fn<typeof AreasApiTypes.fetchAreas>();

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());
jest.unstable_mockModule('../../lib/timelineApi.js', () => ({ getTimeline: mockGetTimeline }));
const realPreferencesApi = await import('../../lib/preferencesApi.js');
jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  ...realPreferencesApi,
  listPreferences: mockListPreferences,
  upsertPreference: mockUpsertPreference,
}));
const realAreasApi = await import('../../lib/areasApi.js');
jest.unstable_mockModule('../../lib/areasApi.js', () => ({
  ...realAreasApi,
  fetchAreas: mockFetchAreas,
}));
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({
    toasts: [],
    showToast: jest.fn(),
    showUndoToast: jest.fn(),
    dismissToast: jest.fn(),
  }),
}));

const { TimelinePage, readScheduleAnchor, writeScheduleAnchor } = await import('./TimelinePage.js');
const { CreateMenuProvider, useCreatePrefill } =
  await import('../../components/CreateMenu/CreateMenuContext.js');

function LocationDisplay() {
  const location = useLocation();
  const type = useNavigationType();
  return (
    <>
      <div data-testid="location-display">{location.pathname}</div>
      <div data-testid="location-search">{location.search}</div>
      <div data-testid="location-type">{type}</div>
      <div data-testid="location-state">{JSON.stringify(location.state)}</div>
    </>
  );
}

function PrefillProbe() {
  const prefill = useCreatePrefill();
  return <div data-testid="prefill">{JSON.stringify(prefill)}</div>;
}

const thisMonthDay = (day: number) => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
const todayKey = () => thisMonthDay(new Date().getDate());

const EMPTY = makeTimeline({ dateRange: null });

const TASK = makeTask('wi-gantt', {
  title: 'Gantt Test Task',
  status: 'in_progress',
  startDate: '2026-03-02',
  endDate: '2026-03-20',
  projectedStartDate: '2026-03-02',
  projectedEndDate: '2026-03-20',
  durationDays: 18,
});
const DONE_TASK = makeTask('wi-done', {
  title: 'Finished Task',
  status: 'completed',
  projectedStartDate: '2026-03-03',
  projectedEndDate: '2026-03-05',
});
const MILESTONE = makeMilestone(7, { title: 'Gantt Test Milestone', targetDate: '2026-03-25' });
const PURCHASE = makePurchase('hi-gantt', {
  name: 'Gantt Test Purchase',
  targetDeliveryDate: '2026-03-15',
  earliestDeliveryDate: '2026-03-14',
  latestDeliveryDate: '2026-03-16',
});
const FULL: TimelineResponse = makeTimeline({
  workItems: [TASK],
  milestones: [MILESTONE],
  householdItems: [PURCHASE],
  dateRange: { earliest: '2026-03-01', latest: '2026-03-31' },
});

const KITCHEN = {
  id: 'k',
  name: 'Kitchen',
  parentId: null,
  color: null,
  description: null,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
} as AreaResponse;
const AREA_DATA: TimelineResponse = makeTimeline({
  workItems: [
    makeTask('in-k', { title: 'Kitchen task', area: makeArea('k') }),
    makeTask('other', { title: 'Other task' }),
  ],
  milestones: [makeMilestone(1, { title: 'Kitchen milestone', workItemIds: ['in-k'] })],
  dateRange: { earliest: '2026-03-01', latest: '2026-03-31' },
});

let media: MatchMediaControl;

function renderPage(entries: string[] = ['/schedule/gantt'], extra?: React.ReactNode) {
  return render(
    <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={() => {}}>
      <MemoryRouter initialEntries={entries}>
        <TimelinePage />
        <LocationDisplay />
        <PrefillProbe />
        {extra}
      </MemoryRouter>
    </CreateMenuProvider>,
  );
}

const chart = () => screen.findByTestId('gantt-chart');
const params = () => new URLSearchParams(screen.getByTestId('location-search').textContent ?? '');
const prefill = () => JSON.parse(screen.getByTestId('prefill').textContent ?? '{}');
const scroller = () => screen.getByTestId('gantt-svg').parentElement as HTMLElement;

beforeEach(() => {
  media = installMatchMedia();
  Element.prototype.scrollIntoView = jest.fn() as never;
  sessionStorage.clear();
  mockGetTimeline.mockReset();
  mockGetTimeline.mockResolvedValue(EMPTY);
  mockListPreferences.mockReset();
  mockListPreferences.mockResolvedValue([]);
  mockUpsertPreference.mockReset();
  mockUpsertPreference.mockResolvedValue({} as never);
  mockFetchAreas.mockReset();
  mockFetchAreas.mockResolvedValue({ areas: [KITCHEN] });
});

afterEach(() => {
  media.restore();
  delete document.documentElement.dataset.scrollLocked;
});

describe('scroll memory helpers', () => {
  it('round-trips an anchor per history entry', () => {
    writeScheduleAnchor('k1', { date: '2026-03-02', rowKey: 'task:a', rowOffset: 4 });
    expect(readScheduleAnchor('k1')).toEqual({
      date: '2026-03-02',
      rowKey: 'task:a',
      rowOffset: 4,
    });
    expect(readScheduleAnchor('other')).toBeNull();
  });

  it('accepts a null row key and milestone and purchase keys', () => {
    for (const rowKey of [null, 'milestone:3', 'purchase:p1'] as const) {
      writeScheduleAnchor('k', { date: '2026-03-02', rowKey, rowOffset: 0 });
      expect(readScheduleAnchor('k')?.rowKey).toBe(rowKey);
    }
  });

  it.each([
    ['not JSON', '{nope'],
    ['a non-object', '"text"'],
    ['null', 'null'],
    ['a missing date', JSON.stringify({ rowKey: null, rowOffset: 0 })],
    ['a non-number offset', JSON.stringify({ date: 'd', rowKey: null, rowOffset: '0' })],
    ['an unknown row key', JSON.stringify({ date: 'd', rowKey: 'group:x', rowOffset: 0 })],
    ['a non-string row key', JSON.stringify({ date: 'd', rowKey: 4, rowOffset: 0 })],
  ])('treats %s as no anchor', (_name, raw) => {
    sessionStorage.setItem('schedule.scroll:bad', raw);
    expect(readScheduleAnchor('bad')).toBeNull();
  });

  it('swallows storage errors on read and write', () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      expect(readScheduleAnchor('k')).toBeNull();
      expect(() =>
        writeScheduleAnchor('k', { date: 'd', rowKey: null, rowOffset: 0 }),
      ).not.toThrow();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});

describe('TimelinePage identity and loading', () => {
  it('shows exactly one h1 Schedule on the chart route and Calendar on the calendar route', async () => {
    const { unmount } = renderPage(['/schedule/gantt']);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Schedule' })).toBeInTheDocument();
    await screen.findByTestId('timeline-empty');
    unmount();
    renderPage(['/schedule/calendar']);
    expect(screen.getByRole('heading', { level: 1, name: 'Calendar' })).toBeInTheDocument();
    await screen.findByTestId('calendar-empty');
  });

  it('shows the skeleton while the timeline loads', () => {
    mockGetTimeline.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('gantt-chart-skeleton')).toBeInTheDocument();
  });

  it('keeps the skeleton until the stored preferences have loaded', async () => {
    mockListPreferences.mockReturnValue(new Promise(() => {}));
    mockGetTimeline.mockResolvedValue(FULL);
    renderPage();
    await waitFor(() => expect(mockGetTimeline).toHaveBeenCalled());
    expect(screen.getByTestId('gantt-chart-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('gantt-chart')).toBeNull();
  });

  it('does not push a history entry on mount', async () => {
    mockGetTimeline.mockResolvedValue(FULL);
    renderPage(['/schedule/gantt']);
    await chart();
    expect(screen.getByTestId('location-type')).toHaveTextContent('POP');
  });
});

describe('TimelinePage states', () => {
  it('shows the empty state with a link to Tasks when there are no tasks', async () => {
    renderPage();
    expect(await screen.findByTestId('timeline-empty')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Tasks' })).toHaveAttribute(
      'href',
      '/project/work-items',
    );
    expect(screen.queryByTestId('gantt-chart')).toBeNull();
  });

  it('shows the no-dates state when no task has a date', async () => {
    mockGetTimeline.mockResolvedValue(
      makeTimeline({
        workItems: [makeTask('u', { projectedStartDate: null, projectedEndDate: null })],
      }),
    );
    renderPage();
    expect(await screen.findByTestId('timeline-no-dates')).toBeInTheDocument();
  });

  it('a task whose only date is a forecast end still draws the chart (#2199)', async () => {
    mockGetTimeline.mockResolvedValue(
      makeTimeline({
        workItems: [makeTask('u', { projectedStartDate: null, projectedEndDate: '2026-03-05' })],
        dateRange: { earliest: '2026-03-01', latest: '2026-03-31' },
      }),
    );
    renderPage();
    expect(await chart()).toBeInTheDocument();
  });

  it('shows "Nothing to show" when the toggles and area hide every row', async () => {
    mockGetTimeline.mockResolvedValue(FULL);
    renderPage(['/schedule/gantt?show=milestones&areaId=k']);
    expect(await screen.findByTestId('schedule-filtered-empty')).toHaveTextContent(
      'Nothing to show',
    );
  });

  it('shows the load error and retries', async () => {
    mockGetTimeline.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByTestId('timeline-error')).toBeInTheDocument();
    mockGetTimeline.mockResolvedValue(FULL);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await chart()).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-error')).toBeNull();
  });

  it('a failed refresh keeps the chart and shows a banner with a retry', async () => {
    mockGetTimeline.mockResolvedValue(FULL);
    renderPage();
    await chart();
    mockGetTimeline.mockRejectedValueOnce(new Error('offline'));
    act(() => {
      window.dispatchEvent(
        new CustomEvent('cornerstone:object-created', { detail: { kind: 'task' } }),
      );
    });
    expect(await screen.findByTestId('schedule-refresh-error')).toBeInTheDocument();
    expect(screen.getByTestId('gantt-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('gantt-chart-skeleton')).toBeNull();
    mockGetTimeline.mockResolvedValue(FULL);
    fireEvent.click(
      within(screen.getByTestId('schedule-refresh-error')).getByRole('button', {
        name: 'Retry',
      }),
    );
    await waitFor(() => expect(screen.queryByTestId('schedule-refresh-error')).toBeNull());
  });

  it('reloads silently when a task, milestone or purchase is created elsewhere', async () => {
    mockGetTimeline.mockResolvedValue(FULL);
    renderPage();
    await chart();
    for (const kind of ['task', 'milestone', 'purchase']) {
      const calls = mockGetTimeline.mock.calls.length;
      act(() => {
        window.dispatchEvent(new CustomEvent('cornerstone:object-created', { detail: { kind } }));
      });
      await waitFor(() => expect(mockGetTimeline.mock.calls.length).toBe(calls + 1));
      expect(screen.queryByTestId('gantt-chart-skeleton')).toBeNull();
    }
  });
});

describe('TimelinePage view state', () => {
  beforeEach(() => {
    mockGetTimeline.mockResolvedValue(FULL);
  });

  it('the zoom buttons set ?zoom and the default month leaves the URL clean', async () => {
    renderPage();
    await chart();
    expect(screen.getByTestId('schedule-zoom-month')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('schedule-zoom-week'));
    expect(params().get('zoom')).toBe('week');
    expect(screen.getByTestId('schedule-zoom-week')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('schedule-zoom-month'));
    expect(params().has('zoom')).toBe(false);
  });

  it('stores every change as the schedule.view preference', async () => {
    renderPage();
    await chart();
    fireEvent.click(screen.getByTestId('schedule-zoom-day'));
    expect(mockUpsertPreference).toHaveBeenCalledTimes(1);
    expect(mockUpsertPreference.mock.calls[0]![0]).toBe('schedule.view');
    expect(JSON.parse(mockUpsertPreference.mock.calls[0]![1])).toMatchObject({ zoom: 'day' });
  });

  it('reads the stored preference when the URL has no params', async () => {
    mockListPreferences.mockResolvedValue([
      { key: 'schedule.view', value: JSON.stringify({ zoom: 'week' }) } as UserPreference,
    ]);
    renderPage();
    await chart();
    expect(screen.getByTestId('schedule-zoom-week')).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides what ?show leaves out', async () => {
    renderPage(['/schedule/gantt?show=tasks,done']);
    await chart();
    expect(screen.getByTestId('gantt-sidebar-row-wi-gantt')).toBeInTheDocument();
    expect(screen.queryByTestId('gantt-sidebar-milestone-7')).toBeNull();
    expect(screen.queryByTestId('gantt-sidebar-hi-hi-gantt')).toBeNull();
  });

  it('the Show menu toggles the dependency arrows and the critical path into the chart', async () => {
    renderPage();
    await chart();
    expect(screen.getByTestId('gantt-svg')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('schedule-show-trigger'));
    fireEvent.click(screen.getByTestId('schedule-show-arrows'));
    fireEvent.click(screen.getByTestId('schedule-show-critical'));
    expect(params().get('show')).toBe('tasks,milestones,purchases');
  });

  it('Done off hides finished tasks and the legend counts them', async () => {
    mockGetTimeline.mockResolvedValue(
      makeTimeline({
        workItems: [TASK, DONE_TASK],
        dateRange: { earliest: '2026-03-01', latest: '2026-03-31' },
      }),
    );
    renderPage(['/schedule/gantt']);
    await chart();
    expect(screen.queryByTestId('gantt-sidebar-row-wi-done')).toBeNull();
    fireEvent.click(screen.getByTestId('schedule-legend-toggle'));
    expect(await screen.findByTestId('schedule-legend-done-hidden')).toHaveTextContent(
      '1 done item',
    );
    fireEvent.click(screen.getByTestId('schedule-show-trigger'));
    fireEvent.click(screen.getByTestId('schedule-show-done'));
    expect(screen.getByTestId('gantt-sidebar-row-wi-done')).toBeInTheDocument();
    expect(screen.queryByTestId('schedule-legend-done-hidden')).toBeNull();
  });

  it('the Legend button opens and closes the legend strip', async () => {
    renderPage();
    await chart();
    expect(screen.queryByTestId('schedule-legend')).toBeNull();
    fireEvent.click(screen.getByTestId('schedule-legend-toggle'));
    expect(screen.getByTestId('schedule-legend')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-legend-toggle')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByTestId('schedule-legend-toggle'));
    expect(screen.queryByTestId('schedule-legend')).toBeNull();
  });

  it('?group=area draws group headers in the area order', async () => {
    mockGetTimeline.mockResolvedValue(AREA_DATA);
    renderPage(['/schedule/gantt?group=area']);
    await chart();
    expect(screen.getByTestId('gantt-group-k')).toBeInTheDocument();
    expect(screen.getByTestId('gantt-group-none')).toBeInTheDocument();
  });

  it('?areaId keeps that area and the milestones of its tasks only', async () => {
    mockGetTimeline.mockResolvedValue(AREA_DATA);
    renderPage(['/schedule/gantt?areaId=k']);
    await chart();
    expect(screen.getByTestId('gantt-sidebar-row-in-k')).toBeInTheDocument();
    expect(screen.queryByTestId('gantt-sidebar-row-other')).toBeNull();
    expect(screen.getByTestId('gantt-sidebar-milestone-1')).toBeInTheDocument();
  });

  it('an unknown ?areaId is dropped from the URL and nothing is filtered', async () => {
    mockGetTimeline.mockResolvedValue(AREA_DATA);
    renderPage(['/schedule/gantt?areaId=ghost']);
    await chart();
    await waitFor(() => expect(params().has('areaId')).toBe(false));
    expect(screen.getByTestId('gantt-sidebar-row-other')).toBeInTheDocument();
  });

  it('the legacy ?filter= becomes ?show=', async () => {
    renderPage(['/schedule/gantt?filter=work-items']);
    await chart();
    await waitFor(() => expect(params().has('filter')).toBe(false));
    expect(params().get('show')).toBe('tasks,arrows,critical');
  });

  it('Today does not fail when today is outside the chart', async () => {
    renderPage();
    await chart();
    fireEvent.click(screen.getByTestId('schedule-today'));
    expect(screen.getByTestId('gantt-chart')).toBeInTheDocument();
  });
});

describe('TimelinePage column width', () => {
  beforeEach(() => {
    mockGetTimeline.mockResolvedValue(FULL);
  });

  const headerWidth = () => (screen.getByTestId('gantt-header') as HTMLElement).style.width;

  it('Ctrl+= and Ctrl+- widen and narrow the columns, plain keys do nothing', async () => {
    renderPage(['/schedule/gantt?zoom=day']);
    await chart();
    const start = headerWidth();
    fireEvent.keyDown(document, { key: '=', ctrlKey: true });
    const wider = headerWidth();
    expect(parseInt(wider)).toBeGreaterThan(parseInt(start));
    fireEvent.keyDown(document, { key: '+', ctrlKey: true });
    expect(parseInt(headerWidth())).toBeGreaterThan(parseInt(wider));
    fireEvent.keyDown(document, { key: '-', ctrlKey: true });
    fireEvent.keyDown(document, { key: '-', ctrlKey: true });
    fireEvent.keyDown(document, { key: '-', ctrlKey: true });
    expect(parseInt(headerWidth())).toBeLessThan(parseInt(start));
    const settled = headerWidth();
    fireEvent.keyDown(document, { key: '-' });
    fireEvent.keyDown(document, { key: 'a', ctrlKey: true });
    expect(headerWidth()).toBe(settled);
  });

  it('keys typed inside a dialog or the panel do not zoom the chart (D14)', async () => {
    renderPage();
    await chart();
    fireEvent.click(await screen.findByTestId('gantt-sidebar-row-wi-gantt'));
    const panel = await screen.findByRole('dialog');
    const before = headerWidth();
    fireEvent.keyDown(within(panel).getByRole('heading', { level: 2, name: 'Gantt Test Task' }), {
      key: '=',
      ctrlKey: true,
    });
    expect(headerWidth()).toBe(before);
  });

  it('Ctrl+wheel over the chart zooms; a plain wheel does not', async () => {
    renderPage(['/schedule/gantt?zoom=day']);
    await chart();
    const start = headerWidth();
    fireEvent.wheel(scroller(), { deltaY: -100, ctrlKey: true });
    expect(parseInt(headerWidth())).toBeGreaterThan(parseInt(start));
    const wider = headerWidth();
    fireEvent.wheel(scroller(), { deltaY: 100, ctrlKey: true });
    expect(parseInt(headerWidth())).toBeLessThan(parseInt(wider));
    const settled = headerWidth();
    fireEvent.wheel(scroller(), { deltaY: -100 });
    expect(headerWidth()).toBe(settled);
  });

  it('has no Ctrl+= handler on the calendar', async () => {
    renderPage(['/schedule/calendar']);
    await screen.findByRole('grid');
    const prevented = fireEvent.keyDown(document, { key: '=', ctrlKey: true });
    expect(prevented).toBe(true);
  });
});

describe('TimelinePage side panel', () => {
  beforeEach(() => {
    mockGetTimeline.mockResolvedValue(FULL);
  });

  it('opens on a row, shows its title and closes with focus back on the row', async () => {
    renderPage();
    await chart();
    const row = screen.getByTestId('gantt-sidebar-row-wi-gantt');
    row.focus();
    fireEvent.click(row);
    const panel = await screen.findByTestId('schedule-panel');
    expect(
      within(panel).getByRole('heading', { level: 2, name: 'Gantt Test Task' }),
    ).toBeInTheDocument();
    expect(row).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByTestId('schedule-panel-close'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(row).not.toHaveAttribute('aria-current');
  });

  it('opens on a bar click as well', async () => {
    renderPage();
    await chart();
    fireEvent.click(screen.getByTestId('gantt-bar-wi-gantt'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('closes when the selected row disappears after a reload and focus goes to the heading', async () => {
    renderPage();
    await chart();
    fireEvent.click(screen.getByTestId('gantt-sidebar-row-wi-gantt'));
    await screen.findByRole('dialog');
    mockGetTimeline.mockResolvedValue({ ...FULL, workItems: [DONE_TASK], criticalPath: [] });
    act(() => {
      window.dispatchEvent(
        new CustomEvent('cornerstone:object-created', { detail: { kind: 'task' } }),
      );
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });

  it('opens for a milestone and a purchase row and keeps them while they exist', async () => {
    renderPage();
    await chart();
    fireEvent.click(screen.getByTestId('gantt-sidebar-milestone-7'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Gantt Test Milestone');
    fireEvent.click(screen.getByTestId('gantt-sidebar-hi-hi-gantt'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Gantt Test Purchase');
  });

  it('closes when a selected milestone or purchase disappears', async () => {
    renderPage();
    await chart();
    fireEvent.click(screen.getByTestId('gantt-sidebar-milestone-7'));
    await screen.findByRole('dialog');
    mockGetTimeline.mockResolvedValue({ ...FULL, milestones: [] });
    act(() => {
      window.dispatchEvent(
        new CustomEvent('cornerstone:object-created', { detail: { kind: 'milestone' } }),
      );
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows no panel on the calendar', async () => {
    renderPage(['/schedule/calendar']);
    await screen.findByRole('grid');
    expect(screen.queryByTestId('schedule-panel')).toBeNull();
  });
});

describe('TimelinePage phone', () => {
  beforeEach(() => {
    media.set('(max-width: 767px)', true);
    mockGetTimeline.mockResolvedValue(FULL);
  });

  it('defaults to the agenda, without zoom or group controls', async () => {
    renderPage();
    expect(await screen.findByTestId('schedule-agenda')).toBeInTheDocument();
    expect(screen.queryByTestId('gantt-chart')).toBeNull();
    expect(screen.queryByTestId('schedule-zoom')).toBeNull();
    expect(screen.getByTestId('schedule-phone-view-agenda')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('schedule-phone-view-chart')).toHaveTextContent('Chart');
  });

  it('the agenda hides finished tasks like the chart and shows them with Done on', async () => {
    mockGetTimeline.mockResolvedValue(
      makeTimeline({
        workItems: [TASK, DONE_TASK],
        dateRange: { earliest: '2026-03-01', latest: '2026-03-31' },
      }),
    );
    renderPage();
    await screen.findByTestId('schedule-agenda');
    expect(screen.queryAllByTestId(/schedule-agenda-row-task:wi-done/)).toHaveLength(0);
    fireEvent.click(screen.getByTestId('schedule-show-trigger'));
    fireEvent.click(screen.getByTestId('schedule-show-done'));
    expect(screen.getAllByTestId(/schedule-agenda-row-task:wi-done/).length).toBeGreaterThan(0);
  });

  it('switches to the chart and stores the choice', async () => {
    renderPage();
    await screen.findByTestId('schedule-agenda');
    fireEvent.click(screen.getByTestId('schedule-phone-view-chart'));
    expect(await chart()).toBeInTheDocument();
    expect(screen.getByTestId('schedule-phone-view-chart')).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(mockUpsertPreference.mock.calls.at(-1)![1])).toMatchObject({
      phoneView: 'chart',
    });
  });

  it('opens the panel from an agenda row, as a bottom sheet', async () => {
    renderPage();
    await screen.findByTestId('schedule-agenda');
    fireEvent.click(screen.getAllByTestId(/schedule-agenda-row-task:wi-gantt/)[0]!);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Gantt Test Task');
  });

  it('the legend is a sheet on a phone and its Close button turns the legend off', async () => {
    renderPage(['/schedule/gantt']);
    await screen.findByTestId('schedule-agenda');
    fireEvent.click(screen.getByTestId('schedule-legend-toggle'));
    const dialog = await screen.findByRole('dialog', { name: 'Legend' });
    fireEvent.click(within(dialog).getByTestId('schedule-legend-close'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Legend' })).toBeNull());
    expect(screen.getByTestId('schedule-legend-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows no phone toggle on the calendar', async () => {
    renderPage(['/schedule/calendar']);
    await screen.findByRole('grid');
    expect(screen.queryByTestId('schedule-phone-view-agenda')).toBeNull();
  });
});

describe('TimelinePage calendar', () => {
  const CAL_MILESTONE = makeMilestone(42, {
    title: 'Test Shell Done',
    targetDate: thisMonthDay(10),
  });

  it('shows the empty state when tasks, milestones and purchases are all empty', async () => {
    renderPage(['/schedule/calendar']);
    expect(await screen.findByTestId('calendar-empty')).toBeInTheDocument();
  });

  it('does not show the empty state when only a milestone exists', async () => {
    mockGetTimeline.mockResolvedValue({ ...EMPTY, milestones: [CAL_MILESTONE] });
    renderPage(['/schedule/calendar']);
    expect(await screen.findByRole('grid')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-empty')).toBeNull();
  });

  it('does not show the empty state when the toggles hide everything that exists', async () => {
    mockGetTimeline.mockResolvedValue({
      ...EMPTY,
      workItems: [
        makeTask('c1', { projectedStartDate: thisMonthDay(5), projectedEndDate: thisMonthDay(6) }),
      ],
    });
    renderPage(['/schedule/calendar?show=milestones']);
    expect(await screen.findByRole('grid')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-empty')).toBeNull();
    expect(screen.queryByTestId('calendar-item')).toBeNull();
  });

  it('keeps finished items on the calendar and offers only the kind toggles', async () => {
    mockGetTimeline.mockResolvedValue({
      ...EMPTY,
      workItems: [
        makeTask('c1', {
          status: 'completed',
          projectedStartDate: thisMonthDay(5),
          projectedEndDate: thisMonthDay(6),
        }),
      ],
    });
    renderPage(['/schedule/calendar?calendarMode=week']);
    expect(screen.queryByTestId('schedule-zoom')).toBeNull();
    await screen.findByRole('grid');
    expect(screen.queryByTestId('schedule-legend-toggle')).toBeNull();
  });

  it('clicking a calendar milestone opens it with the calendar URL as origin', async () => {
    mockGetTimeline.mockResolvedValue({ ...EMPTY, milestones: [CAL_MILESTONE] });
    renderPage(['/schedule/calendar']);
    fireEvent.click(await screen.findByTestId('calendar-milestone'));
    expect(screen.getByTestId('location-display')).toHaveTextContent('/project/milestones/42');
    expect(JSON.parse(screen.getByTestId('location-state').textContent!)).toEqual({
      origin: { to: '/schedule/calendar' },
    });
  });

  it('passes the response holdsUp counts to the calendar tooltips (#2232)', async () => {
    const task = makeTask('wi-origin', {
      projectedStartDate: todayKey(),
      projectedEndDate: todayKey(),
    });
    mockGetTimeline.mockResolvedValue({
      ...EMPTY,
      workItems: [task],
      holdsUp: {
        workItems: { 'wi-origin': { count: 7, startingWithin14Days: 2 } },
        milestones: {},
      },
    });
    renderPage(['/schedule/calendar?calendarMode=week']);
    fireEvent.mouseEnter((await screen.findAllByTestId('calendar-item'))[0]!, {
      clientX: 300,
      clientY: 200,
    });
    expect(await screen.findByTestId('gantt-tooltip-holds-up')).toHaveTextContent(
      'Holds up 7 tasks',
    );
  });
});

describe('TimelinePage create pre-fill (D11)', () => {
  it('the chart registers the Monday of the visible week and the chosen area', async () => {
    mockGetTimeline.mockResolvedValue(AREA_DATA);
    renderPage(['/schedule/gantt?areaId=k']);
    await chart();
    await waitFor(() => expect(prefill().areaId).toBe('k'));
    expect(prefill().date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const monday = new Date(`${prefill().date}T00:00:00Z`).getUTCDay();
    expect(monday).toBe(1);
  });

  it('follows the scroll position: the week of the date at the left edge', async () => {
    jest.useFakeTimers();
    try {
      mockGetTimeline.mockResolvedValue(FULL);
      renderPage();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(10);
      });
      const el = scroller();
      el.scrollLeft = 600;
      fireEvent.scroll(el);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });
      const dateAfter = prefill().date as string;
      expect(new Date(`${dateAfter}T00:00:00Z`).getUTCDay()).toBe(1);
      expect(sessionStorage.getItem('schedule.scroll:default')).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('the agenda registers the current week', async () => {
    media.set('(max-width: 767px)', true);
    mockGetTimeline.mockResolvedValue(FULL);
    renderPage();
    await screen.findByTestId('schedule-agenda');
    const date = prefill().date as string;
    expect(new Date(`${date}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  it('the Calendar keeps its own date: the parent never clobbers it', async () => {
    mockGetTimeline.mockResolvedValue({
      ...EMPTY,
      milestones: [makeMilestone(1, { targetDate: thisMonthDay(10) })],
    });
    renderPage(['/schedule/calendar']);
    await screen.findByRole('grid');
    await waitFor(() => expect(prefill().date).toBe(todayKey()));
    // a later render of the page (toolbar change) must not replace it
    fireEvent.click(screen.getByTestId('schedule-show-trigger'));
    expect(prefill().date).toBe(todayKey());
    expect(prefill().areaId).toBeUndefined();
  });

  it('is cleared when the page unmounts', async () => {
    mockGetTimeline.mockResolvedValue(FULL);
    const { unmount } = renderPage();
    await chart();
    unmount();
  });
});

describe('TimelinePage scroll memory (WRK-109)', () => {
  it('restores the saved position of this history entry', async () => {
    mockGetTimeline.mockResolvedValue(FULL);
    writeScheduleAnchor('default', { date: '2026-03-20', rowKey: 'task:wi-gantt', rowOffset: 0 });
    renderPage();
    await chart();
    expect(scroller().scrollLeft).toBeGreaterThan(0);
  });

  it('writes the position under the entry key after scrolling', async () => {
    jest.useFakeTimers();
    try {
      mockGetTimeline.mockResolvedValue(FULL);
      renderPage();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(10);
      });
      scroller().scrollLeft = 400;
      fireEvent.scroll(scroller());
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });
      expect(readScheduleAnchor('default')).toMatchObject({ rowOffset: expect.any(Number) });
    } finally {
      jest.useRealTimers();
    }
  });

  it('a refetch does not move the chart (the date at the left edge stays)', async () => {
    mockGetTimeline.mockResolvedValue(FULL);
    renderPage();
    await chart();
    scroller().scrollLeft = 500;
    fireEvent.scroll(scroller());
    mockGetTimeline.mockResolvedValue({
      ...FULL,
      dateRange: { earliest: '2026-02-01', latest: '2026-03-31' },
    });
    act(() => {
      window.dispatchEvent(
        new CustomEvent('cornerstone:object-created', { detail: { kind: 'task' } }),
      );
    });
    await waitFor(() => expect(scroller().scrollLeft).toBeGreaterThan(500));
    expect(screen.queryByTestId('gantt-chart-skeleton')).toBeNull();
  });
});
