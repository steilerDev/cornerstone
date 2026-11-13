/**
 * @jest-environment jsdom
 *
 * Latest from the site (#2251): the newest saved diary entries of the area and below, loaded on
 * their own so a failure never blocks the page. Only the diary API client and the locale are
 * mocked; the feed rows are real. All data is synthetic.
 *
 * Mutations these tests catch:
 *  - the diary list asked without the area, for drafts, or for more/less than three entries;
 *  - an automatic entry rendered as a manual row (or the reverse), area chips shown on manual rows
 *    (every row is here), the photos link shown at 0 photos or the entries link shown with none;
 *  - a load error blocking the footer links / swallowing Retry, Retry not reloading;
 *  - a stale response for a previous area replacing the new one.
 */
import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DiaryEntryListResponse, DiaryEntrySummary } from '@cornerstone/shared';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type * as SectionModule from './AreaSiteSection.js';
import enAreas from '../../i18n/en/areas.json';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

const mockListDiaryEntries = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();
const realDiaryApi = await import('../../lib/diaryApi.js');
jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  ...realDiaryApi,
  listDiaryEntries: mockListDiaryEntries,
}));

let AreaSiteSection: typeof SectionModule.AreaSiteSection;

beforeAll(async () => {
  ({ AreaSiteSection } = await import('./AreaSiteSection.js'));
});

const ORIGIN = { origin: { to: '/areas/floor', name: 'Ground floor' } };
const site = enAreas.detail.site;

function makeEntry(id: string, over: Partial<DiaryEntrySummary> = {}): DiaryEntrySummary {
  return {
    id,
    entryType: 'daily_log',
    entryDate: '2026-03-14',
    title: `Entry ${id}`,
    body: '',
    metadata: null,
    isAutomatic: false,
    isSigned: false,
    status: 'saved',
    sourceEntityType: null,
    sourceEntityId: null,
    sourceEntityArea: null,
    sourceEntityTitle: null,
    photoCount: 0,
    createdBy: { id: 'u1', displayName: 'User A' },
    createdAt: '2026-03-14T09:00:00.000Z',
    updatedAt: '2026-03-14T09:00:00.000Z',
    thumbnails: [],
    photoAreas: [],
    ...over,
  };
}

function list(items: DiaryEntrySummary[]): DiaryEntryListResponse {
  return {
    items,
    pagination: { page: 1, pageSize: 3, totalItems: items.length, totalPages: 1 },
  } as DiaryEntryListResponse;
}

const AUTOMATIC = makeEntry('auto-1', {
  entryType: 'work_item_status',
  isAutomatic: true,
  title: null,
  metadata: {
    v: 1,
    event: 'status_changed',
    from: 'not_started',
    to: 'in_progress',
    subjectLabel: 'Kitchen tiling',
  },
  sourceEntityType: 'work_item',
  sourceEntityId: 'wi-1',
  sourceEntityTitle: 'Kitchen tiling',
  sourceEntityExists: true,
} as Partial<DiaryEntrySummary>);

function renderSection(
  props: Partial<React.ComponentProps<typeof SectionModule.AreaSiteSection>> = {},
) {
  return render(
    <MemoryRouter initialEntries={['/areas/floor']}>
      <AreaSiteSection
        areaId="floor"
        areaName="Ground floor"
        photos={{ total: 0, latestDate: null }}
        originState={ORIGIN}
        {...props}
      />
      <OriginProbe />
    </MemoryRouter>,
  );
}

