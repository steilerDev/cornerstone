import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { HouseholdItemPageDetail } from '@cornerstone/shared';
import { AreaBreadcrumb } from '../../components/AreaBreadcrumb/AreaBreadcrumb.js';
import { Badge } from '../../components/Badge/Badge.js';
import { scheduleSignalBadgeProps } from '../../components/Badge/statusBadgeVariants.js';
import { CallButton } from '../../components/CallButton/CallButton.js';
import type { ObjectTabsController } from '../../components/ObjectTabs/useObjectTabs.js';
import type { ObjectTabId } from '../../components/ObjectTabs/objectTabIds.js';
import type { SummaryFact } from '../../components/SummaryStrip/SummaryStrip.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useFormatters } from '../../lib/formatters.js';
import { todayLocalIsoDate } from '../../lib/localDate.js';
import { purchaseLateDays } from '../../lib/scheduleDates.js';
import type { OriginState } from '../../navigation/origin.js';
import { purchaseDeliveryShown, purchaseIsLateShown } from './purchaseDates.js';
import type { DeliveryShown } from './purchaseDates.js';
import styles from './HouseholdItemDetailPage.module.css';

export interface UsePurchaseSummaryFactsOptions {
  readonly purchase: HouseholdItemPageDetail;
  readonly tabs: ObjectTabsController;
  readonly originState: OriginState;
  /** The Documents fact of `useDocumentsPanel`; null leaves it out. */
  readonly documentsFact: SummaryFact | null;
  /** Opens the Details card in edit mode (an empty Where or Company fact). */
  readonly onOpenDetails: () => void;
}

/** The strip of the purchase page: Delivery, Where, Company, Expected cost, Invoiced, Waits for, Documents. */
export function usePurchaseSummaryFacts({
  purchase,
  tabs,
  originState,
  documentsFact,
  onOpenDetails,
}: UsePurchaseSummaryFactsOptions): SummaryFact[] {
  const { t } = useTranslation('householdItems');
  const { formatCurrency, formatDate } = useFormatters();
  const statusVariants = useStatusBadgeVariants();

  const tabFact = (
    id: string,
    tab: ObjectTabId,
    label: string,
    value: SummaryFact['value'],
    extra: {
      readonly wide?: boolean;
      readonly onActivate?: () => void;
      readonly emptyText?: string;
    } = {},
  ): SummaryFact => ({
    id,
    kind: 'tab',
    href: tabs.hrefFor(tab),
    onActivate: extra.onActivate ?? (() => tabs.select(tab, { focusPanel: true })),
    label,
    value,
    ...(extra.wide ? { wide: true } : {}),
    ...(extra.emptyText ? { emptyText: extra.emptyText } : {}),
  });

  const wordDelivery = (shown: DeliveryShown): string | null => {
    if (shown === null) return null;
    if (shown.kind === 'delivered') {
      return t('purchasePage.strip.delivered', { date: formatDate(shown.date) });
    }
    if (shown.kind === 'target') {
      return t('purchasePage.strip.target', { date: formatDate(shown.date) });
    }
    if (shown.kind === 'window') {
      return t('purchasePage.strip.window', {
        start: formatDate(shown.start),
        end: formatDate(shown.end),
      });
    }
    return formatDate(shown.date);
  };

  const facts: SummaryFact[] = [];

  const late = purchaseIsLateShown(purchase);
  const deliveryText = wordDelivery(purchaseDeliveryShown(purchase));
  const lateBadge = late ? (
    <Badge
      {...scheduleSignalBadgeProps(
        { signal: 'late', days: purchaseLateDays(purchase, todayLocalIsoDate()) },
        statusVariants.scheduleSignal,
      )}
      testId="purchase-late-badge"
    />
  ) : null;
  facts.push(
    tabFact(
      'delivery',
      'timing',
      t('purchasePage.strip.delivery'),
      // Late needs a latest or earliest date, so a late purchase always has delivery text.
      deliveryText === null ? null : (
        <>
          {deliveryText}
          {lateBadge ? <> {lateBadge}</> : null}
        </>
      ),
      { wide: late },
    ),
  );

  if (purchase.area) {
    facts.push({
      id: 'where',
      kind: 'link',
      // Interim until route `area` (P5.7) is served: then routeUrl('area', { id }) (as AreaLink).
      to: routeUrl('areas'),
      state: originState,
      label: t('purchasePage.strip.where'),
      value: <AreaBreadcrumb area={purchase.area} variant="compact" />,
    });
  } else {
    facts.push(
      tabFact('where', 'overview', t('purchasePage.strip.where'), null, {
        onActivate: onOpenDetails,
      }),
    );
  }

  const { vendor } = purchase;
  if (vendor) {
    facts.push({
      id: 'company',
      kind: 'link',
      to: routeUrl('company', { id: vendor.id }),
      state: originState,
      label: t('purchasePage.strip.company'),
      value: vendor.name,
      ...(vendor.phone
        ? {
            wide: true,
            trailing: (
              <CallButton phone={vendor.phone} name={vendor.name} testId="purchase-summary-call" />
            ),
          }
        : {}),
    });
  } else {
    facts.push(
      tabFact('company', 'overview', t('purchasePage.strip.company'), null, {
        onActivate: onOpenDetails,
      }),
    );
  }

  const [grant] = purchase.grants;
  let grantRemark: string | null = null;
  if (grant) {
    grantRemark =
      purchase.grants.length > 1
        ? t('purchasePage.strip.grantsMore', {
            name: grant.name,
            count: purchase.grants.length - 1,
          })
        : grant.name;
  }
  facts.push(
    tabFact(
      'cost',
      'cost',
      t('purchasePage.strip.cost'),
      purchase.expectedCost === null ? null : (
        <>
          {formatCurrency(purchase.expectedCost)}
          {grantRemark ? (
            <span className={styles.remark}>
              {' · '}
              {grantRemark}
            </span>
          ) : null}
        </>
      ),
      { wide: grantRemark !== null },
    ),
  );

  const invoiced = purchase.budgetSummary.totalActual;
  facts.push(
    tabFact(
      'invoiced',
      'cost',
      t('purchasePage.strip.invoiced'),
      invoiced === 0 ? null : formatCurrency(invoiced),
      { emptyText: t('purchasePage.strip.noneYet') },
    ),
  );

  facts.push(
    tabFact(
      'waitsFor',
      'timing',
      t('purchasePage.strip.waitsFor'),
      purchase.waitsFor ? (
        <>
          {purchase.waitsFor.title}
          {purchase.waitsFor.more > 0 ? (
            <span className={styles.remark}>
              {' '}
              {t('purchasePage.strip.more', { count: purchase.waitsFor.more })}
            </span>
          ) : null}
        </>
      ) : (
        t('purchasePage.strip.nothing')
      ),
    ),
  );

  if (documentsFact) facts.push(documentsFact);

  return facts;
}
