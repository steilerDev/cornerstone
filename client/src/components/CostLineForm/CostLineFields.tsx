import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConfidenceLevel } from '@cornerstone/shared';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { useFormatters } from '../../lib/formatters.js';
import type { CostLineRow } from '../CostLineTable/types.js';
import type { ObjectFormRenderContext } from '../ObjectForm/types.js';
import type { CostLineValues } from './costLineValues.js';
import styles from './CostLineForm.module.css';

/** Basis values a line may carry while it has no offer or invoice. */
const ESTIMATE_BASES: readonly ConfidenceLevel[] = ['own_estimate', 'professional_estimate'];

export interface CostLineBasisFieldProps {
  readonly ctx: ObjectFormRenderContext;
  /** The saved line being edited; a linked line shows its Basis as read-only text (AC2). */
  readonly row: CostLineRow | null;
}

/**
 * Basis: a select while the line is an Estimate; once it has an offer or invoice the Basis is set by
 * that document and shown as read-only text with the reason (never a natively disabled control).
 */
export function CostLineBasisField({ ctx, row }: CostLineBasisFieldProps) {
  const { t } = useTranslation('costLines');
  const reasonId = useId();
  const basis = I18N_UNION_KEYS.costLineBasis;
  const value = (typeof ctx.value === 'string' ? ctx.value : 'own_estimate') as ConfidenceLevel;

  if (row !== null && row.invoiceId !== null) {
    const fromOffer = row.invoiceStatus === 'quotation';
    const shown: ConfidenceLevel = fromOffer ? 'quote' : 'invoice';
    return (
      <>
        <input
          id={ctx.id}
          type="text"
          className={styles.input}
          value={t(basis.key(shown))}
          readOnly
          aria-readonly="true"
          aria-describedby={[reasonId, ctx.describedBy].filter(Boolean).join(' ')}
          data-testid="cost-line-basis-locked"
        />
        <p id={reasonId} className={styles.hint}>
          {t(fromOffer ? 'form.basisLockedOffer' : 'form.basisLockedInvoice')}
        </p>
      </>
    );
  }

  // A legacy estimate may still carry another value; it stays selectable so it is not silently changed.
  const levels = ESTIMATE_BASES.includes(value) ? ESTIMATE_BASES : [...ESTIMATE_BASES, value];
  return (
    <select
      id={ctx.id}
      className={styles.select}
      value={value}
      aria-describedby={ctx.describedBy}
      aria-disabled={ctx.busy || undefined}
      onChange={(event) => {
        if (!ctx.busy) ctx.setValue(event.target.value);
      }}
      data-testid="cost-line-basis"
    >
      {levels.map((level) => (
        <option key={level} value={level}>
          {t(basis.key(level))}
        </option>
      ))}
    </select>
  );
}

export interface CostLineAmountFieldProps {
  readonly ctx: ObjectFormRenderContext;
  readonly values: CostLineValues;
}

/**
 * The single amount: typed for a direct-priced line, or the amount a picked existing line takes on
 * the offer or invoice (empty = the line's own gross, shown as the placeholder).
 */
export function CostLineAmountField({ ctx, values }: CostLineAmountFieldProps) {
  const { formatCurrency } = useFormatters();
  const text = typeof ctx.value === 'string' ? ctx.value : '';
  return (
    <input
      id={ctx.id}
      name={ctx.id}
      type="number"
      className={`${styles.input} ${ctx.invalid ? styles.inputError : ''}`}
      value={text}
      min={0}
      placeholder={values.existingLineId ? formatCurrency(values.existingLineId.gross) : undefined}
      readOnly={ctx.busy}
      aria-invalid={ctx.invalid || undefined}
      aria-describedby={ctx.describedBy}
      onChange={(event) => ctx.setValue(event.target.value)}
      onWheel={(event) => event.currentTarget.blur()}
      data-testid="cost-line-amount"
    />
  );
}
