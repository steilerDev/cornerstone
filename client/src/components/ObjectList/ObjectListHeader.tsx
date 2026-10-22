import { useEffect, useRef } from 'react';
import type { ReactNode, Ref, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { OverflowMenu } from '../OverflowMenu/index.js';
import type { OverflowMenuEntry } from '../OverflowMenu/index.js';
import { PageTitle } from '../PageLayout/PageTitle.js';
import styles from './ObjectListHeader.module.css';

export interface ObjectListHeaderProps {
  readonly title: string;
  /** The "(n)" or "(n of m)" node; null while the count is unknown. */
  readonly count: ReactNode | null;
  readonly primary: {
    readonly label: string;
    readonly onClick: () => void;
    readonly testId?: string;
  };
  /** List-specific ⋯ entries; Columns… and Print are appended. */
  readonly menuItems?: readonly OverflowMenuEntry[];
  /** Present while the table surface shows: adds ⋯ › Columns…. */
  readonly onColumns?: () => void;
  readonly headingRef?: Ref<HTMLHeadingElement>;
  readonly menuTriggerRef?: RefObject<HTMLButtonElement | null>;
  readonly testIdPrefix: string;
}

/**
 * The list header: h1 with the count, the one primary ("New ‹object›") and the page ⋯ menu
 * (list-specific entries, Columns…, Print). Use it as the `header` of `PageLayout`.
 */
export function ObjectListHeader({
  title,
  count,
  primary,
  menuItems = [],
  onColumns,
  headingRef,
  menuTriggerRef,
  testIdPrefix,
}: ObjectListHeaderProps) {
  const { t } = useTranslation('common');
  const printFrameRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (printFrameRef.current !== null) cancelAnimationFrame(printFrameRef.current);
    },
    [],
  );

  // The menu has closed by the next frame, so it is not part of the printout.
  const print = () => {
    printFrameRef.current = requestAnimationFrame(() => {
      printFrameRef.current = null;
      window.print();
    });
  };

  const items: OverflowMenuEntry[] = [
    ...menuItems,
    ...(onColumns
      ? [
          {
            id: 'columns',
            label: t('objectList.columns.menuItem'),
            onClick: onColumns,
            testId: `${testIdPrefix}-columns`,
          },
        ]
      : []),
    {
      id: 'print',
      label: t('objectHeader.print'),
      onClick: print,
      testId: `${testIdPrefix}-print`,
    },
  ];

  return (
    <header className={styles.row}>
      <PageTitle
        title={title}
        headingRef={headingRef}
        className={styles.title}
        suffix={count ? <span className={styles.count}>{count}</span> : undefined}
      />
      <button
        type="button"
        className={styles.primary}
        onClick={primary.onClick}
        data-testid={primary.testId ?? `${testIdPrefix}-new`}
      >
        {primary.label}
      </button>
      <div className={styles.menu}>
        <OverflowMenu
          items={items}
          triggerIcon="⋯"
          triggerAriaLabel={t('objectHeader.pageActions')}
          triggerRef={menuTriggerRef}
          data-testid={`${testIdPrefix}-page-menu`}
        />
      </div>
    </header>
  );
}
