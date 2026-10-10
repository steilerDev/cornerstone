import type { ReactNode } from 'react';
import type {
  HouseholdItemStatus,
  InvoiceDepositStatus,
  InvoiceStatus,
  WorkItemStatus,
} from '@cornerstone/shared';
import {
  HOUSEHOLD_ITEM_STATUSES,
  INVOICE_DEPOSIT_STATUSES,
  INVOICE_STATUSES,
  WORK_ITEM_STATUSES,
} from '@cornerstone/shared';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import type { BadgeVariant } from './Badge.js';
import badgeStyles from './Badge.module.css';

/** Minimal t() shape: works with useTranslation().t and i18n.getFixedT(). */
export type StatusLabelT = (key: string, options: { ns: string }) => string;

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
  not_started: badgeStyles.not_started!,
  in_progress: badgeStyles.in_progress!,
  completed: badgeStyles.completed!,
};

const PURCHASE_STATUS_CLASS: Record<HouseholdItemStatus, string> = {
  planned: badgeStyles.planned!,
  purchased: badgeStyles.purchased!,
  scheduled: badgeStyles.scheduled!,
  arrived: badgeStyles.arrived!,
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

export function buildRefundVariants(t: StatusLabelT): { refund: BadgeVariant } {
  const set = I18N_UNION_KEYS.depositEntryType;
  return {
    refund: { label: t(set.key('refund'), { ns: set.ns }), className: badgeStyles.refund! },
  };
}
