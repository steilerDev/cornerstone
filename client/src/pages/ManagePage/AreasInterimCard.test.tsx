/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AreaResponse } from '@cornerstone/shared';
import type * as UseAreasTypes from '../../hooks/useAreas.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
import type * as CardTypes from './AreasInterimCard.js';
import { ApiClientError } from '../../lib/apiClient.js';
import enErrors from '../../i18n/en/errors.json';
import enSettings from '../../i18n/en/settings.json';

const mockUseAreas = jest.fn<typeof UseAreasTypes.useAreas>();
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({ useAreas: mockUseAreas }));

const mockFetchDeleteImpact = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));

jest.unstable_mockModule('../../components/AreaPicker/AreaPicker.js', () => ({
  AreaPicker: ({
    value,
    onChange,
    disabled,
  }: {
    value: string;
    onChange: (val: string) => void;
    disabled?: boolean;
  }) => (
    <select
      data-testid="area-picker"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">No parent</option>
      <option value="area-2">Pick bathroom</option>
    </select>
  ),
}));

let AreasInterimCard: typeof CardTypes.AreasInterimCard;

beforeAll(async () => {
  ({ AreasInterimCard } = await import('./AreasInterimCard.js'));
});

const STAMP = '2026-01-01T00:00:00.000Z';
const KITCHEN: AreaResponse = {
  id: 'area-1',
  name: 'Kitchen',
  parentId: null,
  color: '#F59E0B',
  description: 'The main kitchen area',
  sortOrder: 0,
  createdAt: STAMP,
  updatedAt: STAMP,
};
const BATHROOM: AreaResponse = {
  id: 'area-2',
  name: 'Bathroom',
  parentId: null,
  color: null,
  description: null,
  sortOrder: 1,
  createdAt: STAMP,
  updatedAt: STAMP,
};

function hookResult(
  overrides: Partial<UseAreasTypes.UseAreasResult> = {},
): UseAreasTypes.UseAreasResult {
  return {
    areas: [KITCHEN, BATHROOM],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    createArea: jest.fn<UseAreasTypes.UseAreasResult['createArea']>().mockResolvedValue(KITCHEN),
    updateArea: jest.fn<UseAreasTypes.UseAreasResult['updateArea']>().mockResolvedValue(KITCHEN),
    deleteArea: jest.fn<UseAreasTypes.UseAreasResult['deleteArea']>().mockResolvedValue(undefined),
    ...overrides,
  };
}

const SENTINEL = 'RAW-SERVER-SENTINEL';
const rejecting = (err: unknown) => jest.fn<() => Promise<never>>().mockRejectedValue(err);

