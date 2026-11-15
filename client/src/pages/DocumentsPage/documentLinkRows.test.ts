import { describe, it, expect } from '@jest/globals';
import { DOCUMENT_LINK_ENTITY_TYPES, routeUrl } from '@cornerstone/shared';
import type { DocumentLinkEntityType } from '@cornerstone/shared';
import { toLinkedToRow } from './documentLinkRows.js';
import type { LinkedToRowLabels } from './documentLinkRows.js';
import { makeLinkWithEntity, plainEntity } from '../../test/documentsPageFixtures.js';

const LABELS: LinkedToRowLabels = {
  kindWord: 'Kind word',
  unavailableLabel: 'Record no longer exists',
  invoiceNouns: { invoice: 'Invoice', offer: 'Offer' },
};

describe('toLinkedToRow', () => {
  const EXPECTED_URL: Record<DocumentLinkEntityType, (id: string) => string> = {
    work_item: (id) => routeUrl('workItem', { id }),
    household_item: (id) => routeUrl('householdItem', { id }),
    invoice: (id) => routeUrl('invoice', { id }),
    budget_source: (id) => routeUrl('fundingSource', { id }),
    subsidy_program: (id) => routeUrl('grant', { id }),
  };

  it.each(DOCUMENT_LINK_ENTITY_TYPES)('links a %s row to the page of its record', (type) => {
    const row = toLinkedToRow(
      makeLinkWithEntity('l1', type, 'rec-9', plainEntity('Title')),
      LABELS,
    );

    expect(row.to).toBe(EXPECTED_URL[type]('rec-9'));
    expect(row.id).toBe('l1');
    expect(row.facts).toBe('Kind word');
  });

  it('maps every kind to a distinct page', () => {
    const urls = DOCUMENT_LINK_ENTITY_TYPES.map(
      (type) => toLinkedToRow(makeLinkWithEntity('l', type, 'x', plainEntity('T')), LABELS).to,
    );
    expect(new Set(urls).size).toBe(DOCUMENT_LINK_ENTITY_TYPES.length);
    expect(urls).toEqual([
      '/project/work-items/x',
      '/project/household-items/x',
      '/budget/invoices/x',
      '/budget/financing/sources/x',
      '/budget/financing/grants/x',
    ]);
  });

  it('titles a non-invoice row with the record title', () => {
    const row = toLinkedToRow(
      makeLinkWithEntity('l1', 'work_item', 'w1', plainEntity('Frame the roof')),
      LABELS,
    );

    expect(row.title).toBe('Frame the roof');
  });

  it('falls back to the unavailable label when a non-invoice record has no title', () => {
    const row = toLinkedToRow(
      makeLinkWithEntity('l1', 'budget_source', 's1', plainEntity(null)),
      LABELS,
    );

    expect(row.title).toBe('Record no longer exists');
    expect(row.to).toBe('/budget/financing/sources/s1');
  });

  it('shows a record that is gone as plain removable text: no link, the unavailable label', () => {
    const row = toLinkedToRow(makeLinkWithEntity('l1', 'work_item', 'w1', null), LABELS);

    expect(row).toEqual({
      id: 'l1',
      title: 'Record no longer exists',
      facts: 'Kind word',
    });
    expect(row).not.toHaveProperty('to');
    expect(row).not.toHaveProperty('removable');
  });

  it('keeps the kind word on a gone record of every kind', () => {
    for (const type of DOCUMENT_LINK_ENTITY_TYPES) {
      const row = toLinkedToRow(makeLinkWithEntity('l1', type, 'x', null), {
        ...LABELS,
        kindWord: `Kind of ${type}`,
      });
      expect(row.facts).toBe(`Kind of ${type}`);
      expect(row.to).toBeUndefined();
    }
  });

  describe('invoice rows', () => {
    const invoice = (entity: {
      title: string | null;
      vendorName: string | null;
      invoiceStatus: 'pending' | 'paid' | 'claimed' | 'quotation' | null;
    }) => toLinkedToRow(makeLinkWithEntity('l1', 'invoice', 'inv-1', entity), LABELS).title;

    it('titles an invoice with company and number', () => {
      expect(
        invoice({ title: 'RE-2026-14', vendorName: 'Sample Roofing', invoiceStatus: 'paid' }),
      ).toBe('Sample Roofing · RE-2026-14');
    });

    it('titles an invoice without a number with the company and the invoice noun', () => {
      expect(invoice({ title: null, vendorName: 'Sample Roofing', invoiceStatus: 'pending' })).toBe(
        'Sample Roofing · Invoice',
      );
    });

    it('titles an offer (quotation) without a number with the company and the offer noun', () => {
      expect(
        invoice({ title: null, vendorName: 'Sample Roofing', invoiceStatus: 'quotation' }),
      ).toBe('Sample Roofing · Offer');
    });

    it('titles an invoice with a number but no company by the number alone', () => {
      expect(invoice({ title: 'RE-2026-14', vendorName: null, invoiceStatus: 'claimed' })).toBe(
        'RE-2026-14',
      );
    });

    it('titles an invoice with neither company nor number by the noun of its status', () => {
      expect(invoice({ title: null, vendorName: null, invoiceStatus: 'quotation' })).toBe('Offer');
      expect(invoice({ title: null, vendorName: null, invoiceStatus: 'paid' })).toBe('Invoice');
    });

    it('reads a missing status as an invoice, never an offer', () => {
      expect(invoice({ title: null, vendorName: null, invoiceStatus: null })).toBe('Invoice');
    });

    it('links the invoice to its page with the kind word', () => {
      const row = toLinkedToRow(
        makeLinkWithEntity('l1', 'invoice', 'inv-1', {
          title: 'RE-1',
          vendorName: null,
          invoiceStatus: 'paid',
        }),
        LABELS,
      );
      expect(row.to).toBe(routeUrl('invoice', { id: 'inv-1' }));
      expect(row.facts).toBe('Kind word');
    });
  });
});
