/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render } from '@testing-library/react';
import { Badge } from '../Badge/Badge.js';
import badgeStyles from '../Badge/Badge.module.css';

// Variant map mirroring the production definition in HouseholdItemsPage.tsx
const HI_STATUS_VARIANTS = {
  planned: { label: 'Planned', className: badgeStyles.planned! },
  purchased: { label: 'Purchased', className: badgeStyles.purchased! },
  scheduled: { label: 'Scheduled', className: badgeStyles.scheduled! },
  arrived: { label: 'Arrived', className: badgeStyles.arrived! },
};

describe('Badge — household item status variants', () => {
  // ─── Labels ────────────────────────────────────────────────────────────────

  it('renders "Planned" for planned status', () => {
    const { container } = render(<Badge variants={HI_STATUS_VARIANTS} value="planned" />);
    expect(container.querySelector('span')?.textContent).toBe('Planned');
  });

  it('renders "Purchased" for purchased status', () => {
    const { container } = render(<Badge variants={HI_STATUS_VARIANTS} value="purchased" />);
    expect(container.querySelector('span')?.textContent).toBe('Purchased');
  });

  it('renders "Scheduled" for scheduled status', () => {
    const { container } = render(<Badge variants={HI_STATUS_VARIANTS} value="scheduled" />);
    expect(container.querySelector('span')?.textContent).toBe('Scheduled');
  });

  it('renders "Arrived" for arrived status', () => {
    const { container } = render(<Badge variants={HI_STATUS_VARIANTS} value="arrived" />);
    expect(container.querySelector('span')?.textContent).toBe('Arrived');
  });

  // ─── Base CSS class ─────────────────────────────────────────────────────────

  it('applies badge base CSS class for planned', () => {
    const { container } = render(<Badge variants={HI_STATUS_VARIANTS} value="planned" />);
    expect(container.querySelector('span')?.getAttribute('class') ?? '').toContain('badge');
  });

  it('applies badge base CSS class for purchased', () => {
    const { container } = render(<Badge variants={HI_STATUS_VARIANTS} value="purchased" />);
    expect(container.querySelector('span')?.getAttribute('class') ?? '').toContain('badge');
  });

  it('applies badge base CSS class for scheduled', () => {
    const { container } = render(<Badge variants={HI_STATUS_VARIANTS} value="scheduled" />);
    expect(container.querySelector('span')?.getAttribute('class') ?? '').toContain('badge');
  });

  it('applies badge base CSS class for arrived', () => {
    const { container } = render(<Badge variants={HI_STATUS_VARIANTS} value="arrived" />);
    expect(container.querySelector('span')?.getAttribute('class') ?? '').toContain('badge');
  });

  // ─── Variant CSS class ──────────────────────────────────────────────────────

  it('applies planned CSS class for planned status', () => {
    const { container } = render(<Badge variants={HI_STATUS_VARIANTS} value="planned" />);
    expect(container.querySelector('span')?.getAttribute('class') ?? '').toContain('planned');
  });

  it('applies purchased CSS class for purchased status', () => {
    const { container } = render(<Badge variants={HI_STATUS_VARIANTS} value="purchased" />);
    expect(container.querySelector('span')?.getAttribute('class') ?? '').toContain('purchased');
  });

  it('applies scheduled CSS class for scheduled status', () => {
    const { container } = render(<Badge variants={HI_STATUS_VARIANTS} value="scheduled" />);
    expect(container.querySelector('span')?.getAttribute('class') ?? '').toContain('scheduled');
  });

  it('applies arrived CSS class for arrived status', () => {
    const { container } = render(<Badge variants={HI_STATUS_VARIANTS} value="arrived" />);
    expect(container.querySelector('span')?.getAttribute('class') ?? '').toContain('arrived');
  });

  // ─── Element type ───────────────────────────────────────────────────────────

  it('renders as a span element', () => {
    const { container } = render(<Badge variants={HI_STATUS_VARIANTS} value="planned" />);
    const span = container.querySelector('span');
    expect(span).toBeInTheDocument();
    expect(span?.tagName.toLowerCase()).toBe('span');
  });
});
