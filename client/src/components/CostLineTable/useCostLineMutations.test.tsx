/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import type * as MutationsModule from './useCostLineMutations.js';
import type * as ApiClientModule from '../../lib/apiClient.js';
import type { CostLineRow } from './types.js';

const mockDeleteWork = jest.fn<(...a: unknown[]) => Promise<void>>();
const mockDeleteHousehold = jest.fn<(...a: unknown[]) => Promise<void>>();
const mockDeleteInvoiceLine = jest.fn<(...a: unknown[]) => Promise<void>>();

jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  deleteWorkItemBudget: mockDeleteWork,
}));
jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  deleteHouseholdItemBudget: mockDeleteHousehold,
}));
jest.unstable_mockModule('../../lib/invoiceBudgetLinesApi.js', () => ({
  deleteInvoiceBudgetLine: mockDeleteInvoiceLine,
}));

let useCostLineMutations: (typeof MutationsModule)['useCostLineMutations'];
let ApiClientError: (typeof ApiClientModule)['ApiClientError'];
let NetworkError: (typeof ApiClientModule)['NetworkError'];

function makeRow(overrides: Partial<CostLineRow> = {}): CostLineRow {
  return {
    id: 'line-1',
    lineType: 'work_item',
    invoiceBudgetLineId: null,
    invoiceId: null,
    invoiceStatus: null,
    invoiceNumber: null,
    invoiceDate: null,
    invoiceVendorName: null,
    state: 'estimate',
    basis: 'own_estimate',
    margin: 0.2,
    description: 'Tile the hallway',
    quantity: null,
    unit: null,
    unitPrice: null,
    includesVat: false,
    plannedAmount: 100,
    plannedGross: 119,
    gross: 119,
    net: 100,
    estimateDiffers: false,
    target: { type: 'work_item', id: 'task-1', label: 'Tile the hallway' },
    categoryId: null,
    categoryName: null,
    categoryTranslationKey: null,
    budgetSourceId: null,
    budgetSourceName: null,
    vendorId: null,
    vendorName: null,
    ...overrides,
  };
}

beforeEach(async () => {
  jest.resetAllMocks();
  ({ useCostLineMutations } =
    (await import('./useCostLineMutations.js')) as typeof MutationsModule);
  ({ ApiClientError, NetworkError } =
    (await import('../../lib/apiClient.js')) as typeof ApiClientModule);
});

describe('useCostLineMutations', () => {
  it('deletes a task line, then runs afterChange and resolves true', async () => {
    const afterChange = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    mockDeleteWork.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCostLineMutations(afterChange));
    let ok = false;
    await act(async () => {
      ok = await result.current.run('delete', makeRow());
    });
    expect(ok).toBe(true);
    expect(mockDeleteWork).toHaveBeenCalledWith('task-1', 'line-1');
    expect(afterChange).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('deletes a purchase line through the purchase API', async () => {
    mockDeleteHousehold.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCostLineMutations(jest.fn<() => void>()));
    await act(async () => {
      await result.current.run(
        'delete',
        makeRow({
          lineType: 'household_item',
          target: { type: 'household_item', id: 'buy-1', label: 'Oven' },
        }),
      );
    });
    expect(mockDeleteHousehold).toHaveBeenCalledWith('buy-1', 'line-1');
  });

  it('falls back to an empty target id when a deleted line has no target', async () => {
    mockDeleteWork.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCostLineMutations(jest.fn<() => void>()));
    await act(async () => {
      await result.current.run('delete', makeRow({ target: null }));
    });
    expect(mockDeleteWork).toHaveBeenCalledWith('', 'line-1');
    mockDeleteHousehold.mockResolvedValue(undefined);
    await act(async () => {
      await result.current.run('delete', makeRow({ lineType: 'household_item', target: null }));
    });
    expect(mockDeleteHousehold).toHaveBeenCalledWith('', 'line-1');
  });

  it.each(['unlink', 'remove'] as const)('%s removes the line from its invoice', async (kind) => {
    mockDeleteInvoiceLine.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCostLineMutations(jest.fn<() => void>()));
    await act(async () => {
      await result.current.run(kind, makeRow({ invoiceId: 'inv-1', invoiceBudgetLineId: 'ibl-1' }));
    });
    expect(mockDeleteInvoiceLine).toHaveBeenCalledWith('inv-1', 'ibl-1');
  });

  it('does not call an API for unlink on a line without an invoice link', async () => {
    const afterChange = jest.fn<() => void>();
    const { result } = renderHook(() => useCostLineMutations(afterChange));
    let ok = false;
    await act(async () => {
      ok = await result.current.run('unlink', makeRow());
    });
    expect(ok).toBe(true);
    expect(mockDeleteInvoiceLine).not.toHaveBeenCalled();
    expect(afterChange).toHaveBeenCalled();
  });

  it('maps a 409 on delete to a blocked state with translated text, never the server message', async () => {
    mockDeleteWork.mockRejectedValue(
      new ApiClientError(409, { code: 'CONFLICT', message: 'raw server prose' }),
    );
    const { result } = renderHook(() => useCostLineMutations(jest.fn<() => void>()));
    let ok = true;
    await act(async () => {
      ok = await result.current.run('delete', makeRow());
    });
    expect(ok).toBe(false);
    expect(result.current.blocked).toBe(true);
    expect(result.current.error).toBeTruthy();
    expect(result.current.error).not.toContain('raw server prose');
    act(() => result.current.clearError());
    expect(result.current.blocked).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('a 409 on unlink is a plain error, not blocked', async () => {
    mockDeleteInvoiceLine.mockRejectedValue(
      new ApiClientError(409, { code: 'CONFLICT', message: 'x' }),
    );
    const { result } = renderHook(() => useCostLineMutations(jest.fn<() => void>()));
    await act(async () => {
      await result.current.run('unlink', makeRow({ invoiceId: 'i', invoiceBudgetLineId: 'b' }));
    });
    expect(result.current.blocked).toBe(false);
    expect(result.current.error).toBeTruthy();
  });

  it('shows the network text for a NetworkError', async () => {
    mockDeleteWork.mockRejectedValue(new NetworkError('offline', null));
    const { result } = renderHook(() => useCostLineMutations(jest.fn<() => void>()));
    await act(async () => {
      await result.current.run('delete', makeRow());
    });
    expect(result.current.error).toBe(
      "Can't reach the server. Check your connection and try again.",
    );
  });

  it('shows a fixed message for any other failure, including a failing afterChange', async () => {
    mockDeleteWork.mockResolvedValue(undefined);
    const afterChange = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('secret'));
    const { result } = renderHook(() => useCostLineMutations(afterChange));
    await act(async () => {
      await result.current.run('delete', makeRow());
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.error).not.toContain('secret');
  });
});
