/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import {
  AUTOMATIC_DIARY_ENTRY_TYPES,
  BUDGET_SOURCE_STATUSES,
  DIARY_ENTRY_TYPES,
  DIARY_INSPECTION_OUTCOMES,
  DIARY_ISSUE_RESOLUTIONS,
  DIARY_ISSUE_SEVERITIES,
  SUBSIDY_APPLICATION_STATUSES,
  HOUSEHOLD_ITEM_STATUSES,
  INVOICE_DEPOSIT_STATUSES,
  INVOICE_STATUSES,
  MILESTONE_DISPLAY_STATUSES,
  WORK_ITEM_STATUSES,
} from '@cornerstone/shared';
import { USER_ACCOUNT_STATUSES } from '../../lib/userAccountStatus.js';
import { BACKUP_RUN_OUTCOMES, INTEGRATION_STATUSES } from '../../lib/integrationStatus.js';
import enCommon from '../../i18n/en/common.json';
import enBudget from '../../i18n/en/budget.json';
import deCommon from '../../i18n/de/common.json';
import enDiary from '../../i18n/en/diary.json';
import deDiary from '../../i18n/de/diary.json';
import { Badge } from './Badge.js';
import badgeStyles from './Badge.module.css';
import {
  CheckIcon,
  buildBackupRunVariants,
  buildDiaryOutcomeVariants,
  buildDiarySeverityVariants,
  buildDiaryTypeVariants,
  buildUserAccountStatusVariants,
  buildDefectStatusVariants,
  buildFundingSourceStatusVariants,
  buildGrantStatusVariants,
  buildIntegrationStatusVariants,
  buildInvoiceStatusVariants,
  buildMilestoneStatusVariants,
  buildProgressPaymentStatusVariants,
  buildPurchaseStatusVariants,
  buildRefundVariants,
  buildScheduleSignalVariants,
  buildTaskStatusVariants,
  scheduleSignalBadgeProps,
} from './statusBadgeVariants.js';
import type { StatusLabelT } from './statusBadgeVariants.js';

// identity-obj-proxy: badgeStyles.<name> === '<name>'

const RESOURCES: Record<string, unknown> = { common: enCommon, budget: enBudget };

/** Real-resource t(): resolves a dotted key in the real en JSON; unknown keys fail loudly. */
const realT: StatusLabelT = (key, { ns }) => {
  let node: unknown = RESOURCES[ns];
  for (const part of key.split('.')) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  if (typeof node !== 'string') throw new Error(`missing key ${ns}:${key}`);
  return node;
};

const vocab = enCommon.statusVocabulary;

describe('buildInvoiceStatusVariants', () => {
  const variants = buildInvoiceStatusVariants(realT);

  it('has exactly one entry per InvoiceStatus', () => {
    expect(Object.keys(variants).sort()).toEqual([...INVOICE_STATUSES].sort());
  });

  it('labels come from the canonical en vocabulary (To pay / Paid / Submitted / Offer)', () => {
    expect(variants.pending.label).toBe(vocab.invoice.pending);
    expect(variants.paid.label).toBe(vocab.invoice.paid);
    expect(variants.claimed.label).toBe(vocab.invoice.claimed);
    expect(variants.quotation.label).toBe(vocab.invoice.quotation);
    expect([variants.pending.label, variants.paid.label, variants.claimed.label]).toEqual([
      'To pay',
      'Paid',
      'Submitted',
    ]);
  });

  it('maps quotation to the offer class, never a quotation class', () => {
    expect(variants.quotation.className).toBe('offer');
    expect(Object.values(variants).map((v) => v.className)).not.toContain('quotation');
    expect(variants.pending.className).toBe('pending');
    expect(variants.paid.className).toBe('paid');
    expect(variants.claimed.className).toBe('claimed');
  });

  it('gives only the claimed chip a decorative icon and a tooltip', () => {
    expect(variants.claimed.icon).toBeDefined();
    expect(variants.claimed.title).toBe(enCommon.statusHints.submitted);
    for (const status of ['pending', 'paid', 'quotation'] as const) {
      expect(variants[status].icon).toBeUndefined();
      expect(variants[status].title).toBeUndefined();
    }
  });

  it('renders the Submitted chip with an aria-hidden svg first and the label as text', () => {
    render(<Badge variants={variants} value="claimed" testId="chip" />);
    const chip = screen.getByTestId('chip');
    const first = chip.firstElementChild;
    expect(first?.tagName.toLowerCase()).toBe('svg');
    expect(first).toHaveAttribute('aria-hidden', 'true');
    expect(first).toHaveAttribute('focusable', 'false');
    expect(chip).toHaveAttribute('title', enCommon.statusHints.submitted);
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(chip.textContent).toBe('Submitted');
  });

  it('renders the To pay chip without an svg or tooltip', () => {
    render(<Badge variants={variants} value="pending" testId="chip" />);
    const chip = screen.getByTestId('chip');
    expect(chip.querySelector('svg')).toBeNull();
    expect(chip).not.toHaveAttribute('title');
  });
});

