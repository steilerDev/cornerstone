/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import type * as GroupModule from './DiaryDateGroup.js';

jest.unstable_mockModule('../../../contexts/LocaleContext.js', () => ({
  useLocale: () => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  }),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let DiaryDateGroup: typeof GroupModule.DiaryDateGroup;

beforeEach(async () => {
  if (!DiaryDateGroup) ({ DiaryDateGroup } = await import('./DiaryDateGroup.js'));
});

function manual(id: string, createdAt: string): DiaryEntrySummary {
  return {
    id,
    entryType: 'daily_log',
    entryDate: '2026-03-14',
    title: `Manual ${id}`,
    body: `Body ${id}`,
    metadata: null,
    isAutomatic: false,
    isSigned: false,
    status: 'saved',
    sourceEntityType: null,
    sourceEntityId: null,
    sourceEntityArea: null,
    sourceEntityTitle: null,
    photoCount: 0,
    createdBy: { id: 'u1', displayName: 'Alice' },
    createdAt,
    updatedAt: createdAt,
  };
}

function event(id: string, createdAt: string): DiaryEntrySummary {
  return {
    ...manual(id, createdAt),
    entryType: 'work_item_status',
    title: null,
    body: '',
    isAutomatic: true,
    createdBy: null,
    sourceEntityType: 'work_item',
    sourceEntityId: 'wi-1',
    sourceEntityTitle: 'Kitchen tiling',
    sourceEntityExists: true,
    metadata: {
      v: 1,
      event: 'status_changed',
      from: 'not_started',
      to: 'completed',
      subjectLabel: 'Kitchen tiling',
    },
  };
}

function renderGroup(
  entries: DiaryEntrySummary[],
  props: { heading?: string; headingDetail?: string } = {},
) {
  return render(
    <MemoryRouter>
      <DiaryDateGroup date="2026-03-14" entries={entries} {...props} />
    </MemoryRouter>,
  );
}

describe('DiaryDateGroup', () => {
  it('renders the date heading and a list with one <li> per entry', () => {
    renderGroup([manual('m1', '2026-03-14T09:00:00Z'), event('e1', '2026-03-14T10:00:00Z')]);

    const group = screen.getByTestId('date-group-2026-03-14');
    expect(within(group).getByRole('heading', { level: 2 })).toHaveTextContent('Mar 14, 2026');
    const list = within(group).getByRole('list');
    expect(list.tagName).toBe('UL');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders automatic entries as system-event rows and manual ones as cards inside <li>', () => {
    renderGroup([manual('m1', '2026-03-14T09:00:00Z'), event('e1', '2026-03-14T10:00:00Z')]);

    const eventRow = screen.getByTestId('system-event-e1');
    expect(eventRow.tagName).toBe('LI');
    expect(eventRow).toHaveTextContent('Kitchen tiling went from Not started to Done');
    expect(screen.queryByTestId('diary-card-e1')).toBeNull();

    const card = screen.getByTestId('diary-card-m1');
    expect(card.closest('li')).not.toBeNull();
    expect(screen.queryByTestId('system-event-m1')).toBeNull();
  });

  it('keeps newest first across both kinds', () => {
    renderGroup([
      manual('m1', '2026-03-14T08:00:00Z'),
      event('e1', '2026-03-14T12:00:00Z'),
      manual('m2', '2026-03-14T10:00:00Z'),
    ]);

    const ids = within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map(
        (li) =>
          li.getAttribute('data-testid') ?? li.querySelector('a')?.getAttribute('data-testid'),
      );
    expect(ids).toEqual(['system-event-e1', 'diary-card-m2', 'diary-card-m1']);
  });

  it('does not mutate the entries prop when sorting', () => {
    const entries = [manual('m1', '2026-03-14T08:00:00Z'), manual('m2', '2026-03-14T10:00:00Z')];
    renderGroup(entries);
    expect(entries.map((e) => e.id)).toEqual(['m1', 'm2']);
  });

  it('renders an empty list for no entries', () => {
    renderGroup([]);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  describe('heading (#2224)', () => {
    it('defaults to the formatted date and labels the section by it', () => {
      renderGroup([manual('m1', '2026-03-14T09:00:00Z')]);
      const group = screen.getByTestId('date-group-2026-03-14');
      const heading = within(group).getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent('Mar 14, 2026');
      expect(heading.id).not.toBe('');
      expect(group).toHaveAttribute('aria-labelledby', heading.id);
      expect(screen.getByRole('region', { name: 'Mar 14, 2026' })).toBe(group);
    });

    it('shows a custom heading instead of the date', () => {
      renderGroup([manual('m1', '2026-03-14T09:00:00Z')], { heading: 'Today' });
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent('Today');
      expect(heading).not.toHaveTextContent('Mar 14, 2026');
    });

    it('shows the muted detail inside the heading after the heading text', () => {
      renderGroup([manual('m1', '2026-03-14T09:00:00Z')], {
        heading: 'Today',
        headingDetail: 'Mar 14, 2026',
      });
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent('Today Mar 14, 2026');
      expect(within(heading).getByText('Mar 14, 2026').tagName).toBe('SPAN');
      expect(screen.getByRole('region', { name: 'Today Mar 14, 2026' })).toBeInTheDocument();
    });

    it('gives two groups distinct heading ids', () => {
      render(
        <MemoryRouter>
          <DiaryDateGroup date="2026-03-14" entries={[]} />
          <DiaryDateGroup date="2026-03-13" entries={[]} />
        </MemoryRouter>,
      );
      const ids = screen.getAllByRole('heading', { level: 2 }).map((h) => h.id);
      expect(new Set(ids).size).toBe(2);
    });
  });

  describe('renderActions (#2317)', () => {
    const submission = (): DiaryEntrySummary =>
      ({
        ...event('s1', '2026-03-14T11:00:00Z'),
        entryType: 'invoice_status',
        sourceEntityType: 'invoice',
        sourceEntityId: 'inv-1',
        sourceEntityTitle: 'T-001',
        metadata: {
          v: 1,
          event: 'status_changed',
          from: 'pending',
          to: 'claimed',
          batchId: 'b-1',
          subjectLabel: 'T-001',
        },
        batch: {
          batchId: 'b-1',
          invoiceCount: 2,
          amount: 100,
          invoiceLabels: ['T-001', 'T-002'],
          budgetSourceId: null,
          budgetSourceName: null,
          budgetSourceExists: null,
        },
      }) as unknown as DiaryEntrySummary;

    it('renders the node for a submission row and never calls it for a manual row', () => {
      const calls: string[] = [];
      render(
        <MemoryRouter>
          <DiaryDateGroup
            date="2026-03-14"
            entries={[manual('m1', '2026-03-14T09:00:00Z'), submission()]}
            renderActions={(entry) => {
              calls.push(entry.id);
              return <button type="button">Revert submission</button>;
            }}
          />
        </MemoryRouter>,
      );
      expect(calls).toEqual(['s1']);
      const actions = screen.getByTestId('system-event-s1-actions');
      expect(
        within(actions).getByRole('button', { name: 'Revert submission' }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Revert submission' })).toHaveLength(1);
      expect(within(screen.getByTestId('diary-card-m1')).queryByRole('button')).toBeNull();
    });

    it('renders no actions element when renderActions returns undefined or is omitted', () => {
      const { unmount } = render(
        <MemoryRouter>
          <DiaryDateGroup
            date="2026-03-14"
            entries={[submission()]}
            renderActions={() => undefined}
          />
        </MemoryRouter>,
      );
      expect(screen.queryByTestId('system-event-s1-actions')).toBeNull();
      unmount();
      renderGroup([submission()]);
      expect(screen.queryByTestId('system-event-s1-actions')).toBeNull();
    });
  });
});
