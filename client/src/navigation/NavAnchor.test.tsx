/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRouterLog, RecordingRouter } from '../test/recordingRouter';
import { NavAnchor } from './NavAnchor.js';

function setup(props: Partial<ComponentProps<typeof NavAnchor>> = {}) {
  const log = createRouterLog();
  render(
    <RecordingRouter entries={['/start']} log={log}>
      <NavAnchor to="/tasks" data-testid="anchor" className="x" {...props}>
        Tasks
      </NavAnchor>
    </RecordingRouter>,
  );
  return { log, anchor: screen.getByTestId('anchor') };
}

describe('NavAnchor', () => {
  it('renders a real anchor with the resolved href and passes other attributes through', () => {
    const { anchor } = setup({ 'aria-current': 'page' });
    expect(anchor.tagName).toBe('A');
    expect(anchor).toHaveAttribute('href', '/tasks');
    expect(anchor).toHaveAttribute('aria-current', 'page');
    expect(anchor).toHaveClass('x');
  });

  it('pushes an in-app navigation on a plain click', () => {
    const { log, anchor } = setup();
    fireEvent.click(anchor);
    expect(log.actions).toEqual(['PUSH /tasks']);
  });

  it('replaces the entry when replace is set', () => {
    const { log, anchor } = setup({ replace: true });
    fireEvent.click(anchor);
    expect(log.actions).toEqual(['REPLACE /tasks']);
  });

  it('runs onNavigate when clicked and still navigates', () => {
    const onNavigate = jest.fn();
    const { log, anchor } = setup({ onNavigate });
    fireEvent.click(anchor);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(log.actions).toEqual(['PUSH /tasks']);
  });

  it('leaves a modified click to the browser (no in-app navigation)', () => {
    const { log, anchor } = setup();
    fireEvent.click(anchor, { ctrlKey: true });
    expect(log.actions).toEqual([]);
  });

  describe('onNavigate only for a plain in-app click', () => {
    it('calls onNavigate exactly once for a plain left click', () => {
      const onNavigate = jest.fn();
      const { anchor } = setup({ onNavigate });
      fireEvent.click(anchor);
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['ctrl', { ctrlKey: true }],
      ['meta', { metaKey: true }],
      ['shift', { shiftKey: true }],
      ['alt', { altKey: true }],
      ['middle button', { button: 1 }],
    ])('does not call onNavigate for a %s click (the browser opens it elsewhere)', (_l, init) => {
      const onNavigate = jest.fn();
      const { anchor } = setup({ onNavigate });
      fireEvent.click(anchor, init);
      expect(onNavigate).not.toHaveBeenCalled();
    });

    it('does not call onNavigate for a link with a target (target="_blank")', () => {
      const onNavigate = jest.fn();
      const { anchor } = setup({ onNavigate, target: '_blank' });
      fireEvent.click(anchor);
      expect(onNavigate).not.toHaveBeenCalled();
    });
  });
});
