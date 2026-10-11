import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { INVOICE_DEPOSIT_STATUSES } from '@cornerstone/shared';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import type {
  BudgetSource,
  InvoiceDeposit,
  InvoiceDepositStatus,
  InvoiceDepositEntryType,
} from '@cornerstone/shared';
import { parseAmount, computeDepositExcess } from '../../lib/quotationConversion.js';
import { createDeposit, updateDeposit } from '../../lib/invoiceDepositsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useFormatters } from '../../lib/formatters.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { Modal } from '../../components/Modal/Modal.js';
import { FormError } from '../../components/FormError/FormError.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './InvoiceDepositsSection.module.css';

export interface DepositFormState {
  amount: string;
  dueDate: string;
  status: InvoiceDepositStatus;
  paidDate: string;
  claimedDate: string;
  description: string;
  entryType: InvoiceDepositEntryType;
  budgetSourceId: string | null;
}

export const getEmptyForm = (): DepositFormState => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    amount: '',
    dueDate: '',
    status: 'pending',
    paidDate: today,
    claimedDate: today,
    description: '',
    entryType: 'deposit',
    budgetSourceId: null,
  };
};

export interface InvoiceDepositFormModalProps {
  invoiceId: string;
  mode: 'add' | 'edit';
  deposit?: InvoiceDeposit | null;
  initialValues?: Partial<DepositFormState>;
  lockEntryType?: boolean;
  budgetSources: BudgetSource[];
  /** Number of distinct sources in the invoice's budget lines (hint display). Hint hidden when undefined. */
  budgetLineSourceCount?: number;
  /** The source with the largest sum (hint display). */
  largestBudgetSourceId?: string | null;
  /** Invoice amount, for the over-deposit warning. Warning hidden when undefined. */
  invoiceAmount?: number;
  /** Existing entries of the invoice, for the over-deposit warning. */
  existingEntries?: InvoiceDeposit[];
  onSaved: (deposit: InvoiceDeposit) => void;
  onClose: () => void;
}

function buildInitialForm(
  mode: 'add' | 'edit',
  deposit: InvoiceDeposit | null | undefined,
  initialValues: Partial<DepositFormState> | undefined,
): DepositFormState {
  if (mode === 'edit' && deposit) {
    return {
      amount: deposit.amount.toString(),
      dueDate: deposit.dueDate.slice(0, 10),
      status: deposit.status,
      paidDate: deposit.paidDate ? deposit.paidDate.slice(0, 10) : '',
      claimedDate: deposit.claimedDate ? deposit.claimedDate.slice(0, 10) : '',
      description: deposit.description ?? '',
      entryType: deposit.entryType,
      budgetSourceId: deposit.budgetSourceId ?? null,
    };
  }
  return { ...getEmptyForm(), ...initialValues };
}

