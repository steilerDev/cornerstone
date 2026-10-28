import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { VendorListItem } from '@cornerstone/shared';
import { CallButton } from '../../components/CallButton/CallButton.js';
import { dataTableTestId } from '../../components/DataTable/dataTableTestId.js';
import type { DataTableSurface } from '../../components/DataTable/dataTableTestId.js';
import type { ObjectListProps } from '../../components/ObjectList/ObjectList.js';
import type { ObjectListColumn } from '../../components/ObjectList/types.js';
import type { OverflowMenuEntry } from '../../components/OverflowMenu/index.js';
import { useFormatters } from '../../lib/formatters.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import shared from '../../styles/shared.module.css';
import type { CompanyListMeta, TradeDisplayName } from './useCompaniesList.js';
import styles from './VendorsPage.module.css';

type RowProps = Pick<
  ObjectListProps<VendorListItem, CompanyListMeta>,
  'title' | 'columns' | 'rowMenu' | 'facts'
>;

/** "—" for the eye and "Not set" for a screen reader. */
function NotSet() {
  const { t } = useTranslation('common');
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className={shared.srOnly}>{t('summaryStrip.notSet')}</span>
    </>
  );
}

/** What is still owed to the company; muted at zero. A partial sum over this company, so the marker is the row-level still-to-pay figure. */
function StillToPay({
  vendor,
  surface,
}: {
  readonly vendor: VendorListItem;
  readonly surface: DataTableSurface;
}) {
  const { formatCurrency } = useFormatters();
  const owed = vendor.stillToPay ?? 0;
  return (
    <span
      className={owed > 0 ? styles.amount : `${styles.amount} ${styles.muted}`}
      data-figure="still-to-pay"
      data-testid={dataTableTestId('company-still-to-pay', vendor.id, surface)}
    >
      {formatCurrency(owed)}
    </span>
  );
}

/** The company's own number, else the first contact person's (#2213); null when neither. */
function phoneOf(vendor: VendorListItem): string | null {
  return vendor.phone?.trim() ? vendor.phone : (vendor.firstContactPhone ?? null);
}

export interface UseCompanyRowsOptions {
  readonly displayName: TradeDisplayName;
  readonly onDelete: (vendor: VendorListItem) => void;
}

/**
 * How the Companies list draws a row: the name link, the Trade, Phone (with Call), Still to pay,
 * Offers, Contact persons and Last on site columns, the optional detail columns, the ⋯ menu and
 * the card's three facts.
 */
export function useCompanyRows({ displayName, onDelete }: UseCompanyRowsOptions): RowProps {
  const { t } = useTranslation('budget');
  const { t: tCommon } = useTranslation('common');
  const { formatCurrency, formatDate } = useFormatters();
  const originState = useOriginState();
  const navigate = useNavigate();

  const columns = useMemo(
    (): ObjectListColumn<VendorListItem>[] => [
      {
        key: 'trade',
        label: t('companies.list.columns.trade'),
        sortValue: 'trade',
        render: (v) => (v.trade ? displayName(v.trade) : <NotSet />),
      },
      {
        key: 'phone',
        label: t('companies.list.columns.phone'),
        render: (v) => {
          const phone = phoneOf(v);
          if (phone === null) return <NotSet />;
          return (
            <span className={styles.phoneRow}>
              <CallButton
                phone={phone}
                name={v.name}
                className={styles.raised}
                testId={dataTableTestId('company-call', v.id, 'table')}
              />
              <span className={styles.phoneText}>{phone}</span>
            </span>
          );
        },
      },
      {
        key: 'stillToPay',
        label: t('companies.list.columns.stillToPay'),
        sortValue: 'still_to_pay',
        align: 'end',
        render: (v) => <StillToPay vendor={v} surface="table" />,
      },
      {
        key: 'offers',
        label: t('companies.list.columns.offers'),
        align: 'end',
        render: (v) => {
          const offers = v.offers;
          if (!offers || offers.count === 0) {
            return (
              <>
                <span aria-hidden="true">–</span>
                <span className={shared.srOnly}>{t('companies.list.noOffers')}</span>
              </>
            );
          }
          return (
            <>
              <span className={styles.amount}>{formatCurrency(offers.amount)}</span>
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
        align: 'end',
        render: (v) =>
          (v.contactCount ?? 0) > 0 ? (
            <span className={styles.amount}>{v.contactCount}</span>
          ) : (
            <NotSet />
          ),
      },
      {
        key: 'lastOnSite',
        label: t('companies.list.columns.lastOnSite'),
        sortValue: 'last_on_site',
        render: (v) => (v.lastOnSite ? formatDate(v.lastOnSite) : <NotSet />),
      },
      {
        key: 'email',
        label: t('companies.list.columns.email'),
        defaultVisible: false,
        render: (v) =>
          v.email ? (
            <a href={`mailto:${v.email}`} className={shared.rowLink}>
              {v.email}
            </a>
          ) : (
            <NotSet />
          ),
      },
      {
        key: 'address',
        label: t('companies.list.columns.address'),
        defaultVisible: false,
        render: (v) => v.address || <NotSet />,
      },
      {
        key: 'notes',
        label: t('companies.list.columns.notes'),
        defaultVisible: false,
        render: (v) =>
          v.notes ? (
            <span className={styles.notes} title={v.notes}>
              {v.notes}
            </span>
          ) : (
            <NotSet />
          ),
      },
      {
        key: 'createdAt',
        label: t('companies.list.columns.createdAt'),
        sortValue: 'created_at',
        defaultVisible: false,
        render: (v) => formatDate(v.createdAt),
      },
      {
        key: 'updatedAt',
        label: t('companies.list.columns.updatedAt'),
        sortValue: 'updated_at',
        defaultVisible: false,
        render: (v) => formatDate(v.updatedAt ?? v.createdAt),
      },
    ],
    [t, displayName, formatDate, formatCurrency],
  );

  return {
    title: (v) => ({ text: v.name, to: routeUrl('company', { id: v.id }), isUserText: true }),
    columns,
    rowMenu: (v, surface): readonly OverflowMenuEntry[] => [
      {
        id: 'open',
        label: t('companies.list.row.open'),
        onClick: () => void navigate(routeUrl('company', { id: v.id }), { state: originState }),
        testId: dataTableTestId('company-open', v.id, surface),
      },
      {
        id: 'delete',
        label: tCommon('button.delete'),
        variant: 'destructive',
        onClick: () => onDelete(v),
        testId: dataTableTestId('company-delete', v.id, surface),
      },
    ],
    facts: (v) => {
      const phone = phoneOf(v);
      return [
        {
          key: 'trade',
          keep: true,
          content: v.trade ? displayName(v.trade) : <NotSet />,
        },
        { key: 'stillToPay', content: <StillToPay vendor={v} surface="card" /> },
        {
          key: 'call',
          content:
            phone === null ? (
              <NotSet />
            ) : (
              <CallButton
                showNumber
                phone={phone}
                name={v.name}
                className={styles.raised}
                testId={dataTableTestId('company-call', v.id, 'card')}
              />
            ),
        },
      ];
    },
  };
}
