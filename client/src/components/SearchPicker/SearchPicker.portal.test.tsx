/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
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

  // ── 10. initialTitle prop ─────────────────────────────────────────────────

  describe('initialTitle prop', () => {
    it('value="id" + initialTitle="Title" shows selectedDisplay with "Title"', () => {
      renderPicker({ value: 'item-existing', initialTitle: 'Pre-set Item Title' });
      expect(screen.getByText('Pre-set Item Title')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Search items...')).not.toBeInTheDocument();
    });

    it('initialTitle clear: clicking × calls onChange("") and shows input', async () => {
      const onChange = jest.fn<(id: string) => void>();
      renderPicker({
        value: 'item-existing',
        initialTitle: 'Pre-set Item Title',
        onChange: onChange as ReturnType<typeof jest.fn>,
      });

      expect(screen.getByText('Pre-set Item Title')).toBeInTheDocument();

      const clearBtn = screen.getByRole('button', { name: /clear selection/i });
      await user.click(clearBtn);

      expect(onChange).toHaveBeenCalledWith('');
      expect(screen.getByPlaceholderText('Search items...')).toBeInTheDocument();
      expect(screen.queryByText('Pre-set Item Title')).not.toBeInTheDocument();
    });

    it('initialTitle not shown when value is empty string', () => {
      renderPicker({ value: '', initialTitle: 'Pre-set Item Title' });
      expect(screen.queryByText('Pre-set Item Title')).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search items...')).toBeInTheDocument();
    });

    it('initialTitle not shown when initialTitle prop is absent', () => {
      renderPicker({ value: 'item-existing' });
      // No initialTitle: falls through to search input (no selectedItem in state)
      expect(screen.getByPlaceholderText('Search items...')).toBeInTheDocument();
    });

    // ── Regression: stale initialTitle after clear-then-select ────────────────
    // Bug: after the user clears the picker and selects a new item, the chip was
    // still showing the old `initialTitle` ("Old Pre-set Title") instead of the
    // newly selected item's label. Fixed by setting `initialTitleCleared = true`
    // inside `handleSelect`, which prevents the initialTitle branch from rendering.

    it('stale initialTitle bug: after clear then select, chip shows new item label, not old initialTitle', async () => {
      const onChange = jest.fn<(id: string) => void>();

      renderPicker({
        value: 'item-existing',
        initialTitle: 'Old Pre-set Title',
        onChange: onChange as ReturnType<typeof jest.fn>,
        showItemsOnFocus: true,
      });

      // Verify the pre-populated chip shows old initialTitle
      expect(screen.getByText('Old Pre-set Title')).toBeInTheDocument();

      // Clear the selection — input is now shown
      const clearBtn = screen.getByRole('button', { name: /clear selection/i });
      await user.click(clearBtn);
      expect(screen.getByPlaceholderText('Search items...')).toBeInTheDocument();

      // Open the dropdown and select a real item
      const input = screen.getByPlaceholderText('Search items...');
      await user.click(input);
      await waitFor(() => expect(screen.getByText('Alpha Widget')).toBeInTheDocument());
      await user.click(screen.getByText('Alpha Widget'));

      // The chip must show the NEWLY selected item's label, not the stale initialTitle
      await waitFor(() => {
        const chip = document.querySelector('[class*="selectedTitle"]');
        expect(chip).not.toBeNull();
        expect(chip!.textContent).toBe('Alpha Widget');
      });
      expect(screen.queryByText('Old Pre-set Title')).not.toBeInTheDocument();
    });
  });

  // ── 11. External value reset ──────────────────────────────────────────────

  describe('external value reset', () => {
    it('value changing to "" resets to input mode even after item selection', async () => {
      const onChange = jest.fn<(id: string) => void>();

      const { rerender } = render(
        <SearchPicker<TestItem>
          value=""
          onChange={onChange as ReturnType<typeof jest.fn>}
          excludeIds={[]}
          searchFn={mockSearchFn}
          renderItem={mockRenderItem}
          showItemsOnFocus={true}
          placeholder="Search..."
        />,
      );

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);
      await waitFor(() => expect(screen.getByText('Alpha Widget')).toBeInTheDocument());
      await user.click(screen.getByText('Alpha Widget'));

      await waitFor(() =>
        expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument(),
      );

      // Parent reflects selected value (simulating controlled component)
      rerender(
        <SearchPicker<TestItem>
          value="1"
          onChange={onChange as ReturnType<typeof jest.fn>}
          excludeIds={[]}
          searchFn={mockSearchFn}
          renderItem={mockRenderItem}
          showItemsOnFocus={true}
          placeholder="Search..."
        />,
      );

      // Parent resets value to empty (e.g. form submission)
      rerender(
        <SearchPicker<TestItem>
          value=""
          onChange={onChange as ReturnType<typeof jest.fn>}
          excludeIds={[]}
          searchFn={mockSearchFn}
          renderItem={mockRenderItem}
          showItemsOnFocus={true}
          placeholder="Search..."
        />,
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
      });
    });
  });
});
// ── Portal rendering (Story #1600) ────────────────────────────────────────────
// Tests for the portal-based dropdown using @floating-ui/react FloatingPortal.
// The listbox is rendered into document.body via FloatingPortal (unconditionally
// when isOpen=true — no getBoundingClientRect gate required).
// Escape-key, click-outside, and click-result tests are kept unchanged.

