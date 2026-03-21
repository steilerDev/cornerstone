import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './DataTable.module.css';

export interface DataTablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Pagination controls
 * Desktop: full page list + page size selector
 * Mobile: simplified Prev/Next + "Page N of M"
 */
export function DataTablePagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: DataTablePaginationProps) {
  const { t } = useTranslation('common');

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (currentPage <= 3) {
      return Array.from({ length: 5 }, (_, i) => i + 1);
    }

    if (currentPage >= totalPages - 2) {
      return Array.from({ length: 5 }, (_, i) => totalPages - 4 + i);
    }

    return Array.from({ length: 5 }, (_, i) => currentPage - 2 + i);
  }, [currentPage, totalPages]);

  const showingFrom = (currentPage - 1) * pageSize + 1;
  const showingTo = Math.min(currentPage * pageSize, totalItems);

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className={styles.pagination}>
      <div className={styles.paginationInfo}>
        {t('dataTable.pagination.showing', {
          from: showingFrom,
          to: showingTo,
          total: totalItems,
        })}
      </div>

      <div className={styles.paginationControls}>
        <button
          type="button"
          className={styles.paginationButton}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label={t('dataTable.pagination.previous')}
        >
          {t('dataTable.pagination.previous')}
        </button>

        <div className={styles.paginationPages}>
          {pageNumbers.map((pageNum) => (
            <button
              key={pageNum}
              type="button"
              className={`${styles.paginationButton} ${
                currentPage === pageNum ? styles.paginationButtonActive : ''
              }`}
              onClick={() => onPageChange(pageNum)}
              aria-current={currentPage === pageNum ? 'page' : undefined}
            >
              {pageNum}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={styles.paginationButton}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label={t('dataTable.pagination.next')}
        >
          {t('dataTable.pagination.next')}
        </button>
      </div>

      {onPageSizeChange && (
        <div className={styles.paginationPageSize}>
          <label htmlFor="page-size-select" className={styles.pageSizeLabel}>
            {t('dataTable.pagination.pageSize')}
          </label>
          <select
            id="page-size-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
            className={styles.pageSizeSelect}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
