/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import type * as DavAccessCardTypes from './DavAccessCard.js';
import type { UseDavTokenResult } from '../../hooks/useDavToken.js';
import { installMatchMedia, type MatchMediaControl } from '../../test/matchMediaControl.js';

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
const mockClearNewToken = jest.fn<UseDavTokenResult['clearNewToken']>();
let hookState: Partial<UseDavTokenResult> = {};

jest.unstable_mockModule('../../hooks/useDavToken.js', () => ({
  useDavToken: (): UseDavTokenResult => ({
    status: {
      hasToken: true,
      createdAt: '2026-03-01T10:00:00.000Z',
      davUrl: 'https://house.example.test/cs/dav/',
    },
    isLoading: false,
    error: null,
    newToken: null,
    generate: mockGenerate,
    revoke: mockRevoke,
    clearNewToken: mockClearNewToken,
    ...hookState,
  }),
}));

let DavAccessCard: typeof DavAccessCardTypes.DavAccessCard;

const TOKEN = 'sample-token-0123456789';

function card(): ReactElement {
  return <DavAccessCard />;
}

function renderCard(entry = '/settings/profile') {
  return render(<MemoryRouter initialEntries={[entry]}>{card()}</MemoryRouter>);
}

function rerenderCard(utils: ReturnType<typeof renderCard>, entry = '/settings/profile') {
  utils.rerender(<MemoryRouter initialEntries={[entry]}>{card()}</MemoryRouter>);
}

function heading() {
  return screen.getByRole('heading', { level: 2, name: 'Calendar & contacts sync' });
}

/** Mocked generate that also "issues" a token, as the real hook would. */
function generateIssuesToken() {
  mockGenerate.mockImplementation(async () => {
    hookState = { ...hookState, newToken: TOKEN };
  });
}

beforeEach(async () => {
  hookState = {};
  mockRevoke.mockReset();
  mockRevoke.mockResolvedValue(undefined);
  mockGenerate.mockReset();
  mockGenerate.mockResolvedValue(undefined);
  mockClearNewToken.mockReset();
  if (!DavAccessCard) ({ DavAccessCard } = await import('./DavAccessCard.js'));
});

