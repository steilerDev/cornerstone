/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { HISTORY_EVENT_TYPES } from '@cornerstone/shared';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { CommandSearchProvider } from '../../components/CommandSearch/CommandSearchContext.js';
import { HistoryFilters } from './HistoryFilters.js';
import type { HistoryFiltersProps } from './HistoryFilters.js';
import type { HistoryFilters as FilterState } from './historyQuery.js';

const WIDE = '(min-width: 768px)';

const EMPTY: FilterState = {
  type: null,
  object: null,
  q: '',
  dateFrom: '',
  dateTo: '',
  includeDiary: false,
};

let media: MatchMediaControl;

beforeEach(() => {
  media = installMatchMedia({ [WIDE]: true });
});

afterEach(() => {
  media.restore();
});

function setup(over: Partial<HistoryFiltersProps> = {}) {
  const props: HistoryFiltersProps = {
    filters: EMPTY,
    searchInput: '',
    onSearchInput: jest.fn(),
    onChange: jest.fn(),
    onClear: jest.fn(),
    objectName: null,
    objectExists: null,
    ...over,
  };
  const view = render(<HistoryFilters {...props} />);
  return { props, ...view };
}

const typeChip = (value: string) => screen.getByTestId(`history-type-${value}`);
const toggle = () => screen.getByTestId('history-filters-toggle');
const panel = () => document.getElementById('history-filter-panel') as HTMLElement;

describe('HistoryFilters: type chips', () => {
  it('renders one chip per History type, in order, with English words', () => {
    setup();
    const chips = screen
      .getByRole('group', { name: 'Filter by type' })
      .querySelectorAll('[data-chip-value]');
    expect(Array.from(chips, (c) => c.getAttribute('data-chip-value'))).toEqual([
      ...HISTORY_EVENT_TYPES,
    ]);
    expect(typeChip('work_item_status')).toHaveTextContent('Task status');
    expect(typeChip('payment')).toHaveTextContent('Payment');
    expect(typeChip('submission')).toHaveTextContent('Submission');
    expect(typeChip('auto_reschedule')).toHaveTextContent('Schedule update');
  });

  it('marks only the active type as pressed', () => {
    setup({ filters: { ...EMPTY, type: 'payment' } });
    expect(typeChip('payment')).toHaveAttribute('aria-pressed', 'true');
    expect(typeChip('submission')).toHaveAttribute('aria-pressed', 'false');
  });

  it('pressing a chip selects its type', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(typeChip('submission'));
    expect(props.onChange).toHaveBeenCalledWith({ type: 'submission' });
  });

  it('pressing the active chip again clears the type', async () => {
    const user = userEvent.setup();
    const { props } = setup({ filters: { ...EMPTY, type: 'payment' } });
    await user.click(typeChip('payment'));
    expect(props.onChange).toHaveBeenCalledWith({ type: null });
  });

  it('scrolls sideways on phones and wraps on wide screens', () => {
    const { unmount } = setup();
    expect(screen.getByRole('group', { name: 'Filter by type' })).toHaveAttribute(
      'data-layout',
      'wrap',
    );
    unmount();
    media.set(WIDE, false);
    setup();
    expect(screen.getByRole('group', { name: 'Filter by type' })).toHaveAttribute(
      'data-layout',
      'scroll',
    );
  });
});

