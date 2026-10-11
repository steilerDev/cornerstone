import { describe, it, expect, afterEach, beforeEach, jest } from '@jest/globals';
import { focusPageHeading, focusPageHeadingWhenReady } from './focusPageHeading.js';

describe('focusPageHeading', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses the heading inside <main> and makes it programmatically focusable', () => {
    document.body.innerHTML = '<h1 id="outside">Outside</h1><main><h1 id="inside">Page</h1></main>';
    focusPageHeading();
    const h1 = document.getElementById('inside')!;
    expect(document.activeElement).toBe(h1);
    expect(h1.getAttribute('tabindex')).toBe('-1');
  });

  it('falls back to the first h1 when there is no <main>', () => {
    document.body.innerHTML = '<h1 id="only">Only</h1>';
    focusPageHeading();
    expect(document.activeElement).toBe(document.getElementById('only'));
  });

  it('keeps an existing tabindex', () => {
    document.body.innerHTML = '<main><h1 id="h" tabindex="0">Page</h1></main>';
    focusPageHeading();
    expect(document.getElementById('h')!.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(document.getElementById('h'));
  });

  it('does nothing and does not throw when the page has no heading', () => {
    document.body.innerHTML = '<main><p>No heading</p></main>';
    expect(() => focusPageHeading()).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('focusPageHeadingWhenReady', () => {
  let queue: Array<() => void>;
  let cancelled: number[];

  beforeEach(() => {
    queue = [];
    cancelled = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      queue.push(() => cb(0));
      return queue.length;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      cancelled.push(id);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /** Runs the frames queued so far (frames queued while running wait for the next call). */
  const frame = () => {
    const run = queue.splice(0);
    run.forEach((fn) => fn());
  };

  it('keeps waiting while the only heading is the one on screen, then focuses the new one', () => {
    document.body.innerHTML = '<main><h1 id="old">Old</h1></main>';
    focusPageHeadingWhenReady();
    frame();
    frame();
    expect(document.activeElement).toBe(document.body);

    document.querySelector('main')!.innerHTML = '<h1 id="new">New</h1>';
    frame();
    expect(document.activeElement).toBe(document.getElementById('new'));
    expect(document.getElementById('new')!.getAttribute('tabindex')).toBe('-1');
  });

  it('focuses a heading that appears when there was none before', () => {
    focusPageHeadingWhenReady();
    frame();
    document.body.innerHTML = '<main><h1 id="first">First</h1></main>';
    frame();
    expect(document.activeElement).toBe(document.getElementById('first'));
  });

  it('keeps an existing tabindex on the new heading', () => {
    document.body.innerHTML = '<main><h1 id="old">Old</h1></main>';
    focusPageHeadingWhenReady();
    document.querySelector('main')!.innerHTML = '<h1 id="new" tabindex="0">New</h1>';
    frame();
    expect(document.getElementById('new')!.getAttribute('tabindex')).toBe('0');
  });

  it('re-focuses the heading when a reload drops focus to the body', () => {
    document.body.innerHTML = '<main><h1 id="old">Old</h1></main>';
    focusPageHeadingWhenReady();
    document.querySelector('main')!.innerHTML = '<h1 id="new">New</h1>';
    frame();
    expect(document.activeElement).toBe(document.getElementById('new'));

    // The page re-renders its heading (focus falls to <body>).
    document.querySelector('main')!.innerHTML = '<h1 id="new2">New again</h1>';
    expect(document.activeElement).toBe(document.body);
    frame();
    expect(document.activeElement).toBe(document.getElementById('new2'));
  });

  it('stops once the user moves focus elsewhere', () => {
    document.body.innerHTML = '<main><h1 id="old">Old</h1></main><button id="b">b</button>';
    focusPageHeadingWhenReady();
    document.getElementById('old')!.insertAdjacentHTML('afterend', '<h1 id="new">New</h1>');
    document.getElementById('old')!.remove();
    frame();
    expect(document.activeElement).toBe(document.getElementById('new'));

    document.getElementById('b')!.focus();
    document.querySelector('main')!.innerHTML = '<h1 id="later">Later</h1>';
    frame();
    frame();
    expect(document.activeElement).toBe(document.getElementById('b'));
  });

  it('falls back to the current heading after the frame limit', () => {
    document.body.innerHTML = '<main><h1 id="old">Old</h1></main>';
    focusPageHeadingWhenReady(3);
    frame();
    frame();
    expect(document.activeElement).toBe(document.body);
    frame();
    expect(document.activeElement).toBe(document.getElementById('old'));
    expect(queue).toHaveLength(0);
  });

  it('does not run the fallback when a new heading was already focused', () => {
    document.body.innerHTML = '<main><h1 id="old">Old</h1></main>';
    focusPageHeadingWhenReady(2);
    document.querySelector('main')!.innerHTML = '<h1 id="new">New</h1>';
    frame();
    frame();
    expect(document.activeElement).toBe(document.getElementById('new'));
    expect(queue).toHaveLength(0);
  });

  it('the returned cancel stops the loop and cancels the pending frame', () => {
    document.body.innerHTML = '<main><h1 id="old">Old</h1></main>';
    const cancel = focusPageHeadingWhenReady();
    cancel();
    expect(cancelled).toHaveLength(1);
    document.querySelector('main')!.innerHTML = '<h1 id="new">New</h1>';
    frame();
    expect(document.activeElement).toBe(document.body);
    expect(queue).toHaveLength(0);
  });
});
