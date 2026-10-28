import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { NoteResponse } from '@cornerstone/shared';
import type {
  ObjectFormErrors,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import { createNote, updateNote } from '../lib/notesApi.js';

const NOTE_MAX_LENGTH = 10000;

export type NoteFormMode =
  { readonly mode: 'create' } | { readonly mode: 'edit'; readonly note: NoteResponse };

export type NoteFormOptions = NoteFormMode & {
  readonly workItemId: string;
  /** After the request succeeded: the page refresh. */
  readonly onSaved: () => Promise<unknown>;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** The Add / Edit note form of a task. The field name is the API body key. */
export function useNoteFormSchema(options: NoteFormOptions): ObjectFormSchema {
  const { t } = useTranslation('workItems');
  const { workItemId, onSaved } = options;

  return {
    id: 'note',
    title: options.mode === 'create' ? t('taskPage.notes.addTitle') : t('taskPage.notes.editTitle'),
    initialValues: { content: options.mode === 'edit' ? options.note.content : '' },
    fields: [
      {
        name: 'content',
        label: t('taskPage.notes.note'),
        kind: 'textarea',
        essential: true,
        required: true,
        maxLength: NOTE_MAX_LENGTH,
        testId: 'note-form-content',
      },
    ],
    validate: (values: ObjectFormValues): ObjectFormErrors =>
      text(values.content) ? {} : { content: t('taskPage.notes.noteRequired') },
    submit: async (values) => {
      const content = text(values.content);
      const saved =
        options.mode === 'create'
          ? await createNote(workItemId, { content })
          : await updateNote(workItemId, options.note.id, { content });
      await onSaved();
      return { id: saved.id, href: routeUrl('workItem', { id: workItemId }), label: content };
    },
  };
}
