/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import type { BudgetLineFormProps } from './BudgetLineForm.js';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import userEvent from '@testing-library/user-event';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type {
  BudgetSource,
  VendorDetail,
  VendorListItem,
  BudgetCategory,
} from '@cornerstone/shared';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as BudgetLineFormModule from './BudgetLineForm.js';
import type * as LocaleContextModule from '../../contexts/LocaleContext.js';

// ─── Mocks (must be registered before the dynamic import in beforeEach) ───────
// BudgetLineForm now calls useLocale()/useFormatters() unconditionally (#1807).
// jest.unstable_mockModule may not intercept in this sandbox (documented CI-vs-local
// gap — see agent memory). Values here match the historical hardcoded defaults
// (EUR / 19%) so existing assertions in this file keep passing either way.

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

// Declared with a `mock` prefix so the jest.unstable_mockModule factory below can
// close over it (required by Jest's ESM out-of-scope-variable convention). Kept
// as module-scoped `const` so individual tests (Scenarios 27/28) can override the
// return value to exercise a non-default vatRate.
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

const mockFetchConfig = jest.fn(() =>
  Promise.resolve({ currency: 'EUR', vatRate: 0.19, autoItemizeEnabled: false }),
);

jest.unstable_mockModule('../../lib/configApi.js', () => ({
  fetchConfig: mockFetchConfig,
}));

jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: jest.fn(() => Promise.resolve([])),
  upsertPreference: jest.fn(() => Promise.resolve()),
}));

const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: mockFetchVendor,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
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
    ...overrides,
  };
}

// ─── Load the component after setup ───────────────────────────────────────────

beforeEach(async () => {
  // Reset overridable mocks to the historical defaults (EUR / 19%) before each test.
  mockUseLocale.mockReturnValue({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  });
  mockFetchConfig.mockResolvedValue({ currency: 'EUR', vatRate: 0.19, autoItemizeEnabled: false });

  const [formMod, localeMod] = await Promise.all([
    import('./BudgetLineForm.js'),
    import('../../contexts/LocaleContext.js'),
  ]);
  BudgetLineForm = formMod.BudgetLineForm;
  LocaleProvider = localeMod.LocaleProvider;
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
    const budgetSources: BudgetSource[] = [
      {
        id: 'src-1',
        name: 'Loan',
        totalAmount: 100000,
        sourceType: 'savings',
        usedAmount: 0,
        availableAmount: 100000,
        claimedAmount: 0,
        unclaimedAmount: 0,
        paidAmount: 0,
        actualAvailableAmount: 100000,
        projectedAmount: 0,
        projectedMinAmount: 0,
        projectedMaxAmount: 0,
        interestRate: null,
        terms: null,
        notes: null,
        reference: null,
        contactAddress: null,
        status: 'active',
        isDiscretionary: false,
        createdBy: null,
        createdAt: '',
        updatedAt: '',
      },
    ];
    const props = buildProps(buildDirectForm(), { budgetSources });
    render(<BudgetLineForm {...props} />);
    expect(screen.getByRole('combobox', { name: /Funding Source/i })).toBeInTheDocument();
  });

  it('funding source select onChange calls onFormChange with budgetSourceId', () => {
    const onFormChange = jest.fn();
    const budgetSources: BudgetSource[] = [
      {
        id: 'src-1',
        name: 'Loan',
        totalAmount: 100000,
        sourceType: 'savings',
        usedAmount: 0,
        availableAmount: 100000,
        claimedAmount: 0,
        unclaimedAmount: 0,
        paidAmount: 0,
        actualAvailableAmount: 100000,
        projectedAmount: 0,
        projectedMinAmount: 0,
        projectedMaxAmount: 0,
        interestRate: null,
        terms: null,
        notes: null,
        reference: null,
        contactAddress: null,
        status: 'active',
        isDiscretionary: false,
        createdBy: null,
        createdAt: '',
        updatedAt: '',
      },
    ];
    const props = buildProps(buildDirectForm(), { onFormChange, budgetSources });
    render(<BudgetLineForm {...props} />);
    fireEvent.change(screen.getByRole('combobox', { name: /Funding Source/i }), {
      target: { value: 'src-1' },
    });
    expect(onFormChange).toHaveBeenCalledWith({ budgetSourceId: 'src-1' });
  });

  it('renders the company picker with the "None" placeholder', () => {
    const props = buildProps(buildDirectForm());
    render(<BudgetLineForm {...props} />);
    const input = screen.getByLabelText('Vendor');
    expect(input).toHaveAttribute('placeholder', 'None');
    expect(mockFetchVendors).not.toHaveBeenCalled();
  });
});

