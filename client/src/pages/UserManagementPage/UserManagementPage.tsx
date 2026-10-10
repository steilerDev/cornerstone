import { useState, useEffect, useMemo, useRef, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserResponse } from '@cornerstone/shared';
import type { BadgeVariantMap } from '../../components/Badge/Badge.js';
import type { ColumnDef, TableState } from '../../components/DataTable/DataTable.js';
import { DataTable } from '../../components/DataTable/DataTable.js';
import { dataTableTestId } from '../../components/DataTable/dataTableTestId.js';
import type { DataTableSurface } from '../../components/DataTable/dataTableTestId.js';
import { Badge } from '../../components/Badge/Badge.js';
import { Modal } from '../../components/Modal/Modal.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import {
  listUsers,
  adminUpdateUser,
  createUser,
  deactivateUser,
  type ListUsersResponse,
  type AdminUpdateUserPayload,
  type CreateUserPayload,
} from '../../lib/usersApi.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { SubNav, type SubNavTab } from '../../components/SubNav/SubNav.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './UserManagementPage.module.css';
import { routeUrl } from '@cornerstone/shared';

interface EditFormData {
  displayName: string;
  email: string;
  role: 'admin' | 'member';
}

interface FieldErrors {
  displayName?: string;
  email?: string;
}

interface CreateFormData {
  email: string;
  displayName: string;
  role: 'admin' | 'member';
  ssoOnly: boolean;
  password: string;
  confirmPassword: string;
}

interface CreateFieldErrors {
  email?: string;
  displayName?: string;
  password?: string;
  confirmPassword?: string;
}

const EMPTY_CREATE_FORM: CreateFormData = {
  email: '',
  displayName: '',
  role: 'member',
  ssoOnly: false,
  password: '',
  confirmPassword: '',
};

/** Length in Unicode code points (matches server-side AJV counting). */
const codePoints = (value: string): number => Array.from(value).length;

