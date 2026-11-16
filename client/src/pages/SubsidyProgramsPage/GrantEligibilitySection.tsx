import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubsidyProgram, UpdateSubsidyProgramRequest } from '@cornerstone/shared';
import type { EntityOption } from '../../components/EntityPicker/types.js';
import { ObjectFormFields } from '../../components/ObjectForm/ObjectFormFields.js';
import { toDraftText } from '../../components/ObjectForm/objectFormState.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { useUserText } from '../../hooks/useUserText.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { updateSubsidyProgram } from '../../lib/subsidyProgramsApi.js';
import { NO_CATEGORY_OPTION_ID, useGrantFormSchema } from '../../objectForms/grantForm.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './GrantPage.module.css';

export interface GrantEligibilitySectionProps {
  readonly grant: SubsidyProgram;
  /** After a successful save: the page refresh (the figures change with the categories). */
  readonly onSaved: () => Promise<unknown>;
}

interface EligibilityFieldsProps {
  readonly categories: readonly EntityOption[];
  readonly eligibility: string;
  readonly onChange: (name: string, value: unknown) => void;
  readonly idPrefix: string;
}

/** Mounted in edit mode only: the grant schema's Cost categories and Eligibility fields. */
function EligibilityFields({
  categories,
  eligibility,
  onChange,
  idPrefix,
}: EligibilityFieldsProps) {
  const schema = useGrantFormSchema({ scope: 'edit' });
  return (
    <ObjectFormFields
      fields={schema.fields}
      names={['categories', 'eligibility']}
      values={{ categories, eligibility }}
      errors={{}}
      onChange={onChange}
      idPrefix={idPrefix}
      testIds={{ categories: 'grant-field-categories', eligibility: 'grant-field-eligibility' }}
    />
  );
}

/** The Eligibility card of a grant: which cost categories count, and the eligibility text. */
export function GrantEligibilitySection({ grant, onSaved }: GrantEligibilitySectionProps) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');
  const { t: tErrors } = useTranslation('errors');
  const userText = useUserText();
  const baseId = useId();
  const noCategoryLabel = t('financing.fields.noCategory');

  const optionsOf = (): EntityOption[] => [
    ...grant.applicableCategories.map((category) => ({
      id: category.id,
      label: getCategoryDisplayName(tSettings, category.name, category.translationKey),
    })),
    ...(grant.includesNoCategoryItems
      ? [{ id: NO_CATEGORY_OPTION_ID, label: noCategoryLabel }]
      : []),
  ];

  const [categories, setCategories] = useState<readonly EntityOption[]>(optionsOf);
  const [eligibility, setEligibility] = useState(grant.eligibility ?? '');
  const [bannerError, setBannerError] = useState<string | null>(null);

  const initialOptions = optionsOf();
  const initialIds = initialOptions.map((option) => option.id).sort();
  const draftIds = categories.map((option) => option.id).sort();
  const dirty =
    eligibility !== (grant.eligibility ?? '') || draftIds.join('\n') !== initialIds.join('\n');

  const discard = () => {
    setCategories(initialOptions);
    setEligibility(grant.eligibility ?? '');
    setBannerError(null);
  };

  const save = async (): Promise<boolean> => {
    const body: UpdateSubsidyProgramRequest = {
      categoryIds: categories
        .filter((option) => option.id !== NO_CATEGORY_OPTION_ID)
        .map((option) => option.id),
      includesNoCategoryItems: categories.some((option) => option.id === NO_CATEGORY_OPTION_ID),
      eligibility: eligibility.trim() || null,
    };
    try {
      await updateSubsidyProgram(grant.id, body);
    } catch (err) {
      setBannerError(
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('financing.grantPage.saveError'),
      );
      return false;
    }
    setBannerError(null);
    // The PATCH succeeded: a failed page refresh is the page's own error state, not a failed save.
    await onSaved().catch(() => undefined);
    return true;
  };

  const readNames = grant.applicableCategories.map((category) =>
    getCategoryDisplayName(tSettings, category.name, category.translationKey),
  );

  return (
    <SectionCard
      id="grant-eligibility"
      title={t('financing.sections.eligibility')}
      testId="grant-eligibility"
      edit={{
        dirty,
        onStart: discard,
        onSave: save,
        onDiscard: discard,
        error: bannerError,
        renderFields: () => (
          <EligibilityFields
            categories={categories}
            eligibility={eligibility}
            onChange={(name, value) =>
              name === 'categories'
                ? setCategories(value as EntityOption[])
                : setEligibility(toDraftText(value))
            }
            idPrefix={`${baseId}-`}
          />
        ),
      }}
    >
      <dl className={styles.details}>
        <div className={styles.detailRow}>
          <dt>{t('financing.fields.categories')}</dt>
          <dd data-testid="grant-detail-categories">
            {readNames.length > 0 ? (
              readNames.join(', ')
            ) : (
              <>
                <span aria-hidden="true">–</span>
                <span className={sharedStyles.srOnly}>{tc('summaryStrip.notSet')}</span>
              </>
            )}
            {grant.includesNoCategoryItems && (
              <span className={styles.noCategory} data-testid="grant-detail-no-category">
                {readNames.length > 0 ? ' · ' : ''}
                {t('financing.fields.includesNoCategory')}
              </span>
            )}
          </dd>
        </div>
        <div className={styles.detailRow}>
          <dt>{t('financing.fields.eligibility')}</dt>
          <dd data-testid="grant-detail-eligibility" {...(grant.eligibility ? userText() : {})}>
            {grant.eligibility || (
              <>
                <span aria-hidden="true">–</span>
                <span className={sharedStyles.srOnly}>{tc('summaryStrip.notSet')}</span>
              </>
            )}
          </dd>
        </div>
      </dl>
    </SectionCard>
  );
}

export default GrantEligibilitySection;
