/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from './Tooltip.js';

// CSS modules are identity-mapped, so the visible state is the `visible` class.
const tip = () => screen.getByRole('tooltip');
const visible = () => tip().className.includes('visible');

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runAllTimers();
  jest.useRealTimers();
});

function setup(props: { toggleOnClick?: boolean; align?: 'center' | 'end' } = {}) {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(
    <Tooltip content="Net 100.00" id="tip-1" {...props}>
      <button type="button">Trigger</button>
    </Tooltip>,
  );
  return user;
}

describe('Tooltip toggleOnClick', () => {
  it('opens on click and closes on the next click', async () => {
    const user = setup({ toggleOnClick: true });
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    expect(visible()).toBe(false);
    fireEvent.click(trigger);
    expect(visible()).toBe(true);
    fireEvent.click(trigger);
    expect(visible()).toBe(false);
    expect(user).toBeDefined();
  });

  it('a click after hover or focus pins the tip; the following click closes it', async () => {
    const user = setup({ toggleOnClick: true });
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    await user.hover(trigger);
    expect(visible()).toBe(true);
    await user.click(trigger); // pins
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(visible()).toBe(true);
    fireEvent.click(trigger);
    expect(visible()).toBe(false);
  });

  it('does not toggle on click without the prop', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    expect(visible()).toBe(false);
  });

  it('opens on focus and hides shortly after blur', async () => {
    setup({ toggleOnClick: true });
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    act(() => trigger.focus());
    expect(visible()).toBe(true);
    act(() => trigger.blur());
    act(() => {
      jest.advanceTimersByTime(60);
    });
    expect(visible()).toBe(false);
  });

  it('a new show cancels a pending hide', async () => {
    const user = setup({ toggleOnClick: true });
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    await user.hover(trigger);
    await user.unhover(trigger);
    await user.hover(trigger);
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(visible()).toBe(true);
  });

  it('hideNow clears a pending hide timer', async () => {
    const user = setup({ toggleOnClick: true });
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    fireEvent.click(trigger); // pinned + visible
    fireEvent.mouseLeave(trigger.parentElement?.parentElement as HTMLElement); // pending hide
    fireEvent.click(trigger); // pinned & visible -> hideNow with a timer pending
    expect(visible()).toBe(false);
    expect(user).toBeDefined();
  });
});

describe('Tooltip Escape and align', () => {
  it('Escape hides a visible tooltip for every tooltip, with or without toggleOnClick', () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    act(() => trigger.focus());
    expect(visible()).toBe(true);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(visible()).toBe(false);
  });

  it('other keys leave it visible and Escape on a hidden tooltip does nothing', () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(visible()).toBe(false);
    act(() => trigger.focus());
    fireEvent.keyDown(trigger, { key: 'a' });
    expect(visible()).toBe(true);
  });

  it('align end adds the alignEnd class; the default does not', () => {
    setup({ align: 'end' });
    expect(tip().className).toContain('alignEnd');
  });

  it('default alignment has no alignEnd class and the id is used', () => {
    setup();
    expect(tip().className).not.toContain('alignEnd');
    expect(tip()).toHaveAttribute('id', 'tip-1');
  });
});
