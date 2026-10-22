/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { routeUrl } from '@cornerstone/shared';
import type { AttentionCriticalLine } from '@cornerstone/shared';
import type { UseAttentionResult } from '../../hooks/useAttention.js';
import type * as HomeApiTypes from '../../lib/homeApi.js';
import type * as SectionModule from './ThisWeekSection.js';
import { renderHome } from '../../test/homeRender.js';
import {
  AREA_KITCHEN,
  makeAgendaItem,
  makeAttention,
  makeRow,
  makeWeek,
} from '../../test/attentionFixtures.js';

const mockGetHomeWeek = jest.fn<typeof HomeApiTypes.getHomeWeek>();
jest.unstable_mockModule('../../lib/homeApi.js', () => ({
  getHomeWeek: mockGetHomeWeek,
  getHomePulse: jest.fn(),
  getHomeSetup: jest.fn(),
}));

let ThisWeekSection: typeof SectionModule.ThisWeekSection;

function attentionOf(
  data: ReturnType<typeof makeAttention> | null,
  status: UseAttentionResult['status'] = data ? 'ready' : 'loading',
): UseAttentionResult {
  return {
    data,
    status,
    error: null,
    includeSnoozed: false,
    setIncludeSnoozed: jest.fn(),
    refresh: jest.fn(),
    retry: jest.fn(),
    removeRow: jest.fn(),
  };
}

const CRITICAL: AttentionCriticalLine = {
  workItemId: 'wi-9',
  label: 'Task Z',
  area: null,
  mustEndBy: '2026-03-15',
  daysLeft: 5,
  level: 'warning',
  criticalCount: 1,
};

const EMPTY = attentionOf(makeAttention([]));

beforeEach(async () => {
  if (!ThisWeekSection) ({ ThisWeekSection } = await import('./ThisWeekSection.js'));
  mockGetHomeWeek.mockReset();
});

