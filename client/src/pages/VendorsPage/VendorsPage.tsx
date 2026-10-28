import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { VendorListItem } from '@cornerstone/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { FormError } from '../../components/FormError/FormError.js';
import { ObjectList } from '../../components/ObjectList/ObjectList.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { TradesManager } from '../../components/TradesManager/TradesManager.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { useListRowDelete } from '../../hooks/useListRowDelete.js';
import { useTrades } from '../../hooks/useTrades.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { useOnObjectCreated } from '../../lib/objectCreatedEvents.js';
import { deleteVendor } from '../../lib/vendorsApi.js';
import { useOpenCreate } from '../../navigation/useOpenCreate.js';
import { useCompaniesList } from './useCompaniesList.js';
import type { CompanyListMeta, TradeDisplayName } from './useCompaniesList.js';
import { useCompanyRows } from './useCompanyRows.js';
import type { TradeListItem } from '@cornerstone/shared';

interface CompaniesListProps {
  readonly trades: readonly TradeListItem[];
  readonly tradesError: string | null;
  readonly displayName: TradeDisplayName;
  readonly refetchTrades: () => void;
}

/** The Companies list with its Trades sheet and row delete. */
function CompaniesList({ trades, tradesError, displayName, refetchTrades }: CompaniesListProps) {
  const { t } = useTranslation('budget');
  const { t: tCommon } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const openCreate = useOpenCreate();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  const { list, config, labels, scopeTotal } = useCompaniesList({
    trades,
    tradesFailed: tradesError !== null,
    displayName,
  });
  const { refresh } = list;
  useOnObjectCreated('company', refresh);

  // Trades sheet: ?trades=1. Opening pushes; closing pops when this page pushed it.
  const tradesOpen = searchParams.get('trades') === '1';
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
      const params = new URLSearchParams(searchParams);
      params.delete('trades');
      setSearchParams(params, { replace: true, state: location.state });
    }
  };
  const handleTradesChanged = () => {
    refetchTrades();
    refresh();
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

  const remove = useCallback((vendor: VendorListItem) => deleteVendor(vendor.id), []);
  const { request, deletion } = useListRowDelete<VendorListItem>({
    remove,
    onDeleted: refresh,
    blockedMessage: t('companies.list.deleteBlocked'),
  });
  const deleteConsequences = useDeleteImpact('vendor', deletion.item?.id ?? null);
  const rows = useCompanyRows({ displayName, onDelete: request });

  return (
    <ObjectList<VendorListItem, CompanyListMeta>
      list={list}
      config={config}
      labels={labels}
      primary={{
        label: t('companies.list.newCompany'),
        onClick: () => openCreate('company'),
        testId: 'new-company-button',
      }}
      menuItems={[
        {
          id: 'trades',
          label: t('companies.list.trades'),
          onClick: openTrades,
          testId: 'companies-menu-trades',
        },
      ]}
      titleHeader={t('companies.list.titleHeader')}
      {...rows}
      headingCount="always"
      scopeTotal={scopeTotal}
      hiddenColumnKeys={list.group === 'trade' ? ['trade'] : undefined}
      aboveList={tradesError ? <FormError message={tradesError} /> : undefined}
      headingRef={headingRef}
      menuTriggerRef={menuTriggerRef}
    >
      {tradesOpen ? (
        <TradesManager
          onClose={closeTrades}
          onChanged={handleTradesChanged}
          returnFocusRef={menuTriggerRef}
        />
      ) : null}
      {deletion.item ? (
        <ConfirmDialog
          title={tCommon('confirmDialog.deleteTitle', { name: deletion.item.name })}
          consequences={deleteConsequences}
          irreversible
          tone="danger"
          confirmLabel={tCommon('button.delete')}
          busyLabel={tCommon('confirmDialog.deleting')}
          busy={deletion.busy}
          error={deletion.error}
          blocked={deletion.blocked}
          onConfirm={deletion.confirm}
          onCancel={deletion.cancel}
          returnFocusRef={headingRef}
          testIdPrefix="company-list-delete"
        />
      ) : null}
    </ObjectList>
  );
}

/**
 * Companies: the list on the object template. The list mounts once the trades have answered
 * (their names make the chips, and a deep-linked trade chip is dropped while the options are empty).
 */
export function VendorsPage() {
  const { t: tCommon } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');
  useDocumentTitle(tCommon('navigation.companies'));
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { trades, isInitialLoading, error, refetch } = useTrades();

  const displayName = useCallback(
    (trade: { name: string; translationKey: string | null }) =>
      getCategoryDisplayName(tSettings, trade.name, trade.translationKey),
    [tSettings],
  );

  // ?create=1 is replaced by the New company dialog (deep-link mode).
  const createRequested = searchParams.get('create') === '1';
  useEffect(() => {
    if (createRequested) void navigate(routeUrl('companyNew'), { replace: true });
  }, [createRequested, navigate]);

  if (isInitialLoading) {
    return (
      <PageLayout title={tCommon('navigation.companies')}>
        <Skeleton />
      </PageLayout>
    );
  }
  return (
    <CompaniesList
      trades={trades}
      tradesError={error}
      displayName={displayName}
      refetchTrades={refetch}
    />
  );
}

export default VendorsPage;
