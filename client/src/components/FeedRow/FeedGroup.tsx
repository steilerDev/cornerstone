import { useId } from 'react';
import type { ReactNode, Ref } from 'react';
import shared from '../../styles/shared.module.css';
import styles from './FeedGroup.module.css';

export interface FeedGroupCollapse {
  open: boolean;
  onToggle: () => void;
}

export interface FeedGroupProps {
  heading: string;
  /** Muted visible text after the heading (the date range of a week, the date beside "Today"). */
  headingDetail?: string;
  /** Visually hidden text after the heading (", 4 entries"). */
  srSuffix?: string;
  /** `h2` (default) or `h3` for a group nested in a section. */
  headingLevel?: 2 | 3;
  /** When given, the heading takes focus programmatically (tabIndex -1). */
  headingRef?: Ref<HTMLHeadingElement>;
  /** The heading holds a toggle button (caret) that shows or hides the body. */
  collapse?: FeedGroupCollapse;
  /** Default true: children are `<li>` rows in a `<ul>`. False: children sit in a plain `<div>`. */
  list?: boolean;
  /** Sets `aria-busy` on the section while its content loads. */
  busy?: boolean;
  children: ReactNode;
  testId: string;
}

/** A headed group of feed rows (a week of the Site diary, a day of History, a Home section). */
export function FeedGroup({
  heading,
  headingDetail,
  srSuffix,
  headingLevel = 2,
  headingRef,
  collapse,
  list = true,
  busy,
  children,
  testId,
}: FeedGroupProps) {
  const headingId = useId();
  const bodyId = useId();
  const Heading = headingLevel === 3 ? 'h3' : 'h2';

  const text = (
    <>
      {heading}
      {headingDetail ? ' ' : null}
      {headingDetail ? <span className={styles.detail}>{headingDetail}</span> : null}
      {srSuffix ? <span className={shared.srOnly}>{srSuffix}</span> : null}
    </>
  );

  const bodyProps = {
    id: collapse ? bodyId : undefined,
    hidden: collapse ? !collapse.open : undefined,
  };

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={busy ? true : undefined}
      className={styles.group}
      data-testid={testId}
    >
      <Heading
        id={headingId}
        ref={headingRef as Ref<HTMLHeadingElement> | undefined}
        tabIndex={headingRef ? -1 : undefined}
        className={headingLevel === 3 ? `${styles.heading} ${styles.headingMinor}` : styles.heading}
      >
        {collapse ? (
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={collapse.open}
            aria-controls={bodyId}
            onClick={collapse.onToggle}
            data-testid={`${testId}-toggle`}
          >
            <span>{text}</span>
            <span aria-hidden="true" className={styles.caret} data-open={collapse.open}>
              {'▸'}
            </span>
          </button>
        ) : (
          text
        )}
      </Heading>
      {list ? (
        <ul className={styles.list} {...bodyProps}>
          {children}
        </ul>
      ) : (
        <div className={styles.body} {...bodyProps}>
          {children}
        </div>
      )}
    </section>
  );
}
