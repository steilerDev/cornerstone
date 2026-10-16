/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useReorder } from './useReorder.js';
import type { ReorderSource } from './useReorder.js';

interface PointerInit extends MouseEventInit {
  pointerId?: number;
  pointerType?: string;
}

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  constructor(type: string, init: PointerInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}

const ROW_HEIGHT = 40;

interface HarnessProps {
  ids: string[];
  disabled?: boolean;
  onCommit: (ids: string[], movedId: string, source: ReorderSource) => void;
  onAnnounce: (message: string) => void;
}

function Harness({ ids, disabled = false, onCommit, onAnnounce }: HarnessProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const { orderedIds, drag, pickedId, handleProps } = useReorder({
    ids,
    disabled,
    listRef,
    onCommit,
    onAnnounce,
    labelOf: (id) => `Item ${id}`,
  });
  return (
    <div>
      <div data-testid="picked">{pickedId ?? 'none'}</div>
      <div data-testid="drag">
        {drag ? `${drag.id}:${drag.fromIndex}->${drag.overIndex}` : 'none'}
      </div>
      <ul ref={listRef}>
        {orderedIds.map((id) => (
          <li key={id} data-testid={`row-${id}`}>
            <button type="button" data-testid={`handle-${id}`} {...handleProps(id)}>
              {id}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

describe('useReorder', () => {
  let onCommit: jest.Mock<HarnessProps['onCommit']>;
  let onAnnounce: jest.Mock<HarnessProps['onAnnounce']>;
  let setPointerCapture: jest.Mock<(pointerId: number) => void>;

  beforeAll(() => {
    Object.defineProperty(window, 'PointerEvent', {
      configurable: true,
      writable: true,
      value: TestPointerEvent,
    });
  });

  beforeEach(() => {
    onCommit = jest.fn<HarnessProps['onCommit']>();
    onAnnounce = jest.fn<HarnessProps['onAnnounce']>();
    setPointerCapture = jest.fn<(pointerId: number) => void>();
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      writable: true,
      value: setPointerCapture,
    });
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const index = this.parentElement ? Array.from(this.parentElement.children).indexOf(this) : 0;
      const top = index * ROW_HEIGHT;
      return {
        top,
        height: ROW_HEIGHT,
        bottom: top + ROW_HEIGHT,
        left: 0,
        right: 100,
        width: 100,
        x: 0,
        y: top,
        toJSON: () => ({}),
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function renderList(props: Partial<HarnessProps> = {}) {
    return render(
      <Harness ids={['a', 'b', 'c']} onCommit={onCommit} onAnnounce={onAnnounce} {...props} />,
    );
  }

  const order = () => screen.getAllByTestId(/^row-/).map((el) => el.dataset.testid);

  describe('keyboard', () => {
    it('picks up with Space, moves with arrows and commits once with Space', () => {
      renderList();
      const handle = screen.getByTestId('handle-a');
      handle.focus();

      fireEvent.keyDown(handle, { key: ' ' });
      expect(screen.getByTestId('picked')).toHaveTextContent('a');
      expect(handle).toHaveAttribute('aria-pressed', 'true');
      fireEvent.keyDown(handle, { key: 'ArrowDown' });
      fireEvent.keyDown(handle, { key: 'ArrowDown' });
      expect(order()).toEqual(['row-b', 'row-c', 'row-a']);
      expect(onCommit).not.toHaveBeenCalled();
      fireEvent.keyDown(screen.getByTestId('handle-a'), { key: ' ' });

      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith(['b', 'c', 'a'], 'a', 'keyboard');
      expect(onAnnounce.mock.calls.map((call) => call[0])).toEqual([
        'Item a picked up. Position 1 of 3.',
        'Item a, position 2 of 3.',
        'Item a, position 3 of 3.',
        'Item a moved to position 3 of 3.',
      ]);
      expect(screen.getByTestId('picked')).toHaveTextContent('none');
    });

    it('picks up with Enter and ArrowUp moves the row up', () => {
      renderList();
      const handle = screen.getByTestId('handle-c');

      fireEvent.keyDown(handle, { key: 'Enter' });
      fireEvent.keyDown(screen.getByTestId('handle-c'), { key: 'ArrowUp' });
      fireEvent.keyDown(screen.getByTestId('handle-c'), { key: 'Enter' });

      expect(onCommit).toHaveBeenCalledWith(['a', 'c', 'b'], 'c', 'keyboard');
    });

    it('gives the handle focus back after each move (moving a row can blur it)', () => {
      renderList();
      const handle = screen.getByTestId('handle-a');
      handle.focus();
      fireEvent.keyDown(handle, { key: ' ' });
      const focusSpy = jest.spyOn(handle, 'focus');

      fireEvent.keyDown(handle, { key: 'ArrowDown' });

      expect(focusSpy).toHaveBeenCalled();
      expect(screen.getByTestId('picked')).toHaveTextContent('a');
    });

    it('does not commit when dropped where it was picked up', () => {
      renderList();
      const handle = screen.getByTestId('handle-b');

      fireEvent.keyDown(handle, { key: ' ' });
      fireEvent.keyDown(handle, { key: ' ' });

      expect(onCommit).not.toHaveBeenCalled();
      expect(onAnnounce).toHaveBeenLastCalledWith('Item b moved to position 2 of 3.');
    });

    it('ArrowUp on the first row keeps the order and announces the unchanged position', () => {
      renderList();
      const handle = screen.getByTestId('handle-a');
      fireEvent.keyDown(handle, { key: ' ' });

      fireEvent.keyDown(handle, { key: 'ArrowUp' });

      expect(order()).toEqual(['row-a', 'row-b', 'row-c']);
      expect(onAnnounce).toHaveBeenCalledTimes(2);
      expect(onAnnounce).toHaveBeenLastCalledWith('Item a, position 1 of 3.');
      expect(onCommit).not.toHaveBeenCalled();
    });

    it('ArrowDown on the last row keeps the order and announces the unchanged position', () => {
      renderList();
      const handle = screen.getByTestId('handle-c');
      fireEvent.keyDown(handle, { key: ' ' });

      fireEvent.keyDown(handle, { key: 'ArrowDown' });

      expect(order()).toEqual(['row-a', 'row-b', 'row-c']);
      expect(onAnnounce).toHaveBeenCalledTimes(2);
      expect(onAnnounce).toHaveBeenLastCalledWith('Item c, position 3 of 3.');
      expect(onCommit).not.toHaveBeenCalled();
    });

    it('Escape restores the order, announces the cancel and commits nothing', () => {
      renderList();
      const handle = screen.getByTestId('handle-a');
      handle.focus();

      fireEvent.keyDown(handle, { key: ' ' });
      fireEvent.keyDown(handle, { key: 'ArrowDown' });
      fireEvent.keyDown(screen.getByTestId('handle-a'), { key: 'Escape' });

      expect(order()).toEqual(['row-a', 'row-b', 'row-c']);
      expect(onCommit).not.toHaveBeenCalled();
      expect(onAnnounce).toHaveBeenLastCalledWith(
        'Reorder canceled. Item a is back at position 1.',
      );
      expect(screen.getByTestId('picked')).toHaveTextContent('none');
      expect(document.activeElement).toBe(screen.getByTestId('handle-a'));
    });

    it('blur cancels a pick-up without committing', () => {
      renderList();
      const handle = screen.getByTestId('handle-a');
      handle.focus();

      fireEvent.keyDown(handle, { key: ' ' });
      fireEvent.blur(handle);

      expect(screen.getByTestId('picked')).toHaveTextContent('none');
      expect(onCommit).not.toHaveBeenCalled();
      expect(onAnnounce).toHaveBeenLastCalledWith(
        'Reorder canceled. Item a is back at position 1.',
      );
    });

    it('blur on a handle that is not picked does nothing', () => {
      renderList();

      fireEvent.blur(screen.getByTestId('handle-b'));

      expect(onAnnounce).not.toHaveBeenCalled();
    });

    it('prevents the default of Space and Enter so no click fires', () => {
      renderList();
      const handle = screen.getByTestId('handle-a');

      expect(fireEvent.keyDown(handle, { key: ' ' })).toBe(false);
      expect(fireEvent.keyDown(handle, { key: 'ArrowDown' })).toBe(false);
      expect(fireEvent.keyDown(screen.getByTestId('handle-a'), { key: 'Enter' })).toBe(false);
      expect(fireEvent.keyDown(screen.getByTestId('handle-b'), { key: 'Enter' })).toBe(false);
    });

    it('ignores other keys when idle and when picked', () => {
      renderList();
      const handle = screen.getByTestId('handle-a');

      expect(fireEvent.keyDown(handle, { key: 'Tab' })).toBe(true);
      fireEvent.keyDown(handle, { key: ' ' });
      expect(fireEvent.keyDown(screen.getByTestId('handle-a'), { key: 'x' })).toBe(true);
      expect(screen.getByTestId('picked')).toHaveTextContent('a');
    });

    it('ignores keys on a different handle while one row is picked up', () => {
      renderList();
      fireEvent.keyDown(screen.getByTestId('handle-a'), { key: ' ' });

      fireEvent.keyDown(screen.getByTestId('handle-b'), { key: 'ArrowDown' });
      fireEvent.keyDown(screen.getByTestId('handle-b'), { key: ' ' });

      expect(screen.getByTestId('picked')).toHaveTextContent('a');
      expect(onCommit).not.toHaveBeenCalled();
    });

    it('disabled ignores the keyboard and marks the handles aria-disabled', () => {
      renderList({ disabled: true });
      const handle = screen.getByTestId('handle-a');

      expect(fireEvent.keyDown(handle, { key: ' ' })).toBe(true);

      expect(screen.getByTestId('picked')).toHaveTextContent('none');
      expect(handle).toHaveAttribute('aria-disabled', 'true');
      expect(onAnnounce).not.toHaveBeenCalled();
    });

    it('enabled handles carry no aria-disabled', () => {
      renderList();

      expect(screen.getByTestId('handle-a')).not.toHaveAttribute('aria-disabled');
      expect(screen.getByTestId('handle-a')).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('pointer', () => {
    it('captures the pointer on pointerdown', () => {
      renderList();

      fireEvent.pointerDown(screen.getByTestId('handle-a'), { pointerId: 7, clientY: 20 });

      expect(setPointerCapture).toHaveBeenCalledWith(7);
    });

    it('does nothing for a movement under 4px and commits nothing on release', () => {
      renderList();
      const handle = screen.getByTestId('handle-a');

      fireEvent.pointerDown(handle, { clientY: 20 });
      fireEvent.pointerMove(handle, { clientY: 23 });

      expect(screen.getByTestId('drag')).toHaveTextContent('none');
      fireEvent.pointerUp(handle, { clientY: 23 });
      expect(onCommit).not.toHaveBeenCalled();
    });

    it('starts the drag at 4px and tracks the drop slot', () => {
      renderList();
      const handle = screen.getByTestId('handle-a');

      fireEvent.pointerDown(handle, { clientY: 20 });
      fireEvent.pointerMove(handle, { clientY: 24 });
      expect(screen.getByTestId('drag')).toHaveTextContent('a:0->0');
      fireEvent.pointerMove(handle, { clientY: 70 });

      expect(screen.getByTestId('drag')).toHaveTextContent('a:0->1');
    });

    it('commits the new order on pointerup after a move and refocuses the handle', () => {
      renderList();
      const handle = screen.getByTestId('handle-a');

      fireEvent.pointerDown(handle, { clientY: 20 });
      fireEvent.pointerMove(handle, { clientY: 110 });
      fireEvent.pointerUp(handle, { clientY: 110 });

      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith(['b', 'c', 'a'], 'a', 'drag');
      expect(onAnnounce).toHaveBeenLastCalledWith('Item a moved to position 3 of 3.');
      expect(screen.getByTestId('drag')).toHaveTextContent('none');
      expect(document.activeElement).toBe(screen.getByTestId('handle-a'));
    });

    it('moves a row up when released above the first centre', () => {
      renderList();
      const handle = screen.getByTestId('handle-c');

      fireEvent.pointerDown(handle, { clientY: 100 });
      fireEvent.pointerMove(handle, { clientY: 0 });
      fireEvent.pointerUp(handle, { clientY: 0 });

      expect(onCommit).toHaveBeenCalledWith(['c', 'a', 'b'], 'c', 'drag');
    });

    it('commits nothing when released over its own slot after dragging', () => {
      renderList();
      const handle = screen.getByTestId('handle-b');

      fireEvent.pointerDown(handle, { clientY: 60 });
      fireEvent.pointerMove(handle, { clientY: 90 });
      fireEvent.pointerMove(handle, { clientY: 60 });
      fireEvent.pointerUp(handle, { clientY: 60 });

      expect(onCommit).not.toHaveBeenCalled();
    });

    it('pointercancel ends the drag without a commit', () => {
      renderList();
      const handle = screen.getByTestId('handle-a');

      fireEvent.pointerDown(handle, { clientY: 20 });
      fireEvent.pointerMove(handle, { clientY: 110 });
      fireEvent.pointerCancel(handle);

      expect(screen.getByTestId('drag')).toHaveTextContent('none');
      fireEvent.pointerUp(handle, { clientY: 110 });
      expect(onCommit).not.toHaveBeenCalled();
    });

    it('ignores events from a different pointer', () => {
      renderList();
      const handle = screen.getByTestId('handle-a');

      fireEvent.pointerDown(handle, { pointerId: 1, clientY: 20 });
      fireEvent.pointerMove(handle, { pointerId: 2, clientY: 110 });
      fireEvent.pointerUp(handle, { pointerId: 2, clientY: 110 });
      fireEvent.pointerCancel(handle, { pointerId: 2 });

      expect(screen.getByTestId('drag')).toHaveTextContent('none');
      expect(onCommit).not.toHaveBeenCalled();
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 110 });
      expect(screen.getByTestId('drag')).toHaveTextContent('a:0->2');
    });

    it('ignores pointer moves and releases without a session', () => {
      renderList();
      const handle = screen.getByTestId('handle-a');

      fireEvent.pointerMove(handle, { clientY: 110 });
      fireEvent.pointerUp(handle, { clientY: 110 });
      fireEvent.pointerCancel(handle);

      expect(onCommit).not.toHaveBeenCalled();
    });

    it('ignores a non-primary mouse button but accepts touch', () => {
      renderList();
      const handle = screen.getByTestId('handle-a');

      fireEvent.pointerDown(handle, { button: 2, clientY: 20 });
      fireEvent.pointerMove(handle, { clientY: 110 });
      expect(screen.getByTestId('drag')).toHaveTextContent('none');

      fireEvent.pointerDown(handle, { button: 0, pointerType: 'touch', clientY: 20 });
      fireEvent.pointerMove(handle, { clientY: 110 });
      expect(screen.getByTestId('drag')).toHaveTextContent('a:0->2');
    });

    it('ignores pointer drags when disabled', () => {
      renderList({ disabled: true });
      const handle = screen.getByTestId('handle-a');

      fireEvent.pointerDown(handle, { clientY: 20 });
      fireEvent.pointerMove(handle, { clientY: 110 });
      fireEvent.pointerUp(handle, { clientY: 110 });

      expect(setPointerCapture).not.toHaveBeenCalled();
      expect(onCommit).not.toHaveBeenCalled();
    });

    it('ignores pointer drags while a keyboard pick-up is active', () => {
      renderList();
      const handle = screen.getByTestId('handle-a');
      fireEvent.keyDown(handle, { key: ' ' });

      fireEvent.pointerDown(screen.getByTestId('handle-a'), { clientY: 20 });
      fireEvent.pointerMove(screen.getByTestId('handle-a'), { clientY: 110 });

      expect(screen.getByTestId('drag')).toHaveTextContent('none');
    });

    it('ignores a pointer down on an id that is not in the list', () => {
      const { rerender } = renderList();
      const handle = screen.getByTestId('handle-c');
      rerender(<Harness ids={['a', 'b']} onCommit={onCommit} onAnnounce={onAnnounce} />);

      // handle-c is gone from the list; its stale node cannot start a drag.
      fireEvent.pointerDown(handle, { clientY: 100 });
      fireEvent.pointerMove(handle, { clientY: 0 });

      expect(screen.getByTestId('drag')).toHaveTextContent('none');
    });

    it('works when setPointerCapture is unavailable', () => {
      Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
        configurable: true,
        writable: true,
        value: undefined,
      });
      renderList();
      const handle = screen.getByTestId('handle-a');

      expect(() => fireEvent.pointerDown(handle, { clientY: 20 })).not.toThrow();
    });
  });

  describe('autoscroll while dragging', () => {
    let frames: Array<(time: number) => void>;
    let scrollBy: jest.Mock<(x: number, y: number) => void>;
    let cancelFrame: jest.Mock<(handle: number) => void>;

    beforeEach(() => {
      frames = [];
      jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frames.push(cb);
        return frames.length;
      });
      cancelFrame = jest.fn<(handle: number) => void>();
      scrollBy = jest.fn<(x: number, y: number) => void>();
      jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(cancelFrame);
      jest
        .spyOn(window, 'scrollBy')
        .mockImplementation(scrollBy as unknown as typeof window.scrollBy);
    });

    function runFrame() {
      const next = frames.shift();
      if (next) next(0);
    }

    it('scrolls up near the top edge', () => {
      renderList();
      const handle = screen.getByTestId('handle-b');

      fireEvent.pointerDown(handle, { clientY: 60 });
      fireEvent.pointerMove(handle, { clientY: 10 });
      runFrame();

      expect(scrollBy).toHaveBeenCalledWith(0, -8);
    });

    it('scrolls down near the bottom edge', () => {
      renderList();
      const handle = screen.getByTestId('handle-b');

      fireEvent.pointerDown(handle, { clientY: 60 });
      fireEvent.pointerMove(handle, { clientY: window.innerHeight - 10 });
      runFrame();

      expect(scrollBy).toHaveBeenCalledWith(0, 8);
    });

    it('does not scroll in the middle and keeps polling', () => {
      renderList();
      const handle = screen.getByTestId('handle-b');

      fireEvent.pointerDown(handle, { clientY: 60 });
      fireEvent.pointerMove(handle, { clientY: 100 });
      const before = frames.length;
      runFrame();

      expect(scrollBy).not.toHaveBeenCalled();
      expect(frames.length).toBe(before);
    });

    it('re-evaluates the drop slot after an autoscroll step', () => {
      renderList();
      const handle = screen.getByTestId('handle-b');

      fireEvent.pointerDown(handle, { clientY: 60 });
      fireEvent.pointerMove(handle, { clientY: 10 });
      runFrame();

      expect(screen.getByTestId('drag')).toHaveTextContent('b:1->0');
    });

    it('stops scheduling frames once the drag has ended', () => {
      renderList();
      const handle = screen.getByTestId('handle-b');

      fireEvent.pointerDown(handle, { clientY: 60 });
      fireEvent.pointerMove(handle, { clientY: 10 });
      fireEvent.pointerUp(handle, { clientY: 10 });
      const pending = frames.length;
      runFrame();

      expect(cancelFrame).toHaveBeenCalled();
      expect(scrollBy).not.toHaveBeenCalled();
      expect(frames.length).toBeLessThanOrEqual(pending - 1);
    });

    it('cancels the pending frame on unmount', () => {
      const { unmount } = renderList();
      const handle = screen.getByTestId('handle-b');
      fireEvent.pointerDown(handle, { clientY: 60 });
      fireEvent.pointerMove(handle, { clientY: 10 });

      unmount();

      expect(cancelFrame).toHaveBeenCalled();
    });
  });
});
