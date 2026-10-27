/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { InvoiceDetail } from '@cornerstone/shared';
import * as sharedActual from '@cornerstone/shared';
import type { SummaryFact } from '../../components/SummaryStrip/SummaryStrip.js';
import type { UseInvoiceCostLinesResult } from '../../components/CostLineTable/useInvoiceCostLines.js';
import type { ObjectTabsController } from '../../components/ObjectTabs/useObjectTabs.js';
import type * as HookModule from './useInvoiceSummaryFacts.js';
import type * as LocaleModule from '../../contexts/LocaleContext.js';
import {
  makeBudgetSource,
  makeCostLine,
  makeInvoiceDetail,
} from '../../test/invoiceDetailFixtures.js';

let fundingSourceServed = false;
jest.unstable_mockModule('@cornerstone/shared', () => ({
  ...sharedActual,
  isRouteServed: (id: string) =>
    id === 'fundingSource' ? fundingSourceServed : sharedActual.isRouteServed(id as never),
  // The planned route cannot be built by the real routeUrl; stand in for the served page.
  routeUrl: (id: string, ...args: unknown[]) =>
    id === 'fundingSource' && fundingSourceServed
      ? `/budget/financing/sources/${encodeURIComponent(String((args[0] as { id: string }).id))}`
      : (sharedActual.routeUrl as (...a: unknown[]) => string)(id, ...args),
}));

let useInvoiceSummaryFacts: (typeof HookModule)['useInvoiceSummaryFacts'];
let LocaleProvider: (typeof LocaleModule)['LocaleProvider'];

const select = jest.fn<ObjectTabsController['select']>();
const tabs = {
  tabs: ['cost', 'payments', 'history'],
  active: 'cost',
  select,
  hrefFor: (id: string) => `/budget/invoices/inv-1?tab=${id}`,
  pendingPanelFocus: { current: null },
} as unknown as ObjectTabsController;

function costLines(over: Partial<UseInvoiceCostLinesResult> = {}): UseInvoiceCostLinesResult {
  return {
    lines: [],
    remainingAmount: 0,
    sources: new Map(),
    budgetSources: [],
    loading: false,
    error: null,
    reload: async () => undefined,
    ...over,
  };
}

const ORIGIN = { origin: { to: '/budget/invoices/inv-1', name: 'Invoice' } } as never;
const DOCUMENTS_FACT: SummaryFact = {
  id: 'documents',
  kind: 'static',
  label: 'Documents',
  value: '3',
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <LocaleProvider>{children}</LocaleProvider>
    </MemoryRouter>
  );
}

function facts(
  invoice: InvoiceDetail,
  lines: UseInvoiceCostLinesResult = costLines(),
  documentsFact: SummaryFact | null = null,
): SummaryFact[] {
  const { result } = renderHook(
    () =>
      useInvoiceSummaryFacts({
        invoice,
        costLines: lines,
        documentsFact,
        tabs,
        originState: ORIGIN,
      }),
    { wrapper },
  );
  return result.current;
}

const byId = (list: SummaryFact[], id: string) => {
  const fact = list.find((f) => f.id === id);
  if (!fact) throw new Error(`no fact ${id}`);
  return fact;
};

function text(node: ReactNode): string {
  const { container } = render(<>{node}</>, { wrapper });
  return container.textContent ?? '';
}

beforeEach(async () => {
  fundingSourceServed = false;
  select.mockReset();
  ({ useInvoiceSummaryFacts } = (await import('./useInvoiceSummaryFacts.js')) as typeof HookModule);
  ({ LocaleProvider } = await import('../../contexts/LocaleContext.js'));
});