describe('BudgetLineForm — company picker searches the server', () => {
  function vendor(id: string, name: string, trade: VendorListItem['trade'] = null): VendorListItem {
    return { id, name, trade } as VendorListItem;
  }
  function listOf(vendors: VendorListItem[]) {
    return {
      vendors,
      pagination: { page: 1, pageSize: 50, totalItems: vendors.length, totalPages: 1 },
    };
  }

  beforeEach(() => {
    mockFetchVendors.mockReset();
    mockFetchVendor.mockReset();
    mockFetchVendors.mockResolvedValue(listOf([vendor('v-1', 'Acme Roofing')]));
  });

  it('lists the first page on focus and reports a picked company as vendorId', async () => {
    const onFormChange = jest.fn();
    render(<BudgetLineForm {...buildProps(buildDirectForm(), { onFormChange })} />);

    await userEvent.click(screen.getByLabelText('Vendor'));
    await userEvent.click(await screen.findByRole('option', { name: 'Acme Roofing' }));

    expect(mockFetchVendors).toHaveBeenCalledWith(
      { pageSize: 50 },
      { signal: expect.any(AbortSignal) },
    );
    expect(onFormChange).toHaveBeenCalledWith({ vendorId: 'v-1' });
  });

  it('finds a company beyond the first 100 by typing (q reaches the server)', async () => {
    mockFetchVendors.mockImplementation(async (params) =>
      listOf(params?.q === 'zeta' ? [vendor('v-250', 'Zeta Tiling')] : [vendor('v-1', 'Acme')]),
    );
    const onFormChange = jest.fn();
    render(<BudgetLineForm {...buildProps(buildDirectForm(), { onFormChange })} />);

    await userEvent.type(screen.getByLabelText('Vendor'), 'zeta');
    await userEvent.click(await screen.findByRole('option', { name: 'Zeta Tiling' }));

    expect(mockFetchVendors).toHaveBeenCalledWith(
      { q: 'zeta', pageSize: 50 },
      { signal: expect.any(AbortSignal) },
    );
    expect(onFormChange).toHaveBeenCalledWith({ vendorId: 'v-250' });
  });

  it('shows the known company as the title without any lookup', () => {
    const form = buildDirectForm({ vendorId: 'v-7' });
    render(
      <BudgetLineForm
        {...buildProps(form, { knownVendor: { id: 'v-7', name: 'Birch Plumbing' } })}
      />,
    );

    expect(screen.getByText('Birch Plumbing')).toBeInTheDocument();
    expect(mockFetchVendor).not.toHaveBeenCalled();
    expect(mockFetchVendors).not.toHaveBeenCalled();
  });

  it('looks up an unknown vendorId and shows the fetched name', async () => {
    mockFetchVendor.mockResolvedValue({ id: 'v-9', name: 'Cedar Glazing' } as VendorDetail);
    const form = buildDirectForm({ vendorId: 'v-9' });
    render(<BudgetLineForm {...buildProps(form)} />);

    expect(await screen.findByText('Cedar Glazing')).toBeInTheDocument();
    expect(mockFetchVendor).toHaveBeenCalledWith('v-9');
  });

  it('keeps the vendorId and does not clear it when the lookup fails', async () => {
    mockFetchVendor.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
    const onFormChange = jest.fn();
    const form = buildDirectForm({ vendorId: 'v-gone' });
    render(<BudgetLineForm {...buildProps(form, { onFormChange })} />);

    await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText('Vendor')).not.toBeDisabled());

    expect(onFormChange).not.toHaveBeenCalled();
  });

  it('disables the picker while a company is being resolved', async () => {
    mockFetchVendor.mockReturnValue(new Promise(() => {}));
    render(<BudgetLineForm {...buildProps(buildDirectForm({ vendorId: 'v-9' }))} />);

    expect(screen.getByLabelText('Vendor')).toBeDisabled();
  });

  it('is disabled while saving', () => {
    render(<BudgetLineForm {...buildProps(buildDirectForm(), { isSaving: true })} />);
    expect(screen.getByLabelText('Vendor')).toBeDisabled();
  });

  it('is disabled for an unassigned line', () => {
    render(<BudgetLineForm {...buildProps(buildDirectForm(), { isUnassigned: true })} />);
    expect(screen.getByLabelText('Vendor')).toBeDisabled();
  });

  it('shows no create row without companyCreateAction', async () => {
    render(<BudgetLineForm {...buildProps(buildDirectForm())} />);

    await userEvent.click(screen.getByLabelText('Vendor'));
    await screen.findByRole('option', { name: 'Acme Roofing' });

    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
  });

  it('shows the create row with companyCreateAction and selects the created company', async () => {
    const onCreate = jest.fn(async (_query: string) => ({ id: 'v-new', name: 'Fresh Co' }));
    const onFormChange = jest.fn();
    const companyCreateAction = {
      getLabel: (q: string) => `New company ${q}`,
      show: 'noExactMatch' as const,
      onCreate,
    };
    render(
      <BudgetLineForm {...buildProps(buildDirectForm(), { onFormChange, companyCreateAction })} />,
    );

    await userEvent.type(screen.getByLabelText('Vendor'), 'Fresh Co');
    await userEvent.click(await screen.findByRole('option', { name: 'New company Fresh Co' }));

    await waitFor(() => expect(onFormChange).toHaveBeenCalledWith({ vendorId: 'v-new' }));
    expect(onCreate).toHaveBeenCalledWith('Fresh Co');
  });

  it('renders the trade as secondary text', async () => {
    mockFetchVendors.mockResolvedValue(
      listOf([
        vendor('v-1', 'Acme Roofing', {
          id: 't-1',
          name: 'Roofing',
          color: null,
          translationKey: null,
        } as VendorListItem['trade']),
      ]),
    );
    render(<BudgetLineForm {...buildProps(buildDirectForm())} />);

    await userEvent.click(screen.getByLabelText('Vendor'));
    const option = await screen.findByRole('option', { name: /Acme Roofing/ });

    expect(option).toHaveTextContent('Roofing');
  });
});