describe('portal rendering (Story #1600)', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockSearchFn.mockReset();
    mockSearchFn.mockResolvedValue(sampleItems);

    // NOTE: The getBoundingClientRect stub that was here for Story #1600 has been
    // removed. With Floating UI (#1708), FloatingPortal renders the dropdown
    // unconditionally when isOpen=true — there is no rect-gate. The portal renders
    // without any stub. See FUI-1 test in 'Floating UI portal (#1708)' describe block.

    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ── Test 9: portal element in document.body ──────────────────────────────

  it('dropdown is portalled to document.body — [data-search-picker-dropdown] present on body', async () => {
    const { container } = renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    // The portal element should exist on document.body, NOT inside the render container
    const portalEl = document.querySelector('[data-search-picker-dropdown]');
    expect(portalEl).not.toBeNull();

    // It should NOT be inside the test container (it's portalled to body)
    expect(container.contains(portalEl)).toBe(false);

    // Confirm document.body directly contains the portal element (or an ancestor is body)
    expect(document.body.contains(portalEl)).toBe(true);
  });

  // NOTE: The 'dropdown repositions when window scroll fires while open' test has been
  // removed. It asserted that portalEl.style.top changed on window scroll by observing
  // the dropdownRect state mutation. With Floating UI (#1708), autoUpdate handles
  // repositioning internally — it is not observable as a DOM style mutation in jsdom
  // because Floating UI's position calculation requires a real layout engine.

  // ── Test 11: click outside closes dropdown ───────────────────────────────

  it('clicking outside both container and portal dropdown closes the dropdown', async () => {
    renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    // Click on document.body directly (outside container and portal)
    await user.click(document.body);

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  // ── Test 11b: click inside the portal dropdown is NOT treated as outside ──
  // Regression test for the useClickOutside migration (#1816): the old
  // implementation special-cased this via a
  // `document.querySelector('[data-search-picker-dropdown]')` check inside its
  // handler. useClickOutside instead includes `refs.floating` (the portal
  // element) directly in its target list — this test locks in that the
  // portal-aware behavior survived the migration.

  it('clicking inside the portalled dropdown does not close it', async () => {
    renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    const listbox = screen.getByRole('listbox');

    // A mousedown directly on the listbox container itself (not on an option,
    // to avoid also triggering a selection) must NOT be treated as "outside".
    fireEvent.mouseDown(listbox);

    // The dropdown must remain open.
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  // ── Test 12: Escape inside portal closes dropdown ────────────────────────

  it('pressing Escape inside the portalled dropdown closes the dropdown', async () => {
    renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    const listbox = screen.getByRole('listbox');

    // Fire keydown Escape on the portal listbox element
    act(() => {
      listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  // ── Test 13: keyboard navigation (Arrow/Enter) still works after portal change ──

  it('clicking a result in the portalled dropdown still calls onChange', async () => {
    const onChange = jest.fn<(id: string) => void>();
    renderPicker({
      showItemsOnFocus: true,
      onChange: onChange as ReturnType<typeof jest.fn>,
      placeholder: 'Search...',
    });

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Alpha Widget' })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('option', { name: 'Alpha Widget' }));

    expect(onChange).toHaveBeenCalledWith('item-1');
  });
});

// ── Floating UI portal (#1708) ────────────────────────────────────────────────
// Tests for @floating-ui/react integration in SearchPicker.
//   FUI-1: Portal renders unconditionally (no getBoundingClientRect stub needed)
//   FUI-2: dropdown is in document.body and not display:none when open
//          (visibility:hidden is used transiently before isPositioned flips true;
//          we cannot assert "never hidden" in jsdom due to non-deterministic timing)

describe('Floating UI portal (#1708)', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockSearchFn.mockReset();
    mockSearchFn.mockResolvedValue(sampleItems);
    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ── FUI-1: portal renders without a getBoundingClientRect stub ─────────────
  // With Floating UI, FloatingPortal renders the dropdown unconditionally when
  // isOpen=true. The old implementation required a non-null getBoundingClientRect
  // result to gate the createPortal call — that gate is gone.

  it('FUI-1 — portal renders without a getBoundingClientRect stub', async () => {
    renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    // Listbox must appear with no getBoundingClientRect manipulation
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    // The portal element must be attached to document.body
    const portalEl = document.querySelector('[data-search-picker-dropdown]');
    expect(portalEl).not.toBeNull();
    expect(document.body.contains(portalEl)).toBe(true);
  });

  // ── FUI-2: dropdown is in the DOM and not display:none when open ────────────
  // SearchPicker sets visibility:hidden on the portal div during the brief transient
  // window before @floating-ui/react's isPositioned flips true (i.e., before the
  // first computePosition resolves). This is intentional anti-flash behaviour — the
  // element is in the DOM from the moment isOpen=true, but stays invisible until
  // Floating UI has computed its position. We cannot assert "never visibility:hidden"
  // because in jsdom the timing of isPositioned is non-deterministic. Instead, verify:
  //   (a) the portal element exists in document.body when open, and
  //   (b) it is not hidden via display:none (which would prevent interaction entirely).

  it('FUI-2 — portal dropdown is in document.body and not display:none when open', async () => {
    renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });

    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);

    // Wait for the listbox to appear (isOpen=true; portal renders)
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    const dropdownEl = document.querySelector(
      '[data-search-picker-dropdown]',
    ) as HTMLElement | null;

    // The portal element must exist on document.body
    expect(dropdownEl).not.toBeNull();
    expect(document.body.contains(dropdownEl)).toBe(true);

    // It must not be removed from the layout via display:none
    // (visibility:hidden is acceptable — it is the transient pre-positioned state)
    expect(dropdownEl!.style.display).not.toBe('none');
  });
});
