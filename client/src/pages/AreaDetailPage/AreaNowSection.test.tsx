/**
 * @jest-environment jsdom
 *
 * Now & next here and the ancestor context rows (#2251). Real FeedRow, Badge and status hooks;
 * only the locale is mocked. All data is synthetic.
 *
 * Mutations these tests catch:
 *  - the late badge missing (or shown next to the status instead of replacing it), the late badge
 *    shown for a late item with no late days;
 *  - the kind badge swapped (Task shown for a purchase), a title linking to the wrong object route;
 *  - a footer link shown at 0 total, or carrying the wrong filter / the wrong list;
 *  - a context row without its link to the ancestor's page, wording by the wrong depth, a zero
 *    count shown ("0 purchases"), or the list present without ancestors;
 *  - the dates of a task or purchase not following the Task strip "When" wording.
 */
import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AreaPageSummary } from '@cornerstone/shared';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import {
  makeAncestorContext,
  makeAreaSummary,
  makeNowPurchase,
  makeNowTask,
} from '../../test/areaPageFixtures.js';
import type * as SectionModule from './AreaNowSection.js';
import enAreas from '../../i18n/en/areas.json';
import enCommon from '../../i18n/en/common.json';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let AreaNowSection: typeof SectionModule.AreaNowSection;

beforeAll(async () => {
  ({ AreaNowSection } = await import('./AreaNowSection.js'));
});

const ORIGIN = { origin: { to: '/areas/floor', name: 'Ground floor' } };
const now = enAreas.detail.now;
const kind = enCommon.navigation;

function renderSection(summary: AreaPageSummary) {
  return render(
    <MemoryRouter initialEntries={['/areas/floor']}>
      <AreaNowSection summary={summary} originState={ORIGIN} />
      <OriginProbe />
    </MemoryRouter>,
  );
}

const row = (type: string, id: string) => screen.getByTestId(`area-now-${type}-${id}`);

function summaryWith(over: Partial<AreaPageSummary>, tasks = 0, purchases = 0): AreaPageSummary {
  const base = makeAreaSummary();
  return makeAreaSummary({
    counts: {
      ...base.counts,
      workItems: { total: tasks, open: tasks, late: 0 },
      householdItems: { total: purchases, open: purchases },
    },
    ...over,
  });
}

