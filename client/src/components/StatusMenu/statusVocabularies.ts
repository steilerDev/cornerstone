import {
  DEFECT_TRANSITIONS,
  FUNDING_SOURCE_TRANSITIONS,
  GRANT_TRANSITIONS,
  INVOICE_TRANSITIONS,
  MILESTONE_TRANSITIONS,
  PROGRESS_PAYMENT_TRANSITIONS,
  PURCHASE_TRANSITIONS,
  TASK_TRANSITIONS,
  transitionsFrom,
} from '@cornerstone/shared';
import type {
  BudgetSourceStatus,
  DiaryIssueResolution,
  HouseholdItemStatus,
  InvoiceDepositStatus,
  InvoiceStatus,
  MilestoneCompletionState,
  StatusTransition,
  StatusTransitionMap,
  SubsidyApplicationStatus,
  WorkItemStatus,
} from '@cornerstone/shared';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import type { UnionKeySet } from '../../i18n/unionKeys.js';
import type { StatusMenuDateConfig, StatusMenuTransition } from './StatusMenu.js';

/** Minimal t() shape: works with useTranslation().t and i18n.getFixedT(). */
export type StatusMenuT = (key: string, options: { ns: string; status?: string }) => string;

interface VocabularyConfig<S extends string, A extends string> {
  readonly map: StatusTransitionMap<S, A>;
  readonly actionKeys: UnionKeySet<A>;
  /** Canonical status label key set used by the "Back to …" rows. */
  readonly backLabel: (to: S) => string;
  /** Date step per forward action (absent = applies at once, no date step). */
  readonly dateFor?: (action: A) => StatusMenuDateConfig | undefined;
}

function build<S extends string, A extends string>(
  t: StatusMenuT,
  from: S,
  config: VocabularyConfig<S, A>,
): StatusMenuTransition<S>[] {
  return transitionsFrom(config.map, from).map((transition: StatusTransition<S, A>) => {
    if (transition.direction === 'forward') {
      const date = config.dateFor?.(transition.action);
      return {
        to: transition.to,
        direction: 'forward' as const,
        label: t(config.actionKeys.key(transition.action), { ns: 'common' }),
        ...(date ? { date } : {}),
      };
    }
    return {
      to: transition.to,
      direction: 'backward' as const,
      label: t('statusMenu.backTo', {
        ns: 'common',
        status: t(config.backLabel(transition.to), { ns: 'common' }),
      }),
    };
  });
}

export interface TaskTransitionSource {
  readonly status: WorkItemStatus;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly actualStartDate: string | null;
}

export function taskTransitions(
  t: StatusMenuT,
  item: TaskTransitionSource,
): StatusMenuTransition<WorkItemStatus>[] {
  return build(t, item.status, {
    map: TASK_TRANSITIONS,
    actionKeys: I18N_UNION_KEYS.statusActionTask,
    backLabel: (to) => I18N_UNION_KEYS.statusVocabularyTask.key(to),
    dateFor: (action) =>
      action === 'start'
        ? { question: t('statusMenu.whenStarted', { ns: 'common' }), plannedDate: item.startDate }
        : {
            question: t('statusMenu.whenFinished', { ns: 'common' }),
            plannedDate: item.endDate,
            minDate: item.actualStartDate,
          },
  });
}

export interface PurchaseTransitionSource {
  readonly status: HouseholdItemStatus;
  readonly targetDeliveryDate: string | null;
}

export function purchaseTransitions(
  t: StatusMenuT,
  item: PurchaseTransitionSource,
): StatusMenuTransition<HouseholdItemStatus>[] {
  return build(t, item.status, {
    map: PURCHASE_TRANSITIONS,
    actionKeys: I18N_UNION_KEYS.statusActionPurchase,
    backLabel: (to) => I18N_UNION_KEYS.statusVocabularyPurchase.key(to),
    dateFor: (action) =>
      action === 'markDelivered'
        ? {
            question: t('statusMenu.whenArrived', { ns: 'common' }),
            plannedDate: item.targetDeliveryDate,
          }
        : undefined,
  });
}

