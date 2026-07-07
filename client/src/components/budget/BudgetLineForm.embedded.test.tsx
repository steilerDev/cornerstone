/**
 * @jest-environment jsdom
 *
 * Unit tests for BudgetLineForm — embedded mode and idPrefix props (Story #1693).
 *
 * Covers:
 *   1. embedded=false → actions row (submit/cancel) renders
 *   2. embedded=false → parent-picker fieldset renders when isUnassigned/onAssign provided
 *   3. embedded=true → actions row (submit/cancel) does NOT render
 *   4. embedded=true → parent-picker fieldset does NOT render even when isUnassigned/onAssign provided
 *   5. idPrefix='foo-' → description input id="foo-budget-description"; label htmlFor matches
 *   6. idPrefix='bar-' → all prefixed ids present; no un-prefixed ids for same form
 *   7. Two instances with different idPrefix → no duplicate DOM ids
 *   8. embedded form calls onFormChange on description change
 *   9. embedded form calls onFormChange on pricingMode toggle (direct → unit)
 *   10. embedded form calls onFormChange on plannedAmount entry
 *   11. embedded=true with includesVat=false → vatNote visible
 *   12. embedded=true with includesVat=true → vatNote NOT visible
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ─── Mocks (must precede static imports in Jest ESM) ─────────────────────────

// react-i18next mock: BudgetLineForm calls useTranslation('budget') and useTranslation('settings').
// t(k) returns the key string so tests that look up buttons by text can match the key.
jest.unstable_mockModule('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
  Trans: ({ children }: { children: unknown }) => children,
}));

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

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: unknown }) => children,
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

// ─── Static imports (after mocks) ─────────────────────────────────────────────

import React from 'react';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import type { BudgetLineFormProps } from './BudgetLineForm.js';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import type * as BudgetLineFormModule from './BudgetLineForm.js';
import type * as LocaleContextModule from '../../contexts/LocaleContext.js';

// ─── Dynamic import ────────────────────────────────────────────────────────────

let BudgetLineForm: (typeof BudgetLineFormModule)['BudgetLineForm'];
let LocaleProvider: (typeof LocaleContextModule)['LocaleProvider'];

// `render` is shadowed here so every existing `render(React.createElement(BudgetLineForm, ...))`
// call site automatically wraps in the real LocaleProvider — a fallback for when
// jest.unstable_mockModule doesn't intercept locally (see mocks above).
function render(ui: React.ReactElement) {
  return rtlRender(React.createElement(LocaleProvider, null, ui));
}

beforeEach(async () => {
  const [formMod, localeMod] = await Promise.all([
    import('./BudgetLineForm.js'),
    import('../../contexts/LocaleContext.js'),
  ]);
  BudgetLineForm = (formMod as typeof BudgetLineFormModule).BudgetLineForm;
  LocaleProvider = (localeMod as typeof LocaleContextModule).LocaleProvider;
});

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const CONFIDENCE_LABELS = {
  own_estimate: 'Own Estimate',
  professional_estimate: 'Professional Estimate',
  quote: 'Quote',
  invoice: 'Invoice',
} as const;

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
    includesVat: true,
    ...overrides,
  };
}

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

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('BudgetLineForm — embedded mode and idPrefix', () => {
  // 1. embedded=false (default) → actions row renders
  it('embedded=false: submit and cancel buttons are rendered', () => {
    const props = buildProps(buildDirectForm(), { embedded: false });
    render(React.createElement(BudgetLineForm, props));

    const submitBtn = document.querySelector('button[type="submit"]');
    expect(submitBtn).not.toBeNull();

    const cancelBtn = screen.queryByRole('button', { name: /cancel/i });
    expect(cancelBtn).not.toBeNull();
  });

  // 2. embedded=false → parent-picker fieldset renders when isUnassigned + onAssign provided
  it('embedded=false: parent-picker fieldset renders when isUnassigned=true and onAssign provided', () => {
    const props = buildProps(buildDirectForm(), {
      embedded: false,
      isUnassigned: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub
      onAssign: jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined),
      assignBudgetLineId: 'wib-1',
    });
    render(React.createElement(BudgetLineForm, props));

    const fieldset = document.querySelector('fieldset');
    expect(fieldset).not.toBeNull();
  });

  // 3. embedded=true → actions row does NOT render
  it('embedded=true: submit and cancel buttons are NOT rendered', () => {
    const props = buildProps(buildDirectForm(), { embedded: true });
    render(React.createElement(BudgetLineForm, props));

    const submitBtn = document.querySelector('button[type="submit"]');
    expect(submitBtn).toBeNull();

    const cancelBtn = screen.queryByRole('button', { name: /cancel/i });
    expect(cancelBtn).toBeNull();
  });

  // 4. embedded=true → parent-picker fieldset does NOT render even when isUnassigned + onAssign provided
  it('embedded=true: parent-picker fieldset does NOT render even with isUnassigned and onAssign', () => {
    const props = buildProps(buildDirectForm(), {
      embedded: true,
      isUnassigned: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub
      onAssign: jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined),
      assignBudgetLineId: 'wib-1',
    });
    render(React.createElement(BudgetLineForm, props));

    const fieldset = document.querySelector('fieldset');
    expect(fieldset).toBeNull();
  });

  // 4b. embedded=true → move fieldset also suppressed even when currentParentId + onMove provided
  it('embedded=true: move fieldset does NOT render even with currentParentId and onMove', () => {
    const props = buildProps(buildDirectForm(), {
      embedded: true,
      currentParentType: 'work_item',
      currentParentId: 'wi-1',
      currentParentLabel: 'Kitchen',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub
      onMove: jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined),
    });
    render(React.createElement(BudgetLineForm, props));

    const fieldset = document.querySelector('fieldset');
    expect(fieldset).toBeNull();
  });

  // 5. idPrefix='foo-' → description input id="foo-budget-description"; label htmlFor matches
  it("idPrefix='foo-': description input has id='foo-budget-description' and label htmlFor matches", () => {
    const props = buildProps(buildDirectForm(), { idPrefix: 'foo-' });
    render(React.createElement(BudgetLineForm, props));

    const input = document.getElementById('foo-budget-description');
    expect(input).not.toBeNull();
    expect(input!.tagName.toLowerCase()).toBe('input');

    // Find the label whose htmlFor matches
    const label = document.querySelector('label[for="foo-budget-description"]');
    expect(label).not.toBeNull();
  });

  // 6. idPrefix='bar-' → all prefixed ids present
  it("idPrefix='bar-': amount input has id='bar-budget-planned-amount'", () => {
    const props = buildProps(buildDirectForm(), { idPrefix: 'bar-' });
    render(React.createElement(BudgetLineForm, props));

    const amountInput = document.getElementById('bar-budget-planned-amount');
    expect(amountInput).not.toBeNull();

    const confidenceSelect = document.getElementById('bar-budget-confidence');
    expect(confidenceSelect).not.toBeNull();
  });

  // 7. Two instances with different idPrefix → no duplicate DOM ids
  it('two instances with different idPrefix have no duplicate DOM ids', () => {
    const { container: c1 } = render(
      React.createElement(BudgetLineForm, buildProps(buildDirectForm(), { idPrefix: 'alpha-' })),
    );
    const { container: c2 } = render(
      React.createElement(BudgetLineForm, buildProps(buildDirectForm(), { idPrefix: 'beta-' })),
    );

    // Collect all ids in both containers
    const allIds: string[] = [];
    [c1, c2].forEach((container) => {
      container.querySelectorAll('[id]').forEach((el) => {
        allIds.push(el.id);
      });
    });

    // All ids should be unique (no duplicates)
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);

    // Spot-check that alpha and beta ids are both present
    expect(allIds).toContain('alpha-budget-description');
    expect(allIds).toContain('beta-budget-description');
  });

  // 8. embedded form calls onFormChange on description change
  it('embedded=true: description change fires onFormChange({ description: ... })', () => {
    const onFormChange = jest.fn<BudgetLineFormProps['onFormChange']>();
    const props = buildProps(buildDirectForm({ description: 'Tiles' }), {
      embedded: true,
      onFormChange,
    });
    render(React.createElement(BudgetLineForm, props));

    const descInput = document.getElementById('budget-description') as HTMLInputElement;
    expect(descInput).not.toBeNull();
    fireEvent.change(descInput, { target: { value: 'Marble Tiles' } });

    expect(onFormChange).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Marble Tiles' }),
    );
  });

  // 9. embedded form calls onFormChange on pricingMode toggle
  it('embedded=true: clicking Unit mode button fires onFormChange({ pricingMode: "unit" })', () => {
    const onFormChange = jest.fn<BudgetLineFormProps['onFormChange']>();
    const props = buildProps(buildDirectForm({ pricingMode: 'direct' }), {
      embedded: true,
      onFormChange,
    });
    render(React.createElement(BudgetLineForm, props));

    // The mode toggle has two buttons: "Direct" and "Unit"
    // Find the Unit mode button by its translation key text
    const buttons = screen.getAllByRole('button');
    const unitBtn = buttons.find((b) => b.textContent?.includes('budgetLineForm.modeUnit'));
    expect(unitBtn).toBeDefined();

    fireEvent.click(unitBtn!);
    expect(onFormChange).toHaveBeenCalledWith(expect.objectContaining({ pricingMode: 'unit' }));
  });

  // 10. embedded form calls onFormChange on plannedAmount entry
  it('embedded=true: plannedAmount input change fires onFormChange({ plannedAmount: ... })', () => {
    const onFormChange = jest.fn<BudgetLineFormProps['onFormChange']>();
    const props = buildProps(buildDirectForm({ plannedAmount: '100' }), {
      embedded: true,
      onFormChange,
    });
    render(React.createElement(BudgetLineForm, props));

    const amountInput = document.getElementById('budget-planned-amount') as HTMLInputElement;
    expect(amountInput).not.toBeNull();
    fireEvent.change(amountInput, { target: { value: '250' } });

    expect(onFormChange).toHaveBeenCalledWith(expect.objectContaining({ plannedAmount: '250' }));
  });

  // 11. embedded=true with includesVat=false → vatNote visible
  it('embedded=true with includesVat=false: VAT note is visible', () => {
    const props = buildProps(buildDirectForm({ includesVat: false }), { embedded: true });
    render(React.createElement(BudgetLineForm, props));

    // vatNote renders the t('budgetLineForm.vatNote', ...) key
    // In test env i18next returns the key itself
    const vatNote = document.querySelector('[class*="vatNote"]');
    // If class-based query fails (CSS Modules hashing), fall back to text content search
    const hasVatNote =
      vatNote !== null ||
      screen.queryByText(/budgetLineForm.vatNote/i) !== null ||
      screen.queryByText(/19/i) !== null;
    expect(hasVatNote).toBe(true);
  });

  // 12. embedded=true with includesVat=true → vatNote NOT visible
  it('embedded=true with includesVat=true: VAT note is NOT visible', () => {
    const props = buildProps(buildDirectForm({ includesVat: true }), { embedded: true });
    render(React.createElement(BudgetLineForm, props));

    const vatNote = document.querySelector('[class*="vatNote"]');
    expect(vatNote).toBeNull();
  });
});
