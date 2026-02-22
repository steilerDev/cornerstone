/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BudgetBar } from './BudgetBar.js';
import type { BudgetBarSegment } from './BudgetBar.js';

// CSS modules mocked via identity-obj-proxy

describe('BudgetBar', () => {
  const baseSegments: BudgetBarSegment[] = [
    { key: 'claimed', value: 30000, color: 'var(--color-budget-claimed)', label: 'Claimed' },
    { key: 'paid', value: 20000, color: 'var(--color-budget-paid)', label: 'Paid' },
    { key: 'pending', value: 10000, color: 'var(--color-budget-pending)', label: 'Pending' },
  ];

  // ── Accessibility & ARIA ────────────────────────────────────────────────────

  it('renders with role="img"', () => {
    render(<BudgetBar segments={baseSegments} maxValue={100000} />);

    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('builds aria-label describing all non-zero segments', () => {
    render(
      <BudgetBar
        segments={baseSegments}
        maxValue={100000}
        formatValue={(v) => `€${v.toLocaleString()}`}
      />,
    );

    const bar = screen.getByRole('img');
    expect(bar).toHaveAttribute('aria-label', expect.stringContaining('Claimed'));
    expect(bar).toHaveAttribute('aria-label', expect.stringContaining('Paid'));
    expect(bar).toHaveAttribute('aria-label', expect.stringContaining('Pending'));
  });

  it('shows "Budget breakdown: no data" aria-label when all segments are zero', () => {
    const zeroSegments: BudgetBarSegment[] = [
      { key: 'claimed', value: 0, color: 'var(--color-budget-claimed)', label: 'Claimed' },
    ];
    render(<BudgetBar segments={zeroSegments} maxValue={100000} />);

    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Budget breakdown: no data');
  });

  it('includes overflow in aria-label when overflow > 0', () => {
    render(
      <BudgetBar
        segments={baseSegments}
        maxValue={100000}
        overflow={15000}
        formatValue={(v) => `€${v}`}
      />,
    );

    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Overflow'),
    );
  });

  it('is focusable (tabIndex=0)', () => {
    render(<BudgetBar segments={baseSegments} maxValue={100000} />);

    const bar = screen.getByRole('img');
    expect(bar).toHaveAttribute('tabIndex', '0');
  });

  // ── Segment rendering ────────────────────────────────────────────────────────

  it('renders a div segment for each non-zero segment', () => {
    const { container } = render(<BudgetBar segments={baseSegments} maxValue={100000} />);

    // Each segment is rendered as a child div with aria-hidden
    const segments = container.querySelectorAll('[aria-hidden="true"]');
    expect(segments).toHaveLength(3);
  });

  it('hides zero-value segments (does not render them)', () => {
    const segments: BudgetBarSegment[] = [
      { key: 'a', value: 50000, color: '#f00', label: 'A' },
      { key: 'b', value: 0, color: '#0f0', label: 'B' }, // zero — should not appear
      { key: 'c', value: 25000, color: '#00f', label: 'C' },
    ];
    const { container } = render(<BudgetBar segments={segments} maxValue={100000} />);

    // Only 2 non-zero segments should be rendered
    const renderedSegments = container.querySelectorAll('[aria-hidden="true"]');
    expect(renderedSegments).toHaveLength(2);
  });

  it('does not render negative-value segments', () => {
    const segments: BudgetBarSegment[] = [
      { key: 'a', value: 50000, color: '#f00', label: 'A' },
      { key: 'b', value: -1000, color: '#0f0', label: 'B' }, // negative
    ];
    const { container } = render(<BudgetBar segments={segments} maxValue={100000} />);

    const renderedSegments = container.querySelectorAll('[aria-hidden="true"]');
    expect(renderedSegments).toHaveLength(1);
  });

  it('renders segments with proportional width styles', () => {
    const segments: BudgetBarSegment[] = [
      { key: 'a', value: 50000, color: '#f00', label: 'A' }, // 50% of 100000
      { key: 'b', value: 25000, color: '#0f0', label: 'B' }, // 25% of 100000
    ];
    const { container } = render(<BudgetBar segments={segments} maxValue={100000} />);

    const segmentDivs = container.querySelectorAll('[aria-hidden="true"]');
    expect(segmentDivs[0]).toHaveStyle({ width: '50%' });
    expect(segmentDivs[1]).toHaveStyle({ width: '25%' });
  });

  it('caps segment width at 100% when value exceeds maxValue', () => {
    const segments: BudgetBarSegment[] = [
      { key: 'a', value: 200000, color: '#f00', label: 'A' }, // 200% — should cap at 100%
    ];
    const { container } = render(<BudgetBar segments={segments} maxValue={100000} />);

    const segmentDiv = container.querySelector('[aria-hidden="true"]')!;
    expect(segmentDiv).toHaveStyle({ width: '100%' });
  });

  it('sets backgroundColor to the segment color on each segment div', () => {
    const segments: BudgetBarSegment[] = [
      { key: 'a', value: 50000, color: 'var(--color-budget-claimed)', label: 'A' },
    ];
    const { container } = render(<BudgetBar segments={segments} maxValue={100000} />);

    const segmentDiv = container.querySelector('[aria-hidden="true"]')!;
    expect(segmentDiv).toHaveStyle({ backgroundColor: 'var(--color-budget-claimed)' });
  });

  // ── Overflow segment ────────────────────────────────────────────────────────

  it('renders overflow segment when overflow > 0', () => {
    const { container } = render(
      <BudgetBar segments={baseSegments} maxValue={100000} overflow={10000} />,
    );

    // 3 regular segments + 1 overflow segment
    const renderedSegments = container.querySelectorAll('[aria-hidden="true"]');
    expect(renderedSegments).toHaveLength(4);
  });

  it('does not render overflow segment when overflow is 0', () => {
    const { container } = render(
      <BudgetBar segments={baseSegments} maxValue={100000} overflow={0} />,
    );

    const renderedSegments = container.querySelectorAll('[aria-hidden="true"]');
    expect(renderedSegments).toHaveLength(3);
  });

  it('overflow segment has overflow CSS class applied', () => {
    const { container } = render(
      <BudgetBar segments={baseSegments} maxValue={100000} overflow={5000} />,
    );

    // identity-obj-proxy returns class names as-is
    const overflowDiv = container.querySelector('.overflow');
    expect(overflowDiv).toBeInTheDocument();
  });

  // ── Height variants ────────────────────────────────────────────────────────

  it('applies barMd class by default', () => {
    const { container } = render(<BudgetBar segments={baseSegments} maxValue={100000} />);

    expect(container.firstChild).toHaveClass('barMd');
  });

  it('applies barSm class when height="sm"', () => {
    const { container } = render(
      <BudgetBar segments={baseSegments} maxValue={100000} height="sm" />,
    );

    expect(container.firstChild).toHaveClass('barSm');
  });

  it('applies barLg class when height="lg"', () => {
    const { container } = render(
      <BudgetBar segments={baseSegments} maxValue={100000} height="lg" />,
    );

    expect(container.firstChild).toHaveClass('barLg');
  });

  // ── onSegmentHover ────────────────────────────────────────────────────────

  it('calls onSegmentHover with segment on mouseenter', async () => {
    const user = userEvent.setup();
    const onSegmentHover = jest.fn<(s: BudgetBarSegment | null) => void>();

    const { container } = render(
      <BudgetBar segments={baseSegments} maxValue={100000} onSegmentHover={onSegmentHover} />,
    );

    const firstSegment = container.querySelectorAll('[aria-hidden="true"]')[0] as HTMLElement;
    await user.hover(firstSegment);

    expect(onSegmentHover).toHaveBeenCalledWith(baseSegments[0]);
  });

  it('calls onSegmentHover with null on mouseleave', async () => {
    const user = userEvent.setup();
    const onSegmentHover = jest.fn<(s: BudgetBarSegment | null) => void>();

    const { container } = render(
      <BudgetBar segments={baseSegments} maxValue={100000} onSegmentHover={onSegmentHover} />,
    );

    const firstSegment = container.querySelectorAll('[aria-hidden="true"]')[0] as HTMLElement;
    await user.hover(firstSegment);
    await user.unhover(firstSegment);

    const calls = onSegmentHover.mock.calls;
    expect(calls[calls.length - 1][0]).toBeNull();
  });

  it('calls onSegmentHover with overflow segment data on overflow mouseenter', async () => {
    const user = userEvent.setup();
    const onSegmentHover = jest.fn<(s: BudgetBarSegment | null) => void>();

    const { container } = render(
      <BudgetBar
        segments={baseSegments}
        maxValue={100000}
        overflow={5000}
        onSegmentHover={onSegmentHover}
      />,
    );

    // The overflow segment is the last one
    const allSegments = container.querySelectorAll('[aria-hidden="true"]');
    const overflowSegment = allSegments[allSegments.length - 1] as HTMLElement;
    await user.hover(overflowSegment);

    expect(onSegmentHover).toHaveBeenCalledWith(
      expect.objectContaining({ key: '__overflow__', label: 'Overflow' }),
    );
  });

  // ── onSegmentClick ────────────────────────────────────────────────────────

  it('calls onSegmentClick with segment on click', async () => {
    const user = userEvent.setup();
    const onSegmentClick = jest.fn<(s: BudgetBarSegment | null) => void>();

    const { container } = render(
      <BudgetBar segments={baseSegments} maxValue={100000} onSegmentClick={onSegmentClick} />,
    );

    const firstSegment = container.querySelectorAll('[aria-hidden="true"]')[0] as HTMLElement;
    await user.click(firstSegment);

    expect(onSegmentClick).toHaveBeenCalledWith(baseSegments[0]);
  });

  it('calls onSegmentClick with overflow segment data on overflow click', async () => {
    const user = userEvent.setup();
    const onSegmentClick = jest.fn<(s: BudgetBarSegment | null) => void>();

    const { container } = render(
      <BudgetBar
        segments={baseSegments}
        maxValue={100000}
        overflow={5000}
        onSegmentClick={onSegmentClick}
      />,
    );

    const allSegments = container.querySelectorAll('[aria-hidden="true"]');
    const overflowSegment = allSegments[allSegments.length - 1] as HTMLElement;
    await user.click(overflowSegment);

    expect(onSegmentClick).toHaveBeenCalledWith(
      expect.objectContaining({ key: '__overflow__', value: 5000 }),
    );
  });

  // ── Keyboard interaction ────────────────────────────────────────────────────

  it('calls onSegmentClick(null) when Enter is pressed on the bar', () => {
    const onSegmentClick = jest.fn<(s: BudgetBarSegment | null) => void>();

    render(
      <BudgetBar segments={baseSegments} maxValue={100000} onSegmentClick={onSegmentClick} />,
    );

    const bar = screen.getByRole('img');
    fireEvent.keyDown(bar, { key: 'Enter' });

    expect(onSegmentClick).toHaveBeenCalledWith(null);
  });

  it('calls onSegmentClick(null) when Space is pressed on the bar', () => {
    const onSegmentClick = jest.fn<(s: BudgetBarSegment | null) => void>();

    render(
      <BudgetBar segments={baseSegments} maxValue={100000} onSegmentClick={onSegmentClick} />,
    );

    const bar = screen.getByRole('img');
    fireEvent.keyDown(bar, { key: ' ' });

    expect(onSegmentClick).toHaveBeenCalledWith(null);
  });

  it('does not call onSegmentClick for other key presses', () => {
    const onSegmentClick = jest.fn<(s: BudgetBarSegment | null) => void>();

    render(
      <BudgetBar segments={baseSegments} maxValue={100000} onSegmentClick={onSegmentClick} />,
    );

    const bar = screen.getByRole('img');
    fireEvent.keyDown(bar, { key: 'Escape' });

    expect(onSegmentClick).not.toHaveBeenCalled();
  });

  // ── formatValue ────────────────────────────────────────────────────────────

  it('uses formatValue in aria-label when provided', () => {
    render(
      <BudgetBar
        segments={[{ key: 'a', value: 50000, color: '#f00', label: 'Materials' }]}
        maxValue={100000}
        formatValue={(v) => `€${v.toLocaleString()}`}
      />,
    );

    const label = screen.getByRole('img').getAttribute('aria-label')!;
    expect(label).toContain('Materials');
    expect(label).toContain('€50,000');
  });

  it('uses default toString when formatValue is not provided', () => {
    render(
      <BudgetBar
        segments={[{ key: 'a', value: 12345, color: '#f00', label: 'Labor' }]}
        maxValue={100000}
      />,
    );

    const label = screen.getByRole('img').getAttribute('aria-label')!;
    expect(label).toContain('12345');
  });
});
