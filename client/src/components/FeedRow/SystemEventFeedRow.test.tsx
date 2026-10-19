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
    <RecordingRouter entries={['/history?type=payment']} log={log}>
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
    expect(log.states[0]).toMatchObject({ origin: { to: '/history?type=payment' } });
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

  describe('extra badge and actions (#2224)', () => {
    const invoiceEntry = (meta: Record<string, unknown>, over: Partial<DiaryEntrySummary> = {}) =>
      makeEntry({
        entryType: 'invoice_status',
        sourceEntityType: 'invoice',
        sourceEntityId: 'inv-1',
        sourceEntityTitle: 'T-001',
        metadata: {
          v: 1,
          event: 'status_changed',
          from: 'pending',
          to: 'claimed',
          subjectLabel: 'T-001',
          ...meta,
        } as never,
        ...over,
      });

    it('a Payment shows the Payment badge as real text (not aria-hidden)', () => {
      setup(invoiceEntry({ to: 'paid' }));
      const badge = screen.getByTestId('system-event-ev-1-extra');
      expect(badge).toHaveTextContent('Payment');
      expect(badge.closest('[aria-hidden="true"]')).toBeNull();
    });

    it('a collapsed batch shows the Submission badge and its sentence', () => {
      const { row } = setup(
        invoiceEntry(
          { batchId: 'b-1' },
          {
            batch: {
              batchId: 'b-1',
              invoiceCount: 2,
              amount: 300,
              invoiceLabels: ['T-001', 'T-002'],
              budgetSourceId: 'src-1',
              budgetSourceName: 'Bank A',
              budgetSourceExists: true,
            },
          },
        ),
      );
      expect(screen.getByTestId('system-event-ev-1-extra')).toHaveTextContent('Submission');
      expect(row).toHaveTextContent('2 invoices submitted to the bank, EUR 300.00');
      expect(row).toHaveTextContent('Invoices T-001, T-002');
      expect(screen.getByTestId('system-event-ev-1-link')).toHaveAttribute(
        'href',
        '/budget/reports?sourceId=src-1',
      );
    });

    it('a plain event has no extra badge', () => {
      setup(makeEntry());
      expect(screen.queryByTestId('system-event-ev-1-extra')).toBeNull();
    });

    it('renders no Revert text and no actions element (P4.11 is not built yet)', () => {
      const { row } = setup(invoiceEntry({ batchId: 'b-1' }));
      expect(row).not.toHaveTextContent(/revert/i);
      expect(screen.queryByTestId('system-event-ev-1-actions')).toBeNull();
    });
  });

  describe('actions prop (#2317)', () => {
    it('renders the given node after the link row', () => {
      const { row } = setup(makeEntry(), {
        actions: <button type="button">Revert submission</button>,
      });
      const actions = screen.getByTestId('system-event-ev-1-actions');
      expect(row).toContainElement(actions);
      expect(actions).toHaveTextContent('Revert submission');
      const link = screen.getByTestId('system-event-ev-1-link');
      expect(link.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('renders no actions element without the prop', () => {
      setup(makeEntry());
      expect(screen.queryByTestId('system-event-ev-1-actions')).toBeNull();
    });
  });
});
