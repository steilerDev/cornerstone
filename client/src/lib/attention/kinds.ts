import type { AttentionRow } from '@cornerstone/shared';

/** The muted kind word before a row title; tasks and groups have none. */
export const ATTENTION_KIND_WORDS = [
  'milestone',
  'invoice',
  'offer',
  'progressPayment',
  'purchase',
  'grant',
  'defect',
  'fundingSource',
  'unfinishedLog',
] as const;
export type AttentionKindWord = (typeof ATTENTION_KIND_WORDS)[number];

/** Kind word of a row, from its rule and params (N1, N2 and H4 are tasks: null). */
export function attentionKindOf(row: AttentionRow): AttentionKindWord | null {
  const params = row.params;
  switch (params.rule) {
    case 'N1':
    case 'N2':
    case 'H4':
      return null;
    case 'N3':
      return 'milestone';
    case 'N4':
    case 'N5':
    case 'N6':
      return params.recordKind === 'offer'
        ? 'offer'
        : params.paymentKind === 'progress'
          ? 'progressPayment'
          : 'invoice';
    case 'H2':
      return params.recordKind === 'offer' ? 'offer' : 'invoice';
    case 'N8':
      return 'fundingSource';
    case 'N9':
      return 'offer';
    case 'N10':
      return 'purchase';
    case 'N11':
      return 'grant';
    case 'N12':
      return 'defect';
    case 'H1':
      return 'unfinishedLog';
  }
}
