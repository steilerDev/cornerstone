import { routeUrl } from '@cornerstone/shared';
import type { DocumentLinkEntityType, DocumentLinkWithEntity } from '@cornerstone/shared';
import type { InvoiceTitleNouns } from '../../lib/invoiceTitle.js';
import { invoiceDisplayTitle } from '../../lib/invoiceTitle.js';
import type { RelatedListRow } from '../../components/RelatedList/types.js';

export interface LinkedToRowLabels {
  /** The translated kind word of the link ("Task", "Grant"). */
  readonly kindWord: string;
  /** Title of a link whose record no longer exists. */
  readonly unavailableLabel: string;
  readonly invoiceNouns: InvoiceTitleNouns;
}

const ENTITY_URL: Record<DocumentLinkEntityType, (id: string) => string> = {
  work_item: (id) => routeUrl('workItem', { id }),
  household_item: (id) => routeUrl('householdItem', { id }),
  invoice: (id) => routeUrl('invoice', { id }),
  budget_source: (id) => routeUrl('fundingSource', { id }),
  subsidy_program: (id) => routeUrl('grant', { id }),
};

/**
 * One "Linked to" row of the Documents page: the record's title as a link (plain text with the
 * "no longer available" label when the record is gone, still removable) and its kind word.
 */
export function toLinkedToRow(
  link: DocumentLinkWithEntity,
  labels: LinkedToRowLabels,
): RelatedListRow {
  const { entity } = link;
  if (entity === null) {
    return { id: link.id, title: labels.unavailableLabel, facts: labels.kindWord };
  }
  const title =
    link.entityType === 'invoice'
      ? invoiceDisplayTitle(
          {
            vendorName: entity.vendorName,
            invoiceNumber: entity.title,
            // The server sends the status for every invoice link; a missing one reads as an invoice.
            status: entity.invoiceStatus ?? 'pending',
          },
          labels.invoiceNouns,
        )
      : (entity.title ?? labels.unavailableLabel);
  return {
    id: link.id,
    title,
    to: ENTITY_URL[link.entityType](link.entityId),
    facts: labels.kindWord,
  };
}
