/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { NoteResponse } from '@cornerstone/shared';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type { ObjectFormResult } from '../components/ObjectForm/types.js';
import type * as NotesApiTypes from '../lib/notesApi.js';
import type * as FormTypes from './noteForm.js';
import type * as ObjectFormTypes from '../components/ObjectForm/ObjectForm.js';

const mockCreateNote = jest.fn<typeof NotesApiTypes.createNote>();
const mockUpdateNote = jest.fn<typeof NotesApiTypes.updateNote>();
jest.unstable_mockModule('../lib/notesApi.js', () => ({
  createNote: mockCreateNote,
  updateNote: mockUpdateNote,
}));

const NOTE: NoteResponse = {
  id: 'n-1',
  content: 'Check the rebar first.',
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('noteForm (ObjectForm schema)', () => {
  let Form: typeof FormTypes;
  let FormComponent: typeof ObjectFormTypes;
  let media: MatchMediaControl;
  const onCreated = jest.fn<(r: ObjectFormResult) => void>();
  const onSaved = jest.fn<() => Promise<unknown>>();

  beforeEach(async () => {
    for (const mock of [mockCreateNote, mockUpdateNote, onCreated, onSaved]) mock.mockReset();
    mockCreateNote.mockResolvedValue({ ...NOTE, id: 'n-new' });
    mockUpdateNote.mockResolvedValue(NOTE);
    onSaved.mockResolvedValue(undefined);
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Form) {
      Form = await import('./noteForm.js');
      FormComponent = await import('../components/ObjectForm/ObjectForm.js');
    }
  });

  afterEach(() => media.restore());

  function Harness({ target }: { target: FormTypes.NoteFormMode }) {
    const schema = Form.useNoteFormSchema({ ...target, workItemId: 'wi-1', onSaved });
    return <FormComponent.ObjectForm schema={schema} onCreated={onCreated} onCancel={() => {}} />;
  }

  const renderForm = (target: FormTypes.NoteFormMode) =>
    render(
      <MemoryRouter>
        <Harness target={target} />
      </MemoryRouter>,
    );
  const content = () => screen.getByTestId('note-form-content') as HTMLTextAreaElement;
  const save = () => screen.getByTestId('object-form-save');

  describe('create', () => {
    it('opens as "Add note" with an empty required note field', () => {
      renderForm({ mode: 'create' });
      expect(screen.getByRole('dialog', { name: 'Add note' })).toBeInTheDocument();
      expect(content().value).toBe('');
      expect(content()).toHaveAttribute('aria-required', 'true');
    });

    it('requires text (blank counts as empty) and sends nothing', async () => {
      const user = userEvent.setup();
      renderForm({ mode: 'create' });
      fireEvent.change(content(), { target: { value: '  \n ' } });
      await user.click(save());
      expect(await screen.findByText('Write the note first.')).toBeInTheDocument();
      expect(mockCreateNote).not.toHaveBeenCalled();
    });

    it('creates the trimmed note, refreshes and reports the task', async () => {
      const user = userEvent.setup();
      renderForm({ mode: 'create' });
      fireEvent.change(content(), { target: { value: '  Call the supplier  ' } });
      await user.click(save());
      await waitFor(() =>
        expect(mockCreateNote).toHaveBeenCalledWith('wi-1', { content: 'Call the supplier' }),
      );
      expect(mockUpdateNote).not.toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'n-new',
          href: '/project/work-items/wi-1',
          label: 'Call the supplier',
        }),
      );
    });
  });

  describe('edit', () => {
    it('opens as "Edit note" with the current text', () => {
      renderForm({ mode: 'edit', note: NOTE });
      expect(screen.getByRole('dialog', { name: 'Edit note' })).toBeInTheDocument();
      expect(content().value).toBe('Check the rebar first.');
    });

    it('updates the note by its id', async () => {
      const user = userEvent.setup();
      renderForm({ mode: 'edit', note: NOTE });
      fireEvent.change(content(), { target: { value: 'Rebar checked.' } });
      await user.click(save());
      await waitFor(() =>
        expect(mockUpdateNote).toHaveBeenCalledWith('wi-1', 'n-1', { content: 'Rebar checked.' }),
      );
      expect(mockCreateNote).not.toHaveBeenCalled();
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'n-1' }));
    });
  });

  it('treats a non-text value as empty when validating', () => {
    const { result } = renderHook(() =>
      Form.useNoteFormSchema({ mode: 'create', workItemId: 'wi-1', onSaved }),
    );
    expect(result.current.validate({ content: 42 })).toEqual({ content: 'Write the note first.' });
    expect(result.current.validate({ content: 'ok' })).toEqual({});
  });
});