export interface MilestoneTransitionSource {
  readonly isCompleted: boolean;
  readonly targetDate: string | null;
}

/** Completion state a milestone record maps to (the map's vocabulary). */
export function milestoneCompletionState(m: {
  readonly isCompleted: boolean;
}): MilestoneCompletionState {
  return m.isCompleted ? 'reached' : 'not_reached';
}

export function milestoneTransitions(
  t: StatusMenuT,
  m: MilestoneTransitionSource,
): StatusMenuTransition<MilestoneCompletionState>[] {
  return build(t, milestoneCompletionState(m), {
    map: MILESTONE_TRANSITIONS,
    actionKeys: I18N_UNION_KEYS.statusActionMilestone,
    // Going back from "reached" lands on the canonical "Upcoming" label.
    backLabel: () => I18N_UNION_KEYS.statusVocabularyMilestone.key('upcoming'),
    dateFor: () => ({
      question: t('statusMenu.whenReached', { ns: 'common' }),
      plannedDate: m.targetDate,
      plannedLabel: t('statusMenu.onTarget', { ns: 'common' }),
    }),
  });
}

export function invoiceTransitions(
  t: StatusMenuT,
  inv: { readonly status: InvoiceStatus },
): StatusMenuTransition<InvoiceStatus>[] {
  return build(t, inv.status, {
    map: INVOICE_TRANSITIONS,
    actionKeys: I18N_UNION_KEYS.statusActionInvoice,
    backLabel: (to) => I18N_UNION_KEYS.statusVocabularyInvoice.key(to),
  });
}

export function progressPaymentTransitions(
  t: StatusMenuT,
  d: { readonly status: InvoiceDepositStatus },
): StatusMenuTransition<InvoiceDepositStatus>[] {
  return build(t, d.status, {
    map: PROGRESS_PAYMENT_TRANSITIONS,
    actionKeys: I18N_UNION_KEYS.statusActionProgressPayment,
    backLabel: (to) => I18N_UNION_KEYS.statusVocabularyProgressPayment.key(to),
    dateFor: (action) => ({
      question:
        action === 'markPaid'
          ? t('statusMenu.whenPaid', { ns: 'common' })
          : t('statusMenu.whenSubmitted', { ns: 'common' }),
      // Progress payments offer Today · Pick only; no planned chip.
      plannedDate: null,
    }),
  });
}

export function grantTransitions(
  t: StatusMenuT,
  g: { readonly applicationStatus: SubsidyApplicationStatus },
): StatusMenuTransition<SubsidyApplicationStatus>[] {
  return build(t, g.applicationStatus, {
    map: GRANT_TRANSITIONS,
    actionKeys: I18N_UNION_KEYS.statusActionGrant,
    backLabel: (to) => I18N_UNION_KEYS.statusVocabularyGrant.key(to),
  });
}

export function fundingSourceTransitions(
  t: StatusMenuT,
  s: { readonly status: BudgetSourceStatus },
): StatusMenuTransition<BudgetSourceStatus>[] {
  return build(t, s.status, {
    map: FUNDING_SOURCE_TRANSITIONS,
    actionKeys: I18N_UNION_KEYS.statusActionFundingSource,
    backLabel: (to) => I18N_UNION_KEYS.statusVocabularyFundingSource.key(to),
  });
}

/** A signed or automatic defect cannot change: `locked` yields no transitions (a plain Badge). */
export function defectTransitions(
  t: StatusMenuT,
  d: { readonly resolutionStatus: DiaryIssueResolution; readonly locked: boolean },
): StatusMenuTransition<DiaryIssueResolution>[] {
  if (d.locked) return [];
  return build(t, d.resolutionStatus, {
    map: DEFECT_TRANSITIONS,
    actionKeys: I18N_UNION_KEYS.statusActionDefect,
    backLabel: (to) => I18N_UNION_KEYS.statusVocabularyDefect.key(to),
  });
}
