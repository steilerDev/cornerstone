import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import { useUserText } from '../../hooks/useUserText.js';
import { useFormatters } from '../../lib/formatters.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import type { OriginState } from '../../navigation/origin.js';
import { AreaBreadcrumb } from '../AreaBreadcrumb/index.js';
import { Badge } from '../Badge/Badge.js';
import type { BadgeVariantMap } from '../Badge/Badge.js';
import badgeStyles from '../Badge/Badge.module.css';
import { dataTableTestId } from '../DataTable/dataTableTestId.js';
import type { DataTableSurface } from '../DataTable/dataTableTestId.js';
import { OverflowMenu } from '../OverflowMenu/index.js';
import type { OverflowMenuItem } from '../OverflowMenu/index.js';
import { CostLineStateChip } from './CostLineStateChip.js';
import { NetAmountTip } from './NetAmountTip.js';
import type { CostLineRow, CostLineTarget } from './types.js';
import styles from './CostLineTable.module.css';

export interface RowPartsProps {
  readonly row: CostLineRow;
  readonly surface: DataTableSurface;
  readonly prefix: string;
}

/** The State chip of a row (its testid is unique per surface). */
export function StateCell({ row, surface, prefix }: RowPartsProps) {
  return (
    <CostLineStateChip
      state={row.state}
      basis={row.basis}
      margin={row.margin}
      testId={dataTableTestId(`${prefix}-state`, row.id, surface)}
    />
  );
}

/** The user's description (wraps, carries the entries language) and the muted facts line. */
export function DescriptionCell({ row }: Pick<RowPartsProps, 'row'>) {
  const { t } = useTranslation('costLines');
  const { t: tSettings } = useTranslation('settings');
  const userText = useUserText();

  const facts: string[] = [];
  if (row.categoryName) {
    facts.push(getCategoryDisplayName(tSettings, row.categoryName, row.categoryTranslationKey));
  }
  if (row.budgetSourceName) facts.push(row.budgetSourceName);
  if (row.vendorName) facts.push(row.vendorName);

  return (
    <>
      {row.description ? (
        <span {...userText(styles.description)}>{row.description}</span>
      ) : (
        <span className={styles.muted}>{t('table.noDescription')}</span>
      )}
      {facts.length > 0 && (
        <span className={styles.facts}>{facts.join(t('table.factsSeparator'))}</span>
      )}
    </>
  );
}

/** "12 m² × 45.00" for a unit-priced line whose face value still matches; otherwise an en dash. */
export function QuantityPriceCell({ row }: Pick<RowPartsProps, 'row'>) {
  const { t } = useTranslation('costLines');
  const { formatQuantity, formatCurrency } = useFormatters();
  if (row.quantity === null || row.unitPrice === null || row.estimateDiffers) {
    return <span className={styles.muted}>—</span>;
  }
  const quantity = formatQuantity(row.quantity);
  const unitPrice = formatCurrency(row.unitPrice);
  return (
    <span className={styles.quantityPrice}>
      {row.unit
        ? t('table.quantityTimesPrice', { quantity, unit: row.unit, unitPrice })
        : t('table.quantityTimesPriceNoUnit', { quantity, unitPrice })}
    </span>
  );
}

export interface GrossCellProps extends RowPartsProps {
  readonly mode: 'item' | 'document';
  readonly vatRate: number;
}

/** Gross amount (item mode adds the net tip) and, when it differs, the muted estimate. */
export function GrossCell({ row, surface, prefix, mode, vatRate }: GrossCellProps) {
  const { t } = useTranslation('costLines');
  const { formatCurrency } = useFormatters();
  const name = row.description ?? t('table.noDescription');
  const testId = dataTableTestId(`${prefix}-gross`, row.id, surface);
  return (
    <span className={styles.grossStack}>
      {mode === 'item' ? (
        <NetAmountTip
          gross={row.gross}
          net={row.net}
          vatRate={vatRate}
          name={name}
          testId={testId}
        />
      ) : (
        <span className={styles.gross} data-testid={testId}>
          {formatCurrency(row.gross)}
        </span>
      )}
      {row.estimateDiffers && (
        <span className={styles.facts}>
          {t('table.estimateWas', { amount: formatCurrency(row.plannedGross) })}
        </span>
      )}
    </span>
  );
}

/** Entered as: neutral text badge, never colour alone. */
export function EnteredAsCell({ row }: Pick<RowPartsProps, 'row'>) {
  const { t } = useTranslation('costLines');
  const variants: BadgeVariantMap = {
    net: { label: t('entered.net'), className: badgeStyles.neutral! },
    gross: { label: t('entered.gross'), className: badgeStyles.neutral! },
  };
  return <Badge variants={variants} value={row.includesVat ? 'gross' : 'net'} />;
}

/** The task or purchase a line belongs to (with origin and area), or "Not assigned". */
export function TargetLabel({
  target,
  linkState,
  plain = false,
}: {
  readonly target: CostLineTarget | null;
  readonly linkState?: OriginState;
  /** Plain text instead of a link (where the row is not a place to leave from). */
  readonly plain?: boolean;
}) {
  const { t } = useTranslation('costLines');
  const userText = useUserText();
  if (target === null) {
    const variants: BadgeVariantMap = {
      none: { label: t('table.notAssigned'), className: badgeStyles.neutral! },
    };
    return <Badge variants={variants} value="none" />;
  }
  const to =
    target.type === 'work_item'
      ? routeUrl('workItem', { id: target.id })
      : routeUrl('householdItem', { id: target.id });
  return (
    <span className={styles.target}>
      {plain ? (
        <span {...userText(styles.targetName)}>{target.label}</span>
      ) : (
        <NavAnchor to={to} state={linkState} {...userText(styles.targetLink)}>
          {target.label}
        </NavAnchor>
      )}
      <AreaBreadcrumb area={target.area ?? null} variant="compact" />
    </span>
  );
}

export interface ActionsCellProps extends RowPartsProps {
  readonly items: readonly OverflowMenuItem[];
  readonly onTrigger?: (row: CostLineRow, el: HTMLElement) => void;
}

/** The ⋯ menu of a row; reports its trigger so the host can return focus to it. */
export function ActionsCell({
  row,
  surface,
  prefix,
  items,
  onTrigger,
}: ActionsCellProps): ReactNode {
  const { t } = useTranslation('costLines');
  if (items.length === 0) return null;
  const name = row.description ?? t('table.noDescription');
  return (
    <OverflowMenu
      items={items}
      usePortal
      triggerAriaLabel={t('table.rowActions', { name })}
      data-testid={dataTableTestId(`${prefix}-actions`, row.id, surface)}
      renderTrigger={(props) => (
        <button
          {...props}
          className={styles.menuTrigger}
          onClick={(event) => {
            onTrigger?.(row, event.currentTarget);
            props.onClick();
          }}
        >
          <span aria-hidden="true">⋯</span>
        </button>
      )}
    />
  );
}
