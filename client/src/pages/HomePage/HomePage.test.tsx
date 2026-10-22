/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DiaryEntryListResponse, UserPreference } from '@cornerstone/shared';
import type * as AttentionApiTypes from '../../lib/attentionApi.js';
import type * as HomeApiTypes from '../../lib/homeApi.js';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type * as PreferencesApiTypes from '../../lib/preferencesApi.js';
import type * as PageModule from './HomePage.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { useState } from 'react';
import { RealLocationKeyContext } from '../../navigation/realLocation.js';
import { renderHome } from '../../test/homeRender.js';
import {
  AREA_KITCHEN,
  makeAttention,
  makeDiaryEntry,
  makePulse,
  makeRow,
  makeSetup,
  makeWeek,
} from '../../test/attentionFixtures.js';

const mockGetAttention = jest.fn<typeof AttentionApiTypes.getAttention>();
jest.unstable_mockModule('../../lib/attentionApi.js', () => ({
  getAttention: mockGetAttention,
  notNow: jest.fn<typeof AttentionApiTypes.notNow>(),
  undoNotNow: jest.fn<typeof AttentionApiTypes.undoNotNow>(),
}));

const mockGetHomeWeek = jest.fn<typeof HomeApiTypes.getHomeWeek>();
const mockGetHomePulse = jest.fn<typeof HomeApiTypes.getHomePulse>();
const mockGetHomeSetup = jest.fn<typeof HomeApiTypes.getHomeSetup>();
jest.unstable_mockModule('../../lib/homeApi.js', () => ({
  getHomeWeek: mockGetHomeWeek,
  getHomePulse: mockGetHomePulse,
  getHomeSetup: mockGetHomeSetup,
}));

const mockListDiaryEntries = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();
jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  listDiaryEntries: mockListDiaryEntries,
  deleteDiaryEntry: jest.fn(),
}));

const mockListPreferences = jest.fn<typeof PreferencesApiTypes.listPreferences>();
const mockUpsertPreference = jest.fn<typeof PreferencesApiTypes.upsertPreference>();
jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: mockListPreferences,
  upsertPreference: mockUpsertPreference,
  deletePreference: jest.fn(),
}));

let mockHouseName: string | null = null;
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useHouseName: () => ({
    houseName: mockHouseName,
    setHouseName: () => {},
    entriesLanguage: null,
    setEntriesLanguage: () => {},
  }),
  useEntriesLanguage: () => null,
  HouseNameProvider: ({ children }: { children: unknown }) => children,
}));

let HomePage: typeof PageModule.HomePage;
let media: MatchMediaControl;

function pref(key: string, value: string): UserPreference {
  return { key, value, updatedAt: '2026-03-01T00:00:00.000Z' };
}

function diaryResponse(items = [makeDiaryEntry('e1')]): DiaryEntryListResponse {
  return { items, pagination: { page: 1, pageSize: 3, totalPages: 1, totalItems: items.length } };
}

const SECTIONS = ['home-needs-attention', 'home-this-week', 'home-pulse', 'home-latest'];

function mockEverything(stored: UserPreference[] = []) {
  mockListPreferences.mockResolvedValue(stored);
  mockUpsertPreference.mockResolvedValue(pref('x', 'y'));
  mockGetAttention.mockResolvedValue(makeAttention([makeRow('N1')], [makeRow('H4')]));
  mockGetHomeWeek.mockResolvedValue(makeWeek([]));
  mockGetHomePulse.mockResolvedValue(makePulse());
  mockGetHomeSetup.mockResolvedValue(makeSetup());
  mockListDiaryEntries.mockResolvedValue(diaryResponse());
}

async function renderPage() {
  renderHome(<HomePage />);
  await screen.findByRole('heading', { level: 1, name: 'Home' });
}

/** Waits for the sections mode (the loading skeleton is gone). */
async function sectionsShown() {
  await screen.findByTestId('home-needs-attention');
}

beforeEach(async () => {
  if (!HomePage) ({ HomePage } = await import('./HomePage.js'));
  [
    mockGetAttention,
    mockGetHomeWeek,
    mockGetHomePulse,
    mockGetHomeSetup,
    mockListDiaryEntries,
    mockListPreferences,
    mockUpsertPreference,
  ].forEach((mock) => mock.mockReset());
  mockHouseName = null;
  media = installMatchMedia({ '(min-width: 1024px)': true, '(min-width: 768px)': true });
});

afterEach(() => media.restore());

