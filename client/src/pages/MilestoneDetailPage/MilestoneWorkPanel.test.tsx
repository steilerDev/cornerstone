/**
 * @jest-environment jsdom
 *
 * The Work tab of the milestone page (#2250): both lists, and the clearance below the last one
 * so its downward picker clears the phone bottom bar. The lists are covered per module.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MilestoneDetail } from '@cornerstone/shared';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeMilestoneDetail, makeWaitingPurchase } from '../../test/milestonePageFixtures.js';
import { makeTaskSummary } from '../../test/taskPageFixtures.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as PanelModule from './MilestoneWorkPanel.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let Panel: typeof PanelModule;
const refresh = jest.fn<() => Promise<void>>();
const ORIGIN = { origin: { to: '/project/milestones/1', name: 'Sample milestone' } };

const MILESTONE = makeMilestoneDetail({
  workItems: [makeTaskSummary('c1', { title: 'Frame roof' })],
  dependentWorkItems: [makeTaskSummary('w1', { title: 'Tile roof' })],
  dependentHouseholdItems: [makeWaitingPurchase('h1', { name: 'Sample sofa' })],
});

function renderPanel(milestone: MilestoneDetail = MILESTONE) {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <Panel.MilestoneWorkPanel
          milestone={milestone}
          revision={0}
          refresh={refresh}
          originState={ORIGIN}
          headingRef={{ current: null }}
        />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('MilestoneWorkPanel', () => {
  beforeEach(async () => {
    refresh.mockReset();
    if (!Panel) Panel = await import('./MilestoneWorkPanel.js');
  });

  it('exports the panel as the default too', () => {
    expect(Panel.default).toBe(Panel.MilestoneWorkPanel);
  });

  it('renders the counts-toward list first and the waiting-for list second', () => {
    renderPanel();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toHaveLength(2);
    expect(headings[0]).toMatch(/^Counts toward this milestone/);
    expect(headings[1]).toMatch(/^Waiting for this milestone/);
  });

  it('puts each task and purchase in its own list', () => {
    renderPanel();
    expect(screen.getByTestId('milestone-counts-row-c1')).toHaveTextContent('Frame roof');
    expect(screen.getByTestId('milestone-waiting-row-work_item:w1')).toHaveTextContent('Tile roof');
    expect(screen.getByTestId('milestone-waiting-row-household_item:h1')).toHaveTextContent(
      'Sample sofa',
    );
    expect(screen.queryByTestId('milestone-counts-row-w1')).toBeNull();
  });

  // Mutation: dropping the wrapper (or wrapping the first list) lets the phone bottom bar cover
  // the last picker.
  it('wraps only the last list in the page-end clearance', () => {
    renderPanel();
    const waiting = screen.getByTestId('milestone-waiting');
    const counts = screen.getByTestId('milestone-counts');
    const clearance = waiting.parentElement!;
    expect(clearance.className).toContain('pageEndClearance');
    expect(counts.closest('.pageEndClearance')).toBeNull();
    expect(counts.parentElement!.className).not.toContain('pageEndClearance');
  });
});
