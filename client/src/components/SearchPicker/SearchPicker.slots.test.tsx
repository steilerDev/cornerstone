/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchPicker } from './SearchPicker.js';

interface TestItem {
  id: string;
  label: string;
  status: string;
}

const sampleItems: TestItem[] = [
  { id: 'item-1', label: 'Alpha Widget', status: 'active' },
  { id: 'item-2', label: 'Beta Gadget', status: 'inactive' },
  { id: 'item-3', label: 'Gamma Doohickey', status: 'active' },
];

const mockSearchFn = jest.fn<(query: string, excludeIds: string[]) => Promise<TestItem[]>>();
const mockRenderItem = (item: TestItem) => ({ id: item.id, label: item.label });

function renderPicker(
  props: Partial<React.ComponentProps<typeof SearchPicker<TestItem>>> & {
    value?: string;
    onChange?: (id: string) => void;
    excludeIds?: string[];
  } = {},
) {
  return render(
    <SearchPicker<TestItem>
      value={props.value ?? ''}
      onChange={props.onChange ?? jest.fn()}
      excludeIds={props.excludeIds ?? []}
      searchFn={mockSearchFn}
      renderItem={mockRenderItem}
      {...props}
    />,
  );
}

describe('SearchPicker', () => {
  // Shared across every test in this describe: fake timers remove the wall-clock
  // dependency from userEvent's real-timer-driven click/type interactions.
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockSearchFn.mockReset();
    mockSearchFn.mockResolvedValue(sampleItems);
    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── 7. Empty states ───────────────────────────────────────────────────────

  describe('empty states', () => {
    it('noResultsMessage shown when searchFn resolves with empty array after typing', async () => {
      mockSearchFn.mockResolvedValue([]);
      renderPicker({
        noResultsMessage: 'Nothing matches',
        placeholder: 'Search...',
      });

      const input = screen.getByPlaceholderText('Search...');
      await user.type(input, 'XYZ');

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText('Nothing matches')).toBeInTheDocument();
      });
    });

    it('uses default noResultsMessage "No matching items found" when not specified', async () => {
      mockSearchFn.mockResolvedValue([]);
      renderPicker({ placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.type(input, 'XYZ');

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText('No matching items found')).toBeInTheDocument();
      });
    });

    it('emptyHint shown when no query, no results, and no specialOptions', async () => {
      mockSearchFn.mockResolvedValue([]);
      // Open dropdown via typing then clearing back to empty to show emptyHint
      renderPicker({ placeholder: 'Search...', emptyHint: 'Start typing to search' });

      const input = screen.getByPlaceholderText('Search...');
      await user.type(input, 'A');

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      // Wait for search to run
      await waitFor(() => expect(screen.queryByText('Searching...')).not.toBeInTheDocument());

      // Clear the input
      await user.clear(input);

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText('Start typing to search')).toBeInTheDocument();
      });
    });

    it('uses default emptyHint "Type to search items" when not specified', async () => {
      mockSearchFn.mockResolvedValue([]);
      renderPicker({ placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.type(input, 'A');

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => expect(screen.queryByText('Searching...')).not.toBeInTheDocument());

      await user.clear(input);

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText('Type to search items')).toBeInTheDocument();
      });
    });
  });
});
// ── renderSecondary slot ──────────────────────────────────────────────────────
// Tests for the renderSecondary prop added to SearchPicker.
// These use the same TestItem / mockSearchFn / renderPicker helpers defined above.

describe('renderSecondary slot', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockSearchFn.mockReset();
    mockSearchFn.mockResolvedValue(sampleItems);
    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── 9. Secondary renders per item ─────────────────────────────────────────

  it('renders one secondary element per result item', async () => {
    renderPicker({
      showItemsOnFocus: true,
      renderSecondary: (item: TestItem) => <span data-testid="secondary-line">{item.status}</span>,
      placeholder: 'Search...',
    });

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    await waitFor(() => {
      const secondaries = screen.getAllByTestId('secondary-line');
      expect(secondaries).toHaveLength(3);
    });
  });

  // ── 10. CSS classes applied (identity-obj-proxy) ──────────────────────────

  it('applies resultSecondary and resultContent CSS classes to each result', async () => {
    renderPicker({
      showItemsOnFocus: true,
      renderSecondary: (item: TestItem) => <span data-testid="secondary-line">{item.status}</span>,
      placeholder: 'Search...',
    });

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    await waitFor(() => {
      // identity-obj-proxy returns the class name as a string, so class="resultSecondary"
      const secondarySpans = document.querySelectorAll('[class*="resultSecondary"]');
      expect(secondarySpans).toHaveLength(3);

      const contentSpans = document.querySelectorAll('[class*="resultContent"]');
      expect(contentSpans).toHaveLength(3);
    });
  });

  // ── 11. No secondary DOM when prop absent (regression guard) ──────────────

  it('renders no resultSecondary or resultContent elements when renderSecondary is absent', async () => {
    renderPicker({
      showItemsOnFocus: true,
      placeholder: 'Search...',
      // renderSecondary intentionally omitted
    });

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Alpha Widget' })).toBeInTheDocument();
    });

    expect(document.querySelectorAll('[class*="resultSecondary"]')).toHaveLength(0);
    expect(document.querySelectorAll('[class*="resultContent"]')).toHaveLength(0);
  });

  // ── 11b. renderSecondary returning null → single-line rows (no secondary or content span) ──

  it('renderSecondary returning null renders single-line rows — no resultSecondary or resultContent', async () => {
    renderPicker({
      showItemsOnFocus: true,
      renderSecondary: (_item: TestItem) => null,
      placeholder: 'Search...',
    });

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Alpha Widget' })).toBeInTheDocument();
    });

    expect(document.querySelectorAll('[class*="resultSecondary"]')).toHaveLength(0);
    expect(document.querySelectorAll('[class*="resultContent"]')).toHaveLength(0);
  });

  // ── 11c. renderSecondary returning a string → title attribute equals that string ──

  it('renderSecondary returning a string sets title attribute equal to the string on each resultSecondary span', async () => {
    renderPicker({
      showItemsOnFocus: true,
      renderSecondary: (item: TestItem) => item.status,
      placeholder: 'Search...',
    });

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    await waitFor(() => {
      const secondarySpans = document.querySelectorAll('[class*="resultSecondary"]');
      expect(secondarySpans).toHaveLength(3);
    });

    const secondarySpans = document.querySelectorAll('[class*="resultSecondary"]');
    secondarySpans.forEach((span, i) => {
      const expectedStatus = sampleItems[i]!.status;
      expect((span as HTMLElement).getAttribute('title')).toBe(expectedStatus);
    });
  });

  // ── 12. Secondary NOT in selectedDisplay ─────────────────────────────────

  it('secondary element is absent after an item is selected', async () => {
    renderPicker({
      showItemsOnFocus: true,
      renderSecondary: (item: TestItem) => <span data-testid="secondary-line">{item.status}</span>,
      placeholder: 'Search...',
    });

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    await waitFor(() => expect(screen.getByText('Alpha Widget')).toBeInTheDocument());

    await user.click(screen.getByText('Alpha Widget'));

    await waitFor(() => {
      // After selection the input is replaced by selectedDisplay — no secondary
      expect(screen.queryByTestId('secondary-line')).not.toBeInTheDocument();
    });
  });
});

