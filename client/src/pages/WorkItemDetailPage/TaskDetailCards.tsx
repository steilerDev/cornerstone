import { useId } from 'react';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserResponse, WorkItemPageDetail } from '@cornerstone/shared';
import { AreaBreadcrumb } from '../../components/AreaBreadcrumb/AreaBreadcrumb.js';
import { CallButton } from '../../components/CallButton/CallButton.js';
import { decodeWho, encodeWho } from '../../components/EntityPicker/entityPickerKinds.js';
import { ObjectFormFields } from '../../components/ObjectForm/ObjectFormFields.js';
import { pickErrors, toDraftText } from '../../components/ObjectForm/objectFormState.js';
import type { ObjectFormValues } from '../../components/ObjectForm/types.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { useCardDraft } from '../../components/SectionCard/useCardDraft.js';
import { DetailRow } from '../../components/SectionCard/SectionCardFields.js';
import type { SectionCardController } from '../../components/SectionCard/SectionCard.js';
import { useUserText } from '../../hooks/useUserText.js';
import { FormError } from '../../components/FormError/FormError.js';
import { fetchFailureMessage } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { updateWorkItem } from '../../lib/workItemsApi.js';
import {
  useTaskFormSchema,
  useTaskValueMessages,
  validateTaskValues,
} from '../../objectForms/taskForm.js';
import type { KnownCompany } from '../../hooks/useCompanyName.js';
import styles from './WorkItemDetailPage.module.css';

const DETAILS_NAMES = ['title', 'description'] as const;
const DETAILS_TEST_IDS = {
  title: 'task-field-title',
  description: 'task-field-description',
};
const WHO_WHERE_NAMES = ['assignment', 'area'] as const;

interface TaskFieldsProps {
  readonly names: readonly string[];
  readonly values: ObjectFormValues;
  readonly errors: Readonly<Record<string, string | undefined>>;
  readonly onChange: (name: string, value: unknown) => void;
  readonly idPrefix: string;
  readonly testIds?: Readonly<Record<string, string>>;
  readonly users?: readonly UserResponse[];
  readonly knownCompany?: KnownCompany | null;
}

/** Mounted in edit mode only: the task schema (same fields as the New task dialog). */
function TaskFields({ users, knownCompany, ...rest }: TaskFieldsProps) {
  const schema = useTaskFormSchema({ scope: 'edit', users, knownCompany });
  return <ObjectFormFields fields={schema.fields} {...rest} />;
}

export interface TaskDetailCardsProps {
  readonly task: WorkItemPageDetail;
  /** Active members for the Who picker. */
  readonly users: readonly UserResponse[];
  /** Why the member list could not load; the Who and where card shows it with Retry. */
  readonly usersFailure: FetchFailure | null;
  readonly onRetryUsers: () => void;
  /** After a successful save: the page refresh. */
  readonly onSaved: () => Promise<void>;
  /** Lets the `e` shortcut open the Details card. */
  readonly detailsCardRef: Ref<SectionCardController>;
  /** Lets the strip's Who and Where facts open the Who and where card. */
  readonly whoWhereCardRef: Ref<SectionCardController>;
}

/** The Details and Who and where cards of the Overview tab. */
export function TaskDetailCards({
  task,
  users,
  usersFailure,
  onRetryUsers,
  onSaved,
  detailsCardRef,
  whoWhereCardRef,
}: TaskDetailCardsProps) {
  return (
    <>
      <DetailsCard task={task} onSaved={onSaved} controllerRef={detailsCardRef} />
      <WhoWhereCard
        task={task}
        users={users}
        usersFailure={usersFailure}
        onRetryUsers={onRetryUsers}
        onSaved={onSaved}
        controllerRef={whoWhereCardRef}
      />
    </>
  );
}

interface CardProps {
  readonly task: WorkItemPageDetail;
  readonly onSaved: () => Promise<void>;
  readonly controllerRef: Ref<SectionCardController>;
}

