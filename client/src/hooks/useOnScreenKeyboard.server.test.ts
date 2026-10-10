/**
 * @jest-environment node
 */
// Server rendering has no window: the keyboard hook must report "closed" instead of throwing.
import { describe, it, expect } from '@jest/globals';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useOnScreenKeyboard } from './useOnScreenKeyboard.js';

function Probe() {
  return createElement('span', null, String(useOnScreenKeyboard()));
}

describe('useOnScreenKeyboard on the server', () => {
  it('renders as closed (false) without touching window', () => {
    expect(typeof window).toBe('undefined');
    expect(renderToString(createElement(Probe))).toContain('false');
  });
});
