/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';
import type { OverflowMenuItem } from '../../components/OverflowMenu/index.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { makeMilestoneRow } from '../../test/milestoneListFixtures.js';
import type * as RowsModule from './useMilestoneRows.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => 'de',
  useHouseName: () => ({
    houseName: null,
    setHouseName: () => undefined,
    entriesLanguage: 'de',
    setEntriesLanguage: () => undefined,
  }),
  HouseNameProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let useMilestoneRows: typeof RowsModule.useMilestoneRows;
let out: ReturnType<typeof RowsModule.useMilestoneRows>;
const onDelete = jest.fn<RowsModule.UseMilestoneRowsOptions['onDelete']>();

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function Probe() {
  out = useMilestoneRows({ onDelete });
  return null;
}

function show(node: ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/project/milestones']}>
      <Routes>
        <Route path="*" element={node} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  if (!useMilestoneRows) ({ useMilestoneRows } = await import('./useMilestoneRows.js'));
  onDelete.mockClear();
  show(<Probe />);
});

const column = (key: string) => out.columns!.find((c) => c.key === key)!;
const cell = (key: string, row = makeMilestoneRow()) =>
  show(<div data-testid="cell">{column(key).render(row)}</div>);

describe('title and secondary line', () => {
  it('links the title to the milestone page as user text', () => {
    expect(out.title(makeMilestoneRow({ id: 9, title: 'Roof closed' }))).toEqual({
      text: 'Roof closed',
      to: '/project/milestones/9',
      isUserText: true,
    });
  });

  it('shows the first non-empty line of the description under the title', () => {
    show(
      <>
        {out.renderSecondary!(makeMilestoneRow({ description: '\n  \nFirst line\nSecond line' }))}
      </>,
    );

    expect(screen.getByTitle('First line')).toHaveTextContent('First line');
    expect(screen.queryByText('Second line')).toBeNull();
  });

  it('shows nothing without a description, or with a blank one', () => {
    expect(out.renderSecondary!(makeMilestoneRow())).toBeNull();
    expect(out.renderSecondary!(makeMilestoneRow({ description: '  \n ' }))).toBeNull();
  });
});

describe('columns', () => {
  it('shows Target, Projected, Waits for and Holds up by default; Description and Reached on are hidden', () => {
    const visible = out.columns!.filter((c) => c.defaultVisible !== false).map((c) => c.key);
    const hidden = out.columns!.filter((c) => c.defaultVisible === false).map((c) => c.key);

    expect(visible).toEqual(['target', 'projected', 'waitsFor', 'holdsUp']);
    expect(hidden).toEqual(['description', 'reachedOn']);
  });

  it('Target, Projected and Waits for are sortable; Holds up is not', () => {
    expect(column('target').sortValue).toBe('target_date');
    expect(column('projected').sortValue).toBe('projected_date');
    expect(column('waitsFor').sortValue).toBe('waits_for');
    expect(column('holdsUp').sortValue).toBeUndefined();
  });

  it('Target shows the date', () => {
    cell('target', makeMilestoneRow({ targetDate: '2026-03-05' }));

    expect(screen.getByTestId('cell')).toHaveTextContent('Mar 5, 2026');
  });

  it('Projected shows the date, "Not set" without one', () => {
    cell('projected', makeMilestoneRow({ projectedDate: '2026-03-09' }));
    expect(screen.getByTestId('cell')).toHaveTextContent('Mar 9, 2026');
    document.body.innerHTML = '';
    cell('projected');
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });

  it('Waits for shows the task count, singular and plural, "Not set" for none', () => {
    cell('waitsFor', makeMilestoneRow({ workItemCount: 1 }));
    expect(screen.getByTestId('cell')).toHaveTextContent('1 task');
    expect(screen.getByTestId('cell')).not.toHaveTextContent('1 tasks');
    document.body.innerHTML = '';
    cell('waitsFor', makeMilestoneRow({ workItemCount: 4 }));
    expect(screen.getByTestId('cell')).toHaveTextContent('4 tasks');
    document.body.innerHTML = '';
    cell('waitsFor');
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });

  it('Holds up is a holds-up figure with the count, "Not set" when null', () => {
    cell('holdsUp', makeMilestoneRow({ id: 5, holdsUp: { count: 2, startingWithin14Days: 1 } }));
    const figure = screen.getByTestId('milestones-holds-up-5');
    expect(figure).toHaveTextContent('2 tasks');
    expect(figure).toHaveAttribute('data-figure', 'holds-up');
    document.body.innerHTML = '';
    cell('holdsUp');
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });

  it('Description shows the first line with the line as title, "Not set" without one', () => {
    cell('description', makeMilestoneRow({ description: 'Frame is weathertight\nmore' }));
    expect(screen.getByTitle('Frame is weathertight')).toBeInTheDocument();
    document.body.innerHTML = '';
    cell('description');
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });

  it('Reached on shows the completion date, "Not set" while open', () => {
    cell('reachedOn', makeMilestoneRow({ completedAt: '2026-04-02T10:00:00.000Z' }));
    expect(screen.getByTestId('cell')).toHaveTextContent('Apr 2, 2026');
    document.body.innerHTML = '';
    cell('reachedOn');
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });
});

