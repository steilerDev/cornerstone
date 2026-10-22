/**
 * Home types (#2230, EPIC-21 contract 24): the three read-only `/api/home/*` aggregates.
 */

import type { AttentionLink, AttentionSubject } from './attention.js';
import type { LeftToSpend } from './money.js';

/** Days the week endpoint covers: today .. today + 20 (This week = first 7, "Next 14 days" = rest). */
export const HOME_AGENDA_DAYS = 21;
export const HOME_WEEK_DAYS = 7;

export const HOME_AGENDA_KINDS = ['starts', 'ends', 'payment', 'delivery', 'milestone'] as const;
export type HomeAgendaKind = (typeof HOME_AGENDA_KINDS)[number];

export interface HomeAgendaSchedule {
  isLate: boolean;
  lateDays: number | null;
  isHeldUp: boolean;
  isCritical: boolean;
}

export interface HomeAgendaItem {
  /** `${kind}:${subject.type}:${subject.id}` - unique within a response. */
  key: string;
  kind: HomeAgendaKind;
  /** YYYY-MM-DD within [from, to]. */
  date: string;
  /**
   * Same subject types/ids as attention rows (payments: `invoice` id for the final payment,
   * `progress_payment` deposit id for a progress payment) so the client can drop repeats.
   */
  subject: AttentionSubject;
  link: AttentionLink;
  companyName: string | null;
  /** payment only (major units, cents) */
  amount: number | null;
  /** payment only */
  recordKind: 'invoice' | 'offer' | null;
  /** starts / ends only */
  schedule: HomeAgendaSchedule | null;
  /** starts / ends of a held-up task: the predecessor that holds it up; else null */
  heldUpBy: { id: string; label: string } | null;
}

export interface HomeWeekResponse {
  today: string;
  /** = today */
  from: string;
  /** = today + 20 */
  to: string;
  items: HomeAgendaItem[];
}

export interface HomeProgress {
  total: number;
  done: number;
  inProgress: number;
}

export interface HomePulseResponse {
  /** Verbatim MoneySummary.leftToSpend */
  leftToSpend: LeftToSpend;
  /** Verbatim MoneySummary.stillToPay */
  stillToPay: number;
  /** Verbatim MoneySummary.stillToPayCount */
  stillToPayCount: number;
  progress: HomeProgress;
}

export const HOME_SETUP_STEPS = [
  'house',
  'areas',
  'funding',
  'companies',
  'tasks',
  'household',
  'backups',
  'firstLog',
] as const;
export type HomeSetupStep = (typeof HOME_SETUP_STEPS)[number];
export const HOME_SETUP_CORE_STEPS = ['house', 'areas', 'funding', 'companies', 'tasks'] as const;
export const HOME_SETUP_ADMIN_STEPS = ['household', 'backups'] as const;

export interface HomeSetupStepState {
  id: HomeSetupStep;
  /** null = could not be checked */
  done: boolean | null;
}

export interface HomeSetupResponse {
  /** Steps 1-5 all done. */
  coreComplete: boolean;
  /** In HOME_SETUP_STEPS order; admin steps absent for members. */
  steps: HomeSetupStepState[];
}
