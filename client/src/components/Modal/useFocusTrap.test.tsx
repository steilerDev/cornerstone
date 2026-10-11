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
