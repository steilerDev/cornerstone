import { useId, type ReactNode, type Ref } from 'react';
import styles from './FileList.module.css';

export interface FileListItem {
  id: string;
  name: string;
  /** Secondary line (e.g. "Part 1 of 3 · 2.1 MB · 4 attachments"). */
  meta: string;
  /** Status badges rendered under the meta line. */
  badges?: ReactNode;
  /** Optional extra line (e.g. a failure reason). */
  detail?: string | null;
  actionLabel: string;
  actionAriaLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
}

export interface FileListProps {
  heading: string;
  summary: string;
  items: readonly FileListItem[];
  headingRef?: Ref<HTMLHeadingElement>;
  testIdPrefix?: string;
  /** Rendered between the summary and the list (e.g. a stale-state notice). */
  children?: ReactNode;
}

/** A list of generated files, each with its own action. All strings come from props. */
export function FileList({
  heading,
  summary,
  items,
  headingRef,
  testIdPrefix = 'file-list',
  children,
}: FileListProps) {
  const headingId = useId();
  const summaryId = useId();

  return (
    <section aria-labelledby={headingId} className={styles.fileList} data-testid={testIdPrefix}>
      <h3 id={headingId} ref={headingRef} tabIndex={-1} className={styles.heading}>
        {heading}
      </h3>
      <p id={summaryId} className={styles.summary}>
        {summary}
      </p>
      {children}
      <ul className={styles.list} aria-describedby={summaryId}>
        {items.map((item) => (
          <li key={item.id} className={styles.row} data-testid={`${testIdPrefix}-row-${item.id}`}>
            <div className={styles.info}>
              <span className={styles.name}>{item.name}</span>
              <span className={styles.meta}>{item.meta}</span>
              {item.badges && <span className={styles.badges}>{item.badges}</span>}
              {item.detail && <span className={styles.detail}>{item.detail}</span>}
            </div>
            <button
              type="button"
              className={styles.action}
              aria-label={item.actionAriaLabel}
              onClick={item.onAction}
              disabled={item.actionDisabled}
              data-testid={`${testIdPrefix}-action-${item.id}`}
            >
              {item.actionLabel}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
