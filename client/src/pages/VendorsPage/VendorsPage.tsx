import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import type { Vendor, CreateVendorRequest, VendorListQuery } from '@cornerstone/shared';
import { fetchVendors, createVendor, deleteVendor } from '../../lib/vendorsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { BudgetSubNav } from '../../components/BudgetSubNav/BudgetSubNav.js';
import styles from './VendorsPage.module.css';

export function VendorsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Data state
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const pageSize = 25;

  // Search and sort from URL
  const searchQuery = searchParams.get('q') || '';
  const sortBy = (searchParams.get('sortBy') as VendorListQuery['sortBy']) || 'name';
  const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc';
  const urlPage = parseInt(searchParams.get('page') || '1', 10);

  // Search debounce
  const [searchInput, setSearchInput] = useState(searchQuery);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Create vendor modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateVendorRequest>({
    name: '',
    specialty: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
  });
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>('');

  // Delete confirmation state
  const [deletingVendor, setDeletingVendor] = useState<Vendor | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');

  // Sync current page with URL
  useEffect(() => {
    if (urlPage !== currentPage) {
      setCurrentPage(urlPage);
    }
  }, [urlPage, currentPage]);

  // Debounced search
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      const newParams = new URLSearchParams(searchParams);
      if (searchInput) {
        newParams.set('q', searchInput);
      } else {
        newParams.delete('q');
      }
      newParams.set('page', '1');
      setSearchParams(newParams);
    }, 300);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchInput, searchParams, setSearchParams]);

  // Load vendors when search/sort/page changes
  useEffect(() => {
    void loadVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, sortBy, sortOrder, currentPage]);

  const loadVendors = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetchVendors({
        page: currentPage,
        pageSize,
        q: searchQuery || undefined,
        sortBy: sortBy || undefined,
        sortOrder: sortOrder || undefined,
      });

      setVendors(response.vendors);
      setTotalPages(response.pagination.totalPages);
      setTotalItems(response.pagination.totalItems);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to load vendors. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (page: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', page.toString());
    setSearchParams(newParams);
  };

  const handleSortChange = (field: string) => {
    const newOrder = sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc';
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sortBy', field);
    newParams.set('sortOrder', newOrder);
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const renderSortIcon = (field: string) => {
    if (sortBy !== field) return null;
    return sortOrder === 'asc' ? ' ↑' : ' ↓';
  };

  const openCreateModal = () => {
    setCreateForm({ name: '', specialty: '', phone: '', email: '', address: '', notes: '' });
    setCreateError('');
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    if (!isCreating) {
      setShowCreateModal(false);
      setCreateError('');
    }
  };

  const handleCreateVendor = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError('');

    const trimmedName = createForm.name.trim();
    if (!trimmedName) {
      setCreateError('Vendor name is required.');
      return;
    }
    if (trimmedName.length > 200) {
      setCreateError('Vendor name must be 200 characters or less.');
      return;
    }

    setIsCreating(true);

    try {
      await createVendor({
        name: trimmedName,
        specialty: createForm.specialty?.trim() || null,
        phone: createForm.phone?.trim() || null,
        email: createForm.email?.trim() || null,
        address: createForm.address?.trim() || null,
        notes: createForm.notes?.trim() || null,
      });
      setShowCreateModal(false);
      await loadVendors();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.error.message);
      } else {
        setCreateError('Failed to create vendor. Please try again.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const openDeleteConfirm = (vendor: Vendor) => {
    setDeletingVendor(vendor);
    setDeleteError('');
  };

  const closeDeleteConfirm = () => {
    if (!isDeleting) {
      setDeletingVendor(null);
      setDeleteError('');
    }
  };

  const confirmDelete = async () => {
    if (!deletingVendor) return;

    setIsDeleting(true);
    setDeleteError('');

    try {
      await deleteVendor(deletingVendor.id);
      setDeletingVendor(null);
      await loadVendors();
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

  if (isLoading && vendors.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Budget</h1>
          </div>
          <BudgetSubNav />
          <div className={styles.loading}>Loading vendors...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Budget</h1>
        </div>

        {/* Budget sub-navigation */}
        <BudgetSubNav />

        {/* Section header */}
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Vendors</h2>
          <button type="button" className={styles.button} onClick={openCreateModal}>
            Add Vendor
          </button>
        </div>

        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
            <button type="button" className={styles.retryButton} onClick={() => void loadVendors()}>
              Retry
            </button>
          </div>
        )}

        {/* Search and sort bar */}
        <div className={styles.searchCard}>
          <input
            type="search"
            placeholder="Search vendors by name, specialty, phone, or email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={styles.searchInput}
            aria-label="Search vendors"
          />
          <div className={styles.sortRow}>
            <label htmlFor="sort-select" className={styles.sortLabel}>
              Sort by:
            </label>
            <select
              id="sort-select"
              value={sortBy || 'name'}
              onChange={(e) => handleSortChange(e.target.value)}
              className={styles.sortSelect}
            >
              <option value="name">Name</option>
              <option value="specialty">Specialty</option>
              <option value="created_at">Date Added</option>
              <option value="updated_at">Last Updated</option>
            </select>
            <button
              type="button"
              className={styles.sortOrderButton}
              onClick={() => handleSortChange(sortBy || 'name')}
              aria-label="Toggle sort order"
            >
              {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
          </div>
        </div>

        {/* Vendor list */}
        {vendors.length === 0 ? (
          <div className={styles.emptyState}>
            {searchQuery ? (
              <>
                <h2 className={styles.emptyTitle}>No vendors match your search</h2>
                <p className={styles.emptyText}>
                  Try different search terms or clear the search to see all vendors.
                </p>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setSearchInput('');
                    setSearchParams(new URLSearchParams());
                  }}
                >
                  Clear Search
                </button>
              </>
            ) : (
              <>
                <h2 className={styles.emptyTitle}>No vendors yet</h2>
                <p className={styles.emptyText}>
                  Add your first vendor or contractor to track who is working on your project.
                </p>
                <button type="button" className={styles.button} onClick={openCreateModal}>
                  Add First Vendor
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th
                      className={styles.sortableHeader}
                      onClick={() => handleSortChange('name')}
                      aria-sort={
                        sortBy === 'name'
                          ? sortOrder === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      Name{renderSortIcon('name')}
                    </th>
                    <th
                      className={styles.sortableHeader}
                      onClick={() => handleSortChange('specialty')}
                      aria-sort={
                        sortBy === 'specialty'
                          ? sortOrder === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      Specialty{renderSortIcon('specialty')}
                    </th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th className={styles.actionsColumn}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((vendor) => (
                    <tr key={vendor.id} className={styles.tableRow}>
                      <td className={styles.nameCell}>
                        <Link to={`/budget/vendors/${vendor.id}`} className={styles.vendorLink}>
                          {vendor.name}
                        </Link>
                      </td>
                      <td>{vendor.specialty || '—'}</td>
                      <td>
                        {vendor.phone ? (
                          <a href={`tel:${vendor.phone}`} className={styles.contactLink}>
                            {vendor.phone}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {vendor.email ? (
                          <a href={`mailto:${vendor.email}`} className={styles.contactLink}>
                            {vendor.email}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={styles.actionsCell}>
                        <div className={styles.actionButtons}>
                          <button
                            type="button"
                            className={styles.viewButton}
                            onClick={() => navigate(`/budget/vendors/${vendor.id}`)}
                            aria-label={`View ${vendor.name}`}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className={styles.deleteButton}
                            onClick={() => openDeleteConfirm(vendor)}
                            aria-label={`Delete ${vendor.name}`}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className={styles.cardsContainer}>
              {vendors.map((vendor) => (
                <div key={vendor.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <Link to={`/budget/vendors/${vendor.id}`} className={styles.cardName}>
                      {vendor.name}
                    </Link>
                    {vendor.specialty && (
                      <span className={styles.cardSpecialty}>{vendor.specialty}</span>
                    )}
                  </div>
                  <div className={styles.cardBody}>
                    {vendor.phone && (
                      <div className={styles.cardRow}>
                        <span className={styles.cardLabel}>Phone:</span>
                        <a href={`tel:${vendor.phone}`} className={styles.contactLink}>
                          {vendor.phone}
                        </a>
                      </div>
                    )}
                    {vendor.email && (
                      <div className={styles.cardRow}>
                        <span className={styles.cardLabel}>Email:</span>
                        <a href={`mailto:${vendor.email}`} className={styles.contactLink}>
                          {vendor.email}
                        </a>
                      </div>
                    )}
                  </div>
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.viewButton}
                      onClick={() => navigate(`/budget/vendors/${vendor.id}`)}
                    >
                      View Details
                    </button>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => openDeleteConfirm(vendor)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <div className={styles.paginationInfo}>
                  Showing {(currentPage - 1) * pageSize + 1} to{' '}
                  {Math.min(currentPage * pageSize, totalItems)} of {totalItems} vendors
                </div>
                <div className={styles.paginationControls}>
                  <button
                    type="button"
                    className={styles.paginationButton}
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                  >
                    Previous
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
                          onClick={() => handlePageChange(pageNum)}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className={styles.paginationButton}
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create vendor modal */}
      {showCreateModal && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeCreateModal} />
          <div className={styles.modalContent}>
            <h2 id="create-modal-title" className={styles.modalTitle}>
              Add Vendor
            </h2>
            <p className={styles.modalDescription}>
              Add a vendor or contractor involved in your construction project.
            </p>

            {createError && (
              <div className={styles.errorBanner} role="alert">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateVendor} className={styles.form} noValidate>
              <div className={styles.field}>
                <label htmlFor="vendor-name" className={styles.label}>
                  Name <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  id="vendor-name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className={styles.input}
                  placeholder="e.g., Smith Plumbing Co."
                  maxLength={200}
                  disabled={isCreating}
                  autoFocus
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="vendor-specialty" className={styles.label}>
                  Specialty
                </label>
                <input
                  type="text"
                  id="vendor-specialty"
                  value={createForm.specialty ?? ''}
                  onChange={(e) => setCreateForm({ ...createForm, specialty: e.target.value })}
                  className={styles.input}
                  placeholder="e.g., Plumbing, Electrical, Roofing"
                  maxLength={100}
                  disabled={isCreating}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.fieldGrow}>
                  <label htmlFor="vendor-phone" className={styles.label}>
                    Phone
                  </label>
                  <input
                    type="tel"
                    id="vendor-phone"
                    value={createForm.phone ?? ''}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    className={styles.input}
                    placeholder="e.g., +1 555-123-4567"
                    maxLength={50}
                    disabled={isCreating}
                  />
                </div>
                <div className={styles.fieldGrow}>
                  <label htmlFor="vendor-email" className={styles.label}>
                    Email
                  </label>
                  <input
                    type="email"
                    id="vendor-email"
                    value={createForm.email ?? ''}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    className={styles.input}
                    placeholder="e.g., contact@smithplumbing.com"
                    maxLength={255}
                    disabled={isCreating}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="vendor-address" className={styles.label}>
                  Address
                </label>
                <input
                  type="text"
                  id="vendor-address"
                  value={createForm.address ?? ''}
                  onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                  className={styles.input}
                  placeholder="e.g., 123 Main St, Springfield, IL 62701"
                  maxLength={500}
                  disabled={isCreating}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="vendor-notes" className={styles.label}>
                  Notes
                </label>
                <textarea
                  id="vendor-notes"
                  value={createForm.notes ?? ''}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  className={styles.textarea}
                  placeholder="Any additional notes about this vendor..."
                  rows={3}
                  disabled={isCreating}
                />
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={closeCreateModal}
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.button}
                  disabled={isCreating || !createForm.name.trim()}
                >
                  {isCreating ? 'Adding...' : 'Add Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deletingVendor && (
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
              Are you sure you want to delete &quot;<strong>{deletingVendor.name}</strong>&quot;?
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
                  onClick={() => void confirmDelete()}
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

export default VendorsPage;
