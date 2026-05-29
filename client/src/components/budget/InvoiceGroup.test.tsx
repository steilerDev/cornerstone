/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { BaseBudgetLine, BudgetLineInvoiceLink } from '@cornerstone/shared';
import type { InvoiceGroupProps } from './InvoiceGroup.js';
import type * as InvoiceGroupModule from './InvoiceGroup.js';

// ─── Mock: formatters — provides useFormatters() hook used by InvoiceGroup ───

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  const fmtDate = (d: string | null | undefined, fallback = '—') => {
    if (!d) return fallback;
    const [year, month, day] = d.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return fallback;
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  return {
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    formatTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
    formatDateTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: fmtDate,
      formatTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
      formatDateTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

// ─── Mock: LocaleContext ──────────────────────────────────────────────────────
// In CI, jest.unstable_mockModule intercepts and the LocaleProvider wrapper in
// renderGroup is a harmless passthrough. Locally (systemic issue), the real
// LocaleProvider is used and needs configApi/preferencesApi mocked to avoid
// network calls.

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.unstable_mockModule('../../lib/configApi.js', () => ({
  fetchConfig: jest.fn(() => Promise.resolve({ currency: 'EUR' })),
}));

jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: jest.fn(() => Promise.resolve([])),
  upsertPreference: jest.fn(() => Promise.resolve()),
}));

// ─── Stub BudgetLineCard to avoid deep rendering ────────────────────────────
jest.unstable_mockModule('./BudgetLineCard.js', () => ({
  BudgetLineCard: ({
    line,
    children,
    unlinkAction,
  }: {
    line: BaseBudgetLine;
    children?: React.ReactNode;
    unlinkAction?: React.ReactNode;
  }) => (
    <div data-testid={`budget-line-card-${line.id}`}>
      <span>{line.description ?? 'no-description'}</span>
      {children}
      {unlinkAction}
    </div>
  ),
}));

