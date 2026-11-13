/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { makeTaskPage } from '../../test/taskPageFixtures.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';

const mockGetWorkItem = jest.fn<typeof WorkItemsApiTypes.getWorkItem>();
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({ getWorkItem: mockGetWorkItem }));

const { useTaskRecord } = await import('./useTaskRecord.js');

describe('useTaskRecord', () => {
  it('loads the task of the page through getWorkItem', async () => {
    const task = makeTaskPage();
    mockGetWorkItem.mockResolvedValue(task);
    const { result } = renderHook(() => useTaskRecord('wi-1'));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.record).toBe(task);
    expect(mockGetWorkItem).toHaveBeenCalledWith('wi-1');
  });
});
