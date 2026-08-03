import type { TFunction } from 'i18next';
import type { BudgetSource, SourceReportType } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { getSourceBadgeStyleKey } from '../../lib/budgetSourceColors.js';
import { useFormatters } from '../../lib/formatters.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import styles from './ReportWizardPage.module.css';

interface Step2SourceProps {
  sources: BudgetSource[];
  amounts: Map<string, number>;
  isLoading: boolean;
  value: string | null;
  useCase: SourceReportType;
  onChange: (sourceId: string) => void;
  t: TFunction;
}

const AMOUNT_LABELS: Record<SourceReportType, string> = {
  'budget-overview': 'sourceReports.amountLabel.overview',
  claim: 'sourceReports.amountLabel.claim',
  'proof-of-funds': 'sourceReports.amountLabel.proofOfFunds',
};

export function Step2Source({
  sources,
  amounts,
  isLoading,
  value,
  useCase,
  onChange,
  t,
}: Step2SourceProps) {
  const { formatCurrency } = useFormatters();

  if (isLoading) {
    return <Skeleton lines={5} />;
  }

  const sortedSources = [...sources].sort((a, b) => {
    const aIsDisc = a.sourceType === 'discretionary' ? 1 : 0;
    const bIsDisc = b.sourceType === 'discretionary' ? 1 : 0;
    return aIsDisc - bIsDisc;
  });

  return (
    <div
      className={styles.sourceList}
      role="radiogroup"
      aria-label={t('sourceReports.sourceLabel')}
    >
      {sortedSources.map((source) => {
        const isDiscretionary = source.sourceType === 'discretionary';
        const amount = amounts.get(source.id) || 0;
        const isSelected = value === source.id;

        return (
          <label
            key={source.id}
            className={`${styles.sourceRow} ${isDiscretionary ? styles.sourceRowDisc : ''}`}
          >
            <input
              type="radio"
              name="source"
              value={source.id}
              checked={isSelected}
              onChange={(e) => onChange(e.target.value)}
              className={styles.sourceRadio}
            />

            <Badge
              variants={{
                [getSourceBadgeStyleKey(source.id)]: {
                  label: source.name,
                  className: badgeStyles[getSourceBadgeStyleKey(source.id)],
                },
              }}
              value={getSourceBadgeStyleKey(source.id)}
            />

            <span className={styles.sourceName}>{source.name}</span>

            {isDiscretionary && (
              <Badge
                variants={{
                  discretionary: {
                    label: t('sourceReports.discretionary'),
                    className: badgeStyles.info,
                  },
                }}
                value="discretionary"
              />
            )}

            <div className={styles.sourceAmount}>
              <div className={styles.amount}>{formatCurrency(amount)}</div>
              <div className={styles.amountLabel}>{t(AMOUNT_LABELS[useCase])}</div>
            </div>
          </label>
        );
      })}
    </div>
  );
}
