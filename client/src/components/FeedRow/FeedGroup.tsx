import { useId } from 'react';
import type { ReactNode } from 'react';
import shared from '../../styles/shared.module.css';
import styles from './FeedGroup.module.css';

export interface FeedGroupProps {
  heading: string;
  /** Muted visible text after the heading (the date range of a week, the date beside "Today"). */
  headingDetail?: string;
  /** Visually hidden text after the heading (", 4 entries"). */
  srSuffix?: string;
  /** `<li>` rows. */
  children: ReactNode;
  testId: string;
}

/** A headed group of feed rows (a week of the Site diary, a day of History). */
export function FeedGroup({ heading, headingDetail, srSuffix, children, testId }: FeedGroupProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.group} data-testid={testId}>
      <h2 id={headingId} className={styles.heading}>
        {heading}
        {headingDetail ? ' ' : null}
        {headingDetail ? <span className={styles.detail}>{headingDetail}</span> : null}
        {srSuffix ? <span className={shared.srOnly}>{srSuffix}</span> : null}
      </h2>
      <ul className={styles.list}>{children}</ul>
    </section>
  );
}
