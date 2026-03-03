import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type {
  HouseholdItemDetail,
  HouseholdItemStatus,
  HouseholdItemCategory,
  WorkItemStatus,
} from '@cornerstone/shared';
import { getHouseholdItem, deleteHouseholdItem } from '../../lib/householdItemsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { formatDate } from '../../lib/formatters.js';
import { HouseholdItemStatusBadge } from '../../components/HouseholdItemStatusBadge/HouseholdItemStatusBadge.js';
import { StatusBadge } from '../../components/StatusBadge/StatusBadge.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import styles from './HouseholdItemDetailPage.module.css';

const CATEGORY_LABELS: Record<HouseholdItemCategory, string> = {
  furniture: 'Furniture',
  appliances: 'Appliances',
  fixtures: 'Fixtures',
  decor: 'Decor',
  electronics: 'Electronics',
  outdoor: 'Outdoor',
  storage: 'Storage',
  other: 'Other',
};

export function HouseholdItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [item, setItem] = useState<HouseholdItemDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [is404, setIs404] = useState(false);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    void loadItem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!showDeleteModal) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeDeleteModal();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const focusableArray = Array.from(focusable);
        if (focusableArray.length === 0) return;
        const firstEl = focusableArray[0];
        const lastEl = focusableArray[focusableArray.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDeleteModal, isDeleting, deleteError]);

  const loadItem = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    setIs404(false);
    try {
      const data = await getHouseholdItem(id);
      setItem(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 404) {
          setIs404(true);
          setError('Item not found');
        } else {
          setError(err.error.message);
        }
      } else {
        setError('Failed to load household item. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const openDeleteModal = () => {
    setDeleteError('');
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    if (!isDeleting) {
      setShowDeleteModal(false);
      setDeleteError('');
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteHouseholdItem(item.id);
      showToast('success', 'Household item deleted successfully');
      navigate('/household-items');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteError(err.error.message);
      } else {
        setDeleteError('Failed to delete household item. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading} role="status">
          Loading household item...
        </div>
      </div>
    );
  }

  if (is404) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>Item Not Found</h2>
          <p>The household item you&apos;re looking for doesn&apos;t exist or has been removed.</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => navigate('/household-items')}
            >
              Back to Household Items
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>Error</h2>
          <p>{error ?? 'Household item not found.'}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => navigate('/household-items')}
            >
              Back to Household Items
            </button>
            <button type="button" className={styles.button} onClick={() => void loadItem()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <Link to="/household-items" className={styles.backLink}>
            Household Items
          </Link>
          <span className={styles.breadcrumbSeparator} aria-hidden="true">
            /
          </span>
          <span className={styles.breadcrumbCurrent}>{item.name}</span>
        </div>

        {/* Page header */}
        <div className={styles.pageHeader}>
          <div className={styles.pageHeading}>
            <h1 className={styles.pageTitle}>{item.name}</h1>
            <div className={styles.headerBadges}>
              <span className={styles.categoryBadge}>{CATEGORY_LABELS[item.category]}</span>
              <HouseholdItemStatusBadge status={item.status} />
            </div>
          </div>
          <div className={styles.pageActions}>
            <button
              type="button"
              className={styles.editButton}
              onClick={() => navigate(`/household-items/${item.id}/edit`)}
            >
              Edit
            </button>
            <button type="button" className={styles.deleteButton} onClick={openDeleteModal}>
              Delete
            </button>
          </div>
        </div>

        {/* Details card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Details</h2>
          </div>
          <dl className={styles.infoList}>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Description</dt>
              <dd className={styles.infoValue}>{item.description ?? '\u2014'}</dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Vendor</dt>
              <dd className={styles.infoValue}>
                {item.vendor ? (
                  <Link to={`/budget/vendors/${item.vendor.id}`} className={styles.infoLink}>
                    {item.vendor.name}
                  </Link>
                ) : (
                  '\u2014'
                )}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Product URL</dt>
              <dd className={styles.infoValue}>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.infoLink}
                  >
                    {item.url}
                  </a>
                ) : (
                  '\u2014'
                )}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Room</dt>
              <dd className={styles.infoValue}>{item.room ?? '\u2014'}</dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Quantity</dt>
              <dd className={styles.infoValue}>{item.quantity}</dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Tags</dt>
              <dd className={styles.infoValue}>
                {item.tags.length > 0 ? (
                  <div className={styles.tagList}>
                    {item.tags.map((tag) => (
                      <span key={tag.id} className={styles.tagPill}>
                        {tag.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className={styles.emptyState}>No tags</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {/* Dates & Delivery card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Dates & Delivery</h2>
          </div>
          <div className={styles.deliveryProgressContainer}>
            <ol className={styles.deliveryProgress} aria-label="Delivery progress">
              {(['not_ordered', 'ordered', 'in_transit', 'delivered'] as const).map(
                (stepStatus, index) => {
                  const stepLabels = {
                    not_ordered: 'Not Ordered',
                    ordered: 'Ordered',
                    in_transit: 'In Transit',
                    delivered: 'Delivered',
                  };

                  const statusOrder = {
                    not_ordered: 0,
                    ordered: 1,
                    in_transit: 2,
                    delivered: 3,
                  };

                  const currentStatusIndex = statusOrder[item.status];
                  const isActive = statusOrder[stepStatus] <= currentStatusIndex;
                  const isCurrent = stepStatus === item.status;

                  return (
                    <li
                      key={stepStatus}
                      className={styles.deliveryStepWrapper}
                      {...(isCurrent ? { 'aria-current': 'step' as const } : {})}
                    >
                      <div
                        className={`${styles.deliveryStep} ${isActive ? styles.deliveryStepActive : ''}`}
                      />
                      {index < 3 && (
                        <div
                          className={`${styles.deliveryLine} ${isActive ? styles.deliveryLineActive : ''}`}
                        />
                      )}
                      <div className={styles.deliveryStepLabel}>{stepLabels[stepStatus]}</div>
                    </li>
                  );
                },
              )}
            </ol>
          </div>
          <dl className={styles.infoList}>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Order Date</dt>
              <dd className={styles.infoValue}>
                {item.orderDate ? formatDate(item.orderDate) : '\u2014'}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Expected Delivery</dt>
              <dd className={styles.infoValue}>
                {item.expectedDeliveryDate ? formatDate(item.expectedDeliveryDate) : '\u2014'}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Actual Delivery</dt>
              <dd className={styles.infoValue}>
                {item.actualDeliveryDate ? formatDate(item.actualDeliveryDate) : '\u2014'}
              </dd>
            </div>
          </dl>
        </section>

        {/* Linked Work Items card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Linked Work Items</h2>
          </div>
          {item.workItems.length === 0 ? (
            <p className={styles.emptyState}>No work items linked to this item.</p>
          ) : (
            <ul className={styles.workItemList}>
              {item.workItems.map((workItem) => (
                <li key={workItem.id} className={styles.workItemRow}>
                  <Link to={`/work-items/${workItem.id}`} className={styles.workItemLink}>
                    {workItem.title}
                  </Link>
                  <StatusBadge status={workItem.status as WorkItemStatus} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Metadata card */}
        <section className={styles.card}>
          <div className={styles.metaRow}>
            <div className={styles.metaItem}>
              <span className={styles.infoLabel}>Created by</span>
              <span className={styles.infoValue}>{item.createdBy?.displayName ?? '\u2014'}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.infoLabel}>Created at</span>
              <span className={styles.infoValue}>{formatDate(item.createdAt)}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.infoLabel}>Updated at</span>
              <span className={styles.infoValue}>{formatDate(item.updatedAt)}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeDeleteModal} />
          <div className={styles.modalContent} ref={modalRef}>
            <h2 id="delete-modal-title" className={styles.modalTitle}>
              Delete Household Item
            </h2>
            <p className={styles.modalText}>
              Are you sure you want to delete <strong>{item.name}</strong>?
            </p>
            {deleteError ? (
              <div className={styles.errorBanner} role="alert">
                {deleteError}
              </div>
            ) : (
              <p className={styles.modalWarning}>This action cannot be undone.</p>
            )}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeDeleteModal}
                disabled={isDeleting}
              >
                Cancel
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete Item'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HouseholdItemDetailPage;
