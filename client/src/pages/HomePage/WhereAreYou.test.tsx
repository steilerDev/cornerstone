/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AreaSummary, DiaryEntryListResponse, DiaryEntrySummary } from '@cornerstone/shared';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type * as WhereModule from './WhereAreYou.js';
import { renderHome } from '../../test/homeRender.js';
import { AREA_KITCHEN, makeDiaryEntry } from '../../test/attentionFixtures.js';

const mockListDiaryEntries = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();
jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  listDiaryEntries: mockListDiaryEntries,
}));

let WhereAreYou: typeof WhereModule.WhereAreYou;

function area(id: string, name: string): AreaSummary {
  return { id, name, color: null, ancestors: [] };
}

function response(items: DiaryEntrySummary[]): DiaryEntryListResponse {
  return { items, pagination: { page: 1, pageSize: 10, totalPages: 1, totalItems: items.length } };
}

beforeEach(async () => {
  if (!WhereAreYou) ({ WhereAreYou } = await import('./WhereAreYou.js'));
  mockListDiaryEntries.mockReset();
});

describe('WhereAreYou', () => {
  it('loads the ten latest people-written entries, drafts included', async () => {
    mockListDiaryEntries.mockResolvedValue(response([]));
    renderHome(<WhereAreYou />);

    await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(1));
    expect(mockListDiaryEntries).toHaveBeenCalledWith({ automatic: false, pageSize: 10 });
  });

  it('shows one skeleton line while loading', () => {
    mockListDiaryEntries.mockReturnValue(new Promise(() => {}));
    renderHome(<WhereAreYou />);
    expect(screen.getByTestId('home-where-loading')).toBeInTheDocument();
  });

  it('renders nothing when the load fails', async () => {
    mockListDiaryEntries.mockRejectedValue(new Error('offline'));
    renderHome(<WhereAreYou />);

    await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('home-where-loading')).toBeNull());
    expect(screen.queryByTestId('home-where')).toBeNull();
  });

  it('renders nothing without any entry', async () => {
    mockListDiaryEntries.mockResolvedValue(response([]));
    renderHome(<WhereAreYou />);

    await waitFor(() => expect(screen.queryByTestId('home-where-loading')).toBeNull());
    expect(screen.queryByTestId('home-where')).toBeNull();
  });

  it('offers recent areas as chips with the full path, plus Other area', async () => {
    mockListDiaryEntries.mockResolvedValue(
      response([makeDiaryEntry('e1', { photoAreas: [AREA_KITCHEN, area('a2', 'Garage')] })]),
    );
    renderHome(<WhereAreYou />);

    const group = await screen.findByTestId('home-where');
    expect(within(group).getByRole('heading', { name: 'Where are you?' })).toBeInTheDocument();
    const kitchen = within(group).getByRole('link', { name: 'Ground floor › Kitchen' });
    expect(kitchen).toHaveAttribute('href', '/diary/new?areaId=area-kitchen&start=photo');
    expect(within(group).getByRole('link', { name: 'Garage' })).toHaveAttribute(
      'href',
      '/diary/new?areaId=a2&start=photo',
    );
    // "Other area" carries no area id.
    expect(within(group).getByRole('link', { name: 'Other area' })).toHaveAttribute(
      'href',
      '/diary/new?start=photo',
    );
  });

  it('de-duplicates areas across entries and offers at most five', async () => {
    const entries = [
      makeDiaryEntry('e1', { photoAreas: [area('a1', 'Area 1'), area('a2', 'Area 2')] }),
      makeDiaryEntry('e2', {
        photoAreas: [area('a2', 'Area 2'), area('a3', 'Area 3'), area('a4', 'Area 4')],
      }),
      makeDiaryEntry('e3', { photoAreas: [area('a5', 'Area 5'), area('a6', 'Area 6')] }),
    ];
    mockListDiaryEntries.mockResolvedValue(response(entries));
    renderHome(<WhereAreYou />);

    const group = await screen.findByTestId('home-where');
    const labels = within(group)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels.slice(0, 5)).toEqual(['Area 1', 'Area 2', 'Area 3', 'Area 4', 'Area 5']);
    expect(labels).toContain('Other area');
    expect(labels).not.toContain('Area 6');
    expect(labels.filter((label) => label === 'Area 2')).toHaveLength(1);
  });

  it('links the last log to the saved entry with the photo count', async () => {
    mockListDiaryEntries.mockResolvedValue(
      response([
        makeDiaryEntry('e1', {
          title: 'Entry A',
          entryDate: '2026-03-09',
          photoCount: 3,
          photoAreas: [AREA_KITCHEN],
        }),
      ]),
    );
    renderHome(<WhereAreYou />);

    const last = await screen.findByTestId('home-last-log');
    expect(last).toHaveAttribute('href', '/diary/e1');
    expect(last).toHaveTextContent(/Last log: .* · Entry A · 3 photos/);
  });

  it('links a draft last log to its edit page and uses the singular photo wording', async () => {
    mockListDiaryEntries.mockResolvedValue(
      response([
        makeDiaryEntry('d1', {
          status: 'draft',
          title: 'Entry D',
          photoCount: 1,
          photoAreas: [AREA_KITCHEN],
        }),
      ]),
    );
    renderHome(<WhereAreYou />);

    const last = await screen.findByTestId('home-last-log');
    expect(last).toHaveAttribute('href', '/diary/d1/edit');
    expect(last).toHaveTextContent('1 photo');
    expect(last).not.toHaveTextContent('1 photos');
  });

  it('omits the photo count when the last log has no photos', async () => {
    mockListDiaryEntries.mockResolvedValue(
      response([
        makeDiaryEntry('e1', { title: 'Entry A', photoCount: 0, photoAreas: [AREA_KITCHEN] }),
      ]),
    );
    renderHome(<WhereAreYou />);

    const last = await screen.findByTestId('home-last-log');
    expect(last).not.toHaveTextContent('photo');
  });

  it('shows only the last log when no area was photographed', async () => {
    mockListDiaryEntries.mockResolvedValue(
      response([makeDiaryEntry('e1', { title: 'Entry A', photoAreas: [] })]),
    );
    renderHome(<WhereAreYou />);

    const container = await screen.findByTestId('home-where');
    expect(within(container).queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Other area' })).toBeNull();
    expect(screen.getByTestId('home-last-log')).toHaveAttribute('href', '/diary/e1');
  });

  it('opens the quick photo log when a chip is tapped', async () => {
    mockListDiaryEntries.mockResolvedValue(
      response([makeDiaryEntry('e1', { photoAreas: [AREA_KITCHEN] })]),
    );
    renderHome(<WhereAreYou />);

    await userEvent.click(await screen.findByRole('link', { name: 'Ground floor › Kitchen' }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/diary/new?areaId=area-kitchen&start=photo',
    );
  });
});
