import type { TFunction } from 'i18next';
import type { AttentionRow } from '@cornerstone/shared';
import { attentionKindOf } from './kinds.js';
import type { AttentionKindWord } from './kinds.js';

/** Everything the row sentence needs from the host, so this module stays pure. */
export interface AttentionTextContext {
  /** `common`-bound t(). */
  t: TFunction;
  /** The server's date for this computation (`YYYY-MM-DD`); unused by wording today, kept for hosts. */
  today: string;
  formatDayMonth: (date: string | null | undefined) => string;
  formatCurrency: (amount: number) => string;
  /** Purchase status word (Planned, Ordered, ...). */
  purchaseStatusLabel: (status: string) => string;
  /** Diary entry type word (Daily log, Site visit, ...). */
  diaryTypeLabel: (type: string) => string;
  /** Defect severity word (Low, Medium, High, Critical). */
  severityLabel: (severity: string) => string;
}

export interface AttentionRowText {
  kind: AttentionKindWord | null;
  /** One sentence of facts: never who should act. */
  sentence: string;
  /** "Holds up 3 tasks · 1 starts within 2 weeks", or null. */
  holdsUp: string | null;
  /** N12 only: "Severity: High", or null. */
  severityLine: string | null;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled attention params: ${JSON.stringify(value)}`);
}

/** The holds-up line of a row or a group item (null without anything held up). */
export function holdsUpLine(
  holdsUp: { count: number; startingWithin14Days: number } | null | undefined,
  t: TFunction,
): string | null {
  if (!holdsUp || holdsUp.count <= 0) return null;
  const soon =
    holdsUp.startingWithin14Days > 0
      ? t('attention.holdsUp.soon', { count: holdsUp.startingWithin14Days })
      : t('attention.holdsUp.soonNone');
  return `${t('attention.holdsUp.tasks', { count: holdsUp.count })} · ${soon}`;
}

/** Wording of one attention row: one exhaustive switch over the rule, literal keys only. */
export function attentionRowText(row: AttentionRow, ctx: AttentionTextContext): AttentionRowText {
  const { t, formatDayMonth, formatCurrency } = ctx;
  const when = (days: number | null): string => {
    if (days === null) return '';
    if (days === 0) return t('attention.when.today');
    return days > 0
      ? t('attention.when.inDays', { count: days })
      : t('attention.when.daysAgo', { count: Math.abs(days) });
  };
  const params = row.params;
  let sentence: string;
  let severityLine: string | null = null;

  switch (params.rule) {
    case 'N1':
      sentence = params.plannedEndDate
        ? t('attention.sentence.n1', {
            count: params.daysLate,
            date: formatDayMonth(params.plannedEndDate),
          })
        : t('attention.sentence.n1NoDate', { count: params.daysLate });
      break;
    case 'N2':
      if (params.kind === 'group') {
        sentence = t('attention.sentence.n2Group', {
          date: formatDayMonth(params.plannedStartDate),
        });
      } else {
        sentence = params.plannedStartDate
          ? t('attention.sentence.n2Task', {
              count: params.daysLate,
              date: formatDayMonth(params.plannedStartDate),
            })
          : t('attention.sentence.n2TaskNoDate', { count: params.daysLate });
      }
      break;
    case 'N3': {
      const target = formatDayMonth(params.targetDate);
      const projected = formatDayMonth(params.projectedDate);
      if (params.daysSinceTarget !== null) {
        if (params.projectedDate) {
          sentence =
            params.daysAfterTarget !== null && params.daysAfterTarget > 0
              ? t('attention.sentence.n3PassedProjected', {
                  target,
                  projected,
                  count: params.daysAfterTarget,
                })
              : t('attention.sentence.n3PassedProjectedNoDays', { target, projected });
        } else {
          sentence = t('attention.sentence.n3Passed', { target });
        }
      } else if (params.projectedDate && params.daysAfterTarget !== null) {
        sentence = t('attention.sentence.n3Projected', {
          projected,
          target,
          count: params.daysAfterTarget,
        });
      } else {
        sentence = t('attention.sentence.n3Passed', { target });
      }
      break;
    }
    case 'N4':
      sentence = params.dueDate
        ? t('attention.sentence.n4', {
            date: formatDayMonth(params.dueDate),
            when: when(params.dueInDays),
          })
        : t('attention.sentence.n6', {
            date: formatDayMonth(params.invoiceDate),
            count: params.daysOpen,
          });
      break;
    case 'N5':
      sentence = params.dueDate
        ? t('attention.sentence.n5', {
            date: formatDayMonth(params.dueDate),
            when: when(params.dueInDays),
          })
        : t('attention.sentence.n6', {
            date: formatDayMonth(params.invoiceDate),
            count: params.daysOpen,
          });
      break;
    case 'N6':
      sentence = t('attention.sentence.n6', {
        date: formatDayMonth(params.invoiceDate),
        count: params.daysOpen,
      });
      break;
    case 'N8':
      sentence = t('attention.sentence.n8', { count: params.count });
      break;
    case 'N9':
      sentence =
        params.dueInDays < 0
          ? t('attention.sentence.n9Passed', {
              date: formatDayMonth(params.dueDate),
              when: when(params.dueInDays),
            })
          : t('attention.sentence.n9', {
              date: formatDayMonth(params.dueDate),
              when: when(params.dueInDays),
            });
      break;
    case 'N10': {
      const status = ctx.purchaseStatusLabel(params.status);
      const date = formatDayMonth(row.date ?? params.targetDeliveryDate);
      sentence = params.isLate
        ? t('attention.sentence.n10Late', { status, count: Math.abs(params.dueInDays), date })
        : t('attention.sentence.n10Due', { status, date, when: when(params.dueInDays) });
      break;
    }
    case 'N11':
      sentence =
        params.status === 'applied'
          ? t('attention.sentence.n11Applied', {
              date: formatDayMonth(params.deadline),
              when: when(params.dueInDays),
            })
          : t('attention.sentence.n11Eligible', {
              date: formatDayMonth(params.deadline),
              when: when(params.dueInDays),
            });
      break;
    case 'N12':
      sentence =
        params.resolutionStatus === 'in_progress'
          ? t('attention.sentence.n12InProgress', { date: formatDayMonth(params.entryDate) })
          : t('attention.sentence.n12Open', { date: formatDayMonth(params.entryDate) });
      if (params.severity !== null) {
        severityLine = t('attention.sentence.n12Severity', {
          severity: ctx.severityLabel(params.severity),
        });
      }
      break;
    case 'H1':
      sentence = t('attention.sentence.h1', {
        type: ctx.diaryTypeLabel(params.entryType),
        date: formatDayMonth(params.entryDate),
      });
      break;
    case 'H2':
      sentence =
        row.amount !== null
          ? t('attention.sentence.h2', {
              unsplit: formatCurrency(row.amount),
              total: formatCurrency(params.invoiceAmount),
            })
          : t('attention.sentence.h2NoAmount');
      break;
    case 'H4':
      sentence = t('attention.sentence.h4', { date: formatDayMonth(params.actualEndDate) });
      break;
    default:
      return assertNever(params);
  }

  return {
    kind: attentionKindOf(row),
    sentence,
    holdsUp: holdsUpLine(row.holdsUp, t),
    severityLine,
  };
}
