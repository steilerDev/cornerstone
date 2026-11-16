import { useTranslation } from 'react-i18next';
import { FormError } from '../../components/FormError/FormError.js';
import { SectionCardScope } from '../../components/SectionCard/SectionCardScope.js';
import { PurchaseDeliveryCard } from './PurchaseDeliveryCard.js';
import { PurchaseWaitsForList } from './PurchaseWaitsForList.js';
import type { PurchasePanelProps } from './purchasePageTypes.js';
import styles from './PurchaseTimingPanel.module.css';

export interface PurchaseTimingPanelProps extends PurchasePanelProps {
  /** Titles of the dependencies a New purchase save could not add; null when none failed. */
  readonly depError?: string | null;
  readonly onDepErrorDismiss?: () => void;
}

const NOOP = (): void => {};

/** The Timing tab of the purchase page: the Delivery card, then what the purchase waits for. */
export function PurchaseTimingPanel({
  purchase,
  refresh,
  originState,
  depError = null,
  onDepErrorDismiss = NOOP,
}: PurchaseTimingPanelProps) {
  const { t } = useTranslation('householdItems');
  const { t: tCommon } = useTranslation('common');
  return (
    <SectionCardScope>
      <div className={styles.panel} data-testid="purchase-timing-panel">
        {depError !== null && (
          <div className={styles.depError}>
            <div className={styles.depErrorMessage}>
              <FormError message={t('purchasePage.timing.depError', { titles: depError })} />
            </div>
            <button
              type="button"
              className={styles.dismiss}
              onClick={onDepErrorDismiss}
              data-testid="purchase-dep-error-dismiss"
            >
              {tCommon('button.close')}
            </button>
          </div>
        )}
        <PurchaseDeliveryCard purchase={purchase} refresh={refresh} />
        <div className={styles.endClearance}>
          <PurchaseWaitsForList purchase={purchase} refresh={refresh} originState={originState} />
        </div>
      </div>
    </SectionCardScope>
  );
}

export default PurchaseTimingPanel;
