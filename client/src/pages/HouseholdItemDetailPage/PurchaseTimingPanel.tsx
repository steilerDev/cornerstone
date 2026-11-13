import { SectionCardScope } from '../../components/SectionCard/SectionCardScope.js';
import { PurchaseDeliveryCard } from './PurchaseDeliveryCard.js';
import { PurchaseWaitsForList } from './PurchaseWaitsForList.js';
import type { PurchasePanelProps } from './purchasePageTypes.js';
import styles from './PurchaseTimingPanel.module.css';

/** The Timing tab of the purchase page: the Delivery card, then what the purchase waits for. */
export function PurchaseTimingPanel({ purchase, refresh, originState }: PurchasePanelProps) {
  return (
    <SectionCardScope>
      <div className={styles.panel} data-testid="purchase-timing-panel">
        <PurchaseDeliveryCard purchase={purchase} refresh={refresh} />
        <div className={styles.endClearance}>
          <PurchaseWaitsForList purchase={purchase} refresh={refresh} originState={originState} />
        </div>
      </div>
    </SectionCardScope>
  );
}

export default PurchaseTimingPanel;
