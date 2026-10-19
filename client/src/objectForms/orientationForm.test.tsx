/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { CreateOrientationRequest, OrientationResponse } from '@cornerstone/shared';
import { routeUrl } from '@cornerstone/shared';
import { ApiClientError } from '../lib/apiClient.js';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type { ObjectFormResult } from '../components/ObjectForm/types.js';
import type * as FormTypes from './orientationForm.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';

const mockCreateOrientation =
  jest.fn<(data: CreateOrientationRequest) => Promise<OrientationResponse>>();
jest.unstable_mockModule('../lib/orientationApi.js', () => ({
  createOrientation: mockCreateOrientation,
}));

const created = (name: string): OrientationResponse => ({
  id: 'o-1',
  name,
  description: null,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('orientationForm', () => {
  let Form: typeof FormTypes;
  let FormComponent: typeof ObjectFormTypes;
  let media: MatchMediaControl;
  const onCreated = jest.fn<(result: ObjectFormResult) => void>();

  beforeEach(async () => {
    mockCreateOrientation.mockReset();
    onCreated.mockReset();
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Form) {
      Form = await import('./orientationForm.js');
      FormComponent = await import('../components/ObjectForm/ObjectForm.js');
    }
  });

  afterEach(() => {
    media.restore();
  });

  function Harness() {
    const schema = Form.useOrientationFormSchema();
    return <FormComponent.ObjectForm schema={schema} onCreated={onCreated} onCancel={() => {}} />;
  }

  const renderForm = () =>
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );

  const schema = () => renderHook(() => Form.useOrientationFormSchema()).result.current;

  describe('schema', () => {
    it('is the New orientation form with API-keyed fields', () => {
      const s = schema();

      expect(s.id).toBe('orientation');
      expect(s.title).toBe('New orientation');
      expect(s.initialValues).toEqual({ name: '', description: '' });
      expect(s.fields.map((field) => field.name)).toEqual(['name', 'description']);
    });

    it('makes name an essential required text field and description a textarea under More details', () => {
      const [name, description] = schema().fields;

      expect(name).toMatchObject({
        kind: 'text',
        essential: true,
        required: true,
        maxLength: Form.ORIENTATION_NAME_MAX_LENGTH,
        label: 'Name',
      });
      expect(Form.ORIENTATION_NAME_MAX_LENGTH).toBe(200);
      expect(description).toMatchObject({
        kind: 'textarea',
        maxLength: Form.ORIENTATION_DESCRIPTION_MAX_LENGTH,
        label: 'Description',
      });
      expect(Form.ORIENTATION_DESCRIPTION_MAX_LENGTH).toBe(2000);
      expect(description?.essential).toBeFalsy();
    });

    it('requires a name after trimming', () => {
      const { validate } = schema();

      expect(validate({ name: '', description: '' })).toEqual({ name: 'Enter a name.' });
      expect(validate({ name: '   ', description: '' })).toEqual({ name: 'Enter a name.' });
      expect(validate({ name: undefined, description: '' })).toEqual({ name: 'Enter a name.' });
      expect(validate({ name: 'North', description: '' })).toEqual({});
    });

    it('maps CONFLICT to a name error and leaves other codes to the banner', () => {
      const { mapError } = schema();

      expect(mapError?.('CONFLICT', { name: 'North' })).toEqual({
        name: 'An orientation with this name already exists.',
      });
      expect(mapError?.('VALIDATION_ERROR', { name: 'North' })).toBeNull();
    });

    it('submit trims, sends null for an empty description and returns the stored name', async () => {
      mockCreateOrientation.mockResolvedValue(created('North side'));

      const result = await schema().submit({ name: '  North  ', description: '   ' });

      expect(mockCreateOrientation).toHaveBeenCalledWith({ name: 'North', description: null });
      expect(result).toEqual({ id: 'o-1', href: routeUrl('settingsManage'), label: 'North side' });
    });

    it('submit sends the trimmed description', async () => {
      mockCreateOrientation.mockResolvedValue(created('North'));

      await schema().submit({ name: 'North', description: '  Faces the street  ' });

      expect(mockCreateOrientation).toHaveBeenCalledWith({
        name: 'North',
        description: 'Faces the street',
      });
    });
  });

  describe('in the ObjectForm', () => {
    it('creates the orientation and reports the result', async () => {
      const user = userEvent.setup();
      mockCreateOrientation.mockResolvedValue(created('North'));
      renderForm();

      expect(screen.getByRole('dialog', { name: 'New orientation' })).toBeInTheDocument();
      await user.type(screen.getByTestId('orientation-name-input'), 'North');
      await user.click(screen.getByTestId('object-form-save'));

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(onCreated.mock.calls[0]![0]).toMatchObject({ id: 'o-1', label: 'North' });
    });

    it('does not save without a name', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByTestId('object-form-save'));

      expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
      expect(mockCreateOrientation).not.toHaveBeenCalled();
    });

    it('shows a duplicate error on the name for a server CONFLICT, without a banner', async () => {
      const user = userEvent.setup();
      mockCreateOrientation.mockRejectedValue(
        new ApiClientError(409, { code: 'CONFLICT', message: 'server text' }),
      );
      renderForm();

      await user.type(screen.getByTestId('orientation-name-input'), 'North');
      await user.click(screen.getByTestId('object-form-save'));

      expect(
        await screen.findByText('An orientation with this name already exists.'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('orientation-name-input')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(onCreated).not.toHaveBeenCalled();
    });
  });
});
