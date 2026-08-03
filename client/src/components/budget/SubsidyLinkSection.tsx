import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubsidyProgram } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import styles from './SubsidyLinkSection.module.css';

export interface SubsidyLinkSectionProps {
  linkedSubsidies: SubsidyProgram[];
  availableSubsidies: SubsidyProgram[];
  selectedSubsidyId: string;
  onSelectSubsidy: (id: string) => void;
  onLinkSubsidy: () => void;
  onUnlinkSubsidy: (subsidyProgramId: string) => void;
  isLinking: boolean;
  oversubscribedIds?: Set<string>;
  children?: ReactNode;
}

export function SubsidyLinkSection({
  linkedSubsidies,
  availableSubsidies,
  selectedSubsidyId,
  onSelectSubsidy,
  onLinkSubsidy,
  onUnlinkSubsidy,
  isLinking,
  oversubscribedIds,
  children,
}: SubsidyLinkSectionProps) {
  const { t } = useTranslation('budget');
  const { formatCurrency } = useFormatters();
  return (
    <div className={styles.container}>
      {linkedSubsidies.length > 0 && (
        <div className={styles.linkedList}>
          {linkedSubsidies.map((subsidy) => (
            <div key={subsidy.id} className={styles.linkedItem}>
              <div className={styles.linkedItemInfo}>
                <span className={styles.linkedItemName}>
                  {subsidy.name}
                  {oversubscribedIds?.has(subsidy.id) && (
                    <span className={styles.oversubscribedBadge}>
                      {t('subsidies.oversubscribed')}
                    </span>
                  )}
                </span>
                <span className={styles.linkedItemMeta}>
                  {subsidy.reductionType === 'percentage'
                    ? t('subsidies.linkSection.reductionPercentage', {
                        value: subsidy.reductionValue,
                      })
                    : t('subsidies.linkSection.reductionFixed', {
                        amount: formatCurrency(subsidy.reductionValue),
                      })}
                </span>
              </div>
              <button
                type="button"
                className={styles.unlinkButton}
                onClick={() => onUnlinkSubsidy(subsidy.id)}
                aria-label={t('subsidies.linkSection.unlinkAriaLabel', { name: subsidy.name })}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {linkedSubsidies.length === 0 && (
        <div className={styles.emptyState}>{t('subsidies.linkSection.emptyState')}</div>
      )}

      {availableSubsidies.length > 0 && (
        <div className={styles.pickerRow}>
          <select
            className={styles.pickerSelect}
            value={selectedSubsidyId}
            onChange={(e) => onSelectSubsidy(e.target.value)}
            aria-label={t('subsidies.linkSection.selectAriaLabel')}
            disabled={isLinking}
          >
            <option value="">{t('subsidies.linkSection.selectPlaceholder')}</option>
            {availableSubsidies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.linkButton}
            onClick={onLinkSubsidy}
            disabled={!selectedSubsidyId || isLinking}
          >
            {isLinking ? t('subsidies.linkSection.linking') : t('subsidies.linkSection.addButton')}
          </button>
        </div>
      )}

      {children}
    </div>
  );
}
