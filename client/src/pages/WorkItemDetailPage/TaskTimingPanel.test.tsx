/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { WorkItemPageDetail } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeDependency, makeTaskPage } from '../../test/taskPageFixtures.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as TimelineApiTypes from '../../lib/timelineApi.js';
import type * as LinkApiTypes from '../../lib/workItemMilestonesApi.js';
import type * as PurchasesApiTypes from '../../lib/householdItemWorkItemsApi.js';
import type * as PanelModule from './TaskTimingPanel.js';
import type { TaskTimingIntent } from './taskAnchors.js';

const mockGetTimeline = jest.fn<typeof TimelineApiTypes.getTimeline>();
const mockGetMilestones = jest.fn<typeof LinkApiTypes.getWorkItemMilestones>();
const mockFetchPurchases = jest.fn<typeof PurchasesApiTypes.fetchLinkedHouseholdItems>();

jest.unstable_mockModule('../../lib/timelineApi.js', () => ({ getTimeline: mockGetTimeline }));
jest.unstable_mockModule('../../lib/workItemMilestonesApi.js', () => ({
  getWorkItemMilestones: mockGetMilestones,
  addRequiredMilestone: jest.fn(),
  addLinkedMilestone: jest.fn(),
  removeRequiredMilestone: jest.fn(),
  removeLinkedMilestone: jest.fn(),
}));
jest.unstable_mockModule('../../lib/householdItemWorkItemsApi.js', () => ({
  fetchLinkedHouseholdItems: mockFetchPurchases,
}));
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  updateWorkItem: jest.fn(),
  listWorkItems: jest.fn(),
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());
// The shared panel has its own tests; here only the wiring around it matters.
jest.unstable_mockModule('../../components/ReschedulePanel/ReschedulePanel.js', () => ({
  ReschedulePanel: (props: {
    onSaved: () => void;
    onUndone: () => void;
    onCancel: () => void;
    onPreviewChange: (preview: null) => void;
  }) => (
    <div data-testid="reschedule-panel">
      <button type="button" data-testid="rp-saved" onClick={props.onSaved} />
      <button type="button" data-testid="rp-preview" onClick={() => props.onPreviewChange(null)} />
      <button type="button" data-testid="rp-undone" onClick={props.onUndone} />
      <button type="button" data-testid="rp-cancel" onClick={props.onCancel} />
    </div>
  ),
}));

let Panel: typeof PanelModule;
const ORIGIN = { origin: { to: '/project/work-items/wi-1?tab=timing', name: 'Pour slab' } };

const DATED = makeTaskPage({
  startDate: '2026-03-02',
  endDate: '2026-03-06',
  projectedStartDate: '2026-03-02',
  projectedEndDate: '2026-03-06',
  durationDays: 4,
});
const DONE = makeTaskPage({ ...DATED, status: 'completed' });

interface Props {
  task?: WorkItemPageDetail;
  intent?: TaskTimingIntent | null;
  depError?: string | null;
  refresh?: () => Promise<void>;
  onIntentConsumed?: () => void;
  onDepErrorDismiss?: () => void;
  completeOnRefresh?: boolean;
}

function Host({
  task = DATED,
  intent = null,
  depError = null,
  refresh,
  onIntentConsumed,
  onDepErrorDismiss,
  completeOnRefresh = false,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [current, setCurrent] = useState(task);
  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} data-testid="page-h1">
        Pour slab
      </h1>
      <Panel.TaskTimingPanel
        task={current}
        revision={0}
        refresh={async () => {
          if (completeOnRefresh) setCurrent(DONE);
          await refresh?.();
        }}
        originState={ORIGIN}
        headingRef={headingRef}
        intent={intent}
        onIntentConsumed={onIntentConsumed ?? (() => undefined)}
        depError={depError}
        onDepErrorDismiss={onDepErrorDismiss ?? (() => undefined)}
      />
    </>
  );
}

