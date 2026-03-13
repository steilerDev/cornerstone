/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import type { BudgetLineFormProps } from './BudgetLineForm.js';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';

// ─── Dynamic import (required for jest.unstable_mockModule pattern) ───────────

let BudgetLineForm: (typeof import('./BudgetLineForm.js'))['BudgetLineForm'];

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
  ({ BudgetLineForm } = await import('./BudgetLineForm.js'));
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
  it('displays computed total when quantity and unitPrice are set (includesVat=true)', () => {
    // qty=2, price=100, includesVat=true → total = 2 * 100 * 1 = 200.00
    const props = buildProps(buildUnitForm({ quantity: '2', unitPrice: '100', includesVat: true }));
    render(<BudgetLineForm {...props} />);

    expect(screen.getByText(/€200\.00/)).toBeInTheDocument();
  });

  it('displays computed total with VAT multiplier when includesVat=false (qty=2, price=100 → 238)', () => {
    // qty=2, price=100, includesVat=false → total = 2 * 100 * 1.19 = 238.00
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
