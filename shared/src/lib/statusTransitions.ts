/**
 * Status transition maps, one per status vocabulary (EPIC-21 story 1.3).
 *
 * Forward = every later status; backward = one step back. Forward entries come first.
 * The client StatusMenu and the server transition checks both derive from these maps.
 */

import type { WorkItemStatus } from '../types/workItem.js';
import type { HouseholdItemStatus } from '../types/householdItem.js';
import type { InvoiceStatus, InvoiceDepositStatus } from '../types/invoice.js';

export const TASK_STATUS_ACTIONS = ['start', 'markDone'] as const;
export type TaskStatusAction = (typeof TASK_STATUS_ACTIONS)[number];

export const PURCHASE_STATUS_ACTIONS = [
  'markOrdered',
  'markDeliveryScheduled',
  'markDelivered',
] as const;
export type PurchaseStatusAction = (typeof PURCHASE_STATUS_ACTIONS)[number];

export const MILESTONE_COMPLETION_STATES = ['not_reached', 'reached'] as const;
export type MilestoneCompletionState = (typeof MILESTONE_COMPLETION_STATES)[number];

export const MILESTONE_STATUS_ACTIONS = ['markReached'] as const;
export type MilestoneStatusAction = (typeof MILESTONE_STATUS_ACTIONS)[number];

export const INVOICE_STATUS_ACTIONS = ['markPaid'] as const;
export type InvoiceStatusAction = (typeof INVOICE_STATUS_ACTIONS)[number];

export const PROGRESS_PAYMENT_STATUS_ACTIONS = ['markPaid', 'markSubmitted'] as const;
export type ProgressPaymentStatusAction = (typeof PROGRESS_PAYMENT_STATUS_ACTIONS)[number];

export type StatusTransition<S extends string, A extends string> =
  | { readonly to: S; readonly direction: 'forward'; readonly action: A }
  | { readonly to: S; readonly direction: 'backward' };

export type StatusTransitionMap<S extends string, A extends string> = Readonly<
  Record<S, readonly StatusTransition<S, A>[]>
>;

const fwd = <S extends string, A extends string>(to: S, action: A): StatusTransition<S, A> => ({
  to,
  direction: 'forward',
  action,
});
const back = <S extends string, A extends string>(to: S): StatusTransition<S, A> => ({
  to,
  direction: 'backward',
});

export const TASK_TRANSITIONS: StatusTransitionMap<WorkItemStatus, TaskStatusAction> = {
  not_started: [fwd('in_progress', 'start'), fwd('completed', 'markDone')],
  in_progress: [fwd('completed', 'markDone'), back('not_started')],
  completed: [back('in_progress')],
};

export const PURCHASE_TRANSITIONS: StatusTransitionMap<HouseholdItemStatus, PurchaseStatusAction> =
  {
    planned: [
      fwd('purchased', 'markOrdered'),
      fwd('scheduled', 'markDeliveryScheduled'),
      fwd('arrived', 'markDelivered'),
    ],
    purchased: [
      fwd('scheduled', 'markDeliveryScheduled'),
      fwd('arrived', 'markDelivered'),
      back('planned'),
    ],
    scheduled: [fwd('arrived', 'markDelivered'), back('purchased')],
    arrived: [back('scheduled')],
  };

export const MILESTONE_TRANSITIONS: StatusTransitionMap<
  MilestoneCompletionState,
  MilestoneStatusAction
> = {
  not_reached: [fwd('reached', 'markReached')],
  reached: [back('not_reached')],
};

export const INVOICE_TRANSITIONS: StatusTransitionMap<InvoiceStatus, InvoiceStatusAction> = {
  pending: [fwd('paid', 'markPaid')],
  paid: [back('pending')],
  claimed: [],
  quotation: [],
};

export const PROGRESS_PAYMENT_TRANSITIONS: StatusTransitionMap<
  InvoiceDepositStatus,
  ProgressPaymentStatusAction
> = {
  pending: [fwd('paid', 'markPaid'), fwd('claimed', 'markSubmitted')],
  paid: [fwd('claimed', 'markSubmitted'), back('pending')],
  claimed: [back('paid')],
};

/** Transitions available from `from`, in map order (empty for an unknown status). */
export function transitionsFrom<S extends string, A extends string>(
  map: StatusTransitionMap<S, A>,
  from: S,
): readonly StatusTransition<S, A>[] {
  return map[from] ?? [];
}

/** Target statuses reachable from `from`, in map order. */
export function allowedTargets<S extends string, A extends string>(
  map: StatusTransitionMap<S, A>,
  from: S,
): S[] {
  return transitionsFrom(map, from).map((t) => t.to);
}
