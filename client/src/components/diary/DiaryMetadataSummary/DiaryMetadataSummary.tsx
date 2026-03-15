import type {
  DiaryEntryType,
  DiaryEntrySummary,
  DailyLogMetadata,
  SiteVisitMetadata,
  DeliveryMetadata,
  IssueMetadata,
} from '@cornerstone/shared';
import { DiaryOutcomeBadge } from '../DiaryOutcomeBadge/DiaryOutcomeBadge.js';
import { DiarySeverityBadge } from '../DiarySeverityBadge/DiarySeverityBadge.js';
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

export function DiaryMetadataSummary({ entryType, metadata }: DiaryMetadataSummaryProps) {
  if (entryType === 'daily_log' && metadata) {
    const m = metadata as DailyLogMetadata;
    return (
      <div className={styles.metadata} data-testid="daily-log-metadata">
        {m.weather && (
          <span className={styles.item}>
            {WEATHER_EMOJI[m.weather] || '🌡️'} {m.weather}
          </span>
        )}
        {m.workersOnSite !== undefined && m.workersOnSite !== null && (
          <span className={styles.item}>{m.workersOnSite} workers</span>
        )}
      </div>
    );
  }

  if (entryType === 'site_visit' && metadata) {
    const m = metadata as SiteVisitMetadata;
    return (
      <div className={styles.metadata} data-testid="site-visit-metadata">
        {m.outcome && <DiaryOutcomeBadge outcome={m.outcome} />}
        {m.inspectorName && <span className={styles.item}>{m.inspectorName}</span>}
      </div>
    );
  }

  if (entryType === 'delivery' && metadata) {
    const m = metadata as DeliveryMetadata;
    return (
      <div className={styles.metadata} data-testid="delivery-metadata">
        {m.materials && m.materials.length > 0 && (
          <span className={styles.item}>{m.materials.length} materials</span>
        )}
        {m.deliveryConfirmed !== undefined && (
          <span className={`${styles.item} ${m.deliveryConfirmed ? styles.confirmed : ''}`}>
            {m.deliveryConfirmed ? '✓ Confirmed' : '⏳ Pending'}
          </span>
        )}
      </div>
    );
  }

  if (entryType === 'issue' && metadata) {
    const m = metadata as IssueMetadata;
    return (
      <div className={styles.metadata} data-testid="issue-metadata">
        {m.severity && <DiarySeverityBadge severity={m.severity} />}
        {m.resolutionStatus && (
          <span className={styles.item}>
            {m.resolutionStatus === 'open'
              ? '🔴 Open'
              : m.resolutionStatus === 'in_progress'
                ? '🟡 In Progress'
                : '✅ Resolved'}
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
          {m.changeSummary && <span>{String(m.changeSummary)}</span>}
          {m.newValue && (
            <StatusPill value={String(m.newValue) as string} />
          )}
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

  if (value.toLowerCase().includes('completed') || value.toLowerCase().includes('resolved') || value.toLowerCase().includes('paid')) {
    bgColor = 'var(--color-success-bg)';
    textColor = 'var(--color-success-text-on-light)';
  } else if (value.toLowerCase().includes('failed') || value.toLowerCase().includes('breach')) {
    bgColor = 'var(--color-danger-bg)';
    textColor = 'var(--color-danger-active)';
  } else if (value.toLowerCase().includes('in progress') || value.toLowerCase().includes('in_progress')) {
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
