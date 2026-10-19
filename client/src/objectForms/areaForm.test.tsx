/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { AreaResponse, CreateAreaRequest, UpdateAreaRequest } from '@cornerstone/shared';
import { ApiClientError } from '../lib/apiClient.js';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type { ObjectFormResult } from '../components/ObjectForm/types.js';
import type * as FormTypes from './areaForm.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';

const mockCreateArea = jest.fn<(data: CreateAreaRequest) => Promise<AreaResponse>>();
const mockUpdateArea = jest.fn<(id: string, data: UpdateAreaRequest) => Promise<AreaResponse>>();
jest.unstable_mockModule('../lib/areasApi.js', () => ({
  createArea: mockCreateArea,
  updateArea: mockUpdateArea,
}));

jest.unstable_mockModule('../components/AreaPicker/AreaPicker.js', () => ({
  AreaPicker: ({
    areas,
    value,
    onChange,
    id,
    disabled,
    nullable,
    nullLabel,
    excludeIds,
  }: {
    areas: Array<{ id: string; name: string }>;
    value: string;
    onChange: (id: string) => void;
    id?: string;
    disabled?: boolean;
    nullable?: boolean;
    nullLabel?: string;
    excludeIds?: readonly string[];
  }) => (
    <select
      id={id}
      data-testid="area-picker-mock"
      data-nullable={String(nullable)}
      data-exclude={(excludeIds ?? []).join(',')}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{nullLabel}</option>
      {areas.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  ),
}));

function make(
  id: string,
  name: string,
  parentId: string | null,
  extra: Partial<AreaResponse> = {},
) {
  return {
    id,
    name,
    parentId,
    color: null,
    description: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  } satisfies AreaResponse;
}

const HOUSE = make('house', 'House', null);
const GROUND = make('ground', 'Ground floor', 'house');
const KITCHEN = make('kitchen', 'Küche', 'ground', {
  color: '#336699',
  description: 'Cooking happens here',
});
const GARAGE = make('garage', 'Garage', null);
const AREAS = [HOUSE, GROUND, KITCHEN, GARAGE];

describe('areaForm', () => {
  let Form: typeof FormTypes;
  let FormComponent: typeof ObjectFormTypes;
  let media: MatchMediaControl;
  const onCreated = jest.fn<(result: ObjectFormResult) => void>();

  beforeEach(async () => {
    mockCreateArea.mockReset();
    mockUpdateArea.mockReset();
    onCreated.mockReset();
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Form) {
      Form = await import('./areaForm.js');
      FormComponent = await import('../components/ObjectForm/ObjectForm.js');
    }
  });

  afterEach(() => {
    media.restore();
  });

  function Harness({
    mode = 'new',
    area,
    presetParentId,
    areas = AREAS,
  }: {
    mode?: 'new' | 'edit';
    area?: AreaResponse;
    presetParentId?: string | null;
    areas?: AreaResponse[];
  }) {
    const schema = Form.useAreaFormSchema({ mode, ...(area ? { area } : {}), areas });
    const prefill = Form.areaFormPrefill({ mode, ...(area ? { area } : {}) }, presetParentId);
    return (
      <FormComponent.ObjectForm
        schema={schema}
        prefill={prefill}
        onCreated={onCreated}
        onCancel={() => {}}
      />
    );
  }

  const renderForm = (props: Parameters<typeof Harness>[0] = {}) =>
    render(
      <MemoryRouter>
        <Harness {...props} />
      </MemoryRouter>,
    );

  const nameInput = () => screen.getByTestId('area-name-input') as HTMLInputElement;
  const parentSelect = () => screen.getByTestId('area-picker-mock') as HTMLSelectElement;
  const save = () => screen.getByTestId('object-form-save');

  describe('areaFormPrefill', () => {
    it('is empty for a new area without a preset parent', () => {
      expect(Form.areaFormPrefill({ mode: 'new' })).toEqual({});
      expect(Form.areaFormPrefill({ mode: 'new' }, null)).toEqual({});
    });

    it('presets only the parent for "Add sub-area"', () => {
      expect(Form.areaFormPrefill({ mode: 'new' }, 'house')).toEqual({ parentId: 'house' });
    });

    it('carries all four values of the area for an edit and an empty string for no parent', () => {
      expect(Form.areaFormPrefill({ mode: 'edit', area: KITCHEN })).toEqual({
        name: 'Küche',
        parentId: 'ground',
        color: '#336699',
        description: 'Cooking happens here',
      });
      expect(Form.areaFormPrefill({ mode: 'edit', area: HOUSE })).toEqual({
        name: 'House',
        parentId: '',
        color: null,
        description: '',
      });
    });

    it('ignores the preset parent for an edit', () => {
      expect(Form.areaFormPrefill({ mode: 'edit', area: HOUSE }, 'garage')).toMatchObject({
        parentId: '',
      });
    });

    it('falls back to the new-area values for an edit without an area', () => {
      expect(Form.areaFormPrefill({ mode: 'edit' }, 'house')).toEqual({ parentId: 'house' });
    });
  });

  describe('new area', () => {
    it('titles the dialog "New area" and shows name and "Part of" up front, the rest under More details', () => {
      renderForm();
      expect(screen.getByRole('dialog', { name: 'New area' })).toBeInTheDocument();
      expect(nameInput()).toHaveFocus();
      expect(nameInput()).toHaveAttribute('maxlength', String(Form.AREA_NAME_MAX_LENGTH));
      expect(nameInput()).toHaveAttribute('aria-required', 'true');
      expect(parentSelect()).toBeInTheDocument();
      expect(screen.getByText('The building or floor this area belongs to.')).toBeInTheDocument();
      expect(screen.getByTestId('area-color')).not.toBeVisible();
      expect(screen.getByTestId('area-description-input')).not.toBeVisible();
      expect(nameInput()).toBeVisible();
      expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'false');
    });

    it('offers "Top level (no parent)" as the empty parent option', () => {
      renderForm();
      expect(parentSelect()).toHaveAttribute('data-nullable', 'true');
      expect(within(parentSelect()).getByRole('option', { name: 'Top level (no parent)' })).toBe(
        parentSelect().options[0],
      );
      expect(parentSelect().value).toBe('');
    });

    it('excludes nothing from the picker on a new area', () => {
      renderForm();
      expect(parentSelect()).toHaveAttribute('data-exclude', '');
    });

    it('presets the parent and shows its path under the picker', () => {
      renderForm({ presetParentId: 'ground' });
      expect(parentSelect().value).toBe('ground');
      const preview = document.querySelector('.areaPreview')!;
      expect(preview).toHaveTextContent('House');
      expect(preview).toHaveTextContent('Ground floor');
    });

    it('shows no path preview for the top level', () => {
      renderForm();
      expect(document.querySelector('.areaPreview')).toBeNull();
    });

    it('creates a top-level area with trimmed name and null parent, colour and description', async () => {
      const user = userEvent.setup();
      mockCreateArea.mockResolvedValue(make('new', 'Shed', null));
      renderForm();
      await user.type(nameInput(), '  Shed  ');
      await user.click(save());

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(mockCreateArea).toHaveBeenCalledWith({
        name: 'Shed',
        parentId: null,
        color: null,
        description: null,
      });
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new',
          label: 'Shed',
          href: expect.stringContaining('areas'),
        }),
      );
    });

    it('creates a sub-area with the preset parent, a colour and a description', async () => {
      const user = userEvent.setup();
      mockCreateArea.mockResolvedValue(make('new', 'Pantry', 'ground'));
      renderForm({ presetParentId: 'ground' });
      await user.type(nameInput(), 'Pantry');
      await user.click(screen.getByTestId('object-form-more'));
      fireEvent.change(screen.getByTestId('area-color'), { target: { value: '#aabbcc' } });
      await user.type(screen.getByTestId('area-description-input'), '  Dry goods  ');
      await user.click(save());

      await waitFor(() => expect(mockCreateArea).toHaveBeenCalledTimes(1));
      expect(mockCreateArea).toHaveBeenCalledWith({
        name: 'Pantry',
        parentId: 'ground',
        color: '#aabbcc',
        description: 'Dry goods',
      });
    });

    it('lets the user pick another parent', async () => {
      const user = userEvent.setup();
      mockCreateArea.mockResolvedValue(make('new', 'Attic', 'house'));
      renderForm();
      await user.type(nameInput(), 'Attic');
      fireEvent.change(parentSelect(), { target: { value: 'house' } });
      await user.click(save());

      await waitFor(() => expect(mockCreateArea).toHaveBeenCalled());
      expect(mockCreateArea).toHaveBeenCalledWith(expect.objectContaining({ parentId: 'house' }));
    });

    it('limits the description length', async () => {
      const user = userEvent.setup();
      renderForm();
      await user.click(screen.getByTestId('object-form-more'));
      expect(screen.getByTestId('area-description-input')).toHaveAttribute(
        'maxlength',
        String(Form.AREA_DESCRIPTION_MAX_LENGTH),
      );
    });
  });

  describe('validation', () => {
    it('requires a name and sends no request', async () => {
      const user = userEvent.setup();
      renderForm();
      await user.type(nameInput(), '   ');
      await user.click(save());

      expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
      expect(nameInput()).toHaveFocus();
      expect(mockCreateArea).not.toHaveBeenCalled();
    });

    it.each(['garage', 'GARAGE', ' Garage ', 'G  arage'.replace('  ', '')])(
      'rejects the top-level duplicate "%s" by fold, naming no parent',
      async (typed) => {
        const user = userEvent.setup();
        renderForm();
        await user.type(nameInput(), typed);
        await user.click(save());

        expect(
          await screen.findByText(`There is already a top-level area called ${typed.trim()}.`),
        ).toBeInTheDocument();
        expect(mockCreateArea).not.toHaveBeenCalled();
      },
    );

    it.each(['Kueche', 'Kuche', 'KÜCHE', 'küche'])(
      'rejects "%s" as a duplicate of Küche under the same parent, naming the parent path',
      async (typed) => {
        const user = userEvent.setup();
        renderForm({ presetParentId: 'ground' });
        await user.type(nameInput(), typed);
        await user.click(save());

        expect(
          await screen.findByText(
            `There is already an area called ${typed} in House › Ground floor.`,
          ),
        ).toBeInTheDocument();
        expect(mockCreateArea).not.toHaveBeenCalled();
      },
    );

    it('allows the same name under another parent', async () => {
      const user = userEvent.setup();
      mockCreateArea.mockResolvedValue(make('new', 'Küche', 'house'));
      renderForm({ presetParentId: 'house' });
      await user.type(nameInput(), 'Küche');
      await user.click(save());
      await waitFor(() => expect(mockCreateArea).toHaveBeenCalledTimes(1));
    });

    it('re-checks the clash when the parent changes', async () => {
      const user = userEvent.setup();
      renderForm({ presetParentId: 'house' });
      await user.type(nameInput(), 'Küche');
      fireEvent.change(parentSelect(), { target: { value: 'ground' } });
      await user.click(save());

      expect(await screen.findByText(/There is already an area called Küche/)).toBeInTheDocument();
      expect(mockCreateArea).not.toHaveBeenCalled();
    });

    it('maps a server CONFLICT to the same duplicate message on the name, with no banner', async () => {
      const user = userEvent.setup();
      mockCreateArea.mockRejectedValue(
        new ApiClientError(409, { code: 'CONFLICT', message: 'server text' }),
      );
      renderForm();
      await user.type(nameInput(), 'Shed');
      await user.click(save());

      expect(
        await screen.findByText('There is already a top-level area called Shed.'),
      ).toBeInTheDocument();
      expect(nameInput()).toHaveAttribute('aria-invalid', 'true');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(document.body.textContent).not.toContain('server text');
    });

    it('names the parent path in the CONFLICT message of a sub-area', async () => {
      const user = userEvent.setup();
      mockCreateArea.mockRejectedValue(new ApiClientError(409, { code: 'CONFLICT', message: 'x' }));
      renderForm({ presetParentId: 'ground' });
      await user.type(nameInput(), 'Pantry');
      await user.click(save());

      expect(
        await screen.findByText('There is already an area called Pantry in House › Ground floor.'),
      ).toBeInTheDocument();
    });

    it('falls through to the generic banner for other server codes', async () => {
      const user = userEvent.setup();
      mockCreateArea.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      renderForm();
      await user.type(nameInput(), 'Shed');
      await user.click(save());

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(nameInput()).not.toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('edit area', () => {
    it('titles the dialog "Edit area", fills every value and opens More details for colour and description', () => {
      renderForm({ mode: 'edit', area: KITCHEN });
      expect(screen.getByRole('dialog', { name: 'Edit area' })).toBeInTheDocument();
      expect(nameInput().value).toBe('Küche');
      expect(parentSelect().value).toBe('ground');
      expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'true');
      expect((screen.getByTestId('area-color') as HTMLInputElement).value).toBe('#336699');
      expect((screen.getByTestId('area-description-input') as HTMLTextAreaElement).value).toBe(
        'Cooking happens here',
      );
    });

    it('keeps More details closed when colour and description are empty', () => {
      renderForm({ mode: 'edit', area: GROUND });
      expect(screen.getByTestId('object-form-more')).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByTestId('area-name-input')).toHaveValue('Ground floor');
    });

    it('excludes the area itself and everything below it from "Part of"', () => {
      renderForm({ mode: 'edit', area: HOUSE });
      expect(parentSelect().getAttribute('data-exclude')!.split(',').sort()).toEqual([
        'ground',
        'house',
        'kitchen',
      ]);
    });

    it('does not clash with itself', async () => {
      const user = userEvent.setup();
      renderForm({ mode: 'edit', area: GARAGE });
      await user.clear(nameInput());
      await user.type(nameInput(), 'GARAGE');
      await user.click(save());
      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(screen.queryByText(/There is already/)).toBeNull();
    });

    it('sends no request when nothing changed, but still reports the area', async () => {
      const user = userEvent.setup();
      renderForm({ mode: 'edit', area: KITCHEN });
      await user.click(save());

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(mockUpdateArea).not.toHaveBeenCalled();
      expect(mockCreateArea).not.toHaveBeenCalled();
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'kitchen', label: 'Küche' }),
      );
    });

    it('sends no request when only surrounding spaces were added to the name', async () => {
      const user = userEvent.setup();
      renderForm({ mode: 'edit', area: GARAGE });
      await user.type(nameInput(), '   ');
      await user.click(save());
      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(mockUpdateArea).not.toHaveBeenCalled();
    });

    it('sends only the name when only the name changed', async () => {
      const user = userEvent.setup();
      mockUpdateArea.mockResolvedValue(make('garage', 'Carport', null));
      renderForm({ mode: 'edit', area: GARAGE });
      await user.clear(nameInput());
      await user.type(nameInput(), 'Carport');
      await user.click(save());

      await waitFor(() => expect(mockUpdateArea).toHaveBeenCalledTimes(1));
      expect(mockUpdateArea).toHaveBeenCalledWith('garage', { name: 'Carport' });
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'garage', label: 'Carport' }),
      );
    });

    it('sends only the parent when the area is moved', async () => {
      const user = userEvent.setup();
      mockUpdateArea.mockResolvedValue(make('garage', 'Garage', 'house'));
      renderForm({ mode: 'edit', area: GARAGE });
      fireEvent.change(parentSelect(), { target: { value: 'house' } });
      await user.click(save());

      await waitFor(() => expect(mockUpdateArea).toHaveBeenCalledTimes(1));
      expect(mockUpdateArea).toHaveBeenCalledWith('garage', { parentId: 'house' });
    });

    it('sends parentId null when moved to the top level', async () => {
      const user = userEvent.setup();
      mockUpdateArea.mockResolvedValue(make('ground', 'Ground floor', null));
      renderForm({ mode: 'edit', area: GROUND });
      fireEvent.change(parentSelect(), { target: { value: '' } });
      await user.click(save());

      await waitFor(() => expect(mockUpdateArea).toHaveBeenCalledTimes(1));
      expect(mockUpdateArea).toHaveBeenCalledWith('ground', { parentId: null });
    });

    it('sends null to clear the colour and the description', async () => {
      const user = userEvent.setup();
      mockUpdateArea.mockResolvedValue(make('kitchen', 'Küche', 'ground'));
      renderForm({ mode: 'edit', area: KITCHEN });
      await user.click(screen.getByTestId('area-no-color'));
      await user.clear(screen.getByTestId('area-description-input'));
      await user.click(save());

      await waitFor(() => expect(mockUpdateArea).toHaveBeenCalledTimes(1));
      expect(mockUpdateArea).toHaveBeenCalledWith('kitchen', { color: null, description: null });
    });

    it('sends a new colour', async () => {
      const user = userEvent.setup();
      mockUpdateArea.mockResolvedValue(make('kitchen', 'Küche', 'ground'));
      renderForm({ mode: 'edit', area: KITCHEN });
      fireEvent.change(screen.getByTestId('area-color'), { target: { value: '#000001' } });
      await user.click(save());

      await waitFor(() =>
        expect(mockUpdateArea).toHaveBeenCalledWith('kitchen', { color: '#000001' }),
      );
    });

    it('rejects renaming into a clash with a sibling', async () => {
      const user = userEvent.setup();
      renderForm({ mode: 'edit', area: HOUSE });
      await user.clear(nameInput());
      await user.type(nameInput(), 'garage');
      await user.click(save());

      expect(
        await screen.findByText('There is already a top-level area called garage.'),
      ).toBeInTheDocument();
      expect(mockUpdateArea).not.toHaveBeenCalled();
    });

    it('treats an edit without an area like a new area', async () => {
      const user = userEvent.setup();
      mockCreateArea.mockResolvedValue(make('new', 'Shed', null));
      renderForm({ mode: 'edit' });
      await user.type(nameInput(), 'Shed');
      await user.click(save());
      await waitFor(() => expect(mockCreateArea).toHaveBeenCalledTimes(1));
      expect(mockUpdateArea).not.toHaveBeenCalled();
    });
  });
});