afterEach(() => {
  cleanup();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('DavAccessCard layout and states (#2214)', () => {
  it('shows the h2 and a skeleton, and no action buttons, while loading', () => {
    hookState = { isLoading: true, status: null };
    renderCard();
    expect(heading()).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('account-sync-download')).toBeNull();
  });

  it('labels the section by its h2 and tells the user when there is no token yet', () => {
    hookState = {
      status: {
        hasToken: false,
        createdAt: undefined,
        davUrl: 'https://house.example.test/cs/dav/',
      },
    };
    renderCard();
    expect(screen.getByTestId('account-sync')).toHaveAttribute('aria-labelledby', 'calendar-sync');
    expect(heading()).toHaveAttribute('id', 'calendar-sync');
    expect(screen.getByText('No token yet.')).toBeInTheDocument();
    expect(screen.getByTestId('account-sync-generate')).toBeInTheDocument();
    expect(screen.queryByTestId('account-sync-regenerate')).toBeNull();
  });

  it('shows the token creation date when a token exists', () => {
    renderCard();
    expect(screen.getByText(/Token active since/)).toBeInTheDocument();
  });

  it('shows a hook error inside the section', () => {
    hookState = { error: 'Could not revoke.' };
    renderCard();
    expect(screen.getByText('Could not revoke.')).toBeInTheDocument();
  });

  it('offers the Apple profile download only with a token', () => {
    renderCard();
    const link = screen.getByRole('link', { name: 'Download Apple profile' });
    expect(link).toHaveAttribute('href', '/api/users/me/dav/profile');
    expect(link).toHaveAttribute('download');
    cleanup();
    hookState = {
      status: {
        hasToken: false,
        createdAt: undefined,
        davUrl: 'https://house.example.test/cs/dav/',
      },
    };
    renderCard();
    expect(screen.queryByRole('link', { name: 'Download Apple profile' })).toBeNull();
  });

  it('labels the server URL without a colon and shows the server-provided davUrl', () => {
    renderCard();
    const label = screen.getByText('Server URL for manual setup');
    expect(label.textContent).not.toMatch(/:\s*$/);
    expect(screen.getByText(/\/dav\/$/)).toHaveTextContent('https://house.example.test/cs/dav/');
  });

  it('never shows the browser origin as the server URL (Story #2217)', () => {
    renderCard();
    expect(document.body.textContent).not.toContain(`${window.location.origin}/dav/`);
  });

  it('shows no server URL panel until the status has loaded', () => {
    hookState = { isLoading: true, status: null };
    renderCard();
    expect(screen.queryByText('Server URL for manual setup')).toBeNull();
    expect(screen.queryByText(/\/dav\/$/)).toBeNull();
  });

  it('shows the server URL even when no token exists yet', () => {
    hookState = {
      status: { hasToken: false, createdAt: undefined, davUrl: 'http://other.example.test/dav/' },
    };
    renderCard();
    expect(screen.getByText('http://other.example.test/dav/')).toBeInTheDocument();
  });
});

describe('DavAccessCard generate (#2214)', () => {
  it('moves focus to Copy once the new token is shown', async () => {
    hookState = {
      status: {
        hasToken: false,
        createdAt: undefined,
        davUrl: 'https://house.example.test/cs/dav/',
      },
    };
    generateIssuesToken();
    renderCard();
    fireEvent.click(screen.getByTestId('account-sync-generate'));
    await waitFor(() => expect(screen.getByTestId('account-sync-copy')).toHaveFocus());
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('keeps the warning and token in the atomic live region and the buttons outside it', () => {
    hookState = { newToken: TOKEN };
    renderCard();
    const region = screen.getByTestId('account-sync-token-panel').querySelector('[aria-atomic]');
    expect(region).not.toBeNull();
    if (!region) throw new Error('missing live region');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveAttribute('aria-atomic', 'true');
    expect(within(region as HTMLElement).getByTestId('account-sync-token')).toHaveTextContent(
      TOKEN,
    );
    expect(within(region as HTMLElement).getByText(/shown only once/)).toBeInTheDocument();
    expect(region).not.toContainElement(screen.getByTestId('account-sync-copy'));
    expect(region).not.toContainElement(screen.getByTestId('account-sync-hide'));
  });

  it('keeps focus on Generate and swallows the rejection when generating fails', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    hookState = {
      status: {
        hasToken: false,
        createdAt: undefined,
        davUrl: 'https://house.example.test/cs/dav/',
      },
    };
    mockGenerate.mockRejectedValue(new Error('boom'));
    renderCard();
    const button = screen.getByTestId('account-sync-generate');
    button.focus();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(button).toHaveFocus();
    expect(screen.queryByTestId('account-sync-token-panel')).toBeNull();
  });

  it('ignores a second Generate click while one is running', async () => {
    hookState = {
      status: {
        hasToken: false,
        createdAt: undefined,
        davUrl: 'https://house.example.test/cs/dav/',
      },
    };
    let resolve!: () => void;
    mockGenerate.mockImplementation(() => new Promise<void>((r) => (resolve = r)));
    renderCard();
    const button = screen.getByTestId('account-sync-generate');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveTextContent('Generating...');
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve();
    });
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
  });
});

