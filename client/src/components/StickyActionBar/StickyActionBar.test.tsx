import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, act } from '@testing-library/react';
import { StickyActionBar } from './StickyActionBar.js';

const VAR = '--sticky-action-bar-height';
const original = globalThis.ResizeObserver;

afterEach(() => {
  globalThis.ResizeObserver = original;
  document.documentElement.style.removeProperty(VAR);
});

describe('StickyActionBar', () => {
  it('renders children, note and aria-hidden visible status', () => {
    render(
      <StickyActionBar status="Saved 14:32" announcement="Saved" note="A note">
        <button type="button">Save</button>
      </StickyActionBar>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByText('A note')).toBeInTheDocument();
    expect(screen.getByText('Saved 14:32')).toHaveAttribute('aria-hidden', 'true');
  });

  it('omits the note when not given', () => {
    const { container } = render(
      <StickyActionBar announcement="">
        <span>x</span>
      </StickyActionBar>,
    );
    expect(container.querySelector('p')).toBeNull();
  });

  it('keeps an always-mounted status region without aria-live or aria-atomic', () => {
    const { rerender } = render(
      <StickyActionBar announcement="">
        <span>x</span>
      </StickyActionBar>,
    );
    const region = screen.getByTestId('sticky-action-bar-status');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).not.toHaveAttribute('aria-live');
    expect(region).not.toHaveAttribute('aria-atomic');
    rerender(
      <StickyActionBar announcement="Saved at noon">
        <span>x</span>
      </StickyActionBar>,
    );
    expect(screen.getByTestId('sticky-action-bar-status')).toBe(region);
    expect(region).toHaveTextContent('Saved at noon');
  });

  it('derives testids from testId', () => {
    render(
      <StickyActionBar announcement="a" testId="capture">
        <span>x</span>
      </StickyActionBar>,
    );
    expect(screen.getByTestId('capture')).toBeInTheDocument();
    expect(screen.getByTestId('capture-status')).toBeInTheDocument();
    expect(screen.queryByTestId('sticky-action-bar')).not.toBeInTheDocument();
  });

  describe('layout sync', () => {
    let observerCb: () => void = () => {};
    let observed: Element[] = [];
    const disconnect = jest.fn();
    let barHeight = 72;
    let rect = { left: 16, width: 640 };
    let heightSpy: jest.SpiedGetter<number>;
    let rectSpy: jest.SpiedFunction<() => DOMRect>;

    beforeEach(() => {
      barHeight = 72;
      rect = { left: 16, width: 640 };
      observed = [];
      disconnect.mockClear();
      globalThis.ResizeObserver = class {
        constructor(fn: () => void) {
          observerCb = fn;
        }
        observe = (el: Element) => {
          observed.push(el);
        };
        disconnect = disconnect;
        unobserve = jest.fn();
      } as unknown as typeof ResizeObserver;
      heightSpy = jest
        .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
        .mockImplementation(() => barHeight);
      rectSpy = jest
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(() => ({ ...rect }) as DOMRect);
    });

    afterEach(() => {
      heightSpy.mockRestore();
      rectSpy.mockRestore();
    });

    function mount() {
      const utils = render(
        <StickyActionBar announcement="a">
          <span>x</span>
        </StickyActionBar>,
      );
      const bar = screen.getByTestId('sticky-action-bar');
      return { ...utils, bar, spacer: bar.parentElement as HTMLElement };
    }

    it('wraps the bar in a spacer whose height is the bar height', () => {
      const { bar, spacer } = mount();
      expect(spacer).toContainElement(bar);
      expect(spacer.style.height).toBe('72px');
    });

    it('takes left and width from the spacer rect', () => {
      const { bar } = mount();
      expect(bar.style.left).toBe('16px');
      expect(bar.style.width).toBe('640px');
    });

    it('observes both the bar and the spacer', () => {
      const { bar, spacer } = mount();
      expect(observed).toEqual([bar, spacer]);
    });

    it('re-syncs height, position and the CSS variable on ResizeObserver callbacks', () => {
      const { bar, spacer } = mount();
      barHeight = 96;
      rect = { left: 240, width: 500 };
      act(() => observerCb());
      expect(spacer.style.height).toBe('96px');
      expect(bar.style.left).toBe('240px');
      expect(bar.style.width).toBe('500px');
      expect(document.documentElement.style.getPropertyValue(VAR)).toBe('96px');
    });

    it('re-syncs on window resize', () => {
      const { bar, spacer } = mount();
      barHeight = 60;
      rect = { left: 0, width: 320 };
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
      expect(spacer.style.height).toBe('60px');
      expect(bar.style.left).toBe('0px');
      expect(bar.style.width).toBe('320px');
      expect(document.documentElement.style.getPropertyValue(VAR)).toBe('60px');
    });

    it('publishes the CSS variable on mount and clears it on unmount', () => {
      const { unmount } = mount();
      expect(document.documentElement.style.getPropertyValue(VAR)).toBe('72px');
      unmount();
      expect(document.documentElement.style.getPropertyValue(VAR)).toBe('');
    });

    it('disconnects the observer and removes the resize listener on unmount', () => {
      const removeSpy = jest.spyOn(window, 'removeEventListener');
      const { unmount } = mount();
      unmount();
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
      removeSpy.mockRestore();
      barHeight = 10;
      window.dispatchEvent(new Event('resize'));
      expect(document.documentElement.style.getPropertyValue(VAR)).toBe('');
    });

    it('still syncs on mount and resize when ResizeObserver is unavailable', () => {
      // @ts-expect-error simulate an environment without ResizeObserver
      delete globalThis.ResizeObserver;
      const { bar } = mount();
      expect(bar.style.width).toBe('640px');
      rect = { left: 8, width: 300 };
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
      expect(bar.style.left).toBe('8px');
      expect(bar.style.width).toBe('300px');
    });
  });
});
