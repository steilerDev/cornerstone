import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BudgetSource, MoveBudgetLinesRequest } from '@cornerstone/shared';
import { Modal } from '../Modal/Modal.js';
import { SearchPicker } from '../SearchPicker/SearchPicker.js';
import { FormError } from '../FormError/FormError.js';
import { fetchBudgetSources, moveBudgetLinesBetweenSources } from '../../lib/budgetSourcesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import styles from './MassMoveModal.module.css';

export interface MassMoveModalProps {
  sourceId: string;
  sourceName: string;
  selectedLineIds: Set<string>;
  claimedCount: number;
  workItemBudgetIds: string[];
  householdItemBudgetIds: string[];
  onClose: () => void;
  onSuccess: (movedCount: number, targetName: string) => void;
}

export function MassMoveModal({
  sourceId,
  sourceName,
  selectedLineIds,
  claimedCount,
  workItemBudgetIds,
  householdItemBudgetIds,
  onClose,
  onSuccess,
}: MassMoveModalProps) {
  const { t } = useTranslation('budget');
  const [targetSourceId, setTargetSourceId] = useState<string>('');
  const [targetSourceName, setTargetSourceName] = useState<string>('');
  const [understood, setUnderstood] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const canConfirm = targetSourceId !== '' && (claimedCount === 0 || understood) && !isSubmitting;

  const handleSearchSources = useCallback(
    async (query: string): Promise<BudgetSource[]> => {
      const response = await fetchBudgetSources();
      const allSources = response.budgetSources.filter((s) => s.id !== sourceId);
      if (!query) return allSources;
      const lowerQuery = query.toLowerCase();
      return allSources.filter((s) => s.name.toLowerCase().includes(lowerQuery));
    },
    [sourceId],
  );

  const handleConfirm = useCallback(async () => {
    if (!canConfirm) return;

    setIsSubmitting(true);
    setApiError(null);

    try {
      const data: MoveBudgetLinesRequest = {
        workItemBudgetIds,
        householdItemBudgetIds,
        targetSourceId,
      };
      const result = await moveBudgetLinesBetweenSources(sourceId, data);
      const movedCount = result.movedWorkItemLines + result.movedHouseholdItemLines;
      onSuccess(movedCount, targetSourceName);
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setApiError(error.error.message || t('sources.budgetLines.move.genericError'));
      } else {
        setApiError(t('sources.budgetLines.move.genericError'));
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canConfirm,
    workItemBudgetIds,
    householdItemBudgetIds,
    targetSourceId,
    sourceId,
    onSuccess,
    targetSourceName,
    onClose,
    t,
  ]);

  const handleSelectTarget = useCallback((item: { id: string; label: string }) => {
    setTargetSourceName(item.label);
  }, []);

  const footerContent = (
    <div className={styles.footerActions}>
      <button
        type="button"
        className={styles.cancelButton}
        onClick={onClose}
        disabled={isSubmitting}
      >
        {t('common.cancel')}
      </button>
      <button
        type="button"
        className={styles.confirmButton}
        onClick={handleConfirm}
        aria-disabled={!canConfirm}
        disabled={!canConfirm || isSubmitting}
      >
        {isSubmitting ? t('common.loading') : t('sources.budgetLines.move.confirmButton')}
      </button>
      {!canConfirm && !isSubmitting && (
        <span className={styles.srOnly}>
          {targetSourceId === ''
            ? t('sources.budgetLines.move.confirmDisabledNoTarget')
            : t('sources.budgetLines.move.confirmDisabledHint')}
        </span>
      )}
    </div>
  );

  return (
    <Modal
      title={t('sources.budgetLines.move.modalTitle')}
      onClose={onClose}
      footer={footerContent}
      className={styles.modalOverride}
    >
      <div className={styles.content}>
        {/* Context line showing what's being moved */}
        <p className={styles.contextLine}>
          {t('sources.budgetLines.move.movingCount', {
            count: selectedLineIds.size,
            sourceName,
          })}
        </p>

        {/* API Error */}
        {apiError && <FormError variant="banner" message={apiError} />}

        {/* Target Source Picker */}
        <div className={styles.pickerGroup}>
          <label className={styles.pickerLabel} htmlFor="target-source">
            {t('sources.budgetLines.move.targetLabel')}
          </label>
          <SearchPicker<BudgetSource>
            id="target-source"
            value={targetSourceId}
            onChange={setTargetSourceId}
            onSelectItem={handleSelectTarget}
            excludeIds={[sourceId]}
            placeholder={t('sources.budgetLines.move.pickerPlaceholder')}
            searchFn={handleSearchSources}
            renderItem={(source) => ({
              id: source.id,
              label: source.name,
            })}
            showItemsOnFocus
            emptyHint={t('sources.budgetLines.move.pickerEmpty')}
            disabled={isSubmitting}
          />
        </div>

        {/* Claimed Invoice Warning */}
        {claimedCount > 0 && (
          <div className={styles.warningBlock} role="alert">
            <div className={styles.warningIconContainer}>
              <svg
                className={styles.warningIcon}
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
              </svg>
            </div>
            <div>
              <h3 className={styles.warningHeading}>
                {t('sources.budgetLines.move.claimedWarningHeading', { count: claimedCount })}
              </h3>
              <p className={styles.warningBody}>
                {t('sources.budgetLines.move.claimedWarningBody')}
              </p>
              <label className={styles.understoodRow}>
                <input
                  type="checkbox"
                  className={styles.understoodCheckbox}
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                  disabled={isSubmitting}
                />
                <span className={styles.understoodLabel}>
                  {t('sources.budgetLines.move.understoodLabel')}
                </span>
              </label>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
