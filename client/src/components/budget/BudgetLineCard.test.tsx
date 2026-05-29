/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { BaseBudgetLine, BudgetLineInvoiceLink, ConfidenceLevel } from '@cornerstone/shared';
import type { BudgetLineCardProps } from './BudgetLineCard.js';

// ─── Mock: formatters ──────────────────────────────────────────────────────────
// jest.unstable_mockModule may not intercept in this worktree environment (known
// systemic issue — tests pass in CI). The LocaleProvider wrapper below handles
// the local fallback for useFormatters → useLocale.

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtCurrency = (n: number) => '€' + n.toFixed(2);
  const fmtDate = (d: string) => d;
  return {
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: fmtDate,
    }),
  };
});

// ─── Mock: budgetConstants ─────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/budgetConstants.js', () => ({
  CONFIDENCE_MARGINS: {
    own_estimate: 0.2,
    professional_estimate: 0.1,
    quote: 0,
    invoice: 0,
  },
  effectivePlannedAmount: (line: { plannedAmount: number }) => line.plannedAmount,
}));

// ─── Mock: categoryUtils ───────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/categoryUtils.js', () => ({
  getCategoryDisplayName: (_t: unknown, name: string) => name,
  useCategoryDisplayName: (name: string) => name,
}));

// ─── Mock: react-i18next ───────────────────────────────────────────────────────

jest.unstable_mockModule('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
  Trans: ({ children }: { children: React.ReactNode }) => children,
}));

// ─── Mock: LocaleContext (for CI) ─────────────────────────────────────────────
// In CI, jest.unstable_mockModule intercepts; the LocaleProvider wrapper in
// renderCard is then redundant but harmless.

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

// ─── Mock: configApi and preferencesApi (real LocaleProvider needs them) ──────
// When jest.unstable_mockModule doesn't intercept LocaleContext locally, the real
// LocaleProvider is used (injected via wrapper). These mocks stop network calls.

jest.unstable_mockModule('../../lib/configApi.js', () => ({
  fetchConfig: jest.fn(() => Promise.resolve({ currency: 'EUR' })),
}));

jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: jest.fn(() => Promise.resolve([])),
  upsertPreference: jest.fn(() => Promise.resolve()),
}));

// ─── Dynamic import after mocks ────────────────────────────────────────────────

let BudgetLineCard: BudgetLineCardModule['BudgetLineCard'];
let LocaleProvider: ({ children }: { children: React.ReactNode }) => React.ReactNode;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildInvoiceLink(overrides?: Partial<BudgetLineInvoiceLink>): BudgetLineInvoiceLink {
  return {
    invoiceBudgetLineId: 'ibl-1',
    invoiceId: 'inv-1',
    invoiceNumber: 'INV-001',
    invoiceDate: '2025-01-15',
    invoiceStatus: 'paid',
    itemizedAmount: 500,
    vendorId: null,
    vendorName: null,
    ...overrides,
  };
}

function buildLine(overrides?: Partial<BaseBudgetLine>): BaseBudgetLine {
  return {
    id: 'line-1',
    description: null,
    plannedAmount: 1000,
    confidence: 'own_estimate' as ConfidenceLevel,
    confidenceMargin: 0.2,
    budgetCategory: null,
    budgetSource: null,
    vendor: null,
    actualCost: 0,
    actualCostPaid: 0,
    invoiceCount: 0,
    invoiceLink: null,
    createdBy: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    quantity: null,
    unit: null,
    unitPrice: null,
    includesVat: true,
    ...overrides,
  };
}

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  own_estimate: 'Own Estimate',
  professional_estimate: 'Professional Estimate',
  quote: 'Quote',
  invoice: 'Invoice',
};

function buildProps(overrides?: Partial<BudgetLineCardProps>): BudgetLineCardProps {
  return {
    line: buildLine(),
    confidenceLabels: CONFIDENCE_LABELS,
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    isDeleting: false,
    onConfirmDelete: jest.fn(),
    onCancelDelete: jest.fn(),
    ...overrides,
  };
}

