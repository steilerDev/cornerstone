/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import type * as PanelModule from './InvoiceHistoryPanel.js';
import type * as ApiClientModule from '../../lib/apiClient.js';

interface HistoryResponse {
  items: DiaryEntrySummary[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
const mockListHistory =
  jest.fn<(query: Record<string, unknown>, signal?: AbortSignal) => Promise<HistoryResponse>>();
jest.unstable_mockModule('../../lib/historyApi.js', () => ({ listHistory: mockListHistory }));

const mockFeedRow = jest.fn();
jest.unstable_mockModule('../../components/FeedRow/SystemEventFeedRow.js', () => ({
  SystemEventFeedRow: (props: { as?: string; entry: { id: string; summary?: string } }) => {
    mockFeedRow(props);
    return <li data-testid={`feed-${props.entry.id}`}>{props.entry.id}</li>;
  },
}));

let InvoiceHistoryPanel: (typeof PanelModule)['InvoiceHistoryPanel'];
let ApiClientError: (typeof ApiClientModule)['ApiClientError'];

const entry = (id: string) => ({ id }) as unknown as DiaryEntrySummary;
const page = (ids: string[], totalItems = ids.length): HistoryResponse => ({
  items: ids.map(entry),
  pagination: { page: 1, pageSize: 20, totalItems, totalPages: 1 },
});

function renderPanel(revision = 0, invoiceId = 'inv-1') {
  const view = render(
    <MemoryRouter>
      <InvoiceHistoryPanel invoiceId={invoiceId} revision={revision} />
    </MemoryRouter>,
  );
  const again = (nextRevision: number, id = invoiceId) =>
    view.rerender(
      <MemoryRouter>
        <InvoiceHistoryPanel invoiceId={id} revision={nextRevision} />
      </MemoryRouter>,
    );
  return { ...view, again };
}

beforeEach(async () => {
  mockListHistory.mockReset();
  mockFeedRow.mockReset();
  ({ InvoiceHistoryPanel } = (await import('./InvoiceHistoryPanel.js')) as typeof PanelModule);
  ({ ApiClientError } = (await import('../../lib/apiClient.js')) as typeof ApiClientModule);
});

describe('InvoiceHistoryPanel (S15)', () => {
  it('asks for the 20 latest events of this invoice with an abort signal', async () => {
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
});
