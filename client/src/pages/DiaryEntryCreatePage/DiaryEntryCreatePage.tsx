import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ManualDiaryEntryType } from '@cornerstone/shared';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { createDiaryEntry } from '../../lib/diaryApi.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { forwardOriginState } from '../../navigation/origin.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import styles from './DiaryEntryCreatePage.module.css';
import { routeUrl } from '@cornerstone/shared';

interface TypeCardProps {
  type: ManualDiaryEntryType;
  emoji: string;
  label: string;
  description: string;
  disabled?: boolean;
  onSelect: () => void;
}

function TypeCard({ type, emoji, label, description, disabled, onSelect }: TypeCardProps) {
  return (
    <button
      type="button"
      className={styles.typeCard}
      onClick={onSelect}
      disabled={disabled}
      aria-disabled={disabled}
      data-testid={`type-card-${type}`}
    >
      <div className={styles.typeCardEmoji}>{emoji}</div>
      <div className={styles.typeCardLabel}>{label}</div>
      <div className={styles.typeCardDescription}>{description}</div>
    </button>
  );
}

export default function DiaryEntryCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('diary');
  const { t: tCommon } = useTranslation('common');
  const pageTitle = tCommon('navigation.newDiaryEntry');
  useDocumentTitle(pageTitle);
  const { showToast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const draftCreatingRef = useRef(false);

  const handleTypeSelect = async (type: ManualDiaryEntryType) => {
    if (draftCreatingRef.current) return;
    draftCreatingRef.current = true;
    setIsCreating(true);
    try {
      const draft = await createDiaryEntry({ entryType: type, status: 'draft' });
      navigate(routeUrl('diaryEntryEdit', { id: draft.id }), {
        replace: true,
        state: forwardOriginState(location.state),
      });
    } catch (err) {
      showToast('error', t('createPage.draftCreateError'));
      console.error('Failed to create draft:', err);
      draftCreatingRef.current = false;
      setIsCreating(false);
    }
  };

  return (
    <div className={styles.container}>
      <PageBreadcrumbs />
      <div className={styles.header}>
        <h1 className={styles.title}>{pageTitle}</h1>
      </div>

      <div className={styles.typeSelector}>
        <h2 className={styles.sectionTitle}>{t('createPage.selectEntryType')}</h2>
        <div className={styles.typeGrid}>
          <TypeCard
            type="daily_log"
            emoji="📋"
            label={tCommon(I18N_UNION_KEYS.statusVocabularyDiaryType.key('daily_log'))}
            description={t('createPage.typeCardDailyDesc')}
            disabled={isCreating}
            onSelect={() => void handleTypeSelect('daily_log')}
          />
          <TypeCard
            type="site_visit"
            emoji="🔍"
            label={tCommon(I18N_UNION_KEYS.statusVocabularyDiaryType.key('site_visit'))}
            description={t('createPage.typeCardSiteVisitDesc')}
            disabled={isCreating}
            onSelect={() => void handleTypeSelect('site_visit')}
          />
          <TypeCard
            type="delivery"
            emoji="📦"
            label={tCommon(I18N_UNION_KEYS.statusVocabularyDiaryType.key('delivery'))}
            description={t('createPage.typeCardDeliveryDesc')}
            disabled={isCreating}
            onSelect={() => void handleTypeSelect('delivery')}
          />
          <TypeCard
            type="issue"
            emoji="⚠️"
            label={tCommon(I18N_UNION_KEYS.statusVocabularyDiaryType.key('issue'))}
            description={t('createPage.typeCardIssueDesc')}
            disabled={isCreating}
            onSelect={() => void handleTypeSelect('issue')}
          />
          <TypeCard
            type="general_note"
            emoji="📝"
            label={tCommon(I18N_UNION_KEYS.statusVocabularyDiaryType.key('general_note'))}
            description={t('createPage.typeCardGeneralNoteDesc')}
            disabled={isCreating}
            onSelect={() => void handleTypeSelect('general_note')}
          />
        </div>
      </div>
    </div>
  );
}
