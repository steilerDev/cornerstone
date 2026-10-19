import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  DailyLogMetadata,
  DeliveryMetadata,
  DiaryEntryDetail,
  IssueMetadata,
  SiteVisitMetadata,
} from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { computeWorkDuration, useFormatters } from '../../lib/formatters.js';
import styles from './SiteDetails.module.css';

export interface SiteDetailsProps {
  entry: DiaryEntryDetail;
  /** The defect status control, shown as the Status row (issues only). */
  statusControl?: ReactNode;
}

interface DetailRow {
  key: string;
  label: string;
  value: ReactNode;
}

/** The "Site details" section of the entry page: a definition list of the fields that are set. */
export function SiteDetails({ entry, statusControl }: SiteDetailsProps) {
  const { t } = useTranslation('diary');
  const { formatClockTime, formatHours } = useFormatters();
  const variants = useStatusBadgeVariants();
  const rows: DetailRow[] = [];
  const metadata = entry.metadata ?? {};

  const addTimes = (start?: string | null, end?: string | null) => {
    if (start) {
      rows.push({ key: 'start', label: t('siteDetails.start'), value: formatClockTime(start) });
    }
    if (end) {
      rows.push({ key: 'end', label: t('siteDetails.end'), value: formatClockTime(end) });
    }
    const duration = computeWorkDuration(start, end);
    if (duration !== null) {
      rows.push({
        key: 'duration',
        label: t('siteDetails.duration'),
        value: formatHours(duration),
      });
    }
  };

  let testId = '';
  if (entry.entryType === 'daily_log') {
    testId = 'daily-log-metadata';
    const m = metadata as DailyLogMetadata;
    if (m.weather) {
      const set = I18N_UNION_KEYS.diaryWeather;
      rows.push({
        key: 'weather',
        label: t('siteDetails.weather'),
        value: t(set.key(m.weather), { ns: set.ns }),
      });
    }
    if (m.temperatureCelsius !== undefined && m.temperatureCelsius !== null) {
      rows.push({
        key: 'temperature',
        label: t('siteDetails.temperature'),
        value: t('siteDetails.temperatureValue', { value: m.temperatureCelsius }),
      });
    }
    if (
      typeof m.workersOnSite === 'number' &&
      Number.isInteger(m.workersOnSite) &&
      m.workersOnSite >= 1
    ) {
      rows.push({
        key: 'workers',
        label: t('siteDetails.workers'),
        value: t('metadata.workerCount', { count: m.workersOnSite }),
      });
    }
    if (m.vendorName) {
      rows.push({ key: 'company', label: t('siteDetails.company'), value: m.vendorName });
    }
    addTimes(m.workStart, m.workEnd);
  } else if (entry.entryType === 'site_visit') {
    testId = 'site-visit-metadata';
    const m = metadata as SiteVisitMetadata;
    if (m.inspectorName) {
      rows.push({ key: 'inspector', label: t('siteDetails.inspector'), value: m.inspectorName });
    }
    if (m.outcome) {
      rows.push({
        key: 'outcome',
        label: t('siteDetails.outcome'),
        value: (
          <Badge
            variants={variants.diaryOutcome}
            value={m.outcome}
            testId={`outcome-${m.outcome}`}
          />
        ),
      });
    }
    addTimes(m.workStart, m.workEnd);
  } else if (entry.entryType === 'delivery') {
    testId = 'delivery-metadata';
    const m = metadata as DeliveryMetadata;
    if (m.vendor) {
      rows.push({ key: 'company', label: t('siteDetails.company'), value: m.vendor });
    }
    if (m.materials && m.materials.length > 0) {
      rows.push({
        key: 'materials',
        label: t('siteDetails.materials'),
        value: (
          <ul className={styles.materials}>
            {m.materials.map((material, index) => (
              // eslint-disable-next-line @eslint-react/no-array-index-key -- materials may repeat; material+index is stable
              <li key={`${material}-${index}`}>{material}</li>
            ))}
          </ul>
        ),
      });
    }
  } else if (entry.entryType === 'issue') {
    testId = 'issue-metadata';
    const m = metadata as IssueMetadata;
    if (m.severity) {
      rows.push({
        key: 'severity',
        label: t('siteDetails.severity'),
        value: (
          <Badge
            variants={variants.diarySeverity}
            value={m.severity}
            testId={`severity-${m.severity}`}
          />
        ),
      });
    }
    if (statusControl) {
      rows.push({ key: 'status', label: t('siteDetails.status'), value: statusControl });
    }
  }

  if (rows.length === 0) return null;

  return (
    <section
      className={styles.section}
      aria-labelledby="diary-site-details-heading"
      data-testid="diary-entry-site-details"
    >
      <h2 id="diary-site-details-heading" className={styles.heading}>
        {t('entryPage.siteDetails')}
      </h2>
      <dl className={styles.list} data-testid={testId}>
        {rows.map((row) => (
          <div key={row.key} className={styles.row}>
            <dt className={styles.term}>{row.label}</dt>
            <dd className={styles.value}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
