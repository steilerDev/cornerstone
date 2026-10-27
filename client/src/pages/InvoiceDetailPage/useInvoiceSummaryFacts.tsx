import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isRouteServed, routeUrl } from '@cornerstone/shared';
import type { ServedRouteId } from '@cornerstone/shared';
import type { InvoiceDetail } from '@cornerstone/shared';
import { remainingState } from '../../components/CostLineTable/costLineRows.js';
import type { UseInvoiceCostLinesResult } from '../../components/CostLineTable/useInvoiceCostLines.js';
import type { ObjectTabsController } from '../../components/ObjectTabs/useObjectTabs.js';
import type { SummaryFact } from '../../components/SummaryStrip/SummaryStrip.js';
import { useFormatters } from '../../lib/formatters.js';
import { todayLocalIsoDate } from '../../lib/localDate.js';
import type { OriginState } from '../../navigation/origin.js';
import { invoiceSources } from './invoiceSources.js';
import styles from './InvoiceDetailPage.module.css';

export interface UseInvoiceSummaryFactsArgs {
  readonly invoice: InvoiceDetail;
  readonly costLines: UseInvoiceCostLinesResult;
  /** The Documents fact from `useDocumentsPanel`; null while pending or hidden. */
  readonly documentsFact: SummaryFact | null;
  readonly tabs: ObjectTabsController;
  readonly originState: OriginState;
}

/** Where a funding source lives: its own page once served, otherwise the interim list. */
function fundingSourceUrl(id: string): string {
  return isRouteServed('fundingSource')
    ? // 'fundingSource' is planned, so routeUrl's types reject it until the route is served.
      (routeUrl as unknown as (route: ServedRouteId, params: { id: string }) => string)(
        'fundingSource' as ServedRouteId,
        { id },
      )
    : routeUrl('budgetSources');
}

/** The summary strip facts of an offer or invoice: amount, paid, still to pay, due, split, source. */
export function useInvoiceSummaryFacts({
  invoice,
  costLines,
  documentsFact,
  tabs,
  originState,
}: UseInvoiceSummaryFactsArgs): SummaryFact[] {
  const { t } = useTranslation('budget');
  const { formatCurrency, formatDate, formatPercent } = useFormatters();
  // Captured once so the Overdue wording cannot flip during a render pass.
  const [today] = useState(() => todayLocalIsoDate());
  const isOffer = invoice.status === 'quotation';
  const { lines, budgetSources, remainingAmount, loading } = costLines;
  const sources = useMemo(() => invoiceSources(lines, budgetSources), [lines, budgetSources]);

  return useMemo(() => {
    const facts: SummaryFact[] = [];
    facts.push({
      id: 'amount',
      kind: 'static',
      label: t('invoicePage.facts.amount'),
      value: formatCurrency(invoice.amount),
    });
    facts.push({
      id: 'paid',
      kind: 'tab',
      href: tabs.hrefFor('payments'),
      onActivate: () => tabs.select('payments', { focusPanel: true }),
      label: t('invoicePage.facts.paid'),
      value: formatCurrency(invoice.paid),
      figureKind: 'paid',
    });
    if (isOffer) {
      facts.push({
        id: 'remainingOnOffer',
        kind: 'static',
        label: t('invoicePage.facts.remainingOnOffer'),
        value: formatCurrency(invoice.remainingOnOffer ?? 0),
      });
    } else {
      facts.push({
        id: 'stillToPay',
        kind: 'static',
        label: t('invoicePage.facts.stillToPay'),
        value: formatCurrency(invoice.openAmount),
        figureKind: 'still-to-pay',
      });
    }

    const dueDate = invoice.dueDate ? invoice.dueDate.slice(0, 10) : null;
    const overdue = invoice.status === 'pending' && dueDate !== null && dueDate < today;
    facts.push({
      id: 'due',
      kind: 'static',
      label: t('invoicePage.facts.due'),
      value:
        dueDate === null
          ? null
          : overdue
            ? t('invoicePage.facts.overdue', { date: formatDate(dueDate) })
            : formatDate(dueDate),
    });

    const share = invoice.amount > 0 ? (invoice.amount - remainingAmount) / invoice.amount : 0;
    let suffix: string | null = null;
    if (remainingState(remainingAmount) === 'over') {
      suffix = t('invoicePage.facts.over', { amount: formatCurrency(-remainingAmount) });
    } else if (invoice.notYetSplit) {
      suffix = t('invoicePage.facts.notYetSplit', { amount: formatCurrency(remainingAmount) });
    }
    facts.push({
      id: 'split',
      kind: 'tab',
      href: tabs.hrefFor('cost'),
      onActivate: () => tabs.select('cost', { focusPanel: true }),
      label: t('invoicePage.facts.split'),
      value: loading ? null : (
        <>
          {formatPercent(share * 100, 0)}
          {suffix ? (
            <span className={styles.splitRemainder}>
              {' · '}
              {suffix}
            </span>
          ) : null}
        </>
      ),
      wide: suffix !== null,
    });

    const [first] = sources;
    const sourceValue =
      first === undefined
        ? null
        : sources.length === 1
          ? first.name
          : t('invoicePage.facts.fundingSourceMore', {
              name: first.name,
              count: sources.length - 1,
            });
    facts.push({
      id: 'fundingSource',
      kind: 'link',
      to: sources.length === 1 && first ? fundingSourceUrl(first.id) : routeUrl('budgetSources'),
      state: originState,
      label: t('invoicePage.facts.fundingSource'),
      value: loading ? null : sourceValue,
    });

    if (documentsFact) facts.push(documentsFact);
    return facts;
  }, [
    t,
    formatCurrency,
    formatDate,
    formatPercent,
    invoice,
    isOffer,
    today,
    remainingAmount,
    loading,
    sources,
    tabs,
    documentsFact,
    originState,
  ]);
}
