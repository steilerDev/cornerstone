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
import type { ReferenceListItem } from '../components/ReferenceList/ReferenceList.js';
import type * as FormTypes from './orientationForm.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreateApi = jest.fn<(body: any) => Promise<any>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUpdateApi = jest.fn<(id: string, body: any) => Promise<any>>();
jest.unstable_mockModule('../lib/orientationApi.js', () => ({
  createOrientation: mockCreateApi,
  updateOrientation: mockUpdateApi,
}));

let mockLanguage: string | null = 'de';
jest.unstable_mockModule('../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => mockLanguage,
  useHouseName: () => ({ houseName: null, entriesLanguage: mockLanguage }),
}));

const row = (overrides: Partial<ReferenceListItem> = {}): ReferenceListItem => ({
  id: 'r-1',
  name: 'Test Category A',
  description: null,
  ...overrides,
});

describe('orientationForm', () => {
  let Form: typeof FormTypes;
  let FormComponent: typeof ObjectFormTypes;
  let media: MatchMediaControl;
  const onCreated = jest.fn<(result: ObjectFormResult) => void>();
  const onCreate = jest.fn<(values: { name: string }) => Promise<{ id: string }>>();
  const onUpdate = jest.fn<(id: string, changes: Record<string, unknown>) => Promise<unknown>>();

  beforeEach(async () => {
    mockCreateApi.mockReset();
    mockUpdateApi.mockReset();
    onCreated.mockReset();
    onCreate.mockReset();
    onUpdate.mockReset();
    mockLanguage = 'de';
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Form) {
      Form = await import('./orientationForm.js');
      FormComponent = await import('../components/ObjectForm/ObjectForm.js');
    }
  });

  afterEach(() => {
    media.restore();
  });

  function Harness({
    options,
    prefill,
  }: {
    options?: Parameters<typeof FormTypes.useOrientationFormSchema>[0];
    prefill?: Record<string, string>;
  }) {
    const schema = Form.useOrientationFormSchema(options);
    return (
      <FormComponent.ObjectForm
        schema={schema}
        prefill={prefill}
        onCreated={onCreated}
        onCancel={() => {}}
      />
    );
  }

  const renderForm = (
    options?: Parameters<typeof FormTypes.useOrientationFormSchema>[0],
    prefill?: Record<string, string>,
  ) =>
    render(
      <MemoryRouter>
        <Harness options={options} prefill={prefill} />
      </MemoryRouter>,
    );

  const schema = (options?: Parameters<typeof FormTypes.useOrientationFormSchema>[0]) =>
    renderHook(() => Form.useOrientationFormSchema(options)).result.current;

  describe('schema (new)', () => {
    it('is the New orientation form with API-keyed fields in order', () => {
      const s = schema();

      expect(s.id).toBe('orientation');
      expect(s.title).toBe('New orientation');
      expect(s.initialValues).toEqual({ name: '', description: '' });
      expect(s.fields.map((field) => field.name)).toEqual(['name', 'description']);
    });

    it('marks only the name essential, required and capped at the server limit', () => {
      const s = schema();
      const [name, ...rest] = s.fields;

      expect(name).toMatchObject({
        name: 'name',
        kind: 'text',
        essential: true,
        required: true,
        maxLength: Form.ORIENTATION_NAME_MAX_LENGTH,
        testId: 'orientation-name-input',
      });
      expect(rest.every((field) => !field.essential)).toBe(true);
      expect(Form.ORIENTATION_NAME_MAX_LENGTH).toBe(200);
      expect(rest[0]).toMatchObject({
        name: 'description',
        kind: 'textarea',
        maxLength: Form.ORIENTATION_DESCRIPTION_MAX_LENGTH,
      });
      expect(Form.ORIENTATION_DESCRIPTION_MAX_LENGTH).toBe(2000);
    });

    it('sets the entries language on the text-like fields', () => {
      mockLanguage = 'de';
      expect(
        schema()
          .fields.filter((f) => f.kind !== 'color')
          .map((f) => f.lang),
      ).toEqual(['de', 'de']);
      mockLanguage = null;
      expect(schema().fields.every((f) => f.lang === undefined)).toBe(true);
    });

    it('requires a name after trimming', () => {
      const { validate } = schema();

      expect(validate({ name: '' })).toEqual({ name: 'Enter a name.' });
      expect(validate({ name: '   ' })).toEqual({ name: 'Enter a name.' });
      expect(validate({ name: undefined })).toEqual({ name: 'Enter a name.' });
      expect(validate({ name: 42 })).toEqual({ name: 'Enter a name.' });
      expect(validate({ name: 'Test Category A' })).toEqual({});
    });

    it('maps CONFLICT to a name error and leaves other codes to the banner', () => {
      const { mapError } = schema();

      expect(mapError?.('CONFLICT', { name: 'A' })).toEqual({
        name: 'An orientation with this name already exists.',
      });
      expect(mapError?.('VALIDATION_ERROR', { name: 'A' })).toBeNull();
      expect(mapError?.('NOT_FOUND', { name: 'A' })).toBeNull();
    });

    it('submit calls the injected create with exactly the normalised values', async () => {
      onCreate.mockResolvedValue({ id: 'new-1' });

      const result = await schema({ create: onCreate }).submit({
        name: '  Test Category A  ',
        description: '   ',
      });

      expect(onCreate).toHaveBeenCalledTimes(1);
      expect(onCreate.mock.calls[0]?.[0]).toEqual({ name: 'Test Category A', description: null });
      expect(mockCreateApi).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: 'new-1',
        href: routeUrl('settingsManage'),
        label: 'Test Category A',
      });
    });

    it('submit falls back to the API client without an injected create', async () => {
      mockCreateApi.mockResolvedValue({ id: 'api-1', name: 'Test Category A' });

      const result = await schema().submit({ name: '  Test Category A  ', description: '   ' });

      expect(mockCreateApi).toHaveBeenCalledWith({ name: 'Test Category A', description: null });
      expect(result.id).toBe('api-1');
    });
  });

  describe('schema (edit)', () => {
    it('uses the edit id and title', () => {
      const s = schema({ mode: 'edit', item: row() });

      expect(s.id).toBe('orientation-edit');
      expect(s.title).toBe('Edit orientation');
    });

    it('shows the translated hint only for a translated row', () => {
      const plain = schema({ mode: 'edit', item: row() }).fields[0]!;
      const translated = schema({ mode: 'edit', item: row({ translated: true }) }).fields[0]!;
      const newMode = schema({ item: row({ translated: true }) }).fields[0]!;

      expect(plain.hint).toBeUndefined();
      expect(translated.hint).toBe(
        'This name is translated. If you change it, your text is shown in every language.',
      );
      expect(newMode.hint).toBeUndefined();
    });

    it('prefill carries the row values and is undefined for a new object', () => {
      expect(Form.orientationFormPrefill(undefined)).toBeUndefined();
      expect(Form.orientationFormPrefill(row())).toMatchObject({ name: 'Test Category A' });
    });

    it('an unchanged save calls neither update nor the API', async () => {
      const result = await schema({ mode: 'edit', item: row(), update: onUpdate }).submit({
        name: 'Test Category A',
        description: '',
      });

      expect(onUpdate).not.toHaveBeenCalled();
      expect(mockUpdateApi).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: 'r-1',
        href: routeUrl('settingsManage'),
        label: 'Test Category A',
      });
    });

    it('an unchanged translated name sends nothing (keeps the translation key)', async () => {
      await schema({
        mode: 'edit',
        item: row({ name: 'Übersetzt', translated: true }),
        update: onUpdate,
      }).submit({ name: 'Übersetzt', description: '' });

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('a change calls the injected update with only the changed fields', async () => {
      onUpdate.mockResolvedValue(undefined);

      await schema({ mode: 'edit', item: row(), update: onUpdate }).submit({
        name: 'Test Category A',
        description: '  Faces the street ',
      });

      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate.mock.calls[0]).toEqual(['r-1', { description: 'Faces the street' }]);
      expect(mockUpdateApi).not.toHaveBeenCalled();
    });

    it('a change falls back to the API client with only the changed fields', async () => {
      mockUpdateApi.mockResolvedValue({ id: 'r-1' });

      await schema({ mode: 'edit', item: row() }).submit({
        name: 'Test Category A',
        description: '  Faces the street ',
      });

      expect(mockUpdateApi).toHaveBeenCalledWith('r-1', { description: 'Faces the street' });
    });

    it('sends a name-only change to the API client without the other keys', async () => {
      mockUpdateApi.mockResolvedValue({ id: 'r-1' });

      await schema({ mode: 'edit', item: row() }).submit({
        name: 'Test Category B',
        description: '',
      });

      expect(mockUpdateApi.mock.calls[0]).toEqual(['r-1', { name: 'Test Category B' }]);
    });

    it('treats edit mode without an item as a new object', async () => {
      mockCreateApi.mockResolvedValue({ id: 'api-2' });
      const s = schema({ mode: 'edit' });

      expect(s.fields[0]?.hint).toBeUndefined();
      await s.submit({ name: '  Test Category A  ', description: '   ' });

      expect(mockCreateApi).toHaveBeenCalledTimes(1);
      expect(mockUpdateApi).not.toHaveBeenCalled();
    });
  });

  describe('in the ObjectForm', () => {
    it('creates the object and reports the result', async () => {
      const user = userEvent.setup();
      mockCreateApi.mockResolvedValue({ id: 'c-1', name: 'Glass' });
      renderForm();

      expect(screen.getByRole('dialog', { name: 'New orientation' })).toBeInTheDocument();
      await user.type(screen.getByTestId('orientation-name-input'), 'Glass');
      await user.click(screen.getByTestId('object-form-save'));

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(onCreated.mock.calls[0]?.[0]).toMatchObject({ id: 'c-1', label: 'Glass' });
    });

    it('pre-fills the name typed into a picker', async () => {
      const user = userEvent.setup();
      mockCreateApi.mockResolvedValue({ id: 'c-1', name: 'Glass' });
      renderForm(undefined, { name: 'Glass' });

      expect(screen.getByTestId('orientation-name-input')).toHaveValue('Glass');
      await user.click(screen.getByTestId('object-form-save'));

      await waitFor(() => expect(mockCreateApi).toHaveBeenCalledTimes(1));
      expect(mockCreateApi.mock.calls[0]?.[0]).toMatchObject({ name: 'Glass' });
    });

    it('does not save without a name', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByTestId('object-form-save'));

      expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
      expect(mockCreateApi).not.toHaveBeenCalled();
    });

    it('shows a duplicate error on the name for a server CONFLICT, without a banner', async () => {
      const user = userEvent.setup();
      mockCreateApi.mockRejectedValue(
        new ApiClientError(409, { code: 'CONFLICT', message: 'server text' }),
      );
      renderForm();

      await user.type(screen.getByTestId('orientation-name-input'), 'Test Category A');
      await user.click(screen.getByTestId('object-form-save'));

      expect(
        await screen.findByText('An orientation with this name already exists.'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('orientation-name-input')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(onCreated).not.toHaveBeenCalled();
    });

    it('shows a banner for any other server error and keeps the form open', async () => {
      const user = userEvent.setup();
      mockCreateApi.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'boom' }),
      );
      renderForm();

      await user.type(screen.getByTestId('orientation-name-input'), 'Glass');
      await user.click(screen.getByTestId('object-form-save'));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'New orientation' })).toBeInTheDocument();
      expect(onCreated).not.toHaveBeenCalled();
    });

    it('edit mode opens prefilled, saves a change through update and reports the row', async () => {
      const user = userEvent.setup();
      onUpdate.mockResolvedValue(undefined);
      const item = row();
      const Edit = () => {
        const s = Form.useOrientationFormSchema({ mode: 'edit', item, update: onUpdate });
        const prefill = Form.orientationFormPrefill(item);
        return (
          <FormComponent.ObjectForm
            schema={s}
            prefill={prefill}
            onCreated={onCreated}
            onCancel={() => {}}
          />
        );
      };
      render(
        <MemoryRouter>
          <Edit />
        </MemoryRouter>,
      );

      expect(screen.getByRole('dialog', { name: 'Edit orientation' })).toBeInTheDocument();
      const input = screen.getByTestId('orientation-name-input');
      expect(input).toHaveValue('Test Category A');
      await user.clear(input);
      await user.type(input, 'Test Category B');
      await user.click(screen.getByTestId('object-form-save'));

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(onUpdate.mock.calls[0]).toEqual(['r-1', { name: 'Test Category B' }]);
      expect(onCreated.mock.calls[0]?.[0]).toMatchObject({ id: 'r-1', label: 'Test Category B' });
    });
  });
});
