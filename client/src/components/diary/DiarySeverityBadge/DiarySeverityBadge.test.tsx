/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, render } from '@testing-library/react';
import type * as BadgeTypes from './DiarySeverityBadge.js';

jest.unstable_mockModule('./DiarySeverityBadge.module.css', () => ({
  default: new Proxy(
    {},
    { get: (_t, prop) => (typeof prop === 'string' ? prop : '') },
  ),
}));

describe('DiarySeverityBadge', () => {
  let DiarySeverityBadge: typeof BadgeTypes.DiarySeverityBadge;

  beforeEach(async () => {
    localStorage.setItem('theme', 'light');
    ({ DiarySeverityBadge } = await import('./DiarySeverityBadge.js'));
  });

  afterEach(() => {
    localStorage.clear();
    jest.resetModules();
  });

  // ─── Labels ────────────────────────────────────────────────────────────────

  it('renders "Low" label for low severity', () => {
    render(<DiarySeverityBadge severity="low" />);
    expect(screen.getByTestId('severity-low')).toHaveTextContent('Low');
  });

  it('renders "Medium" label for medium severity', () => {
    render(<DiarySeverityBadge severity="medium" />);
    expect(screen.getByTestId('severity-medium')).toHaveTextContent('Medium');
  });

  it('renders "High" label for high severity', () => {
    render(<DiarySeverityBadge severity="high" />);
    expect(screen.getByTestId('severity-high')).toHaveTextContent('High');
  });

  it('renders "Critical" label for critical severity', () => {
    render(<DiarySeverityBadge severity="critical" />);
    expect(screen.getByTestId('severity-critical')).toHaveTextContent('Critical');
  });

  // ─── CSS classes ───────────────────────────────────────────────────────────

  it('applies "low" CSS class for low severity', () => {
    render(<DiarySeverityBadge severity="low" />);
    const badge = screen.getByTestId('severity-low');
    expect(badge.getAttribute('class') ?? '').toContain('low');
  });

  it('applies "medium" CSS class for medium severity', () => {
    render(<DiarySeverityBadge severity="medium" />);
    const badge = screen.getByTestId('severity-medium');
    expect(badge.getAttribute('class') ?? '').toContain('medium');
  });

  it('applies "high" CSS class for high severity', () => {
    render(<DiarySeverityBadge severity="high" />);
    const badge = screen.getByTestId('severity-high');
    expect(badge.getAttribute('class') ?? '').toContain('high');
  });

  it('applies "critical" CSS class for critical severity', () => {
    render(<DiarySeverityBadge severity="critical" />);
    const badge = screen.getByTestId('severity-critical');
    expect(badge.getAttribute('class') ?? '').toContain('critical');
  });

  it('always applies the base "badge" class', () => {
    render(<DiarySeverityBadge severity="high" />);
    const badge = screen.getByTestId('severity-high');
    expect(badge.getAttribute('class') ?? '').toContain('badge');
  });

  // ─── Element type ──────────────────────────────────────────────────────────

  it('renders as a span element', () => {
    render(<DiarySeverityBadge severity="critical" />);
    const badge = screen.getByTestId('severity-critical');
    expect(badge.tagName.toLowerCase()).toBe('span');
  });
});