describe('AreasInterimCard', () => {
  beforeEach(() => {
    mockUseAreas.mockReset();
    mockUseAreas.mockReturnValue(hookResult());
    mockFetchDeleteImpact.mockReset();
    mockFetchDeleteImpact.mockResolvedValue({ entityType: 'area', id: 'x', effects: [] });
  });

  const enabledConfirm = async () => {
    const button = await screen.findByTestId('area-delete-confirm');
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
    return button;
  };

  describe('section', () => {
    it('is the #areas anchor with an Areas heading', () => {
      render(<AreasInterimCard />);

      const section = screen.getByTestId('project-setup-areas');
      expect(section).toHaveAttribute('id', 'areas');
      expect(section).toHaveAccessibleName('Areas');
      expect(screen.getByRole('heading', { level: 2, name: 'Areas' })).toHaveAttribute(
        'tabindex',
        '-1',
      );
    });

    it('lists the areas with a count in the heading', () => {
      render(<AreasInterimCard />);

      expect(screen.getByText('Kitchen')).toBeInTheDocument();
      expect(screen.getByText('Bathroom')).toBeInTheDocument();
      expect(screen.getByText('Existing Areas (2)')).toBeInTheDocument();
      expect(screen.getByText('The main kitchen area')).toBeInTheDocument();
    });

    it('nests sub-areas under their parent', () => {
      mockUseAreas.mockReturnValue(
        hookResult({ areas: [KITCHEN, { ...BATHROOM, parentId: 'area-1' }] }),
      );
      render(<AreasInterimCard />);

      expect(screen.getByText('Bathroom')).toBeInTheDocument();
    });

    it('shows the empty state without areas', () => {
      mockUseAreas.mockReturnValue(hookResult({ areas: [] }));
      render(<AreasInterimCard />);

      expect(screen.getByText(enSettings.manage.areas.emptyState)).toBeInTheDocument();
    });
  });

  describe('loading and settling', () => {
    it('shows a skeleton on the first load and does not settle', () => {
      mockUseAreas.mockReturnValue(hookResult({ isLoading: true, areas: [] }));
      const onSettled = jest.fn<() => void>();
      render(<AreasInterimCard onSettled={onSettled} />);

      expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(screen.queryByText('Kitchen')).toBeNull();
      expect(onSettled).not.toHaveBeenCalled();
    });

    it('settles once the first load has ended', () => {
      const onSettled = jest.fn<() => void>();
      render(<AreasInterimCard onSettled={onSettled} />);

      expect(onSettled).toHaveBeenCalled();
    });

    it('shows the load error when there are no areas', () => {
      mockUseAreas.mockReturnValue(hookResult({ areas: [], error: 'Could not load areas.' }));
      const onSettled = jest.fn<() => void>();
      render(<AreasInterimCard onSettled={onSettled} />);

      expect(screen.getByText('Could not load areas.')).toBeInTheDocument();
      expect(onSettled).toHaveBeenCalled();
    });

    it('keeps the list mounted when a later reload reports loading again', () => {
      const { rerender } = render(<AreasInterimCard />);
      const heading = screen.getByRole('heading', { level: 2, name: 'Areas' });

      mockUseAreas.mockReturnValue(hookResult({ isLoading: true }));
      rerender(<AreasInterimCard />);

      expect(document.querySelector('[aria-busy="true"]')).toBeNull();
      expect(screen.getByText('Kitchen')).toBeInTheDocument();
      expect(heading.isConnected).toBe(true);
    });

    it('works without an onSettled callback', () => {
      expect(() => render(<AreasInterimCard />)).not.toThrow();
    });
  });

  describe('create', () => {
    it('keeps Create disabled until a name is typed', async () => {
      const user = userEvent.setup();
      render(<AreasInterimCard />);
      const create = screen.getByRole('button', { name: 'Create Area' });
      expect(create).toBeDisabled();

      await user.type(screen.getByRole('textbox', { name: 'Area Name' }), 'Living Room');

      expect(create).toBeEnabled();
    });

    it('creates an area, clears the form and shows the success banner', async () => {
      const user = userEvent.setup();
      const createArea = jest
        .fn<UseAreasTypes.UseAreasResult['createArea']>()
        .mockResolvedValue({ ...KITCHEN, id: 'area-3', name: 'Living Room' });
      mockUseAreas.mockReturnValue(hookResult({ createArea }));
      render(<AreasInterimCard />);

      await user.type(screen.getByRole('textbox', { name: 'Area Name' }), '  Living Room  ');
      await user.type(screen.getByRole('textbox', { name: 'Description' }), ' Ground floor ');
      await user.type(screen.getByRole('spinbutton', { name: 'Sort Order' }), '4');
      await user.selectOptions(screen.getByTestId('area-picker'), 'area-2');
      await user.click(screen.getByRole('button', { name: 'Create Area' }));

      await waitFor(() =>
        expect(createArea).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Living Room',
            parentId: 'area-2',
            description: 'Ground floor',
            sortOrder: 4,
          }),
        ),
      );
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Area "Living Room" created successfully',
      );
      expect((screen.getByRole('textbox', { name: 'Area Name' }) as HTMLInputElement).value).toBe(
        '',
      );
    });

    it('sends a null parent and description and no sort order when left empty', async () => {
      const user = userEvent.setup();
      const createArea = jest
        .fn<UseAreasTypes.UseAreasResult['createArea']>()
        .mockResolvedValue(KITCHEN);
      mockUseAreas.mockReturnValue(hookResult({ createArea }));
      render(<AreasInterimCard />);

      await user.type(screen.getByRole('textbox', { name: 'Area Name' }), 'Attic');
      await user.click(screen.getByRole('button', { name: 'Create Area' }));

      await waitFor(() => expect(createArea).toHaveBeenCalled());
      expect(createArea.mock.calls[0]![0]).toEqual(
        expect.objectContaining({
          name: 'Attic',
          parentId: null,
          description: null,
          sortOrder: undefined,
        }),
      );
    });

    it('rejects a name over 100 characters without a request', async () => {
      const user = userEvent.setup();
      const createArea = jest.fn<UseAreasTypes.UseAreasResult['createArea']>();
      mockUseAreas.mockReturnValue(hookResult({ createArea }));
      render(<AreasInterimCard />);
      const input = screen.getByRole('textbox', { name: 'Area Name' });
      input.removeAttribute('maxlength');

      await user.type(input, 'x'.repeat(101));
      await user.click(screen.getByRole('button', { name: 'Create Area' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        enSettings.manage.areas.validation.nameTooLong,
      );
      expect(createArea).not.toHaveBeenCalled();
    });

    it('shows the required-name message when the form is submitted with a blank name', async () => {
      const user = userEvent.setup();
      const createArea = jest.fn<UseAreasTypes.UseAreasResult['createArea']>();
      mockUseAreas.mockReturnValue(hookResult({ createArea }));
      render(<AreasInterimCard />);
      await user.type(screen.getByRole('textbox', { name: 'Area Name' }), 'a');
      await user.clear(screen.getByRole('textbox', { name: 'Area Name' }));
      const form = screen.getByRole('textbox', { name: 'Area Name' }).closest('form')!;

      act(() => form.requestSubmit());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        enSettings.manage.areas.validation.nameRequired,
      );
      expect(createArea).not.toHaveBeenCalled();
    });

    it('shows the duplicate-name copy for a 409 CONFLICT and never the server text', async () => {
      const user = userEvent.setup();
      mockUseAreas.mockReturnValue(
        hookResult({
          createArea: rejecting(new ApiClientError(409, { code: 'CONFLICT', message: SENTINEL })),
        }),
      );
      render(<AreasInterimCard />);

      await user.type(screen.getByRole('textbox', { name: 'Area Name' }), 'Kitchen');
      await user.click(screen.getByRole('button', { name: 'Create Area' }));

      expect(await screen.findByText(enSettings.manage.areas.messages.duplicateName)).toBeVisible();
      expect(screen.queryByText(new RegExp(SENTINEL))).toBeNull();
    });

    it('translates another API error by code', async () => {
      const user = userEvent.setup();
      mockUseAreas.mockReturnValue(
        hookResult({
          createArea: rejecting(
            new ApiClientError(400, { code: 'VALIDATION_ERROR', message: SENTINEL }),
          ),
        }),
      );
      render(<AreasInterimCard />);

      await user.type(screen.getByRole('textbox', { name: 'Area Name' }), 'X');
      await user.click(screen.getByRole('button', { name: 'Create Area' }));

      expect(await screen.findByText(enErrors.VALIDATION_ERROR)).toBeVisible();
      expect(screen.queryByText(new RegExp(SENTINEL))).toBeNull();
    });

    it('shows the generic message for a non-API failure', async () => {
      const user = userEvent.setup();
      mockUseAreas.mockReturnValue(hookResult({ createArea: rejecting(new Error('boom')) }));
      render(<AreasInterimCard />);

      await user.type(screen.getByRole('textbox', { name: 'Area Name' }), 'X');
      await user.click(screen.getByRole('button', { name: 'Create Area' }));

      expect(await screen.findByText(enSettings.manage.areas.messages.createError)).toBeVisible();
    });
  });

  describe('edit', () => {
    async function startEdit(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
      return screen.getByRole('form', { name: 'Edit Kitchen' });
    }

    it('shows an edit form with Save and Cancel and disables the other row actions', async () => {
      const user = userEvent.setup();
      render(<AreasInterimCard />);

      const form = await startEdit(user);

      expect(within(form).getByRole('button', { name: 'Save' })).toBeEnabled();
      expect(within(form).getByRole('button', { name: 'Cancel' })).toBeEnabled();
      expect(screen.getAllByRole('button', { name: 'Edit' })[0]).toBeDisabled();
      expect(screen.getAllByRole('button', { name: 'Delete' })[0]).toBeDisabled();
    });

    it('Cancel returns to the list', async () => {
      const user = userEvent.setup();
      render(<AreasInterimCard />);
      const form = await startEdit(user);

      await user.click(within(form).getByRole('button', { name: 'Cancel' }));

      expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
      expect(screen.queryByRole('form', { name: 'Edit Kitchen' })).toBeNull();
    });

    it('saves the changed fields and shows the success banner', async () => {
      const user = userEvent.setup();
      const updateArea = jest
        .fn<UseAreasTypes.UseAreasResult['updateArea']>()
        .mockResolvedValue({ ...KITCHEN, name: 'Kitchen Updated' });
      mockUseAreas.mockReturnValue(hookResult({ updateArea }));
      render(<AreasInterimCard />);
      const form = await startEdit(user);

      const name = within(form).getByRole('textbox', { name: 'Area Name' });
      await user.clear(name);
      await user.type(name, 'Kitchen Updated');
      const sort = within(form).getByRole('spinbutton', { name: 'Sort Order' });
      await user.clear(sort);
      await user.type(sort, '7');
      await user.clear(within(form).getByRole('textbox', { name: 'Description' }));
      await user.click(within(form).getByRole('button', { name: 'Save' }));

      await waitFor(() =>
        expect(updateArea).toHaveBeenCalledWith(
          'area-1',
          expect.objectContaining({
            name: 'Kitchen Updated',
            sortOrder: 7,
            description: '',
            parentId: null,
          }),
        ),
      );
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Area "Kitchen Updated" updated successfully',
      );
      expect(screen.queryByRole('form', { name: 'Edit Kitchen' })).toBeNull();
    });

    it('treats a cleared sort order as 0', async () => {
      const user = userEvent.setup();
      const updateArea = jest
        .fn<UseAreasTypes.UseAreasResult['updateArea']>()
        .mockResolvedValue(KITCHEN);
      mockUseAreas.mockReturnValue(hookResult({ updateArea }));
      render(<AreasInterimCard />);
      const form = await startEdit(user);

      await user.clear(within(form).getByRole('spinbutton', { name: 'Sort Order' }));
      await user.click(within(form).getByRole('button', { name: 'Save' }));

      await waitFor(() =>
        expect(updateArea).toHaveBeenCalledWith(
          'area-1',
          expect.objectContaining({ sortOrder: 0 }),
        ),
      );
    });

    it('changes the colour and the parent of the area being edited', async () => {
      const user = userEvent.setup();
      const updateArea = jest
        .fn<UseAreasTypes.UseAreasResult['updateArea']>()
        .mockResolvedValue(KITCHEN);
      mockUseAreas.mockReturnValue(hookResult({ updateArea }));
      render(<AreasInterimCard />);
      const form = await startEdit(user);

      const color = form.querySelector('input[type="color"]') as HTMLInputElement;
      await user.click(color);
      // jsdom has no colour picker: set through the React-aware value setter.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      act(() => {
        setter.call(color, '#112233');
        color.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await user.selectOptions(within(form).getByTestId('area-picker'), 'area-2');
      await user.click(within(form).getByRole('button', { name: 'Save' }));

      await waitFor(() =>
        expect(updateArea).toHaveBeenCalledWith(
          'area-1',
          expect.objectContaining({ color: '#112233', parentId: 'area-2' }),
        ),
      );
    });

    it('edits an area that has no colour with the default colour shown', async () => {
      const user = userEvent.setup();
      render(<AreasInterimCard />);

      await user.click(screen.getAllByRole('button', { name: 'Edit' })[1]!);
      const form = screen.getByRole('form', { name: 'Edit Bathroom' });

      expect((form.querySelector('input[type="color"]') as HTMLInputElement).value).toBe('#3b82f6');
    });

    it('rejects a blank name with the required message and no request', async () => {
      const user = userEvent.setup();
      const updateArea = jest.fn<UseAreasTypes.UseAreasResult['updateArea']>();
      mockUseAreas.mockReturnValue(hookResult({ updateArea }));
      render(<AreasInterimCard />);
      const form = await startEdit(user);
      await user.clear(within(form).getByRole('textbox', { name: 'Area Name' }));

      act(() => (form as HTMLFormElement).requestSubmit());

      expect(await within(form).findByRole('alert')).toHaveTextContent(
        enSettings.manage.areas.validation.nameRequired,
      );
      expect(updateArea).not.toHaveBeenCalled();
    });

    it('rejects a name over 100 characters', async () => {
      const user = userEvent.setup();
      const updateArea = jest.fn<UseAreasTypes.UseAreasResult['updateArea']>();
      mockUseAreas.mockReturnValue(hookResult({ updateArea }));
      render(<AreasInterimCard />);
      const form = await startEdit(user);
      const name = within(form).getByRole('textbox', { name: 'Area Name' });
      name.removeAttribute('maxlength');
      await user.clear(name);
      await user.type(name, 'x'.repeat(101));

      await user.click(within(form).getByRole('button', { name: 'Save' }));

      expect(await within(form).findByRole('alert')).toHaveTextContent(
        enSettings.manage.areas.validation.nameTooLong,
      );
      expect(updateArea).not.toHaveBeenCalled();
    });

    it('shows the duplicate-name copy for a 409 CONFLICT', async () => {
      const user = userEvent.setup();
      mockUseAreas.mockReturnValue(
        hookResult({
          updateArea: rejecting(new ApiClientError(409, { code: 'CONFLICT', message: SENTINEL })),
        }),
      );
      render(<AreasInterimCard />);
      const form = await startEdit(user);
      await user.type(within(form).getByRole('textbox', { name: 'Area Name' }), '2');

      await user.click(within(form).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText(enSettings.manage.areas.messages.duplicateName)).toBeVisible();
      expect(screen.queryByText(new RegExp(SENTINEL))).toBeNull();
    });

    it('translates another API error and falls back to the generic message', async () => {
      const user = userEvent.setup();
      const updateArea = jest
        .fn<UseAreasTypes.UseAreasResult['updateArea']>()
        .mockRejectedValueOnce(new ApiClientError(403, { code: 'FORBIDDEN', message: SENTINEL }))
        .mockRejectedValueOnce(new Error('boom'));
      mockUseAreas.mockReturnValue(hookResult({ updateArea }));
      render(<AreasInterimCard />);
      const form = await startEdit(user);
      await user.type(within(form).getByRole('textbox', { name: 'Area Name' }), '2');

      await user.click(within(form).getByRole('button', { name: 'Save' }));
      expect(await screen.findByText(enErrors.FORBIDDEN)).toBeVisible();
      await user.click(within(form).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText(enSettings.manage.areas.messages.updateError)).toBeVisible();
    });
  });

  describe('delete', () => {
    async function openDelete(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);
      await screen.findByRole('alertdialog', { name: 'Delete Kitchen?' });
    }

    it('opens the confirm with the warning and the delete-impact request', async () => {
      const user = userEvent.setup();
      render(<AreasInterimCard />);

      await openDelete(user);

      expect(screen.getByTestId('area-delete-cancel')).toHaveFocus();
      expect(screen.getByText(enSettings.manage.areas.deleteWarning)).toBeInTheDocument();
      expect(mockFetchDeleteImpact).toHaveBeenCalledWith('area', 'area-1');
    });

    it('Cancel closes the confirm without deleting', async () => {
      const user = userEvent.setup();
      const deleteArea = jest.fn<UseAreasTypes.UseAreasResult['deleteArea']>();
      mockUseAreas.mockReturnValue(hookResult({ deleteArea }));
      render(<AreasInterimCard />);
      await openDelete(user);

      await user.click(screen.getByTestId('area-delete-cancel'));

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(deleteArea).not.toHaveBeenCalled();
    });

    it('deletes after confirming, shows the success banner and focuses the create heading', async () => {
      const user = userEvent.setup();
      const deleteArea = jest
        .fn<UseAreasTypes.UseAreasResult['deleteArea']>()
        .mockResolvedValue(undefined);
      mockUseAreas.mockReturnValue(hookResult({ deleteArea }));
      render(<AreasInterimCard />);
      await openDelete(user);

      await user.click(await enabledConfirm());

      await waitFor(() => expect(deleteArea).toHaveBeenCalledWith('area-1'));
      expect(await screen.findByText(/Area "Kitchen" deleted successfully/)).toBeVisible();
      await waitFor(() => {
        expect(document.activeElement?.tagName).toBe('H3');
        expect(document.activeElement).toHaveAttribute('tabindex', '-1');
      });
    });

    it('a 409 shows the blocked message inside the dialog and hides the confirm', async () => {
      const user = userEvent.setup();
      mockUseAreas.mockReturnValue(
        hookResult({
          deleteArea: rejecting(
            new ApiClientError(409, { code: 'AREA_IN_USE', message: SENTINEL }),
          ),
        }),
      );
      render(<AreasInterimCard />);
      await openDelete(user);

      await user.click(await enabledConfirm());

      const dialog = screen.getByRole('alertdialog');
      expect(
        await within(dialog).findByText(enSettings.manage.areas.messages.deleteConflict),
      ).toBeVisible();
      expect(screen.queryByTestId('area-delete-confirm')).toBeNull();
      expect(screen.queryByText(new RegExp(SENTINEL))).toBeNull();
    });

    it('translates other API errors by code inside the dialog', async () => {
      const user = userEvent.setup();
      mockUseAreas.mockReturnValue(
        hookResult({
          deleteArea: rejecting(new ApiClientError(403, { code: 'FORBIDDEN', message: SENTINEL })),
        }),
      );
      render(<AreasInterimCard />);
      await openDelete(user);

      await user.click(await enabledConfirm());

      const dialog = screen.getByRole('alertdialog');
      expect(await within(dialog).findByText(enErrors.FORBIDDEN)).toBeVisible();
      expect(screen.getByTestId('area-delete-confirm')).toBeInTheDocument();
    });

    it('shows the generic message for a non-API failure', async () => {
      const user = userEvent.setup();
      mockUseAreas.mockReturnValue(hookResult({ deleteArea: rejecting(new Error('boom')) }));
      render(<AreasInterimCard />);
      await openDelete(user);

      await user.click(await enabledConfirm());

      expect(
        await within(screen.getByRole('alertdialog')).findByText(
          enSettings.manage.areas.messages.deleteError,
        ),
      ).toBeVisible();
    });

    it('keeps the heading mounted and focused while the list reloads after a delete', async () => {
      const user = userEvent.setup();
      let reloading = false;
      mockUseAreas.mockImplementation(() =>
        hookResult({
          isLoading: reloading,
          deleteArea: jest.fn(async () => {
            reloading = true;
          }),
        }),
      );
      render(<AreasInterimCard />);
      const heading = document.querySelector<HTMLElement>('h3[tabindex="-1"]')!;
      await openDelete(user);

      await user.click(await enabledConfirm());
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

      expect(document.querySelector('[aria-busy="true"]')).toBeNull();
      expect(heading.isConnected).toBe(true);
      await waitFor(() => expect(document.activeElement).toBe(heading));
    });
  });
});
