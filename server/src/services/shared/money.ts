/**
 * Money comparison utilities.
 *
 * All monetary amounts in this application are stored as SQLite REAL values
 * (IEEE-754 doubles) and are always expressed with at most 2 decimal places
 * (whole cents) — no amount in this domain carries sub-cent precision.
 *
 * Summing several REAL amounts can introduce floating-point noise, e.g.:
 *   332.85 + 333.04 + 334.11 === 1000.0000000000001
 *
 * A bare `sum > total` comparison then wrongly rejects an exact, valid sum.
 * Rounding both sides to whole cents before comparing eliminates that noise
 * without weakening precision, since nothing in this domain is more precise
 * than a cent. See ADR/issue #1806 for the failure this fixes.
 */

/** Round a monetary amount to the nearest whole cent (returned as an integer number of cents). */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Returns true only if `sum` exceeds `total` by at least one whole cent,
 * ignoring floating-point summation noise below that threshold.
 *
 * Use this instead of a bare `sum > total` for any guard that rejects a
 * running total (itemized amounts, deposits, etc.) that would exceed a cap
 * (e.g. an invoice's total amount).
 */
export function exceedsAmount(sum: number, total: number): boolean {
  return toCents(sum) > toCents(total);
}
