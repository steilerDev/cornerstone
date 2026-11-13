import { useTranslation } from 'react-i18next';
import { CostLinesSection } from '../../components/CostLineTable/CostLinesSection.js';
import { GrantLinksList } from '../../components/RelatedList/GrantLinksList.js';
import {
  fetchHouseholdItemSubsidies,
  linkHouseholdItemSubsidy,
  unlinkHouseholdItemSubsidy,
} from '../../lib/householdItemSubsidiesApi.js';
import type { PurchasePanelProps } from './purchasePageTypes.js';
import styles from './PurchaseCostPanel.module.css';

/**
 * The Cost tab of the purchase page: its cost lines and the grants that cover it. A grant link is
 * a plain relation: Remove unlinks with Undo.
 */
export function PurchaseCostPanel({
  purchase,
  revision,
  refresh,
  originState,
}: PurchasePanelProps) {
  const { t } = useTranslation('householdItems');
  const purchaseId = purchase.id;

  return (
    <div className={styles.panel} data-testid="purchase-cost-panel">
      <div className={styles.costCard}>
        <CostLinesSection
          host={{ kind: 'household_item', id: purchaseId, label: purchase.name }}
          lines={purchase.budgets}
          onChanged={refresh}
          linkState={originState}
          headingLevel={2}
        />
      </div>
      <div className={styles.endClearance}>
        <GrantLinksList
          revision={revision}
          load={() => fetchHouseholdItemSubsidies(purchaseId)}
          link={(grantId) => linkHouseholdItemSubsidy(purchaseId, grantId)}
          unlink={(grantId) => unlinkHouseholdItemSubsidy(purchaseId, grantId)}
          onChanged={refresh}
          labels={{
            title: t('purchasePage.cost.grants'),
            empty: t('purchasePage.cost.grantsEmpty'),
            add: t('purchasePage.cost.add'),
            loadError: t('purchasePage.cost.loadError'),
            linkError: t('purchasePage.cost.linkError'),
          }}
          linkState={originState}
          testId="purchase-grants"
        />
      </div>
    </div>
  );
}

export default PurchaseCostPanel;
