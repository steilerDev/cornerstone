/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { MilestoneSummary } from '@cornerstone/shared';
import { ApiClientError } from '../lib/apiClient.js';
import enErrors from '../i18n/en/errors.json';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type { ObjectFormResult } from '../components/ObjectForm/types.js';
import type * as MilestonesApiTypes from '../lib/milestonesApi.js';
import type * as FormTypes from './milestoneForm.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';
import type * as StateTypes from '../components/ObjectForm/objectFormState.js';

const mockCreateMilestone = jest.fn<typeof MilestonesApiTypes.createMilestone>();
jest.unstable_mockModule('../lib/milestonesApi.js', () => ({
  createMilestone: mockCreateMilestone,
}));

const createdMilestone: MilestoneSummary = {
  id: 42,
  title: 'Roof Complete',
  description: null,
  targetDate: '2026-06-15',
  isCompleted: false,
  completedAt: null,
  color: null,
  workItemCount: 0,
  dependentWorkItemCount: 0,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('milestoneForm (ObjectForm schema)', () => {
  let Form: typeof FormTypes;
  let FormComponent: typeof ObjectFormTypes;
  let State: typeof StateTypes;
  let media: MatchMediaControl;
  const onCreated = jest.fn<(r: ObjectFormResult) => void>();

  beforeEach(async () => {
    mockCreateMilestone.mockReset();
    onCreated.mockReset();
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Form) {
      Form = await import('./milestoneForm.js');
      FormComponent = await import('../components/ObjectForm/ObjectForm.js');
      State = await import('../components/ObjectForm/objectFormState.js');
    }
  });

  afterEach(() => {
    media.restore();
  });

  function Harness({ date }: { date?: string }) {
    const schema = Form.useMilestoneFormSchema();
    const prefill = State.mapPrefill(schema, date ? { date } : {});
    return (
      <FormComponent.ObjectForm
        schema={schema}
        prefill={prefill}
        onCreated={onCreated}
        onCancel={() => {}}
      />
    );
  }

  const renderForm = (date?: string) =>
    render(
      <MemoryRouter>
        <Harness date={date} />
      </MemoryRouter>,
    );

  const titleInput = () => screen.getByTestId('milestone-title-input') as HTMLInputElement;
  const dateInput = () => screen.getByTestId('milestone-target-date-input') as HTMLInputElement;
  const save = () => screen.getByTestId('object-form-save');

  it('titles the dialog "New milestone" and renders the three fields', () => {
    renderForm();
    expect(screen.getByRole('dialog', { name: 'New milestone' })).toBeInTheDocument();
    expect(titleInput()).toBeInTheDocument();
    expect(dateInput()).toBeInTheDocument();
    expect(screen.getByTestId('milestone-description-input')).toBeInTheDocument();
    expect(screen.getByTestId('object-form-more')).toBeInTheDocument();
  });

  it('starts with empty fields and the title focused', () => {
    renderForm();
    expect(titleInput().value).toBe('');
    expect(dateInput().value).toBe('');
    expect((screen.getByTestId('milestone-description-input') as HTMLTextAreaElement).value).toBe(
      '',
    );
    expect(titleInput()).toHaveFocus();
  });

  it('marks title and target date as required, description as optional', () => {
    renderForm();
    expect(titleInput()).toHaveAttribute('aria-required', 'true');
    expect(dateInput()).toHaveAttribute('aria-required', 'true');
    expect(screen.getByTestId('milestone-description-input')).not.toHaveAttribute('aria-required');
  });

  it('pre-fills the target date from the visible date', () => {
    renderForm('2026-03-01');
    expect(dateInput().value).toBe('2026-03-01');
  });

  describe('quick create (#2254): essentials and scope', () => {
    it('shows Title and Target date up front, Description behind More details, and no colour', () => {
      renderForm();
      const more = screen.getByTestId('object-form-more');
      expect(more).toHaveAttribute('aria-expanded', 'false');
      const hidden = document.getElementById(more.getAttribute('aria-controls')!)!;
      expect(hidden).toHaveAttribute('hidden');
      expect(hidden.contains(screen.getByTestId('milestone-description-input'))).toBe(true);
      expect(hidden.contains(titleInput())).toBe(false);
      expect(hidden.contains(dateInput())).toBe(false);
      const visible = Array.from(document.querySelectorAll<HTMLElement>('[data-field]'))
        .filter((el) => el.closest('[hidden]') === null)
        .map((el) => el.getAttribute('data-field'));
      expect(visible).toEqual(['title', 'targetDate']);
      expect(document.querySelector('[data-field="color"]')).toBeNull();
    });

    it('reveals the description when More details is opened', async () => {
      const user = userEvent.setup();
      renderForm();
      await user.click(screen.getByTestId('object-form-more'));
      expect(screen.getByTestId('milestone-description-input')).toBeVisible();
    });

    it('limits title to 200 and description to 2000 characters', () => {
      renderForm();
      expect(titleInput()).toHaveAttribute('maxlength', '200');
      expect(screen.getByTestId('milestone-description-input')).toHaveAttribute(
        'maxlength',
        '2000',
      );
    });

    it('create scope has no colour field; edit scope adds it last', () => {
      const names = (scope?: 'edit') =>
        renderHook(() => Form.useMilestoneFormSchema(scope ? { scope } : {}), {
          wrapper: MemoryRouter,
        }).result.current.fields.map((f) => f.name);
      expect(names()).toEqual(['title', 'targetDate', 'description']);
      expect(names('edit')).toEqual(['title', 'targetDate', 'description', 'color']);
    });

    it('keeps the stable test ids of the title, date and description controls', () => {
      const { result } = renderHook(() => Form.useMilestoneFormSchema({ scope: 'edit' }), {
        wrapper: MemoryRouter,
      });
      expect(result.current.fields.map((f) => f.testId)).toEqual([
        'milestone-title-input',
        'milestone-target-date-input',
        'milestone-description-input',
        undefined,
      ]);
    });

    it('submits a description typed under More details', async () => {
      const user = userEvent.setup();
      mockCreateMilestone.mockResolvedValue(createdMilestone);
      renderForm();
      await user.type(titleInput(), 'Roof Complete');
      fireEvent.change(dateInput(), { target: { value: '2026-06-15' } });
      await user.click(screen.getByTestId('object-form-more'));
      await user.type(screen.getByTestId('milestone-description-input'), 'Tiles done');
      await user.click(save());
      await waitFor(() =>
        expect(mockCreateMilestone).toHaveBeenCalledWith({
          title: 'Roof Complete',
          targetDate: '2026-06-15',
          description: 'Tiles done',
        }),
      );
    });

    describe('validateMilestoneValues', () => {
      const messages = () => renderHook(() => Form.useMilestoneValueMessages()).result.current;

      it('has the unified copy', () => {
        expect(messages()).toEqual({
          title: 'Title is required.',
          targetDate: 'Target date is required.',
        });
      });

      it('requires a non-blank title and a target date; missing keys read as empty', () => {
        const m = messages();
        expect(Form.validateMilestoneValues({}, m)).toEqual({
          title: m.title,
          targetDate: m.targetDate,
        });
        expect(Form.validateMilestoneValues({ title: '  ', targetDate: ' ' }, m)).toEqual({
          title: m.title,
          targetDate: m.targetDate,
        });
        expect(Form.validateMilestoneValues({ title: 'A', targetDate: '2026-06-15' }, m)).toEqual(
          {},
        );
      });
    });
  });

  describe('validation', () => {
    it('requires a title', async () => {
      const user = userEvent.setup();
      renderForm();
      fireEvent.change(dateInput(), { target: { value: '2026-06-15' } });
      await user.click(save());
      expect(await screen.findByText('Title is required.')).toBeInTheDocument();
      expect(mockCreateMilestone).not.toHaveBeenCalled();
    });

    it('requires a target date', async () => {
      const user = userEvent.setup();
      renderForm();
      await user.type(titleInput(), 'Roof Complete');
      await user.click(save());
      expect(await screen.findByText('Target date is required.')).toBeInTheDocument();
      expect(dateInput()).toHaveFocus();
    });

    it('shows both errors and focuses the first', async () => {
      const user = userEvent.setup();
      renderForm();
      await user.click(save());
      expect(await screen.findByText('Title is required.')).toBeInTheDocument();
      expect(screen.getByText('Target date is required.')).toBeInTheDocument();
      expect(titleInput()).toHaveFocus();
    });

    it('treats a whitespace-only title as missing', async () => {
      const user = userEvent.setup();
      renderForm();
      await user.type(titleInput(), '   ');
      fireEvent.change(dateInput(), { target: { value: '2026-06-15' } });
      await user.click(save());
      expect(await screen.findByText('Title is required.')).toBeInTheDocument();
    });
  });

  describe('submission', () => {
    it('creates the milestone with title and date and reports the new milestone', async () => {
      const user = userEvent.setup();
      mockCreateMilestone.mockResolvedValue(createdMilestone);
      renderForm();
      await user.type(titleInput(), 'Roof Complete');
      fireEvent.change(dateInput(), { target: { value: '2026-06-15' } });
      await user.click(save());
      await waitFor(() => expect(mockCreateMilestone).toHaveBeenCalledTimes(1));
      expect(mockCreateMilestone).toHaveBeenCalledWith({
        title: 'Roof Complete',
        targetDate: '2026-06-15',
        description: undefined,
      });
      await waitFor(() =>
        expect(onCreated).toHaveBeenCalledWith({
          id: '42',
          href: '/project/milestones/42',
          label: 'Roof Complete',
        }),
      );
    });

    it('includes the description when provided', async () => {
      const user = userEvent.setup();
      mockCreateMilestone.mockResolvedValue(createdMilestone);
      renderForm();
      await user.type(titleInput(), 'Roof Complete');
      fireEvent.change(dateInput(), { target: { value: '2026-06-15' } });
      await user.click(screen.getByTestId('object-form-more'));
      await user.type(screen.getByTestId('milestone-description-input'), 'Roof is on');
      await user.click(save());
      await waitFor(() =>
        expect(mockCreateMilestone).toHaveBeenCalledWith(
          expect.objectContaining({ description: 'Roof is on' }),
        ),
      );
    });

    it('is busy while submitting', async () => {
      const user = userEvent.setup();
      let resolveCreate!: (v: MilestoneSummary) => void;
      mockCreateMilestone.mockReturnValueOnce(
        new Promise<MilestoneSummary>((res) => {
          resolveCreate = res;
        }),
      );
      renderForm();
      await user.type(titleInput(), 'Roof Complete');
      fireEvent.change(dateInput(), { target: { value: '2026-06-15' } });
      await user.click(save());
      await waitFor(() => expect(save()).toHaveAttribute('aria-disabled', 'true'));
      resolveCreate(createdMilestone);
      await waitFor(() => expect(onCreated).toHaveBeenCalled());
    });
  });

  describe('API errors', () => {
    it('translates an ApiClientError code and never shows the raw server message', async () => {
      const user = userEvent.setup();
      mockCreateMilestone.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'CONFLICT', message: 'RAW-SERVER-SENTINEL' }),
      );
      renderForm();
      await user.type(titleInput(), 'Roof Complete');
      fireEvent.change(dateInput(), { target: { value: '2026-06-15' } });
      await user.click(save());
      expect(await screen.findByText(enErrors.CONFLICT)).toBeInTheDocument();
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
    });

    it('shows the generic message for a non-API error and re-enables Save', async () => {
      const user = userEvent.setup();
      mockCreateMilestone.mockRejectedValueOnce(new Error('Network failure'));
      renderForm();
      await user.type(titleInput(), 'Roof Complete');
      fireEvent.change(dateInput(), { target: { value: '2026-06-15' } });
      await user.click(save());
      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t save/i);
      expect(save()).not.toHaveAttribute('aria-disabled');
    });
  });
});
