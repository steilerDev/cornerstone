import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { BudgetSource, InvoiceDetail } from '@cornerstone/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { ConvertLinesTable } from '../../components/CostLineTable/index.js';
import type {
  ConvertLinesLabels,
  ConvertLinesTableHandle,
  CostLineGroup,
  CostLineRow,
} from '../../components/CostLineTable/index.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { FormError } from '../../components/FormError/FormError.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { Spinner } from '../../components/Spinner/Spinner.js';
import { StickyActionBar } from '../../components/StickyActionBar/StickyActionBar.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { TriStateCheckbox } from '../../components/TriStateCheckbox/TriStateCheckbox.js';
import { useFormatters } from '../../lib/formatters.js';
import sharedStyles from '../../styles/shared.module.css';
import { ConvertDetailsCard } from './ConvertDetailsCard.js';
import { ConvertDocumentCard } from './ConvertDocumentCard.js';
import { ConvertPaymentsCard } from './ConvertPaymentsCard.js';
import styles from './InvoiceConvertPage.module.css';
import { useConvertDocument } from './useConvertDocument.js';
import { useConvertOffer } from './useConvertOffer.js';
import type { ConvertProblem } from './useConvertOffer.js';

/** How long the figures stay quiet before they are announced. */
const FIGURES_DELAY_MS = 500;

export interface ConvertOfferFormProps {
  readonly invoice: InvoiceDetail;
  readonly rows: readonly CostLineRow[];
  readonly groups: readonly CostLineGroup[];
  readonly budgetSources: readonly BudgetSource[];
  /** Leave the page (Cancel, discard or after converting). */
  readonly onDone: () => void;
  /** The server says the record is no longer an offer: the page reloads it. */
  readonly onNotOffer: () => void;
}

/**
 * The loaded Convert form: document, details, cost lines and progress payments, with one sticky
 * bar holding Cancel and the page's one primary, Convert to final invoice.
 */
