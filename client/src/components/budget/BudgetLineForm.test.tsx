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

describe('BudgetLineForm — VAT checkbox in direct mode (#1371)', () => {
  it('renders "Includes VAT" checkbox in direct mode', () => {
    const props = buildProps(buildDirectForm());
    render(<BudgetLineForm {...props} />);

    expect(screen.getByRole('checkbox', { name: /Price includes VAT/i })).toBeInTheDocument();
  });

  it('VAT checkbox is unchecked by default in direct mode', () => {
    const props = buildProps(buildDirectForm({ includesVat: false }));
    render(<BudgetLineForm {...props} />);

    expect(screen.getByRole('checkbox', { name: /Price includes VAT/i })).not.toBeChecked();
  });

  it('VAT checkbox is checked when includesVat=true in direct mode', () => {
    const props = buildProps(buildDirectForm({ includesVat: true }));
    render(<BudgetLineForm {...props} />);

    expect(screen.getByRole('checkbox', { name: /Price includes VAT/i })).toBeChecked();
  });

  it('renders "Includes VAT" checkbox in unit mode (regression check)', () => {
    const props = buildProps(buildUnitForm());
    render(<BudgetLineForm {...props} />);

    expect(screen.getByRole('checkbox', { name: /Price includes VAT/i })).toBeInTheDocument();
  });

  it('does NOT show vatNote when includesVat=true in direct mode', () => {
    const props = buildProps(buildDirectForm({ includesVat: true }));
    render(<BudgetLineForm {...props} />);

    expect(screen.queryByText(/VAT will be added/i)).not.toBeInTheDocument();
  });

  it('shows vatNote when includesVat=false in direct mode', () => {
    const props = buildProps(buildDirectForm({ includesVat: false }));
    render(<BudgetLineForm {...props} />);

    expect(screen.getByText('+19% VAT will be added to the total')).toBeInTheDocument();
  });

  it('checking VAT checkbox in direct mode calls onFormChange with includesVat: true', () => {
    const onFormChange = jest.fn();
    const props = buildProps(buildDirectForm({ includesVat: false }), { onFormChange });
    render(<BudgetLineForm {...props} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Price includes VAT/i }));

    expect(onFormChange).toHaveBeenCalledWith({ includesVat: true });
  });

  it('unchecking VAT checkbox in direct mode calls onFormChange with includesVat: false', () => {
    const onFormChange = jest.fn();
    const props = buildProps(buildDirectForm({ includesVat: true }), { onFormChange });
    render(<BudgetLineForm {...props} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Price includes VAT/i }));

    expect(onFormChange).toHaveBeenCalledWith({ includesVat: false });
  });
});

