/**
 * @jest-environment jsdom
 *
 * The four facts of the Area page strip (#2251): Tasks, Expected cost, Photos, Companies, all over
 * the subtree. Real SummaryStrip and hook; only the locale is mocked.
 *
 * Mutations these tests catch:
 *  - the late remark shown at 0 late (or the remark missing when late > 0);
 *  - Paid shown at 0 (or lost), the Paid span not carrying data-figure="paid", or carrying the
 *    Expected cost amount with it;
 *  - an empty fact not showing the dash with its screen-reader text, a wrong default text for
 *    Expected cost ("Not set" is the SummaryStrip default, as on the Task and Purchase strips);
 *  - the Tasks / Photos facts linking without areaId or without the origin state;
 *  - the cost and companies facts navigating instead of jumping to their section.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AreaPageSummary } from '@cornerstone/shared';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeAreaSummary } from '../../test/areaPageFixtures.js';
import type { SummaryFact } from '../../components/SummaryStrip/SummaryStrip.js';
import type * as HookModule from './useAreaSummaryFacts.js';
import type * as StripModule from '../../components/SummaryStrip/SummaryStrip.js';
import enAreas from '../../i18n/en/areas.json';
import enCommon from '../../i18n/en/common.json';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

const mockJumpToSection = jest.fn<(id: string) => void>();
jest.unstable_mockModule('./jumpToSection.js', () => ({ jumpToSection: mockJumpToSection }));

let Hook: typeof HookModule;
let Strip: typeof StripModule;

const ORIGIN = { origin: { to: '/areas/floor', name: 'Ground floor' } };
const strip = enAreas.detail.strip;

function Host({
  summary,
  onFacts,
}: {
  summary: AreaPageSummary;
  onFacts?: (facts: SummaryFact[]) => void;
}) {
  const facts = Hook.useAreaSummaryFacts({ summary, originState: ORIGIN });
  onFacts?.(facts);
  return <Strip.SummaryStrip typeLabel={enAreas.detail.typeLabel} facts={facts} columns={4} />;
}

function renderFacts(summary: AreaPageSummary) {
  let captured: SummaryFact[] = [];
  render(
    <MemoryRouter>
      <OriginProbe />
      <Host summary={summary} onFacts={(f) => (captured = f)} />
    </MemoryRouter>,
  );
  return () => captured;
}

const fact = (id: string) => screen.getByTestId(`summary-fact-${id}`);

function withCounts(over: Partial<AreaPageSummary['counts']>, money?: AreaPageSummary['money']) {
  const base = makeAreaSummary();
  return makeAreaSummary({
    counts: { ...base.counts, ...over },
    ...(money ? { money } : {}),
  });
}

describe('useAreaSummaryFacts', () => {
  beforeEach(async () => {
    mockJumpToSection.mockReset();
    if (!Hook) {
      Hook = await import('./useAreaSummaryFacts.js');
      Strip = await import('../../components/SummaryStrip/SummaryStrip.js');
    }
  });

  it('returns the four facts in order and renders them as a 4-column strip named "Area summary"', () => {
    const facts = renderFacts(makeAreaSummary());

    expect(facts().map((f) => f.id)).toEqual(['tasks', 'cost', 'photos', 'companies']);
    expect(facts().map((f) => f.label)).toEqual([
      strip.tasks,
      strip.cost,
      strip.photos,
      strip.companies,
    ]);
    expect(
      screen.getByRole('region', {
        name: enCommon.summaryStrip.label.replace('{{type}}', enAreas.detail.typeLabel),
      }),
    ).toBeInTheDocument();
    expect(document.querySelector('dl')).toHaveAttribute('data-columns', '4');
  });

  describe('empty values', () => {
    it('shows a dash with the screen-reader text of each fact', () => {
      renderFacts(makeAreaSummary());

      expect(fact('tasks')).toHaveTextContent(`–${strip.noTasks}`);
      // Expected cost has no emptyText of its own: the SummaryStrip default
      expect(fact('cost')).toHaveTextContent(`–${enCommon.summaryStrip.notSet}`);
      expect(fact('photos')).toHaveTextContent(`–${strip.noneYet}`);
      expect(fact('companies')).toHaveTextContent(`–${strip.noneYet}`);
      expect(within(fact('tasks')).getByText('–')).toHaveAttribute('aria-hidden', 'true');
    });

    it('names an empty fact by its label then the screen-reader text', () => {
      renderFacts(makeAreaSummary());

      expect(fact('cost')).toHaveAccessibleName(
        `${strip.cost} ${enCommon.summaryStrip.notSet}`.replace(/\s+/g, ' '),
      );
      expect(fact('tasks')).toHaveAccessibleName(`${strip.tasks} ${strip.noTasks}`);
    });

    it('treats an Expected cost of 0 as empty even when Paid is set', () => {
      renderFacts(makeAreaSummary({ money: { expectedCost: 0, paid: 50 } }));

      expect(fact('cost')).toHaveTextContent(`–${enCommon.summaryStrip.notSet}`);
      expect(screen.queryByTestId('area-paid-figure')).toBeNull();
    });
  });

  describe('Tasks', () => {
    it('shows "n open" without a late remark when nothing is late', () => {
      renderFacts(withCounts({ workItems: { total: 5, open: 3, late: 0 } }));

      expect(fact('tasks')).toHaveTextContent('3 open');
      expect(fact('tasks')).not.toHaveTextContent('late');
      expect(fact('tasks').querySelector('.remark')).toBeNull();
    });

    it('adds "· m late" as a text remark when m > 0', () => {
      renderFacts(withCounts({ workItems: { total: 5, open: 3, late: 2 } }));

      expect(fact('tasks')).toHaveTextContent('3 open · 2 late');
      expect(fact('tasks').querySelector('.remark')).toHaveTextContent('· 2 late');
    });

    it('shows "0 open" (not empty) when every task is finished', () => {
      renderFacts(withCounts({ workItems: { total: 4, open: 0, late: 0 } }));

      expect(fact('tasks')).toHaveTextContent('0 open');
      expect(fact('tasks')).not.toHaveTextContent(strip.noTasks);
    });

    it('links to the Tasks list filtered by the area and carries the origin', () => {
      renderFacts(withCounts({ workItems: { total: 1, open: 1, late: 0 } }));

      expect(fact('tasks')).toHaveAttribute('href', '/project/work-items?areaId=floor');
      fireEvent.click(fact('tasks'));
      expect(probedPath()).toBe('/project/work-items');
      expect(probedOrigin()).toEqual(ORIGIN.origin);
    });
  });

  describe('Expected cost', () => {
    it('shows the formatted gross amount alone when nothing is paid', () => {
      renderFacts(makeAreaSummary({ money: { expectedCost: 12000, paid: 0 } }));

      expect(fact('cost')).toHaveTextContent('€12,000.00');
      expect(fact('cost')).not.toHaveTextContent(strip.paid);
      expect(screen.queryByTestId('area-paid-figure')).toBeNull();
    });

    it('adds "· Paid €x" with the amount in a data-figure="paid" span', () => {
      renderFacts(makeAreaSummary({ money: { expectedCost: 12000, paid: 3000 } }));

      expect(fact('cost')).toHaveTextContent('€12,000.00 · Paid €3,000.00');
      const paid = screen.getByTestId('area-paid-figure');
      expect(paid).toHaveAttribute('data-figure', 'paid');
      expect(paid.textContent).toBe('€3,000.00');
    });

    it('keeps the Paid label and separator outside the figure span', () => {
      renderFacts(makeAreaSummary({ money: { expectedCost: 500, paid: 100 } }));

      const paid = screen.getByTestId('area-paid-figure');
      expect(paid.textContent).not.toContain(strip.paid);
      expect(paid.parentElement).toHaveTextContent(`· ${strip.paid} €100.00`);
    });

    it('jumps to the Cost section on a plain click instead of navigating', () => {
      renderFacts(makeAreaSummary({ money: { expectedCost: 500, paid: 0 } }));

      expect(fact('cost')).toHaveAttribute('href', '#area-cost');
      fireEvent.click(fact('cost'));
      expect(mockJumpToSection).toHaveBeenCalledTimes(1);
      expect(mockJumpToSection).toHaveBeenCalledWith('area-cost');
    });

    it('lets a modified click (new tab) pass through without jumping', () => {
      renderFacts(makeAreaSummary({ money: { expectedCost: 500, paid: 0 } }));

      fireEvent.click(fact('cost'), { ctrlKey: true });

      expect(mockJumpToSection).not.toHaveBeenCalled();
    });
  });

  describe('Photos', () => {
    it('shows the count with "· latest <date>"', () => {
      renderFacts(withCounts({ photos: { total: 7, latestDate: '2026-03-05' } }));

      expect(fact('photos')).toHaveTextContent(/^7 · latest .*2026/);
      expect(fact('photos').querySelector('.remark')).toHaveTextContent('· latest');
    });

    it('shows only the count when there is no latest date', () => {
      renderFacts(withCounts({ photos: { total: 2, latestDate: null } }));

      expect(fact('photos').textContent).toBe('2');
    });

    it('links to the Photos page filtered by the area, with the origin', () => {
      renderFacts(withCounts({ photos: { total: 2, latestDate: null } }));

      expect(fact('photos')).toHaveAttribute('href', '/photos?areaId=floor');
      fireEvent.click(fact('photos'));
      expect(probedPath()).toBe('/photos');
      expect(probedOrigin()).toEqual(ORIGIN.origin);
    });
  });

  describe('Companies', () => {
    it('shows the distinct count and jumps to the Companies section', () => {
      renderFacts(withCounts({ companies: 3 }));

      expect(fact('companies').textContent).toBe('3');
      expect(fact('companies')).toHaveAttribute('href', '#area-companies');
      fireEvent.click(fact('companies'));
      expect(mockJumpToSection).toHaveBeenCalledWith('area-companies');
    });

    it('carries no figure marker', () => {
      renderFacts(withCounts({ companies: 3 }));

      expect(fact('companies').querySelector('[data-figure]')).toBeNull();
    });
  });
});
