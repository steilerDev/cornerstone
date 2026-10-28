import { useId, useState } from 'react';
import type { Ref, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { UpdateWorkItemRequest, UserResponse, WorkItemPageDetail } from '@cornerstone/shared';
import { AreaBreadcrumb } from '../../components/AreaBreadcrumb/AreaBreadcrumb.js';
import { CallButton } from '../../components/CallButton/CallButton.js';
import { EntityPicker } from '../../components/EntityPicker/EntityPicker.js';
import { decodeWho, encodeWho } from '../../components/EntityPicker/entityPickerKinds.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { DetailRow, FieldShell } from '../../components/SectionCard/SectionCardFields.js';
import type { SectionCardController } from '../../components/SectionCard/SectionCard.js';
import { useAreas } from '../../hooks/useAreas.js';
import { useUserText } from '../../hooks/useUserText.js';
import { FormError } from '../../components/FormError/FormError.js';
import { fetchFailureMessage } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { updateWorkItem } from '../../lib/workItemsApi.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './WorkItemDetailPage.module.css';

const TITLE_MAX = 500;
const DESCRIPTION_MAX = 10000;

type Draft<K extends string> = Readonly<Record<K, string>>;

interface CardDraftOptions<K extends string> {
  readonly taskId: string;
  readonly initial: Draft<K>;
  readonly validate: (draft: Draft<K>) => Partial<Record<K, string>>;
  readonly toBody: (draft: Draft<K>) => UpdateWorkItemRequest;
  readonly onSaved: () => Promise<void>;
}

/** The draft, field errors and explicit Save of one detail card. */
function useCardDraft<K extends string>({
  taskId,
  initial,
  validate,
  toBody,
  onSaved,
}: CardDraftOptions<K>) {
  const { t } = useTranslation('workItems');
  const { t: tErrors } = useTranslation('errors');
  const [draft, setDraft] = useState<Draft<K>>(initial);
  const [errors, setErrors] = useState<Partial<Record<K, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);

  const keys = Object.keys(initial) as K[];
  const dirty = keys.some((key) => draft[key] !== initial[key]);

  const discard = () => {
    setDraft(initial);
    setErrors({});
    setBanner(null);
  };

  const save = async (): Promise<boolean> => {
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return false;
    try {
      await updateWorkItem(taskId, toBody(draft));
    } catch (err) {
      setBanner(
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('taskPage.overview.saveError'),
      );
      return false;
    }
    setBanner(null);
    // The PATCH succeeded: a failed refresh is the page's own error state, not a failed save.
    await onSaved();
    return true;
  };

  const set = (field: K, value: string) => setDraft((prev) => ({ ...prev, [field]: value }));

  return { draft, set, errors, banner, dirty, discard, save };
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
  const card = useCardDraft({
    taskId: task.id,
    initial: { title: task.title, description: task.description ?? '' },
    validate: (draft) =>
      draft.title.trim() ? {} : { title: t('taskPage.overview.titleRequired') },
    toBody: (draft) => ({
      ...(draft.title !== task.title ? { title: draft.title.trim() } : {}),
      ...(draft.description !== (task.description ?? '')
        ? { description: draft.description.trim() || null }
        : {}),
    }),
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
        renderFields: ({ firstFieldRef }) => (
          <div className={styles.fields}>
            <FieldShell
              id={`${baseId}-title`}
              label={t('taskPage.overview.title')}
              required
              error={card.errors.title}
            >
              {(aria) => (
                <input
                  id={`${baseId}-title`}
                  ref={firstFieldRef as RefObject<HTMLInputElement | null>}
                  className={sharedStyles.input}
                  value={card.draft.title}
                  maxLength={TITLE_MAX}
                  onChange={(e) => card.set('title', e.target.value)}
                  aria-invalid={aria.invalid}
                  aria-describedby={aria.describedBy}
                  data-testid="task-field-title"
                />
              )}
            </FieldShell>
            <FieldShell id={`${baseId}-description`} label={t('taskPage.overview.description')}>
              {() => (
                <textarea
                  id={`${baseId}-description`}
                  className={sharedStyles.textarea}
                  rows={5}
                  value={card.draft.description}
                  maxLength={DESCRIPTION_MAX}
                  onChange={(e) => card.set('description', e.target.value)}
                  data-testid="task-field-description"
                />
              )}
            </FieldShell>
          </div>
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
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const userText = useUserText();
  const { areas } = useAreas();
  const baseId = useId();
  const whoOf = encodeWho({ userId: task.assignedUser?.id, vendorId: task.assignedVendor?.id });
  const card = useCardDraft({
    taskId: task.id,
    initial: { who: whoOf, areaId: task.area?.id ?? '' },
    validate: () => ({}),
    toBody: (draft) => {
      const { userId, vendorId } = decodeWho(draft.who);
      return {
        ...(draft.who !== whoOf
          ? { assignedUserId: userId ?? null, assignedVendorId: vendorId ?? null }
          : {}),
        ...(draft.areaId !== (task.area?.id ?? '') ? { areaId: draft.areaId || null } : {}),
      };
    },
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
          <div className={styles.fields}>
            {usersFailure ? (
              <div className={styles.errorActions}>
                <FormError
                  message={fetchFailureMessage(
                    usersFailure,
                    tErrors,
                    t('taskPage.overview.usersLoadError'),
                  )}
                />
                <button
                  type="button"
                  className={sharedStyles.btnSecondaryCompact}
                  onClick={onRetryUsers}
                >
                  {t('taskPage.retry')}
                </button>
              </div>
            ) : null}
            <FieldShell id={`${baseId}-who`} label={t('taskPage.overview.who')}>
              {() => (
                <EntityPicker
                  kind="who"
                  id={`${baseId}-who`}
                  users={users}
                  knownCompany={task.assignedVendor}
                  value={card.draft.who}
                  onChange={(next) => card.set('who', next)}
                />
              )}
            </FieldShell>
            <FieldShell id={`${baseId}-area`} label={t('taskPage.overview.area')}>
              {() => (
                <EntityPicker
                  kind="area"
                  id={`${baseId}-area`}
                  areas={areas}
                  noneLabel={tc('aria.noArea')}
                  value={card.draft.areaId}
                  onChange={(next) => card.set('areaId', next)}
                />
              )}
            </FieldShell>
          </div>
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
