/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as AuthContextTypes from './AuthContext.js';
import type * as SettingsApiTypes from '../lib/settingsApi.js';
import type * as HouseNameTypes from './HouseNameContext.js';

const mockUseAuth = jest.fn<typeof AuthContextTypes.useAuth>();
jest.unstable_mockModule('./AuthContext.js', () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

const mockFetchHouseholdSettings = jest.fn<typeof SettingsApiTypes.fetchHouseholdSettings>();
jest.unstable_mockModule('../lib/settingsApi.js', () => ({
  fetchHouseholdSettings: mockFetchHouseholdSettings,
}));

let HouseNameProvider: typeof HouseNameTypes.HouseNameProvider;
let useHouseName: typeof HouseNameTypes.useHouseName;
let useEntriesLanguage: typeof HouseNameTypes.useEntriesLanguage;

beforeAll(async () => {
  ({ HouseNameProvider, useHouseName, useEntriesLanguage } = await import('./HouseNameContext.js'));
});

function authAs(userId: string | null) {
  mockUseAuth.mockReturnValue({
    user: userId ? { id: userId } : null,
  } as unknown as ReturnType<typeof AuthContextTypes.useAuth>);
}

let setHouseNameRef: (name: string | null) => void = () => {};

function Probe() {
  const { houseName, setHouseName } = useHouseName();
  setHouseNameRef = setHouseName;
  return <div data-testid="name">{houseName ?? 'none'}</div>;
}

function renderProvider() {
  return render(
    <HouseNameProvider>
      <Probe />
    </HouseNameProvider>,
  );
}

function settings(householdName: string | null, entriesLanguage: unknown = 'en') {
  return {
    householdName,
    householdAddress: null,
    entriesLanguage,
  } as Awaited<ReturnType<typeof SettingsApiTypes.fetchHouseholdSettings>>;
}

let setEntriesLanguageRef: (language: 'de' | 'en') => void = () => {};

function LanguageProbe() {
  const { entriesLanguage, setEntriesLanguage, setHouseName } = useHouseName();
  const hookValue = useEntriesLanguage();
  setEntriesLanguageRef = setEntriesLanguage;
  setHouseNameRef = setHouseName;
  return (
    <div>
      <div data-testid="language">{entriesLanguage ?? 'none'}</div>
      <div data-testid="hook-language">{hookValue ?? 'none'}</div>
    </div>
  );
}

function renderLanguageProvider() {
  return render(
    <HouseNameProvider>
      <LanguageProbe />
    </HouseNameProvider>,
  );
}

describe('HouseNameProvider', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockFetchHouseholdSettings.mockReset();
    setHouseNameRef = () => {};
  });

  it('fetches the settings once for a signed-in user and exposes the trimmed name', async () => {
    authAs('u-1');
    mockFetchHouseholdSettings.mockResolvedValue(settings('  Synthetic House  '));

    const { rerender } = renderProvider();

    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Synthetic House'));
    rerender(
      <HouseNameProvider>
        <Probe />
      </HouseNameProvider>,
    );
    expect(mockFetchHouseholdSettings).toHaveBeenCalledTimes(1);
  });

  it('treats a blank name as no house name', async () => {
    authAs('u-1');
    mockFetchHouseholdSettings.mockResolvedValue(settings('   '));

    renderProvider();

    await waitFor(() => expect(mockFetchHouseholdSettings).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('none'));
  });

  it('does not fetch while signed out and exposes null', () => {
    authAs(null);

    renderProvider();

    expect(mockFetchHouseholdSettings).not.toHaveBeenCalled();
    expect(screen.getByTestId('name')).toHaveTextContent('none');
  });

  it('exposes null (silently) when the fetch rejects', async () => {
    authAs('u-1');
    mockFetchHouseholdSettings.mockRejectedValue(new Error('boom'));

    renderProvider();

    await waitFor(() => expect(mockFetchHouseholdSettings).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('none'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refetches for a different user and forgets the previous name', async () => {
    authAs('u-1');
    mockFetchHouseholdSettings.mockResolvedValueOnce(settings('First House'));
    const view = renderProvider();
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('First House'));

    authAs('u-2');
    let resolveSecond: (value: ReturnType<typeof settings>) => void = () => {};
    mockFetchHouseholdSettings.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecond = resolve;
      }),
    );
    view.rerender(
      <HouseNameProvider>
        <Probe />
      </HouseNameProvider>,
    );

    expect(screen.getByTestId('name')).toHaveTextContent('none');
    await act(async () => {
      resolveSecond(settings('Second House'));
    });
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Second House'));
    expect(mockFetchHouseholdSettings).toHaveBeenCalledTimes(2);
  });

  it('forgets the name when the user signs out', async () => {
    authAs('u-1');
    mockFetchHouseholdSettings.mockResolvedValue(settings('Synthetic House'));
    const view = renderProvider();
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Synthetic House'));

    authAs(null);
    view.rerender(
      <HouseNameProvider>
        <Probe />
      </HouseNameProvider>,
    );

    expect(screen.getByTestId('name')).toHaveTextContent('none');
  });

  it('ignores a response that arrives after unmount', async () => {
    authAs('u-1');
    let resolveFetch: (value: ReturnType<typeof settings>) => void = () => {};
    mockFetchHouseholdSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = renderProvider();

    view.unmount();
    await act(async () => {
      resolveFetch(settings('Late'));
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('setHouseName stores the trimmed value for the signed-in user', async () => {
    authAs('u-1');
    mockFetchHouseholdSettings.mockResolvedValue(settings('Old'));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Old'));

    act(() => setHouseNameRef('  New  '));
    expect(screen.getByTestId('name')).toHaveTextContent('New');

    act(() => setHouseNameRef(null));
    expect(screen.getByTestId('name')).toHaveTextContent('none');
  });

  it('setHouseName is a no-op while signed out', () => {
    authAs(null);
    renderProvider();

    act(() => setHouseNameRef('Ghost'));

    expect(screen.getByTestId('name')).toHaveTextContent('none');
  });
});

describe('useHouseName outside a provider', () => {
  it('returns no house name and a harmless setter', () => {
    render(<Probe />);

    expect(screen.getByTestId('name')).toHaveTextContent('none');
    expect(() => setHouseNameRef('x')).not.toThrow();
  });
});

describe('entriesLanguage (#2215)', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockFetchHouseholdSettings.mockReset();
    setEntriesLanguageRef = () => {};
    setHouseNameRef = () => {};
  });

  it.each(['de', 'en'] as const)('carries %s from the settings fetch', async (language) => {
    authAs('u-1');
    mockFetchHouseholdSettings.mockResolvedValue(settings('Synthetic House', language));

    renderLanguageProvider();

    await waitFor(() => expect(screen.getByTestId('language')).toHaveTextContent(language));
    expect(screen.getByTestId('hook-language')).toHaveTextContent(language);
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'fr'],
    ['null', null],
  ])('is null for a %s field', async (_label, value) => {
    authAs('u-1');
    mockFetchHouseholdSettings.mockResolvedValue(settings('Synthetic House', value));

    renderLanguageProvider();

    await waitFor(() => expect(mockFetchHouseholdSettings).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('language')).toHaveTextContent('none'));
  });

  it('is null when the fetch rejects', async () => {
    authAs('u-1');
    mockFetchHouseholdSettings.mockRejectedValue(new Error('boom'));

    renderLanguageProvider();

    await waitFor(() => expect(mockFetchHouseholdSettings).toHaveBeenCalled());
    expect(screen.getByTestId('language')).toHaveTextContent('none');
  });

  it('is null while signed out', () => {
    authAs(null);

    renderLanguageProvider();

    expect(screen.getByTestId('language')).toHaveTextContent('none');
  });

  it('setEntriesLanguage replaces the language and keeps the house name', async () => {
    authAs('u-1');
    mockFetchHouseholdSettings.mockResolvedValue(settings('Synthetic House', 'en'));
    renderLanguageProvider();
    await waitFor(() => expect(screen.getByTestId('language')).toHaveTextContent('en'));

    act(() => setEntriesLanguageRef('de'));

    expect(screen.getByTestId('language')).toHaveTextContent('de');
    expect(screen.getByTestId('hook-language')).toHaveTextContent('de');
  });

  it('setHouseName keeps the entries language', async () => {
    authAs('u-1');
    mockFetchHouseholdSettings.mockResolvedValue(settings('Synthetic House', 'de'));
    renderLanguageProvider();
    await waitFor(() => expect(screen.getByTestId('language')).toHaveTextContent('de'));

    act(() => setHouseNameRef('Renamed'));

    expect(screen.getByTestId('language')).toHaveTextContent('de');
  });

  it('setEntriesLanguage is a no-op while signed out', () => {
    authAs(null);
    renderLanguageProvider();

    act(() => setEntriesLanguageRef('de'));

    expect(screen.getByTestId('language')).toHaveTextContent('none');
  });

  it('setEntriesLanguage before the fetch resolves does not invent a house name', () => {
    authAs('u-1');
    mockFetchHouseholdSettings.mockReturnValue(new Promise(() => {}));
    renderLanguageProvider();

    act(() => setEntriesLanguageRef('de'));

    expect(screen.getByTestId('language')).toHaveTextContent('de');
  });

  it('setHouseName before the fetch resolves leaves the language null', () => {
    authAs('u-1');
    mockFetchHouseholdSettings.mockReturnValue(new Promise(() => {}));
    renderLanguageProvider();

    act(() => setHouseNameRef('Early'));

    expect(screen.getByTestId('language')).toHaveTextContent('none');
  });

  it('is null outside a provider', () => {
    render(<LanguageProbe />);

    expect(screen.getByTestId('language')).toHaveTextContent('none');
    expect(() => setEntriesLanguageRef('de')).not.toThrow();
  });
});
