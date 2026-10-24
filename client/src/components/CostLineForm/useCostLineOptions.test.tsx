/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import type * as CategoriesTypes from '../../lib/budgetCategoriesApi.js';
import type * as SourcesTypes from '../../lib/budgetSourcesApi.js';
import type * as HookTypes from './useCostLineOptions.js';

const mockFetchCategories = jest.fn<typeof CategoriesTypes.fetchBudgetCategories>();
jest.unstable_mockModule('../../lib/budgetCategoriesApi.js', () => ({
  fetchBudgetCategories: mockFetchCategories,
}));
const mockFetchSources = jest.fn<typeof SourcesTypes.fetchBudgetSources>();
jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchSources,
}));

describe('useCostLineOptions', () => {
  let Hook: typeof HookTypes;

  beforeEach(async () => {
    mockFetchCategories.mockReset();
    mockFetchSources.mockReset();
    if (!Hook) Hook = await import('./useCostLineOptions.js');
  });

  it('starts loading and then offers categories, sources and the discretionary source', async () => {
    mockFetchCategories.mockResolvedValue({
      categories: [
        { id: 'c1', name: 'Materials', translationKey: null },
        { id: 'c2', name: 'Custom', translationKey: null },
      ],
    } as never);
    mockFetchSources.mockResolvedValue({
      budgetSources: [
        { id: 's1', name: 'Savings', isDiscretionary: false },
        { id: 's2', name: 'Free money', isDiscretionary: true },
      ],
    } as never);
    const { result } = renderHook(() => Hook.useCostLineOptions());
    expect(result.current.loading).toBe(true);
    expect(result.current.discretionarySourceId).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failed).toBe(false);
    expect(result.current.categoryOptions).toEqual([
      { value: 'c1', label: 'Materials' },
      { value: 'c2', label: 'Custom' },
    ]);
    expect(result.current.sourceOptions).toEqual([
      { value: 's1', label: 'Savings' },
      { value: 's2', label: 'Free money' },
    ]);
    expect(result.current.discretionarySourceId).toBe('s2');
    expect(mockFetchCategories).toHaveBeenCalledTimes(1);
  });

  it('has no discretionary source when none is marked', async () => {
    mockFetchCategories.mockResolvedValue({ categories: [] } as never);
    mockFetchSources.mockResolvedValue({
      budgetSources: [{ id: 's1', name: 'Savings', isDiscretionary: false }],
    } as never);
    const { result } = renderHook(() => Hook.useCostLineOptions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.discretionarySourceId).toBeNull();
  });

  it('reports a failure and stops loading', async () => {
    mockFetchCategories.mockRejectedValue(new Error('offline'));
    mockFetchSources.mockResolvedValue({ budgetSources: [] } as never);
    const { result } = renderHook(() => Hook.useCostLineOptions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failed).toBe(true);
    expect(result.current.categoryOptions).toEqual([]);
  });

  it('ignores responses that arrive after unmount', async () => {
    let resolveCategories: (value: never) => void = () => {};
    mockFetchCategories.mockReturnValue(
      new Promise((resolve) => (resolveCategories = resolve)) as never,
    );
    mockFetchSources.mockResolvedValue({ budgetSources: [] } as never);
    const first = renderHook(() => Hook.useCostLineOptions());
    first.unmount();
    resolveCategories({ categories: [] } as never);

    let rejectCategories: (error: Error) => void = () => {};
    mockFetchCategories.mockReturnValue(
      new Promise((_resolve, reject) => (rejectCategories = reject)) as never,
    );
    const second = renderHook(() => Hook.useCostLineOptions());
    second.unmount();
    rejectCategories(new Error('late'));
    await Promise.resolve();
    expect(second.result.current.failed).toBe(false);
    expect(second.result.current.loading).toBe(true);
  });
});
