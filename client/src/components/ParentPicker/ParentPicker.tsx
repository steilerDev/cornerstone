import { useState, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkItemPicker } from '../WorkItemPicker/WorkItemPicker.js';
import { HouseholdItemPicker } from '../HouseholdItemPicker/HouseholdItemPicker.js';
import styles from './ParentPicker.module.css';

export interface ParentPickerProps {
  selectedType: 'work_item' | 'household_item';
  selectedId: string | null;
  onChange: (type: 'work_item' | 'household_item', id: string) => void;
  disabled?: boolean;
}

export function ParentPicker({
  selectedType,
  selectedId,
  onChange,
  disabled = false,
}: ParentPickerProps) {
  const { t } = useTranslation('budget');
  const baseId = useId();
  const workItemTabId = `${baseId}-tab-work-item`;
  const householdItemTabId = `${baseId}-tab-household-item`;
  const panelId = `${baseId}-panel`;
  const [activeTab, setActiveTab] = useState<'work_item' | 'household_item'>(selectedType);

  // Sync local tab state when prop changes
  useEffect(() => {
    setActiveTab(selectedType);
  }, [selectedType]);

  return (
    <div className={styles.container}>
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          id={workItemTabId}
          role="tab"
          aria-selected={activeTab === 'work_item'}
          aria-controls={panelId}
          className={`${styles.tab} ${activeTab === 'work_item' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('work_item')}
          disabled={disabled}
        >
          {t('budgetLineForm.parentPickerWorkItemTab')}
        </button>
        <button
          type="button"
          id={householdItemTabId}
          role="tab"
          aria-selected={activeTab === 'household_item'}
          aria-controls={panelId}
          className={`${styles.tab} ${activeTab === 'household_item' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('household_item')}
          disabled={disabled}
        >
          {t('budgetLineForm.parentPickerHouseholdItemTab')}
        </button>
      </div>

      <div
        id={panelId}
        className={styles.body}
        role="tabpanel"
        aria-labelledby={activeTab === 'work_item' ? workItemTabId : householdItemTabId}
      >
        {activeTab === 'work_item' ? (
          <WorkItemPicker
            value={selectedId ?? ''}
            onChange={(id: string) => onChange('work_item', id)}
            placeholder={t('budgetLineForm.parentPickerWorkItemTab')}
            excludeIds={[]}
          />
        ) : (
          <HouseholdItemPicker
            value={selectedId ?? ''}
            onChange={(id: string) => onChange('household_item', id)}
            placeholder={t('budgetLineForm.parentPickerHouseholdItemTab')}
            excludeIds={[]}
          />
        )}
      </div>
    </div>
  );
}
