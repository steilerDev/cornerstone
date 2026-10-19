import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildBackupRunVariants,
  buildIntegrationStatusVariants,
  buildDefectStatusVariants,
  buildDiaryOutcomeVariants,
  buildDiarySeverityVariants,
  buildDiaryTypeVariants,
  buildFundingSourceStatusVariants,
  buildGrantStatusVariants,
  buildInvoiceStatusVariants,
  buildMilestoneStatusVariants,
  buildProgressPaymentStatusVariants,
  buildPurchaseStatusVariants,
  buildRefundVariants,
  buildScheduleSignalVariants,
  buildTaskStatusVariants,
  buildUserAccountStatusVariants,
} from '../components/Badge/statusBadgeVariants.js';

/** Memoised, translated Badge variant maps for every status vocabulary (#2195). */
export function useStatusBadgeVariants() {
  const { t } = useTranslation('common');
  return useMemo(
    () => ({
      integration: buildIntegrationStatusVariants(t),
      backupRun: buildBackupRunVariants(t),
      userAccount: buildUserAccountStatusVariants(t),
      invoice: buildInvoiceStatusVariants(t),
      progressPayment: buildProgressPaymentStatusVariants(t),
      task: buildTaskStatusVariants(t),
      purchase: buildPurchaseStatusVariants(t),
      milestone: buildMilestoneStatusVariants(t),
      refund: buildRefundVariants(t),
      grant: buildGrantStatusVariants(t),
      fundingSource: buildFundingSourceStatusVariants(t),
      defect: buildDefectStatusVariants(t),
      diaryType: buildDiaryTypeVariants(t),
      diaryOutcome: buildDiaryOutcomeVariants(t),
      diarySeverity: buildDiarySeverityVariants(t),
      scheduleSignal: (lateDays: number) => buildScheduleSignalVariants(t, lateDays),
    }),
    [t],
  );
}
