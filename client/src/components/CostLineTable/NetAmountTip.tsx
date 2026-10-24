import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../lib/formatters.js';
import { Tooltip } from '../Tooltip/Tooltip.js';
import styles from './NetAmountTip.module.css';

export interface NetAmountTipProps {
  readonly gross: number;
  readonly net: number;
  /** Fraction (0.19 = 19%). */
  readonly vatRate: number;
  /** The line's name, for the trigger's accessible name. */
  readonly name: string;
  readonly testId?: string;
}

/**
 * A gross amount with its net amount and VAT in a tooltip. The trigger is a real button (hover,
 * focus and tap open it; Escape closes it), so touch and keyboard users get the net amount too.
 */
export function NetAmountTip({ gross, net, vatRate, name, testId }: NetAmountTipProps) {
  const { t } = useTranslation('costLines');
  const { formatCurrency, formatPercent } = useFormatters();
  const tipId = useId();

  return (
    <span className={styles.root}>
      <span className={styles.amount} data-testid={testId}>
        {formatCurrency(gross)}
      </span>
      <Tooltip
        id={tipId}
        toggleOnClick
        align="end"
        content={t('table.netTip', {
          net: formatCurrency(net),
          rate: formatPercent(vatRate * 100, 0),
        })}
      >
        <button
          type="button"
          className={styles.trigger}
          aria-label={t('table.netTipLabel', { name })}
          aria-describedby={tipId}
        >
          <span aria-hidden="true">ⓘ</span>
        </button>
      </Tooltip>
    </span>
  );
}
