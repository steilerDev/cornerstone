/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import type * as UseNavContextTypes from './useNavContext.js';
import type * as NavConfigTypes from './navConfig.js';

type AuthUser = { role: 'admin' | 'member' } | null;

let mockUser: AuthUser = { role: 'admin' };
const mockGetPaperlessStatus = jest.fn<() => Promise<{ configured: boolean }>>();

jest.unstable_mockModule('../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: mockUser }),
}));
jest.unstable_mockModule('../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
}));

let useNavContext: typeof UseNavContextTypes.useNavContext;
let NAV_SECTIONS: typeof NavConfigTypes.NAV_SECTIONS;
let paperlessStatusNeeded: typeof NavConfigTypes.paperlessStatusNeeded;

/** A section whose only view is the given route (the section route itself is served, ungated). */
function fixture(viewRoute: NavConfigTypes.NavView['route']): readonly NavConfigTypes.NavSection[] {
  const base = NAV_SECTIONS.find((s) => s.id === 'tasks') as NavConfigTypes.NavSection;
  return [
    {
      ...base,
      views: [{ route: viewRoute, labelKey: 'navigation.invoices', term: 'Invoice' }],
    },
  ];
}

beforeEach(async () => {
  if (!useNavContext) {
    ({ useNavContext } = await import('./useNavContext.js'));
    ({ NAV_SECTIONS, paperlessStatusNeeded } = await import('./navConfig.js'));
  }
  mockUser = { role: 'admin' };
  mockGetPaperlessStatus.mockReset();
});

describe('paperlessStatusNeeded', () => {
  it('is false for the real NavConfig today (no served route is Paperless-gated)', () => {
    expect(paperlessStatusNeeded()).toBe(false);
    expect(paperlessStatusNeeded(NAV_SECTIONS)).toBe(false);
  });

  it('is true when a served view route is Paperless-gated', () => {
    expect(paperlessStatusNeeded(fixture('invoicePaperlessReview'))).toBe(true);
  });

  it('is true when a served section route is Paperless-gated', () => {
    const gated = { ...fixture('invoices')[0]!, route: 'invoicePaperlessReview' } as const;
    expect(paperlessStatusNeeded([{ ...gated, views: [] }])).toBe(true);
  });

  it('is false when the gated route is not served (documents is planned)', () => {
    expect(paperlessStatusNeeded(fixture('documents'))).toBe(false);
  });
});

describe('useNavContext', () => {
  it('maps an admin user to the admin role without asking Paperless', async () => {
    const { result } = renderHook(() => useNavContext());
    expect(result.current).toEqual({ role: 'admin', paperlessConfigured: false });
    expect(mockGetPaperlessStatus).not.toHaveBeenCalled();
  });

  it('maps a member to the member role', () => {
    mockUser = { role: 'member' };
    const { result } = renderHook(() => useNavContext());
    expect(result.current.role).toBe('member');
    expect(mockGetPaperlessStatus).not.toHaveBeenCalled();
  });

  it('treats a missing user as a member', () => {
    mockUser = null;
    const { result } = renderHook(() => useNavContext());
    expect(result.current.role).toBe('member');
  });

  it('keeps the same context object across re-renders with unchanged inputs', () => {
    const { result, rerender } = renderHook(() => useNavContext());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('reports Paperless configured once the status resolves true', async () => {
    mockGetPaperlessStatus.mockResolvedValue({ configured: true });
    const sections = fixture('invoicePaperlessReview');
    const { result } = renderHook(() => useNavContext(sections));
    expect(result.current.paperlessConfigured).toBe(false);
    await waitFor(() => expect(result.current.paperlessConfigured).toBe(true));
    expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(1);
  });

  it('stays unconfigured when the status resolves false', async () => {
    mockGetPaperlessStatus.mockResolvedValue({ configured: false });
    const sections = fixture('invoicePaperlessReview');
    const { result } = renderHook(() => useNavContext(sections));
    await waitFor(() => expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(1));
    expect(result.current.paperlessConfigured).toBe(false);
  });

  it('fails closed (not configured) when the status request is rejected', async () => {
    mockGetPaperlessStatus.mockRejectedValue(new Error('network down'));
    const sections = fixture('invoicePaperlessReview');
    const { result } = renderHook(() => useNavContext(sections));
    await waitFor(() => expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(1));
    expect(result.current.paperlessConfigured).toBe(false);
  });

  it('does not update state when unmounted before the status resolves', async () => {
    let resolve: (value: { configured: boolean }) => void = () => undefined;
    mockGetPaperlessStatus.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const sections = fixture('invoicePaperlessReview');
    const { result, unmount } = renderHook(() => useNavContext(sections));
    unmount();
    resolve({ configured: true });
    await Promise.resolve();
    expect(result.current.paperlessConfigured).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('does not update state when unmounted before the status request is rejected', async () => {
    let reject: (reason: Error) => void = () => undefined;
    mockGetPaperlessStatus.mockReturnValue(
      new Promise((_, r) => {
        reject = r;
      }),
    );
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const sections = fixture('invoicePaperlessReview');
    const { unmount } = renderHook(() => useNavContext(sections));
    unmount();
    reject(new Error('late failure'));
    await Promise.resolve();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
