/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlledSearchPicker } from '../../test/ControlledSearchPicker.js';
import type { SearchPicker } from './SearchPicker.js';

interface TestItem {
  id: string;
  label: string;
  group: 'company' | 'member';
}

const ITEMS: TestItem[] = [
  { id: 'c-1', label: 'Acme Roofing', group: 'company' },
  { id: 'm-1', label: 'Zoë Keller', group: 'member' },
  { id: 'c-2', label: 'Birch Tiling', group: 'company' },
  { id: 'm-2', label: 'Ben Albrecht', group: 'member' },
];

const GROUP_LABELS = { company: 'Companies', member: 'Household members' };

const mockSearchFn =
  jest.fn<(query: string, excludeIds: string[], signal: AbortSignal) => Promise<TestItem[]>>();

function renderPicker(
  props: Partial<React.ComponentProps<typeof SearchPicker<TestItem>>> & { value?: string } = {},
) {
  return render(
    <ControlledSearchPicker<TestItem>
      value=""
      onChange={jest.fn()}
      excludeIds={[]}
      searchFn={mockSearchFn}
      renderItem={(item) => ({ id: item.id, label: item.label })}
      placeholder="Search..."
      showItemsOnFocus
      {...props}
    />,
  );
}

const grouped = {
  groupBy: (item: TestItem) => ({ id: item.group, label: GROUP_LABELS[item.group] }),
};