describe('HistoryFilters: panel', () => {
  it('is always visible on wide screens', () => {
    setup();
    expect(panel()).not.toHaveAttribute('hidden');
  });

  it('is hidden on phones until the Filters button is pressed', async () => {
    media.set(WIDE, false);
    const user = userEvent.setup();
    setup();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(toggle()).toHaveAttribute('aria-controls', 'history-filter-panel');
    expect(panel()).toHaveAttribute('hidden');

    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(toggle().className).toContain('filtersToggleOpen');
    expect(panel()).not.toHaveAttribute('hidden');
    expect(toggle()).toHaveFocus();

    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(toggle().className).not.toContain('filtersToggleOpen');
    expect(panel()).toHaveAttribute('hidden');
  });

  it('starts open on a phone when a non-type filter is already set', () => {
    media.set(WIDE, false);
    setup({ filters: { ...EMPTY, q: 'roof' }, searchInput: 'roof' });
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(panel()).not.toHaveAttribute('hidden');
  });

  it('starts closed on a phone when only the type is set', () => {
    media.set(WIDE, false);
    setup({ filters: { ...EMPTY, type: 'payment' } });
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('counts the active non-type filters on the toggle', () => {
    setup({
      filters: {
        type: 'payment',
        object: { entityType: 'invoice', entityId: 'inv-1' },
        q: 'x',
        dateFrom: '2026-01-01',
        dateTo: '',
        includeDiary: true,
      },
    });
    expect(toggle()).toHaveTextContent('Filters4');
  });

  it('shows no count when nothing but the type is set', () => {
    setup({ filters: { ...EMPTY, type: 'payment' } });
    expect(toggle()).toHaveTextContent(/^Filters$/);
  });
});

describe('HistoryFilters: inputs', () => {
  it('shows the search draft and reports typing', () => {
    const { props } = setup({ searchInput: 'roo' });
    const input = screen.getByTestId('history-search-input') as HTMLInputElement;
    expect(input.value).toBe('roo');
    expect(input).toHaveAttribute('data-page-search');
    expect(screen.getByLabelText('Search')).toBe(input);
    fireEvent.change(input, { target: { value: 'roof' } });
    expect(props.onSearchInput).toHaveBeenCalledWith('roof');
  });

  it('Escape clears a non-empty draft, stops propagation and prevents the default', () => {
    const outer = jest.fn();
    document.addEventListener('keydown', outer);
    try {
      const { props } = setup({ searchInput: 'abc' });
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        screen.getByTestId('history-search-input').dispatchEvent(event);
      });
      expect(props.onSearchInput).toHaveBeenCalledWith('');
      expect(event.defaultPrevented).toBe(true);
      expect(outer).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', outer);
    }
  });

  it('Escape in an empty field does nothing but still stops propagation', () => {
    const outer = jest.fn();
    document.addEventListener('keydown', outer);
    try {
      const { props } = setup();
      fireEvent.keyDown(screen.getByTestId('history-search-input'), { key: 'Escape' });
      expect(props.onSearchInput).not.toHaveBeenCalled();
      expect(outer).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', outer);
    }
  });

  it('other keys in the field are swallowed without clearing', () => {
    const { props } = setup({ searchInput: 'abc' });
    fireEvent.keyDown(screen.getByTestId('history-search-input'), { key: 'a' });
    expect(props.onSearchInput).not.toHaveBeenCalled();
  });

  it('offers "Search everywhere" under the field inside the shell', () => {
    const onOpen = jest.fn();
    render(
      <CommandSearchProvider isOpen={false} onOpen={onOpen} onClose={() => {}}>
        <HistoryFilters
          filters={EMPTY}
          searchInput="roof"
          onSearchInput={() => {}}
          onChange={() => {}}
          onClear={() => {}}
          objectName={null}
          objectExists={null}
        />
      </CommandSearchProvider>,
    );
    fireEvent.click(screen.getByTestId('search-everywhere-row'));
    const options = onOpen.mock.calls[0]![0] as {
      query: string;
      returnFocusRef: { current: HTMLElement | null };
    };
    expect(options.query).toBe('roof');
    expect(options.returnFocusRef.current).toBe(screen.getByTestId('history-search-input'));
  });

  it('reports date changes and links them with min and max', () => {
    const { props } = setup({
      filters: { ...EMPTY, dateFrom: '2026-01-05', dateTo: '2026-02-01' },
    });
    const from = screen.getByTestId('history-date-from') as HTMLInputElement;
    const to = screen.getByTestId('history-date-to') as HTMLInputElement;
    expect(from.value).toBe('2026-01-05');
    expect(to.value).toBe('2026-02-01');
    expect(from).toHaveAttribute('max', '2026-02-01');
    expect(to).toHaveAttribute('min', '2026-01-05');

    fireEvent.change(from, { target: { value: '2026-01-10' } });
    fireEvent.change(to, { target: { value: '2026-02-10' } });
    expect(props.onChange).toHaveBeenCalledWith({ dateFrom: '2026-01-10' });
    expect(props.onChange).toHaveBeenCalledWith({ dateTo: '2026-02-10' });
  });

  it('sets no min or max when the other date is empty', () => {
    setup();
    expect(screen.getByTestId('history-date-from')).not.toHaveAttribute('max');
    expect(screen.getByTestId('history-date-to')).not.toHaveAttribute('min');
  });

  it('toggles "Include site diary entries" and describes it with its hint', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    const box = screen.getByTestId('history-include-diary');
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription(/Shows your own entries as well/);
    expect(screen.getByLabelText('Include site diary entries')).toBe(box);
    await user.click(box);
    expect(props.onChange).toHaveBeenCalledWith({ includeDiary: true });
  });

  it('shows the include box checked', () => {
    setup({ filters: { ...EMPTY, includeDiary: true } });
    expect(screen.getByTestId('history-include-diary')).toBeChecked();
  });

  it('passes the object filter its state and reports a cleared object', async () => {
    const user = userEvent.setup();
    const { props } = setup({
      filters: { ...EMPTY, object: { entityType: 'work_item', entityId: 'wi-1' } },
      objectName: 'Roof tiling',
      objectExists: true,
    });
    expect(screen.getByTestId('history-object-object')).toHaveTextContent('Object · Roof tiling');
    await user.click(screen.getByTestId('history-object-object'));
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(props.onChange).toHaveBeenCalledWith({ object: null });
  });
});

