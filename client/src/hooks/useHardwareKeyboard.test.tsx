/**
 * @jest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeEach, jest } from '@jest/globals';
import type * as ReactType from 'react';
import type * as ReactDomClient from 'react-dom/client';
import type * as HookModule from './useHardwareKeyboard.js';

const originalMatchMedia = window.matchMedia;

function setFinePointer(fine: boolean) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: fine && query === '(any-pointer: fine)',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

type ActFn = (cb: () => void) => void;
let act: ActFn;
let mounted: Array<() => void> = [];
let renderHook: (hook: () => boolean) => {
  result: { readonly current: boolean };
  unmount: () => void;
};

// The "key seen" flag is module-level, so every test gets a fresh module graph. React is
// re-imported with it (and rendered with react-dom directly, because the testing library
// registers lifecycle hooks on import), otherwise the hook would run on a second React copy.
async function freshHook() {
  jest.resetModules();
  const React: typeof ReactType = await import('react');
  const { createRoot }: typeof ReactDomClient = await import('react-dom/client');
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  act = (cb) => React.act(cb);
  renderHook = (hook) => {
    const out = { current: false };
    function Probe() {
      out.current = hook();
      return null;
    }
    const root = createRoot(document.createElement('div'));
    let live = true;
    const unmount = () => {
      if (!live) return;
      live = false;
      act(() => root.unmount());
    };
    mounted.push(unmount);
    act(() => root.render(React.createElement(Probe)));
    return {
      result: {
        get current() {
          return out.current;
        },
      },
      unmount,
    };
  };
  const mod: typeof HookModule = await import('./useHardwareKeyboard.js');
  return mod.useHardwareKeyboard;
}

function keydownOn(target: Element) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
  });
}

describe('useHardwareKeyboard', () => {
  beforeEach(() => {
    setFinePointer(false);
    document.body.innerHTML = '';
  });
  afterEach(() => {
    mounted.forEach((unmount) => unmount());
    mounted = [];
    window.matchMedia = originalMatchMedia;
  });

  it('is false for a touch-only device before any key press', async () => {
    const useHardwareKeyboard = await freshHook();
    const { result } = renderHook(() => useHardwareKeyboard());
    expect(result.current).toBe(false);
  });

  it('is true when a fine pointer is available', async () => {
    setFinePointer(true);
    const useHardwareKeyboard = await freshHook();
    const { result } = renderHook(() => useHardwareKeyboard());
    expect(result.current).toBe(true);
  });

  it('becomes true after a key press outside an editable field', async () => {
    const useHardwareKeyboard = await freshHook();
    const { result } = renderHook(() => useHardwareKeyboard());
    keydownOn(document.body);
    expect(result.current).toBe(true);
  });

  it.each([
    ['input', () => document.createElement('input')],
    ['textarea', () => document.createElement('textarea')],
    ['select', () => document.createElement('select')],
    [
      'contenteditable element',
      () => {
        const div = document.createElement('div');
        div.setAttribute('contenteditable', 'true');
        return div;
      },
    ],
  ])('stays false for a key press inside a %s', async (_label, make) => {
    const useHardwareKeyboard = await freshHook();
    const { result } = renderHook(() => useHardwareKeyboard());
    const el = make();
    document.body.appendChild(el);
    keydownOn(el);
    expect(result.current).toBe(false);
  });

  it('treats a non-element target (document) as not editable', async () => {
    const useHardwareKeyboard = await freshHook();
    const { result } = renderHook(() => useHardwareKeyboard());
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    });
    expect(result.current).toBe(true);
  });

  it('remembers the key press for later subscribers and removes its listener when none remain', async () => {
    const useHardwareKeyboard = await freshHook();
    const removeSpy = jest.spyOn(document, 'removeEventListener');
    const first = renderHook(() => useHardwareKeyboard());
    keydownOn(document.body);
    first.unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    const second = renderHook(() => useHardwareKeyboard());
    expect(second.result.current).toBe(true);
    removeSpy.mockRestore();
  });

  it('shares one document listener across subscribers', async () => {
    const useHardwareKeyboard = await freshHook();
    const addSpy = jest.spyOn(document, 'addEventListener');
    const a = renderHook(() => useHardwareKeyboard());
    const b = renderHook(() => useHardwareKeyboard());
    const keydownAdds = addSpy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydownAdds).toHaveLength(1);
    a.unmount();
    b.unmount();
    addSpy.mockRestore();
  });
});
