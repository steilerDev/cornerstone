import { renderHook, act, waitFor } from '@testing-library/react';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { BaseBudgetLine } from '@cornerstone/shared';

type TestBudgetLine = BaseBudgetLine;

/**
 * Builds a minimal BaseBudgetLine for testing.
 */
const makeLine = (overrides: Partial<TestBudgetLine> = {}): TestBudgetLine => ({
  id: 'bl-1',
  description: 'Test line',
  plannedAmount: 1000,
  confidence: 'own_estimate',
  confidenceMargin: 0.2,
  budgetCategory: null,
  budgetSource: null,
  vendor: null,
  actualCost: 0,
  actualCostPaid: 0,
  invoiceCount: 0,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

// ─── Mock API and reload callbacks ────────────────────────────────────────────

const mockFetchBudgets = jest.fn<() => Promise<TestBudgetLine[]>>();
const mockCreateBudget = jest.fn<() => Promise<TestBudgetLine>>();
const mockUpdateBudget = jest.fn<() => Promise<TestBudgetLine>>();
const mockDeleteBudget = jest.fn<() => Promise<void>>();
const mockReloadBudgetLines = jest.fn<() => Promise<void>>();
const mockReloadSubsidyPayback = jest.fn<() => Promise<void>>();
const mockToFormState = jest.fn<
  (line: TestBudgetLine) => import('../hooks/useBudgetSection.js').BudgetLineFormState
>();
const mockToPayload = jest.fn<() => import('@cornerstone/shared').CreateBudgetLineRequest>();

import type * as UseBudgetSectionModule from './useBudgetSection.js';

let useBudgetSection: (typeof UseBudgetSectionModule)['useBudgetSection'];

beforeEach(async () => {
  ({ useBudgetSection } = (await import('./useBudgetSection.js')) as typeof UseBudgetSectionModule);

  mockFetchBudgets.mockReset().mockResolvedValue([]);
  mockCreateBudget.mockReset().mockResolvedValue(makeLine({ id: 'bl-new' }));
  mockUpdateBudget.mockReset().mockResolvedValue(makeLine({ id: 'bl-1' }));
  mockDeleteBudget.mockReset().mockResolvedValue(undefined);
  mockReloadBudgetLines.mockReset().mockResolvedValue(undefined);
  mockReloadSubsidyPayback.mockReset().mockResolvedValue(undefined);
  mockToFormState.mockReset().mockReturnValue({
    description: 'Mocked',
    plannedAmount: '1000',
    confidence: 'own_estimate',
    budgetCategoryId: '',
    budgetSourceId: '',
    vendorId: '',
  });
  mockToPayload.mockReset().mockReturnValue({ plannedAmount: 1000 });
});

/**
 * Returns standard options for the useBudgetSection hook.
 * Individual tests can override specific callbacks.
 */
function makeOptions(
  overrides: Partial<Parameters<typeof useBudgetSection<TestBudgetLine>>[0]> = {},
): Parameters<typeof useBudgetSection<TestBudgetLine>>[0] {
  return {
    api: {
      fetchBudgets: mockFetchBudgets,
      createBudget:
        mockCreateBudget as Parameters<
          typeof useBudgetSection<TestBudgetLine>
        >[0]['api']['createBudget'],
      updateBudget:
        mockUpdateBudget as Parameters<
          typeof useBudgetSection<TestBudgetLine>
        >[0]['api']['updateBudget'],
      deleteBudget: mockDeleteBudget,
    },
    reloadBudgetLines: mockReloadBudgetLines,
    reloadSubsidyPayback: mockReloadSubsidyPayback,
    toFormState:
      mockToFormState as Parameters<typeof useBudgetSection<TestBudgetLine>>[0]['toFormState'],
    toPayload:
      mockToPayload as Parameters<typeof useBudgetSection<TestBudgetLine>>[0]['toPayload'],
    entityId: 'entity-1',
    ...overrides,
  };
}

/**
 * Creates a synthetic FormEvent-like object accepted by handleSaveBudgetLine.
 */
function makeFormEvent() {
  return { preventDefault: jest.fn() } as unknown as React.FormEvent;
}

// ─── Initial state ────────────────────────────────────────────────────────────

describe('useBudgetSection — initial state', () => {
  it('showBudgetForm is false initially', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    expect(result.current.showBudgetForm).toBe(false);
  });

  it('editingBudgetId is null initially', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    expect(result.current.editingBudgetId).toBeNull();
  });

  it('isSavingBudget is false initially', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    expect(result.current.isSavingBudget).toBe(false);
  });

  it('budgetFormError is null initially', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    expect(result.current.budgetFormError).toBeNull();
  });

  it('deletingBudgetId is null initially', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    expect(result.current.deletingBudgetId).toBeNull();
  });

  it('budgetForm has the correct empty defaults', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    expect(result.current.budgetForm).toEqual({
      description: '',
      plannedAmount: '',
      confidence: 'own_estimate',
      budgetCategoryId: '',
      budgetSourceId: '',
      vendorId: '',
    });
  });
});

