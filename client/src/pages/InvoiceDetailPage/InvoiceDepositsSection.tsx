import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  BudgetSource,
  InvoiceDeposit,
  InvoiceStatus,
  InvoiceBudgetLineDetailResponse,
} from '@cornerstone/shared';
import { updateDeposit, deleteDeposit } from '../../lib/invoiceDepositsApi.js';
import { fetchBudgetSources } from '../../lib/budgetSourcesApi.js';
import { fetchInvoiceBudgetLines } from '../../lib/invoiceBudgetLinesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useFormatters } from '../../lib/formatters.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { Badge, type BadgeVariantMap } from '../../components/Badge/Badge.js';
import { OverflowMenu, type OverflowMenuItem } from '../../components/OverflowMenu/index.js';
import { Modal } from '../../components/Modal/Modal.js';
import { InvoiceDepositFormModal, type DepositFormState } from './InvoiceDepositFormModal.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { FormError } from '../../components/FormError/FormError.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './InvoiceDepositsSection.module.css';

interface InvoiceDepositsSectionProps {
  invoiceId: string;
  invoiceStatus: InvoiceStatus;
  invoiceAmount: number;
  deposits: InvoiceDeposit[];
  finalPaymentAmount: number;
  onDepositMutated: () => void;
}

type ModalMode = 'add' | 'edit' | 'delete' | null;
type StateConfirmAction = 'mark-paid' | 'mark-claimed';

interface StateConfirmState {
  deposit: InvoiceDeposit;
  action: StateConfirmAction;
}

