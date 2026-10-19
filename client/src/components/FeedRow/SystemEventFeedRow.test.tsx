/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { createRouterLog, RecordingRouter } from '../../test/recordingRouter.js';
import type * as RowModule from './SystemEventFeedRow.js';

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const formatters = {
    formatDate: (d: string | null | undefined) => `D(${d ?? ''})`,
    formatCurrency: (n: number) => `EUR ${n.toFixed(2)}`,
    formatTime: (ts: string | null | undefined) => `T(${ts ?? ''})`,
  };
  return { ...formatters, useFormatters: () => formatters };
});

let SystemEventFeedRow: typeof RowModule.SystemEventFeedRow;

beforeEach(async () => {
  if (!SystemEventFeedRow) ({ SystemEventFeedRow } = await import('./SystemEventFeedRow.js'));
});

function makeEntry(overrides: Partial<DiaryEntrySummary> = {}): DiaryEntrySummary {
  return {
    id: 'ev-1',
    entryType: 'work_item_status',
    entryDate: '2026-03-14',
    title: null,
    body: '',
    metadata: {
      v: 1,
      event: 'status_changed',
      from: 'not_started',
      to: 'in_progress',
      subjectLabel: 'Kitchen tiling',
    },
    isAutomatic: true,
    isSigned: false,
    status: 'saved',
    sourceEntityType: 'work_item',
    sourceEntityId: 'wi-1',
    sourceEntityArea: null,
    sourceEntityTitle: 'Kitchen tiling',
    sourceEntityExists: true,
    photoCount: 0,
    createdBy: null,
    createdAt: '2026-03-14T10:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z',
    ...overrides,
  };
}

function setup(
  entry: DiaryEntrySummary,
  props: Partial<React.ComponentProps<typeof RowModule.SystemEventFeedRow>> = {},
) {
  const log = createRouterLog();
  render(
    <RecordingRouter entries={['/diary?filterMode=automatic']} log={log}>
      <ul>
        <SystemEventFeedRow entry={entry} {...props} />
      </ul>
    </RecordingRouter>,
  );
  return { log, row: screen.getByTestId(`system-event-${entry.id}`) };
}

describe('SystemEventFeedRow', () => {
  it('renders the event as an <li> row with the type, time and sentence', () => {
    const { row } = setup(makeEntry());
    expect(row.tagName).toBe('LI');
    expect(screen.getByTestId('system-event-ev-1-type')).toHaveTextContent('Task status');
    expect(row).toHaveTextContent('T(2026-03-14T10:00:00.000Z)');
    expect(row).toHaveTextContent('Kitchen tiling went from Not started to In progress');
  });

  it('as="div" renders a div', () => {
    expect(setup(makeEntry(), { as: 'div' }).row.tagName).toBe('DIV');
  });

  it('opens the subject with the list page as origin', () => {
    const { log } = setup(makeEntry());
    const link = screen.getByTestId('system-event-ev-1-link');
    expect(link).toHaveAttribute('href', '/project/work-items/wi-1');
    expect(link).toHaveAttribute('aria-label', 'Open task: Kitchen tiling');
    fireEvent.click(link);
    expect(log.actions).toEqual(['PUSH /project/work-items/wi-1']);
    expect(log.states[0]).toMatchObject({ origin: { to: '/diary?filterMode=automatic' } });
  });

  it('detail variant: no time, link kept', () => {
    const { row } = setup(makeEntry(), { variant: 'detail' });
    expect(row.textContent).not.toContain('T(');
    expect(screen.getByTestId('system-event-ev-1-link')).toBeInTheDocument();
  });

  it('compact variant: no link row and no removed label, even for a gone subject', () => {
    setup(makeEntry({ sourceEntityExists: false }), { variant: 'compact' });
    expect(screen.queryByTestId('system-event-ev-1-link')).toBeNull();
    expect(screen.queryByTestId('system-event-ev-1-removed')).toBeNull();
    expect(screen.getByTestId('system-event-ev-1')).toHaveTextContent('Kitchen tiling');
  });

  it('a gone subject shows "No longer exists" and no link', () => {
    setup(makeEntry({ sourceEntityExists: false }));
    expect(screen.getByTestId('system-event-ev-1-removed')).toHaveTextContent('No longer exists');
    expect(screen.queryByTestId('system-event-ev-1-link')).toBeNull();
  });

  it('a collapsed repeat: the ×N badge is aria-hidden and the detail line carries the count', () => {
    const { row } = setup(
      makeEntry({
        repeat: { count: 3, firstAt: '2026-03-12T08:00:00Z', lastAt: '2026-03-14T08:00:00Z' },
      }),
    );
    const badge = screen.getByText('×3');
    expect(badge.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(row).toHaveTextContent('3 times, D(2026-03-12) to D(2026-03-14)');
  });

  it('a repeat on one day reads "N times on <date>"', () => {
    const { row } = setup(
      makeEntry({
        repeat: { count: 2, firstAt: '2026-03-12T08:00:00Z', lastAt: '2026-03-12T09:00:00Z' },
      }),
    );
    expect(row).toHaveTextContent('2 times on D(2026-03-12)');
  });

  it('a hidden row shows the "After reached" badge (not aria-hidden) and its detail', () => {
    const { row } = setup(makeEntry({ hidden: true }));
    const badge = screen.getByText('After reached');
    expect(badge.closest('[aria-hidden="true"]')).toBeNull();
    expect(row).toHaveTextContent('Logged after the milestone was reached.');
  });

  it('no repeat or hidden badges on a plain event', () => {
    const { row } = setup(makeEntry());
    expect(row).not.toHaveTextContent('After reached');
    expect(row.textContent).not.toMatch(/×\d/);
  });

  it('shows the detail amount of an Invoice recorded event', () => {
    const { row } = setup(
      makeEntry({
        entryType: 'invoice_created',
        sourceEntityType: 'invoice',
        sourceEntityId: 'inv-2',
        sourceEntityTitle: '2026-015',
        metadata: {
          v: 1,
          event: 'invoice_created',
          subjectLabel: '2026-015',
          vendorId: null,
          vendorName: null,
          amount: 480,
        },
      }),
    );
    expect(row).toHaveTextContent('Invoice 2026-015 recorded');
    expect(row).toHaveTextContent('EUR 480.00');
  });

  it('a legacy row shows the stored text with the muted class', () => {
    const { row } = setup(
      makeEntry({ metadata: null, body: 'Stored English text for a legacy event.' }),
    );
    const paragraph = screen.getByText('Stored English text for a legacy event.');
    expect(row).toContainElement(paragraph);
    expect(paragraph.className).toContain('muted');
  });

  it('the payment link is named with the amount, invoice and date', () => {
    setup(
      makeEntry({
        entryType: 'invoice_status',
        sourceEntityType: 'invoice',
        sourceEntityId: 'inv-1',
        sourceEntityTitle: '2026-014',
        metadata: {
          v: 1,
          event: 'status_changed',
          from: 'pending',
          to: 'paid',
          subjectLabel: '2026-014',
          amount: 1000,
          depositEntryType: 'deposit',
          depositId: 'dep-1',
        },
      }),
    );
    const link = screen.getByTestId('system-event-ev-1-link');
    expect(link).toHaveAttribute('href', '/budget/invoices/inv-1?payment=dep-1');
    expect(link).toHaveAttribute(
      'aria-label',
      'Open progress payment of EUR 1000.00 for invoice 2026-014, D(2026-03-14)',
    );
  });
});