// ─── openAddBudgetForm ────────────────────────────────────────────────────────

describe('openAddBudgetForm', () => {
  it('sets showBudgetForm=true', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openAddBudgetForm();
    });

    expect(result.current.showBudgetForm).toBe(true);
  });

  it('sets editingBudgetId=null', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openAddBudgetForm();
    });

    expect(result.current.editingBudgetId).toBeNull();
  });

  it('resets the budget form to empty state', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    // First open edit form to populate state, then switch to add
    act(() => {
      result.current.openEditBudgetForm(makeLine());
    });
    act(() => {
      result.current.openAddBudgetForm();
    });

    expect(result.current.budgetForm).toEqual({
      description: '',
      plannedAmount: '',
      confidence: 'own_estimate',
      budgetCategoryId: '',
      budgetSourceId: '',
      vendorId: '',
    });
  });

  it('clears budgetFormError', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openAddBudgetForm();
    });

    expect(result.current.budgetFormError).toBeNull();
  });
});

// ─── openEditBudgetForm ───────────────────────────────────────────────────────

describe('openEditBudgetForm', () => {
  it('sets showBudgetForm=true', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openEditBudgetForm(makeLine({ id: 'bl-42' }));
    });

    expect(result.current.showBudgetForm).toBe(true);
  });

  it('sets editingBudgetId to the line id', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openEditBudgetForm(makeLine({ id: 'bl-42' }));
    });

    expect(result.current.editingBudgetId).toBe('bl-42');
  });

  it('populates budgetForm via the toFormState callback', () => {
    mockToFormState.mockReturnValueOnce({
      description: 'Flooring',
      plannedAmount: '2500',
      confidence: 'professional_estimate',
      budgetCategoryId: 'cat-1',
      budgetSourceId: 'src-1',
      vendorId: 'v-1',
    });

    const { result } = renderHook(() => useBudgetSection(makeOptions()));
    const line = makeLine({ id: 'bl-42', plannedAmount: 2500, description: 'Flooring' });

    act(() => {
      result.current.openEditBudgetForm(line);
    });

    expect(mockToFormState).toHaveBeenCalledWith(line);
    expect(result.current.budgetForm.description).toBe('Flooring');
    expect(result.current.budgetForm.plannedAmount).toBe('2500');
    expect(result.current.budgetForm.confidence).toBe('professional_estimate');
  });

  it('clears budgetFormError when opening edit form', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openEditBudgetForm(makeLine());
    });

    expect(result.current.budgetFormError).toBeNull();
  });
});

// ─── closeBudgetForm ──────────────────────────────────────────────────────────

describe('closeBudgetForm', () => {
  it('sets showBudgetForm=false', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openAddBudgetForm();
    });
    act(() => {
      result.current.closeBudgetForm();
    });

    expect(result.current.showBudgetForm).toBe(false);
  });

  it('resets editingBudgetId to null', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openEditBudgetForm(makeLine({ id: 'bl-42' }));
    });
    act(() => {
      result.current.closeBudgetForm();
    });

    expect(result.current.editingBudgetId).toBeNull();
  });

  it('resets budgetForm to empty state', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openEditBudgetForm(makeLine());
    });
    act(() => {
      result.current.closeBudgetForm();
    });

    expect(result.current.budgetForm).toEqual({
      description: '',
      plannedAmount: '',
      confidence: 'own_estimate',
      budgetCategoryId: '',
      budgetSourceId: '',
      vendorId: '',
    });
  });

  it('clears budgetFormError', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.closeBudgetForm();
    });

    expect(result.current.budgetFormError).toBeNull();
  });
});

