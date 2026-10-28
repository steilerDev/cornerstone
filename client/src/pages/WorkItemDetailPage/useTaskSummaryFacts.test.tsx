/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { WorkItemPageDetail } from '@cornerstone/shared';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeTaskPage } from '../../test/taskPageFixtures.js';
import type { SummaryFact } from '../../components/SummaryStrip/SummaryStrip.js';
import type { ObjectTabsController } from '../../components/ObjectTabs/useObjectTabs.js';
import type * as HookModule from './useTaskSummaryFacts.js';
import type * as StripModule from '../../components/SummaryStrip/SummaryStrip.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let Hook: typeof HookModule;
let Strip: typeof StripModule;

const select = jest.fn<ObjectTabsController['select']>();
const onOpenWhoWhere = jest.fn<() => void>();
const ORIGIN = { origin: { to: '/project/work-items/wi-1', name: 'Pour slab' } };
const tabs = {
  tabs: ['overview', 'timing', 'cost'],
  active: 'overview',
  select,
  hrefFor: (id: string) => `/project/work-items/wi-1?tab=${id}`,
  pendingPanelFocus: { current: null },
} as unknown as ObjectTabsController;

const DOCUMENTS_FACT: SummaryFact = {
  id: 'documents',
  kind: 'static',
  label: 'Documents',
  value: '3',
};

function Host({
  task,
  documentsFact = null,
  onFacts,
}: {
  task: WorkItemPageDetail;
  documentsFact?: SummaryFact | null;
  onFacts?: (facts: SummaryFact[]) => void;
}) {
  const facts = Hook.useTaskSummaryFacts({
    task,
    tabs,
    originState: ORIGIN,
    documentsFact,
    onOpenWhoWhere,
  });
  onFacts?.(facts);
  return <Strip.SummaryStrip typeLabel="Task" facts={facts} />;
}

function renderFacts(task: WorkItemPageDetail, documentsFact: SummaryFact | null = null) {
  let captured: SummaryFact[] = [];
  const view = render(
    <MemoryRouter>
      <OriginProbe />
      <Host task={task} documentsFact={documentsFact} onFacts={(f) => (captured = f)} />
    </MemoryRouter>,
  );
  return { ...view, facts: () => captured };
}

const fact = (id: string) => screen.getByTestId(`summary-fact-${id}`);

