import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ManualDiaryEntryType } from '@cornerstone/shared';
import { createDiaryEntry } from '../../lib/diaryApi.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import styles from './DiaryEntryCreatePage.module.css';

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
  const { t } = useTranslation('diary');
  const { showToast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const draftCreatingRef = useRef(false);

  const handleTypeSelect = async (type: ManualDiaryEntryType) => {
    if (draftCreatingRef.current) return;
    draftCreatingRef.current = true;
    setIsCreating(true);
    try {
      const draft = await createDiaryEntry({ entryType: type, status: 'draft' });
      navigate(`/diary/${draft.id}/edit`, { replace: true });
    } catch (err) {
      showToast('error', t('createPage.draftCreateError'));
      console.error('Failed to create draft:', err);
      draftCreatingRef.current = false;
      setIsCreating(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button type="button" className={styles.backButton} onClick={() => navigate('/diary')}>
          {t('createPage.backLink')}
        </button>
        <h1 className={styles.title}>{t('createPage.title')}</h1>
      </div>

      <div className={styles.typeSelector}>
        <h2 className={styles.sectionTitle}>{t('createPage.selectEntryType')}</h2>
        <div className={styles.typeGrid}>
          <TypeCard
            type="daily_log"
            emoji="📋"
            label={t('createPage.typeCardDaily')}
            description={t('createPage.typeCardDailyDesc')}
            disabled={isCreating}
            onSelect={() => void handleTypeSelect('daily_log')}
          />
          <TypeCard
            type="site_visit"
            emoji="🔍"
            label={t('createPage.typeCardSiteVisit')}
            description={t('createPage.typeCardSiteVisitDesc')}
            disabled={isCreating}
            onSelect={() => void handleTypeSelect('site_visit')}
          />
          <TypeCard
            type="delivery"
            emoji="📦"
            label={t('createPage.typeCardDelivery')}
            description={t('createPage.typeCardDeliveryDesc')}
            disabled={isCreating}
            onSelect={() => void handleTypeSelect('delivery')}
          />
          <TypeCard
            type="issue"
            emoji="⚠️"
            label={t('createPage.typeCardIssue')}
            description={t('createPage.typeCardIssueDesc')}
            disabled={isCreating}
            onSelect={() => void handleTypeSelect('issue')}
          />
          <TypeCard
            type="general_note"
            emoji="📝"
            label={t('createPage.typeCardGeneralNote')}
            description={t('createPage.typeCardGeneralNoteDesc')}
            disabled={isCreating}
            onSelect={() => void handleTypeSelect('general_note')}
          />
        </div>
      </div>
    </div>
  );
}
