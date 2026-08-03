/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, afterEach } from '@jest/globals';
import { createElement, useRef } from 'react';
import type { RefObject } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useClickOutside } from './useClickOutside.js';
import type { ClickOutsideTarget } from './useClickOutside.js';

interface HarnessProps {
  extraTargets?: ClickOutsideTarget[];
  onClickOutside: (event: MouseEvent) => void;
  enabled?: boolean;
}

// No JSX here — this file keeps the `.test.ts` extension (matching the hook's
// own `.ts` extension), and `.ts` files cannot contain JSX syntax. Use
// React.createElement directly instead.
function Harness({ extraTargets = [], onClickOutside, enabled }: HarnessProps) {
  const insideRef = useRef<HTMLDivElement>(null);
  const secondInsideRef = useRef<HTMLDivElement>(null);

  useClickOutside([insideRef, secondInsideRef, ...extraTargets], onClickOutside, enabled);

  return createElement(
    'div',
    null,
    createElement('div', { 'data-testid': 'inside', ref: insideRef }, 'Inside'),
    createElement('div', { 'data-testid': 'second-inside', ref: secondInsideRef }, 'Second Inside'),
    createElement('div', { 'data-testid': 'outside' }, 'Outside'),
  );
}

function renderHarness(props: HarnessProps) {
  return render(createElement(Harness, props));
}

describe('useClickOutside', () => {
  afterEach(() => {
    cleanup();
  });

  it('fires the handler on a mousedown outside all targets', () => {
    const handler = jest.fn<(event: MouseEvent) => void>();
    renderHarness({ onClickOutside: handler });

    fireEvent.mouseDown(screen.getByTestId('outside'));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not fire the handler on a mousedown inside one of multiple targets', () => {
    const handler = jest.fn<(event: MouseEvent) => void>();
    renderHarness({ onClickOutside: handler });

    fireEvent.mouseDown(screen.getByTestId('inside'));
    expect(handler).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByTestId('second-inside'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('accepts both RefObject and raw HTMLElement targets in the same array', () => {
    const raw = document.createElement('div');
    raw.setAttribute('data-testid', 'raw-target');
    document.body.appendChild(raw);

    const handler = jest.fn<(event: MouseEvent) => void>();
    renderHarness({ onClickOutside: handler, extraTargets: [raw] });

    // Click on the raw (non-ref) element — should NOT count as outside.
    fireEvent.mouseDown(raw);
    expect(handler).not.toHaveBeenCalled();

    // Click on the ref-based inside element — should also NOT count as outside.
    fireEvent.mouseDown(screen.getByTestId('inside'));
    expect(handler).not.toHaveBeenCalled();

    // Click elsewhere — should count as outside.
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(handler).toHaveBeenCalledTimes(1);

    document.body.removeChild(raw);
  });

  it('treats null/undefined targets in the array as inert (does not throw, does not block outside detection)', () => {
    const handler = jest.fn<(event: MouseEvent) => void>();
    const nullRef: RefObject<HTMLElement | null> = { current: null };

    renderHarness({ onClickOutside: handler, extraTargets: [nullRef, null, undefined] });

    expect(() => {
      fireEvent.mouseDown(screen.getByTestId('outside'));
    }).not.toThrow();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('enabled=false: no listener is attached — handler never fires even for an outside click', () => {
    const handler = jest.fn<(event: MouseEvent) => void>();
    renderHarness({ onClickOutside: handler, enabled: false });

    fireEvent.mouseDown(screen.getByTestId('outside'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('toggling enabled from false to true attaches the listener without needing a remount', () => {
    const handler = jest.fn<(event: MouseEvent) => void>();
    const { rerender } = renderHarness({ onClickOutside: handler, enabled: false });

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(handler).not.toHaveBeenCalled();

    rerender(createElement(Harness, { onClickOutside: handler, enabled: true }));

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('toggling enabled from true to false detaches the listener', () => {
    const handler = jest.fn<(event: MouseEvent) => void>();
    const { rerender } = renderHarness({ onClickOutside: handler, enabled: true });

    rerender(createElement(Harness, { onClickOutside: handler, enabled: false }));

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('defaults enabled to true when the parameter is omitted', () => {
    const handler = jest.fn<(event: MouseEvent) => void>();
    renderHarness({ onClickOutside: handler });

    fireEvent.mouseDown(screen.getByTestId('outside'));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('always invokes the latest handler passed in, even after a re-render with a new handler', () => {
    const firstHandler = jest.fn<(event: MouseEvent) => void>();
    const secondHandler = jest.fn<(event: MouseEvent) => void>();
    const { rerender } = renderHarness({ onClickOutside: firstHandler });

    rerender(createElement(Harness, { onClickOutside: secondHandler }));

    fireEvent.mouseDown(screen.getByTestId('outside'));

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });

  it('cleans up the mousedown listener on unmount', () => {
    const handler = jest.fn<(event: MouseEvent) => void>();
    const { unmount } = renderHarness({ onClickOutside: handler });

    unmount();

    fireEvent.mouseDown(document.body);

    expect(handler).not.toHaveBeenCalled();
  });
});
