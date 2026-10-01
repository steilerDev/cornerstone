import type { DiaryEntryStatus } from '../types/diary.js';

/** True when `metadata` is an object whose `signatures` is a non-empty array. */
export function hasDiarySignatures(metadata: unknown): boolean {
  if (typeof metadata !== 'object' || metadata === null) return false;
  const sigs = (metadata as { signatures?: unknown }).signatures;
  return Array.isArray(sigs) && sigs.length > 0;
}

/**
 * Signature immutability rule (#2124): signatures lock an entry only once it is saved.
 * Drafts stay fully editable (fields, signatures, photos) until promoted.
 * A null/undefined status is a legacy row and counts as saved.
 */
export function isDiaryEntrySignatureLocked(entry: {
  isSigned: boolean;
  status?: DiaryEntryStatus | null;
}): boolean {
  return entry.isSigned && entry.status !== 'draft';
}
