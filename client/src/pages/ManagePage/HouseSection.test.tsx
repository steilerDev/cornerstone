/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { EntriesLanguage, HouseholdSettings } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import type * as SettingsApiTypes from '../../lib/settingsApi.js';
import type * as SectionTypes from './HouseSection.js';

const mockFetch = jest.fn<typeof SettingsApiTypes.fetchHouseholdSettings>();
const mockUpdate = jest.fn<typeof SettingsApiTypes.updateHouseholdSettings>();
jest.unstable_mockModule('../../lib/settingsApi.js', () => ({
  fetchHouseholdSettings: mockFetch,
  updateHouseholdSettings: mockUpdate,
}));

const mockSetHouseName = jest.fn<(name: string | null) => void>();
const mockSetEntriesLanguage = jest.fn<(language: EntriesLanguage) => void>();
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useHouseName: () => ({
    houseName: null,
    setHouseName: mockSetHouseName,
    entriesLanguage: null,
    setEntriesLanguage: mockSetEntriesLanguage,
  }),
}));

let HouseSection: typeof SectionTypes.HouseSection;

beforeAll(async () => {
  ({ HouseSection } = await import('./HouseSection.js'));
});

const SETTINGS: HouseholdSettings = {
  householdName: 'Sample House',
  householdAddress: '1 Example Lane',
  entriesLanguage: 'de',
};

