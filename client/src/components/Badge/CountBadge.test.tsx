/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { CountBadge } from './CountBadge.js';
import DefaultCountBadge from './CountBadge.js';

describe('CountBadge', () => {
  it('renders nothing for 0', () => {
    const { container } = render(<CountBadge count={0} testId="b" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a negative count', () => {
    render(<CountBadge count={-3} testId="b" />);
    expect(screen.queryByTestId('b')).toBeNull();
  });

  it('shows a small count as is', () => {
    render(<CountBadge count={7} testId="b" />);
    expect(screen.getByTestId('b')).toHaveTextContent(/^7$/);
  });

  it('shows 99 as 99 (the cap is inclusive)', () => {
    render(<CountBadge count={99} testId="b" />);
    expect(screen.getByTestId('b')).toHaveTextContent(/^99$/);
  });

  it('caps 100 at "99+"', () => {
    render(<CountBadge count={100} testId="b" />);
    expect(screen.getByTestId('b')).toHaveTextContent(/^99\+$/);
  });

  it('caps at a custom max', () => {
    render(<CountBadge count={10} max={9} testId="b" />);
    expect(screen.getByTestId('b')).toHaveTextContent(/^9\+$/);
  });

  it('does not cap a count equal to a custom max', () => {
    render(<CountBadge count={9} max={9} testId="b" />);
    expect(screen.getByTestId('b')).toHaveTextContent(/^9$/);
  });

  it('is hidden from assistive technology (the host name carries the exact count)', () => {
    render(<CountBadge count={5} testId="b" />);
    expect(screen.getByTestId('b')).toHaveAttribute('aria-hidden', 'true');
  });

  it('applies the host position class next to its own class', () => {
    render(<CountBadge count={5} className="host-pos" testId="b" />);
    const badge = screen.getByTestId('b');
    expect(badge).toHaveClass('host-pos');
    expect(badge.className).toMatch(/badge/);
  });

  it('keeps only its own class when the host passes none', () => {
    render(<CountBadge count={5} testId="b" />);
    expect(screen.getByTestId('b').className).toMatch(/badge/);
    expect(screen.getByTestId('b').className).not.toMatch(/undefined/);
  });

  it('omits data-testid when none is given', () => {
    const { container } = render(<CountBadge count={5} />);
    expect(container.firstElementChild).not.toHaveAttribute('data-testid');
  });

  it('is also the default export', () => {
    expect(DefaultCountBadge).toBe(CountBadge);
  });
});
