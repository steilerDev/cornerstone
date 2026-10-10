import { use, type Ref } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { OverflowMenu, type OverflowMenuLinkItem } from '../OverflowMenu/index.js';
import { isPlainLeftClick } from '../../lib/plainClick.js';
import { navHref } from '../../navigation/navActive.js';
import { ViewMenuContext } from '../../navigation/viewMenu.js';
import styles from './PageLayout.module.css';

export interface PageTitleProps {
  readonly title: string;
  readonly className?: string;
  /** When set the h1 is programmatically focusable (tabIndex -1). */
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

/**
 * The page's single h1. Below 1024 px, on a section's main view or one of its views, the h1
 * wraps a button that opens the section's view menu ("Tasks ▾"); elsewhere it is plain text.
 */
export function PageTitle({ title, className, headingRef }: PageTitleProps) {
  const model = use(ViewMenuContext);
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();

  if (!model) {
    return (
      <h1 className={className} ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
        {title}
      </h1>
    );
  }

  const items: OverflowMenuLinkItem[] = model.entries.map((entry) => ({
    kind: 'link',
    id: entry.route,
    label: t(entry.labelKey),
    href: navHref(entry.route),
    current: entry.route === model.current,
    testId: entry.main ? `view-menu-main-${entry.route}` : `view-menu-item-${entry.route}`,
    onClick: (event) => {
      if (!isPlainLeftClick(event)) return;
      event.preventDefault();
      // A view change replaces the history entry (ADR-038 rule 8).
      navigate(navHref(entry.route), { replace: true });
    },
  }));

  return (
    <OverflowMenu
      items={items}
      triggerAriaLabel={title}
      placement="bottom-start"
      wrapperClassName={styles.titleMenu}
      closeSignal={location.key}
      data-testid="view-menu-trigger"
      menuTestId="view-menu"
      renderTrigger={(props) => (
        <h1 className={className} ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
          <button {...props} className={styles.titleTrigger}>
            <span className={styles.titleText}>{title}</span>
            <svg
              className={styles.chevron}
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <path d="M5 8l5 5 5-5" />
            </svg>
          </button>
        </h1>
      )}
    />
  );
}