export function InvoiceDepositFormModal({
  invoiceId,
  mode,
  deposit,
  initialValues,
  lockEntryType = false,
  budgetSources,
  budgetLineSourceCount,
  largestBudgetSourceId = null,
  invoiceAmount,
  existingEntries,
  onSaved,
  onClose,
}: InvoiceDepositFormModalProps) {
  const { formatCurrency } = useFormatters();
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const statusVariants = useStatusBadgeVariants();
  const [form, setForm] = useState<DepositFormState>(() =>
    buildInitialForm(mode, deposit, initialValues),
  );
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState('');
  const isEdit = mode === 'edit';
  const excess =
    form.entryType === 'deposit' && invoiceAmount !== undefined && existingEntries
      ? computeDepositExcess(invoiceAmount, existingEntries, parseAmount(form.amount), deposit?.id)
      : 0;

  const handleClose = () => {
    if (!isMutating) onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      setError(t('invoiceDetail.deposits.errors.amountRequired'));
      return;
    }

    if (!form.dueDate) {
      setError(t('invoiceDetail.deposits.errors.dueDateRequired'));
      return;
    }

    // Validate conditional dates
    if (form.status !== 'pending' && !form.paidDate) {
      setError(t('invoiceDetail.deposits.errors.paidDateRequired'));
      return;
    }

    if (form.status === 'claimed' && !form.claimedDate) {
      setError(t('invoiceDetail.deposits.errors.claimedDateRequired'));
      return;
    }

    setIsMutating(true);
    setError('');

    try {
      const dateFields = {
        ...(form.status !== 'pending' ? { paidDate: form.paidDate || null } : {}),
        ...(form.status === 'claimed' ? { claimedDate: form.claimedDate || null } : {}),
      };
      let saved: InvoiceDeposit | null = null;
      if (mode === 'add') {
        saved = (
          await createDeposit(invoiceId, {
            amount,
            dueDate: form.dueDate,
            status: form.status as InvoiceDepositStatus,
            entryType: form.entryType,
            description: form.description.trim() || null,
            budgetSourceId: form.budgetSourceId ?? null,
            ...dateFields,
          })
        ).deposit;
      } else if (deposit) {
        saved = (
          await updateDeposit(invoiceId, deposit.id, {
            amount,
            dueDate: form.dueDate,
            description: form.description.trim() || null,
            budgetSourceId: form.budgetSourceId ?? null,
            ...dateFields,
          })
        ).deposit;
      }

      if (saved) onSaved(saved);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const code = err.error.code;
        if (code === 'REFUND_EXCEEDS_INVOICE') {
          const availableHeadroom =
            (err.error.details as { availableHeadroom?: number })?.availableHeadroom ?? 0;
          setError(
            t('budget:invoiceDetail.deposits.errors.refundExceedsTotal', {
              availableHeadroom: formatCurrency(availableHeadroom),
            }),
          );
        } else if (code === 'INVALID_DEPOSIT_STATUS_TRANSITION') {
          const details = err.error.details as { from?: string; to?: string };
          setError(
            t('budget:invoiceDetail.deposits.errors.invalidTransition', {
              from: details.from || form.status,
              to: details.to || deposit?.status,
            }),
          );
        } else if (code === 'INVALID_DEPOSIT_DATE_FOR_STATUS') {
          setError(t('budget:invoiceDetail.deposits.errors.invalidDate'));
        } else {
          setError(translateApiError(err.error.code, tErrors));
        }
      } else {
        setError(t('budget:invoiceDetail.deposits.errors.saveError'));
      }
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <Modal
      title={
        isEdit
          ? t('budget:invoiceDetail.deposits.modal.editTitle')
          : t('budget:invoiceDetail.deposits.modal.addTitle')
      }
      onClose={handleClose}
      className={styles.modal}
      footer={
        <div className={styles.modalActions}>
          <button
            type="button"
            className={sharedStyles.btnSecondary}
            onClick={handleClose}
            disabled={isMutating}
            data-testid="deposit-modal-cancel"
          >
            {t('common:button.cancel')}
          </button>
          <button
            type="submit"
            className={sharedStyles.btnPrimary}
            form="deposit-form"
            disabled={
              isMutating ||
              !form.amount ||
              !form.dueDate ||
              (form.status !== 'pending' && !form.paidDate) ||
              (form.status === 'claimed' && !form.claimedDate)
            }
            data-testid="deposit-modal-save"
          >
            {isMutating ? t('budget:invoiceDetail.deposits.form.saving') : t('common:button.save')}
          </button>
        </div>
      }
    >
      <form id="deposit-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        {error && <FormError message={error} />}

        {/* Entry type selector */}
        <div className={styles.formField}>
          <span className={styles.label}>{t('budget:invoiceDetail.deposits.form.entryType')}</span>
          <div
            className={styles.entryTypeSelector}
            role="group"
            aria-label={t('budget:invoiceDetail.deposits.form.entryTypeLabel')}
          >
            <label>
              <input
                type="radio"
                name="entryType"
                value="deposit"
                checked={form.entryType === 'deposit'}
                onChange={(e) =>
                  setForm({ ...form, entryType: e.target.value as InvoiceDepositEntryType })
                }
                disabled={isMutating || isEdit || lockEntryType}
              />
              {t('budget:invoiceDetail.deposits.entryTypeLabels.deposit')}
            </label>
            <label>
              <input
                type="radio"
                name="entryType"
                value="refund"
                checked={form.entryType === 'refund'}
                onChange={(e) =>
                  setForm({ ...form, entryType: e.target.value as InvoiceDepositEntryType })
                }
                disabled={isMutating || isEdit || lockEntryType}
              />
              {t('budget:invoiceDetail.deposits.entryTypeLabels.refund')}
            </label>
          </div>
        </div>

        {/* Budget source picker */}
        <div className={styles.formField}>
          <label htmlFor="deposit-budgetSource" className={styles.label}>
            {t('budget:invoiceDetail.deposits.form.budgetSource')}
          </label>
          <select
            id="deposit-budgetSource"
            value={form.budgetSourceId || ''}
            onChange={(e) =>
              setForm({
                ...form,
                budgetSourceId: e.target.value ? e.target.value : null,
              })
            }
            className={sharedStyles.select}
            disabled={isMutating}
          >
            <option value="">{t('budget:invoiceDetail.deposits.form.budgetSourceNone')}</option>
            {budgetSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
          {budgetLineSourceCount !== undefined && (
            <div className={styles.charCounter}>
              {budgetLineSourceCount === 0
                ? t('budget:invoiceDetail.deposits.form.budgetSourceHintNone')
                : budgetLineSourceCount === 1
                  ? t('budget:invoiceDetail.deposits.form.budgetSourceHintSingle', {
                      name: budgetSources.find((s) => s.id === form.budgetSourceId)?.name || '—',
                    })
                  : t('budget:invoiceDetail.deposits.form.budgetSourceHintLargest', {
                      name: budgetSources.find((s) => s.id === largestBudgetSourceId)?.name || '—',
                    })}
            </div>
          )}
        </div>

        {/* Row 1: amount + due date */}
        <div className={styles.formRow}>
          <div className={styles.formField}>
            <label htmlFor="deposit-amount" className={styles.label}>
              {t('budget:invoiceDetail.deposits.form.amount')}
              <span className={styles.required}>
                {t('budget:invoiceDetail.deposits.form.required')}
              </span>
            </label>
            <input
              type="number"
              id="deposit-amount"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className={sharedStyles.input}
              min="0.01"
              step="0.01"
              required
              disabled={isMutating}
              aria-describedby={excess > 0 ? 'deposit-amount-warning' : undefined}
              onWheel={(e) => e.currentTarget.blur()}
            />
            {form.entryType === 'refund' && (
              <div className={styles.charCounter}>
                {t('budget:invoiceDetail.deposits.form.refundAmountHint')}
              </div>
            )}
            {excess > 0 && (
              <div
                id="deposit-amount-warning"
                className={sharedStyles.bannerWarning}
                role="status"
                aria-atomic="true"
                data-testid="deposit-exceeds-warning"
              >
                {t('budget:invoiceDetail.deposits.form.exceedsInvoiceWarning', {
                  amount: formatCurrency(excess),
                })}
              </div>
            )}
          </div>

          <div className={styles.formField}>
            <label htmlFor="deposit-dueDate" className={styles.label}>
              {t('budget:invoiceDetail.deposits.form.dueDate')}
              <span className={styles.required}>
                {t('budget:invoiceDetail.deposits.form.required')}
              </span>
            </label>
            <input
              type="date"
              id="deposit-dueDate"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className={sharedStyles.input}
              required
              disabled={isMutating}
            />
          </div>
        </div>

        {/* Row 2: status (add only; existing entries change status from the status menu) */}
        {!isEdit && (
          <div className={styles.formField}>
            <label htmlFor="deposit-status" className={styles.label}>
              {t('budget:invoiceDetail.deposits.form.status')}
            </label>
            <select
              id="deposit-status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as InvoiceDepositStatus })}
              className={sharedStyles.select}
              disabled={isMutating}
            >
              {INVOICE_DEPOSIT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusVariants.progressPayment[status].label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Row 3: paidDate (conditional) */}
        <div
          className={`${styles.conditionalField} ${form.status !== 'pending' ? styles.conditionalFieldVisible : styles.conditionalFieldHidden}`}
        >
          <div className={styles.formField}>
            <label htmlFor="deposit-paidDate" className={styles.label}>
              {t('budget:invoiceDetail.deposits.form.paidDate')}
              <span className={styles.required}>
                {t('budget:invoiceDetail.deposits.form.required')}
              </span>
            </label>
            <input
              type="date"
              id="deposit-paidDate"
              value={form.paidDate}
              onChange={(e) => setForm({ ...form, paidDate: e.target.value })}
              className={sharedStyles.input}
              disabled={isMutating}
            />
          </div>
        </div>

        {/* Row 4: claimedDate (conditional, only when claimed) */}
        <div
          className={`${styles.conditionalField} ${form.status === 'claimed' ? styles.conditionalFieldVisible : styles.conditionalFieldHidden}`}
        >
          <div className={styles.formField}>
            <label htmlFor="deposit-claimedDate" className={styles.label}>
              {t('budget:invoiceDetail.deposits.form.claimedDate')}
              <span className={styles.required}>
                {t('budget:invoiceDetail.deposits.form.required')}
              </span>
            </label>
            <input
              type="date"
              id="deposit-claimedDate"
              value={form.claimedDate}
              onChange={(e) => setForm({ ...form, claimedDate: e.target.value })}
              className={sharedStyles.input}
              disabled={isMutating}
            />
          </div>
        </div>

        {/* Row 5: description */}
        <div className={styles.formField}>
          <label htmlFor="deposit-description" className={styles.label}>
            {t('budget:invoiceDetail.deposits.form.description')}
          </label>
          <textarea
            id="deposit-description"
            value={form.description}
            onChange={(e) =>
              setForm({
                ...form,
                description: e.target.value.slice(0, 500),
              })
            }
            className={sharedStyles.textarea}
            placeholder={t('budget:invoiceDetail.deposits.form.descriptionPlaceholder')}
            maxLength={500}
            disabled={isMutating}
            rows={3}
          />
          <div className={styles.charCounter}>
            {t('budget:invoiceDetail.deposits.form.charCounter', {
              count: form.description.length,
            })}
          </div>
        </div>
      </form>
    </Modal>
  );
}
