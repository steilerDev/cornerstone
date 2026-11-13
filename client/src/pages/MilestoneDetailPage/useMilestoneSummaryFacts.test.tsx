/**
 * @jest-environment jsdom
 *
 * The strip of the milestone page (#2250): four plain facts in order (Target, Projected,
 * Against target, Counts toward), the Reached relabel, the Late/Early/On target/Reached word and
 * the task counts.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MilestoneDetail } from '@cornerstone/shared';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeMilestoneDetail } from '../../test/milestonePageFixtures.js';
import { makeTaskSummary } from '../../test/taskPageFixtures.js';
import type { SummaryFact } from '../../components/SummaryStrip/SummaryStrip.js';
import type { ObjectTabsController } from '../../components/ObjectTabs/useObjectTabs.js';
import type * as HookModule from './useMilestoneSummaryFacts.js';
import type * as StripModule from '../../components/SummaryStrip/SummaryStrip.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let Hook: typeof HookModule;
let Strip: typeof StripModule;

const select = jest.fn<ObjectTabsController['select']>();
const tabs = {
  tabs: ['overview', 'work', 'history'],
  active: 'overview',
  select,
  hrefFor: (id: string) => `/project/milestones/1?tab=${id}`,
  pendingPanelFocus: { current: null },
} as unknown as ObjectTabsController;

function Host({
  milestone,
  onFacts,
}: {
  milestone: MilestoneDetail;
  onFacts: (facts: SummaryFact[]) => void;
}) {
  const facts = Hook.useMilestoneSummaryFacts({ milestone, tabs });
  onFacts(facts);
  return <Strip.SummaryStrip typeLabel="Milestone" facts={facts} />;
}

function renderFacts(milestone: MilestoneDetail) {
  let captured: SummaryFact[] = [];
  const view = render(
    <MemoryRouter>
      <Host milestone={milestone} onFacts={(f) => (captured = f)} />
    </MemoryRouter>,
  );
  return { ...view, facts: () => captured };
}

const fact = (id: string) => screen.getByTestId(`summary-fact-${id}`);

describe('useMilestoneSummaryFacts', () => {
  beforeEach(async () => {
    select.mockReset();
    if (!Hook) {
      Hook = await import('./useMilestoneSummaryFacts.js');
      Strip = await import('../../components/SummaryStrip/SummaryStrip.js');
    }
  });

  // Mutation: reordering or adding a fifth fact breaks the four-column strip.
  it('lists exactly four facts in order: Target, Projected, Against target, Counts toward', () => {
    const { facts } = renderFacts(makeMilestoneDetail());
    expect(facts().map((f) => f.id)).toEqual([
      'target',
      'projected',
      'againstTarget',
      'countsToward',
    ]);
    expect(facts()).toHaveLength(4);
  });

  // Mutation: a `wide` fact would take two columns and push the strip to two rows.
  it('marks no fact wide', () => {
    const { facts } = renderFacts(makeMilestoneDetail());
    for (const f of facts()) {
      expect((f as { wide?: boolean }).wide).toBeUndefined();
    }
  });

  it('labels the facts Target, Projected, Against target and Counts toward', () => {
    renderFacts(makeMilestoneDetail());
    // The label is the first part of a fact's accessible name (label, then value).
    expect(fact('target')).toHaveAccessibleName(/^Target /);
    expect(fact('projected')).toHaveAccessibleName(/^Projected /);
    expect(fact('againstTarget')).toHaveAccessibleName(/^Against target /);
    expect(fact('countsToward')).toHaveAccessibleName(/^Counts toward /);
  });

  describe('Target', () => {
    it('shows the formatted target date and opens the Overview tab', () => {
      renderFacts(makeMilestoneDetail({ targetDate: '2026-06-01' }));
      expect(fact('target')).toHaveTextContent(/Jun 1, 2026/);
      expect(fact('target')).toHaveAttribute('href', '/project/milestones/1?tab=overview');
      fireEvent.click(fact('target'));
      expect(select).toHaveBeenCalledWith('overview', { focusPanel: true });
    });
  });

  describe('Projected', () => {
    it('shows the projected date and opens the Work tab', () => {
      renderFacts(
        makeMilestoneDetail({
          projectedDate: '2026-06-10',
          workItems: [makeTaskSummary('t1')],
        }),
      );
      expect(fact('projected')).toHaveTextContent(/Jun 10, 2026/);
      expect(fact('projected')).toHaveAttribute('href', '/project/milestones/1?tab=work');
      fireEvent.click(fact('projected'));
      expect(select).toHaveBeenCalledWith('work', { focusPanel: true });
    });

    it('says "No tasks yet" when no task counts toward the milestone', () => {
      renderFacts(makeMilestoneDetail({ workItems: [], projectedDate: null }));
      expect(fact('projected')).toHaveTextContent('No tasks yet');
    });

    // Mutation: one empty text for both cases hides that the tasks have no dates.
    it('says "No dates yet" when tasks count toward it but none has a date', () => {
      renderFacts(makeMilestoneDetail({ workItems: [makeTaskSummary('t1')], projectedDate: null }));
      expect(fact('projected')).toHaveTextContent('No dates yet');
      expect(fact('projected')).not.toHaveTextContent('No tasks yet');
    });

    // Mutation: keeping "Projected" once reached would show a forecast for a past event.
    it('relabels to Reached with the completed date once reached', () => {
      renderFacts(
        makeMilestoneDetail({
          isCompleted: true,
          completedAt: '2026-05-20T10:00:00.000Z',
          projectedDate: '2026-06-10',
        }),
      );
      expect(fact('projected')).toHaveAccessibleName(/^Reached /);
      expect(fact('projected')).not.toHaveAccessibleName(/Projected/);
      expect(fact('projected')).toHaveTextContent(/May 20, 2026/);
      expect(fact('projected')).not.toHaveTextContent(/Jun 10/);
      expect(fact('projected')).toHaveAttribute('href', '/project/milestones/1?tab=overview');
    });
  });

  describe('Against target', () => {
    const badge = () => screen.getByTestId('milestone-against-target');

    it('says "Late · n d" when the projection is after the target', () => {
      renderFacts(makeMilestoneDetail({ targetDate: '2026-06-01', projectedDate: '2026-06-04' }));
      expect(badge()).toHaveTextContent('Late · 3 d');
    });

    it('says "Early · n d" when the projection is before the target', () => {
      renderFacts(makeMilestoneDetail({ targetDate: '2026-06-10', projectedDate: '2026-06-08' }));
      expect(badge()).toHaveTextContent('Early · 2 d');
    });

    // Mutation: showing "Upcoming" (the list word) instead of the strip's On target.
    it('says "On target" when the projection equals the target', () => {
      renderFacts(makeMilestoneDetail({ targetDate: '2026-06-01', projectedDate: '2026-06-01' }));
      expect(badge()).toHaveTextContent('On target');
      expect(badge()).not.toHaveTextContent('Upcoming');
    });

    it('says "On target" when nothing is projected', () => {
      renderFacts(makeMilestoneDetail({ projectedDate: null }));
      expect(badge()).toHaveTextContent('On target');
    });

    it('says "Reached" once reached, whatever the projection', () => {
      renderFacts(
        makeMilestoneDetail({
          isCompleted: true,
          completedAt: '2026-05-20T10:00:00.000Z',
          targetDate: '2026-06-01',
          projectedDate: '2026-06-09',
        }),
      );
      expect(badge()).toHaveTextContent('Reached');
      expect(badge()).not.toHaveTextContent('Late');
    });

    it('opens the Work tab', () => {
      renderFacts(makeMilestoneDetail());
      expect(fact('againstTarget')).toHaveAttribute('href', '/project/milestones/1?tab=work');
    });
  });

  describe('Counts toward', () => {
    it('says "None yet" with nothing counting toward the milestone', () => {
      renderFacts(makeMilestoneDetail({ workItems: [] }));
      expect(fact('countsToward')).toHaveTextContent('None yet');
    });

    it('uses the singular for one task: "1 task · 1 open"', () => {
      renderFacts(makeMilestoneDetail({ workItems: [makeTaskSummary('t1')] }));
      expect(within(fact('countsToward')).getByText(/^1 task$/)).toBeInTheDocument();
      expect(fact('countsToward')).toHaveTextContent('1 task · 1 open');
    });

    // Mutation: counting every task as open, or treating in_progress as done.
    it('counts the tasks that are not completed as open: "3 tasks · 2 open"', () => {
      renderFacts(
        makeMilestoneDetail({
          workItems: [
            makeTaskSummary('t1', { status: 'completed' }),
            makeTaskSummary('t2', { status: 'in_progress' }),
            makeTaskSummary('t3', { status: 'not_started' }),
          ],
        }),
      );
      expect(fact('countsToward')).toHaveTextContent('3 tasks · 2 open');
    });

    it('says "2 tasks · 0 open" when every task is done', () => {
      renderFacts(
        makeMilestoneDetail({
          workItems: [
            makeTaskSummary('t1', { status: 'completed' }),
            makeTaskSummary('t2', { status: 'completed' }),
          ],
        }),
      );
      expect(fact('countsToward')).toHaveTextContent('2 tasks · 0 open');
    });

    it('opens the Work tab', () => {
      renderFacts(makeMilestoneDetail({ workItems: [makeTaskSummary('t1')] }));
      fireEvent.click(fact('countsToward'));
      expect(select).toHaveBeenCalledWith('work', { focusPanel: true });
    });
  });
});
