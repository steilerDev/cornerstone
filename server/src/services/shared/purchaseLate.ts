/**
 * Purchase Late, defined once (glossary: "past its planned date"; planned = the delivery date
 * the user entered). The scheduler's stored `household_items.is_late`, the Purchases page badge,
 * the timeline and the attention service (N10) all use this predicate.
 */

export interface PurchaseLateFields {
  status: string;
  actualDeliveryDate: string | null;
  earliestDeliveryDate: string | null;
  latestDeliveryDate: string | null;
}

/** The planned delivery date: the latest of the window, else the earliest; null when neither. */
export function purchasePlannedDate(
  p: Pick<PurchaseLateFields, 'earliestDeliveryDate' | 'latestDeliveryDate'>,
): string | null {
  return p.latestDeliveryDate ?? p.earliestDeliveryDate;
}

/**
 * The date a not-yet-delivered purchase is shown on (attention N10 row, Home agenda delivery):
 * latest ?? earliest ?? target; null when none is set.
 */
export function purchaseDeliveryDate(
  p: Pick<PurchaseLateFields, 'earliestDeliveryDate' | 'latestDeliveryDate'> & {
    targetDeliveryDate: string | null;
  },
): string | null {
  return purchasePlannedDate(p) ?? p.targetDeliveryDate;
}

/** Not delivered and its planned delivery date is before `today`. */
export function isPurchaseLate(p: PurchaseLateFields, today: string): boolean {
  if (p.status === 'arrived' || p.actualDeliveryDate !== null) return false;
  const due = purchasePlannedDate(p);
  return due !== null && due < today;
}
