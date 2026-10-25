import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BreakdownLine, BudgetBreakdown } from '@cornerstone/shared';
import { usePrintExpansion } from '../../hooks/usePrintExpansion.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { FormError } from '../FormError/FormError.js';
import shared from '../../styles/shared.module.css';
import { BreakdownDrillList } from './BreakdownDrillList.js';
import { BreakdownTableView } from './BreakdownTableView.js';
import { BreakdownToolbar } from './BreakdownToolbar.js';
import { breakdownSourceKeys, isBreakdownFiltered } from './breakdownSettings.js';
import type {
  BreakdownEstimate,
  BreakdownPayment,
  BreakdownSettings,
  BreakdownView,
} from './breakdownSettings.js';
import { breakdownColumns, buildBreakdownTree, visibleTree } from './breakdownTree.js';
import type { BreakdownNode } from './breakdownTree.js';
import styles from './CostBreakdownTable.module.css';

export interface CostBreakdownTableProps {
  /** null while the first breakdown fetch failed: the card then shows `loadError` alone (a failed refresh keeps the old breakdown and is reported by the page). */
  readonly breakdown: BudgetBreakdown | null;
  readonly settings: BreakdownSettings;
  readonly onViewChange: (v: BreakdownView) => void;
  readonly onPaymentChange: (p: BreakdownPayment) => void;
  readonly onEstimateChange: (e: BreakdownEstimate) => void;
  readonly onGrantsChange: (on: boolean) => void;
  readonly onSourceToggle: (key: string) => void;
  readonly onSelectAllSources: () => void;
  readonly onResetSettings: () => void;
  readonly refetching: boolean;
  /** Announced in the card's status region when `id` changes (after a refetch). */
  readonly announcement: { readonly id: number; readonly text: string } | null;
  readonly loadError?: { readonly message: string; readonly onRetry: () => void } | null;
}

