/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { ReferenceListDialog } from './ReferenceListDialog.js';
import type { ReferenceListDialogProps } from './ReferenceListDialog.js';
import type {
  ReferenceListFields,
  ReferenceListItem,
  ReferenceListLabels,
} from './ReferenceList.js';

const LABELS: ReferenceListLabels = {
  title: 'Sample list',
  description: 'Sample description',
  newItem: 'New sample',
  editItem: 'Edit sample',
  empty: 'Nothing here',
  loadFailed: 'Could not load',
  search: 'Search',
  noMatch: 'No match',
  duplicateName: 'A sample with this name already exists.',
};

const ALL_FIELDS: ReferenceListFields = {
  nameMaxLength: 50,
  descriptionMaxLength: 200,
  color: true,
};

const ITEM: ReferenceListItem = {
  id: 'i-1',
  name: 'North view',
  description: 'Faces the street',
  color: '#336699',
};

type Submit = ReferenceListDialogProps['onSubmit'];

describe('ReferenceListDialog', () => {
  let media: MatchMediaControl;
  let onSubmit: jest.Mock<Submit>;
  let onClose: jest.Mock<() => void>;

  beforeEach(() => {
    media = installMatchMedia({ '(min-width: 768px)': true });
    onSubmit = jest.fn<Submit>().mockResolvedValue(undefined);
    onClose = jest.fn<() => void>();
  });

  afterEach(() => {
    media.restore();
  });

  function renderDialog(props: Partial<ReferenceListDialogProps> = {}) {
    return render(
      <ReferenceListDialog
        mode="new"
        labels={LABELS}
        fields={ALL_FIELDS}
        testIdPrefix="sample"
        onSubmit={onSubmit}
        onClose={onClose}
        {...props}
      />,
    );
  }

  const nameInput = () => screen.getByTestId('sample-name') as HTMLInputElement;
  const descriptionInput = () => screen.getByTestId('sample-description') as HTMLTextAreaElement;
  const colorInput = () => screen.getByTestId('sample-color') as HTMLInputElement;
  const noColor = () => screen.getByTestId('sample-no-color') as HTMLInputElement;

  describe('container', () => {
    it('is a modal dialog titled for the mode from 768 px up', () => {
      renderDialog();

      expect(screen.getByRole('dialog', { name: 'New sample' })).toBeInTheDocument();
      expect(screen.getByTestId('sample-dialog').tagName).toBe('FORM');
    });

    it('is a bottom sheet below 768 px', () => {
      media.set('(min-width: 768px)', false);
      renderDialog();

      expect(screen.getByRole('dialog', { name: 'New sample' })).toBeInTheDocument();
      expect(screen.getByTestId('sample-dialog').tagName).not.toBe('FORM');
      expect(screen.getByTestId('sample-dialog-close')).toBeInTheDocument();
    });

    it('uses the edit title in edit mode', () => {
      renderDialog({ mode: 'edit', item: ITEM });

      expect(screen.getByRole('dialog', { name: 'Edit sample' })).toBeInTheDocument();
    });

    it('focuses the name field first', () => {
      renderDialog();

      expect(nameInput()).toHaveFocus();
    });

    it('limits the name and description lengths from the fields', () => {
      renderDialog();

      expect(nameInput()).toHaveAttribute('maxlength', '50');
      expect(descriptionInput()).toHaveAttribute('maxlength', '200');
    });

    it('sets lang on the user text fields from the entries language', () => {
      renderDialog({ entriesLanguage: 'de' });

      expect(nameInput()).toHaveAttribute('lang', 'de');
      expect(descriptionInput()).toHaveAttribute('lang', 'de');
    });

    it('omits lang when the entries language is unknown', () => {
      renderDialog();

      expect(nameInput()).not.toHaveAttribute('lang');
    });

    it('renders only the fields that are configured', () => {
      renderDialog({ fields: { nameMaxLength: 50 } });

      expect(screen.queryByTestId('sample-description')).toBeNull();
      expect(screen.queryByTestId('sample-color')).toBeNull();
      expect(screen.queryByTestId('sample-no-color')).toBeNull();
    });
  });

  describe('colour field', () => {
    it('starts a new item with No color checked and the colour input disabled', () => {
      renderDialog();

      expect(noColor()).toBeChecked();
      expect(colorInput()).toBeDisabled();
    });

    it('unchecking No color enables the colour input', async () => {
      const user = userEvent.setup();
      renderDialog();

      await user.click(noColor());

      expect(noColor()).not.toBeChecked();
      expect(colorInput()).toBeEnabled();
    });

    it('edits an item that has a colour with No color unchecked', () => {
      renderDialog({ mode: 'edit', item: ITEM });

      expect(noColor()).not.toBeChecked();
      expect(colorInput()).toBeEnabled();
      expect(colorInput().value).toBe('#336699');
    });

    it('edits an item without a colour with No color checked', () => {
      renderDialog({ mode: 'edit', item: { ...ITEM, color: null } });

      expect(noColor()).toBeChecked();
    });
  });

  describe('create payload', () => {
    it('sends only the name when no other field is configured', async () => {
      const user = userEvent.setup();
      renderDialog({ fields: { nameMaxLength: 50 } });

      await user.type(nameInput(), '  Tiles  ');
      await user.click(screen.getByTestId('sample-save'));

      expect(onSubmit).toHaveBeenCalledWith({ name: 'Tiles' });
    });

    it('sends a null description and a null colour when both are left empty', async () => {
      const user = userEvent.setup();
      renderDialog();

      await user.type(nameInput(), 'Tiles');
      await user.click(screen.getByTestId('sample-save'));

      expect(onSubmit).toHaveBeenCalledWith({ name: 'Tiles', description: null, color: null });
    });

    it('sends the trimmed description and the chosen colour', async () => {
      const user = userEvent.setup();
      renderDialog();

      await user.type(nameInput(), 'Tiles');
      await user.type(descriptionInput(), '  Bathroom floor  ');
      await user.click(noColor());
      expect(colorInput().value).toBe('#000000');
      await user.click(screen.getByTestId('sample-save'));

      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Tiles',
        description: 'Bathroom floor',
        color: '#000000',
      });
    });

    it('unticking No color after picking one restores the picked colour (shared ColorField)', async () => {
      const user = userEvent.setup();
      renderDialog({ mode: 'edit', item: { ...ITEM, color: '#336699' } });

      fireEvent.change(colorInput(), { target: { value: '#aabbcc' } });
      await user.click(noColor());
      expect(colorInput()).toBeDisabled();
      await user.click(noColor());

      expect(colorInput().value).toBe('#aabbcc');
      await user.click(screen.getByTestId('sample-save'));
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ color: '#aabbcc' }));
    });

    it('sends only name and colour when there is no description field', async () => {
      const user = userEvent.setup();
      renderDialog({ fields: { nameMaxLength: 50, color: true } });

      await user.type(nameInput(), 'Tiles');
      await user.click(screen.getByTestId('sample-save'));

      expect(onSubmit).toHaveBeenCalledWith({ name: 'Tiles', color: null });
    });

    it('submits with Enter in the name field', async () => {
      const user = userEvent.setup();
      renderDialog({ fields: { nameMaxLength: 50 } });

      await user.type(nameInput(), 'Tiles{Enter}');

      expect(onSubmit).toHaveBeenCalledWith({ name: 'Tiles' });
    });
  });

  describe('edit payload', () => {
    it('sends nothing and closes when nothing changed', async () => {
      const user = userEvent.setup();
      renderDialog({ mode: 'edit', item: ITEM });

      await user.click(screen.getByTestId('sample-save'));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('sends only the changed name', async () => {
      const user = userEvent.setup();
      renderDialog({ mode: 'edit', item: ITEM });

      await user.clear(nameInput());
      await user.type(nameInput(), 'South view');
      await user.click(screen.getByTestId('sample-save'));

      expect(onSubmit).toHaveBeenCalledWith({ name: 'South view' });
    });

    it('sends only the changed description, and null when cleared', async () => {
      const user = userEvent.setup();
      renderDialog({ mode: 'edit', item: ITEM });

      await user.clear(descriptionInput());
      await user.click(screen.getByTestId('sample-save'));

      expect(onSubmit).toHaveBeenCalledWith({ description: null });
    });

    it('sends only the colour when only the colour changed', async () => {
      const user = userEvent.setup();
      renderDialog({ mode: 'edit', item: ITEM });

      await user.click(noColor());
      await user.click(screen.getByTestId('sample-save'));

      expect(onSubmit).toHaveBeenCalledWith({ color: null });
    });

    it('does not send an unchanged translated name, so it keeps its translation', async () => {
      const user = userEvent.setup();
      renderDialog({ mode: 'edit', item: { ...ITEM, name: 'Materials', translated: true } });

      await user.clear(descriptionInput());
      await user.type(descriptionInput(), 'Only the description changes');
      await user.click(screen.getByTestId('sample-save'));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const payload = onSubmit.mock.calls[0]![0];
      expect(payload).toEqual({ description: 'Only the description changes' });
      expect('name' in payload).toBe(false);
    });

    it('treats a name that differs only by surrounding spaces as unchanged', async () => {
      const user = userEvent.setup();
      renderDialog({ mode: 'edit', item: { ...ITEM, translated: true } });

      await user.type(nameInput(), '   ');
      await user.click(screen.getByTestId('sample-save'));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('shows the translated-name hint only for translated items in edit mode', () => {
      const { unmount } = renderDialog({ mode: 'edit', item: { ...ITEM, translated: true } });
      expect(
        screen.getByText(
          'This name is translated. If you change it, your text is shown in every language.',
        ),
      ).toBeInTheDocument();
      unmount();

      renderDialog({ mode: 'edit', item: ITEM });
      expect(screen.queryByText(/This name is translated/)).toBeNull();
    });

    it('does not show the hint when creating', () => {
      renderDialog({ item: { ...ITEM, translated: true } });

      expect(screen.queryByText(/This name is translated/)).toBeNull();
    });
  });

  describe('validation and errors', () => {
    it('shows an inline error, focuses the name and sends nothing for an empty name', async () => {
      const user = userEvent.setup();
      renderDialog();
      screen.getByTestId('sample-save').focus();

      await user.click(screen.getByTestId('sample-save'));

      expect(screen.getByText('Enter a name.')).toBeInTheDocument();
      expect(nameInput()).toHaveFocus();
      expect(nameInput()).toHaveAttribute('aria-invalid', 'true');
      expect(nameInput()).toHaveAttribute('aria-describedby');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('treats a blank name as empty', async () => {
      const user = userEvent.setup();
      renderDialog();

      await user.type(nameInput(), '    ');
      await user.click(screen.getByTestId('sample-save'));

      expect(screen.getByText('Enter a name.')).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('clears the inline error on the next valid submit', async () => {
      const user = userEvent.setup();
      renderDialog();
      await user.click(screen.getByTestId('sample-save'));

      await user.type(nameInput(), 'Tiles');
      await user.click(screen.getByTestId('sample-save'));

      expect(screen.queryByText('Enter a name.')).toBeNull();
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('shows the duplicate-name text and marks the name invalid on 409 CONFLICT', async () => {
      const user = userEvent.setup();
      onSubmit.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'CONFLICT', message: 'server prose must not show' }),
      );
      renderDialog();

      await user.type(nameInput(), 'Tiles');
      await user.click(screen.getByTestId('sample-save'));

      expect(await screen.findByText(LABELS.duplicateName)).toBeInTheDocument();
      expect(screen.queryByText('server prose must not show')).toBeNull();
      expect(nameInput()).toHaveAttribute('aria-invalid', 'true');
      expect(nameInput()).toHaveFocus();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('translates other API error codes and never shows server text', async () => {
      const user = userEvent.setup();
      onSubmit.mockRejectedValueOnce(
        new ApiClientError(400, { code: 'VALIDATION_ERROR', message: 'raw server text' }),
      );
      renderDialog();

      await user.type(nameInput(), 'Tiles');
      await user.click(screen.getByTestId('sample-save'));

      await waitFor(() => expect(nameInput()).toHaveAttribute('aria-invalid', 'true'));
      expect(screen.queryByText('raw server text')).toBeNull();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('shows the network message for a network failure', async () => {
      const user = userEvent.setup();
      onSubmit.mockRejectedValueOnce(new NetworkError('offline', null));
      renderDialog();

      await user.type(nameInput(), 'Tiles');
      await user.click(screen.getByTestId('sample-save'));

      expect(await screen.findByRole('alert')).toHaveTextContent(/connect|network|internet/i);
    });

    it('shows the generic message for an unexpected failure', async () => {
      const user = userEvent.setup();
      onSubmit.mockRejectedValueOnce(new Error('boom'));
      renderDialog();

      await user.type(nameInput(), 'Tiles');
      await user.click(screen.getByTestId('sample-save'));

      const alert = await screen.findByRole('alert');
      expect(alert).not.toHaveTextContent('boom');
    });

    it('keeps the typed values after a failed save', async () => {
      const user = userEvent.setup();
      onSubmit.mockRejectedValueOnce(new Error('boom'));
      renderDialog();

      await user.type(nameInput(), 'Tiles');
      await user.click(screen.getByTestId('sample-save'));
      await screen.findByRole('alert');

      expect(nameInput().value).toBe('Tiles');
    });
  });

  describe('busy state', () => {
    it('marks Save aria-disabled and ignores a second submit while saving', async () => {
      const user = userEvent.setup();
      let finish: () => void = () => {};
      onSubmit.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      renderDialog();
      await user.type(nameInput(), 'Tiles');

      await user.click(screen.getByTestId('sample-save'));
      expect(screen.getByTestId('sample-save')).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByTestId('sample-save')).toHaveTextContent('Saving');
      await user.click(screen.getByTestId('sample-save'));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      finish();
      await waitFor(() =>
        expect(screen.getByTestId('sample-save')).not.toHaveAttribute('aria-disabled'),
      );
    });

    it('ignores Cancel and Escape while saving', async () => {
      const user = userEvent.setup();
      onSubmit.mockImplementation(() => new Promise<void>(() => {}));
      renderDialog();
      await user.type(nameInput(), 'Tiles');
      await user.click(screen.getByTestId('sample-save'));

      await user.click(screen.getByTestId('sample-cancel'));
      await user.keyboard('{Escape}');

      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
  });

  describe('closing', () => {
    it('Cancel closes a clean dialog at once', async () => {
      const user = userEvent.setup();
      renderDialog();

      await user.click(screen.getByTestId('sample-cancel'));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('Escape closes a clean dialog at once', async () => {
      const user = userEvent.setup();
      renderDialog();

      await user.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Escape on a dirty dialog opens the discard confirm and does not close', async () => {
      const user = userEvent.setup();
      renderDialog();
      await user.type(nameInput(), 'Tiles');

      await user.keyboard('{Escape}');

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('one Escape closes only the confirm, not the dialog behind it', async () => {
      const user = userEvent.setup();
      renderDialog();
      await user.type(nameInput(), 'Tiles');
      await user.keyboard('{Escape}');
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.getByRole('dialog', { name: 'New sample' })).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(nameInput().value).toBe('Tiles');
    });

    it('Keep editing returns to the dialog and keeps the text', async () => {
      const user = userEvent.setup();
      renderDialog();
      await user.type(nameInput(), 'Tiles');
      await user.click(screen.getByTestId('sample-cancel'));

      await user.click(screen.getByTestId('sample-discard-cancel'));

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      expect(nameInput().value).toBe('Tiles');
    });

    it('Discard closes the confirm and the dialog', async () => {
      const user = userEvent.setup();
      renderDialog();
      await user.type(nameInput(), 'Tiles');
      await user.click(screen.getByTestId('sample-cancel'));

      await user.click(screen.getByTestId('sample-discard-confirm'));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('treats changing only the colour as dirty', async () => {
      const user = userEvent.setup();
      renderDialog({ mode: 'edit', item: ITEM });
      await user.click(noColor());

      await user.click(screen.getByTestId('sample-cancel'));

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('treats changing only the description as dirty', async () => {
      const user = userEvent.setup();
      renderDialog({ mode: 'edit', item: ITEM });
      await user.type(descriptionInput(), '!');

      await user.click(screen.getByTestId('sample-cancel'));

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('does not treat an untouched edit as dirty', async () => {
      const user = userEvent.setup();
      renderDialog({ mode: 'edit', item: ITEM });

      await user.click(screen.getByTestId('sample-cancel'));

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(onClose).toHaveBeenCalled();
    });

    it('on the phone sheet, Escape on a dirty dialog also opens the confirm', async () => {
      media.set('(min-width: 768px)', false);
      const user = userEvent.setup();
      renderDialog();
      await user.type(nameInput(), 'Tiles');

      await user.keyboard('{Escape}');

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('on the phone sheet, one Escape closes only the confirm', async () => {
      media.set('(min-width: 768px)', false);
      const user = userEvent.setup();
      renderDialog();
      await user.type(nameInput(), 'Tiles');
      await user.keyboard('{Escape}');

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'New sample' })).toBeInTheDocument();
    });
  });
});