describe('HistoryFilters: clear', () => {
  it('has no Clear button without filters', () => {
    setup();
    expect(screen.queryByTestId('history-clear-filters')).toBeNull();
  });

  it.each([
    ['a type', { type: 'payment' as const }],
    ['an object', { object: { entityType: 'invoice' as const, entityId: 'i' } }],
    ['a search', { q: 'x' }],
    ['a from date', { dateFrom: '2026-01-01' }],
    ['a to date', { dateTo: '2026-01-01' }],
    ['the include toggle', { includeDiary: true }],
  ])('offers Clear filters for %s', (_name, patch) => {
    setup({ filters: { ...EMPTY, ...patch } });
    expect(screen.getByTestId('history-clear-filters')).toHaveTextContent('Clear filters');
  });

  it('calls onClear and moves focus to the first type chip once the button is gone', async () => {
    const user = userEvent.setup();
    const onClear = jest.fn();
    function Host() {
      const [filters, setFilters] = useState<FilterState>({ ...EMPTY, q: 'x' });
      return (
        <HistoryFilters
          filters={filters}
          searchInput={filters.q}
          onSearchInput={() => {}}
          onChange={() => {}}
          onClear={() => {
            onClear();
            setFilters(EMPTY);
          }}
          objectName={null}
          objectExists={null}
        />
      );
    }
    render(<Host />);
    await user.click(screen.getByTestId('history-clear-filters'));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('history-clear-filters')).toBeNull();
    await waitFor(() => expect(typeChip('work_item_status')).toHaveFocus());
  });

  it('does not steal focus when filters disappear for another reason', () => {
    const { rerender, props } = setup({ filters: { ...EMPTY, q: 'x' } });
    const input = screen.getByTestId('history-search-input');
    input.focus();
    rerender(<HistoryFilters {...props} filters={EMPTY} />);
    expect(input).toHaveFocus();
  });
});

describe('HistoryFilters: local drafts', () => {
  it('shows the include box checked at once while filters has not changed, then follows filters', async () => {
    const user = userEvent.setup();
    const { props, rerender } = setup();
    const box = screen.getByTestId('history-include-diary');
    await user.click(box);
    expect(props.onChange).toHaveBeenCalledWith({ includeDiary: true });
    expect(box).toBeChecked();

    // The URL lands: the draft and filters agree.
    rerender(<HistoryFilters {...props} filters={{ ...EMPTY, includeDiary: true }} />);
    expect(screen.getByTestId('history-include-diary')).toBeChecked();

    // Clear filters: the parent passes false and the box unchecks.
    rerender(<HistoryFilters {...props} filters={EMPTY} />);
    expect(screen.getByTestId('history-include-diary')).not.toBeChecked();
  });

  it('unchecks the include box when the parent resets it although the user had checked it', async () => {
    const user = userEvent.setup();
    const { props, rerender } = setup({ filters: { ...EMPTY, q: 'x' } });
    await user.click(screen.getByTestId('history-include-diary'));
    expect(screen.getByTestId('history-include-diary')).toBeChecked();
    // Parent never saw includeDiary: true, then clears everything (q changes, includeDiary stays false).
    rerender(<HistoryFilters {...props} filters={EMPTY} />);
    expect(screen.getByTestId('history-include-diary')).toBeChecked();
    rerender(<HistoryFilters {...props} filters={{ ...EMPTY, includeDiary: true }} />);
    rerender(<HistoryFilters {...props} filters={EMPTY} />);
    expect(screen.getByTestId('history-include-diary')).not.toBeChecked();
  });

  it.each([
    ['history-date-from', 'dateFrom'],
    ['history-date-to', 'dateTo'],
  ] as const)('%s shows the typed value at once and follows filters afterwards', (testId, key) => {
    const { props, rerender } = setup();
    const input = screen.getByTestId(testId) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2026-03-05' } });
    expect(props.onChange).toHaveBeenCalledWith({ [key]: '2026-03-05' });
    expect((screen.getByTestId(testId) as HTMLInputElement).value).toBe('2026-03-05');

    rerender(<HistoryFilters {...props} filters={{ ...EMPTY, [key]: '2026-03-05' }} />);
    expect((screen.getByTestId(testId) as HTMLInputElement).value).toBe('2026-03-05');

    rerender(<HistoryFilters {...props} filters={EMPTY} />);
    expect((screen.getByTestId(testId) as HTMLInputElement).value).toBe('');
  });
});
