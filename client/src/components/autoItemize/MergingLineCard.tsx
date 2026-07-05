import { Skeleton } from '../Skeleton/Skeleton.js';
import { Spinner } from '../Spinner/Spinner.js';
import styles from './AutoItemizeLineList.module.css';

export interface MergingLineCardProps {
  /** Caption text, e.g., "Merging 3 items…" */
  caption: string;
}

export function MergingLineCard({ caption }: MergingLineCardProps) {
  return (
    <li className={`${styles.lineCard} ${styles.lineCardMerging}`} aria-busy="true">
      <Skeleton lines={2} widths={['70%', '40%']} />
      <div className={styles.mergingOverlay}>
        <Spinner size="md" />
        <span className={styles.mergingCaption} aria-hidden="true">
          {caption}
        </span>
      </div>
    </li>
  );
}
