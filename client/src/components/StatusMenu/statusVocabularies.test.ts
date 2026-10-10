import { describe, it, expect } from '@jest/globals';
import {
  HOUSEHOLD_ITEM_STATUSES,
  INVOICE_DEPOSIT_STATUSES,
  INVOICE_STATUSES,
  INVOICE_TRANSITIONS,
  MILESTONE_COMPLETION_STATES,
  MILESTONE_TRANSITIONS,
  PROGRESS_PAYMENT_TRANSITIONS,
  PURCHASE_TRANSITIONS,
  TASK_TRANSITIONS,
  WORK_ITEM_STATUSES,
  allowedTargets,
} from '@cornerstone/shared';
import i18n from '../../i18n/index.js';
import {
  invoiceTransitions,
  milestoneCompletionState,
  milestoneTransitions,
  progressPaymentTransitions,
  purchaseTransitions,
  taskTransitions,
} from './statusVocabularies.js';
import type { StatusMenuT } from './statusVocabularies.js';

/** Echoes the key (and the interpolated status) so assertions see which key was asked for. */
const echoT: StatusMenuT = (key, options) =>
  options.status ? `${key}(${options.status})` : `${key}`;

const realT: StatusMenuT = (key, options) => i18n.t(key, { ...options, lng: 'en' }) as string;

const ISO = '2026-08-07';

describe('taskTransitions', () => {
  it.each(WORK_ITEM_STATUSES)('from %s lists exactly the map targets, forward first', (status) => {
    const rows = taskTransitions(echoT, {
      status,
      startDate: null,
      endDate: null,
      actualStartDate: null,
    });
    expect(rows.map((r) => r.to)).toEqual(allowedTargets(TASK_TRANSITIONS, status));
    const dirs = rows.map((r) => r.direction);
    expect(dirs).toEqual([...dirs].sort((a, b) => (a === b ? 0 : a === 'forward' ? -1 : 1)));
  });

  it('every forward row carries a date step; every backward row does not', () => {
    const rows = taskTransitions(echoT, {
      status: 'in_progress',
      startDate: null,
      endDate: null,
      actualStartDate: null,
    });
    for (const row of rows) {
      expect(Boolean(row.date)).toBe(row.direction === 'forward');
    }
  });

  it('start asks when it started with the planned start date', () => {
    const [start] = taskTransitions(echoT, {
      status: 'not_started',
      startDate: '2026-08-01',
      endDate: '2026-08-20',
      actualStartDate: null,
    });
    expect(start).toMatchObject({
      to: 'in_progress',
      direction: 'forward',
      label: 'statusAction.task.start',
      date: { question: 'statusMenu.whenStarted', plannedDate: '2026-08-01' },
    });
  });

  it('mark done asks when it finished, plans the end date and floors at the actual start', () => {
    const rows = taskTransitions(echoT, {
      status: 'in_progress',
      startDate: '2026-08-01',
      endDate: '2026-08-20',
      actualStartDate: '2026-08-03',
    });
    expect(rows[0]).toMatchObject({
      to: 'completed',
      label: 'statusAction.task.markDone',
      date: {
        question: 'statusMenu.whenFinished',
        plannedDate: '2026-08-20',
        minDate: '2026-08-03',
      },
    });
  });

  it('labels backward rows "Back to" with the canonical status label', () => {
    const rows = taskTransitions(echoT, {
      status: 'completed',
      startDate: null,
      endDate: null,
      actualStartDate: null,
    });
    expect(rows).toEqual([
      {
        to: 'in_progress',
        direction: 'backward',
        label: 'statusMenu.backTo(statusVocabulary.task.in_progress)',
      },
    ]);
  });

  it('renders the real English labels', () => {
    const rows = taskTransitions(realT, {
      status: 'in_progress',
      startDate: null,
      endDate: null,
      actualStartDate: null,
    });
    expect(rows.map((r) => r.label)).toEqual([
      i18n.t('statusAction.task.markDone', { ns: 'common', lng: 'en' }),
      `Back to “${i18n.t('statusVocabulary.task.not_started', { ns: 'common', lng: 'en' })}”`,
    ]);
  });
});

