/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NoteResponse } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import type * as NotesApiTypes from '../../lib/notesApi.js';
import type * as CardModule from './TaskNotesCard.js';

const mockDeleteNote = jest.fn<typeof NotesApiTypes.deleteNote>();
const mockCreateNote = jest.fn<typeof NotesApiTypes.createNote>();
const mockUpdateNote = jest.fn<typeof NotesApiTypes.updateNote>();
jest.unstable_mockModule('../../lib/notesApi.js', () => ({
  deleteNote: mockDeleteNote,
  createNote: mockCreateNote,
  updateNote: mockUpdateNote,
}));

let currentUser: { id: string; role: 'admin' | 'member' } | null = { id: 'u-me', role: 'member' };
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: currentUser }),
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let Card: typeof CardModule;
const onChanged = jest.fn<() => Promise<void>>();
const onEmptied = jest.fn<() => void>();
const onOpenNote = jest.fn<CardModule.TaskNotesCardProps['onOpenNote']>();

const note = (id: string, content: string, authorId: string | null): NoteResponse => ({
  id,
  content,
  createdBy: authorId ? { id: authorId, displayName: `Author ${authorId}` } : null,
  createdAt: '2026-03-04T10:00:00.000Z',
  updatedAt: '2026-03-04T10:00:00.000Z',
});
const NOTES = [
  note('n1', 'Mine', 'u-me'),
  note('n2', 'Theirs', 'u-other'),
  note('n3', 'Orphan', null),
];

function renderCard(notes: readonly NoteResponse[] = NOTES) {
  const addButtonRef = createRef<HTMLButtonElement>();
  const view = render(
    <MemoryRouter>
      <Card.TaskNotesCard
        workItemId="wi-1"
        notes={notes}
        onChanged={onChanged}
        onOpenNote={onOpenNote}
        addButtonRef={addButtonRef}
        onEmptied={onEmptied}
      />
    </MemoryRouter>,
  );
  return { ...view, addButtonRef };
}

const menuTrigger = () => screen.getAllByRole('button', { name: /^Actions for the note/ });

