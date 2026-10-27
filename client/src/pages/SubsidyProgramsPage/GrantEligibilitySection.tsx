import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubsidyProgram, UpdateSubsidyProgramRequest } from '@cornerstone/shared';
import { EntityMultiPicker } from '../../components/EntityPicker/EntityMultiPicker.js';
import type { EntityOption } from '../../components/EntityPicker/types.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { useUserText } from '../../hooks/useUserText.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { updateSubsidyProgram } from '../../lib/subsidyProgramsApi.js';
import { NO_CATEGORY_OPTION_ID } from '../../objectForms/grantForm.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './GrantPage.module.css';

export interface GrantEligibilitySectionProps {
  readonly grant: SubsidyProgram;
  /** After a successful save: the page refresh (the figures change with the categories). */
  readonly onSaved: () => Promise<unknown>;
}

/** The Eligibility card of a grant: which cost categories count, and the eligibility text. */
export function GrantEligibilitySection({ grant, onSaved }: GrantEligibilitySectionProps) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');
  const { t: tErrors } = useTranslation('errors');
  const userText = useUserText();
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
          <div className={styles.fields}>
            <div className={styles.field}>
              <span className={styles.label}>{t('financing.fields.categories')}</span>
              <EntityMultiPicker
                value={categories}
                onChange={setCategories}
                picker={{
                  kind: 'category',
                  create: 'off',
                  specialOptions: [{ id: NO_CATEGORY_OPTION_ID, label: noCategoryLabel }],
                }}
                removeLabel={(option) => t('financing.work.removeChip', { name: option.label })}
                countLabel={(count) => t('financing.work.selected', { count })}
                testId="grant-field-categories"
              />
              <p className={styles.hint}>{t('financing.hints.categories')}</p>
            </div>
            <div className={styles.field}>
              <label htmlFor="grant-eligibility-text" className={styles.label}>
                {t('financing.fields.eligibility')}
              </label>
              <textarea
                id="grant-eligibility-text"
                className={sharedStyles.textarea}
                rows={3}
                value={eligibility}
                onChange={(e) => setEligibility(e.target.value)}
                data-testid="grant-field-eligibility"
              />
            </div>
          </div>
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
