/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  getFocusableElements,
  isEscapeHandled,
  markEscapeHandled,
  useFocusTrap,
} from './useFocusTrap.js';

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

function refuseFocus(el: HTMLElement) {
  el.focus = () => {};
}

function Dialog({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { active: true, onEscape: () => {} });
  return <div ref={ref}>{children}</div>;
}

describe('useFocusTrap intervenes only at the joins (#2230)', () => {
  it('leaves Tab and Shift+Tab inside the dialog to the browser', () => {
    render(<Harness active onEscape={() => {}} />);
    screen.getByText('first').focus();
    expect(tab().defaultPrevented).toBe(false);
    screen.getByText('middle').focus();
    expect(tab().defaultPrevented).toBe(false);
    expect(tab(true).defaultPrevented).toBe(false);
  });

  it('leaves a radio group in the middle alone (no preventDefault)', () => {
    render(
      <Dialog>
        <button type="button">top</button>
        <input type="radio" name="g" aria-label="r1" />
        <input type="radio" name="g" aria-label="r2" defaultChecked />
        <input type="radio" name="g" aria-label="r3" />
        <button type="button">bottom</button>
      </Dialog>,
    );
    for (const name of ['r1', 'r2', 'r3']) {
      screen.getByLabelText(name).focus();
      expect(tab().defaultPrevented).toBe(false);
      expect(tab(true).defaultPrevented).toBe(false);
    }
  });

  it('a summary element inside the dialog is a normal stop the browser steps through', () => {
    render(
      <Dialog>
        <button type="button">before</button>
        <details>
          <summary tabIndex={0}>more</summary>
          <button type="button">inside</button>
        </details>
        <button type="button">after</button>
      </Dialog>,
    );
    screen.getByText('more').focus();
    expect(tab().defaultPrevented).toBe(false);
    expect(tab(true).defaultPrevented).toBe(false);
  });

  it('without a toast: Tab from the last stop wraps to the first, Shift+Tab to the last', () => {
    render(<Harness active onEscape={() => {}} />);
    screen.getByText('last').focus();
    expect(tab().defaultPrevented).toBe(true);
    expect(screen.getByText('first')).toHaveFocus();
    expect(tab(true).defaultPrevented).toBe(true);
    expect(screen.getByText('last')).toHaveFocus();
  });

  it('with a toast: Tab from the last stop goes to the first toast button', () => {
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
    expect(tab().defaultPrevented).toBe(true);
    expect(screen.getByText('Undo')).toHaveFocus();
  });

  it('with a toast: Shift+Tab from the first stop goes to the last toast button', () => {
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
    expect(tab(true).defaultPrevented).toBe(true);
    expect(screen.getByText('Dismiss')).toHaveFocus();
  });

  it('inside the toast it steps between buttons and back into the dialog', () => {
    render(
      <>
        <Harness active onEscape={() => {}} />
        <ToastRegion>
          <button type="button">Undo</button>
          <button type="button">Dismiss</button>
        </ToastRegion>
      </>,
    );
    screen.getByText('Undo').focus();
    expect(tab().defaultPrevented).toBe(true);
    expect(screen.getByText('Dismiss')).toHaveFocus();
    // Forward past the last toast button: the first dialog item.
    expect(tab().defaultPrevented).toBe(true);
    expect(screen.getByText('first')).toHaveFocus();

    screen.getByText('Dismiss').focus();
    expect(tab(true).defaultPrevented).toBe(true);
    expect(screen.getByText('Undo')).toHaveFocus();
    // Backward past the first toast button: the last dialog item.
    expect(tab(true).defaultPrevented).toBe(true);
    expect(screen.getByText('last')).toHaveFocus();
  });

  it('a toast portal placed BEFORE the dialog in the DOM is still reached from the last stop', () => {
    render(
      <>
        <ToastRegion>
          <button type="button">Undo</button>
        </ToastRegion>
        <Harness active onEscape={() => {}} />
      </>,
    );
    screen.getByText('last').focus();
    expect(tab().defaultPrevented).toBe(true);
    expect(screen.getByText('Undo')).toHaveFocus();
    tab();
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('ignores disabled toast buttons and an empty toast region', () => {
    render(
      <>
        <Harness active onEscape={() => {}} />
        <ToastRegion>
          <button type="button" disabled>
            Busy
          </button>
        </ToastRegion>
      </>,
    );
    screen.getByText('last').focus();
    expect(tab().defaultPrevented).toBe(true);
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('focus on the body: Tab goes to the first dialog item, Shift+Tab to the last', () => {
    render(<Harness active onEscape={() => {}} />);
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.body).toHaveFocus();
    expect(tab().defaultPrevented).toBe(true);
    expect(screen.getByText('first')).toHaveFocus();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(tab(true).defaultPrevented).toBe(true);
    expect(screen.getByText('last')).toHaveFocus();
  });

  it('focus on another page control (neither dialog, toast nor body): native Tab', () => {
    render(<Harness active onEscape={() => {}} />);
    const outside = screen.getByText('outside');
    outside.focus();
    expect(tab().defaultPrevented).toBe(false);
    expect(tab(true).defaultPrevented).toBe(false);
    expect(outside).toHaveFocus();
  });

  it('focus on a non-listed element inside the dialog (tabindex -1 heading): native Tab', () => {
    render(
      <Dialog>
        <h2 tabIndex={-1}>Heading</h2>
        <button type="button">one</button>
      </Dialog>,
    );
    screen.getByRole('heading', { name: 'Heading' }).focus();
    expect(tab().defaultPrevented).toBe(false);
    expect(tab(true).defaultPrevented).toBe(false);
  });

  it('a dialog without focusable items has nowhere to wrap: Tab is left alone', () => {
    render(<EmptyHarness />);
    expect(tab().defaultPrevented).toBe(false);
    expect(tab(true).defaultPrevented).toBe(false);
  });

  it('a dialog without items steps from the toast back to nothing and leaves Tab alone', () => {
    render(
      <>
        <EmptyHarness />
        <ToastRegion>
          <button type="button">Undo</button>
        </ToastRegion>
      </>,
    );
    screen.getByText('Undo').focus();
    expect(tab().defaultPrevented).toBe(false);
    expect(screen.getByText('Undo')).toHaveFocus();
  });
});

describe('useFocusTrap radio groups at the edges (#2230)', () => {
  function EdgeRadios({ toast }: { toast: boolean }) {
    return (
      <>
        <Dialog>
          <input type="radio" name="first" aria-label="a1" />
          <input type="radio" name="first" aria-label="a2" defaultChecked />
          <button type="button">middle</button>
          <input type="radio" name="last" aria-label="z1" />
          <input type="radio" name="last" aria-label="z2" />
        </Dialog>
        {toast ? (
          <ToastRegion>
            <button type="button">Undo</button>
          </ToastRegion>
        ) : null}
      </>
    );
  }

  it('any radio of the last group counts as the last stop (forward leaves the dialog)', () => {
    render(<EdgeRadios toast />);
    for (const name of ['z1', 'z2']) {
      screen.getByLabelText(name).focus();
      expect(tab().defaultPrevented).toBe(true);
      expect(screen.getByText('Undo')).toHaveFocus();
    }
  });

  it('any radio of the first group counts as the first stop (backward leaves the dialog)', () => {
    render(<EdgeRadios toast />);
    for (const name of ['a1', 'a2']) {
      screen.getByLabelText(name).focus();
      expect(tab(true).defaultPrevented).toBe(true);
      expect(screen.getByText('Undo')).toHaveFocus();
    }
  });

  it('wraps from a radio of an edge group without a toast', () => {
    render(<EdgeRadios toast={false} />);
    screen.getByLabelText('z2').focus();
    expect(tab().defaultPrevented).toBe(true);
    // The first stop is the first group's checked radio.
    expect(screen.getByLabelText('a2')).toHaveFocus();
    screen.getByLabelText('a1').focus();
    expect(tab(true).defaultPrevented).toBe(true);
    // The last stop is the last group's first radio (none checked).
    expect(screen.getByLabelText('z1')).toHaveFocus();
  });

  it('a radio without a name is its own stop', () => {
    render(
      <Dialog>
        <input type="radio" aria-label="n1" />
        <input type="radio" aria-label="n2" />
      </Dialog>,
    );
    screen.getByLabelText('n1').focus();
    expect(tab(true).defaultPrevented).toBe(true);
    expect(screen.getByLabelText('n2')).toHaveFocus();
    expect(tab().defaultPrevented).toBe(true);
    expect(screen.getByLabelText('n1')).toHaveFocus();
  });

  it('radios with the same name in different forms are different groups', () => {
    render(
      <Dialog>
        <form>
          <input type="radio" name="g" aria-label="f1" />
        </form>
        <form>
          <input type="radio" name="g" aria-label="f2" />
        </form>
      </Dialog>,
    );
    screen.getByLabelText('f1').focus();
    // f1 is the first stop of its own group, so Shift+Tab wraps to the last stop (f2).
    expect(tab(true).defaultPrevented).toBe(true);
    expect(screen.getByLabelText('f2')).toHaveFocus();
  });
});

describe('useFocusTrap skips targets that refuse focus (#2230)', () => {
  it('wrap without a toast: skips a refusing first item and lands on the next one', () => {
    render(<Harness active onEscape={() => {}} />);
    refuseFocus(screen.getByText('first'));
    screen.getByText('last').focus();
    expect(tab().defaultPrevented).toBe(true);
    expect(screen.getByText('middle')).toHaveFocus();
  });

  it('Shift+Tab wrap skips a refusing last item', () => {
    render(<Harness active onEscape={() => {}} />);
    screen.getByText('first').focus();
    refuseFocus(screen.getByText('last'));
    expect(tab(true).defaultPrevented).toBe(true);
    expect(screen.getByText('middle')).toHaveFocus();
  });

  it('a refusing first toast button falls back to the next toast button', () => {
    render(
      <>
        <Harness active onEscape={() => {}} />
        <ToastRegion>
          <button type="button">Undo</button>
          <button type="button">Dismiss</button>
        </ToastRegion>
      </>,
    );
    refuseFocus(screen.getByText('Undo'));
    screen.getByText('last').focus();
    expect(tab().defaultPrevented).toBe(true);
    expect(screen.getByText('Dismiss')).toHaveFocus();
  });

  it('does not preventDefault when every target refuses focus', () => {
    render(<Harness active onEscape={() => {}} />);
    for (const name of ['first', 'middle', 'last']) refuseFocus(screen.getByText(name));
    (document.activeElement as HTMLElement | null)?.blur();
    expect(tab().defaultPrevented).toBe(false);
    expect(tab(true).defaultPrevented).toBe(false);
  });

  it('a single control wraps onto itself', () => {
    render(
      <Dialog>
        <button type="button">only</button>
      </Dialog>,
    );
    screen.getByText('only').focus();
    expect(tab().defaultPrevented).toBe(true);
    expect(screen.getByText('only')).toHaveFocus();
  });
});

describe('useFocusTrap Escape and the stack (#2230)', () => {
  it('Escape still goes to the dialog while a toast button has focus', async () => {
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

  it('does not touch Tab while inactive, and leaves other keys alone', () => {
    render(<Harness active={false} onEscape={() => {}} />);
    screen.getByText('last').focus();
    expect(tab().defaultPrevented).toBe(false);
    const other = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    document.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it('only the topmost trap handles Tab', () => {
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
    expect(tab().defaultPrevented).toBe(true);
    expect(screen.getByText('i1')).toHaveFocus();
  });
});

describe('markEscapeHandled (#2231)', () => {
  function escapeEvent() {
    return new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  }

  it('reports only marked events as handled', () => {
    const marked = escapeEvent();
    const other = escapeEvent();
    markEscapeHandled(marked);
    expect(isEscapeHandled(marked)).toBe(true);
    expect(isEscapeHandled(other)).toBe(false);
  });

  it('an Escape marked by an inner layer does not call onEscape and is not prevented', () => {
    const onEscape = jest.fn();
    render(<Harness active onEscape={onEscape} />);
    const event = escapeEvent();
    markEscapeHandled(event);
    document.dispatchEvent(event);
    expect(onEscape).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('the next, unmarked Escape is handled normally', () => {
    const onEscape = jest.fn();
    render(<Harness active onEscape={onEscape} />);
    const handled = escapeEvent();
    markEscapeHandled(handled);
    document.dispatchEvent(handled);
    document.dispatchEvent(escapeEvent());
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('marking a Tab event does not stop the Tab wrap', () => {
    render(<Harness active onEscape={() => {}} />);
    screen.getByText('last').focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    markEscapeHandled(tab);
    document.dispatchEvent(tab);
    expect(screen.getByText('first')).toHaveFocus();
  });
});
