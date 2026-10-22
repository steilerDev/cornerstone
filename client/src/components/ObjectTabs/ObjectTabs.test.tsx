/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRouterLog, RecordingRouter } from '../../test/recordingRouter';
import type { RouterLog } from '../../test/recordingRouter';
import { ObjectTabs } from './ObjectTabs.js';
import type { ObjectTabsProps } from './ObjectTabs.js';
import type { CountedObjectTabId, ObjectTabId } from './objectTabIds.js';
import { useObjectTabs } from './useObjectTabs.js';
import type { ObjectTabsController } from './useObjectTabs.js';

interface HarnessProps {
  readonly available: readonly ObjectTabId[];
  readonly counts?: ObjectTabsProps['counts'];
  readonly panels?: ObjectTabsProps['panels'];
  readonly onController?: (controller: ObjectTabsController) => void;
}

function Harness({ available, counts, panels, onController }: HarnessProps) {
  const controller = useObjectTabs(available);
  onController?.(controller);
  return (
    <ObjectTabs
      controller={controller}
      typeLabel="Task"
      counts={counts}
      panels={
        panels ??
        Object.fromEntries(available.map((id) => [id, () => <h2 key={id}>{`Panel ${id}`}</h2>]))
      }
    />
  );
}

function setup(url: string, props: HarnessProps) {
  const log: RouterLog = createRouterLog();
  const view = render(
    <RecordingRouter entries={[url]} log={log}>
      <Harness {...props} />
    </RecordingRouter>,
  );
  return { log, ...view };
}

const ALL: readonly ObjectTabId[] = ['overview', 'timing', 'cost', 'payments', 'diary'];

