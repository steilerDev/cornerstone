import styles from './DocumentSkeleton.module.css';

interface DocumentSkeletonProps {
  count?: number;
}

export function DocumentSkeleton({ count = 6 }: DocumentSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.skeletonCard} aria-hidden="true">
          <div className={styles.skeletonThumb} />
          <div className={styles.skeletonBody}>
            <div className={styles.skeletonTitle} />
            <div className={styles.skeletonMeta} />
            <div className={styles.skeletonTags} />
          </div>
        </div>
      ))}
    </>
  );
}
