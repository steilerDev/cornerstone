import type { ReactNode } from 'react';
import styles from './PageLayout.module.css';

export interface PageLayoutProps {
  title: string;
  maxWidth?: 'narrow' | 'wide';
  action?: ReactNode;
  subNav?: ReactNode;
  children: ReactNode;
  testId?: string;
}

/**
 * PageLayout — shared page structure for consistent headers, navigation, and content layout.
 *
 * Provides a standard container with optional sub-navigation tabs, title heading, and action button.
 * Handles responsive layout with proper spacing and alignment.
 */
export function PageLayout({
  title,
  maxWidth = 'narrow',
  action,
  subNav,
  children,
  testId,
}: PageLayoutProps) {
  return (
    <div
      className={`${styles.container} ${maxWidth === 'wide' ? styles.containerWide : ''}`}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      <div className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {action && <div className={styles.action}>{action}</div>}
      </div>
      {subNav && <div className={styles.subNav}>{subNav}</div>}
      <div className={styles.content}>{children}</div>
    </div>
  );
}

export default PageLayout;
