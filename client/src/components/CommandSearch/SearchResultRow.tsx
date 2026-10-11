import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SearchResultType } from '@cornerstone/shared';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import type { OriginState } from '../../navigation/origin.js';
import sharedStyles from '../../styles/shared.module.css';
import { AreaBreadcrumb } from '../AreaBreadcrumb/AreaBreadcrumb.js';
import { Badge } from '../Badge/Badge.js';
import type { BadgeVariantMap } from '../Badge/Badge.js';
import { line2Parts, optionDomId } from './commandSearchModel.js';
import type { CommandOption, ModelDeps } from './commandSearchModel.js';
import { HighlightedText } from './HighlightedText.js';
import styles from './CommandSearch.module.css';

export interface SearchResultRowProps {
  readonly option: CommandOption;
  readonly listboxId: string;
  readonly active: boolean;
  /** Query highlighted in item rows (the settled query). */
  readonly itemQuery: string;
  /** Query highlighted in destination rows (what is typed now). */
  readonly liveQuery: string;
  readonly deps: ModelDeps;
  readonly originState: OriginState;
  readonly callHintId: string;
  readonly newTabHintId: string;
  readonly onActivate: (id: string) => void;
  /** A plain click on an in-app row: the host prepares focus and closes if the URL is the same. */
  readonly onChoose: (target: string) => void;
  readonly onShowMore: (type: SearchResultType) => void;
}

function useChipVariants(): Record<string, BadgeVariantMap | undefined> {
  const variants = useStatusBadgeVariants();
  return {
    work_item: variants.task,
    household_item: variants.purchase,
    invoice: variants.invoice,
  };
}

function Line2({ parts, query }: { parts: ReturnType<typeof line2Parts>; query: string }) {
  if (parts.length === 0) return null;
  return (
    <span className={styles.line2}>
      {parts.map((part, index) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- static, ordered parts of one line
        <Fragment key={index}>
          {index > 0 && (
            <span className={styles.partSeparator} aria-hidden="true">
              {' · '}
            </span>
          )}
          {part.kind === 'areaPath' ? (
            <AreaBreadcrumb variant="path" segments={part.segments} />
          ) : part.highlight ? (
            <HighlightedText text={part.text} query={query} />
          ) : (
            part.text
          )}
        </Fragment>
      ))}
    </span>
  );
}

/** One option row: a destination, a result item (with its Call sibling) or "Show n more". */
export function SearchResultRow(props: SearchResultRowProps): ReactNode {
  const { option, listboxId, active, itemQuery, liveQuery, deps, originState } = props;
  const { t } = useTranslation('common');
  const chipVariants = useChipVariants();
  const domId = optionDomId(listboxId, option);

  if (option.kind === 'destination') {
    const formerly = option.dest.viaFormerName;
    const subId = `${domId}-sub`;
    return (
      <NavAnchor
        role="option"
        id={domId}
        aria-selected={active}
        aria-label={t('commandSearch.goToItem', { name: option.title })}
        aria-describedby={formerly ? subId : undefined}
        tabIndex={-1}
        to={option.target}
        replace={option.replace}
        onNavigate={() => props.onChoose(option.target)}
        onPointerMove={() => props.onActivate(option.id)}
        className={styles.option}
        data-testid={`command-search-dest-${option.dest.route}`}
      >
        <span className={styles.arrow} aria-hidden="true">
          →
        </span>
        <span className={styles.optionMain}>
          <span className={styles.line1}>
            <HighlightedText text={option.title} query={liveQuery} />
          </span>
          {formerly && (
            <span className={styles.line2} id={subId}>
              {t('commandSearch.formerly', { name: option.dest.matched })}
            </span>
          )}
        </span>
      </NavAnchor>
    );
  }

  if (option.kind === 'more') {
    return (
      <div
        role="option"
        id={domId}
        aria-selected={active}
        className={`${styles.option} ${styles.optionMore}`}
        onClick={() => props.onShowMore(option.type)}
        onPointerMove={() => props.onActivate(option.id)}
        data-testid={`command-search-more-${option.type}`}
      >
        {t('commandSearch.showMore', { count: option.count })}
      </div>
    );
  }

  const { item, type, target } = option;
  const variants = chipVariants[type];
  const chip =
    variants && item.status !== null && item.status in variants ? (
      <Badge variants={variants} value={item.status} />
    ) : null;
  const parts = line2Parts(type, item, deps, option.disabled, !option.pending);
  const phone = type === 'vendor' ? item.phone : null;
  const external = target?.kind === 'external';
  const describedBy = phone ? props.callHintId : external ? props.newTabHintId : undefined;
  const testId = `command-search-option-${type}-${item.id}`;

  const content = (
    <>
      <span className={styles.optionMain}>
        <span className={styles.line1Row}>
          <span className={styles.line1}>
            <HighlightedText text={option.title} query={itemQuery} />
          </span>
          {chip}
          {external && (
            <svg
              className={styles.externalGlyph}
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9" />
            </svg>
          )}
        </span>
        <Line2 parts={parts} query={itemQuery} />
      </span>
    </>
  );

  let row: ReactNode;
  if (option.disabled || target === null) {
    row = (
      <div
        role="option"
        id={domId}
        aria-selected={false}
        aria-disabled="true"
        className={`${styles.option} ${styles.optionDisabled}`}
        data-testid={testId}
      >
        {content}
      </div>
    );
  } else if (target.kind === 'external') {
    row = (
      <a
        role="option"
        id={domId}
        aria-selected={active}
        aria-describedby={describedBy}
        tabIndex={-1}
        href={target.href}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.option}
        onPointerMove={() => props.onActivate(option.id)}
        data-testid={testId}
      >
        {content}
      </a>
    );
  } else {
    const href = target.href;
    row = (
      <NavAnchor
        role="option"
        id={domId}
        aria-selected={active}
        aria-describedby={describedBy}
        tabIndex={-1}
        to={href}
        state={originState}
        onNavigate={() => props.onChoose(href)}
        onPointerMove={() => props.onActivate(option.id)}
        className={styles.option}
        data-testid={testId}
      >
        {content}
      </NavAnchor>
    );
  }

  if (!phone) return row;
  return (
    <div role="presentation" className={styles.rowWrap}>
      {row}
      <a
        id={`${domId}-call`}
        href={`tel:${phone.replace(/[^\d+]/g, '')}`}
        tabIndex={-1}
        className={`${sharedStyles.btnSecondary} ${styles.call}`}
        aria-label={t('commandSearch.callAria', { name: option.title })}
        onClick={(event) => event.stopPropagation()}
        data-testid={`command-search-call-${item.id}`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 2.5h3l1 3-1.5 1a8 8 0 0 0 4 4l1-1.5 3 1v3a1.5 1.5 0 0 1-1.5 1.5A11 11 0 0 1 1.5 4 1.5 1.5 0 0 1 3 2.5z" />
        </svg>
        {t('commandSearch.call')}
      </a>
    </div>
  );
}
