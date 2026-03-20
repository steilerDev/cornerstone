import { useTranslation } from 'react-i18next';
import styles from './DataTable.module.css';

interface DataTablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function DataTablePagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: DataTablePaginationProps) {
  const { t } = useTranslation('common');

  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className={styles.pagination}>
      <div className={styles.paginationInfo}>
        {t('dataTable.pagination.showing', { from, to, total: totalItems })}
      </div>
      <div className={styles.paginationControls}>
        <button
          type="button"
          className={styles.paginationButton}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label={t('dataTable.pagination.previousAriaLabel')}
        >
          {t('dataTable.pagination.previous')}
        </button>
        <div className={styles.paginationPages}>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (currentPage <= 3) {
              pageNum = i + 1;
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = currentPage - 2 + i;
            }
            return (
              <button
                key={pageNum}
                type="button"
                className={`${styles.paginationButton} ${
                  currentPage === pageNum ? styles.paginationButtonActive : ''
                }`}
                onClick={() => onPageChange(pageNum)}
              >
                {pageNum}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className={styles.paginationButton}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label={t('dataTable.pagination.nextAriaLabel')}
        >
          {t('dataTable.pagination.next')}
        </button>
      </div>
    </div>
  );
}

export default DataTablePagination;
