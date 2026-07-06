import { useTranslation } from 'react-i18next';
import { Skeleton } from '../Skeleton/Skeleton.js';
import { Spinner } from '../Spinner/Spinner.js';
import styles from './AutoItemizeLineList.module.css';

export interface MergingLineCardProps {
  /** Caption text, e.g., "Merging 3 items…" */
  caption: string;
}

export function MergingLineCard({ caption }: MergingLineCardProps) {
  const { t } = useTranslation('budget');
  const mergingLabel = t('autoItemize.mergingLabel');

  return (
    <li className={`${styles.lineCard} ${styles.lineCardMerging}`} aria-busy="true">
      <Skeleton lines={2} widths={['70%', '40%']} loadingLabel={mergingLabel} />
      <div className={styles.mergingOverlay}>
        <Spinner size="md" label={mergingLabel} />
        <span className={styles.mergingCaption} aria-hidden="true">
          {caption}
        </span>
      </div>
    </li>
  );
}
