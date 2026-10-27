/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import type * as PanelModule from './ObjectHistorySection.js';
import i18n from '../../i18n/index.js';
import type * as ApiClientModule from '../../lib/apiClient.js';

interface HistoryResponse {
  items: DiaryEntrySummary[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
const mockListHistory =
  jest.fn<(query: Record<string, unknown>, signal?: AbortSignal) => Promise<HistoryResponse>>();
jest.unstable_mockModule('../../lib/historyApi.js', () => ({ listHistory: mockListHistory }));

const mockFeedRow = jest.fn();
jest.unstable_mockModule('./SystemEventFeedRow.js', () => ({
  SystemEventFeedRow: (props: { as?: string; entry: { id: string; summary?: string } }) => {
    mockFeedRow(props);
    return <li data-testid={`feed-${props.entry.id}`}>{props.entry.id}</li>;
  },
}));

let ObjectHistorySection: (typeof PanelModule)['ObjectHistorySection'];
let ApiClientError: (typeof ApiClientModule)['ApiClientError'];

const entry = (id: string) => ({ id }) as unknown as DiaryEntrySummary;
const page = (ids: string[], totalItems = ids.length): HistoryResponse => ({
  items: ids.map(entry),
  pagination: { page: 1, pageSize: 20, totalItems, totalPages: 1 },
});

const labels = {
  title: 'History',
  empty: 'No history yet.',
  loadError: "Couldn't load the history.",
  retry: 'Try again',
  showAll: 'Show all in History',
};

function renderPanel(
  revision = 0,
  entityId = 'inv-1',
  entityType: 'invoice' | 'budget_source' | 'subsidy_program' = 'invoice',
  testIdPrefix = 'invoice-history',
) {
  const element = (nextRevision: number, id: string) => (
    <MemoryRouter>
      <ObjectHistorySection
        entityType={entityType}
        entityId={id}
        revision={nextRevision}
        labels={labels}
        testIdPrefix={testIdPrefix}
      />
    </MemoryRouter>
  );
  const view = render(element(revision, entityId));
  const again = (nextRevision: number, id = entityId) => view.rerender(element(nextRevision, id));
  return { ...view, again };
}

beforeEach(async () => {
  mockListHistory.mockReset();
  mockFeedRow.mockReset();
  ({ ObjectHistorySection } = (await import('./ObjectHistorySection.js')) as typeof PanelModule);
  ({ ApiClientError } = (await import('../../lib/apiClient.js')) as typeof ApiClientModule);
});

describe('ObjectHistorySection (ported from InvoiceHistoryPanel, S15)', () => {
  it('asks for the 20 latest events of this object with an abort signal', async () => {
    mockListHistory.mockResolvedValue(page(['e1']));
    renderPanel(0, 'inv-9');
    await screen.findByTestId('feed-e1');
    expect(mockListHistory).toHaveBeenCalledTimes(1);
    expect(mockListHistory.mock.calls[0]![0]).toEqual({
      entityType: 'invoice',
      entityId: 'inv-9',
      pageSize: 20,
    });
    expect(mockListHistory.mock.calls[0]![1]).toBeInstanceOf(AbortSignal);
  });

  it('is titled History and shows each event as a read-only list item', async () => {
    mockListHistory.mockResolvedValue(page(['e1', 'e2']));
    renderPanel();
    expect(await screen.findByTestId('feed-e1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'History' })).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    for (const call of mockFeedRow.mock.calls) {
      const props = call[0] as { as: string; edit?: unknown };
      expect(props.as).toBe('li');
      expect(props.edit).toBeUndefined();
    }
  });

  it('shows the empty state for no events', async () => {
    mockListHistory.mockResolvedValue(page([]));
    renderPanel();
    expect(await screen.findByText('No history yet.')).toBeVisible();
    expect(screen.queryByTestId('invoice-history-show-all')).toBeNull();
  });

  it('links to the full History only when there are more events than shown', async () => {
    mockListHistory.mockResolvedValue(page(['e1', 'e2'], 55));
    renderPanel(0, 'inv-3');
    const link = await screen.findByTestId('invoice-history-show-all');
    expect(link).toHaveTextContent('Show all in History');
    expect(link.getAttribute('href')).toContain('object=invoice');
    expect(link.getAttribute('href')).toContain('inv-3');
  });

  it('shows no link when every event is shown (total equals the shown count)', async () => {
    mockListHistory.mockResolvedValue(page(['e1', 'e2'], 2));
    renderPanel();
    await screen.findByTestId('feed-e1');
    expect(screen.queryByTestId('invoice-history-show-all')).toBeNull();
  });

  it('loads again when the revision changes, and aborts the request it replaces', async () => {
    mockListHistory.mockResolvedValueOnce(page(['e1']));
    const { again } = renderPanel(0);
    await screen.findByTestId('feed-e1');
    const firstSignal = mockListHistory.mock.calls[0]![1]!;
    mockListHistory.mockResolvedValueOnce(page(['e1', 'e2']));
    again(1);
    await screen.findByTestId('feed-e2');
    expect(mockListHistory).toHaveBeenCalledTimes(2);
    expect(firstSignal.aborted).toBe(true);
  });

  it('does not reload when re-rendered with the same revision', async () => {
    mockListHistory.mockResolvedValue(page(['e1']));
    const { again } = renderPanel(3);
    await screen.findByTestId('feed-e1');
    again(3);
    expect(mockListHistory).toHaveBeenCalledTimes(1);
  });

  it('aborts the request on unmount and ignores its late result', async () => {
    let resolve: (r: HistoryResponse) => void = () => undefined;
    mockListHistory.mockReturnValue(
      new Promise<HistoryResponse>((res) => {
        resolve = res;
      }),
    );
    const { unmount } = renderPanel();
    const signal = mockListHistory.mock.calls[0]![1]!;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      resolve(page(['late']));
    });
    expect(screen.queryByTestId('feed-late')).toBeNull();
  });

  it('ignores a late failure after unmount', async () => {
    let reject: (e: unknown) => void = () => undefined;
    mockListHistory.mockReturnValue(
      new Promise<HistoryResponse>((_res, rej) => {
        reject = rej;
      }),
    );
    const { unmount } = renderPanel();
    unmount();
    await act(async () => {
      reject(new Error('late'));
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a translated API error with a Retry that loads again', async () => {
    mockListHistory.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw prose' }),
    );
    renderPanel();
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByText('raw prose')).toBeNull();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    mockListHistory.mockResolvedValueOnce(page(['e1']));
    await userEvent.click(retry);
    expect(await screen.findByTestId('feed-e1')).toBeInTheDocument();
    expect(mockListHistory).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the fixed load error for a failure that is not an API error', async () => {
    mockListHistory.mockRejectedValueOnce(new Error('offline'));
    renderPanel();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the history."),
    );
  });

  describe('a language change (#2242)', () => {
    afterEach(async () => {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    });

    it('does not load the history again', async () => {
      mockListHistory.mockResolvedValue(page(['e1']));
      renderPanel();
      await screen.findByTestId('feed-e1');
      const calls = mockListHistory.mock.calls.length;

      await act(async () => {
        await i18n.changeLanguage('de');
      });

      expect(mockListHistory).toHaveBeenCalledTimes(calls);
      expect(screen.getByTestId('feed-e1')).toBeInTheDocument();
    });

    it('translates an API error again in the new language, without a new request', async () => {
      mockListHistory.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw prose' }),
      );
      renderPanel();
      const alert = await screen.findByRole('alert');
      const english = alert.textContent;
      const calls = mockListHistory.mock.calls.length;

      await act(async () => {
        await i18n.changeLanguage('de');
      });

      expect(screen.getByRole('alert').textContent).not.toBe(english);
      expect(screen.getByRole('alert')).not.toHaveTextContent('raw prose');
      expect(mockListHistory).toHaveBeenCalledTimes(calls);
    });
  });

  it('asks for the budget_source history of a funding source and links to that object (#2242)', async () => {
    mockListHistory.mockResolvedValue(page(['e1', 'e2'], 30));
    renderPanel(0, 'bs-7', 'budget_source', 'source-history');

    const link = await screen.findByTestId('source-history-show-all');

    expect(mockListHistory.mock.calls[0]![0]).toEqual({
      entityType: 'budget_source',
      entityId: 'bs-7',
      pageSize: 20,
    });
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toContain(
      'object=budget_source:bs-7',
    );
    expect(screen.getByTestId('section-source-history')).toBeInTheDocument();
  });

  it('takes its words from the labels the page passes', async () => {
    mockListHistory.mockResolvedValue(page([]));
    render(
      <MemoryRouter>
        <ObjectHistorySection
          entityType="subsidy_program"
          entityId="sp-1"
          revision={0}
          testIdPrefix="grant-history"
          labels={{ ...labels, title: 'Grant events', empty: 'Nothing yet.' }}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Nothing yet.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Grant events' })).toBeVisible();
  });
});