export function UserManagementPage() {
  const { formatDate } = useFormatters();
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { user: currentUser, oidcEnabled } = useAuth();

  const isAdmin = currentUser?.role === 'admin';

  const settingsTabs: SubNavTab[] = [
    { labelKey: 'subnav.settings.profile', to: routeUrl('settingsProfile'), ns: 'common' },
    { labelKey: 'subnav.settings.manage', to: routeUrl('settingsManage'), ns: 'common' },
    { labelKey: 'subnav.settings.vendors', to: routeUrl('vendors'), ns: 'common' },
    {
      labelKey: 'subnav.settings.userManagement',
      to: routeUrl('settingsUsers'),
      ns: 'common',
      visible: isAdmin,
    },
    {
      labelKey: 'subnav.settings.backups',
      to: routeUrl('settingsBackups'),
      ns: 'common',
      visible: isAdmin,
    },
  ];

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

  // Create modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormData>(EMPTY_CREATE_FORM);
  const createSsoOnly = createForm.ssoOnly && oidcEnabled;
  const [createErrors, setCreateErrors] = useState<CreateFieldErrors>({});
  const [createApiError, setCreateApiError] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const addUserButtonRef = useRef<HTMLButtonElement>(null);
  const createEmailRef = useRef<HTMLInputElement>(null);
  const pendingFocusRef = useRef(false);
  const pendingFieldFocusRef = useRef<string | null>(null);

  // Deactivate modal state
  const [deactivatingUser, setDeactivatingUser] = useState<UserResponse | null>(null);
  const [deactivateError, setDeactivateError] = useState<string>('');
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Action menu state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Table state
  const [tableState, setTableState] = useState<TableState>(() => ({
    search: '',
    filters: new Map(),
    sortBy: null,
    sortDir: null,
    page: 1,
    pageSize: 100,
  }));

  // Restore focus to the trigger after the create dialog closes (Modal only sets initial focus)
  useEffect(() => {
    if (!isCreateOpen && pendingFocusRef.current) {
      pendingFocusRef.current = false;
      addUserButtonRef.current?.focus();
    }
  }, [isCreateOpen]);

  // Move focus to the first invalid field after a failed submit
  useEffect(() => {
    const id = pendingFieldFocusRef.current;
    if (id) {
      pendingFieldFocusRef.current = null;
      document.getElementById(id)?.focus();
    }
  }, [createErrors]);

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
          setError(translateApiError(err.error.code, tErrors));
        } else {
          setError(t('userManagement.loadError'));
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadUsersData();
  }, [t, tErrors]);

  const reloadUsers = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response: ListUsersResponse = await listUsers();
      setUsers(response.users);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(translateApiError(err.error.code, tErrors));
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

    const displayName = editFormData.displayName.trim();
    const email = editFormData.email.trim();

    if (!displayName) {
      newErrors.displayName = t('userManagement.editValidation.displayNameRequired');
    } else if (codePoints(displayName) > 100) {
      newErrors.displayName = t('userManagement.editValidation.displayNameTooLong');
    }

    if (!email) {
      newErrors.email = t('userManagement.editValidation.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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

      const trimmedDisplayName = editFormData.displayName.trim();
      const trimmedEmail = editFormData.email.trim();

      if (trimmedDisplayName !== editingUser.displayName) {
        payload.displayName = trimmedDisplayName;
      }
      if (trimmedEmail !== editingUser.email) {
        payload.email = trimmedEmail;
      }
      if (editFormData.role !== editingUser.role) {
        payload.role = editFormData.role;
      }

      if (Object.keys(payload).length === 0) {
        // Nothing changed (e.g. whitespace-only edit): skip the API call
        closeEditModal();
        return;
      }

      const updatedUser = await adminUpdateUser(editingUser.id, payload);

      // Update users list
      setUsers(users.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
      closeEditModal();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setEditApiError(
          err.error.code === 'CONFLICT'
            ? t('userManagement.errors.emailInUse')
            : translateApiError(err.error.code, tErrors),
        );
      } else {
        setEditApiError(t('userManagement.editModal.error'));
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const openCreateModal = () => {
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateErrors({});
    setCreateApiError('');
    setIsCreating(false);
    setIsCreateOpen(true);
  };

  const closeCreateModal = () => {
    if (isCreating) {
      return;
    }
    setIsCreateOpen(false);
    pendingFocusRef.current = true;
  };

  const validateCreateForm = (): boolean => {
    const newErrors: CreateFieldErrors = {};
    const displayName = createForm.displayName.trim();
    const email = createForm.email.trim();

    if (!displayName) {
      newErrors.displayName = t('userManagement.editValidation.displayNameRequired');
    } else if (codePoints(displayName) > 100) {
      newErrors.displayName = t('userManagement.editValidation.displayNameTooLong');
    }

    if (!email) {
      newErrors.email = t('userManagement.editValidation.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = t('userManagement.editValidation.emailInvalid');
    } else if (codePoints(email) > 255) {
      newErrors.email = t('userManagement.createValidation.emailTooLong');
    }

    if (!createSsoOnly) {
      if (!createForm.password) {
        newErrors.password = t('userManagement.createValidation.passwordRequired');
      } else if (codePoints(createForm.password) < 12) {
        newErrors.password = t('userManagement.createValidation.passwordTooShort');
      } else if (codePoints(createForm.password) > 255) {
        newErrors.password = t('userManagement.createValidation.passwordTooLong');
      }

      if (!createForm.confirmPassword) {
        newErrors.confirmPassword = t('userManagement.createValidation.confirmPasswordRequired');
      } else if (createForm.confirmPassword !== createForm.password) {
        newErrors.confirmPassword = t('userManagement.createValidation.passwordsDoNotMatch');
      }
    }

    // DOM order, so focus lands on the first invalid field
    const order: Array<[keyof CreateFieldErrors, string]> = [
      ['email', 'createEmail'],
      ['displayName', 'createDisplayName'],
      ['password', 'createPassword'],
      ['confirmPassword', 'createConfirmPassword'],
    ];
    const firstInvalid = order.find(([key]) => newErrors[key]);
    pendingFieldFocusRef.current = firstInvalid ? firstInvalid[1] : null;

    setCreateErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreateSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setCreateApiError('');

    if (!validateCreateForm()) {
      return;
    }

    const useSso = createSsoOnly;
    const payload: CreateUserPayload = {
      email: createForm.email.trim(),
      displayName: createForm.displayName.trim(),
      role: createForm.role,
      ...(useSso ? { authProvider: 'oidc' as const } : { password: createForm.password }),
    };

    setIsCreating(true);

    try {
      const created = await createUser(payload);
      setUsers((prev) => [...prev, created]);
      setIsCreating(false);
      closeCreateModal();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.error.code === 'CONFLICT') {
          pendingFieldFocusRef.current = 'createEmail';
          setCreateErrors({ email: t('userManagement.errors.emailInUse') });
        } else {
          setCreateApiError(translateApiError(err.error.code, tErrors));
        }
      } else if (err instanceof NetworkError) {
        setCreateApiError(tCommon('requestErrors.network'));
      } else {
        setCreateApiError(t('userManagement.createModal.error'));
      }
      setIsCreating(false);
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
        setDeactivateError(translateApiError(err.error.code, tErrors));
      } else {
        setDeactivateError(t('userManagement.deactivateModal.error'));
      }
    } finally {
      setIsDeactivating(false);
    }
  };

  // Badge variants
  const roleVariants = useMemo(
    (): BadgeVariantMap => ({
      admin: {
        label: t('userManagement.roles.admin')!,
        className: badgeStyles.roleAdmin!,
      },
      member: {
        label: t('userManagement.roles.member')!,
        className: badgeStyles.roleMember!,
      },
    }),
    [t],
  );

  const statusVariants = useMemo(
    (): BadgeVariantMap => ({
      active: {
        label: t('userManagement.status.active')!,
        className: badgeStyles.userActive!,
      },
      deactivated: {
        label: t('userManagement.status.deactivated')!,
        className: badgeStyles.userDeactivated!,
      },
    }),
    [t],
  );

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
  const columns = useMemo(
    (): ColumnDef<UserResponse>[] => [
      {
        key: 'displayName',
        label: t('userManagement.tableHeaders.name')!,
        sortable: true,
        filterable: false,
        defaultVisible: true,
        render: (u) => u.displayName,
      },
      {
        key: 'email',
        label: t('userManagement.tableHeaders.email')!,
        sortable: true,
        filterable: false,
        defaultVisible: true,
        render: (u) => u.email,
      },
      {
        key: 'role',
        label: t('userManagement.tableHeaders.role')!,
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
        label: t('userManagement.tableHeaders.memberSince')!,
        sortable: true,
        filterable: false,
        defaultVisible: true,
        render: (u) => formatDate(u.createdAt),
      },
      {
        key: 'authProvider',
        label: t('userManagement.tableHeaders.authProvider')!,
        sortable: false,
        filterable: false,
        defaultVisible: true,
        render: (u) =>
          u.authProvider === 'oidc'
            ? u.oidcLinked
              ? t('userManagement.authProviders.oidc')
              : t('userManagement.authProviders.oidcPending')
            : u.oidcLinked
              ? t('userManagement.authProviders.localAndOidc')
              : t('userManagement.authProviders.local'),
      },
      {
        key: 'status',
        label: t('userManagement.tableHeaders.status')!,
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
    ],
    [t, formatDate, roleVariants, statusVariants],
  );

  // Close action menu on outside click and Escape key
  useEffect(() => {
    if (!activeMenuId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.actionsMenu}`)) {
        setActiveMenuId(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveMenuId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [activeMenuId]);

  // Render actions menu
  const renderActions = (user: UserResponse, surface: DataTableSurface) => {
    const isActive = !user.deactivatedAt;
    return (
      <div className={styles.actionsMenu}>
        <button
          type="button"
          className={styles.menuButton}
          onClick={() => setActiveMenuId(activeMenuId === user.id ? null : user.id)}
          aria-label={t('userManagement.actions.menuAriaLabel')}
          data-testid={dataTableTestId('user-menu-button', user.id, surface)}
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
              data-testid={dataTableTestId('user-edit', user.id, surface)}
            >
              {t('userManagement.actions.edit')}
            </button>
            {isActive && (
              <button
                type="button"
                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                onClick={() => openDeactivateModal(user)}
                data-testid={dataTableTestId('user-deactivate', user.id, surface)}
              >
                {t('userManagement.actions.deactivate')}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const deactivateModalMessageParts = deactivatingUser
    ? t('userManagement.deactivateModal.message', { name: '\u0000' }).split('\u0000')
    : null;

  return (
    <PageLayout
      maxWidth="narrow"
      title={t('userManagement.pageTitle')}
      subNav={<SubNav tabs={settingsTabs} ariaLabel={tCommon('subNav.settings')} />}
      action={
        isAdmin ? (
          <button
            type="button"
            className={sharedStyles.btnPrimary}
            ref={addUserButtonRef}
            onClick={openCreateModal}
            data-testid="add-user-button"
          >
            {t('userManagement.addUser')}
          </button>
        ) : undefined
      }
    >
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
          message: t('userManagement.emptyState')!,
          description: t('userManagement.emptyStateSearch')!,
        }}
      />

      {/* Create Modal */}
      {isCreateOpen && (
        <Modal
          title={t('userManagement.createModal.title')}
          onClose={closeCreateModal}
          initialFocusRef={createEmailRef}
        >
          {createApiError && (
            <div className={sharedStyles.bannerError} role="alert">
              {createApiError}
            </div>
          )}

          <form onSubmit={handleCreateSubmit} noValidate className={styles.modalForm}>
            <div className={styles.field}>
              <label htmlFor="createEmail" className={styles.label}>
                {t('userManagement.createModal.emailLabel')}
              </label>
              <input
                type="email"
                id="createEmail"
                ref={createEmailRef}
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                className={sharedStyles.input}
                maxLength={255}
                autoComplete="off"
                disabled={isCreating}
                aria-invalid={!!createErrors.email}
                aria-describedby={createErrors.email ? 'createEmail-error' : undefined}
              />
              {createErrors.email && (
                <span id="createEmail-error" className={styles.error} role="alert">
                  {createErrors.email}
                </span>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="createDisplayName" className={styles.label}>
                {t('userManagement.createModal.displayNameLabel')}
              </label>
              <input
                type="text"
                id="createDisplayName"
                value={createForm.displayName}
                onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
                className={sharedStyles.input}
                maxLength={100}
                disabled={isCreating}
                aria-invalid={!!createErrors.displayName}
                aria-describedby={createErrors.displayName ? 'createDisplayName-error' : undefined}
              />
              {createErrors.displayName && (
                <span id="createDisplayName-error" className={styles.error} role="alert">
                  {createErrors.displayName}
                </span>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="createRole" className={styles.label}>
                {t('userManagement.createModal.roleLabel')}
              </label>
              <select
                id="createRole"
                value={createForm.role}
                onChange={(e) =>
                  setCreateForm({ ...createForm, role: e.target.value as 'admin' | 'member' })
                }
                className={sharedStyles.select}
                disabled={isCreating}
              >
                <option value="member">{t('userManagement.roles.member')}</option>
                <option value="admin">{t('userManagement.roles.admin')}</option>
              </select>
            </div>

            {oidcEnabled && (
              <div>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    id="createSsoOnly"
                    className={styles.checkbox}
                    checked={createSsoOnly}
                    onChange={(e) => {
                      const ssoOnly = e.target.checked;
                      setCreateForm(
                        ssoOnly
                          ? { ...createForm, ssoOnly, password: '', confirmPassword: '' }
                          : { ...createForm, ssoOnly },
                      );
                      if (ssoOnly) {
                        setCreateErrors((prev) => ({
                          email: prev.email,
                          displayName: prev.displayName,
                        }));
                      }
                    }}
                    disabled={isCreating}
                    aria-describedby="createSsoOnly-hint"
                  />
                  <span className={styles.checkboxLabel}>
                    {t('userManagement.createModal.ssoOnlyLabel')}
                  </span>
                </label>
                <p id="createSsoOnly-hint" className={`${styles.hint} ${styles.checkboxHint}`}>
                  {t('userManagement.createModal.ssoOnlyHint')}
                </p>
              </div>
            )}

            {!createSsoOnly && (
              <>
                <div className={styles.field}>
                  <label htmlFor="createPassword" className={styles.label}>
                    {t('userManagement.createModal.passwordLabel')}
                  </label>
                  <input
                    type="password"
                    id="createPassword"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    className={sharedStyles.input}
                    maxLength={255}
                    autoComplete="new-password"
                    disabled={isCreating}
                    aria-invalid={!!createErrors.password}
                    aria-describedby={
                      createErrors.password
                        ? 'createPassword-hint createPassword-error'
                        : 'createPassword-hint'
                    }
                  />
                  <p id="createPassword-hint" className={styles.hint}>
                    {t('userManagement.createModal.passwordHint')}
                  </p>
                  {createErrors.password && (
                    <span id="createPassword-error" className={styles.error} role="alert">
                      {createErrors.password}
                    </span>
                  )}
                </div>

                <div className={styles.field}>
                  <label htmlFor="createConfirmPassword" className={styles.label}>
                    {t('userManagement.createModal.confirmPasswordLabel')}
                  </label>
                  <input
                    type="password"
                    id="createConfirmPassword"
                    value={createForm.confirmPassword}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, confirmPassword: e.target.value })
                    }
                    className={sharedStyles.input}
                    maxLength={255}
                    autoComplete="new-password"
                    disabled={isCreating}
                    aria-invalid={!!createErrors.confirmPassword}
                    aria-describedby={
                      createErrors.confirmPassword ? 'createConfirmPassword-error' : undefined
                    }
                  />
                  {createErrors.confirmPassword && (
                    <span id="createConfirmPassword-error" className={styles.error} role="alert">
                      {createErrors.confirmPassword}
                    </span>
                  )}
                </div>
              </>
            )}

            <div className={sharedStyles.modalActions}>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={closeCreateModal}
                disabled={isCreating}
              >
                {t('userManagement.createModal.cancel')}
              </button>
              <button
                type="submit"
                className={sharedStyles.btnPrimary}
                disabled={isCreating}
                data-testid="create-user-submit"
              >
                {isCreating
                  ? t('userManagement.createModal.creating')
                  : t('userManagement.createModal.create')}
              </button>
            </div>
          </form>
        </Modal>
      )}

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
                onChange={(e) => setEditFormData({ ...editFormData, displayName: e.target.value })}
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
            {deactivateModalMessageParts && (
              <>
                {deactivateModalMessageParts[0]}
                <strong>{deactivatingUser!.displayName}</strong>
                {deactivateModalMessageParts[1]}
              </>
            )}
          </p>
        </Modal>
      )}
    </PageLayout>
  );
}

export default UserManagementPage;
