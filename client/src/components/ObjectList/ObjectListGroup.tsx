import { useId } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { dataTableTestId } from '../DataTable/dataTableTestId.js';
import { TriStateCheckbox } from '../TriStateCheckbox/TriStateCheckbox.js';
import type { ObjectListSurface } from './types.js';
import styles from './ObjectList.module.css';

export interface ObjectListGroupSelect {
  readonly checked: boolean;
  readonly indeterminate: boolean;
  readonly onChange: (checked: boolean) => void;
}

export interface ObjectListGroupProps {
  readonly surface: ObjectListSurface;
  readonly groupKey: string;
  readonly label: string;
  /** Replaces the visible label (icon + word); the label still names the group checkbox and announcements. */
  readonly badge?: ReactNode;
  /** Rows matching the query. */
  readonly count: number;
  /** Rows loaded into the group. */
  readonly loaded: number;
  readonly open: boolean;
  readonly onToggle: () => void;
  /** null: the list has no bulk actions, so no group checkbox. */
  readonly select: ObjectListGroupSelect | null;
  /** Columns of the table (the heading cell spans them). */
  readonly columnCount: number;
  readonly testIdPrefix: string;
  /** Heading level of the group title; 3 when the list sits under a page section heading. Default 2. */
  readonly headingLevel?: 2 | 3;
  /** Extra content after the title inside the heading row (e.g. a subtotal). */
  readonly aside?: ReactNode;
  /** The group's rows (`<tr>`s on the table surface, `<li>`s on the card surface). */
  readonly children: ReactNode;
}

/**
 * A group of rows with a disclosure heading (and a group checkbox with bulk actions). The table
 * surface renders two `tbody`s (heading, body); the card surface a labelled section. The toggle
 * is never unmounted, so focus stays on it.
 */
export function ObjectListGroup({
  surface,
  groupKey,
  label,
  badge,
  count,
  loaded,
  open,
  onToggle,
  select,
  columnCount,
  testIdPrefix,
  headingLevel = 2,
  aside,
  children,
}: ObjectListGroupProps) {
  const { t } = useTranslation('common');
  const bodyId = useId();
  const headingId = useId();
  const countText =
    loaded < count
      ? t('objectList.group.countOf', { loaded, count })
      : t('objectList.group.count', { count });

  const Title = headingLevel === 3 ? 'h3' : 'h2';

  const heading = (
    <div className={styles.groupHeadInner}>
      {select ? (
        <TriStateCheckbox
          hideLabel
          label={t('objectList.selection.selectGroup', { group: label })}
          checked={select.checked}
          indeterminate={select.indeterminate}
          onChange={select.onChange}
          className={styles.groupCheck}
        />
      ) : null}
      <Title id={headingId} className={styles.groupTitle}>
        <button
          type="button"
          className={styles.groupToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          data-testid={dataTableTestId(`${testIdPrefix}-group-toggle`, groupKey, surface)}
        >
          {badge ?? <span>{label}</span>}
          <span className={styles.groupCount}>{countText}</span>
          <span aria-hidden="true" className={styles.caret} data-open={open}>
            ▸
          </span>
        </button>
      </Title>
      {aside}
    </div>
  );

  if (surface === 'table') {
    return (
      <>
        <tbody className={styles.groupHead}>
          <tr>
            <th scope="rowgroup" colSpan={columnCount} className={styles.groupHeadCell}>
              {heading}
            </th>
          </tr>
        </tbody>
        <tbody id={bodyId} hidden={!open} className={styles.groupBody}>
          {children}
        </tbody>
      </>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className={styles.cardGroup}
      data-testid={dataTableTestId(`${testIdPrefix}-group`, groupKey, 'card')}
    >
      {heading}
      <ul id={bodyId} hidden={!open} className={styles.cardList}>
        {children}
      </ul>
    </section>
  );
}
