/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/testUtils.js';
import type * as CardTypes from './QuickActionsCard.js';

// CSS modules mocked via identity-obj-proxy

// Dynamic import — must happen after any jest.unstable_mockModule calls.
// QuickActionsCard has no context deps so no mocks are needed before the import.
let QuickActionsCard: typeof CardTypes.QuickActionsCard;

describe('QuickActionsCard', () => {
  beforeEach(async () => {
    if (!QuickActionsCard) {
      const mod = await import('./QuickActionsCard.js');
      QuickActionsCard = mod.QuickActionsCard;
    }
  });

  // ── Test 1: Renders New Work Item button ─────────────────────────────────

  it('renders New Work Item primary action link with correct href', () => {
    renderWithRouter(<QuickActionsCard />);

    const link = screen.getByRole('link', { name: /new work item/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/project/work-items/new');
  });

  // ── Test 2: Renders Work Items link ──────────────────────────────────────

  it('renders View Work Items link with correct href', () => {
    renderWithRouter(<QuickActionsCard />);

    const link = screen.getByRole('link', { name: /^work items$/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/project/work-items');
  });

  // ── Test 3: Renders Timeline link ────────────────────────────────────────

  it('renders View Timeline link with correct href', () => {
    renderWithRouter(<QuickActionsCard />);

    const link = screen.getByRole('link', { name: /^timeline$/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/schedule');
  });

  // ── Test 4: Renders Budget link ──────────────────────────────────────────

  it('renders View Budget link with correct href', () => {
    renderWithRouter(<QuickActionsCard />);

    const link = screen.getByRole('link', { name: /^budget$/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/budget/overview');
  });

  // ── Test 5: Renders Invoices link ────────────────────────────────────────

  it('renders View Invoices link with correct href', () => {
    renderWithRouter(<QuickActionsCard />);

    const link = screen.getByRole('link', { name: /^invoices$/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/budget/invoices');
  });

  // ── Test 6: Renders Vendors link ─────────────────────────────────────────

  it('renders View Vendors link with correct href', () => {
    renderWithRouter(<QuickActionsCard />);

    const link = screen.getByRole('link', { name: /^vendors$/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/settings/vendors');
  });

  // ── Test 7: All links are keyboard accessible ─────────────────────────────

  it('renders at least 6 links for keyboard accessibility (1 primary + 5 quick links)', () => {
    renderWithRouter(<QuickActionsCard />);

    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(6);
  });

  // ── Test 8: No loading or error states ───────────────────────────────────

  it('renders immediately without any loading or error indicators', () => {
    renderWithRouter(<QuickActionsCard />);

    // No loading indicator
    expect(screen.queryByText(/loading/i)).toBeNull();
    // No error indicator
    expect(screen.queryByText(/error/i)).toBeNull();
  });
});