describe('HomePage frame', () => {
  it('shows the Home heading and the document title', async () => {
    mockEverything();
    await renderPage();
    expect(document.title).toContain('Home');
  });

  it('shows a skeleton and no sections while the setup state and preferences load', async () => {
    mockEverything();
    mockGetHomeSetup.mockReturnValue(new Promise(() => {}));
    await renderPage();

    expect(screen.queryByTestId('home-needs-attention')).toBeNull();
    expect(screen.queryByTestId('home-setup')).toBeNull();
    // The footer and the heading stay.
    expect(screen.getByTestId('home-footer-history')).toBeInTheDocument();
  });

  it('shows the house name and the long date in the subtitle', async () => {
    mockEverything();
    mockHouseName = 'House A';
    await renderPage();

    expect(screen.getByTestId('home-page')).toHaveTextContent(
      /House A · \w+day, \w+ \d{1,2}, \d{4}/,
    );
  });

  it('shows only the date without a house name', async () => {
    mockEverything();
    await renderPage();

    const page = screen.getByTestId('home-page');
    expect(page).toHaveTextContent(/\w+day, \w+ \d{1,2}, \d{4}/);
    expect(page).not.toHaveTextContent('·  ');
    expect(page).not.toHaveTextContent('null');
  });

  it('always shows the History footer link', async () => {
    mockEverything();
    await renderPage();
    const link = screen.getByTestId('home-footer-history');
    expect(link).toHaveAttribute('href', '/history');
    expect(link).toHaveTextContent('All activity');
  });

  it('offers Customize and the What moved where help link in the page menu', async () => {
    mockEverything();
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Page actions' }));

    expect(screen.getByRole('menuitem', { name: 'Customize…' })).toBeInTheDocument();
    const help = screen.getByRole('menuitem', { name: /What moved where/ });
    expect(help).toHaveAttribute('target', '_blank');
  });
});

