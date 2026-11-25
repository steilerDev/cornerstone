import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import type { UserListItem } from '@cornerstone/shared';
import type { BadgeVariantMap } from '../../components/Badge/Badge.js';
import type { ColumnDef, TableState } from '../../components/DataTable/DataTable.js';
import { DataTable } from '../../components/DataTable/DataTable.js';
import { dataTableTestId } from '../../components/DataTable/dataTableTestId.js';
import type { DataTableSurface } from '../../components/DataTable/dataTableTestId.js';
import { Badge } from '../../components/Badge/Badge.js';
import { ObjectForm } from '../../components/ObjectForm/ObjectForm.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { OverflowMenu } from '../../components/OverflowMenu/OverflowMenu.js';
import type { OverflowMenuItem } from '../../components/OverflowMenu/OverflowMenu.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { userFormPrefill, useUserFormSchema } from '../../objectForms/userForm.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import {
  USER_ACCOUNT_STATUSES,
  isSameLocalDay,
  userAccountStatus,
} from '../../lib/userAccountStatus.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import {
  listUsers,
  adminUpdateUser,
  createUser,
  deactivateUser,
  unlockUser,
  type ListUsersResponse,
} from '../../lib/usersApi.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './UserManagementPage.module.css';

type UserFormState =
  { readonly mode: 'new' } | { readonly mode: 'edit'; readonly user: UserListItem } | null;

/** DataTable enum filters are multi-select and arrive comma-joined (e.g. `active,locked`). */
const splitFilterValues = (value: string | undefined): string[] =>
  value ? value.split(',').filter(Boolean) : [];

