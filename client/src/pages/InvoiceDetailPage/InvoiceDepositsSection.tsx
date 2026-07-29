import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  InvoiceDeposit,
  InvoiceDepositStatus,
  InvoiceDepositEntryType,
  InvoiceStatus,
} from '@cornerstone/shared';
import { createDeposit, updateDeposit, deleteDeposit } from '../../lib/invoiceDepositsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useFormatters } from '../../lib/formatters.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { Badge, type BadgeVariantMap } from '../../components/Badge/Badge.js';
import { OverflowMenu, type OverflowMenuItem } from '../../components/OverflowMenu/index.js';
import { Modal } from '../../components/Modal/Modal.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { FormError } from '../../components/FormError/FormError.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './InvoiceDepositsSection.module.css';

interface InvoiceDepositsSectionProps {
  invoiceId: string;
  invoiceStatus: InvoiceStatus;
  deposits: InvoiceDeposit[];
  finalPaymentAmount: number;
  onDepositMutated: () => void;
}

interface DepositFormState {
  amount: string;
  dueDate: string;
  status: InvoiceDepositStatus;
  paidDate: string;
  claimedDate: string;
  description: string;
  entryType: InvoiceDepositEntryType;
}

type ModalMode = 'add' | 'edit' | 'delete' | null;
type StateConfirmAction = 'mark-paid' | 'mark-claimed';

interface StateConfirmState {
  deposit: InvoiceDeposit;
  action: StateConfirmAction;
}

const getEmptyForm = (): DepositFormState => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    amount: '',
    dueDate: '',
    status: 'pending',
    paidDate: today,
    claimedDate: today,
    description: '',
    entryType: 'deposit',
  };
};