describe('BudgetLineForm — static category and other fields', () => {
  it('renders static category label when staticCategoryLabel is provided', () => {
    const props = buildProps(buildDirectForm(), { staticCategoryLabel: 'Plumbing' });
    render(<BudgetLineForm {...props} />);
    expect(screen.getByText('Plumbing')).toBeInTheDocument();
  });

  it('renders dynamic category select when budgetCategories is provided', () => {
    const budgetCategories: BudgetCategory[] = [
      {
        id: 'cat-1',
        name: 'Electrical',
        translationKey: null,
        description: null,
        color: null,
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
      },
    ];
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
    const budgetCategories: BudgetCategory[] = [
      {
        id: 'cat-1',
        name: 'Electrical',
        translationKey: null,
        description: null,
        color: null,
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
      },
    ];
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

// ─── hideConfidenceField and hideVatField props (#1764) ───────────────────────

describe('BudgetLineForm — hideConfidenceField and hideVatField props', () => {
  it('hideConfidenceField=true: confidence select is NOT present in the DOM', () => {
    const props = buildProps(buildDirectForm(), { hideConfidenceField: true });
    render(<BudgetLineForm {...props} />);

    expect(screen.queryByRole('combobox', { name: /Confidence/i })).not.toBeInTheDocument();
  });

  it('hideConfidenceField=false (default): confidence select IS present', () => {
    const props = buildProps(buildDirectForm());
    render(<BudgetLineForm {...props} />);

    expect(screen.getByRole('combobox', { name: /Confidence/i })).toBeInTheDocument();
  });

  it.each([['direct', buildDirectForm()] as const, ['unit', buildUnitForm()] as const])(
    'hideVatField=true in %s mode: includesVat checkbox is NOT present',
    (_mode, form) => {
      const props = buildProps(form, { hideVatField: true });
      render(<BudgetLineForm {...props} />);

      expect(
        screen.queryByRole('checkbox', { name: /Price includes VAT/i }),
      ).not.toBeInTheDocument();
    },
  );

  it.each([['direct', buildDirectForm()] as const, ['unit', buildUnitForm()] as const])(
    'hideVatField=false (default) in %s mode: includesVat checkbox IS present',
    (_mode, form) => {
      const props = buildProps(form);
      render(<BudgetLineForm {...props} />);

      expect(screen.getByRole('checkbox', { name: /Price includes VAT/i })).toBeInTheDocument();
    },
  );
});

// ─── ParentPicker regression smoke (#1586 follow-up) ─────────────────────────

describe('BudgetLineForm — ParentPicker regression smoke', () => {
  it('renders without error (basic mount in direct mode)', () => {
    const props = buildProps(buildDirectForm());
    // BudgetLineForm should mount without throwing even with ParentPicker present
    expect(() => render(<BudgetLineForm {...props} />)).not.toThrow();
  });

  it('renders without error (basic mount in unit mode)', () => {
    const props = buildProps(buildUnitForm());
    expect(() => render(<BudgetLineForm {...props} />)).not.toThrow();
  });

  it('Cancel button is present and calls onCancel', () => {
    const onCancel = jest.fn();
    const props = buildProps(buildDirectForm(), { onCancel });
    render(<BudgetLineForm {...props} />);
    const cancelBtn = screen.getByRole('button', { name: /^Cancel$/i });
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Submit button is present in direct mode (Add Line / Save Changes)', () => {
    const props = buildProps(buildDirectForm());
    render(<BudgetLineForm {...props} />);
    // The submit button uses t('budgetLineForm.submitAdd') = "Add Line" (isEditing=false default)
    // or t('budgetLineForm.submitSave') = "Save Changes" (isEditing=true).
    // Use type="submit" to find it regardless of translated text.
    const submitBtn = document.querySelector('button[type="submit"]');
    expect(submitBtn).not.toBeNull();
  });
});

// ─── Configurable VAT_RATE flows through to computed total & labels (#1807) ──

describe('BudgetLineForm — configurable vatRate from LocaleContext (#1807)', () => {
  it('Scenario 27: with mocked vatRate=0.25, qty=2/price=100/includesVat=false → computed total is €250.00', async () => {
    mockUseLocale.mockReturnValue({
      locale: 'en' as const,
      resolvedLocale: 'en' as const,
      currency: 'EUR',
      vatRate: 0.25,
      setLocale: jest.fn(),
      syncWithServer: jest.fn(),
    });
    mockFetchConfig.mockResolvedValue({
      currency: 'EUR',
      vatRate: 0.25,
      autoItemizeEnabled: false,
    });

    const props = buildProps(
      buildUnitForm({ quantity: '2', unitPrice: '100', includesVat: false }),
    );
    render(<BudgetLineForm {...props} />);

    await waitFor(() => {
      expect(screen.getByText(/€250\.00/)).toBeInTheDocument();
    });
  });

  it('Scenario 28: with mocked vatRate=0.20, VAT checkbox label/note reflect "20%" instead of the "19%" default', async () => {
    mockUseLocale.mockReturnValue({
      locale: 'en' as const,
      resolvedLocale: 'en' as const,
      currency: 'EUR',
      vatRate: 0.2,
      setLocale: jest.fn(),
      syncWithServer: jest.fn(),
    });
    mockFetchConfig.mockResolvedValue({ currency: 'EUR', vatRate: 0.2, autoItemizeEnabled: false });

    const props = buildProps(buildDirectForm({ includesVat: false }));
    render(<BudgetLineForm {...props} />);

    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Price includes VAT \(20%\)/i }),
      ).toBeInTheDocument();
      expect(screen.getByText('+20% VAT will be added to the total')).toBeInTheDocument();
    });

    // Confirm the old 19% default is no longer shown anywhere.
    expect(screen.queryByText(/19%/)).not.toBeInTheDocument();
  });
});
