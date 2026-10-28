import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { HouseholdItemListRow } from '@cornerstone/shared';
import { AreaBreadcrumb } from '../../components/AreaBreadcrumb/AreaBreadcrumb.js';
import { AreaLink } from '../../components/AreaLink/AreaLink.js';
import { Badge } from '../../components/Badge/Badge.js';
import { GrantChips } from '../../components/Badge/GrantChips.js';
import { dataTableTestId } from '../../components/DataTable/dataTableTestId.js';
import type { ObjectListProps } from '../../components/ObjectList/ObjectList.js';
import type { ObjectListColumn } from '../../components/ObjectList/types.js';
import type { OverflowMenuEntry } from '../../components/OverflowMenu/index.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUserText } from '../../hooks/useUserText.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { useFormatters } from '../../lib/formatters.js';
import { areaPathLabel } from '../../lib/home/recentAreas.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import shared from '../../styles/shared.module.css';
import type { PurchaseCategories } from './PurchaseListFilters.js';
import type { PurchaseListMeta } from './usePurchasesList.js';
import styles from './HouseholdItemsPage.module.css';

type RowProps = Pick<
  ObjectListProps<HouseholdItemListRow, PurchaseListMeta>,
  'title' | 'renderSecondary' | 'columns' | 'renderStatus' | 'rowMenu' | 'facts'
>;

/** "—" for the eye and "Not set" for a screen reader. */
function NotSet() {
  const { t } = useTranslation('householdItems');
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className={shared.srOnly}>{t('list.row.notSet')}</span>
    </>
  );
}

/** The date a purchase arrived, else its target delivery date; null when it has neither. */
function deliveryOf(item: HouseholdItemListRow): { date: string; delivered: boolean } | null {
  if (item.status === 'arrived' && item.actualDeliveryDate) {
    return { date: item.actualDeliveryDate, delivered: true };
  }
  return item.targetDeliveryDate ? { date: item.targetDeliveryDate, delivered: false } : null;
}

export interface UsePurchaseRowsOptions {
  readonly categories: PurchaseCategories;
  readonly requestDelete: (item: HouseholdItemListRow) => void;
}

/**
 * How the Purchases list draws a row: title with the category and grant chips, the Area,
 * Company, Delivery, Expected cost and Invoiced columns (and the hidden-by-default ones), the
 * status, the ⋯ menu and the card's three facts.
 */