function collectExpandable(view: BreakdownView, nodes: readonly BreakdownNode[]): Set<string> {
  const keys = new Set<string>();
  const walk = (list: readonly BreakdownNode[]) => {
    for (const node of list) {
      if (node.children.length > 0) {
        keys.add(`${view}:${node.key}`);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return keys;
}

/**
 * Money › Overview breakdown: one card with the view, payment, estimate, grants and funding-source
 * settings, and the tree down to cost lines as a table (from 768px of the card's own width) or a
 * two-column drill-down list. Payment, estimate, grants and view are client-side selections of the
 * one response; only the funding sources are filtered by the server.
 */
export function CostBreakdownTable(props: CostBreakdownTableProps) {
  const { breakdown, loadError } = props;
  if (breakdown === null) return <BreakdownLoadFailed loadError={loadError} />;
  return <LoadedBreakdown {...props} breakdown={breakdown} />;
}

function BreakdownLoadFailed({ loadError }: Pick<CostBreakdownTableProps, 'loadError'>) {
  const { t } = useTranslation('budget');
  const headingId = useId();
  return (
    <section className={styles.card} aria-labelledby={headingId} data-testid="breakdown-card">
      <h2 id={headingId} className={styles.heading}>
        {t('overview.breakdown.heading')}
      </h2>
      {loadError ? <LoadError loadError={loadError} /> : null}
    </section>
  );
}

function LoadError({
  loadError,
}: {
  readonly loadError: NonNullable<CostBreakdownTableProps['loadError']>;
}) {
  const { t } = useTranslation('budget');
  return (
    <div className={styles.loadError}>
      <FormError message={loadError.message} />
      <button type="button" className={styles.retry} onClick={loadError.onRetry}>
        {t('overview.retry')}
      </button>
    </div>
  );
}

function LoadedBreakdown({
  breakdown,
  settings,
  onViewChange,
  onPaymentChange,
  onEstimateChange,
  onGrantsChange,
  onSourceToggle,
  onSelectAllSources,
  onResetSettings,
  refetching,
  announcement,
}: Omit<CostBreakdownTableProps, 'loadError'> & { readonly breakdown: BudgetBreakdown }) {
  const { t } = useTranslation('budget');
  const { t: tSettings } = useTranslation('settings');
  const { t: tLines } = useTranslation('costLines');
  const headingId = useId();
  const { view, payment, estimate } = settings;

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [statusText, setStatusText] = useState('');
  const [seenAnnouncement, setSeenAnnouncement] = useState(announcement?.id ?? null);
  if ((announcement?.id ?? null) !== seenAnnouncement) {
    setSeenAnnouncement(announcement?.id ?? null);
    setStatusText(announcement?.text ?? '');
  }

  const sourceKeys = breakdownSourceKeys(breakdown, settings.deselected);
  const selectedCount = sourceKeys.filter((key) => !settings.deselected.has(key)).length;

  const tree = useMemo(
    () =>
      buildBreakdownTree(breakdown, view, {
        noArea: t('overview.breakdown.noArea'),
        noCategory: t('overview.breakdown.noCategory'),
        unassigned: t('overview.breakdown.unassigned'),
        tasks: t('overview.breakdown.tasks'),
        purchases: t('overview.breakdown.purchases'),
        withoutTask: t('overview.breakdown.withoutTask'),
        notYetSplit: t('overview.breakdown.notYetSplit'),
        untitledLine: tLines('table.noDescription'),
        categoryName: (name, key) => getCategoryDisplayName(tSettings, name, key),
      }),
    [breakdown, view, t, tLines, tSettings],
  );
  const visible = useMemo(() => visibleTree(tree, payment, estimate), [tree, payment, estimate]);
  const allKeys = useMemo(() => collectExpandable(view, visible), [view, visible]);
  usePrintExpansion(expanded, setExpanded, allKeys);

  const columns = breakdownColumns(settings, {
    expectedCost: t('overview.breakdown.colExpectedCost'),
    grants: t('overview.breakdown.colGrants'),
    afterGrants: t('overview.breakdown.colAfterGrants'),
    paid: t('overview.breakdown.colPaid'),
    stillToPay: t('overview.breakdown.colStillToPay'),
    notYetPaid: t('overview.breakdown.colNotYetPaid'),
  });

  const lineSourceName = (line: BreakdownLine) => {
    if (view === 'source') return null;
    if (line.budgetSourceId === null) {
      return { text: t('overview.breakdown.unassigned'), userText: false };
    }
    const option = breakdown.sourceOptions.find((o) => o.id === line.budgetSourceId);
    return option ? { text: option.name, userText: true } : null;
  };

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  let surfaces;
  if (selectedCount === 0 && sourceKeys.length > 0) {
    surfaces = (
      <EmptyState
        message={t('overview.breakdown.empty')}
        action={{ label: t('overview.breakdown.selectAll'), onClick: onSelectAllSources }}
      />
    );
  } else if (breakdown.lines.length === 0 && breakdown.notYetSplit === null) {
    surfaces = <EmptyState message={t('overview.breakdown.emptyNoLines')} />;
  } else if (visible.length === 0) {
    surfaces = (
      <EmptyState
        message={t('overview.breakdown.empty')}
        action={{ label: t('overview.breakdown.resetSettings'), onClick: onResetSettings }}
      />
    );
  } else {
    surfaces = (
      <div className={styles.surfaces}>
        <div className={styles.tableSurface}>
          <BreakdownTableView
            nodes={visible}
            columns={columns}
            estimate={estimate}
            view={view}
            total={breakdown.total}
            totalLabel={
              isBreakdownFiltered(settings)
                ? t('overview.breakdown.totalAdjusted')
                : t('overview.breakdown.total')
            }
            expanded={expanded}
            onToggle={toggle}
            lineSourceName={lineSourceName}
          />
        </div>
        <div className={styles.listSurface}>
          <BreakdownDrillList
            key={view}
            nodes={visible}
            columns={columns}
            estimate={estimate}
            onAnnounce={setStatusText}
          />
        </div>
      </div>
    );
  }

  return (
    <section
      className={styles.card}
      aria-labelledby={headingId}
      aria-busy={refetching}
      data-testid="breakdown-card"
    >
      <h2 id={headingId} className={styles.heading}>
        {t('overview.breakdown.heading')}
      </h2>
      <BreakdownToolbar
        breakdown={breakdown}
        settings={settings}
        onViewChange={onViewChange}
        onPaymentChange={onPaymentChange}
        onEstimateChange={onEstimateChange}
        onGrantsChange={onGrantsChange}
        onSourceToggle={onSourceToggle}
        onSelectAllSources={onSelectAllSources}
      />
      <div role="status" className={shared.srOnly} data-testid="breakdown-status">
        {statusText}
      </div>
      {surfaces}
    </section>
  );
}
