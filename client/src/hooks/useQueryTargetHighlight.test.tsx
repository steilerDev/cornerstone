/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, render } from '@testing-library/react';
import { Router } from 'react-router-dom';
import type { Location, Navigator, To } from 'react-router-dom';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import { useQueryTargetHighlight } from './useQueryTargetHighlight.js';

// A fixed-location router: `replace` is recorded but never moves the location, so the "once per
// location key" rule can be tested on its own.
function makeLocation(search: string, key = 'k1', state: unknown = { origin: { to: '/diary' } }) {
  return { pathname: '/budget/invoices/inv-1', search, hash: '#top', state, key } as Location;
}

interface Replace {
  to: To;
  state: unknown;
}

function makeNavigator(replaces: Replace[]): Navigator {
  return {
    createHref: (to) => (typeof to === 'string' ? to : `${to.pathname ?? ''}${to.search ?? ''}`),
    go: () => {},
    push: () => {},
    replace: (to, state) => {
      replaces.push({ to, state });
    },
  };
}

interface HarnessProps {
  ready?: boolean;
  onMissing?: () => void;
  durationMs?: number;
}

function Harness({ ready = true, onMissing, durationMs }: HarnessProps) {
  useQueryTargetHighlight({
    param: 'payment',
    ready,
    selector: (id) => `[data-payment-id="${id}"]`,
    highlightClassName: 'hl',
    onMissing,
    durationMs,
  });
  return (
    <div>
      <div data-payment-id="dep-1" tabIndex={-1} data-testid="t1" />
      <div data-payment-id="dep-2" tabIndex={-1} data-testid="t2" />
    </div>
  );
}

let replaces: Replace[];
let scrollIntoView: jest.Mock<(arg?: ScrollIntoViewOptions) => void>;
let media: MatchMediaControl;

function mount(search: string, props: HarnessProps = {}, key = 'k1', state?: unknown) {
  const navigator = makeNavigator(replaces);
  const tree = (loc: Location, p: HarnessProps) => (
    <Router location={loc} navigator={navigator}>
      <Harness {...p} />
    </Router>
  );
  const view = render(tree(makeLocation(search, key, state), props));
  return {
    ...view,
    rerenderWith: (nextSearch: string, nextProps: HarnessProps = props, nextKey = key) =>
      view.rerender(tree(makeLocation(nextSearch, nextKey, state), nextProps)),
  };
}

const el = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement;

beforeEach(() => {
  jest.useFakeTimers();
  replaces = [];
  scrollIntoView = jest.fn();
  HTMLElement.prototype.scrollIntoView = scrollIntoView as never;
  media = installMatchMedia();
});