export function usePurchaseRows({ categories, requestDelete }: UsePurchaseRowsOptions): RowProps {
  const { t } = useTranslation('householdItems');
  const { t: tCommon } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');
  const { formatCurrency, formatDate } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const originState = useOriginState();
  const navigate = useNavigate();
  const userText = useUserText();

  const categoryNames = useMemo(
    () =>
      new Map(
        categories.categories.map((category) => [
          category.id,
          getCategoryDisplayName(tSettings, category.name, category.translationKey),
        ]),
      ),
    [categories.categories, tSettings],
  );

  const columns = useMemo((): ObjectListColumn<HouseholdItemListRow>[] => {
    const money = (amount: number | null) =>
      amount === null ? (
        <NotSet />
      ) : (
        <span className={styles.amount}>{formatCurrency(amount)}</span>
      );
    return [
      {
        key: 'area',
        label: t('list.columns.area'),
        render: (item) =>
          item.area ? (
            <AreaLink
              areaId={item.area.id}
              className={styles.areaLink}
              testId={dataTableTestId('purchases-area', item.id, 'table')}
            >
              {areaPathLabel(item.area)}
            </AreaLink>
          ) : (
            <span className={styles.muted}>{t('list.group.noArea')}</span>
          ),
      },
      {
        key: 'company',
        label: t('list.columns.company'),
        render: (item) =>
          item.vendor ? (
            <NavAnchor
              to={routeUrl('company', { id: item.vendor.id })}
              state={originState}
              {...userText(shared.rowLink)}
              data-testid={dataTableTestId('purchases-company', item.id, 'table')}
            >
              {item.vendor.name}
            </NavAnchor>
          ) : (
            <NotSet />
          ),
      },
      {
        key: 'delivery',
        label: t('list.columns.delivery'),
        sortValue: 'delivery',
        render: (item) => {
          const delivery = deliveryOf(item);
          if (delivery === null) return <NotSet />;
          return (
            <>
              <span className={shared.srOnly}>
                {delivery.delivered ? t('list.row.delivered') : t('list.row.target')}{' '}
              </span>
              {formatDate(delivery.date)}
            </>
          );
        },
      },
      {
        key: 'expectedCost',
        label: t('list.columns.expectedCost'),
        sortValue: 'expected_cost',
        align: 'end',
        render: (item) => money(item.expectedCost),
      },
      {
        key: 'invoiced',
        label: t('list.columns.invoiced'),
        sortValue: 'invoiced',
        align: 'end',
        render: (item) => {
          const { totalActual } = item.budgetSummary;
          return (
            <span
              className={totalActual === 0 ? `${styles.amount} ${styles.muted}` : styles.amount}
            >
              {formatCurrency(totalActual)}
            </span>
          );
        },
      },
      {
        key: 'category',
        label: t('list.columns.category'),
        sortValue: 'category',
        defaultVisible: false,
        render: (item) => categoryNames.get(item.category) ?? <NotSet />,
      },
      {
        key: 'orderDate',
        label: t('list.columns.orderDate'),
        sortValue: 'order_date',
        defaultVisible: false,
        render: (item) => (item.orderDate ? formatDate(item.orderDate) : <NotSet />),
      },
      {
        key: 'grants',
        label: t('list.columns.grants'),
        align: 'end',
        defaultVisible: false,
        render: (item) => money(item.budgetSummary.subsidyReduction),
      },
      {
        key: 'afterGrants',
        label: t('list.columns.afterGrants'),
        align: 'end',
        defaultVisible: false,
        render: (item) => money(item.afterGrants),
      },
      {
        key: 'costLines',
        label: t('list.columns.costLines'),
        align: 'end',
        defaultVisible: false,
        render: (item) => item.budgetLineCount,
      },
    ];
  }, [t, formatCurrency, formatDate, originState, userText, categoryNames]);

  return {
    title: (item) => ({
      text: item.name,
      to: routeUrl('householdItem', { id: item.id }),
      isUserText: true,
    }),
    renderSecondary: (item) => {
      const category = categoryNames.get(item.category);
      return (
        <>
          {category ? <span className={styles.categoryLine}>{category}</span> : null}
          <GrantChips
            grants={item.grants}
            testId={dataTableTestId('household-item-grants', item.id, 'table')}
          />
        </>
      );
    },
    columns,
    renderStatus: (item, surface) => (
      <Badge
        variants={statusVariants.purchase}
        value={item.status}
        testId={dataTableTestId('purchases-status', item.id, surface)}
      />
    ),
    rowMenu: (item, surface): readonly OverflowMenuEntry[] => [
      {
        id: 'open',
        label: t('list.row.open'),
        onClick: () =>
          void navigate(routeUrl('householdItem', { id: item.id }), { state: originState }),
        testId: dataTableTestId('purchases-open', item.id, surface),
      },
      {
        id: 'delete',
        label: tCommon('button.delete'),
        variant: 'destructive',
        onClick: () => requestDelete(item),
        testId: dataTableTestId('purchases-delete', item.id, surface),
      },
    ],
    facts: (item) => {
      const delivery = deliveryOf(item);
      return [
        {
          key: 'area',
          keep: true,
          content: <AreaBreadcrumb area={item.area} variant="compact" />,
        },
        { key: 'delivery', content: delivery ? formatDate(delivery.date) : <NotSet /> },
        {
          key: 'expectedCost',
          content: item.expectedCost === null ? <NotSet /> : formatCurrency(item.expectedCost),
        },
      ];
    },
  };
}
