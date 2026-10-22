/**
 * Deep links of attention rows (#2229): a served route id of the shared route map plus its
 * params and query. The client builds the URL with `routeUrl`; the server never sends a path.
 *
 * Interim: the `grant` and `fundingSource` routes are `planned` in the route map, so N11 and S1
 * link to `budgetSubsidies` / `budgetSources`. The story that serves those routes switches the
 * N11 and S1 cases here (and nowhere else).
 */

import type { AttentionLink, AttentionRule, AttentionStandingRule } from '@cornerstone/shared';

export interface AttentionLinkInput {
  rule: AttentionRule | AttentionStandingRule;
  /** Subject id (a group's subject id is its planned start date). */
  subjectId: string;
  /** N2 grouped row. */
  isGroup?: boolean;
  /** N4-N6 progress payments: the invoice the payment belongs to. */
  invoiceId?: string;
  /** N4-N6 progress payments. */
  depositId?: string;
}

function link(
  route: AttentionLink['route'],
  params: Record<string, string> = {},
  query: Record<string, string> = {},
): AttentionLink {
  return { route, params, query };
}

export function attentionLinkOf(input: AttentionLinkInput): AttentionLink {
  const { rule, subjectId } = input;
  switch (rule) {
    case 'N1':
    case 'H4':
      return link('workItem', { id: subjectId });
    case 'N2':
      return input.isGroup ? link('workItems') : link('workItem', { id: subjectId });
    case 'N3':
      return link('milestone', { id: subjectId });
    case 'N4':
    case 'N5':
    case 'N6':
      return input.depositId !== undefined
        ? link('invoice', { id: input.invoiceId ?? subjectId }, { payment: input.depositId })
        : link('invoice', { id: input.invoiceId ?? subjectId });
    case 'N8':
      return link('bankReport', {}, { sourceId: subjectId });
    case 'N9':
    case 'H2':
      return link('invoice', { id: subjectId });
    case 'N10':
      return link('householdItem', { id: subjectId });
    case 'N11':
      return link('budgetSubsidies');
    case 'N12':
      return link('diaryEntry', { id: subjectId });
    case 'H1':
      return link('diaryEntryEdit', { id: subjectId });
    case 'S1':
      return link('budgetSources');
    default: {
      const unreachable: never = rule;
      throw new Error(`Unknown attention rule ${String(unreachable)}`);
    }
  }
}
