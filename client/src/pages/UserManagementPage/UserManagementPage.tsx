import { useState, useEffect, type FormEvent } from 'react';
import {
  listUsers,
  adminUpdateUser,
  deactivateUser,
  type ListUsersResponse,
  type AdminUpdateUserPayload,
} from '../../lib/usersApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type { UserResponse } from '@cornerstone/shared';
import styles from './UserManagementPage.module.css';

interface EditFormData {
  displayName: string;
  email: string;
  role: 'admin' | 'member';
}

interface FieldErrors {
  displayName?: string;
  email?: string;
}

export function UserManagementPage() {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout | null>(null);

  // Edit modal state
  const [editingUser, setEditingUser] = useState<UserResponse | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormData>({
    displayName: '',
    email: '',
    role: 'member',
  });
  const [editErrors, setEditErrors] = useState<FieldErrors>({});
  const [editApiError, setEditApiError] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Deactivate modal state
  const [deactivatingUser, setDeactivatingUser] = useState<UserResponse | null>(null);
  const [deactivateError, setDeactivateError] = useState<string>('');
  const [isDeactivating, setIsDeactivating] = useState(false);

  const loadUsers = async (query?: string) => {
    try {
      setLoadError('');
      const response: ListUsersResponse = await listUsers(query);
      setUsers(response.users);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setLoadError(error.error.message);
      } else {
        setLoadError('Failed to load users. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    // Debounce search
    if (searchDebounce) {
      clearTimeout(searchDebounce);
    }

    const timeout = setTimeout(() => {
      setIsLoading(true);
      void loadUsers(searchQuery || undefined);
    }, 300);

    setSearchDebounce(timeout);

    return () => {
      if (searchDebounce) {
        clearTimeout(searchDebounce);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const openEditModal = (user: UserResponse) => {
    setEditingUser(user);
    setEditFormData({
      displayName: user.displayName,
      email: user.email,
      role: user.role,
    });
    setEditErrors({});
    setEditApiError('');
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setEditFormData({ displayName: '', email: '', role: 'member' });
    setEditErrors({});
    setEditApiError('');
  };

  const validateEditForm = (): boolean => {
    const newErrors: FieldErrors = {};

    if (!editFormData.displayName.trim()) {
      newErrors.displayName = 'Display name is required';
    } else if (editFormData.displayName.length > 100) {
      newErrors.displayName = 'Display name must be 100 characters or less';
    }

    if (!editFormData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editFormData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    setEditErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleEditSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setEditApiError('');

    if (!editingUser || !validateEditForm()) {
      return;
    }

    setIsUpdating(true);

    try {
      const payload: AdminUpdateUserPayload = {};

      if (editFormData.displayName !== editingUser.displayName) {
        payload.displayName = editFormData.displayName.trim();
      }
      if (editFormData.email !== editingUser.email) {
        payload.email = editFormData.email.trim();
      }
      if (editFormData.role !== editingUser.role) {
        payload.role = editFormData.role;
      }

      const updatedUser = await adminUpdateUser(editingUser.id, payload);

      // Update users list
      setUsers(users.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
      closeEditModal();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setEditApiError(error.error.message);
      } else {
        setEditApiError('Failed to update user. Please try again.');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const openDeactivateModal = (user: UserResponse) => {
    setDeactivatingUser(user);
    setDeactivateError('');
  };

  const closeDeactivateModal = () => {
    setDeactivatingUser(null);
    setDeactivateError('');
  };

  const handleDeactivateConfirm = async () => {
    if (!deactivatingUser) {
      return;
    }

    setIsDeactivating(true);
    setDeactivateError('');

    try {
      await deactivateUser(deactivatingUser.id);

      // Reload users to get updated list
      await loadUsers(searchQuery || undefined);
      closeDeactivateModal();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setDeactivateError(error.error.message);
      } else {
        setDeactivateError('Failed to deactivate user. Please try again.');
      }
    } finally {
      setIsDeactivating(false);
    }
  };

  if (isLoading && users.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading users...</div>
      </div>
    );
  }

  if (loadError && users.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>Error</h2>
          <p>{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h1 className={styles.pageTitle}>User Management</h1>
          <div className={styles.searchWrapper}>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>
        </div>

        {loadError && users.length > 0 && (
          <div className={styles.errorBanner} role="alert">
            {loadError}
          </div>
        )}

        {users.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No users found{searchQuery ? ' matching your search' : ''}.</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Auth Provider</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isActive = !user.deactivatedAt;
                  return (
                    <tr key={user.id}>
                      <td>{user.displayName}</td>
                      <td>{user.email}</td>
                      <td>
                        <span
                          className={user.role === 'admin' ? styles.roleAdmin : styles.roleMember}
                        >
                          {user.role === 'admin' ? 'Administrator' : 'Member'}
                        </span>
                      </td>
                      <td>{user.authProvider === 'local' ? 'Local' : 'OIDC'}</td>
                      <td>
                        <span className={isActive ? styles.statusActive : styles.statusInactive}>
                          {isActive ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className={styles.editButton}
                            onClick={() => openEditModal(user)}
                            disabled={!isActive}
                          >
                            Edit
                          </button>
                          {isActive && (
                            <button
                              type="button"
                              className={styles.deactivateButton}
                              onClick={() => openDeactivateModal(user)}
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Edit User</h2>
              <button
                type="button"
                className={styles.modalCloseButton}
                onClick={closeEditModal}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {editApiError && (
              <div className={styles.errorBanner} role="alert">
                {editApiError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className={styles.modalForm}>
              <div className={styles.field}>
                <label htmlFor="editDisplayName" className={styles.label}>
                  Display Name
                </label>
                <input
                  type="text"
                  id="editDisplayName"
                  value={editFormData.displayName}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, displayName: e.target.value })
                  }
                  className={styles.input}
                  maxLength={100}
                  disabled={isUpdating}
                  aria-invalid={!!editErrors.displayName}
                  aria-describedby={editErrors.displayName ? 'editDisplayName-error' : undefined}
                />
                {editErrors.displayName && (
                  <span id="editDisplayName-error" className={styles.error} role="alert">
                    {editErrors.displayName}
                  </span>
                )}
              </div>

              <div className={styles.field}>
                <label htmlFor="editEmail" className={styles.label}>
                  Email
                </label>
                <input
                  type="email"
                  id="editEmail"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  className={styles.input}
                  disabled={isUpdating}
                  aria-invalid={!!editErrors.email}
                  aria-describedby={editErrors.email ? 'editEmail-error' : undefined}
                />
                {editErrors.email && (
                  <span id="editEmail-error" className={styles.error} role="alert">
                    {editErrors.email}
                  </span>
                )}
              </div>

              <div className={styles.field}>
                <label htmlFor="editRole" className={styles.label}>
                  Role
                </label>
                <select
                  id="editRole"
                  value={editFormData.role}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, role: e.target.value as 'admin' | 'member' })
                  }
                  className={styles.select}
                  disabled={isUpdating}
                >
                  <option value="member">Member</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={closeEditModal}
                  disabled={isUpdating}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.saveButton} disabled={isUpdating}>
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate Confirmation Modal */}
      {deactivatingUser && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Deactivate User</h2>
              <button
                type="button"
                className={styles.modalCloseButton}
                onClick={closeDeactivateModal}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {deactivateError && (
              <div className={styles.errorBanner} role="alert">
                {deactivateError}
              </div>
            )}

            <div className={styles.modalBody}>
              <p>
                Are you sure you want to deactivate <strong>{deactivatingUser.displayName}</strong>?
                Their sessions will be terminated immediately.
              </p>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeDeactivateModal}
                disabled={isDeactivating}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={handleDeactivateConfirm}
                disabled={isDeactivating}
              >
                {isDeactivating ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagementPage;
