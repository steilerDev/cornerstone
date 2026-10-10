import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  DiaryEntryType,
  DiaryWeather,
  DiaryInspectionOutcome,
  DiaryIssueSeverity,
  DailyLogMetadata,
  SiteVisitMetadata,
  DeliveryMetadata,
  IssueMetadata,
} from '@cornerstone/shared';
import { Badge, type BadgeVariant } from '../../Badge/Badge.js';
import badgeStyles from '../../Badge/Badge.module.css';
import { computeWorkDuration, useFormatters } from '../../../lib/formatters.js';
import { useStatusBadgeVariants } from '../../../hooks/useStatusBadgeVariants.js';
import styles from './DiaryMetadataSummary.module.css';

interface DiaryMetadataSummaryProps {
  entryType: DiaryEntryType;
  metadata: unknown;
  /** Hide the defect resolution chip (the detail page shows it as a status menu instead). */
  hideResolution?: boolean;
}

const WEATHER_EMOJI: Record<string, string> = {
  sunny: '☀️',
  cloudy: '☁️',
  rainy: '🌧️',
  snowy: '❄️',
  stormy: '⛈️',
  other: '🌡️',
};

export function DiaryMetadataSummary({
  entryType,
  metadata,
  hideResolution = false,
}: DiaryMetadataSummaryProps) {
  const { t } = useTranslation('diary');
  const statusVariants = useStatusBadgeVariants();
  const { formatHours } = useFormatters();
  const outcomeVariants = useMemo<Record<DiaryInspectionOutcome, BadgeVariant>>(
    () => ({
      pass: { label: t('outcomeBadge.pass'), className: badgeStyles.pass! },
      fail: { label: t('outcomeBadge.fail'), className: badgeStyles.fail! },
      conditional: { label: t('outcomeBadge.conditional'), className: badgeStyles.conditional! },
    }),
    [t],
  );
  const severityVariants = useMemo<Record<DiaryIssueSeverity, BadgeVariant>>(
    () => ({
      low: { label: t('severityBadge.low'), className: badgeStyles.low! },
      medium: { label: t('severityBadge.medium'), className: badgeStyles.medium! },
      high: { label: t('severityBadge.high'), className: badgeStyles.high! },
      critical: { label: t('severityBadge.critical'), className: badgeStyles.critical! },
    }),
    [t],
  );
  const weatherLabels = useMemo<Record<DiaryWeather, string>>(
    () => ({
      sunny: t('form.weatherOptions.sunny'),
      cloudy: t('form.weatherOptions.cloudy'),
      rainy: t('form.weatherOptions.rainy'),
      snowy: t('form.weatherOptions.snowy'),
      stormy: t('form.weatherOptions.stormy'),
      other: t('form.weatherOptions.other'),
    }),
    [t],
  );
  if (entryType === 'daily_log' && metadata) {
    const m = metadata as DailyLogMetadata;
    const workDuration = computeWorkDuration(m.workStart, m.workEnd);
    return (
      <div className={styles.metadata} data-testid="daily-log-metadata">
        {m.weather && (
          <span className={styles.item}>
            {WEATHER_EMOJI[m.weather] || '🌡️'} {weatherLabels[m.weather] ?? m.weather}
          </span>
        )}
        {m.temperatureCelsius !== undefined && m.temperatureCelsius !== null && (
          <span className={styles.item}>
            {t('metadata.temperature')} {m.temperatureCelsius}°C
          </span>
        )}
        {m.workersOnSite !== undefined && m.workersOnSite !== null && (
          <span className={styles.item}>
            {t('metadata.workerCount', { count: m.workersOnSite })}
          </span>
        )}
        {m.vendorName && (
          <span className={styles.item}>
            {t('metadata.vendor')} {m.vendorName}
          </span>
        )}
        {m.workStart && (
          <span className={styles.item}>
            {t('metadata.workStart')} {m.workStart}
          </span>
        )}
        {m.workEnd && (
          <span className={styles.item}>
            {t('metadata.workEnd')} {m.workEnd}
          </span>
        )}
        {workDuration !== null && <span className={styles.item}>{formatHours(workDuration)}</span>}
      </div>
    );
  }

  if (entryType === 'site_visit' && metadata) {
    const m = metadata as SiteVisitMetadata;
    return (
      <div className={styles.metadata} data-testid="site-visit-metadata">
        {m.outcome && (
          <Badge
            variants={outcomeVariants}
            value={m.outcome}
            ariaLabel={t('metadata.outcomeAriaLabel', {
              label: outcomeVariants[m.outcome]?.label ?? m.outcome,
            })}
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
                // eslint-disable-next-line @eslint-react/no-array-index-key -- materials list may have duplicates; composite key with material+index is stable
                <span key={`${material}-${idx}`} className={styles.materialTag}>
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
            variants={severityVariants}
            value={m.severity}
            ariaLabel={t('metadata.severityAriaLabel', {
              label: severityVariants[m.severity]?.label ?? m.severity,
            })}
            testId={`severity-${m.severity}`}
          />
        )}
        {m.resolutionStatus && !hideResolution && (
          <Badge
            variants={statusVariants.defect}
            value={m.resolutionStatus}
            testId="defect-status-badge"
          />
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
