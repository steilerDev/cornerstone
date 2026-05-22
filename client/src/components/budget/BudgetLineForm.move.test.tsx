/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { BudgetLineFormProps } from './BudgetLineForm.js';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';

// ─── Mocks: WorkItemPicker and HouseholdItemPicker ────────────────────────────
// Use jest.mock (CJS synchronous form) so mocks intercept in both local and CI environments.
// Per MEMORY.md: jest.mock (CJS) works for child component mocks where jest.unstable_mockModule fails.

let capturedWorkItemPickerOnChange: ((id: string) => void) | null = null;
let capturedHouseholdItemPickerOnChange: ((id: string) => void) | null = null;

jest.mock('../WorkItemPicker/WorkItemPicker.js', () => ({
  WorkItemPicker: (props: { value: string; onChange: (id: string) => void; placeholder?: string; excludeIds?: string[]; showItemsOnFocus?: boolean }) => {
    capturedWorkItemPickerOnChange = props.onChange;
    return React.createElement('div', {
      'data-testid': 'work-item-picker',
      'data-value': props.value,
    });
  },
}));

jest.mock('../HouseholdItemPicker/HouseholdItemPicker.js', () => ({
  HouseholdItemPicker: (props: { value: string; onChange: (id: string) => void; placeholder?: string; excludeIds?: string[]; showItemsOnFocus?: boolean }) => {
    capturedHouseholdItemPickerOnChange = props.onChange;
    return React.createElement('div', {
      'data-testid': 'household-item-picker',
      'data-value': props.value,
    });
  },
}));

// ─── Dynamic import ───────────────────────────────────────────────────────────

