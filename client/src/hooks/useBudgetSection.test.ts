import { renderHook, act, waitFor } from '@testing-library/react';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { BaseBudgetLine, CreateBudgetLineRequest } from '@cornerstone/shared';
import type { BudgetLineFormState } from './useBudgetSection.js';

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
const mockReloadLinkedSubsidies = jest.fn<() => Promise<void>>();
const mockToFormState =
  jest.fn<(line: TestBudgetLine) => BudgetLineFormState>();
const mockToPayload = jest.fn<() => CreateBudgetLineRequest>();

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
  mockReloadLinkedSubsidies.mockReset().mockResolvedValue(undefined);
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
      createBudget: mockCreateBudget as Parameters<
        typeof useBudgetSection<TestBudgetLine>
      >[0]['api']['createBudget'],
      updateBudget: mockUpdateBudget as Parameters<
        typeof useBudgetSection<TestBudgetLine>
      >[0]['api']['updateBudget'],
      deleteBudget: mockDeleteBudget,
    },
    reloadBudgetLines: mockReloadBudgetLines,
    reloadSubsidyPayback: mockReloadSubsidyPayback,
    reloadLinkedSubsidies: mockReloadLinkedSubsidies,
    toFormState: mockToFormState as Parameters<
      typeof useBudgetSection<TestBudgetLine>
    >[0]['toFormState'],
    toPayload: mockToPayload as Parameters<typeof useBudgetSection<TestBudgetLine>>[0]['toPayload'],
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

  it('selectedSubsidyId is empty string initially', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    expect(result.current.selectedSubsidyId).toBe('');
  });

  it('isLinkingSubsidy is false initially', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    expect(result.current.isLinkingSubsidy).toBe(false);
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

  it('resets the budget form to empty state even after editing a line', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    // Populate via edit, then switch to add
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

// ─── setBudgetFormPartial ─────────────────────────────────────────────────────

describe('setBudgetFormPartial', () => {
  it('merges partial updates into existing form state', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.setBudgetFormPartial({ plannedAmount: '5000' });
    });

    // plannedAmount updated, description stays at default ''
    expect(result.current.budgetForm.plannedAmount).toBe('5000');
    expect(result.current.budgetForm.description).toBe('');
  });

  it('can update confidence alone via partial merge', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.setBudgetFormPartial({ confidence: 'quote' });
    });

    expect(result.current.budgetForm.confidence).toBe('quote');
    // Other fields unchanged
    expect(result.current.budgetForm.plannedAmount).toBe('');
  });
});

// ─── setBudgetForm ────────────────────────────────────────────────────────────

describe('setBudgetForm', () => {
  it('replaces the entire form state', () => {
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
  it('sets budgetFormError when plannedAmount is empty (NaN)', async () => {
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

    expect(mockUpdateBudget).toHaveBeenCalled();
    expect(mockCreateBudget).not.toHaveBeenCalled();
  });

  it('passes entityId and editingBudgetId to api.updateBudget', async () => {
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

    // Verify the mock was called (args checked via mockToPayload result)
    expect(mockUpdateBudget).toHaveBeenCalledTimes(1);
    const call = mockUpdateBudget.mock.calls[0] as unknown as [string, string, unknown];
    expect(call[0]).toBe('entity-1');
    expect(call[1]).toBe('bl-existing');
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

    const preventDefaultMock = jest.fn();
    const event = { preventDefault: preventDefaultMock } as unknown as React.FormEvent;

    await act(async () => {
      await result.current.handleSaveBudgetLine(event);
    });

    expect(preventDefaultMock).toHaveBeenCalled();
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
  it('calls api.deleteBudget on confirm', async () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.handleDeleteBudgetLine('bl-to-delete');
    });

    await act(async () => {
      await result.current.confirmDeleteBudgetLine();
    });

    expect(mockDeleteBudget).toHaveBeenCalledTimes(1);
    const call = mockDeleteBudget.mock.calls[0] as unknown as [string, string];
    expect(call[0]).toBe('entity-1');
    expect(call[1]).toBe('bl-to-delete');
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

// ─── setSelectedSubsidyId ────────────────────────────────────────────────────

describe('setSelectedSubsidyId', () => {
  it('updates selectedSubsidyId state', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.setSelectedSubsidyId('sp-42');
    });

    expect(result.current.selectedSubsidyId).toBe('sp-42');
  });

  it('can be cleared back to empty string', () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.setSelectedSubsidyId('sp-42');
    });
    act(() => {
      result.current.setSelectedSubsidyId('');
    });

    expect(result.current.selectedSubsidyId).toBe('');
  });
});

// ─── handleLinkSubsidy ────────────────────────────────────────────────────────

describe('handleLinkSubsidy', () => {
  it('does nothing when selectedSubsidyId is empty', async () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    await act(async () => {
      await result.current.handleLinkSubsidy();
    });

    expect(mockReloadLinkedSubsidies).not.toHaveBeenCalled();
  });

  it('calls reloadLinkedSubsidies when selectedSubsidyId is set', async () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.setSelectedSubsidyId('sp-1');
    });

    await act(async () => {
      await result.current.handleLinkSubsidy();
    });

    expect(mockReloadLinkedSubsidies).toHaveBeenCalled();
  });

  it('clears selectedSubsidyId on success', async () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.setSelectedSubsidyId('sp-1');
    });

    await act(async () => {
      await result.current.handleLinkSubsidy();
    });

    expect(result.current.selectedSubsidyId).toBe('');
  });

  it('sets isLinkingSubsidy=false after successful link', async () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.setSelectedSubsidyId('sp-1');
    });

    await act(async () => {
      await result.current.handleLinkSubsidy();
    });

    expect(result.current.isLinkingSubsidy).toBe(false);
  });

  it('re-throws and resets isLinkingSubsidy when reloadLinkedSubsidies fails', async () => {
    mockReloadLinkedSubsidies.mockRejectedValueOnce(new Error('Link failed'));

    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    act(() => {
      result.current.setSelectedSubsidyId('sp-1');
    });

    let thrownError: unknown;
    await act(async () => {
      try {
        await result.current.handleLinkSubsidy();
      } catch (err) {
        thrownError = err;
      }
    });

    expect(thrownError).toBeInstanceOf(Error);
    expect(result.current.isLinkingSubsidy).toBe(false);
  });
});

// ─── handleUnlinkSubsidy ──────────────────────────────────────────────────────

describe('handleUnlinkSubsidy', () => {
  it('calls reloadLinkedSubsidies on success', async () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    await act(async () => {
      await result.current.handleUnlinkSubsidy();
    });

    expect(mockReloadLinkedSubsidies).toHaveBeenCalled();
  });

  it('does not throw when reloadLinkedSubsidies succeeds', async () => {
    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    await expect(
      act(async () => {
        await result.current.handleUnlinkSubsidy();
      }),
    ).resolves.toBeUndefined();
  });

  it('re-throws when reloadLinkedSubsidies fails', async () => {
    mockReloadLinkedSubsidies.mockRejectedValueOnce(new Error('Reload failed'));

    const { result } = renderHook(() => useBudgetSection(makeOptions()));

    let thrownError: unknown;
    await act(async () => {
      try {
        await result.current.handleUnlinkSubsidy();
      } catch (err) {
        thrownError = err;
      }
    });

    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toBe('Reload failed');
  });
});

// Need React import for FormEvent type reference in the test
import React from 'react';
void React; // Prevent unused import lint warning