// ─── setBudgetForm ────────────────────────────────────────────────────────────

describe('setBudgetForm', () => {
  it('merges partial updates into current form state', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.setBudgetForm({ description: 'Updated description' });
    });

    expect(result.current.budgetForm.description).toBe('Updated description');
    // Other fields should remain at their defaults
    expect(result.current.budgetForm.plannedAmount).toBe('');
    expect(result.current.budgetForm.confidence).toBe('own_estimate');
  });

  it('can update multiple fields at once', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.setBudgetForm({
        plannedAmount: '5000',
        confidence: 'quote',
        vendorId: 'v-99',
      });
    });

    expect(result.current.budgetForm.plannedAmount).toBe('5000');
    expect(result.current.budgetForm.confidence).toBe('quote');
    expect(result.current.budgetForm.vendorId).toBe('v-99');
  });

  it('can replace the entire form state with a complete BudgetLineFormState', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    const newState = {
      description: 'Full replacement',
      plannedAmount: '9999',
      confidence: 'invoice' as const,
      budgetCategoryId: 'cat-2',
      budgetSourceId: 'src-2',
      vendorId: 'v-2',
    };

    act(() => {
      result.current.setBudgetForm(newState);
    });

    expect(result.current.budgetForm).toEqual(newState);
  });
});

// ─── setDeletingBudgetId ──────────────────────────────────────────────────────

describe('setDeletingBudgetId', () => {
  it('sets deletingBudgetId to the provided id', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.setDeletingBudgetId('bl-to-delete');
    });

    expect(result.current.deletingBudgetId).toBe('bl-to-delete');
  });

  it('can clear deletingBudgetId back to null', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.setDeletingBudgetId('bl-to-delete');
    });
    act(() => {
      result.current.setDeletingBudgetId(null);
    });

    expect(result.current.deletingBudgetId).toBeNull();
  });
});

// ─── handleSaveBudgetLine ─────────────────────────────────────────────────────

