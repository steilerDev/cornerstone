import type { HouseholdItemSummary } from '@cornerstone/shared';
import { purchaseDeliveryOf } from '../../lib/scheduleDates.js';

type DeliveryFields = Pick<
  HouseholdItemSummary,
  | 'status'
  | 'actualDeliveryDate'
  | 'targetDeliveryDate'
  | 'earliestDeliveryDate'
  | 'latestDeliveryDate'
>;

/** What the strip's Delivery fact shows; the caller words it. */
export type DeliveryShown =
  | { kind: 'delivered' | 'target' | 'single'; date: string }
  | { kind: 'window'; start: string; end: string }
  | null;

/** Delivered, else target, else the window, else whichever bound is set; null with none. */
export function purchaseDeliveryShown(p: DeliveryFields): DeliveryShown {
  const delivery = purchaseDeliveryOf(p);
  if (delivery !== null) {
    return { kind: delivery.delivered ? 'delivered' : 'target', date: delivery.date };
  }
  const { earliestDeliveryDate: earliest, latestDeliveryDate: latest } = p;
  if (earliest !== null && latest !== null) return { kind: 'window', start: earliest, end: latest };
  const single = latest ?? earliest;
  return single === null ? null : { kind: 'single', date: single };
}

/** Whether the Late badge shows: late and not yet delivered. */
export function purchaseIsLateShown(p: Pick<HouseholdItemSummary, 'isLate' | 'status'>): boolean {
  return p.isLate && p.status !== 'arrived';
}

/** Why a purchase is late; the caller words it. */
export type LateExplanation =
  { kind: 'latest' | 'target'; date: string } | { kind: 'generic' } | null;

/**
 * The reason behind the Late badge: the passed latest (else target) delivery date, or a generic
 * line when that date has not passed (a predecessor pushed the delivery). Null when not late.
 */
export function purchaseLateExplanation(
  p: DeliveryFields & Pick<HouseholdItemSummary, 'isLate'>,
  today: string,
): LateExplanation {
  if (!purchaseIsLateShown(p)) return null;
  const missed = p.latestDeliveryDate ?? p.targetDeliveryDate;
  if (missed !== null && missed < today) {
    return { kind: p.latestDeliveryDate !== null ? 'latest' : 'target', date: missed };
  }
  return { kind: 'generic' };
}

/** The dates the purchase's Site diary covers; null unless both ends are set and ordered. */
export function purchaseDiaryWindow(
  p: Pick<
    HouseholdItemSummary,
    | 'orderDate'
    | 'earliestDeliveryDate'
    | 'actualDeliveryDate'
    | 'latestDeliveryDate'
    | 'targetDeliveryDate'
  >,
): { dateFrom: string; dateTo: string } | null {
  const dateFrom = p.orderDate ?? p.earliestDeliveryDate;
  const dateTo = p.actualDeliveryDate ?? p.latestDeliveryDate ?? p.targetDeliveryDate;
  return dateFrom !== null && dateTo !== null && dateFrom <= dateTo ? { dateFrom, dateTo } : null;
}
