import type { ReactNode, Ref } from 'react';
import styles from './PageLayout.module.css';

export interface PageLayoutProps {
  title: string;
  maxWidth?: 'narrow' | 'wide';
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
  action,
  children,
  breadcrumbs,
  testId,
  headingRef,
}: PageLayoutProps) {
  return (
    <div
      className={`${styles.container} ${maxWidth === 'narrow' ? styles.containerNarrow : ''}`}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      {breadcrumbs}
      <div className={styles.header}>
        {headingRef ? (
          <h1 className={styles.title} ref={headingRef} tabIndex={-1}>
            {title}
          </h1>
        ) : (
          <h1 className={styles.title}>{title}</h1>
        )}
        {action && <div className={styles.action}>{action}</div>}
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}

export default PageLayout;
