/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type * as DavAccessCardTypes from './DavAccessCard.js';
import type { UseDavTokenResult } from '../../hooks/useDavToken.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockRevoke = jest.fn<UseDavTokenResult['revoke']>();
const mockGenerate = jest.fn<UseDavTokenResult['generate']>();
let hookState: Partial<UseDavTokenResult> = {};

jest.unstable_mockModule('../../hooks/useDavToken.js', () => ({
  useDavToken: (): UseDavTokenResult => ({
    status: { hasToken: true, createdAt: '2026-03-01T10:00:00.000Z' },
    isLoading: false,
    error: null,
    newToken: null,
    generate: mockGenerate,
    revoke: mockRevoke,
    clearNewToken: jest.fn(),
    ...hookState,
  }),
}));

let DavAccessCard: typeof DavAccessCardTypes.DavAccessCard;

beforeEach(async () => {
  hookState = {};
  mockRevoke.mockReset();
  mockRevoke.mockResolvedValue(undefined);
  mockGenerate.mockReset();
  mockGenerate.mockResolvedValue(undefined);
  if (!DavAccessCard) ({ DavAccessCard } = await import('./DavAccessCard.js'));
});

describe('DavAccessCard revoke confirmation (#2209)', () => {
  function openRevoke() {
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Token' }));
  }

  it('Revoke opens an alertdialog instead of window.confirm, with Cancel focused', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<DavAccessCard />);
    openRevoke();

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('Revoke calendar access?');
    expect(screen.getByTestId('dav-revoke-cancel')).toHaveFocus();
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mockRevoke).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('Cancel closes the dialog without revoking', () => {
    render(<DavAccessCard />);
    openRevoke();
    fireEvent.click(screen.getByTestId('dav-revoke-cancel'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it('confirming revokes once and closes the dialog', async () => {
    render(<DavAccessCard />);
    openRevoke();
    fireEvent.click(screen.getByTestId('dav-revoke-confirm'));
    await waitFor(() => expect(mockRevoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('shows the busy label while revoking', async () => {
    let resolve!: () => void;
    mockRevoke.mockImplementation(() => new Promise<void>((r) => (resolve = r)));
    render(<DavAccessCard />);
    openRevoke();
    fireEvent.click(screen.getByTestId('dav-revoke-confirm'));
    expect(screen.getByTestId('dav-revoke-confirm')).toHaveAttribute('aria-disabled', 'true');
    resolve();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('a failed revoke is swallowed here (the hook reports it on the card) and the dialog closes', async () => {
    mockRevoke.mockRejectedValue(new Error('boom'));
    hookState = { error: 'Could not revoke.' };
    render(<DavAccessCard />);
    openRevoke();
    fireEvent.click(screen.getByTestId('dav-revoke-confirm'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByText('Could not revoke.')).toBeInTheDocument();
  });

  it('without a token the card offers Generate and no Revoke', () => {
    hookState = { status: { hasToken: false, createdAt: undefined } };
    render(<DavAccessCard />);
    expect(screen.queryByRole('button', { name: 'Revoke Token' })).toBeNull();
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
  });

  it('Regenerate and Generate call the hook', async () => {
    render(<DavAccessCard />);
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
  });
});
