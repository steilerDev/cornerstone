import { useId } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/Badge/Badge.js';
import type { BadgeVariantMap } from '../../components/Badge/Badge.js';
import { FormError } from '../../components/FormError/FormError.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { SuggestionBadge } from '../../components/SuggestionBadge/SuggestionBadge.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { useFormatters } from '../../lib/formatters.js';
import styles from './InvoiceConvertPage.module.css';
import type { ConvertField } from './useConvertDocument.js';
import type { ConvertTargetStatus, UseConvertOffer } from './useConvertOffer.js';

const STATUS_CHOICES: readonly ConvertTargetStatus[] = ['pending', 'paid'];

export interface ConvertDetailsCardProps {
  readonly convert: UseConvertOffer;
  readonly amountRef: RefObject<HTMLInputElement | null>;
  readonly dateRef: RefObject<HTMLInputElement | null>;
  readonly dueDateRef: RefObject<HTMLInputElement | null>;
}

/** The final invoice's own fields, how far the final amount is from the offer, and its status. */
export function ConvertDetailsCard({
  convert,
  amountRef,
  dateRef,
  dueDateRef,
}: ConvertDetailsCardProps) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const { formatCurrency, formatDate, formatPercent } = useFormatters();
  const baseId = useId();
  const { form, visibleFieldErrors, suggestions, delta } = convert;
  const disabled = convert.isSaving;

  const fieldLabels: Record<ConvertField, string> = {
    amount: t('convertPage.details.finalAmount'),
    date: t('convertPage.details.date'),
    invoiceNumber: t('convertPage.details.invoiceNumber'),
    dueDate: t('convertPage.details.dueDate'),
    notes: t('convertPage.details.notes'),
  };

  const formatSuggestion = (field: ConvertField, value: string): string => {
    if (field === 'amount') return formatCurrency(Number(value));
    return field === 'date' || field === 'dueDate' ? formatDate(value) : value;
  };

  const suggestion = (field: ConvertField) => {
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

  const diffAmounts = {
    amount: formatCurrency(delta.absolute),
    percent: formatPercent(delta.percent, 1),
  };
  const diffVariants: BadgeVariantMap = {
    increase: {
      label: t('convertPage.details.more', diffAmounts),
      className: styles.diffMore!,
    },
    decrease: {
      label: t('convertPage.details.less', diffAmounts),
      className: styles.diffLess!,
    },
    none: { label: t('convertPage.details.same'), className: styles.diffSame! },
  };

  const errorId = (field: string) => `${baseId}-${field}-error`;
  const requiredMark = <span className={styles.required}> {tc('objectForm.required')}</span>;
  const statusLabelId = `${baseId}-status`;

  return (
    <SectionCard
      id="convert-details"
      title={t('convertPage.details.title')}
      testId="convert-details"
    >
      <div className={styles.detailsGrid}>
        <div className={styles.field}>
          <label htmlFor={`${baseId}-amount`} className={styles.label}>
            {fieldLabels.amount}
            {requiredMark}
          </label>
          <div className={styles.amountRow}>
            <input
              type="number"
              id={`${baseId}-amount`}
              ref={amountRef}
              data-testid="convert-final-amount"
              className={`${styles.input} ${visibleFieldErrors.amount ? styles.inputInvalid : ''}`}
              value={form.amount}
              onChange={(e) => convert.setField('amount', e.target.value)}
              onBlur={() => convert.markTouched('amount')}
              onWheel={(e) => e.currentTarget.blur()}
              min="0.01"
              step="0.01"
              inputMode="decimal"
              required
              disabled={disabled}
              aria-invalid={visibleFieldErrors.amount ? true : undefined}
              aria-describedby={visibleFieldErrors.amount ? errorId('amount') : undefined}
            />
            <span data-testid="convert-difference">
              <Badge variants={diffVariants} value={delta.direction} />
            </span>
          </div>
          <FormError variant="field" id={errorId('amount')} message={visibleFieldErrors.amount} />
          {suggestion('amount')}
        </div>

        <div className={styles.field}>
          <label htmlFor={`${baseId}-date`} className={styles.label}>
            {fieldLabels.date}
            {requiredMark}
          </label>
          <input
            type="date"
            id={`${baseId}-date`}
            ref={dateRef}
            data-testid="convert-date"
            className={`${styles.input} ${visibleFieldErrors.date ? styles.inputInvalid : ''}`}
            value={form.date}
            onChange={(e) => convert.setField('date', e.target.value)}
            onBlur={() => convert.markTouched('date')}
            required
            disabled={disabled}
            aria-invalid={visibleFieldErrors.date ? true : undefined}
            aria-describedby={visibleFieldErrors.date ? errorId('date') : undefined}
          />
          <FormError variant="field" id={errorId('date')} message={visibleFieldErrors.date} />
          {suggestion('date')}
        </div>

        <div className={styles.field}>
          <label htmlFor={`${baseId}-number`} className={styles.label}>
            {fieldLabels.invoiceNumber}
          </label>
          <input
            type="text"
            id={`${baseId}-number`}
            data-testid="convert-invoice-number"
            className={styles.input}
            value={form.invoiceNumber}
            onChange={(e) => convert.setField('invoiceNumber', e.target.value)}
            maxLength={100}
            disabled={disabled}
          />
          {suggestion('invoiceNumber')}
        </div>

        <div className={styles.field}>
          <label htmlFor={`${baseId}-due`} className={styles.label}>
            {fieldLabels.dueDate}
          </label>
          <input
            type="date"
            id={`${baseId}-due`}
            ref={dueDateRef}
            data-testid="convert-due-date"
            className={`${styles.input} ${visibleFieldErrors.dueDate ? styles.inputInvalid : ''}`}
            value={form.dueDate}
            onChange={(e) => convert.setField('dueDate', e.target.value)}
            disabled={disabled}
            aria-invalid={visibleFieldErrors.dueDate ? true : undefined}
            aria-describedby={visibleFieldErrors.dueDate ? errorId('dueDate') : undefined}
          />
          <FormError variant="field" id={errorId('dueDate')} message={visibleFieldErrors.dueDate} />
          {suggestion('dueDate')}
        </div>

        <div className={`${styles.field} ${styles.fullWidth}`}>
          <label htmlFor={`${baseId}-notes`} className={styles.label}>
            {fieldLabels.notes}
          </label>
          <textarea
            id={`${baseId}-notes`}
            data-testid="convert-notes"
            className={styles.textarea}
            value={form.notes}
            onChange={(e) => convert.setField('notes', e.target.value)}
            maxLength={10000}
            rows={3}
            disabled={disabled}
            aria-describedby={`${baseId}-notes-hint`}
          />
          <p className={styles.hint} id={`${baseId}-notes-hint`}>
            {t('convertPage.details.notesHint')}
          </p>
          {suggestion('notes')}
        </div>

        <div className={`${styles.field} ${styles.fullWidth}`}>
          <span className={styles.label} id={statusLabelId}>
            {t('convertPage.details.status')}
          </span>
          <div className={styles.modeSelector} role="group" aria-labelledby={statusLabelId}>
            {STATUS_CHOICES.map((choice) => (
              <label key={choice}>
                <input
                  type="radio"
                  name={`${baseId}-status`}
                  value={choice}
                  checked={form.status === choice}
                  onChange={() => convert.setStatus(choice)}
                  disabled={disabled}
                  data-testid={`convert-status-${choice}`}
                />
                {tc(I18N_UNION_KEYS.statusVocabularyInvoice.key(choice))}
              </label>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