function renderPanel(props: Props = {}) {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <Host {...props} />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('TaskTimingPanel', () => {
  beforeEach(async () => {
    installMatchMedia({ '(min-width: 768px)': true });
    mockGetTimeline.mockReset();
    mockGetMilestones.mockReset();
    mockFetchPurchases.mockReset();
    mockGetTimeline.mockResolvedValue({ workItems: [], milestones: [] } as never);
    mockGetMilestones.mockResolvedValue({ required: [], linked: [] });
    mockFetchPurchases.mockResolvedValue([]);
    if (!Panel) Panel = await import('./TaskTimingPanel.js');
  });

  it('exports the panel by name and as the default', () => {
    expect(Panel.default).toBe(Panel.TaskTimingPanel);
  });

  it('shows Dates, Constraints and the relation lists in order', async () => {
    renderPanel({
      task: makeTaskPage({
        ...DATED,
        dependencies: { predecessors: [makeDependency('p1')], successors: [] },
      }),
    });
    const ids = [
      'task-dates',
      'task-constraints',
      'task-waits-for',
      'task-waiting',
      'task-milestones',
    ];
    const nodes = ids.map((id) => screen.getByTestId(id));
    nodes.slice(1).forEach((node, i) => {
      expect(
        nodes[i]!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
    await waitFor(() => expect(mockGetMilestones).toHaveBeenCalledWith('wi-1'));
  });

  it('offers Reschedule only for an unfinished task that has dates', () => {
    const { unmount } = renderPanel();
    expect(screen.getByTestId('task-reschedule')).toBeInTheDocument();
    unmount();
    const { unmount: unmountDone } = renderPanel({ task: DONE });
    expect(screen.queryByTestId('task-reschedule')).toBeNull();
    unmountDone();
    renderPanel({ task: makeTaskPage() });
    expect(screen.queryByTestId('task-reschedule')).toBeNull();
  });

  describe('Reschedule section', () => {
    async function open() {
      fireEvent.click(screen.getByTestId('task-reschedule'));
      return screen.findByTestId('reschedule-panel');
    }

    it('opens under a heading with the task title, loads the timeline, and hides the button', async () => {
      renderPanel();
      let resolve!: (value: never) => void;
      mockGetTimeline.mockReturnValueOnce(new Promise((res) => (resolve = res)));
      fireEvent.click(screen.getByTestId('task-reschedule'));
      expect(screen.getByTestId('task-reschedule-section')).toBeInTheDocument();
      expect(
        within(screen.getByTestId('task-reschedule-section')).getByRole('heading'),
      ).toHaveTextContent(/Pour slab/);
      expect(screen.queryByTestId('reschedule-panel')).toBeNull();
      expect(screen.queryByTestId('task-reschedule')).toBeNull();
      await act(async () => resolve({ workItems: [], milestones: [] } as never));
      expect(await screen.findByTestId('reschedule-panel')).toBeInTheDocument();
    });

    it('Cancel closes the section and focuses the Reschedule button again', async () => {
      renderPanel();
      await open();
      fireEvent.click(screen.getByTestId('rp-cancel'));
      await waitFor(() => expect(screen.queryByTestId('task-reschedule-section')).toBeNull());
      expect(screen.getByTestId('task-reschedule')).toHaveFocus();
    });

    it('ignores the preview of the shared panel (no chart on the task page)', async () => {
      renderPanel();
      await open();
      fireEvent.click(screen.getByTestId('rp-preview'));
      expect(screen.getByTestId('reschedule-panel')).toBeInTheDocument();
    });

    it('Save closes the section, focuses the button and refreshes the page', async () => {
      const refresh = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      renderPanel({ refresh });
      await open();
      fireEvent.click(screen.getByTestId('rp-saved'));
      await waitFor(() => expect(screen.queryByTestId('task-reschedule-section')).toBeNull());
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('task-reschedule')).toHaveFocus();
    });

    it('an Undo refreshes the page and leaves the section and focus alone', async () => {
      const refresh = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      renderPanel({ refresh });
      await open();
      fireEvent.click(screen.getByTestId('rp-undone'));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId('task-reschedule-section')).toBeInTheDocument();
    });

    it('shows a load failure with Retry, and Retry loads the timeline', async () => {
      renderPanel();
      mockGetTimeline.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      fireEvent.click(screen.getByTestId('task-reschedule'));
      expect(await screen.findByTestId('task-reschedule-retry')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('task-reschedule-retry'));
      expect(await screen.findByTestId('reschedule-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('task-reschedule-retry')).toBeNull();
    });

    it('uses the fallback sentence for a non-API load failure', async () => {
      renderPanel();
      mockGetTimeline.mockRejectedValueOnce(new Error('down'));
      fireEvent.click(screen.getByTestId('task-reschedule'));
      expect(await screen.findByRole('alert')).toHaveTextContent(/.+/);
    });

    it.each(['resolves', 'rejects'] as const)(
      'ignores a timeline request that %s after the page was left',
      async (outcome) => {
        const view = renderPanel();
        let settle!: () => void;
        mockGetTimeline.mockReturnValueOnce(
          new Promise((resolve, reject) => {
            settle = () =>
              outcome === 'resolves'
                ? resolve({ workItems: [], milestones: [] } as never)
                : reject(new Error('late'));
          }),
        );
        fireEvent.click(screen.getByTestId('task-reschedule'));
        view.unmount();
        await act(async () => settle());
        expect(screen.queryByTestId('reschedule-panel')).toBeNull();
      },
    );
  });

  describe('intents', () => {
    it('#reschedule opens the section from the first render, consumed once, constraints untouched', async () => {
      const onIntentConsumed = jest.fn();
      renderPanel({ intent: 'reschedule', onIntentConsumed });
      expect(screen.getByTestId('task-reschedule-section')).toBeInTheDocument();
      expect(onIntentConsumed).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('task-not-before-input')).toBeNull();
      await screen.findByTestId('reschedule-panel');
    });

    it('#reschedule on a finished task starts the Constraints edit instead', async () => {
      const onIntentConsumed = jest.fn();
      renderPanel({ task: DONE, intent: 'reschedule', onIntentConsumed });
      expect(await screen.findByTestId('task-not-before-input')).toBeInTheDocument();
      expect(screen.queryByTestId('task-reschedule-section')).toBeNull();
      expect(onIntentConsumed).toHaveBeenCalledTimes(1);
    });

    it('#reschedule on an undated task starts the Constraints edit instead', async () => {
      renderPanel({ task: makeTaskPage(), intent: 'reschedule' });
      expect(await screen.findByTestId('task-not-before-input')).toBeInTheDocument();
    });

    it('#constraints starts the Constraints edit and leaves Reschedule closed', async () => {
      const onIntentConsumed = jest.fn();
      renderPanel({ intent: 'constraints', onIntentConsumed });
      expect(await screen.findByTestId('task-not-before-input')).toBeInTheDocument();
      expect(screen.queryByTestId('task-reschedule-section')).toBeNull();
      expect(onIntentConsumed).toHaveBeenCalledTimes(1);
    });

    it('does nothing without an intent', () => {
      const onIntentConsumed = jest.fn();
      renderPanel({ onIntentConsumed });
      expect(onIntentConsumed).not.toHaveBeenCalled();
      expect(screen.queryByTestId('task-not-before-input')).toBeNull();
    });
  });

  describe('dependency error banner', () => {
    it('is absent without a depError', () => {
      renderPanel();
      expect(screen.queryByTestId('task-dep-error-dismiss')).toBeNull();
    });

    it('names the titles the New task form could not add and can be dismissed', () => {
      const onDepErrorDismiss = jest.fn();
      renderPanel({ depError: 'Dig trench, Order pipes', onDepErrorDismiss });
      expect(screen.getByRole('alert')).toHaveTextContent(
        "Couldn't add these dependencies: Dig trench, Order pipes",
      );
      fireEvent.click(screen.getByTestId('task-dep-error-dismiss'));
      expect(onDepErrorDismiss).toHaveBeenCalledTimes(1);
    });
  });

  it('lists the purchases that wait on the task once loaded', async () => {
    mockFetchPurchases.mockResolvedValue([
      {
        id: 'h1',
        name: 'Heat pump',
        category: 'hic-furniture',
        status: 'planned',
        targetDeliveryDate: null,
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
      } as never,
    ]);
    renderPanel();
    expect(await screen.findByTestId('task-purchases-row-h1')).toBeInTheDocument();
  });
});
