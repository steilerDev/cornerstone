import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { VendorListItem, VendorListQuery } from '@cornerstone/shared';
import { CallButton } from '../../components/CallButton/CallButton.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { DataTable } from '../../components/DataTable/DataTable.js';
import type { ColumnDef, TableState } from '../../components/DataTable/DataTable.js';
import { dataTableTestId } from '../../components/DataTable/dataTableTestId.js';
import type { DataTableSurface } from '../../components/DataTable/dataTableTestId.js';
import { FilterChipGroup } from '../../components/FilterChipGroup/FilterChipGroup.js';
import { OverflowMenu } from '../../components/OverflowMenu/OverflowMenu.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { TradesManager } from '../../components/TradesManager/TradesManager.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { createReservedParams } from '../../hooks/useCreateQuery.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { useTableState } from '../../hooks/useTableState.js';
import { useTrades } from '../../hooks/useTrades.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { focusPageHeading } from '../../lib/focusPageHeading.js';
import { useFormatters } from '../../lib/formatters.js';
import { matchTradeIds, sortTradesByDisplayName } from '../../lib/tradeSearch.js';
import { deleteVendor, fetchVendors } from '../../lib/vendorsApi.js';
import { useOpenCreate } from '../../navigation/useOpenCreate.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './VendorsPage.module.css';

// `create` is consumed here (it opens the New company dialog); `trades` opens the Trades sheet.
const COMPANIES_RESERVED = [...createReservedParams(), 'trades'];

const NOTES_PREVIEW_LENGTH = 60;
const ALL_TRADES = 'all';

