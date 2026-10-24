import { describe, it, expect } from '@jest/globals';
import { gridKeyIntent } from './gridKeyboard.js';
import type { GridKeyEvent } from './gridKeyboard.js';

const ev = (key: string, mods: Partial<GridKeyEvent> = {}): GridKeyEvent => ({
  key,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

describe('gridKeyIntent', () => {
  it('Enter moves to the next row and Shift+Enter to the previous one in text cells', () => {
    expect(gridKeyIntent(ev('Enter'), 'text', false)).toBe('nextRow');
    expect(gridKeyIntent(ev('Enter', { shiftKey: true }), 'text', false)).toBe('prevRow');
  });

  it('keeps Enter native in pickers and buttons', () => {
    expect(gridKeyIntent(ev('Enter'), 'native', false)).toBeNull();
    expect(gridKeyIntent(ev('Enter'), 'button', false)).toBeNull();
  });

  it('maps vertical arrows only in text cells and never the horizontal ones', () => {
    expect(gridKeyIntent(ev('ArrowUp'), 'text', false)).toBe('up');
    expect(gridKeyIntent(ev('ArrowDown'), 'text', false)).toBe('down');
    expect(gridKeyIntent(ev('ArrowUp'), 'native', false)).toBeNull();
    expect(gridKeyIntent(ev('ArrowLeft'), 'text', false)).toBeNull();
    expect(gridKeyIntent(ev('ArrowRight'), 'text', false)).toBeNull();
    expect(gridKeyIntent(ev('ArrowDown', { shiftKey: true }), 'text', false)).toBeNull();
  });

  it('maps Ctrl and Cmd shortcuts', () => {
    expect(gridKeyIntent(ev('d', { ctrlKey: true }), 'native', false)).toBe('duplicate');
    expect(gridKeyIntent(ev('D', { metaKey: true }), 'text', false)).toBe('duplicate');
    expect(gridKeyIntent(ev('s', { ctrlKey: true }), 'text', false)).toBe('save');
    expect(gridKeyIntent(ev('Enter', { metaKey: true }), 'text', false)).toBe('save');
    expect(gridKeyIntent(ev('Backspace', { ctrlKey: true }), 'text', true)).toBe('removeRow');
    expect(gridKeyIntent(ev('Backspace', { ctrlKey: true }), 'text', false)).toBeNull();
    expect(gridKeyIntent(ev('x', { ctrlKey: true }), 'text', false)).toBeNull();
  });

  it('maps Escape in every cell kind and ignores Alt combinations', () => {
    expect(gridKeyIntent(ev('Escape'), 'native', false)).toBe('escape');
    expect(gridKeyIntent(ev('Enter', { altKey: true }), 'text', false)).toBeNull();
    expect(gridKeyIntent(ev('d', { ctrlKey: true, altKey: true }), 'text', false)).toBeNull();
    expect(gridKeyIntent(ev('a'), 'text', false)).toBeNull();
  });
});
