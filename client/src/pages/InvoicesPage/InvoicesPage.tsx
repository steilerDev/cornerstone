import { useRef } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { routeUrl } from '@cornerstone/shared';
import type { InvoiceDeposit, InvoiceListRow } from '@cornerstone/shared';
import { useOnObjectCreated } from '../../lib/objectCreatedEvents.js';
import { ObjectList } from '../../components/ObjectList/ObjectList.js';
import { SummaryStrip } from '../../components/SummaryStrip/SummaryStrip.js';
import type { SummaryFact } from '../../components/SummaryStrip/SummaryStrip.js';
import { useDocumentIntegration } from '../../hooks/useDocumentIntegration.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useFormatters } from '../../lib/formatters.js';
import { useActiveShowOnlyLabels } from './InvoiceListFilters.js';
import { InvoiceBulkMarkPaid, useInvoiceMarkPaid } from './InvoiceMarkPaid.js';
import { legacyInvoicesSearch } from './invoicesListUrl.js';
import { useInvoiceCreate } from './useInvoiceCreate.js';
import { useInvoiceRows } from './useInvoiceRows.js';
import { useInvoicesList } from './useInvoicesList.js';
import type { InvoiceListMeta } from './useInvoicesList.js';
import styles from './InvoicesPage.module.css';

/** Money › Invoices and offers: the Invoices list (To pay, Offers, Paid, Submitted, All). */
function InvoicesList() {
  const { t } = useTranslation('budget');
  const { t: tCommon } = useTranslation('common');
  const { formatCurrency } = useFormatters();
  useDocumentTitle(tCommon('navigation.invoices'));
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The list's filters need to know about Paperless; null until the status is known.
  const integration = useDocumentIntegration();
  const paperlessConfigured = integration.loaded ? integration.status?.configured === true : null;
  const { list, config, labels, meta, scopeTotal, searchingAll, refreshRows } = useInvoicesList({
    paperlessConfigured,
  });
  const { refresh } = list;
  const offersChip = list.query.chip === 'quotation';
  const create = useInvoiceCreate({ defaultKind: offersChip ? 'offer' : 'invoice' });
  useOnObjectCreated('invoice', refresh);
  useOnObjectCreated('offer', refresh);

  const actions = useInvoiceMarkPaid({ refreshRows, refresh, headingRef });
  const rows = useInvoiceRows({ chip: list.query.chip, actions });
  const activeShowOnly = useActiveShowOnlyLabels(list.query.filters);

  return (
    <ObjectList<InvoiceListRow, InvoiceListMeta, InvoiceDeposit>
      list={list}
      config={config}
      labels={labels}
      primary={{
        label: offersChip ? t('invoices.list.newOffer') : t('invoices.list.new'),
        onClick: () => create.open(),
        testId: 'new-invoice-button',
      }}
      titleHeader={t('invoices.list.titleHeader')}
      statusHeader={t('invoices.list.statusHeader')}
      {...rows}
      bulkActions={({ selected, clear }) => (
        <InvoiceBulkMarkPaid selected={selected} clear={clear} actions={actions} />
      )}
      searchingAll={searchingAll}
      scopeTotal={scopeTotal}
      aboveList={
        meta && offersChip ? (
          <div className={styles.offersSummary}>
            <SummaryStrip
              typeLabel={t('invoices.list.offers.summaryType')}
              facts={offerFacts(meta, t, formatCurrency)}
              testId="invoices-offers-summary"
            />
          </div>
        ) : undefined
      }
      summary={
        meta && list.query.chip === 'pending' ? (
          <div className={styles.footer} data-testid="invoices-footer">
            <span className={styles.footerLabel}>
              {list.filtersActive
                ? t('invoices.list.footer.stillToPayFiltered')
                : t('invoices.list.footer.stillToPay')}
            </span>
            <span
              className={styles.footerFigure}
              data-figure={list.filtersActive ? undefined : 'still-to-pay'}
              data-testid="invoices-footer-figure"
            >
              {formatCurrency(meta.listTotals.openPayable.totalAmount)}
            </span>
          </div>
        ) : undefined
      }
      note={
        activeShowOnly.length > 0
          ? t('invoices.list.filters.note', { filters: activeShowOnly.join(', ') })
          : undefined
      }
      headingRef={headingRef}
    />
  );
}

/** The four facts of the Offers chip: from the offers matching the list (parts, so no figure marker). */
function offerFacts(
  meta: InvoiceListMeta,
  t: TFunction<'budget'>,
  formatCurrency: (amount: number) => string,
): SummaryFact[] {
  const { offers } = meta.listTotals;
  return [
    {
      id: 'offers-count',
      kind: 'static',
      label: t('invoices.list.offers.count'),
      value: String(offers.count),
    },
    {
      id: 'offers-offered',
      kind: 'static',
      label: t('invoices.list.offers.offered'),
      value: formatCurrency(offers.amount),
    },
    {
      id: 'offers-paid',
      kind: 'static',
      label: t('invoices.list.offers.paid'),
      value: formatCurrency(offers.paid),
    },
    {
      id: 'offers-remaining',
      kind: 'static',
      label: t('invoices.list.offers.remaining'),
      value: formatCurrency(offers.remainingOnOffer),
    },
  ];
}

/**
 * The route element. The old `?openOnly=…` URL is rewritten with one `replace` before the list
 * mounts (`status=pending` for `true`), so the list's hooks never run on it.
 */
export function InvoicesPage() {
  const [params] = useSearchParams();
  const legacy = legacyInvoicesSearch(params);
  if (legacy) {
    const search = legacy.toString();
    return (
      <Navigate
        replace
        to={{ pathname: routeUrl('invoices'), search: search ? `?${search}` : '' }}
      />
    );
  }
  return <InvoicesList />;
}

export default InvoicesPage;
