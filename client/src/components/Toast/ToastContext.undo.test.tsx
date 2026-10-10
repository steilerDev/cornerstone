/**
 * @jest-environment jsdom
 *
 * Undo toasts (#2209): timing, pause/resume, dedupe, Undo outcomes, Ctrl/Cmd+Z, live regions
 * and focus fallback.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { UNDO_WINDOW_MS } from '@cornerstone/shared';
import { ToastProvider, useToast, UNDO_TOAST_MS } from './ToastContext.js';
import type { ShowUndoToastOptions } from './ToastContext.js';
import { ToastList } from './Toast.js';
import { ApiClientError } from '../../lib/apiClient.js';

let api!: ReturnType<typeof useToast>;

function Capture() {
  api = useToast();
  return null;
}

function renderToasts(extra?: React.ReactNode) {
  return render(
    <ToastProvider>
      <Capture />
      <main>
        <h1>Page heading</h1>
        <input data-testid="field" />
        <textarea data-testid="area" />
        <div data-testid="rich" contentEditable suppressContentEditableWarning />
        <button type="button" data-testid="outside">
          outside
        </button>
        {extra}
      </main>
      <ToastList />
    </ToastProvider>,
  );
}

function showUndo(overrides: Partial<ShowUndoToastOptions> = {}) {
  const onUndo = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  act(() => {
    api.showUndoToast({
      message: 'Task is now “Done”.',
      dedupeKey: 'task:1',
      onUndo,
      ...overrides,
    });
  });
  return onUndo;
}

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

function pressZ(init: KeyboardEventInit = {}, target: Element | Document = document) {
  const event = new KeyboardEvent('keydown', {
    key: 'z',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  document.body.innerHTML = '';
});

describe('undo toast constants', () => {
  it('stays visible for 6000 ms, always less than the server window', () => {
    expect(UNDO_TOAST_MS).toBe(6000);
    expect(UNDO_TOAST_MS).toBeLessThan(UNDO_WINDOW_MS);
  });
});

describe('undo toast rendering', () => {
  it('renders the message, an Undo button with the shortcut and a dismiss button', () => {
    renderToasts();
    showUndo();
    const toast = screen.getByTestId('toast-undo');
    expect(toast).toHaveTextContent('Task is now “Done”.');
    const undo = screen.getByTestId('toast-undo-button');
    expect(undo).toHaveTextContent('Undo');
    expect(undo).toHaveAttribute('aria-keyshortcuts', 'Control+Z Meta+Z');
    expect(screen.getByRole('button', { name: 'Dismiss notification' })).toBeInTheDocument();
  });

  it('renders both live regions before any toast arrives and gives toasts no role', () => {
    renderToasts();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(document.querySelector('[aria-live="assertive"]')).not.toBeNull();
    showUndo();
    act(() => api.showToast('error', 'Failed'));
    expect(screen.getByTestId('toast-undo')).not.toHaveAttribute('role');
    expect(screen.getByTestId('toast-error')).not.toHaveAttribute('role');
  });

  it('puts error toasts in the assertive region and the rest in the polite status region', () => {
    renderToasts();
    showUndo();
    act(() => {
      api.showToast('info', 'Heads up');
      api.showToast('error', 'Failed');
    });
    const polite = screen.getByRole('status');
    const assertive = document.querySelector('[aria-live="assertive"]')!;
    expect(polite).toContainElement(screen.getByTestId('toast-undo'));
    expect(polite).toContainElement(screen.getByTestId('toast-info'));
    expect(assertive).toContainElement(screen.getByTestId('toast-error'));
    expect(polite).not.toContainElement(screen.getByTestId('toast-error'));
  });
});

describe('auto-dismiss clock', () => {
  it('dismisses at 6000 ms and not before', () => {
    renderToasts();
    showUndo();
    advance(UNDO_TOAST_MS - 1);
    expect(screen.getByTestId('toast-undo')).toBeInTheDocument();
    advance(1);
    expect(screen.queryByTestId('toast-undo')).toBeNull();
  });

  it('pauses on hover and resumes with the remaining time', () => {
    renderToasts();
    showUndo();
    const toast = screen.getByTestId('toast-undo');
    advance(4000);
    fireEvent.mouseEnter(toast);
    advance(60_000);
    expect(screen.getByTestId('toast-undo')).toBeInTheDocument();
    fireEvent.mouseLeave(toast);
    advance(1999);
    expect(screen.getByTestId('toast-undo')).toBeInTheDocument();
    advance(1);
    expect(screen.queryByTestId('toast-undo')).toBeNull();
  });

  it('pauses while focus is inside and resumes when focus leaves', () => {
    renderToasts();
    showUndo();
    const toast = screen.getByTestId('toast-undo');
    advance(3000);
    fireEvent.focus(screen.getByTestId('toast-undo-button'), { relatedTarget: null });
    advance(60_000);
    expect(screen.getByTestId('toast-undo')).toBeInTheDocument();
    fireEvent.blur(screen.getByTestId('toast-undo-button'), { relatedTarget: null });
    advance(2999);
    expect(toast).toBeInTheDocument();
    advance(1);
    expect(screen.queryByTestId('toast-undo')).toBeNull();
  });

  it('moving focus between controls inside the toast does not double-pause', () => {
    renderToasts();
    showUndo();
    const undo = screen.getByTestId('toast-undo-button');
    const dismiss = screen.getByRole('button', { name: 'Dismiss notification' });
    fireEvent.focus(undo, { relatedTarget: null });
    fireEvent.blur(undo, { relatedTarget: dismiss });
    fireEvent.focus(dismiss, { relatedTarget: undo });
    // Still paused (one hold from the first entry).
    advance(60_000);
    expect(screen.getByTestId('toast-undo')).toBeInTheDocument();
    fireEvent.blur(dismiss, { relatedTarget: null });
    advance(UNDO_TOAST_MS);
    expect(screen.queryByTestId('toast-undo')).toBeNull();
  });

  it('hover and focus holds are balanced: both must release before the clock resumes', () => {
    renderToasts();
    showUndo();
    const toast = screen.getByTestId('toast-undo');
    fireEvent.mouseEnter(toast);
    fireEvent.focus(screen.getByTestId('toast-undo-button'), { relatedTarget: null });
    fireEvent.mouseLeave(toast);
    advance(60_000);
    expect(screen.getByTestId('toast-undo')).toBeInTheDocument();
    fireEvent.blur(screen.getByTestId('toast-undo-button'), { relatedTarget: null });
    advance(UNDO_TOAST_MS);
    expect(screen.queryByTestId('toast-undo')).toBeNull();
  });

  it('pauses while the tab is hidden and resumes with the remaining time', () => {
    renderToasts();
    showUndo();
    advance(5000);
    const spy = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    advance(60_000);
    expect(screen.getByTestId('toast-undo')).toBeInTheDocument();
    spy.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    advance(999);
    expect(screen.getByTestId('toast-undo')).toBeInTheDocument();
    advance(1);
    expect(screen.queryByTestId('toast-undo')).toBeNull();
    spy.mockRestore();
  });

  it('does not start the clock for an undo toast shown while the tab is hidden', () => {
    renderToasts();
    const spy = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    showUndo();
    advance(60_000);
    expect(screen.getByTestId('toast-undo')).toBeInTheDocument();
    spy.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    advance(UNDO_TOAST_MS);
    expect(screen.queryByTestId('toast-undo')).toBeNull();
    spy.mockRestore();
  });

  it('never pauses plain toasts on hover', () => {
    renderToasts();
    act(() => api.showToast('success', 'Saved'));
    fireEvent.mouseEnter(screen.getByTestId('toast-success'));
    advance(4000);
    expect(screen.queryByTestId('toast-success')).toBeNull();
  });
});

describe('dedupe and stack', () => {
  it('a newer toast with the same key replaces the older one', () => {
    renderToasts();
    showUndo({ message: 'First', dedupeKey: 'task:1' });
    showUndo({ message: 'Second', dedupeKey: 'task:1' });
    expect(screen.getAllByTestId('toast-undo')).toHaveLength(1);
    expect(screen.getByTestId('toast-undo')).toHaveTextContent('Second');
  });

  it('the replaced toast clock is cleared and the new one starts a fresh 6000 ms', () => {
    renderToasts();
    showUndo({ message: 'First', dedupeKey: 'task:1' });
    advance(5000);
    showUndo({ message: 'Second', dedupeKey: 'task:1' });
    advance(5999);
    expect(screen.getByTestId('toast-undo')).toHaveTextContent('Second');
    advance(1);
    expect(screen.queryByTestId('toast-undo')).toBeNull();
  });

  it('different keys coexist', () => {
    renderToasts();
    showUndo({ message: 'A', dedupeKey: 'task:1' });
    showUndo({ message: 'B', dedupeKey: 'task:2' });
    expect(screen.getAllByTestId('toast-undo')).toHaveLength(2);
  });

  it('keeps at most three toasts, dropping the oldest', () => {
    renderToasts();
    for (let i = 1; i <= 4; i++) showUndo({ message: `Toast ${i}`, dedupeKey: `k:${i}` });
    const toasts = screen.getAllByTestId('toast-undo');
    expect(toasts).toHaveLength(3);
    expect(toasts.map((t) => t.textContent)).toEqual([
      expect.stringContaining('Toast 2'),
      expect.stringContaining('Toast 3'),
      expect.stringContaining('Toast 4'),
    ]);
  });
});

describe('Undo button', () => {
  it('runs onUndo once, shows the undoing state, then dismisses and confirms', async () => {
    renderToasts();
    let resolve!: () => void;
    const onUndo = jest.fn<() => Promise<void>>(() => new Promise<void>((r) => (resolve = r)));
    showUndo({ onUndo });
    const button = screen.getByTestId('toast-undo-button');
    fireEvent.click(button);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(button).toHaveTextContent('Undoing…');
    expect(button).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(button);
    fireEvent.click(button);
    expect(onUndo).toHaveBeenCalledTimes(1);

    await act(async () => resolve());
    expect(screen.queryByTestId('toast-undo')).toBeNull();
    expect(screen.getByTestId('toast-info')).toHaveTextContent('Change undone.');
  });

  it('does not auto-dismiss the toast while the undo is running', async () => {
    renderToasts();
    let resolve!: () => void;
    showUndo({ onUndo: () => new Promise<void>((r) => (resolve = r)) });
    fireEvent.click(screen.getByTestId('toast-undo-button'));
    advance(60_000);
    expect(screen.getByTestId('toast-undo')).toBeInTheDocument();
    await act(async () => resolve());
  });

  it.each([
    [404, 'It is too late to undo this.'],
    [409, "This changed since, so it can't be undone."],
  ])('a %i answer dismisses the toast and shows the error "%s"', async (status, message) => {
    renderToasts();
    showUndo({
      onUndo: jest
        .fn<() => Promise<void>>()
        .mockRejectedValue(new ApiClientError(status, { code: 'NOT_FOUND', message: 'x' })),
    });
    fireEvent.click(screen.getByTestId('toast-undo-button'));
    await act(async () => {});
    expect(screen.queryByTestId('toast-undo')).toBeNull();
    expect(screen.getByTestId('toast-error')).toHaveTextContent(message);
  });

  it('another API error shows its translated message', async () => {
    renderToasts();
    showUndo({
      onUndo: jest
        .fn<() => Promise<void>>()
        .mockRejectedValue(new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' })),
    });
    fireEvent.click(screen.getByTestId('toast-undo-button'));
    await act(async () => {});
    expect(screen.queryByTestId('toast-undo')).toBeNull();
    expect(screen.getByTestId('toast-error')).toBeInTheDocument();
    expect(screen.getByTestId('toast-error')).not.toHaveTextContent('Change undone.');
  });

  it('a non-API failure shows the generic undo failure', async () => {
    renderToasts();
    showUndo({ onUndo: jest.fn<() => Promise<void>>().mockRejectedValue(new Error('network')) });
    fireEvent.click(screen.getByTestId('toast-undo-button'));
    await act(async () => {});
    expect(screen.getByTestId('toast-error')).toHaveTextContent('The change could not be undone.');
  });

  it('undoToast on an unknown id is a no-op', async () => {
    renderToasts();
    await act(async () => {
      await api.undoToast(9999);
    });
    expect(screen.queryByTestId('toast-info')).toBeNull();
  });

  it('undoToast on a plain toast is a no-op', async () => {
    renderToasts();
    act(() => api.showToast('success', 'Saved'));
    const id = api.toasts[0]!.id;
    await act(async () => {
      await api.undoToast(id);
    });
    expect(screen.queryByTestId('toast-info')).toBeNull();
  });
});

describe('Ctrl/Cmd+Z', () => {
  it('Ctrl+Z undoes the newest undo toast and prevents the default', async () => {
    renderToasts();
    const older = showUndo({ message: 'Older', dedupeKey: 'a' });
    const newer = showUndo({ message: 'Newer', dedupeKey: 'b' });
    const event = pressZ();
    await act(async () => {});
    expect(event.defaultPrevented).toBe(true);
    expect(newer).toHaveBeenCalledTimes(1);
    expect(older).not.toHaveBeenCalled();
  });

  it('Cmd+Z works the same', async () => {
    renderToasts();
    const onUndo = showUndo();
    pressZ({ ctrlKey: false, metaKey: true });
    await act(async () => {});
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('accepts an upper-case Z key value (Caps Lock)', async () => {
    renderToasts();
    const onUndo = showUndo();
    pressZ({ key: 'Z' });
    await act(async () => {});
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['input', 'field'],
    ['textarea', 'area'],
    ['contenteditable', 'rich'],
  ])('is ignored inside a %s so native text undo keeps working', async (_name, testId) => {
    renderToasts();
    const onUndo = showUndo();
    const event = pressZ({}, screen.getByTestId(testId));
    await act(async () => {});
    expect(onUndo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('is ignored with Shift (redo), Alt, or without a modifier', async () => {
    renderToasts();
    const onUndo = showUndo();
    pressZ({ shiftKey: true });
    pressZ({ altKey: true });
    pressZ({ ctrlKey: false });
    pressZ({ key: 'y' });
    await act(async () => {});
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('does nothing and does not prevent the default when no undo toast is showing', () => {
    renderToasts();
    act(() => api.showToast('success', 'Saved'));
    const event = pressZ();
    expect(event.defaultPrevented).toBe(false);
  });

  it('works while focus is on a plain button', async () => {
    renderToasts();
    const onUndo = showUndo();
    pressZ({}, screen.getByTestId('outside'));
    await act(async () => {});
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});

describe('focus fallback', () => {
  it('moves focus to the fallback element when a toast holding focus is dismissed', () => {
    renderToasts(
      <button type="button" data-testid="fallback">
        fallback
      </button>,
    );
    showUndo({ focusFallback: () => screen.getByTestId('fallback') });
    screen.getByTestId('toast-undo-button').focus();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.getByTestId('fallback')).toHaveFocus();
  });

  it('moves focus to the page heading when there is no fallback, never to body', () => {
    renderToasts();
    showUndo();
    screen.getByTestId('toast-undo-button').focus();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(document.body).not.toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Page heading' })).toHaveFocus();
  });

  it('uses the heading when the fallback is disconnected', () => {
    renderToasts();
    showUndo({ focusFallback: () => document.createElement('button') });
    screen.getByTestId('toast-undo-button').focus();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.getByRole('heading', { name: 'Page heading' })).toHaveFocus();
  });

  it('leaves focus alone when it is outside the dismissed toast', () => {
    renderToasts();
    showUndo();
    screen.getByTestId('outside').focus();
    advance(UNDO_TOAST_MS);
    expect(screen.getByTestId('outside')).toHaveFocus();
  });

  it('a failed Undo that dismisses the focused toast does not strand focus on body', async () => {
    renderToasts();
    showUndo({
      onUndo: jest
        .fn<() => Promise<void>>()
        .mockRejectedValue(new ApiClientError(409, { code: 'CONFLICT', message: 'x' })),
    });
    screen.getByTestId('toast-undo-button').focus();
    fireEvent.click(screen.getByTestId('toast-undo-button'));
    await act(async () => {});
    expect(document.body).not.toHaveFocus();
  });
});
