import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { VendorDetail, UpdateVendorRequest } from '@cornerstone/shared';
import { fetchVendor, updateVendor, deleteVendor } from '../../lib/vendorsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import styles from './VendorDetailPage.module.css';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<UpdateVendorRequest>({});
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState<string>('');

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');

  useEffect(() => {
    if (!id) return;
    void loadVendor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadVendor = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchVendor(id);
      setVendor(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 404) {
          setError('Vendor not found. It may have been deleted.');
        } else {
          setError(err.error.message);
        }
      } else {
        setError('Failed to load vendor. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const startEdit = () => {
    if (!vendor) return;
    setEditForm({
      name: vendor.name,
      specialty: vendor.specialty ?? '',
      phone: vendor.phone ?? '',
      email: vendor.email ?? '',
      address: vendor.address ?? '',
      notes: vendor.notes ?? '',
    });
    setEditError('');
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditError('');
  };

  const handleUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!vendor || !id) return;

    const trimmedName = (editForm.name ?? '').trim();
    if (!trimmedName) {
      setEditError('Vendor name is required.');
      return;
    }
    if (trimmedName.length > 200) {
      setEditError('Vendor name must be 200 characters or less.');
      return;
    }

    setIsUpdating(true);
    setEditError('');

    try {
      const updated = await updateVendor(id, {
        name: trimmedName,
        specialty: (editForm.specialty as string)?.trim() || null,
        phone: (editForm.phone as string)?.trim() || null,
        email: (editForm.email as string)?.trim() || null,
        address: (editForm.address as string)?.trim() || null,
        notes: (editForm.notes as string)?.trim() || null,
      });
      setVendor(updated);
      setIsEditing(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setEditError(err.error.message);
      } else {
        setEditError('Failed to update vendor. Please try again.');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const openDeleteConfirm = () => {
    setDeleteError('');
    setShowDeleteConfirm(true);
  };

  const closeDeleteConfirm = () => {
    if (!isDeleting) {
      setShowDeleteConfirm(false);
      setDeleteError('');
    }
  };

  const handleDelete = async () => {
    if (!id) return;

    setIsDeleting(true);
    setDeleteError('');

    try {
      await deleteVendor(id);
      navigate('/budget/vendors');
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setDeleteError(
            'This vendor cannot be deleted because they are referenced by one or more invoices.',
          );
        } else {
          setDeleteError(err.error.message);
        }
      } else {
        setDeleteError('Failed to delete vendor. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading vendor...</div>
      </div>
    );
  }

  if (error || !vendor) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>Error</h2>
          <p>{error ?? 'Vendor not found.'}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => navigate('/budget/vendors')}
            >
              Back to Vendors
            </button>
            <button type="button" className={styles.button} onClick={() => void loadVendor()}>
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
        {/* Back navigation */}
        <div className={styles.breadcrumb}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => navigate('/budget/vendors')}
          >
            Vendors
          </button>
          <span className={styles.breadcrumbSeparator} aria-hidden="true">
            /
          </span>
          <span className={styles.breadcrumbCurrent}>{vendor.name}</span>
        </div>

        {/* Page heading */}
        <div className={styles.pageHeader}>
          <div className={styles.pageHeading}>
            <h1 className={styles.pageTitle}>{vendor.name}</h1>
            {vendor.specialty && <span className={styles.pageSubtitle}>{vendor.specialty}</span>}
          </div>
          <div className={styles.pageActions}>
            {!isEditing && (
              <>
                <button type="button" className={styles.editButton} onClick={startEdit}>
                  Edit
                </button>
                <button type="button" className={styles.deleteButton} onClick={openDeleteConfirm}>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stats cards */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total Invoices</span>
            <span className={styles.statValue}>{vendor.invoiceCount}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Outstanding Balance</span>
            <span
              className={`${styles.statValue} ${vendor.outstandingBalance > 0 ? styles.statValueDanger : ''}`}
            >
              {formatCurrency(vendor.outstandingBalance)}
            </span>
          </div>
        </div>

        {/* Info card — view or edit */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Vendor Information</h2>
          </div>

          {isEditing ? (
            <form onSubmit={handleUpdate} className={styles.form} noValidate>
              {editError && (
                <div className={styles.errorBanner} role="alert">
                  {editError}
                </div>
              )}

              <div className={styles.field}>
                <label htmlFor="edit-name" className={styles.label}>
                  Name <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  id="edit-name"
                  value={(editForm.name as string) ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={styles.input}
                  maxLength={200}
                  disabled={isUpdating}
                  autoFocus
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="edit-specialty" className={styles.label}>
                  Specialty
                </label>
                <input
                  type="text"
                  id="edit-specialty"
                  value={(editForm.specialty as string) ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, specialty: e.target.value })}
                  className={styles.input}
                  placeholder="e.g., Plumbing, Electrical, Roofing"
                  maxLength={100}
                  disabled={isUpdating}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.fieldGrow}>
                  <label htmlFor="edit-phone" className={styles.label}>
                    Phone
                  </label>
                  <input
                    type="tel"
                    id="edit-phone"
                    value={(editForm.phone as string) ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className={styles.input}
                    placeholder="e.g., +1 555-123-4567"
                    maxLength={50}
                    disabled={isUpdating}
                  />
                </div>
                <div className={styles.fieldGrow}>
                  <label htmlFor="edit-email" className={styles.label}>
                    Email
                  </label>
                  <input
                    type="email"
                    id="edit-email"
                    value={(editForm.email as string) ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className={styles.input}
                    placeholder="e.g., contact@vendor.com"
                    maxLength={255}
                    disabled={isUpdating}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="edit-address" className={styles.label}>
                  Address
                </label>
                <input
                  type="text"
                  id="edit-address"
                  value={(editForm.address as string) ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className={styles.input}
                  placeholder="e.g., 123 Main St, Springfield, IL 62701"
                  maxLength={500}
                  disabled={isUpdating}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="edit-notes" className={styles.label}>
                  Notes
                </label>
                <textarea
                  id="edit-notes"
                  value={(editForm.notes as string) ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className={styles.textarea}
                  rows={4}
                  disabled={isUpdating}
                />
              </div>

              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.saveButton}
                  disabled={isUpdating || !(editForm.name as string)?.trim()}
                >
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={cancelEdit}
                  disabled={isUpdating}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <dl className={styles.infoList}>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Name</dt>
                <dd className={styles.infoValue}>{vendor.name}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Specialty</dt>
                <dd className={styles.infoValue}>{vendor.specialty || '—'}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Phone</dt>
                <dd className={styles.infoValue}>
                  {vendor.phone ? (
                    <a href={`tel:${vendor.phone}`} className={styles.infoLink}>
                      {vendor.phone}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Email</dt>
                <dd className={styles.infoValue}>
                  {vendor.email ? (
                    <a href={`mailto:${vendor.email}`} className={styles.infoLink}>
                      {vendor.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Address</dt>
                <dd className={styles.infoValue}>{vendor.address || '—'}</dd>
              </div>
              {vendor.notes && (
                <div className={styles.infoRow}>
                  <dt className={styles.infoLabel}>Notes</dt>
                  <dd className={`${styles.infoValue} ${styles.infoValueNotes}`}>{vendor.notes}</dd>
                </div>
              )}
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Created by</dt>
                <dd className={styles.infoValue}>{vendor.createdBy?.displayName ?? '—'}</dd>
              </div>
            </dl>
          )}
        </section>

        {/* Invoices section placeholder */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Invoices</h2>
          </div>
          <div className={styles.comingSoon}>
            <p className={styles.comingSoonText}>
              Invoice management is coming soon. You will be able to track all invoices and payments
              for this vendor here.
            </p>
          </div>
        </section>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeDeleteConfirm} />
          <div className={styles.modalContent}>
            <h2 id="delete-modal-title" className={styles.modalTitle}>
              Delete Vendor
            </h2>
            <p className={styles.modalText}>
              Are you sure you want to delete &quot;<strong>{vendor.name}</strong>&quot;?
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
                onClick={closeDeleteConfirm}
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
                  {isDeleting ? 'Deleting...' : 'Delete Vendor'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VendorDetailPage;