describe('buildProgressPaymentStatusVariants', () => {
  const variants = buildProgressPaymentStatusVariants(realT);

  it('has exactly one entry per InvoiceDepositStatus', () => {
    expect(Object.keys(variants).sort()).toEqual([...INVOICE_DEPOSIT_STATUSES].sort());
  });

  it('labels come from the progressPayment vocabulary and reuse the invoice classes', () => {
    expect(variants.pending.label).toBe(vocab.progressPayment.pending);
    expect(variants.paid.label).toBe(vocab.progressPayment.paid);
    expect(variants.claimed.label).toBe(vocab.progressPayment.claimed);
    expect(variants.pending.className).toBe('pending');
    expect(variants.paid.className).toBe('paid');
    expect(variants.claimed.className).toBe('claimed');
  });

  it('gives the claimed progress payment the check icon and tooltip', () => {
    expect(variants.claimed.icon).toBeDefined();
    expect(variants.claimed.title).toBe(enCommon.statusHints.submitted);
    expect(variants.pending.icon).toBeUndefined();
    expect(variants.paid.icon).toBeUndefined();
  });
});

describe('buildTaskStatusVariants', () => {
  const variants = buildTaskStatusVariants(realT);

  it('has exactly one entry per WorkItemStatus', () => {
    expect(Object.keys(variants).sort()).toEqual([...WORK_ITEM_STATUSES].sort());
  });

  it('uses the canonical words (completed reads Done) and the matching classes', () => {
    expect(variants.not_started.label).toBe('Not started');
    expect(variants.in_progress.label).toBe('In progress');
    expect(variants.completed.label).toBe('Done');
    // real build exports camelCase CSS keys only
    expect(variants.not_started.className).toBe('notStarted');
    expect(variants.in_progress.className).toBe('inProgress');
    expect(variants.completed.className).toBe('completed');
  });
});

describe('buildPurchaseStatusVariants', () => {
  const variants = buildPurchaseStatusVariants(realT);

  it('has exactly one entry per HouseholdItemStatus', () => {
    expect(Object.keys(variants).sort()).toEqual([...HOUSEHOLD_ITEM_STATUSES].sort());
  });

  it('uses the canonical words and the matching classes', () => {
    expect(variants.planned.label).toBe('Planned');
    expect(variants.purchased.label).toBe('Ordered');
    expect(variants.scheduled.label).toBe('Delivery scheduled');
    expect(variants.arrived.label).toBe('Delivered');
    for (const status of HOUSEHOLD_ITEM_STATUSES) {
      expect(variants[status].className).toBe(status);
    }
  });

  it('keeps planned and scheduled as different words', () => {
    expect(variants.planned.label).not.toBe(variants.scheduled.label);
  });
});

describe('buildRefundVariants', () => {
  it('uses the refund class (info pair, not error red) and the entry-type label', () => {
    const { refund } = buildRefundVariants(realT);
    expect(refund.className).toBe(badgeStyles.refund);
    expect(refund.className).toBe('refund');
    expect(refund.label).toBe(enBudget.invoiceDetail.deposits.entryTypeLabels.refund);
    expect(refund.icon).toBeUndefined();
  });
});

describe('CheckIcon', () => {
  it('is a decorative, non-focusable svg using currentColor', () => {
    const { container } = render(<>{CheckIcon()}</>);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg?.querySelector('path')).toHaveAttribute('stroke', 'currentColor');
  });
});