export function InvoiceDepositsSection({
  invoiceId,
  invoiceStatus,
  deposits,
  finalPaymentAmount,
  onDepositMutated,
}: InvoiceDepositsSectionProps) {
  const { formatCurrency, formatDate } = useFormatters();
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');

  // Modal states
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedDeposit, setSelectedDeposit] = useState<InvoiceDeposit | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [mutatingDepositId, setMutatingDepositId] = useState<string | null>(null);
  const [stateConfirmDeposit, setStateConfirmDeposit] = useState<StateConfirmState | null>(null);

  // Form state
  const [depositForm, setDepositForm] = useState<DepositFormState>(() => getEmptyForm());
  const [formError, setFormError] = useState<string>('');

  // Revert error handling (transient banner)
  const [revertError, setRevertError] = useState<string>('');
  const revertErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // State confirm modal error
  const [stateConfirmModalError, setStateConfirmModalError] = useState<string>('');

  // Focus management
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const showRevertError = (msg: string) => {
    if (revertErrorTimerRef.current) clearTimeout(revertErrorTimerRef.current);
    setRevertError(msg);
    revertErrorTimerRef.current = setTimeout(() => setRevertError(''), 6000);
  };

  useEffect(() => {
    return () => {
      if (revertErrorTimerRef.current) clearTimeout(revertErrorTimerRef.current);
    };
  }, []);

  const invoiceStatusVariants: BadgeVariantMap = {
    pending: {
      label: t('invoiceDetail.statusLabels.pending')!,
      className: styles.statusPending!,
    },
    paid: { label: t('invoiceDetail.statusLabels.paid')!, className: styles.statusPaid! },
    claimed: {
      label: t('invoiceDetail.statusLabels.claimed')!,
      className: styles.statusClaimed!,
    },
    quotation: {
      label: t('invoiceDetail.statusLabels.quotation')!,
      className: styles.statusQuotation!,
    },
  };

  const openAddModal = () => {
    setSelectedDeposit(null);
    setDepositForm(getEmptyForm());
    setFormError('');
    setModalMode('add');
  };

  const openEditModal = (deposit: InvoiceDeposit) => {
    setSelectedDeposit(deposit);
    setDepositForm({
      amount: deposit.amount.toString(),
      dueDate: deposit.dueDate.slice(0, 10),
      status: deposit.status,
      paidDate: deposit.paidDate ? deposit.paidDate.slice(0, 10) : '',
      claimedDate: deposit.claimedDate ? deposit.claimedDate.slice(0, 10) : '',
      description: deposit.description ?? '',
      entryType: deposit.entryType,
    });
    setFormError('');
    setModalMode('edit');
  };

  const openDeleteModal = (deposit: InvoiceDeposit) => {
    setSelectedDeposit(deposit);
    setFormError('');
    setModalMode('delete');
  };

  const openStateConfirm = (deposit: InvoiceDeposit, action: StateConfirmAction) => {
    setStateConfirmDeposit({ deposit, action });
    setStateConfirmModalError('');
  };

  const closeModal = () => {
    if (!isMutating) {
      setModalMode(null);
      setSelectedDeposit(null);
      setDepositForm(getEmptyForm());
      setFormError('');
      setStateConfirmDeposit(null);
      setStateConfirmModalError('');
    }
  };

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const amount = parseFloat(depositForm.amount);
    if (isNaN(amount) || amount <= 0) {
      setFormError(t('common:validation.amountRequired'));
      return;
    }

    if (!depositForm.dueDate) {
      setFormError(t('common:validation.dateRequired'));
      return;
    }

    // Validate conditional dates
    if (depositForm.status !== 'pending' && !depositForm.paidDate) {
      setFormError(t('common:validation.dateRequired'));
      return;
    }

    if (depositForm.status === 'claimed' && !depositForm.claimedDate) {
      setFormError(t('common:validation.dateRequired'));
      return;
    }

    setIsMutating(true);
    setFormError('');

    try {
      if (modalMode === 'add') {
        const payload = {
          amount,
          dueDate: depositForm.dueDate,
          status: depositForm.status as InvoiceDepositStatus,
          entryType: depositForm.entryType,
          description: depositForm.description.trim() || null,
          ...(depositForm.status !== 'pending' ? { paidDate: depositForm.paidDate || null } : {}),
          ...(depositForm.status === 'claimed'
            ? { claimedDate: depositForm.claimedDate || null }
            : {}),
        };
        await createDeposit(invoiceId, payload);
      } else if (modalMode === 'edit' && selectedDeposit) {
        const payload = {
          amount,
          dueDate: depositForm.dueDate,
          status: depositForm.status as InvoiceDepositStatus,
          description: depositForm.description.trim() || null,
          ...(depositForm.status !== 'pending' ? { paidDate: depositForm.paidDate || null } : {}),
          ...(depositForm.status === 'claimed'
            ? { claimedDate: depositForm.claimedDate || null }
            : {}),
        };
        await updateDeposit(invoiceId, selectedDeposit.id, payload);
      }

      closeModal();
      onDepositMutated();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const code = err.error.code;
        if (code === 'DEPOSITS_EXCEED_INVOICE_TOTAL') {
          const availableHeadroom =
            (err.error.details as { availableHeadroom?: number })?.availableHeadroom ?? 0;
          setFormError(
            t('budget:invoiceDetail.deposits.errors.exceedsTotal', {
              availableHeadroom: formatCurrency(availableHeadroom),
            }),
          );
        } else if (code === 'REFUND_EXCEEDS_INVOICE') {
          const availableHeadroom =
            (err.error.details as { availableHeadroom?: number })?.availableHeadroom ?? 0;
          setFormError(
            t('budget:invoiceDetail.deposits.errors.refundExceedsTotal', {
              availableHeadroom: formatCurrency(availableHeadroom),
            }),
          );
        } else if (code === 'INVALID_DEPOSIT_STATUS_TRANSITION') {
          const details = err.error.details as { from?: string; to?: string };
          setFormError(
            t('budget:invoiceDetail.deposits.errors.invalidTransition', {
              from: details.from || depositForm.status,
              to: details.to || selectedDeposit?.status,
            }),
          );
        } else if (code === 'INVALID_DEPOSIT_DATE_FOR_STATUS') {
          setFormError(t('budget:invoiceDetail.deposits.errors.invalidDate'));
        } else {
          setFormError(translateApiError(err.error.code, tErrors));
        }
      } else {
        setFormError(
          modalMode === 'add'
            ? t('budget:invoiceDetail.deposits.errors.saveError')
            : t('budget:invoiceDetail.deposits.errors.saveError'),
        );
      }
    } finally {
      setIsMutating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedDeposit) return;

    setIsMutating(true);
    setFormError('');

    try {
      await deleteDeposit(invoiceId, selectedDeposit.id);
      closeModal();
      onDepositMutated();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(translateApiError(err.error.code, tErrors));
      } else {
        setFormError(t('budget:invoiceDetail.deposits.errors.deleteError'));
      }
    } finally {
      setIsMutating(false);
    }
  };

  const handleRevertToPending = async (deposit: InvoiceDeposit) => {
    setMutatingDepositId(deposit.id);
    try {
      await updateDeposit(invoiceId, deposit.id, { status: 'pending' });
      onDepositMutated();
    } catch (err) {
      if (err instanceof ApiClientError) {
        showRevertError(translateApiError(err.error.code, tErrors));
      } else {
        showRevertError(t('budget:invoiceDetail.deposits.errors.revertNetworkError'));
      }
    } finally {
      setMutatingDepositId(null);
    }
  };

  const handleRevertToPaid = async (deposit: InvoiceDeposit) => {
    setMutatingDepositId(deposit.id);
    try {
      await updateDeposit(invoiceId, deposit.id, { status: 'paid' });
      onDepositMutated();
    } catch (err) {
      if (err instanceof ApiClientError) {
        showRevertError(translateApiError(err.error.code, tErrors));
      } else {
        showRevertError(t('budget:invoiceDetail.deposits.errors.revertNetworkError'));
      }
    } finally {
      setMutatingDepositId(null);
    }
  };

  const handleStateConfirm = async (date: string) => {
    if (!stateConfirmDeposit) return;

    const { deposit, action } = stateConfirmDeposit;
    setMutatingDepositId(deposit.id);

    try {
      if (action === 'mark-paid') {
        await updateDeposit(invoiceId, deposit.id, {
          status: 'paid',
          paidDate: date,
        });
      } else {
        await updateDeposit(invoiceId, deposit.id, {
          status: 'claimed',
          claimedDate: date,
        });
      }

      setStateConfirmDeposit(null);
      onDepositMutated();
    } catch (err) {
      let msg: string;
      if (err instanceof ApiClientError) {
        msg = translateApiError(err.error.code, tErrors);
      } else {
        msg = t('budget:invoiceDetail.deposits.errors.stateConfirmNetworkError');
      }
      setStateConfirmModalError(msg);
    } finally {
      setMutatingDepositId(null);
    }
  };

  return (
    <section aria-labelledby="deposits-title" className={styles.depositsSection}>
      <div className={styles.sectionHeader}>
        <h2 id="deposits-title" className={styles.sectionTitle}>
          {t('budget:invoiceDetail.deposits.sectionTitle')}
          {deposits.length > 0 && (
            <span
              className={styles.countChip}
              aria-label={t('budget:invoiceDetail.deposits.countChip', {
                count: deposits.length,
              })}
            >
              {deposits.length}
            </span>
          )}
        </h2>
        <button
          ref={addButtonRef}
          type="button"
          className={sharedStyles.btnPrimary}
          onClick={openAddModal}
          disabled={isMutating}
          aria-label={t('budget:invoiceDetail.deposits.addButton')}
        >
          {t('budget:invoiceDetail.deposits.addButton')}
        </button>
      </div>

      {deposits.length === 0 && (
        <EmptyState
          icon="💳"
          message={t('budget:invoiceDetail.deposits.empty.message')}
          description={t('budget:invoiceDetail.deposits.empty.description')}
          action={{
            label: t('budget:invoiceDetail.deposits.addButton'),
            onClick: openAddModal,
          }}
        />
      )}

      {deposits.length > 0 && (
        <>
          {revertError && <FormError message={revertError} />}

          {/* Desktop/tablet table (hidden on mobile) */}
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('budget:invoiceDetail.deposits.columns.dueDate')}</th>
                  <th>{t('budget:invoiceDetail.deposits.columns.amount')}</th>
                  <th>{t('budget:invoiceDetail.deposits.columns.status')}</th>
                  <th className={styles.thPaidDate}>
                    {t('budget:invoiceDetail.deposits.columns.paidDate')}
                  </th>
                  <th className={styles.thClaimedDate}>
                    {t('budget:invoiceDetail.deposits.columns.claimedDate')}
                  </th>
                  <th>{t('budget:invoiceDetail.deposits.columns.description')}</th>
                  <th className={styles.thActions}>
                    {t('budget:invoiceDetail.deposits.columns.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((deposit) => (
                  <DepositRow
                    key={deposit.id}
                    deposit={deposit}
                    mutatingDepositId={mutatingDepositId}
                    onEdit={openEditModal}
                    onDelete={openDeleteModal}
                    onMarkPaid={() => openStateConfirm(deposit, 'mark-paid')}
                    onMarkClaimed={() => openStateConfirm(deposit, 'mark-claimed')}
                    onRevertToPending={handleRevertToPending}
                    onRevertToPaid={handleRevertToPaid}
                    t={t}
                    formatCurrency={formatCurrency}
                    formatDate={formatDate}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className={styles.mobileCardList} role="list">
            {deposits.map((deposit) => (
              <DepositCard
                key={deposit.id}
                deposit={deposit}
                mutatingDepositId={mutatingDepositId}
                onEdit={openEditModal}
                onDelete={openDeleteModal}
                onMarkPaid={() => openStateConfirm(deposit, 'mark-paid')}
                onMarkClaimed={() => openStateConfirm(deposit, 'mark-claimed')}
                onRevertToPending={handleRevertToPending}
                onRevertToPaid={handleRevertToPaid}
                t={t}
                formatCurrency={formatCurrency}
                formatDate={formatDate}
              />
            ))}
          </div>

          {/* Final Payment row */}
          <div className={styles.finalPaymentRow}>
            <span className={styles.finalPaymentLabel}>
              {t('budget:invoiceDetail.deposits.finalPayment')}
            </span>
            <div className={styles.finalPaymentRight}>
              <Badge variants={invoiceStatusVariants} value={invoiceStatus} />
              <span
                className={`${styles.finalPaymentAmount} ${finalPaymentAmount === 0 ? styles.finalPaymentAmountMuted : ''}`}
                aria-live="polite"
                aria-atomic="true"
              >
                {formatCurrency(finalPaymentAmount)}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Add/Edit modal */}
      {(modalMode === 'add' || modalMode === 'edit') && (
        <AddEditDepositModal
          mode={modalMode}
          form={depositForm}
          onFormChange={setDepositForm}
          onSubmit={handleFormSubmit}
          onClose={closeModal}
          error={formError}
          isMutating={isMutating}
          t={t}
        />
      )}

      {/* Delete modal */}
      {modalMode === 'delete' && selectedDeposit && (
        <DeleteDepositModal
          deposit={selectedDeposit}
          onConfirm={handleDeleteConfirm}
          onClose={closeModal}
          error={formError}
          isMutating={isMutating}
          t={t}
        />
      )}

      {/* State confirm modal */}
      {stateConfirmDeposit && (
        <StateConfirmModal
          deposit={stateConfirmDeposit.deposit}
          action={stateConfirmDeposit.action}
          onConfirm={handleStateConfirm}
          onClose={() => {
            setStateConfirmDeposit(null);
            setStateConfirmModalError('');
          }}
          isMutating={mutatingDepositId === stateConfirmDeposit.deposit.id}
          error={stateConfirmModalError}
          t={t}
        />
      )}
    </section>
  );
}

// ============================================================================
// Sub-component: DepositRow (table row)
// ============================================================================

interface DepositRowProps {
  deposit: InvoiceDeposit;
  mutatingDepositId: string | null;
  onEdit: (deposit: InvoiceDeposit) => void;
  onDelete: (deposit: InvoiceDeposit) => void;
  onMarkPaid: () => void;
  onMarkClaimed: () => void;
  onRevertToPending: (deposit: InvoiceDeposit) => void;
  onRevertToPaid: (deposit: InvoiceDeposit) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
}

function DepositRow({
  deposit,
  mutatingDepositId,
  onEdit,
  onDelete,
  onMarkPaid,
  onMarkClaimed,
  onRevertToPending,
  onRevertToPaid,
  t,
  formatCurrency,
  formatDate,
}: DepositRowProps) {
  const statusVariants: BadgeVariantMap = {
    pending: {
      label: t('invoiceDetail.statusLabels.pending')!,
      className: styles.statusPending!,
    },
    paid: { label: t('invoiceDetail.statusLabels.paid')!, className: styles.statusPaid! },
    claimed: {
      label: t('invoiceDetail.statusLabels.claimed')!,
      className: styles.statusClaimed!,
    },
  };

  const entryTypeVariants: BadgeVariantMap = {
    refund: {
      label: t('budget:invoiceDetail.deposits.entryTypeLabels.refund')!,
      className: styles.refund!,
    },
  };

  // Build menu items based on deposit status
  const menuItems: OverflowMenuItem[] = [];

  if (deposit.status === 'pending') {
    menuItems.push(
      {
        label: t('budget:invoiceDetail.deposits.menu.markPaid'),
        onClick: onMarkPaid,
      },
      {
        label: t('budget:invoiceDetail.deposits.menu.edit'),
        onClick: () => onEdit(deposit),
      },
      {
        label: t('budget:invoiceDetail.deposits.menu.delete'),
        onClick: () => onDelete(deposit),
        variant: 'destructive',
      },
    );
  } else if (deposit.status === 'paid') {
    menuItems.push(
      {
        label: t('budget:invoiceDetail.deposits.menu.markClaimed'),
        onClick: onMarkClaimed,
      },
      {
        label: t('budget:invoiceDetail.deposits.menu.revertToPending'),
        onClick: () => onRevertToPending(deposit),
      },
      {
        label: t('budget:invoiceDetail.deposits.menu.edit'),
        onClick: () => onEdit(deposit),
      },
      {
        label: t('budget:invoiceDetail.deposits.menu.delete'),
        onClick: () => onDelete(deposit),
        variant: 'destructive',
      },
    );
  } else if (deposit.status === 'claimed') {
    menuItems.push(
      {
        label: t('budget:invoiceDetail.deposits.menu.revertToPaid'),
        onClick: () => onRevertToPaid(deposit),
      },
      {
        label: t('budget:invoiceDetail.deposits.menu.edit'),
        onClick: () => onEdit(deposit),
      },
      {
        label: t('budget:invoiceDetail.deposits.menu.delete'),
        onClick: () => onDelete(deposit),
        variant: 'destructive',
      },
    );
  }

  return (
    <tr
      className={`${styles.tableRow} ${mutatingDepositId === deposit.id ? styles.tableRowMutating : ''}`}
    >
      <td>{formatDate(deposit.dueDate)}</td>
      <td>
        <div className={styles.amountCell}>
          {deposit.entryType === 'refund' && <Badge variants={entryTypeVariants} value="refund" />}
          <span className={deposit.entryType === 'refund' ? styles.amountNegative : undefined}>
            {formatCurrency(deposit.entryType === 'refund' ? -deposit.amount : deposit.amount)}
          </span>
        </div>
      </td>
      <td>
        <Badge variants={statusVariants} value={deposit.status} />
      </td>
      <td className={styles.tdPaidDate}>{deposit.paidDate ? formatDate(deposit.paidDate) : '—'}</td>
      <td className={styles.tdClaimedDate}>
        {deposit.claimedDate ? formatDate(deposit.claimedDate) : '—'}
      </td>
      <td className={styles.tdDescription}>{deposit.description ?? '—'}</td>
      <td className={styles.tdActions}>
        <div className={styles.actionCell}>
          <OverflowMenu
            items={menuItems}
            triggerAriaLabel={t('budget:invoiceDetail.deposits.menu.ariaLabel', {
              description:
                deposit.description ??
                t(`budget:invoiceDetail.deposits.entryTypeLabels.${deposit.entryType}`),
            })}
            placement="bottom-end"
            usePortal
          />
        </div>
      </td>
    </tr>
  );
}

// ============================================================================
// Sub-component: DepositCard (mobile)
// ============================================================================

type DepositCardProps = DepositRowProps;

function DepositCard({
  deposit,
  onEdit,
  onDelete,
  onMarkPaid,
  onMarkClaimed,
  onRevertToPending,
  onRevertToPaid,
  t,
  formatCurrency,
  formatDate,
}: DepositCardProps) {
  const statusVariants: BadgeVariantMap = {
    pending: {
      label: t('invoiceDetail.statusLabels.pending')!,
      className: styles.statusPending!,
    },
    paid: { label: t('invoiceDetail.statusLabels.paid')!, className: styles.statusPaid! },
    claimed: {
      label: t('invoiceDetail.statusLabels.claimed')!,
      className: styles.statusClaimed!,
    },
  };

  const entryTypeVariants: BadgeVariantMap = {
    refund: {
      label: t('budget:invoiceDetail.deposits.entryTypeLabels.refund')!,
      className: styles.refund!,
    },
  };

  // Build menu items based on deposit status
  const menuItems: OverflowMenuItem[] = [];

  if (deposit.status === 'pending') {
    menuItems.push(
      {
        label: t('budget:invoiceDetail.deposits.menu.markPaid'),
        onClick: onMarkPaid,
      },
      {
        label: t('budget:invoiceDetail.deposits.menu.edit'),
        onClick: () => onEdit(deposit),
      },
      {
        label: t('budget:invoiceDetail.deposits.menu.delete'),
        onClick: () => onDelete(deposit),
        variant: 'destructive',
      },
    );
  } else if (deposit.status === 'paid') {
    menuItems.push(
      {
        label: t('budget:invoiceDetail.deposits.menu.markClaimed'),
        onClick: onMarkClaimed,
      },
      {
        label: t('budget:invoiceDetail.deposits.menu.revertToPending'),
        onClick: () => onRevertToPending(deposit),
      },
      {
        label: t('budget:invoiceDetail.deposits.menu.edit'),
        onClick: () => onEdit(deposit),
      },
      {
        label: t('budget:invoiceDetail.deposits.menu.delete'),
        onClick: () => onDelete(deposit),
        variant: 'destructive',
      },
    );
  } else if (deposit.status === 'claimed') {
    menuItems.push(
      {
        label: t('budget:invoiceDetail.deposits.menu.revertToPaid'),
        onClick: () => onRevertToPaid(deposit),
      },
      {
        label: t('budget:invoiceDetail.deposits.menu.edit'),
        onClick: () => onEdit(deposit),
      },
      {
        label: t('budget:invoiceDetail.deposits.menu.delete'),
        onClick: () => onDelete(deposit),
        variant: 'destructive',
      },
    );
  }

  return (
    <div className={styles.mobileCard}>
      <div className={styles.cardTopRow}>
        <div className={styles.cardAmount}>
          {deposit.entryType === 'refund' && <Badge variants={entryTypeVariants} value="refund" />}
          <span className={deposit.entryType === 'refund' ? styles.amountNegative : undefined}>
            {formatCurrency(deposit.entryType === 'refund' ? -deposit.amount : deposit.amount)}
          </span>
        </div>
        <Badge variants={statusVariants} value={deposit.status} />
      </div>

      <dl className={styles.cardFields}>
        <div className={styles.cardField}>
          <dt>{t('budget:invoiceDetail.deposits.mobile.due')}</dt>
          <dd>{formatDate(deposit.dueDate)}</dd>
        </div>
        {deposit.paidDate && (
          <div className={styles.cardField}>
            <dt>{t('budget:invoiceDetail.deposits.mobile.paid')}</dt>
            <dd>{formatDate(deposit.paidDate)}</dd>
          </div>
        )}
        {deposit.claimedDate && (
          <div className={styles.cardField}>
            <dt>{t('budget:invoiceDetail.deposits.mobile.claimed')}</dt>
            <dd>{formatDate(deposit.claimedDate)}</dd>
          </div>
        )}
        {deposit.description && (
          <div className={styles.cardField}>
            <dt>{t('budget:invoiceDetail.deposits.columns.description')}</dt>
            <dd>{deposit.description}</dd>
          </div>
        )}
      </dl>

      <div className={styles.cardActions}>
        <OverflowMenu
          items={menuItems}
          triggerAriaLabel={t('budget:invoiceDetail.deposits.menu.ariaLabel', {
            description:
              deposit.description ??
              t(`budget:invoiceDetail.deposits.entryTypeLabels.${deposit.entryType}`),
          })}
          placement="top-end"
          usePortal
        />
      </div>
    </div>
  );
}

// ============================================================================
// Sub-component: AddEditDepositModal
// ============================================================================

interface AddEditDepositModalProps {
  mode: 'add' | 'edit';
  form: DepositFormState;
  onFormChange: (form: DepositFormState) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
  error: string;
  isMutating: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function AddEditDepositModal({
  mode,
  form,
  onFormChange,
  onSubmit,
  onClose,
  error,
  isMutating,
  t,
}: AddEditDepositModalProps) {
  const isEdit = mode === 'edit';

  return (
    <Modal
      title={
        isEdit
          ? t('budget:invoiceDetail.deposits.modal.editTitle')
          : t('budget:invoiceDetail.deposits.modal.addTitle')
      }
      onClose={onClose}
      className={styles.modal}
      footer={
        <div className={styles.modalActions}>
          <button
            type="button"
            className={sharedStyles.btnSecondary}
            onClick={onClose}
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
      <form id="deposit-form" onSubmit={onSubmit} noValidate>
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
                  onFormChange({ ...form, entryType: e.target.value as InvoiceDepositEntryType })
                }
                disabled={isMutating || isEdit}
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
                  onFormChange({ ...form, entryType: e.target.value as InvoiceDepositEntryType })
                }
                disabled={isMutating || isEdit}
              />
              {t('budget:invoiceDetail.deposits.entryTypeLabels.refund')}
            </label>
          </div>
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
              onChange={(e) => onFormChange({ ...form, amount: e.target.value })}
              className={sharedStyles.input}
              placeholder={t('budget:invoiceDetail.deposits.form.amountPlaceholder')}
              min="0.01"
              step="0.01"
              required
              disabled={isMutating}
              onWheel={(e) => e.currentTarget.blur()}
            />
            {form.entryType === 'refund' && (
              <div className={styles.charCounter}>
                {t('budget:invoiceDetail.deposits.form.refundAmountHint')}
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
              onChange={(e) => onFormChange({ ...form, dueDate: e.target.value })}
              className={sharedStyles.input}
              required
              disabled={isMutating}
            />
          </div>
        </div>

        {/* Row 2: status */}
        <div className={styles.formField}>
          <label htmlFor="deposit-status" className={styles.label}>
            {t('budget:invoiceDetail.deposits.form.status')}
          </label>
          <select
            id="deposit-status"
            value={form.status}
            onChange={(e) =>
              onFormChange({ ...form, status: e.target.value as InvoiceDepositStatus })
            }
            className={sharedStyles.select}
            disabled={isMutating}
          >
            <option value="pending">{t('invoiceDetail.statusLabels.pending')}</option>
            <option value="paid">{t('invoiceDetail.statusLabels.paid')}</option>
            <option value="claimed">{t('invoiceDetail.statusLabels.claimed')}</option>
          </select>
        </div>

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
              onChange={(e) => onFormChange({ ...form, paidDate: e.target.value })}
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
              onChange={(e) => onFormChange({ ...form, claimedDate: e.target.value })}
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
              onFormChange({
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

// ============================================================================
// Sub-component: DeleteDepositModal
// ============================================================================

interface DeleteDepositModalProps {
  deposit: InvoiceDeposit;
  onConfirm: () => void;
  onClose: () => void;
  error: string;
  isMutating: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function DeleteDepositModal({
  deposit,
  onConfirm,
  onClose,
  error,
  isMutating,
  t,
}: DeleteDepositModalProps) {
  const isPaidOrClaimed = deposit.status === 'paid' || deposit.status === 'claimed';

  return (
    <Modal
      title={t('budget:invoiceDetail.deposits.modal.deleteTitle')}
      onClose={onClose}
      className={styles.modal}
      footer={
        <div className={styles.modalActions}>
          <button
            type="button"
            className={sharedStyles.btnSecondary}
            onClick={onClose}
            disabled={isMutating}
            data-testid="deposit-delete-cancel"
          >
            {t('common:button.cancel')}
          </button>
          <button
            type="button"
            className={sharedStyles.btnConfirmDelete}
            onClick={onConfirm}
            disabled={isMutating}
            data-testid="deposit-delete-confirm"
          >
            {t('budget:invoiceDetail.deposits.modal.deleteTitle')}
          </button>
        </div>
      }
    >
      <div>
        {error && <FormError message={error} />}

        {isPaidOrClaimed && (
          <div className={styles.warningBanner}>
            {t('budget:invoiceDetail.deposits.modal.deleteWarningPaidClaimed')}
          </div>
        )}

        <p className={styles.deleteConfirmText}>
          {t('budget:invoiceDetail.deposits.modal.deleteConfirm')}
        </p>
      </div>
    </Modal>
  );
}

// ============================================================================
// Sub-component: StateConfirmModal
// ============================================================================

interface StateConfirmModalProps {
  deposit: InvoiceDeposit;
  action: StateConfirmAction;
  onConfirm: (date: string) => void;
  onClose: () => void;
  isMutating: boolean;
  error?: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function StateConfirmModal({
  action,
  onConfirm,
  onClose,
  isMutating,
  error,
  t,
}: StateConfirmModalProps) {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));

  const isMarkPaid = action === 'mark-paid';
  const title = isMarkPaid
    ? t('budget:invoiceDetail.deposits.modal.markPaidTitle')
    : t('budget:invoiceDetail.deposits.modal.markClaimedTitle');
  const dateLabel = isMarkPaid
    ? t('budget:invoiceDetail.deposits.stateConfirm.paidDateLabel')
    : t('budget:invoiceDetail.deposits.stateConfirm.claimedDateLabel');

  return (
    <Modal
      title={title}
      onClose={onClose}
      className={styles.modal}
      footer={
        <div className={styles.modalActions}>
          <button
            type="button"
            className={sharedStyles.btnSecondary}
            onClick={onClose}
            disabled={isMutating}
            data-testid="state-confirm-cancel"
          >
            {t('common:button.cancel')}
          </button>
          <button
            type="button"
            className={sharedStyles.btnPrimary}
            onClick={() => onConfirm(selectedDate)}
            disabled={isMutating}
            data-testid="state-confirm-button"
          >
            {t('common:button.confirm')}
          </button>
        </div>
      }
    >
      {error && <FormError message={error} />}
      <div className={styles.formField}>
        <label htmlFor="state-confirm-date" className={styles.label}>
          {dateLabel}
        </label>
        <input
          type="date"
          id="state-confirm-date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className={sharedStyles.input}
          disabled={isMutating}
        />
      </div>
    </Modal>
  );
}
