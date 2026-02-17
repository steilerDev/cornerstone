import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts.js';
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