describe('useInvoiceSummaryFacts (S12)', () => {
  it('lists amount, paid, still to pay, due, split and funding source for an invoice', () => {
    const list = facts(makeInvoiceDetail({ paid: 200, openAmount: 800 }));
    expect(list.map((f) => f.id)).toEqual([
      'amount',
      'paid',
      'stillToPay',
      'due',
      'split',
      'fundingSource',
    ]);
    expect(byId(list, 'amount')).toMatchObject({ kind: 'static', value: '€1,000.00' });
  });

  it('Paid and Still to pay carry their figure kinds and the money service values', () => {
    const list = facts(makeInvoiceDetail({ paid: 200, openAmount: 800 }));
    expect(byId(list, 'paid')).toMatchObject({
      kind: 'tab',
      figureKind: 'paid',
      value: '€200.00',
      href: '/budget/invoices/inv-1?tab=payments',
    });
    expect(byId(list, 'stillToPay')).toMatchObject({
      kind: 'static',
      figureKind: 'still-to-pay',
      value: '€800.00',
    });
  });

  it('the Paid fact opens the Payments tab and focuses its panel', () => {
    const paid = byId(facts(makeInvoiceDetail()), 'paid');
    if (paid.kind !== 'tab') throw new Error('expected a tab fact');
    paid.onActivate();
    expect(select).toHaveBeenCalledWith('payments', { focusPanel: true });
  });

  it('an offer shows Remaining on offer without a figure kind, and no Still to pay', () => {
    const list = facts(makeInvoiceDetail({ status: 'quotation', remainingOnOffer: 650 }));
    expect(list.some((f) => f.id === 'stillToPay')).toBe(false);
    const fact = byId(list, 'remainingOnOffer');
    expect(fact.value).toBe('€650.00');
    expect(fact.figureKind).toBeUndefined();
  });

  it('an offer without a remaining figure shows 0', () => {
    const list = facts(makeInvoiceDetail({ status: 'quotation', remainingOnOffer: null }));
    expect(byId(list, 'remainingOnOffer').value).toBe('€0.00');
  });

  describe('due', () => {
    it('is empty without a due date', () => {
      expect(byId(facts(makeInvoiceDetail({ dueDate: null })), 'due').value).toBeNull();
    });

    it('shows the formatted date when the due date is in the future', () => {
      expect(byId(facts(makeInvoiceDetail({ dueDate: '2999-03-04' })), 'due').value).toBe(
        'Mar 4, 2999',
      );
    });

    it('marks a pending invoice past its due date as overdue', () => {
      expect(byId(facts(makeInvoiceDetail({ dueDate: '2000-03-04' })), 'due').value).toBe(
        'Mar 4, 2000 · Overdue',
      );
    });

    it('takes the date part of a timestamp due date', () => {
      expect(
        byId(facts(makeInvoiceDetail({ dueDate: '2000-03-04T10:00:00.000Z' })), 'due').value,
      ).toBe('Mar 4, 2000 · Overdue');
    });

    it.each(['paid', 'claimed', 'quotation'] as const)(
      'a %s record past its due date is not overdue',
      (status) => {
        expect(byId(facts(makeInvoiceDetail({ status, dueDate: '2000-03-04' })), 'due').value).toBe(
          'Mar 4, 2000',
        );
      },
    );
  });

  describe('split', () => {
    it('shows the share as a percent (x100) and is not wide when nothing is left', () => {
      const fact = byId(
        facts(makeInvoiceDetail({ amount: 1000 }), costLines({ remainingAmount: 250 })),
        'split',
      );
      expect(text(fact.value)).toBe('75%');
      expect(fact.wide).toBe(false);
      expect(fact).toMatchObject({ kind: 'tab', href: '/budget/invoices/inv-1?tab=cost' });
    });

    it('adds the not-yet-split remainder and widens the fact only when notYetSplit', () => {
      const fact = byId(
        facts(
          makeInvoiceDetail({ amount: 1000, notYetSplit: true }),
          costLines({ remainingAmount: 400 }),
        ),
        'split',
      );
      expect(text(fact.value)).toBe('60% · €400.00 not yet split');
      expect(fact.wide).toBe(true);
    });

    it('stays plain below the not-yet-split threshold when the server does not flag it', () => {
      const fact = byId(
        facts(
          makeInvoiceDetail({ amount: 1000, notYetSplit: false }),
          costLines({ remainingAmount: 0.5 }),
        ),
        'split',
      );
      expect(text(fact.value)).toBe('100%');
    });

    it('says how much the lines are over, widens the fact and shows more than 100 percent', () => {
      const fact = byId(
        facts(makeInvoiceDetail({ amount: 1000 }), costLines({ remainingAmount: -100 })),
        'split',
      );
      expect(text(fact.value)).toBe('110% · €100.00 over');
      expect(fact.wide).toBe(true);
    });

    it('the over wording wins over not-yet-split', () => {
      const fact = byId(
        facts(
          makeInvoiceDetail({ amount: 1000, notYetSplit: true }),
          costLines({ remainingAmount: -5 }),
        ),
        'split',
      );
      expect(text(fact.value)).toContain('over');
      expect(text(fact.value)).not.toContain('not yet split');
    });

    it('is 0 percent for a zero-amount record', () => {
      const fact = byId(facts(makeInvoiceDetail({ amount: 0 })), 'split');
      expect(text(fact.value)).toBe('0%');
    });

    it('is empty while the cost lines load, and the Split tab fact opens the Cost tab', () => {
      const fact = byId(facts(makeInvoiceDetail(), costLines({ loading: true })), 'split');
      expect(fact.value).toBeNull();
      if (fact.kind !== 'tab') throw new Error('expected a tab fact');
      fact.onActivate();
      expect(select).toHaveBeenCalledWith('cost', { focusPanel: true });
    });
  });

  describe('funding source', () => {
    const SOURCES = [
      makeBudgetSource({ id: 's1', name: 'Loan Alpha' }),
      makeBudgetSource({ id: 's2', name: 'Savings Beta' }),
    ];

    it('is empty with no source', () => {
      const fact = byId(facts(makeInvoiceDetail()), 'fundingSource');
      expect(fact.value).toBeNull();
      expect(fact).toMatchObject({ kind: 'link', state: ORIGIN });
    });

    it('is empty while the cost lines load, even when sources are known', () => {
      const fact = byId(
        facts(
          makeInvoiceDetail(),
          costLines({
            loading: true,
            budgetSources: SOURCES,
            lines: [makeCostLine({ budgetSourceId: 's1' })],
          }),
        ),
        'fundingSource',
      );
      expect(fact.value).toBeNull();
    });

    it('shows the one source by name and links to the interim list while its page is planned', () => {
      const fact = byId(
        facts(
          makeInvoiceDetail(),
          costLines({
            budgetSources: SOURCES,
            lines: [makeCostLine({ budgetSourceId: 's1' })],
          }),
        ),
        'fundingSource',
      );
      expect(fact.value).toBe('Loan Alpha');
      expect(fact).toMatchObject({ kind: 'link', to: sharedActual.routeUrl('budgetSources') });
    });

    it('links the one source to its own page once that route is served', () => {
      fundingSourceServed = true;
      const fact = byId(
        facts(
          makeInvoiceDetail(),
          costLines({
            budgetSources: [makeBudgetSource({ id: 'src/1', name: 'Loan Alpha' })],
            lines: [makeCostLine({ budgetSourceId: 'src/1' })],
          }),
        ),
        'fundingSource',
      );
      expect(fact).toMatchObject({ to: '/budget/financing/sources/src%2F1' });
    });

    it('with several sources names the largest and counts the rest, linking to the list', () => {
      fundingSourceServed = true;
      const fact = byId(
        facts(
          makeInvoiceDetail(),
          costLines({
            budgetSources: SOURCES,
            lines: [
              makeCostLine({ id: 'a', budgetSourceId: 's1', itemizedAmount: 100 }),
              makeCostLine({ id: 'b', budgetSourceId: 's2', itemizedAmount: 300 }),
            ],
          }),
        ),
        'fundingSource',
      );
      expect(fact.value).toBe('Savings Beta +1');
      expect(fact).toMatchObject({ to: sharedActual.routeUrl('budgetSources') });
    });
  });

  it('appends the Documents fact only when there is one', () => {
    expect(facts(makeInvoiceDetail()).some((f) => f.id === 'documents')).toBe(false);
    const list = facts(makeInvoiceDetail(), costLines(), DOCUMENTS_FACT);
    expect(list.at(-1)).toBe(DOCUMENTS_FACT);
    expect(list).toHaveLength(7);
  });
});
