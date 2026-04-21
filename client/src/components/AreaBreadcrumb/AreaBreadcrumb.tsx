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
  segments.forEach((name, index) => {
    if (index > 0) {
      listItems.push(
        <li key={`sep-${index}`} className={styles.separator} aria-hidden="true">
          {SEPARATOR}
        </li>,
      );
    }
    listItems.push(
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
