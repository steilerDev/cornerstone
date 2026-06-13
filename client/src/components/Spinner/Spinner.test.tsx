/**
 * @jest-environment jsdom
 *
 * Unit tests for Spinner shared component (Story #1576).
 *
 * Covers:
 * - Default rendering (role="img", aria-label, SVG element)
 * - Custom label prop
 * - Size prop (sm / md / lg) → style width/height CSS custom property strings
 * - Color prop (primary / muted) → stroke color on circle elements
 * - Defaults when no props supplied
 * - CSS module class for animation
 */

import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { Spinner } from './Spinner.js';

// CSS modules are mocked via identity-obj-proxy; class names are returned as-is.

describe('Spinner', () => {
  // ── Default rendering ────────────────────────────────────────────────────

  it('renders an svg element with role="img"', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
  });

  it('renders with default aria-label "Loading"', () => {
    render(<Spinner />);
    const el = screen.getByRole('img', { name: 'Loading' });
    expect(el).toBeInTheDocument();
  });

  it('renders without crashing when all props are omitted (defaults)', () => {
    expect(() => render(<Spinner />)).not.toThrow();
  });

  // ── label prop ────────────────────────────────────────────────────────────

  it('renders with custom label prop as aria-label', () => {
    render(<Spinner label="Analyzing invoice" />);
    const el = screen.getByRole('img', { name: 'Analyzing invoice' });
    expect(el).toBeInTheDocument();
  });

  it('uses the label prop value verbatim (preserves case)', () => {
    render(<Spinner label="Please wait..." />);
    expect(screen.getByRole('img', { name: 'Please wait...' })).toBeInTheDocument();
  });

  // ── size prop ─────────────────────────────────────────────────────────────

  it('applies sm size using var(--spacing-4) as width and height', () => {
    const { container } = render(<Spinner size="sm" />);
    const svg = container.querySelector('svg') as SVGElement;
    // SIZE_MAP.sm = { diameter: 'var(--spacing-4)', stroke: 2 }
    expect(svg.style.width).toBe('var(--spacing-4)');
    expect(svg.style.height).toBe('var(--spacing-4)');
  });

  it('applies md size using var(--spacing-6) as width and height', () => {
    const { container } = render(<Spinner size="md" />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.style.width).toBe('var(--spacing-6)');
    expect(svg.style.height).toBe('var(--spacing-6)');
  });

  it('applies lg size using var(--spacing-10) as width and height', () => {
    const { container } = render(<Spinner size="lg" />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.style.width).toBe('var(--spacing-10)');
    expect(svg.style.height).toBe('var(--spacing-10)');
  });

  it('defaults to md size (var(--spacing-6)) when size prop is omitted', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.style.width).toBe('var(--spacing-6)');
    expect(svg.style.height).toBe('var(--spacing-6)');
  });

  // ── color prop ────────────────────────────────────────────────────────────

  it('applies var(--color-primary) for primary color (default)', () => {
    const { container } = render(<Spinner color="primary" />);
    // The animated arc circle sets style.color to the stroke color
    const circles = container.querySelectorAll('circle');
    // At least one circle should have the primary color
    const hasPrimary = Array.from(circles).some((c) => c.style.color === 'var(--color-primary)');
    expect(hasPrimary).toBe(true);
  });

  it('applies var(--color-text-muted) for muted color variant', () => {
    const { container } = render(<Spinner color="muted" />);
    const circles = container.querySelectorAll('circle');
    const hasMuted = Array.from(circles).some((c) => c.style.color === 'var(--color-text-muted)');
    expect(hasMuted).toBe(true);
  });

  it('defaults to primary color (var(--color-primary)) when color prop is omitted', () => {
    const { container } = render(<Spinner />);
    const circles = container.querySelectorAll('circle');
    const hasPrimary = Array.from(circles).some((c) => c.style.color === 'var(--color-primary)');
    expect(hasPrimary).toBe(true);
  });

  // ── CSS module classes ────────────────────────────────────────────────────

  it('applies the spinner class from CSS module to the SVG element', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg') as SVGElement;
    // With identity-obj-proxy, className "spinner" is returned as-is
    expect(svg.className.baseVal).toContain('spinner');
  });

  it('applies the arc class from CSS module to the animated circle', () => {
    const { container } = render(<Spinner />);
    // The arc circle has the animated CSS class
    const arcCircle = container.querySelector('circle.arc');
    expect(arcCircle).not.toBeNull();
  });

  // ── SVG structure ─────────────────────────────────────────────────────────

  it('renders exactly 2 circle elements (track + arc)', () => {
    const { container } = render(<Spinner />);
    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(2);
  });

  it('sets viewBox="0 0 24 24" on the SVG', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
  });

  it('sets fill="none" on the SVG', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('fill')).toBe('none');
  });
});
