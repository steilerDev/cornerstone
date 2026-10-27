/**
 * @jest-environment jsdom
 */
/**
 * GrantEligibilitySection (#2242, MNY-041, AC11): cost categories and the eligibility text.
 *
 * Mutations these tests catch: "No category" sent as a category id instead of
 * includesNoCategoryItems; "Includes costs without a category" shown when it is not set;
 * categories not reaching the multi-picker as chips; a failed save closing the form.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SubsidyProgram, UpdateSubsidyProgramRequest } from '@cornerstone/shared';
import type { EntityOption } from '../../components/EntityPicker/types.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type * as SectionModule from './GrantEligibilitySection.js';

const mockUpdate = jest.fn<(id: string, body: UpdateSubsidyProgramRequest) => Promise<unknown>>();
// The section imports NO_CATEGORY_OPTION_ID from grantForm, which imports createSubsidyProgram.
jest.unstable_mockModule('../../lib/subsidyProgramsApi.js', () => ({
  updateSubsidyProgram: mockUpdate,
  createSubsidyProgram: jest.fn(),
}));

interface MultiProps {
  value: readonly EntityOption[];
  onChange: (next: readonly EntityOption[]) => void;
  picker: { kind: string; create?: string; specialOptions?: { id: string; label: string }[] };
  removeLabel: (option: EntityOption) => string;
  countLabel: (count: number) => string;
  testId: string;
}
jest.unstable_mockModule('../../components/EntityPicker/EntityMultiPicker.js', () => ({
  EntityMultiPicker: (props: MultiProps) => (
    <div data-testid={props.testId} data-kind={props.picker.kind} data-create={props.picker.create}>
      <ul>
        {props.value.map((option) => (
          <li key={option.id} data-testid={`chip-${option.id}`}>
            {option.label}
            <button
              type="button"
              onClick={() => props.onChange(props.value.filter((o) => o.id !== option.id))}
            >
              {props.removeLabel(option)}
            </button>
          </li>
        ))}
      </ul>
      <span data-testid="count">{props.countLabel(props.value.length)}</span>
      {props.picker.specialOptions?.map((special) => (
        <button
          key={special.id}
          type="button"
          onClick={() => props.onChange([...props.value, { id: special.id, label: special.label }])}
        >
          add-{special.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => props.onChange([...props.value, { id: 'bc-9', label: 'Doors' }])}
      >
        add-doors
      </button>
    </div>
  ),
}));

const grant = (over: Partial<SubsidyProgram> = {}): SubsidyProgram =>
  ({
    id: 'sp-1',
    name: 'Energy grant',
    eligibility: 'Owner occupied',
    includesNoCategoryItems: false,
    applicableCategories: [
      { id: 'bc-1', name: 'Windows', translationKey: null },
      { id: 'bc-2', name: 'Insulation', translationKey: null },
    ],
    ...over,
  }) as unknown as SubsidyProgram;

describe('GrantEligibilitySection', () => {
  let Section: typeof SectionModule.GrantEligibilitySection;
  const onSaved = jest.fn<() => Promise<unknown>>();

  beforeEach(async () => {
    mockUpdate.mockReset().mockResolvedValue({});
    onSaved.mockReset().mockResolvedValue(undefined);
    if (!Section)
      ({ GrantEligibilitySection: Section } = await import('./GrantEligibilitySection.js'));
  });

  const renderSection = (over: Partial<SubsidyProgram> = {}) =>
    render(<Section grant={grant(over)} onSaved={onSaved} />);
  const startEdit = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(await screen.findByTestId('grant-eligibility-edit'));
  const save = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByTestId('grant-eligibility-save'));

  describe('read mode', () => {
    it('lists the category names and the eligibility text', () => {
      renderSection();
      expect(screen.getByTestId('grant-detail-categories')).toHaveTextContent(
        'Windows, Insulation',
      );
      expect(screen.getByTestId('grant-detail-eligibility')).toHaveTextContent('Owner occupied');
      expect(screen.queryByTestId('grant-detail-no-category')).toBeNull();
    });

    it('shows "Includes costs without a category" only when the grant has it', () => {
      renderSection({ includesNoCategoryItems: true });
      expect(screen.getByTestId('grant-detail-no-category')).toHaveTextContent(
        '· Includes costs without a category',
      );
    });

    it('the no-category note stands alone when there are no categories', () => {
      renderSection({ includesNoCategoryItems: true, applicableCategories: [] });
      const note = screen.getByTestId('grant-detail-no-category');
      expect(note.textContent?.trim()).toBe('Includes costs without a category');
      expect(screen.getByTestId('grant-detail-categories')).toHaveTextContent('–');
    });

    it('shows dashes with "Not set" for no categories and no eligibility text', () => {
      renderSection({ applicableCategories: [], eligibility: null });
      expect(
        within(screen.getByTestId('grant-detail-categories')).getByText('Not set'),
      ).toBeInTheDocument();
      expect(
        within(screen.getByTestId('grant-detail-eligibility')).getByText('Not set'),
      ).toBeInTheDocument();
    });
  });

  describe('edit form', () => {
    it('shows the categories as chips of a category multi-picker that cannot create categories', async () => {
      const user = userEvent.setup();
      renderSection({ includesNoCategoryItems: true });
      await startEdit(user);

      const picker = screen.getByTestId('grant-field-categories');
      expect(picker).toHaveAttribute('data-kind', 'category');
      expect(picker).toHaveAttribute('data-create', 'off');
      expect(
        within(picker)
          .getAllByRole('listitem')
          .map((li) => li.firstChild?.textContent),
      ).toEqual(['Windows', 'Insulation', 'No category']);
      expect(screen.getByTestId('count')).toHaveTextContent('3 selected');
      expect((screen.getByTestId('grant-field-eligibility') as HTMLTextAreaElement).value).toBe(
        'Owner occupied',
      );
    });

    it('saving without a change is not offered as a change: the body still carries the current state', async () => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.type(screen.getByTestId('grant-field-eligibility'), ' only');
      await save(user);

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
      expect(mockUpdate).toHaveBeenCalledWith('sp-1', {
        categoryIds: ['bc-1', 'bc-2'],
        includesNoCategoryItems: false,
        eligibility: 'Owner occupied only',
      });
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    });

    it('removing a chip and adding another sends the new category ids', async () => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.click(screen.getByRole('button', { name: 'Remove Windows' }));
      await user.click(screen.getByRole('button', { name: 'add-doors' }));
      await save(user);

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
      expect(mockUpdate.mock.calls[0]![1]).toMatchObject({
        categoryIds: ['bc-2', 'bc-9'],
        includesNoCategoryItems: false,
      });
    });

    it('"No category" becomes includesNoCategoryItems and is never sent as a category id', async () => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.click(screen.getByRole('button', { name: 'add-No category' }));
      await save(user);

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
      expect(mockUpdate.mock.calls[0]![1]).toMatchObject({
        categoryIds: ['bc-1', 'bc-2'],
        includesNoCategoryItems: true,
      });
    });

    it('removing the No category chip clears includesNoCategoryItems; a blank eligibility becomes null', async () => {
      const user = userEvent.setup();
      renderSection({ includesNoCategoryItems: true });
      await startEdit(user);
      await user.click(screen.getByRole('button', { name: 'Remove No category' }));
      await user.clear(screen.getByTestId('grant-field-eligibility'));
      await save(user);

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
      expect(mockUpdate.mock.calls[0]![1]).toEqual({
        categoryIds: ['bc-1', 'bc-2'],
        includesNoCategoryItems: false,
        eligibility: null,
      });
    });
  });

  describe('failures and discard', () => {
    it('a server error shows a translated banner and keeps the edits', async () => {
      mockUpdate.mockRejectedValue(
        new ApiClientError(400, { code: 'VALIDATION_ERROR', message: 'raw' }),
      );
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.click(screen.getByRole('button', { name: 'Remove Windows' }));
      await save(user);

      expect(await screen.findByRole('alert')).not.toHaveTextContent('raw');
      expect(screen.queryByTestId('chip-bc-1')).toBeNull();
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('a non-API failure shows the fixed save error', async () => {
      mockUpdate.mockRejectedValue(new Error('offline'));
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.click(screen.getByRole('button', { name: 'add-doors' }));
      await save(user);
      expect(
        await screen.findByText('The changes could not be saved. Please try again.'),
      ).toBeInTheDocument();
    });

    it('a failed page refresh after a successful save is not a failed save', async () => {
      onSaved.mockRejectedValue(new Error('refresh failed'));
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.click(screen.getByRole('button', { name: 'add-doors' }));
      await save(user);
      await waitFor(() => expect(screen.queryByTestId('grant-eligibility-save')).toBeNull());
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('Cancel restores the stored categories and text on the next edit', async () => {
      const user = userEvent.setup();
      renderSection();
      await startEdit(user);
      await user.click(screen.getByRole('button', { name: 'add-doors' }));
      await user.click(screen.getByTestId('grant-eligibility-cancel'));
      const discard = screen.queryByRole('button', { name: /Discard/ });
      if (discard) await user.click(discard);

      await startEdit(user);
      expect(screen.queryByTestId('chip-bc-9')).toBeNull();
      expect(screen.getByTestId('chip-bc-1')).toBeInTheDocument();
    });
  });
});
