import type { ReactNode, Ref } from 'react';
import { PageTitle } from './PageTitle.js';
import styles from './PageLayout.module.css';

export interface PageLayoutProps {
  title: string;
  /** `column` = one 880 px reading column, left aligned (Home). */
  maxWidth?: 'narrow' | 'wide' | 'column';
  /** A muted line under the title (Home: house name and date). */
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** Location trail and origin Back (`PageBreadcrumbs`), rendered above the header row. */
  breadcrumbs?: ReactNode;
  testId?: string;
  /** Optional ref to the <h1>; when set the heading is programmatically focusable (tabIndex -1). */
  headingRef?: Ref<HTMLHeadingElement>;
}

/**
 * PageLayout — shared page structure for consistent headers, navigation, and content layout.
 *
 * Provides a standard container with title heading, and action button.
 * Handles responsive layout with proper spacing and alignment.
 */
export function PageLayout({
  title,
  maxWidth = 'wide',
  subtitle,
  action,
  children,
  breadcrumbs,
  testId,
  headingRef,
}: PageLayoutProps) {
  const widthClass =
    maxWidth === 'narrow'
      ? styles.containerNarrow
      : maxWidth === 'column'
        ? styles.containerColumn
        : '';
  const titleBlock = <PageTitle title={title} headingRef={headingRef} className={styles.title} />;
  return (
    <div
      className={`${styles.container} ${widthClass}`}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      {breadcrumbs}
      <div className={subtitle ? `${styles.header} ${styles.headerWithSubtitle}` : styles.header}>
        {subtitle ? (
          <div className={styles.titleColumn}>
            {titleBlock}
            <p className={styles.subtitle}>{subtitle}</p>
          </div>
        ) : (
          titleBlock
        )}
        {action && <div className={styles.action}>{action}</div>}
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}

export default PageLayout;