describe('handleSaveBudgetLine', () => {
  it('sets budgetFormError when plannedAmount is not a number (empty string)', async () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    // Default form has empty plannedAmount — parseFloat('') returns NaN
    act(() => {
      result.current.openAddBudgetForm();
    });

    await act(async () => {
      await result.current.handleSaveBudgetLine(makeFormEvent());
    });

    expect(result.current.budgetFormError).toBe(
      'Planned amount must be a valid non-negative number.',
    );
  });

  it('sets budgetFormError when plannedAmount is negative', async () => {
    mockToFormState.mockReturnValueOnce({
      description: '',
      plannedAmount: '-100',
      confidence: 'own_estimate',
      budgetCategoryId: '',
      budgetSourceId: '',
      vendorId: '',
    });

    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openEditBudgetForm(makeLine());
    });

    await act(async () => {
      await result.current.handleSaveBudgetLine(makeFormEvent());
    });

    expect(result.current.budgetFormError).toBe(
      'Planned amount must be a valid non-negative number.',
    );
  });

  it('does not call any API when validation fails', async () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openAddBudgetForm();
    });

    await act(async () => {
      await result.current.handleSaveBudgetLine(makeFormEvent());
    });

    expect(mockCreateBudget).not.toHaveBeenCalled();
    expect(mockUpdateBudget).not.toHaveBeenCalled();
  });

  it('calls api.updateBudget when in edit mode (editingBudgetId set)', async () => {
    mockToFormState.mockReturnValue({
      description: 'Updated',
      plannedAmount: '1500',
      confidence: 'professional_estimate',
      budgetCategoryId: 'cat-1',
      budgetSourceId: '',
      vendorId: '',
    });
    mockToPayload.mockReturnValue({ plannedAmount: 1500, description: 'Updated' });

    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openEditBudgetForm(makeLine({ id: 'bl-existing' }));
    });

    await act(async () => {
      await result.current.handleSaveBudgetLine(makeFormEvent());
    });

    expect(mockUpdateBudget).toHaveBeenCalledWith('entity-1', 'bl-existing', expect.any(Object));
    expect(mockCreateBudget).not.toHaveBeenCalled();
  });

  it('closes form after successful update', async () => {
    mockToFormState.mockReturnValue({
      description: 'Updated',
      plannedAmount: '1500',
      confidence: 'professional_estimate',
      budgetCategoryId: '',
      budgetSourceId: '',
      vendorId: '',
    });

    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openEditBudgetForm(makeLine({ id: 'bl-existing' }));
    });

    await act(async () => {
      await result.current.handleSaveBudgetLine(makeFormEvent());
    });

    await waitFor(() => {
      expect(result.current.showBudgetForm).toBe(false);
    });
    expect(result.current.editingBudgetId).toBeNull();
  });

  it('triggers reloadBudgetLines and reloadSubsidyPayback after successful save', async () => {
    mockToFormState.mockReturnValue({
      description: '',
      plannedAmount: '1000',
      confidence: 'invoice',
      budgetCategoryId: '',
      budgetSourceId: '',
      vendorId: '',
    });

    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openEditBudgetForm(makeLine({ id: 'bl-1' }));
    });

    await act(async () => {
      await result.current.handleSaveBudgetLine(makeFormEvent());
    });

    expect(mockReloadBudgetLines).toHaveBeenCalled();
    expect(mockReloadSubsidyPayback).toHaveBeenCalled();
  });

  it('sets budgetFormError on API error and keeps form open', async () => {
    mockToFormState.mockReturnValue({
      description: 'Updated',
      plannedAmount: '1500',
      confidence: 'professional_estimate',
      budgetCategoryId: '',
      budgetSourceId: '',
      vendorId: '',
    });
    mockUpdateBudget.mockRejectedValueOnce(new Error('Server rejected the request'));

    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openEditBudgetForm(makeLine({ id: 'bl-existing' }));
    });

    await act(async () => {
      await result.current.handleSaveBudgetLine(makeFormEvent());
    });

    expect(result.current.budgetFormError).toBe('Server rejected the request');
    expect(result.current.showBudgetForm).toBe(true);
  });

  it('falls back to a generic error message when API error has no message', async () => {
    mockToFormState.mockReturnValue({
      description: '',
      plannedAmount: '1000',
      confidence: 'invoice',
      budgetCategoryId: '',
      budgetSourceId: '',
      vendorId: '',
    });
    mockUpdateBudget.mockRejectedValueOnce({ statusCode: 500 }); // no message

    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openEditBudgetForm(makeLine({ id: 'bl-existing' }));
    });

    await act(async () => {
      await result.current.handleSaveBudgetLine(makeFormEvent());
    });

    expect(result.current.budgetFormError).toBe('Failed to save budget line. Please try again.');
  });

  it('resets isSavingBudget to false after successful save', async () => {
    mockToFormState.mockReturnValue({
      description: '',
      plannedAmount: '1000',
      confidence: 'invoice',
      budgetCategoryId: '',
      budgetSourceId: '',
      vendorId: '',
    });

    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openEditBudgetForm(makeLine({ id: 'bl-1' }));
    });

    await act(async () => {
      await result.current.handleSaveBudgetLine(makeFormEvent());
    });

    expect(result.current.isSavingBudget).toBe(false);
  });

  it('resets isSavingBudget to false after failed save', async () => {
    mockToFormState.mockReturnValue({
      description: '',
      plannedAmount: '1000',
      confidence: 'invoice',
      budgetCategoryId: '',
      budgetSourceId: '',
      vendorId: '',
    });
    mockUpdateBudget.mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.openEditBudgetForm(makeLine({ id: 'bl-1' }));
    });

    await act(async () => {
      await result.current.handleSaveBudgetLine(makeFormEvent());
    });

    expect(result.current.isSavingBudget).toBe(false);
  });

  it('calls event.preventDefault() before processing', async () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    const event = makeFormEvent();

    await act(async () => {
      await result.current.handleSaveBudgetLine(event);
    });

    expect((event as { preventDefault: jest.Mock }).preventDefault).toHaveBeenCalled();
  });
});