// ─── Import component under test after mocks ────────────────────────────────
let InvoiceGroup: InvoiceGroupModule['InvoiceGroup'];
let LocaleProvider: ({ children }: { children: React.ReactNode }) => React.ReactNode;

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildInvoiceLink(overrides?: Partial<BudgetLineInvoiceLink>): BudgetLineInvoiceLink {
  return {
    invoiceBudgetLineId: 'ibl-1',
    invoiceId: 'inv-1',
    invoiceNumber: 'INV-001',
    invoiceDate: '2025-01-15',
    invoiceStatus: 'pending',
    itemizedAmount: 500,
    vendorId: null,
    vendorName: null,
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
    quantity: null,
    unit: null,
    unitPrice: null,
    includesVat: true,
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
    vendorName: null,
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderGroup(ui: React.ReactElement) {
  // Wrap in LocaleProvider so the real useFormatters → useLocale works locally
  // when jest.unstable_mockModule doesn't intercept LocaleContext.
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={['/budget/invoices']}>{ui}</MemoryRouter>
    </LocaleProvider>,
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('InvoiceGroup', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    const [invoiceModule, localeModule] = await Promise.all([
      import('./InvoiceGroup.js'),
      import('../../contexts/LocaleContext.js'),
    ]);
    InvoiceGroup = invoiceModule.InvoiceGroup;
    LocaleProvider = localeModule.LocaleProvider as ({
      children,
    }: {
      children: React.ReactNode;
    }) => React.ReactNode;
  });

  it('defaults to collapsed — lines not visible', () => {
    renderGroup(<InvoiceGroup {...buildProps()} />);

    // Lines container is not rendered when collapsed
    expect(screen.queryByTestId('budget-line-card-line-1')).toBeNull();
  });

  it('click toggle expands the group and shows lines', () => {
    renderGroup(<InvoiceGroup {...buildProps()} />);

    const toggle = screen.getByRole('button', { name: /INV-001/i });
    fireEvent.click(toggle);

    expect(screen.getByTestId('budget-line-card-line-1')).toBeTruthy();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('Enter key on toggle expands the group', () => {
    renderGroup(<InvoiceGroup {...buildProps()} />);

    const toggle = screen.getByRole('button', { name: /INV-001/i });
    fireEvent.keyDown(toggle, { key: 'Enter', code: 'Enter' });

    expect(screen.getByTestId('budget-line-card-line-1')).toBeTruthy();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('Space key on toggle expands the group', () => {
    renderGroup(<InvoiceGroup {...buildProps()} />);

    const toggle = screen.getByRole('button', { name: /INV-001/i });
    fireEvent.keyDown(toggle, { key: ' ', code: 'Space' });

    expect(screen.getByTestId('budget-line-card-line-1')).toBeTruthy();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('header shows invoice number with # prefix', () => {
    renderGroup(<InvoiceGroup {...buildProps()} />);

    expect(screen.getByText('#INV-001')).toBeTruthy();
  });

  it('header shows invoice status badge', () => {
    renderGroup(<InvoiceGroup {...buildProps({ invoiceStatus: 'paid' })} />);

    expect(screen.getByText('paid')).toBeTruthy();
  });

  it('header shows itemized total formatted as currency', () => {
    renderGroup(<InvoiceGroup {...buildProps({ itemizedTotal: 750 })} />);

    // EUR formatted — locale uses €
    expect(screen.getByText('€750.00')).toBeTruthy();
  });

  it('header shows planned total formatted as currency', () => {
    renderGroup(<InvoiceGroup {...buildProps({ plannedTotal: 1200 })} />);

    expect(screen.getByText('€1,200.00')).toBeTruthy();
  });

  it('null invoiceNumber shows "Invoice" fallback', () => {
    renderGroup(<InvoiceGroup {...buildProps({ invoiceNumber: null })} />);

    expect(screen.getByText('Invoice')).toBeTruthy();
  });

  it('toggle has aria-controls pointing to lines container id', () => {
    renderGroup(<InvoiceGroup {...buildProps({ invoiceId: 'inv-42' })} />);

    const toggle = screen.getByRole('button', { expanded: false });
    expect(toggle).toHaveAttribute('aria-controls', 'invoice-group-inv-42');
  });

  it('expanded lines container has matching id', () => {
    const props = buildProps({ invoiceId: 'inv-42' });
    renderGroup(<InvoiceGroup {...props} />);

    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);

    const container = document.getElementById('invoice-group-inv-42');
    expect(container).toBeTruthy();
  });

  it('unlink button calls onUnlink with lineId and invoiceBudgetLineId', () => {
    const onUnlink = jest.fn();
    const invoiceLink = buildInvoiceLink({ invoiceBudgetLineId: 'ibl-99', invoiceId: 'inv-1' });
    const line = buildLine('line-1', invoiceLink);

    renderGroup(<InvoiceGroup {...buildProps({ lines: [line], onUnlink })} />);

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

    renderGroup(<InvoiceGroup {...props} />);

    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);

    const unlinkBtn = screen.getByText('Unlinking...');
    expect(unlinkBtn).toBeDisabled();
  });

  it('status badge uses status text in content', () => {
    renderGroup(<InvoiceGroup {...buildProps({ invoiceStatus: 'claimed' })} />);

    expect(screen.getByText('claimed')).toBeTruthy();
  });

  it('second click collapses the group again', () => {
    renderGroup(<InvoiceGroup {...buildProps()} />);

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

    renderGroup(<InvoiceGroup {...props} />);

    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);

    expect(screen.getByTestId('budget-line-card-line-1')).toBeTruthy();
    expect(screen.getByTestId('budget-line-card-line-2')).toBeTruthy();
  });

  // ─── #1441: vendorName prop tests ─────────────────────────────────────────

  it('vendorName rendered when non-null', () => {
    renderGroup(<InvoiceGroup {...buildProps({ vendorName: 'Acme Corp' })} />);

    expect(screen.getByText('Acme Corp')).toBeTruthy();
  });

  it('vendorName null: no "null" text rendered in DOM', () => {
    renderGroup(<InvoiceGroup {...buildProps({ vendorName: null })} />);

    // The word "null" must not appear anywhere in the document
    expect(screen.queryByText('null')).toBeNull();
  });

  it('vendorName null: vendor span not rendered', () => {
    const { container } = renderGroup(<InvoiceGroup {...buildProps({ vendorName: null })} />);

    // No element with the vendorName CSS class should be present
    // (identity-obj-proxy returns class name literally so we match on it)
    const vendorSpan = container.querySelector('[class*="vendorName"]');
    expect(vendorSpan).toBeNull();
  });

  it('aria-label includes vendor name when present', () => {
    renderGroup(
      <InvoiceGroup
        {...buildProps({ vendorName: 'Acme Corp', invoiceNumber: 'INV-007', itemizedTotal: 100 })}
      />,
    );

    const group = screen.getByRole('group');
    const ariaLabel = group.getAttribute('aria-label') ?? '';
    expect(ariaLabel).toContain('from Acme Corp');
  });

  it('aria-label omits vendor segment when vendorName is null', () => {
    renderGroup(
      <InvoiceGroup
        {...buildProps({ vendorName: null, invoiceNumber: 'INV-007', itemizedTotal: 100 })}
      />,
    );

    const group = screen.getByRole('group');
    const ariaLabel = group.getAttribute('aria-label') ?? '';
    expect(ariaLabel).not.toContain('from');
  });

  // ─── #1449: quoted-amount rework tests ────────────────────────────────────

  it('quotation status: shows single formatted amount (no range)', () => {
    renderGroup(
      <InvoiceGroup {...buildProps({ invoiceStatus: 'quotation', itemizedTotal: 500 })} />,
    );

    // Single amount shown
    expect(screen.getByText('€500.00')).toBeTruthy();

    // Old ±5% range values must NOT appear
    expect(screen.queryByText('€475.00')).toBeNull();
    expect(screen.queryByText('€525.00')).toBeNull();
  });

  it('quotation status: no en-dash separator in the amount span', () => {
    const { container } = renderGroup(
      <InvoiceGroup {...buildProps({ invoiceStatus: 'quotation', itemizedTotal: 500 })} />,
    );

    // The amountValue span should contain only the formatted number — no en-dash (–)
    const amountSpan = container.querySelector('[class*="amountValue"]');
    expect(amountSpan).not.toBeNull();
    expect(amountSpan?.textContent).not.toContain('–');
    expect(amountSpan?.textContent).not.toContain('–');
  });

  it('vendor name renders inside invoiceIdentity wrapper', () => {
    const { container } = renderGroup(
      <InvoiceGroup {...buildProps({ vendorName: 'Acme Corp' })} />,
    );

    const identity = container.querySelector('[class*="invoiceIdentity"]');
    expect(identity).not.toBeNull();

    // The vendor span must be a descendant of the invoiceIdentity div
    const vendorSpan = identity?.querySelector('[class*="vendorName"]');
    expect(vendorSpan).not.toBeNull();
    expect(vendorSpan?.textContent).toBe('Acme Corp');
  });

  it('status badge is sibling of invoiceIdentity, not inside it', () => {
    const { container } = renderGroup(
      <InvoiceGroup {...buildProps({ invoiceStatus: 'paid', vendorName: 'Acme Corp' })} />,
    );

    const identity = container.querySelector('[class*="invoiceIdentity"]');
    expect(identity).not.toBeNull();

    // The status badge must NOT be inside invoiceIdentity
    const badgeInsideIdentity = identity?.querySelector('[class*="statusBadge"]');
    expect(badgeInsideIdentity).toBeNull();

    // But the badge must still exist in the document
    const badge = container.querySelector('[class*="statusBadge"]');
    expect(badge).not.toBeNull();
  });

  it('null vendor: invoiceIdentity contains only the invoice link, no vendorName child', () => {
    const { container } = renderGroup(<InvoiceGroup {...buildProps({ vendorName: null })} />);

    const identity = container.querySelector('[class*="invoiceIdentity"]');
    expect(identity).not.toBeNull();

    // invoiceIdentity has the invoice link
    const link = identity?.querySelector('[class*="invoiceLink"]');
    expect(link).not.toBeNull();

    // No vendorName child inside invoiceIdentity
    const vendorSpan = identity?.querySelector('[class*="vendorName"]');
    expect(vendorSpan).toBeNull();
  });

  it('quotation status: amountValue span has amountValueQuoted class', () => {
    const { container } = renderGroup(
      <InvoiceGroup {...buildProps({ invoiceStatus: 'quotation', itemizedTotal: 500 })} />,
    );

    const quotedSpan = container.querySelector('[class*="amountValueQuoted"]');
    expect(quotedSpan).not.toBeNull();
  });

  it('non-quotation status: amountValueQuoted class NOT applied', () => {
    const { container } = renderGroup(
      <InvoiceGroup {...buildProps({ invoiceStatus: 'pending', itemizedTotal: 500 })} />,
    );

    const quotedSpan = container.querySelector('[class*="amountValueQuoted"]');
    expect(quotedSpan).toBeNull();
  });
});
