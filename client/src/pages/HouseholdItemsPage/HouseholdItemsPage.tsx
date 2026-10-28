import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { HouseholdItemListRow } from '@cornerstone/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { ObjectList } from '../../components/ObjectList/ObjectList.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { useListRowDelete } from '../../hooks/useListRowDelete.js';
import { useFormatters } from '../../lib/formatters.js';
import { deleteHouseholdItem } from '../../lib/householdItemsApi.js';
import { useOnObjectCreated } from '../../lib/objectCreatedEvents.js';
import { useOpenCreate } from '../../navigation/useOpenCreate.js';
import shared from '../../styles/shared.module.css';
import { usePurchaseCategories } from './PurchaseListFilters.js';
import { usePurchaseRows } from './usePurchaseRows.js';
import { usePurchasesList } from './usePurchasesList.js';
import type { PurchaseListMeta } from './usePurchasesList.js';
import styles from './HouseholdItemsPage.module.css';

/** Purchases: the list with Status / Area / Company grouping, filters, row menu and totals footer. */
export function HouseholdItemsPage() {
  const { t } = useTranslation('householdItems');
  const { t: tCommon } = useTranslation('common');
  const { formatCurrency } = useFormatters();
  useDocumentTitle(tCommon('navigation.purchases'));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openCreate = useOpenCreate();

  const categories = usePurchaseCategories();
  const { list, config, labels, scopeTotal } = usePurchasesList(categories);
  const { refresh, meta } = list;
  useOnObjectCreated('purchase', refresh);

  // `n` creates like the primary button (read at press time).
  const createRef = useRef(openCreate);
  useEffect(() => {
    createRef.current = openCreate;
  });
  const shortcuts = useMemo(
    () => [
      {
        key: 'n',
        handler: () => createRef.current('purchase'),
        description: tCommon('listShortcuts.newPurchase'),
      },
    ],
    [tCommon],
  );
  useKeyboardShortcuts(shortcuts);

  const { request, deletion } = useListRowDelete<HouseholdItemListRow>({
    remove: (item) => deleteHouseholdItem(item.id),
    onDeleted: refresh,
  });
  const rows = usePurchaseRows({ categories, requestDelete: request });
  const deleteConsequences = useDeleteImpact('household_item', deletion.item?.id ?? null);

  const narrowed = list.filtersActive || list.query.chip !== 'all';
  const summary =
    meta && list.totalItems !== null && list.totalItems > 0 ? (
      <div
        className={shared.listFooter}
        role="group"
        aria-label={narrowed ? t('list.footer.labelFiltered') : t('list.footer.label')}
        data-testid="purchases-footer"
      >
        <div className={styles.totals}>
          <TotalsFigure
            label={t('list.footer.expectedCost')}
            value={formatCurrency(meta.totals.expectedCost)}
            testId="purchases-footer-expected"
          />
          <span className={styles.separator} aria-hidden="true">
            ·
          </span>
          <TotalsFigure
            label={t('list.footer.invoiced')}
            value={formatCurrency(meta.totals.invoiced)}
            testId="purchases-footer-invoiced"
          />
          <span className={styles.separator} aria-hidden="true">
            ·
          </span>
          <TotalsFigure
            label={t('list.footer.paid')}
            value={formatCurrency(meta.totals.paid)}
            testId="purchases-footer-paid"
          />
        </div>
      </div>
    ) : undefined;

  return (
    <ObjectList<HouseholdItemListRow, PurchaseListMeta>
      list={list}
      config={config}
      labels={labels}
      primary={{
        label: t('list.newPurchase'),
        onClick: () => openCreate('purchase'),
        testId: 'new-household-item-button',
      }}
      titleHeader={t('list.titleHeader')}
      statusHeader={t('list.statusHeader')}
      {...rows}
      headingCount="always"
      scopeTotal={scopeTotal}
      summary={summary}
      headingRef={headingRef}
    >
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
          testIdPrefix="purchase-list-delete"
        />
      ) : null}
    </ObjectList>
  );
}

interface TotalsFigureProps {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
}

/** One label/figure pair of the totals footer. */
function TotalsFigure({ label, value, testId }: TotalsFigureProps) {
  return (
    <span className={styles.totalsPair}>
      <span className={shared.listFooterLabel}>{label}</span>
      <span className={shared.listFooterFigure} data-testid={testId}>
        {value}
      </span>
    </span>
  );
}

export default HouseholdItemsPage;