let BudgetLineForm: (typeof import('./BudgetLineForm.js'))['BudgetLineForm'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildForm(overrides?: Partial<BudgetLineFormState>): BudgetLineFormState {
  return {
    description: '',
    plannedAmount: '500',
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

const CONFIDENCE_LABELS = {
  own_estimate: 'Own Estimate (±20%)',
  professional_estimate: 'Professional Estimate (±10%)',
  quote: 'Quote (±5%)',
  invoice: 'Invoice (±0%)',
} as const;

function buildBaseProps(overrides?: Partial<BudgetLineFormProps>): BudgetLineFormProps {
  return {
    form: buildForm(),
    onSubmit: jest.fn(),
    onFormChange: jest.fn(),
    onCancel: jest.fn(),
    error: null,
    isSaving: false,
    isEditing: true,
    confidenceLabels: CONFIDENCE_LABELS,
    budgetSources: [],
    vendors: [],
    ...overrides,
  };
}

beforeEach(async () => {
  capturedWorkItemPickerOnChange = null;
  capturedHouseholdItemPickerOnChange = null;
  ({ BudgetLineForm } = await import('./BudgetLineForm.js'));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BudgetLineForm — parent picker (edit-move affordance)', () => {
  // Helper: get the "Change" ghost button (aria-controls="parent-picker-body")
  function getChangeButton() {
    return screen.getByRole('button', { name: /^Change$/i });
  }

  // Scenario 1: Collapsed state when currentParentType is provided
  it('renders collapsed parent row with entity type pill, label, and "Change" button when currentParentId and onMove provided', () => {
    const onMove = jest.fn<(...args: any[]) => any>();
    const props = buildBaseProps({
      currentParentType: 'work_item',
      currentParentId: 'wi-1',
      currentParentLabel: 'Test WI',
      onMove,
    });

    render(React.createElement(BudgetLineForm, props));

    // Should show the entity type tab label text (Work Item pill).
    // The render-both pattern means "Work Item" text appears in both the collapsed
    // entityTypePill (a <span>) and the always-rendered expanded tab button (<button hidden>).
    // Use getAllByText to handle multiple matches and verify the pill exists.
    const workItemElements = screen.getAllByText('Work Item');
    expect(workItemElements.some((el) => el.tagName === 'SPAN')).toBe(true);
    // Should show the current parent label
    expect(screen.getByText('Test WI')).toBeInTheDocument();
    // Should show the "Change" button (exact match to avoid matching "Save Changes")
    expect(getChangeButton()).toBeInTheDocument();
    // The render-both pattern means the expanded picker body is always in the DOM
    // but hidden via the HTML `hidden` attribute when collapsed. Verify it's hidden.
    expect(document.getElementById('parent-picker-body')).toHaveAttribute('hidden');
  });

  // Scenario 2: Expanding the picker with "Change" click
  it('clicking "Change" expands the picker with type tabs; Work Item tab active by default for WI parent', () => {
    const onMove = jest.fn<(...args: any[]) => any>();
    const props = buildBaseProps({
      currentParentType: 'work_item',
      currentParentId: 'wi-1',
      currentParentLabel: 'Test WI',
      onMove,
    });

    render(React.createElement(BudgetLineForm, props));

    fireEvent.click(getChangeButton());

    // Pickers should now be visible (Work Item tab active)
    expect(screen.getByTestId('work-item-picker')).toBeInTheDocument();
    // Should show both tabs
    expect(screen.getAllByText('Work Item').some(el => el.tagName === 'BUTTON')).toBe(true);
    expect(screen.getAllByText('Household Item').some(el => el.tagName === 'BUTTON')).toBe(true);
  });

  // Scenario 3: Switching to Household Item tab
  it('switching to "Household Item" tab clears selection and shows HouseholdItemPicker', () => {
    const onMove = jest.fn<(...args: any[]) => any>();
    const props = buildBaseProps({
      currentParentType: 'work_item',
      currentParentId: 'wi-1',
      currentParentLabel: 'Test WI',
      onMove,
    });

    render(React.createElement(BudgetLineForm, props));

    // Expand first
    fireEvent.click(getChangeButton());
    expect(screen.getByTestId('work-item-picker')).toBeInTheDocument();

    // Click HI tab — find button with exact text "Household Item"
    const hiTab = screen.getAllByText('Household Item').find(el => el.tagName === 'BUTTON');
    expect(hiTab).toBeDefined();
    fireEvent.click(hiTab!);

    // HouseholdItemPicker should now be rendered
    expect(screen.getByTestId('household-item-picker')).toBeInTheDocument();
    // WorkItemPicker should be gone
    expect(screen.queryByTestId('work-item-picker')).not.toBeInTheDocument();
  });

  // Scenario 4: moveHint appears for cross-table selection
  it('selecting a different entity type tab from current parent shows moveHint with role="status"', () => {
    const onMove = jest.fn<(...args: any[]) => any>();
    const props = buildBaseProps({
      currentParentType: 'work_item',
      currentParentId: 'wi-1',
      currentParentLabel: 'Test WI',
      onMove,
    });

    render(React.createElement(BudgetLineForm, props));
    fireEvent.click(getChangeButton());

    // Switch to HI tab (different from current WI)
    const hiTab = screen.getAllByText('Household Item').find(el => el.tagName === 'BUTTON');
    fireEvent.click(hiTab!);

    // moveHint should be visible
    const hint = screen.getByRole('status');
    expect(hint).toBeInTheDocument();
  });

  // Scenario 5: No moveHint when same entity type selected
  it('no moveHint when selected tab matches current parent type', () => {
    const onMove = jest.fn<(...args: any[]) => any>();
    const props = buildBaseProps({
      currentParentType: 'work_item',
      currentParentId: 'wi-1',
      currentParentLabel: 'Test WI',
      onMove,
    });

    render(React.createElement(BudgetLineForm, props));
    fireEvent.click(getChangeButton());

    // Work Item tab is already active — no cross-table hint
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  // Scenario 6: "Move" button disabled when no selection, enabled when selection made
  it('"Move to selected item" button is disabled when no picker selection; enabled when selection made', async () => {
    const onMove = jest.fn<(...args: any[]) => any>();
    const props = buildBaseProps({
      currentParentType: 'work_item',
      currentParentId: 'wi-1',
      currentParentLabel: 'Test WI',
      onMove,
    });

    render(React.createElement(BudgetLineForm, props));
    fireEvent.click(getChangeButton());

    const moveButton = screen.getByRole('button', { name: /Move to selected item/i });
    expect(moveButton).toBeDisabled();

    // Simulate picker selection
    act(() => {
      capturedWorkItemPickerOnChange!('wi-2');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Move to selected item/i })).not.toBeDisabled();
    });
  });

  // Scenario 7: "Cancel" in expanded state collapses back
  it('clicking "Cancel" in expanded state collapses back to current parent row', () => {
    const onMove = jest.fn<(...args: any[]) => any>();
    const props = buildBaseProps({
      currentParentType: 'work_item',
      currentParentId: 'wi-1',
      currentParentLabel: 'Test WI',
      onMove,
    });

    render(React.createElement(BudgetLineForm, props));
    fireEvent.click(getChangeButton());

    // Expanded: picker visible
    expect(screen.getByTestId('work-item-picker')).toBeInTheDocument();

    // The expanded picker has a "Cancel" button with class ghostCancelButton
    // It appears before the form's Cancel button (which is further down)
    // Both have role=button name="Cancel" — click the one inside parent-picker-body
    const pickerBody = document.getElementById('parent-picker-body')!;
    const cancelInPicker = Array.from(pickerBody.querySelectorAll('button')).find(
      btn => btn.textContent?.trim() === 'Cancel',
    );
    expect(cancelInPicker).toBeDefined();
    fireEvent.click(cancelInPicker!);

    // After collapse, the expanded picker body is hidden (render-both pattern keeps
    // it in the DOM but marks it hidden via the HTML `hidden` attribute).
    expect(document.getElementById('parent-picker-body')).toHaveAttribute('hidden');
    // The collapsed "Change" button should be visible again.
    expect(getChangeButton()).toBeInTheDocument();
  });

  // Scenario 8: onMove called with correct args when "Move" clicked
  it('onMove called with correct (newParentType, newParentId) when "Move" clicked', async () => {
    const onMove = jest.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
    const props = buildBaseProps({
      currentParentType: 'work_item',
      currentParentId: 'wi-1',
      currentParentLabel: 'Test WI',
      onMove,
    });

    render(React.createElement(BudgetLineForm, props));
    fireEvent.click(getChangeButton());

    // Select wi-2
    act(() => {
      capturedWorkItemPickerOnChange!('wi-2');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Move to selected item/i })).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Move to selected item/i }));
    });

    expect(onMove).toHaveBeenCalledWith('work_item', 'wi-2');
  });

  // Scenario 9: onMove throws → parentPickerError displayed
  it('onMove throws → movePickerError is displayed', async () => {
    const onMove = jest.fn<(...args: any[]) => any>().mockRejectedValue(new Error('Network error'));
    const props = buildBaseProps({
      currentParentType: 'work_item',
      currentParentId: 'wi-1',
      currentParentLabel: 'Test WI',
      onMove,
    });

    render(React.createElement(BudgetLineForm, props));
    fireEvent.click(getChangeButton());

    act(() => {
      capturedWorkItemPickerOnChange!('wi-2');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Move to selected item/i })).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Move to selected item/i }));
    });

    // Production code uses err.message when available, so the mock error's message
    // ("Network error") is displayed directly, not the translation key fallback.
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  // Scenario 10: isUnassigned mode — existing assign frame renders (regression)
  it('isUnassigned mode: renders assign fieldset with WorkItemPicker when isUnassigned and onAssign provided', () => {
    const onAssign = jest.fn<(...args: any[]) => any>();
    const props = buildBaseProps({
      isUnassigned: true,
      onAssign,
      assignBudgetLineId: 'wib-1',
    });

    render(React.createElement(BudgetLineForm, props));

    // Should show the assign fieldset (mocked WorkItemPicker is visible)
    expect(screen.getByTestId('work-item-picker')).toBeInTheDocument();
    // Move affordance should NOT be rendered (no currentParentId/onMove)
    expect(screen.queryByRole('button', { name: /^Change$/i })).not.toBeInTheDocument();
  });

  // Scenario 11: When onMove is not provided, parent picker section not rendered
  it('when onMove not provided, parent picker section not rendered', () => {
    const props = buildBaseProps({
      currentParentType: 'work_item',
      currentParentId: 'wi-1',
      currentParentLabel: 'Test WI',
      // onMove deliberately omitted
    });

    render(React.createElement(BudgetLineForm, props));

    // "Change" parent button should not appear (exact text, not matching "Save Changes")
    expect(screen.queryByRole('button', { name: /^Change$/i })).not.toBeInTheDocument();
    // The expanded picker container (parent-picker-body) should not exist
    expect(document.getElementById('parent-picker-body')).not.toBeInTheDocument();
  });

  // Scenario 12: itemizedAmount prop present — itemized amount field renders
  it('itemizedAmount prop present: itemized amount field renders', () => {
    const props = buildBaseProps({
      itemizedAmount: '250',
      onItemizedAmountChange: jest.fn(),
    });

    render(React.createElement(BudgetLineForm, props));

    const field = screen.getByLabelText(/Itemized Amount/i);
    expect(field).toBeInTheDocument();
    expect((field as HTMLInputElement).value).toBe('250');
  });

  // Scenario 13: itemizedAmount prop absent — itemized amount field not rendered
  it('itemizedAmount prop absent: itemized amount field not rendered', () => {
    const props = buildBaseProps();
    // No itemizedAmount or onItemizedAmountChange

    render(React.createElement(BudgetLineForm, props));

    expect(screen.queryByLabelText(/Itemized Amount/i)).not.toBeInTheDocument();
  });
});
