/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import enCommon from '../../i18n/en/common.json';
import enErrors from '../../i18n/en/errors.json';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import type * as AuthApiTypes from '../../lib/authApi.js';
import type * as AuthContextTypes from '../../contexts/AuthContext.js';
import type * as AuthCheckFailedTypes from './AuthCheckFailed.js';

const mockGetAuthMe = jest.fn<typeof AuthApiTypes.getAuthMe>();
const mockLogout = jest.fn<typeof AuthApiTypes.logout>();

jest.unstable_mockModule('../../lib/authApi.js', () => ({
  getAuthMe: mockGetAuthMe,
  logout: mockLogout,
}));

type MeResponse = Awaited<ReturnType<typeof AuthApiTypes.getAuthMe>>;
const SIGNED_OUT: MeResponse = { user: null, setupRequired: false, oidcEnabled: false };

function abortError() {
  return new NetworkError('aborted', new DOMException('aborted', 'AbortError'));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('AuthCheckFailed', () => {
  let AuthCheckFailed: typeof AuthCheckFailedTypes.AuthCheckFailed;
  let AuthProvider: typeof AuthContextTypes.AuthProvider;
  let useAuth: typeof AuthContextTypes.useAuth;

  beforeEach(async () => {
    if (!AuthCheckFailed) {
      ({ AuthCheckFailed } = await import('./AuthCheckFailed.js'));
      ({ AuthProvider, useAuth } = await import('../../contexts/AuthContext.js'));
    }
    mockGetAuthMe.mockReset();
    mockLogout.mockReset();
    mockGetAuthMe.mockRejectedValueOnce(abortError());
  });

  afterEach(() => {
    cleanup();
  });

  // Renders the panel only once the provider is in the error state, like AuthGuard does.
  function Gate({ embedded }: { embedded?: boolean }) {
    const { status } = useAuth();
    if (status === 'error') return <AuthCheckFailed embedded={embedded} />;
    return <div>{`status:${status}`}</div>;
  }

  function renderPanel(embedded?: boolean) {
    return render(
      <MemoryRouter>
        <AuthProvider>
          <Gate embedded={embedded} />
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  const retryName = enCommon.authGuard.retry;

  it('renders the error heading as the only h1, with the translated reason', async () => {
    renderPanel();

    const h1s = await screen.findAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(enCommon.authGuard.errorHeading);
    expect(screen.getByText(enCommon.requestErrors.network)).toBeInTheDocument();
  });

  it('shows the translated reason for a server error, never the server text', async () => {
    mockGetAuthMe.mockReset();
    mockGetAuthMe.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
    );
    renderPanel();

    expect(await screen.findByText(enErrors.INTERNAL_ERROR)).toBeInTheDocument();
    expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).not.toBeInTheDocument();
  });

  it('sets the tab title from the heading with the product name', async () => {
    renderPanel();
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() =>
      expect(document.title).toBe(`${enCommon.authGuard.errorHeading} · Cornerstone`),
    );
  });

  it('has an empty status line before any retry', async () => {
    renderPanel();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('keeps the retry button enabled, mounted and focused while retrying', async () => {
    const pending = deferred<MeResponse>();
    mockGetAuthMe.mockReturnValueOnce(pending.promise);
    renderPanel();
    const button = await screen.findByRole('button', { name: retryName });
    button.focus();

    fireEvent.click(button);

    expect(await screen.findByText(enCommon.authGuard.retrying)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(enCommon.authGuard.retrying);
    expect(button).toBeInTheDocument();
    expect(button).not.toHaveAttribute('disabled');
    expect(button).not.toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveFocus();

    await act(async () => {
      pending.resolve(SIGNED_OUT);
    });
  });

  it('shows the failed copy after a retry that fails, with the button still enabled', async () => {
    mockGetAuthMe.mockRejectedValueOnce(abortError());
    renderPanel();
    const button = await screen.findByRole('button', { name: retryName });

    fireEvent.click(button);

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(enCommon.authGuard.retryFailed),
    );
    expect(button).not.toHaveAttribute('disabled');
  });

  it('ignores a second click while a retry is in flight', async () => {
    const pending = deferred<MeResponse>();
    mockGetAuthMe.mockReturnValueOnce(pending.promise);
    renderPanel();
    const button = await screen.findByRole('button', { name: retryName });

    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
    });

    // Mount check plus exactly one retry.
    expect(mockGetAuthMe).toHaveBeenCalledTimes(2);
    await act(async () => {
      pending.reject(abortError());
    });
  });

  it('accepts another retry once the previous one has finished', async () => {
    mockGetAuthMe.mockRejectedValueOnce(abortError());
    mockGetAuthMe.mockRejectedValueOnce(abortError());
    renderPanel();
    const button = await screen.findByRole('button', { name: retryName });

    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(enCommon.authGuard.retryFailed),
    );
    fireEvent.click(button);

    await waitFor(() => expect(mockGetAuthMe).toHaveBeenCalledTimes(3));
  });

  it('does not update state when it unmounts during a retry', async () => {
    const pending = deferred<MeResponse>();
    mockGetAuthMe.mockReturnValueOnce(pending.promise);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: retryName }));
    await screen.findByText(enCommon.authGuard.retrying);

    unmount();
    await act(async () => {
      pending.reject(abortError());
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  describe('layout', () => {
    it('wraps itself in the full-page container by default', async () => {
      const { container } = renderPanel();
      await screen.findByRole('heading', { level: 1 });

      const page = container.querySelector('.page');
      expect(page).toBeInTheDocument();
      expect(page).toContainElement(screen.getByRole('heading', { level: 1 }));
      expect(page).toContainElement(screen.getByRole('status'));
    });

    it('renders without the page wrapper when embedded', async () => {
      const { container } = renderPanel(true);
      await screen.findByRole('heading', { level: 1 });

      expect(container.querySelector('.page')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: retryName })).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });
});
