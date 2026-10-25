/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { routeUrl } from '@cornerstone/shared';
import { ApiClientError } from '../lib/apiClient.js';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type { ObjectFormResult } from '../components/ObjectForm/types.js';
import type * as ApiTypes from '../lib/householdItemCategoriesApi.js';
import type * as FormTypes from './purchaseCategoryForm.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';

const mockCreate = jest.fn<typeof ApiTypes.createHouseholdItemCategory>();
jest.unstable_mockModule('../lib/householdItemCategoriesApi.js', () => ({
  createHouseholdItemCategory: mockCreate,
}));

const created = (name: string) =>
  ({ id: 'c-1', name }) as Awaited<ReturnType<typeof ApiTypes.createHouseholdItemCategory>>;

describe('purchaseCategoryForm', () => {
  let Form: typeof FormTypes;
  let FormComponent: typeof ObjectFormTypes;
  let media: MatchMediaControl;
  const onCreated = jest.fn<(result: ObjectFormResult) => void>();

  beforeEach(async () => {
    mockCreate.mockReset();
    onCreated.mockReset();
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Form) {
      Form = await import('./purchaseCategoryForm.js');
      FormComponent = await import('../components/ObjectForm/ObjectForm.js');
    }
  });

  afterEach(() => {
    media.restore();
  });

  function Harness({ prefill }: { prefill?: Record<string, string> }) {
    const schema = Form.usePurchaseCategoryFormSchema();
    return (
      <FormComponent.ObjectForm
        schema={schema}
        prefill={prefill}
        onCreated={onCreated}
        onCancel={() => {}}
      />
    );
  }

  const renderForm = (prefill?: Record<string, string>) =>
    render(
      <MemoryRouter>
        <Harness prefill={prefill} />
      </MemoryRouter>,
    );

  const schema = () => renderHook(() => Form.usePurchaseCategoryFormSchema()).result.current;

  describe('schema', () => {
    it('is the New purchase category form with a name only', () => {
      const s = schema();

      expect(s.id).toBe('purchase-category');
      expect(s.title).toBe('New purchase category');
      expect(s.initialValues).toEqual({ name: '' });
      expect(s.fields.map((field) => field.name)).toEqual(['name']);
    });

    it('makes name an essential required text field with the API length cap', () => {
      const [name] = schema().fields;

      expect(name).toMatchObject({
        kind: 'text',
        essential: true,
        required: true,
        maxLength: Form.PURCHASE_CATEGORY_NAME_MAX_LENGTH,
        label: 'Name',
        testId: 'purchase-category-name-input',
      });
      expect(Form.PURCHASE_CATEGORY_NAME_MAX_LENGTH).toBe(100);
    });

    it('requires a name after trimming', () => {
      const { validate } = schema();

      expect(validate({ name: '' })).toEqual({ name: 'Enter a name.' });
      expect(validate({ name: '   ' })).toEqual({ name: 'Enter a name.' });
      expect(validate({ name: undefined })).toEqual({ name: 'Enter a name.' });
      expect(validate({ name: 42 })).toEqual({ name: 'Enter a name.' });
      expect(validate({ name: 'Furniture' })).toEqual({});
    });

    it('maps CONFLICT to a name error and leaves other codes to the banner', () => {
      const { mapError } = schema();

      expect(mapError?.('CONFLICT', { name: 'Furniture' })).toEqual({
        name: 'A purchase category with this name already exists.',
      });
      expect(mapError?.('VALIDATION_ERROR', { name: 'Furniture' })).toBeNull();
      expect(mapError?.('NOT_FOUND', { name: 'Furniture' })).toBeNull();
    });

    it('submit trims, creates and returns the stored name with the settings link', async () => {
      mockCreate.mockResolvedValue(created('Furniture (stored)'));

      const result = await schema().submit({ name: '  Furniture  ' });

      expect(mockCreate).toHaveBeenCalledWith({ name: 'Furniture' });
      expect(result).toEqual({
        id: 'c-1',
        href: routeUrl('settingsManage'),
        label: 'Furniture (stored)',
      });
    });
  });

  describe('in the ObjectForm', () => {
    it('creates the entry and reports the result', async () => {
      const user = userEvent.setup();
      mockCreate.mockResolvedValue(created('Glass'));
      renderForm();

      expect(screen.getByRole('dialog', { name: 'New purchase category' })).toBeInTheDocument();
      await user.type(screen.getByTestId('purchase-category-name-input'), 'Glass');
      await user.click(screen.getByTestId('object-form-save'));

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(onCreated.mock.calls[0]?.[0]).toMatchObject({ id: 'c-1', label: 'Glass' });
    });

    it('pre-fills the name typed into the picker', async () => {
      const user = userEvent.setup();
      mockCreate.mockResolvedValue(created('Glass'));
      renderForm({ name: 'Glass' });

      expect(screen.getByTestId('purchase-category-name-input')).toHaveValue('Glass');
      await user.click(screen.getByTestId('object-form-save'));

      await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ name: 'Glass' }));
    });

    it('does not save without a name', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByTestId('object-form-save'));

      expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('shows a duplicate error on the name for a server 409, without a banner', async () => {
      const user = userEvent.setup();
      mockCreate.mockRejectedValue(
        new ApiClientError(409, { code: 'CONFLICT', message: 'server text' }),
      );
      renderForm();

      await user.type(screen.getByTestId('purchase-category-name-input'), 'Furniture');
      await user.click(screen.getByTestId('object-form-save'));

      expect(
        await screen.findByText('A purchase category with this name already exists.'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('purchase-category-name-input')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(screen.queryByRole('alert')).toBeNull();
      expect(onCreated).not.toHaveBeenCalled();
    });

    it('shows a banner for any other server error and keeps the form open', async () => {
      const user = userEvent.setup();
      mockCreate.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'boom' }),
      );
      renderForm();

      await user.type(screen.getByTestId('purchase-category-name-input'), 'Glass');
      await user.click(screen.getByTestId('object-form-save'));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'New purchase category' })).toBeInTheDocument();
      expect(onCreated).not.toHaveBeenCalled();
    });
  });
});
