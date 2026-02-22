/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from './Tooltip.js';

// CSS modules are mocked via identity-obj-proxy (classNames returned as-is)

describe('Tooltip', () => {
  // jsdom's fake timers support — the component uses a 50ms hide delay
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runAllTimers();
    jest.useRealTimers();
  });

  // ── Render ────────────────────────────────────────────────────────────────

  it('renders children', () => {
    render(
      <Tooltip content="Tooltip text">
        <button type="button">Trigger</button>
      </Tooltip>,
    );

    expect(screen.getByRole('button', { name: 'Trigger' })).toBeInTheDocument();
  });

  it('renders tooltip content (string)', () => {
    render(
      <Tooltip content="My tooltip content">
        <span>Hover me</span>
      </Tooltip>,
    );

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent('My tooltip content');
  });

  it('renders tooltip content as ReactNode', () => {
    render(
      <Tooltip content={<strong data-testid="rich-content">Bold Tip</strong>}>
        <span>Hover me</span>
      </Tooltip>,
    );

    expect(screen.getByTestId('rich-content')).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toContainElement(screen.getByTestId('rich-content'));
  });

  // ── aria-describedby ────────────────────────────────────────────────────

  it('sets aria-describedby on the trigger wrapper linking it to the tooltip', () => {
    const { container } = render(
      <Tooltip content="Described tooltip">
        <button type="button">Trigger</button>
      </Tooltip>,
    );

    const tooltip = screen.getByRole('tooltip');
    const tooltipId = tooltip.id;
    expect(tooltipId).toBeTruthy();

    // The inner span with aria-describedby should reference the tooltip id
    const describedSpan = container.querySelector(`[aria-describedby="${tooltipId}"]`);
    expect(describedSpan).toBeInTheDocument();
    expect(describedSpan).toContainElement(screen.getByRole('button', { name: 'Trigger' }));
  });

  it('uses the provided id prop for the tooltip element', () => {
    render(
      <Tooltip content="Fixed ID tooltip" id="my-fixed-tooltip">
        <span>Trigger</span>
      </Tooltip>,
    );

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.id).toBe('my-fixed-tooltip');
  });

  it('generates a unique id via useId when no id prop is provided', () => {
    const { unmount } = render(
      <Tooltip content="Auto id tooltip">
        <span>Trigger</span>
      </Tooltip>,
    );
    const tooltip = screen.getByRole('tooltip');
    const generatedId = tooltip.id;
    expect(generatedId).toBeTruthy();
    expect(generatedId).toMatch(/tooltip-/);
    unmount();
  });

  // ── Visibility: mouse ───────────────────────────────────────────────────

  it('shows tooltip on mouseenter', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <Tooltip content="Mouse tooltip">
        <button type="button">Hover trigger</button>
      </Tooltip>,
    );

    const tooltip = screen.getByRole('tooltip');
    // Initially not visible (no `visible` class)
    expect(tooltip).not.toHaveClass('visible');

    // Find the outer wrapper span and mouseenter it
    const wrapper = tooltip.closest('span[class]')!;
    await user.hover(wrapper);
    act(() => jest.runAllTimers());

    expect(tooltip).toHaveClass('visible');
  });

  it('hides tooltip after mouseleave (after 50ms delay)', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <Tooltip content="Mouse tooltip">
        <button type="button">Hover trigger</button>
      </Tooltip>,
    );

    const wrapper = screen.getByRole('tooltip').closest('span[class]')!;
    await user.hover(wrapper);
    act(() => jest.runAllTimers());

    expect(screen.getByRole('tooltip')).toHaveClass('visible');

    await user.unhover(wrapper);
    // Before the timer fires, tooltip should still be visible
    // (the 50ms debounce hasn't elapsed yet)
    // Advance timers to trigger the hide
    act(() => jest.advanceTimersByTime(100));

    expect(screen.getByRole('tooltip')).not.toHaveClass('visible');
  });

  // ── Visibility: focus/blur ────────────────────────────────────────────────

  it('shows tooltip on focus', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <Tooltip content="Focus tooltip">
        <button type="button">Focusable</button>
      </Tooltip>,
    );

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).not.toHaveClass('visible');

    await user.tab(); // focuses the button
    act(() => jest.runAllTimers());

    expect(tooltip).toHaveClass('visible');
  });

  it('hides tooltip on blur', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <Tooltip content="Blur tooltip">
        <button type="button">Focusable</button>
      </Tooltip>,
    );

    const tooltip = screen.getByRole('tooltip');

    // Focus to show
    await user.tab();
    act(() => jest.runAllTimers());
    expect(tooltip).toHaveClass('visible');

    // Blur to hide (tab away)
    await user.tab();
    act(() => jest.advanceTimersByTime(100));

    expect(tooltip).not.toHaveClass('visible');
  });

  // ── Rapid hover in/out cancels hide timer ────────────────────────────────

  it('cancels hide timer when mouseenter fires before delay elapses', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <Tooltip content="Rapid tooltip">
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    const wrapper = screen.getByRole('tooltip').closest('span[class]')!;
    await user.hover(wrapper);
    act(() => jest.runAllTimers());

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveClass('visible');

    // Mouseleave then immediately mouseenter again
    await user.unhover(wrapper);
    // Only advance 20ms — hide timer hasn't fired yet
    act(() => jest.advanceTimersByTime(20));
    await user.hover(wrapper);
    act(() => jest.runAllTimers());

    // Tooltip should still be visible (hide was cancelled)
    expect(tooltip).toHaveClass('visible');
  });
});
