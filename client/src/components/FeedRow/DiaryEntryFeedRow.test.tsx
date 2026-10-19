/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { createRouterLog, RecordingRouter } from '../../test/recordingRouter.js';
import { DiaryEntryFeedRow } from './DiaryEntryFeedRow.js';

function makeEntry(overrides: Partial<DiaryEntrySummary> = {}): DiaryEntrySummary {
  return {
    id: 'e1',
    entryType: 'daily_log',
    entryDate: '2026-10-12',
    title: 'Entry A',
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
    createdAt: '2026-10-12T09:00:00.000Z',
    updatedAt: '2026-10-12T09:00:00.000Z',
    thumbnails: [],
    photoAreas: [],
    ...overrides,
  };
}

const thumbs = (n: number) =>
  Array.from({ length: n }, (_v, i) => ({ id: `p${i}`, thumbnailUrl: `/api/photos/p${i}/thumb` }));

function setup(entry: DiaryEntrySummary, as?: 'li' | 'div') {
  const log = createRouterLog();
  const row = <DiaryEntryFeedRow entry={entry} as={as} />;
  render(
    <LocaleProvider>
      <RecordingRouter entries={['/diary?types=issue']} log={log}>
        {as === 'div' ? row : <ul>{row}</ul>}
      </RecordingRouter>
    </LocaleProvider>,
  );
  return { log, root: screen.getByTestId(`diary-entry-${entry.id}`) };
}