afterEach(() => {
  jest.useRealTimers();
  media.restore();
  delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('useQueryTargetHighlight', () => {
  it('scrolls to, focuses and highlights the target, smooth by default', () => {
    mount('?payment=dep-1');

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    expect(el('t1')).toHaveFocus();
    expect(el('t1')).toHaveClass('hl');
    expect(el('t2')).not.toHaveClass('hl');
  });

  it('focuses without scrolling the page (preventScroll)', () => {
    const focus = jest.spyOn(HTMLElement.prototype, 'focus');
    mount('?payment=dep-1');
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });

  it('removes the highlight after 3000 ms and not before', () => {
    mount('?payment=dep-1');

    act(() => {
      jest.advanceTimersByTime(2999);
    });
    expect(el('t1')).toHaveClass('hl');
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(el('t1')).not.toHaveClass('hl');
  });

  it('honours a custom duration', () => {
    mount('?payment=dep-1', { durationMs: 500 });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(el('t1')).not.toHaveClass('hl');
  });

  it('scrolls instantly under reduced motion', () => {
    media.set('(prefers-reduced-motion: reduce)', true);
    mount('?payment=dep-1');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
  });

  it('drops only the param with a replace and keeps path, other params, hash and the state', () => {
    const state = { origin: { to: '/diary?filterMode=all' } };
    mount('?tab=payments&payment=dep-1', {}, 'k1', state);

    expect(replaces).toHaveLength(1);
    expect(replaces[0]!.to).toEqual({
      pathname: '/budget/invoices/inv-1',
      search: '?tab=payments',
      hash: '#top',
    });
    expect(replaces[0]!.state).toBe(state);
  });

  it('leaves an empty search when the param was the only one', () => {
    mount('?payment=dep-1');
    expect(replaces[0]!.to).toMatchObject({ search: '' });
  });

  it('prefers the visible candidate when the row and the card are both mounted', () => {
    // jsdom has no layout: mark the second element as the visible one.
    const rects = jest.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
      this: HTMLElement,
    ) {
      return (this.dataset.testid === 't2' ? [{}] : []) as unknown as DOMRectList;
    });
    // Same id on both: reuse dep-2 for t1 by pointing the param at an id both share.
    const sharedHarness = () => {
      const a = document.createElement('div');
      a.dataset.paymentId = 'shared';
      a.dataset.testid = 'hidden-copy';
      a.tabIndex = -1;
      const b = document.createElement('div');
      b.dataset.paymentId = 'shared';
      b.dataset.testid = 't2';
      b.tabIndex = -1;
      document.body.append(a, b);
      return { a, b };
    };
    const { a, b } = sharedHarness();
    mount('?payment=shared');

    expect(b).toHaveFocus();
    expect(b).toHaveClass('hl');
    expect(a).not.toHaveClass('hl');
    rects.mockRestore();
    a.remove();
    b.remove();
  });

  it('falls back to the first candidate when none is visible (jsdom)', () => {
    mount('?payment=dep-2');
    expect(el('t2')).toHaveFocus();
  });

  it('calls onMissing for an unknown id, focuses nothing, and still drops the param', () => {
    const onMissing = jest.fn();
    mount('?payment=gone', { onMissing });

    expect(onMissing).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.body).toHaveFocus();
    expect(replaces).toHaveLength(1);
    expect(replaces[0]!.to).toMatchObject({ search: '' });
  });

  it('does not call onMissing when the target exists', () => {
    const onMissing = jest.fn();
    mount('?payment=dep-1', { onMissing });
    expect(onMissing).not.toHaveBeenCalled();
  });

  it('does nothing without the param', () => {
    mount('?tab=payments');
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(replaces).toEqual([]);
  });

  it('waits until ready, then runs once', () => {
    const view = mount('?payment=dep-1', { ready: false });
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(replaces).toEqual([]);

    view.rerenderWith('?payment=dep-1', { ready: true });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(replaces).toHaveLength(1);
  });

  it('does not run twice for the same location key', () => {
    const view = mount('?payment=dep-1');
    view.rerenderWith('?payment=dep-1', { durationMs: 1234 });
    view.rerenderWith('?payment=dep-1', { durationMs: 1234, onMissing: jest.fn() });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(replaces).toHaveLength(1);
  });

  it('runs again for a new location key with the param', () => {
    const view = mount('?payment=dep-1', {}, 'k1');
    view.rerenderWith('?payment=dep-2', {}, 'k2');

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(el('t2')).toHaveFocus();
    expect(replaces).toHaveLength(2);
  });

  it('clears its timer and the highlight on unmount', () => {
    const clear = jest.spyOn(globalThis, 'clearTimeout');
    const view = mount('?payment=dep-1');
    const target = el('t1');
    expect(target).toHaveClass('hl');

    view.unmount();

    expect(clear).toHaveBeenCalled();
    expect(target).not.toHaveClass('hl');
    clear.mockRestore();
  });

  it('survives an environment without scrollIntoView and matchMedia', () => {
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    media.restore();
    const original = window.matchMedia;
    // @ts-expect-error simulate a browser without matchMedia
    delete window.matchMedia;
    try {
      mount('?payment=dep-1');
      expect(el('t1')).toHaveFocus();
      expect(el('t1')).toHaveClass('hl');
    } finally {
      window.matchMedia = original;
    }
  });
});