describe('buildMilestoneStatusVariants (#2198)', () => {
  it('has exactly one entry per MilestoneDisplayStatus with its own Badge class', () => {
    const variants = buildMilestoneStatusVariants(realT);
    expect(Object.keys(variants).sort()).toEqual([...MILESTONE_DISPLAY_STATUSES].sort());
    expect(variants.upcoming.className).toBe('milestoneUpcoming');
    expect(variants.late.className).toBe('milestoneLate');
    expect(variants.early.className).toBe('milestoneEarly');
    expect(variants.reached.className).toBe('milestoneReached');
  });

  it('takes the bare word from the common vocabulary and passes days: 0 to t()', () => {
    const calls: Array<{ key: string; days: number | undefined }> = [];
    const spyT: StatusLabelT = (key, options) => {
      calls.push({ key, days: options.days });
      return realT(key, options);
    };
    const variants = buildMilestoneStatusVariants(spyT);
    expect(variants.upcoming.label).toBe('Upcoming');
    expect(variants.reached.label).toBe('Reached');
    expect(calls).toHaveLength(MILESTONE_DISPLAY_STATUSES.length);
    expect(calls.every((c) => c.days === 0)).toBe(true);
    expect(calls.every((c) => c.key.includes('statusVocabulary.milestone.'))).toBe(true);
  });
});

// ── Schedule signal chips (contract 4, #2199) ────────────────────────────────

/** Real-resource t() for a locale, with {{days}} interpolation. */
function realTFor(common: unknown): StatusLabelT {
  return (key, options) => {
    let node: unknown = common;
    for (const part of key.split('.')) {
      node = (node as Record<string, unknown> | undefined)?.[part];
    }
    if (typeof node !== 'string') throw new Error(`missing key ${key}`);
    const days = (options as { days?: number }).days;
    return days === undefined ? node : node.replace('{{days}}', String(days));
  };
}

describe('buildScheduleSignalVariants', () => {
  it('interpolates the day count into the English late label', () => {
    const variants = buildScheduleSignalVariants(realTFor(enCommon), 3);
    expect(variants.late.label).toBe('Late · 3 d');
    expect(variants.held_up.label).toBe('Held up');
  });

  it('uses the German vocabulary', () => {
    const variants = buildScheduleSignalVariants(realTFor(deCommon), 3);
    expect(variants.late.label).toBe('Verspätet · 3 T');
    expect(variants.held_up.label).toBe('Aufgehalten');
  });

  it('maps late to scheduleAtRisk and held up to scheduleWarning', () => {
    const variants = buildScheduleSignalVariants(realTFor(enCommon), 1);
    expect(variants.late.className).toBe(badgeStyles.scheduleAtRisk);
    expect(variants.held_up.className).toBe(badgeStyles.scheduleWarning);
    expect(variants.late.className).toBe('scheduleAtRisk');
    expect(variants.held_up.className).toBe('scheduleWarning');
  });

  it('renders through Badge with the variant label and class', () => {
    const variants = buildScheduleSignalVariants(realTFor(enCommon), 5);
    render(<Badge variants={variants} value="late" testId="chip" />);
    expect(screen.getByTestId('chip')).toHaveTextContent('Late · 5 d');
    expect(screen.getByTestId('chip')).toHaveClass('scheduleAtRisk');
  });
});

describe('scheduleSignalBadgeProps', () => {
  const variantsFor = (days: number) => buildScheduleSignalVariants(realTFor(enCommon), days);

  it('passes the late day count to the variant builder', () => {
    const props = scheduleSignalBadgeProps({ signal: 'late', days: 4 }, variantsFor);
    expect(props.value).toBe('late');
    expect(props.variants.late.label).toBe('Late · 4 d');
  });

  it('builds a held-up chip without a day count', () => {
    const props = scheduleSignalBadgeProps({ signal: 'held_up' }, variantsFor);
    expect(props.value).toBe('held_up');
    expect(props.variants.held_up.label).toBe('Held up');
  });
});

