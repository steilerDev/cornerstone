/**
 * @jest-environment jsdom
 *
 * Unit tests for SelectionActionBar (Story #1797 — shared selection action bar).
 *
 * Covers:
 * - Renders countLabel and clearLabel
 * - Clear button calls onClear
 * - Renders children (primary action buttons) inside the actions area
 * - Applies extra className when provided
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { SelectionActionBar } from './SelectionActionBar.js';

describe('SelectionActionBar announce and testId (#2234)', () => {
  it('announces through its own live region by default', () => {
    render(
      <SelectionActionBar countLabel="2 selected" onClear={jest.fn()} clearLabel="Clear">
        <button type="button">Merge</button>
      </SelectionActionBar>,
    );
    const count = screen.getByText('2 selected');
    expect(count).toHaveAttribute('aria-live', 'polite');
    expect(count).toHaveAttribute('aria-atomic', 'true');
  });

  it('drops the live region with announce={false}', () => {
    render(
      <SelectionActionBar
        countLabel="2 selected"
        onClear={jest.fn()}
        clearLabel="Clear"
        announce={false}
      >
        <button type="button">Merge</button>
      </SelectionActionBar>,
    );
    const count = screen.getByText('2 selected');
    expect(count).not.toHaveAttribute('aria-live');
    expect(count).not.toHaveAttribute('aria-atomic');
  });

  it('puts the testId on the bar', () => {
    render(
      <SelectionActionBar
        countLabel="1 selected"
        onClear={jest.fn()}
        clearLabel="Clear"
        testId="bar-x"
      >
        <button type="button">Merge</button>
      </SelectionActionBar>,
    );
    expect(screen.getByTestId('bar-x')).toBeInTheDocument();
  });
});

describe('SelectionActionBar', () => {
  it('renders the countLabel text', () => {
    render(
      <SelectionActionBar countLabel="2 selected" onClear={jest.fn()} clearLabel="Clear selection">
        <button type="button">Merge</button>
      </SelectionActionBar>,
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('renders a "Clear selection" button with the clearLabel text', () => {
    render(
      <SelectionActionBar countLabel="2 selected" onClear={jest.fn()} clearLabel="Clear selection">
        <button type="button">Merge</button>
      </SelectionActionBar>,
    );
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
  });

  it('calls onClear when the clear button is clicked', () => {
    const onClear = jest.fn();
    render(
      <SelectionActionBar countLabel="2 selected" onClear={onClear} clearLabel="Clear selection">
        <button type="button">Merge</button>
      </SelectionActionBar>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('renders children (primary action buttons) inside the bar', () => {
    render(
      <SelectionActionBar countLabel="2 selected" onClear={jest.fn()} clearLabel="Clear selection">
        <button type="button">Merge</button>
      </SelectionActionBar>,
    );
    expect(screen.getByRole('button', { name: 'Merge' })).toBeInTheDocument();
  });

  it('renders multiple children when passed as a fragment', () => {
    render(
      <SelectionActionBar countLabel="3 selected" onClear={jest.fn()} clearLabel="Clear selection">
        <button type="button">Merge</button>
        <span>Extra hint</span>
      </SelectionActionBar>,
    );
    expect(screen.getByRole('button', { name: 'Merge' })).toBeInTheDocument();
    expect(screen.getByText('Extra hint')).toBeInTheDocument();
  });

  it('applies an extra className when provided', () => {
    const { container } = render(
      <SelectionActionBar
        countLabel="2 selected"
        onClear={jest.fn()}
        clearLabel="Clear selection"
        className="extra-class"
      >
        <button type="button">Merge</button>
      </SelectionActionBar>,
    );
    // The root is the in-flow spacer; the fixed bar is its child and carries the class.
    const bar = container.firstElementChild?.firstElementChild;
    expect(bar?.getAttribute('class') ?? '').toContain('extra-class');
    expect(container.firstElementChild?.getAttribute('class') ?? '').not.toContain('extra-class');
  });

  it('does not throw when className is omitted', () => {
    expect(() =>
      render(
        <SelectionActionBar countLabel="1 selected" onClear={jest.fn()} clearLabel="Clear">
          <button type="button">Merge</button>
        </SelectionActionBar>,
      ),
    ).not.toThrow();
  });

  // ─── Story #1891: aria-live announcement of the running count/total ───────

  it('the count span has aria-live="polite" and aria-atomic="true" (Story #1891)', () => {
    render(
      <SelectionActionBar countLabel="2 selected" onClear={jest.fn()} clearLabel="Clear selection">
        <button type="button">Merge</button>
      </SelectionActionBar>,
    );
    const countSpan = screen.getByText('2 selected');
    expect(countSpan).toHaveAttribute('aria-live', 'polite');
    expect(countSpan).toHaveAttribute('aria-atomic', 'true');
  });

  it('re-rendering with an updated countLabel keeps the aria-live attributes on the same span', () => {
    const { rerender } = render(
      <SelectionActionBar countLabel="2 selected" onClear={jest.fn()} clearLabel="Clear selection">
        <button type="button">Merge</button>
      </SelectionActionBar>,
    );
    rerender(
      <SelectionActionBar countLabel="5 selected" onClear={jest.fn()} clearLabel="Clear selection">
        <button type="button">Merge</button>
      </SelectionActionBar>,
    );
    const countSpan = screen.getByText('5 selected');
    expect(countSpan).toHaveAttribute('aria-live', 'polite');
  });
});

describe('SelectionActionBar fixed bar with an in-flow spacer (#2238)', () => {
  const HEIGHT_VAR = '--sticky-action-bar-height';

  // The test setup defines a writable, non-configurable no-op ResizeObserver: assign, never delete.
  const originalObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;

  afterEach(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalObserver;
    jest.restoreAllMocks();
    document.documentElement.style.removeProperty(HEIGHT_VAR);
  });

  function stubGeometry(height: number, rect: { left: number; width: number }) {
    jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height);
    const spy = jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => ({ ...rect, top: 0, right: 0, bottom: 0, height: 0 }) as DOMRect);
    return {
      set(next: { left: number; width: number }) {
        spy.mockImplementation(
          () => ({ ...next, top: 0, right: 0, bottom: 0, height: 0 }) as DOMRect,
        );
      },
    };
  }

  function renderBar() {
    return render(
      <SelectionActionBar
        countLabel="2 selected"
        onClear={jest.fn()}
        clearLabel="Clear selection"
        testId="bar"
      >
        <button type="button">Merge</button>
      </SelectionActionBar>,
    );
  }

  it('renders the bar inside an in-flow spacer', () => {
    const { container } = renderBar();
    const spacer = container.firstElementChild as HTMLElement;
    expect(spacer).toContainElement(screen.getByTestId('bar'));
    expect(screen.getByTestId('bar').parentElement).toBe(spacer);
  });

  it('sizes the spacer to the bar, aligns the bar to the spacer and publishes the height', () => {
    stubGeometry(64, { left: 240, width: 800 });
    const { container } = renderBar();
    const spacer = container.firstElementChild as HTMLElement;
    const bar = screen.getByTestId('bar');
    expect(spacer.style.height).toBe('64px');
    expect(bar.style.left).toBe('240px');
    expect(bar.style.width).toBe('800px');
    expect(document.documentElement.style.getPropertyValue(HEIGHT_VAR)).toBe('64px');
  });

  it('removes the published height on unmount', () => {
    stubGeometry(64, { left: 0, width: 100 });
    const { unmount } = renderBar();
    expect(document.documentElement.style.getPropertyValue(HEIGHT_VAR)).toBe('64px');
    unmount();
    expect(document.documentElement.style.getPropertyValue(HEIGHT_VAR)).toBe('');
  });

  it('re-syncs on window resize and stops listening after unmount', () => {
    const geometry = stubGeometry(64, { left: 240, width: 800 });
    const { unmount } = renderBar();
    const bar = screen.getByTestId('bar');

    geometry.set({ left: 0, width: 390 });
    fireEvent(window, new Event('resize'));
    expect(bar.style.left).toBe('0px');
    expect(bar.style.width).toBe('390px');

    unmount();
    geometry.set({ left: 5, width: 5 });
    fireEvent(window, new Event('resize'));
    expect(bar.style.left).toBe('0px');
  });

  it('observes the bar and the spacer, re-syncs on a resize callback and disconnects on unmount', () => {
    let callback: () => void = () => undefined;
    const observed: Element[] = [];
    const disconnect = jest.fn();
    class FakeResizeObserver {
      constructor(cb: () => void) {
        callback = cb;
      }
      observe(el: Element) {
        observed.push(el);
      }
      disconnect = disconnect;
    }
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
    const geometry = stubGeometry(48, { left: 10, width: 300 });

    const { container, unmount } = renderBar();
    const bar = screen.getByTestId('bar');
    expect(observed).toEqual([bar, container.firstElementChild]);

    geometry.set({ left: 20, width: 500 });
    callback();
    expect(bar.style.left).toBe('20px');
    expect(bar.style.width).toBe('500px');

    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('works without a ResizeObserver (window resize only)', () => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = undefined;
    expect(typeof ResizeObserver).toBe('undefined');
    stubGeometry(40, { left: 1, width: 2 });
    expect(() => renderBar()).not.toThrow();
    expect(screen.getByTestId('bar').style.width).toBe('2px');
  });

  describe('placement="inline"', () => {
    function renderInline() {
      return render(
        <SelectionActionBar
          countLabel="2 selected"
          onClear={jest.fn()}
          clearLabel="Clear selection"
          placement="inline"
          testId="bar"
        >
          <button type="button">Merge</button>
        </SelectionActionBar>,
      );
    }

    it('uses the in-flow classes and never the fixed ones', () => {
      const { container } = renderInline();
      expect(container.firstElementChild?.getAttribute('class')).toBe('spacerInline');
      const bar = screen.getByTestId('bar');
      expect(bar.className).toContain('barInline');
      expect(bar.className).not.toMatch(/(^|\s)bar(\s|$)/);
    });

    it('does not size, position or publish anything and observes nothing', () => {
      const observe = jest.fn();
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
        observe = observe;
        disconnect() {}
      };
      stubGeometry(64, { left: 240, width: 800 });
      const { container } = renderInline();
      const bar = screen.getByTestId('bar');
      expect((container.firstElementChild as HTMLElement).style.height).toBe('');
      expect(bar.style.left).toBe('');
      expect(bar.style.width).toBe('');
      expect(document.documentElement.style.getPropertyValue(HEIGHT_VAR)).toBe('');
      expect(observe).not.toHaveBeenCalled();
      fireEvent(window, new Event('resize'));
      expect(bar.style.left).toBe('');
    });

    it('stays interactive: the clear button and the children render', () => {
      renderInline();
      expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Merge' })).toBeInTheDocument();
    });

    it('switching from fixed to inline withdraws the published height', () => {
      stubGeometry(64, { left: 1, width: 2 });
      const { rerender } = render(
        <SelectionActionBar countLabel="1" onClear={jest.fn()} clearLabel="Clear" testId="bar">
          {null}
        </SelectionActionBar>,
      );
      expect(document.documentElement.style.getPropertyValue(HEIGHT_VAR)).toBe('64px');
      rerender(
        <SelectionActionBar
          countLabel="1"
          onClear={jest.fn()}
          clearLabel="Clear"
          testId="bar"
          placement="inline"
        >
          {null}
        </SelectionActionBar>,
      );
      expect(document.documentElement.style.getPropertyValue(HEIGHT_VAR)).toBe('');
    });
  });
});
