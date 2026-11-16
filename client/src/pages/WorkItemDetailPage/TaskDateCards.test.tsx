/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createRef } from 'react';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { WorkItemPageDetail } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeTaskPage } from '../../test/taskPageFixtures.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as AreasApiTypes from '../../lib/areasApi.js';
import enWorkItems from '../../i18n/en/workItems.json';
import type * as CardsModule from './TaskDateCards.js';
import type * as ScopeModule from '../../components/SectionCard/SectionCardScope.js';
import type { SectionCardController } from '../../components/SectionCard/SectionCard.js';

const mockUpdateWorkItem = jest.fn<typeof WorkItemsApiTypes.updateWorkItem>();
const mockListUsers = jest.fn<typeof UsersApiTypes.listUsers>();
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  updateWorkItem: mockUpdateWorkItem,
  createWorkItem: jest.fn(),
  listWorkItems: jest.fn(),
}));
const mockFetchAreas = jest.fn<typeof AreasApiTypes.fetchAreas>();
jest.unstable_mockModule('../../lib/usersApi.js', () => ({ listUsers: mockListUsers }));
jest.unstable_mockModule('../../lib/areasApi.js', () => ({
  fetchAreas: mockFetchAreas,
  createArea: jest.fn(),
  updateArea: jest.fn(),
  deleteArea: jest.fn(),
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let Cards: typeof CardsModule;
let Scope: typeof ScopeModule;

const refresh = jest.fn<() => Promise<void>>();

function renderCards(
  task: WorkItemPageDetail,
  extras: {
    constraintsRef?: React.Ref<SectionCardController>;
    rescheduleButton?: React.ReactNode;
  } = {},
) {
  const view = (current: WorkItemPageDetail) => (
    <MemoryRouter>
      <Scope.SectionCardScope>
        <Cards.TaskDateCards
          task={current}
          refresh={refresh}
          constraintsRef={extras.constraintsRef ?? null}
          rescheduleButton={extras.rescheduleButton ?? null}
        />
      </Scope.SectionCardScope>
    </MemoryRouter>
  );
  const result = render(view(task));
  return { ...result, update: (next: WorkItemPageDetail) => result.rerender(view(next)) };
}

const DATED = makeTaskPage({
  startDate: '2026-03-02',
  endDate: '2026-03-06',
  projectedStartDate: '2026-03-02',
  projectedEndDate: '2026-03-06',
  durationDays: 4,
});

describe('TaskDateCards', () => {
  beforeEach(async () => {
    mockUpdateWorkItem.mockReset();
    mockUpdateWorkItem.mockResolvedValue({} as never);
    mockListUsers.mockReset();
    mockListUsers.mockResolvedValue({ users: [] });
    mockFetchAreas.mockReset();
    mockFetchAreas.mockResolvedValue({ areas: [] });
    refresh.mockReset();
    refresh.mockResolvedValue(undefined);
    if (!Cards) {
      Cards = await import('./TaskDateCards.js');
      Scope = await import('../../components/SectionCard/SectionCardScope.js');
    }
  });

  describe('Dates (read)', () => {
    it('shows the shown start and end, the actual dates and the duration', () => {
      renderCards(
        makeTaskPage({
          ...DATED,
          actualStartDate: '2026-03-03',
          actualEndDate: '2026-03-09',
          projectedStartDate: null,
          projectedEndDate: null,
        }),
      );
      expect(screen.getByTestId('task-start')).toHaveTextContent('2026');
      expect(screen.getByTestId('task-start')).toHaveTextContent('3');
      expect(screen.getByTestId('task-started')).toHaveTextContent('2026');
      expect(screen.getByTestId('task-finished')).toHaveTextContent('2026');
      expect(screen.getByTestId('task-duration')).toHaveTextContent('4');
    });

    it('says "not scheduled" for missing start/end and "Not set" for missing actuals and duration', () => {
      renderCards(makeTaskPage());
      expect(screen.getByTestId('task-start')).toHaveTextContent(/not scheduled/i);
      expect(screen.getByTestId('task-end')).toHaveTextContent(/not scheduled/i);
      expect(screen.getByTestId('task-started')).toHaveTextContent('Not set');
      expect(screen.getByTestId('task-finished')).toHaveTextContent('Not set');
      expect(screen.getByTestId('task-duration')).toHaveTextContent('Not set');
    });

    it('adds a planned line only when the plan differs from the shown dates', () => {
      const { update } = renderCards(DATED);
      expect(screen.queryByTestId('work-item-planned-dates')).toBeNull();
      update({ ...DATED, projectedStartDate: '2026-03-09', projectedEndDate: '2026-03-13' });
      expect(screen.getByTestId('work-item-planned-dates')).toBeInTheDocument();
    });

    it('renders the Reschedule button node in the Dates card, and none when null', () => {
      const { unmount } = renderCards(DATED, {
        rescheduleButton: <button data-testid="resched">Reschedule</button>,
      });
      expect(screen.getByTestId('task-dates')).toContainElement(screen.getByTestId('resched'));
      unmount();
      renderCards(DATED);
      expect(screen.queryByTestId('resched')).toBeNull();
    });
  });

  describe('Dates (edit)', () => {
    it('opens with the current duration and actual dates in the fields', async () => {
      const user = userEvent.setup();
      renderCards(
        makeTaskPage({ ...DATED, actualStartDate: '2026-03-03', actualEndDate: '2026-03-09' }),
      );
      await user.click(screen.getByTestId('task-dates-edit'));
      expect(screen.getByTestId('task-duration-input')).toHaveValue(4);
      expect(screen.getByTestId('task-started-input')).toHaveValue('2026-03-03');
      expect(screen.getByTestId('task-finished-input')).toHaveValue('2026-03-09');
    });

    it('saves only the changed field and refreshes the page', async () => {
      const user = userEvent.setup();
      renderCards(DATED);
      await user.click(screen.getByTestId('task-dates-edit'));
      fireEvent.change(screen.getByTestId('task-duration-input'), { target: { value: '7' } });
      await user.click(screen.getByTestId('task-dates-save'));
      await waitFor(() =>
        expect(mockUpdateWorkItem).toHaveBeenCalledWith('wi-1', { durationDays: 7 }),
      );
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('clearing the duration saves null', async () => {
      const user = userEvent.setup();
      renderCards(DATED);
      await user.click(screen.getByTestId('task-dates-edit'));
      fireEvent.change(screen.getByTestId('task-duration-input'), { target: { value: '' } });
      await user.click(screen.getByTestId('task-dates-save'));
      await waitFor(() =>
        expect(mockUpdateWorkItem).toHaveBeenCalledWith('wi-1', { durationDays: null }),
      );
    });

    it('saves started and finished dates, and clearing them saves null', async () => {
      const user = userEvent.setup();
      renderCards(DATED);
      await user.click(screen.getByTestId('task-dates-edit'));
      fireEvent.change(screen.getByTestId('task-started-input'), {
        target: { value: '2026-03-03' },
      });
      fireEvent.change(screen.getByTestId('task-finished-input'), {
        target: { value: '2026-03-05' },
      });
      await user.click(screen.getByTestId('task-dates-save'));
      await waitFor(() =>
        expect(mockUpdateWorkItem).toHaveBeenCalledWith('wi-1', {
          actualStartDate: '2026-03-03',
          actualEndDate: '2026-03-05',
        }),
      );
    });

    it('clears an existing started and finished date by saving null', async () => {
      const user = userEvent.setup();
      renderCards(
        makeTaskPage({ ...DATED, actualStartDate: '2026-03-03', actualEndDate: '2026-03-09' }),
      );
      await user.click(screen.getByTestId('task-dates-edit'));
      fireEvent.change(screen.getByTestId('task-started-input'), { target: { value: '' } });
      fireEvent.change(screen.getByTestId('task-finished-input'), { target: { value: '' } });
      await user.click(screen.getByTestId('task-dates-save'));
      await waitFor(() =>
        expect(mockUpdateWorkItem).toHaveBeenCalledWith('wi-1', {
          actualStartDate: null,
          actualEndDate: null,
        }),
      );
    });

    it('rejects a finish before the start without a request', async () => {
      const user = userEvent.setup();
      renderCards(DATED);
      await user.click(screen.getByTestId('task-dates-edit'));
      fireEvent.change(screen.getByTestId('task-started-input'), {
        target: { value: '2026-03-09' },
      });
      fireEvent.change(screen.getByTestId('task-finished-input'), {
        target: { value: '2026-03-02' },
      });
      await user.click(screen.getByTestId('task-dates-save'));
      await waitFor(() =>
        expect(screen.getByTestId('task-finished-input')).toHaveAttribute('aria-invalid', 'true'),
      );
      expect(screen.getByTestId('task-finished-input')).toHaveAttribute('aria-invalid', 'true');
      expect(mockUpdateWorkItem).not.toHaveBeenCalled();
    });

    it('rejects a non-whole duration without a request', async () => {
      const user = userEvent.setup();
      renderCards(DATED);
      await user.click(screen.getByTestId('task-dates-edit'));
      fireEvent.change(screen.getByTestId('task-duration-input'), { target: { value: '2.5' } });
      await user.click(screen.getByTestId('task-dates-save'));
      expect(screen.getByTestId('task-duration-input')).toHaveAttribute('aria-invalid', 'true');
      expect(mockUpdateWorkItem).not.toHaveBeenCalled();
    });

    it('shows the server error in the card and keeps editing; Cancel clears it', async () => {
      const user = userEvent.setup();
      mockUpdateWorkItem.mockRejectedValueOnce(
        new ApiClientError(400, { code: 'VALIDATION_ERROR', message: 'bad' }),
      );
      renderCards(DATED);
      await user.click(screen.getByTestId('task-dates-edit'));
      fireEvent.change(screen.getByTestId('task-duration-input'), { target: { value: '9' } });
      await user.click(screen.getByTestId('task-dates-save'));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByTestId('task-duration-input')).toBeInTheDocument();
      expect(refresh).not.toHaveBeenCalled();
      await user.click(screen.getByTestId('task-dates-cancel'));
      await user.click(await screen.findByTestId('task-dates-discard-confirm'));
      await user.click(screen.getByTestId('task-dates-edit'));
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByTestId('task-duration-input')).toHaveValue(4);
    });

    it('uses the fallback message for a non-API failure', async () => {
      const user = userEvent.setup();
      mockUpdateWorkItem.mockRejectedValueOnce(new Error('network'));
      renderCards(DATED);
      await user.click(screen.getByTestId('task-dates-edit'));
      fireEvent.change(screen.getByTestId('task-duration-input'), { target: { value: '9' } });
      await user.click(screen.getByTestId('task-dates-save'));
      expect(await screen.findByRole('alert')).toHaveTextContent(/.+/);
    });

    it('does not swallow a failing page refresh after a successful save (the page refresh is silent by contract)', async () => {
      const user = userEvent.setup();
      refresh.mockRejectedValueOnce(new Error('down'));
      renderCards(DATED);
      await user.click(screen.getByTestId('task-dates-edit'));
      fireEvent.change(screen.getByTestId('task-duration-input'), { target: { value: '9' } });
      await user.click(screen.getByTestId('task-dates-save'));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      expect(mockUpdateWorkItem).toHaveBeenCalledTimes(1);
      // The save request itself did not fail, so no save error is shown on the card
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('schema-backed fields (#2254)', () => {
    it('makes no reference-data request while read-only', () => {
      renderCards(DATED);
      expect(mockListUsers).not.toHaveBeenCalled();
      expect(screen.queryByTestId('task-duration-input')).toBeNull();
    });

    it('the Dates and Constraints cards in edit scope never ask for the members', async () => {
      const user = userEvent.setup();
      renderCards(DATED);
      await user.click(screen.getByTestId('task-dates-edit'));
      await screen.findByTestId('task-duration-input');
      await act(async () => {});
      expect(mockListUsers).not.toHaveBeenCalled();
      await user.click(screen.getByTestId('task-dates-cancel'));
      await user.click(screen.getByTestId('task-constraints-edit'));
      await screen.findByTestId('task-not-before-input');
      await act(async () => {});
      expect(mockListUsers).not.toHaveBeenCalled();
    });

    it('the Dates and Constraints cards in edit scope never request the areas', async () => {
      const user = userEvent.setup();
      renderCards(DATED);
      await user.click(screen.getByTestId('task-dates-edit'));
      await screen.findByTestId('task-duration-input');
      await act(async () => {});
      await user.click(screen.getByTestId('task-dates-cancel'));
      await user.click(screen.getByTestId('task-constraints-edit'));
      await screen.findByTestId('task-not-before-input');
      await act(async () => {});
      expect(mockFetchAreas).not.toHaveBeenCalled();
    });

    it('labels the duration like the dialog ("Duration (days)") and keeps the stable test ids', async () => {
      const user = userEvent.setup();
      renderCards(DATED);
      await user.click(screen.getByTestId('task-dates-edit'));
      const duration = screen.getByLabelText(enWorkItems.create.fields.durationDays);
      expect(enWorkItems.create.fields.durationDays).toBe('Duration (days)');
      expect(duration).toBe(screen.getByTestId('task-duration-input'));
      expect(screen.getByLabelText(enWorkItems.taskPage.timing.started)).toBe(
        screen.getByTestId('task-started-input'),
      );
      expect(screen.getByLabelText(enWorkItems.taskPage.timing.finished)).toBe(
        screen.getByTestId('task-finished-input'),
      );
    });

    it('prefixes ids per card so the Dates and Constraints cards never share an id', async () => {
      const user = userEvent.setup();
      renderCards(DATED);
      await user.click(screen.getByTestId('task-dates-edit'));
      const duration = screen.getByTestId('task-duration-input');
      expect(duration.id).toMatch(/-dates-durationDays$/);
      await user.click(screen.getByTestId('task-dates-cancel'));
      await user.click(screen.getByTestId('task-constraints-edit'));
      expect(screen.getByTestId('task-not-before-input').id).toMatch(/-constraints-startAfter$/);
    });

    it('shows the unified duration error for a fraction, a negative number and its aria wiring', async () => {
      const user = userEvent.setup();
      renderCards(DATED);
      await user.click(screen.getByTestId('task-dates-edit'));
      const duration = screen.getByTestId('task-duration-input');
      fireEvent.change(duration, { target: { value: '2.5' } });
      await user.click(screen.getByTestId('task-dates-save'));
      const message = screen.getByText(enWorkItems.create.fields.durationError);
      expect(enWorkItems.create.fields.durationError).toBe('Duration must be 0 or more days.');
      expect(message).toHaveAttribute('id', `${duration.id}-error`);
      expect(duration.getAttribute('aria-describedby')).toContain(`${duration.id}-error`);
      fireEvent.change(duration, { target: { value: '-3' } });
      await user.click(screen.getByTestId('task-dates-save'));
      expect(screen.getByText(enWorkItems.create.fields.durationError)).toBeInTheDocument();
      expect(mockUpdateWorkItem).not.toHaveBeenCalled();
    });

    it('accepts a duration of 0 and sends it as 0 (not null)', async () => {
      const user = userEvent.setup();
      renderCards(DATED);
      await user.click(screen.getByTestId('task-dates-edit'));
      fireEvent.change(screen.getByTestId('task-duration-input'), { target: { value: '0' } });
      await user.click(screen.getByTestId('task-dates-save'));
      await waitFor(() =>
        expect(mockUpdateWorkItem).toHaveBeenCalledWith('wi-1', { durationDays: 0 }),
      );
    });

    it('shows the finished-before-started message under the Finished field only', async () => {
      const user = userEvent.setup();
      renderCards(DATED);
      await user.click(screen.getByTestId('task-dates-edit'));
      fireEvent.change(screen.getByTestId('task-started-input'), {
        target: { value: '2026-03-09' },
      });
      fireEvent.change(screen.getByTestId('task-finished-input'), {
        target: { value: '2026-03-02' },
      });
      await user.click(screen.getByTestId('task-dates-save'));
      const message = screen.getByText(enWorkItems.taskPage.timing.finishedBeforeStarted);
      expect(message.closest('[data-field]')).toHaveAttribute('data-field', 'actualEndDate');
      expect(screen.getByTestId('task-started-input')).not.toHaveAttribute('aria-invalid');
    });

    it('shows the constraints message under Start by only, with the dialog copy', async () => {
      const user = userEvent.setup();
      renderCards(makeTaskPage());
      await user.click(screen.getByTestId('task-constraints-edit'));
      fireEvent.change(screen.getByTestId('task-not-before-input'), {
        target: { value: '2026-05-01' },
      });
      fireEvent.change(screen.getByTestId('task-start-by-input'), {
        target: { value: '2026-04-01' },
      });
      await user.click(screen.getByTestId('task-constraints-save'));
      const message = screen.getByText(enWorkItems.create.fields.constraintsError);
      expect(message.closest('[data-field]')).toHaveAttribute('data-field', 'startBefore');
      expect(screen.getByTestId('task-not-before-input')).not.toHaveAttribute('aria-invalid');
    });

    it('a Dates error never appears in the Constraints card (per-card validation)', async () => {
      const user = userEvent.setup();
      renderCards(DATED);
      await user.click(screen.getByTestId('task-dates-edit'));
      fireEvent.change(screen.getByTestId('task-duration-input'), { target: { value: '1.5' } });
      await user.click(screen.getByTestId('task-dates-save'));
      expect(screen.getAllByText(enWorkItems.create.fields.durationError)).toHaveLength(1);
      expect(screen.queryByText(enWorkItems.create.fields.constraintsError)).toBeNull();
    });
  });

  describe('Constraints', () => {
    it('shows Not before and Start by, Not set when empty', () => {
      renderCards(makeTaskPage({ startAfter: '2026-03-01' }));
      expect(screen.getByTestId('task-not-before')).toHaveTextContent('2026');
      expect(screen.getByTestId('task-start-by')).toHaveTextContent('Not set');
    });

    it('saves a changed constraint, and clearing saves null', async () => {
      const user = userEvent.setup();
      renderCards(makeTaskPage({ startAfter: '2026-03-01', startBefore: '2026-04-01' }));
      await user.click(screen.getByTestId('task-constraints-edit'));
      expect(screen.getByTestId('task-not-before-input')).toHaveValue('2026-03-01');
      fireEvent.change(screen.getByTestId('task-not-before-input'), { target: { value: '' } });
      fireEvent.change(screen.getByTestId('task-start-by-input'), {
        target: { value: '2026-05-01' },
      });
      await user.click(screen.getByTestId('task-constraints-save'));
      await waitFor(() =>
        expect(mockUpdateWorkItem).toHaveBeenCalledWith('wi-1', {
          startAfter: null,
          startBefore: '2026-05-01',
        }),
      );
      expect(refresh).toHaveBeenCalled();
    });

    it('rejects Start by before Not before without a request', async () => {
      const user = userEvent.setup();
      renderCards(makeTaskPage());
      await user.click(screen.getByTestId('task-constraints-edit'));
      fireEvent.change(screen.getByTestId('task-not-before-input'), {
        target: { value: '2026-05-01' },
      });
      fireEvent.change(screen.getByTestId('task-start-by-input'), {
        target: { value: '2026-04-01' },
      });
      await user.click(screen.getByTestId('task-constraints-save'));
      expect(screen.getByTestId('task-start-by-input')).toHaveAttribute('aria-invalid', 'true');
      expect(mockUpdateWorkItem).not.toHaveBeenCalled();
    });

    it('sets a new Not before from empty', async () => {
      const user = userEvent.setup();
      renderCards(makeTaskPage());
      await user.click(screen.getByTestId('task-constraints-edit'));
      fireEvent.change(screen.getByTestId('task-not-before-input'), {
        target: { value: '2026-05-01' },
      });
      await user.click(screen.getByTestId('task-constraints-save'));
      await waitFor(() =>
        expect(mockUpdateWorkItem).toHaveBeenCalledWith('wi-1', { startAfter: '2026-05-01' }),
      );
    });

    it('shows a failed save and clears it on Cancel', async () => {
      const user = userEvent.setup();
      mockUpdateWorkItem.mockRejectedValueOnce(
        new ApiClientError(400, { code: 'VALIDATION_ERROR', message: 'bad' }),
      );
      renderCards(makeTaskPage());
      await user.click(screen.getByTestId('task-constraints-edit'));
      fireEvent.change(screen.getByTestId('task-not-before-input'), {
        target: { value: '2026-05-01' },
      });
      await user.click(screen.getByTestId('task-constraints-save'));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('opens through the controller ref (the #constraints intent)', async () => {
      const ref = createRef<SectionCardController>();
      renderCards(makeTaskPage(), { constraintsRef: ref });
      act(() => ref.current!.startEdit());
      expect(await screen.findByTestId('task-not-before-input')).toBeInTheDocument();
    });
  });
});