export function ConvertOfferForm({
  invoice,
  rows,
  groups,
  budgetSources,
  onDone,
  onNotOffer,
}: ConvertOfferFormProps) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const { formatCurrency } = useFormatters();
  const { showToast } = useToast();
  const convert = useConvertOffer({ invoice, rows, groups });
  const doc = useConvertDocument();
  const [discardOpen, setDiscardOpen] = useState(false);
  const problemsListId = useId();
  const refundDueId = useId();
  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const dueDateRef = useRef<HTMLInputElement>(null);
  const linesRef = useRef<ConvertLinesTableHandle>(null);
  const saveErrorRef = useRef<HTMLDivElement>(null);
  const { problems, shortfall, saveError, isSaving } = convert;
  const dirty = convert.isFormDirty || doc.document !== null;
  const blocked = problems.length > 0 || isSaving;

  // No in-app blocker exists: only a page unload can lose the entries.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // A failed save puts the message at the top of the form and moves focus to it.
  useEffect(() => {
    if (saveError) saveErrorRef.current!.focus();
  }, [saveError]);

  const focusProblem = (problem: ConvertProblem | undefined) => {
    switch (problem?.id) {
      case 'amount':
        amountRef.current!.focus();
        break;
      case 'date':
        dateRef.current!.focus();
        break;
      case 'dueDate':
        dueDateRef.current!.focus();
        break;
      case 'lines':
        linesRef.current!.focusFirstInvalid();
        break;
      case 'over':
        linesRef.current!.focusFirstEditable();
        break;
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    // Submits from portaled dialog forms (refund, document picker) bubble through the React tree.
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    const outcome = await convert.submit(doc.document?.id);
    if (outcome === 'blocked') focusProblem(problems[0]);
    else if (outcome === 'converted') {
      showToast('success', t('convertPage.converted'));
      onDone();
    } else if (outcome === 'notOffer') onNotOffer();
  };

  const handleCancel = () => {
    if (dirty) setDiscardOpen(true);
    else onDone();
  };

  const linesLabels: ConvertLinesLabels = {
    caption: t('convertPage.lines.caption'),
    line: t('convertPage.lines.columns.line'),
    offered: t('convertPage.lines.columns.offered'),
    proposed: t('convertPage.lines.columns.proposed'),
    keep: t('convertPage.lines.columns.keep'),
    keepVisible: t('convertPage.lines.keepVisible'),
    keepAria: (name) => t('convertPage.lines.keepAria', { name }),
    proposedAria: (name) => t('convertPage.lines.proposedAria', { name }),
    lineInvalid: t('convertPage.lines.lineInvalid'),
    total: t('convertPage.lines.total'),
    noDescription: t('convertPage.lines.noDescription'),
  };

  const remainderText =
    convert.remainderState === 'none'
      ? t('convertPage.lines.remainder.none')
      : convert.remainderState === 'notYetSplit'
        ? t('convertPage.lines.remainder.notYetSplit', {
            amount: formatCurrency(convert.remainder),
          })
        : t('convertPage.lines.remainder.over', { amount: formatCurrency(-convert.remainder) });

  // The live region settles on the latest figures once typing pauses.
  const figuresText = [
    rows.length > 0 ? remainderText : '',
    shortfall > 0 ? t('convertPage.refund.heading', { amount: formatCurrency(shortfall) }) : '',
  ]
    .filter(Boolean)
    .join(' ');
  const [settledFigures, setSettledFigures] = useState(figuresText);
  useEffect(() => {
    const timer = setTimeout(() => setSettledFigures(figuresText), FIGURES_DELAY_MS);
    return () => clearTimeout(timer);
  }, [figuresText]);

  const announcement = isSaving
    ? t('convertPage.actions.saving')
    : saveError ||
      (convert.submitAttempted ? problems.map((problem) => problem.message).join(' ') : '');

  const describedBy = [
    problems.length > 0 ? problemsListId : null,
    shortfall > 0 ? refundDueId : null,
  ]
    .filter((id) => id !== null)
    .join(' ');

  return (
    <form
      noValidate
      className={styles.form}
      aria-busy={isSaving}
      onSubmit={(event) => void handleSubmit(event)}
      data-testid="convert-page"
    >
      <div role="status" className={sharedStyles.srOnly} data-testid="convert-proposal-status">
        {convert.proposalAnnouncement}
      </div>

      {/* One live region for the figures that change as the user types (the table shows them twice). */}
      <div role="status" className={sharedStyles.srOnly} data-testid="convert-figures-status">
        {settledFigures}
      </div>

      {saveError && (
        <div
          tabIndex={-1}
          ref={saveErrorRef}
          className={styles.saveError}
          data-testid="convert-save-error"
        >
          <FormError message={saveError} />
        </div>
      )}

      {doc.configured && (
        <ConvertDocumentCard
          doc={doc}
          offerAmount={invoice.amount}
          onRead={convert.applyCandidates}
          disabled={isSaving}
        />
      )}

      <ConvertDetailsCard
        convert={convert}
        amountRef={amountRef}
        dateRef={dateRef}
        dueDateRef={dueDateRef}
      />

      <SectionCard
        id="convert-lines-card"
        title={t('convertPage.lines.title')}
        testId="convert-lines-card"
      >
        {rows.length === 0 ? (
          <div data-testid="convert-lines-empty">
            <EmptyState message={t('convertPage.lines.empty')} />
          </div>
        ) : (
          <div className={styles.stack}>
            <p className={styles.hint}>{t('convertPage.lines.hint')}</p>
            <div className={styles.toolbar}>
              <span data-testid="convert-keep-all">
                <TriStateCheckbox
                  checked={convert.allKept}
                  indeterminate={convert.someKept}
                  onChange={convert.setAllKept}
                  label={t('convertPage.lines.keepAll')}
                  disabled={isSaving}
                />
              </span>
              <button
                type="button"
                className={styles.textButton}
                onClick={() => {
                  if (!convert.allKept) convert.resetProposal();
                }}
                aria-disabled={convert.allKept ? 'true' : undefined}
                data-testid="convert-reset-proposal"
              >
                {t('convertPage.lines.reset')}
              </button>
            </div>
            <ConvertLinesTable
              ref={linesRef}
              groups={groups}
              lines={convert.lines}
              invalidKeys={convert.invalidKeys}
              groupProposedTotals={convert.groupProposedTotals}
              offeredTotal={convert.offeredTotal}
              proposedTotal={convert.proposedTotal}
              remainder={
                <span className={styles.remainder} data-state={convert.remainderState}>
                  {remainderText}
                </span>
              }
              onChangeProposed={convert.setLineProposed}
              onToggleKeep={convert.setLineKeep}
              disabled={isSaving}
              labels={linesLabels}
            />
          </div>
        )}
      </SectionCard>

      {convert.deposits.length > 0 && (
        <ConvertPaymentsCard
          invoiceId={invoice.id}
          convert={convert}
          budgetSources={budgetSources}
          refundDueId={refundDueId}
        />
      )}

      {problems.length > 0 && (
        <ul id={problemsListId} className={styles.problems} data-testid="convert-problems">
          {problems.map((problem) => (
            <li key={problem.id}>{problem.message}</li>
          ))}
        </ul>
      )}

      <StickyActionBar
        testId="convert-actions"
        announcement={announcement}
        status={
          <span className={styles.statusText}>
            {t('convertPage.actions.status', {
              final: formatCurrency(convert.finalAmount ?? 0),
              payment: formatCurrency(convert.finalPayment),
            })}
          </span>
        }
      >
        <button
          type="button"
          className={sharedStyles.btnSecondary}
          onClick={handleCancel}
          data-testid="convert-cancel"
        >
          {t('convertPage.actions.cancel')}
        </button>
        <button
          type="submit"
          className={`${sharedStyles.btnPrimary} ${styles.convertDisabled}`}
          aria-disabled={blocked ? 'true' : undefined}
          aria-busy={isSaving ? 'true' : undefined}
          aria-describedby={describedBy || undefined}
          data-testid="convert-confirm"
        >
          {isSaving ? (
            <span className={styles.busy}>
              <Spinner size="sm" />
              {t('convertPage.actions.converting')}
            </span>
          ) : (
            t('convertPage.actions.convert')
          )}
        </button>
      </StickyActionBar>

      {discardOpen && (
        <ConfirmDialog
          title={tc('confirmDialog.discardChangesTitle')}
          confirmLabel={tc('confirmDialog.discard')}
          busyLabel={tc('confirmDialog.discarding')}
          cancelLabel={tc('confirmDialog.keepEditing')}
          busy={false}
          onConfirm={onDone}
          onCancel={() => setDiscardOpen(false)}
          testIdPrefix="convert-discard"
        />
      )}
    </form>
  );
}
