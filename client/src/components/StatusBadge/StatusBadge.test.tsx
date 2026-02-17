/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge.js';

describe('StatusBadge', () => {
  it('renders "Not Started" text for not_started status', () => {
    render(<StatusBadge status="not_started" />);

    expect(screen.getByText('Not Started')).toBeInTheDocument();
  });

  it('renders "In Progress" text for in_progress status', () => {
    render(<StatusBadge status="in_progress" />);

    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders "Completed" text for completed status', () => {
    render(<StatusBadge status="completed" />);

    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders "Blocked" text for blocked status', () => {
    render(<StatusBadge status="blocked" />);

    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  it('applies badge CSS class', () => {
    const { container } = render(<StatusBadge status="not_started" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('badge');
  });

  it('applies not_started CSS class for not_started status', () => {
    const { container } = render(<StatusBadge status="not_started" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('not_started');
  });

  it('applies in_progress CSS class for in_progress status', () => {
    const { container } = render(<StatusBadge status="in_progress" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('in_progress');
  });

  it('applies completed CSS class for completed status', () => {
    const { container } = render(<StatusBadge status="completed" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('completed');
  });

  it('applies blocked CSS class for blocked status', () => {
    const { container } = render(<StatusBadge status="blocked" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('blocked');
  });

  it('renders as a span element', () => {
    const { container } = render(<StatusBadge status="not_started" />);

    const badge = container.querySelector('span');
    expect(badge).toBeInTheDocument();
  });
});