// ─── handleDeleteBudgetLine ───────────────────────────────────────────────────

describe('handleDeleteBudgetLine', () => {
  it('sets deletingBudgetId to the provided budgetId', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.handleDeleteBudgetLine('bl-to-delete');
    });

    expect(result.current.deletingBudgetId).toBe('bl-to-delete');
  });

  it('does not call api.deleteBudget immediately', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.handleDeleteBudgetLine('bl-to-delete');
    });

    expect(mockDeleteBudget).not.toHaveBeenCalled();
  });
});

// ─── confirmDeleteBudgetLine ──────────────────────────────────────────────────

describe('confirmDeleteBudgetLine', () => {
  it('calls api.deleteBudget with entityId and deletingBudgetId', async () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.handleDeleteBudgetLine('bl-to-delete');
    });

    await act(async () => {
      await result.current.confirmDeleteBudgetLine();
    });

    expect(mockDeleteBudget).toHaveBeenCalledWith('entity-1', 'bl-to-delete');
  });

  it('resets deletingBudgetId to null on success', async () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.handleDeleteBudgetLine('bl-to-delete');
    });

    await act(async () => {
      await result.current.confirmDeleteBudgetLine();
    });

    expect(result.current.deletingBudgetId).toBeNull();
  });

  it('triggers reloadBudgetLines and reloadSubsidyPayback on success', async () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.handleDeleteBudgetLine('bl-to-delete');
    });

    await act(async () => {
      await result.current.confirmDeleteBudgetLine();
    });

    expect(mockReloadBudgetLines).toHaveBeenCalled();
    expect(mockReloadSubsidyPayback).toHaveBeenCalled();
  });

  it('does nothing when deletingBudgetId is null', async () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    // Do NOT set deletingBudgetId via handleDeleteBudgetLine
    await act(async () => {
      await result.current.confirmDeleteBudgetLine();
    });

    expect(mockDeleteBudget).not.toHaveBeenCalled();
    expect(mockReloadBudgetLines).not.toHaveBeenCalled();
  });

  it('resets deletingBudgetId to null on error', async () => {
    mockDeleteBudget.mockRejectedValueOnce({ statusCode: 409, message: 'Budget line in use' });

    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.handleDeleteBudgetLine('bl-conflict');
    });

    await act(async () => {
      try {
        await result.current.confirmDeleteBudgetLine();
      } catch {
        // expected
      }
    });

    expect(result.current.deletingBudgetId).toBeNull();
  });

  it('throws an error with the API message on 409 conflict', async () => {
    mockDeleteBudget.mockRejectedValueOnce({
      statusCode: 409,
      message: 'Budget line is linked to an invoice',
    });

    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.handleDeleteBudgetLine('bl-conflict');
    });

    let thrownError: unknown;
    await act(async () => {
      try {
        await result.current.confirmDeleteBudgetLine();
      } catch (err) {
        thrownError = err;
      }
    });

    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toBe('Budget line is linked to an invoice');
  });

  it('throws a fallback 409 message when API 409 has no message', async () => {
    mockDeleteBudget.mockRejectedValueOnce({ statusCode: 409 }); // no message

    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.handleDeleteBudgetLine('bl-conflict');
    });

    let thrownError: unknown;
    await act(async () => {
      try {
        await result.current.confirmDeleteBudgetLine();
      } catch (err) {
        thrownError = err;
      }
    });

    expect((thrownError as Error).message).toBe(
      'Budget line cannot be deleted because it is in use',
    );
  });

  it('throws a generic message on non-409 error', async () => {
    mockDeleteBudget.mockRejectedValueOnce({ statusCode: 500, message: 'Internal server error' });

    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.handleDeleteBudgetLine('bl-to-delete');
    });

    let thrownError: unknown;
    await act(async () => {
      try {
        await result.current.confirmDeleteBudgetLine();
      } catch (err) {
        thrownError = err;
      }
    });

    expect((thrownError as Error).message).toBe('Failed to delete budget line');
  });
});

// Need React import for FormEvent type reference in the test
import React from 'react';
void React; // Prevent unused import lint warning
