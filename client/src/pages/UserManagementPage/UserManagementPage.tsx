import { useState, useEffect, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listUsers,
  adminUpdateUser,
  deactivateUser,
  type ListUsersResponse,
  type AdminUpdateUserPayload,
} from '../../lib/usersApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type { UserResponse } from '@cornerstone/shared';
import { SettingsSubNav } from '../../components/SettingsSubNav/SettingsSubNav.js';
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
  const { t } = useTranslation('settings');
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
        setLoadError(t('userManagement.failedLoad'));
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
      newErrors.displayName = t('userManagement.editModal.displayNameRequired');
    } else if (editFormData.displayName.length > 100) {
      newErrors.displayName = t('userManagement.editModal.displayNameTooLong');
    }

    if (!editFormData.email.trim()) {
      newErrors.email = t('userManagement.editModal.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editFormData.email)) {
      newErrors.email = t('userManagement.editModal.emailInvalid');
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
        setEditApiError(t('userManagement.editModal.failedUpdate'));
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
        setDeactivateError(t('userManagement.deactivateModal.failedDeactivate'));
      }
    } finally {
      setIsDeactivating(false);
    }
  };

  if (isLoading && users.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t('userManagement.loading')}</div>
      </div>
    );
  }

  if (loadError && users.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>{t('userManagement.errorTitle')}</h2>
          <p>{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h1 className={styles.pageTitle}>{t('userManagement.pageTitle')}</h1>
        </div>
        <SettingsSubNav />
        <div className={styles.header}>
          <div className={styles.searchWrapper}>
            <input
              type="text"
              placeholder={t('userManagement.searchPlaceholder')}
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
            <p>{searchQuery ? t('userManagement.noUsersFoundSearch') : t('userManagement.noUsersFound')}</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('userManagement.table.name')}</th>
                  <th>{t('userManagement.table.email')}</th>
                  <th>{t('userManagement.table.role')}</th>
                  <th>{t('userManagement.table.authProvider')}</th>
                  <th>{t('userManagement.table.status')}</th>
                  <th>{t('userManagement.table.actions')}</th>
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
                          {user.role === 'admin' ? t('userManagement.role.admin') : t('userManagement.role.member')}
                        </span>
                      </td>
                      <td>{user.authProvider === 'local' ? t('userManagement.authProvider.local') : t('userManagement.authProvider.oidc')}</td>
                      <td>
                        <span className={isActive ? styles.statusActive : styles.statusInactive}>
                          {isActive ? t('userManagement.status.active') : t('userManagement.status.deactivated')}
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
                            {t('userManagement.editButton')}
                          </button>
                          {isActive && (
                            <button
                              type="button"
                              className={styles.deactivateButton}
                              onClick={() => openDeactivateModal(user)}
                            >
                              {t('userManagement.deactivateButton')}
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
          <div className={styles.modal} role="dialog" aria-label="Edit User">
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{t('userManagement.editModal.title')}</h2>
              <button
                type="button"
                className={styles.modalCloseButton}
                onClick={closeEditModal}
                aria-label={t('userManagement.editModal.close')}
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
                  {t('userManagement.editModal.displayNameLabel')}
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
                  {t('userManagement.editModal.emailLabel')}
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
                  {t('userManagement.editModal.roleLabel')}
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
                  <option value="member">{t('userManagement.editModal.roleMember')}</option>
                  <option value="admin">{t('userManagement.editModal.roleAdmin')}</option>
                </select>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={closeEditModal}
                  disabled={isUpdating}
                >
                  {t('userManagement.editModal.cancel')}
                </button>
                <button type="submit" className={styles.saveButton} disabled={isUpdating}>
                  {isUpdating ? t('userManagement.editModal.savePending') : t('userManagement.editModal.saveIdle')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate Confirmation Modal */}
      {deactivatingUser && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} role="dialog" aria-label="Deactivate User">
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{t('userManagement.deactivateModal.title')}</h2>
              <button
                type="button"
                className={styles.modalCloseButton}
                onClick={closeDeactivateModal}
                aria-label={t('userManagement.deactivateModal.close')}
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
                {t('userManagement.deactivateModal.text', { name: deactivatingUser.displayName })}
              </p>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeDeactivateModal}
                disabled={isDeactivating}
              >
                {t('userManagement.deactivateModal.cancel')}
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={handleDeactivateConfirm}
                disabled={isDeactivating}
              >
                {isDeactivating ? t('userManagement.deactivateModal.submitPending') : t('userManagement.deactivateModal.submitIdle')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagementPage;
