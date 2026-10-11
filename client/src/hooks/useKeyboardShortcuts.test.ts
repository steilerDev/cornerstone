import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createElement, type ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts.js';
import { ShortcutRegistryProvider, useShortcutRegistry } from './shortcutRegistry.js';
import type { KeyboardShortcut } from './useKeyboardShortcuts.js';

describe('useKeyboardShortcuts', () => {
  let mockHandler: jest.Mock<() => void>;
  let shortcuts: KeyboardShortcut[];

  beforeEach(() => {
    mockHandler = jest.fn<() => void>();
    shortcuts = [
      { key: 'n', handler: mockHandler, description: 'New item' },
      { key: 'Escape', handler: mockHandler, description: 'Close' },
      { key: 'ArrowUp', handler: mockHandler, description: 'Move up' },
    ];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call handler when registered key is pressed', () => {
    renderHook(() => useKeyboardShortcuts(shortcuts));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    });

    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  it('should NOT call handler for unregistered keys', () => {
    renderHook(() => useKeyboardShortcuts(shortcuts));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    });

    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should support special keys (Escape, ArrowUp, ArrowDown)', () => {
    renderHook(() => useKeyboardShortcuts(shortcuts));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(mockHandler).toHaveBeenCalledTimes(1);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    });

    expect(mockHandler).toHaveBeenCalledTimes(2);
  });

  it('should NOT call handler when input is focused', () => {
    renderHook(() => useKeyboardShortcuts(shortcuts));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
    });

    expect(mockHandler).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('should NOT call handler when textarea is focused', () => {
    renderHook(() => useKeyboardShortcuts(shortcuts));

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
    });

    expect(mockHandler).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });

  it('should NOT call handler when select is focused', () => {
    renderHook(() => useKeyboardShortcuts(shortcuts));

    const select = document.createElement('select');
    document.body.appendChild(select);
    select.focus();

    act(() => {
      select.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
    });

    expect(mockHandler).not.toHaveBeenCalled();

    document.body.removeChild(select);
  });

  it('should NOT call handler when contentEditable element is focused', () => {
    renderHook(() => useKeyboardShortcuts(shortcuts));

    // Create a contentEditable div
    const div = document.createElement('div');
    div.contentEditable = 'true';

    // jsdom doesn't implement isContentEditable, so we need to define it
    Object.defineProperty(div, 'isContentEditable', {
      value: true,
      configurable: true,
    });

    document.body.appendChild(div);
    div.focus();

    act(() => {
      div.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
    });

    expect(mockHandler).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it('should clean up event listener on unmount', () => {
    const { unmount } = renderHook(() => useKeyboardShortcuts(shortcuts));

    unmount();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    });

    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should return shortcuts list', () => {
    const { result } = renderHook(() => useKeyboardShortcuts(shortcuts));

    expect(result.current).toEqual(shortcuts);
  });

  it('should prevent default for registered shortcuts', () => {
    renderHook(() => useKeyboardShortcuts(shortcuts));

    const event = new KeyboardEvent('keydown', { key: 'n' });
    const preventDefaultSpy = jest.spyOn(event, 'preventDefault');

    act(() => {
      document.dispatchEvent(event);
    });

    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});

describe('useKeyboardShortcuts registry integration', () => {
  const list: KeyboardShortcut[] = [{ key: 'n', handler: () => {}, description: 'New item' }];
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(ShortcutRegistryProvider, null, children);

  it('registers its list in the surrounding provider', () => {
    const { result } = renderHook(
      () => {
        useKeyboardShortcuts(list);
        return useShortcutRegistry();
      },
      { wrapper },
    );
    expect(result.current?.snapshot()).toEqual(list);
  });

  it('removes its entries from the registry when the page unmounts', () => {
    // One provider instance, two siblings: a page hook and a registry reader.
    const holder: { registry: ReturnType<typeof useShortcutRegistry> } = { registry: null };
    const Provider = ({ children }: { children: ReactNode }) =>
      createElement(ShortcutRegistryProvider, null, children);
    const reader = renderHook(
      () => {
        holder.registry = useShortcutRegistry();
      },
      { wrapper: Provider },
    );
    expect(holder.registry?.snapshot()).toEqual([]);
    // The registry is per provider, so register through the same hook instance
    const page = renderHook(
      () => {
        useKeyboardShortcuts(list);
        holder.registry = useShortcutRegistry();
      },
      { wrapper: Provider },
    );
    const own = holder.registry;
    expect(own?.snapshot()).toEqual(list);
    page.unmount();
    expect(own?.snapshot()).toEqual([]);
    reader.unmount();
  });

  it('still handles keys and does not throw without a provider', () => {
    const handler = jest.fn<() => void>();
    expect(() =>
      renderHook(() => useKeyboardShortcuts([{ key: 'q', handler, description: 'Q' }])),
    ).not.toThrow();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('useKeyboardShortcuts (#2212 fallback and modal guard)', () => {
  const press = (key: string, init: KeyboardEventInit = {}) =>
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }));
    });

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(ShortcutRegistryProvider, null, children);

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('a fallback shortcut fires when no other owner has the key', () => {
    const handler = jest.fn<() => void>();
    renderHook(
      () =>
        useKeyboardShortcuts([{ key: 'n', handler, description: 'fallback' }], { fallback: true }),
      { wrapper },
    );
    press('n');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('a page n beats the fallback n (only the page handler runs)', () => {
    const fallback = jest.fn<() => void>();
    const page = jest.fn<() => void>();
    renderHook(
      () => {
        useKeyboardShortcuts([{ key: 'n', handler: fallback, description: 'shell' }], {
          fallback: true,
        });
        useKeyboardShortcuts([{ key: 'n', handler: page, description: 'page' }]);
      },
      { wrapper },
    );
    press('n');
    expect(page).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('the fallback fires again once the page owner unmounts', () => {
    const fallback = jest.fn<() => void>();
    const page = jest.fn<() => void>();
    const both = renderHook(
      ({ withPage }: { withPage: boolean }) => {
        useKeyboardShortcuts([{ key: 'n', handler: fallback, description: 'shell' }], {
          fallback: true,
        });
        useKeyboardShortcuts(withPage ? [{ key: 'n', handler: page, description: 'page' }] : []);
      },
      { wrapper, initialProps: { withPage: true } },
    );
    press('n');
    expect(fallback).not.toHaveBeenCalled();
    both.rerender({ withPage: false });
    press('n');
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('page shortcuts are off while an aria-modal element exists', () => {
    const handler = jest.fn<() => void>();
    renderHook(() => useKeyboardShortcuts([{ key: 'n', handler, description: 'n' }]));
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    press('n');
    expect(handler).not.toHaveBeenCalled();
    modal.remove();
    press('n');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores a key pressed with a modifier', () => {
    const handler = jest.fn<() => void>();
    renderHook(() => useKeyboardShortcuts([{ key: 'n', handler, description: 'n' }]));
    press('n', { ctrlKey: true });
    press('n', { metaKey: true });
    press('n', { altKey: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it('aria-modal="false" does not pause shortcuts', () => {
    const handler = jest.fn<() => void>();
    renderHook(() => useKeyboardShortcuts([{ key: 'n', handler, description: 'n' }]));
    const el = document.createElement('div');
    el.setAttribute('aria-modal', 'false');
    document.body.appendChild(el);
    press('n');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
