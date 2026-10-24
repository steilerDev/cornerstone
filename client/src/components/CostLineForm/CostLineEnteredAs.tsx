import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../contexts/LocaleContext.js';
import { useFormatters } from '../../lib/formatters.js';
import { computeGross, computeNet } from './costLineValues.js';
import type { CostLineValues } from './costLineValues.js';
import styles from './CostLineForm.module.css';

export interface CostLineEnteredAsProps {
  /** DOM id of the group (the field name). */
  readonly id: string;
  readonly values: CostLineValues;
  readonly onChange: (includesVat: boolean) => void;
  readonly busy: boolean;
  readonly describedBy: string | undefined;
}

/**
 * The Entered as radio group (Net adds VAT, Gross includes it) and the result line below it. The
 * radios live inside the field's `fieldset`; the result is the form's one `role="status"` here.
 */
export function CostLineEnteredAs({
  id,
  values,
  onChange,
  busy,
  describedBy,
}: CostLineEnteredAsProps) {
  const { t } = useTranslation('costLines');
  const { vatRate } = useLocale();
  const { formatCurrency, formatPercent } = useFormatters();
  const groupId = useId();
  const rate = formatPercent(vatRate * 100, 0);
  const gross = computeGross(values, vatRate);
  const net = computeNet(values, vatRate);

  const option = (value: boolean, label: string, testId: string) => (
    <label className={styles.enteredOption}>
      <input
        type="radio"
        name={groupId}
        className={styles.enteredInput}
        checked={values.includesVat === value}
        aria-disabled={busy || undefined}
        onChange={() => {
          if (!busy) onChange(value);
        }}
        data-testid={testId}
      />
      <span className={styles.enteredLabel}>{label}</span>
    </label>
  );

  return (
    <>
      <div
        id={id}
        role="radiogroup"
        aria-describedby={describedBy}
        className={styles.enteredGroup}
        tabIndex={-1}
      >
        {option(false, t('entered.net'), 'cost-line-entered-net')}
        {option(true, t('entered.gross'), 'cost-line-entered-gross')}
      </div>
      {!values.includesVat && <p className={styles.hint}>{t('form.enteredAsNetHint', { rate })}</p>}
      <p role="status" className={styles.result} data-testid="cost-line-result">
        {Number.isFinite(gross) && Number.isFinite(net)
          ? t(values.includesVat ? 'form.resultGross' : 'form.resultNet', {
              gross: formatCurrency(gross),
              net: formatCurrency(net),
              rate,
            })
          : ''}
      </p>
    </>
  );
}