describe('AreaNowSection', () => {
  it('renders a card labelled "Now & next here" with its h2', () => {
    renderSection(makeAreaSummary());

    const section = screen.getByRole('region', { name: enAreas.detail.sections.now });
    expect(section).toHaveAttribute('data-testid', 'section-area-now');
    expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent(
      enAreas.detail.sections.now,
    );
  });

  describe('empty', () => {
    it('shows the empty message with the area name and no list, no footer, no context', () => {
      renderSection(makeAreaSummary());

      expect(screen.getByText(now.empty.replace('{{area}}', 'Ground floor'))).toBeInTheDocument();
      expect(screen.queryByRole('list')).toBeNull();
      expect(screen.queryByTestId('area-now-all-tasks')).toBeNull();
      expect(screen.queryByTestId('area-now-all-purchases')).toBeNull();
      expect(screen.queryByTestId('area-context')).toBeNull();
    });
  });

  describe('rows', () => {
    it('shows the kind badge text and the status text of a task and of a purchase', () => {
      renderSection(
        summaryWith(
          {
            nowAndNext: [
              makeNowTask('t1', { status: 'in_progress' }),
              makeNowPurchase('h1', { status: 'purchased' }),
            ],
          },
          1,
          1,
        ),
      );

      const task = row('work_item', 't1');
      expect(task).toHaveTextContent(kind.task);
      expect(task).toHaveTextContent('In progress');
      expect(task).not.toHaveTextContent(kind.purchase);
      const purchase = row('household_item', 'h1');
      expect(purchase).toHaveTextContent(kind.purchase);
      expect(purchase).toHaveTextContent('Ordered');
      expect(purchase).not.toHaveTextContent(`${kind.task} `);
    });

    it('replaces the status with the "Late · n d" badge for a late item', () => {
      renderSection(
        summaryWith(
          {
            nowAndNext: [
              makeNowTask('t1', { status: 'in_progress', isLate: true, lateDays: 3 }),
              makeNowPurchase('h1', { status: 'purchased', isLate: true, lateDays: 2 }),
            ],
          },
          1,
          1,
        ),
      );

      expect(row('work_item', 't1')).toHaveTextContent('Late · 3 d');
      expect(row('work_item', 't1')).not.toHaveTextContent('In progress');
      expect(row('household_item', 'h1')).toHaveTextContent('Late · 2 d');
      expect(row('household_item', 'h1')).not.toHaveTextContent('Ordered');
    });

    it('shows the plain status when isLate is false even if lateDays is set', () => {
      renderSection(
        summaryWith({ nowAndNext: [makeNowTask('t1', { isLate: false, lateDays: 4 })] }, 1),
      );

      expect(row('work_item', 't1')).toHaveTextContent('Not started');
      expect(row('work_item', 't1')).not.toHaveTextContent('Late');
    });

    it('shows the status when isLate is true but there are no late days to name', () => {
      renderSection(
        summaryWith({ nowAndNext: [makeNowTask('t1', { isLate: true, lateDays: null })] }, 1),
      );

      expect(row('work_item', 't1')).toHaveTextContent('Not started');
      expect(row('work_item', 't1')).not.toHaveTextContent('Late');
    });

    it('links a title to its own object page with the origin, one link per row', () => {
      renderSection(
        summaryWith(
          { nowAndNext: [makeNowTask('t1'), makeNowPurchase('h1', { title: 'Sofa' })] },
          1,
          1,
        ),
      );

      const taskLink = within(row('work_item', 't1')).getByRole('link');
      expect(taskLink).toHaveTextContent('Task t1');
      expect(taskLink).toHaveAttribute('href', '/project/work-items/t1');
      const purchaseLink = within(row('household_item', 'h1')).getByRole('link');
      expect(purchaseLink).toHaveAttribute('href', '/project/household-items/h1');
      fireEvent.click(purchaseLink);
      expect(probedPath()).toBe('/project/household-items/h1');
      expect(probedOrigin()).toEqual(ORIGIN.origin);
    });

    it('shows the date range and the company of a task after the title', () => {
      renderSection(
        summaryWith(
          {
            nowAndNext: [
              makeNowTask('t1', {
                startDate: '2026-03-05',
                endDate: '2026-03-09',
                companyName: 'Company One',
              }),
            ],
          },
          1,
        ),
      );

      const text = row('work_item', 't1').textContent ?? '';
      expect(text).toMatch(/Mar(ch)? 5, 2026 – Mar(ch)? 9, 2026 · Company One/);
    });

    it('shows a single date when only one side is set and nothing when neither is', () => {
      renderSection(
        summaryWith(
          {
            nowAndNext: [
              makeNowTask('only-end', { endDate: '2026-03-09' }),
              makeNowTask('only-start', { startDate: '2026-03-05' }),
              makeNowTask('none'),
            ],
          },
          3,
        ),
      );

      expect(row('work_item', 'only-end').textContent).toMatch(/Mar(ch)? 9, 2026/);
      expect(row('work_item', 'only-end').textContent).not.toContain('–');
      expect(row('work_item', 'only-start').textContent).toMatch(/Mar(ch)? 5, 2026/);
      expect(row('work_item', 'none').textContent).not.toContain('·');
      expect(row('work_item', 'none').textContent).not.toMatch(/\d{4}/);
    });

    it('shows "Target <date>" for a purchase delivery date and the company', () => {
      renderSection(
        summaryWith(
          {
            nowAndNext: [
              makeNowPurchase('h1', { deliveryDate: '2026-04-01', companyName: 'Shop Two' }),
            ],
          },
          0,
          1,
        ),
      );

      expect(row('household_item', 'h1').textContent).toMatch(/Target Apr(il)? 1, 2026 · Shop Two/);
    });

    it('shows only the company when the purchase has no delivery date', () => {
      renderSection(
        summaryWith({ nowAndNext: [makeNowPurchase('h1', { companyName: 'Shop Two' })] }, 0, 1),
      );

      expect(row('household_item', 'h1').textContent).toContain('· Shop Two');
      expect(row('household_item', 'h1').textContent).not.toContain('Target');
    });

    it('lists rows in the given order', () => {
      renderSection(
        summaryWith(
          { nowAndNext: [makeNowPurchase('h1'), makeNowTask('t1'), makeNowTask('t2')] },
          2,
          1,
        ),
      );

      const ids = screen
        .getAllByTestId(/^area-now-(work_item|household_item)-[^-]+$/)
        .map((el) => el.getAttribute('data-testid'));
      expect(ids).toEqual([
        'area-now-household_item-h1',
        'area-now-work_item-t1',
        'area-now-work_item-t2',
      ]);
    });
  });

  describe('footer links', () => {
    it('shows both links with the totals (not the shown rows) and the area filter', () => {
      renderSection(summaryWith({ nowAndNext: [makeNowTask('t1')] }, 9, 4));

      const tasks = screen.getByTestId('area-now-all-tasks');
      expect(tasks).toHaveTextContent(now.allTasks.replace('{{count}}', '9'));
      expect(tasks).toHaveAttribute('href', '/project/work-items?areaId=floor');
      const purchases = screen.getByTestId('area-now-all-purchases');
      expect(purchases).toHaveTextContent(now.allPurchases.replace('{{count}}', '4'));
      expect(purchases).toHaveAttribute('href', '/project/household-items?areaId=floor');
    });

    it('hides the tasks link at 0 tasks and keeps the purchases link', () => {
      renderSection(summaryWith({ nowAndNext: [makeNowPurchase('h1')] }, 0, 2));

      expect(screen.queryByTestId('area-now-all-tasks')).toBeNull();
      expect(screen.getByTestId('area-now-all-purchases')).toBeInTheDocument();
    });

    it('hides the purchases link at 0 purchases and keeps the tasks link', () => {
      renderSection(summaryWith({ nowAndNext: [makeNowTask('t1')] }, 2, 0));

      expect(screen.getByTestId('area-now-all-tasks')).toBeInTheDocument();
      expect(screen.queryByTestId('area-now-all-purchases')).toBeNull();
    });

    it('shows the links even when only closed items exist (totals above zero, nothing open)', () => {
      renderSection(
        makeAreaSummary({
          counts: { ...makeAreaSummary().counts, workItems: { total: 3, open: 0, late: 0 } },
        }),
      );

      expect(screen.getByTestId('area-now-all-tasks')).toHaveTextContent(
        now.allTasks.replace('{{count}}', '3'),
      );
    });

    it('carries the origin state when a footer link is used', () => {
      renderSection(summaryWith({}, 1, 0));

      fireEvent.click(screen.getByTestId('area-now-all-tasks'));

      expect(probedPath()).toBe('/project/work-items');
      expect(probedOrigin()).toEqual(ORIGIN.origin);
    });

    it('hides the arrow from assistive technology', () => {
      renderSection(summaryWith({}, 1, 0));

      expect(
        screen.getByTestId('area-now-all-tasks').querySelector('[aria-hidden="true"]'),
      ).toHaveTextContent('→');
    });
  });

  describe('ancestor context', () => {
    it('is a labelled list with one link to each ancestor page and the origin state', () => {
      renderSection(
        makeAreaSummary({
          ancestorContext: [
            makeAncestorContext('house', { name: 'House', depth: 0, workItemCount: 2 }),
          ],
        }),
      );

      const list = screen.getByRole('list', { name: now.contextLabel });
      expect(list).toBe(screen.getByTestId('area-context'));
      const items = within(list).getAllByRole('listitem');
      expect(items).toHaveLength(1);
      const link = within(items[0]!).getByRole('link');
      expect(link).toHaveAttribute('href', '/areas/house');
      fireEvent.click(link);
      expect(probedPath()).toBe('/areas/house');
      expect(probedOrigin()).toEqual(ORIGIN.origin);
    });

    it('words the entry by depth: building, floor, then "<name> itself (no sub-area)"', () => {
      renderSection(
        makeAreaSummary({
          ancestorContext: [
            makeAncestorContext('a0', { name: 'House', depth: 0, workItemCount: 1 }),
            makeAncestorContext('a1', { name: 'Ground floor', depth: 1, workItemCount: 1 }),
            makeAncestorContext('a2', { name: 'Kitchen', depth: 2, workItemCount: 1 }),
          ],
        }),
      );

      expect(screen.getByTestId('area-context-a0')).toHaveTextContent(
        /^Whole building \(no floor\)/,
      );
      expect(screen.getByTestId('area-context-a1')).toHaveTextContent(/^Whole floor \(no room\)/);
      expect(screen.getByTestId('area-context-a2')).toHaveTextContent(
        /^Kitchen itself \(no sub-area\)/,
      );
    });

    it('lists the non-zero counts only, tasks before purchases, joined with a middle dot', () => {
      renderSection(
        makeAreaSummary({
          ancestorContext: [
            makeAncestorContext('both', { depth: 0, workItemCount: 2, householdItemCount: 1 }),
            makeAncestorContext('tasks', { depth: 0, workItemCount: 1 }),
            makeAncestorContext('buys', { depth: 0, householdItemCount: 3 }),
          ],
        }),
      );

      expect(screen.getByTestId('area-context-both')).toHaveTextContent(
        'Whole building (no floor) · 2 tasks · 1 purchase',
      );
      expect(screen.getByTestId('area-context-tasks')).toHaveTextContent(
        /^Whole building \(no floor\) · 1 task$/,
      );
      expect(screen.getByTestId('area-context-buys')).toHaveTextContent(
        /^Whole building \(no floor\) · 3 purchases$/,
      );
    });

    it('is absent without ancestors with direct items', () => {
      renderSection(makeAreaSummary({ ancestorContext: [] }));

      expect(screen.queryByRole('list', { name: now.contextLabel })).toBeNull();
    });

    it('never adds the context counts to the footer totals', () => {
      renderSection(
        summaryWith({ ancestorContext: [makeAncestorContext('house', { workItemCount: 50 })] }, 2),
      );

      expect(screen.getByTestId('area-now-all-tasks')).toHaveTextContent('(2)');
    });
  });
});
