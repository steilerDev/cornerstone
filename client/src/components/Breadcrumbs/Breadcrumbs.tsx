import type { ReactNode } from 'react';
import { useHref, useLinkClickHandler } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './Breadcrumbs.module.css';

export interface BreadcrumbLink {
  readonly label: string;
  /** In-app URL (pathname, search, hash). Named `href`, not `to`: the row renders plain anchors. */
  readonly href: string;
  /** Object name: ellipsis-truncated. */
  readonly dynamic?: boolean;
}

export interface BreadcrumbsProps {
  /** Ancestors of the current page, root first. Never includes the current page. */
  readonly parents: readonly BreadcrumbLink[];
  /** Where the user came from; label is the origin's name/label, not "Back to ...". */
  readonly origin?: BreadcrumbLink | null;
  /** An object ancestor is still loading: keep the row height. */
  readonly pending?: boolean;
  readonly testId?: string;
  /** 'bar' lays the row out on one line inside the top bar. */
  readonly layout?: 'page' | 'bar';
}

/** Real anchor (middle-click works) that navigates in-app on a plain click. */
function CrumbLink({
  href,
  className,
  testId,
  children,
}: {
  href: string;
  className: string | undefined;
  testId?: string;
  children: ReactNode;
}) {
  const resolvedHref = useHref(href);
  const handleClick = useLinkClickHandler<HTMLAnchorElement>(href);
  return (
    <a
      href={resolvedHref}
      onClick={handleClick}
      className={className}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      {children}
    </a>
  );
}

/**
 * Breadcrumbs — "Back to <origin>" link plus a "You are here" trail of parents only.
 * Renders nothing when there is nothing to show.
 */
export function Breadcrumbs({
  parents,
  origin = null,
  pending = false,
  testId = 'breadcrumbs',
  layout = 'page',
}: BreadcrumbsProps) {
  const { t } = useTranslation('common');
  if (parents.length === 0 && !origin && !pending) return null;

  return (
    <div
      className={[styles.row, layout === 'bar' && styles.rowBar].filter(Boolean).join(' ')}
      data-has-back={origin ? 'true' : undefined}
      data-testid={testId}
    >
      {origin && (
        <CrumbLink href={origin.href} className={styles.back} testId={`${testId}-back`}>
          <span aria-hidden="true" className={styles.backGlyph}>
            ‹
          </span>
          <span className={styles.label}>{t('navigation.backTo', { origin: origin.label })}</span>
        </CrumbLink>
      )}
      {parents.length > 0 && (
        <nav aria-label={t('navigation.youAreHere')} className={styles.trail}>
          <ol className={styles.list}>
            {parents.map((p, index) => (
              <li key={p.href} className={styles.item}>
                <CrumbLink href={p.href} className={p.dynamic ? styles.linkDynamic : styles.link}>
                  <span aria-hidden="true" className={styles.phoneGlyph}>
                    ‹
                  </span>
                  <span className={styles.label}>{p.label}</span>
                </CrumbLink>
                {index < parents.length - 1 && (
                  <span aria-hidden="true" className={styles.separator}>
                    ›
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
    </div>
  );
}

export default Breadcrumbs;