export function InvoiceDepositsSection({
  invoiceId,
  invoiceStatus,
  invoiceAmount,
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

  // Budget sources
  const [budgetSources, setBudgetSources] = useState<BudgetSource[]>([]);

  // Budget lines (for auto-default logic)
  const [budgetLines, setBudgetLines] = useState<InvoiceBudgetLineDetailResponse[]>([]);

  // Form state
  const [addInitialValues, setAddInitialValues] = useState<Partial<DepositFormState>>({});
  const [formError, setFormError] = useState<string>('');

  // Revert error handling (transient banner)
  const [revertError, setRevertError] = useState<string>('');
  const revertErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // State confirm modal error
  const [stateConfirmModalError, setStateConfirmModalError] = useState<string>('');

  // Focus management
  const addButtonRef = useRef<HTMLButtonElement>(null);

  // Fetch budget sources and budget lines
  useEffect(() => {
    const loadData = async () => {
      try {
        const [sourcesResult, budgetLinesResult] = await Promise.all([
          fetchBudgetSources(),
          fetchInvoiceBudgetLines(invoiceId),
        ]);
        setBudgetSources(sourcesResult.budgetSources);
        setBudgetLines(budgetLinesResult.budgetLines);
      } catch {
        // Silently fail - sources and budget lines are optional for this feature
        setBudgetSources([]);
        setBudgetLines([]);
      }
    };
    void loadData();
  }, [invoiceId]);

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

  // Compute source map and stats from budget lines (for auto-default and hint display)
  const sourceStats = (() => {
    const sourceMap = new Map<string | null, number>();
    for (const line of budgetLines) {
      const sourceId = line.budgetSourceId ?? null;
      sourceMap.set(sourceId, (sourceMap.get(sourceId) ?? 0) + line.itemizedAmount);
    }

    // Count distinct sources (null and actual IDs)
    const sourceIds = Array.from(sourceMap.keys()).filter((id) => id !== null);
    const hasNullSource = sourceMap.has(null);
    const distinctSources = sourceIds.length + (hasNullSource ? 1 : 0);

    // Find the largest source (only among real, non-null sources)
    let largestSourceId: string | null = null;
    let maxAmount = -1;
    for (const sourceId of sourceIds) {
      const amount = sourceMap.get(sourceId) ?? 0;
      if (amount > maxAmount) {
        maxAmount = amount;
        largestSourceId = sourceId;
      }
    }

    return {
      sourceMap,
      distinctSources,
      sourceIds,
      hasNullSource,
      largestSourceId,
    };
  })();

  const openAddModal = () => {
    setSelectedDeposit(null);

    let defaultSourceId: string | null = null;
    if (sourceStats.sourceIds.length === 1) {
      // Exactly one real source (not null): default to that source
      defaultSourceId = sourceStats.sourceIds[0]!;
    } else if (sourceStats.sourceIds.length > 1) {
      // Multiple real sources: default to the source with the largest sum
      defaultSourceId = sourceStats.largestSourceId;
    }
    // If sourceIds.length === 0 (all unassigned), keep defaultSourceId as null

    setAddInitialValues({ budgetSourceId: defaultSourceId });
    setFormError('');
    setModalMode('add');
  };

  const openEditModal = (deposit: InvoiceDeposit) => {
    setSelectedDeposit(deposit);
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
      setAddInitialValues({});
      setFormError('');
      setStateConfirmDeposit(null);
      setStateConfirmModalError('');
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
        <InvoiceDepositFormModal
          invoiceId={invoiceId}
          mode={modalMode}
          deposit={selectedDeposit}
          initialValues={addInitialValues}
          budgetSources={budgetSources}
          budgetLineSourceCount={sourceStats.sourceIds.length}
          largestBudgetSourceId={sourceStats.largestSourceId}
          invoiceAmount={invoiceAmount}
          existingEntries={deposits}
          onSaved={() => {
            closeModal();
            onDepositMutated();
          }}
          onClose={closeModal}
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
        id: 'mark-paid',
        label: t('budget:invoiceDetail.deposits.menu.markPaid'),
        onClick: onMarkPaid,
      },
      {
        id: 'edit',
        label: t('budget:invoiceDetail.deposits.menu.edit'),
        onClick: () => onEdit(deposit),
      },
      {
        id: 'delete',
        label: t('budget:invoiceDetail.deposits.menu.delete'),
        onClick: () => onDelete(deposit),
        variant: 'destructive',
      },
    );
  } else if (deposit.status === 'paid') {
    menuItems.push(
      {
        id: 'mark-claimed',
        label: t('budget:invoiceDetail.deposits.menu.markClaimed'),
        onClick: onMarkClaimed,
      },
      {
        id: 'revert-to-pending',
        label: t('budget:invoiceDetail.deposits.menu.revertToPending'),
        onClick: () => onRevertToPending(deposit),
      },
      {
        id: 'edit',
        label: t('budget:invoiceDetail.deposits.menu.edit'),
        onClick: () => onEdit(deposit),
      },
      {
        id: 'delete',
        label: t('budget:invoiceDetail.deposits.menu.delete'),
        onClick: () => onDelete(deposit),
        variant: 'destructive',
      },
    );
  } else if (deposit.status === 'claimed') {
    menuItems.push(
      {
        id: 'revert-to-paid',
        label: t('budget:invoiceDetail.deposits.menu.revertToPaid'),
        onClick: () => onRevertToPaid(deposit),
      },
      {
        id: 'edit',
        label: t('budget:invoiceDetail.deposits.menu.edit'),
        onClick: () => onEdit(deposit),
      },
      {
        id: 'delete',
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
                t(I18N_UNION_KEYS.depositEntryType.key(deposit.entryType), {
                  ns: I18N_UNION_KEYS.depositEntryType.ns,
                }),
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
        id: 'mark-paid',
        label: t('budget:invoiceDetail.deposits.menu.markPaid'),
        onClick: onMarkPaid,
      },
      {
        id: 'edit',
        label: t('budget:invoiceDetail.deposits.menu.edit'),
        onClick: () => onEdit(deposit),
      },
      {
        id: 'delete',
        label: t('budget:invoiceDetail.deposits.menu.delete'),
        onClick: () => onDelete(deposit),
        variant: 'destructive',
      },
    );
  } else if (deposit.status === 'paid') {
    menuItems.push(
      {
        id: 'mark-claimed',
        label: t('budget:invoiceDetail.deposits.menu.markClaimed'),
        onClick: onMarkClaimed,
      },
      {
        id: 'revert-to-pending',
        label: t('budget:invoiceDetail.deposits.menu.revertToPending'),
        onClick: () => onRevertToPending(deposit),
      },
      {
        id: 'edit',
        label: t('budget:invoiceDetail.deposits.menu.edit'),
        onClick: () => onEdit(deposit),
      },
      {
        id: 'delete',
        label: t('budget:invoiceDetail.deposits.menu.delete'),
        onClick: () => onDelete(deposit),
        variant: 'destructive',
      },
    );
  } else if (deposit.status === 'claimed') {
    menuItems.push(
      {
        id: 'revert-to-paid',
        label: t('budget:invoiceDetail.deposits.menu.revertToPaid'),
        onClick: () => onRevertToPaid(deposit),
      },
      {
        id: 'edit',
        label: t('budget:invoiceDetail.deposits.menu.edit'),
        onClick: () => onEdit(deposit),
      },
      {
        id: 'delete',
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
              t(I18N_UNION_KEYS.depositEntryType.key(deposit.entryType), {
                ns: I18N_UNION_KEYS.depositEntryType.ns,
              }),
          })}
          placement="top-end"
          usePortal
        />
      </div>
    </div>
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
