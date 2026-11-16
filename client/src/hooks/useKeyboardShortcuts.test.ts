import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createElement, type ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import {
  isShortcutSuppressed,
  isSingleKeyShortcut,
  useKeyboardShortcuts,
} from './useKeyboardShortcuts.js';
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
    expect(result.current?.snapshot()).toEqual([{ ...list[0], group: 'page' }]);
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
    expect(own?.snapshot()).toEqual([{ ...list[0], group: 'page' }]);
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

describe('useKeyboardShortcuts group and reserved keys (#2253)', () => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(ShortcutRegistryProvider, null, children);
  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
    act(() => {
      document.dispatchEvent(event);
    });
    return event;
  };
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('passes the group to the registry', () => {
    const { result } = renderHook(
      () => {
        useKeyboardShortcuts([{ key: 'n', handler: () => {}, description: 'n' }], {
          group: 'global',
        });
        return useShortcutRegistry();
      },
      { wrapper },
    );
    expect(result.current?.snapshot().map((s) => s.group)).toEqual(['global']);
  });

  it('does not throw for a page ?, never calls its handler and lists no page ?', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const handler = jest.fn<() => void>();
    const { result } = renderHook(
      () => {
        useKeyboardShortcuts([{ key: '?', handler, description: 'help' }]);
        return useShortcutRegistry();
      },
      { wrapper },
    );
    const event = press('?');
    expect(handler).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(result.current?.snapshot().filter((s) => s.group === 'page')).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/reserved/));
  });

  it('lets the global group own ?', () => {
    const handler = jest.fn<() => void>();
    renderHook(
      () => useKeyboardShortcuts([{ key: '?', handler, description: 'help' }], { group: 'global' }),
      { wrapper },
    );
    press('?');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('with the switch off, character keys do not fire or preventDefault; Delete and Backspace do', () => {
    localStorage.setItem('singleKeyShortcuts', 'off');
    const handlers = {
      n: jest.fn<() => void>(),
      e: jest.fn<() => void>(),
      help: jest.fn<() => void>(),
      slash: jest.fn<() => void>(),
      del: jest.fn<() => void>(),
      back: jest.fn<() => void>(),
    };
    const { result } = renderHook(
      () => {
        useKeyboardShortcuts(
          [
            { key: 'n', handler: handlers.n, description: 'n' },
            { key: 'e', handler: handlers.e, description: 'e' },
            { key: 'Delete', handler: handlers.del, description: 'del' },
            { key: 'Backspace', handler: handlers.back, description: '' },
          ],
          {},
        );
        useKeyboardShortcuts(
          [
            { key: '?', handler: handlers.help, description: '?' },
            { key: '/', handler: handlers.slash, description: '/' },
          ],
          { group: 'global' },
        );
        return useShortcutRegistry();
      },
      { wrapper },
    );
    for (const key of ['n', 'e', '?', '/']) {
      expect(press(key).defaultPrevented).toBe(false);
    }
    expect(handlers.n).not.toHaveBeenCalled();
    expect(handlers.e).not.toHaveBeenCalled();
    expect(handlers.help).not.toHaveBeenCalled();
    expect(handlers.slash).not.toHaveBeenCalled();
    expect(press('Delete').defaultPrevented).toBe(true);
    press('Backspace');
    expect(handlers.del).toHaveBeenCalledTimes(1);
    expect(handlers.back).toHaveBeenCalledTimes(1);

    result.current?.setSingleKeyEnabled(true);
    press('n');
    press('?');
    expect(handlers.n).toHaveBeenCalledTimes(1);
    expect(handlers.help).toHaveBeenCalledTimes(1);
  });

  it('fires with focus on a button or link but not in text fields (AC3)', () => {
    const handler = jest.fn<() => void>();
    renderHook(() => useKeyboardShortcuts([{ key: 'e', handler, description: 'e' }]), { wrapper });
    const button = document.createElement('button');
    const link = document.createElement('a');
    link.href = '#x';
    document.body.append(button, link);
    for (const el of [button, link]) {
      act(() => {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
      });
    }
    expect(handler).toHaveBeenCalledTimes(2);
    const input = document.createElement('input');
    document.body.append(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    });
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe('isShortcutSuppressed (#2253)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });
  const eventOn = (target: EventTarget, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key: 'x', bubbles: true, ...init });
    Object.defineProperty(event, 'target', { value: target });
    return event;
  };

  it('is false for a document-level event (target is not an element)', () => {
    expect(isShortcutSuppressed(eventOn(document))).toBe(false);
  });

  it('is true for a modifier, an open modal and each text-field kind', () => {
    expect(isShortcutSuppressed(eventOn(document, { ctrlKey: true }))).toBe(true);
    expect(isShortcutSuppressed(eventOn(document, { altKey: true }))).toBe(true);
    expect(isShortcutSuppressed(eventOn(document, { metaKey: true }))).toBe(true);
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isShortcutSuppressed(eventOn(document.createElement(tag)))).toBe(true);
    }
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isShortcutSuppressed(eventOn(editable))).toBe(true);
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    expect(isShortcutSuppressed(eventOn(document))).toBe(true);
  });

  it('is false for a plain button', () => {
    expect(isShortcutSuppressed(eventOn(document.createElement('button')))).toBeFalsy();
  });
});

describe('isSingleKeyShortcut (#2253)', () => {
  it.each(['n', '?', '/', 'g s'])('is true for %s', (key) => {
    expect(isSingleKeyShortcut(key)).toBe(true);
  });
  it.each(['Delete', 'Backspace', 'Escape', 'Mod+k', 'Mod+z', 'g Delete'])(
    'is false for %s',
    (key) => {
      expect(isSingleKeyShortcut(key)).toBe(false);
    },
  );
});
