import type { ReactNode } from 'react';
import type {
  BudgetSourceStatus,
  DiaryEntryType,
  DiaryInspectionOutcome,
  DiaryIssueResolution,
  DiaryIssueSeverity,
  HouseholdItemStatus,
  MilestoneDisplayStatus,
  InvoiceDepositStatus,
  InvoiceStatus,
  SubsidyApplicationStatus,
  WorkItemStatus,
} from '@cornerstone/shared';
import {
  BUDGET_SOURCE_STATUSES,
  DIARY_ENTRY_TYPES,
  DIARY_INSPECTION_OUTCOMES,
  DIARY_ISSUE_RESOLUTIONS,
  DIARY_ISSUE_SEVERITIES,
  HOUSEHOLD_ITEM_STATUSES,
  INVOICE_DEPOSIT_STATUSES,
  INVOICE_STATUSES,
  MILESTONE_DISPLAY_STATUSES,
  SUBSIDY_APPLICATION_STATUSES,
  WORK_ITEM_STATUSES,
} from '@cornerstone/shared';
import type { BackupRunOutcome, IntegrationStatus } from '../../lib/integrationStatus.js';
import { BACKUP_RUN_OUTCOMES, INTEGRATION_STATUSES } from '../../lib/integrationStatus.js';
import type { UserAccountStatus } from '../../lib/userAccountStatus.js';
import { USER_ACCOUNT_STATUSES } from '../../lib/userAccountStatus.js';
import type { ScheduleSignalState, ShownScheduleSignal } from '../../lib/scheduleDates.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { diaryEntryTypeLabelKey } from '../../lib/diaryEntryTypeLabel.js';
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

const INTEGRATION_STATUS_CLASS: Record<IntegrationStatus, string> = {
  connected: badgeStyles.success!,
  on: badgeStyles.success!,
  unreachable: badgeStyles.warning!,
  off: badgeStyles.info!,
  notSetUp: badgeStyles.info!,
};

const BACKUP_RUN_CLASS: Record<BackupRunOutcome, string> = {
  succeeded: badgeStyles.success!,
  failed: badgeStyles.error!,
};

