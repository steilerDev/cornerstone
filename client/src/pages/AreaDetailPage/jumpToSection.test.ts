/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { jumpToSection } from './jumpToSection.js';

/**
 * Mutations caught: focus left on the section instead of its h2, an existing tabindex overwritten,
 * smooth scrolling under reduced motion, no-op for an unknown id throwing, scroll moving focus.
 */
describe('jumpToSection', () => {
  let scrollIntoView: jest.Mock<(arg?: unknown) => void>;
  const originalMatchMedia = window.matchMedia;

  function mountSection(headingAttrs = ''): HTMLElement {
    document.body.innerHTML = `
      <button id="before">before</button>
      <div id="area-cost"><section><h2 ${headingAttrs}>Cost</h2><p>Body</p></section></div>
      <div id="area-bare"><p>No heading here</p></div>`;
    const section = document.getElementById('area-cost')!;
    section.scrollIntoView = scrollIntoView as unknown as typeof section.scrollIntoView;
    return section;
  }

  function mockReducedMotion(reduced: boolean) {
    window.matchMedia = ((query: string) => ({
      matches: reduced && query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  }

  beforeEach(() => {
    scrollIntoView = jest.fn<(arg?: unknown) => void>();
    mockReducedMotion(false);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    document.body.innerHTML = '';
  });

  it('scrolls the section to the start smoothly and focuses its h2', () => {
    mountSection();

    jumpToSection('area-cost');

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    expect(document.activeElement).toBe(document.querySelector('h2'));
  });

  it('makes the h2 programmatically focusable with tabindex -1', () => {
    mountSection();

    jumpToSection('area-cost');

    expect(document.querySelector('h2')).toHaveAttribute('tabindex', '-1');
  });

  it('keeps a tabindex the h2 already has', () => {
    mountSection('tabindex="0"');

    jumpToSection('area-cost');

    expect(document.querySelector('h2')).toHaveAttribute('tabindex', '0');
    expect(document.activeElement).toBe(document.querySelector('h2'));
  });

  it('scrolls without animation under prefers-reduced-motion', () => {
    mockReducedMotion(true);
    mountSection();

    jumpToSection('area-cost');

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
  });

  it('treats a missing matchMedia as no reduced-motion preference', () => {
    (window as { matchMedia?: unknown }).matchMedia = undefined;
    mountSection();

    jumpToSection('area-cost');

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
  });

  it('scrolls a section without an h2 and moves focus nowhere', () => {
    mountSection();
    const target = document.getElementById('area-bare')!;
    target.scrollIntoView = scrollIntoView as unknown as typeof target.scrollIntoView;
    document.getElementById('before')!.focus();

    jumpToSection('area-bare');

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(document.getElementById('before'));
  });

  it('does nothing and does not throw for an unknown id', () => {
    mountSection();
    document.getElementById('before')!.focus();

    expect(() => jumpToSection('nope')).not.toThrow();

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.getElementById('before'));
  });

  it('does not throw when the element has no scrollIntoView (jsdom default)', () => {
    mountSection();
    const section = document.getElementById('area-cost')!;
    (section as { scrollIntoView?: unknown }).scrollIntoView = undefined;

    expect(() => jumpToSection('area-cost')).not.toThrow();
    expect(document.activeElement).toBe(document.querySelector('h2'));
  });
});
