import { useTranslation } from 'react-i18next';
import type { ItemGrantChip } from '@cornerstone/shared';
import sharedStyles from '../../styles/shared.module.css';
import { useFormatters } from '../../lib/formatters.js';
import { formatRate } from '../../lib/formatRate.js';
import { Badge } from './Badge.js';
import badgeStyles from './Badge.module.css';
import styles from './GrantChips.module.css';

export interface GrantChipsProps {
  /** The grants covering the item (rejected ones are never sent). Renders nothing for none. */
  readonly grants?: readonly ItemGrantChip[];
  readonly testId: string;
}

/**
 * The grant chip of a task or purchase row: "‹name› · ‹rate›" for the first grant and a "+n"
 * badge when more grants cover the item (its accessible name lists all of them). Chips are
 * plain labels, not links.
 */
export function GrantChips({ grants, testId }: GrantChipsProps) {
  const { t } = useTranslation('budget');
  const { formatCurrency, formatPercent } = useFormatters();
  if (!grants || grants.length === 0) return null;

  const [first, ...others] = grants;
  const rateText = (grant: ItemGrantChip) =>
    grant.reductionType === 'fixed'
      ? formatCurrency(grant.rate)
      : formatRate(grant.rate, formatPercent);
  const firstText = `${first!.name} · ${rateText(first!)}`;

  return (
    <span className={styles.chips} data-testid={testId}>
      <Badge
        variants={{
          grant: { label: firstText, className: `${badgeStyles.neutral} ${styles.chip}` },
        }}
        value="grant"
        title={firstText}
        testId={`${testId}-first`}
      />
      {others.length > 0 && (
        <>
          <span aria-hidden="true">
            <Badge
              variants={{ more: { label: `+${others.length}`, className: badgeStyles.neutral } }}
              value="more"
              testId={`${testId}-more`}
            />
          </span>
          <span className={sharedStyles.srOnly}>
            {t('financing.grantChips.more', {
              names: grants.map((grant) => grant.name).join(', '),
            })}
          </span>
        </>
      )}
    </span>
  );
}

export default GrantChips;
