import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './RelatedList.module.css';

export interface RelatedListHeaderProps {
  /** Glossary word, e.g. "Cost lines". */
  readonly title: string;
  /** Shown as "Title (n)", "(0)" included; omitted while loading or failed. */
  readonly count?: number;
  readonly headingLevel?: 2 | 3;
  readonly headingId: string;
  readonly headingRef?: Ref<HTMLHeadingElement>;
  /** The actions (Add / Link buttons). */
  readonly children?: ReactNode;
  /** Drops the bottom margin when the host already spaces its children (a flex gap). */
  readonly flush?: boolean;
}

/** The heading with its count and the action slot; shared by RelatedList and CostLinesSection. */
export function RelatedListHeader({
  title,
  count,
  headingLevel = 2,
  headingId,
  headingRef,
  children,
  flush = false,
}: RelatedListHeaderProps) {
  const { t } = useTranslation('common');
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  return (
    <div className={flush ? `${styles.header} ${styles.headerFlush}` : styles.header}>
      <Heading id={headingId} ref={headingRef} tabIndex={-1} className={styles.title}>
        {count === undefined ? title : t('relatedList.titleWithCount', { title, count })}
      </Heading>
      {children ? <div className={styles.actions}>{children}</div> : null}
    </div>
  );
}
