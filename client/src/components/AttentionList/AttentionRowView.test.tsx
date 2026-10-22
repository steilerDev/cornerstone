/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import type { AttentionRow } from '@cornerstone/shared';
import * as realApiClient from '../../lib/apiClient.js';
import type * as RowViewModule from './AttentionRowView.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { renderInAttentionProviders } from '../../test/attentionHarness.js';
import { AREA_KITCHEN, makeRow } from '../../test/attentionFixtures.js';
import { todayLocalIsoDate } from '../../lib/localDate.js';

const mockPatch = jest.fn<(path: string, body?: unknown) => Promise<unknown>>();
const mockPost = jest.fn<(path: string, body?: unknown) => Promise<unknown>>();
const mockDel = jest.fn<(path: string) => Promise<unknown>>();

jest.unstable_mockModule('../../lib/apiClient.js', () => ({
  ...realApiClient,
  patch: mockPatch,
  post: mockPost,
  del: mockDel,
}));

let AttentionRowView: typeof RowViewModule.AttentionRowView;
let attentionLinkUrl: typeof RowViewModule.attentionLinkUrl;
let media: MatchMediaControl;

const TID = 'row';
const onLeave = jest.fn<(row: AttentionRow, reason: 'done' | 'notNow') => void>();
const onRefresh = jest.fn<() => void>();
const onNavigate = jest.fn<() => void>();
const onDiscard = jest.fn<(row: AttentionRow) => void>();

function renderRow(
  row: AttentionRow,
  props: { showGroups?: boolean; withNavigate?: boolean } = {},
) {
  return renderInAttentionProviders(
    <ul>
      <AttentionRowView
        row={row}
        today="2026-03-10"
        testId={TID}
        onLeave={onLeave}
        onRefresh={onRefresh}
        onNavigate={props.withNavigate ? onNavigate : undefined}
        onDiscard={onDiscard}
        showGroups={props.showGroups ?? true}
      />
    </ul>,
  );
}

const undoBody = { undo: { token: 'tok-1', expiresAt: '2099-01-01T00:00:00.000Z' } };

beforeEach(async () => {
  if (!AttentionRowView)
    ({ AttentionRowView, attentionLinkUrl } = await import('./AttentionRowView.js'));
  mockPatch.mockReset();
  mockPost.mockReset();
  mockDel.mockReset();
  onLeave.mockReset();
  onRefresh.mockReset();
  onNavigate.mockReset();
  onDiscard.mockReset();
  media = installMatchMedia({ '(min-width: 1024px)': true });
});

afterEach(() => {
  media.restore();
});

const row = () => screen.getByTestId(TID);

