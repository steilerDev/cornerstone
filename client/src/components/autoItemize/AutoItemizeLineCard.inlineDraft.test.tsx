/**
 * @jest-environment jsdom
 *
 * Unit tests for AutoItemizeLineCard — inline draft rendering (Story #1693).
 *
 * Covers:
 *   1. No draft: metric grid visible; Assign button present; no inline form
 *   2. With inlineCreatedBudgetLineDraft: metric grid hidden; amber "Creating New" Badge visible;
 *      Discard button visible; inline BudgetLineForm rendered (real DOM)
 *   3. Discard click → onClearAssign(rowId)
 *   4. Inline form onChange → onInlineDraftChange(rowId, {...})
 *   5. includesVat=false in draft → BudgetLineForm renders vatNote text
 *   6. onQueueNewBudgetLine prop is accepted without error (smoke test)
 *   7. Creating-new badge testId="creating-new-badge" is present
 *   8. Inline BudgetLineForm rendered with embedded aria-label
 *   9. Inline BudgetLineForm renders fields with idPrefix="inline-{rowId}-"
 *  10. Inline form NOT rendered when onInlineDraftChange is undefined (guard)
 */

// ─── Mocks (must precede static imports) ────────────────────────────────────

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

jest.unstable_mockModule('../../lib/categoryUtils.js', () => ({
  getCategoryDisplayName: (_t: unknown, name: string) => name,
  useCategoryDisplayName: (name: string) => name,
}));

// react-i18next mock: BudgetLineForm (rendered inline) calls useTranslation.
// t() returns the key string so tests can assert on translation keys.
jest.unstable_mockModule('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
  Trans: ({ children }: { children: unknown }) => children,
}));

// ─── Static imports (after mocks) ────────────────────────────────────────────

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type * as AutoItemizeLineCardModule from './AutoItemizeLineCard.js';
import type { LineWithInclude } from './types.js';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import type { BudgetCategory, BudgetSource, Vendor } from '@cornerstone/shared';

let AutoItemizeLineCard: (typeof AutoItemizeLineCardModule)['AutoItemizeLineCard'];

