/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { useScrolledPastHeading } from './useScrolledPastHeading.js';

type IOCallback = (entries: Array<Partial<IntersectionObserverEntry>>) => void;

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(
    public callback: IOCallback,
    public options: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  disconnect() {
    this.disconnected = true;
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
}

const live = () => FakeIntersectionObserver.instances.filter((i) => !i.disconnected);

function fire(
  entry: Partial<IntersectionObserverEntry>,
  observer: FakeIntersectionObserver = live().at(-1)!,
) {
  act(() => observer.callback([entry]));
}

const pastTop = { isIntersecting: false, boundingClientRect: { bottom: 10 } as DOMRectReadOnly };

describe('useScrolledPastHeading', () => {
  let header: HTMLElement;
  let main: HTMLElement;
  const realIO = globalThis.IntersectionObserver;

  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      FakeIntersectionObserver;
    document.body.innerHTML = '';
    header = document.createElement('header');
    header.getBoundingClientRect = () => ({ height: 56, bottom: 56 }) as DOMRect;
    main = document.createElement('main');
    main.innerHTML = '<h1>  Tasks  </h1>';
    document.body.append(header, main);
  });

  afterEach(() => {
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = realIO;
  });

  const setup = (h: HTMLElement | null = header, key = 'k1') =>
    renderHook(({ el, k }) => useScrolledPastHeading(el, k), { initialProps: { el: h, k: key } });

  it('is null until the heading scrolls under the bar', () => {
    const { result } = setup();
    expect(result.current).toBeNull();
    expect(live()).toHaveLength(1);
  });

  it('observes the h1 with the bar height as a negative top root margin', () => {
    setup();
    const [observer] = live();
    expect(observer!.observed).toEqual([main.querySelector('h1')]);
    expect(observer!.options).toEqual({ rootMargin: '-56px 0px 0px 0px', threshold: 0 });
  });

  it('shows the trimmed heading text once it is above the bar', () => {
    const { result } = setup();
    fire(pastTop);
    expect(result.current).toBe('Tasks');
  });

  it('uses rootBounds.top when present', () => {
    const { result } = setup();
    fire({
      isIntersecting: false,
      boundingClientRect: { bottom: 70 } as DOMRectReadOnly,
      rootBounds: { top: 56 } as DOMRectReadOnly,
    });
    expect(result.current).toBeNull();
    fire({
      isIntersecting: false,
      boundingClientRect: { bottom: 50 } as DOMRectReadOnly,
      rootBounds: { top: 56 } as DOMRectReadOnly,
    });
    expect(result.current).toBe('Tasks');
  });

  it('is null when the heading is below the fold (not intersecting, below the bar)', () => {
    const { result } = setup();
    fire({ isIntersecting: false, boundingClientRect: { bottom: 900 } as DOMRectReadOnly });
    expect(result.current).toBeNull();
  });

  it('hides the title again when the heading scrolls back into view', () => {
    const { result } = setup();
    fire(pastTop);
    expect(result.current).toBe('Tasks');
    fire({ isIntersecting: true, boundingClientRect: { bottom: 120 } as DOMRectReadOnly });
    expect(result.current).toBeNull();
  });

  it('ignores an empty entry list', () => {
    const { result } = setup();
    act(() => live()[0]!.callback([]));
    expect(result.current).toBeNull();
  });

  it('stays null for a heading with no text', () => {
    main.innerHTML = '<h1>   </h1>';
    const { result } = setup();
    fire(pastTop);
    expect(result.current).toBeNull();
  });

  it('resets on a new location key so a new page never shows the old title', () => {
    const { result, rerender } = setup();
    fire(pastTop);
    expect(result.current).toBe('Tasks');
    rerender({ el: header, k: 'k2' });
    expect(result.current).toBeNull();
  });

  it('attaches to a heading that appears later (lazy page) and detaches from the old one', async () => {
    main.innerHTML = '';
    const { result } = setup();
    expect(live()).toHaveLength(0);
    await act(async () => {
      main.innerHTML = '<h1>Schedule</h1>';
      await Promise.resolve();
    });
    expect(live()).toHaveLength(1);
    fire(pastTop);
    expect(result.current).toBe('Schedule');

    const first = live()[0]!;
    await act(async () => {
      main.innerHTML = '<h1>Calendar</h1>';
      await Promise.resolve();
    });
    expect(first.disconnected).toBe(true);
    fire(pastTop);
    expect(result.current).toBe('Calendar');
  });

  it('refreshes the shown text when the same heading changes', async () => {
    const { result } = setup();
    fire(pastTop);
    expect(result.current).toBe('Tasks');
    await act(async () => {
      main.querySelector('h1')!.textContent = 'Tasks (3)';
      await Promise.resolve();
    });
    expect(result.current).toBe('Tasks (3)');
  });

  it('clears the title when the heading is removed', async () => {
    const { result } = setup();
    fire(pastTop);
    await act(async () => {
      main.innerHTML = '<p>no heading</p>';
      await Promise.resolve();
    });
    expect(result.current).toBeNull();
  });

  it('is null without a header element', () => {
    const { result } = setup(null);
    expect(result.current).toBeNull();
    expect(live()).toHaveLength(0);
  });

  it('is null without a main landmark', () => {
    main.remove();
    const { result } = setup();
    expect(result.current).toBeNull();
    expect(live()).toHaveLength(0);
  });

  it('is null where IntersectionObserver is unavailable (jsdom)', () => {
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = undefined;
    const { result } = setup();
    expect(result.current).toBeNull();
  });

  it('disconnects its observers on unmount', () => {
    const { unmount } = setup();
    const [observer] = live();
    unmount();
    expect(observer!.disconnected).toBe(true);
  });
});
