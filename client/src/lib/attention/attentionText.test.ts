import { describe, it, expect, beforeAll } from '@jest/globals';
import i18next from 'i18next';
import type { TFunction } from 'i18next';
import type { AttentionParams, AttentionRow } from '@cornerstone/shared';
import enCommon from '../../i18n/en/common.json';
import deCommon from '../../i18n/de/common.json';
import { makeRow } from '../../test/attentionFixtures.js';
import { attentionRowText, holdsUpLine } from './attentionText.js';
import type { AttentionTextContext } from './attentionText.js';

let tEn: TFunction;
let tDe: TFunction;

beforeAll(async () => {
  const instance = i18next.createInstance();
  await instance.init({
    resources: { en: { common: enCommon }, de: { common: deCommon } },
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common'],
    interpolation: { escapeValue: false },
  });
  tEn = instance.getFixedT('en', 'common');
  tDe = instance.getFixedT('de', 'common');
});

function ctx(t: TFunction): AttentionTextContext {
  return {
    t,
    today: '2026-03-10',
    formatDayMonth: (d) => (d ? `<${d}>` : '-'),
    formatCurrency: (n) => `E${n}`,
    purchaseStatusLabel: (s) => `status:${s}`,
    diaryTypeLabel: (s) => `type:${s}`,
    severityLabel: (s) => `sev:${s}`,
  };
}

function text(row: AttentionRow, t: TFunction = tEn) {
  return attentionRowText(row, ctx(t));
}

function withParams(row: AttentionRow, params: Partial<AttentionParams>): AttentionRow {
  return { ...row, params: { ...row.params, ...params } as AttentionParams };
}

