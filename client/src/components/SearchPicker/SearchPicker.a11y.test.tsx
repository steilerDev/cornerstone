/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlledSearchPicker } from '../../test/ControlledSearchPicker.js';
import type { SearchPicker } from './SearchPicker.js';

/**
 * Selected-state accessibility (#2261): the selection is a `role="group"` named by the field
 * label, and the clear button says what it clears ("Clear selection: <title>").
 */
interface TestItem {
  id: string;
  label: string;
}

const items: TestItem[] = [
  { id: 'c-1', label: 'Example Builders' },
  { id: 'c-2', label: 'Sample Roofing' },
];

const mockSearchFn =
  jest.fn<(query: string, excludeIds: string[], signal: AbortSignal) => Promise<TestItem[]>>();

type Props = Partial<React.ComponentProps<typeof SearchPicker<TestItem>>>;

/** A label sibling plus the picker, the way every ObjectForm host renders it. */
function renderPicker({
  labelId,
  withLabel = true,
  ...props
}: Props & { labelId?: string; withLabel?: boolean } = {}) {
  return render(
    <div>
      {withLabel && (
        <label htmlFor="pk" id={labelId}>
          Company
        </label>
      )}
      <ControlledSearchPicker<TestItem>
        id="pk"
        value=""
        onChange={jest.fn()}
        excludeIds={[]}
        searchFn={mockSearchFn}
        renderItem={(item) => ({ id: item.id, label: item.label })}
        showItemsOnFocus
        {...props}
      />
    </div>,
  );
}

describe('SearchPicker selected-state accessibility (#2261)', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockSearchFn.mockReset();
    mockSearchFn.mockResolvedValue(items);
    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function pickFirst() {
    await user.click(screen.getByLabelText('Company'));
    await user.click(await screen.findByRole('option', { name: 'Example Builders' }));
  }

  describe('group and clear button in each selected branch', () => {
    it('a picked item: group named by the label, clear button names the item', async () => {
      renderPicker();
      await pickFirst();

      expect(screen.getByRole('group', { name: 'Company' })).toHaveTextContent('Example Builders');
      expect(
        screen.getByRole('button', { name: 'Clear selection: Example Builders' }),
      ).toBeInTheDocument();
    });

    it('an initialTitle selection: group named by the label, clear button names the title', () => {
      renderPicker({ value: 'c-1', initialTitle: 'Example Builders' });

      expect(screen.getByRole('group', { name: 'Company' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Clear selection: Example Builders' }),
      ).toBeInTheDocument();
    });

    it('a special option: group named by the label, clear button names the option', async () => {
      renderPicker({ specialOptions: [{ id: '__none__', label: 'Unassigned Synthetic' }] });
      await user.click(screen.getByLabelText('Company'));
      await user.click(await screen.findByRole('option', { name: 'Unassigned Synthetic' }));

      expect(screen.getByRole('group', { name: 'Company' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Clear selection: Unassigned Synthetic' }),
      ).toBeInTheDocument();
    });
  });

  describe('label association', () => {
    it('keeps the id a label already has, and the group references it', () => {
      renderPicker({ value: 'c-1', initialTitle: 'Example Builders', labelId: 'company-label' });

      expect(screen.getByText('Company')).toHaveAttribute('id', 'company-label');
      expect(screen.getByRole('group')).toHaveAttribute('aria-labelledby', 'company-label');
    });

    it('gives a label without an id the id "<picker id>-label"', () => {
      renderPicker({ value: 'c-1', initialTitle: 'Example Builders' });

      expect(screen.getByText('Company')).toHaveAttribute('id', 'pk-label');
      expect(screen.getByRole('group')).toHaveAttribute('aria-labelledby', 'pk-label');
    });

    it('does not take the generated id when another element already owns it', () => {
      render(
        <div>
          <span id="pk-label">Taken</span>
          <label htmlFor="pk">Company</label>
          <ControlledSearchPicker<TestItem>
            id="pk"
            value="c-1"
            initialTitle="Example Builders"
            onChange={jest.fn()}
            excludeIds={[]}
            searchFn={mockSearchFn}
            renderItem={(item) => ({ id: item.id, label: item.label })}
          />
        </div>,
      );

      expect(screen.getByText('Company')).not.toHaveAttribute('id');
      expect(screen.getByRole('group')).not.toHaveAttribute('aria-labelledby');
    });

    it('with no label but an aria-label prop, the group is named by the prop', () => {
      renderPicker({
        withLabel: false,
        value: 'c-1',
        initialTitle: 'Example Builders',
        inputAriaProps: { 'aria-label': 'Builder' },
      });

      const group = screen.getByRole('group', { name: 'Builder' });
      expect(group).not.toHaveAttribute('aria-labelledby');
    });

    it('with no label and no prop, the group has no aria-labelledby and no aria-label', () => {
      renderPicker({ withLabel: false, value: 'c-1', initialTitle: 'Example Builders' });

      const group = screen.getByRole('group');
      expect(group).not.toHaveAttribute('aria-labelledby');
      expect(group).not.toHaveAttribute('aria-label');
    });

    it('with no id prop the group stays unlabelled even when a label exists', () => {
      render(
        <div>
          <label>Company</label>
          <ControlledSearchPicker<TestItem>
            value="c-1"
            initialTitle="Example Builders"
            onChange={jest.fn()}
            excludeIds={[]}
            searchFn={mockSearchFn}
            renderItem={(item) => ({ id: item.id, label: item.label })}
          />
        </div>,
      );

      expect(screen.getByRole('group')).not.toHaveAttribute('aria-labelledby');
    });

    it('with no matching label element the group falls back to the aria-label prop', () => {
      render(
        <ControlledSearchPicker<TestItem>
          id="pk"
          value="c-1"
          initialTitle="Example Builders"
          inputAriaProps={{ 'aria-label': 'Builder' }}
          onChange={jest.fn()}
          excludeIds={[]}
          searchFn={mockSearchFn}
          renderItem={(item) => ({ id: item.id, label: item.label })}
        />,
      );

      expect(screen.getByRole('group', { name: 'Builder' })).toBeInTheDocument();
    });

    it('works when CSS.escape is unavailable (older engines)', () => {
      const original = CSS.escape;
      // @ts-expect-error simulating an engine without CSS.escape
      CSS.escape = undefined;
      try {
        renderPicker({ value: 'c-1', initialTitle: 'Example Builders' });
        expect(screen.getByRole('group', { name: 'Company' })).toBeInTheDocument();
      } finally {
        CSS.escape = original;
      }
    });
  });

  describe('input state', () => {
    it('has no group role, and the label names the textbox', () => {
      renderPicker();

      expect(screen.queryByRole('group')).toBeNull();
      expect(screen.getByLabelText('Company')).toBe(
        screen.getByRole('textbox', { name: 'Company' }),
      );
    });
  });

  describe('clearing', () => {
    it('clearing returns to the input state and moves focus to the input', async () => {
      renderPicker();
      await pickFirst();

      await user.click(screen.getByRole('button', { name: 'Clear selection: Example Builders' }));

      await waitFor(() => expect(screen.getByLabelText('Company')).toHaveFocus());
      expect(screen.queryByRole('group')).toBeNull();
    });
  });
});