describe('BudgetLineForm — description, category, source, vendor fields', () => {
  it('renders description input', () => {
    const props = buildProps(buildDirectForm());
    render(<BudgetLineForm {...props} />);
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
  });

  it('onChange description calls onFormChange', () => {
    const onFormChange = jest.fn();
    const props = buildProps(buildDirectForm(), { onFormChange });
    render(<BudgetLineForm {...props} />);
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: 'Flooring' } });
    expect(onFormChange).toHaveBeenCalledWith({ description: 'Flooring' });
  });

  it('renders unit text input and calls onFormChange on change in unit mode', () => {
    const onFormChange = jest.fn();
    const props = buildProps(buildUnitForm(), { onFormChange });
    render(<BudgetLineForm {...props} />);
    fireEvent.change(screen.getByLabelText(/^Unit$/i), { target: { value: 'kg' } });
    expect(onFormChange).toHaveBeenCalledWith({ unit: 'kg' });
  });

  it('renders funding source select', () => {
    const budgetSources = [{ id: 'src-1', name: 'Loan', totalAmount: 100000 }] as any[];
    const props = buildProps(buildDirectForm(), { budgetSources });
    render(<BudgetLineForm {...props} />);
    expect(screen.getByRole('combobox', { name: /Funding Source/i })).toBeInTheDocument();
  });

  it('funding source select onChange calls onFormChange with budgetSourceId', () => {
    const onFormChange = jest.fn();
    const budgetSources = [{ id: 'src-1', name: 'Loan', totalAmount: 100000 }] as any[];
    const props = buildProps(buildDirectForm(), { onFormChange, budgetSources });
    render(<BudgetLineForm {...props} />);
    fireEvent.change(screen.getByRole('combobox', { name: /Funding Source/i }), {
      target: { value: 'src-1' },
    });
    expect(onFormChange).toHaveBeenCalledWith({ budgetSourceId: 'src-1' });
  });

  it('renders vendor select with "No vendor" option', () => {
    const props = buildProps(buildDirectForm());
    render(<BudgetLineForm {...props} />);
    expect(screen.getByRole('combobox', { name: /Vendor/i })).toBeInTheDocument();
  });

  it('vendor select onChange calls onFormChange with vendorId', () => {
    const onFormChange = jest.fn();
    const vendors = [{ id: 'v-1', name: 'Acme', trade: null }] as any[];
    const props = buildProps(buildDirectForm(), { onFormChange, vendors });
    render(<BudgetLineForm {...props} />);
    fireEvent.change(screen.getByRole('combobox', { name: /Vendor/i }), {
      target: { value: 'v-1' },
    });
    expect(onFormChange).toHaveBeenCalledWith({ vendorId: 'v-1' });
  });

  it('renders static category label when staticCategoryLabel is provided', () => {
    const props = buildProps(buildDirectForm(), { staticCategoryLabel: 'Plumbing' });
    render(<BudgetLineForm {...props} />);
    expect(screen.getByText('Plumbing')).toBeInTheDocument();
  });

  it('renders dynamic category select when budgetCategories is provided', () => {
    const budgetCategories = [{ id: 'cat-1', name: 'Electrical', translationKey: null }] as any[];
    const props = buildProps(buildDirectForm(), { budgetCategories });
    render(<BudgetLineForm {...props} />);
    expect(screen.getByRole('combobox', { name: /Category/i })).toBeInTheDocument();
  });

  it('renders error banner when error prop is set', () => {
    const props = buildProps(buildDirectForm(), { error: 'Validation failed' });
    render(<BudgetLineForm {...props} />);
    expect(screen.getByText('Validation failed')).toBeInTheDocument();
  });

  it('renders children slot', () => {
    const props = buildProps(buildDirectForm());
    render(
      <BudgetLineForm {...props}>
        <div data-testid="child-slot">Extra content</div>
      </BudgetLineForm>,
    );
    expect(screen.getByTestId('child-slot')).toBeInTheDocument();
  });

  it('cancel button calls onCancel', () => {
    const onCancel = jest.fn();
    const props = buildProps(buildDirectForm(), { onCancel });
    render(<BudgetLineForm {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('unitPrice onChange calls onFormChange in unit mode', () => {
    const onFormChange = jest.fn();
    const props = buildProps(buildUnitForm(), { onFormChange });
    render(<BudgetLineForm {...props} />);
    fireEvent.change(screen.getByLabelText(/^Price \*/i), { target: { value: '250' } });
    expect(onFormChange).toHaveBeenCalledWith({ unitPrice: '250' });
  });

  it('quantity onChange calls onFormChange in unit mode', () => {
    const onFormChange = jest.fn();
    const props = buildProps(buildUnitForm(), { onFormChange });
    render(<BudgetLineForm {...props} />);
    fireEvent.change(screen.getByLabelText(/Quantity/i), { target: { value: '10' } });
    expect(onFormChange).toHaveBeenCalledWith({ quantity: '10' });
  });

  it('renders confidence select', () => {
    const props = buildProps(buildDirectForm());
    render(<BudgetLineForm {...props} />);
    expect(screen.getByRole('combobox', { name: /Confidence/i })).toBeInTheDocument();
  });

  it('confidence select onChange calls onFormChange with confidence', () => {
    const onFormChange = jest.fn();
    const props = buildProps(buildDirectForm(), { onFormChange });
    render(<BudgetLineForm {...props} />);
    fireEvent.change(screen.getByRole('combobox', { name: /Confidence/i }), {
      target: { value: 'quote' },
    });
    expect(onFormChange).toHaveBeenCalledWith({ confidence: 'quote' });
  });

  it('planned amount input onChange calls onFormChange in direct mode', () => {
    const onFormChange = jest.fn();
    const props = buildProps(buildDirectForm({ plannedAmount: '100' }), { onFormChange });
    render(<BudgetLineForm {...props} />);
    fireEvent.change(screen.getByLabelText(/Planned Amount/i), { target: { value: '200' } });
    expect(onFormChange).toHaveBeenCalledWith({ plannedAmount: '200' });
  });

  it('category select onChange calls onFormChange with budgetCategoryId', () => {
    const onFormChange = jest.fn();
    const budgetCategories = [{ id: 'cat-1', name: 'Electrical', translationKey: null }] as any[];
    const props = buildProps(buildDirectForm(), { onFormChange, budgetCategories });
    render(<BudgetLineForm {...props} />);
    fireEvent.change(screen.getByRole('combobox', { name: /Category/i }), {
      target: { value: 'cat-1' },
    });
    expect(onFormChange).toHaveBeenCalledWith({ budgetCategoryId: 'cat-1' });
  });
});

describe('BudgetLineForm — onWheel blurs inputs to prevent scroll value change (#1370)', () => {
  it('blurs the amount input when wheel event fires in direct mode', () => {
    const props = buildProps(buildDirectForm({ plannedAmount: '100' }));
    render(<BudgetLineForm {...props} />);

    const amountInput = screen.getByLabelText(/Planned Amount/i) as HTMLInputElement;
    const blurSpy = jest.spyOn(amountInput, 'blur');
    amountInput.focus();

    fireEvent.wheel(amountInput);

    expect(blurSpy).toHaveBeenCalled();
    blurSpy.mockRestore();
  });

  it('amount input value is unchanged after wheel event in direct mode', () => {
    const props = buildProps(buildDirectForm({ plannedAmount: '100' }));
    render(<BudgetLineForm {...props} />);

    const amountInput = screen.getByLabelText(/Planned Amount/i) as HTMLInputElement;
    amountInput.focus();
    // The value is controlled — it stays '100' regardless of wheel
    expect(amountInput.value).toBe('100');
    fireEvent.wheel(amountInput);
    expect(amountInput.value).toBe('100');
  });

  it('blurs the quantity input when wheel event fires in unit mode', () => {
    const props = buildProps(buildUnitForm({ quantity: '5' }));
    render(<BudgetLineForm {...props} />);

    const quantityInput = screen.getByLabelText(/Quantity/i) as HTMLInputElement;
    const blurSpy = jest.spyOn(quantityInput, 'blur');
    quantityInput.focus();

    fireEvent.wheel(quantityInput);

    expect(blurSpy).toHaveBeenCalled();
    blurSpy.mockRestore();
  });

  it('quantity input value is unchanged after wheel event in unit mode', () => {
    const props = buildProps(buildUnitForm({ quantity: '5' }));
    render(<BudgetLineForm {...props} />);

    const quantityInput = screen.getByLabelText(/Quantity/i) as HTMLInputElement;
    quantityInput.focus();
    expect(quantityInput.value).toBe('5');
    fireEvent.wheel(quantityInput);
    expect(quantityInput.value).toBe('5');
  });

  it('blurs the unit price input when wheel event fires in unit mode', () => {
    const props = buildProps(buildUnitForm({ unitPrice: '200' }));
    render(<BudgetLineForm {...props} />);

    const priceInput = screen.getByLabelText(/^Price \*/i) as HTMLInputElement;
    const blurSpy = jest.spyOn(priceInput, 'blur');
    priceInput.focus();

    fireEvent.wheel(priceInput);

    expect(blurSpy).toHaveBeenCalled();
    blurSpy.mockRestore();
  });
});