describe('HouseSection', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockUpdate.mockReset();
    mockSetHouseName.mockReset();
    mockSetEntriesLanguage.mockReset();
    mockFetch.mockResolvedValue(SETTINGS);
  });

  function renderSection(onSettled?: () => void) {
    return render(
      <MemoryRouter>
        <HouseSection onSettled={onSettled} />
      </MemoryRouter>,
    );
  }

  async function loaded(onSettled?: () => void) {
    const view = renderSection(onSettled);
    await screen.findByTestId('project-setup-house-name');
    return view;
  }

  const nameInput = () => screen.getByTestId('project-setup-house-name') as HTMLInputElement;
  const addressInput = () =>
    screen.getByTestId('project-setup-house-address') as HTMLTextAreaElement;
  const languageSelect = () => screen.getByTestId('project-setup-language') as HTMLSelectElement;
  const saveButton = () => screen.getByTestId('project-setup-house-save');

  describe('loading', () => {
    it('shows the heading while loading and then fills the fields', async () => {
      renderSection();

      expect(screen.getByRole('heading', { level: 2, name: 'House' })).toBeInTheDocument();
      expect(screen.queryByTestId('project-setup-house-name')).toBeNull();
      await screen.findByTestId('project-setup-house-name');

      expect(nameInput().value).toBe('Sample House');
      expect(addressInput().value).toBe('1 Example Lane');
      expect(languageSelect().value).toBe('de');
    });

    it('is a labelled section that serves as the #house anchor', async () => {
      await loaded();

      const section = screen.getByTestId('project-setup-house');
      expect(section).toHaveAttribute('id', 'house');
      expect(section).toHaveAccessibleName('House');
      expect(screen.getByRole('heading', { level: 2 })).toHaveAttribute('id', 'house-heading');
    });

    it('shows empty fields when no name or address is set', async () => {
      mockFetch.mockResolvedValue({
        householdName: null,
        householdAddress: null,
        entriesLanguage: 'en',
      });
      await loaded();

      expect(nameInput().value).toBe('');
      expect(addressInput().value).toBe('');
      expect(languageSelect().value).toBe('en');
    });

    it('offers German and English, in that order, with lang attributes', async () => {
      await loaded();

      const options = Array.from(languageSelect().options);
      expect(options.map((o) => o.value)).toEqual(['de', 'en']);
      expect(options.map((o) => o.textContent)).toEqual(['Deutsch', 'English']);
      expect(options.map((o) => o.getAttribute('lang'))).toEqual(['de', 'en']);
    });

    it('links to the account page for the app language', async () => {
      await loaded();

      const link = screen.getByTestId('project-setup-app-language-link');
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', '/settings/profile');
    });

    it('limits the name to 200 and the address to 500 characters', async () => {
      await loaded();

      expect(nameInput()).toHaveAttribute('maxlength', '200');
      expect(addressInput()).toHaveAttribute('maxlength', '500');
    });

    it('does not save anything while loading', async () => {
      await loaded();

      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('load failure', () => {
    it('shows the error with Retry that focuses the heading and reloads', async () => {
      const user = userEvent.setup();
      mockFetch.mockRejectedValueOnce(new Error('offline'));
      renderSection();
      const retry = await screen.findByTestId('project-setup-house-retry');
      expect(screen.getByText("Couldn't load the house details.")).toBeInTheDocument();

      await user.click(retry);

      expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
      await screen.findByTestId('project-setup-house-name');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(nameInput().value).toBe('Sample House');
    });

    it('shows the error again when the retry also fails', async () => {
      const user = userEvent.setup();
      mockFetch.mockRejectedValue(new Error('offline'));
      renderSection();

      await user.click(await screen.findByTestId('project-setup-house-retry'));

      expect(await screen.findByTestId('project-setup-house-retry')).toBeInTheDocument();
    });
  });

  describe('onSettled', () => {
    it('is called once after a successful first load', async () => {
      const onSettled = jest.fn<() => void>();
      await loaded(onSettled);

      await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    });

    it('is called after a failed first load, and not again after a retry', async () => {
      const user = userEvent.setup();
      const onSettled = jest.fn<() => void>();
      mockFetch.mockRejectedValueOnce(new Error('offline'));
      renderSection(onSettled);
      await user.click(await screen.findByTestId('project-setup-house-retry'));
      await screen.findByTestId('project-setup-house-name');

      expect(onSettled).toHaveBeenCalledTimes(1);
    });

    it('is optional', async () => {
      await expect(loaded()).resolves.toBeDefined();
    });
  });

  describe('saving', () => {
    it('marks Save aria-disabled while nothing changed and a click sends nothing', async () => {
      const user = userEvent.setup();
      await loaded();

      expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
      await user.click(saveButton());

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('enables Save once a field changed', async () => {
      const user = userEvent.setup();
      await loaded();

      await user.type(nameInput(), '!');

      expect(saveButton()).not.toHaveAttribute('aria-disabled');
    });

    it('returns to disabled when the change is reverted', async () => {
      const user = userEvent.setup();
      await loaded();

      await user.type(nameInput(), '!');
      await user.type(nameInput(), '{Backspace}');

      expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    });

    it('sends no entriesLanguage when only the name changed', async () => {
      const user = userEvent.setup();
      mockUpdate.mockResolvedValue({ ...SETTINGS, householdName: 'Renamed' });
      await loaded();

      await user.clear(nameInput());
      await user.type(nameInput(), 'Renamed');
      await user.click(saveButton());

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      const body = mockUpdate.mock.calls[0]![0];
      expect(body).toEqual({ householdName: 'Renamed', householdAddress: '1 Example Lane' });
      expect('entriesLanguage' in body).toBe(false);
    });

    it('sends entriesLanguage when the language changed', async () => {
      const user = userEvent.setup();
      mockUpdate.mockResolvedValue({ ...SETTINGS, entriesLanguage: 'en' });
      await loaded();

      await user.selectOptions(languageSelect(), 'en');
      await user.click(saveButton());

      expect(mockUpdate).toHaveBeenCalledWith({
        householdName: 'Sample House',
        householdAddress: '1 Example Lane',
        entriesLanguage: 'en',
      });
    });

    it('trims the name and address and sends null for blanks', async () => {
      const user = userEvent.setup();
      mockUpdate.mockResolvedValue({
        householdName: null,
        householdAddress: 'Trimmed Street',
        entriesLanguage: 'de',
      });
      await loaded();

      await user.clear(nameInput());
      await user.type(nameInput(), '   ');
      await user.clear(addressInput());
      await user.type(addressInput(), '  Trimmed Street  ');
      await user.click(saveButton());

      expect(mockUpdate).toHaveBeenCalledWith({
        householdName: null,
        householdAddress: 'Trimmed Street',
      });
    });

    it('updates the context, the fields and shows the status banner on success', async () => {
      const user = userEvent.setup();
      mockUpdate.mockResolvedValue({
        householdName: 'Renamed',
        householdAddress: '1 Example Lane',
        entriesLanguage: 'en',
      });
      await loaded();

      await user.clear(nameInput());
      await user.type(nameInput(), 'Renamed');
      await user.selectOptions(languageSelect(), 'en');
      await user.click(saveButton());

      expect(await screen.findByRole('status')).toHaveTextContent('House details saved.');
      expect(mockSetHouseName).toHaveBeenCalledWith('Renamed');
      expect(mockSetEntriesLanguage).toHaveBeenCalledWith('en');
      expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
      expect(languageSelect().value).toBe('en');
    });

    it('shows the translated server error in an alert and keeps the values on failure', async () => {
      const user = userEvent.setup();
      mockUpdate.mockRejectedValue(
        new ApiClientError(400, { code: 'VALIDATION_ERROR', message: 'raw server text' }),
      );
      await loaded();

      await user.type(nameInput(), '!');
      await user.click(saveButton());

      const alert = await screen.findByRole('alert');
      expect(alert).not.toHaveTextContent('raw server text');
      expect(nameInput().value).toBe('Sample House!');
      expect(mockSetHouseName).not.toHaveBeenCalled();
      expect(mockSetEntriesLanguage).not.toHaveBeenCalled();
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('shows the generic message for a non-API failure', async () => {
      const user = userEvent.setup();
      mockUpdate.mockRejectedValue(new Error('boom'));
      await loaded();

      await user.type(nameInput(), '!');
      await user.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't save the house details. Try again.",
      );
    });

    it('clears the previous banner when saving again', async () => {
      const user = userEvent.setup();
      mockUpdate.mockResolvedValueOnce({ ...SETTINGS, householdName: 'One' });
      await loaded();
      await user.clear(nameInput());
      await user.type(nameInput(), 'One');
      await user.click(saveButton());
      await screen.findByRole('status');

      mockUpdate.mockRejectedValueOnce(new Error('boom'));
      await user.type(nameInput(), '2');
      await user.click(saveButton());

      await screen.findByRole('alert');
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('shows Saving and ignores a second submit while the request runs', async () => {
      const user = userEvent.setup();
      let finish: (value: HouseholdSettings) => void = () => {};
      mockUpdate.mockImplementation(
        () =>
          new Promise<HouseholdSettings>((resolve) => {
            finish = resolve;
          }),
      );
      await loaded();
      await user.type(nameInput(), '!');

      await user.click(saveButton());
      expect(saveButton()).toHaveTextContent('Saving');
      expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
      await user.click(saveButton());

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      finish({ ...SETTINGS, householdName: 'Sample House!' });
      await screen.findByRole('status');
    });

    it('saves on Enter in the name field', async () => {
      const user = userEvent.setup();
      mockUpdate.mockResolvedValue({ ...SETTINGS, householdName: 'Sample House!' });
      await loaded();

      await user.type(nameInput(), '!{Enter}');

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    });
  });

  it('ignores a settings response that arrives after unmount', async () => {
    let resolve: (value: HouseholdSettings) => void = () => {};
    mockFetch.mockReturnValue(
      new Promise<HouseholdSettings>((res) => {
        resolve = res;
      }),
    );
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const onSettled = jest.fn<() => void>();
    const view = renderSection(onSettled);

    view.unmount();
    resolve(SETTINGS);
    await Promise.resolve();

    expect(errorSpy).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
