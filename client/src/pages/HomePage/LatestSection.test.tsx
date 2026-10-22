/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DiaryEntryListResponse, DiaryEntrySummary } from '@cornerstone/shared';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type * as LatestModule from './LatestSection.js';
import { renderHome } from '../../test/homeRender.js';
import { makeDiaryEntry } from '../../test/attentionFixtures.js';

const mockListDiaryEntries = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();
jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  listDiaryEntries: mockListDiaryEntries,
}));

let LatestSection: typeof LatestModule.LatestSection;

function response(items: DiaryEntrySummary[]): DiaryEntryListResponse {
  return { items, pagination: { page: 1, pageSize: 3, totalPages: 1, totalItems: items.length } };
}

beforeEach(async () => {
  if (!LatestSection) ({ LatestSection } = await import('./LatestSection.js'));
  mockListDiaryEntries.mockReset();
});

describe('LatestSection', () => {
  it('asks only for saved, people-written entries, three at a time', async () => {
    mockListDiaryEntries.mockResolvedValue(response([]));
    renderHome(<LatestSection />);

    await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(1));
    expect(mockListDiaryEntries).toHaveBeenCalledWith({
      status: 'saved',
      automatic: false,
      pageSize: 3,
    });
  });

  it('shows a skeleton while loading', () => {
    mockListDiaryEntries.mockReturnValue(new Promise(() => {}));
    renderHome(<LatestSection />);
    expect(screen.getByTestId('home-latest')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the three entries as rows with their titles and a Site diary link', async () => {
    mockListDiaryEntries.mockResolvedValue(
      response([
        makeDiaryEntry('e1', { title: 'Entry A' }),
        makeDiaryEntry('e2', { title: 'Entry B' }),
        makeDiaryEntry('e3', { title: 'Entry C' }),
      ]),
    );
    renderHome(<LatestSection />);

    const rows = await screen.findAllByTestId(/^diary-entry-e\d$/);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByRole('link', { name: /Entry A/ })).toHaveAttribute(
      'href',
      '/diary/e1',
    );
    const more = screen.getByTestId('home-latest-more');
    expect(more).toHaveAttribute('href', '/diary');
    expect(more).toHaveTextContent('Site diary');
  });

  it('renders photos before the title and shows no system-event rows', async () => {
    mockListDiaryEntries.mockResolvedValue(
      response([
        makeDiaryEntry('e1', {
          title: 'Entry A',
          photoCount: 2,
          thumbnails: [
            { id: 'p1', thumbnailUrl: '/api/photos/p1/thumb' },
            { id: 'p2', thumbnailUrl: '/api/photos/p2/thumb' },
          ],
        }),
      ]),
    );
    renderHome(<LatestSection />);

    const row = await screen.findByTestId('diary-entry-e1');
    const firstImage = row.querySelector('img');
    const titleLink = within(row).getByRole('link', { name: /Entry A/ });
    expect(firstImage).not.toBeNull();
    expect(
      firstImage!.compareDocumentPosition(titleLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByTestId(/system-event/)).toBeNull();
  });

  it('links a draft-free list to the saved entry page', async () => {
    mockListDiaryEntries.mockResolvedValue(response([makeDiaryEntry('e9', { title: 'Entry Z' })]));
    renderHome(<LatestSection />);

    await userEvent.click(await screen.findByRole('link', { name: /Entry Z/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/diary/e9');
  });

  it('shows an empty state with a link to log today', async () => {
    mockListDiaryEntries.mockResolvedValue(response([]));
    renderHome(<LatestSection />);

    expect(await screen.findByText('No entries yet.')).toBeInTheDocument();
    const action = screen.getByRole('link', { name: 'Log today' });
    expect(action.getAttribute('href')).toMatch(/^\/diary\/new/);
    expect(screen.queryByTestId('home-latest-more')).toBeNull();
  });

  it('D-25: the empty state shows the Latest empty message and a Log today link to /diary/new, never the generic no-data text', async () => {
    mockListDiaryEntries.mockResolvedValue(response([]));
    renderHome(<LatestSection />);

    expect(await screen.findByText('No entries yet.')).toBeInTheDocument();
    expect(screen.queryByText('No data available')).toBeNull();
    const action = screen.getByRole('link', { name: 'Log today' });
    expect(new URL(action.getAttribute('href') ?? '', 'http://x').pathname).toBe('/diary/new');
    // Story #1426: one saved, people-written query; drafts are never requested separately.
    expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
    expect(mockListDiaryEntries).toHaveBeenCalledWith({
      status: 'saved',
      automatic: false,
      pageSize: 3,
    });
  });

  it('shows an error with a retry', async () => {
    mockListDiaryEntries.mockRejectedValueOnce(new Error('boom'));
    renderHome(<LatestSection />);

    expect(await screen.findByText("Couldn't load Latest from the site.")).toBeInTheDocument();
    mockListDiaryEntries.mockResolvedValue(response([makeDiaryEntry('e1')]));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('diary-entry-e1')).toBeInTheDocument();
  });
});
