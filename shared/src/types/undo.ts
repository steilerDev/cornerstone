/**
 * Undo snapshot types (EPIC-21 story 1.3, contract 11).
 *
 * A status PATCH may return an additive `undo` token; `POST /api/undo/:token` restores the
 * snapshot. Tokens are bound to the issuing user, single use, and valid for UNDO_WINDOW_MS.
 */

/** How long an undo token stays valid, in milliseconds. */
export const UNDO_WINDOW_MS = 30_000;

/** Entity types a snapshot can be taken of. */
export const UNDO_SUBJECT_TYPES = [
  'work_item',
  'household_item',
  'milestone',
  'invoice',
  'invoice_deposit',
  'subsidy_program',
  'diary_entry',
] as const;

export type UndoSubjectType = (typeof UNDO_SUBJECT_TYPES)[number];

/** Token issued by a status PATCH. */
export interface UndoToken {
  token: string;
  /** ISO timestamp after which the token is rejected. */
  expiresAt: string;
}

/** A restored (or conflicting) row. Milestone ids are rendered as strings. */
export interface UndoRow {
  type: UndoSubjectType;
  id: string;
}

/** Response of `POST /api/undo/:token`. */
export interface UndoResponse {
  restored: UndoRow[];
  retractedEventIds: string[];
}

/** Additive mixin for PATCH responses; absent (never null) when no token was issued. */
export interface WithUndo {
  undo?: UndoToken;
}
