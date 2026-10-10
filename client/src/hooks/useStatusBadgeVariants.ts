import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildInvoiceStatusVariants,
  buildProgressPaymentStatusVariants,
  buildPurchaseStatusVariants,
  buildRefundVariants,
  buildTaskStatusVariants,
} from '../components/Badge/statusBadgeVariants.js';

/** Memoised, translated Badge variant maps for every status vocabulary (#2195). */
export function useStatusBadgeVariants() {
  const { t } = useTranslation('common');
  return useMemo(
    () => ({
      invoice: buildInvoiceStatusVariants(t),
      progressPayment: buildProgressPaymentStatusVariants(t),
      task: buildTaskStatusVariants(t),
      purchase: buildPurchaseStatusVariants(t),
      refund: buildRefundVariants(t),
    }),
    [t],
  );
}
