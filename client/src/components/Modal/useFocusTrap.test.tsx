/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getFocusableElements, useFocusTrap } from './useFocusTrap.js';

function Harness({ active, onEscape }: { active: boolean; onEscape: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { active, onEscape });
  return (
    <div>
      <button type="button">outside</button>
      <div ref={ref} data-testid="box">
        <button type="button">first</button>
        <button type="button" disabled>
          disabled
        </button>
        <a href="/x">middle</a>
        <button type="button">last</button>
      </div>
    </div>
  );
}

function EmptyHarness() {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { active: true, onEscape: () => {} });
  return <div ref={ref} />;
}

describe('getFocusableElements', () => {
  it('returns enabled controls in DOM order and skips disabled and tabindex=-1', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<button>a</button><button disabled>b</button><a href="/c">c</a><span tabindex="-1">d</span><span tabindex="0">e</span>';
    expect(getFocusableElements(root).map((el) => el.textContent)).toEqual(['a', 'c', 'e']);
  });
});

describe('useFocusTrap', () => {
  it('calls onEscape on Escape while active', async () => {
    const onEscape = jest.fn();
    render(<Harness active onEscape={onEscape} />);
    await userEvent.keyboard('{Escape}');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('consumes Escape (defaultPrevented) so outer keyboard handlers skip it', () => {
    render(<Harness active onEscape={() => {}} />);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not prevent Escape while inactive', () => {
    render(<Harness active={false} onEscape={() => {}} />);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('is inactive when active is false (no Escape handling, no Tab wrapping)', async () => {
    const onEscape = jest.fn();
    render(<Harness active={false} onEscape={onEscape} />);
    await userEvent.keyboard('{Escape}');
    expect(onEscape).not.toHaveBeenCalled();

    screen.getByText('last').focus();
    await userEvent.tab();
    expect(screen.getByText('last')).not.toHaveFocus();
  });

  it('wraps Tab from the last control to the first', async () => {
    render(<Harness active onEscape={() => {}} />);
    screen.getByText('last').focus();
    await userEvent.tab();
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('wraps Shift+Tab from the first control to the last', async () => {
    render(<Harness active onEscape={() => {}} />);
    screen.getByText('first').focus();
    await userEvent.tab({ shift: true });
    expect(screen.getByText('last')).toHaveFocus();
  });

  it('lets Tab move normally between inner controls', async () => {
    render(<Harness active onEscape={() => {}} />);
    screen.getByText('first').focus();
    await userEvent.tab();
    expect(screen.getByText('middle')).toHaveFocus();
  });

  it('does nothing on Tab when the container has no focusable controls', async () => {
    render(<EmptyHarness />);
    await userEvent.tab();
    expect(document.body).toHaveFocus();
  });

  it('uses the latest onEscape without re-subscribing', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const addSpy = jest.spyOn(document, 'addEventListener');
    const { rerender } = render(<Harness active onEscape={first} />);
    const subscribed = addSpy.mock.calls.filter(([type]) => type === 'keydown').length;
    rerender(<Harness active onEscape={second} />);
    expect(addSpy.mock.calls.filter(([type]) => type === 'keydown').length).toBe(subscribed);
    await userEvent.keyboard('{Escape}');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    addSpy.mockRestore();
  });

  it('removes its listener when unmounted', async () => {
    const onEscape = jest.fn();
    const { unmount } = render(<Harness active onEscape={onEscape} />);
    unmount();
    await userEvent.keyboard('{Escape}');
    expect(onEscape).not.toHaveBeenCalled();
  });
});

function TrapWithResults() {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { active: true, onEscape: () => {} });
  return (
    <div>
      <button type="button">outside</button>
      <div ref={ref}>
        <input data-testid="first" aria-label="first" />
        <a href="/result" tabIndex={-1}>
          result
        </a>
        <button type="button" data-testid="last">
          last
        </button>
      </div>
    </div>
  );
}

describe('getFocusableElements and tabindex="-1" (#2211)', () => {
  function build(html: string): HTMLElement {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    return container;
  }

  it('excludes an anchor with an href and tabindex -1', () => {
    const box = build('<button>a</button><a href="/x" tabindex="-1">skip</a><a href="/y">keep</a>');
    expect(getFocusableElements(box).map((el) => el.textContent)).toEqual(['a', 'keep']);
    box.remove();
  });

  it('excludes any element with tabindex -1, including buttons and inputs', () => {
    const box = build(
      '<button tabindex="-1">no</button><input tabindex="-1" /><button>yes</button>',
    );
    expect(getFocusableElements(box).map((el) => el.tagName)).toEqual(['BUTTON']);
    box.remove();
  });

  it('still includes tabindex 0, buttons, inputs, selects and textareas', () => {
    const box = build(
      '<button>b</button><input /><select></select><textarea></textarea><div tabindex="0">d</div>',
    );
    expect(getFocusableElements(box)).toHaveLength(5);
    box.remove();
  });

  it('still excludes disabled controls', () => {
    const box = build('<button disabled>x</button><button>y</button>');
    expect(getFocusableElements(box).map((el) => el.textContent)).toEqual(['y']);
    box.remove();
  });

  it('keeps Tab inside the trap when result anchors have tabindex -1', async () => {
    render(<TrapWithResults />);
    screen.getByTestId('first').focus();
    await userEvent.tab();
    expect(screen.getByTestId('last')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByTestId('first')).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByTestId('last')).toHaveFocus();
  });
});

describe('useFocusTrap stack (#2213)', () => {
  function Two({
    onLower,
    onUpper,
    upperActive = true,
    lowerActive = true,
  }: {
    onLower: () => void;
    onUpper: () => void;
    upperActive?: boolean;
    lowerActive?: boolean;
  }) {
    const lowerRef = useRef<HTMLDivElement>(null);
    const upperRef = useRef<HTMLDivElement>(null);
    useFocusTrap(lowerRef, { active: lowerActive, onEscape: onLower });
    useFocusTrap(upperRef, { active: upperActive, onEscape: onUpper });
    return (
      <div>
        <div ref={lowerRef}>
          <button type="button">lower first</button>
          <button type="button">lower last</button>
        </div>
        <div ref={upperRef}>
          <button type="button">upper first</button>
          <button type="button">upper last</button>
        </div>
      </div>
    );
  }

  it('only the most recently activated trap handles Escape', async () => {
    const onLower = jest.fn();
    const onUpper = jest.fn();
    render(<Two onLower={onLower} onUpper={onUpper} />);

    await userEvent.keyboard('{Escape}');

    expect(onUpper).toHaveBeenCalledTimes(1);
    expect(onLower).not.toHaveBeenCalled();
  });

  it('only the top trap wraps Tab', async () => {
    render(<Two onLower={() => {}} onUpper={() => {}} />);
    screen.getByRole('button', { name: 'lower last' }).focus();

    await userEvent.tab();

    // The lower trap would have wrapped to "lower first"; it is not on top, so it does not.
    expect(screen.getByRole('button', { name: 'lower first' })).not.toHaveFocus();
  });

  it('wraps Tab inside the top trap', async () => {
    render(<Two onLower={() => {}} onUpper={() => {}} />);
    screen.getByRole('button', { name: 'upper last' }).focus();

    await userEvent.tab();

    expect(screen.getByRole('button', { name: 'upper first' })).toHaveFocus();
  });

  it('the lower trap handles Escape again after the upper one deactivates', async () => {
    const onLower = jest.fn();
    const onUpper = jest.fn();
    const { rerender } = render(<Two onLower={onLower} onUpper={onUpper} />);
    rerender(<Two onLower={onLower} onUpper={onUpper} upperActive={false} />);

    await userEvent.keyboard('{Escape}');

    expect(onLower).toHaveBeenCalledTimes(1);
    expect(onUpper).not.toHaveBeenCalled();
  });

  it('a trap that deactivates below the top leaves the top one in charge', async () => {
    const onLower = jest.fn();
    const onUpper = jest.fn();
    const { rerender } = render(<Two onLower={onLower} onUpper={onUpper} />);
    rerender(<Two onLower={onLower} onUpper={onUpper} lowerActive={false} />);

    await userEvent.keyboard('{Escape}');

    expect(onUpper).toHaveBeenCalledTimes(1);
  });

  it('a trap re-activated later goes on top', async () => {
    const onLower = jest.fn();
    const onUpper = jest.fn();
    const { rerender } = render(<Two onLower={onLower} onUpper={onUpper} lowerActive={false} />);
    rerender(<Two onLower={onLower} onUpper={onUpper} lowerActive />);

    await userEvent.keyboard('{Escape}');

    expect(onLower).toHaveBeenCalledTimes(1);
    expect(onUpper).not.toHaveBeenCalled();
  });
});

function ToastRegion({ children }: { children: React.ReactNode }) {
  return <div data-toast-container>{children}</div>;
}

describe('useFocusTrap with a toast on screen (#2230)', () => {
  it('Tab from the last dialog control reaches the toast buttons, then wraps to the first', async () => {
    render(
      <>
        <Harness active onEscape={() => {}} />
        <ToastRegion>
          <button type="button">Undo</button>
          <button type="button">Dismiss</button>
        </ToastRegion>
      </>,
    );
    screen.getByText('last').focus();

    await userEvent.tab();
    expect(screen.getByText('Undo')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByText('Dismiss')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('Shift+Tab from the first dialog control wraps to the last toast button', async () => {
    render(
      <>
        <Harness active onEscape={() => {}} />
        <ToastRegion>
          <button type="button">Undo</button>
          <button type="button">Dismiss</button>
        </ToastRegion>
      </>,
    );
    screen.getByText('first').focus();

    await userEvent.tab({ shift: true });
    expect(screen.getByText('Dismiss')).toHaveFocus();
  });

  it('ignores disabled toast buttons', async () => {
    render(
      <>
        <Harness active onEscape={() => {}} />
        <ToastRegion>
          <button type="button">Undo</button>
          <button type="button" disabled>
            Busy
          </button>
        </ToastRegion>
      </>,
    );
    screen.getByText('last').focus();
    await userEvent.tab();
    expect(screen.getByText('Undo')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('without a toast the cycle is unchanged', async () => {
    render(<Harness active onEscape={() => {}} />);
    screen.getByText('last').focus();
    await userEvent.tab();
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('an empty toast region changes nothing', async () => {
    render(
      <>
        <Harness active onEscape={() => {}} />
        <ToastRegion>{null}</ToastRegion>
      </>,
    );
    screen.getByText('last').focus();
    await userEvent.tab();
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('a toast button gives a dialog without controls a focus cycle', async () => {
    render(
      <>
        <EmptyHarness />
        <ToastRegion>
          <button type="button">Undo</button>
        </ToastRegion>
      </>,
    );
    screen.getByText('Undo').focus();
    await userEvent.tab();
    expect(screen.getByText('Undo')).toHaveFocus();
  });

  it('Escape still goes to the dialog while a toast has focus', async () => {
    const onEscape = jest.fn();
    render(
      <>
        <Harness active onEscape={onEscape} />
        <ToastRegion>
          <button type="button">Undo</button>
        </ToastRegion>
      </>,
    );
    screen.getByText('Undo').focus();
    await userEvent.keyboard('{Escape}');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});

function tab(shift = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

function DialogWithHeading() {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { active: true, onEscape: () => {} });
  return (
    <div ref={ref}>
      <h2 tabIndex={-1}>Heading</h2>
      <button type="button">one</button>
      <button type="button">two</button>
    </div>
  );
}

describe('useFocusTrap steps through the combined list itself (#2230)', () => {
  it('takes over every Tab and Shift+Tab inside the cycle (always preventDefault)', () => {
    render(
      <>
        <Harness active onEscape={() => {}} />
        <ToastRegion>
          <button type="button">Undo</button>
        </ToastRegion>
      </>,
    );
    screen.getByText('first').focus();
    expect(tab().defaultPrevented).toBe(true);
    expect(screen.getByText('middle')).toHaveFocus();
    expect(tab(true).defaultPrevented).toBe(true);
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('walks dialog controls, then toast buttons, and wraps both ways', () => {
    render(
      <>
        <Harness active onEscape={() => {}} />
        <ToastRegion>
          <button type="button">Undo</button>
          <button type="button">Dismiss</button>
        </ToastRegion>
      </>,
    );
    screen.getByText('first').focus();
    const forward = ['middle', 'last', 'Undo', 'Dismiss', 'first'];
    for (const name of forward) {
      tab();
      expect(screen.getByText(name)).toHaveFocus();
    }
    const backward = ['Dismiss', 'Undo', 'last'];
    for (const name of backward) {
      tab(true);
      expect(screen.getByText(name)).toHaveFocus();
    }
  });

  it('focus on another page control (not body, not listed): the browser handles Tab natively', () => {
    render(
      <>
        <Harness active onEscape={() => {}} />
        <ToastRegion>
          <button type="button">Undo</button>
        </ToastRegion>
      </>,
    );
    const outside = screen.getByText('outside');
    outside.focus();
    expect(tab().defaultPrevented).toBe(false);
    expect(tab(true).defaultPrevented).toBe(false);
    expect(outside).toHaveFocus();
  });

  it('focus on the body: Tab goes to the first item, Shift+Tab to the last', () => {
    render(<Harness active onEscape={() => {}} />);
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.body).toHaveFocus();
    tab();
    expect(screen.getByText('first')).toHaveFocus();
    (document.activeElement as HTMLElement | null)?.blur();
    tab(true);
    expect(screen.getByText('last')).toHaveFocus();
  });

  it('focus on a non-listed element inside the dialog: the browser handles Tab natively', () => {
    render(<DialogWithHeading />);
    const heading = screen.getByRole('heading', { name: 'Heading' });
    heading.focus();
    expect(heading).toHaveFocus();
    expect(tab().defaultPrevented).toBe(false);
    expect(tab(true).defaultPrevented).toBe(false);
    expect(heading).toHaveFocus();
  });

  it('a toast portal placed BEFORE the dialog in the DOM is still reached from the last control', () => {
    render(
      <>
        <ToastRegion>
          <button type="button">Undo</button>
        </ToastRegion>
        <Harness active onEscape={() => {}} />
      </>,
    );
    screen.getByText('last').focus();
    tab();
    expect(screen.getByText('Undo')).toHaveFocus();
    tab();
    expect(screen.getByText('first')).toHaveFocus();
    tab(true);
    expect(screen.getByText('Undo')).toHaveFocus();
  });

  it('a toast portal before the dialog: Tab with real user events also reaches Undo', async () => {
    render(
      <>
        <ToastRegion>
          <button type="button">Undo</button>
        </ToastRegion>
        <Harness active onEscape={() => {}} />
      </>,
    );
    screen.getByText('last').focus();
    await userEvent.tab();
    expect(screen.getByText('Undo')).toHaveFocus();
  });

  it('only the topmost trap steps; an inner trap leaves Tab to the top one', () => {
    function Two() {
      const outerRef = useRef<HTMLDivElement>(null);
      const innerRef = useRef<HTMLDivElement>(null);
      useFocusTrap(outerRef, { active: true, onEscape: () => {} });
      useFocusTrap(innerRef, { active: true, onEscape: () => {} });
      return (
        <>
          <div ref={outerRef}>
            <button type="button">o1</button>
          </div>
          <div ref={innerRef}>
            <button type="button">i1</button>
            <button type="button">i2</button>
          </div>
        </>
      );
    }
    render(<Two />);
    screen.getByText('i2').focus();
    tab();
    expect(screen.getByText('i1')).toHaveFocus();
  });

  it('does not touch Tab while inactive', () => {
    render(<Harness active={false} onEscape={() => {}} />);
    screen.getByText('last').focus();
    expect(tab().defaultPrevented).toBe(false);
  });

  it('leaves non-Tab, non-Escape keys alone', () => {
    render(<Harness active onEscape={() => {}} />);
    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('useFocusTrap skips elements that refuse focus (#2230)', () => {
  function refuseFocus(el: HTMLElement) {
    el.focus = () => {};
  }

  it('Tab skips a listed control that refuses focus and lands on the next one', () => {
    render(<Harness active onEscape={() => {}} />);
    refuseFocus(screen.getByText('middle'));
    screen.getByText('first').focus();

    const event = tab();
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByText('last')).toHaveFocus();
  });

  it('Shift+Tab skips a refusing control as well, wrapping if needed', () => {
    render(<Harness active onEscape={() => {}} />);
    refuseFocus(screen.getByText('middle'));
    screen.getByText('last').focus();

    expect(tab(true).defaultPrevented).toBe(true);
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('skips a refusing toast button when wrapping from the last dialog control', () => {
    render(
      <>
        <Harness active onEscape={() => {}} />
        <ToastRegion>
          <button type="button">Undo</button>
        </ToastRegion>
      </>,
    );
    refuseFocus(screen.getByText('Undo'));
    screen.getByText('last').focus();

    expect(tab().defaultPrevented).toBe(true);
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('does not preventDefault when every listed control refuses focus', () => {
    render(<Harness active onEscape={() => {}} />);
    for (const name of ['first', 'middle', 'last']) refuseFocus(screen.getByText(name));
    (document.activeElement as HTMLElement | null)?.blur();

    expect(tab().defaultPrevented).toBe(false);
    expect(tab(true).defaultPrevented).toBe(false);
  });

  it('keeps focus on the only control when it is the single listed element', () => {
    render(<SingleHarness />);
    screen.getByText('only').focus();
    expect(tab().defaultPrevented).toBe(true);
    expect(screen.getByText('only')).toHaveFocus();
  });
});

function SingleHarness() {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { active: true, onEscape: () => {} });
  return (
    <div ref={ref}>
      <button type="button">only</button>
    </div>
  );
}
