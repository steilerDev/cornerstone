import { Fragment, useId } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { dataTableTestId } from '../DataTable/dataTableTestId.js';
import { OverflowMenu } from '../OverflowMenu/index.js';
import type { OverflowMenuEntry } from '../OverflowMenu/index.js';
import { userTextProps } from '../../lib/userText.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import type {
  ObjectListColumn,
  ObjectListExpandable,
  ObjectListFact,
  ObjectListSurface,
  ObjectListTitle,
} from './types.js';
import styles from './ObjectList.module.css';

export interface ObjectListRowProps<T, C> {
  readonly surface: ObjectListSurface;
  readonly item: T;
  readonly itemKey: string;
  readonly testIdPrefix: string;
  readonly title: ObjectListTitle;
  /** Entries language for user-entered titles. */
  readonly lang: string | null;
  /** Router state that makes the opened page offer "Back to <this list>". */
  readonly originState: unknown;
  /** Table surface only (under the title); on cards put chips in `facts`. */
  readonly renderSecondary?: (item: T) => ReactNode;
  /** Visible columns in order (table surface). */
  readonly columns: readonly ObjectListColumn<T>[];
  readonly hasStatus: boolean;
  readonly hasCommand: boolean;
  readonly hasMenu: boolean;
  readonly renderStatus?: (item: T, surface: ObjectListSurface) => ReactNode;
  readonly renderCommand?: (item: T) => ReactNode;
  readonly rowMenu?: (item: T, surface: ObjectListSurface) => readonly OverflowMenuEntry[];
  readonly facts: (item: T) => readonly [ObjectListFact, ObjectListFact, ObjectListFact];
  readonly expandable?: ObjectListExpandable<T, C>;
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
  /** null: the list has no bulk actions, so no row checkbox. */
  readonly selection: {
    readonly selected: boolean;
    readonly onChange: (checked: boolean) => void;
  } | null;
  readonly onRowFocus: (key: string) => void;
}

/**
 * One row of the list, in either surface: a table row (select, expand, title with its chips,
 * columns, status, row command, ⋯) or a two-line card (title, status, ⋯ / three facts). The
 * title is the row's one stretched link, a real anchor without `target`.
 */
export function ObjectListRow<T, C = never>(props: ObjectListRowProps<T, C>) {
  const { surface } = props;
  return surface === 'table' ? <TableRow {...props} /> : <CardRow {...props} />;
}

function RowMenu<T, C>({
  item,
  itemKey,
  title,
  surface,
  testIdPrefix,
  rowMenu,
}: Pick<
  ObjectListRowProps<T, C>,
  'item' | 'itemKey' | 'title' | 'surface' | 'testIdPrefix' | 'rowMenu'
>) {
  const { t } = useTranslation('common');
  const entries = rowMenu?.(item, surface) ?? [];
  if (entries.length === 0) return null;
  return (
    <OverflowMenu
      items={entries}
      usePortal
      triggerIcon="⋯"
      triggerAriaLabel={t('objectList.row.actionsFor', { title: title.text })}
      triggerClassName={styles.rowMenuTrigger}
      data-testid={dataTableTestId(`${testIdPrefix}-row-menu`, itemKey, surface)}
    />
  );
}

function TitleLink<T, C>({
  title,
  lang,
  originState,
  itemKey,
  testIdPrefix,
  surface,
}: Pick<
  ObjectListRowProps<T, C>,
  'title' | 'lang' | 'originState' | 'itemKey' | 'testIdPrefix' | 'surface'
>) {
  const user = title.isUserText ? userTextProps(lang, styles.titleLink) : null;
  return (
    <NavAnchor
      to={title.to}
      state={originState}
      className={user ? user.className : styles.titleLink}
      lang={user?.lang}
      data-testid={dataTableTestId(`${testIdPrefix}-title`, itemKey, surface)}
    >
      {title.text}
    </NavAnchor>
  );
}

function ExpandToggle<T, C>({
  item,
  itemKey,
  testIdPrefix,
  surface,
  expandable,
  expanded,
  onToggleExpanded,
  controls,
  childCount,
}: Pick<
  ObjectListRowProps<T, C>,
  'item' | 'itemKey' | 'testIdPrefix' | 'surface' | 'expanded' | 'onToggleExpanded'
> & {
  readonly expandable: ObjectListExpandable<T, C>;
  readonly controls: string;
  readonly childCount: number;
}) {
  return (
    <button
      type="button"
      className={styles.expandButton}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={expandable.getExpandLabel(item, expanded, childCount)}
      onClick={onToggleExpanded}
      data-testid={dataTableTestId(`${testIdPrefix}-expand`, itemKey, surface)}
    >
      <span aria-hidden="true" className={styles.caret} data-open={expanded}>
        ▸
      </span>
    </button>
  );
}

function RowCheckbox({
  selection,
  title,
  itemKey,
  testIdPrefix,
  surface,
}: Pick<
  ObjectListRowProps<unknown, unknown>,
  'selection' | 'title' | 'itemKey' | 'testIdPrefix' | 'surface'
>) {
  const { t } = useTranslation('common');
  if (!selection) return null;
  return (
    <label className={styles.rowCheckBox}>
      <input
        type="checkbox"
        className={styles.rowCheck}
        checked={selection.selected}
        onChange={(e) => selection.onChange(e.target.checked)}
        aria-label={t('objectList.selection.selectRow', { title: title.text })}
        data-testid={dataTableTestId(`${testIdPrefix}-select`, itemKey, surface)}
      />
    </label>
  );
}