describe('status', () => {
  const status = (row = makeMilestoneRow(), surface: 'table' | 'card' = 'table') =>
    show(<div data-testid="status">{out.renderStatus!(row, surface)}</div>);

  it('says Late with the day count when projected after the target', () => {
    status(makeMilestoneRow({ id: 1, targetDate: '2026-06-01', projectedDate: '2026-06-04' }));

    expect(screen.getByTestId('milestones-status-1')).toHaveTextContent('Late · 3 d');
  });

  it('says Early with the day count when projected before the target', () => {
    status(makeMilestoneRow({ id: 1, targetDate: '2026-06-10', projectedDate: '2026-06-08' }));

    expect(screen.getByTestId('milestones-status-1')).toHaveTextContent('Early · 2 d');
  });

  it('says Upcoming on schedule and Reached when completed, on both surfaces', () => {
    status(makeMilestoneRow({ id: 1 }), 'card');
    expect(screen.getByTestId('milestones-status-mobile-1')).toHaveTextContent('Upcoming');
    document.body.innerHTML = '';
    status(makeMilestoneRow({ id: 2, isCompleted: true }));
    expect(screen.getByTestId('milestones-status-2')).toHaveTextContent('Reached');
  });

  it('gives the badge no aria-label of its own (a generic span cannot be named)', () => {
    status(makeMilestoneRow({ id: 1, projectedDate: '2026-06-09' }));

    expect(screen.getByTestId('milestones-status-1')).not.toHaveAttribute('aria-label');
  });
});

describe('⋯ menu', () => {
  const menu = (row = makeMilestoneRow({ id: 4 }), surface: 'table' | 'card' = 'table') =>
    out.rowMenu!(row, surface) as readonly OverflowMenuItem[];

  it('is Open and Delete, with surface-specific test ids', () => {
    expect(menu().map((e) => [e.id, e.label, e.testId])).toEqual([
      ['open', 'Open', 'milestones-open-4'],
      ['delete', 'Delete', 'milestones-delete-4'],
    ]);
    expect(menu(undefined, 'card').map((e) => e.testId)).toEqual([
      'milestones-open-mobile-4',
      'milestones-delete-mobile-4',
    ]);
  });

  it('Open goes to the milestone page', () => {
    act(() => menu().find((e) => e.id === 'open')!.onClick!());

    expect(screen.getByTestId('location')).toHaveTextContent('/project/milestones/4');
  });

  it('Delete is destructive and asks to delete the milestone', () => {
    const del = menu().find((e) => e.id === 'delete')!;

    expect(del.variant).toBe('destructive');
    del.onClick!();
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }));
  });
});

describe('card facts', () => {
  const facts = (row = makeMilestoneRow()) =>
    show(
      <div data-testid="facts">
        {out.facts!(row).map((f) => (
          <span key={f.key} data-key={f.key} data-keep={String(f.keep ?? false)}>
            {f.content}
          </span>
        ))}
      </div>,
    );

  it('shows the target date (kept), the projected date and the task count', () => {
    facts(
      makeMilestoneRow({ targetDate: '2026-06-01', projectedDate: '2026-06-09', workItemCount: 3 }),
    );

    const keys = Array.from(screen.getByTestId('facts').children).map((c) =>
      c.getAttribute('data-key'),
    );
    expect(keys).toEqual(['target', 'projected', 'waitsFor']);
    expect(screen.getByTestId('facts').children[0]).toHaveAttribute('data-keep', 'true');
    expect(screen.getByTestId('facts')).toHaveTextContent('Jun 1, 2026');
    expect(screen.getByTestId('facts')).toHaveTextContent('Jun 9, 2026');
    expect(screen.getByTestId('facts')).toHaveTextContent('3 tasks');
  });

  it('shows "Not set" for no projected date and no tasks', () => {
    facts();

    expect(screen.getByTestId('facts').textContent!.match(/Not set/g)).toHaveLength(2);
  });

  it('has no duplicate test ids when both surfaces are rendered', () => {
    const row = makeMilestoneRow({ id: 4, holdsUp: { count: 1, startingWithin14Days: 0 } });
    const { container } = show(
      <>
        {out.columns!.map((c) => (
          <div key={c.key}>{c.render(row)}</div>
        ))}
        <div>{out.renderStatus!(row, 'table')}</div>
        <div>{out.renderStatus!(row, 'card')}</div>
        {menu(row, 'table').map((e) => (
          <i key={`t${e.id}`} data-testid={e.testId} />
        ))}
        {menu(row, 'card').map((e) => (
          <i key={`c${e.id}`} data-testid={e.testId} />
        ))}
      </>,
    );

    expect(findDuplicateTestIds(container)).toEqual([]);
  });

  function menu(row = makeMilestoneRow({ id: 4 }), surface: 'table' | 'card' = 'table') {
    return out.rowMenu!(row, surface) as readonly OverflowMenuItem[];
  }
});
