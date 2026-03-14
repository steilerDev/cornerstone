/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, render } from '@testing-library/react';
import type * as BadgeTypes from './DiaryOutcomeBadge.js';

jest.unstable_mockModule('./DiaryOutcomeBadge.module.css', () => ({
  default: new Proxy(
    {},
    { get: (_t, prop) => (typeof prop === 'string' ? prop : '') },
  ),
}));

describe('DiaryOutcomeBadge', () => {
  let DiaryOutcomeBadge: typeof BadgeTypes.DiaryOutcomeBadge;

  beforeEach(async () => {
    localStorage.setItem('theme', 'light');
    ({ DiaryOutcomeBadge } = await import('./DiaryOutcomeBadge.js'));
  });

  afterEach(() => {
    localStorage.clear();
    jest.resetModules();
  });

  // ─── Labels ────────────────────────────────────────────────────────────────

  it('renders "Pass" label for pass outcome', () => {
    render(<DiaryOutcomeBadge outcome="pass" />);
    expect(screen.getByTestId('outcome-pass')).toHaveTextContent('Pass');
  });

  it('renders "Fail" label for fail outcome', () => {
    render(<DiaryOutcomeBadge outcome="fail" />);
    expect(screen.getByTestId('outcome-fail')).toHaveTextContent('Fail');
  });

  it('renders "Conditional" label for conditional outcome', () => {
    render(<DiaryOutcomeBadge outcome="conditional" />);
    expect(screen.getByTestId('outcome-conditional')).toHaveTextContent('Conditional');
  });

  // ─── CSS classes ───────────────────────────────────────────────────────────

  it('applies "pass" CSS class for pass outcome', () => {
    render(<DiaryOutcomeBadge outcome="pass" />);
    const badge = screen.getByTestId('outcome-pass');
    expect(badge.getAttribute('class') ?? '').toContain('pass');
  });

  it('applies "fail" CSS class for fail outcome', () => {
    render(<DiaryOutcomeBadge outcome="fail" />);
    const badge = screen.getByTestId('outcome-fail');
    expect(badge.getAttribute('class') ?? '').toContain('fail');
  });

  it('applies "conditional" CSS class for conditional outcome', () => {
    render(<DiaryOutcomeBadge outcome="conditional" />);
    const badge = screen.getByTestId('outcome-conditional');
    expect(badge.getAttribute('class') ?? '').toContain('conditional');
  });

  it('always applies the base "badge" class', () => {
    render(<DiaryOutcomeBadge outcome="pass" />);
    const badge = screen.getByTestId('outcome-pass');
    expect(badge.getAttribute('class') ?? '').toContain('badge');
  });

  // ─── data-testid ───────────────────────────────────────────────────────────

  it('renders as a span element', () => {
    render(<DiaryOutcomeBadge outcome="pass" />);
    const badge = screen.getByTestId('outcome-pass');
    expect(badge.tagName.toLowerCase()).toBe('span');
  });
});
