/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { HouseholdItemStatusBadge } from './HouseholdItemStatusBadge.js';

describe('HouseholdItemStatusBadge', () => {
  it('renders "Not Ordered" text for not_ordered status', () => {
    render(<HouseholdItemStatusBadge status="not_ordered" />);

    expect(screen.getByText('Not Ordered')).toBeInTheDocument();
  });

  it('renders "Ordered" text for ordered status', () => {
    render(<HouseholdItemStatusBadge status="ordered" />);

    expect(screen.getByText('Ordered')).toBeInTheDocument();
  });

  it('renders "In Transit" text for in_transit status', () => {
    render(<HouseholdItemStatusBadge status="in_transit" />);

    expect(screen.getByText('In Transit')).toBeInTheDocument();
  });

  it('renders "Delivered" text for delivered status', () => {
    render(<HouseholdItemStatusBadge status="delivered" />);

    expect(screen.getByText('Delivered')).toBeInTheDocument();
  });

  it('applies badge CSS class', () => {
    const { container } = render(<HouseholdItemStatusBadge status="not_ordered" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('badge');
  });

  it('applies not_ordered CSS class for not_ordered status', () => {
    const { container } = render(<HouseholdItemStatusBadge status="not_ordered" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('not_ordered');
  });

  it('applies ordered CSS class for ordered status', () => {
    const { container } = render(<HouseholdItemStatusBadge status="ordered" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('ordered');
  });

  it('applies in_transit CSS class for in_transit status', () => {
    const { container } = render(<HouseholdItemStatusBadge status="in_transit" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('in_transit');
  });

  it('applies delivered CSS class for delivered status', () => {
    const { container } = render(<HouseholdItemStatusBadge status="delivered" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('delivered');
  });

  it('renders as a span element', () => {
    const { container } = render(<HouseholdItemStatusBadge status="not_ordered" />);

    const badge = container.querySelector('span');
    expect(badge).toBeInTheDocument();
  });
});