describe('DiaryEntryFeedRow', () => {
  it('renders an li by default and a div with as="div"', () => {
    expect(setup(makeEntry()).root.tagName).toBe('LI');
    document.body.innerHTML = '';
    expect(setup(makeEntry(), 'div').root.tagName).toBe('DIV');
  });

  it('shows the type chip, the day and month and the title as the one link', () => {
    const { root } = setup(makeEntry());
    expect(screen.getByTestId('diary-entry-e1-type')).toHaveTextContent('Daily log');
    expect(root).toHaveTextContent(/Oct(ober)? 12/);
    const link = screen.getByTestId('diary-entry-e1-link');
    expect(link).toHaveTextContent('Entry A');
    expect(link).toHaveAttribute('href', '/diary/e1');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('names the link "title, full date"', () => {
    setup(makeEntry());
    const name = screen.getByTestId('diary-entry-e1-link').getAttribute('aria-label') ?? '';
    expect(name).toMatch(/^Entry A, /);
    expect(name).toContain('2026');
  });

  it('falls back to "Type · day month" when the entry has no title', () => {
    setup(makeEntry({ title: null }));
    expect(screen.getByTestId('diary-entry-e1-link')).toHaveTextContent(
      /^Daily log · Oct(ober)? 12$/,
    );
  });

  it('carries the origin state of the list (with its filters) when opened', () => {
    const { log } = setup(makeEntry());
    fireEvent.click(screen.getByTestId('diary-entry-e1-link'));
    expect(log.actions).toEqual(['PUSH /diary/e1']);
    expect(JSON.stringify(log.states[0])).toContain('/diary?types=issue');
  });

  describe('drafts', () => {
    it('links a draft to the capture screen and shows the Draft badge', () => {
      setup(makeEntry({ status: 'draft' }));
      expect(screen.getByTestId('diary-entry-e1-link')).toHaveAttribute('href', '/diary/e1/edit');
      expect(screen.getByTestId('draft-badge-e1')).toHaveTextContent('Draft');
    });

    it('shows no Draft badge on a saved entry', () => {
      setup(makeEntry());
      expect(screen.queryByTestId('draft-badge-e1')).toBeNull();
    });
  });

  describe('first line of the text', () => {
    it('shows the first non-empty trimmed line', () => {
      setup(makeEntry({ body: '\n   \n  Poured the slab  \nSecond line' }));
      expect(screen.getByText('Poured the slab')).toBeInTheDocument();
      expect(screen.queryByText('Second line')).toBeNull();
    });

    it('shows no sentence for an empty or whitespace-only body', () => {
      const { root } = setup(makeEntry({ body: ' \n  ' }));
      expect(root.querySelector('p')).toBeNull();
    });
  });

  describe('facts', () => {
    it('shows the company and the worker count of a daily log', () => {
      const { root } = setup(
        makeEntry({ metadata: { vendorName: 'Company A', workersOnSite: 2 } }),
      );
      expect(root).toHaveTextContent('Company A · 2 workers');
    });

    it('uses the singular for one worker', () => {
      const { root } = setup(makeEntry({ metadata: { workersOnSite: 1 } }));
      expect(root).toHaveTextContent('1 worker');
      expect(root).not.toHaveTextContent('1 workers');
    });

    it.each([[0], [null], [2.5], [-1]])('shows no worker count for %s', (workers) => {
      const { root } = setup(makeEntry({ metadata: { workersOnSite: workers } }));
      expect(root).not.toHaveTextContent(/worker/);
    });

    it('uses the free-text company of a delivery', () => {
      const { root } = setup(
        makeEntry({
          entryType: 'delivery',
          metadata: { vendor: 'Company B', vendorName: 'Ignored', workersOnSite: 4 },
        }),
      );
      expect(root).toHaveTextContent('Company B');
      expect(root).not.toHaveTextContent('Ignored');
      expect(root).not.toHaveTextContent(/worker/);
    });

    it('shows no facts for other types, whatever their metadata holds', () => {
      const { root } = setup(
        makeEntry({
          entryType: 'issue',
          metadata: { vendorName: 'Company A', vendor: 'Company B', workersOnSite: 3 },
        }),
      );
      expect(root).not.toHaveTextContent('Company');
      expect(root).not.toHaveTextContent(/worker/);
    });

    it('tolerates missing metadata', () => {
      const { root } = setup(makeEntry({ metadata: null }));
      expect(root.querySelector('p')).toBeNull();
    });
  });

  describe('signed', () => {
    it('shows Signed when the entry is signed', () => {
      setup(makeEntry({ isSigned: true }));
      expect(screen.getByTestId('diary-entry-e1-signed')).toHaveTextContent('Signed');
    });

    it('shows nothing when it is not', () => {
      setup(makeEntry());
      expect(screen.queryByTestId('diary-entry-e1-signed')).toBeNull();
    });
  });

  describe('photos', () => {
    it('shows no strip and no photo sentence without photos', () => {
      const { root } = setup(makeEntry());
      expect(screen.queryByTestId('diary-entry-e1-thumbs')).toBeNull();
      expect(root).not.toHaveTextContent(/photo/);
    });

    it('shows one thumbnail and "1 photo"', () => {
      const { root } = setup(makeEntry({ photoCount: 1, thumbnails: thumbs(1) }));
      const imgs = screen.getByTestId('diary-entry-e1-thumbs').querySelectorAll('img');
      expect(imgs).toHaveLength(1);
      expect(imgs[0]).toHaveAttribute('src', '/api/photos/p0/thumb');
      expect(screen.queryByTestId('diary-entry-e1-thumbs-more')).toBeNull();
      expect(root).toHaveTextContent('1 photo');
    });

    it('shows five thumbnails without a +n tile for exactly five photos', () => {
      setup(makeEntry({ photoCount: 5, thumbnails: thumbs(5) }));
      expect(screen.getByTestId('diary-entry-e1-thumbs').querySelectorAll('img')).toHaveLength(5);
      expect(screen.queryByTestId('diary-entry-e1-thumbs-more')).toBeNull();
    });

    it('shows "+1" for six photos', () => {
      const { root } = setup(makeEntry({ photoCount: 6, thumbnails: thumbs(5) }));
      expect(screen.getByTestId('diary-entry-e1-thumbs-more')).toHaveTextContent('+1');
      expect(root).toHaveTextContent('6 photos');
    });

    it('shows "+7" for twelve photos', () => {
      setup(makeEntry({ photoCount: 12, thumbnails: thumbs(5) }));
      expect(screen.getByTestId('diary-entry-e1-thumbs-more')).toHaveTextContent('+7');
    });

    it('never uses more than five thumbnails even if the server sends more', () => {
      setup(makeEntry({ photoCount: 7, thumbnails: thumbs(7) }));
      expect(screen.getByTestId('diary-entry-e1-thumbs').querySelectorAll('img')).toHaveLength(5);
    });

    it('shows the count sentence but no strip when the thumbnails are missing', () => {
      const { root } = setup(makeEntry({ photoCount: 3, thumbnails: undefined }));
      expect(screen.queryByTestId('diary-entry-e1-thumbs')).toBeNull();
      expect(screen.queryByTestId('diary-entry-e1-thumbs-more')).toBeNull();
      expect(root).toHaveTextContent('3 photos');
    });
  });

  describe('area chips', () => {
    const area = (id: string, name: string, ancestors: { id: string; name: string }[] = []) => ({
      id,
      name,
      color: null,
      ancestors: ancestors.map((a) => ({ ...a, color: null })),
    });

    it('shows each photo area as its full path', () => {
      setup(
        makeEntry({
          photoAreas: [area('a1', 'Room 1', [{ id: 'a0', name: 'Area A' }]), area('a2', 'Area B')],
        }),
      );
      const list = screen.getByTestId('diary-entry-e1-areas');
      const items = within(list).getAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('Area A › Room 1');
      expect(items[1]).toHaveTextContent('Area B');
    });

    it('shows three chips and a +n chip for the rest', () => {
      setup(
        makeEntry({
          photoAreas: [1, 2, 3, 4, 5].map((n) => area(`a${n}`, `Area ${n}`)),
        }),
      );
      const items = within(screen.getByTestId('diary-entry-e1-areas')).getAllByRole('listitem');
      expect(items).toHaveLength(4);
      expect(items[3]).toHaveTextContent('+2');
    });

    it('shows no chips without photo areas, also when the field is missing', () => {
      setup(makeEntry({ photoAreas: undefined }));
      expect(screen.queryByTestId('diary-entry-e1-areas')).toBeNull();
    });
  });
});
