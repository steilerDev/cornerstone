import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  BudgetSource,
  InvoiceDeposit,
  InvoiceStatus,
  InvoiceBudgetLineDetailResponse,
} from '@cornerstone/shared';
import { deleteDeposit } from '../../lib/invoiceDepositsApi.js';
import { fetchBudgetSources } from '../../lib/budgetSourcesApi.js';
import { fetchInvoiceBudgetLines } from '../../lib/invoiceBudgetLinesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useFormatters } from '../../lib/formatters.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { Badge, type BadgeVariantMap } from '../../components/Badge/Badge.js';
import { OverflowMenu, type OverflowMenuItem } from '../../components/OverflowMenu/index.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu.js';
import { progressPaymentTransitions } from '../../components/StatusMenu/statusVocabularies.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { changeDepositStatus, depositStatusBody } from '../../lib/statusChangeApi.js';
import { InvoiceDepositFormModal, type DepositFormState } from './InvoiceDepositFormModal.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
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
  const { t: tc } = useTranslation('common');
  const { run: runStatusChange } = useUndoableStatusChange();

  // Modal states
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedDeposit, setSelectedDeposit] = useState<InvoiceDeposit | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState(false);

  // Budget sources
  const [budgetSources, setBudgetSources] = useState<BudgetSource[]>([]);

  // Budget lines (for auto-default logic)
  const [budgetLines, setBudgetLines] = useState<InvoiceBudgetLineDetailResponse[]>([]);

  // Form state
  const [addInitialValues, setAddInitialValues] = useState<Partial<DepositFormState>>({});
  const [formError, setFormError] = useState<string>('');

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

  const variants = useStatusBadgeVariants();

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
    setDeleteBlocked(false);
    setModalMode('delete');
  };

  const closeModal = () => {
    if (!isMutating) {
      setModalMode(null);
      setSelectedDeposit(null);
      setAddInitialValues({});
      setFormError('');
      setDeleteBlocked(false);
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
        setDeleteBlocked(err.statusCode === 409);
        setFormError(translateApiError(err.error.code, tErrors));
      } else {
        setFormError(t('budget:invoiceDetail.deposits.errors.deleteError'));
      }
    } finally {
      setIsMutating(false);
    }
  };

  const depositName = (deposit: InvoiceDeposit): string =>
    deposit.description ??
    t(I18N_UNION_KEYS.depositEntryType.key(deposit.entryType), {
      ns: I18N_UNION_KEYS.depositEntryType.ns,
    });

  const renderStatusControl = (deposit: InvoiceDeposit, testId: string): ReactNode => (
    <StatusMenu
      transitions={progressPaymentTransitions(tc, deposit)}
      badge={{ variants: variants.progressPayment, value: deposit.status }}
      currentLabel={variants.progressPayment[deposit.status].label}
      focusFallbackRef={addButtonRef}
      testId={testId}
      onApply={(to, date) =>
        runStatusChange({
          request: () =>
            changeDepositStatus(invoiceId, deposit.id, depositStatusBody(deposit.status, to, date)),
          recordName: depositName(deposit),
          statusLabel: variants.progressPayment[to].label,
          dedupeKey: `deposit:${deposit.id}`,
          onChanged: () => onDepositMutated(),
          onUndone: () => onDepositMutated(),
        })
      }
    />
  );

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
                    onEdit={openEditModal}
                    onDelete={openDeleteModal}
                    statusControl={renderStatusControl(deposit, `deposit-status-${deposit.id}`)}
                    refundVariants={variants.refund}
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
                onEdit={openEditModal}
                onDelete={openDeleteModal}
                statusControl={renderStatusControl(deposit, `deposit-status-mobile-${deposit.id}`)}
                refundVariants={variants.refund}
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
              <Badge variants={variants.invoice} value={invoiceStatus} />
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

      {/* Delete confirmation */}
      {modalMode === 'delete' && selectedDeposit && (
        <DeleteDepositDialog
          deposit={selectedDeposit}
          name={depositName(selectedDeposit)}
          onConfirm={handleDeleteConfirm}
          onClose={closeModal}
          error={formError}
          blocked={deleteBlocked}
          isMutating={isMutating}
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
  onEdit: (deposit: InvoiceDeposit) => void;
  onDelete: (deposit: InvoiceDeposit) => void;
  /** The status chip / menu for this deposit. */
  statusControl: ReactNode;
  refundVariants: BadgeVariantMap;
  t: (key: string, opts?: Record<string, unknown>) => string;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
}

function buildMenuItems(
  deposit: InvoiceDeposit,
  t: DepositRowProps['t'],
  onEdit: (deposit: InvoiceDeposit) => void,
  onDelete: (deposit: InvoiceDeposit) => void,
): OverflowMenuItem[] {
  return [
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
  ];
}

function DepositRow({
  deposit,
  onEdit,
  onDelete,
  statusControl,
  refundVariants,
  t,
  formatCurrency,
  formatDate,
}: DepositRowProps) {
  const menuItems = buildMenuItems(deposit, t, onEdit, onDelete);

  return (
    <tr className={styles.tableRow}>
      <td>{formatDate(deposit.dueDate)}</td>
      <td>
        <div className={styles.amountCell}>
          {deposit.entryType === 'refund' && <Badge variants={refundVariants} value="refund" />}
          <span className={deposit.entryType === 'refund' ? styles.amountNegative : undefined}>
            {formatCurrency(deposit.entryType === 'refund' ? -deposit.amount : deposit.amount)}
          </span>
        </div>
      </td>
      <td>{statusControl}</td>
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
  statusControl,
  refundVariants,
  t,
  formatCurrency,
  formatDate,
}: DepositCardProps) {
  const menuItems = buildMenuItems(deposit, t, onEdit, onDelete);

  return (
    <div className={styles.mobileCard}>
      <div className={styles.cardTopRow}>
        <div className={styles.cardAmount}>
          {deposit.entryType === 'refund' && <Badge variants={refundVariants} value="refund" />}
          <span className={deposit.entryType === 'refund' ? styles.amountNegative : undefined}>
            {formatCurrency(deposit.entryType === 'refund' ? -deposit.amount : deposit.amount)}
          </span>
        </div>
        {statusControl}
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
// Sub-component: DeleteDepositDialog
// ============================================================================

interface DeleteDepositDialogProps {
  deposit: InvoiceDeposit;
  name: string;
  onConfirm: () => void;
  onClose: () => void;
  error: string;
  blocked: boolean;
  isMutating: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function DeleteDepositDialog({
  deposit,
  name,
  onConfirm,
  onClose,
  error,
  blocked,
  isMutating,
  t,
}: DeleteDepositDialogProps) {
  const isPaidOrClaimed = deposit.status === 'paid' || deposit.status === 'claimed';

  return (
    <ConfirmDialog
      title={t('common:confirmDialog.deleteTitle', { name })}
      lead={
        isPaidOrClaimed ? (
          <div className={styles.warningBanner}>
            {t('budget:invoiceDetail.deposits.modal.deleteWarningPaidClaimed')}
          </div>
        ) : undefined
      }
      irreversible
      confirmLabel={t('common:button.delete')}
      busyLabel={t('common:confirmDialog.deleting')}
      busy={isMutating}
      blocked={blocked}
      error={error || null}
      onConfirm={onConfirm}
      onCancel={onClose}
      testIdPrefix="deposit-delete"
    />
  );
}
