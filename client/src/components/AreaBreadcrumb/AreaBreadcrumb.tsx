import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaSummary } from '@cornerstone/shared';
import styles from './AreaBreadcrumb.module.css';

export interface AreaBreadcrumbSegment {
  readonly id: string;
  readonly name: string;
}

/**
 * `default` (nav + list) and `compact` (one truncated line) take an area; `path` renders a plain
 * phrasing-content path from a root-first segment list (inside a search result option: no nav,
 * no list), wraps, and never truncates the last level.
 */
export type AreaBreadcrumbProps =
  | { area: AreaSummary | null; variant?: 'default' | 'compact' }
  | { variant: 'path'; segments: readonly AreaBreadcrumbSegment[] };

const SEPARATOR = ' \u203a ';

export function AreaBreadcrumb(props: AreaBreadcrumbProps): ReactNode {
  const { t } = useTranslation('areas');

  if (props.variant === 'path') {
    const { segments } = props;
    if (segments.length === 0) return null;
    return (
      <span className={styles.path}>
        {segments.map((segment, index) => (
          <span key={segment.id}>
            {index > 0 && (
              <span className={styles.pathSeparator} aria-hidden="true">
                {SEPARATOR}
              </span>
            )}
            <span className={index === segments.length - 1 ? styles.pathLast : styles.pathSegment}>
              {segment.name}
            </span>
          </span>
        ))}
      </span>
    );
  }

  const { area, variant = 'default' } = props;

  if (area === null) {
    return <span className={styles.muted}>{t('noArea')}</span>;
  }

  const segments = [...area.ancestors.map((a) => a.name), area.name];
  const fullPath = segments.join(SEPARATOR);

  if (variant === 'compact') {
    return <span className={styles.compact}>{fullPath}</span>;
  }

  const listItems: ReactNode[] = [];
  segments.forEach((name, index) => {
    if (index > 0) {
      listItems.push(
        // eslint-disable-next-line @eslint-react/no-array-index-key -- static fixed-order breadcrumb segments; index is a stable key here
        <li key={`sep-${index}`} className={styles.separator} aria-hidden="true">
          {SEPARATOR}
        </li>,
      );
    }
    listItems.push(
      // eslint-disable-next-line @eslint-react/no-array-index-key -- static fixed-order breadcrumb segments; index is a stable key here
      <li key={`seg-${index}`} className={styles.segment}>
        {name}
      </li>,
    );
  });

  return (
    <nav aria-label={t('pathLabel')} className={styles.nav}>
      <ol className={styles.list}>{listItems}</ol>
    </nav>
  );
}
