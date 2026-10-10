/**
 * @jest-environment node
 */
// Server rendering has no window or document: the hook must report "no hardware keyboard".
import { describe, it, expect } from '@jest/globals';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useHardwareKeyboard } from './useHardwareKeyboard.js';

function Probe() {
  return createElement('span', null, String(useHardwareKeyboard()));
}

describe('useHardwareKeyboard on the server', () => {
  it('renders as false without touching window or document', () => {
    expect(typeof window).toBe('undefined');
    expect(renderToString(createElement(Probe))).toContain('false');
  });
});
