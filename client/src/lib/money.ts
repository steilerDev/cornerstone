/** Rounds a major-unit money value to 2 decimals (cents precision). */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Amount allocated beyond what is available, never negative, rounded to cents. */
export function overAllocatedAmount(allocated: number, amount: number): number {
  return roundMoney(Math.max(0, allocated - amount));
}