describe('ThisWeekSection', () => {
  it('shows a skeleton while the week loads', () => {
    mockGetHomeWeek.mockReturnValue(new Promise(() => {}));
    renderHome(<ThisWeekSection attention={EMPTY} />);
    expect(screen.getByTestId('home-this-week')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('home-week-schedule')).toBeNull();
  });

  it('waits for Needs attention to settle before showing any item', async () => {
    mockGetHomeWeek.mockResolvedValue(makeWeek([makeAgendaItem('starts', '2026-03-10', 'wi-1')]));
    renderHome(<ThisWeekSection attention={attentionOf(null, 'loading')} />);

    await waitFor(() => expect(mockGetHomeWeek).toHaveBeenCalled());
    expect(screen.getByTestId('home-this-week')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('home-week-item-starts:work_item:wi-1')).toBeNull();
  });

  it('shows items once Needs attention failed (nothing can be dropped then)', async () => {
    mockGetHomeWeek.mockResolvedValue(makeWeek([makeAgendaItem('starts', '2026-03-10', 'wi-1')]));
    renderHome(<ThisWeekSection attention={attentionOf(null, 'error')} />);

    expect(await screen.findByTestId('home-week-item-starts:work_item:wi-1')).toBeInTheDocument();
  });

  it('drops items whose subject is a Needs attention row, including members of a group', async () => {
    const group = makeRow('N2', {
      subject: { type: 'group', id: 'g1', label: null, area: null },
      params: {
        rule: 'N2',
        kind: 'group',
        plannedStartDate: '2026-03-06',
        items: [
          {
            id: 'wi-member',
            label: 'Member A',
            area: null,
            daysLate: 3,
            holdsUp: { count: 0, startingWithin14Days: 0 },
          },
        ],
      },
    });
    const data = makeAttention([makeRow('N1'), makeRow('N4'), group]);
    mockGetHomeWeek.mockResolvedValue(
      makeWeek([
        makeAgendaItem('ends', '2026-03-10', 'wi-1'), // subject of the N1 row
        makeAgendaItem('payment', '2026-03-11', 'inv-1'), // subject of the N4 row
        makeAgendaItem('starts', '2026-03-11', 'wi-member'), // member of the N2 group
        makeAgendaItem('starts', '2026-03-11', 'wi-keep'),
      ]),
    );
    renderHome(<ThisWeekSection attention={attentionOf(data)} />);

    expect(
      await screen.findByTestId('home-week-item-starts:work_item:wi-keep'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('home-week-item-ends:work_item:wi-1')).toBeNull();
    expect(screen.queryByTestId('home-week-item-payment:invoice:inv-1')).toBeNull();
    expect(screen.queryByTestId('home-week-item-starts:work_item:wi-member')).toBeNull();
  });

  it('does not drop items whose subject is only a Tidy up row', async () => {
    const data = makeAttention([], [makeRow('H4')]);
    mockGetHomeWeek.mockResolvedValue(makeWeek([makeAgendaItem('ends', '2026-03-10', 'wi-3')]));
    renderHome(<ThisWeekSection attention={attentionOf(data)} />);

    expect(await screen.findByTestId('home-week-item-ends:work_item:wi-3')).toBeInTheDocument();
  });

  it('groups by day with Today and Tomorrow headings, then weekday and date', async () => {
    mockGetHomeWeek.mockResolvedValue(
      makeWeek([
        makeAgendaItem('starts', '2026-03-10', 'a'),
        makeAgendaItem('milestone', '2026-03-11', 'b'),
        makeAgendaItem('delivery', '2026-03-13', 'c'),
      ]),
    );
    renderHome(<ThisWeekSection attention={EMPTY} />);

    const today = await screen.findByTestId('home-week-day-2026-03-10');
    expect(within(today).getByRole('heading', { level: 3 })).toHaveTextContent(/^Today/);
    expect(within(today).getByRole('heading', { level: 3 })).toHaveTextContent('Mar 10');
    expect(
      within(screen.getByTestId('home-week-day-2026-03-11')).getByRole('heading', { level: 3 }),
    ).toHaveTextContent(/^Tomorrow/);
    const later = within(screen.getByTestId('home-week-day-2026-03-13')).getByRole('heading', {
      level: 3,
    });
    expect(later).toHaveTextContent('Fri, Mar 13');
    expect(later).not.toHaveTextContent('Today');
  });

  it('labels each item with its kind and links to the record', async () => {
    mockGetHomeWeek.mockResolvedValue(
      makeWeek([
        makeAgendaItem('milestone', '2026-03-11', '7', {
          subject: { type: 'milestone', id: '7', label: 'Milestone A', area: null },
        }),
        makeAgendaItem('delivery', '2026-03-11', 'hi-1', { companyName: 'Company A' }),
      ]),
    );
    renderHome(<ThisWeekSection attention={EMPTY} />);

    const milestone = await screen.findByTestId('home-week-item-milestone:milestone:7');
    expect(within(milestone).getByText('Milestone')).toBeInTheDocument();
    // D-01: the milestone link is the milestone route, never a 404 path.
    expect(within(milestone).getByRole('link', { name: 'Milestone A' })).toHaveAttribute(
      'href',
      routeUrl('milestone', { id: '7' }),
    );
    const delivery = screen.getByTestId('home-week-item-delivery:household_item:hi-1');
    expect(within(delivery).getByText('Delivery')).toBeInTheDocument();
    expect(delivery).toHaveTextContent('Company A');
  });

  it('shows a payment with its amount, the area and the company', async () => {
    mockGetHomeWeek.mockResolvedValue(
      makeWeek([
        makeAgendaItem('payment', '2026-03-12', 'inv-9', {
          amount: 1500,
          recordKind: 'invoice',
          companyName: 'Company B',
          subject: { type: 'invoice', id: 'inv-9', label: 'INV-Z', area: AREA_KITCHEN },
        }),
      ]),
    );
    renderHome(<ThisWeekSection attention={EMPTY} />);

    const row = await screen.findByTestId('home-week-item-payment:invoice:inv-9');
    expect(row).toHaveTextContent('1,500.00');
    // The screen-reader prefix of the figure is the shared common:attention.amountPrefix.
    expect(row).toHaveTextContent('Amount: €1,500.00');
    expect(row).toHaveTextContent('Payment due');
    expect(row).toHaveTextContent('Company B');
    expect(row).toHaveTextContent('Kitchen');
  });

  it('uses the kind word as title when a record has no name', async () => {
    mockGetHomeWeek.mockResolvedValue(
      makeWeek([
        makeAgendaItem('delivery', '2026-03-11', 'hi-2', {
          subject: { type: 'household_item', id: 'hi-2', label: null, area: null },
        }),
      ]),
    );
    renderHome(<ThisWeekSection attention={EMPTY} />);

    const row = await screen.findByTestId('home-week-item-delivery:household_item:hi-2');
    expect(within(row).getByRole('link', { name: 'Delivery' })).toBeInTheDocument();
  });

  it('shows schedule chips for late, held-up and critical tasks', async () => {
    mockGetHomeWeek.mockResolvedValue(
      makeWeek([
        makeAgendaItem('ends', '2026-03-12', 'wi-5', {
          schedule: { isLate: true, lateDays: 3, isHeldUp: false, isCritical: true },
        }),
      ]),
    );
    renderHome(<ThisWeekSection attention={EMPTY} />);

    const row = await screen.findByTestId('home-week-item-ends:work_item:wi-5');
    expect(row).toHaveTextContent('Critical');
    expect(row).toHaveTextContent(/Late/);
  });

  it('shows a "Waits for" link to the task that holds a task up', async () => {
    mockGetHomeWeek.mockResolvedValue(
      makeWeek([
        makeAgendaItem('starts', '2026-03-12', 'wi-6', {
          schedule: { isLate: false, lateDays: null, isHeldUp: true, isCritical: false },
          heldUpBy: { id: 'wi-cause', label: 'Task Cause' },
        }),
      ]),
    );
    renderHome(<ThisWeekSection attention={EMPTY} />);

    const row = await screen.findByTestId('home-week-item-starts:work_item:wi-6');
    expect(row).toHaveTextContent('Waits for');
    expect(within(row).getByRole('link', { name: 'Task Cause' })).toHaveAttribute(
      'href',
      '/project/work-items/wi-cause',
    );
  });

  it('keeps days beyond the first seven behind a Next 14 days disclosure', async () => {
    mockGetHomeWeek.mockResolvedValue(
      makeWeek([
        makeAgendaItem('starts', '2026-03-16', 'last-week-day'), // today + 6
        makeAgendaItem('starts', '2026-03-17', 'first-next-day'), // today + 7
      ]),
    );
    renderHome(<ThisWeekSection attention={EMPTY} />);

    const toggle = await screen.findByRole('button', { name: /Next 14 days/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('home-week-day-2026-03-16')).toBeVisible();
    expect(screen.getByTestId('home-week-day-2026-03-17')).not.toBeVisible();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('home-week-day-2026-03-17')).toBeVisible();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('offers no Next 14 days button without later items, but always Open schedule', async () => {
    mockGetHomeWeek.mockResolvedValue(makeWeek([makeAgendaItem('starts', '2026-03-11', 'a')]));
    renderHome(<ThisWeekSection attention={EMPTY} />);

    await screen.findByTestId('home-week-item-starts:work_item:a');
    expect(screen.queryByTestId('home-week-next')).toBeNull();
    expect(screen.getByTestId('home-week-schedule')).toHaveAttribute(
      'href',
      routeUrl('scheduleGantt'),
    );
  });

  it('shows the empty state with the schedule link when nothing is planned', async () => {
    mockGetHomeWeek.mockResolvedValue(makeWeek([]));
    renderHome(<ThisWeekSection attention={EMPTY} />);

    expect(await screen.findByText('Nothing is planned for the next 7 days.')).toBeInTheDocument();
    expect(screen.getByTestId('home-week-schedule')).toBeInTheDocument();
  });

  it('shows the empty state when everything planned this week is already in Needs attention', async () => {
    mockGetHomeWeek.mockResolvedValue(makeWeek([makeAgendaItem('ends', '2026-03-10', 'wi-1')]));
    renderHome(<ThisWeekSection attention={attentionOf(makeAttention([makeRow('N1')]))} />);

    expect(await screen.findByText('Nothing is planned for the next 7 days.')).toBeInTheDocument();
  });

  it('shows the critical line first and no empty state when only the critical line exists', async () => {
    mockGetHomeWeek.mockResolvedValue(makeWeek([]));
    renderHome(
      <ThisWeekSection
        attention={attentionOf(makeAttention([], [], { criticalLine: CRITICAL }))}
      />,
    );

    const line = await screen.findByTestId('home-critical-line');
    expect(line).toHaveTextContent('Critical path:');
    expect(line).toHaveTextContent('Warning');
    expect(line).toHaveTextContent('must end by Mar 15 · 5 days left');
    expect(within(line).getByRole('link', { name: 'Task Z' })).toHaveAttribute(
      'href',
      '/project/work-items/wi-9',
    );
    expect(screen.queryByText('Nothing is planned for the next 7 days.')).toBeNull();
  });

  it('puts the critical line before the day groups', async () => {
    mockGetHomeWeek.mockResolvedValue(makeWeek([makeAgendaItem('starts', '2026-03-11', 'a')]));
    renderHome(
      <ThisWeekSection
        attention={attentionOf(makeAttention([], [], { criticalLine: CRITICAL }))}
      />,
    );

    const line = await screen.findByTestId('home-critical-line');
    const day = await screen.findByTestId('home-week-day-2026-03-11');
    expect(line.compareDocumentPosition(day) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('words an overdue critical line with "should have ended", the area and the path count', async () => {
    mockGetHomeWeek.mockResolvedValue(makeWeek([]));
    const overdue: AttentionCriticalLine = {
      ...CRITICAL,
      level: 'overdue',
      daysLeft: -1,
      mustEndBy: '2026-03-09',
      area: AREA_KITCHEN,
      criticalCount: 4,
    };
    renderHome(
      <ThisWeekSection attention={attentionOf(makeAttention([], [], { criticalLine: overdue }))} />,
    );

    const line = await screen.findByTestId('home-critical-line');
    expect(line).toHaveTextContent('Overdue');
    expect(line).toHaveTextContent('should have ended Mar 9 · 1 day ago');
    expect(line).toHaveTextContent('Kitchen');
    expect(line).toHaveTextContent('4 tasks on the critical path');
  });

  it('shows an error with a retry that loads the week again', async () => {
    mockGetHomeWeek.mockRejectedValueOnce(new Error('boom'));
    renderHome(<ThisWeekSection attention={EMPTY} />);

    expect(await screen.findByText("Couldn't load This week.")).toBeInTheDocument();
    mockGetHomeWeek.mockResolvedValue(makeWeek([makeAgendaItem('starts', '2026-03-11', 'a')]));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('home-week-item-starts:work_item:a')).toBeInTheDocument();
  });
});