describe('ObjectTabs', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    Element.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
    window.matchMedia = originalMatchMedia;
  });

  it('renders a tablist named for the object type with canonical labels', () => {
    setup('/p', { available: ['diary', 'overview', 'timing'] });
    const list = screen.getByRole('tablist', { name: 'Task sections' });
    expect(Array.from(list.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent)).toEqual(
      ['Overview', 'Timing', 'Site diary'],
    );
  });

  it('wires roles, aria-selected, aria-controls and roving tabindex', () => {
    setup('/p?tab=timing', { available: ALL });
    const overview = screen.getByTestId('object-tabs-tab-overview');
    const timing = screen.getByTestId('object-tabs-tab-timing');
    expect(timing).toHaveAttribute('aria-selected', 'true');
    expect(timing).toHaveAttribute('tabindex', '0');
    expect(overview).toHaveAttribute('aria-selected', 'false');
    expect(overview).toHaveAttribute('tabindex', '-1');
    const panel = screen.getByTestId('object-tabs-panel-timing');
    expect(panel).toHaveAttribute('role', 'tabpanel');
    expect(timing.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(timing.id);
  });

  it('shows counts only on Cost, Payments and Site diary', () => {
    setup('/p', {
      available: ALL,
      counts: { cost: 0, payments: 123, diary: null },
    });
    expect(screen.getByTestId('object-tabs-tab-cost')).toHaveTextContent('Cost (0)');
    expect(screen.getByTestId('object-tabs-tab-payments')).toHaveTextContent('Payments (123)');
    expect(screen.getByTestId('object-tabs-tab-diary')).toHaveTextContent(/^Site diary$/);
  });

  it('ignores a count passed for an uncounted tab', () => {
    setup('/p', {
      available: ALL,
      counts: { overview: 4 } as unknown as Partial<Record<CountedObjectTabId, number | null>>,
    });
    expect(screen.getByTestId('object-tabs-tab-overview')).toHaveTextContent(/^Overview$/);
  });

  it('activates a tab on click with a replace navigation and removes the param for the first', () => {
    const { log } = setup('/p', { available: ALL });
    fireEvent.click(screen.getByTestId('object-tabs-tab-cost'));
    expect(log.actions).toEqual(['REPLACE /p?tab=cost']);
    expect(screen.getByTestId('object-tabs-tab-cost')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByTestId('object-tabs-tab-overview'));
    expect(log.actions).toEqual(['REPLACE /p?tab=cost', 'REPLACE /p']);
  });

  it('moves with ArrowRight/ArrowLeft (wrapping), Home and End, activating and focusing', () => {
    setup('/p', { available: ['overview', 'timing', 'cost'] });
    const list = screen.getByRole('tablist');
    const tab = (id: string) => screen.getByTestId(`object-tabs-tab-${id}`);

    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(tab('timing')).toHaveAttribute('aria-selected', 'true');
    expect(tab('timing')).toHaveFocus();

    fireEvent.keyDown(list, { key: 'End' });
    expect(tab('cost')).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(tab('overview')).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(tab('cost')).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(list, { key: 'Home' });
    expect(tab('overview')).toHaveAttribute('aria-selected', 'true');
    expect(tab('overview')).toHaveFocus();
  });

  it('ignores other keys', () => {
    const { log } = setup('/p', { available: ['overview', 'timing'] });
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'a' });
    expect(log.actions).toEqual([]);
  });

  it('renders no tablist for a single tab, only its bare panel', () => {
    setup('/p', { available: ['overview'] });
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Panel overview' })).toBeInTheDocument();
  });

  it('renders panels lazily and keeps a visited panel mounted but hidden', () => {
    const timingFactory = jest.fn(() => <h2>Timing body</h2>);
    setup('/p', {
      available: ['overview', 'timing'],
      panels: { overview: () => <h2>Overview body</h2>, timing: timingFactory },
    });
    expect(timingFactory).not.toHaveBeenCalled();
    expect(screen.queryByTestId('object-tabs-panel-timing')).toBeNull();

    fireEvent.click(screen.getByTestId('object-tabs-tab-timing'));
    expect(timingFactory).toHaveBeenCalled();
    expect(screen.getByTestId('object-tabs-panel-timing')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('object-tabs-panel-overview')).toHaveAttribute('hidden');
  });

  it('keeps state inside a visited panel across a tab switch', () => {
    function Counter() {
      const [n, setN] = useState(0);
      return (
        <button type="button" onClick={() => setN(n + 1)}>
          {`Clicked ${n}`}
        </button>
      );
    }
    setup('/p', {
      available: ['overview', 'timing'],
      panels: { overview: () => <Counter />, timing: () => <p>Timing</p> },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clicked 0' }));
    fireEvent.click(screen.getByTestId('object-tabs-tab-timing'));
    fireEvent.click(screen.getByTestId('object-tabs-tab-overview'));
    expect(screen.getByRole('button', { name: 'Clicked 1' })).toBeInTheDocument();
  });

  it('skips a tab without a panel factory', () => {
    setup('/p', { available: ['overview', 'timing'], panels: { overview: () => <p>O</p> } });
    fireEvent.click(screen.getByTestId('object-tabs-tab-timing'));
    expect(screen.queryByTestId('object-tabs-panel-timing')).toBeNull();
  });

  it('makes a panel a tab stop only while it holds nothing focusable', () => {
    setup('/p', {
      available: ['overview', 'timing'],
      panels: {
        overview: () => <p>Plain text</p>,
        timing: () => <button type="button">Inside</button>,
      },
    });
    expect(screen.getByTestId('object-tabs-panel-overview')).toHaveAttribute('tabindex', '0');
    fireEvent.click(screen.getByTestId('object-tabs-tab-timing'));
    expect(screen.getByTestId('object-tabs-panel-timing')).not.toHaveAttribute('tabindex');
  });

  it('drops the panel tab stop when focusable content appears later', () => {
    function Late() {
      const [show, setShow] = useState(false);
      return (
        <>
          <p>text</p>
          {show && <button type="button">Later</button>}
          <span role="presentation" data-testid="late-toggle" onClick={() => setShow(true)} />
        </>
      );
    }
    setup('/p', { available: ['overview', 'timing'], panels: { overview: () => <Late /> } });
    const panel = screen.getByTestId('object-tabs-panel-overview');
    expect(panel).toHaveAttribute('tabindex', '0');
    fireEvent.click(screen.getByTestId('late-toggle'));
    // The tab stop is re-evaluated whenever the panel re-renders (here: a tab switch).
    fireEvent.click(screen.getByTestId('object-tabs-tab-timing'));
    fireEvent.click(screen.getByTestId('object-tabs-tab-overview'));
    expect(panel).not.toHaveAttribute('tabindex');
  });

  it('focuses the first h2 of the panel for select(id, { focusPanel: true })', () => {
    let controller: ObjectTabsController | undefined;
    setup('/p', {
      available: ['overview', 'cost'],
      panels: {
        overview: () => <h2>Overview</h2>,
        cost: () => (
          <>
            <h2>Cost heading</h2>
            <h2>Second</h2>
          </>
        ),
      },
      onController: (c) => {
        controller = c;
      },
    });
    act(() => controller?.select('cost', { focusPanel: true }));
    expect(screen.getByRole('heading', { name: 'Cost heading' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Cost heading' })).toHaveAttribute('tabindex', '-1');
  });

  it('focuses the panel itself when it has no h2', () => {
    let controller: ObjectTabsController | undefined;
    setup('/p', {
      available: ['overview', 'cost'],
      panels: { overview: () => <p>o</p>, cost: () => <p>no heading</p> },
      onController: (c) => {
        controller = c;
      },
    });
    act(() => controller?.select('cost', { focusPanel: true }));
    expect(screen.getByTestId('object-tabs-panel-cost')).toHaveFocus();
  });

  it('scrolls the selected tab into view, smoothly after mount unless motion is reduced', () => {
    const scroll = jest.fn();
    Element.prototype.scrollIntoView = scroll;
    setup('/p', { available: ['overview', 'cost'] });
    expect(scroll).toHaveBeenLastCalledWith({
      inline: 'nearest',
      block: 'nearest',
      behavior: 'auto',
    });
    fireEvent.click(screen.getByTestId('object-tabs-tab-cost'));
    expect(scroll).toHaveBeenLastCalledWith({
      inline: 'nearest',
      block: 'nearest',
      behavior: 'smooth',
    });
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
    })) as unknown as typeof window.matchMedia;
    fireEvent.click(screen.getByTestId('object-tabs-tab-overview'));
    expect(scroll).toHaveBeenLastCalledWith({
      inline: 'nearest',
      block: 'nearest',
      behavior: 'auto',
    });
  });

  it('copes with a browser without scrollIntoView or matchMedia', () => {
    // @ts-expect-error simulating an old environment
    delete Element.prototype.scrollIntoView;
    expect(() => setup('/p', { available: ['overview', 'cost'] })).not.toThrow();
  });

  it('uses matchMedia absence as "motion allowed"', () => {
    Element.prototype.scrollIntoView = jest.fn();
    // @ts-expect-error simulating an old environment
    window.matchMedia = undefined;
    setup('/p', { available: ['overview', 'cost'] });
    fireEvent.click(screen.getByTestId('object-tabs-tab-cost'));
    expect(Element.prototype.scrollIntoView).toHaveBeenLastCalledWith(
      expect.objectContaining({ behavior: 'smooth' }),
    );
  });

  it('supports a custom id prefix for test ids', () => {
    const log = createRouterLog();
    function Custom(): ReactNode {
      const controller = useObjectTabs(['overview', 'cost']);
      return (
        <ObjectTabs
          controller={controller}
          typeLabel="Bill"
          idPrefix="bill-tabs"
          panels={{ overview: () => <p>o</p> }}
        />
      );
    }
    render(
      <RecordingRouter entries={['/p']} log={log}>
        <Custom />
      </RecordingRouter>,
    );
    expect(screen.getByTestId('bill-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('bill-tabs-tab-cost')).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Bill sections' })).toBeInTheDocument();
  });
});
