/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { SubtaskResponse } from '@cornerstone/shared';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type { ObjectFormResult } from '../components/ObjectForm/types.js';
import type * as SubtasksApiTypes from '../lib/subtasksApi.js';
import type * as FormTypes from './checklistItemForm.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';

const mockUpdateSubtask = jest.fn<typeof SubtasksApiTypes.updateSubtask>();
jest.unstable_mockModule('../lib/subtasksApi.js', () => ({ updateSubtask: mockUpdateSubtask }));

const ITEM: SubtaskResponse = {
  id: 'st-1',
  title: 'Order gravel',
  isCompleted: false,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('checklistItemForm (ObjectForm schema)', () => {
  let Form: typeof FormTypes;
  let FormComponent: typeof ObjectFormTypes;
  let media: MatchMediaControl;
  const onCreated = jest.fn<(r: ObjectFormResult) => void>();
  const onSaved = jest.fn<() => Promise<unknown>>();

  beforeEach(async () => {
    for (const mock of [mockUpdateSubtask, onCreated, onSaved]) mock.mockReset();
    mockUpdateSubtask.mockResolvedValue({} as never);
    onSaved.mockResolvedValue(undefined);
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Form) {
      Form = await import('./checklistItemForm.js');
      FormComponent = await import('../components/ObjectForm/ObjectForm.js');
    }
  });

  afterEach(() => media.restore());

  function Harness() {
    const schema = Form.useChecklistItemFormSchema({ workItemId: 'wi-1', item: ITEM, onSaved });
    return <FormComponent.ObjectForm schema={schema} onCreated={onCreated} onCancel={() => {}} />;
  }

  const renderForm = () =>
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );
  const nameInput = () => screen.getByTestId('checklist-item-form-title') as HTMLInputElement;
  const save = () => screen.getByTestId('object-form-save');

  it('opens as "Rename checklist item" with the current name, required', () => {
    renderForm();
    expect(screen.getByRole('dialog', { name: 'Rename checklist item' })).toBeInTheDocument();
    expect(nameInput().value).toBe('Order gravel');
    expect(nameInput()).toHaveAttribute('aria-required', 'true');
  });

  it('requires a name (blank counts as empty) and sends nothing', async () => {
    const user = userEvent.setup();
    renderForm();
    fireEvent.change(nameInput(), { target: { value: '   ' } });
    await user.click(save());
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
    expect(mockUpdateSubtask).not.toHaveBeenCalled();
  });

  it('saves the trimmed name, refreshes the page and reports the task', async () => {
    const user = userEvent.setup();
    renderForm();
    fireEvent.change(nameInput(), { target: { value: '  Order the gravel  ' } });
    await user.click(save());
    await waitFor(() =>
      expect(mockUpdateSubtask).toHaveBeenCalledWith('wi-1', 'st-1', { title: 'Order the gravel' }),
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'st-1',
        href: '/project/work-items/wi-1',
        label: 'Order the gravel',
      }),
    );
  });

  it('treats a non-text value as empty when validating', () => {
    const { result } = renderHook(() =>
      Form.useChecklistItemFormSchema({ workItemId: 'wi-1', item: ITEM, onSaved }),
    );
    expect(result.current.validate({ title: 42 })).toEqual({ title: 'Enter a name.' });
    expect(result.current.validate({ title: 'ok' })).toEqual({});
  });
});
