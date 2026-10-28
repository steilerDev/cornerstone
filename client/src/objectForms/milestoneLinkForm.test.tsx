/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ErrorCode } from '@cornerstone/shared';
import { ApiClientError } from '../lib/apiClient.js';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../test/photoSpotFixtures.js';
import type { ObjectFormResult } from '../components/ObjectForm/types.js';
import type * as MilestonesApiTypes from '../lib/milestonesApi.js';
import type * as LinkApiTypes from '../lib/workItemMilestonesApi.js';
import type * as FormTypes from './milestoneLinkForm.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';

const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
const mockAddRequired = jest.fn<typeof LinkApiTypes.addRequiredMilestone>();
const mockAddLinked = jest.fn<typeof LinkApiTypes.addLinkedMilestone>();
jest.unstable_mockModule('../lib/milestonesApi.js', () => ({ listMilestones: mockListMilestones }));
jest.unstable_mockModule('../lib/workItemMilestonesApi.js', () => ({
  addRequiredMilestone: mockAddRequired,
  addLinkedMilestone: mockAddLinked,
}));
jest.unstable_mockModule('../contexts/LocaleContext.js', () => makeLocaleContextMock());

describe('milestoneLinkForm (ObjectForm schema)', () => {
  let Form: typeof FormTypes;
  let FormComponent: typeof ObjectFormTypes;
  let media: MatchMediaControl;
  const onCreated = jest.fn<(r: ObjectFormResult) => void>();
  const onSaved = jest.fn<() => Promise<unknown>>();

  beforeEach(async () => {
    for (const mock of [mockListMilestones, mockAddRequired, mockAddLinked, onCreated, onSaved]) {
      mock.mockReset();
    }
    onSaved.mockResolvedValue(undefined);
    mockAddRequired.mockResolvedValue({} as never);
    mockAddLinked.mockResolvedValue({} as never);
    mockListMilestones.mockResolvedValue([
      { id: 4, title: 'Roof closed', targetDate: '2026-05-01' },
      { id: 9, title: 'Shell finished', targetDate: '2026-07-15' },
    ] as never);
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Form) {
      Form = await import('./milestoneLinkForm.js');
      FormComponent = await import('../components/ObjectForm/ObjectForm.js');
    }
  });

  afterEach(() => media.restore());

  function Harness() {
    const schema = Form.useMilestoneLinkFormSchema({
      workItemId: 'wi-1',
      requiredIds: ['4'],
      linkedIds: ['9'],
      onSaved,
    });
    return <FormComponent.ObjectForm schema={schema} onCreated={onCreated} onCancel={() => {}} />;
  }

  const renderForm = () =>
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );

  const save = () => screen.getByTestId('object-form-save');
  const relation = () => screen.getByTestId('milestone-link-relation') as HTMLSelectElement;

  async function pick(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
    await user.click(screen.getByRole('textbox'));
    await user.click(await screen.findByRole('option', { name }));
  }

  it('opens as "Link milestone" with the relation defaulting to waits-for', () => {
    renderForm();
    expect(screen.getByRole('dialog', { name: 'Link milestone' })).toBeInTheDocument();
    expect(relation().value).toBe('required');
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('requires a milestone', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(save());
    expect(await screen.findByText('Choose a milestone.')).toBeInTheDocument();
    expect(mockAddRequired).not.toHaveBeenCalled();
  });

  it('hides the milestones the task already waits for while the relation is waits-for', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('textbox'));
    expect(await screen.findByRole('option', { name: /Shell finished/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Roof closed/ })).toBeNull();
  });

  it('hides the milestones the task already counts toward once the relation is counts-toward', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(relation(), 'linked');
    await user.click(screen.getByRole('textbox'));
    expect(await screen.findByRole('option', { name: /Roof closed/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Shell finished/ })).toBeNull();
  });

  it('adds a required milestone by its number, refreshes and reports the task page', async () => {
    const user = userEvent.setup();
    renderForm();
    await pick(user, /Shell finished/);
    await user.click(save());
    await waitFor(() => expect(mockAddRequired).toHaveBeenCalledWith('wi-1', 9));
    expect(mockAddLinked).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'wi-1',
        href: '/project/work-items/wi-1?tab=timing',
        label: 'Link milestone',
      }),
    );
  });

  it('adds a counts-toward milestone through the linked endpoint', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(relation(), 'linked');
    await pick(user, /Roof closed/);
    await user.click(save());
    await waitFor(() => expect(mockAddLinked).toHaveBeenCalledWith('wi-1', 4));
    expect(mockAddRequired).not.toHaveBeenCalled();
  });

  it.each([
    ['CIRCULAR_DEPENDENCY', 'This would create a circular dependency.'],
    ['DUPLICATE_DEPENDENCY', 'This dependency already exists.'],
  ])('shows %s under the milestone field', async (code, message) => {
    const user = userEvent.setup();
    mockAddRequired.mockRejectedValueOnce(
      new ApiClientError(409, { code: code as ErrorCode, message: 'x' }),
    );
    renderForm();
    await pick(user, /Shell finished/);
    await user.click(save());
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows another server error as the form error', async () => {
    const user = userEvent.setup();
    mockAddRequired.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    renderForm();
    await pick(user, /Shell finished/);
    await user.click(save());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