describe('DavAccessCard regenerate confirmation (#2214)', () => {
  function openRegenerate() {
    const button = screen.getByTestId('account-sync-regenerate');
    button.focus();
    fireEvent.click(button);
  }

  it('opens a danger alertdialog with the UX wording and no generate call yet', () => {
    renderCard();
    openRegenerate();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('Create a new token?');
    expect(
      screen.getByText('Apps using the current token stop syncing until you update them.'),
    ).toBeInTheDocument();
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
    expect(screen.getByTestId('dav-regenerate-confirm')).toHaveTextContent('Create new token');
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('Cancel closes the dialog without generating and returns focus to Regenerate', () => {
    renderCard();
    openRegenerate();
    fireEvent.click(screen.getByTestId('dav-regenerate-cancel'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(screen.getByTestId('account-sync-regenerate')).toHaveFocus();
  });

  it('Confirm generates once, closes the dialog and focuses Copy', async () => {
    generateIssuesToken();
    renderCard();
    openRegenerate();
    fireEvent.click(screen.getByTestId('dav-regenerate-confirm'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('account-sync-copy')).toHaveFocus());
  });

  it('closes the dialog after a failure and puts focus on the section heading', async () => {
    mockGenerate.mockRejectedValue(new Error('boom'));
    hookState = { error: 'Failed to generate token. Please try again.' };
    renderCard();
    openRegenerate();
    fireEvent.click(screen.getByTestId('dav-regenerate-confirm'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(heading()).toHaveFocus());
    expect(screen.queryByTestId('account-sync-token-panel')).toBeNull();
  });

  it('marks Regenerate and Revoke aria-disabled, not disabled, while generating', async () => {
    let resolve!: () => void;
    mockGenerate.mockImplementation(() => new Promise<void>((r) => (resolve = r)));
    renderCard();
    openRegenerate();
    fireEvent.click(screen.getByTestId('dav-regenerate-confirm'));
    const regenerate = screen.getByTestId('account-sync-regenerate');
    const revoke = screen.getByTestId('account-sync-revoke');
    expect(regenerate).toHaveAttribute('aria-disabled', 'true');
    expect(regenerate).not.toBeDisabled();
    expect(revoke).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(revoke);
    expect(screen.queryByTestId('dav-revoke-confirm')).toBeNull();
    await act(async () => {
      resolve();
    });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('does not open the dialog while a revoke is running', async () => {
    let resolve!: () => void;
    mockRevoke.mockImplementation(() => new Promise<void>((r) => (resolve = r)));
    renderCard();
    fireEvent.click(screen.getByTestId('account-sync-revoke'));
    fireEvent.click(screen.getByTestId('dav-revoke-confirm'));
    fireEvent.click(screen.getByTestId('account-sync-regenerate'));
    expect(screen.queryByTestId('dav-regenerate-confirm')).toBeNull();
    await act(async () => {
      resolve();
    });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});

describe('DavAccessCard revoke confirmation (#2209, #2214)', () => {
  function openRevoke() {
    const button = screen.getByRole('button', { name: 'Revoke token' });
    button.focus();
    fireEvent.click(button);
  }

  it('Revoke opens an alertdialog instead of window.confirm, with Cancel focused', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderCard();
    openRevoke();

    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Revoke calendar access?');
    expect(screen.getByTestId('dav-revoke-cancel')).toHaveFocus();
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it('Cancel closes the dialog without revoking and returns focus to Revoke', () => {
    renderCard();
    openRevoke();
    fireEvent.click(screen.getByTestId('dav-revoke-cancel'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(mockRevoke).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Revoke token' })).toHaveFocus();
  });

  it('confirming revokes once, closes the dialog and lands focus on the section heading', async () => {
    renderCard();
    openRevoke();
    fireEvent.click(screen.getByTestId('dav-revoke-confirm'));
    await waitFor(() => expect(mockRevoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(heading()).toHaveFocus());
  });

  it('shows the busy state while revoking', async () => {
    let resolve!: () => void;
    mockRevoke.mockImplementation(() => new Promise<void>((r) => (resolve = r)));
    renderCard();
    openRevoke();
    fireEvent.click(screen.getByTestId('dav-revoke-confirm'));
    expect(screen.getByTestId('dav-revoke-confirm')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('account-sync-revoke')).toHaveTextContent('Revoking...');
    await act(async () => {
      resolve();
    });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('a failed revoke is swallowed here (the hook reports it) and the dialog closes', async () => {
    mockRevoke.mockRejectedValue(new Error('boom'));
    hookState = { error: 'Could not revoke.' };
    renderCard();
    openRevoke();
    fireEvent.click(screen.getByTestId('dav-revoke-confirm'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByText('Could not revoke.')).toBeInTheDocument();
  });

  it('without a token the card offers Generate and no Revoke', () => {
    hookState = {
      status: {
        hasToken: false,
        createdAt: undefined,
        davUrl: 'https://house.example.test/cs/dav/',
      },
    };
    renderCard();
    expect(screen.queryByRole('button', { name: 'Revoke token' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Generate token' })).toBeInTheDocument();
  });
});

describe('DavAccessCard hide token (#2214)', () => {
  it('clears the token and then focuses Regenerate', () => {
    hookState = { newToken: TOKEN };
    const utils = renderCard();
    fireEvent.click(screen.getByTestId('account-sync-hide'));
    expect(screen.getByRole('button', { name: 'Hide token' })).toBeInTheDocument();
    expect(mockClearNewToken).toHaveBeenCalledTimes(1);

    hookState = {};
    rerenderCard(utils);

    expect(screen.queryByTestId('account-sync-token-panel')).toBeNull();
    expect(screen.getByTestId('account-sync-regenerate')).toHaveFocus();
  });
});

describe('DavAccessCard copy (#2214)', () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const originalExec = Object.getOwnPropertyDescriptor(document, 'execCommand');

  function stubClipboard(writeText: (text: string) => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  }

  afterEach(() => {
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
    if (originalExec) Object.defineProperty(document, 'execCommand', originalExec);
    else Reflect.deleteProperty(document, 'execCommand');
  });

  it('copies the token, announces it separately, and reverts after 2 seconds', async () => {
    jest.useFakeTimers();
    const writeText = jest.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    stubClipboard(writeText);
    hookState = { newToken: TOKEN };
    renderCard();
    const copy = screen.getByTestId('account-sync-copy');
    expect(copy).not.toHaveAttribute('aria-label');
    expect(copy).toHaveTextContent('Copy');
    expect(screen.getByTestId('account-sync-copy-status')).toBeEmptyDOMElement();

    await act(async () => {
      fireEvent.click(copy);
    });

    expect(writeText).toHaveBeenCalledWith(TOKEN);
    expect(copy).toHaveTextContent('Copied');
    const status = screen.getByTestId('account-sync-copy-status');
    expect(status).toHaveTextContent('Token copied');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).not.toHaveAttribute('aria-atomic');
    expect(screen.getByTestId('account-sync-token-panel')).not.toContainElement(status);

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(copy).toHaveTextContent('Copy');
    expect(copy).not.toHaveTextContent('Copied');
    expect(status).toBeEmptyDOMElement();
  });

  it('restarts the 2 second window when copied again', async () => {
    jest.useFakeTimers();
    stubClipboard(jest.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined));
    hookState = { newToken: TOKEN };
    renderCard();
    const copy = screen.getByTestId('account-sync-copy');
    await act(async () => {
      fireEvent.click(copy);
    });
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    await act(async () => {
      fireEvent.click(copy);
    });
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(copy).toHaveTextContent('Copied');
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(copy).not.toHaveTextContent('Copied');
  });

  it('clears the 2 second copy timer when unmounted before it fires', async () => {
    jest.useFakeTimers();
    stubClipboard(jest.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined));
    hookState = { newToken: TOKEN };
    const setSpy = jest.spyOn(globalThis, 'setTimeout');
    const clearSpy = jest.spyOn(globalThis, 'clearTimeout');
    const { unmount } = renderCard();
    await act(async () => {
      fireEvent.click(screen.getByTestId('account-sync-copy'));
    });
    const index = setSpy.mock.calls.findIndex((call) => call[1] === 2000);
    expect(index).toBeGreaterThanOrEqual(0);
    const timerId = setSpy.mock.results[index]?.value as ReturnType<typeof setTimeout>;
    expect(timerId).toBeDefined();
    expect(clearSpy).not.toHaveBeenCalledWith(timerId);

    unmount();

    expect(clearSpy).toHaveBeenCalledWith(timerId);
  });

  it('falls back to execCommand when the clipboard rejects', async () => {
    stubClipboard(jest.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('no')));
    const exec = jest.fn<(command: string) => boolean>().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: exec });
    hookState = { newToken: TOKEN };
    renderCard();

    await act(async () => {
      fireEvent.click(screen.getByTestId('account-sync-copy'));
    });

    expect(exec).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
    expect(screen.getByTestId('account-sync-copy')).toHaveTextContent('Copied');
  });
});

describe('DavAccessCard #calendar-sync deep link (#2214)', () => {
  let rafQueue: FrameRequestCallback[];
  let matchMedia: MatchMediaControl;
  let scrollIntoView: jest.Mock<(arg?: boolean | ScrollIntoViewOptions) => void>;
  const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');

  function flushFrames() {
    act(() => {
      const queued = rafQueue;
      rafQueue = [];
      queued.forEach((cb) => cb(0));
    });
  }

  beforeEach(() => {
    rafQueue = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      rafQueue[id - 1] = () => undefined;
    });
    matchMedia = installMatchMedia();
    scrollIntoView = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    matchMedia.restore();
    if (originalScroll)
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });

  it('focuses the heading after a frame and scrolls it smoothly', () => {
    renderCard('/settings/profile#calendar-sync');
    expect(heading()).not.toHaveFocus();

    flushFrames();

    expect(heading()).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
  });

  it('scrolls without animation when reduced motion is requested', () => {
    matchMedia.set('(prefers-reduced-motion: reduce)', true);
    renderCard('/settings/profile#calendar-sync');

    flushFrames();

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
  });

  it('does nothing without the hash, or with a different hash', () => {
    renderCard('/settings/profile');
    flushFrames();
    cleanup();
    renderCard('/settings/profile#other');
    flushFrames();

    expect(heading()).not.toHaveFocus();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(rafQueue).toHaveLength(0);
  });

  it('does not steal focus again on a re-render with the same hash', () => {
    const utils = renderCard('/settings/profile#calendar-sync');
    flushFrames();
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();

    rerenderCard(utils, '/settings/profile#calendar-sync');
    flushFrames();

    expect(other).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    other.remove();
  });

  it('focuses the heading when navigation adds the hash later', () => {
    function Jump() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/settings/profile#calendar-sync')}>
          jump
        </button>
      );
    }
    render(
      <MemoryRouter initialEntries={['/settings/profile']}>
        <Jump />
        {card()}
      </MemoryRouter>,
    );
    flushFrames();
    expect(heading()).not.toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'jump' }));
    flushFrames();

    expect(heading()).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending frame when unmounted first', () => {
    const { unmount } = renderCard('/settings/profile#calendar-sync');
    unmount();

    flushFrames();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('copes with a browser that has no scrollIntoView', () => {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    renderCard('/settings/profile#calendar-sync');

    flushFrames();

    expect(heading()).toHaveFocus();
  });
});