beforeEach(async () => {
  ({ AutoItemizeLineCard } =
    (await import('./AutoItemizeLineCard.js')) as typeof AutoItemizeLineCardModule);
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeLine(overrides: Partial<LineWithInclude> = {}): LineWithInclude {
  return {
    rowId: 'row-1',
    description: 'Tiles',
    totalAmount: 100,
    confidence: 0.9,
    included: true,
    includesVat: true,
    quantity: undefined,
    unit: undefined,
    unitPrice: undefined,
    vendorName: undefined,
    budgetCategoryId: null,
    budgetSourceId: null,
    ...overrides,
  };
}

function makeDraft(overrides: Partial<BudgetLineFormState> = {}): BudgetLineFormState {
  return {
    description: 'New Budget Line',
    plannedAmount: '100',
    confidence: 'invoice',
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

const categories = [{ id: 'cat-1', name: 'Flooring', translationKey: null }];
const budgetSources = [{ id: 'src-1', name: 'Main Fund' }] as unknown as BudgetSource[];
const budgetCategories: BudgetCategory[] = [
  {
    id: 'bc-1',
    name: 'Flooring',
    description: null,
    color: null,
    translationKey: null,
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];
const vendors = [{ id: 'v-1', name: 'Builder Co', trade: null }] as unknown as Vendor[];
const confidenceLabels: Record<string, string> = {
  own_estimate: 'Own Estimate',
  professional_estimate: 'Professional Estimate',
  quote: 'Quote',
  invoice: 'Invoice',
};
const createdFromExtractionVariants = { true: { label: 'Auto-created', className: 'badge-info' } };

// t() returns the translation key (no i18next in unit tests)
const t = (key: string, _opts?: Record<string, unknown>) => key;
const tSettings = (key: string) => key;

// ─── Render helper ────────────────────────────────────────────────────────────

function renderCard(
  lineOverrides: Partial<LineWithInclude> = {},
  callbacks: {
    onToggleInclude?: ReturnType<typeof jest.fn>;
    onFieldChange?: ReturnType<typeof jest.fn>;
    onAssign?: ReturnType<typeof jest.fn>;
    onClearAssign?: ReturnType<typeof jest.fn>;
    onInlineDraftChange?: ReturnType<typeof jest.fn> | undefined;
    onQueueNewBudgetLine?: ReturnType<typeof jest.fn> | undefined;
  } = {},
) {
  return render(
    React.createElement(AutoItemizeLineCard, {
      line: makeLine(lineOverrides),
      onToggleInclude: (callbacks.onToggleInclude ?? jest.fn()) as (rowId: string) => void,
      onFieldChange: (callbacks.onFieldChange ?? jest.fn()) as (
        rowId: string,
        field: keyof LineWithInclude,
        value: unknown,
      ) => void,
      onAssign: (callbacks.onAssign ?? jest.fn()) as (rowId: string) => void,
      onClearAssign: (callbacks.onClearAssign ?? jest.fn()) as (rowId: string) => void,
      categories,
      budgetSources,
      createdFromExtractionVariants,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      t: t as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tSettings: tSettings as any,
      onInlineDraftChange: callbacks.onInlineDraftChange as
        | ((rowId: string, updates: Partial<BudgetLineFormState>) => void)
        | undefined,
      onQueueNewBudgetLine: callbacks.onQueueNewBudgetLine as ((rowId: string) => void) | undefined,
      confidenceLabels,
      vendors,
      budgetCategories,
    }),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AutoItemizeLineCard — inline draft rendering (Story #1693)', () => {
  // 1. No draft → metric grid visible; Assign button present; no inline form
  it('no inlineCreatedBudgetLineDraft: metric grid is visible and Assign button is present', () => {
    renderCard({ inlineCreatedBudgetLineDraft: undefined });

    // Quantity input is part of the metric grid (only visible when no draft)
    const quantityInput = document.querySelector(
      'input[aria-label="autoItemize.editQuantityAriaLabel"]',
    );
    expect(quantityInput).not.toBeNull();

    // Assign button visible — t('autoItemize.assignButton') = the key itself
    expect(screen.getByRole('button', { name: 'autoItemize.assignButton' })).toBeInTheDocument();

    // No inline BudgetLineForm — the description input with prefix would only appear with a draft
    expect(document.getElementById('inline-row-1-budget-description')).toBeNull();
  });

  // 2. With inlineCreatedBudgetLineDraft: metric grid hidden; amber "Creating New" badge visible;
  //    Discard button present; inline BudgetLineForm rendered (real DOM)
  it('with inlineCreatedBudgetLineDraft: metric grid hidden, creating-new-badge present, inline form rendered', () => {
    renderCard(
      {
        rowId: 'row-1',
        assignedBudgetLineId: undefined,
        inlineCreatedBudgetLineDraft: makeDraft(),
      },
      { onInlineDraftChange: jest.fn() },
    );

    // Metric grid hidden — quantity input absent
    const quantityInput = document.querySelector(
      'input[aria-label="autoItemize.editQuantityAriaLabel"]',
    );
    expect(quantityInput).toBeNull();

    // "Creating New" badge present
    expect(screen.getByTestId('creating-new-badge')).toBeInTheDocument();

    // Assign button not present (draft occupies that slot)
    expect(
      screen.queryByRole('button', { name: 'autoItemize.assignButton' }),
    ).not.toBeInTheDocument();

    // Inline BudgetLineForm rendered — real form has a description input with the prefixed id
    expect(document.getElementById('inline-row-1-budget-description')).not.toBeNull();
  });

  // 3. Discard click → onClearAssign(rowId)
  it('Discard button click calls onClearAssign with the correct rowId', () => {
    const onClearAssign = jest.fn();

    renderCard(
      {
        rowId: 'row-42',
        assignedBudgetLineId: undefined,
        inlineCreatedBudgetLineDraft: makeDraft(),
      },
      { onClearAssign, onInlineDraftChange: jest.fn() },
    );

    // Discard button aria-label = t('autoItemize.discardInlineDraft') = the key itself
    const discardBtn = screen.getByRole('button', { name: 'autoItemize.discardInlineDraft' });
    expect(discardBtn).toBeInTheDocument();

    fireEvent.click(discardBtn);
    expect(onClearAssign).toHaveBeenCalledWith('row-42');
    expect(onClearAssign).toHaveBeenCalledTimes(1);
  });

  // 4. Inline form onChange → onInlineDraftChange(rowId, updates)
  it('inline form description change calls onInlineDraftChange(rowId, updates)', () => {
    const onInlineDraftChange = jest.fn();

    renderCard(
      {
        rowId: 'row-7',
        inlineCreatedBudgetLineDraft: makeDraft({ description: 'Old' }),
      },
      { onInlineDraftChange },
    );

    // Real BudgetLineForm renders input id="${prefix}budget-description" = "inline-row-7-budget-description"
    const descInput = document.getElementById(
      'inline-row-7-budget-description',
    ) as HTMLInputElement;
    expect(descInput).not.toBeNull();

    fireEvent.change(descInput, { target: { value: 'New description' } });

    expect(onInlineDraftChange).toHaveBeenCalledWith(
      'row-7',
      expect.objectContaining({ description: 'New description' }),
    );
  });

  // 5a. includesVat=false in draft → real BudgetLineForm renders vatNote text
  it('draft with includesVat=false: vatNote text is visible in the inline form', () => {
    renderCard(
      {
        rowId: 'row-1',
        inlineCreatedBudgetLineDraft: makeDraft({ includesVat: false }),
      },
      { onInlineDraftChange: jest.fn() },
    );

    // The real BudgetLineForm renders a vatNote div when !form.includesVat.
    // react-i18next is mocked: t(k) returns k, so text is 'budgetLineForm.vatNote'.
    // The div uses class styles.vatNote — we query by its text content (the translation key).
    expect(screen.getByText(/budgetLineForm\.vatNote/i)).toBeInTheDocument();
  });

  // 5b. includesVat=true in draft → vatNote NOT visible
  it('draft with includesVat=true: vatNote is NOT present', () => {
    renderCard(
      {
        rowId: 'row-1',
        inlineCreatedBudgetLineDraft: makeDraft({ includesVat: true }),
      },
      { onInlineDraftChange: jest.fn() },
    );

    // react-i18next is mocked: t(k) returns k, so vatNote text would be 'budgetLineForm.vatNote'.
    // With includesVat=true the vatNote div is not rendered at all.
    expect(screen.queryByText(/budgetLineForm\.vatNote/i)).not.toBeInTheDocument();
  });

  // 6. onQueueNewBudgetLine prop accepted without error (smoke test)
  it('onQueueNewBudgetLine prop can be passed without errors', () => {
    expect(() => {
      renderCard({ rowId: 'row-1' }, { onQueueNewBudgetLine: jest.fn() });
    }).not.toThrow();
  });

  // 7. Creating-new badge has testId="creating-new-badge"
  it('creating-new badge has testId="creating-new-badge"', () => {
    renderCard(
      {
        rowId: 'row-1',
        assignedBudgetLineId: undefined,
        inlineCreatedBudgetLineDraft: makeDraft(),
      },
      { onInlineDraftChange: jest.fn() },
    );

    expect(screen.getByTestId('creating-new-badge')).toBeInTheDocument();
  });

  // 8. Inline BudgetLineForm is rendered in embedded mode
  //    The real BudgetLineForm renders aria-label="New budget line details" when embedded=true
  it('inline BudgetLineForm receives embedded=true (aria-label present)', () => {
    renderCard(
      {
        rowId: 'row-1',
        inlineCreatedBudgetLineDraft: makeDraft(),
      },
      { onInlineDraftChange: jest.fn() },
    );

    // When embedded=true, BudgetLineForm adds aria-label={t('autoItemize.inlineFormLabel')} to the <form>.
    // react-i18next is mocked: t(k) returns k, so the aria-label value is the translation key.
    const inlineForm = document.querySelector('form[aria-label="autoItemize.inlineFormLabel"]');
    expect(inlineForm).not.toBeNull();
  });

  // 9. Inline BudgetLineForm receives idPrefix="inline-{rowId}-"
  //    The real form renders its description field with id="${prefix}budget-description"
  it('inline BudgetLineForm receives idPrefix="inline-{rowId}-"', () => {
    renderCard(
      {
        rowId: 'row-abc',
        inlineCreatedBudgetLineDraft: makeDraft(),
      },
      { onInlineDraftChange: jest.fn() },
    );

    // With idPrefix="inline-row-abc-", the description input gets id="inline-row-abc-budget-description"
    expect(document.getElementById('inline-row-abc-budget-description')).not.toBeNull();
  });

  // 10. Inline form NOT rendered when onInlineDraftChange is undefined (guard condition)
  it('inline BudgetLineForm NOT rendered when onInlineDraftChange is undefined', () => {
    renderCard(
      {
        rowId: 'row-1',
        inlineCreatedBudgetLineDraft: makeDraft(),
      },
      { onInlineDraftChange: undefined },
    );

    // Draft set but no onInlineDraftChange callback → the guard prevents rendering the real form
    expect(document.getElementById('inline-row-1-budget-description')).toBeNull();
  });
});
