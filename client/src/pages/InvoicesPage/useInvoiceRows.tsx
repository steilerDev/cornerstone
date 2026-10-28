import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { InvoiceDeposit, InvoiceListRow } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import type { BadgeVariantMap } from '../../components/Badge/Badge.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import { dataTableTestId } from '../../components/DataTable/dataTableTestId.js';
import type { ObjectListProps } from '../../components/ObjectList/ObjectList.js';
import type {
  ObjectListColumn,
  ObjectListExpandable,
  ObjectListSurface,
} from '../../components/ObjectList/types.js';
import type { OverflowMenuEntry } from '../../components/OverflowMenu/index.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUserText } from '../../hooks/useUserText.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { useFormatters } from '../../lib/formatters.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import shared from '../../styles/shared.module.css';
import { InvoiceMarkPaidCommand, ProgressPaymentMarkPaidCommand } from './InvoiceMarkPaid.js';
import type { InvoiceMarkPaidActions } from './InvoiceMarkPaid.js';
import type { InvoiceListMeta } from './useInvoicesList.js';
import {
  dueFlag,
  getDepositOrdinal,
  getOpenDeposits,
  hasOverdueOpenDeposit,
  isContainerOnly,
  todayIso,
} from './openItemsUtils.js';
import styles from './InvoicesPage.module.css';

/** The columns that only the Offers chip shows. */
const OFFER_COLUMN_KEYS = ['offered', 'offerPaid', 'remainingOnOffer', 'progressPayments'] as const;
const NO_HIDDEN_COLUMNS: readonly string[] = [];

type RowProps = Pick<
  ObjectListProps<InvoiceListRow, InvoiceListMeta, InvoiceDeposit>,
  | 'title'
  | 'renderSecondary'
  | 'columns'
  | 'hiddenColumnKeys'
  | 'renderStatus'
  | 'renderCommand'
  | 'rowMenu'
  | 'facts'
  | 'expandable'
>;

export interface UseInvoiceRowsOptions {
  /** The effective chip of the list (`list.query.chip`). */
  readonly chip: string;
  readonly actions: InvoiceMarkPaidActions;
}

/**
 * How the Invoices list draws a row: title, company link and badges, the columns (the Offers
 * columns only on the Offers chip), status, the Mark paid command, the card's three facts and the
 * progress payments as child rows.
 */