describe('useTaskSummaryFacts', () => {
  beforeEach(async () => {
    select.mockReset();
    onOpenWhoWhere.mockReset();
    if (!Hook) {
      Hook = await import('./useTaskSummaryFacts.js');
      Strip = await import('../../components/SummaryStrip/SummaryStrip.js');
    }
  });

  it('lists the facts in order: When, Where, Who, Expected cost, Waits for, Holds up', () => {
    const { facts } = renderFacts(makeTaskPage());
    expect(facts().map((f) => f.id)).toEqual([
      'when',
      'where',
      'who',
      'cost',
      'waitsFor',
      'holdsUp',
    ]);
  });

  it('adds the Documents fact last, and only when there is one', () => {
    const { facts, unmount } = renderFacts(makeTaskPage(), DOCUMENTS_FACT);
    expect(
      facts()
        .map((f) => f.id)
        .at(-1),
    ).toBe('documents');
    expect(facts()).toHaveLength(7);
    unmount();
    expect(renderFacts(makeTaskPage()).facts()).toHaveLength(6);
  });

  describe('When', () => {
    it('shows the range of the shown dates and opens the Timing tab', () => {
      renderFacts(
        makeTaskPage({ projectedStartDate: '2026-03-02', projectedEndDate: '2026-03-06' }),
      );
      expect(fact('when')).toHaveTextContent(/2026.* – .*2026/);
      expect(fact('when')).toHaveAttribute('href', '/project/work-items/wi-1?tab=timing');
      fireEvent.click(fact('when'));
      expect(select).toHaveBeenCalledWith('timing', { focusPanel: true });
    });

    it('prefers the actual dates over the projected ones', () => {
      renderFacts(
        makeTaskPage({
          actualStartDate: '2026-04-01',
          actualEndDate: '2026-04-09',
          projectedStartDate: '2026-03-02',
          projectedEndDate: '2026-03-06',
        }),
      );
      expect(fact('when')).toHaveTextContent(/Apr|4/);
      expect(fact('when')).not.toHaveTextContent(/Mar/);
    });

    it.each([
      ['only a start', { projectedStartDate: '2026-03-02' }],
      ['only an end', { projectedEndDate: '2026-03-06' }],
    ])('shows a single date for %s', (_name, over) => {
      renderFacts(makeTaskPage(over));
      expect(fact('when')).toHaveTextContent('2026');
      expect(fact('when')).not.toHaveTextContent(' – ');
    });

    it('says there are no dates yet for an undated task', () => {
      renderFacts(makeTaskPage());
      expect(fact('when')).toHaveTextContent('No dates yet');
      expect(screen.queryByTestId('work-item-schedule-signal')).toBeNull();
    });

    it('adds the schedule signal beside the dates and makes the fact wide', () => {
      const { facts } = renderFacts(
        makeTaskPage({
          projectedStartDate: '2026-03-02',
          projectedEndDate: '2026-03-06',
          isLate: true,
          lateDays: 3,
        }),
      );
      expect(within(fact('when')).getByTestId('work-item-schedule-signal')).toHaveTextContent(/3/);
      expect((facts()[0] as { wide?: boolean }).wide).toBe(true);
    });

    it('is not wide without a signal', () => {
      const { facts } = renderFacts(makeTaskPage());
      expect((facts()[0] as { wide?: boolean }).wide).toBeUndefined();
    });
  });

  describe('Where', () => {
    it('with an area links to the areas page (interim) and carries the origin', () => {
      renderFacts(
        makeTaskPage({
          area: { id: 'a-1', name: 'Kitchen', color: null, ancestors: [] },
        } as Partial<WorkItemPageDetail>),
      );
      expect(fact('where')).toHaveTextContent('Kitchen');
      expect(fact('where')).toHaveAttribute('href', '/areas');
      fireEvent.click(fact('where'));
      expect(probedPath()).toBe('/areas');
      expect(probedOrigin()).toEqual(ORIGIN.origin);
    });

    it('without an area opens the Who and where card from the Overview tab', () => {
      renderFacts(makeTaskPage());
      expect(fact('where')).toHaveAttribute('href', '/project/work-items/wi-1?tab=overview');
      fireEvent.click(fact('where'));
      expect(onOpenWhoWhere).toHaveBeenCalledTimes(1);
      expect(select).not.toHaveBeenCalled();
    });
  });

  describe('Who', () => {
    it('shows the company name with a Call button beside it when the company has a phone', () => {
      renderFacts(
        makeTaskPage({
          assignedVendor: { id: 'v-1', name: 'Acme Roofing', trade: null, phone: '+49 30 123' },
        }),
      );
      expect(fact('who')).toHaveTextContent('Acme Roofing');
      const call = screen.getByTestId('task-summary-call');
      expect(call).toHaveAttribute('href', 'tel:+4930123');
      expect(fact('who')).not.toContainElement(call);
      fireEvent.click(fact('who'));
      expect(onOpenWhoWhere).toHaveBeenCalledTimes(1);
    });

    it('has no Call button for a company without a phone', () => {
      renderFacts(
        makeTaskPage({
          assignedVendor: { id: 'v-1', name: 'Acme Roofing', trade: null, phone: null },
        }),
      );
      expect(fact('who')).toHaveTextContent('Acme Roofing');
      expect(screen.queryByTestId('task-summary-call')).toBeNull();
    });

    it('is wide only while the Call button shows', () => {
      const withPhone = renderFacts(
        makeTaskPage({
          assignedVendor: { id: 'v-1', name: 'Acme Roofing', trade: null, phone: '+49 30 123' },
        }),
      );
      const whoOf = (facts: SummaryFact[]) =>
        facts.find((f) => f.id === 'who') as { wide?: boolean };
      expect(whoOf(withPhone.facts()).wide).toBe(true);
      withPhone.unmount();
      const noPhone = renderFacts(
        makeTaskPage({
          assignedVendor: { id: 'v-1', name: 'Acme Roofing', trade: null, phone: null },
        }),
      );
      expect(whoOf(noPhone.facts()).wide).toBeUndefined();
    });

    it('shows a member by display name and never a Call button', () => {
      renderFacts(
        makeTaskPage({
          assignedUser: { id: 'u-1', displayName: 'Pat Sample', email: 'pat@example.test' },
        }),
      );
      expect(fact('who')).toHaveTextContent('Pat Sample');
      expect(screen.queryByTestId('task-summary-call')).toBeNull();
    });

    it('is not set when nobody is assigned', () => {
      renderFacts(makeTaskPage());
      expect(fact('who')).toHaveTextContent('Not set');
    });
  });

  describe('Expected cost', () => {
    it('is not set without cost lines', () => {
      renderFacts(makeTaskPage());
      expect(fact('cost')).toHaveTextContent('Not set');
      expect(fact('cost')).toHaveAttribute('href', '/project/work-items/wi-1?tab=cost');
    });

    it('formats the amount, with no remark and not wide without grants', () => {
      const { facts } = renderFacts(makeTaskPage({ expectedCost: 1234.5 }));
      expect(fact('cost')).toHaveTextContent(/1,234\.50/);
      expect(fact('cost')).not.toHaveTextContent('·');
      expect((facts()[3] as { wide?: boolean }).wide).toBeUndefined();
    });

    it('names one grant as a remark and makes the fact wide', () => {
      const { facts } = renderFacts(
        makeTaskPage({
          expectedCost: 900,
          grants: [{ id: 'g-1', name: 'Energy grant', reductionType: 'percentage', rate: 10 }],
        }),
      );
      expect(fact('cost')).toHaveTextContent(/900.* · Energy grant$/);
      expect((facts()[3] as { wide?: boolean }).wide).toBe(true);
    });

    it('names the first grant and counts the others', () => {
      renderFacts(
        makeTaskPage({
          expectedCost: 900,
          grants: [
            { id: 'g-1', name: 'Energy grant', reductionType: 'percentage', rate: 10 },
            { id: 'g-2', name: 'Heat grant', reductionType: 'fixed', rate: 100 },
            { id: 'g-3', name: 'Roof grant', reductionType: 'fixed', rate: 50 },
          ],
        }),
      );
      expect(fact('cost')).toHaveTextContent('Energy grant and 2 more');
    });

    it('does not show the grant when there is no expected cost', () => {
      renderFacts(
        makeTaskPage({
          grants: [{ id: 'g-1', name: 'Energy grant', reductionType: 'percentage', rate: 10 }],
        }),
      );
      expect(fact('cost')).not.toHaveTextContent('Energy grant');
    });
  });

  describe('Waits for', () => {
    it('says Nothing without a waiting predecessor', () => {
      renderFacts(makeTaskPage());
      expect(fact('waitsFor')).toHaveTextContent('Nothing');
    });

    it('names the first unfinished task', () => {
      renderFacts(makeTaskPage({ waitsFor: { id: 'p-1', title: 'Dig trench', more: 0 } }));
      expect(fact('waitsFor')).toHaveTextContent('Dig trench');
      expect(fact('waitsFor')).not.toHaveTextContent('+');
    });

    it('adds how many more it waits for', () => {
      renderFacts(makeTaskPage({ waitsFor: { id: 'p-1', title: 'Dig trench', more: 2 } }));
      expect(fact('waitsFor')).toHaveTextContent('Dig trench +2');
      fireEvent.click(fact('waitsFor'));
      expect(select).toHaveBeenCalledWith('timing', { focusPanel: true });
    });
  });

  describe('Holds up', () => {
    it('says Nothing and carries no figure marker when nothing waits', () => {
      renderFacts(makeTaskPage());
      expect(fact('holdsUp')).toHaveTextContent('Nothing');
      expect(fact('holdsUp').closest('[data-figure]')).toBeNull();
      expect(fact('holdsUp').querySelector('[data-figure]')).toBeNull();
    });

    it('counts the tasks (singular and plural) and marks the figure as holds-up', () => {
      const { unmount } = renderFacts(
        makeTaskPage({ holdsUp: { count: 1, startingWithin14Days: 1 } }),
      );
      expect(fact('holdsUp')).toHaveTextContent('1 task');
      expect(screen.getByText('1 task')).toHaveAttribute('data-figure', 'holds-up');
      unmount();
      renderFacts(makeTaskPage({ holdsUp: { count: 5, startingWithin14Days: 2 } }));
      expect(fact('holdsUp')).toHaveTextContent('5 tasks');
    });
  });
});