export function VendorsPage() {
  const { t } = useTranslation('budget');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { t: tSettings, i18n } = useTranslation('settings');
  useDocumentTitle(tCommon('navigation.companies'));
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const originState = useOriginState();
  const openCreate = useOpenCreate();
  const { formatDate, formatCurrency } = useFormatters();
  const {
    trades,
    isInitialLoading: tradesLoading,
    error: tradesError,
    refetch: refetchTrades,
  } = useTrades();

  // Data state
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);

  const { tableState, toApiParams } = useTableState({
    defaultPageSize: 25,
    reservedParams: COMPANIES_RESERVED,
  });

  const displayName = useCallback(
    (trade: { name: string; translationKey: string | null }) =>
      getCategoryDisplayName(tSettings, trade.name, trade.translationKey),
    [tSettings],
  );
  const sortedTrades = useMemo(
    () => sortTradesByDisplayName(trades, displayName, i18n.language),
    [trades, displayName, i18n.language],
  );
  const activeTradeId = tableState.filters.get('tradeId')?.value ?? null;

  // The request, keyed by a string so opening or closing the Trades sheet (a URL change) does
  // not refetch the list.
  const requestKey = useMemo(() => {
    const tradeIds = matchTradeIds(tableState.search, trades, displayName);
    return JSON.stringify({
      params: toApiParams(),
      tradeIds: tradeIds.length > 0 ? tradeIds.join(',') : null,
      reloadTick,
    });
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- toApiParams derives from tableState
  }, [tableState, trades, displayName, reloadTick]);

  const requestCounterRef = useRef(0);
  // Row index to refocus once the reload that follows a delete has settled.
  const pendingDeleteFocusRef = useRef<{ index: number; sawLoading: boolean } | null>(null);

  useEffect(() => {
    const requestId = ++requestCounterRef.current;
    const { params, tradeIds } = JSON.parse(requestKey) as {
      params: VendorListQuery;
      tradeIds: string | null;
    };
    /* eslint-disable @eslint-react/set-state-in-effect -- loading flag of the request this effect starts */
    setIsLoading(true);
    setError('');
    /* eslint-enable @eslint-react/set-state-in-effect */
    fetchVendors({ ...params, tradeIds: tradeIds ?? undefined })
      .then((response) => {
        if (requestId !== requestCounterRef.current) return;
        setVendors(response.vendors);
        setTotalPages(response.pagination.totalPages);
        setTotalItems(response.pagination.totalItems);
      })
      .catch((err: unknown) => {
        if (requestId !== requestCounterRef.current) return;
        setError(
          err instanceof ApiClientError
            ? translateApiError(err.error.code, tErrors)
            : t('companies.list.loadError'),
        );
      })
      .finally(() => {
        if (requestId === requestCounterRef.current) setIsLoading(false);
      });
  }, [requestKey, t, tErrors]);

  // URL writes that are view changes (search, sort, page, chip) replace; the router state stays.
  const writeParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams);
      mutate(params);
      setSearchParams(params, { replace: true, state: location.state });
    },
    [searchParams, setSearchParams, location.state],
  );

  const handleStateChange = (newState: TableState) => {
    writeParams((params) => {
      if (newState.search) params.set('q', newState.search);
      else params.delete('q');
      if (newState.sortBy) {
        params.set('sortBy', newState.sortBy);
        params.set('sortOrder', newState.sortDir ?? 'asc');
      } else {
        params.delete('sortBy');
        params.delete('sortOrder');
      }
      params.set('page', String(newState.page));
      params.set('pageSize', String(newState.pageSize));
      params.delete('tradeId');
      for (const [paramKey, filter] of newState.filters.entries()) {
        if (filter.value) params.set(paramKey, filter.value);
      }
    });
  };

  const handleTradeChip = (value: string) => {
    writeParams((params) => {
      if (value === ALL_TRADES) params.delete('tradeId');
      else params.set('tradeId', value);
      params.set('page', '1');
    });
  };

  // A trade filter whose trade was merged or deleted is dropped.
  useEffect(() => {
    if (tradesLoading || tradesError || !activeTradeId) return;
    if (!trades.some((tr) => tr.id === activeTradeId)) {
      writeParams((params) => params.delete('tradeId'));
    }
  }, [tradesLoading, tradesError, activeTradeId, trades, writeParams]);

  // ?create=1 is replaced by the New company dialog (deep-link mode).
  const createRequested = searchParams.get('create') === '1';
  useEffect(() => {
    if (createRequested) void navigate(routeUrl('companyNew'), { replace: true });
  }, [createRequested, navigate]);

  // Trades sheet: ?trades=1. Opening pushes; closing pops when this page pushed it.
  const tradesOpen = searchParams.get('trades') === '1';
  const tradesButtonRef = useRef<HTMLButtonElement>(null);
  const openTrades = () => {
    const params = new URLSearchParams(searchParams);
    params.set('trades', '1');
    void navigate(
      { pathname: location.pathname, search: `?${params.toString()}` },
      {
        state: {
          ...(typeof location.state === 'object' && location.state !== null ? location.state : {}),
          tradesSheet: true,
        },
      },
    );
  };
  const closeTrades = () => {
    const pushedHere = (location.state as { tradesSheet?: unknown } | null)?.tradesSheet === true;
    if (pushedHere) {
      void navigate(-1);
    } else {
      writeParams((params) => params.delete('trades'));
    }
  };
  const handleTradesChanged = () => {
    refetchTrades();
    setReloadTick((n) => n + 1);
  };

  const shortcuts = useMemo(
    () =>
      tradesOpen
        ? []
        : [
            {
              key: 'n',
              handler: () => openCreate('company'),
              description: tCommon('listShortcuts.newCompany'),
            },
          ],
    [tradesOpen, openCreate, tCommon],
  );
  useKeyboardShortcuts(shortcuts);

  // Delete
  const [deletingVendor, setDeletingVendor] = useState<VendorListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const deleteImpact = useDeleteImpact('vendor', deletingVendor?.id ?? null);

  // The ⋯ that opened the confirm: Cancel returns focus there (the menu item is gone by then).
  const deleteReturnRef = useRef<HTMLElement | null>(null);

  const openDelete = (vendor: VendorListItem, surface: DataTableSurface) => {
    deleteReturnRef.current = document.querySelector<HTMLElement>(
      `[data-testid="${dataTableTestId('company-actions', vendor.id, surface)}"]`,
    );
    setDeletingVendor(vendor);
    setDeleteError('');
    setDeleteBlocked(false);
  };

  const closeDelete = () => {
    if (isDeleting) return;
    setDeletingVendor(null);
    setDeleteError('');
    setDeleteBlocked(false);
  };

  const confirmDelete = async () => {
    if (!deletingVendor) return;
    const index = vendors.findIndex((v) => v.id === deletingVendor.id);
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteVendor(deletingVendor.id);
      // Confirmed: focus goes to the reloaded list (below), not back to the removed row's ⋯.
      deleteReturnRef.current = null;
      pendingDeleteFocusRef.current = { index, sawLoading: false };
      setDeletingVendor(null);
      setReloadTick((n) => n + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteBlocked(err.statusCode === 409);
        setDeleteError(
          err.statusCode === 409
            ? t('companies.list.deleteBlocked')
            : translateApiError(err.error.code, tErrors),
        );
      } else {
        setDeleteError(t('companies.list.deleteFailed'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // After a delete and the reload: the name link of the row now at that index, else the one
  // before it, else the page heading. Table and cards are both mounted, so only visible links count.
  useEffect(() => {
    const pending = pendingDeleteFocusRef.current;
    if (pending === null) return;
    if (isLoading) {
      pending.sawLoading = true;
      return;
    }
    if (!pending.sawLoading) return;
    const { index } = pending;
    pendingDeleteFocusRef.current = null;
    const links = Array.from(
      document.querySelectorAll<HTMLElement>('[data-company-name-link]'),
    ).filter((el) => el.offsetParent !== null);
    const target = links[index] ?? links[index - 1];
    if (target) target.focus();
    else focusPageHeading();
  }, [isLoading, vendors]);

  const unfilteredEmpty =
    !isLoading && !error && totalItems === 0 && !tableState.search && activeTradeId === null;

  const columns = useMemo(
    (): ColumnDef<VendorListItem>[] => [
      {
        key: 'name',
        label: t('companies.list.columns.name'),
        sortable: true,
        sortKey: 'name',
        defaultVisible: true,
        className: styles.nameCell,
        render: (v, surface) => (
          <Link
            to={routeUrl('company', { id: v.id })}
            state={originState}
            className={styles.nameLink}
            title={v.name}
            onClick={(event) => event.stopPropagation()}
            data-company-name-link=""
            data-testid={dataTableTestId('company-name', v.id, surface)}
          >
            {v.name}
          </Link>
        ),
      },
      {
        key: 'trade',
        label: t('companies.list.columns.trade'),
        sortable: true,
        sortKey: 'trade',
        defaultVisible: true,
        render: (v) => (v.trade ? displayName(v.trade) : '—'),
      },
      {
        key: 'phone',
        label: t('companies.list.columns.phone'),
        sortable: false,
        defaultVisible: true,
        className: styles.phoneCell,
        render: (v, surface) => {
          const phone = v.phone?.trim() ? v.phone : (v.firstContactPhone ?? null);
          if (!phone) return '—';
          return (
            <span className={styles.phoneRow}>
              <CallButton
                phone={phone}
                name={v.name}
                testId={dataTableTestId('company-call', v.id, surface)}
                onClick={(event) => event.stopPropagation()}
              />
              <span className={styles.phoneText}>{phone}</span>
            </span>
          );
        },
        renderCard: (v) => {
          const phone = v.phone?.trim() ? v.phone : (v.firstContactPhone ?? null);
          if (!phone) return null;
          return (
            <CallButton
              showNumber
              fullWidth
              phone={phone}
              name={v.name}
              testId={dataTableTestId('company-call', v.id, 'card')}
              onClick={(event) => event.stopPropagation()}
            />
          );
        },
      },
      {
        key: 'stillToPay',
        label: t('companies.list.columns.stillToPay'),
        sortable: true,
        sortKey: 'still_to_pay',
        defaultVisible: true,
        className: styles.amountCell,
        headerClassName: styles.amountHeader,
        render: (v, surface) => (
          <span
            data-figure="still-to-pay"
            data-testid={dataTableTestId('company-still-to-pay', v.id, surface)}
            className={(v.stillToPay ?? 0) > 0 ? undefined : styles.muted}
          >
            {formatCurrency(v.stillToPay ?? 0)}
          </span>
        ),
      },
      {
        key: 'offers',
        label: t('companies.list.columns.offers'),
        sortable: false,
        defaultVisible: true,
        className: styles.amountCell,
        headerClassName: styles.amountHeader,
        render: (v) => {
          const offers = v.offers;
          if (!offers || offers.count === 0) {
            return (
              <>
                <span aria-hidden="true">–</span>
                <span className={sharedStyles.srOnly}>{t('companies.list.noOffers')}</span>
              </>
            );
          }
          return (
            <>
              <span>{formatCurrency(offers.amount)}</span>
              <span className={styles.subline}>
                {t('companies.list.offersPaid', { amount: formatCurrency(offers.paid) })}
              </span>
            </>
          );
        },
      },
      {
        key: 'contactCount',
        label: t('companies.list.columns.contactPersons'),
        sortable: false,
        defaultVisible: true,
        className: styles.countCell,
        headerClassName: styles.countHeader,
        render: (v) => ((v.contactCount ?? 0) > 0 ? String(v.contactCount) : '—'),
      },
      {
        key: 'lastOnSite',
        label: t('companies.list.columns.lastOnSite'),
        sortable: true,
        sortKey: 'last_on_site',
        defaultVisible: true,
        render: (v) => (v.lastOnSite ? formatDate(v.lastOnSite) : '—'),
      },
      {
        key: 'email',
        label: t('companies.list.columns.email'),
        sortable: false,
        defaultVisible: false,
        render: (v) =>
          v.email ? (
            <a
              href={`mailto:${v.email}`}
              className={styles.contactLink}
              onClick={(event) => event.stopPropagation()}
            >
              {v.email}
            </a>
          ) : (
            '—'
          ),
      },
      {
        key: 'address',
        label: t('companies.list.columns.address'),
        sortable: false,
        defaultVisible: false,
        render: (v) => v.address || '—',
      },
      {
        key: 'notes',
        label: t('companies.list.columns.notes'),
        sortable: false,
        defaultVisible: false,
        render: (v) => {
          if (!v.notes) return '—';
          return v.notes.length > NOTES_PREVIEW_LENGTH
            ? `${v.notes.substring(0, NOTES_PREVIEW_LENGTH)}…`
            : v.notes;
        },
      },
      {
        key: 'createdAt',
        label: t('companies.list.columns.createdAt'),
        sortable: true,
        sortKey: 'created_at',
        defaultVisible: false,
        render: (v) => formatDate(v.createdAt),
      },
      {
        key: 'updatedAt',
        label: t('companies.list.columns.updatedAt'),
        sortable: true,
        sortKey: 'updated_at',
        defaultVisible: false,
        render: (v) => formatDate(v.updatedAt ?? v.createdAt),
      },
    ],
    [t, displayName, formatDate, formatCurrency, originState],
  );

  const renderActions = (vendor: VendorListItem, surface: DataTableSurface) => (
    <OverflowMenu
      usePortal
      triggerAriaLabel={t('companies.list.actionsFor', { name: vendor.name })}
      data-testid={dataTableTestId('company-actions', vendor.id, surface)}
      items={[
        {
          id: 'delete',
          label: tCommon('button.delete'),
          variant: 'destructive',
          onClick: () => openDelete(vendor, surface),
          testId: dataTableTestId('company-delete', vendor.id, surface),
        },
      ]}
    />
  );

  const tradeChips =
    trades.length > 0 ? (
      <FilterChipGroup
        ariaLabel={t('companies.list.tradeFilterLabel')}
        testIdPrefix="company-trade"
        value={activeTradeId ?? ALL_TRADES}
        onChange={handleTradeChip}
        options={[
          { value: ALL_TRADES, label: t('companies.list.allTrades') },
          ...sortedTrades.map((tr) => ({ value: tr.id, label: displayName(tr) })),
        ]}
      />
    ) : undefined;

  return (
    <PageLayout
      title={tCommon('navigation.companies')}
      action={
        <div className={styles.actions}>
          <button
            ref={tradesButtonRef}
            type="button"
            className={sharedStyles.btnSecondary}
            onClick={openTrades}
            data-testid="companies-trades-button"
          >
            {t('companies.list.trades')}
          </button>
          {!unfilteredEmpty && (
            <button
              type="button"
              className={sharedStyles.btnPrimary}
              onClick={() => openCreate('company')}
              data-testid="new-company-button"
            >
              {t('companies.list.newCompany')}
            </button>
          )}
        </div>
      }
    >
      <DataTable<VendorListItem>
        pageKey="companies"
        columns={columns}
        items={vendors}
        totalItems={totalItems}
        totalPages={totalPages}
        currentPage={tableState.page}
        isLoading={isLoading}
        error={error}
        getRowKey={(v) => v.id}
        onRowClick={(v) => navigate(routeUrl('company', { id: v.id }), { state: originState })}
        renderActions={renderActions}
        tableState={tableState}
        onStateChange={handleStateChange}
        customFilters={tradeChips}
        emptyState={{
          message: t('companies.list.emptyTitle'),
          description: t('companies.list.emptyDescription'),
          action: {
            label: t('companies.list.newCompany'),
            onClick: () => openCreate('company'),
          },
        }}
      />

      {tradesOpen && (
        <TradesManager
          onClose={closeTrades}
          onChanged={handleTradesChanged}
          returnFocusRef={tradesButtonRef}
        />
      )}

      {deletingVendor && (
        <ConfirmDialog
          title={tCommon('confirmDialog.deleteTitle', { name: deletingVendor.name })}
          consequences={deleteImpact}
          irreversible
          confirmLabel={tCommon('button.delete')}
          busyLabel={tCommon('confirmDialog.deleting')}
          busy={isDeleting}
          blocked={deleteBlocked}
          error={deleteError || null}
          onConfirm={() => void confirmDelete()}
          onCancel={closeDelete}
          returnFocusRef={deleteReturnRef}
          testIdPrefix="company-list-delete"
        />
      )}
    </PageLayout>
  );
}

export default VendorsPage;
