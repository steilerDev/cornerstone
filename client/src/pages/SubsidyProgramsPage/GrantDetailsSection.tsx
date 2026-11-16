import { useId } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubsidyProgram, UpdateSubsidyProgramRequest } from '@cornerstone/shared';
import { ObjectFormFields } from '../../components/ObjectForm/ObjectFormFields.js';
import { pickErrors, toDraftText } from '../../components/ObjectForm/objectFormState.js';
import type { ObjectFormValues } from '../../components/ObjectForm/types.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { useCardDraft } from '../../components/SectionCard/useCardDraft.js';
import { useUserText } from '../../hooks/useUserText.js';
import { useFormatters } from '../../lib/formatters.js';
import { formatRate } from '../../lib/formatRate.js';
import { updateSubsidyProgram } from '../../lib/subsidyProgramsApi.js';
import {
  useGrantFormSchema,
  useGrantValueMessages,
  validateGrantValues,
} from '../../objectForms/grantForm.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './GrantPage.module.css';

type DraftField =
  'name' | 'reductionValue' | 'maximumAmount' | 'applicationDeadline' | 'description' | 'notes';

type Draft = Readonly<Record<DraftField, string>>;

const NAMES: readonly DraftField[] = [
  'name',
  'reductionValue',
  'maximumAmount',
  'applicationDeadline',
  'description',
  'notes',
];

const TEST_IDS = {
  name: 'grant-field-name',
  reductionValue: 'grant-field-rate',
  maximumAmount: 'grant-field-cap',
  applicationDeadline: 'grant-field-deadline',
  description: 'grant-field-description',
  notes: 'grant-field-notes',
} as const;

function draftOf(grant: SubsidyProgram): Draft {
  return {
    name: grant.name,
    reductionValue: String(grant.reductionValue),
    maximumAmount: grant.maximumAmount === null ? '' : String(grant.maximumAmount),
    applicationDeadline: grant.applicationDeadline ?? '',
    description: grant.description ?? '',
    notes: grant.notes ?? '',
  };
}

export interface GrantDetailsSectionProps {
  readonly grant: SubsidyProgram;
  /** After a successful save: the page refresh (the PATCH response lacks the money figures). */
  readonly onSaved: () => Promise<unknown>;
}

interface DetailsFieldsProps {
  readonly fixed: boolean;
  readonly values: ObjectFormValues;
  readonly errors: Partial<Record<DraftField, string>>;
  readonly onChange: (name: string, value: unknown) => void;
  readonly idPrefix: string;
}

/** Mounted in edit mode only: the grant schema (the New dialog's fields without Status and items). */
function DetailsFields({ fixed, values, errors, onChange, idPrefix }: DetailsFieldsProps) {
  const schema = useGrantFormSchema({ scope: 'edit', fixed });
  return (
    <ObjectFormFields
      fields={schema.fields}
      names={NAMES}
      values={values}
      errors={errors}
      onChange={onChange}
      idPrefix={idPrefix}
      testIds={TEST_IDS}
    />
  );
}

/**
 * The Details card of a grant: name, rate, cap, deadline, description and notes. A legacy fixed
 * grant edits its stored amount as "Fixed reduction"; the type itself is never changed here.
 */
export function GrantDetailsSection({ grant, onSaved }: GrantDetailsSectionProps) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const { formatCurrency, formatDate, formatPercent } = useFormatters();
  const userText = useUserText();
  const baseId = useId();
  const fixed = grant.reductionType === 'fixed';
  const messages = useGrantValueMessages();
  const initial = draftOf(grant);
  const card = useCardDraft<DraftField>({
    initial,
    validate: (draft) =>
      pickErrors(validateGrantValues(draft, messages, { fixed, scope: 'edit' }), NAMES),
    save: (draft) => {
      const body: UpdateSubsidyProgramRequest = {
        ...(draft.name !== initial.name ? { name: draft.name.trim() } : {}),
        ...(draft.reductionValue !== initial.reductionValue
          ? { reductionValue: Number(draft.reductionValue) }
          : {}),
        ...(draft.maximumAmount !== initial.maximumAmount
          ? {
              maximumAmount: draft.maximumAmount.trim() === '' ? null : Number(draft.maximumAmount),
            }
          : {}),
        ...(draft.applicationDeadline !== initial.applicationDeadline
          ? { applicationDeadline: draft.applicationDeadline || null }
          : {}),
        ...(draft.description !== initial.description
          ? { description: draft.description.trim() || null }
          : {}),
        ...(draft.notes !== initial.notes ? { notes: draft.notes.trim() || null } : {}),
      };
      return updateSubsidyProgram(grant.id, body);
    },
    saveError: t('financing.grantPage.saveError'),
    // The PATCH succeeded: a failed page refresh is the page's own error state, not a failed save.
    onSaved: () =>
      onSaved().then(
        () => undefined,
        () => undefined,
      ),
  });

  const rateLabel = fixed ? t('financing.grant.fixedReductionField') : t('financing.fields.rate');

  const row = (label: string, value: ReactNode, testId: string, isUserText = false) => (
    <div className={styles.detailRow}>
      <dt>{label}</dt>
      <dd data-testid={testId} {...(isUserText && value ? userText() : {})}>
        {value || (
          <>
            <span aria-hidden="true">–</span>
            <span className={sharedStyles.srOnly}>{tc('summaryStrip.notSet')}</span>
          </>
        )}
      </dd>
    </div>
  );

  const rateRead = fixed ? (
    <>
      <span className={sharedStyles.srOnly}>{t('financing.grant.fixedReductionField')} </span>
      {formatCurrency(grant.reductionValue)}
    </>
  ) : (
    formatRate(grant.reductionValue, formatPercent)
  );

  return (
    <SectionCard
      id="grant-details"
      title={t('financing.sections.details')}
      testId="grant-details"
      edit={{
        dirty: card.dirty,
        onStart: card.discard,
        onSave: card.save,
        onDiscard: card.discard,
        error: card.banner,
        renderFields: () => (
          <DetailsFields
            fixed={fixed}
            values={card.draft}
            errors={card.errors}
            onChange={(name, value) => card.set(name as DraftField, toDraftText(value))}
            idPrefix={`${baseId}-`}
          />
        ),
      }}
    >
      <dl className={styles.details}>
        {row(t('financing.fields.name'), grant.name, 'grant-detail-name', true)}
        {row(rateLabel, rateRead, 'grant-detail-rate')}
        {row(
          t('financing.grant.cap'),
          grant.maximumAmount === null
            ? t('financing.grant.noCap')
            : formatCurrency(grant.maximumAmount),
          'grant-detail-cap',
        )}
        {row(
          t('financing.fields.deadline'),
          grant.applicationDeadline ? formatDate(grant.applicationDeadline) : null,
          'grant-detail-deadline',
        )}
        {row(
          t('financing.fields.description'),
          grant.description,
          'grant-detail-description',
          true,
        )}
        {row(t('financing.fields.notes'), grant.notes, 'grant-detail-notes', true)}
      </dl>
    </SectionCard>
  );
}

export default GrantDetailsSection;
