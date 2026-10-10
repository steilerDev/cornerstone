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
