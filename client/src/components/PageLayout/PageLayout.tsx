import type { ReactNode, Ref } from 'react';
import { PageTitle } from './PageTitle.js';
import styles from './PageLayout.module.css';

interface PageLayoutCommonProps {
  /** `column` = one 880 px reading column, left aligned (Home). */
  maxWidth?: 'narrow' | 'wide' | 'column';
  children: ReactNode;
  /** Location trail and origin Back (`PageBreadcrumbs`), rendered above the header row. */
  breadcrumbs?: ReactNode;
  testId?: string;
}

/** The built-in title row: h1, optional subtitle and action. */
interface PageLayoutTitleProps extends PageLayoutCommonProps {
  title: string;
  /** A muted line under the title (Home: house name and date). */
  subtitle?: ReactNode;
  action?: ReactNode;
  /** Optional ref to the <h1>; when set the heading is programmatically focusable (tabIndex -1). */
  headingRef?: Ref<HTMLHeadingElement>;
  header?: never;
}

/** A custom header (an object page's `ObjectHeader`) replaces the built-in title row. */
interface PageLayoutHeaderProps extends PageLayoutCommonProps {
  header: ReactNode;
  title?: never;
  subtitle?: never;
  action?: never;
  headingRef?: never;
}

export type PageLayoutProps = PageLayoutTitleProps | PageLayoutHeaderProps;

/**
 * PageLayout — shared page structure for consistent headers, navigation, and content layout.
 *
 * Provides a standard container with title heading, and action button.
 * Handles responsive layout with proper spacing and alignment.
 */
export function PageLayout(props: PageLayoutProps) {
  const { maxWidth = 'wide', children, breadcrumbs, testId } = props;
  const widthClass =
    maxWidth === 'narrow'
      ? styles.containerNarrow
      : maxWidth === 'column'
        ? styles.containerColumn
        : '';
  if (props.title === undefined) {
    return (
      <div
        className={`${styles.container} ${widthClass}`}
        {...(testId ? { 'data-testid': testId } : {})}
      >
        {breadcrumbs}
        {props.header}
        <div className={styles.content}>{children}</div>
      </div>
    );
  }
  const { title, subtitle, action, headingRef } = props;
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
