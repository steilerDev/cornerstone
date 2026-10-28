import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { SubtaskResponse } from '@cornerstone/shared';
import type {
  ObjectFormErrors,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import { updateSubtask } from '../lib/subtasksApi.js';

const NAME_MAX_LENGTH = 500;

export interface ChecklistItemFormOptions {
  readonly workItemId: string;
  readonly item: SubtaskResponse;
  /** After the request succeeded: the page refresh. */
  readonly onSaved: () => Promise<unknown>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** The Rename form of a checklist item (a subtask of the task). */
export function useChecklistItemFormSchema({
  workItemId,
  item,
  onSaved,
}: ChecklistItemFormOptions): ObjectFormSchema {
  const { t } = useTranslation('workItems');

  return {
    id: 'checklist-item',
    title: t('taskPage.checklist.renameTitle'),
    initialValues: { title: item.title },
    fields: [
      {
        name: 'title',
        label: t('taskPage.checklist.name'),
        kind: 'text',
        essential: true,
        required: true,
        maxLength: NAME_MAX_LENGTH,
        testId: 'checklist-item-form-title',
      },
    ],
    validate: (values: ObjectFormValues): ObjectFormErrors =>
      text(values.title) ? {} : { title: t('taskPage.checklist.nameRequired') },
    submit: async (values) => {
      const title = text(values.title);
      await updateSubtask(workItemId, item.id, { title });
      await onSaved();
      return { id: item.id, href: routeUrl('workItem', { id: workItemId }), label: title };
    },
  };
}
