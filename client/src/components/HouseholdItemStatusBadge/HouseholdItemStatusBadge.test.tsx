/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { HouseholdItemStatusBadge } from './HouseholdItemStatusBadge.js';

describe('HouseholdItemStatusBadge', () => {
  it('renders "Planned" text for planned status', () => {
    render(<HouseholdItemStatusBadge status="planned" />);

    expect(screen.getByText('Planned')).toBeInTheDocument();
  });

  it('renders "Purchased" text for purchased status', () => {
    render(<HouseholdItemStatusBadge status="purchased" />);

    expect(screen.getByText('Purchased')).toBeInTheDocument();
  });

  it('renders "Scheduled" text for scheduled status', () => {
    render(<HouseholdItemStatusBadge status="scheduled" />);

    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });

  it('renders "Arrived" text for arrived status', () => {
    render(<HouseholdItemStatusBadge status="arrived" />);

    expect(screen.getByText('Arrived')).toBeInTheDocument();
  });

  it('applies badge CSS class', () => {
    const { container } = render(<HouseholdItemStatusBadge status="planned" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('badge');
  });

  it('applies planned CSS class for planned status', () => {
    const { container } = render(<HouseholdItemStatusBadge status="planned" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('planned');
  });

  it('applies purchased CSS class for purchased status', () => {
    const { container } = render(<HouseholdItemStatusBadge status="purchased" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('purchased');
  });

  it('applies scheduled CSS class for scheduled status', () => {
    const { container } = render(<HouseholdItemStatusBadge status="scheduled" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('scheduled');
  });

  it('applies arrived CSS class for arrived status', () => {
    const { container } = render(<HouseholdItemStatusBadge status="arrived" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('arrived');
  });

  it('renders as a span element', () => {
    const { container } = render(<HouseholdItemStatusBadge status="planned" />);

    const badge = container.querySelector('span');
    expect(badge).toBeInTheDocument();
  });
});
