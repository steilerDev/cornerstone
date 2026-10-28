/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SCHEDULE_DURATION_DAYS_MAX } from '@cornerstone/shared';
import type { ErrorCode } from '@cornerstone/shared';
import { ApiClientError } from '../lib/apiClient.js';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../test/photoSpotFixtures.js';
import { makeTaskSummary } from '../test/taskPageFixtures.js';
import type { ObjectFormResult } from '../components/ObjectForm/types.js';
import type * as DependenciesApiTypes from '../lib/dependenciesApi.js';
import type * as WorkItemsApiTypes from '../lib/workItemsApi.js';
import type * as FormTypes from './dependencyForm.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';

const mockCreateDependency = jest.fn<typeof DependenciesApiTypes.createDependency>();
const mockUpdateDependency = jest.fn<typeof DependenciesApiTypes.updateDependency>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
jest.unstable_mockModule('../lib/dependenciesApi.js', () => ({
  createDependency: mockCreateDependency,
  updateDependency: mockUpdateDependency,
}));
jest.unstable_mockModule('../lib/workItemsApi.js', () => ({ listWorkItems: mockListWorkItems }));
jest.unstable_mockModule('../contexts/LocaleContext.js', () => makeLocaleContextMock());

describe('dependencyForm (ObjectForm schema)', () => {
  let Form: typeof FormTypes;
  let FormComponent: typeof ObjectFormTypes;
  let media: MatchMediaControl;
  const onCreated = jest.fn<(r: ObjectFormResult) => void>();
  const onSaved = jest.fn<() => Promise<unknown>>();

  beforeEach(async () => {
    for (const mock of [
      mockCreateDependency,
      mockUpdateDependency,
      mockListWorkItems,
      onCreated,
      onSaved,
    ]) {
      mock.mockReset();
    }
    onSaved.mockResolvedValue(undefined);
    mockCreateDependency.mockResolvedValue({} as never);
    mockUpdateDependency.mockResolvedValue({} as never);
    mockListWorkItems.mockResolvedValue({
      items: [makeTaskSummary('t-2', { title: 'Order pipes' })],
    } as never);
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Form) {
      Form = await import('./dependencyForm.js');
      FormComponent = await import('../components/ObjectForm/ObjectForm.js');
    }
  });

  afterEach(() => media.restore());

  function Harness(props: Partial<FormTypes.DependencyFormOptions>) {
    const schema = Form.useDependencyFormSchema({
      mode: 'add',
      direction: 'waitsFor',
      workItemId: 'wi-1',
      excludeIds: ['wi-1', 'p-9'],
      onSaved,
      ...props,
    } as FormTypes.DependencyFormOptions);
    return <FormComponent.ObjectForm schema={schema} onCreated={onCreated} onCancel={() => {}} />;
  }

  const renderForm = (props: Partial<FormTypes.DependencyFormOptions> = {}) =>
    render(
      <MemoryRouter>
        <Harness {...props} />
      </MemoryRouter>,
    );

  const save = () => screen.getByTestId('object-form-save');
  const lag = () => screen.getByTestId('dependency-lag') as HTMLInputElement;
  const typeSelect = () => screen.getByTestId('dependency-type') as HTMLSelectElement;

  async function pickTask(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('textbox'));
    await user.click(await screen.findByRole('option', { name: /Order pipes/ }));
  }

  describe('add', () => {
    it('titles the dialog by the list direction and shows task, type and lag with lag 0', () => {
      const { unmount } = renderForm();
      expect(
        screen.getByRole('dialog', { name: 'Add a task this one waits for' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(typeSelect().value).toBe('finish_to_start');
      expect(lag().value).toBe('0');
      unmount();
      renderForm({ direction: 'waiting' });
      expect(
        screen.getByRole('dialog', { name: 'Add a task that waits for this one' }),
      ).toBeInTheDocument();
    });

    it('words the type options relative to this task, by direction', () => {
      const { unmount } = renderForm();
      expect(within(typeSelect()).getByText('Finishes before this starts')).toBeInTheDocument();
      expect(within(typeSelect()).getAllByRole('option')).toHaveLength(4);
      unmount();
      renderForm({ direction: 'waiting' });
      expect(within(typeSelect()).getByText('Starts after this finishes')).toBeInTheDocument();
    });

    it('requires a task', async () => {
      const user = userEvent.setup();
      renderForm();
      await user.click(save());
      expect(await screen.findByText('Choose a task.')).toBeInTheDocument();
      expect(mockCreateDependency).not.toHaveBeenCalled();
    });

    it.each(['1.5', 'abc', ''])('rejects the lag "%s"', async (value) => {
      const user = userEvent.setup();
      renderForm();
      await pickTask(user);
      fireEvent.change(lag(), { target: { value } });
      await user.click(save());
      expect(await screen.findByText('Enter a whole number of days.')).toBeInTheDocument();
      expect(mockCreateDependency).not.toHaveBeenCalled();
    });

    it('rejects a lag beyond the schedule maximum and accepts the maximum itself', async () => {
      const user = userEvent.setup();
      renderForm();
      await pickTask(user);
      fireEvent.change(lag(), { target: { value: String(SCHEDULE_DURATION_DAYS_MAX + 1) } });
      await user.click(save());
      expect(await screen.findByText('Enter a whole number of days.')).toBeInTheDocument();
      fireEvent.change(lag(), { target: { value: `-${SCHEDULE_DURATION_DAYS_MAX}` } });
      await user.click(save());
      await waitFor(() => expect(mockCreateDependency).toHaveBeenCalledTimes(1));
    });

    it('a waits-for dependency makes this task the successor', async () => {
      const user = userEvent.setup();
      renderForm();
      await pickTask(user);
      await user.selectOptions(typeSelect(), 'start_to_start');
      fireEvent.change(lag(), { target: { value: '-2' } });
      await user.click(save());
      await waitFor(() =>
        expect(mockCreateDependency).toHaveBeenCalledWith('wi-1', {
          predecessorId: 't-2',
          dependencyType: 'start_to_start',
          leadLagDays: -2,
        }),
      );
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'wi-1',
          href: '/project/work-items/wi-1?tab=timing',
          label: 'Add a task this one waits for',
        }),
      );
    });

    it('a waiting-for-this dependency makes the picked task the successor', async () => {
      const user = userEvent.setup();
      renderForm({ direction: 'waiting' });
      await pickTask(user);
      await user.click(save());
      await waitFor(() =>
        expect(mockCreateDependency).toHaveBeenCalledWith('t-2', {
          predecessorId: 'wi-1',
          dependencyType: 'finish_to_start',
          leadLagDays: 0,
        }),
      );
    });

    it('does not offer the excluded tasks in the picker', async () => {
      const user = userEvent.setup();
      mockListWorkItems.mockResolvedValue({
        items: [
          makeTaskSummary('p-9', { title: 'Already related' }),
          makeTaskSummary('t-2', { title: 'Order pipes' }),
        ],
      } as never);
      renderForm();
      await user.click(screen.getByRole('textbox'));
      await screen.findByRole('option', { name: /Order pipes/ });
      expect(screen.queryByRole('option', { name: /Already related/ })).toBeNull();
    });

    it.each([
      ['CIRCULAR_DEPENDENCY', 'This would create a circular dependency.'],
      ['DUPLICATE_DEPENDENCY', 'This dependency already exists.'],
    ])('shows %s under the task field and keeps the dialog open', async (code, message) => {
      const user = userEvent.setup();
      mockCreateDependency.mockRejectedValueOnce(
        new ApiClientError(409, { code: code as ErrorCode, message: 'x' }),
      );
      renderForm();
      await pickTask(user);
      await user.click(save());
      const text = await screen.findByText(message);
      expect(text).toBeInTheDocument();
      expect(onCreated).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('shows another server error as the form error, not under the task', async () => {
      const user = userEvent.setup();
      mockCreateDependency.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      renderForm();
      await pickTask(user);
      await user.click(save());
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(onCreated).not.toHaveBeenCalled();
    });
  });

  describe('edit', () => {
    const row = {
      id: 'p-1',
      title: 'Dig trench',
      dependencyType: 'start_to_start' as const,
      leadLagDays: 4,
    };

    it('titles the dialog by the other task and shows type and lag only, prefilled', () => {
      renderForm({ mode: 'edit', row } as never);
      expect(screen.getByRole('dialog', { name: /Dig trench/ })).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(typeSelect().value).toBe('start_to_start');
      expect(lag().value).toBe('4');
    });

    it('saves a waits-for edit with this task as successor, without needing a task', async () => {
      const user = userEvent.setup();
      renderForm({ mode: 'edit', row } as never);
      fireEvent.change(lag(), { target: { value: '6' } });
      await user.click(save());
      await waitFor(() =>
        expect(mockUpdateDependency).toHaveBeenCalledWith('wi-1', 'p-1', {
          dependencyType: 'start_to_start',
          leadLagDays: 6,
        }),
      );
      expect(mockCreateDependency).not.toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalled();
    });

    it('saves a waiting-for edit with the other task as successor', async () => {
      const user = userEvent.setup();
      renderForm({ mode: 'edit', direction: 'waiting', row } as never);
      await user.click(save());
      await waitFor(() =>
        expect(mockUpdateDependency).toHaveBeenCalledWith('p-1', 'wi-1', expect.anything()),
      );
    });

    it('shows a circular-dependency error as the form error in edit mode (there is no task field)', async () => {
      const user = userEvent.setup();
      mockUpdateDependency.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'CIRCULAR_DEPENDENCY', message: 'x' }),
      );
      renderForm({ mode: 'edit', row } as never);
      await user.click(save());
      expect(await screen.findByRole('alert')).toHaveTextContent(/.+/);
      expect(onCreated).not.toHaveBeenCalled();
    });

    it('still validates the lag', async () => {
      const user = userEvent.setup();
      renderForm({ mode: 'edit', row } as never);
      fireEvent.change(lag(), { target: { value: 'x' } });
      await user.click(save());
      expect(await screen.findByText('Enter a whole number of days.')).toBeInTheDocument();
      expect(mockUpdateDependency).not.toHaveBeenCalled();
    });
  });
});
