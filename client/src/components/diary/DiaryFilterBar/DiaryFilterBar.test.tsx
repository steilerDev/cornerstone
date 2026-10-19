/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, render, act, fireEvent } from '@testing-library/react';
import type { ComponentProps } from 'react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { DiaryEntryType } from '@cornerstone/shared';
import i18n from '../../../i18n/index.js';
import { DiaryFilterBar } from './DiaryFilterBar.js';
import { CommandSearchProvider } from '../../CommandSearch/CommandSearchContext.js';

describe('DiaryFilterBar', () => {
  const defaultProps = {
    searchQuery: '',
    onSearchChange: jest.fn<(q: string) => void>(),
    dateFrom: '',
    onDateFromChange: jest.fn<(d: string) => void>(),
    dateTo: '',
    onDateToChange: jest.fn<(d: string) => void>(),
    activeTypes: [] as DiaryEntryType[],
    onTypesChange: jest.fn<(types: DiaryEntryType[]) => void>(),
    onClearAll: jest.fn<() => void>(),
  };

  beforeEach(() => {
    localStorage.setItem('theme', 'light');
    jest.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderFilterBar = (overrides: Partial<ComponentProps<typeof DiaryFilterBar>> = {}) =>
    render(
      <MemoryRouter>
        <DiaryFilterBar {...defaultProps} {...overrides} />
      </MemoryRouter>,
    );

  const chipOrder = (): (string | null)[] =>
    screen
      .getAllByTestId(/^type-filter-/)
      .map((el) => el.getAttribute('data-testid')?.replace('type-filter-', '') ?? null);

  // ─── Rendering ─────────────────────────────────────────────────────────────

  it('renders the filter bar container', () => {
    renderFilterBar();
    expect(screen.getByTestId('diary-filter-bar')).toBeInTheDocument();
  });

  it('renders the search input', () => {
    renderFilterBar();
    expect(screen.getByTestId('diary-search-input')).toBeInTheDocument();
  });

  it('renders the date-from input', () => {
    renderFilterBar();
    expect(screen.getByTestId('diary-date-from')).toBeInTheDocument();
  });

  it('renders the date-to input', () => {
    renderFilterBar();
    expect(screen.getByTestId('diary-date-to')).toBeInTheDocument();
  });

  it('renders only the five manual type chips, in order, and no automatic type chip', () => {
    renderFilterBar();
    expect(chipOrder()).toEqual(['daily_log', 'site_visit', 'delivery', 'issue', 'general_note']);
    for (const type of [
      'work_item_status',
      'invoice_status',
      'invoice_created',
      'milestone_delay',
      'budget_breach',
      'auto_reschedule',
      'subsidy_status',
    ]) {
      expect(screen.queryByTestId(`type-filter-${type}`)).not.toBeInTheDocument();
    }
  });

  it('renders no mode chips (All / Manual / Automatic / History) and no mode group', () => {
    renderFilterBar();
    expect(screen.queryByTestId('mode-filter-all')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mode-filter-manual')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mode-filter-automatic')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /filter by mode/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Automatic')).not.toBeInTheDocument();
  });

  it('shows a History link to /history whose accessible name starts with its visible text', () => {
    renderFilterBar();
    const link = screen.getByTestId('diary-history-link');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/history');
    expect(link).toHaveTextContent(/^History\s*›$/);
    expect(screen.getByRole('link', { name: /^History/ })).toBe(link);
    expect(link).toHaveAccessibleName('History, the automatic record of changes');
  });

  it('shows the History link in German', async () => {
    await act(async () => {
      await i18n.changeLanguage('de');
    });
    try {
      renderFilterBar();
      expect(screen.getByTestId('diary-history-link')).toHaveTextContent(/^Verlauf\s*›$/);
      expect(screen.getByRole('link', { name: /^Verlauf/ })).toBeInTheDocument();
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  // ─── Type chip interaction ─────────────────────────────────────────────────

  it('calls onTypesChange with toggled type when inactive chip is clicked', async () => {
    const user = userEvent.setup();
    const onTypesChange = jest.fn<(types: DiaryEntryType[]) => void>();
    renderFilterBar({ activeTypes: [], onTypesChange });

    await user.click(screen.getByTestId('type-filter-daily_log'));

    expect(onTypesChange).toHaveBeenCalledWith(['daily_log']);
  });

  it('calls onTypesChange without the type when active chip is clicked', async () => {
    const user = userEvent.setup();
    const onTypesChange = jest.fn<(types: DiaryEntryType[]) => void>();
    renderFilterBar({ activeTypes: ['daily_log', 'issue'], onTypesChange });

    await user.click(screen.getByTestId('type-filter-daily_log'));

    expect(onTypesChange).toHaveBeenCalledWith(['issue']);
  });

  it('sets aria-pressed="true" on active type chips', () => {
    renderFilterBar({ activeTypes: ['site_visit'] });
    const chip = screen.getByTestId('type-filter-site_visit');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('sets aria-pressed="false" on inactive type chips', () => {
    renderFilterBar({ activeTypes: [] });
    const chip = screen.getByTestId('type-filter-daily_log');
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  // ─── Search input ──────────────────────────────────────────────────────────

  it('calls onSearchChange when search input value changes', async () => {
    const user = userEvent.setup();
    const onSearchChange = jest.fn<(q: string) => void>();
    renderFilterBar({ onSearchChange });

    const searchInput = screen.getByTestId('diary-search-input');
    await user.type(searchInput, 'concrete');

    expect(onSearchChange).toHaveBeenCalled();
    // Last call should have the final value
    const calls = onSearchChange.mock.calls;
    expect(calls[calls.length - 1]![0]).toBe('e'); // last character typed
  });

  it('shows the current search query value in the input', () => {
    renderFilterBar({ searchQuery: 'foundation work' });
    const input = screen.getByTestId('diary-search-input') as HTMLInputElement;
    expect(input.value).toBe('foundation work');
  });

  // ─── Date inputs ───────────────────────────────────────────────────────────

  it('calls onDateFromChange when date-from input changes', async () => {
    const user = userEvent.setup();
    const onDateFromChange = jest.fn<(d: string) => void>();
    renderFilterBar({ onDateFromChange });

    const dateFrom = screen.getByTestId('diary-date-from');
    await user.type(dateFrom, '2026-03-01');

    expect(onDateFromChange).toHaveBeenCalled();
  });

  it('calls onDateToChange when date-to input changes', async () => {
    const user = userEvent.setup();
    const onDateToChange = jest.fn<(d: string) => void>();
    renderFilterBar({ onDateToChange });

    const dateTo = screen.getByTestId('diary-date-to');
    await user.type(dateTo, '2026-03-31');

    expect(onDateToChange).toHaveBeenCalled();
  });

  it('shows the current dateFrom value in the input', () => {
    renderFilterBar({ dateFrom: '2026-03-01' });
    const input = screen.getByTestId('diary-date-from') as HTMLInputElement;
    expect(input.value).toBe('2026-03-01');
  });

  it('shows the current dateTo value in the input', () => {
    renderFilterBar({ dateTo: '2026-03-31' });
    const input = screen.getByTestId('diary-date-to') as HTMLInputElement;
    expect(input.value).toBe('2026-03-31');
  });

  // ─── Active filter count badge ─────────────────────────────────────────────

  it('shows filter count badge when search is active', () => {
    renderFilterBar({ searchQuery: 'test' });
    // The mobile toggle shows the badge
    const toggleButton = screen.getByRole('button', { name: /toggle filters/i });
    expect(toggleButton.textContent).toContain('1');
  });

  it('shows filter count badge when dateFrom is active', () => {
    renderFilterBar({ dateFrom: '2026-03-01' });
    const toggleButton = screen.getByRole('button', { name: /toggle filters/i });
    expect(toggleButton.textContent).toContain('1');
  });

  it('does not show filter count when no filters are active', () => {
    renderFilterBar({ searchQuery: '', dateFrom: '', dateTo: '', activeTypes: [] });
    const toggleButton = screen.getByRole('button', { name: /toggle filters/i });
    // Badge should not be rendered when filterCount === 0
    // The text will be "🔍 Filters" (diary:filterBar.filtersToggle) without a number badge
    expect(toggleButton.textContent).not.toMatch(/[1-9]/);
  });

  // ─── Chip labels and order (one word per type: common canonical or diary automatic) ──────────────────────────

  it('shows one canonical word per manual type', () => {
    renderFilterBar();
    expect(screen.getByTestId('type-filter-general_note')).toHaveTextContent(/^Note$/);
    expect(screen.getByTestId('type-filter-issue')).toHaveTextContent(/^Defect$/);
    expect(screen.getByTestId('type-filter-daily_log')).toHaveTextContent(/^Daily log$/);
  });

  it('the mobile toggle gets the shared filtersToggleOpen class only while the filters are open', () => {
    renderFilterBar();
    const toggle = screen.getByRole('button', { name: 'Toggle filters' });
    expect(toggle.className).toContain('filtersToggle');
    expect(toggle.className).not.toContain('filtersToggleOpen');
    fireEvent.click(toggle);
    expect(toggle.className).toContain('filtersToggleOpen');
    fireEvent.click(toggle);
    expect(toggle.className).not.toContain('filtersToggleOpen');
  });

  it('shows the English filters toggle text', () => {
    renderFilterBar();
    expect(screen.getByRole('button', { name: 'Toggle filters' })).toHaveTextContent(
      /^🔍 Filters\s*$/,
    );
  });

  it('shows German chip labels and toggle text when the language is German', async () => {
    await act(async () => {
      await i18n.changeLanguage('de');
    });
    try {
      renderFilterBar();
      expect(screen.getByTestId('type-filter-general_note')).toHaveTextContent(/^Notiz$/);
      expect(screen.getByRole('button', { name: 'Filter ein-/ausblenden' })).toHaveTextContent(
        /^🔍 Filter\s*$/,
      );
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  it('Escape in the search input clears a non-empty query and stops propagation', async () => {
    const user = userEvent.setup();
    const outer = jest.fn();
    document.addEventListener('keydown', outer);
    try {
      renderFilterBar({ searchQuery: 'abc' });
      await user.type(screen.getByTestId('diary-search-input'), '{Escape}');
      expect(defaultProps.onSearchChange).toHaveBeenCalledWith('');
      expect(outer).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', outer);
    }
  });

  it('Escape in an empty search input does not call onSearchChange', async () => {
    const user = userEvent.setup();
    renderFilterBar({ searchQuery: '' });
    await user.type(screen.getByTestId('diary-search-input'), '{Escape}');
    expect(defaultProps.onSearchChange).not.toHaveBeenCalled();
  });

  // ─── Clear all button ──────────────────────────────────────────────────────

  it('shows clear all button when there are active filters', () => {
    renderFilterBar({ searchQuery: 'test' });
    expect(screen.getByTestId('clear-filters-button')).toBeInTheDocument();
  });

  it('does not show clear all button when no filters are active', () => {
    renderFilterBar({ searchQuery: '', dateFrom: '', dateTo: '', activeTypes: [] });
    expect(screen.queryByTestId('clear-filters-button')).not.toBeInTheDocument();
  });

  it('calls onClearAll when clear all button is clicked', async () => {
    const user = userEvent.setup();
    const onClearAll = jest.fn<() => void>();
    renderFilterBar({ searchQuery: 'test', onClearAll });

    await user.click(screen.getByTestId('clear-filters-button'));

    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  // ─── Type chips group ──────────────────────────────────────────────────────

  it('renders the type chips group with role="group"', () => {
    renderFilterBar();
    expect(screen.getByRole('group', { name: /filter by entry type/i })).toBeInTheDocument();
  });

  it('active chip has different class to indicate active state', () => {
    renderFilterBar({ activeTypes: ['issue'] });
    const activeChip = screen.getByTestId('type-filter-issue');
    const inactiveChip = screen.getByTestId('type-filter-daily_log');
    // CSS modules proxy maps class names to themselves
    expect(activeChip.getAttribute('class') ?? '').toContain('typeChipActive');
    expect(inactiveChip.getAttribute('class') ?? '').not.toContain('typeChipActive');
  });

  // ─── Mobile toggle behavior (Bug #1688) ───────────────────────────────────

  describe('Mobile toggle behavior', () => {
    it('toggle button is present in the document', () => {
      renderFilterBar();
      expect(screen.getByRole('button', { name: /toggle filters/i })).toBeInTheDocument();
    });

    it('filter panel is closed by default — filters container does not have filtersOpen class', () => {
      renderFilterBar();
      const toggleButton = screen.getByRole('button', { name: /toggle filters/i });
      const filtersContainer = toggleButton.nextElementSibling as HTMLElement;
      expect(filtersContainer.className).not.toContain('filtersOpen');
    });

    it('clicking the toggle button opens the panel — filters container className includes filtersOpen', async () => {
      const user = userEvent.setup();
      renderFilterBar();
      const toggleButton = screen.getByRole('button', { name: /toggle filters/i });

      await user.click(toggleButton);

      const filtersContainer = toggleButton.nextElementSibling as HTMLElement;
      expect(filtersContainer.className).toContain('filtersOpen');
    });

    it('clicking the toggle button twice closes the panel — filtersOpen removed after second click', async () => {
      const user = userEvent.setup();
      renderFilterBar();
      const toggleButton = screen.getByRole('button', { name: /toggle filters/i });

      await user.click(toggleButton);
      await user.click(toggleButton);

      const filtersContainer = toggleButton.nextElementSibling as HTMLElement;
      expect(filtersContainer.className).not.toContain('filtersOpen');
    });

    it('toggle button has aria-expanded="false" when panel is closed (initial state)', () => {
      renderFilterBar();
      const toggleButton = screen.getByRole('button', { name: /toggle filters/i });
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('toggle button has aria-expanded="true" after one click', async () => {
      const user = userEvent.setup();
      renderFilterBar();
      const toggleButton = screen.getByRole('button', { name: /toggle filters/i });

      await user.click(toggleButton);

      expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    });
  });

  // ─── Drafts chip (Story #1446) ────────────────────────────────────────────

  describe('drafts chip (Story #1446)', () => {
    it('Scenario 12: chip absent when onDraftsVisibleChange prop is not provided', () => {
      renderFilterBar();
      expect(screen.queryByTestId('status-filter-drafts')).not.toBeInTheDocument();
    });

    it('Scenario 13: chip is present and aria-pressed=true when draftsVisible=true', () => {
      renderFilterBar({
        draftsVisible: true,
        onDraftsVisibleChange: jest.fn<(v: boolean) => void>(),
      });
      const chip = screen.getByTestId('status-filter-drafts');
      expect(chip).toBeInTheDocument();
      expect(chip).toHaveAttribute('aria-pressed', 'true');
    });

    it('Scenario 14: chip is present and aria-pressed=false when draftsVisible=false', () => {
      renderFilterBar({
        draftsVisible: false,
        onDraftsVisibleChange: jest.fn<(v: boolean) => void>(),
      });
      const chip = screen.getByTestId('status-filter-drafts');
      expect(chip).toBeInTheDocument();
      expect(chip).toHaveAttribute('aria-pressed', 'false');
    });

    it('Scenario 15: clicking pressed chip calls onDraftsVisibleChange(false)', async () => {
      const user = userEvent.setup();
      const onDraftsVisibleChange = jest.fn<(v: boolean) => void>();
      renderFilterBar({
        draftsVisible: true,
        onDraftsVisibleChange,
      });

      await user.click(screen.getByTestId('status-filter-drafts'));

      expect(onDraftsVisibleChange).toHaveBeenCalledWith(false);
    });

    it('Scenario 16: clicking unpressed chip calls onDraftsVisibleChange(true)', async () => {
      const user = userEvent.setup();
      const onDraftsVisibleChange = jest.fn<(v: boolean) => void>();
      renderFilterBar({
        draftsVisible: false,
        onDraftsVisibleChange,
      });

      await user.click(screen.getByTestId('status-filter-drafts'));

      expect(onDraftsVisibleChange).toHaveBeenCalledWith(true);
    });

    it('Scenario 17: the drafts chip has its own accessible group and is the only status control', async () => {
      const user = userEvent.setup();
      const onDraftsVisibleChange = jest.fn<(v: boolean) => void>();
      renderFilterBar({ draftsVisible: false, onDraftsVisibleChange });

      expect(screen.getByRole('group', { name: /filter by draft status/i })).toBeInTheDocument();
      await user.click(screen.getByTestId('status-filter-drafts'));
      expect(onDraftsVisibleChange).toHaveBeenCalledWith(true);
      expect(defaultProps.onTypesChange).not.toHaveBeenCalled();
    });
  });

  describe('search everywhere (#2211)', () => {
    const inShell = (
      overrides: Partial<ComponentProps<typeof DiaryFilterBar>> = {},
      onOpen: jest.Mock = jest.fn(),
    ) =>
      render(
        <MemoryRouter>
          <CommandSearchProvider isOpen={false} onOpen={onOpen} onClose={() => {}}>
            <DiaryFilterBar {...defaultProps} {...overrides} />
          </CommandSearchProvider>
        </MemoryRouter>,
      );

    it('marks the search field as the page search target', () => {
      renderFilterBar();
      expect(screen.getByTestId('diary-search-input')).toHaveAttribute('data-page-search');
    });

    it('shows the row directly under the field from two characters', () => {
      inShell({ searchQuery: 'ro' });
      const row = screen.getByTestId('search-everywhere-row');
      expect(row).toHaveTextContent('Search everywhere for “ro”');
      expect(row.previousElementSibling).toBe(screen.getByTestId('diary-search-input'));
    });

    it.each(['', 'r'])('shows no row for the draft %p', (searchQuery) => {
      inShell({ searchQuery });
      expect(screen.queryByTestId('search-everywhere-row')).toBeNull();
    });

    it('shows no row outside the shell', () => {
      renderFilterBar({ searchQuery: 'roof' });
      expect(screen.queryByTestId('search-everywhere-row')).toBeNull();
    });

    it('opens the search with the draft and the search field as the return target', () => {
      const onOpen = jest.fn();
      inShell({ searchQuery: 'roof' }, onOpen);
      fireEvent.click(screen.getByTestId('search-everywhere-row'));
      const options = onOpen.mock.calls[0]![0] as {
        query: string;
        returnFocusRef: { current: HTMLElement | null };
      };
      expect(options.query).toBe('roof');
      expect(options.returnFocusRef.current).toBe(screen.getByTestId('diary-search-input'));
    });

    it('still opens on Ctrl K typed in the field although the field stops keydown propagation', () => {
      const onOpen = jest.fn();
      inShell({}, onOpen);
      const field = screen.getByTestId('diary-search-input');
      field.focus();
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        field.dispatchEvent(event);
      });
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });
  });
});
