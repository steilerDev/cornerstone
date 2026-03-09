/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardCard } from './DashboardCard.js';

describe('DashboardCard', () => {
  const noop = jest.fn();

  beforeEach(() => {
    noop.mockReset();
  });

  // ─── Test 1: Renders card title ──────────────────────────────────────────

  it('renders card title in header', () => {
    render(
      <DashboardCard title="Budget Summary" onDismiss={noop}>
        <p>content</p>
      </DashboardCard>,
    );
    expect(screen.getByRole('heading', { name: 'Budget Summary' })).toBeInTheDocument();
  });

  // ─── Test 2: Dismiss button aria-label ───────────────────────────────────

  it('renders dismiss button with correct aria-label', () => {
    render(
      <DashboardCard title="Invoice Pipeline" onDismiss={noop}>
        <p>content</p>
      </DashboardCard>,
    );
    expect(
      screen.getByRole('button', { name: 'Hide Invoice Pipeline card' }),
    ).toBeInTheDocument();
  });

  // ─── Test 3: Dismiss button click ────────────────────────────────────────

  it('calls onDismiss when dismiss button clicked', async () => {
    const onDismiss = jest.fn();
    render(
      <DashboardCard title="Mini Gantt" onDismiss={onDismiss}>
        <p>content</p>
      </DashboardCard>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Hide Mini Gantt card' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // ─── Test 4: Loading skeleton ─────────────────────────────────────────────

  it('shows loading skeleton when isLoading=true', () => {
    render(
      <DashboardCard title="Timeline Status" onDismiss={noop} isLoading>
        <p>should not appear</p>
      </DashboardCard>,
    );
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('should not appear')).not.toBeInTheDocument();
  });

  // ─── Test 5: Error state ──────────────────────────────────────────────────

  it('shows error state with message and Retry button when error is set', () => {
    render(
      <DashboardCard
        title="Source Utilization"
        onDismiss={noop}
        error="Failed to load budget sources"
        onRetry={noop}
      >
        <p>content</p>
      </DashboardCard>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Failed to load budget sources')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  // ─── Test 6: Retry button click ───────────────────────────────────────────

  it('calls onRetry when Retry clicked', async () => {
    const onRetry = jest.fn();
    render(
      <DashboardCard
        title="Budget Alerts"
        onDismiss={noop}
        error="Something went wrong"
        onRetry={onRetry}
      >
        <p>content</p>
      </DashboardCard>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // ─── Test 7: Empty state ──────────────────────────────────────────────────

  it('shows empty state when isEmpty=true', () => {
    render(
      <DashboardCard
        title="Subsidy Pipeline"
        onDismiss={noop}
        isEmpty
        emptyMessage="No subsidy programs found"
      >
        <p>content</p>
      </DashboardCard>,
    );
    expect(screen.getByText('No subsidy programs found')).toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  // ─── Test 8: Empty action link ────────────────────────────────────────────

  it('shows empty action link when emptyAction provided', () => {
    render(
      <DashboardCard
        title="Quick Actions"
        onDismiss={noop}
        isEmpty
        emptyMessage="No items"
        emptyAction={{ label: 'Add a budget source', href: '/budget/sources' }}
      >
        <p>content</p>
      </DashboardCard>,
    );
    const link = screen.getByRole('link', { name: 'Add a budget source' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/budget/sources');
  });

  // ─── Test 9: Children rendered in normal state ────────────────────────────

  it('renders children when not loading, not errored, and not empty', () => {
    render(
      <DashboardCard title="Budget Summary" onDismiss={noop}>
        <p>Content coming soon.</p>
      </DashboardCard>,
    );
    expect(screen.getByText('Content coming soon.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // ─── Test 10: Loading takes priority over isEmpty and error ───────────────

  it('shows skeleton even when isEmpty and error are also set while isLoading=true', () => {
    render(
      <DashboardCard
        title="Budget Summary"
        onDismiss={noop}
        isLoading
        isEmpty
        error="Something went wrong"
        onRetry={noop}
      >
        <p>content</p>
      </DashboardCard>,
    );
    // Skeleton should be visible
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    // Error and empty states must NOT be rendered (they are gated on !isLoading)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  // ─── Test 11: Retry button absent when onRetry not provided ───────────────

  it('does not render Retry button when onRetry is not provided', () => {
    render(
      <DashboardCard title="Budget Summary" onDismiss={noop} error="Some error">
        <p>content</p>
      </DashboardCard>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  // ─── Test 12: Default empty message ──────────────────────────────────────

  it('uses default empty message when emptyMessage is not provided', () => {
    render(
      <DashboardCard title="Budget Summary" onDismiss={noop} isEmpty>
        <p>content</p>
      </DashboardCard>,
    );
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });
});
