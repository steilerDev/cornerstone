/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createRef } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { installMatchMedia, type MatchMediaControl } from '../../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import {
  makeArea,
  makeMilestone,
  makePurchase,
  makeTask,
  makeTimeline,
} from '../../test/scheduleFixtures.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());
jest.unstable_mockModule('../../lib/localDate.js', () => ({
  todayLocalIsoDate: () => '2026-03-04',
}));

const { ScheduleAgenda } = await import('./ScheduleAgenda.js');

// 2026-03-02 .. 03-08 is the current week
const DATA = makeTimeline({
  workItems: [
    makeTask('a', {
      title: 'Roof',
      status: 'in_progress',
      projectedStartDate: '2026-03-03',
      projectedEndDate: '2026-03-12',
      area: makeArea('k'),
      assignedVendor: { id: 'v', name: 'Roof Co', trade: null },
    }),
    makeTask('late', {
      title: 'Plaster',
      isLate: true,
      lateDays: 2,
      projectedStartDate: '2026-03-04',
      projectedEndDate: '2026-03-05',
    }),
    makeTask('done', {
      title: 'Done thing',
      status: 'completed',
      projectedStartDate: '2026-03-02',
      projectedEndDate: '2026-03-03',
    }),
    makeTask('plain', {
      title: 'Plain',
      projectedStartDate: '2026-03-17',
      projectedEndDate: '2026-03-18',
    }),
  ],
  milestones: [
    makeMilestone(1, {
      title: 'Dry shell',
      projectedDate: '2026-03-05',
      targetDate: '2026-03-01',
      isLate: true,
      lateDays: 4,
    }),
    makeMilestone(2, {
      title: 'Reached',
      isCompleted: true,
      completedAt: '2026-03-02T08:00:00.000Z',
    }),
  ],
  householdItems: [
    makePurchase('sofa', {
      name: 'Sofa',
      status: 'purchased',
      targetDeliveryDate: '2026-03-10',
      area: makeArea('k'),
    }),
    makePurchase('lamp', {
      name: 'Lamp',
      isLate: true,
      latestDeliveryDate: '2026-03-01',
      targetDeliveryDate: '2026-03-04',
    }),
    makePurchase('chair', { name: 'Chair', status: 'arrived', actualDeliveryDate: '2026-03-03' }),
    makePurchase('table', { name: 'Table', status: 'scheduled', targetDeliveryDate: '2026-03-11' }),
  ],
});

let media: MatchMediaControl;
let scrollIntoView: jest.Mock;

beforeEach(() => {
  media = installMatchMedia();
  scrollIntoView = jest.fn();
  Element.prototype.scrollIntoView = scrollIntoView as never;
});

afterEach(() => {
  media.restore();
});

function setup(props: Partial<Parameters<typeof ScheduleAgenda>[0]> = {}) {
  const onSelect = jest.fn<(key: string, opener: HTMLElement) => void>();
  const utils = render(
    <ScheduleAgenda data={DATA} selectedKey={null} onSelect={onSelect as never} {...props} />,
  );
  return { ...utils, onSelect };
}

