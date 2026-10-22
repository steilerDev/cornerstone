/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { act, renderHook, screen, waitFor, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { UserPreference } from '@cornerstone/shared';
import type * as PreferencesApiTypes from '../../lib/preferencesApi.js';
import type * as HookModule from './useHomePreferences.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { ToastList } from '../../test/homeRender.js';

const mockList = jest.fn<typeof PreferencesApiTypes.listPreferences>();
const mockUpsert = jest.fn<typeof PreferencesApiTypes.upsertPreference>();
jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: mockList,
  upsertPreference: mockUpsert,
  deletePreference: jest.fn(),
}));

let useHomePreferences: typeof HookModule.useHomePreferences;

function pref(key: string, value: string): UserPreference {
  return { key, value, updatedAt: '2026-03-01T00:00:00.000Z' };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ToastList />
      {children}
    </ToastProvider>
  );
}

async function renderPrefs(stored: UserPreference[]) {
  mockList.mockResolvedValue(stored);
  const view = renderHook(() => useHomePreferences(), { wrapper });
  await waitFor(() => expect(view.result.current.loaded).toBe(true));
  return view;
}

beforeEach(async () => {
  if (!useHomePreferences) ({ useHomePreferences } = await import('./useHomePreferences.js'));
  mockList.mockReset();
  mockUpsert.mockReset();
  mockUpsert.mockResolvedValue(pref('x', 'y'));
});

describe('useHomePreferences', () => {
  it('is not loaded until the preferences were fetched', async () => {
    let resolve: (value: UserPreference[]) => void = () => {};
    mockList.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useHomePreferences(), { wrapper });
    expect(result.current.loaded).toBe(false);

    await act(async () => resolve([]));
    await waitFor(() => expect(result.current.loaded).toBe(true));
  });

  it('defaults to nothing hidden, nothing collapsed, notice and setup not seen', async () => {
    const { result } = await renderPrefs([]);
    expect(result.current.hidden).toEqual([]);
    expect(result.current.collapsed).toEqual([]);
    expect(result.current.noticeSeen).toBe(false);
    expect(result.current.setupDismissed).toBe(false);
  });

  it('parses stored values leniently: unknown and duplicate members are dropped', async () => {
    const { result } = await renderPrefs([
      pref('home.hiddenSections', '["pulse","bogus","pulse","this-week","needs-attention"]'),
      pref('home.collapsedSections', '["tidy-up","pulse"]'),
      pref('home.movedNoticeSeen', 'true'),
      pref('home.setupDismissed', 'true'),
    ]);
    // Result keeps the allowed order, not the stored one.
    expect(result.current.hidden).toEqual(['this-week', 'pulse']);
    expect(result.current.collapsed).toEqual(['tidy-up']);
    expect(result.current.noticeSeen).toBe(true);
    expect(result.current.setupDismissed).toBe(true);
  });

  it('treats unparsable values as the defaults', async () => {
    const { result } = await renderPrefs([
      pref('home.hiddenSections', 'not json'),
      pref('home.movedNoticeSeen', 'yes'),
    ]);
    expect(result.current.hidden).toEqual([]);
    expect(result.current.noticeSeen).toBe(false);
  });

  it('falls back to the defaults when loading the preferences fails', async () => {
    mockList.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useHomePreferences(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.hidden).toEqual([]);
    expect(result.current.noticeSeen).toBe(false);
  });

  it('setHidden shows the change at once and saves the JSON list', async () => {
    const { result } = await renderPrefs([]);
    act(() => result.current.setHidden(['this-week', 'pulse']));

    expect(result.current.hidden).toEqual(['this-week', 'pulse']);
    expect(mockUpsert).toHaveBeenCalledWith('home.hiddenSections', '["this-week","pulse"]');
  });

  it('setCollapsed saves home.collapsedSections', async () => {
    const { result } = await renderPrefs([]);
    act(() => result.current.setCollapsed(['tidy-up']));

    expect(result.current.collapsed).toEqual(['tidy-up']);
    expect(mockUpsert).toHaveBeenCalledWith('home.collapsedSections', '["tidy-up"]');
  });

  it('markNoticeSeen and dismissSetup save the exact string true', async () => {
    const { result } = await renderPrefs([]);
    act(() => result.current.markNoticeSeen());
    act(() => result.current.dismissSetup());

    expect(result.current.noticeSeen).toBe(true);
    expect(result.current.setupDismissed).toBe(true);
    expect(mockUpsert).toHaveBeenCalledWith('home.movedNoticeSeen', 'true');
    expect(mockUpsert).toHaveBeenCalledWith('home.setupDismissed', 'true');
  });

  it('reverts the optimistic value and shows an error toast when saving fails', async () => {
    mockUpsert.mockRejectedValue(new Error('nope'));
    mockList.mockResolvedValue([pref('home.hiddenSections', '["pulse"]')]);
    function Probe() {
      const prefs = useHomePreferences();
      return (
        <>
          <output data-testid="hidden">{prefs.hidden.join(',')}</output>
          <button type="button" onClick={() => prefs.setHidden(['pulse', 'latest-from-site'])}>
            hide
          </button>
        </>
      );
    }
    render(
      <ToastProvider>
        <ToastList />
        <Probe />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('hidden')).toHaveTextContent('pulse'));

    act(() => screen.getByRole('button', { name: 'hide' }).click());

    await waitFor(() =>
      expect(screen.getByTestId('toasts')).toHaveTextContent("error: Couldn't save this change."),
    );
    expect(screen.getByTestId('hidden')).toHaveTextContent(/^pulse$/);
  });
});

describe('useHomePreferences loaded and failed (#2230)', () => {
  it('loaded and not failed after a successful fetch', async () => {
    const { result } = await renderPrefs([]);
    expect(result.current.loaded).toBe(true);
    expect(result.current.failed).toBe(false);
  });

  it('is loaded and failed, with defaults, when the fetch fails', async () => {
    mockList.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useHomePreferences(), { wrapper });

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.failed).toBe(true);
    expect(result.current.hidden).toEqual([]);
    expect(result.current.noticeSeen).toBe(false);
    expect(result.current.setupDismissed).toBe(false);
  });

  it('is neither loaded nor failed while the fetch is pending', () => {
    mockList.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useHomePreferences(), { wrapper });
    expect(result.current.loaded).toBe(false);
    expect(result.current.failed).toBe(false);
  });
});
