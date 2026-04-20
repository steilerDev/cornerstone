/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render } from '@testing-library/react';
import { Badge } from './Badge.js';
import badgeStyles from './Badge.module.css';

// identity-obj-proxy returns the CSS class name as its own key (e.g. badgeStyles.badge === 'badge')

const SIMPLE_VARIANTS = {
  foo: { label: 'Foo Label', className: badgeStyles.not_started! },
  bar: { label: 'Bar Label', className: badgeStyles.in_progress! },
};

describe('Badge', () => {
  // ─── Label rendering ────────────────────────────────────────────────────────

  it('renders the label from the variant map for the given value', () => {
    const { container } = render(<Badge variants={SIMPLE_VARIANTS} value="foo" />);
    const span = container.querySelector('span');
    expect(span?.textContent).toBe('Foo Label');
  });

  it('renders label for a different variant value', () => {
    const { container } = render(<Badge variants={SIMPLE_VARIANTS} value="bar" />);
    const span = container.querySelector('span');
    expect(span?.textContent).toBe('Bar Label');
  });

  // ─── Element type ───────────────────────────────────────────────────────────

  it('renders as a span element', () => {
    const { container } = render(<Badge variants={SIMPLE_VARIANTS} value="foo" />);
    const span = container.querySelector('span');
    expect(span).toBeInTheDocument();
    expect(span?.tagName.toLowerCase()).toBe('span');
  });

  // ─── CSS classes ────────────────────────────────────────────────────────────

  it('applies the base badge CSS class', () => {
    const { container } = render(<Badge variants={SIMPLE_VARIANTS} value="foo" />);
    const span = container.querySelector('span');
    expect(span?.getAttribute('class') ?? '').toContain('badge');
  });

  it('applies the variant-specific CSS class from the variant map', () => {
    const { container } = render(<Badge variants={SIMPLE_VARIANTS} value="foo" />);
    const span = container.querySelector('span');
    // identity-obj-proxy: badgeStyles.not_started === 'not_started'
    expect(span?.getAttribute('class') ?? '').toContain('not_started');
  });

  it('applies the correct variant CSS class for a different variant value', () => {
    const { container } = render(<Badge variants={SIMPLE_VARIANTS} value="bar" />);
    const span = container.querySelector('span');
    expect(span?.getAttribute('class') ?? '').toContain('in_progress');
  });

  it('applies extra className in addition to base and variant class', () => {
    const { container } = render(
      <Badge variants={SIMPLE_VARIANTS} value="foo" className="extra-class" />,
    );
    const span = container.querySelector('span');
    const cls = span?.getAttribute('class') ?? '';
    expect(cls).toContain('badge');
    expect(cls).toContain('not_started');
    expect(cls).toContain('extra-class');
  });

  // ─── aria-label ─────────────────────────────────────────────────────────────

  it('renders ariaLabel as aria-label attribute when provided', () => {
    const { container } = render(
      <Badge variants={SIMPLE_VARIANTS} value="foo" ariaLabel="Status: Foo Label" />,
    );
    const span = container.querySelector('span');
    expect(span).toHaveAttribute('aria-label', 'Status: Foo Label');
  });

  it('does not render aria-label attribute when ariaLabel is omitted', () => {
    const { container } = render(<Badge variants={SIMPLE_VARIANTS} value="foo" />);
    const span = container.querySelector('span');
    expect(span).not.toHaveAttribute('aria-label');
  });

  // ─── data-testid ────────────────────────────────────────────────────────────

  it('renders testId as data-testid attribute when provided', () => {
    const { container } = render(
      <Badge variants={SIMPLE_VARIANTS} value="foo" testId="my-badge" />,
    );
    const span = container.querySelector('span');
    expect(span).toHaveAttribute('data-testid', 'my-badge');
  });

  it('does not render data-testid attribute when testId is omitted', () => {
    const { container } = render(<Badge variants={SIMPLE_VARIANTS} value="foo" />);
    const span = container.querySelector('span');
    expect(span).not.toHaveAttribute('data-testid');
  });

  // ─── Unknown value fallback ─────────────────────────────────────────────────

  it('falls back to rendering the raw value string when value is not in the variant map', () => {
    const { container } = render(<Badge variants={SIMPLE_VARIANTS} value="unknown_value" />);
    const span = container.querySelector('span');
    expect(span?.textContent).toBe('unknown_value');
  });

  it('still applies the base badge class when value is not in the variant map', () => {
    const { container } = render(<Badge variants={SIMPLE_VARIANTS} value="unknown_value" />);
    const span = container.querySelector('span');
    expect(span?.getAttribute('class') ?? '').toContain('badge');
  });

  // ─── Empty variant map ──────────────────────────────────────────────────────

  it('handles an empty variants map without throwing', () => {
    expect(() => {
      render(<Badge variants={{}} value="anything" />);
    }).not.toThrow();
  });

  it('renders the raw value when variants map is empty', () => {
    const { container } = render(<Badge variants={{}} value="raw_value" />);
    const span = container.querySelector('span');
    expect(span?.textContent).toBe('raw_value');
  });
});
