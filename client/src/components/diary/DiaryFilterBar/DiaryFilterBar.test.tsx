/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DiaryEntryType } from '@cornerstone/shared';
import { DiaryFilterBar } from './DiaryFilterBar.js';

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
    filterMode: 'all' as 'all' | 'manual' | 'automatic',
    onFilterModeChange: jest.fn<(mode: 'all' | 'manual' | 'automatic') => void>(),
  };

  beforeEach(() => {
    localStorage.setItem('theme', 'light');
    jest.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderFilterBar = (overrides: Partial<typeof defaultProps> = {}) =>
    render(<DiaryFilterBar {...defaultProps} {...overrides} />);

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

  it('renders type filter chips for all entry types (invoice_created grouped under invoice_status)', () => {
    renderFilterBar();
    const expectedTypes: DiaryEntryType[] = [
      'daily_log',
      'site_visit',
      'delivery',
      'issue',
      'general_note',
      'work_item_status',
      'invoice_status',
      'milestone_delay',
      'budget_breach',
      'auto_reschedule',
      'subsidy_status',
    ];
    for (const type of expectedTypes) {
      expect(screen.getByTestId(`type-filter-${type}`)).toBeInTheDocument();
    }
    // invoice_created is grouped under invoice_status chip — no separate chip
    expect(screen.queryByTestId('type-filter-invoice_created')).not.toBeInTheDocument();
  });

  // ─── Filter mode chips ─────────────────────────────────────────────────────

  it('renders mode chips All, Manual and Automatic', () => {
    renderFilterBar();
    expect(screen.getByTestId('mode-filter-all')).toBeInTheDocument();
    expect(screen.getByTestId('mode-filter-manual')).toBeInTheDocument();
    expect(screen.getByTestId('mode-filter-automatic')).toBeInTheDocument();
  });

  it('All mode chip is active by default (aria-pressed="true")', () => {
    renderFilterBar();
    expect(screen.getByTestId('mode-filter-all')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('mode-filter-manual')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('mode-filter-automatic')).toHaveAttribute('aria-pressed', 'false');
  });

  it('active mode chip has modeChipActive CSS class', () => {
    renderFilterBar({ filterMode: 'manual' });
    expect(screen.getByTestId('mode-filter-manual').getAttribute('class') ?? '').toContain(
      'modeChipActive',
    );
    expect(screen.getByTestId('mode-filter-all').getAttribute('class') ?? '').not.toContain(
      'modeChipActive',
    );
  });

  it('clicking Manual mode chip calls onFilterModeChange with "manual"', async () => {
    const user = userEvent.setup();
    const onFilterModeChange = jest.fn<(mode: 'all' | 'manual' | 'automatic') => void>();
    renderFilterBar({ onFilterModeChange });

    await user.click(screen.getByTestId('mode-filter-manual'));

    expect(onFilterModeChange).toHaveBeenCalledWith('manual');
  });

  it('clicking Automatic mode chip calls onFilterModeChange with "automatic"', async () => {
    const user = userEvent.setup();
    const onFilterModeChange = jest.fn<(mode: 'all' | 'manual' | 'automatic') => void>();
    renderFilterBar({ onFilterModeChange });

    await user.click(screen.getByTestId('mode-filter-automatic'));

    expect(onFilterModeChange).toHaveBeenCalledWith('automatic');
  });

  it('clicking All mode chip calls onFilterModeChange with "all"', async () => {
    const user = userEvent.setup();
    const onFilterModeChange = jest.fn<(mode: 'all' | 'manual' | 'automatic') => void>();
    renderFilterBar({ filterMode: 'manual', onFilterModeChange });

    await user.click(screen.getByTestId('mode-filter-all'));

    expect(onFilterModeChange).toHaveBeenCalledWith('all');
  });

  it('when filterMode="manual", renders exactly 5 manual type chips', () => {
    renderFilterBar({ filterMode: 'manual' });
    const manualTypes: DiaryEntryType[] = [
      'daily_log',
      'site_visit',
      'delivery',
      'issue',
      'general_note',
    ];
    for (const type of manualTypes) {
      expect(screen.getByTestId(`type-filter-${type}`)).toBeInTheDocument();
    }
    // Automatic types should not be rendered
    expect(screen.queryByTestId('type-filter-work_item_status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('type-filter-invoice_status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('type-filter-invoice_created')).not.toBeInTheDocument();
    expect(screen.queryByTestId('type-filter-milestone_delay')).not.toBeInTheDocument();
    expect(screen.queryByTestId('type-filter-budget_breach')).not.toBeInTheDocument();
    expect(screen.queryByTestId('type-filter-auto_reschedule')).not.toBeInTheDocument();
    expect(screen.queryByTestId('type-filter-subsidy_status')).not.toBeInTheDocument();
  });

  it('when filterMode="automatic", renders automatic type chips (invoice_created hidden)', () => {
    renderFilterBar({ filterMode: 'automatic' });
    const automaticTypes: DiaryEntryType[] = [
      'work_item_status',
      'invoice_status',
      'milestone_delay',
      'budget_breach',
      'auto_reschedule',
      'subsidy_status',
    ];
    for (const type of automaticTypes) {
      expect(screen.getByTestId(`type-filter-${type}`)).toBeInTheDocument();
    }
    // invoice_created is grouped under invoice_status
    expect(screen.queryByTestId('type-filter-invoice_created')).not.toBeInTheDocument();
    // Manual types should not be rendered
    expect(screen.queryByTestId('type-filter-daily_log')).not.toBeInTheDocument();
    expect(screen.queryByTestId('type-filter-site_visit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('type-filter-delivery')).not.toBeInTheDocument();
    expect(screen.queryByTestId('type-filter-issue')).not.toBeInTheDocument();
    expect(screen.queryByTestId('type-filter-general_note')).not.toBeInTheDocument();
  });

  it('when filterMode="all" (default), all visible type chips are rendered (invoice_created hidden)', () => {
    renderFilterBar({ filterMode: 'all' });
    const visibleTypes: DiaryEntryType[] = [
      'daily_log',
      'site_visit',
      'delivery',
      'issue',
      'general_note',
      'work_item_status',
      'invoice_status',
      'milestone_delay',
      'budget_breach',
      'auto_reschedule',
      'subsidy_status',
    ];
    for (const type of visibleTypes) {
      expect(screen.getByTestId(`type-filter-${type}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('type-filter-invoice_created')).not.toBeInTheDocument();
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
    expect(calls[calls.length - 1][0]).toBe('e'); // last character typed
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
    // The text will be "🔍 Filters" without a number badge
    expect(toggleButton.textContent).not.toMatch(/[1-9]/);
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
});
