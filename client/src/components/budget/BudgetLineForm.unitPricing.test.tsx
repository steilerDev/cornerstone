/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import type { BudgetLineFormProps } from './BudgetLineForm.js';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import type * as BudgetLineFormModule from './BudgetLineForm.js';
import type * as LocaleContextModule from '../../contexts/LocaleContext.js';

// ─── Mocks (must be registered before the dynamic import in beforeEach) ───────
// BudgetLineForm now calls useLocale()/useFormatters() unconditionally (#1807).
// jest.unstable_mockModule may not intercept in this sandbox (documented CI-vs-local
// gap — see agent memory). Values here match the historical hardcoded defaults
// (EUR / 19%) so existing assertions in this file (€200.00/€238.00/€0.00) keep
// passing either way — the new effectiveLineAmount(line, vatRate)-based
// implementation still resolves to the same numbers at vatRate=0.19.

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtCurrency = (n: number) => '€' + n.toFixed(2);
  return {
    formatCurrency: fmtCurrency,
    getCurrencySymbol: () => '€',
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      getCurrencySymbol: () => '€',
    }),
  };
});

const mockUseLocale = jest.fn(() => ({
  locale: 'en' as const,
  resolvedLocale: 'en' as const,
  currency: 'EUR',
  vatRate: 0.19,
  setLocale: jest.fn(),
  syncWithServer: jest.fn(),
}));

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: mockUseLocale,
  LocaleProvider: ({ children }: { children: ReactNode }) => children,
}));

jest.unstable_mockModule('../../lib/configApi.js', () => ({
  fetchConfig: jest.fn(() =>
    Promise.resolve({ currency: 'EUR', vatRate: 0.19, autoItemizeEnabled: false }),
  ),
}));

jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: jest.fn(() => Promise.resolve([])),
  upsertPreference: jest.fn(() => Promise.resolve()),
}));

// ─── Dynamic import (required for jest.unstable_mockModule pattern) ───────────

let BudgetLineForm: (typeof BudgetLineFormModule)['BudgetLineForm'];
let LocaleProvider: (typeof LocaleContextModule)['LocaleProvider'];