export function UserManagementPage() {
  const { formatDate, formatTime, formatDateTime } = useFormatters();
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const pageTitle = tCommon('navigation.users');
  useDocumentTitle(pageTitle);
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();
  const statusBadges = useStatusBadgeVariants();
  const accountSet = I18N_UNION_KEYS.userAccountStatus;

  const isAdmin = currentUser?.role === 'admin';

  // Data state
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // New / Edit dialog (one ObjectForm over the user schema)
  const [form, setForm] = useState<UserFormState>(null);
  const addUserButtonRef = useRef<HTMLButtonElement>(null);
  // The row menu trigger that opened the edit dialog (Cancel returns focus there)
  const editReturnRef = useRef<HTMLElement | null>(null);
  const formUser = form?.mode === 'edit' ? form.user : undefined;
  const userPrefill = userFormPrefill(formUser);
  const userSchema = useUserFormSchema({
    mode: form?.mode ?? 'new',
    ...(formUser ? { user: formUser } : {}),
    create: async (payload) => {
      const created = await createUser(payload);
      setUsers((prev) => [...prev, created]);
      return created;
    },
    update: async (id, payload) => {
      const updated = await adminUpdateUser(id, payload);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
      return updated;
    },
  });

  // Deactivate modal state
  const [deactivatingUser, setDeactivatingUser] = useState<UserListItem | null>(null);
  const [deactivateError, setDeactivateError] = useState<string>('');
  const [isDeactivating, setIsDeactivating] = useState(false);

  // The row menu trigger that opened the deactivate confirm (Cancel returns focus there)
  const deactivateReturnRef = useRef<HTMLElement | null>(null);

  // Unlock state
  const [unlockingIds, setUnlockingIds] = useState<ReadonlySet<string>>(() => new Set());
  // Where focus goes once an unlock settles: the row's menu trigger, or the search field
  const unlockFocusRef = useRef<{ testId: string } | 'search' | null>(null);

  // Table state
  const [tableState, setTableState] = useState<TableState>(() => ({
    search: '',
    filters: new Map(),
    sortBy: null,
    sortDir: null,
    page: 1,
    pageSize: 100,
  }));

  // Load users on mount
  useEffect(() => {
    const loadUsersData = async () => {
      setIsLoading(true);
      setError('');

      try {
        const response: ListUsersResponse = await listUsers();
        setUsers(response.users);
        setLoadedAt(new Date().toISOString());
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
      setLoadedAt(new Date().toISOString());
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

  const openEdit = (user: UserListItem, surface: DataTableSurface) => {
    if (user.deactivatedAt) return;
    editReturnRef.current = document.querySelector<HTMLElement>(
      `[data-testid="${dataTableTestId('user-menu-button', user.id, surface)}"]`,
    );
    setForm({ mode: 'edit', user });
  };

  const openDeactivateModal = (user: UserListItem, surface: DataTableSurface) => {
    deactivateReturnRef.current = document.querySelector<HTMLElement>(
      `[data-testid="${dataTableTestId('user-menu-button', user.id, surface)}"]`,
    );
    setDeactivatingUser(user);
    setDeactivateError('');
  };

  const handleUnlock = async (user: UserListItem, surface: DataTableSurface) => {
    if (unlockingIds.has(user.id)) return;
    unlockFocusRef.current = {
      testId: dataTableTestId('user-menu-button', user.id, surface),
    };
    setUnlockingIds((prev) => new Set(prev).add(user.id));
    try {
      await unlockUser(user.id);
      // The row leaves an active status filter that no longer matches its new (Active) status
      const statusSelected = splitFilterValues(tableState.filters.get('status')?.value);
      if (statusSelected.length > 0 && !statusSelected.includes('active')) {
        unlockFocusRef.current = 'search';
      }
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, lockedUntil: null } : u)));
      showToast('success', t('userManagement.unlock.success', { name: user.displayName }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        showToast('error', translateApiError(err.error.code, tErrors));
      } else if (err instanceof NetworkError) {
        showToast('error', tCommon('requestErrors.network'));
      } else {
        showToast('error', t('userManagement.unlock.error', { name: user.displayName }));
      }
    } finally {
      setUnlockingIds((prev) => {
        const next = new Set(prev);
        next.delete(user.id);
        return next;
      });
    }
  };

  // Once an unlock settles (success or error), return focus: OverflowMenu does not restore it
  useEffect(() => {
    const target = unlockFocusRef.current;
    if (!target || unlockingIds.size > 0) return;
    unlockFocusRef.current = null;
    if (target === 'search') {
      document.querySelector<HTMLInputElement>('[data-page-search]')?.focus();
    } else {
      document.querySelector<HTMLElement>(`[data-testid="${target.testId}"]`)?.focus();
    }
  }, [users, unlockingIds]);

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
    const roleFilter = splitFilterValues(tableState.filters.get('role')?.value);
    if (roleFilter.length > 0) {
      result = result.filter((u) => roleFilter.includes(u.role));
    }

    // Status filter
    const statusFilter = splitFilterValues(tableState.filters.get('status')?.value);
    if (statusFilter.length > 0) {
      result = result.filter((u) => statusFilter.includes(userAccountStatus(u)));
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
        } else if (tableState.sortBy === 'deactivatedAt') {
          aVal = USER_ACCOUNT_STATUSES.indexOf(userAccountStatus(a));
          bVal = USER_ACCOUNT_STATUSES.indexOf(userAccountStatus(b));
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
    (): ColumnDef<UserListItem>[] => [
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
        enumOptions: USER_ACCOUNT_STATUSES.map((st) => ({
          value: st,
          label: tCommon(accountSet.key(st)),
        })),
        defaultVisible: true,
        render: (u) => {
          const status = userAccountStatus(u);
          return (
            <span className={styles.statusCell}>
              <Badge variants={statusBadges.userAccount} value={status} />
              {status === 'locked' && u.lockedUntil && (
                <span className={styles.lockedUntil}>
                  {t('userManagement.lockedUntil', {
                    when:
                      loadedAt && isSameLocalDay(u.lockedUntil, loadedAt)
                        ? formatTime(u.lockedUntil)
                        : formatDateTime(u.lockedUntil),
                  })}
                </span>
              )}
            </span>
          );
        },
      },
    ],
    [
      t,
      tCommon,
      formatDate,
      formatTime,
      formatDateTime,
      roleVariants,
      statusBadges,
      accountSet,
      loadedAt,
    ],
  );

  // Render actions menu
  const renderActions = (user: UserListItem, surface: DataTableSurface) => {
    const isActive = !user.deactivatedAt;
    const items: OverflowMenuItem[] = [
      {
        id: 'edit',
        label: t('userManagement.actions.edit'),
        onClick: () => openEdit(user, surface),
        ariaDisabled: !isActive,
        testId: dataTableTestId('user-edit', user.id, surface),
      },
    ];
    if (userAccountStatus(user) === 'locked') {
      items.push({
        id: 'unlock',
        label: t('userManagement.actions.unlock'),
        onClick: () => void handleUnlock(user, surface),
        ariaDisabled: unlockingIds.has(user.id),
        testId: dataTableTestId('user-unlock', user.id, surface),
      });
    }
    if (isActive) {
      items.push({
        id: 'deactivate',
        label: t('userManagement.actions.deactivate'),
        variant: 'destructive',
        onClick: () => openDeactivateModal(user, surface),
        testId: dataTableTestId('user-deactivate', user.id, surface),
      });
    }
    return (
      <OverflowMenu
        usePortal
        items={items}
        triggerAriaLabel={t('userManagement.actions.menuAriaLabel', { name: user.displayName })}
        data-testid={dataTableTestId('user-menu-button', user.id, surface)}
      />
    );
  };

  return (
    <PageLayout
      maxWidth="narrow"
      title={pageTitle}
      action={
        isAdmin ? (
          <button
            type="button"
            className={sharedStyles.btnPrimary}
            ref={addUserButtonRef}
            onClick={() => setForm({ mode: 'new' })}
            data-testid="add-user-button"
          >
            {t('userManagement.addUser')}
          </button>
        ) : undefined
      }
    >
      <DataTable<UserListItem>
        pageKey="users"
        searchEverywhere={false}
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

      {form && (
        <ObjectForm
          key={form.mode === 'edit' ? form.user.id : 'new'}
          schema={userSchema}
          {...(userPrefill ? { prefill: userPrefill } : {})}
          returnFocusRef={form.mode === 'edit' ? editReturnRef : addUserButtonRef}
          onCreated={() => setForm(null)}
          onCancel={() => setForm(null)}
          testId="user-form"
        />
      )}

      {/* Deactivate confirmation */}
      {deactivatingUser && (
        <ConfirmDialog
          title={t('userManagement.deactivateModal.title', { name: deactivatingUser.displayName })}
          lead={t('userManagement.deactivateModal.message')}
          confirmLabel={t('userManagement.deactivateModal.confirm')}
          busyLabel={t('userManagement.deactivateModal.confirming')}
          busy={isDeactivating}
          error={deactivateError || null}
          onConfirm={() => void handleDeactivateConfirm()}
          onCancel={closeDeactivateModal}
          returnFocusRef={deactivateReturnRef}
          testIdPrefix="user-deactivate"
        />
      )}
    </PageLayout>
  );
}

export default UserManagementPage;
