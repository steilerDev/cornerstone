/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useSectionHashFocus } from './useSectionHashFocus.js';

const ANCHORS = ['alpha', 'beta'] as const;

function Harness({ settled }: { settled: boolean }) {
  useSectionHashFocus(ANCHORS, settled);
  return (
    <div>
      <section id="alpha">
        <h2 id="alpha-heading" tabIndex={-1}>
          Alpha
        </h2>
      </section>
      <section id="beta">
        <h2 id="beta-heading" tabIndex={-1}>
          Beta
        </h2>
      </section>
      <button type="button" id="other">
        other
      </button>
    </div>
  );
}

function renderAt(hash: string, settled = false) {
  const ui = (s: boolean) => (
    <MemoryRouter initialEntries={[`/page${hash}`]}>
      <Harness settled={s} />
    </MemoryRouter>
  );
  const view = render(ui(settled));
  return { ...view, rerenderSettled: (s: boolean) => view.rerender(ui(s)) };
}

describe('useSectionHashFocus', () => {
  let scrollSpy: jest.Mock;
  let frames: FrameRequestCallback[];

  const flushFrames = () => {
    act(() => {
      const pending = frames;
      frames = [];
      pending.forEach((cb) => cb(0));
    });
  };

  beforeEach(() => {
    frames = [];
    scrollSpy = jest.fn();
    Element.prototype.scrollIntoView =
      scrollSpy as unknown as typeof Element.prototype.scrollIntoView;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('focuses the heading of a matching hash after a frame and scrolls it into view', () => {
    renderAt('#beta');
    expect(document.activeElement).toBe(document.body);

    flushFrames();

    expect(document.activeElement).toBe(document.getElementById('beta-heading'));
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
  });

  it('scrolls without animation when the user prefers reduced motion', () => {
    window.matchMedia = ((query: string) =>
      ({ matches: true, media: query }) as MediaQueryList) as typeof window.matchMedia;

    renderAt('#alpha');
    flushFrames();

    expect(scrollSpy).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
  });

  it('ignores an unknown hash', () => {
    renderAt('#nope');

    flushFrames();

    expect(document.activeElement).toBe(document.body);
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('does nothing without a hash', () => {
    renderAt('');

    flushFrames();

    expect(document.activeElement).toBe(document.body);
  });

  it('falls back to the element with the anchor id when there is no heading', () => {
    function Bare() {
      useSectionHashFocus(['solo'], true);
      return <div id="solo" tabIndex={-1} />;
    }
    render(
      <MemoryRouter initialEntries={['/p#solo']}>
        <Bare />
      </MemoryRouter>,
    );

    flushFrames();

    expect(document.activeElement).toBe(document.getElementById('solo'));
  });

  it('does nothing when neither heading nor element exists', () => {
    function Missing() {
      useSectionHashFocus(['ghost'], true);
      return <div />;
    }
    render(
      <MemoryRouter initialEntries={['/p#ghost']}>
        <Missing />
      </MemoryRouter>,
    );

    flushFrames();

    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('re-scrolls when settled flips, only while the heading still has focus', () => {
    const { rerenderSettled } = renderAt('#alpha', false);
    flushFrames();
    expect(scrollSpy).toHaveBeenCalledTimes(1);

    rerenderSettled(true);
    flushFrames();
    expect(scrollSpy).toHaveBeenCalledTimes(2);
  });

  it('does not re-scroll after the user moved focus elsewhere', () => {
    const { rerenderSettled } = renderAt('#alpha', false);
    flushFrames();
    expect(scrollSpy).toHaveBeenCalledTimes(1);

    act(() => document.getElementById('other')?.focus());
    rerenderSettled(true);
    flushFrames();

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(document.getElementById('other'));
  });
});
