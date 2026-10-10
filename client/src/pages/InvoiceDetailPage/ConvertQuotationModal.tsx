import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../lib/formatters.js';
import { Modal } from '../../components/Modal/Modal.js';
import { FormError } from '../../components/FormError/FormError.js';
import { Badge, type BadgeVariantMap } from '../../components/Badge/Badge.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { Spinner } from '../../components/Spinner/Spinner.js';
import { SuggestionBadge } from '../../components/SuggestionBadge/SuggestionBadge.js';
import sharedStyles from '../../styles/shared.module.css';
import type { ConvertField, ConvertLineState, UseConvertQuotation } from './useConvertQuotation.js';
import styles from './ConvertQuotationModal.module.css';

interface ConvertQuotationModalProps {
  convert: UseConvertQuotation;
}

export function ConvertQuotationModal({ convert }: ConvertQuotationModalProps) {
  const { t } = useTranslation('budget');
  const { formatCurrency, formatDate, formatPercent } = useFormatters();
  const baseId = useId();

  const {
    form,
    lines,
    keepExisting,
    delta,
    quotedAmount,
    finalAmount,
    depositTotals,
    finalPayment,
    shortfall,
    visibleFieldErrors,
    invalidLineIds,
    paperless,
    llmEnabled,
    selectedDocument,
    aiState,
    suggestions,
    pendingFocus,
    clearPendingFocus,
    saveError,
  } = convert;

  const addRefundRef = useRef<HTMLButtonElement>(null);
  const finalAmountRef = useRef<HTMLInputElement>(null);
  const selectDocumentRef = useRef<HTMLButtonElement>(null);
  const saveErrorRef = useRef<HTMLDivElement>(null);

  // Restore focus after a sub-flow (refund modal, document picker) returns to this form.
  useEffect(() => {
    if (!pendingFocus) return;
    const timer = setTimeout(() => {
      const target =
        pendingFocus === 'addRefund'
          ? addRefundRef.current
          : pendingFocus === 'finalAmount'
            ? finalAmountRef.current
            : selectDocumentRef.current;
      target?.focus();
      clearPendingFocus();
    }, 0);
    return () => clearTimeout(timer);
  }, [pendingFocus, clearPendingFocus]);

  // Move focus to the error summary when a save fails.
  useEffect(() => {
    if (saveError) saveErrorRef.current?.focus();
  }, [saveError]);

  const ids = {
    sourceHeading: `${baseId}-source`,
    detailsHeading: `${baseId}-details`,
    linesHeading: `${baseId}-lines`,
    depositsHeading: `${baseId}-deposits`,
    statusHeading: `${baseId}-status`,
    overpaidBanner: `${baseId}-overpaid`,
    aiHint: `${baseId}-ai-hint`,
  };

  const fieldLabels: Record<ConvertField, string> = {
    amount: t('invoiceDetail.convertModal.details.finalAmount'),
    date: t('invoiceDetail.convertModal.details.date'),
    invoiceNumber: t('invoiceDetail.convertModal.details.invoiceNumber'),
    dueDate: t('invoiceDetail.convertModal.details.dueDate'),
    notes: t('invoiceDetail.convertModal.details.notes'),
  };

  const formatSuggestion = (field: ConvertField, value: string): string => {
    if (field === 'amount') {
      const n = Number(value);
      return Number.isFinite(n) ? formatCurrency(n) : value;
    }
    if (field === 'date' || field === 'dueDate') return formatDate(value);
    return value;
  };

  const renderSuggestion = (field: ConvertField) => {
    const value = suggestions[field];
    if (value === undefined) return null;
    return (
      <SuggestionBadge
        suggestedValue={value}
        displayValue={formatSuggestion(field, value)}
        fieldLabel={fieldLabels[field]}
        onApply={() => convert.applySuggestion(field)}
        multiLine={field === 'notes'}
      />
    );
  };

  const deltaVariants: BadgeVariantMap = {
    increase: {
      label: t('invoiceDetail.convertModal.details.deltaIncrease', {
        amount: formatCurrency(delta.absolute),
        percent: formatPercent(delta.percent, 1),
      }),
      className: styles.deltaIncrease!,
    },
    decrease: {
      label: t('invoiceDetail.convertModal.details.deltaDecrease', {
        amount: formatCurrency(delta.absolute),
        percent: formatPercent(delta.percent, 1),
      }),
      className: styles.deltaDecrease!,
    },
    none: {
      label: t('invoiceDetail.convertModal.details.deltaNone'),
      className: styles.deltaNone!,
    },
  };

  const statusVariants = useStatusBadgeVariants();

  const aiHintText = !llmEnabled
    ? t('invoiceDetail.convertModal.source.aiUnavailable')
    : !selectedDocument
      ? t('invoiceDetail.convertModal.source.aiNeedsDocument')
      : null;

  const isAnalyzing = aiState === 'analyzing';

  const lineDisplayValue = (line: ConvertLineState): string =>
    keepExisting || line.keep ? line.quoted.toFixed(2) : line.proposed;

  const renderLineInput = (
    line: ConvertLineState,
    inputId: string,
    errorId: string,
  ): React.ReactNode => {
    const invalid = invalidLineIds.has(line.id);
    return (
      <>
        <input
          type="number"
          id={inputId}
          data-testid={inputId}
          className={`${styles.lineInput} ${invalid ? styles.inputInvalid : ''}`}
          value={lineDisplayValue(line)}
          onChange={(e) => convert.setLineProposed(line.id, e.target.value)}
          onWheel={(e) => e.currentTarget.blur()}
          min="0.01"
          step="0.01"
          inputMode="decimal"
          disabled={keepExisting || line.keep || convert.isSaving}
          aria-label={t('invoiceDetail.convertModal.lines.proposedAria', { name: line.name })}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
        />
        {invalid && (
          <div id={errorId}>
            <FormError
              variant="field"
              message={t('invoiceDetail.convertModal.lines.lineInvalid')}
            />
          </div>
        )}
      </>
    );
  };

  const lineTypeLabel = (line: ConvertLineState): string =>
    line.type === 'work_item'
      ? t('invoiceDetail.convertModal.lines.workItem')
      : t('invoiceDetail.convertModal.lines.householdItem');

  const footer = (
    <div className={styles.footerActions}>
      <button
        type="button"
        className={sharedStyles.btnSecondary}
        onClick={convert.close}
        disabled={convert.isSaving}
        data-testid="convert-cancel"
      >
        {t('invoiceDetail.convertModal.cancel')}
      </button>
      <button
        type="submit"
        form="convert-quotation-form"
        className={sharedStyles.btnPrimary}
        disabled={!convert.canConfirm}
        aria-describedby={shortfall > 0 ? ids.overpaidBanner : undefined}
        data-testid="convert-confirm"
      >
        {convert.isSaving ? (
          <span className={styles.confirmContent}>
            <Spinner size="sm" />
            {t('invoiceDetail.convertModal.confirming')}
          </span>
        ) : (
          t('invoiceDetail.convertModal.confirm')
        )}
      </button>
    </div>
  );

  const amountErrorId = `${baseId}-amount-error`;
  const dateErrorId = `${baseId}-date-error`;
  const dueDateErrorId = `${baseId}-duedate-error`;

  return (
    <Modal
      title={t('invoiceDetail.convertModal.title')}
      onClose={convert.close}
      className={styles.convertModal}
      footer={footer}
    >
      <form
        id="convert-quotation-form"
        data-testid="convert-quotation-form"
        noValidate
        aria-busy={convert.isSaving || isAnalyzing}
        onSubmit={(e) => {
          e.preventDefault();
          void convert.submit();
        }}
      >
        <p className={styles.intro}>{t('invoiceDetail.convertModal.intro')}</p>

        {saveError && (
          <div
            className={styles.saveErrorWrap}
            data-testid="convert-save-error"
            tabIndex={-1}
            ref={saveErrorRef}
          >
            <FormError message={saveError} />
          </div>
        )}

        {/* A. Source document */}
        <section
          className={styles.section}
          aria-labelledby={ids.sourceHeading}
          data-testid="convert-source-section"
        >
          <h3 className={styles.sectionHeading} id={ids.sourceHeading}>
            {t('invoiceDetail.convertModal.source.heading')}
          </h3>
          {!paperless.configured ? (
            <p className={styles.muted} data-testid="convert-paperless-unavailable">
              {t('invoiceDetail.convertModal.source.paperlessUnavailable')}
            </p>
          ) : (
            <>
              <div className={styles.sourceRow}>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={convert.openDocumentPicker}
                  disabled={convert.isSaving}
                  ref={selectDocumentRef}
                  data-testid="convert-select-document"
                >
                  {selectedDocument
                    ? t('invoiceDetail.convertModal.source.change')
                    : t('invoiceDetail.convertModal.source.select')}
                </button>
                <span
                  className={`${styles.selectedDocument} ${selectedDocument ? '' : styles.selectedDocumentEmpty}`}
                  title={selectedDocument?.title}
                  data-testid="convert-selected-document"
                >
                  {selectedDocument?.title || t('invoiceDetail.convertModal.source.none')}
                </span>
                {selectedDocument && (
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={convert.removeDocument}
                    disabled={convert.isSaving}
                    data-testid="convert-remove-document"
                  >
                    {t('invoiceDetail.convertModal.source.remove')}
                  </button>
                )}
              </div>

              <div className={styles.aiBlock}>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => void convert.analyze()}
                  disabled={!llmEnabled || !selectedDocument || isAnalyzing || convert.isSaving}
                  aria-describedby={aiHintText ? ids.aiHint : undefined}
                  data-testid="convert-ai-prefill"
                >
                  {isAnalyzing ? (
                    <span className={styles.aiButtonContent}>
                      <Spinner size="sm" color="muted" />
                      {t('invoiceDetail.convertModal.source.aiAnalyzing')}
                    </span>
                  ) : (
                    t('invoiceDetail.convertModal.source.aiAnalyze')
                  )}
                </button>
                {aiHintText && (
                  <p className={styles.hint} id={ids.aiHint}>
                    {aiHintText}
                  </p>
                )}
                {aiState === 'error' && (
                  <div data-testid="convert-ai-error">
                    <FormError message={convert.aiError} />
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={() => void convert.analyze()}
                      data-testid="convert-ai-retry"
                    >
                      {t('invoiceDetail.convertModal.source.aiRetry')}
                    </button>
                  </div>
                )}
                {aiState === 'success' && (
                  <p role="status" className={styles.successText} data-testid="convert-ai-success">
                    {t('invoiceDetail.convertModal.source.aiSuccess')}
                  </p>
                )}
                {aiState === 'success' && convert.aiMismatch && (
                  <div className={styles.aiWarning} data-testid="convert-ai-mismatch">
                    {t('invoiceDetail.convertModal.source.aiTotalMismatch', {
                      extracted: formatCurrency(convert.aiMismatch.extracted),
                      quoted: formatCurrency(quotedAmount),
                    })}
                  </div>
                )}
                {aiState === 'success' && convert.aiNoLines && (
                  <p className={styles.muted}>{t('invoiceDetail.convertModal.source.aiNoLines')}</p>
                )}
              </div>
            </>
          )}
        </section>

        {/* B. Invoice details */}
        <section className={styles.section} aria-labelledby={ids.detailsHeading}>
          <h3 className={styles.sectionHeading} id={ids.detailsHeading}>
            {t('invoiceDetail.convertModal.details.heading')}
          </h3>
          <div className={styles.detailsGrid}>
            <div className={styles.formField}>
              <label htmlFor="convert-final-amount" className={styles.label}>
                {fieldLabels.amount}
                <span className={styles.required}> {t('invoiceDetail.form.required')}</span>
              </label>
              <input
                type="number"
                id="convert-final-amount"
                data-testid="convert-final-amount"
                ref={finalAmountRef}
                className={`${styles.input} ${visibleFieldErrors.amount ? styles.inputInvalid : ''}`}
                value={form.amount}
                onChange={(e) => convert.setField('amount', e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                min="0.01"
                step="0.01"
                inputMode="decimal"
                required
                disabled={convert.isSaving}
                aria-invalid={visibleFieldErrors.amount ? true : undefined}
                aria-describedby={visibleFieldErrors.amount ? amountErrorId : undefined}
              />
              {visibleFieldErrors.amount && (
                <div id={amountErrorId}>
                  <FormError variant="field" message={visibleFieldErrors.amount} />
                </div>
              )}
              {renderSuggestion('amount')}
            </div>

            <div className={styles.formField}>
              <label htmlFor="convert-date" className={styles.label}>
                {fieldLabels.date}
                <span className={styles.required}> {t('invoiceDetail.form.required')}</span>
              </label>
              <input
                type="date"
                id="convert-date"
                data-testid="convert-date"
                className={`${styles.input} ${visibleFieldErrors.date ? styles.inputInvalid : ''}`}
                value={form.date}
                onChange={(e) => convert.setField('date', e.target.value)}
                required
                disabled={convert.isSaving}
                aria-invalid={visibleFieldErrors.date ? true : undefined}
                aria-describedby={visibleFieldErrors.date ? dateErrorId : undefined}
              />
              {visibleFieldErrors.date && (
                <div id={dateErrorId}>
                  <FormError variant="field" message={visibleFieldErrors.date} />
                </div>
              )}
              {renderSuggestion('date')}
            </div>

            <div className={styles.formField}>
              <label htmlFor="convert-invoice-number" className={styles.label}>
                {fieldLabels.invoiceNumber}
              </label>
              <input
                type="text"
                id="convert-invoice-number"
                data-testid="convert-invoice-number"
                className={styles.input}
                value={form.invoiceNumber}
                onChange={(e) => convert.setField('invoiceNumber', e.target.value)}
                maxLength={100}
                disabled={convert.isSaving}
              />
              {renderSuggestion('invoiceNumber')}
            </div>

            <div className={styles.formField}>
              <label htmlFor="convert-due-date" className={styles.label}>
                {fieldLabels.dueDate}
              </label>
              <input
                type="date"
                id="convert-due-date"
                data-testid="convert-due-date"
                className={`${styles.input} ${visibleFieldErrors.dueDate ? styles.inputInvalid : ''}`}
                value={form.dueDate}
                onChange={(e) => convert.setField('dueDate', e.target.value)}
                disabled={convert.isSaving}
                aria-invalid={visibleFieldErrors.dueDate ? true : undefined}
                aria-describedby={visibleFieldErrors.dueDate ? dueDateErrorId : undefined}
              />
              {visibleFieldErrors.dueDate && (
                <div id={dueDateErrorId}>
                  <FormError variant="field" message={visibleFieldErrors.dueDate} />
                </div>
              )}
              {renderSuggestion('dueDate')}
            </div>

            <div className={`${styles.formField} ${styles.fullWidth}`}>
              <label htmlFor="convert-notes" className={styles.label}>
                {fieldLabels.notes}
              </label>
              <textarea
                id="convert-notes"
                data-testid="convert-notes"
                className={styles.textarea}
                value={form.notes}
                onChange={(e) => convert.setField('notes', e.target.value)}
                maxLength={10000}
                rows={3}
                disabled={convert.isSaving}
                aria-describedby={`${baseId}-notes-hint`}
              />
              <p className={styles.hint} id={`${baseId}-notes-hint`}>
                {t('invoiceDetail.convertModal.details.historyHint')}
              </p>
              {renderSuggestion('notes')}
            </div>
          </div>

          <div className={styles.deltaRow} role="status" data-testid="convert-delta">
            <span>
              {t('invoiceDetail.convertModal.details.quotedAmount', {
                quoted: formatCurrency(quotedAmount),
                final: formatCurrency(finalAmount ?? 0),
              })}
            </span>
            <Badge variants={deltaVariants} value={delta.direction} />
          </div>
        </section>

        {/* C. Itemized lines */}
        <section
          className={styles.section}
          aria-labelledby={ids.linesHeading}
          data-testid="convert-lines-section"
        >
          <h3 className={styles.sectionHeading} id={ids.linesHeading}>
            {t('invoiceDetail.convertModal.lines.heading')}
            <span className={styles.countChip}>{lines.length}</span>
          </h3>
          <p className={styles.hint}>{t('invoiceDetail.convertModal.lines.proposalHint')}</p>

          {lines.length === 0 ? (
            <p className={styles.muted} data-testid="convert-lines-empty">
              {t('invoiceDetail.convertModal.lines.empty')}
            </p>
          ) : (
            <>
              <div className={styles.linesToolbar}>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={convert.resetProposal}
                  disabled={keepExisting || convert.isSaving}
                  data-testid="convert-reset-proposal"
                >
                  {t('invoiceDetail.convertModal.lines.reset')}
                </button>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={keepExisting}
                    onChange={(e) => convert.setKeepExisting(e.target.checked)}
                    disabled={convert.isSaving}
                    data-testid="convert-keep-existing"
                  />
                  {t('invoiceDetail.convertModal.lines.keepExisting')}
                </label>
              </div>

              <div className={styles.linesTableWrap}>
                <table className={styles.linesTable}>
                  <caption className={sharedStyles.srOnly}>
                    {t('invoiceDetail.convertModal.lines.caption')}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('invoiceDetail.convertModal.lines.columns.line')}</th>
                      <th scope="col" className={styles.numeric}>
                        {t('invoiceDetail.convertModal.lines.columns.quoted')}
                      </th>
                      <th scope="col" className={styles.numeric}>
                        {t('invoiceDetail.convertModal.lines.columns.proposed')}
                      </th>
                      <th scope="col">{t('invoiceDetail.convertModal.lines.columns.keep')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id} data-testid={`convert-line-row-${line.id}`}>
                        <td>
                          <div className={styles.lineName}>
                            <span>{line.name}</span>
                            <span className={styles.lineType}>{lineTypeLabel(line)}</span>
                          </div>
                        </td>
                        <td className={styles.numeric}>{formatCurrency(line.quoted)}</td>
                        <td className={styles.numeric}>
                          {renderLineInput(
                            line,
                            `convert-line-input-${line.id}`,
                            `${baseId}-line-error-${line.id}`,
                          )}
                        </td>
                        <td>
                          <label className={styles.checkLabel}>
                            <input
                              type="checkbox"
                              checked={keepExisting || line.keep}
                              onChange={(e) => convert.setLineKeep(line.id, e.target.checked)}
                              disabled={keepExisting || convert.isSaving}
                              aria-label={t('invoiceDetail.convertModal.lines.keepAria', {
                                name: line.name,
                              })}
                              data-testid={`convert-line-keep-${line.id}`}
                            />
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className={styles.linesCards}>
                {lines.map((line) => (
                  <li
                    key={line.id}
                    className={styles.mobileCard}
                    data-testid={`convert-line-card-${line.id}`}
                  >
                    <div className={styles.lineName}>
                      <span>{line.name}</span>
                      <span className={styles.lineType}>{lineTypeLabel(line)}</span>
                    </div>
                    <div className={styles.mobileCardRow}>
                      <span className={styles.lineType}>
                        {t('invoiceDetail.convertModal.lines.columns.quoted')}
                      </span>
                      <span className={styles.summaryValue}>{formatCurrency(line.quoted)}</span>
                    </div>
                    {renderLineInput(
                      line,
                      `convert-line-input-mobile-${line.id}`,
                      `${baseId}-line-error-mobile-${line.id}`,
                    )}
                    <label className={styles.checkLabel}>
                      <input
                        type="checkbox"
                        checked={keepExisting || line.keep}
                        onChange={(e) => convert.setLineKeep(line.id, e.target.checked)}
                        disabled={keepExisting || convert.isSaving}
                        aria-label={t('invoiceDetail.convertModal.lines.keepAria', {
                          name: line.name,
                        })}
                        data-testid={`convert-line-keep-mobile-${line.id}`}
                      />
                      {t('invoiceDetail.convertModal.lines.columns.keep')}
                    </label>
                  </li>
                ))}
              </ul>

              <div
                className={`${styles.totals} ${convert.overAllocated ? styles.totalsOver : ''}`}
                role="status"
              >
                <div className={styles.summaryRow}>
                  <span>{t('invoiceDetail.convertModal.lines.itemizedTotal')}</span>
                  <span className={styles.summaryValue} data-testid="convert-itemized-total">
                    {formatCurrency(convert.itemizedTotal)}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span>{t('invoiceDetail.convertModal.lines.remainderDiscretionary')}</span>
                  <span className={styles.summaryValue} data-testid="convert-remainder">
                    {formatCurrency(convert.remainder)}
                  </span>
                </div>
              </div>
              {convert.overAllocated && (
                <p
                  role="alert"
                  className={styles.overAllocated}
                  data-testid="convert-over-allocated"
                >
                  {t('invoiceDetail.convertModal.lines.overAllocated', {
                    amount: formatCurrency(-convert.remainder),
                  })}
                </p>
              )}
            </>
          )}
        </section>

        {/* D. Deposits and final payment */}
        <section
          className={styles.section}
          aria-labelledby={ids.depositsHeading}
          data-testid="convert-deposits-section"
        >
          <h3 className={styles.sectionHeading} id={ids.depositsHeading}>
            {t('invoiceDetail.convertModal.deposits.heading')}
          </h3>
          <p className={styles.hint}>{t('invoiceDetail.convertModal.deposits.unchangedNote')}</p>

          {convert.invoiceDeposits.length === 0 ? (
            <p className={styles.muted}>{t('invoiceDetail.convertModal.deposits.empty')}</p>
          ) : (
            <ul className={styles.depositList}>
              {convert.invoiceDeposits.map((deposit) => (
                <li
                  key={deposit.id}
                  className={styles.depositItem}
                  data-testid={`convert-deposit-${deposit.id}`}
                >
                  <span>{formatDate(deposit.dueDate)}</span>
                  {deposit.entryType === 'refund' ? (
                    <Badge variants={statusVariants.refund} value="refund" />
                  ) : (
                    <span>{t('invoiceDetail.deposits.entryTypeLabels.deposit')}</span>
                  )}
                  <Badge variants={statusVariants.progressPayment} value={deposit.status} />
                  <span className={styles.depositAmount}>
                    {formatCurrency(
                      deposit.entryType === 'refund' ? -deposit.amount : deposit.amount,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.totals}>
            <div className={styles.summaryRow}>
              <span>{t('invoiceDetail.convertModal.deposits.finalAmount')}</span>
              <span className={styles.summaryValue}>{formatCurrency(finalAmount ?? 0)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>{t('invoiceDetail.convertModal.deposits.depositsSubtotal')}</span>
              <span className={styles.summaryValue}>
                {formatCurrency(-depositTotals.netDeposits)}
              </span>
            </div>
            <div className={`${styles.summaryRow} ${styles.summaryStrong}`}>
              <span>{t('invoiceDetail.convertModal.deposits.finalPayment')}</span>
              <span className={styles.summaryValue} data-testid="convert-final-payment">
                {formatCurrency(finalPayment)}
              </span>
            </div>
            {finalPayment === 0 && shortfall === 0 && (
              <p className={styles.hint}>{t('invoiceDetail.convertModal.deposits.noRemaining')}</p>
            )}
          </div>

          {shortfall > 0 && (
            <div
              id={ids.overpaidBanner}
              className={styles.overpaidBanner}
              role="status"
              data-testid="convert-overpaid-banner"
            >
              <p className={styles.overpaidMessage}>
                <span aria-hidden="true">⚠</span>
                <span>
                  {t('invoiceDetail.convertModal.overpaid.message', {
                    shortfall: formatCurrency(shortfall),
                    deposits: formatCurrency(depositTotals.netDeposits),
                  })}
                </span>
              </p>
              <button
                type="button"
                className={styles.actionButton}
                onClick={convert.openRefund}
                disabled={convert.isSaving}
                ref={addRefundRef}
                data-testid="convert-add-refund"
              >
                {t('invoiceDetail.convertModal.overpaid.addRefund')}
              </button>
            </div>
          )}
          {convert.shortfallResolved && (
            <span
              className={sharedStyles.srOnly}
              role="status"
              data-testid="convert-deposits-resolved"
            >
              {t('invoiceDetail.convertModal.overpaid.resolved')}
            </span>
          )}
        </section>

        {/* E. Status */}
        <section className={styles.section} aria-labelledby={ids.statusHeading}>
          <h3 className={styles.sectionHeading} id={ids.statusHeading}>
            {t('invoiceDetail.convertModal.status.heading')}
          </h3>
          <div className={styles.statusGroup} role="group" aria-labelledby={ids.statusHeading}>
            <label>
              <input
                type="radio"
                name="convert-status"
                value="pending"
                checked={form.status === 'pending'}
                onChange={() => convert.setStatus('pending')}
                disabled={convert.isSaving}
                data-testid="convert-status-pending"
              />
              {t('invoiceDetail.convertModal.status.pending')}
            </label>
            <label>
              <input
                type="radio"
                name="convert-status"
                value="paid"
                checked={form.status === 'paid'}
                onChange={() => convert.setStatus('paid')}
                disabled={convert.isSaving}
                data-testid="convert-status-paid"
              />
              {t('invoiceDetail.convertModal.status.paid')}
            </label>
          </div>
        </section>
      </form>
    </Modal>
  );
}