describe('purchaseTransitions', () => {
  it.each(HOUSEHOLD_ITEM_STATUSES)('from %s lists exactly the map targets', (status) => {
    const rows = purchaseTransitions(echoT, { status, targetDeliveryDate: null });
    expect(rows.map((r) => r.to)).toEqual(allowedTargets(PURCHASE_TRANSITIONS, status));
  });

  it('only "mark delivered" opens a date step, planned for the target delivery date', () => {
    const rows = purchaseTransitions(echoT, { status: 'planned', targetDeliveryDate: ISO });
    const withDate = rows.filter((r) => r.date);
    expect(withDate).toHaveLength(1);
    expect(withDate[0]).toMatchObject({
      to: 'arrived',
      date: { question: 'statusMenu.whenArrived', plannedDate: ISO },
    });
    expect(rows.find((r) => r.to === 'purchased')?.date).toBeUndefined();
    expect(rows.find((r) => r.to === 'scheduled')?.date).toBeUndefined();
  });

  it('backward rows use the purchase vocabulary labels', () => {
    const rows = purchaseTransitions(echoT, { status: 'arrived', targetDeliveryDate: null });
    expect(rows).toEqual([
      {
        to: 'scheduled',
        direction: 'backward',
        label: 'statusMenu.backTo(statusVocabulary.purchase.scheduled)',
      },
    ]);
  });
});

describe('milestoneTransitions', () => {
  it('maps isCompleted to the completion vocabulary', () => {
    expect(milestoneCompletionState({ isCompleted: true })).toBe('reached');
    expect(milestoneCompletionState({ isCompleted: false })).toBe('not_reached');
    expect(MILESTONE_COMPLETION_STATES).toContain('reached');
  });

  it('not reached offers one forward row with the "On target" planned chip label', () => {
    const rows = milestoneTransitions(echoT, { isCompleted: false, targetDate: ISO });
    expect(rows.map((r) => r.to)).toEqual(allowedTargets(MILESTONE_TRANSITIONS, 'not_reached'));
    expect(rows[0]).toMatchObject({
      to: 'reached',
      direction: 'forward',
      label: 'statusAction.milestone.markReached',
      date: {
        question: 'statusMenu.whenReached',
        plannedDate: ISO,
        plannedLabel: 'statusMenu.onTarget',
      },
    });
  });

  it('reached goes back to the canonical "Upcoming" label with no date step', () => {
    const rows = milestoneTransitions(echoT, { isCompleted: true, targetDate: ISO });
    expect(rows).toEqual([
      {
        to: 'not_reached',
        direction: 'backward',
        label: 'statusMenu.backTo(statusVocabulary.milestone.upcoming)',
      },
    ]);
  });
});

describe('invoiceTransitions', () => {
  it.each(INVOICE_STATUSES)('from %s lists exactly the map targets', (status) => {
    const rows = invoiceTransitions(echoT, { status });
    expect(rows.map((r) => r.to)).toEqual(allowedTargets(INVOICE_TRANSITIONS, status));
  });

  it('Mark paid applies without a date step (AC3)', () => {
    const [row] = invoiceTransitions(echoT, { status: 'pending' });
    expect(row).toMatchObject({ to: 'paid', direction: 'forward' });
    expect(row?.date).toBeUndefined();
  });

  it('claimed and quotation invoices have no transitions', () => {
    expect(invoiceTransitions(echoT, { status: 'claimed' })).toEqual([]);
    expect(invoiceTransitions(echoT, { status: 'quotation' })).toEqual([]);
  });

  it('paid goes back to pending', () => {
    expect(invoiceTransitions(echoT, { status: 'paid' })).toEqual([
      {
        to: 'pending',
        direction: 'backward',
        label: 'statusMenu.backTo(statusVocabulary.invoice.pending)',
      },
    ]);
  });
});

describe('progressPaymentTransitions', () => {
  it.each(INVOICE_DEPOSIT_STATUSES)('from %s lists exactly the map targets', (status) => {
    const rows = progressPaymentTransitions(echoT, { status });
    expect(rows.map((r) => r.to)).toEqual(allowedTargets(PROGRESS_PAYMENT_TRANSITIONS, status));
  });

  it('paid and submitted forward rows ask different questions and plan no date', () => {
    const rows = progressPaymentTransitions(echoT, { status: 'pending' });
    const paid = rows.find((r) => r.to === 'paid');
    const submitted = rows.find((r) => r.to === 'claimed');
    expect(paid?.date).toEqual({ question: 'statusMenu.whenPaid', plannedDate: null });
    expect(submitted?.date).toEqual({ question: 'statusMenu.whenSubmitted', plannedDate: null });
    expect(paid?.label).toBe('statusAction.progressPayment.markPaid');
    expect(submitted?.label).toBe('statusAction.progressPayment.markSubmitted');
  });

  it('backward rows have no date step', () => {
    const rows = progressPaymentTransitions(echoT, { status: 'claimed' });
    expect(rows).toEqual([
      {
        to: 'paid',
        direction: 'backward',
        label: 'statusMenu.backTo(statusVocabulary.progressPayment.paid)',
      },
    ]);
  });
});
