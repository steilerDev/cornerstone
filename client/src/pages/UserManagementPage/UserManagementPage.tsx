import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserResponse } from '@cornerstone/shared';
import type { BadgeVariantMap } from '../../components/Badge/Badge.js';
import type { ColumnDef, TableState } from '../../components/DataTable/DataTable.js';
import { DataTable } from '../../components/DataTable/DataTable.js';
import { Badge } from '../../components/Badge/Badge.js';
import { Modal } from '../../components/Modal/Modal.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import {
  listUsers,
  adminUpdateUser,
  deactivateUser,
  type ListUsersResponse,
  type AdminUpdateUserPayload,
} from '../../lib/usersApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useFormatters } from '../../lib/formatters.js';
import { SettingsSubNav } from '../../components/SettingsSubNav/SettingsSubNav.js';
import sharedStyles from '../../styles/shared.module.css';
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
  const { formatDate } = useFormatters();
  const { t } = useTranslation('settings');

  // Data state
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

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

  // Action menu state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Table state
  const [tableState, setTableState] = useState<TableState>({
    search: '',
    filters: new Map(),
    sortBy: null,
    sortDir: null,
    page: 1,
    pageSize: 100,
  });

  // Load users on mount
  useEffect(() => {
    const loadUsersData = async () => {
      setIsLoading(true);
      setError('');

      try {
        const response: ListUsersResponse = await listUsers();
        setUsers(response.users);
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.error.message);
        } else {
          setError(t('userManagement.loadError'));
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadUsersData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const reloadUsers = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response: ListUsersResponse = await listUsers();
      setUsers(response.users);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('userManagement.loadError'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const openEditModal = (user: UserResponse) => {
    setEditingUser(user);
    setEditFormData({
      displayName: user.displayName,
      email: user.email,
      role: user.role,
    });
    setEditErrors({});
    setEditApiError('');
    setActiveMenuId(null);
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
      newErrors.displayName = t('userManagement.editValidation.displayNameRequired');
    } else if (editFormData.displayName.length > 100) {
      newErrors.displayName = t('userManagement.editValidation.displayNameTooLong');
    }

    if (!editFormData.email.trim()) {
      newErrors.email = t('userManagement.editValidation.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editFormData.email)) {
      newErrors.email = t('userManagement.editValidation.emailInvalid');
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
    } catch (err) {
      if (err instanceof ApiClientError) {
        setEditApiError(err.error.message);
      } else {
        setEditApiError(t('userManagement.editModal.error'));
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const openDeactivateModal = (user: UserResponse) => {
    setDeactivatingUser(user);
    setDeactivateError('');
    setActiveMenuId(null);
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
      await reloadUsers();
      closeDeactivateModal();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeactivateError(err.error.message);
      } else {
        setDeactivateError(t('userManagement.deactivateModal.error'));
      }
    } finally {
      setIsDeactivating(false);
    }
  };

  // Badge variants
  const roleVariants = useMemo((): BadgeVariantMap => ({
    admin: {
      label: t('userManagement.roles.admin'),
      className: badgeStyles.roleAdmin,
    },
    member: {
      label: t('userManagement.roles.member'),
      className: badgeStyles.roleMember,
    },
  }), [t]);

  const statusVariants = useMemo((): BadgeVariantMap => ({
    active: {
      label: t('userManagement.status.active'),
      className: badgeStyles.userActive,
    },
    deactivated: {
      label: t('userManagement.status.deactivated'),
      className: badgeStyles.userDeactivated,
    },
  }), [t]);

  // Client-side filtering and sorting
  const filtered = useMemo(() => {
    let result = [...users];

    // Text search
    const searchLower = tableState.search.toLowerCase();
    if (searchLower) {
      result = result.filter(
        (u) =>
          u.displayName.toLowerCase().includes(searchLower) ||
          u.email.toLowerCase().includes(searchLower),
      );
    }

    // Role filter
    const roleFilter = tableState.filters.get('role')?.value;
    if (roleFilter) {
      result = result.filter((u) => u.role === roleFilter);
    }

    // Status filter
    const statusFilter = tableState.filters.get('status')?.value;
    if (statusFilter) {
      result = result.filter((u) => {
        if (statusFilter === 'active') return !u.deactivatedAt;
        if (statusFilter === 'deactivated') return !!u.deactivatedAt;
        return true;
      });
    }

    // Sorting
    if (tableState.sortBy) {
      result.sort((a, b) => {
        let aVal: unknown;
        let bVal: unknown;

        if (tableState.sortBy === 'displayName') {
          aVal = a.displayName;
          bVal = b.displayName;
        } else if (tableState.sortBy === 'email') {
          aVal = a.email;
          bVal = b.email;
        } else if (tableState.sortBy === 'role') {
          aVal = a.role;
          bVal = b.role;
        } else if (tableState.sortBy === 'createdAt') {
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
        }

        if (aVal === bVal) return 0;
        const comparison = (aVal as string | number) > (bVal as string | number) ? 1 : -1;
        return tableState.sortDir === 'desc' ? -comparison : comparison;
      });
    }

    return result;
  }, [users, tableState]);

  // Column definitions
  const columns = useMemo((): ColumnDef<UserResponse>[] => [
    {
      key: 'displayName',
      label: t('userManagement.tableHeaders.name'),
      sortable: true,
      filterable: false,
      defaultVisible: true,
      render: (u) => u.displayName,
    },
    {
      key: 'email',
      label: t('userManagement.tableHeaders.email'),
      sortable: true,
      filterable: false,
      defaultVisible: true,
      render: (u) => u.email,
    },
    {
      key: 'role',
      label: t('userManagement.tableHeaders.role'),
      sortable: true,
      filterable: true,
      filterType: 'enum',
      filterParamKey: 'role',
      enumOptions: [
        { value: 'admin', label: t('userManagement.roles.admin') },
        { value: 'member', label: t('userManagement.roles.member') },
      ],
      defaultVisible: true,
      render: (u) => <Badge variants={roleVariants} value={u.role} />,
    },
    {
      key: 'createdAt',
      label: t('userManagement.tableHeaders.memberSince'),
      sortable: true,
      filterable: false,
      defaultVisible: true,
      render: (u) => formatDate(u.createdAt),
    },
    {
      key: 'authProvider',
      label: t('userManagement.tableHeaders.authProvider'),
      sortable: false,
      filterable: false,
      defaultVisible: false,
      render: (u) =>
        u.authProvider === 'local'
          ? t('userManagement.authProviders.local')
          : t('userManagement.authProviders.oidc'),
    },
    {
      key: 'status',
      label: t('userManagement.tableHeaders.status'),
      sortable: true,
      sortKey: 'deactivatedAt',
      filterable: true,
      filterType: 'enum',
      filterParamKey: 'status',
      enumOptions: [
        { value: 'active', label: t('userManagement.status.active') },
        { value: 'deactivated', label: t('userManagement.status.deactivated') },
      ],
      defaultVisible: true,
      render: (u) => (
        <Badge variants={statusVariants} value={!u.deactivatedAt ? 'active' : 'deactivated'} />
      ),
    },
  ], [t, formatDate, roleVariants, statusVariants]);

  // Render actions menu
  const renderActions = (user: UserResponse) => {
    const isActive = !user.deactivatedAt;
    return (
      <div className={styles.actionsMenu}>
        <button
          type="button"
          className={styles.menuButton}
          onClick={() => setActiveMenuId(activeMenuId === user.id ? null : user.id)}
          aria-label={t('userManagement.actions.menuAriaLabel')}
          data-testid={`user-menu-button-${user.id}`}
        >
          ⋮
        </button>
        {activeMenuId === user.id && (
          <div className={styles.menuDropdown}>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => openEditModal(user)}
              disabled={!isActive}
              data-testid={`user-edit-${user.id}`}
            >
              {t('userManagement.actions.edit')}
            </button>
            {isActive && (
              <button
                type="button"
                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                onClick={() => openDeactivateModal(user)}
                data-testid={`user-deactivate-${user.id}`}
              >
                {t('userManagement.actions.deactivate')}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{t('userManagement.pageTitle')}</h1>
      </div>
      <SettingsSubNav />

      <DataTable<UserResponse>
        pageKey="users"
        columns={columns}
        items={filtered}
        totalItems={filtered.length}
        totalPages={1}
        currentPage={1}
        isLoading={isLoading}
        error={error}
        getRowKey={(u) => u.id}
        renderActions={renderActions}
        tableState={tableState}
        onStateChange={setTableState}
        emptyState={{
          message: t('userManagement.emptyState'),
          description: t('userManagement.emptyStateSearch'),
        }}
      />

      {/* Edit Modal */}
      {editingUser && (
        <Modal title={t('userManagement.editModal.title')} onClose={closeEditModal}>
          {editApiError && (
            <div className={sharedStyles.bannerError} role="alert">
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
                className={sharedStyles.input}
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
                className={sharedStyles.input}
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
                className={sharedStyles.select}
                disabled={isUpdating}
              >
                <option value="member">{t('userManagement.roles.member')}</option>
                <option value="admin">{t('userManagement.roles.admin')}</option>
              </select>
            </div>

            <div className={sharedStyles.modalActions}>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={closeEditModal}
                disabled={isUpdating}
              >
                {t('userManagement.editModal.cancel')}
              </button>
              <button type="submit" className={sharedStyles.btnPrimary} disabled={isUpdating}>
                {isUpdating
                  ? t('userManagement.editModal.saving')
                  : t('userManagement.editModal.save')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Deactivate Confirmation Modal */}
      {deactivatingUser && (
        <Modal
          title={t('userManagement.deactivateModal.title')}
          onClose={() => !isDeactivating && closeDeactivateModal()}
          footer={
            <>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={closeDeactivateModal}
                disabled={isDeactivating}
              >
                {t('userManagement.deactivateModal.cancel')}
              </button>
              <button
                type="button"
                className={sharedStyles.btnConfirmDelete}
                onClick={handleDeactivateConfirm}
                disabled={isDeactivating}
              >
                {isDeactivating
                  ? t('userManagement.deactivateModal.confirming')
                  : t('userManagement.deactivateModal.confirm')}
              </button>
            </>
          }
        >
          {deactivateError && (
            <div className={sharedStyles.bannerError} role="alert">
              {deactivateError}
            </div>
          )}
          <p>
            {(() => {
              const parts = t('userManagement.deactivateModal.message', {
                name: '\u0000',
              }).split('\u0000');
              return (
                <>
                  {parts[0]}
                  <strong>{deactivatingUser.displayName}</strong>
                  {parts[1]}
                </>
              );
            })()}
          </p>
        </Modal>
      )}
    </div>
  );
}

export default UserManagementPage;
