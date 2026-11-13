import { useId } from 'react';
import type { CSSProperties, Ref, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { MilestoneDetail } from '@cornerstone/shared';
import { ColorField } from '../../components/ObjectForm/ColorField.js';
import { SectionCard, SectionCardScope } from '../../components/SectionCard/index.js';
import type { SectionCardController } from '../../components/SectionCard/index.js';
import { DetailRow, FieldShell } from '../../components/SectionCard/SectionCardFields.js';
import { useCardDraft } from '../../components/SectionCard/useCardDraft.js';
import { useUserText } from '../../hooks/useUserText.js';
import { useFormatters } from '../../lib/formatters.js';
import { updateMilestone } from '../../lib/milestonesApi.js';
import sharedStyles from '../../styles/shared.module.css';
import type { MilestonePanelProps } from './milestonePageTypes.js';
import styles from './MilestoneDetailPage.module.css';

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;

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

function DetailsCard({ milestone, onSaved, controllerRef, targetDateInputId }: DetailsCardProps) {
  const { t } = useTranslation('schedule');
  const { formatDate } = useFormatters();
  const userText = useUserText();
  const baseId = useId();

  // The colour draft is a string ('' = No color) so it fits the card draft like every field.
  const initial: Draft = {
    title: milestone.title,
    targetDate: milestone.targetDate,
    description: milestone.description ?? '',
    color: milestone.color ?? '',
  };
  const card = useCardDraft<keyof Draft>({
    initial,
    validate: (draft) => {
      const errors: Partial<Record<keyof Draft, string>> = {};
      if (!draft.title.trim()) errors.title = t('milestones.create.form.title.error');
      if (!draft.targetDate) errors.targetDate = t('milestones.create.form.targetDate.error');
      return errors;
    },
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
        renderFields: ({ firstFieldRef }) => (
          <div className={styles.fields}>
            <FieldShell
              id={`${baseId}-title`}
              label={t('milestones.create.form.title.label')}
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
                  data-testid="milestone-field-title"
                />
              )}
            </FieldShell>
            <FieldShell
              id={targetDateInputId}
              label={t('milestones.create.form.targetDate.label')}
              required
              error={card.errors.targetDate}
            >
              {(aria) => (
                <input
                  id={targetDateInputId}
                  type="date"
                  className={sharedStyles.input}
                  value={card.draft.targetDate}
                  onChange={(e) => card.set('targetDate', e.target.value)}
                  aria-required="true"
                  aria-invalid={aria.invalid}
                  aria-describedby={aria.describedBy}
                  data-testid="milestone-field-target-date"
                />
              )}
            </FieldShell>
            <FieldShell
              id={`${baseId}-description`}
              label={t('milestones.create.form.description.label')}
            >
              {() => (
                <textarea
                  id={`${baseId}-description`}
                  className={sharedStyles.textarea}
                  rows={4}
                  value={card.draft.description}
                  maxLength={DESCRIPTION_MAX}
                  onChange={(e) => card.set('description', e.target.value)}
                  data-testid="milestone-field-description"
                />
              )}
            </FieldShell>
            <FieldShell id={`${baseId}-color`} label={t('milestones.detail.overview.color')}>
              {() => (
                <ColorField
                  id={`${baseId}-color`}
                  value={card.draft.color === '' ? null : card.draft.color}
                  onChange={(next) => card.set('color', next ?? '')}
                  noColorLabel={t('milestones.detail.overview.noColor')}
                  testIdPrefix="milestone-field"
                />
              )}
            </FieldShell>
          </div>
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