export function useInvoiceRows({ chip, actions }: UseInvoiceRowsOptions): RowProps {
  const { t } = useTranslation('budget');
  const { t: tCommon } = useTranslation('common');
  const { formatCurrency, formatDate } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const originState = useOriginState();
  const userText = useUserText();
  const today = useMemo(() => todayIso(), []);

  const flagVariants = useMemo(
    (): BadgeVariantMap => ({
      notYetSplit: {
        label: t('invoices.list.badges.notYetSplit'),
        className: badgeStyles.neutral!,
      },
      overdue: { label: t('invoices.list.badges.overdue'), className: badgeStyles.overduePast! },
      dueSoon: { label: t('invoices.list.badges.dueSoon'), className: badgeStyles.dueSoon! },
      progressPaymentOverdue: {
        label: t('invoices.list.badges.progressPaymentOverdue'),
        className: badgeStyles.overduePast!,
      },
      progressPaymentsOnly: {
        label: t('invoices.list.badges.progressPaymentsOnly'),
        className: badgeStyles.containerOnly!,
      },
    }),
    [t],
  );

  const titleText = (inv: InvoiceListRow): string =>
    inv.invoiceNumber ?? t('invoices.list.noNumber');

  /** Overdue / due soon of the invoice itself (only a pending invoice has one). */
  const ownFlag = (inv: InvoiceListRow): 'overdue' | 'dueSoon' | null =>
    inv.status === 'pending' ? dueFlag(inv.dueDate, today) : null;

  const companyLink = (inv: InvoiceListRow, surface: ObjectListSurface): ReactNode => (
    <NavAnchor
      to={routeUrl('company', { id: inv.vendorId })}
      state={originState}
      {...userText(shared.rowLink)}
      data-testid={dataTableTestId('invoices-company', inv.id, surface)}
    >
      {inv.vendorName}
    </NavAnchor>
  );

  const columns = useMemo(
    (): ObjectListColumn<InvoiceListRow>[] => [
      {
        key: 'date',
        label: t('invoices.list.columns.date'),
        sortValue: 'date',
        render: (inv) => formatDate(inv.date),
      },
      {
        key: 'dueDate',
        label: t('invoices.list.columns.dueDate'),
        sortValue: 'due_date',
        render: (inv) => (inv.dueDate ? formatDate(inv.dueDate) : '—'),
      },
      {
        key: 'amount',
        label: t('invoices.list.columns.amount'),
        sortValue: 'amount',
        align: 'end',
        render: (inv) => formatCurrency(inv.amount),
      },
      {
        key: 'stillDue',
        label: t('invoices.list.columns.stillDue'),
        align: 'end',
        render: (inv) => formatCurrency(inv.openAmount),
      },
      {
        key: 'allocated',
        label: t('invoices.list.columns.allocated'),
        defaultVisible: false,
        render: (inv) => {
          if (inv.budgetLines.length === 0 || inv.amount === 0) return '—';
          const itemized = inv.budgetLines.reduce((sum, line) => sum + line.itemizedAmount, 0);
          return t('invoices.list.splitPercent', {
            pct: Math.round((itemized / inv.amount) * 100),
          });
        },
      },
      {
        key: 'notes',
        label: t('invoices.list.columns.notes'),
        defaultVisible: false,
        width: 'wide',
        render: (inv) => (inv.notes ? <span className={styles.notes}>{inv.notes}</span> : '—'),
      },
      {
        key: 'offered',
        label: t('invoices.list.columns.offered'),
        align: 'end',
        render: (inv) => (inv.status === 'quotation' ? formatCurrency(inv.amount) : '—'),
      },
      {
        key: 'offerPaid',
        label: t('invoices.list.columns.offerPaid'),
        align: 'end',
        render: (inv) => (inv.status === 'quotation' ? formatCurrency(inv.paid) : '—'),
      },
      {
        key: 'remainingOnOffer',
        label: t('invoices.list.columns.remainingOnOffer'),
        align: 'end',
        render: (inv) =>
          inv.remainingOnOffer === null ? '—' : formatCurrency(inv.remainingOnOffer),
      },
      {
        key: 'progressPayments',
        label: t('invoices.list.columns.progressPayments'),
        align: 'end',
        render: (inv) =>
          inv.status === 'quotation'
            ? String(inv.deposits.filter((d) => d.entryType === 'deposit').length)
            : '—',
      },
    ],
    [t, formatCurrency, formatDate],
  );

  const hiddenColumnKeys = chip === 'quotation' ? NO_HIDDEN_COLUMNS : OFFER_COLUMN_KEYS;

  const expandable = useMemo((): ObjectListExpandable<InvoiceListRow, InvoiceDeposit> => {
    const getChildren = (inv: InvoiceListRow): readonly InvoiceDeposit[] =>
      chip === 'pending' ? getOpenDeposits(inv) : inv.deposits;
    const childName = (inv: InvoiceListRow, deposit: InvoiceDeposit): string => {
      const ordinal = getDepositOrdinal(inv, deposit);
      return ordinal ? t('invoices.list.child.ordinal', ordinal) : (inv.invoiceNumber ?? '');
    };
    const signedAmount = (deposit: InvoiceDeposit): string =>
      formatCurrency(deposit.entryType === 'refund' ? -deposit.amount : deposit.amount);
    const label = (inv: InvoiceListRow, deposit: InvoiceDeposit): ReactNode =>
      deposit.entryType === 'refund' ? (
        <Badge variants={statusVariants.refund} value="refund" />
      ) : (
        childName(inv, deposit)
      );
    const flag = (deposit: InvoiceDeposit, surface: ObjectListSurface): ReactNode => {
      if (deposit.status !== 'pending') return null;
      const value = dueFlag(deposit.dueDate, today);
      return value ? (
        <Badge
          variants={flagVariants}
          value={value}
          testId={dataTableTestId('invoices-child-flag', deposit.id, surface)}
        />
      ) : null;
    };
    const command = (inv: InvoiceListRow, deposit: InvoiceDeposit, surface: ObjectListSurface) => (
      <ProgressPaymentMarkPaidCommand
        inv={inv}
        deposit={deposit}
        name={childName(inv, deposit)}
        actions={actions}
        testId={dataTableTestId('invoices-child-command', deposit.id, surface)}
      />
    );
    const status = (deposit: InvoiceDeposit, surface: ObjectListSurface) => (
      <Badge
        variants={statusVariants.progressPayment}
        value={deposit.status}
        testId={dataTableTestId('invoices-child-status', deposit.id, surface)}
      />
    );

    return {
      getChildren,
      getChildKey: (deposit) => deposit.id,
      isDefaultExpanded: (inv) => chip === 'pending' && getChildren(inv).length > 0,
      getExpandLabel: (inv, expanded, count) =>
        expanded
          ? t('invoices.list.child.collapse', {
              title: inv.invoiceNumber ?? t('invoices.list.noNumber'),
              count,
            })
          : t('invoices.list.child.expand', {
              title: inv.invoiceNumber ?? t('invoices.list.noNumber'),
              count,
            }),
      renderChildTitle: (deposit, inv) => (
        <>
          <span className={shared.srOnly}>
            {t('invoices.list.child.partOf', {
              title: inv.invoiceNumber ?? t('invoices.list.noNumber'),
            })}
          </span>
          {label(inv, deposit)}
        </>
      ),
      renderChildStatus: (deposit) => status(deposit, 'table'),
      renderChildCommand: (deposit, inv) => command(inv, deposit, 'table'),
      renderChildCells: (deposit, _inv, keys) =>
        keys.map((key) => {
          switch (key) {
            case 'dueDate':
              return (
                <td key={key} className={styles.childCell}>
                  {formatDate(deposit.dueDate)}
                  {flag(deposit, 'table')}
                </td>
              );
            case 'amount':
              return (
                <td key={key} className={styles.childCellEnd}>
                  {signedAmount(deposit)}
                </td>
              );
            case 'stillDue':
              return (
                <td key={key} className={styles.childCellEnd}>
                  {deposit.status === 'pending' && deposit.entryType === 'deposit'
                    ? formatCurrency(deposit.amount)
                    : '—'}
                </td>
              );
            case 'notes':
              return (
                <td key={key} className={styles.childCell}>
                  {deposit.description ? <span {...userText()}>{deposit.description}</span> : '—'}
                </td>
              );
            default:
              return (
                <td key={key} className={styles.childCellMuted}>
                  —
                </td>
              );
          }
        }),
      renderChildCard: (deposit, inv) => (
        <div className={styles.childCard}>
          <span>{label(inv, deposit)}</span>
          <span>
            {formatDate(deposit.dueDate)}
            {flag(deposit, 'card')}
          </span>
          <span>{signedAmount(deposit)}</span>
          {status(deposit, 'card')}
          {command(inv, deposit, 'card')}
        </div>
      ),
    };
  }, [chip, t, today, formatCurrency, formatDate, statusVariants, flagVariants, actions, userText]);

  return {
    title: (inv) => ({
      text: titleText(inv),
      to: routeUrl('invoice', { id: inv.id }),
      isUserText: inv.invoiceNumber !== null,
    }),
    renderSecondary: (inv) => {
      const flag = ownFlag(inv);
      return (
        <>
          {companyLink(inv, 'table')}
          {inv.notYetSplit ? (
            <Badge
              variants={flagVariants}
              value="notYetSplit"
              testId={dataTableTestId('invoices-badge-not-yet-split', inv.id, 'table')}
            />
          ) : null}
          {flag ? (
            <Badge
              variants={flagVariants}
              value={flag}
              testId={dataTableTestId('invoices-badge-flag', inv.id, 'table')}
            />
          ) : null}
          {flag !== 'overdue' && hasOverdueOpenDeposit(inv, today) ? (
            <Badge
              variants={flagVariants}
              value="progressPaymentOverdue"
              testId={dataTableTestId('invoices-badge-progress-overdue', inv.id, 'table')}
            />
          ) : null}
          {chip === 'pending' && isContainerOnly(inv) ? (
            <Badge
              variants={flagVariants}
              value="progressPaymentsOnly"
              testId={dataTableTestId('invoices-badge-progress-only', inv.id, 'table')}
            />
          ) : null}
        </>
      );
    },
    columns,
    hiddenColumnKeys,
    renderStatus: (inv, surface) => {
      const flag = ownFlag(inv);
      return (
        <>
          <Badge
            variants={statusVariants.invoice}
            value={inv.status}
            testId={dataTableTestId('invoices-status', inv.id, surface)}
          />
          {surface === 'card' && flag ? (
            <Badge
              variants={flagVariants}
              value={flag}
              testId={dataTableTestId('invoices-badge-flag', inv.id, 'card')}
            />
          ) : null}
        </>
      );
    },
    renderCommand: (inv) => (
      <InvoiceMarkPaidCommand
        inv={inv}
        title={titleText(inv)}
        actions={actions}
        testId={dataTableTestId('invoices-mark-paid', inv.id, 'table')}
      />
    ),
    rowMenu: (inv, surface): readonly OverflowMenuEntry[] =>
      surface === 'card' && inv.status === 'pending'
        ? [
            {
              id: 'mark-paid',
              label: tCommon(I18N_UNION_KEYS.statusActionInvoice.key('markPaid')),
              onClick: () => void actions.markInvoicePaid(inv, titleText(inv)),
              testId: dataTableTestId('invoices-mark-paid', inv.id, 'card'),
            },
          ]
        : [],
    facts: (inv) =>
      inv.status === 'quotation'
        ? [
            { key: 'company', content: companyLink(inv, 'card') },
            {
              key: 'remaining',
              content: t('invoices.list.facts.remainingOnOffer', {
                amount: formatCurrency(inv.remainingOnOffer ?? 0),
              }),
            },
            {
              key: 'offered',
              content: t('invoices.list.facts.offered', { amount: formatCurrency(inv.amount) }),
            },
          ]
        : [
            { key: 'company', content: companyLink(inv, 'card') },
            {
              key: 'due',
              content: inv.dueDate
                ? t('invoices.list.facts.due', { date: formatDate(inv.dueDate) })
                : t('invoices.list.facts.noDueDate'),
            },
            { key: 'amount', content: formatCurrency(inv.amount) },
          ],
    expandable,
  };
}