describe.each([
  [
    'buildGrantStatusVariants',
    buildGrantStatusVariants,
    SUBSIDY_APPLICATION_STATUSES,
    'grant',
    {
      eligible: 'Eligible',
      applied: 'Applied',
      approved: 'Approved',
      received: 'Received',
      rejected: 'Rejected',
    },
    {
      eligible: 'grantEligible',
      applied: 'grantApplied',
      approved: 'grantApproved',
      received: 'grantReceived',
      rejected: 'grantRejected',
    },
  ],
  [
    'buildFundingSourceStatusVariants',
    buildFundingSourceStatusVariants,
    BUDGET_SOURCE_STATUSES,
    'fundingSource',
    { active: 'Active', exhausted: 'Used up', closed: 'Closed' },
    { active: 'fundingActive', exhausted: 'fundingExhausted', closed: 'fundingClosed' },
  ],
  [
    'buildDefectStatusVariants',
    buildDefectStatusVariants,
    DIARY_ISSUE_RESOLUTIONS,
    'defect',
    { open: 'Open', in_progress: 'Being fixed', resolved: 'Fixed' },
    { open: 'defectOpen', in_progress: 'defectInProgress', resolved: 'defectFixed' },
  ],
] as const)('%s (#2209 round 2)', (_name, build, members, vocabKey, labels, classes) => {
  const variants = build(realT) as Record<string, { label: string; className?: string }>;

  it('has exactly one entry per member of the shared tuple', () => {
    expect(Object.keys(variants).sort()).toEqual([...members].sort());
  });

  it('labels come from the canonical en vocabulary', () => {
    for (const member of members) {
      expect(variants[member]!.label).toBe(
        (vocab as Record<string, Record<string, string>>)[vocabKey]![member],
      );
      expect(variants[member]!.label).toBe((labels as Record<string, string>)[member]);
    }
  });

  it('maps each status to its own Badge class', () => {
    for (const member of members) {
      expect(variants[member]!.className).toBe((classes as Record<string, string>)[member]);
      expect(variants[member]!.className).toBe(
        (badgeStyles as Record<string, string>)[(classes as Record<string, string>)[member]!],
      );
    }
  });

  it('renders through Badge with the variant label and class', () => {
    const member = members[0]!;
    render(<Badge variants={variants} value={member} testId="chip" />);
    expect(screen.getByTestId('chip')).toHaveTextContent(variants[member]!.label);
    expect(screen.getByTestId('chip')).toHaveClass(variants[member]!.className!);
  });

  it('uses the German vocabulary for its labels', () => {
    const de = build(realTFor(deCommon)) as Record<string, { label: string }>;
    for (const member of members) {
      expect(de[member]!.label).not.toBe(variants[member]!.label);
      expect(de[member]!.label.length).toBeGreaterThan(0);
    }
  });
});

describe.each([
  [
    'buildIntegrationStatusVariants (#2217)',
    buildIntegrationStatusVariants,
    INTEGRATION_STATUSES,
    'integrationStatus',
    {
      connected: 'Connected',
      unreachable: "Can't connect",
      on: 'On',
      off: 'Off',
      notSetUp: 'Not set up',
    },
    { connected: 'success', unreachable: 'warning', on: 'success', off: 'info', notSetUp: 'info' },
  ],
  [
    'buildBackupRunVariants (#2217)',
    buildBackupRunVariants,
    BACKUP_RUN_OUTCOMES,
    'backupRun',
    { succeeded: 'Succeeded', failed: 'Failed' },
    { succeeded: 'success', failed: 'error' },
  ],
  [
    'buildUserAccountStatusVariants (#2219)',
    buildUserAccountStatusVariants,
    USER_ACCOUNT_STATUSES,
    'userAccountStatus',
    { active: 'Active', locked: 'Locked', deactivated: 'Deactivated' },
    { active: 'userActive', locked: 'warning', deactivated: 'userDeactivated' },
  ],
] as const)('%s', (_name, build, members, key, labels, classes) => {
  const variants = build(realT) as Record<string, { label: string; className?: string }>;

  it('has exactly one entry per member of the shared tuple', () => {
    expect(Object.keys(variants).sort()).toEqual([...members].sort());
  });

  it('gives every variant a label from common and a Badge class', () => {
    for (const member of members) {
      expect(variants[member]!.label).toBe((labels as Record<string, string>)[member]);
      expect(variants[member]!.label).toBe(
        (enCommon as unknown as Record<string, Record<string, string>>)[key]![member],
      );
      expect(variants[member]!.className).toBe((classes as Record<string, string>)[member]);
    }
  });

  it('renders through Badge with the variant label and class', () => {
    const member = members[0]!;
    render(<Badge variants={variants} value={member} testId="chip" />);
    expect(screen.getByTestId('chip')).toHaveTextContent(variants[member]!.label);
    expect(screen.getByTestId('chip')).toHaveClass(variants[member]!.className!);
  });

  it('has a German label for every member', () => {
    const de = build(realTFor(deCommon)) as Record<string, { label: string }>;
    for (const member of members) expect(de[member]!.label.length).toBeGreaterThan(0);
  });
});