// ── renderSelectedLabel prop ──────────────────────────────────────────────────
// Tests for the renderSelectedLabel prop added to SearchPicker.
// When provided, the collapsed chip uses renderSelectedLabel(item) instead of
// renderItem(item).label, so decorators (e.g. em-dash indentation) do not appear
// in the chip while still appearing in the dropdown list rows.

describe('renderSelectedLabel prop', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockSearchFn.mockReset();
    mockSearchFn.mockResolvedValue(sampleItems);
    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('selected chip shows bare renderSelectedLabel, not decorated renderItem label', async () => {
    const decoratedRenderItem = (item: TestItem) => ({
      id: item.id,
      label: '— ' + item.label,
    });
    const bareRenderSelectedLabel = (item: TestItem) => item.label;

    render(
      <SearchPicker<TestItem>
        value=""
        onChange={jest.fn()}
        excludeIds={[]}
        searchFn={mockSearchFn}
        renderItem={decoratedRenderItem}
        renderSelectedLabel={bareRenderSelectedLabel}
        showItemsOnFocus={true}
        placeholder="Search..."
      />,
    );

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    // Wait for dropdown to show the decorated label
    await waitFor(() =>
      expect(screen.getByRole('option', { name: '— Alpha Widget' })).toBeInTheDocument(),
    );

    // Select "Alpha Widget" (clicking the option with decorated label)
    await user.click(screen.getByRole('option', { name: '— Alpha Widget' }));

    // After selection, the chip (selectedTitle) must show the BARE label, not decorated
    await waitFor(() => {
      const chip = document.querySelector('[class*="selectedTitle"]');
      expect(chip).not.toBeNull();
      expect(chip!.textContent).toBe('Alpha Widget');
      // Decorated prefix must NOT appear on the chip
      expect(chip!.textContent).not.toContain('— Alpha Widget');
    });
  });

  it('dropdown option rows still show the decorated renderItem label after renderSelectedLabel is provided', async () => {
    const decoratedRenderItem = (item: TestItem) => ({
      id: item.id,
      label: '— ' + item.label,
    });
    const bareRenderSelectedLabel = (item: TestItem) => item.label;

    render(
      <SearchPicker<TestItem>
        value=""
        onChange={jest.fn()}
        excludeIds={[]}
        searchFn={mockSearchFn}
        renderItem={decoratedRenderItem}
        renderSelectedLabel={bareRenderSelectedLabel}
        showItemsOnFocus={true}
        placeholder="Search..."
      />,
    );

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    // Dropdown options show decorated labels
    await waitFor(() => {
      expect(screen.getByRole('option', { name: '— Alpha Widget' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '— Beta Gadget' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '— Gamma Doohickey' })).toBeInTheDocument();
    });

    // Bare labels must NOT appear as option text (they exist nowhere before selection)
    expect(screen.queryByRole('option', { name: 'Alpha Widget' })).not.toBeInTheDocument();
  });

  it('without renderSelectedLabel, chip shows the renderItem label (unchanged behaviour)', async () => {
    const decoratedRenderItem = (item: TestItem) => ({
      id: item.id,
      label: '— ' + item.label,
    });

    render(
      <SearchPicker<TestItem>
        value=""
        onChange={jest.fn()}
        excludeIds={[]}
        searchFn={mockSearchFn}
        renderItem={decoratedRenderItem}
        showItemsOnFocus={true}
        placeholder="Search..."
      />,
    );

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    await waitFor(() =>
      expect(screen.getByRole('option', { name: '— Alpha Widget' })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('option', { name: '— Alpha Widget' }));

    // Without renderSelectedLabel, chip shows the renderItem label (decorated)
    await waitFor(() => {
      const chip = document.querySelector('[class*="selectedTitle"]');
      expect(chip).not.toBeNull();
      expect(chip!.textContent).toBe('— Alpha Widget');
    });
  });
});
