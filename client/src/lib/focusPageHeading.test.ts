import { describe, it, expect, afterEach } from '@jest/globals';
import { focusPageHeading } from './focusPageHeading.js';

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
