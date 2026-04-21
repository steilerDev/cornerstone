import { useTranslation } from 'react-i18next';
import type {
  DiaryEntryType,
  DiaryEntrySummary,
  DailyLogMetadata,
  SiteVisitMetadata,
  DeliveryMetadata,
  IssueMetadata,
} from '@cornerstone/shared';
import { Badge } from '../../Badge/Badge.js';
import badgeStyles from '../../Badge/Badge.module.css';
import styles from './DiaryMetadataSummary.module.css';

interface DiaryMetadataSummaryProps {
  entryType: DiaryEntryType;
  metadata: unknown;
}

const WEATHER_EMOJI: Record<string, string> = {
  sunny: '☀️',
  cloudy: '☁️',
  rainy: '🌧️',
  snowy: '❄️',
  stormy: '⛈️',
  other: '🌡️',
};

const DIARY_OUTCOME_VARIANTS = {
  pass: { label: 'Pass', className: badgeStyles.pass! },
  fail: { label: 'Fail', className: badgeStyles.fail! },
  conditional: { label: 'Conditional', className: badgeStyles.conditional! },
};

const DIARY_SEVERITY_VARIANTS = {
  low: { label: 'Low', className: badgeStyles.low! },
  medium: { label: 'Medium', className: badgeStyles.medium! },
  high: { label: 'High', className: badgeStyles.high! },
  critical: { label: 'Critical', className: badgeStyles.critical! },
};

export function DiaryMetadataSummary({ entryType, metadata }: DiaryMetadataSummaryProps) {
  const { t } = useTranslation('diary');
  if (entryType === 'daily_log' && metadata) {
    const m = metadata as DailyLogMetadata;
    return (
      <div className={styles.metadata} data-testid="daily-log-metadata">
        {m.weather && (
          <span className={styles.item}>
            {WEATHER_EMOJI[m.weather] || '🌡️'} {m.weather}
          </span>
        )}
        {m.temperatureCelsius !== undefined && m.temperatureCelsius !== null && (
          <span className={styles.item}>
            {t('metadata.temperature')} {m.temperatureCelsius}°C
          </span>
        )}
        {m.workersOnSite !== undefined && m.workersOnSite !== null && (
          <span className={styles.item}>
            {m.workersOnSite} {t('metadata.workers')}
          </span>
        )}
      </div>
    );
  }

  if (entryType === 'site_visit' && metadata) {
    const m = metadata as SiteVisitMetadata;
    return (
      <div className={styles.metadata} data-testid="site-visit-metadata">
        {m.outcome && (
          <Badge
            variants={DIARY_OUTCOME_VARIANTS}
            value={m.outcome}
            ariaLabel={`Outcome: ${DIARY_OUTCOME_VARIANTS[m.outcome]?.label}`}
            testId={`outcome-${m.outcome}`}
          />
        )}
        {m.inspectorName && <span className={styles.item}>{m.inspectorName}</span>}
      </div>
    );
  }

  if (entryType === 'delivery' && metadata) {
    const m = metadata as DeliveryMetadata;
    return (
      <div className={styles.deliveryMetadata} data-testid="delivery-metadata">
        {m.vendor && (
          <div className={styles.deliveryItem}>
            <span className={styles.deliveryLabel}>{t('entryForm.vendorLabel')}</span>
            <span className={styles.deliveryValue}>{m.vendor}</span>
          </div>
        )}
        {m.materials && m.materials.length > 0 && (
          <div className={styles.deliveryItem}>
            <span className={styles.deliveryLabel}>{t('entryForm.materialsLabel')}</span>
            <div className={styles.materialsList}>
              {m.materials.map((material, idx) => (
                <span key={idx} className={styles.materialTag}>
                  {material}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (entryType === 'issue' && metadata) {
    const m = metadata as IssueMetadata;
    return (
      <div className={styles.metadata} data-testid="issue-metadata">
        {m.severity && (
          <Badge
            variants={DIARY_SEVERITY_VARIANTS}
            value={m.severity}
            ariaLabel={`Severity: ${DIARY_SEVERITY_VARIANTS[m.severity]?.label}`}
            testId={`severity-${m.severity}`}
          />
        )}
        {m.resolutionStatus && (
          <span className={styles.item}>
            {m.resolutionStatus === 'open'
              ? t('metadata.resolutionStatusOpen')
              : m.resolutionStatus === 'in_progress'
                ? t('metadata.resolutionStatusInProgress')
                : t('metadata.resolutionStatusResolved')}
          </span>
        )}
      </div>
    );
  }

  if (
    entryType.startsWith('work_item_') ||
    entryType.startsWith('invoice_') ||
    entryType.startsWith('milestone_') ||
    entryType.startsWith('budget_') ||
    entryType.startsWith('auto_') ||
    entryType.startsWith('subsidy_')
  ) {
    // Automatic entry type
    if (metadata && typeof metadata === 'object') {
      const m = metadata as Record<string, unknown>;
      return (
        <div className={styles.autoSummary} data-testid="auto-event-summary">
          {m.changeSummary ? <span>{String(m.changeSummary)}</span> : null}
          {m.newValue ? <StatusPill value={String(m.newValue)} /> : null}
        </div>
      );
    }
  }

  return null;
}

function StatusPill({ value }: { value: string }) {
  // Determine color based on value
  let bgColor = 'var(--color-bg-tertiary)';
  let textColor = 'var(--color-text-primary)';

  if (
    value.toLowerCase().includes('completed') ||
    value.toLowerCase().includes('resolved') ||
    value.toLowerCase().includes('paid')
  ) {
    bgColor = 'var(--color-success-bg)';
    textColor = 'var(--color-success-text-on-light)';
  } else if (value.toLowerCase().includes('failed') || value.toLowerCase().includes('breach')) {
    bgColor = 'var(--color-danger-bg)';
    textColor = 'var(--color-danger-active)';
  } else if (
    value.toLowerCase().includes('in progress') ||
    value.toLowerCase().includes('in_progress')
  ) {
    bgColor = 'var(--color-bg-secondary)';
    textColor = 'var(--color-text-primary)';
  }

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.25rem 0.75rem',
        backgroundColor: bgColor,
        color: textColor,
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 'var(--font-weight-medium)',
        marginLeft: 'var(--spacing-2)',
      }}
    >
      {value}
    </span>
  );
}
