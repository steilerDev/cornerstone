import { useId } from 'react';
import type { CSSProperties, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { MilestoneDetail } from '@cornerstone/shared';
import { ObjectFormFields } from '../../components/ObjectForm/ObjectFormFields.js';
import { pickErrors, toDraftText } from '../../components/ObjectForm/objectFormState.js';
import type { ObjectFormValues } from '../../components/ObjectForm/types.js';
import { SectionCard, SectionCardScope } from '../../components/SectionCard/index.js';
import type { SectionCardController } from '../../components/SectionCard/index.js';
import { DetailRow } from '../../components/SectionCard/SectionCardFields.js';
import { useCardDraft } from '../../components/SectionCard/useCardDraft.js';
import { useUserText } from '../../hooks/useUserText.js';
import { useFormatters } from '../../lib/formatters.js';
import { updateMilestone } from '../../lib/milestonesApi.js';
import {
  useMilestoneFormSchema,
  useMilestoneValueMessages,
  validateMilestoneValues,
} from '../../objectForms/milestoneForm.js';
import type { MilestonePanelProps } from './milestonePageTypes.js';
import styles from './MilestoneDetailPage.module.css';

export interface MilestoneOverviewPanelProps extends MilestonePanelProps {
  /** Lets the `e` shortcut and Change target open the Details card. */
  readonly detailsCardRef: Ref<SectionCardController>;
  /** DOM id of the target date input: Change target focuses it. */
  readonly targetDateInputId: string;
}

/** The Overview tab: the Details card. */
export function MilestoneOverviewPanel({
  milestone,
  refresh,
  detailsCardRef,
  targetDateInputId,
}: MilestoneOverviewPanelProps) {
  return (
    <SectionCardScope>
      <div className={styles.panel}>
        <DetailsCard
          milestone={milestone}
          onSaved={refresh}
          controllerRef={detailsCardRef}
          targetDateInputId={targetDateInputId}
        />
      </div>
    </SectionCardScope>
  );
}

interface DetailsCardProps {
  readonly milestone: MilestoneDetail;
  readonly onSaved: () => Promise<void>;
  readonly controllerRef: Ref<SectionCardController>;
  readonly targetDateInputId: string;
}

type Draft = Record<'title' | 'targetDate' | 'description' | 'color', string>;

/** The schema fields the card shows, in order. */
const NAMES = ['title', 'targetDate', 'description', 'color'] as const;
const TEST_IDS = {
  title: 'milestone-field-title',
  targetDate: 'milestone-field-target-date',
  description: 'milestone-field-description',
  color: 'milestone-field',
};

interface DetailsFieldsProps {
  readonly values: ObjectFormValues;
  readonly errors: Partial<Record<keyof Draft, string>>;
  readonly onChange: (name: string, value: unknown) => void;
  readonly idPrefix: string;
  readonly targetDateInputId: string;
}

/** Mounted in edit mode only: the milestone schema (same fields as the New milestone dialog). */
function DetailsFields({
  values,
  errors,
  onChange,
  idPrefix,
  targetDateInputId,
}: DetailsFieldsProps) {
  const schema = useMilestoneFormSchema({ scope: 'edit' });
  return (
    <ObjectFormFields
      fields={schema.fields}
      names={NAMES}
      values={values}
      errors={errors}
      onChange={onChange}
      idPrefix={idPrefix}
      ids={{ targetDate: targetDateInputId }}
      testIds={TEST_IDS}
    />
  );
}

function DetailsCard({ milestone, onSaved, controllerRef, targetDateInputId }: DetailsCardProps) {
  const { t } = useTranslation('schedule');
  const { formatDate } = useFormatters();
  const userText = useUserText();
  const baseId = useId();
  const messages = useMilestoneValueMessages();

  // The colour draft is a string ('' = No color) so it fits the card draft like every field.
  const initial: Draft = {
    title: milestone.title,
    targetDate: milestone.targetDate,
    description: milestone.description ?? '',
    color: milestone.color ?? '',
  };
  const card = useCardDraft<keyof Draft>({
    initial,
    validate: (draft) => pickErrors(validateMilestoneValues(draft, messages), NAMES),
    save: (draft) =>
      updateMilestone(milestone.id, {
        ...(draft.title !== initial.title ? { title: draft.title.trim() } : {}),
        ...(draft.targetDate !== initial.targetDate ? { targetDate: draft.targetDate } : {}),
        ...(draft.description !== initial.description
          ? { description: draft.description.trim() || null }
          : {}),
        ...(draft.color !== initial.color ? { color: draft.color || null } : {}),
      }),
    saveError: t('milestones.detail.overview.saveError'),
    onSaved,
  });

  const { color, description } = milestone;

  return (
    <SectionCard
      id="milestone-details"
      title={t('milestones.detail.overview.details')}
      testId="section-milestone-details"
      controllerRef={controllerRef}
      edit={{
        dirty: card.dirty,
        onStart: card.discard,
        onSave: card.save,
        onDiscard: card.discard,
        error: card.banner,
        renderFields: () => (
          <DetailsFields
            values={card.draft}
            errors={card.errors}
            onChange={(name, value) => card.set(name as keyof Draft, toDraftText(value))}
            idPrefix={`${baseId}-`}
            targetDateInputId={targetDateInputId}
          />
        ),
      }}
    >
      {description ? (
        <span className={styles.userTextBlock}>
          <span {...userText()}>{description}</span>
        </span>
      ) : (
        <p className={styles.muted} data-testid="milestone-detail-empty">
          {t('milestones.detail.overview.nothingYet')}
        </p>
      )}
      <dl className={styles.details}>
        <DetailRow
          label={t('milestones.create.form.targetDate.label')}
          testId="milestone-detail-target"
        >
          {formatDate(milestone.targetDate)}
        </DetailRow>
        {milestone.isCompleted && milestone.completedAt !== null ? (
          <DetailRow
            label={t('milestones.detail.overview.reachedOn')}
            testId="milestone-detail-reached"
          >
            {formatDate(milestone.completedAt.slice(0, 10))}
          </DetailRow>
        ) : null}
        <DetailRow label={t('milestones.detail.overview.color')} testId="milestone-detail-color">
          {color ? (
            <>
              <span
                aria-hidden="true"
                className={styles.swatch}
                data-color="set"
                style={{ '--milestone-color': color } as CSSProperties}
              />
              {color}
            </>
          ) : (
            <span className={styles.muted}>{t('milestones.detail.overview.noColor')}</span>
          )}
        </DetailRow>
      </dl>
    </SectionCard>
  );
}

export default MilestoneOverviewPanel;