describe('TaskNotesCard', () => {
  beforeEach(async () => {
    installMatchMedia({ '(min-width: 768px)': true });
    for (const mock of [
      mockDeleteNote,
      mockCreateNote,
      mockUpdateNote,
      onChanged,
      onEmptied,
      onOpenNote,
    ]) {
      mock.mockReset();
    }
    mockDeleteNote.mockResolvedValue(undefined);
    onChanged.mockResolvedValue(undefined);
    currentUser = { id: 'u-me', role: 'member' };
    if (!Card) Card = await import('./TaskNotesCard.js');
  });

  it('lists the notes with author and date, or "Unknown" without an author', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByTestId('task-note-n1')).toHaveTextContent('Mine');
    expect(screen.getByTestId('task-note-n1')).toHaveTextContent('Author u-me');
    expect(screen.getByTestId('task-note-n1')).toHaveTextContent('2026');
    expect(screen.getByTestId('task-note-n3')).toHaveTextContent('Unknown');
  });

  describe('who can manage a note', () => {
    it('a member manages only their own notes', () => {
      renderCard();
      expect(within(screen.getByTestId('task-note-n1')).getByRole('button')).toBeInTheDocument();
      expect(within(screen.getByTestId('task-note-n2')).queryByRole('button')).toBeNull();
      expect(within(screen.getByTestId('task-note-n3')).queryByRole('button')).toBeNull();
      expect(menuTrigger()).toHaveLength(1);
    });

    it('an admin manages every note', () => {
      currentUser = { id: 'u-admin', role: 'admin' };
      renderCard();
      expect(menuTrigger()).toHaveLength(3);
    });

    it('nobody is signed in: not even a note without an author gets a menu', () => {
      currentUser = null;
      renderCard([NOTES[2]!]);
      expect(screen.queryAllByRole('button', { name: /^Actions for the note/ })).toHaveLength(0);
    });

    it('nobody is signed in: no menus', () => {
      currentUser = null;
      renderCard([NOTES[0]!, NOTES[1]!]);
      expect(screen.queryAllByRole('button', { name: /^Actions for the note/ })).toHaveLength(0);
    });
  });

  it('Add note asks the page for the create dialog with the button as the opener', () => {
    const { addButtonRef } = renderCard();
    fireEvent.click(screen.getByTestId('task-notes-add'));
    expect(onOpenNote).toHaveBeenCalledTimes(1);
    expect(onOpenNote.mock.calls[0]![0]).toEqual({ mode: 'create' });
    expect(onOpenNote.mock.calls[0]![1]).toBe(addButtonRef);
    expect(addButtonRef.current).toBe(screen.getByTestId('task-notes-add'));
  });

  it('Edit asks the page for the edit dialog of that note, with its menu trigger as the opener', async () => {
    renderCard();
    fireEvent.click(menuTrigger()[0]!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    expect(onOpenNote.mock.calls[0]![0]).toEqual({ mode: 'edit', note: NOTES[0] });
    expect(onOpenNote.mock.calls[0]![1].current).toBe(menuTrigger()[0]);
  });

  describe('delete', () => {
    async function startDelete() {
      fireEvent.click(menuTrigger()[0]!);
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      return screen.findByRole('alertdialog');
    }

    it('asks first, deletes, refreshes and does not report an emptied card', async () => {
      renderCard();
      const dialog = await startDelete();
      expect(dialog).toHaveTextContent('Delete this note?');
      expect(mockDeleteNote).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.click(within(dialog).getByTestId('note-delete-confirm'));
      });
      expect(mockDeleteNote).toHaveBeenCalledWith('wi-1', 'n1');
      expect(onChanged).toHaveBeenCalledTimes(1);
      expect(onEmptied).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    });

    it('reports the card emptied when the last note is deleted', async () => {
      renderCard([note('n1', 'Mine', 'u-me')]);
      await startDelete();
      await act(async () => {
        fireEvent.click(screen.getByTestId('note-delete-confirm'));
      });
      await waitFor(() => expect(onEmptied).toHaveBeenCalledTimes(1));
    });

    it('Cancel closes the confirmation without deleting and returns focus to Add note', async () => {
      const { addButtonRef } = renderCard();
      await startDelete();
      fireEvent.click(screen.getByTestId('note-delete-cancel'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(addButtonRef.current).toHaveFocus();
      expect(mockDeleteNote).not.toHaveBeenCalled();
    });

    it('keeps the dialog with the translated error when deleting fails', async () => {
      mockDeleteNote.mockRejectedValueOnce(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      renderCard();
      await startDelete();
      await act(async () => {
        fireEvent.click(screen.getByTestId('note-delete-confirm'));
      });
      expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toBeInTheDocument();
      expect(onChanged).not.toHaveBeenCalled();
    });

    it('uses the fallback sentence for a network failure', async () => {
      mockDeleteNote.mockRejectedValueOnce(new Error('down'));
      renderCard();
      await startDelete();
      await act(async () => {
        fireEvent.click(screen.getByTestId('note-delete-confirm'));
      });
      expect(await screen.findByText("Couldn't delete the note.")).toBeInTheDocument();
    });
  });
});

describe('NoteDialog', () => {
  const onSaved = jest.fn<() => Promise<unknown>>();
  const onClose = jest.fn<() => void>();

  beforeEach(async () => {
    installMatchMedia({ '(min-width: 768px)': true });
    onSaved.mockReset();
    onClose.mockReset();
    mockCreateNote.mockReset();
    mockUpdateNote.mockReset();
    mockCreateNote.mockResolvedValue({ ...NOTES[0]!, id: 'n-new' });
    mockUpdateNote.mockResolvedValue(NOTES[0]!);
    onSaved.mockResolvedValue(undefined);
    if (!Card) Card = await import('./TaskNotesCard.js');
  });

  function renderDialog(target: CardModule.NoteDialogProps['target']) {
    return render(
      <MemoryRouter>
        <Card.NoteDialog
          workItemId="wi-1"
          target={target}
          onSaved={onSaved}
          onClose={onClose}
          openerRef={{ current: null }}
        />
      </MemoryRouter>,
    );
  }

  it('opens the Add note form under the note-form test id and saves a new note', async () => {
    renderDialog({ mode: 'create' });
    expect(screen.getByTestId('note-form')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('note-form-content'), { target: { value: 'Call back' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('note-form-save'));
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockCreateNote).toHaveBeenCalledWith('wi-1', { content: 'Call back' });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('opens the Edit note form with the text and updates the note', async () => {
    renderDialog({ mode: 'edit', note: NOTES[0]! });
    expect((screen.getByTestId('note-form-content') as HTMLTextAreaElement).value).toBe('Mine');
    fireEvent.change(screen.getByTestId('note-form-content'), {
      target: { value: 'Mine, edited' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('note-form-save'));
    });
    await waitFor(() =>
      expect(mockUpdateNote).toHaveBeenCalledWith('wi-1', 'n1', { content: 'Mine, edited' }),
    );
  });

  it('Cancel asks the host to close', async () => {
    renderDialog({ mode: 'create' });
    fireEvent.click(screen.getByTestId('note-form-cancel'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