describe('HomePage sections mode', () => {
  it('shows the five sections in order when setup is complete', async () => {
    mockEverything();
    await renderPage();
    await sectionsShown();

    const order = [
      'home-needs-attention',
      'home-tidy-up',
      'home-this-week',
      'home-pulse',
      'home-latest',
    ];
    const elements = await Promise.all(order.map((id) => screen.findByTestId(id)));
    for (let i = 1; i < elements.length; i += 1) {
      expect(
        elements[i - 1]!.compareDocumentPosition(elements[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(screen.queryByTestId('home-setup')).toBeNull();
  });

  it('mounts Tidy up only when there is something to tidy', async () => {
    mockEverything();
    mockGetAttention.mockResolvedValue(makeAttention([makeRow('N1')], []));
    await renderPage();
    await sectionsShown();

    await screen.findByText('Task A');
    expect(screen.queryByTestId('home-tidy-up')).toBeNull();
  });

  it('falls back to the sections when the setup state cannot be loaded', async () => {
    mockEverything();
    mockGetHomeSetup.mockRejectedValue(new Error('offline'));
    await renderPage();

    await sectionsShown();
    expect(screen.queryByTestId('home-setup')).toBeNull();
  });

  it('does not mount hidden sections, and Needs attention cannot be hidden', async () => {
    mockEverything([
      pref('home.hiddenSections', '["pulse","latest-from-site","needs-attention","tidy-up"]'),
    ]);
    await renderPage();
    await sectionsShown();

    expect(screen.getByTestId('home-needs-attention')).toBeInTheDocument();
    expect(screen.getByTestId('home-this-week')).toBeInTheDocument();
    expect(screen.queryByTestId('home-pulse')).toBeNull();
    expect(screen.queryByTestId('home-latest')).toBeNull();
    expect(screen.queryByTestId('home-tidy-up')).toBeNull();
    // A hidden section is not even fetched.
    expect(mockGetHomePulse).not.toHaveBeenCalled();
  });

  it('does not mount or fetch This week when it is hidden', async () => {
    mockEverything([pref('home.hiddenSections', '["this-week"]')]);
    await renderPage();
    await sectionsShown();

    expect(screen.queryByTestId('home-this-week')).toBeNull();
    expect(screen.getByTestId('home-pulse')).toBeInTheDocument();
    expect(mockGetHomeWeek).not.toHaveBeenCalled();
  });

  it('collapses Tidy up and remembers it, then opens it again', async () => {
    mockEverything();
    await renderPage();
    const toggle = await screen.findByRole('button', { name: /Tidy up/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(mockUpsertPreference).toHaveBeenCalledWith('home.collapsedSections', '["tidy-up"]');

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(mockUpsertPreference).toHaveBeenLastCalledWith('home.collapsedSections', '[]');
  });

  it('starts Tidy up collapsed when the preference says so', async () => {
    mockEverything([pref('home.collapsedSections', '["tidy-up"]')]);
    await renderPage();

    expect(await screen.findByRole('button', { name: /Tidy up/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

describe('HomePage set-up mode', () => {
  const INCOMPLETE = {
    coreComplete: false,
    steps: [
      { id: 'house' as const, done: false },
      { id: 'areas' as const, done: false },
    ],
  };

  it('shows the checklist instead of the sections until the basics exist', async () => {
    mockEverything();
    mockGetHomeSetup.mockResolvedValue(INCOMPLETE);
    await renderPage();

    expect(await screen.findByTestId('home-setup')).toBeInTheDocument();
    expect(screen.queryByTestId('home-needs-attention')).toBeNull();
    // No Pulse in set-up mode: no verdict without data.
    expect(screen.queryByTestId('home-pulse')).toBeNull();
    expect(mockGetHomePulse).not.toHaveBeenCalled();
  });

  it('Skip setup stores the choice, shows the sections and focuses the heading', async () => {
    mockEverything();
    mockGetHomeSetup.mockResolvedValue(INCOMPLETE);
    await renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Skip setup' }));

    expect(mockUpsertPreference).toHaveBeenCalledWith('home.setupDismissed', 'true');
    await sectionsShown();
    expect(screen.queryByTestId('home-setup')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toHaveFocus();
  });

  it('shows the sections when setup was skipped earlier', async () => {
    mockEverything([pref('home.setupDismissed', 'true')]);
    mockGetHomeSetup.mockResolvedValue(INCOMPLETE);
    await renderPage();

    await sectionsShown();
    expect(screen.queryByTestId('home-setup')).toBeNull();
  });

  it('loads the checklist again after Try again on a step that could not be checked', async () => {
    mockEverything();
    mockGetHomeSetup.mockResolvedValue({
      coreComplete: false,
      steps: [{ id: 'backups' as const, done: null }],
    });
    await renderPage();

    mockGetHomeSetup.mockResolvedValue({
      coreComplete: false,
      steps: [{ id: 'backups' as const, done: true }],
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(mockGetHomeSetup).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Couldn't check")).toBeNull());
  });
});

describe('HomePage moved notice', () => {
  it('shows the notice while the preference is absent', async () => {
    mockEverything();
    await renderPage();
    expect(await screen.findByTestId('home-moved-notice')).toBeInTheDocument();
  });

  it('does not show it once it was dismissed before', async () => {
    mockEverything([pref('home.movedNoticeSeen', 'true')]);
    await renderPage();
    await sectionsShown();
    expect(screen.queryByTestId('home-moved-notice')).toBeNull();
  });

  it('dismisses once, stores it and moves focus to the heading', async () => {
    mockEverything();
    await renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByTestId('home-moved-notice')).toBeNull();
    expect(mockUpsertPreference).toHaveBeenCalledTimes(1);
    expect(mockUpsertPreference).toHaveBeenCalledWith('home.movedNoticeSeen', 'true');
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toHaveFocus();
  });

  it('shows no notice when the preferences cannot be loaded', async () => {
    mockEverything();
    mockListPreferences.mockRejectedValue(new Error('offline'));
    await renderPage();

    await sectionsShown();
    expect(screen.queryByTestId('home-moved-notice')).toBeNull();
  });
});

describe('HomePage phone and tablet extras', () => {
  it('mounts Where are you? below 1024 px', async () => {
    media.set('(min-width: 1024px)', false);
    mockEverything();
    mockListDiaryEntries.mockResolvedValue(
      diaryResponse([makeDiaryEntry('e1', { photoAreas: [AREA_KITCHEN] })]),
    );
    await renderPage();

    expect(await screen.findByRole('heading', { name: 'Where are you?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ground floor › Kitchen' })).toBeInTheDocument();
  });

  it('does not mount Where are you? from 1024 px', async () => {
    mockEverything();
    mockListDiaryEntries.mockResolvedValue(
      diaryResponse([makeDiaryEntry('e1', { photoAreas: [AREA_KITCHEN] })]),
    );
    await renderPage();
    await sectionsShown();

    expect(screen.queryByRole('heading', { name: 'Where are you?' })).toBeNull();
    expect(screen.queryByTestId('home-where')).toBeNull();
  });

  it('mounts it when the window narrows', async () => {
    mockEverything();
    mockListDiaryEntries.mockResolvedValue(
      diaryResponse([makeDiaryEntry('e1', { photoAreas: [AREA_KITCHEN] })]),
    );
    await renderPage();
    await sectionsShown();

    media.set('(min-width: 1024px)', false);

    expect(await screen.findByRole('heading', { name: 'Where are you?' })).toBeInTheDocument();
  });
});

describe('HomePage Customize', () => {
  async function openCustomize() {
    await userEvent.click(screen.getByRole('button', { name: 'Page actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Customize…' }));
    return screen.findByRole('dialog', { name: 'Customize Home' });
  }

  it('hides a section at once, saves the list and keeps Needs attention', async () => {
    mockEverything();
    await renderPage();
    await sectionsShown();
    const dialog = await openCustomize();

    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Pulse' }));

    expect(mockUpsertPreference).toHaveBeenCalledWith('home.hiddenSections', '["pulse"]');
    await waitFor(() => expect(screen.queryByTestId('home-pulse')).toBeNull());
    expect(screen.getByTestId('home-needs-attention')).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox', { name: 'Needs attention' })).toBeNull();
  });

  it('shows a hidden section again when its box is checked', async () => {
    mockEverything([pref('home.hiddenSections', '["pulse"]')]);
    await renderPage();
    await sectionsShown();
    const dialog = await openCustomize();

    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Pulse' }));

    expect(mockUpsertPreference).toHaveBeenCalledWith('home.hiddenSections', '[]');
    expect(await screen.findByTestId('home-pulse')).toBeInTheDocument();
  });

  it('puts a failed save back and says so', async () => {
    mockEverything();
    mockUpsertPreference.mockRejectedValue(new Error('nope'));
    await renderPage();
    await sectionsShown();
    const dialog = await openCustomize();

    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Pulse' }));

    await waitFor(() =>
      expect(screen.getByTestId('toasts')).toHaveTextContent("error: Couldn't save this change."),
    );
    await waitFor(() =>
      expect(within(dialog).getByRole('checkbox', { name: 'Pulse' })).toBeChecked(),
    );
    expect(screen.getByTestId('home-pulse')).toBeInTheDocument();
  });

  it('closes with Done and returns focus to the page menu', async () => {
    mockEverything();
    await renderPage();
    await sectionsShown();
    const dialog = await openCustomize();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Page actions' })).toHaveFocus());
  });
});

describe('HomePage sections are independent', () => {
  it('keeps the other sections when one fails', async () => {
    mockEverything();
    mockGetHomePulse.mockRejectedValue(new Error('boom'));
    await renderPage();

    expect(await screen.findByText("Couldn't load Pulse.")).toBeInTheDocument();
    for (const id of SECTIONS.filter((section) => section !== 'home-pulse')) {
      expect(await screen.findByTestId(id)).toBeInTheDocument();
    }
  });
});

describe('HomePage set-up state refresh on navigation (#2230)', () => {
  const BEFORE = {
    coreComplete: false,
    steps: [
      { id: 'house' as const, done: false },
      { id: 'areas' as const, done: false },
    ],
  };
  const AFTER = {
    coreComplete: false,
    steps: [
      { id: 'house' as const, done: true },
      { id: 'areas' as const, done: false },
    ],
  };

  function KeyedHome() {
    const [key, setKey] = useState('key-1');
    return (
      <RealLocationKeyContext value={key}>
        <button type="button" data-testid="change-key" onClick={() => setKey('key-2')}>
          change
        </button>
        <HomePage />
      </RealLocationKeyContext>
    );
  }

  it('does not refetch the set-up state on the initial render', async () => {
    mockEverything();
    mockGetHomeSetup.mockResolvedValue(BEFORE);
    renderHome(<KeyedHome />);
    await screen.findByTestId('home-setup');

    expect(mockGetHomeSetup).toHaveBeenCalledTimes(1);
  });

  it('refetches the set-up state once when the real location key changes and updates the step', async () => {
    mockEverything();
    mockGetHomeSetup.mockResolvedValueOnce(BEFORE).mockResolvedValueOnce(AFTER);
    renderHome(<KeyedHome />);
    const row = await screen.findByTestId('home-setup-row-house');
    expect(row).toHaveTextContent('To do:');

    await userEvent.click(screen.getByTestId('change-key'));

    await waitFor(() => expect(mockGetHomeSetup).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId('home-setup-row-house')).toHaveTextContent('Done:'),
    );
    expect(screen.getByTestId('home-setup-row-areas')).toHaveTextContent('To do:');
  });

  it('does not refetch again when the same key is provided on a re-render', async () => {
    mockEverything();
    mockGetHomeSetup.mockResolvedValue(BEFORE);
    renderHome(<KeyedHome />);
    await screen.findByTestId('home-setup');
    await userEvent.click(screen.getByTestId('change-key'));
    await waitFor(() => expect(mockGetHomeSetup).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByTestId('change-key'));

    expect(mockGetHomeSetup).toHaveBeenCalledTimes(2);
  });
});