describe('attentionRowText sentences (en)', () => {
  it('N1: plural, singular and the no-date forms', () => {
    expect(text(makeRow('N1')).sentence).toBe(
      'In progress, 5 days late (planned end <2026-03-05>).',
    );
    expect(text(makeRow('N1', { params: { daysLate: 1 } })).sentence).toBe(
      'In progress, 1 day late (planned end <2026-03-05>).',
    );
    expect(text(makeRow('N1', { params: { plannedEndDate: null, daysLate: 3 } })).sentence).toBe(
      'In progress, 3 days late.',
    );
    expect(text(makeRow('N1', { params: { plannedEndDate: null, daysLate: 1 } })).sentence).toBe(
      'In progress, 1 day late.',
    );
  });

  it('N2: task with and without a date, and the group sentence', () => {
    expect(text(makeRow('N2')).sentence).toBe(
      'Not started, 4 days late (planned start <2026-03-06>).',
    );
    expect(text(makeRow('N2', { params: { daysLate: 1 } })).sentence).toBe(
      'Not started, 1 day late (planned start <2026-03-06>).',
    );
    expect(text(makeRow('N2', { params: { plannedStartDate: null } })).sentence).toBe(
      'Not started, 4 days late.',
    );
    const group = makeRow('N2', {
      params: { kind: 'group', plannedStartDate: '2026-03-02', items: [] },
    });
    expect(text(group).sentence).toBe('All were due to start on <2026-03-02>.');
  });

  it('N3: passed, passed with a projection (plural, singular, no days), projected only', () => {
    expect(text(makeRow('N3')).sentence).toBe('Target <2026-03-01> has passed.');
    const passedProjected = makeRow('N3', {
      params: { projectedDate: '2026-03-20', daysAfterTarget: 19, daysSinceTarget: 9 },
    });
    expect(text(passedProjected).sentence).toBe(
      'Target <2026-03-01> has passed; now expected <2026-03-20> (19 days later).',
    );
    expect(text(withParams(passedProjected, { daysAfterTarget: 1 })).sentence).toBe(
      'Target <2026-03-01> has passed; now expected <2026-03-20> (1 day later).',
    );
    expect(text(withParams(passedProjected, { daysAfterTarget: null })).sentence).toBe(
      'Target <2026-03-01> has passed; now expected <2026-03-20>.',
    );
    expect(text(withParams(passedProjected, { daysAfterTarget: 0 })).sentence).toBe(
      'Target <2026-03-01> has passed; now expected <2026-03-20>.',
    );
    const projectedOnly = makeRow('N3', {
      params: { projectedDate: '2026-03-20', daysAfterTarget: 4, daysSinceTarget: null },
    });
    expect(text(projectedOnly).sentence).toBe(
      'Expected <2026-03-20>, 4 days after its target of <2026-03-01>.',
    );
    expect(text(withParams(projectedOnly, { daysAfterTarget: 1 })).sentence).toBe(
      'Expected <2026-03-20>, 1 day after its target of <2026-03-01>.',
    );
  });

  it('N3: falls back to the passed sentence when neither date relation is known', () => {
    const none = makeRow('N3', {
      params: { projectedDate: null, daysAfterTarget: null, daysSinceTarget: null },
    });
    expect(text(none).sentence).toBe('Target <2026-03-01> has passed.');
    const projectedNoDays = makeRow('N3', {
      params: { projectedDate: '2026-03-20', daysAfterTarget: null, daysSinceTarget: null },
    });
    expect(text(projectedNoDays).sentence).toBe('Target <2026-03-01> has passed.');
  });

  it('N4: past due, due today, and the no-due-date fallback', () => {
    expect(text(makeRow('N4')).sentence).toBe('Payment was due <2026-03-02> (8 days ago).');
    expect(text(makeRow('N4', { params: { dueInDays: -1 } })).sentence).toBe(
      'Payment was due <2026-03-02> (1 day ago).',
    );
    expect(text(makeRow('N4', { params: { dueInDays: 0 } })).sentence).toBe(
      'Payment was due <2026-03-02> (today).',
    );
    expect(text(makeRow('N4', { params: { dueDate: null, dueInDays: null } })).sentence).toBe(
      'Open since <2026-02-20> (18 days), no due date.',
    );
    expect(
      text(makeRow('N4', { params: { dueDate: null, dueInDays: null, daysOpen: 1 } })).sentence,
    ).toBe('Open since <2026-02-20> (1 day), no due date.');
  });

  it('N4/N5: a due date with an unknown day count leaves the relative part empty', () => {
    expect(text(makeRow('N4', { params: { dueInDays: null } })).sentence).toBe(
      'Payment was due <2026-03-02> ().',
    );
  });

  it('N5: due in the future, today, and the no-due-date fallback', () => {
    expect(text(makeRow('N5')).sentence).toBe('Payment due <2026-03-12> (in 2 days).');
    expect(text(makeRow('N5', { params: { dueInDays: 1 } })).sentence).toBe(
      'Payment due <2026-03-12> (in 1 day).',
    );
    expect(text(makeRow('N5', { params: { dueInDays: 0 } })).sentence).toBe(
      'Payment due <2026-03-12> (today).',
    );
    expect(text(makeRow('N5', { params: { dueDate: null, dueInDays: null } })).sentence).toBe(
      'Open since <2026-03-01> (9 days), no due date.',
    );
  });

  it('N6: open since, plural and singular', () => {
    expect(text(makeRow('N6')).sentence).toBe('Open since <2026-02-01> (37 days), no due date.');
    expect(text(makeRow('N6', { params: { daysOpen: 1 } })).sentence).toBe(
      'Open since <2026-02-01> (1 day), no due date.',
    );
  });

  it('N8: items ready to submit', () => {
    expect(text(makeRow('N8')).sentence).toBe('3 items ready to submit.');
    expect(text(makeRow('N8', { params: { count: 1 } })).sentence).toBe('1 item ready to submit.');
  });

  it('N9: due soon and the passed variant', () => {
    expect(text(makeRow('N9')).sentence).toBe('Offer due <2026-03-14> (in 4 days).');
    expect(text(makeRow('N9', { params: { dueInDays: -2 } })).sentence).toBe(
      'Offer due date <2026-03-14> has passed (2 days ago).',
    );
    expect(text(makeRow('N9', { params: { dueInDays: 0 } })).sentence).toBe(
      'Offer due <2026-03-14> (today).',
    );
  });

  it('N10: late (plural, singular) and due, with the row date or the target as fallback', () => {
    expect(text(makeRow('N10')).sentence).toBe(
      'status:purchased, 3 days late (delivery planned <2026-03-07>).',
    );
    expect(text(makeRow('N10', { params: { dueInDays: -1 } })).sentence).toBe(
      'status:purchased, 1 day late (delivery planned <2026-03-07>).',
    );
    expect(
      text(makeRow('N10', { date: null, params: { targetDeliveryDate: '2026-03-06' } })).sentence,
    ).toBe('status:purchased, 3 days late (delivery planned <2026-03-06>).');
    expect(text(makeRow('N10', { params: { isLate: false, dueInDays: 2 } })).sentence).toBe(
      'status:purchased, delivery due <2026-03-07> (in 2 days).',
    );
  });

  it('N11: eligible and applied', () => {
    expect(text(makeRow('N11')).sentence).toBe('Eligible. Deadline <2026-03-20> (in 10 days).');
    expect(text(makeRow('N11', { params: { status: 'applied' } })).sentence).toBe(
      'Applied. Deadline <2026-03-20> (in 10 days).',
    );
  });

  it('N12: open, in progress, and the severity line only with a severity', () => {
    const open = text(makeRow('N12'));
    expect(open.sentence).toBe('Open since <2026-03-03>.');
    expect(open.severityLine).toBe('Severity: sev:high');
    const fixing = text(
      makeRow('N12', { params: { resolutionStatus: 'in_progress', severity: null } }),
    );
    expect(fixing.sentence).toBe('Being fixed, logged <2026-03-03>.');
    expect(fixing.severityLine).toBeNull();
  });

  it('H1, H2, H4: tidy-up sentences', () => {
    expect(text(makeRow('H1')).sentence).toBe('type:daily_log from <2026-03-08> is still a draft.');
    expect(text(makeRow('H2')).sentence).toBe('E300 of E1000 is not yet split.');
    expect(text(makeRow('H2', { amount: null })).sentence).toBe('Not yet split.');
    expect(text(makeRow('H4')).sentence).toBe('Ended <2026-03-04> but still In progress.');
  });

  it('throws on an unknown rule instead of rendering something wrong', () => {
    const bogus = { ...makeRow('N1'), params: { rule: 'N99' } } as unknown as AttentionRow;
    expect(() => text(bogus)).toThrow(/Unhandled attention params/);
  });
});

