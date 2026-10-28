/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { KITCHEN, makeTaskRow } from '../../test/taskListFixtures.js';
import type * as RowsModule from './useTaskRows.js';
import type { OverflowMenuItem } from '../../components/OverflowMenu/index.js';
import type { TaskActions } from './useTaskActions.js';

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

const entriesLanguage: string | null = 'de';
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => entriesLanguage,
  useHouseName: () => ({
    houseName: null,
    setHouseName: () => undefined,
    entriesLanguage,
    setEntriesLanguage: () => undefined,
  }),
  HouseNameProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let useTaskRows: typeof RowsModule.useTaskRows;
let out: ReturnType<typeof RowsModule.useTaskRows>;

const actions: TaskActions = {
  applyStatus: jest.fn<TaskActions['applyStatus']>().mockResolvedValue(),
  reopen: jest.fn<TaskActions['reopen']>().mockResolvedValue(),
  requestDelete: jest.fn<TaskActions['requestDelete']>(),
  bulkSetStatus: jest.fn<TaskActions['bulkSetStatus']>().mockResolvedValue(),
  bulkSetArea: jest.fn<TaskActions['bulkSetArea']>().mockResolvedValue(),
};

function Probe() {
  out = useTaskRows({ actions });
  return null;
}

function show(node: ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

beforeEach(async () => {
  if (!useTaskRows) ({ useTaskRows } = await import('./useTaskRows.js'));
  jest.mocked(actions.applyStatus).mockClear();
  jest.mocked(actions.reopen).mockClear();
  jest.mocked(actions.requestDelete).mockClear();
  show(<Probe />);
});

const column = (key: string) => out.columns!.find((c) => c.key === key)!;

describe('title and secondary line', () => {
  it('links the title to the task page as user text', () => {
    expect(out.title(makeTaskRow({ id: 'wi-9', title: 'Pour the slab' }))).toEqual({
      text: 'Pour the slab',
      to: '/project/work-items/wi-9',
      isUserText: true,
    });
  });

  it('shows the area path as a link, with grant chips', () => {
    show(
      <>
        {out.renderSecondary!(
          makeTaskRow({
            area: KITCHEN,
            grants: [
              { id: 'g-1', name: 'Example Heat Grant', reductionType: 'percentage', rate: 15 },
            ],
          }),
        )}
      </>,
    );
    expect(screen.getByTestId('tasks-area-wi-1')).toHaveTextContent(
      'House › Ground floor › Kitchen',
    );
    expect(screen.getByTestId('work-item-grants-wi-1')).toBeInTheDocument();
  });

  it('shows "No area" as plain text for a task without an area', () => {
    show(<>{out.renderSecondary!(makeTaskRow())}</>);
    expect(screen.getByText('No area')).toBeInTheDocument();
    expect(screen.queryByTestId('tasks-area-wi-1')).toBeNull();
  });
});

describe('columns', () => {
  const cell = (key: string, row = makeTaskRow()) =>
    show(<div data-testid="cell">{column(key).render(row)}</div>);

  it('Dates shows the planned range, muted once done', () => {
    cell('dates');
    expect(screen.getByTestId('cell')).toHaveTextContent(/Jun/);
    expect(screen.getByTestId('cell').firstElementChild!.className).not.toContain('muted');
  });

  it('Dates of a done task is muted; one date shows alone; no dates read "Not set"', () => {
    cell('dates', makeTaskRow({ status: 'completed' }));
    expect(screen.getByTestId('cell').firstElementChild!.className).toContain('muted');
    document.body.innerHTML = '';
    show(<div data-testid="one">{column('dates').render(makeTaskRow({ endDate: null }))}</div>);
    expect(screen.getByTestId('one')).toHaveTextContent(/Jun/);
    document.body.innerHTML = '';
    show(
      <div data-testid="none">
        {column('dates').render(makeTaskRow({ startDate: null, endDate: null }))}
      </div>,
    );
    expect(screen.getByTestId('none')).toHaveTextContent('Not set');
  });

  it('Who shows the company, else the household member, else "Not set"', () => {
    cell(
      'who',
      makeTaskRow({
        assignedVendor: { id: 'v-1', name: 'Example Carpentry Co' } as never,
        assignedUser: { id: 'u-1', displayName: 'Sam Example' } as never,
      }),
    );
    expect(screen.getByTestId('cell')).toHaveTextContent('Example Carpentry Co');
    expect(screen.getByTestId('cell')).not.toHaveTextContent('Sam Example');
    document.body.innerHTML = '';
    show(
      <div data-testid="u">
        {column('who').render(
          makeTaskRow({ assignedUser: { id: 'u-1', displayName: 'Sam Example' } as never }),
        )}
      </div>,
    );
    expect(screen.getByTestId('u')).toHaveTextContent('Sam Example');
    document.body.innerHTML = '';
    show(<div data-testid="n">{column('who').render(makeTaskRow())}</div>);
    expect(screen.getByTestId('n')).toHaveTextContent('Not set');
  });

  it('Expected cost shows the amount, right-aligned and sortable, or "Not set"', () => {
    expect(column('expectedCost')).toMatchObject({ sortValue: 'expected_cost', align: 'end' });
    cell('expectedCost', makeTaskRow({ expectedCost: 1234.5 }));
    expect(screen.getByTestId('cell')).toHaveTextContent('1,234.50');
    document.body.innerHTML = '';
    cell('expectedCost', makeTaskRow({ expectedCost: 0 }));
    expect(screen.getByTestId('cell')).toHaveTextContent('0.00');
    document.body.innerHTML = '';
    cell('expectedCost');
    expect(screen.getByTestId('cell')).toHaveTextContent('Not set');
  });

  it('Waits for / Holds up is empty when neither applies', () => {
    expect(column('relations').render(makeTaskRow())).toBeNull();
  });

  it('Waits for names the predecessor as a link, with "+n" for more', () => {
    cell('relations', makeTaskRow({ waitsFor: { id: 'wi-p', title: 'Pour the slab', more: 2 } }));
    const link = screen.getByTestId('tasks-waits-for-wi-1');
    expect(link).toHaveTextContent('Pour the slab');
    expect(link).toHaveAttribute('href', '/project/work-items/wi-p');
    expect(screen.getByTestId('cell')).toHaveTextContent('Waits for');
    expect(screen.getByTestId('cell')).toHaveTextContent('+2');
    expect(screen.queryByTestId('tasks-holds-up-wi-1')).toBeNull();
  });

  it('Waits for with nothing more shows no "+n"', () => {
    cell('relations', makeTaskRow({ waitsFor: { id: 'wi-p', title: 'Pour the slab', more: 0 } }));
    expect(screen.getByTestId('cell')).not.toHaveTextContent('+');
  });

  it('Holds up shows the count as a holds-up figure, singular and plural', () => {
    cell('relations', makeTaskRow({ holdsUp: { count: 1, startingWithin14Days: 0 } }));
    const figure = screen.getByTestId('tasks-holds-up-wi-1');
    expect(figure).toHaveTextContent('Holds up 1 task');
    expect(figure).toHaveAttribute('data-figure', 'holds-up');
    document.body.innerHTML = '';
    cell('relations', makeTaskRow({ holdsUp: { count: 3, startingWithin14Days: 1 } }));
    expect(screen.getByTestId('tasks-holds-up-wi-1')).toHaveTextContent('Holds up 3 tasks');
  });
});

describe('status markers', () => {
  const status = (row = makeTaskRow(), surface: 'table' | 'card' = 'table') =>
    show(<div data-testid="status">{out.renderStatus!(row, surface)}</div>);

  it('shows the status badge on both surfaces', () => {
    status(makeTaskRow({ status: 'in_progress' }), 'card');
    expect(screen.getByTestId('tasks-status-mobile-wi-1')).toHaveTextContent('In progress');
  });

  it('shows the Late signal with its days and the Critical marker in the table', () => {
    status(makeTaskRow({ isLate: true, lateDays: 3, isCritical: true }));
    expect(screen.getByTestId('tasks-schedule-signal-wi-1')).toHaveTextContent(/3/);
    expect(screen.getByTestId('tasks-critical-wi-1')).toBeInTheDocument();
  });

  it('shows Held up for a held-up task', () => {
    status(makeTaskRow({ isHeldUp: true }));
    expect(screen.getByTestId('tasks-schedule-signal-wi-1')).toBeInTheDocument();
    expect(screen.queryByTestId('tasks-critical-wi-1')).toBeNull();
  });

  it('keeps only the first marker on a card', () => {
    status(makeTaskRow({ isLate: true, lateDays: 3, isCritical: true }), 'card');
    expect(screen.getByTestId('tasks-schedule-signal-mobile-wi-1')).toBeInTheDocument();
    expect(screen.queryByTestId('tasks-critical-mobile-wi-1')).toBeNull();
  });

  it('shows no marker for a done task, even one flagged late or critical', () => {
    status(makeTaskRow({ status: 'completed', isLate: true, lateDays: 3, isCritical: true }));
    expect(screen.getByTestId('tasks-status-wi-1')).toBeInTheDocument();
    expect(screen.queryByTestId('tasks-schedule-signal-wi-1')).toBeNull();
    expect(screen.queryByTestId('tasks-critical-wi-1')).toBeNull();
  });

  it('shows no marker for an on-time, non-critical task', () => {
    status();
    expect(screen.queryByTestId('tasks-schedule-signal-wi-1')).toBeNull();
    expect(screen.queryByTestId('tasks-critical-wi-1')).toBeNull();
  });
});

describe('command and ⋯ menu', () => {
  it('the command is the Start / Mark done menu of the row', async () => {
    show(<>{out.renderCommand!(makeTaskRow())}</>);
    expect(screen.getByTestId('tasks-command-wi-1')).toBeInTheDocument();
  });

  function menu(row = makeTaskRow(), surface: 'table' | 'card' = 'table') {
    return out.rowMenu!(row, surface) as readonly OverflowMenuItem[];
  }

  it('table, not started: Open and Delete only', () => {
    expect(menu().map((e) => e.id)).toEqual(['open', 'delete']);
  });

  it('card, not started: Start first, applied without the date step', async () => {
    const entries = menu(makeTaskRow(), 'card');
    expect(entries.map((e) => e.id)).toEqual(['command', 'open', 'delete']);
    expect(entries[0]).toMatchObject({ label: 'Start', testId: 'tasks-command-mobile-wi-1' });
    entries[0]!.onClick!();
    expect(actions.applyStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wi-1' }),
      'in_progress',
      null,
    );
  });

  it('card, in progress: Mark done first', () => {
    const entries = menu(makeTaskRow({ status: 'in_progress' }), 'card');
    expect(entries[0]).toMatchObject({ id: 'command', label: 'Mark done' });
    entries[0]!.onClick!();
    expect(actions.applyStatus).toHaveBeenCalledWith(expect.anything(), 'completed', null);
  });

  it('a done task has Reopen first on both surfaces', () => {
    const entries = menu(makeTaskRow({ status: 'completed' }), 'card');
    expect(entries.map((e) => e.id)).toEqual(['reopen', 'open', 'delete']);
    entries[0]!.onClick!();
    expect(actions.reopen).toHaveBeenCalledTimes(1);
    expect(menu(makeTaskRow({ status: 'completed' }), 'table').map((e) => e.id)).toEqual([
      'reopen',
      'open',
      'delete',
    ]);
  });

  it('Delete is destructive and asks to delete the task', () => {
    const entries = menu();
    const del = entries.find((e) => e.id === 'delete')!;
    expect(del).toMatchObject({ variant: 'destructive', label: 'Delete' });
    del.onClick!();
    expect(actions.requestDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'wi-1' }));
  });

  it('Open navigates to the task page', () => {
    // The Probe's router is still mounted; navigating must not throw.
    expect(() => menu().find((e) => e.id === 'open')!.onClick!()).not.toThrow();
  });

  it('has no duplicate test ids when both surfaces are rendered', () => {
    const row = makeTaskRow({ isLate: true, lateDays: 2, isCritical: true, area: KITCHEN });
    const { container } = show(
      <>
        <div>{out.renderStatus!(row, 'table')}</div>
        <div>{out.renderStatus!(row, 'card')}</div>
        {out.renderSecondary!(row)}
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
});

describe('card facts', () => {
  const facts = (row = makeTaskRow()) =>
    show(
      <div data-testid="facts">
        {out.facts!(row).map((f) => (
          <span key={f.key} data-key={f.key} data-keep={String(f.keep ?? false)}>
            {f.content}
          </span>
        ))}
      </div>,
    );

  it('shows the area (kept), who and the end date', () => {
    facts(
      makeTaskRow({
        area: KITCHEN,
        assignedUser: { id: 'u-1', displayName: 'Sam Example' } as never,
      }),
    );
    const root = screen.getByTestId('facts');
    expect(root.querySelector('[data-key="area"]')).toHaveAttribute('data-keep', 'true');
    expect(root.querySelector('[data-key="who"]')).toHaveTextContent('Sam Example');
    expect(root.querySelector('[data-key="end"]')).toHaveTextContent('2026');
  });

  it('falls back to the expected cost when there is no end date, then to "Not set"', () => {
    facts(makeTaskRow({ endDate: null, expectedCost: 99 }));
    expect(screen.getByTestId('facts').querySelector('[data-key="end"]')).toHaveTextContent(
      '99.00',
    );
    document.body.innerHTML = '';
    facts(makeTaskRow({ endDate: null }));
    const root = screen.getByTestId('facts');
    expect(root.querySelector('[data-key="end"]')).toHaveTextContent('Not set');
    expect(root.querySelector('[data-key="who"]')).toHaveTextContent('Not set');
  });
});