const USER_ACCOUNT_STATUS_CLASS: Record<UserAccountStatus, string> = {
  active: badgeStyles.userActive!,
  locked: badgeStyles.warning!,
  deactivated: badgeStyles.userDeactivated!,
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

const GRANT_STATUS_CLASS: Record<SubsidyApplicationStatus, string> = {
  eligible: badgeStyles.grantEligible!,
  applied: badgeStyles.grantApplied!,
  approved: badgeStyles.grantApproved!,
  received: badgeStyles.grantReceived!,
  rejected: badgeStyles.grantRejected!,
};

const FUNDING_SOURCE_STATUS_CLASS: Record<BudgetSourceStatus, string> = {
  active: badgeStyles.fundingActive!,
  exhausted: badgeStyles.fundingExhausted!,
  closed: badgeStyles.fundingClosed!,
};

const DEFECT_STATUS_CLASS: Record<DiaryIssueResolution, string> = {
  open: badgeStyles.defectOpen!,
  in_progress: badgeStyles.defectInProgress!,
  resolved: badgeStyles.defectFixed!,
};

const DIARY_TYPE_CLASS: Record<DiaryEntryType, string> = {
  daily_log: badgeStyles.diaryDailyLog!,
  site_visit: badgeStyles.diarySiteVisit!,
  delivery: badgeStyles.diaryDelivery!,
  issue: badgeStyles.diaryIssue!,
  general_note: badgeStyles.diaryGeneralNote!,
  work_item_status: badgeStyles.diaryAutomatic!,
  invoice_status: badgeStyles.diaryAutomatic!,
  invoice_created: badgeStyles.diaryAutomatic!,
  milestone_delay: badgeStyles.diaryAutomatic!,
  budget_breach: badgeStyles.diaryAutomatic!,
  auto_reschedule: badgeStyles.diaryAutomatic!,
  subsidy_status: badgeStyles.diaryAutomatic!,
};

const DIARY_OUTCOME_CLASS: Record<DiaryInspectionOutcome, string> = {
  pass: badgeStyles.pass!,
  fail: badgeStyles.fail!,
  conditional: badgeStyles.conditional!,
};

const DIARY_SEVERITY_CLASS: Record<DiaryIssueSeverity, string> = {
  low: badgeStyles.low!,
  medium: badgeStyles.medium!,
  high: badgeStyles.high!,
  critical: badgeStyles.critical!,
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

export function buildIntegrationStatusVariants(
  t: StatusLabelT,
): Record<IntegrationStatus, BadgeVariant> {
  const set = I18N_UNION_KEYS.integrationStatus;
  const result = {} as Record<IntegrationStatus, BadgeVariant>;
  for (const status of INTEGRATION_STATUSES) {
    result[status] = {
      label: t(set.key(status), { ns: set.ns }),
      className: INTEGRATION_STATUS_CLASS[status],
    };
  }
  return result;
}

export function buildBackupRunVariants(t: StatusLabelT): Record<BackupRunOutcome, BadgeVariant> {
  const set = I18N_UNION_KEYS.backupRun;
  const result = {} as Record<BackupRunOutcome, BadgeVariant>;
  for (const outcome of BACKUP_RUN_OUTCOMES) {
    result[outcome] = {
      label: t(set.key(outcome), { ns: set.ns }),
      className: BACKUP_RUN_CLASS[outcome],
    };
  }
  return result;
}

export function buildUserAccountStatusVariants(
  t: StatusLabelT,
): Record<UserAccountStatus, BadgeVariant> {
  const set = I18N_UNION_KEYS.userAccountStatus;
  const result = {} as Record<UserAccountStatus, BadgeVariant>;
  for (const status of USER_ACCOUNT_STATUSES) {
    result[status] = {
      label: t(set.key(status), { ns: set.ns }),
      className: USER_ACCOUNT_STATUS_CLASS[status],
    };
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

export function buildGrantStatusVariants(
  t: StatusLabelT,
): Record<SubsidyApplicationStatus, BadgeVariant> {
  const set = I18N_UNION_KEYS.statusVocabularyGrant;
  const result = {} as Record<SubsidyApplicationStatus, BadgeVariant>;
  for (const status of SUBSIDY_APPLICATION_STATUSES) {
    result[status] = {
      label: t(set.key(status), { ns: set.ns }),
      className: GRANT_STATUS_CLASS[status],
    };
  }
  return result;
}

export function buildFundingSourceStatusVariants(
  t: StatusLabelT,
): Record<BudgetSourceStatus, BadgeVariant> {
  const set = I18N_UNION_KEYS.statusVocabularyFundingSource;
  const result = {} as Record<BudgetSourceStatus, BadgeVariant>;
  for (const status of BUDGET_SOURCE_STATUSES) {
    result[status] = {
      label: t(set.key(status), { ns: set.ns }),
      className: FUNDING_SOURCE_STATUS_CLASS[status],
    };
  }
  return result;
}

export function buildDefectStatusVariants(
  t: StatusLabelT,
): Record<DiaryIssueResolution, BadgeVariant> {
  const set = I18N_UNION_KEYS.statusVocabularyDefect;
  const result = {} as Record<DiaryIssueResolution, BadgeVariant>;
  for (const status of DIARY_ISSUE_RESOLUTIONS) {
    result[status] = {
      label: t(set.key(status), { ns: set.ns }),
      className: DEFECT_STATUS_CLASS[status],
    };
  }
  return result;
}

/** Diary entry type chips: manual types use the canonical words, automatic ones the diary words. */
export function buildDiaryTypeVariants(t: StatusLabelT): Record<DiaryEntryType, BadgeVariant> {
  const result = {} as Record<DiaryEntryType, BadgeVariant>;
  for (const type of DIARY_ENTRY_TYPES) {
    const { ns, key } = diaryEntryTypeLabelKey(type);
    result[type] = { label: t(key, { ns }), className: DIARY_TYPE_CLASS[type] };
  }
  return result;
}

/** Diary entry status chips: a draft is the only one shown on a row. */
export function buildDiaryStatusVariants(t: StatusLabelT): { draft: BadgeVariant } {
  return {
    draft: { label: t('draft.badgeLabel', { ns: 'diary' }), className: badgeStyles.draft! },
  };
}

export function buildDiaryOutcomeVariants(
  t: StatusLabelT,
): Record<DiaryInspectionOutcome, BadgeVariant> {
  const set = I18N_UNION_KEYS.diaryOutcome;
  const result = {} as Record<DiaryInspectionOutcome, BadgeVariant>;
  for (const outcome of DIARY_INSPECTION_OUTCOMES) {
    result[outcome] = {
      label: t(set.key(outcome), { ns: set.ns }),
      className: DIARY_OUTCOME_CLASS[outcome],
    };
  }
  return result;
}

export function buildDiarySeverityVariants(
  t: StatusLabelT,
): Record<DiaryIssueSeverity, BadgeVariant> {
  const set = I18N_UNION_KEYS.diarySeverity;
  const result = {} as Record<DiaryIssueSeverity, BadgeVariant>;
  for (const severity of DIARY_ISSUE_SEVERITIES) {
    result[severity] = {
      label: t(set.key(severity), { ns: set.ns }),
      className: DIARY_SEVERITY_CLASS[severity],
    };
  }
  return result;
}
