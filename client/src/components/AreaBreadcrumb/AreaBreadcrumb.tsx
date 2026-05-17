import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaSummary } from '@cornerstone/shared';
import styles from './AreaBreadcrumb.module.css';

export interface AreaBreadcrumbProps {
  area: AreaSummary | null;
  variant?: 'default' | 'compact';
}

const SEPARATOR = ' \u203a ';

export function AreaBreadcrumb({ area, variant = 'default' }: AreaBreadcrumbProps): ReactNode {
  const { t } = useTranslation('areas');

  if (area === null) {
    return <span className={styles.muted}>{t('noArea')}</span>;
  }

  const segments = [...area.ancestors.map((a) => a.name), area.name];
  const fullPath = segments.join(SEPARATOR);

  if (variant === 'compact') {
    return <span className={styles.compact}>{fullPath}</span>;
  }

  const listItems: ReactNode[] = [];
  const pathPrefix: string[] = [];
  segments.forEach((name) => {
    const currentPath = [...pathPrefix, name].join('/');
    if (pathPrefix.length > 0) {
      listItems.push(
        <li key={`sep-${currentPath}`} className={styles.separator} aria-hidden="true">
          {SEPARATOR}
        </li>,
      );
    }
    listItems.push(
      <li key={`segment-${currentPath}`} className={styles.segment}>
        {name}
      </li>,
    );
    pathPrefix.push(name);
  });

  return (
    <nav aria-label={t('pathLabel')} className={styles.nav}>
      <ol className={styles.list}>{listItems}</ol>
    </nav>
  );
}
