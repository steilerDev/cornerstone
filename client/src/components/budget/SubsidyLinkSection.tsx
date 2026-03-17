import { type ReactNode } from 'react';
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
  children?: ReactNode;
}

export function SubsidyLinkSection({
  const { formatCurrency, formatDate, formatTime, formatDateTime } = useFormatters();
  linkedSubsidies,
  availableSubsidies,
  selectedSubsidyId,
  onSelectSubsidy,
  onLinkSubsidy,
  onUnlinkSubsidy,
  isLinking,
  children,
}: SubsidyLinkSectionProps) {
  return (
    <div className={styles.container}>
      {linkedSubsidies.length > 0 && (
        <div className={styles.linkedList}>
          {linkedSubsidies.map((subsidy) => (
            <div key={subsidy.id} className={styles.linkedItem}>
              <div className={styles.linkedItemInfo}>
                <span className={styles.linkedItemName}>{subsidy.name}</span>
                <span className={styles.linkedItemMeta}>
                  {subsidy.reductionType === 'percentage'
                    ? `${subsidy.reductionValue}% reduction`
                    : `${formatCurrency(subsidy.reductionValue)} reduction`}
                </span>
              </div>
              <button
                type="button"
                className={styles.unlinkButton}
                onClick={() => onUnlinkSubsidy(subsidy.id)}
                aria-label={`Unlink subsidy ${subsidy.name}`}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {linkedSubsidies.length === 0 && <div className={styles.emptyState}>No subsidies linked</div>}

      {availableSubsidies.length > 0 && (
        <div className={styles.pickerRow}>
          <select
            className={styles.pickerSelect}
            value={selectedSubsidyId}
            onChange={(e) => onSelectSubsidy(e.target.value)}
            aria-label="Select subsidy program to link"
            disabled={isLinking}
          >
            <option value="">Select subsidy program...</option>
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
            {isLinking ? 'Linking...' : 'Add Subsidy'}
          </button>
        </div>
      )}

      {children}
    </div>
  );
}