describe('ScheduleAgenda structure', () => {
  it('is a labelled section with one heading per week that holds an item', () => {
    setup();
    expect(screen.getByRole('region', { name: 'Agenda' })).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.getAttribute('data-testid'))).toEqual([
      'schedule-agenda-week-2026-03-02',
      'schedule-agenda-week-2026-03-09',
      'schedule-agenda-week-2026-03-16',
    ]);
    expect(headings[0]).toHaveTextContent(/^Week 10 · /);
  });

  it('marks only the current week with aria-current=date', () => {
    setup();
    expect(screen.getByTestId('schedule-agenda-week-2026-03-02')).toHaveAttribute(
      'aria-current',
      'date',
    );
    expect(screen.getByTestId('schedule-agenda-week-2026-03-09')).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('lists a task that spans weeks in each week it covers', () => {
    setup();
    expect(screen.getByTestId('schedule-agenda-row-task:a-2026-03-02')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-agenda-row-task:a-2026-03-09')).toBeInTheDocument();
    expect(screen.queryByTestId('schedule-agenda-row-task:a-2026-03-16')).toBeNull();
  });

  it('renders nothing but the section for an empty timeline', () => {
    setup({ data: makeTimeline() });
    expect(screen.getByTestId('schedule-agenda')).toBeEmptyDOMElement();
  });
});

describe('ScheduleAgenda rows', () => {
  const row = (key: string, monday = '2026-03-02') =>
    screen.getByTestId(`schedule-agenda-row-${key}-${monday}`);

  it('shows the title, area and company for a task and its status', () => {
    setup();
    expect(row('task:a')).toHaveTextContent('Roof');
    expect(row('task:a')).toHaveTextContent('Area k · Roof Co');
    expect(row('task:a')).toHaveTextContent('In progress');
  });

  it('a task without area or company has no subtitle', () => {
    setup();
    expect(row('task:plain', '2026-03-16').querySelectorAll('span').length).toBeLessThan(
      row('task:a').querySelectorAll('span').length,
    );
  });

  it('a late task shows the Late chip, a completed one never does', () => {
    setup();
    expect(row('task:late')).toHaveTextContent(/Late/);
    expect(row('task:done')).not.toHaveTextContent(/Late/);
  });

  it('a milestone shows its status; a late one is flagged', () => {
    setup();
    expect(row('milestone:1')).toHaveTextContent('Dry shell');
    expect(row('milestone:1')).toHaveTextContent(/Late/);
    expect(row('milestone:2')).toHaveTextContent('Reached');
  });

  it('a purchase shows its status, its area and a Late chip when late', () => {
    setup();
    expect(row('purchase:sofa', '2026-03-09')).toHaveTextContent('Sofa');
    expect(row('purchase:sofa', '2026-03-09')).toHaveTextContent('Area k');
    expect(row('purchase:lamp')).toHaveTextContent(/Late/);
    expect(row('purchase:chair')).not.toHaveTextContent(/Late/);
  });

  it('draws a bar for tasks and purchases and a diamond for a milestone, hidden from assistive tech', () => {
    setup();
    const bar = row('task:a').querySelector('[aria-hidden="true"] span') as HTMLElement;
    expect(bar.style.width).not.toBe('');
    expect(bar.className).toContain('inProgress');
    const diamond = row('milestone:1').querySelector('[aria-hidden="true"] span') as HTMLElement;
    expect(diamond.className).toContain('diamond');
    expect(diamond.className).toContain('lateDiamond');
    expect(row('milestone:2').querySelector('[aria-hidden="true"] span')!.className).not.toContain(
      'lateDiamond',
    );
  });

  it('colours bars by status and flags late ones', () => {
    setup();
    expect(row('task:done').querySelector('[aria-hidden="true"] span')!.className).toContain(
      'completed',
    );
    expect(row('task:late').querySelector('[aria-hidden="true"] span')!.className).toContain(
      'late',
    );
    expect(
      row('purchase:sofa', '2026-03-09').querySelector('[aria-hidden="true"] span')!.className,
    ).toContain('inProgress');
    expect(
      row('purchase:table', '2026-03-09').querySelector('[aria-hidden="true"] span')!.className,
    ).toContain('inProgress');
    expect(row('purchase:chair').querySelector('[aria-hidden="true"] span')!.className).toContain(
      'completed',
    );
  });

  it('marks the selected row', () => {
    setup({ selectedKey: 'task:a' });
    expect(row('task:a')).toHaveAttribute('aria-current', 'true');
    expect(row('task:a')).toHaveAttribute('data-selected', 'true');
    expect(row('task:late')).not.toHaveAttribute('aria-current');
  });

  it('selecting a row passes its key and the row button', () => {
    const { onSelect } = setup();
    fireEvent.click(row('task:late'));
    expect(onSelect.mock.calls[0]![0]).toBe('task:late');
    expect(onSelect.mock.calls[0]![1]).toBe(row('task:late'));
  });
});

describe('ScheduleAgenda scrolling', () => {
  it('scrolls once to the target week on first positioning, and not again after a refetch', () => {
    const { rerender } = setup();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    expect(scrollIntoView.mock.contexts[0]).toBe(
      screen.getByTestId('schedule-agenda-week-2026-03-02'),
    );
    rerender(<ScheduleAgenda data={{ ...DATA }} selectedKey={null} onSelect={() => {}} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('does not scroll while there are no weeks, then positions when the first appear', () => {
    const { rerender } = setup({ data: makeTimeline() });
    expect(scrollIntoView).not.toHaveBeenCalled();
    rerender(<ScheduleAgenda data={DATA} selectedKey={null} onSelect={() => {}} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('scrollToToday smooth-scrolls to the target week through the control ref', () => {
    const controlRef = createRef<{ scrollToToday(): void }>();
    setup({ controlRef });
    scrollIntoView.mockClear();
    act(() => controlRef.current!.scrollToToday());
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
  });

  it('uses an instant scroll when the user prefers reduced motion', () => {
    media.set('(prefers-reduced-motion: reduce)', true);
    const controlRef = createRef<{ scrollToToday(): void }>();
    setup({ controlRef });
    scrollIntoView.mockClear();
    act(() => controlRef.current!.scrollToToday());
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
  });

  it('scrollToToday does nothing when there is no week', () => {
    const controlRef = createRef<{ scrollToToday(): void }>();
    setup({ data: makeTimeline(), controlRef });
    act(() => controlRef.current!.scrollToToday());
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