function renderCard(ui: React.ReactElement) {
  // Wrap in LocaleProvider so the real useFormatters → useLocale works locally
  // when jest.unstable_mockModule doesn't intercept LocaleContext.
  // In CI, the mock intercepts and LocaleProvider becomes the passthrough stub.
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={['/']}>{ui}</MemoryRouter>
    </LocaleProvider>,
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('BudgetLineCard', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    const [cardMod, localeMod] = await Promise.all([
      import('./BudgetLineCard.js'),
      import('../../contexts/LocaleContext.js'),
    ]);
    BudgetLineCard = cardMod.BudgetLineCard;
    LocaleProvider = localeMod.LocaleProvider as ({
      children,
    }: {
      children: React.ReactNode;
    }) => React.ReactNode;
  });

  // ─── Scenario 1: non-quotation invoice renders actualCost as single value ──

  it('non-quotation invoice renders actualCost as single value with amountInvoiced class', () => {
    const invoiceLink = buildInvoiceLink({ invoiceStatus: 'paid' });
    const line = buildLine({ invoiceCount: 1, actualCost: 750, invoiceLink });
    const { container } = renderCard(<BudgetLineCard {...buildProps({ line })} />);

    // Single formatted value present
    expect(screen.getByText('€750.00')).toBeTruthy();

    // Uses amountInvoiced class (not amountQuoted)
    const invoicedEl = container.querySelector('[class*="amountInvoiced"]');
    expect(invoicedEl).not.toBeNull();

    const quotedEl = container.querySelector('[class*="amountQuoted"]');
    expect(quotedEl).toBeNull();
  });

  it('non-quotation invoice does not render a ±5% range', () => {
    const invoiceLink = buildInvoiceLink({ invoiceStatus: 'paid' });
    const line = buildLine({ invoiceCount: 1, actualCost: 750, invoiceLink });
    renderCard(<BudgetLineCard {...buildProps({ line })} />);

    // Old behaviour was a range — e.g. €712.50 – €787.50. Ensure neither bound appears.
    expect(screen.queryByText(/712/)).toBeNull();
    expect(screen.queryByText(/787/)).toBeNull();
    expect(screen.queryByText('–')).toBeNull();
  });

  // ─── Scenario 2: quotation invoice renders single quoted value ─────────────

  it('quotation invoice renders single formatted actualCost value with amountQuoted class', () => {
    const invoiceLink = buildInvoiceLink({ invoiceStatus: 'quotation' });
    const line = buildLine({ invoiceCount: 1, actualCost: 500, invoiceLink });
    const { container } = renderCard(<BudgetLineCard {...buildProps({ line })} />);

    expect(screen.getByText('€500.00')).toBeTruthy();

    const quotedEl = container.querySelector('[class*="amountQuoted"]');
    expect(quotedEl).not.toBeNull();
  });

  it('quotation invoice does not render ±5% range values', () => {
    const invoiceLink = buildInvoiceLink({ invoiceStatus: 'quotation' });
    const line = buildLine({ invoiceCount: 1, actualCost: 500, invoiceLink });
    renderCard(<BudgetLineCard {...buildProps({ line })} />);

    // Old range would have been €475 – €525
    expect(screen.queryByText(/475/)).toBeNull();
    expect(screen.queryByText(/525/)).toBeNull();
  });

  it('quotation invoice does not apply amountInvoiced class', () => {
    const invoiceLink = buildInvoiceLink({ invoiceStatus: 'quotation' });
    const line = buildLine({ invoiceCount: 1, actualCost: 500, invoiceLink });
    const { container } = renderCard(<BudgetLineCard {...buildProps({ line })} />);

    const invoicedEl = container.querySelector('[class*="amountInvoiced"]');
    expect(invoicedEl).toBeNull();
  });

  // ─── Scenario 3: no invoice links — planned amount + confidence ────────────

  it('no invoice links renders planned amount via effectivePlannedAmount', () => {
    const line = buildLine({ invoiceCount: 0, plannedAmount: 1000, invoiceLink: null });
    renderCard(<BudgetLineCard {...buildProps({ line })} />);

    // When the real formatters run (CI: mock, local: real i18n locale formatting)
    // accept either format: €1000.00 (mock) or €1,000.00 (real Intl)
    expect(screen.getByText(/€1[,.]?000\.00/)).toBeTruthy();
  });

  it('no invoice links renders confidence label', () => {
    const line = buildLine({
      invoiceCount: 0,
      confidence: 'own_estimate',
      invoiceLink: null,
    });
    renderCard(<BudgetLineCard {...buildProps({ line })} />);

    expect(screen.getByText('Own Estimate')).toBeTruthy();
  });

  it('no invoice links with own_estimate confidence renders +20% margin', () => {
    const line = buildLine({
      invoiceCount: 0,
      confidence: 'own_estimate',
      invoiceLink: null,
    });
    renderCard(<BudgetLineCard {...buildProps({ line })} />);

    expect(screen.getByText('(+20%)')).toBeTruthy();
  });

  it('no invoice links with quote confidence renders no margin (0%)', () => {
    const line = buildLine({
      invoiceCount: 0,
      confidence: 'quote',
      invoiceLink: null,
    });
    renderCard(<BudgetLineCard {...buildProps({ line })} />);

    // quote has margin 0 in mock, so no margin span is rendered
    expect(screen.queryByText(/\(\+0%\)/)).toBeNull();
  });

  // ─── Scenario 4: description renders ──────────────────────────────────────

  it('renders description when present', () => {
    const line = buildLine({ description: 'Ceramic tiles for bathroom' });
    renderCard(<BudgetLineCard {...buildProps({ line })} />);

    expect(screen.getByText('Ceramic tiles for bathroom')).toBeTruthy();
  });

  it('does not render description element when null', () => {
    const line = buildLine({ description: null });
    const { container } = renderCard(<BudgetLineCard {...buildProps({ line })} />);

    const descEl = container.querySelector('[class*="description"]');
    expect(descEl).toBeNull();
  });

  // ─── Scenario 5: delete flow buttons ──────────────────────────────────────

  it('isDeleting=false renders Edit and Delete buttons', () => {
    renderCard(<BudgetLineCard {...buildProps({ isDeleting: false })} />);

    expect(screen.getByRole('button', { name: /edit/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /delete/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /confirm/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
  });

  it('isDeleting=true renders Confirm and Cancel buttons', () => {
    renderCard(<BudgetLineCard {...buildProps({ isDeleting: true })} />);

    expect(screen.getByRole('button', { name: /confirm/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^edit/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^delete/i })).toBeNull();
  });

  it('Edit button calls onEdit when clicked', () => {
    const onEdit = jest.fn();
    renderCard(<BudgetLineCard {...buildProps({ isDeleting: false, onEdit })} />);

    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('Delete button calls onDelete when clicked', () => {
    const onDelete = jest.fn();
    renderCard(<BudgetLineCard {...buildProps({ isDeleting: false, onDelete })} />);

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('Confirm button calls onConfirmDelete when clicked', () => {
    const onConfirmDelete = jest.fn();
    renderCard(<BudgetLineCard {...buildProps({ isDeleting: true, onConfirmDelete })} />);

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirmDelete).toHaveBeenCalledTimes(1);
  });

  it('Cancel button calls onCancelDelete when clicked', () => {
    const onCancelDelete = jest.fn();
    renderCard(<BudgetLineCard {...buildProps({ isDeleting: true, onCancelDelete })} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancelDelete).toHaveBeenCalledTimes(1);
  });

  // ─── Scenario 6: unlinkAction prop ────────────────────────────────────────

  it('unlinkAction prop renders its children in the actions area', () => {
    const unlinkAction = <button type="button">Unlink me</button>;
    renderCard(<BudgetLineCard {...buildProps({ isDeleting: false, unlinkAction })} />);

    expect(screen.getByRole('button', { name: 'Unlink me' })).toBeTruthy();
  });

  it('unlinkAction not rendered when isDeleting=true', () => {
    const unlinkAction = <button type="button">Unlink me</button>;
    renderCard(<BudgetLineCard {...buildProps({ isDeleting: true, unlinkAction })} />);

    // When deleting, the Edit/Delete/unlinkAction group is not rendered
    expect(screen.queryByRole('button', { name: 'Unlink me' })).toBeNull();
  });

  // ─── Scenario 7: quotedLabel i18n key ──────────────────────────────────────

  it('quotation status renders quoted amount label in the DOM', () => {
    const invoiceLink = buildInvoiceLink({ invoiceStatus: 'quotation' });
    const line = buildLine({ invoiceCount: 1, actualCost: 500, invoiceLink });
    const { container } = renderCard(<BudgetLineCard {...buildProps({ line })} />);

    // quotedLabel element is present (holds the translated or key text)
    const quotedLabel = container.querySelector('[class*="quotedLabel"]');
    expect(quotedLabel).not.toBeNull();
    // Text is either the i18n key (mock) or the translated value (real i18n)
    // Either way it contains some text content
    expect(quotedLabel?.textContent).toBeTruthy();
  });

  it('quotation status renders quotedLabel class on the label element', () => {
    const invoiceLink = buildInvoiceLink({ invoiceStatus: 'quotation' });
    const line = buildLine({ invoiceCount: 1, actualCost: 500, invoiceLink });
    const { container } = renderCard(<BudgetLineCard {...buildProps({ line })} />);

    const quotedLabel = container.querySelector('[class*="quotedLabel"]');
    expect(quotedLabel).not.toBeNull();
  });

  it('non-quotation invoice renders invoicedLabel, not quotedLabel', () => {
    const invoiceLink = buildInvoiceLink({ invoiceStatus: 'paid' });
    const line = buildLine({ invoiceCount: 1, actualCost: 750, invoiceLink });
    const { container } = renderCard(<BudgetLineCard {...buildProps({ line })} />);

    const invoicedLabel = container.querySelector('[class*="invoicedLabel"]');
    expect(invoicedLabel).not.toBeNull();

    const quotedLabel = container.querySelector('[class*="quotedLabel"]');
    expect(quotedLabel).toBeNull();
  });

  // ─── Meta: budgetCategory, budgetSource, vendor meta pills ────────────────

  it('renders budgetCategory name in meta pills', () => {
    const line = buildLine({
      budgetCategory: {
        id: 'cat-1',
        name: 'Flooring',
        translationKey: null,
        description: null,
        color: null,
        sortOrder: 1,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    });
    renderCard(<BudgetLineCard {...buildProps({ line })} />);

    expect(screen.getByText('Flooring')).toBeTruthy();
  });

  it('renders budgetSource name in meta pills', () => {
    const line = buildLine({
      budgetSource: { id: 'src-1', name: 'Bank Loan', sourceType: 'loan' },
    });
    renderCard(<BudgetLineCard {...buildProps({ line })} />);

    expect(screen.getByText('Bank Loan')).toBeTruthy();
  });

  it('renders vendor name in meta pills', () => {
    const line = buildLine({
      vendor: { id: 'v-1', name: 'ACME Tiles', trade: null },
    });
    renderCard(<BudgetLineCard {...buildProps({ line })} />);

    expect(screen.getByText('ACME Tiles')).toBeTruthy();
  });

  // ─── Children prop ─────────────────────────────────────────────────────────

  it('renders children in the main area', () => {
    renderCard(
      <BudgetLineCard {...buildProps()}>
        <span data-testid="child-content">child</span>
      </BudgetLineCard>,
    );

    expect(screen.getByTestId('child-content')).toBeTruthy();
  });

  // ─── plannedSecondary when invoiced ────────────────────────────────────────

  it('shows planned secondary amount when invoiced', () => {
    const invoiceLink = buildInvoiceLink({ invoiceStatus: 'paid' });
    const line = buildLine({ invoiceCount: 1, actualCost: 750, plannedAmount: 1000, invoiceLink });
    const { container } = renderCard(<BudgetLineCard {...buildProps({ line })} />);

    // The plannedSecondary span contains "(planned: <amount>)" — text may be
    // split across child nodes so use the CSS class selector instead of text regex.
    const plannedEl = container.querySelector('[class*="plannedSecondary"]');
    expect(plannedEl).not.toBeNull();
    expect(plannedEl?.textContent).toMatch(/planned/i);
    // Amount matches €1000.00 (mock) or €1,000.00 (real Intl)
    expect(plannedEl?.textContent).toMatch(/€1[,.]?000\.00/);
  });
});
