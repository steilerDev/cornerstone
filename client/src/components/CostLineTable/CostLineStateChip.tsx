import type { ConfidenceLevel } from '@cornerstone/shared';
import { useTranslation } from 'react-i18next';
import { Badge } from '../Badge/Badge.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useFormatters } from '../../lib/formatters.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import type { CostLineState } from './costLineState.js';
import styles from './CostLineStateChip.module.css';

export interface CostLineStateChipProps {
  readonly state: CostLineState;
  /** Estimate only: the Basis (and margin) shown beside the chip as text. */
  readonly basis?: ConfidenceLevel;
  /** Fraction (0.2 = ±20%). */
  readonly margin?: number;
  readonly testId?: string;
}

/**
 * The derived state of a cost line (Estimate, Offered, Invoiced, Paid, Submitted). An Estimate
 * adds its Basis and margin as muted text, so the state never depends on colour alone. Not a
 * figure: no `data-figure`.
 */
export function CostLineStateChip({ state, basis, margin = 0, testId }: CostLineStateChipProps) {
  const { t } = useTranslation('costLines');
  const { formatPercent } = useFormatters();
  const variants = useStatusBadgeVariants().costLine;
  const basisSet = I18N_UNION_KEYS.costLineBasis;

  let basisText: string | null = null;
  if (state === 'estimate' && basis !== undefined) {
    const basisLabel = t(basisSet.key(basis));
    basisText =
      margin > 0
        ? t('table.basisMargin', { basis: basisLabel, margin: formatPercent(margin * 100, 0) })
        : t('table.basisNoMargin', { basis: basisLabel });
  }

  return (
    <span className={styles.chip}>
      <Badge variants={variants} value={state} testId={testId} />
      {basisText !== null && <span className={styles.basis}>{basisText}</span>}
    </span>
  );
}
