/**
 * @jest-environment jsdom
 *
 * Unit tests for BudgetLinePickerModal (Story #1703/#1704 — auto-itemize UI unification).
 *
 * Covers all 9 scenarios from the QA Spec:
 *   1. Step 1 renders ParentPicker
 *   2. Step 2 renders budget line list when budgetLines.length > 0
 *   3. Step 2 empty state when budgetLines.length === 0 && !showCreateForm
 *   4. Step 2 loading state when isLoading === true
 *   5. Back button calls onBackToStep1
 *   6. Create Budget Line button calls onCreateNewBudgetLine
 *   7. Selecting a budget line calls onSelectBudgetLine with the line object
 *   8. Create form renders when showCreateForm === true && createForm !== undefined
 *   9. Error banner when pickerState.error is set
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ─── Mocks must come before any static imports ────────────────────────────────

// Module-scope variable to capture the onChange callback fired by the ParentPicker mock.
// This allows tests to invoke the onChange handler to exercise lines 50-51 of the component.
let capturedParentPickerOnChange:
  | ((type: 'work_item' | 'household_item', id: string) => Promise<void>)
  | null = null;

jest.unstable_mockModule('../../components/ParentPicker/ParentPicker.js', () => ({
  ParentPicker: ({
    selectedType,
    onChange,
  }: {
    selectedType: string;
    onChange: (type: 'work_item' | 'household_item', id: string) => Promise<void>;
  }) => {
    capturedParentPickerOnChange = onChange;
    return (
      <div
        data-testid="parent-picker"
        data-selected-type={selectedType}
      />
    );
  },
}));

jest.unstable_mockModule('../../components/budget/BudgetLineForm.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BudgetLineForm: ({ form }: { form?: any }) => (
    <div data-testid="budget-line-form">{form?.description ?? 'BudgetLineForm'}</div>
  ),
}));

jest.unstable_mockModule('../../lib/categoryUtils.js', () => ({
  getCategoryDisplayName: (_t: unknown, name: string) => name,
}));

jest.unstable_mockModule('../../lib/budgetConstants.js', () => ({
  CONFIDENCE_LABELS: {
    invoice: 'Invoice',
    quote: 'Quote',
    professional_estimate: 'Professional Estimate',
    own_estimate: 'Own Estimate',
  },
  effectiveLineAmount: ({ amount }: { amount: number }) => amount,
}));

// ─── Dynamic import ────────────────────────────────────────────────────────────

import React from 'react';
import type * as BudgetLinePickerModalModule from './BudgetLinePickerModal.js';
import type { PickerState } from '../../hooks/useBudgetLinePicker.js';

let BudgetLinePickerModal: (typeof BudgetLinePickerModalModule)['BudgetLinePickerModal'];

beforeEach(async () => {
  ({ BudgetLinePickerModal } =
    (await import('./BudgetLinePickerModal.js')) as typeof BudgetLinePickerModalModule);
  capturedParentPickerOnChange = null;
});

function makePickerState(overrides: Partial<PickerState> = {}): PickerState {
  return {
    isOpen: true,
    step: 1,
    type: 'work_item',
    itemId: null,
    itemTitle: null,
    isLoading: false,
    error: null,
    budgetLines: [],
    budgetSources: null,
    vendors: null,
    categories: null,
    showCreateForm: false,
    createForm: undefined,
    createError: null,
    isCreatingBudgetLine: false,
    ...overrides,
  } as unknown as PickerState;
}

const t = (key: string, opts?: Record<string, unknown>) => {
  if (opts) return `${key}:${JSON.stringify(opts)}`;
  return key;
};
const tSettings = (key: string) => key;
const formatCurrency = (v: number) => `€${v.toFixed(2)}`;

// ─── Render helper ─────────────────────────────────────────────────────────────

function renderModal(
  pickerStateOverrides: Partial<PickerState> = {},
  callbacks: {
    onSelectBudgetLine?: (...args: any[]) => void;
    onCreateNewBudgetLine?: () => void;
    onBackToStep1?: () => void;
    onFormChange?: (updates: any) => void;
    onCancelCreateForm?: () => void;
    onCreateBudgetLine?: (e: any) => void;
    handleSelectItem?: (...args: any[]) => Promise<void>;
    setPickerState?: (...args: any[]) => void;
  } = {},
) {
  const pickerState = makePickerState(pickerStateOverrides);
  const createBudgetLineButtonRef = { current: null } as React.RefObject<HTMLButtonElement | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSelectItem = callbacks.handleSelectItem ?? jest.fn<any>().mockResolvedValue(undefined);
  const setPickerState = callbacks.setPickerState ?? jest.fn();

  return {
    pickerState,
    onSelectBudgetLine: callbacks.onSelectBudgetLine ?? jest.fn(),
    onCreateNewBudgetLine: callbacks.onCreateNewBudgetLine ?? jest.fn(),
    onBackToStep1: callbacks.onBackToStep1 ?? jest.fn(),
    handleSelectItem,
    setPickerState,
    ...render(
      React.createElement(BudgetLinePickerModal, {
        pickerState,
        setPickerState,
        handleSelectItem,
        createBudgetLineButtonRef,
        onSelectBudgetLine: callbacks.onSelectBudgetLine ?? jest.fn(),
        onCreateNewBudgetLine: callbacks.onCreateNewBudgetLine ?? jest.fn(),
        onBackToStep1: callbacks.onBackToStep1 ?? jest.fn(),
        onFormChange: callbacks.onFormChange ?? jest.fn(),
        onCancelCreateForm: callbacks.onCancelCreateForm ?? jest.fn(),
        onCreateBudgetLine: callbacks.onCreateBudgetLine ?? jest.fn(),
        t: t as any,
        tSettings: tSettings as any,
        formatCurrency,
      }),
    ),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BudgetLinePickerModal', () => {
  // 1. Step 1 renders ParentPicker
  it('renders ParentPicker when pickerState.step === 1', () => {
    renderModal({ step: 1 });

    // The mocked ParentPicker renders with data-testid="parent-picker"
    expect(screen.getByTestId('parent-picker')).toBeInTheDocument();
  });

  it('does not render step 2 content when step === 1', () => {
    renderModal({ step: 1 });

    // Back button and budget line list are only in step 2
    expect(screen.queryByRole('button', { name: /invoiceDetail.budgetLines.picker.backButton/i })).not.toBeInTheDocument();
  });

  // 2. Step 2 renders budget line list when budgetLines.length > 0
  it('renders budget line buttons with description and planned amount in step 2', () => {
    renderModal({
      step: 2,
      budgetLines: [
        {
          id: 'wib-1',
          description: 'Tile budget',
          plannedAmount: 500,
          workItemId: 'wi-1',
          budgetCategory: { id: 'bc-tiles', name: 'Tiles', translationKey: null },
        },
        {
          id: 'wib-2',
          description: 'Paint budget',
          plannedAmount: 200,
          workItemId: 'wi-2',
          budgetCategory: null,
        },
      ] as any,
      showCreateForm: false,
      isLoading: false,
    });

    expect(screen.getByText('Tile budget')).toBeInTheDocument();
    expect(screen.getByText('Paint budget')).toBeInTheDocument();
    // Planned amounts are shown via t('plannedLabel', { amount: ... })
    expect(screen.getByText(/€500\.00/)).toBeInTheDocument();
    expect(screen.getByText(/€200\.00/)).toBeInTheDocument();
  });

  // 3. Step 2 empty state
  it('renders empty state text when budgetLines is empty and showCreateForm is false', () => {
    renderModal({
      step: 2,
      budgetLines: [],
      showCreateForm: false,
      isLoading: false,
      error: null,
    });

    expect(
      screen.getByText('invoiceDetail.budgetLines.picker.noUnlinkedLines'),
    ).toBeInTheDocument();
  });

  // 4. Step 2 loading state
  it('renders loading text when isLoading=true in step 2', () => {
    renderModal({
      step: 2,
      isLoading: true,
      budgetLines: [],
    });

    expect(
      screen.getByText('invoiceDetail.budgetLines.picker.loadingLines'),
    ).toBeInTheDocument();
  });

  // 5. Back button calls onBackToStep1
  it('clicking back button calls onBackToStep1', () => {
    const onBackToStep1 = jest.fn();
    renderModal({ step: 2, budgetLines: [] }, { onBackToStep1 });

    const backBtn = screen.getByRole('button', {
      name: 'invoiceDetail.budgetLines.picker.backButton',
    });
    fireEvent.click(backBtn);

    expect(onBackToStep1).toHaveBeenCalledTimes(1);
  });

  // 6. Create Budget Line button calls onCreateNewBudgetLine
  it('clicking "Create Budget Line" button calls onCreateNewBudgetLine', () => {
    const onCreateNewBudgetLine = jest.fn();
    renderModal(
      {
        step: 2,
        budgetLines: [],
        showCreateForm: false,
        isLoading: false,
      },
      { onCreateNewBudgetLine },
    );

    const createBtn = screen.getByRole('button', {
      name: 'invoiceDetail.budgetLines.picker.createLine',
    });
    fireEvent.click(createBtn);

    expect(onCreateNewBudgetLine).toHaveBeenCalledTimes(1);
  });

  // 7. Selecting a budget line calls onSelectBudgetLine with the line object
  it('clicking a budget line button calls onSelectBudgetLine with the budget line', () => {
    const onSelectBudgetLine = jest.fn();
    const budgetLine = {
      id: 'wib-1',
      description: 'Tile budget',
      plannedAmount: 500,
      workItemId: 'wi-1',
      budgetCategory: { id: 'bc-tiles', name: 'Tiles', translationKey: null },
    };

    renderModal(
      {
        step: 2,
        budgetLines: [budgetLine] as any,
        showCreateForm: false,
        isLoading: false,
      },
      { onSelectBudgetLine },
    );

    const lineBtn = screen.getByRole('button', { name: /Tile budget/i });
    fireEvent.click(lineBtn);

    expect(onSelectBudgetLine).toHaveBeenCalledTimes(1);
    expect(onSelectBudgetLine).toHaveBeenCalledWith(budgetLine);
  });

  // 8. Create form renders when showCreateForm=true and createForm is set
  it('renders BudgetLineForm when showCreateForm=true and createForm is defined', () => {
    renderModal({
      step: 2,
      showCreateForm: true,
      createForm: { description: 'New Budget Line', plannedAmount: '200' } as any,
      budgetLines: [],
      isLoading: false,
    });

    expect(screen.getByTestId('budget-line-form')).toBeInTheDocument();
    // The mocked BudgetLineForm renders the form.description
    expect(screen.getByText('New Budget Line')).toBeInTheDocument();
  });

  it('does NOT render BudgetLineForm when showCreateForm=true but createForm is undefined', () => {
    renderModal({
      step: 2,
      showCreateForm: true,
      createForm: undefined,
      budgetLines: [],
      isLoading: false,
    });

    expect(screen.queryByTestId('budget-line-form')).not.toBeInTheDocument();
  });

  // 9. Error banner when pickerState.error is set
  it('renders error banner with role="alert" when pickerState.error is set', () => {
    renderModal({
      step: 2,
      error: 'Server error occurred',
      budgetLines: [],
      isLoading: false,
    });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toBe('Server error occurred');
  });

  // ─── Additional coverage for edge cases ──────────────────────────────────────

  it('does not render ParentPicker when step === 2', () => {
    renderModal({ step: 2, budgetLines: [] });
    expect(screen.queryByTestId('parent-picker')).not.toBeInTheDocument();
  });

  it('does not render the Create Budget Line button when showCreateForm=true', () => {
    renderModal({
      step: 2,
      showCreateForm: true,
      createForm: { description: 'Draft' } as any,
      budgetLines: [],
      isLoading: false,
    });

    // When showCreateForm=true, the Create Budget Line button is hidden
    // (the condition is: !pickerState.isLoading && !pickerState.showCreateForm)
    expect(
      screen.queryByRole('button', {
        name: 'invoiceDetail.budgetLines.picker.createLine',
      }),
    ).not.toBeInTheDocument();
  });

  it('renders category name for budget lines that have a budgetCategory', () => {
    renderModal({
      step: 2,
      budgetLines: [
        {
          id: 'wib-1',
          description: 'Flooring',
          plannedAmount: 800,
          workItemId: 'wi-1',
          budgetCategory: { id: 'bc-floors', name: 'Flooring Category', translationKey: null },
        },
      ] as any,
      showCreateForm: false,
      isLoading: false,
    });

    expect(screen.getByText('Flooring Category')).toBeInTheDocument();
  });

  it('does not render budget line list when isLoading=true even if budgetLines exist', () => {
    renderModal({
      step: 2,
      isLoading: true,
      budgetLines: [
        {
          id: 'wib-1',
          description: 'Tile budget',
          plannedAmount: 500,
          workItemId: 'wi-1',
          budgetCategory: null,
        },
      ] as any,
      showCreateForm: false,
    });

    // Loading text renders
    expect(
      screen.getByText('invoiceDetail.budgetLines.picker.loadingLines'),
    ).toBeInTheDocument();
    // Budget lines list is NOT rendered when loading (per: !pickerState.isLoading && budgetLines.length > 0)
    expect(screen.queryByText('Tile budget')).not.toBeInTheDocument();
  });

  it('renders the "unnamedBudgetLine" key when description is falsy', () => {
    renderModal({
      step: 2,
      budgetLines: [
        {
          id: 'wib-1',
          description: '',
          plannedAmount: 100,
          workItemId: 'wi-1',
          budgetCategory: null,
        },
      ] as any,
      showCreateForm: false,
      isLoading: false,
    });

    expect(
      screen.getByText('invoiceDetail.budgetLines.picker.unnamedBudgetLine'),
    ).toBeInTheDocument();
  });

  it('does not show error banner when error is null', () => {
    renderModal({
      step: 2,
      error: null,
      budgetLines: [],
      isLoading: false,
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders empty state text only when not loading and no error and no create form', () => {
    renderModal({
      step: 2,
      budgetLines: [],
      showCreateForm: false,
      isLoading: false,
      error: null,
    });

    expect(
      screen.getByText('invoiceDetail.budgetLines.picker.noUnlinkedLines'),
    ).toBeInTheDocument();
  });

  it('does not render empty state when error is set even with no budget lines', () => {
    renderModal({
      step: 2,
      budgetLines: [],
      showCreateForm: false,
      isLoading: false,
      error: 'Server error',
    });

    // Error takes precedence; the empty state condition requires !pickerState.error
    expect(
      screen.queryByText('invoiceDetail.budgetLines.picker.noUnlinkedLines'),
    ).not.toBeInTheDocument();
  });

  // ─── Coverage: ParentPicker onChange fires handleSelectItem (lines 50-51) ─────

  it('ParentPicker onChange calls handleSelectItem with id and type', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleSelectItem = jest.fn<any>().mockResolvedValue(undefined);
    renderModal({ step: 1 }, { handleSelectItem });

    // Verify the ParentPicker mock captured the onChange callback
    expect(capturedParentPickerOnChange).not.toBeNull();

    // Invoke the captured onChange to exercise the component's async wrapper (lines 50-51)
    await act(async () => {
      await capturedParentPickerOnChange!('work_item', 'wi-42');
    });

    // The component's onChange calls handleSelectItem(id, type) — note the argument order
    // The component has: onChange={async (type, id) => { await handleSelectItem(id, type); }}
    expect(handleSelectItem).toHaveBeenCalledTimes(1);
    expect(handleSelectItem).toHaveBeenCalledWith('wi-42', 'work_item');
  });

  it('renders ParentPicker with type fallback to work_item when pickerState.type is null (line 48 ?? branch)', () => {
    renderModal({ step: 1, type: null });
    const picker = screen.getByTestId('parent-picker');
    // The fallback renders selectedType as 'work_item' (null ?? 'work_item')
    expect(picker.getAttribute('data-selected-type')).toBe('work_item');
  });

  // ─── Coverage: create form with household_item type (line 101-103: type !== 'work_item') ─

  it('renders BudgetLineForm with budgetCategories=undefined when type is household_item', () => {
    // Line 100-104: pickerState.type === 'work_item' ? categories : undefined
    // When type is 'household_item', budgetCategories prop is undefined (not passed)
    renderModal({
      step: 2,
      type: 'household_item',
      showCreateForm: true,
      createForm: { description: 'HI line', plannedAmount: '100' } as any,
      budgetLines: [],
      isLoading: false,
    });
    // The mock BudgetLineForm renders when showCreateForm is true
    expect(screen.getByTestId('budget-line-form')).toBeInTheDocument();
  });

  it('create form renders when createError is null (createError ?? null branch)', () => {
    // Line 94: error={pickerState.createError ?? null} — null falls through to null
    renderModal({
      step: 2,
      type: 'work_item',
      showCreateForm: true,
      createForm: { description: 'New line', plannedAmount: '200' } as any,
      budgetLines: [],
      isLoading: false,
      createError: null,
    });
    expect(screen.getByTestId('budget-line-form')).toBeInTheDocument();
  });

  it('create form renders when createError has a value (non-null path)', () => {
    // Line 94: error={pickerState.createError ?? null} — non-null uses the value
    renderModal({
      step: 2,
      type: 'work_item',
      showCreateForm: true,
      createForm: { description: 'New line', plannedAmount: '200' } as any,
      budgetLines: [],
      isLoading: false,
      createError: 'Budget line creation failed',
    });
    expect(screen.getByTestId('budget-line-form')).toBeInTheDocument();
  });

  it('ParentPicker renders with actual itemId when pickerState.itemId is non-null', () => {
    // Line 49: selectedId={pickerState.itemId ?? null} — non-null path (uses the value directly)
    renderModal({ step: 1, type: 'work_item', itemId: 'wi-123' });
    // ParentPicker renders; this exercises the non-null path of itemId ?? null
    expect(screen.getByTestId('parent-picker')).toBeInTheDocument();
  });

  it('create form renders with budgetSources from pickerState when non-null', () => {
    // Lines 98-99: budgetSources ?? [] and vendors ?? [] — non-null paths
    renderModal({
      step: 2,
      type: 'work_item',
      showCreateForm: true,
      createForm: { description: 'Line with sources', plannedAmount: '300' } as any,
      budgetLines: [],
      isLoading: false,
      budgetSources: [{ id: 'src-1', name: 'Main Fund' }] as any,
      vendors: [{ id: 'v-1', name: 'Builder Corp' }] as any,
    });
    expect(screen.getByTestId('budget-line-form')).toBeInTheDocument();
  });

  it('create form renders with categories from pickerState when non-null (work_item type)', () => {
    // Line 102: pickerState.categories ?? [] — non-null path when categories is provided
    renderModal({
      step: 2,
      type: 'work_item',
      showCreateForm: true,
      createForm: { description: 'Line with categories', plannedAmount: '400' } as any,
      budgetLines: [],
      isLoading: false,
      categories: [{ id: 'bc-1', name: 'Tiles' }] as any,
    });
    expect(screen.getByTestId('budget-line-form')).toBeInTheDocument();
  });

  it('create form renders with isCreatingBudgetLine=true (isSaving=true non-false branch)', () => {
    // Line 95: isSaving={pickerState.isCreatingBudgetLine ?? false} — non-false path
    renderModal({
      step: 2,
      type: 'work_item',
      showCreateForm: true,
      createForm: { description: 'Saving line', plannedAmount: '500' } as any,
      budgetLines: [],
      isLoading: false,
      isCreatingBudgetLine: true,
    });
    expect(screen.getByTestId('budget-line-form')).toBeInTheDocument();
  });
});
