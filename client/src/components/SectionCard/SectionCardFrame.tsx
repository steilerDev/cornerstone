import type { ReactNode } from 'react';
import styles from './SectionCard.module.css';

export interface SectionCardFrameProps {
  /** Heading id is `${id}-title`; the test id is `section-${id}` unless `testId` is set. */
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
  /** After the heading, e.g. SectionCard's Edit button. */
  readonly headerAction?: ReactNode;
  /** Adds the editing look of the card. */
  readonly editing?: boolean;
  /** Sets aria-busy on the card. */
  readonly loading?: boolean;
  readonly testId?: string;
}

/**
 * The read-only frame of a SectionCard: the labelled section with its h2 and optional header
 * action. SectionCard renders through it; pages whose cards are never edited use it directly.
 */
export function SectionCardFrame({
  id,
  title,
  children,
  headerAction,
  editing = false,
  loading = false,
  testId,
}: SectionCardFrameProps) {
  const titleId = `${id}-title`;
  return (
    <section
      className={editing ? `${styles.card} ${styles.cardEditing}` : styles.card}
      aria-labelledby={titleId}
      aria-busy={loading ? 'true' : undefined}
      data-testid={testId ?? `section-${id}`}
    >
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {headerAction}
      </div>
      {children}
    </section>
  );
}
