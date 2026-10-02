/**
 * @jest-environment jsdom
 *
 * #2129 — useMilestones error translation. useMilestones.test.tsx stubs global.fetch; this file
 * mocks the milestones API module instead so the non-API (generic) error branch is reachable.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import type * as MilestonesApiTypes from '../lib/milestonesApi.js';
import type * as UseMilestonesModule from './useMilestones.js';
import i18n from '../i18n/index.js';
import enErrors from '../i18n/en/errors.json';
import enCommon from '../i18n/en/common.json';
import enSchedule from '../i18n/en/schedule.json';
import deSchedule from '../i18n/de/schedule.json';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';

const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();

jest.unstable_mockModule('../lib/milestonesApi.js', () => ({
  listMilestones: mockListMilestones,
  createMilestone: jest.fn(),
  updateMilestone: jest.fn(),
  deleteMilestone: jest.fn(),
  linkWorkItem: jest.fn(),
  unlinkWorkItem: jest.fn(),
}));

let useMilestones: typeof UseMilestonesModule.useMilestones;

describe('useMilestones error translation (#2129)', () => {
  beforeEach(async () => {
    mockListMilestones.mockReset();
    if (!useMilestones) {
      ({ useMilestones } = await import('./useMilestones.js'));
    }
  });

  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('shows the translated code copy for an ApiClientError, never the server text', async () => {
    mockListMilestones.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
    );
    const { result } = renderHook(() => useMilestones());
    await waitFor(() => expect(result.current.error).toBe(enErrors.INTERNAL_ERROR));
  });

  it('shows the network copy for a NetworkError', async () => {
    mockListMilestones.mockRejectedValue(new NetworkError('RAW-LOCAL', new Error('cause')));
    const { result } = renderHook(() => useMilestones());
    await waitFor(() => expect(result.current.error).toBe(enCommon.requestErrors.network));
  });

  it('shows the loadFailed copy for any other error, never the local text', async () => {
    mockListMilestones.mockRejectedValue(new Error('RAW-LOCAL'));
    const { result } = renderHook(() => useMilestones());
    await waitFor(() => expect(result.current.error).toBe(enSchedule.milestones.errors.loadFailed));
  });

  it('re-fetches and re-translates when the language changes', async () => {
    mockListMilestones.mockRejectedValue(new Error('RAW-LOCAL'));
    const { result } = renderHook(() => useMilestones());
    await waitFor(() => expect(result.current.error).toBe(enSchedule.milestones.errors.loadFailed));
    const before = mockListMilestones.mock.calls.length;

    await act(async () => {
      await i18n.changeLanguage('de');
    });

    await waitFor(() => expect(result.current.error).toBe(deSchedule.milestones.errors.loadFailed));
    expect(mockListMilestones.mock.calls.length).toBeGreaterThan(before);
  });
});
