import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ExtractedLine,
  AutoItemizeWarning,
  InvoiceBudgetLineListDetailResponse,
} from '@cornerstone/shared';
import { autoItemize } from '../../lib/invoiceAutoItemizeApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { Modal } from '../Modal/Modal.js';
import { FormError } from '../FormError/FormError.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './AutoItemizePreviewModal.module.css';

interface LineWithInclude extends ExtractedLine {
  included: boolean;
}

interface AutoItemizePreviewModalProps {
  isOpen: boolean;
  invoiceId: string;
  invoiceAmount: number;
  paperlessDocumentId: number;
  initialLines: ExtractedLine[];
  initialWarnings: AutoItemizeWarning[];
  initialErrorCode?: string;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onApplied: () => void;
  onRetry?: () => void;
}

export function AutoItemizePreviewModal({
  isOpen,
  invoiceId,
  invoiceAmount,
  paperlessDocumentId,
  initialLines,
  initialWarnings,
  initialErrorCode,
  triggerRef,
  onCancel,
  onApplied,
  onRetry,
}: AutoItemizePreviewModalProps) {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { formatCurrency } = useFormatters();

  const [lines, setLines] = useState<LineWithInclude[]>([]);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Initialize lines with all included by default
  useEffect(() => {
    if (isOpen) {
      setLines(initialLines.map((line) => ({ ...line, included: true })));
      setError(null);
      setMode('append');
      // If there's an initial error, set retry state
      if (initialErrorCode) {
        const errorMsg = translateApiError(initialErrorCode, tErrors);
        setError(errorMsg);
        setIsRetrying(true);
      }
    }
  }, [isOpen, initialLines, initialErrorCode, tErrors]);

  // Calculate total from included lines
  const includedTotal = useMemo(() => {
    return lines.reduce((sum, line) => (line.included ? sum + line.totalAmount : sum), 0);
  }, [lines]);

  // Calculate variance
  const variance = Math.abs(includedTotal - invoiceAmount);
  const variancePercent = invoiceAmount > 0 ? (variance / invoiceAmount) * 100 : 0;
  const isWithinThreshold = variancePercent <= 1;

  // Determine total text color based on variance
  const getTotalClass = () => {
    if (isWithinThreshold) return styles.totalMatch;
    if (variancePercent > 5) return styles.totalDanger;
    return styles.totalWarning;
  };

  const handleLineToggle = (index: number) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index]!.included = !updated[index]!.included;
      return updated;
    });
  };

  const handleLineChange = (
    index: number,
    field: keyof ExtractedLine,
    value: string | number | boolean | undefined,
  ) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value } as LineWithInclude;
      return updated;
    });
  };

  const handleApply = async () => {
    setIsApplying(true);
    setError(null);

    try {
      const linesToApply = lines.filter((l) => l.included);
      const result = await autoItemize(invoiceId, {
        paperlessDocumentId,
        mode,
        dryRun: false,
        lines: linesToApply,
      });

      // Check if we got back the full response type (InvoiceBudgetLineListDetailResponse)
      if ('budgetLines' in result) {
        // Successfully applied
        onApplied();
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        const errorCode = err.error.code;
        const errorMsg = translateApiError(errorCode, tErrors);

        // Special handling for LLM_UPSTREAM_ERROR / LLM_INVALID_RESPONSE with retry
        if (errorCode === 'LLM_UPSTREAM_ERROR' || errorCode === 'LLM_INVALID_RESPONSE') {
          setError(errorMsg);
          setIsRetrying(true);
        } else {
          setError(errorMsg);
        }
      } else {
        setError(t('invoiceDetail.budgetLines.autoItemize.providerError'));
      }
    } finally {
      setIsApplying(false);
    }
  };

  const handleRetry = async () => {
    setIsRetrying(false);
    if (onRetry) {
      onRetry();
    } else {
      await handleApply();
    }
  };

  // Restore focus on close
  useEffect(() => {
    if (!isOpen && triggerRef?.current) {
      triggerRef.current.focus();
    }
  }, [isOpen, triggerRef]);

  if (!isOpen) return null;

  // Empty state or error state (with no lines to show)
  if (initialLines.length === 0) {
    return (
      <Modal
        title={t('invoiceDetail.budgetLines.autoItemize.modalTitle')}
        onClose={onCancel}
        footer={
          <div className={sharedStyles.modalActions}>
            <button type="button" className={sharedStyles.btnSecondary} onClick={onCancel}>
              {t('invoiceDetail.budgetLines.autoItemize.cancelButton')}
            </button>
            {initialErrorCode && (
              <button
                type="button"
                className={sharedStyles.btnPrimary}
                onClick={() => void handleRetry()}
              >
                {t('invoiceDetail.budgetLines.autoItemize.retryButton')}
              </button>
            )}
          </div>
        }
      >
        <div className={styles.container}>
          {error && (
            <div role="alert">
              <FormError message={error} />
            </div>
          )}
          {!error && (
            <div className={styles.emptyState}>
              <p>{t('invoiceDetail.budgetLines.autoItemize.noLines')}</p>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={t('invoiceDetail.budgetLines.autoItemize.modalTitle')}
      onClose={onCancel}
      footer={
        <div className={sharedStyles.modalActions}>
          <button
            type="button"
            className={sharedStyles.btnSecondary}
            onClick={onCancel}
            disabled={isApplying}
          >
            {t('invoiceDetail.budgetLines.autoItemize.cancelButton')}
          </button>
          {isRetrying ? (
            <button
              type="button"
              className={sharedStyles.btnPrimary}
              onClick={() => void handleRetry()}
              disabled={isApplying}
            >
              {t('invoiceDetail.budgetLines.autoItemize.retryButton')}
            </button>
          ) : (
            <button
              type="button"
              className={sharedStyles.btnPrimary}
              onClick={() => void handleApply()}
              disabled={isApplying || lines.filter((l) => l.included).length === 0}
            >
              {t('invoiceDetail.budgetLines.autoItemize.applyButton')}
            </button>
          )}
        </div>
      }
    >
      <div className={styles.container}>
        {/* Mode selection */}
        <fieldset className={styles.modeSelector}>
          <legend className={styles.modeLegend}>
            {t('invoiceDetail.budgetLines.autoItemize.modeLabel')}
          </legend>
          <div className={styles.modeOptions}>
            <label className={styles.modeOption}>
              <input
                type="radio"
                name="mode"
                value="append"
                checked={mode === 'append'}
                onChange={(e) => setMode(e.target.value as 'append' | 'replace')}
                disabled={isApplying}
              />
              <span>{t('invoiceDetail.budgetLines.autoItemize.modeAppend')}</span>
            </label>
            <label className={styles.modeOption}>
              <input
                type="radio"
                name="mode"
                value="replace"
                checked={mode === 'replace'}
                onChange={(e) => setMode(e.target.value as 'append' | 'replace')}
                disabled={isApplying}
              />
              <span>{t('invoiceDetail.budgetLines.autoItemize.modeReplace')}</span>
            </label>
          </div>
        </fieldset>

        {/* Error banner */}
        {error && (
          <div role="alert">
            <FormError message={error} />
          </div>
        )}

        {/* Mismatch warning */}
        {initialWarnings.length > 0 && (
          <div className={styles.warningBlock} role="status" aria-atomic="true">
            <div className={styles.warningIcon}>⚠</div>
            <div className={styles.warningContent}>
              {initialWarnings.map((w) =>
                w.code === 'TOTAL_MISMATCH' ? (
                  <p key={`warning-${w.code}`}>
                    {t('invoiceDetail.budgetLines.autoItemize.totalMismatchWarning', {
                      extractedTotal: formatCurrency(w.extractedTotal),
                      invoiceTotal: formatCurrency(w.invoiceTotal),
                    })}
                  </p>
                ) : null,
              )}
            </div>
          </div>
        )}

        {/* Editable table */}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thInclude}>
                  <input
                    type="checkbox"
                    checked={lines.length > 0 && lines.every((l) => l.included)}
                    onChange={(e) => {
                      setLines((prev) => prev.map((l) => ({ ...l, included: e.target.checked })));
                    }}
                    disabled={isApplying}
                    aria-label={t('invoiceDetail.budgetLines.autoItemize.selectAllAriaLabel')}
                  />
                </th>
                <th className={styles.thDescription}>
                  {t('invoiceDetail.budgetLines.autoItemize.columns.description')}
                </th>
                <th className={styles.thQuantity}>
                  {t('invoiceDetail.budgetLines.autoItemize.columns.quantity')}
                </th>
                <th className={styles.thUnit}>
                  {t('invoiceDetail.budgetLines.autoItemize.columns.unit')}
                </th>
                <th className={styles.thUnitPrice}>
                  {t('invoiceDetail.budgetLines.autoItemize.columns.unitPrice')}
                </th>
                <th className={styles.thTotal}>
                  {t('invoiceDetail.budgetLines.autoItemize.columns.total')}
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index} className={line.included ? '' : styles.rowExcluded}>
                  <td className={styles.tdInclude}>
                    <input
                      type="checkbox"
                      checked={line.included}
                      onChange={() => handleLineToggle(index)}
                      disabled={isApplying}
                      aria-label={t(
                        'invoiceDetail.budgetLines.autoItemize.includeCheckboxAriaLabel',
                        { description: line.description },
                      )}
                    />
                  </td>
                  <td className={styles.tdDescription}>
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => handleLineChange(index, 'description', e.target.value)}
                      disabled={isApplying || !line.included}
                      className={sharedStyles.input}
                    />
                  </td>
                  <td className={styles.tdQuantity}>
                    <input
                      type="number"
                      value={line.quantity ?? ''}
                      onChange={(e) =>
                        handleLineChange(
                          index,
                          'quantity',
                          e.target.value ? parseFloat(e.target.value) : undefined,
                        )
                      }
                      disabled={isApplying || !line.included}
                      className={sharedStyles.input}
                      placeholder="—"
                      step="0.01"
                      min="0"
                    />
                  </td>
                  <td className={styles.tdUnit}>
                    <input
                      type="text"
                      value={line.unit ?? ''}
                      onChange={(e) => handleLineChange(index, 'unit', e.target.value || undefined)}
                      disabled={isApplying || !line.included}
                      className={sharedStyles.input}
                      placeholder="—"
                      maxLength={20}
                    />
                  </td>
                  <td className={styles.tdUnitPrice}>
                    <input
                      type="number"
                      value={line.unitPrice ?? ''}
                      onChange={(e) =>
                        handleLineChange(
                          index,
                          'unitPrice',
                          e.target.value ? parseFloat(e.target.value) : undefined,
                        )
                      }
                      disabled={isApplying || !line.included}
                      className={sharedStyles.input}
                      placeholder="—"
                      step="0.01"
                      min="0"
                    />
                  </td>
                  <td className={styles.tdTotal}>
                    <span>{formatCurrency(line.totalAmount)}</span>
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              <tr className={styles.totalsRow}>
                <td colSpan={5} className={styles.totalsLabel}>
                  {t('invoiceDetail.budgetLines.autoItemize.totalLabel')}
                </td>
                <td className={`${styles.tdTotal} ${getTotalClass()}`}>
                  <strong>{formatCurrency(includedTotal)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
