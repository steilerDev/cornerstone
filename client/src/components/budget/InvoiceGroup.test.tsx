/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import type { BaseBudgetLine, BudgetLineInvoiceLink } from '@cornerstone/shared';
import type { InvoiceGroupProps } from './InvoiceGroup.js';

// ─── Stub BudgetLineCard to avoid deep rendering ────────────────────────────
jest.unstable_mockModule('./BudgetLineCard.js', () => ({
  BudgetLineCard: ({ line, children }: { line: BaseBudgetLine; children?: React.ReactNode }) => (
    <div data-testid={`budget-line-card-${line.id}`}>
      <span>{line.description ?? 'no-description'}</span>
      {children}
    </div>
  ),
}));

// ─── Import component under test after mocks ────────────────────────────────
let InvoiceGroup: (typeof import('./InvoiceGroup.js'))['InvoiceGroup'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildInvoiceLink(overrides?: Partial<BudgetLineInvoiceLink>): BudgetLineInvoiceLink {
  return {
    invoiceBudgetLineId: 'ibl-1',
    invoiceId: 'inv-1',
    invoiceNumber: 'INV-001',
    invoiceDate: '2025-01-15',
    invoiceStatus: 'pending',
    itemizedAmount: 500,
    ...overrides,
  };
}

function buildLine(id: string, invoiceLink: BudgetLineInvoiceLink | null = null): BaseBudgetLine {
  return {
    id,
    description: `Line ${id}`,
    plannedAmount: 1000,
    confidence: 'own_estimate',
    confidenceMargin: 0.2,
    budgetCategory: null,
    budgetSource: null,
    vendor: null,
    actualCost: 500,
    actualCostPaid: 0,
    invoiceCount: invoiceLink ? 1 : 0,
    invoiceLink,
    createdBy: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  };
}

function buildProps(
  overrides?: Partial<InvoiceGroupProps<BaseBudgetLine>>,
): InvoiceGroupProps<BaseBudgetLine> {
  const invoiceLink = buildInvoiceLink();
  const line = buildLine('line-1', invoiceLink);

  return {
    invoiceId: 'inv-1',
    invoiceNumber: 'INV-001',
    invoiceStatus: 'pending',
    itemizedTotal: 500,
    plannedTotal: 1000,
    lines: [line],
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    isDeleting: {},
    onConfirmDelete: jest.fn(),
    onCancelDelete: jest.fn(),
    onUnlink: jest.fn(),
    isUnlinking: {},
    confidenceLabels: {
      own_estimate: 'Own Estimate',
      professional_estimate: 'Professional Estimate',
      quote: 'Quote',
      invoice: 'Invoice',
    },
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('InvoiceGroup', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await import('./InvoiceGroup.js');
    InvoiceGroup = module.InvoiceGroup;
  });

  it('defaults to collapsed — lines not visible', () => {
    render(<InvoiceGroup {...buildProps()} />);

    // Lines container is not rendered when collapsed
    expect(screen.queryByTestId('budget-line-card-line-1')).toBeNull();
  });

  it('click toggle expands the group and shows lines', () => {
    render(<InvoiceGroup {...buildProps()} />);

    const toggle = screen.getByRole('button', { name: /INV-001/i });
    fireEvent.click(toggle);

    expect(screen.getByTestId('budget-line-card-line-1')).toBeTruthy();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('Enter key on toggle expands the group', () => {
    render(<InvoiceGroup {...buildProps()} />);

    const toggle = screen.getByRole('button', { name: /INV-001/i });
    fireEvent.keyDown(toggle, { key: 'Enter', code: 'Enter' });

    expect(screen.getByTestId('budget-line-card-line-1')).toBeTruthy();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('Space key on toggle expands the group', () => {
    render(<InvoiceGroup {...buildProps()} />);

    const toggle = screen.getByRole('button', { name: /INV-001/i });
    fireEvent.keyDown(toggle, { key: ' ', code: 'Space' });

    expect(screen.getByTestId('budget-line-card-line-1')).toBeTruthy();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('header shows invoice number with # prefix', () => {
    render(<InvoiceGroup {...buildProps()} />);

    expect(screen.getByText('#INV-001')).toBeTruthy();
  });

  it('header shows invoice status badge', () => {
    render(<InvoiceGroup {...buildProps({ invoiceStatus: 'paid' })} />);

    expect(screen.getByText('paid')).toBeTruthy();
  });

  it('header shows itemized total formatted as currency', () => {
    render(<InvoiceGroup {...buildProps({ itemizedTotal: 750 })} />);

    // EUR formatted — locale uses €
    expect(screen.getByText('€750.00')).toBeTruthy();
  });

  it('header shows planned total formatted as currency', () => {
    render(<InvoiceGroup {...buildProps({ plannedTotal: 1200 })} />);

    expect(screen.getByText('€1,200.00')).toBeTruthy();
  });

  it('null invoiceNumber shows "Invoice" fallback', () => {
    render(<InvoiceGroup {...buildProps({ invoiceNumber: null })} />);

    expect(screen.getByText('Invoice')).toBeTruthy();
  });

  it('toggle has aria-controls pointing to lines container id', () => {
    render(<InvoiceGroup {...buildProps({ invoiceId: 'inv-42' })} />);

    const toggle = screen.getByRole('button', { expanded: false });
    expect(toggle).toHaveAttribute('aria-controls', 'invoice-group-inv-42');
  });

  it('expanded lines container has matching id', () => {
    const props = buildProps({ invoiceId: 'inv-42' });
    render(<InvoiceGroup {...props} />);

    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);

    const container = document.getElementById('invoice-group-inv-42');
    expect(container).toBeTruthy();
  });

  it('unlink button calls onUnlink with lineId and invoiceBudgetLineId', () => {
    const onUnlink = jest.fn();
    const invoiceLink = buildInvoiceLink({ invoiceBudgetLineId: 'ibl-99', invoiceId: 'inv-1' });
    const line = buildLine('line-1', invoiceLink);

    render(<InvoiceGroup {...buildProps({ lines: [line], onUnlink })} />);

    // Expand first
    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);

    const unlinkBtn = screen.getByRole('button', { name: /unlink/i });
    fireEvent.click(unlinkBtn);

    expect(onUnlink).toHaveBeenCalledWith('line-1', 'ibl-99');
  });

  it('unlink button is disabled when isUnlinking is true for that invoiceBudgetLineId', () => {
    const invoiceLink = buildInvoiceLink({ invoiceBudgetLineId: 'ibl-99' });
    const line = buildLine('line-1', invoiceLink);
    const props = buildProps({
      lines: [line],
      isUnlinking: { 'ibl-99': true },
    });

    render(<InvoiceGroup {...props} />);

    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);

    const unlinkBtn = screen.getByText('Unlinking...');
    expect(unlinkBtn).toBeDisabled();
  });

  it('status badge uses status text in content', () => {
    render(<InvoiceGroup {...buildProps({ invoiceStatus: 'claimed' })} />);

    expect(screen.getByText('claimed')).toBeTruthy();
  });

  it('second click collapses the group again', () => {
    render(<InvoiceGroup {...buildProps()} />);

    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('budget-line-card-line-1')).toBeNull();
  });

  it('renders multiple lines when expanded', () => {
    const link1 = buildInvoiceLink({ invoiceBudgetLineId: 'ibl-1' });
    const link2 = buildInvoiceLink({ invoiceBudgetLineId: 'ibl-2' });
    const line1 = buildLine('line-1', link1);
    const line2 = buildLine('line-2', link2);
    const props = buildProps({ lines: [line1, line2] });

    render(<InvoiceGroup {...props} />);

    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);

    expect(screen.getByTestId('budget-line-card-line-1')).toBeTruthy();
    expect(screen.getByTestId('budget-line-card-line-2')).toBeTruthy();
  });
});