// `render` is shadowed here so every existing `render(<BudgetLineForm ... />)`
// call site automatically wraps in the real LocaleProvider — a fallback for when
// jest.unstable_mockModule doesn't intercept locally (see mocks above).
function render(ui: ReactElement) {
  return rtlRender(<LocaleProvider>{ui}</LocaleProvider>);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDirectForm(overrides?: Partial<BudgetLineFormState>): BudgetLineFormState {
  return {
    description: '',
    plannedAmount: '100',
    confidence: 'own_estimate',
    budgetCategoryId: '',
    budgetSourceId: '',
    vendorId: '',
    pricingMode: 'direct',
    quantity: '',
    unit: '',
    unitPrice: '',
    includesVat: false,
    ...overrides,
  };
}

function buildUnitForm(overrides?: Partial<BudgetLineFormState>): BudgetLineFormState {
  return {
    description: '',
    plannedAmount: '',
    confidence: 'own_estimate',
    budgetCategoryId: '',
    budgetSourceId: '',
    vendorId: '',
    pricingMode: 'unit',
    quantity: '2',
    unit: 'm²',
    unitPrice: '100',
    includesVat: false,
    ...overrides,
  };
}

const CONFIDENCE_LABELS = {
  own_estimate: 'Own Estimate (±20%)',
  professional_estimate: 'Professional Estimate (±10%)',
  quote: 'Quote (±5%)',
  invoice: 'Invoice (±0%)',
} as const;

function buildProps(
  form: BudgetLineFormState,
  overrides?: Partial<BudgetLineFormProps>,
): BudgetLineFormProps {
  return {
    form,
    onSubmit: jest.fn(),
    onFormChange: jest.fn(),
    onCancel: jest.fn(),
    error: null,
    isSaving: false,
    isEditing: false,
    confidenceLabels: CONFIDENCE_LABELS,
    budgetSources: [],
    vendors: [],
    ...overrides,
  };
}

// ─── Load the component after setup ───────────────────────────────────────────

beforeEach(async () => {
  mockUseLocale.mockReturnValue({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  });

  const [formMod, localeMod] = await Promise.all([
    import('./BudgetLineForm.js'),
    import('../../contexts/LocaleContext.js'),
  ]);
  BudgetLineForm = formMod.BudgetLineForm;
  LocaleProvider = localeMod.LocaleProvider;
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('BudgetLineForm — unit pricing mode toggle', () => {
  it('renders both "Direct Amount" and "Unit Pricing" mode buttons', () => {
    const props = buildProps(buildDirectForm());
    render(<BudgetLineForm {...props} />);

    expect(screen.getByRole('button', { name: 'Direct Amount' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unit Pricing' })).toBeInTheDocument();
  });

  it('clicking "Unit Pricing" button calls onFormChange with pricingMode: "unit"', () => {
    const onFormChange = jest.fn();
    const props = buildProps(buildDirectForm(), { onFormChange });
    render(<BudgetLineForm {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Unit Pricing' }));

    expect(onFormChange).toHaveBeenCalledWith({ pricingMode: 'unit' });
  });

  it('clicking "Direct Amount" button calls onFormChange with pricingMode: "direct"', () => {
    const onFormChange = jest.fn();
    const props = buildProps(buildUnitForm(), { onFormChange });
    render(<BudgetLineForm {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Direct Amount' }));

    expect(onFormChange).toHaveBeenCalledWith({ pricingMode: 'direct' });
  });
});

describe('BudgetLineForm — direct mode rendering', () => {
  it('renders "Planned Amount" input when pricingMode is "direct"', () => {
    const props = buildProps(buildDirectForm());
    render(<BudgetLineForm {...props} />);

    expect(screen.getByLabelText(/Planned Amount/i)).toBeInTheDocument();
  });

  it('does NOT render Quantity, Unit, or Price inputs when pricingMode is "direct"', () => {
    const props = buildProps(buildDirectForm());
    render(<BudgetLineForm {...props} />);

    expect(screen.queryByLabelText(/Quantity/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Unit$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Price \*/i)).not.toBeInTheDocument();
  });
});

describe('BudgetLineForm — unit pricing mode rendering', () => {
  it('renders Quantity, Unit, and Price inputs when pricingMode is "unit"', () => {
    const props = buildProps(buildUnitForm());
    render(<BudgetLineForm {...props} />);

    expect(screen.getByLabelText(/Quantity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Unit$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Price \*/i)).toBeInTheDocument();
  });

  it('does NOT render "Planned Amount" input when pricingMode is "unit"', () => {
    const props = buildProps(buildUnitForm());
    render(<BudgetLineForm {...props} />);

    expect(screen.queryByLabelText(/Planned Amount/i)).not.toBeInTheDocument();
  });

  it('renders VAT note "+19% VAT will be added to the total" when includesVat is false', () => {
    const props = buildProps(buildUnitForm({ includesVat: false }));
    render(<BudgetLineForm {...props} />);

    expect(screen.getByText('+19% VAT will be added to the total')).toBeInTheDocument();
  });

  it('does NOT render VAT note when includesVat is true', () => {
    const props = buildProps(buildUnitForm({ includesVat: true }));
    render(<BudgetLineForm {...props} />);

    expect(screen.queryByText('+19% VAT will be added to the total')).not.toBeInTheDocument();
  });

  it('renders "Price includes VAT (19%)" checkbox', () => {
    const props = buildProps(buildUnitForm());
    render(<BudgetLineForm {...props} />);

    expect(screen.getByRole('checkbox', { name: /Price includes VAT/i })).toBeInTheDocument();
  });

  it('VAT checkbox is checked when includesVat is true', () => {
    const props = buildProps(buildUnitForm({ includesVat: true }));
    render(<BudgetLineForm {...props} />);

    const checkbox = screen.getByRole('checkbox', { name: /Price includes VAT/i });
    expect(checkbox).toBeChecked();
  });

  it('VAT checkbox is unchecked when includesVat is false', () => {
    const props = buildProps(buildUnitForm({ includesVat: false }));
    render(<BudgetLineForm {...props} />);

    const checkbox = screen.getByRole('checkbox', { name: /Price includes VAT/i });
    expect(checkbox).not.toBeChecked();
  });

  it('checking VAT checkbox calls onFormChange with includesVat: true', () => {
    const onFormChange = jest.fn();
    const props = buildProps(buildUnitForm({ includesVat: false }), { onFormChange });
    render(<BudgetLineForm {...props} />);

    const checkbox = screen.getByRole('checkbox', { name: /Price includes VAT/i });
    fireEvent.click(checkbox);

    expect(onFormChange).toHaveBeenCalledWith({ includesVat: true });
  });
});

describe('BudgetLineForm — submit button disabled logic', () => {
  it('submit button is enabled in direct mode when plannedAmount is set', () => {
    const props = buildProps(buildDirectForm({ plannedAmount: '500' }));
    render(<BudgetLineForm {...props} />);

    expect(screen.getByRole('button', { name: 'Add Line' })).not.toBeDisabled();
  });

  it('submit button is disabled in direct mode when plannedAmount is empty', () => {
    const props = buildProps(buildDirectForm({ plannedAmount: '' }));
    render(<BudgetLineForm {...props} />);

    expect(screen.getByRole('button', { name: 'Add Line' })).toBeDisabled();
  });

  it('submit button is disabled in unit mode when quantity is empty', () => {
    const props = buildProps(buildUnitForm({ quantity: '' }));
    render(<BudgetLineForm {...props} />);

    expect(screen.getByRole('button', { name: 'Add Line' })).toBeDisabled();
  });

  it('submit button is disabled in unit mode when unitPrice is empty', () => {
    const props = buildProps(buildUnitForm({ unitPrice: '' }));
    render(<BudgetLineForm {...props} />);

    expect(screen.getByRole('button', { name: 'Add Line' })).toBeDisabled();
  });

  it('submit button is enabled in unit mode when both quantity and unitPrice are set', () => {
    const props = buildProps(buildUnitForm({ quantity: '3', unitPrice: '50' }));
    render(<BudgetLineForm {...props} />);

    expect(screen.getByRole('button', { name: 'Add Line' })).not.toBeDisabled();
  });

  it('submit button shows "Save Changes" text when isEditing is true', () => {
    const props = buildProps(buildDirectForm(), { isEditing: true });
    render(<BudgetLineForm {...props} />);

    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
  });

  it('submit button is disabled when isSaving is true', () => {
    const props = buildProps(buildDirectForm({ plannedAmount: '100' }), { isSaving: true });
    render(<BudgetLineForm {...props} />);

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });
});

describe('BudgetLineForm — computed total display', () => {
  // Scenario 26 (#1807): these two tests exercise the same computed values as
  // before, but now via effectiveLineAmount({ amount, includesVat }, vatRate)
  // with the mocked vatRate=0.19 (the historical default) instead of the old
  // hardcoded `qty * price * (includesVat ? 1 : 1.19)` inline math. The
  // computed numbers are unchanged; re-running confirms the new code path
  // still produces them.
  it('displays computed total when quantity and unitPrice are set (includesVat=true)', () => {
    // qty=2, price=100, includesVat=true → total = 2 * 100 * 1 = 200.00
    const props = buildProps(buildUnitForm({ quantity: '2', unitPrice: '100', includesVat: true }));
    render(<BudgetLineForm {...props} />);

    expect(screen.getByText(/€200\.00/)).toBeInTheDocument();
  });

  it('displays computed total with VAT multiplier when includesVat=false (qty=2, price=100 → 238)', () => {
    // qty=2, price=100, includesVat=false, vatRate=0.19 → total = 2 * 100 * 1.19 = 238.00
    const props = buildProps(
      buildUnitForm({ quantity: '2', unitPrice: '100', includesVat: false }),
    );
    render(<BudgetLineForm {...props} />);

    expect(screen.getByText(/€238\.00/)).toBeInTheDocument();
  });

  it('displays €0.00 when quantity is empty', () => {
    const props = buildProps(buildUnitForm({ quantity: '' }));
    render(<BudgetLineForm {...props} />);

    // The computed total div should show 0.00 when quantity is missing
    const totalLabel = screen.getByText('Total');
    // The computed value div is a sibling — find the parent and check its text content
    const totalContainer = totalLabel.closest('div')?.parentElement;
    expect(totalContainer?.textContent).toContain('€0.00');
  });
});