describe('attentionRowText kind, severity and holds-up', () => {
  it('returns the kind word of the row', () => {
    expect(text(makeRow('N3')).kind).toBe('milestone');
    expect(text(makeRow('N1')).kind).toBeNull();
  });

  it('holds-up line: none, with tasks starting soon, and none starting soon', () => {
    expect(text(makeRow('N1')).holdsUp).toBeNull();
    expect(text(makeRow('N1', { holdsUp: { count: 3, startingWithin14Days: 1 } })).holdsUp).toBe(
      'Holds up 3 tasks · 1 starts within 2 weeks',
    );
    expect(text(makeRow('N1', { holdsUp: { count: 1, startingWithin14Days: 2 } })).holdsUp).toBe(
      'Holds up 1 task · 2 start within 2 weeks',
    );
    expect(text(makeRow('N1', { holdsUp: { count: 2, startingWithin14Days: 0 } })).holdsUp).toBe(
      'Holds up 2 tasks · none start within 2 weeks',
    );
  });

  it('holdsUpLine returns null for null, undefined and a zero count', () => {
    expect(holdsUpLine(null, tEn)).toBeNull();
    expect(holdsUpLine(undefined, tEn)).toBeNull();
    expect(holdsUpLine({ count: 0, startingWithin14Days: 4 }, tEn)).toBeNull();
  });
});

describe('attentionRowText in German', () => {
  it('renders every rule without leaking a missing-key path', () => {
    const rules = [
      'N1',
      'N2',
      'N3',
      'N4',
      'N5',
      'N6',
      'N8',
      'N9',
      'N10',
      'N11',
      'N12',
      'H1',
      'H2',
      'H4',
    ] as const;
    for (const rule of rules) {
      const result = text(makeRow(rule, { holdsUp: { count: 2, startingWithin14Days: 1 } }), tDe);
      expect(result.sentence).not.toMatch(/attention\./);
      expect(result.sentence.length).toBeGreaterThan(0);
      expect(result.holdsUp).not.toMatch(/attention\./);
    }
  });
});