// ─── Diary type / outcome / severity maps (#2225) ──────────────────────────────

const DIARY_RESOURCES = {
  en: { common: enCommon, diary: enDiary },
  de: { common: deCommon, diary: deDiary },
} as const;

function diaryT(locale: 'en' | 'de'): StatusLabelT {
  return (key, { ns }) => {
    let node: unknown = (DIARY_RESOURCES[locale] as Record<string, unknown>)[ns];
    for (const part of key.split('.')) {
      node = (node as Record<string, unknown> | undefined)?.[part];
    }
    if (typeof node !== 'string') throw new Error(`missing key ${ns}:${key}`);
    return node;
  };
}

describe('buildDiaryTypeVariants (#2225)', () => {
  const variants = buildDiaryTypeVariants(diaryT('en'));

  it('has exactly one entry per diary entry type, manual and automatic', () => {
    expect(Object.keys(variants).sort()).toEqual([...DIARY_ENTRY_TYPES].sort());
  });

  it('labels manual types with the canonical words', () => {
    expect(variants.daily_log.label).toBe('Daily log');
    expect(variants.site_visit.label).toBe('Site visit');
    expect(variants.delivery.label).toBe('Delivery');
    expect(variants.issue.label).toBe('Defect');
    expect(variants.general_note.label).toBe('Note');
  });

  it('labels automatic types with the diary words and no emoji', () => {
    expect(variants.work_item_status.label).toBe('Task status');
    expect(variants.subsidy_status.label).toBe('Grant status');
    for (const variant of Object.values(variants)) {
      expect(variant.label).toMatch(/^[\p{L}\p{N} ]+$/u);
    }
  });

  it('gives each manual type its own class and all automatic types the shared one', () => {
    expect(variants.daily_log.className).toBe('diaryDailyLog');
    expect(variants.site_visit.className).toBe('diarySiteVisit');
    expect(variants.delivery.className).toBe('diaryDelivery');
    expect(variants.issue.className).toBe('diaryIssue');
    expect(variants.general_note.className).toBe('diaryGeneralNote');
    for (const type of AUTOMATIC_DIARY_ENTRY_TYPES) {
      expect(variants[type].className).toBe('diaryAutomatic');
    }
  });

  it('has a German label for every type', () => {
    const de = buildDiaryTypeVariants(diaryT('de'));
    for (const type of DIARY_ENTRY_TYPES) expect(de[type].label.length).toBeGreaterThan(0);
  });

  it('renders a chip with the label as its text', () => {
    render(<Badge variants={variants} value="delivery" testId="chip" />);
    expect(screen.getByTestId('chip').textContent).toBe('Delivery');
  });
});

describe('buildDiaryOutcomeVariants (#2225)', () => {
  const variants = buildDiaryOutcomeVariants(diaryT('en'));

  it('has one entry per inspection outcome with its own class and a label', () => {
    expect(Object.keys(variants).sort()).toEqual([...DIARY_INSPECTION_OUTCOMES].sort());
    for (const outcome of DIARY_INSPECTION_OUTCOMES) {
      expect(variants[outcome].className).toBe(outcome);
      expect(variants[outcome].label.length).toBeGreaterThan(0);
    }
  });

  it('has a German label for every outcome', () => {
    const de = buildDiaryOutcomeVariants(diaryT('de'));
    for (const outcome of DIARY_INSPECTION_OUTCOMES) {
      expect(de[outcome].label.length).toBeGreaterThan(0);
    }
  });
});

describe('buildDiarySeverityVariants (#2225)', () => {
  const variants = buildDiarySeverityVariants(diaryT('en'));

  it('has one entry per severity with its own class and a label', () => {
    expect(Object.keys(variants).sort()).toEqual([...DIARY_ISSUE_SEVERITIES].sort());
    for (const severity of DIARY_ISSUE_SEVERITIES) {
      expect(variants[severity].className).toBe(severity);
      expect(variants[severity].label.length).toBeGreaterThan(0);
    }
  });

  it('has a German label for every severity', () => {
    const de = buildDiarySeverityVariants(diaryT('de'));
    for (const severity of DIARY_ISSUE_SEVERITIES) {
      expect(de[severity].label.length).toBeGreaterThan(0);
    }
  });
});
