/**
 * @jest-environment jsdom
 *
 * The strip of the purchase page (#2249, D6/D7): seven facts in order, the Delivery wording, the
 * late badge, the empty Where and Company facts that open the Details card, the Call button, the
 * grant remark and the Invoiced empty text.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { HouseholdItemPageDetail } from '@cornerstone/shared';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makePurchasePage } from '../../test/purchasePageFixtures.js';
import type { SummaryFact } from '../../components/SummaryStrip/SummaryStrip.js';
import type { ObjectTabsController } from '../../components/ObjectTabs/useObjectTabs.js';
import type * as HookModule from './usePurchaseSummaryFacts.js';
import type * as StripModule from '../../components/SummaryStrip/SummaryStrip.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let Hook: typeof HookModule;
let Strip: typeof StripModule;

const select = jest.fn<ObjectTabsController['select']>();
const onOpenDetails = jest.fn<() => void>();
const ORIGIN = { origin: { to: '/project/household-items/hi-1', name: 'Sample sofa' } };
const tabs = {
  tabs: ['overview', 'timing', 'cost'],
  active: 'overview',
  select,
  hrefFor: (id: string) => `/project/household-items/hi-1?tab=${id}`,
  pendingPanelFocus: { current: null },
} as unknown as ObjectTabsController;

const DOCUMENTS_FACT: SummaryFact = {
  id: 'documents',
  kind: 'static',
  label: 'Documents',
  value: '3',
};

function Host({
  purchase,
  documentsFact = null,
  onFacts,
}: {
  purchase: HouseholdItemPageDetail;
  documentsFact?: SummaryFact | null;
  onFacts?: (facts: SummaryFact[]) => void;
}) {
  const facts = Hook.usePurchaseSummaryFacts({
    purchase,
    tabs,
    originState: ORIGIN,
    documentsFact,
    onOpenDetails,
  });
  onFacts?.(facts);
  return <Strip.SummaryStrip typeLabel="Purchase" facts={facts} />;
}

function renderFacts(purchase: HouseholdItemPageDetail, documentsFact: SummaryFact | null = null) {
  let captured: SummaryFact[] = [];
  const view = render(
    <MemoryRouter>
      <OriginProbe />
      <Host purchase={purchase} documentsFact={documentsFact} onFacts={(f) => (captured = f)} />
    </MemoryRouter>,
  );
  return { ...view, facts: () => captured };
}

const fact = (id: string) => screen.getByTestId(`summary-fact-${id}`);
const wideOf = (facts: SummaryFact[], id: string) =>
  (facts.find((f) => f.id === id) as { wide?: boolean }).wide;

describe('usePurchaseSummaryFacts', () => {
  beforeEach(async () => {
    select.mockReset();
    onOpenDetails.mockReset();
    if (!Hook) {
      Hook = await import('./usePurchaseSummaryFacts.js');
      Strip = await import('../../components/SummaryStrip/SummaryStrip.js');
    }
  });

  it('lists the facts in order: Delivery, Where, Company, Expected cost, Invoiced, Waits for', () => {
    const { facts } = renderFacts(makePurchasePage());
    expect(facts().map((f) => f.id)).toEqual([
      'delivery',
      'where',
      'company',
      'cost',
      'invoiced',
      'waitsFor',
    ]);
  });

  it('adds the Documents fact last, and only when there is one', () => {
    const { facts, unmount } = renderFacts(makePurchasePage(), DOCUMENTS_FACT);
    expect(facts().at(-1)?.id).toBe('documents');
    expect(facts()).toHaveLength(7);
    unmount();
    expect(renderFacts(makePurchasePage()).facts()).toHaveLength(6);
  });

  it('carries no figure marker on any fact (the purchase strip shows no figure kind)', () => {
    renderFacts(
      makePurchasePage({
        expectedCost: 900,
        budgetSummary: {
          totalPlanned: 900,
          totalActual: 100,
          subsidyReduction: 0,
          netCost: 900,
        },
      }),
    );
    expect(document.querySelector('[data-figure]')).toBeNull();
  });

  describe('Delivery', () => {
    it('says Delivered with the date once the purchase arrived', () => {
      renderFacts(
        makePurchasePage({
          status: 'arrived',
          actualDeliveryDate: '2026-03-05',
          targetDeliveryDate: '2026-03-01',
        }),
      );
      expect(fact('delivery')).toHaveTextContent(/Delivered .*2026/);
      expect(fact('delivery')).toHaveAttribute('href', '/project/household-items/hi-1?tab=timing');
      fireEvent.click(fact('delivery'));
      expect(select).toHaveBeenCalledWith('timing', { focusPanel: true });
    });

    it('says Target with the target date before it arrived', () => {
      renderFacts(makePurchasePage({ targetDeliveryDate: '2026-03-10' }));
      expect(fact('delivery')).toHaveTextContent(/Target .*2026/);
    });

    it('says Window with both bounds when there is no target', () => {
      renderFacts(
        makePurchasePage({ earliestDeliveryDate: '2026-03-01', latestDeliveryDate: '2026-03-20' }),
      );
      expect(fact('delivery')).toHaveTextContent(/Window .*2026 – .*2026/);
    });

    it('shows a lone bound as a plain date', () => {
      renderFacts(makePurchasePage({ latestDeliveryDate: '2026-03-20' }));
      expect(fact('delivery')).toHaveTextContent('2026');
      expect(fact('delivery')).not.toHaveTextContent(/Target|Window|Delivered/);
    });

    it('is not set without any delivery date, and not wide', () => {
      const { facts } = renderFacts(makePurchasePage());
      expect(fact('delivery')).toHaveTextContent('Not set');
      expect(screen.queryByTestId('purchase-late-badge')).toBeNull();
      expect(wideOf(facts(), 'delivery')).toBeUndefined();
    });

    it('adds the shared Late badge with the days beside the date and makes the fact wide', () => {
      const { facts } = renderFacts(
        makePurchasePage({
          status: 'purchased',
          isLate: true,
          latestDeliveryDate: '2026-01-10',
          earliestDeliveryDate: '2026-01-05',
        }),
      );
      const badge = within(fact('delivery')).getByTestId('purchase-late-badge');
      expect(badge).toHaveTextContent(/Late/);
      expect(badge).toHaveTextContent(/\d/);
      expect(wideOf(facts(), 'delivery')).toBe(true);
    });

    it('shows no Late badge for a late purchase that has arrived', () => {
      renderFacts(
        makePurchasePage({
          status: 'arrived',
          isLate: true,
          actualDeliveryDate: '2026-03-05',
          latestDeliveryDate: '2026-01-10',
        }),
      );
      expect(screen.queryByTestId('purchase-late-badge')).toBeNull();
    });
  });

  describe('Where', () => {
    it('with an area links to the areas page (interim) and carries the origin', () => {
      renderFacts(
        makePurchasePage({ area: { id: 'a-1', name: 'Kitchen', color: null, ancestors: [] } }),
      );
      expect(fact('where')).toHaveTextContent('Kitchen');
      expect(fact('where')).toHaveAttribute('href', '/areas');
      fireEvent.click(fact('where'));
      expect(probedPath()).toBe('/areas');
      expect(probedOrigin()).toEqual(ORIGIN.origin);
    });

    it('without an area opens the Details card from the Overview tab', () => {
      renderFacts(makePurchasePage());
      expect(fact('where')).toHaveAttribute('href', '/project/household-items/hi-1?tab=overview');
      fireEvent.click(fact('where'));
      expect(onOpenDetails).toHaveBeenCalledTimes(1);
      expect(select).not.toHaveBeenCalled();
    });
  });

  describe('Company', () => {
    it('links to the company page with the origin, with a Call button beside it for a phone', () => {
      const { facts } = renderFacts(
        makePurchasePage({
          vendor: { id: 'v-1', name: 'Company One', trade: null, phone: '+49 30 123' },
        }),
      );
      expect(fact('company')).toHaveTextContent('Company One');
      expect(fact('company')).toHaveAttribute('href', '/companies/v-1');
      const call = screen.getByTestId('purchase-summary-call');
      expect(call).toHaveAttribute('href', 'tel:+4930123');
      expect(fact('company')).not.toContainElement(call);
      expect(wideOf(facts(), 'company')).toBe(true);
      fireEvent.click(fact('company'));
      expect(probedPath()).toBe('/companies/v-1');
      expect(probedOrigin()).toEqual(ORIGIN.origin);
    });

    it('has no Call button and is not wide for a company without a phone', () => {
      const { facts } = renderFacts(
        makePurchasePage({
          vendor: { id: 'v-1', name: 'Company One', trade: null, phone: null },
        }),
      );
      expect(fact('company')).toHaveTextContent('Company One');
      expect(screen.queryByTestId('purchase-summary-call')).toBeNull();
      expect(wideOf(facts(), 'company')).toBeUndefined();
    });

    it('without a company opens the Details card', () => {
      renderFacts(makePurchasePage());
      expect(fact('company')).toHaveTextContent('Not set');
      fireEvent.click(fact('company'));
      expect(onOpenDetails).toHaveBeenCalledTimes(1);
    });
  });

  describe('Expected cost', () => {
    it('is not set without cost lines and opens the Cost tab', () => {
      renderFacts(makePurchasePage());
      expect(fact('cost')).toHaveTextContent('Not set');
      expect(fact('cost')).toHaveAttribute('href', '/project/household-items/hi-1?tab=cost');
    });

    it('formats the amount, with no remark and not wide without grants', () => {
      const { facts } = renderFacts(makePurchasePage({ expectedCost: 1234.5 }));
      expect(fact('cost')).toHaveTextContent(/1,234\.50/);
      expect(fact('cost')).not.toHaveTextContent('·');
      expect(wideOf(facts(), 'cost')).toBeUndefined();
    });

    it('names one grant as a remark and makes the fact wide', () => {
      const { facts } = renderFacts(
        makePurchasePage({
          expectedCost: 900,
          grants: [{ id: 'g-1', name: 'Energy grant', reductionType: 'percentage', rate: 10 }],
        }),
      );
      expect(fact('cost')).toHaveTextContent(/900.* · Energy grant$/);
      expect(wideOf(facts(), 'cost')).toBe(true);
    });

    it('names the first grant and counts the others', () => {
      renderFacts(
        makePurchasePage({
          expectedCost: 900,
          grants: [
            { id: 'g-1', name: 'Energy grant', reductionType: 'percentage', rate: 10 },
            { id: 'g-2', name: 'Heat grant', reductionType: 'fixed', rate: 100 },
          ],
        }),
      );
      expect(fact('cost')).toHaveTextContent('Energy grant and 1 more');
    });

    it('does not show the grant when there is no expected cost', () => {
      renderFacts(
        makePurchasePage({
          grants: [{ id: 'g-1', name: 'Energy grant', reductionType: 'percentage', rate: 10 }],
        }),
      );
      expect(fact('cost')).not.toHaveTextContent('Energy grant');
    });
  });

  describe('Invoiced', () => {
    const summary = (totalActual: number) => ({
      totalPlanned: 0,
      totalActual,
      subsidyReduction: 0,
      netCost: 0,
    });

    it('is empty with the screen-reader text "None yet" when nothing was invoiced', () => {
      renderFacts(makePurchasePage({ budgetSummary: summary(0) }));
      expect(fact('invoiced')).toHaveTextContent('None yet');
      expect(fact('invoiced')).not.toHaveTextContent('Not set');
      expect(fact('invoiced')).toHaveAttribute('href', '/project/household-items/hi-1?tab=cost');
    });

    it('shows the invoiced amount', () => {
      renderFacts(makePurchasePage({ budgetSummary: summary(250) }));
      expect(fact('invoiced')).toHaveTextContent(/250/);
      expect(fact('invoiced')).not.toHaveTextContent('None yet');
    });
  });

  describe('Waits for', () => {
    it('says Nothing without a waiting predecessor', () => {
      renderFacts(makePurchasePage());
      expect(fact('waitsFor')).toHaveTextContent('Nothing');
    });

    it('names the first unfinished predecessor', () => {
      renderFacts(
        makePurchasePage({
          waitsFor: { type: 'work_item', id: 'p-1', title: 'Paint walls', more: 0 },
        }),
      );
      expect(fact('waitsFor')).toHaveTextContent('Paint walls');
      expect(fact('waitsFor')).not.toHaveTextContent('+');
    });

    it('adds how many more it waits for and opens the Timing tab', () => {
      renderFacts(
        makePurchasePage({
          waitsFor: { type: 'milestone', id: '7', title: 'Shell done', more: 2 },
        }),
      );
      expect(fact('waitsFor')).toHaveTextContent('Shell done +2');
      fireEvent.click(fact('waitsFor'));
      expect(select).toHaveBeenCalledWith('timing', { focusPanel: true });
    });
  });
});