describe('AttentionRowView: wording and structure', () => {
  it('shows the tier badge, the title link and the sentence of a late task', () => {
    renderRow(makeRow('N1'));
    expect(screen.getByTestId(`${TID}-tier`)).toHaveTextContent('Late');
    const link = screen.getByTestId(`${TID}-link`);
    expect(link).toHaveTextContent('Task A');
    expect(link).toHaveAttribute('href', '/project/work-items/wi-1');
    expect(row()).toHaveTextContent(/In progress, 5 days late \(planned end/);
    expect(row()).toHaveAttribute('data-severity', 'red');
  });

  it('shows a server amount as a figure with a screen-reader prefix', () => {
    renderRow(makeRow('N4'));
    expect(row()).toHaveTextContent('Amount:');
    expect(row()).toHaveTextContent(/1,234\.50/);
  });

  it('shows no figure for a row without an amount', () => {
    renderRow(makeRow('N1'));
    expect(row()).not.toHaveTextContent('Amount:');
  });

  it('D-01: a milestone row links to the milestone page, never a dead path', () => {
    renderRow(makeRow('N3'));
    const link = screen.getByTestId(`${TID}-link`);
    expect(link).toHaveAttribute('href', '/project/milestones/7');
    expect(link).toHaveTextContent('Milestone A');
    expect(row()).toHaveTextContent('Milestone');
  });

  it('D-01: attentionLinkUrl builds the same url routeUrl gives for a milestone link', () => {
    expect(attentionLinkUrl({ route: 'milestone', params: { id: '7' }, query: {} })).toBe(
      '/project/milestones/7',
    );
  });

  it.each([
    [
      'N4 invoice',
      makeRow('N4', { subject: { type: 'invoice', id: 'i', label: null, area: null } }),
      'Invoice',
    ],
    [
      'N5 offer',
      makeRow('N5', {
        params: { recordKind: 'offer' } as never,
        subject: { type: 'invoice', id: 'o', label: null, area: null },
      }),
      'Offer',
    ],
    [
      'N6 progress payment',
      makeRow('N6', {
        params: { paymentKind: 'progress' } as never,
        subject: { type: 'progress_payment', id: 'd', label: null, area: null },
      }),
      'Progress payment',
    ],
    [
      'N8 funding source',
      makeRow('N8', { subject: { type: 'budget_source', id: 'b', label: null, area: null } }),
      'Funding source',
    ],
    [
      'N9 offer',
      makeRow('N9', { subject: { type: 'invoice', id: 'x', label: null, area: null } }),
      'Offer',
    ],
    [
      'N11 grant',
      makeRow('N11', { subject: { type: 'subsidy_program', id: 'g', label: null, area: null } }),
      'Grant',
    ],
    [
      'H2 invoice',
      makeRow('H2', { subject: { type: 'invoice', id: 'h', label: null, area: null } }),
      'Invoice',
    ],
  ])('uses the kind word as the title when a record has no name (%s)', (_n, r, word) => {
    renderRow(r);
    expect(screen.getByTestId(`${TID}-link`)).toHaveTextContent(word);
  });

  it('shows an empty title when neither a label nor a kind word exists', () => {
    renderRow(
      makeRow('N1', { subject: { type: 'work_item', id: 'wi-9', label: null, area: null } }),
    );
    expect(screen.getByTestId(`${TID}-link`)).toHaveTextContent('');
  });

  it('names a draft diary row after its type and date when it has no title', () => {
    renderRow(
      makeRow('H1', { subject: { type: 'diary_entry', id: 'de-2', label: null, area: null } }),
    );
    expect(screen.getByTestId(`${TID}-link`)).toHaveTextContent(/Daily log · /);
    expect(row()).toHaveTextContent(/is still a draft/);
  });

  it('shows a defect with its severity line', () => {
    renderRow(makeRow('N12'));
    expect(screen.getByTestId(`${TID}-link`)).toHaveTextContent('Cracked tile');
    expect(row()).toHaveTextContent('Severity: High');
    expect(row()).toHaveTextContent(/Open since/);
  });

  it('shows the holds-up note', () => {
    renderRow(makeRow('N1', { holdsUp: { count: 3, startingWithin14Days: 1 } }));
    expect(row()).toHaveTextContent('Holds up 3 tasks · 1 starts within 2 weeks');
  });

  it('shows the area path and the company after the title', () => {
    renderRow(
      makeRow('N1', {
        subject: { type: 'work_item', id: 'wi-1', label: 'Task A', area: AREA_KITCHEN },
      }),
    );
    expect(row()).toHaveTextContent('Kitchen');
    expect(row()).toHaveTextContent('Company A');
  });

  it('shows the area alone when the row has no company', () => {
    renderRow(
      makeRow('N3', {
        subject: { type: 'milestone', id: '7', label: 'Milestone A', area: AREA_KITCHEN },
      }),
    );
    expect(row()).toHaveTextContent('Kitchen');
    expect(row()).not.toHaveTextContent('Company A');
  });

  it('shows the company alone when the row has no area', () => {
    renderRow(makeRow('N4'));
    expect(row()).toHaveTextContent('Company A');
  });

  it.each(['N2', 'N5', 'N6', 'N9', 'H2'] as const)('shows the company of a %s row', (rule) => {
    renderRow(makeRow(rule, { params: { companyName: 'Company A' } as never }));
    expect(row()).toHaveTextContent('Company A');
  });

  it('shows the company of a purchase and none when it has no company', () => {
    renderRow(makeRow('N10', { params: { status: 'purchased' } as never }));
    expect(row()).toHaveTextContent('Company A');
  });

  it('shows no company for a purchase without one', () => {
    renderRow(makeRow('N10', { params: { status: 'purchased', companyName: null } as never }));
    expect(row()).not.toHaveTextContent('Company A');
  });

  it.each(['N3', 'N8', 'N11', 'N12', 'H1', 'H4'] as const)(
    'shows no company on a %s row',
    (rule) => {
      renderRow(makeRow(rule));
      expect(row()).not.toHaveTextContent('Company A');
    },
  );

  it('puts the origin in the router state of the title link', () => {
    const { log } = renderRow(makeRow('N1'), {});
    fireEvent.click(screen.getByTestId(`${TID}-link`));
    expect(log.actions).toEqual(['PUSH /project/work-items/wi-1']);
    expect(JSON.stringify(log.states[0])).toContain('"/"');
  });
});

describe('AttentionRowView: N2 group', () => {
  const group = () =>
    makeRow('N2', {
      subject: { type: 'group', id: 'n2', label: null, area: null },
      params: {
        kind: 'group',
        plannedStartDate: '2026-03-06',
        items: [
          {
            id: 'g1',
            label: 'Task G1',
            area: AREA_KITCHEN,
            daysLate: 4,
            holdsUp: { count: 2, startingWithin14Days: 0 },
          },
          {
            id: 'g2',
            label: 'Task G2',
            area: null,
            daysLate: 1,
            holdsUp: { count: 0, startingWithin14Days: 0 },
          },
        ],
      } as never,
      actions: ['start', 'reschedule'],
    });

  it('shows a link-less title with the count and only Not now as action', () => {
    renderRow(group());
    expect(row()).toHaveTextContent('2 tasks not started');
    expect(screen.queryByTestId(`${TID}-link`)).toBeNull();
    expect(screen.queryByTestId(`${TID}-start`)).toBeNull();
    expect(screen.queryByTestId(`${TID}-reschedule`)).toBeNull();
    expect(screen.getByTestId(`${TID}-not-now`)).toBeInTheDocument();
    expect(row()).toHaveTextContent(/All were due to start on/);
  });

  it('hides the tasks behind a disclosure that toggles', () => {
    renderRow(group());
    const toggle = screen.getByTestId(`${TID}-group-toggle`);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('Show tasks');
    expect(screen.getByTestId(`${TID}-item-g1`)).not.toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent('Hide tasks');
    expect(screen.getByTestId(`${TID}-item-g1`)).toBeVisible();
    expect(screen.getByTestId(`${TID}-item-g1`)).toHaveTextContent('Task G1');
    expect(screen.getByTestId(`${TID}-item-g1`)).toHaveTextContent('4 days late');
    expect(screen.getByTestId(`${TID}-item-g1`)).toHaveTextContent('Kitchen');
    expect(screen.getByTestId(`${TID}-item-g1`)).toHaveTextContent('Holds up 2 tasks');
    expect(screen.getByTestId(`${TID}-item-g2`)).toHaveTextContent('1 day late');
    expect(within(screen.getByTestId(`${TID}-item-g1`)).getByRole('link')).toHaveAttribute(
      'href',
      '/project/work-items/g1',
    );
    fireEvent.click(toggle);
    expect(screen.getByTestId(`${TID}-item-g1`)).not.toBeVisible();
  });

  it('lists the tasks without a disclosure when groups are not collapsed', () => {
    renderRow(group(), { showGroups: false });
    expect(screen.queryByTestId(`${TID}-group-toggle`)).toBeNull();
    expect(screen.getByTestId(`${TID}-item-g1`)).toBeVisible();
  });

  it('runs onNavigate when a group task link is followed', () => {
    renderRow(group(), { showGroups: false, withNavigate: true });
    fireEvent.click(within(screen.getByTestId(`${TID}-item-g2`)).getByRole('link'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});

describe('AttentionRowView: link actions', () => {
  it('Reschedule links to the Constraints section of the task page', () => {
    renderRow(makeRow('N1'), { withNavigate: true });
    const link = screen.getByTestId(`${TID}-reschedule`);
    expect(link).toHaveAttribute('href', '/project/work-items/wi-1#constraints');
    expect(link.getAttribute('href')).toMatch(/#constraints$/);
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['N10', 'change_target', 'Change target', '/household-items/hi-1'],
    ['N9', 'convert', 'Convert', '/budget/invoices/off-1'],
    ['H2', 'split', 'Split', '/budget/invoices/inv-4'],
    ['H1', 'continue', 'Continue', '/diary/de-2/edit'],
    ['N8', 'prepare_bank_report', 'Prepare bank report', '/budget/sources/bs-1/bank-report'],
  ] as const)('%s offers %s as a link to the row target', (rule, action, label, _href) => {
    const r = makeRow(rule, rule === 'N10' ? { params: { status: 'purchased' } as never } : {});
    renderRow(r, { withNavigate: true });
    const link = screen.getByTestId(`${TID}-${action}`);
    expect(link).toHaveTextContent(label);
    expect(link.getAttribute('href')).toBe(attentionLinkUrl(r.link));
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('renders no inline action for Open (the title is the link)', () => {
    renderRow(makeRow('N3'));
    expect(screen.queryByTestId(`${TID}-open`)).toBeNull();
    expect(screen.getByTestId(`${TID}-not-now`)).toBeInTheDocument();
  });

  it('shows at most two actions before Not now', () => {
    renderRow(makeRow('N1', { actions: ['mark_done', 'reschedule', 'change_target'] }));
    expect(screen.getByTestId(`${TID}-mark_done`)).toBeInTheDocument();
    expect(screen.getByTestId(`${TID}-reschedule`)).toBeInTheDocument();
    expect(screen.queryByTestId(`${TID}-change_target`)).toBeNull();
  });

  it('renders nothing for an action that does not fit the rule', () => {
    renderRow(makeRow('N3', { actions: ['mark_done', 'start'] }));
    expect(screen.queryByTestId(`${TID}-mark_done`)).toBeNull();
    expect(screen.queryByTestId(`${TID}-start`)).toBeNull();
  });

  it.each(['mark_delivered', 'mark_paid'] as const)(
    'renders nothing for %s on a task row',
    (action) => {
      renderRow(makeRow('N1', { actions: [action] }));
      expect(screen.queryByTestId(`${TID}-${action}`)).toBeNull();
    },
  );

  it('Discard hands the row to the host', () => {
    const r = makeRow('H1');
    renderRow(r);
    fireEvent.click(screen.getByTestId(`${TID}-discard`));
    expect(onDiscard).toHaveBeenCalledWith(r);
  });
});

describe('AttentionRowView: status actions', () => {
  it('Mark done (late task) asks for the end date and sends the chosen date', async () => {
    mockPatch.mockResolvedValue({ id: 'wi-1', ...undoBody });
    renderRow(makeRow('N1'));
    fireEvent.click(screen.getByTestId(`${TID}-mark_done`));
    fireEvent.click(await screen.findByTestId(`${TID}-mark_done-date-today`));
    await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/work-items/wi-1', {
      status: 'completed',
      actualEndDate: todayLocalIsoDate(),
    });
    expect(onLeave.mock.calls[0]?.[1]).toBe('done');
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('Mark done offers "as planned" with the planned end date', async () => {
    mockPatch.mockResolvedValue({ id: 'wi-1' });
    renderRow(makeRow('N1'));
    fireEvent.click(screen.getByTestId(`${TID}-mark_done`));
    fireEvent.click(await screen.findByTestId(`${TID}-mark_done-date-planned`));
    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    expect(mockPatch).toHaveBeenCalledWith('/work-items/wi-1', {
      status: 'completed',
      actualEndDate: '2026-03-05',
    });
  });

  it('shows an Undo toast after a status change and Undo restores and refetches', async () => {
    mockPatch.mockResolvedValue({ id: 'wi-1', ...undoBody });
    mockPost.mockResolvedValue({});
    renderRow(makeRow('N1'));
    fireEvent.click(screen.getByTestId(`${TID}-mark_done`));
    fireEvent.click(await screen.findByTestId(`${TID}-mark_done-date-today`));
    expect(await screen.findByTestId('toast-item-undo')).toHaveTextContent('Task A');
    onRefresh.mockClear();
    fireEvent.click(screen.getByTestId('toast-undo'));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith('/undo/tok-1');
  });

  it('Mark done (ended task, H4) applies at once with the recorded end date and no date step', async () => {
    mockPatch.mockResolvedValue({ id: 'wi-3' });
    renderRow(makeRow('H4'));
    fireEvent.click(screen.getByTestId(`${TID}-mark_done`));
    await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId(`${TID}-mark_done-date-today`)).toBeNull();
    expect(mockPatch).toHaveBeenCalledWith('/work-items/wi-3', {
      status: 'completed',
      actualEndDate: '2026-03-04',
    });
  });

  it('Start sends the in-progress status with the picked planned start', async () => {
    mockPatch.mockResolvedValue({ id: 'wi-2' });
    renderRow(makeRow('N2'));
    fireEvent.click(screen.getByTestId(`${TID}-start`));
    fireEvent.click(await screen.findByTestId(`${TID}-start-date-planned`));
    await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/work-items/wi-2', {
      status: 'in_progress',
      actualStartDate: '2026-03-06',
    });
  });

  it('Mark delivered sends the arrived status with the date to the purchase', async () => {
    mockPatch.mockResolvedValue({ householdItem: { id: 'hi-1' } });
    renderRow(makeRow('N10', { params: { status: 'purchased' } as never }));
    fireEvent.click(screen.getByTestId(`${TID}-mark_delivered`));
    fireEvent.click(await screen.findByTestId(`${TID}-mark_delivered-date-planned`));
    await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/household-items/hi-1', {
      status: 'arrived',
      actualDeliveryDate: '2026-03-07',
    });
  });

  it('Mark paid (final payment) patches the invoice of its company with no date step', async () => {
    mockPatch.mockResolvedValue({ invoice: { id: 'inv-1' } });
    renderRow(makeRow('N4'));
    fireEvent.click(screen.getByTestId(`${TID}-mark_paid`));
    await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/vendors/co-1/invoices/inv-1', { status: 'paid' });
  });

  it('Mark paid (progress payment) patches the deposit of the invoice with the paid date', async () => {
    mockPatch.mockResolvedValue({ deposit: { id: 'dep-1' } });
    renderRow(
      makeRow('N5', {
        params: { paymentKind: 'progress' } as never,
        subject: { type: 'progress_payment', id: 'dep-1', label: 'INV-B', area: null },
      }),
    );
    fireEvent.click(screen.getByTestId(`${TID}-mark_paid`));
    fireEvent.click(await screen.findByTestId(`${TID}-mark_paid-date-today`));
    await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/invoices/inv-2/deposits/dep-1', {
      status: 'paid',
      paidDate: todayLocalIsoDate(),
    });
  });

  it('keeps the row and shows an error toast when the change fails', async () => {
    mockPatch.mockRejectedValue(new Error('network'));
    renderRow(makeRow('N4'));
    fireEvent.click(screen.getByTestId(`${TID}-mark_paid`));
    expect(await screen.findByTestId('toast-item-error')).toBeInTheDocument();
    expect(onLeave).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

describe('AttentionRowView: Not now', () => {
  it('describes the button with the 7-day hint and keeps the visible name "Not now"', () => {
    renderRow(makeRow('N1'));
    const button = screen.getByTestId(`${TID}-not-now`);
    expect(button).toHaveTextContent('Not now');
    expect(button).toHaveAttribute('title', 'Hides this row for 7 days.');
    const hint = document.getElementById(button.getAttribute('aria-describedby') as string);
    expect(hint).toHaveTextContent('Hides this row for 7 days.');
    expect(hint).toHaveAttribute('hidden');
  });

  it('posts the key, removes the row, refetches and offers Undo that deletes the snooze', async () => {
    mockPost.mockResolvedValue({ key: 'N1:work_item:wi-1', snoozedUntil: '2026-03-17' });
    mockDel.mockResolvedValue(undefined);
    renderRow(makeRow('N1'));
    fireEvent.click(screen.getByTestId(`${TID}-not-now`));
    await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith('/attention/not-now', { key: 'N1:work_item:wi-1' });
    expect(onLeave.mock.calls[0]?.[1]).toBe('notNow');
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('toast-item-undo')).toHaveTextContent('Hidden for 7 days.');
    fireEvent.click(screen.getByTestId('toast-undo'));
    await waitFor(() =>
      expect(mockDel).toHaveBeenCalledWith('/attention/not-now/N1%3Awork_item%3Awi-1'),
    );
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(2));
  });

  it('keeps the row, shows an error toast and re-enables the button when it fails', async () => {
    mockPost.mockRejectedValue(new Error('network'));
    renderRow(makeRow('N1'));
    const button = screen.getByTestId(`${TID}-not-now`);
    fireEvent.click(button);
    expect(await screen.findByTestId('toast-item-error')).toHaveTextContent(
      "Couldn't hide this row.",
    );
    expect(onLeave).not.toHaveBeenCalled();
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
  });

  it('is aria-disabled (not disabled) while busy and ignores a second click', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockPost.mockReturnValue(new Promise((r) => (resolve = r)));
    renderRow(makeRow('N1'));
    const button = screen.getByTestId(`${TID}-not-now`);
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'));
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(mockPost).toHaveBeenCalledTimes(1);
    resolve({ key: 'k', snoozedUntil: '2026-03-17' });
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
  });
});

describe('AttentionRowView: snoozed row', () => {
  const snoozed = () => makeRow('N1', { snoozedUntil: '2026-03-14' });

  it('shows "Back on" and Show again instead of the actions and Not now', () => {
    renderRow(snoozed());
    expect(row()).toHaveTextContent(/Back on/);
    expect(screen.getByTestId(`${TID}-show-again`)).toHaveTextContent('Show again');
    expect(screen.queryByTestId(`${TID}-not-now`)).toBeNull();
    expect(screen.queryByTestId(`${TID}-mark_done`)).toBeNull();
    expect(screen.queryByTestId(`${TID}-reschedule`)).toBeNull();
  });

  it('Show again deletes the snooze and refetches', async () => {
    mockDel.mockResolvedValue(undefined);
    renderRow(snoozed());
    fireEvent.click(screen.getByTestId(`${TID}-show-again`));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(mockDel).toHaveBeenCalledWith('/attention/not-now/N1%3Awork_item%3Awi-1');
  });

  it('Show again reports a failure with a toast and does not refetch', async () => {
    mockDel.mockRejectedValue(new Error('network'));
    renderRow(snoozed());
    fireEvent.click(screen.getByTestId(`${TID}-show-again`));
    expect(await screen.findByTestId('toast-item-error')).toBeInTheDocument();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('Show again is aria-disabled while busy and ignores a second click', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockDel.mockReturnValue(new Promise((r) => (resolve = r)));
    renderRow(snoozed());
    const button = screen.getByTestId(`${TID}-show-again`);
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'));
    fireEvent.click(button);
    expect(mockDel).toHaveBeenCalledTimes(1);
    resolve(undefined);
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });
});

describe('AttentionRowView focus hand-over and unknown statuses', () => {
  it('hands focus back to the row title when the status control turns into a plain badge', async () => {
    const purchased = makeRow('N10', { params: { status: 'purchased' } as never });
    // A status the transition map does not know leaves no transition: the control becomes a Badge.
    const arrived = makeRow('N10', { params: { status: 'mystery' } as never });
    let flip: () => void = () => {};
    mockPatch.mockImplementation(async () => {
      // The server answers; the host's row now carries a status with nothing left to do.
      act(() => flip());
      return { householdItem: { id: 'hi-1' } };
    });
    function Host() {
      const [current, setCurrent] = useState(purchased);
      flip = () => setCurrent(arrived);
      return (
        <ul>
          <AttentionRowView
            row={current}
            today="2026-03-10"
            testId={TID}
            onLeave={onLeave}
            onRefresh={onRefresh}
            onDiscard={onDiscard}
            showGroups
          />
        </ul>
      );
    }
    renderInAttentionProviders(<Host />);

    fireEvent.click(screen.getByTestId(`${TID}-mark_delivered`));
    fireEvent.click(await screen.findByTestId(`${TID}-mark_delivered-date-planned`));

    await waitFor(() => expect(screen.getByTestId(`${TID}-link`)).toHaveFocus());
  });

  it('falls back to the raw status word for a status the vocabulary does not know', () => {
    renderRow(makeRow('N10', { params: { status: 'mystery' } as never }));
    expect(screen.getByTestId(`${TID}-mark_delivered`)).toBeInTheDocument();
  });
});