describe('SearchPicker groups and rendering hooks (#2236)', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockSearchFn.mockReset();
    mockSearchFn.mockResolvedValue(ITEMS);
    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function open() {
    await user.click(screen.getByPlaceholderText('Search...'));
    await screen.findAllByRole('option');
  }

  describe('groupBy', () => {
    it('renders one labelled group per group id, in order of first appearance, items kept in order', async () => {
      renderPicker(grouped);
      await open();

      const groups = screen.getAllByRole('group');
      expect(groups).toHaveLength(2);
      expect(groups[0]).toHaveAccessibleName('Companies');
      expect(groups[1]).toHaveAccessibleName('Household members');
      expect(
        within(groups[0]!)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Acme Roofing', 'Birch Tiling']);
      expect(
        within(groups[1]!)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Zoë Keller', 'Ben Albrecht']);
    });

    it('follows the data order: members first when they come first', async () => {
      mockSearchFn.mockResolvedValue([ITEMS[1]!, ITEMS[0]!]);
      renderPicker(grouped);
      await open();

      expect(
        screen.getAllByRole('group').map((g) => g.getAttribute('aria-labelledby')),
      ).toHaveLength(2);
      expect(screen.getAllByRole('group')[0]).toHaveAccessibleName('Household members');
    });

    it('points aria-labelledby at a heading element with the group label, unique per group and per picker', async () => {
      renderPicker(grouped);
      await open();

      const ids = screen.getAllByRole('group').map((group) => {
        const id = group.getAttribute('aria-labelledby');
        expect(id).toBeTruthy();
        expect(document.getElementById(id!)).toHaveTextContent(/^(Companies|Household members)$/);
        return id;
      });
      expect(new Set(ids).size).toBe(2);
    });

    it('keeps the headings out of the options: they are neither options nor counted as results', async () => {
      renderPicker(grouped);
      await open();

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(4);
      expect(options.map((o) => o.textContent)).not.toContain('Companies');
      expect(screen.getByText('Companies').closest('[role="option"]')).toBeNull();
    });

    it('ArrowDown from the input lands on the first option, then walks the options and skips the heading between groups', async () => {
      renderPicker(grouped);
      await open();

      await user.keyboard('{ArrowDown}');
      expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Acme Roofing' }));
      await user.keyboard('{ArrowDown}');
      expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Birch Tiling' }));
      await user.keyboard('{ArrowDown}');
      expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Zoë Keller' }));
      await user.keyboard('{End}');
      expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Ben Albrecht' }));
      await user.keyboard('{Home}');
      expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Acme Roofing' }));
    });

    it('ArrowUp from the first option returns to the input', async () => {
      renderPicker(grouped);
      await open();
      await user.keyboard('{ArrowDown}');

      await user.keyboard('{ArrowUp}');

      expect(screen.getByPlaceholderText('Search...')).toHaveFocus();
    });

    it('puts the create row after the last group', async () => {
      renderPicker({
        ...grouped,
        createAction: {
          getLabel: (q) => `New ${q}`,
          onCreate: () => Promise.resolve(null),
          show: 'always',
        },
      });
      await open();

      const options = screen.getAllByRole('option');
      expect(options.at(-1)).toHaveTextContent('New');
      // The create row belongs to no group.
      expect(options.at(-1)!.closest('[role="group"]')).toBeNull();
      expect(screen.getAllByRole('group').every((g) => !g.contains(options.at(-1)!))).toBe(true);
    });

    it('a pick from a group reports that item', async () => {
      const onChange = jest.fn<(id: string) => void>();
      renderPicker({ ...grouped, onChange });
      await open();

      await user.click(screen.getByRole('option', { name: 'Ben Albrecht' }));

      expect(onChange).toHaveBeenCalledWith('m-2');
    });

    it('renders no group markup when no groupBy is given', async () => {
      renderPicker();
      await open();

      expect(screen.queryByRole('group')).toBeNull();
      expect(screen.getAllByRole('option')).toHaveLength(4);
    });

    it('renders no group for an empty result', async () => {
      mockSearchFn.mockResolvedValue([]);
      renderPicker({ ...grouped, specialOptions: [{ id: '__s__', label: 'Special' }] });
      await user.click(screen.getByPlaceholderText('Search...'));
      await screen.findByRole('option', { name: 'Special' });

      expect(screen.queryByRole('group')).toBeNull();
    });
  });

  describe('renderOptionLabel', () => {
    it('replaces the visible title of an option', async () => {
      renderPicker({
        renderOptionLabel: (item) => (
          <strong data-testid={`title-${item.id}`}>{item.label.toUpperCase()}</strong>
        ),
      });
      await open();

      expect(screen.getByTestId('title-c-1')).toHaveTextContent('ACME ROOFING');
      expect(screen.getByRole('option', { name: 'ACME ROOFING' })).toBeInTheDocument();
    });

    it('does not change what a pick reports or the chip label', async () => {
      const onChange = jest.fn<(id: string) => void>();
      renderPicker({ renderOptionLabel: (item) => <em>{item.label}!</em>, onChange });
      await open();

      await user.click(screen.getByRole('option', { name: 'Birch Tiling!' }));

      expect(onChange).toHaveBeenCalledWith('c-2');
      expect(screen.getByText('Birch Tiling')).toBeInTheDocument();
    });

    it('is used in the two-line layout too', async () => {
      renderPicker({
        renderOptionLabel: (item) => <span data-testid={`t-${item.id}`}>{item.label}</span>,
        renderSecondary: () => 'secondary text',
      });
      await open();

      const option = screen.getByRole('option', { name: /Acme Roofing/ });
      expect(within(option).getByTestId('t-c-1')).toBeInTheDocument();
      expect(option).toHaveTextContent('secondary text');
    });

    it('falls back to the plain label without the prop', async () => {
      renderPicker();
      await open();

      expect(screen.getByRole('option', { name: 'Acme Roofing' })).toBeInTheDocument();
    });
  });

  describe('getOptionAriaLabel', () => {
    it('sets the accessible name of an option', async () => {
      renderPicker({
        getOptionAriaLabel: (item) => `${item.label}, ${item.group}`,
        renderOptionLabel: (item) => <span aria-hidden="true">{item.label} ›</span>,
      });
      await open();

      expect(screen.getByRole('option', { name: 'Acme Roofing, company' })).toHaveAttribute(
        'aria-label',
        'Acme Roofing, company',
      );
    });

    it('leaves the attribute off without the prop', async () => {
      renderPicker();
      await open();

      expect(screen.getByRole('option', { name: 'Acme Roofing' })).not.toHaveAttribute(
        'aria-label',
      );
    });
  });

  describe('getSelectedSuffix', () => {
    const suffix = (item: TestItem | null) =>
      item ? (item.group === 'company' ? 'Company' : 'Household member') : 'From value';

    it('shows the suffix after the chip of a picked item', async () => {
      renderPicker({ getSelectedSuffix: suffix });
      await open();

      await user.click(screen.getByRole('option', { name: 'Zoë Keller' }));

      const title = screen.getByText('Zoë Keller');
      expect(title.nextElementSibling).toHaveTextContent('Household member');
    });

    it('asks for the suffix with null while only the initial title is shown', () => {
      const getSelectedSuffix = jest.fn(suffix);
      renderPicker({ value: 'c-9', initialTitle: 'Saved Co', getSelectedSuffix });

      expect(screen.getByText('Saved Co').nextElementSibling).toHaveTextContent('From value');
      expect(getSelectedSuffix).toHaveBeenCalledWith(null);
    });

    it('shows no suffix element when the callback returns undefined or an empty string', () => {
      const { unmount } = renderPicker({
        value: 'c-9',
        initialTitle: 'Saved Co',
        getSelectedSuffix: () => undefined,
      });
      expect(screen.getByText('Saved Co').nextElementSibling).toHaveAttribute(
        'aria-label',
        'Clear selection',
      );
      unmount();

      renderPicker({ value: 'c-9', initialTitle: 'Saved Co', getSelectedSuffix: () => '' });
      expect(screen.getByText('Saved Co').nextElementSibling).toHaveAttribute(
        'aria-label',
        'Clear selection',
      );
    });

    it('shows no suffix without the prop', async () => {
      renderPicker();
      await open();

      await user.click(screen.getByRole('option', { name: 'Acme Roofing' }));

      expect(screen.getByText('Acme Roofing').nextElementSibling).toHaveAttribute(
        'aria-label',
        'Clear selection',
      );
    });

    it('does not put a suffix on a selected special option', async () => {
      renderPicker({
        getSelectedSuffix: () => 'Suffix',
        specialOptions: [{ id: '__none__', label: 'Nobody' }],
      });
      await open();

      await user.click(screen.getByRole('option', { name: 'Nobody' }));

      expect(screen.queryByText('Suffix')).toBeNull();
    });
  });

  describe('selected chip (getStatusBorderColor was removed)', () => {
    it('never carries an inline left border colour', async () => {
      renderPicker();
      await open();

      await user.click(screen.getByRole('option', { name: 'Acme Roofing' }));

      const chip = screen.getByText('Acme Roofing').parentElement!;
      expect(chip).toHaveClass('selectedDisplay');
      expect(chip.getAttribute('style')).toBeNull();
    });

    it('does not accept the retired prop any more (compile-time and no runtime effect)', async () => {
      // @ts-expect-error getStatusBorderColor was removed from SearchPickerProps in #2236
      renderPicker({ getStatusBorderColor: () => 'rgb(0, 128, 0)' });
      await open();

      await user.click(screen.getByRole('option', { name: 'Acme Roofing' }));

      expect(screen.getByText('Acme Roofing').parentElement!.getAttribute('style')).toBeNull();
    });
  });

  describe('touch-target sizing (static CSS check, jsdom has no layout)', () => {
    const css = readFileSync(new URL('./SearchPicker.module.css', import.meta.url), 'utf8');
    const rule = (selector: string) => {
      const match = new RegExp(
        `${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
      ).exec(css);
      return match?.[1] ?? '';
    };

    it('gives the input and the selected chip the 44px touch target', () => {
      expect(rule('.input')).toContain('min-height: var(--touch-target-min)');
      expect(rule('.selectedDisplay')).toContain('min-height: var(--touch-target-min)');
    });

    it('grows the clear button hit area to the touch target without growing the glyph', () => {
      const after = rule('.clearButton::after');
      expect(after).toContain('width: var(--touch-target-min)');
      expect(after).toContain('height: var(--touch-target-min)');
      expect(rule('.clearButton')).toContain('position: relative');
    });

    it('shows a focus ring on the clear button', () => {
      expect(rule('.clearButton:focus-visible')).toContain('box-shadow: var(--shadow-focus)');
    });

    it('has no status border left on the chip', () => {
      expect(rule('.selectedDisplay')).not.toContain('border-left');
    });
  });

  it('waits for the list before grouping (loading state shows no group)', async () => {
    let resolve!: (items: TestItem[]) => void;
    mockSearchFn.mockReturnValue(new Promise((r) => (resolve = r)));
    renderPicker(grouped);

    await user.click(screen.getByPlaceholderText('Search...'));
    expect(screen.queryByRole('group')).toBeNull();

    resolve(ITEMS);
    await waitFor(() => expect(screen.getAllByRole('group')).toHaveLength(2));
  });
});
