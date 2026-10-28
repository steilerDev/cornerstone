/**
 * @jest-environment jsdom
 *
 * The task page shell (#2248): states, header, strip, tabs, deep-link intents, delete and
 * shortcuts. The panels are covered per module; here they are stubs that expose their props.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  Link,
  useLocation,
  useNavigationType,
  useSearchParams,
} from 'react-router-dom';
import type { WorkItemPageDetail } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeTaskPage } from '../../test/taskPageFixtures.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type { SummaryFact } from '../../components/SummaryStrip/SummaryStrip.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as StatusApiTypes from '../../lib/statusChangeApi.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
import type * as StatusHookTypes from '../../hooks/useUndoableStatusChange.js';
import type * as CreateMenuTypes from '../../components/CreateMenu/CreateMenuContext.js';
import type * as EventsTypes from '../../lib/objectCreatedEvents.js';
import type * as PageModule from './WorkItemDetailPage.js';

const mockGetWorkItem = jest.fn<typeof WorkItemsApiTypes.getWorkItem>();
const mockDeleteWorkItem = jest.fn<typeof WorkItemsApiTypes.deleteWorkItem>();
const mockChangeStatus = jest.fn<typeof StatusApiTypes.changeWorkItemStatus>();
const mockFetchDeleteImpact = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();
const mockRunStatusChange =
  jest.fn<ReturnType<typeof StatusHookTypes.useUndoableStatusChange>['run']>();
const mockUseCreateContext = jest.fn<typeof CreateMenuTypes.useCreateContext>();
const startEditDetails = jest.fn<() => void>();
const startEditWhoWhere = jest.fn<() => void>();
let documentsFact: SummaryFact | null = null;
let diaryCount: number | null = 3;

const realWorkItemsApi = await import('../../lib/workItemsApi.js');
const realStatusApi = await import('../../lib/statusChangeApi.js');
const realCreateMenu = await import('../../components/CreateMenu/CreateMenuContext.js');

jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  ...realWorkItemsApi,
  getWorkItem: mockGetWorkItem,
  deleteWorkItem: mockDeleteWorkItem,
}));
jest.unstable_mockModule('../../lib/statusChangeApi.js', () => ({
  ...realStatusApi,
  changeWorkItemStatus: mockChangeStatus,
}));
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));
jest.unstable_mockModule('../../hooks/useUndoableStatusChange.js', () => ({
  useUndoableStatusChange: () => ({ run: mockRunStatusChange }),
}));
jest.unstable_mockModule('../../components/CreateMenu/CreateMenuContext.js', () => ({
  ...realCreateMenu,
  useCreateContext: mockUseCreateContext,
}));
jest.unstable_mockModule('../../components/ObjectHeader/useLogPrimary.js', () => ({
  useLogPrimary: (testId: string) => ({
    kind: 'link',
    label: 'Log',
    to: '/diary/new',
    state: undefined,
    testId,
  }),
}));
jest.unstable_mockModule('../../components/DocumentsPanel/index.js', () => ({
  useDocumentsPanel: () => ({ fact: documentsFact, panel: <div data-testid="stub-documents" /> }),
}));
jest.unstable_mockModule('../../components/FeedRow/ObjectHistorySection.js', () => ({
  ObjectHistorySection: (props: { entityType: string; entityId: string; revision: number }) => (
    <div
      data-testid="stub-history"
      data-entity={`${props.entityType}:${props.entityId}`}
      data-revision={props.revision}
    />
  ),
}));
jest.unstable_mockModule('./useTaskDiary.js', () => ({
  useTaskDiary: () => ({
    primary: { items: [], totalItems: diaryCount, scope: 'company' },
    other: null,
    failure: null,
    reload: () => undefined,
    count: diaryCount,
  }),
}));
jest.unstable_mockModule('./TaskOverviewPanel.js', () => ({
  TaskOverviewPanel: (props: {
    detailsCardRef: { current: unknown };
    whoWhereCardRef: { current: unknown };
  }) => {
    useEffect(() => {
      props.detailsCardRef.current = { startEdit: startEditDetails };
      props.whoWhereCardRef.current = { startEdit: startEditWhoWhere };
    }, [props.detailsCardRef, props.whoWhereCardRef]);
    return <div data-testid="stub-overview" />;
  },
}));
jest.unstable_mockModule('./TaskTimingPanel.js', () => ({
  TaskTimingPanel: (props: {
    intent: string | null;
    depError: string | null;
    onIntentConsumed: () => void;
    onDepErrorDismiss: () => void;
  }) => (
    <div
      data-testid="stub-timing"
      data-intent={props.intent ?? ''}
      data-deperror={props.depError ?? ''}
    >
      <button type="button" data-testid="stub-consume" onClick={props.onIntentConsumed} />
      <button type="button" data-testid="stub-dismiss" onClick={props.onDepErrorDismiss} />
    </div>
  ),
}));
jest.unstable_mockModule('./TaskCostPanel.js', () => ({
  TaskCostPanel: () => <div data-testid="stub-cost" />,
}));
jest.unstable_mockModule('./TaskDiaryPanel.js', () => ({
  TaskDiaryPanel: () => <div data-testid="stub-diary" />,
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: { id: 'u-me', role: 'admin' } }),
}));

let Page: typeof PageModule;
let Events: typeof EventsTypes;

const TASK = makeTaskPage({
  title: 'Pour slab',
  createdBy: { id: 'u-1', displayName: 'Pat Sample', email: 'pat@example.test' },
  createdAt: '2026-01-05T08:00:00.000Z',
  updatedAt: '2026-02-10T08:00:00.000Z',
  budgets: [{ id: 'b1' }, { id: 'b2' }] as never,
});

interface Seen {
  keys: string[];
  type: string;
  path: string;
  search: string;
  hash: string;
  state: unknown;
}
const seen: Seen = { keys: [], type: '', path: '', search: '', hash: '', state: null };

function Probe() {
  const location = useLocation();
  const type = useNavigationType();
  const [params] = useSearchParams();
  seen.type = type;
  seen.path = location.pathname;
  seen.search = location.search;
  seen.hash = location.hash;
  seen.state = location.state;
  useEffect(() => {
    seen.keys.push(location.key);
  }, [location.key]);
  return (
    <>
      <div data-testid="probe-tab">{params.get('tab') ?? ''}</div>
      <Link data-testid="go-wi-2" to="/project/work-items/wi-2">
        Other task
      </Link>
    </>
  );
}

function renderPage(
  entry:
    | string
    | {
        pathname: string;
        search?: string;
        hash?: string;
        state?: unknown;
      } = '/project/work-items/wi-1',
) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Probe />
        <Routes>
          <Route path="/project/work-items/:id" element={<Page.default />} />
          <Route path="/project/work-items" element={<div data-testid="tasks-list" />} />
          <Route path="/needs-no-id" element={<Page.default />} />
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function loaded(entry?: Parameters<typeof renderPage>[0]) {
  const view = renderPage(entry);
  await screen.findByRole('heading', { level: 1, name: /Pour slab|Untitled task/ });
  return view;
}

const h1s = () => screen.queryAllByRole('heading', { level: 1 });

describe('WorkItemDetailPage', () => {
  beforeEach(async () => {
    installMatchMedia({ '(min-width: 768px)': true });
    for (const mock of [
      mockGetWorkItem,
      mockDeleteWorkItem,
      mockChangeStatus,
      mockFetchDeleteImpact,
      mockRunStatusChange,
      mockUseCreateContext,
      startEditDetails,
      startEditWhoWhere,
    ]) {
      mock.mockReset();
    }
    mockGetWorkItem.mockResolvedValue(TASK);
    mockFetchDeleteImpact.mockResolvedValue({ entityType: 'work_item', id: 'wi-1', effects: [] });
    mockRunStatusChange.mockResolvedValue(undefined);
    mockDeleteWorkItem.mockResolvedValue(undefined);
    documentsFact = null;
    diaryCount = 3;
    seen.keys = [];
    document.title = 'initial';
    if (!Page) {
      Page = await import('./WorkItemDetailPage.js');
      Events = await import('../../lib/objectCreatedEvents.js');
    }
  });

  describe('route and states', () => {
    it('sends a route without a task id back to the Tasks list', async () => {
      renderPage('/needs-no-id');
      expect(await screen.findByTestId('probe-tab')).toBeInTheDocument();
      await waitFor(() => expect(seen.path).toBe('/project/work-items'));
      expect(seen.type).toBe('REPLACE');
      expect(mockGetWorkItem).not.toHaveBeenCalled();
    });

    it('shows exactly one h1 with the task title and sets the tab title', async () => {
      await loaded();
      expect(h1s()).toHaveLength(1);
      expect(screen.getByRole('heading', { name: 'Pour slab', level: 1 })).toBeVisible();
      await waitFor(() => expect(document.title).toBe('Pour slab · Tasks · Cornerstone'));
      expect(mockGetWorkItem).toHaveBeenCalledWith('wi-1');
    });

    it('shows the loading heading, not the first task, when the route moves to another task', async () => {
      mockGetWorkItem.mockImplementation((id) =>
        id === 'wi-2' ? new Promise(() => {}) : Promise.resolve(TASK),
      );
      const view = renderPage();
      await screen.findByRole('heading', { level: 1, name: 'Pour slab' });
      fireEvent.click(screen.getByTestId('go-wi-2'));
      expect(await screen.findByRole('heading', { level: 1, name: 'Task' })).toBeVisible();
      expect(screen.queryByRole('heading', { level: 1, name: 'Pour slab' })).toBeNull();
      expect(mockGetWorkItem).toHaveBeenCalledWith('wi-2');
      view.unmount();
    });

    it('falls back to "Untitled task" for a whitespace-only title', async () => {
      mockGetWorkItem.mockResolvedValue(makeTaskPage({ title: '   ' }));
      renderPage();
      expect(await screen.findByRole('heading', { name: 'Untitled task', level: 1 })).toBeVisible();
      expect(h1s()).toHaveLength(1);
      await waitFor(() => expect(document.title).toBe('Untitled task · Tasks · Cornerstone'));
    });

    it('shows the typed h1 "Task" with the breadcrumb and a skeleton while loading', async () => {
      mockGetWorkItem.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByRole('heading', { name: 'Task', level: 1 })).toBeVisible();
      expect(h1s()).toHaveLength(1);
      expect(screen.getByRole('link', { name: /Tasks/ })).toHaveAttribute(
        'href',
        '/project/work-items',
      );
      expect(screen.getByRole('status', { name: 'Loading the task…' })).toBeInTheDocument();
      await waitFor(() => expect(document.title).toBe('Task · Tasks · Cornerstone'));
    });

    it('shows one "Task not found" h1, the breadcrumb and Back to Tasks on 404, without Retry', async () => {
      mockGetWorkItem.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'Work item not found' }),
      );
      renderPage('/project/work-items/missing');
      expect(
        await screen.findByRole('heading', { name: 'Task not found', level: 1 }),
      ).toBeVisible();
      expect(h1s()).toHaveLength(1);
      expect(screen.getByRole('navigation', { name: 'You are here' })).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      await waitFor(() => expect(document.title).toBe('Task not found · Tasks · Cornerstone'));
      fireEvent.click(screen.getByRole('button', { name: 'Back to Tasks' }));
      expect(await screen.findByTestId('tasks-list')).toBeInTheDocument();
    });

    it('keeps h1 "Task" above an alert with the translated message, Back and Retry on an API error', async () => {
      mockGetWorkItem.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      renderPage();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/.+/);
      expect(screen.getByRole('heading', { name: 'Task', level: 1 })).toBeVisible();
      expect(h1s()).toHaveLength(1);
      expect(within(alert).getByRole('button', { name: 'Back to Tasks' })).toBeVisible();
      expect(within(alert).getByRole('button', { name: 'Retry' })).toBeVisible();
    });

    it('uses the generic sentence for a network failure, and Retry loads the task again', async () => {
      mockGetWorkItem.mockRejectedValueOnce(new Error('down'));
      renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent(/.+/);
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(await screen.findByRole('heading', { name: 'Pour slab', level: 1 })).toBeVisible();
      expect(mockGetWorkItem).toHaveBeenCalledTimes(2);
    });
  });

  describe('page identity and origin', () => {
    it('D-37: trails only the Tasks parent and drops the old back and To Schedule buttons', async () => {
      await loaded();
      const nav = screen.getByRole('navigation', { name: 'You are here' });
      expect(within(nav).getAllByRole('link')).toHaveLength(1);
      expect(within(nav).getByRole('link', { name: /Tasks/ })).toHaveAttribute(
        'href',
        '/project/work-items',
      );
      expect(nav).not.toHaveTextContent('Pour slab');
      expect(screen.queryByRole('button', { name: /to schedule/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /back to work items/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /back to schedule/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /to work items/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId('breadcrumbs-back')).not.toBeInTheDocument();
    });

    it('offers Back to the exact Calendar URL the user came from', async () => {
      await loaded({
        pathname: '/project/work-items/wi-1',
        state: { origin: { to: '/schedule/calendar?calendarMode=week' } },
      });
      expect(screen.getByRole('link', { name: /Back to Calendar/ })).toHaveAttribute(
        'href',
        '/schedule/calendar?calendarMode=week',
      );
    });

    it('offers no Back when the origin is the Tasks list (the nearest parent)', async () => {
      await loaded({
        pathname: '/project/work-items/wi-1',
        state: { origin: { to: '/project/work-items?status=in_progress' } },
      });
      expect(screen.queryByTestId('breadcrumbs-back')).not.toBeInTheDocument();
    });

    it('carries the page as origin (with the task title) on strip links', async () => {
      mockGetWorkItem.mockResolvedValue(
        makeTaskPage({
          title: 'Pour slab',
          area: { id: 'a-1', name: 'Kitchen', color: null, ancestors: [] },
        } as Partial<WorkItemPageDetail>),
      );
      await loaded('/project/work-items/wi-1?tab=timing');
      fireEvent.click(screen.getByTestId('summary-fact-where'));
      await waitFor(() => expect(seen.path).toBe('/areas'));
      expect(seen.state).toEqual({
        origin: { to: '/project/work-items/wi-1?tab=timing', name: 'Pour slab' },
      });
    });
  });

  describe('header', () => {
    it('shows the status chip and a Start primary for a not started task', async () => {
      await loaded();
      expect(screen.getByTestId('task-header')).toBeInTheDocument();
      expect(screen.getByTestId('work-item-status')).toBeInTheDocument();
      expect(screen.getByTestId('task-primary-start')).toBeInTheDocument();
      expect(screen.queryByTestId('task-primary-done')).toBeNull();
    });

    it('offers Mark done for a task in progress', async () => {
      mockGetWorkItem.mockResolvedValue(
        makeTaskPage({ title: 'Pour slab', status: 'in_progress' }),
      );
      await loaded();
      expect(screen.getByTestId('task-primary-done')).toBeInTheDocument();
      expect(screen.queryByTestId('task-primary-start')).toBeNull();
    });

    it('offers the Log link for a finished task', async () => {
      mockGetWorkItem.mockResolvedValue(makeTaskPage({ title: 'Pour slab', status: 'completed' }));
      await loaded();
      expect(screen.getByTestId('task-primary-log')).toHaveAttribute('href', '/diary/new');
      expect(screen.queryByTestId('task-primary-start')).toBeNull();
      expect(screen.queryByTestId('task-primary-done')).toBeNull();
    });

    it('starting a task sends the actual start date, names the task, and refreshes on change and on undo', async () => {
      mockChangeStatus.mockResolvedValue({ record: TASK, undo: null } as never);
      await loaded();
      fireEvent.click(screen.getByTestId('task-primary-start'));
      fireEvent.click(await screen.findByTestId('task-primary-start-date-today'));

      await waitFor(() => expect(mockRunStatusChange).toHaveBeenCalledTimes(1));
      const options = mockRunStatusChange.mock.calls[0]![0] as unknown as {
        request: () => Promise<unknown>;
        recordName: string;
        statusLabel: string;
        dedupeKey: string;
        onChanged: () => void;
        onUndone: () => Promise<void>;
      };
      expect(options.recordName).toBe('Pour slab');
      expect(options.statusLabel).toBe('In progress');
      expect(options.dedupeKey).toBe('task:wi-1');
      await options.request();
      expect(mockChangeStatus).toHaveBeenCalledWith('wi-1', {
        status: 'in_progress',
        actualStartDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      const loads = mockGetWorkItem.mock.calls.length;
      await act(async () => options.onChanged());
      await waitFor(() => expect(mockGetWorkItem.mock.calls.length).toBe(loads + 1));
      await act(async () => options.onUndone());
      expect(mockGetWorkItem.mock.calls.length).toBe(loads + 2);
    });
  });

  describe('strip and tabs', () => {
    it('shows the strip with the facts of the task and the Documents fact when there is one', async () => {
      documentsFact = { id: 'documents', kind: 'static', label: 'Documents', value: '2' };
      await loaded();
      expect(screen.getByTestId('task-summary')).toBeInTheDocument();
      for (const id of ['when', 'where', 'who', 'cost', 'waitsFor', 'holdsUp', 'documents']) {
        expect(screen.getByTestId(`summary-fact-${id}`)).toBeInTheDocument();
      }
      expect(screen.getByTestId('stub-documents')).toBeInTheDocument();
    });

    it('leaves the Documents fact out when there is none', async () => {
      await loaded();
      expect(screen.queryByTestId('summary-fact-documents')).toBeNull();
    });

    it('lists Overview, Timing, Cost, Site diary and History with the cost and diary counts', async () => {
      await loaded();
      const tabs = screen.getByRole('tablist');
      expect(within(tabs).getAllByRole('tab')).toHaveLength(5);
      expect(within(tabs).getByRole('tab', { name: /Cost/ })).toHaveTextContent('2');
      expect(within(tabs).getByRole('tab', { name: /diary/i })).toHaveTextContent('3');
      expect(screen.getByTestId('stub-overview')).toBeInTheDocument();
      expect(screen.queryByTestId('stub-timing')).toBeNull();
    });

    it('mounts each panel on its first visit', async () => {
      const user = userEvent.setup();
      await loaded();
      await user.click(screen.getByRole('tab', { name: /Timing/ }));
      expect(await screen.findByTestId('stub-timing')).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: /Cost/ }));
      expect(await screen.findByTestId('stub-cost')).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: /diary/i }));
      expect(await screen.findByTestId('stub-diary')).toBeInTheDocument();
    });

    it('History shows who created the task and when it was last updated, then the history list', async () => {
      const user = userEvent.setup();
      await loaded();
      await user.click(screen.getByRole('tab', { name: /History/ }));
      const line = await screen.findByTestId('task-history-created');
      expect(line).toHaveTextContent('Created by Pat Sample on');
      expect(line).toHaveTextContent('Last updated');
      expect(screen.getByTestId('stub-history')).toHaveAttribute('data-entity', 'work_item:wi-1');
    });

    it('History says "Created on" when the creator is unknown', async () => {
      mockGetWorkItem.mockResolvedValue(makeTaskPage({ title: 'Pour slab', createdBy: null }));
      const user = userEvent.setup();
      await loaded();
      await user.click(screen.getByRole('tab', { name: /History/ }));
      const line = await screen.findByTestId('task-history-created');
      expect(line).toHaveTextContent(/^Created on/);
      expect(line).not.toHaveTextContent('Created by');
    });

    it('registers the task area and company as the creation context', async () => {
      mockGetWorkItem.mockResolvedValue(
        makeTaskPage({
          title: 'Pour slab',
          area: { id: 'a-1', name: 'Kitchen', color: null, ancestors: [] },
          assignedVendor: { id: 'v-1', name: 'Acme', trade: null, phone: null },
        } as Partial<WorkItemPageDetail>),
      );
      await loaded();
      expect(mockUseCreateContext).toHaveBeenLastCalledWith({ areaId: 'a-1', companyId: 'v-1' });
    });

    it('registers no area or company for a task without them', async () => {
      await loaded();
      expect(mockUseCreateContext).toHaveBeenLastCalledWith({
        areaId: undefined,
        companyId: undefined,
      });
    });

    it('refreshes the task when an invoice was created from its dialog, and only then', async () => {
      await loaded();
      const loads = mockGetWorkItem.mock.calls.length;
      act(() => Events.notifyObjectCreated('purchase'));
      expect(mockGetWorkItem.mock.calls.length).toBe(loads);
      act(() => Events.notifyObjectCreated('invoice'));
      await waitFor(() => expect(mockGetWorkItem.mock.calls.length).toBe(loads + 1));
    });
  });

  describe('Who and Where facts open the Who and where card', () => {
    it('on the Overview tab it starts editing right away', async () => {
      await loaded();
      fireEvent.click(screen.getByTestId('summary-fact-who'));
      expect(startEditWhoWhere).toHaveBeenCalledTimes(1);
    });

    it('from another tab it selects Overview first, then starts editing', async () => {
      await loaded('/project/work-items/wi-1?tab=timing');
      expect(screen.queryByTestId('stub-overview')).toBeNull();
      fireEvent.click(screen.getByTestId('summary-fact-who'));
      expect(await screen.findByTestId('stub-overview')).toBeInTheDocument();
      await waitFor(() => expect(startEditWhoWhere).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId('probe-tab')).toHaveTextContent('');
    });
  });

  describe('deep links (read once, one replace)', () => {
    it('does not navigate without an intent or depError', async () => {
      await loaded('/project/work-items/wi-1?tab=cost#something');
      expect(seen.keys).toHaveLength(1);
      expect(seen.type).toBe('POP');
      expect(seen.hash).toBe('#something');
    });

    it.each(['reschedule', 'constraints'])(
      '#%s opens the Timing tab with the intent, drops the hash, replaces once and keeps the state',
      async (intent) => {
        const state = { origin: { to: '/schedule', name: 'Schedule' } };
        await loaded({ pathname: '/project/work-items/wi-1', hash: `#${intent}`, state });
        expect(await screen.findByTestId('stub-timing')).toHaveAttribute('data-intent', intent);
        expect(seen.search).toBe('?tab=timing');
        expect(seen.hash).toBe('');
        expect(seen.type).toBe('REPLACE');
        expect(seen.state).toEqual(state);
        expect(seen.keys).toHaveLength(2);
      },
    );

    it('ignores an unknown hash', async () => {
      await loaded('/project/work-items/wi-1#nonsense');
      expect(seen.keys).toHaveLength(1);
      expect(seen.search).toBe('');
    });

    it('?depError= goes to the Timing tab with the titles in the panel, and leaves the URL', async () => {
      await loaded('/project/work-items/wi-1?depError=Dig%20trench%2C%20Order%20pipes');
      expect(await screen.findByTestId('stub-timing')).toHaveAttribute(
        'data-deperror',
        'Dig trench, Order pipes',
      );
      expect(seen.search).toBe('?tab=timing');
      expect(seen.type).toBe('REPLACE');
      expect(seen.keys).toHaveLength(2);
    });

    it('keeps other query parameters while replacing', async () => {
      await loaded('/project/work-items/wi-1?foo=bar&depError=X#reschedule');
      await screen.findByTestId('stub-timing');
      expect(new URLSearchParams(seen.search).get('foo')).toBe('bar');
      expect(new URLSearchParams(seen.search).get('tab')).toBe('timing');
      expect(new URLSearchParams(seen.search).has('depError')).toBe(false);
      expect(seen.hash).toBe('');
    });

    it('the panel consumes the intent and dismisses the dependency error', async () => {
      await loaded('/project/work-items/wi-1?depError=X#constraints');
      const timing = await screen.findByTestId('stub-timing');
      expect(timing).toHaveAttribute('data-intent', 'constraints');
      fireEvent.click(screen.getByTestId('stub-consume'));
      fireEvent.click(screen.getByTestId('stub-dismiss'));
      expect(timing).toHaveAttribute('data-intent', '');
      expect(timing).toHaveAttribute('data-deperror', '');
    });
  });

  describe('delete', () => {
    async function openByKey(key: string) {
      await loaded();
      fireEvent.keyDown(document.body, { key });
      return screen.findByRole('alertdialog');
    }

    it('opens from the header menu with the task name and loads the delete impact', async () => {
      await loaded();
      fireEvent.click(screen.getByTestId('object-header-menu'));
      fireEvent.click(await screen.findByTestId('object-header-delete'));
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog).toHaveTextContent('Pour slab');
      await waitFor(() => expect(mockFetchDeleteImpact).toHaveBeenCalledWith('work_item', 'wi-1'));
    });

    it.each(['Delete', 'Backspace'])('opens with the %s key', async (key) => {
      const dialog = await openByKey(key);
      expect(dialog).toHaveTextContent('Pour slab');
    });

    it('does not load the delete impact before the dialog opens', async () => {
      await loaded();
      expect(mockFetchDeleteImpact).not.toHaveBeenCalled();
    });

    it('Cancel closes the dialog without deleting', async () => {
      await openByKey('Delete');
      fireEvent.click(screen.getByTestId('work-item-delete-cancel'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(mockDeleteWorkItem).not.toHaveBeenCalled();
    });

    it('deleting returns to the Tasks list with a replace', async () => {
      await openByKey('Delete');
      await act(async () => {
        fireEvent.click(screen.getByTestId('work-item-delete-confirm'));
      });
      expect(mockDeleteWorkItem).toHaveBeenCalledWith('wi-1');
      expect(await screen.findByTestId('tasks-list')).toBeInTheDocument();
      expect(seen.path).toBe('/project/work-items');
      expect(seen.type).toBe('REPLACE');
    });

    it('a blocked delete (409) shows the translated reason and no confirm button', async () => {
      mockDeleteWorkItem.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'CONFLICT', message: 'x' }),
      );
      await openByKey('Delete');
      await act(async () => {
        fireEvent.click(screen.getByTestId('work-item-delete-confirm'));
      });
      expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toBeInTheDocument();
      expect(screen.queryByTestId('work-item-delete-confirm')).toBeNull();
    });

    it('another API error keeps the confirm button', async () => {
      mockDeleteWorkItem.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      await openByKey('Delete');
      await act(async () => {
        fireEvent.click(screen.getByTestId('work-item-delete-confirm'));
      });
      expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toBeInTheDocument();
      expect(screen.getByTestId('work-item-delete-confirm')).toBeInTheDocument();
    });

    it('a network failure shows the fallback sentence; reopening clears the error', async () => {
      mockDeleteWorkItem.mockRejectedValueOnce(new Error('down'));
      await openByKey('Delete');
      await act(async () => {
        fireEvent.click(screen.getByTestId('work-item-delete-confirm'));
      });
      expect(await screen.findByText("Couldn't delete the task.")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('work-item-delete-cancel'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      fireEvent.keyDown(document.body, { key: 'Delete' });
      await screen.findByRole('alertdialog');
      expect(screen.queryByText("Couldn't delete the task.")).toBeNull();
    });
  });

  describe('keyboard shortcuts', () => {
    it('e starts editing the Details card on the Overview tab', async () => {
      await loaded();
      fireEvent.keyDown(document.body, { key: 'e' });
      expect(startEditDetails).toHaveBeenCalledTimes(1);
    });

    it('e from another tab selects Overview first, then edits the Details card', async () => {
      await loaded('/project/work-items/wi-1?tab=cost');
      fireEvent.keyDown(document.body, { key: 'e' });
      expect(await screen.findByTestId('stub-overview')).toBeInTheDocument();
      await waitFor(() => expect(startEditDetails).toHaveBeenCalledTimes(1));
    });

    it('? opens the shortcut help with the page shortcuts, without the Backspace twin', async () => {
      await loaded();
      fireEvent.keyDown(document.body, { key: '?' });
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('Edit the task details');
      expect(dialog).toHaveTextContent('Delete the task');
      expect(dialog).toHaveTextContent('Show keyboard shortcuts');
      expect(within(dialog).queryByText('Backspace')).toBeNull();
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
  });
});
