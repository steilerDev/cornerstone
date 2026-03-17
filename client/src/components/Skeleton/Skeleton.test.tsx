/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { Skeleton } from './Skeleton.js';

// CSS modules are mocked via identity-obj-proxy (classNames returned as-is)

describe('Skeleton', () => {
  // ── Default rendering ────────────────────────────────────────────────────

  it('renders 3 skeleton lines by default', () => {
    const { container } = render(<Skeleton />);

    const lines = container.querySelectorAll('[aria-hidden="true"]');
    expect(lines).toHaveLength(3);
  });

  it('renders the status role container', () => {
    render(<Skeleton />);

    const container = screen.getByRole('status');
    expect(container).toBeInTheDocument();
  });

  it('sets aria-busy="true" on the container', () => {
    render(<Skeleton />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('sets aria-label to "Loading" by default', () => {
    render(<Skeleton />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading');
  });

  // ── lines prop ────────────────────────────────────────────────────────────

  it('renders 1 line when lines=1', () => {
    const { container } = render(<Skeleton lines={1} />);

    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
  });

  it('renders 5 lines when lines=5', () => {
    const { container } = render(<Skeleton lines={5} />);

    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(5);
  });

  // ── widths prop ───────────────────────────────────────────────────────────

  it('applies custom widths from the widths prop to each line', () => {
    const { container } = render(<Skeleton lines={3} widths={['100%', '75%', '50%']} />);

    const lines = container.querySelectorAll('[aria-hidden="true"]');
    expect((lines[0] as HTMLElement).style.width).toBe('100%');
    expect((lines[1] as HTMLElement).style.width).toBe('75%');
    expect((lines[2] as HTMLElement).style.width).toBe('50%');
  });

  it('uses provided width for lines where widths array is defined, default for the rest', () => {
    // widths has 1 entry but lines=3 — only line 0 gets custom width
    const { container } = render(<Skeleton lines={3} widths={['90%']} />);

    const lines = container.querySelectorAll('[aria-hidden="true"]');
    // Line 0: custom width supplied
    expect((lines[0] as HTMLElement).style.width).toBe('90%');
    // Lines 1 and 2: fall back to default widths cycle (80%, 60%)
    expect((lines[1] as HTMLElement).style.width).toBe('80%');
    expect((lines[2] as HTMLElement).style.width).toBe('60%');
  });

  it('cycles through default widths (100%, 80%, 60%) when no widths provided', () => {
    const { container } = render(<Skeleton lines={6} />);

    const lines = container.querySelectorAll('[aria-hidden="true"]');
    const expectedWidths = ['100%', '80%', '60%', '100%', '80%', '60%'];
    expectedWidths.forEach((width, i) => {
      expect((lines[i] as HTMLElement).style.width).toBe(width);
    });
  });

  // ── loadingLabel prop ─────────────────────────────────────────────────────

  it('uses custom loadingLabel for aria-label', () => {
    render(<Skeleton loadingLabel="Loading work items" />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading work items');
  });

  // ── className prop ────────────────────────────────────────────────────────

  it('applies className prop to the container', () => {
    const { container } = render(<Skeleton className="my-custom-class" />);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('my-custom-class');
  });

  it('includes the skeleton base class alongside the custom className', () => {
    const { container } = render(<Skeleton className="extra" />);

    const wrapper = container.firstElementChild as HTMLElement;
    // identity-obj-proxy returns "skeleton" as-is
    expect(wrapper.className).toContain('skeleton');
    expect(wrapper.className).toContain('extra');
  });

  // ── Line CSS class (shimmer) ───────────────────────────────────────────────

  it('applies the line class to every rendered line div', () => {
    const { container } = render(<Skeleton lines={3} />);

    const lines = container.querySelectorAll('[aria-hidden="true"]');
    lines.forEach((line) => {
      // identity-obj-proxy returns CSS module class names as-is
      expect((line as HTMLElement).className).toContain('line');
    });
  });

  // ── Accessibility: line divs are hidden from AT ───────────────────────────

  it('marks every line div as aria-hidden="true"', () => {
    const { container } = render(<Skeleton lines={4} />);

    const lines = container.querySelectorAll('[aria-hidden="true"]');
    expect(lines).toHaveLength(4);
  });
});