function TableRow<T, C>(props: ObjectListRowProps<T, C>) {
  const {
    item,
    itemKey,
    testIdPrefix,
    renderSecondary,
    columns,
    hasStatus,
    hasCommand,
    hasMenu,
    renderStatus,
    renderCommand,
    expandable,
    expanded,
    selection,
    onRowFocus,
  } = props;
  const baseId = useId();
  const children = expandable?.getChildren(item) ?? [];
  const childIds = children.map((_, index) => `${baseId}-c${index}`);
  const visibleKeys = columns.map((column) => column.key);
  const leadingCount = (selection ? 1 : 0) + (expandable ? 1 : 0);

  return (
    <>
      <tr
        className={styles.row}
        data-selected={selection?.selected || undefined}
        onFocusCapture={() => onRowFocus(itemKey)}
        data-testid={dataTableTestId(`${testIdPrefix}-row`, itemKey, 'table')}
      >
        {selection ? (
          <td className={styles.cellCheck}>
            <RowCheckbox {...props} />
          </td>
        ) : null}
        {expandable ? (
          <td className={styles.cellExpand}>
            {children.length > 0 ? (
              <ExpandToggle
                {...props}
                expandable={expandable}
                controls={childIds.join(' ')}
                childCount={children.length}
              />
            ) : null}
          </td>
        ) : null}
        <td className={styles.cellTitle}>
          <TitleLink {...props} />
          {renderSecondary ? <div className={styles.secondary}>{renderSecondary(item)}</div> : null}
        </td>
        {columns.map((column) => (
          <td key={column.key} className={column.align === 'end' ? styles.cellEnd : styles.cell}>
            {column.render(item)}
          </td>
        ))}
        {hasStatus ? <td className={styles.cellStatus}>{renderStatus?.(item, 'table')}</td> : null}
        {hasCommand ? <td className={styles.cellCommand}>{renderCommand?.(item)}</td> : null}
        {hasMenu ? (
          <td className={styles.cellMenu}>
            <RowMenu {...props} />
          </td>
        ) : null}
      </tr>
      {expandable
        ? children.map((child, index) => (
            <tr
              key={expandable.getChildKey(child, item)}
              id={childIds[index]}
              className={styles.childRow}
              hidden={!expanded}
              data-testid={dataTableTestId(
                `${testIdPrefix}-child`,
                expandable.getChildKey(child, item),
                'table',
              )}
            >
              {Array.from({ length: leadingCount }, (_, i) => (
                <td key={i} className={styles.childLead} />
              ))}
              <td className={styles.childLead}>{expandable.renderChildTitle?.(child, item)}</td>
              {expandable.renderChildCells(child, item, visibleKeys)}
              {hasStatus ? (
                <td className={styles.childLead}>{expandable.renderChildStatus?.(child, item)}</td>
              ) : null}
              {hasCommand ? (
                <td className={styles.childLead}>{expandable.renderChildCommand?.(child, item)}</td>
              ) : null}
              {hasMenu ? <td className={styles.childLead} /> : null}
            </tr>
          ))
        : null}
    </>
  );
}

function CardRow<T, C>(props: ObjectListRowProps<T, C>) {
  const {
    item,
    itemKey,
    testIdPrefix,
    renderStatus,
    facts,
    expandable,
    expanded,
    selection,
    onRowFocus,
  } = props;
  const childrenId = useId();
  const children = expandable?.getChildren(item) ?? [];
  const entries = facts(item);

  return (
    <li
      className={styles.card}
      data-selected={selection?.selected || undefined}
      onFocusCapture={() => onRowFocus(itemKey)}
      data-testid={dataTableTestId(`${testIdPrefix}-row`, itemKey, 'card')}
    >
      <div className={styles.cardLine}>
        <RowCheckbox {...props} />
        <TitleLink {...props} />
        {renderStatus ? (
          <span className={styles.cardStatus}>{renderStatus(item, 'card')}</span>
        ) : null}
        <RowMenu {...props} />
      </div>
      <div className={`${styles.cardLine} ${styles.cardFacts}`}>
        {entries.map((fact, index) => (
          <Fragment key={fact.key}>
            {index > 0 ? (
              <span aria-hidden="true" className={styles.factSeparator}>
                ·
              </span>
            ) : null}
            <span className={styles.fact} data-keep={fact.keep || undefined}>
              {fact.content}
            </span>
          </Fragment>
        ))}
        {expandable && children.length > 0 ? (
          <ExpandToggle
            {...props}
            expandable={expandable}
            controls={childrenId}
            childCount={children.length}
          />
        ) : null}
      </div>
      {expandable && children.length > 0 ? (
        <ul id={childrenId} hidden={!expanded} className={styles.cardChildren}>
          {children.map((child) => (
            <li key={expandable.getChildKey(child, item)} className={styles.cardChild}>
              {expandable.renderChildCard(child, item)}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