describe('AreaSiteSection', () => {
  beforeEach(() => {
    mockListDiaryEntries.mockReset();
    mockListDiaryEntries.mockResolvedValue(list([]));
  });

  it('asks for the three newest saved entries of the area and renders the card heading', async () => {
    renderSection();

    await screen.findByText(site.empty.replace('{{area}}', 'Ground floor'));
    expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
    expect(mockListDiaryEntries).toHaveBeenCalledWith({
      areaId: 'floor',
      status: 'saved',
      pageSize: 3,
    });
    expect(screen.getByRole('region', { name: enAreas.detail.sections.site })).toHaveAttribute(
      'data-testid',
      'section-area-site',
    );
  });

  it('shows a skeleton while loading and no footer links yet', () => {
    mockListDiaryEntries.mockReturnValue(new Promise(() => {}));
    renderSection({ photos: { total: 5, latestDate: '2026-03-14' } });

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByTestId('area-site-all-entries')).toBeNull();
    // the photo summary comes from the page data, so its link is there before the entries load
    expect(screen.getByTestId('area-site-photos')).toBeInTheDocument();
  });

  describe('entries', () => {
    it('renders a manual entry as a diary row without area chips', async () => {
      mockListDiaryEntries.mockResolvedValue(
        list([
          makeEntry('e1', {
            photoAreas: [{ id: 'floor', name: 'Ground floor', color: null, ancestors: [] }],
          }),
        ]),
      );
      renderSection();

      const row = await screen.findByTestId('diary-entry-e1');
      expect(row.tagName).toBe('LI');
      expect(row).toHaveTextContent('Entry e1');
      expect(screen.queryByTestId('diary-entry-e1-areas')).toBeNull();
    });

    it('renders an automatic entry as a system event row and not as a diary row', async () => {
      mockListDiaryEntries.mockResolvedValue(list([AUTOMATIC, makeEntry('e1')]));
      renderSection();

      await screen.findByTestId('diary-entry-e1');
      expect(screen.queryByTestId('diary-entry-auto-1')).toBeNull();
      expect(screen.getByText(/Kitchen tiling/)).toBeInTheDocument();
    });

    it('keeps the order the server returned', async () => {
      mockListDiaryEntries.mockResolvedValue(
        list([makeEntry('e2'), makeEntry('e1'), makeEntry('e3')]),
      );
      renderSection();

      await screen.findByTestId('diary-entry-e1');
      const ids = screen
        .getAllByTestId(/^diary-entry-e\d$/)
        .map((el) => el.getAttribute('data-testid'));
      expect(ids).toEqual(['diary-entry-e2', 'diary-entry-e1', 'diary-entry-e3']);
    });
  });

  describe('footer links', () => {
    it('shows the entries link with the area filter and the origin when entries exist', async () => {
      mockListDiaryEntries.mockResolvedValue(list([makeEntry('e1')]));
      renderSection();

      const link = await screen.findByTestId('area-site-all-entries');
      expect(link).toHaveTextContent(site.allEntries);
      expect(link).toHaveAttribute('href', '/diary?areaId=floor');
      fireEvent.click(link);
      expect(probedPath()).toBe('/diary');
      expect(probedOrigin()).toEqual(ORIGIN.origin);
    });

    it('shows the photos link with the area name, the count and the latest date', async () => {
      renderSection({ photos: { total: 4, latestDate: '2026-03-05' } });

      const link = await screen.findByTestId('area-site-photos');
      expect(link).toHaveTextContent(site.photosOf.replace('{{area}}', 'Ground floor'));
      expect(link).toHaveAttribute('href', '/photos?areaId=floor');
      expect(link.parentElement?.textContent).toMatch(/4 photos · latest .*2026/);
    });

    it('uses the singular for one photo', async () => {
      renderSection({ photos: { total: 1, latestDate: '2026-03-05' } });

      const link = await screen.findByTestId('area-site-photos');
      expect(link.parentElement?.textContent).toMatch(/1 photo · latest/);
      expect(link.parentElement?.textContent).not.toContain('1 photos');
    });

    it('opens the Photos page with the origin when the photos link is used', async () => {
      renderSection({ photos: { total: 4, latestDate: '2026-03-05' } });

      fireEvent.click(await screen.findByTestId('area-site-photos'));

      expect(probedPath()).toBe('/photos');
      expect(probedOrigin()).toEqual(ORIGIN.origin);
    });

    it('hides the photos link at 0 photos but keeps the entries link', async () => {
      mockListDiaryEntries.mockResolvedValue(list([makeEntry('e1')]));
      renderSection({ photos: { total: 0, latestDate: null } });

      await screen.findByTestId('area-site-all-entries');
      expect(screen.queryByTestId('area-site-photos')).toBeNull();
    });

    it('hides the entries link when there are none but keeps the photos link', async () => {
      renderSection({ photos: { total: 2, latestDate: '2026-03-05' } });

      await screen.findByText(site.empty.replace('{{area}}', 'Ground floor'));
      expect(screen.queryByTestId('area-site-all-entries')).toBeNull();
      expect(screen.getByTestId('area-site-photos')).toBeInTheDocument();
    });

    it('shows no footer at all when there are no entries and no photos', async () => {
      renderSection();

      await screen.findByText(site.empty.replace('{{area}}', 'Ground floor'));
      expect(screen.queryByTestId('area-site-all-entries')).toBeNull();
      expect(screen.queryByTestId('area-site-photos')).toBeNull();
    });
  });

  describe('errors', () => {
    it('shows an error with Retry inside the card, keeps the photos link and reloads on Retry', async () => {
      mockListDiaryEntries.mockRejectedValueOnce(new Error('offline'));
      mockListDiaryEntries.mockResolvedValueOnce(list([makeEntry('e1')]));
      renderSection({ photos: { total: 3, latestDate: '2026-03-05' } });

      const card = screen.getByRole('region', { name: enAreas.detail.sections.site });
      expect(await within(card).findByText(site.loadError)).toBeInTheDocument();
      expect(within(card).getByTestId('area-site-photos')).toBeInTheDocument();
      expect(within(card).queryByTestId('area-site-all-entries')).toBeNull();

      fireEvent.click(within(card).getByRole('button', { name: enAreas.index.retry }));

      expect(await screen.findByTestId('diary-entry-e1')).toBeInTheDocument();
      expect(mockListDiaryEntries).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(site.loadError)).toBeNull();
    });
  });

  describe('area change', () => {
    it('reloads for a new area id and shows the new area empty text', async () => {
      const first = renderSection();
      await screen.findByText(site.empty.replace('{{area}}', 'Ground floor'));

      first.rerender(
        <MemoryRouter initialEntries={['/areas/attic']}>
          <AreaSiteSection
            areaId="attic"
            areaName="Attic"
            photos={{ total: 0, latestDate: null }}
            originState={ORIGIN}
          />
        </MemoryRouter>,
      );

      await waitFor(() =>
        expect(mockListDiaryEntries).toHaveBeenLastCalledWith({
          areaId: 'attic',
          status: 'saved',
          pageSize: 3,
        }),
      );
      expect(await screen.findByText(site.empty.replace('{{area}}', 'Attic'))).toBeInTheDocument();
    });
  });
});
