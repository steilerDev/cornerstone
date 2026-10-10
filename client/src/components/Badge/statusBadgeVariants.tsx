import type { ReactNode } from 'react';
import type {
  HouseholdItemStatus,
  MilestoneDisplayStatus,
  InvoiceDepositStatus,
  InvoiceStatus,
  WorkItemStatus,
} from '@cornerstone/shared';
import {
  HOUSEHOLD_ITEM_STATUSES,
  INVOICE_DEPOSIT_STATUSES,
  INVOICE_STATUSES,
  MILESTONE_DISPLAY_STATUSES,
  WORK_ITEM_STATUSES,
} from '@cornerstone/shared';
import type { ScheduleSignalState, ShownScheduleSignal } from '../../lib/scheduleDates.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import type { BadgeVariant } from './Badge.js';
import badgeStyles from './Badge.module.css';

/** Minimal t() shape: works with useTranslation().t and i18n.getFixedT(). */
export type StatusLabelT = (key: string, options: { ns: string; days?: number }) => string;

/** Decorative check mark for the Submitted chip (aria-hidden; the label is the accessible name). */
export function CheckIcon(): ReactNode {
  return (
    <svg
      className={badgeStyles.icon}
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
      data-testid="badge-check-icon"
    >
      <path
        d="M2.5 6.5 5 9l4.5-5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const INVOICE_STATUS_CLASS: Record<InvoiceStatus, string> = {
  pending: badgeStyles.pending!,
  paid: badgeStyles.paid!,
  claimed: badgeStyles.claimed!,
  quotation: badgeStyles.offer!,
};

const TASK_STATUS_CLASS: Record<WorkItemStatus, string> = {
  not_started: badgeStyles.notStarted!,
  in_progress: badgeStyles.inProgress!,
  completed: badgeStyles.completed!,
};

const PURCHASE_STATUS_CLASS: Record<HouseholdItemStatus, string> = {
  planned: badgeStyles.planned!,
  purchased: badgeStyles.purchased!,
  scheduled: badgeStyles.scheduled!,
  arrived: badgeStyles.arrived!,
};

const MILESTONE_STATUS_CLASS: Record<MilestoneDisplayStatus, string> = {
  upcoming: badgeStyles.milestoneUpcoming!,
  late: badgeStyles.milestoneLate!,
  early: badgeStyles.milestoneEarly!,
  reached: badgeStyles.milestoneReached!,
};

export function buildInvoiceStatusVariants(t: StatusLabelT): Record<InvoiceStatus, BadgeVariant> {
  const set = I18N_UNION_KEYS.statusVocabularyInvoice;
  const result = {} as Record<InvoiceStatus, BadgeVariant>;
  for (const status of INVOICE_STATUSES) {
    const variant: BadgeVariant = {
      label: t(set.key(status), { ns: set.ns }),
      className: INVOICE_STATUS_CLASS[status],
    };
    if (status === 'claimed') {
      variant.icon = <CheckIcon />;
      variant.title = t('statusHints.submitted', { ns: 'common' });
    }
    result[status] = variant;
  }
  return result;
}

export function buildProgressPaymentStatusVariants(
  t: StatusLabelT,
): Record<InvoiceDepositStatus, BadgeVariant> {
  const set = I18N_UNION_KEYS.statusVocabularyProgressPayment;
  const result = {} as Record<InvoiceDepositStatus, BadgeVariant>;
  for (const status of INVOICE_DEPOSIT_STATUSES) {
    const variant: BadgeVariant = {
      label: t(set.key(status), { ns: set.ns }),
      className: INVOICE_STATUS_CLASS[status],
    };
    if (status === 'claimed') {
      variant.icon = <CheckIcon />;
      variant.title = t('statusHints.submitted', { ns: 'common' });
    }
    result[status] = variant;
  }
  return result;
}

export function buildTaskStatusVariants(t: StatusLabelT): Record<WorkItemStatus, BadgeVariant> {
  const set = I18N_UNION_KEYS.statusVocabularyTask;
  const result = {} as Record<WorkItemStatus, BadgeVariant>;
  for (const status of WORK_ITEM_STATUSES) {
    result[status] = {
      label: t(set.key(status), { ns: set.ns }),
      className: TASK_STATUS_CLASS[status],
    };
  }
  return result;
}

export function buildPurchaseStatusVariants(
  t: StatusLabelT,
): Record<HouseholdItemStatus, BadgeVariant> {
  const set = I18N_UNION_KEYS.statusVocabularyPurchase;
  const result = {} as Record<HouseholdItemStatus, BadgeVariant>;
  for (const status of HOUSEHOLD_ITEM_STATUSES) {
    result[status] = {
      label: t(set.key(status), { ns: set.ns }),
      className: PURCHASE_STATUS_CLASS[status],
    };
  }
  return result;
}

/**
 * Milestone display-status chips. The label is the bare word; late/early words carry a day
 * count, so callers with a milestone should take the label from milestoneStatusLabel().
 */
export function buildMilestoneStatusVariants(
  t: StatusLabelT,
): Record<MilestoneDisplayStatus, BadgeVariant> {
  const set = I18N_UNION_KEYS.statusVocabularyMilestone;
  const result = {} as Record<MilestoneDisplayStatus, BadgeVariant>;
  for (const status of MILESTONE_DISPLAY_STATUSES) {
    result[status] = {
      label: t(set.key(status), { ns: set.ns, days: 0 }),
      className: MILESTONE_STATUS_CLASS[status],
    };
  }
  return result;
}

/** Schedule-signal chips: Late (with day count) and Held up. 'critical' is out of scope here. */
export function buildScheduleSignalVariants(
  t: StatusLabelT,
  lateDays: number,
): Record<ShownScheduleSignal, BadgeVariant> {
  const set = I18N_UNION_KEYS.statusVocabularyScheduleSignal;
  return {
    late: {
      label: t(set.key('late'), { ns: set.ns, days: lateDays }),
      className: badgeStyles.scheduleAtRisk!,
    },
    held_up: {
      label: t(set.key('held_up'), { ns: set.ns }),
      className: badgeStyles.scheduleWarning!,
    },
  };
}

/** Props that make every surface render the same signal chip. */
export function scheduleSignalBadgeProps(
  state: ScheduleSignalState,
  variantsFor: (days: number) => Record<ShownScheduleSignal, BadgeVariant>,
): { variants: Record<ShownScheduleSignal, BadgeVariant>; value: ShownScheduleSignal } {
  return {
    variants: variantsFor(state.signal === 'late' ? state.days : 0),
    value: state.signal,
  };
}

export function buildRefundVariants(t: StatusLabelT): { refund: BadgeVariant } {
  const set = I18N_UNION_KEYS.depositEntryType;
  return {
    refund: { label: t(set.key('refund'), { ns: set.ns }), className: badgeStyles.refund! },
  };
}
