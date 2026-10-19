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

function renderGroup(entries: DiaryEntrySummary[]) {
  return render(
    <MemoryRouter>
      <DiaryDateGroup date="2026-03-14" entries={entries} />
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
});