function DetailsCard({ task, onSaved, controllerRef }: CardProps) {
  const { t } = useTranslation('workItems');
  const userText = useUserText();
  const baseId = useId();
  const messages = useTaskValueMessages();
  const card = useCardDraft({
    initial: { title: task.title, description: task.description ?? '' },
    validate: (draft) => pickErrors(validateTaskValues(draft, messages), DETAILS_NAMES),
    save: (draft) =>
      updateWorkItem(task.id, {
        ...(draft.title !== task.title ? { title: draft.title.trim() } : {}),
        ...(draft.description !== (task.description ?? '')
          ? { description: draft.description.trim() || null }
          : {}),
      }),
    saveError: t('taskPage.overview.saveError'),
    onSaved,
  });

  return (
    <SectionCard
      id="task-details"
      title={t('taskPage.overview.details')}
      testId="section-task-details"
      controllerRef={controllerRef}
      edit={{
        dirty: card.dirty,
        onStart: card.discard,
        onSave: card.save,
        onDiscard: card.discard,
        error: card.banner,
        renderFields: () => (
          <TaskFields
            names={DETAILS_NAMES}
            values={card.draft}
            errors={card.errors}
            onChange={(name, value) =>
              card.set(name as 'title' | 'description', toDraftText(value))
            }
            idPrefix={`${baseId}-`}
            testIds={DETAILS_TEST_IDS}
          />
        ),
      }}
    >
      {task.description ? (
        <p className={styles.noteBody} data-testid="task-detail-description">
          <span {...userText()}>{task.description}</span>
        </p>
      ) : (
        <p className={styles.muted} data-testid="task-detail-description">
          {t('taskPage.overview.noDescription')}
        </p>
      )}
    </SectionCard>
  );
}

function WhoWhereCard({
  task,
  users,
  usersFailure,
  onRetryUsers,
  onSaved,
  controllerRef,
}: CardProps & {
  readonly users: readonly UserResponse[];
  readonly usersFailure: FetchFailure | null;
  readonly onRetryUsers: () => void;
}) {
  const { t } = useTranslation('workItems');
  const { t: tErrors } = useTranslation('errors');
  const userText = useUserText();
  const baseId = useId();
  const whoOf = encodeWho({ userId: task.assignedUser?.id, vendorId: task.assignedVendor?.id });
  const card = useCardDraft({
    initial: { assignment: whoOf, area: task.area?.id ?? '' },
    validate: () => ({}),
    save: (draft) => {
      const { userId, vendorId } = decodeWho(draft.assignment);
      return updateWorkItem(task.id, {
        ...(draft.assignment !== whoOf
          ? { assignedUserId: userId ?? null, assignedVendorId: vendorId ?? null }
          : {}),
        ...(draft.area !== (task.area?.id ?? '') ? { areaId: draft.area || null } : {}),
      });
    },
    saveError: t('taskPage.overview.saveError'),
    onSaved,
  });

  const whoName = task.assignedVendor?.name ?? task.assignedUser?.displayName ?? null;

  return (
    <SectionCard
      id="task-who-where"
      title={t('taskPage.overview.whoWhere')}
      testId="section-task-who-where"
      controllerRef={controllerRef}
      edit={{
        dirty: card.dirty,
        onStart: card.discard,
        onSave: card.save,
        onDiscard: card.discard,
        error: card.banner,
        renderFields: () => (
          <>
            {usersFailure ? (
              <div className={styles.errorActions}>
                <FormError
                  message={fetchFailureMessage(
                    usersFailure,
                    tErrors,
                    t('taskPage.overview.usersLoadError'),
                  )}
                />
                <button type="button" className={styles.compactButton} onClick={onRetryUsers}>
                  {t('taskPage.retry')}
                </button>
              </div>
            ) : null}
            <TaskFields
              names={WHO_WHERE_NAMES}
              values={card.draft}
              errors={card.errors}
              onChange={(name, value) =>
                card.set(name as 'assignment' | 'area', toDraftText(value))
              }
              idPrefix={`${baseId}-`}
              users={users}
              knownCompany={task.assignedVendor}
            />
          </>
        ),
      }}
    >
      <dl className={styles.details}>
        <DetailRow label={t('taskPage.overview.who')} testId="task-detail-who">
          {whoName ? (
            <span className={styles.whoValue}>
              <span {...userText()}>{whoName}</span>
              {task.assignedVendor?.phone ? (
                <CallButton phone={task.assignedVendor.phone} name={task.assignedVendor.name} />
              ) : null}
            </span>
          ) : null}
        </DetailRow>
        <DetailRow label={t('taskPage.overview.area')} testId="task-detail-area">
          {task.area ? <AreaBreadcrumb area={task.area} /> : null}
        </DetailRow>
      </dl>
    </SectionCard>
  );
}

export default TaskDetailCards;
