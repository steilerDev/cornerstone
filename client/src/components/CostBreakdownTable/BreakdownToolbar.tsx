import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { BudgetBreakdown } from '@cornerstone/shared';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { useUserText } from '../../hooks/useUserText.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { FilterChipGroup } from '../FilterChipGroup/FilterChipGroup.js';
import { ObjectListFiltersPanel } from '../ObjectList/ObjectListFiltersPanel.js';
import shared from '../../styles/shared.module.css';
import {
  BREAKDOWN_ESTIMATES,
  BREAKDOWN_PAYMENTS,
  BREAKDOWN_VIEWS,
  UNASSIGNED_SOURCE_KEY,
  breakdownSourceKeys,
} from './breakdownSettings.js';
import type {
  BreakdownEstimate,
  BreakdownPayment,
  BreakdownSettings,
  BreakdownView,
} from './breakdownSettings.js';
import styles from './CostBreakdownTable.module.css';

export interface BreakdownToolbarProps {
  readonly breakdown: BudgetBreakdown;
  readonly settings: BreakdownSettings;
  readonly onViewChange: (v: BreakdownView) => void;
  readonly onPaymentChange: (p: BreakdownPayment) => void;
  readonly onEstimateChange: (e: BreakdownEstimate) => void;
  readonly onGrantsChange: (on: boolean) => void;
  readonly onSourceToggle: (key: string) => void;
  readonly onSelectAllSources: () => void;
}

function isOneOf<T extends string>(members: readonly T[], value: string): value is T {
  return (members as readonly string[]).includes(value);
}

/** View, Payment, Show estimates at, Show Grants and the Funding source filter. */
export function BreakdownToolbar({
  breakdown,
  settings,
  onViewChange,
  onPaymentChange,
  onEstimateChange,
  onGrantsChange,
  onSourceToggle,
  onSelectAllSources,
}: BreakdownToolbarProps) {
  const { t } = useTranslation('budget');
  const userText = useUserText();
  const isWide = useMediaQuery('(min-width: 768px)');
  const layout = isWide ? 'wrap' : 'scroll';
  const estimateLabelId = useId();
  const showLabelId = useId();
  const keepOneId = useId();
  const sourceButtonRef = useRef<HTMLButtonElement>(null);

  const sourceKeys = breakdownSourceKeys(breakdown, settings.deselected);
  const total = sourceKeys.length;
  const selected = sourceKeys.filter((key) => !settings.deselected.has(key)).length;
  const keepOne = selected === 1;

  const sourceName = (key: string): { text: string; userText: boolean } => {
    if (key === UNASSIGNED_SOURCE_KEY)
      return { text: t('overview.breakdown.unassigned'), userText: false };
    // Every other key comes from `sourceOptions` (see breakdownSourceKeys).
    const option = breakdown.sourceOptions.find((o) => o.id === key)!;
    return { text: option.name, userText: true };
  };

  return (
    <div className={styles.toolbar} data-testid="breakdown-toolbar">
      <div className={styles.toolbarGroup}>
        <FilterChipGroup
          options={BREAKDOWN_VIEWS.map((v) => ({
            value: v,
            label: t(I18N_UNION_KEYS.breakdownView.key(v)),
          }))}
          value={settings.view}
          onChange={(v) => {
            if (isOneOf(BREAKDOWN_VIEWS, v)) onViewChange(v);
          }}
          ariaLabel={t('overview.breakdown.viewLabel')}
          testIdPrefix="breakdown-view"
          layout={layout}
        />
      </div>
      <div className={styles.toolbarGroup}>
        <FilterChipGroup
          options={BREAKDOWN_PAYMENTS.map((p) => ({
            value: p,
            label: t(I18N_UNION_KEYS.breakdownPayment.key(p)),
          }))}
          value={settings.payment}
          onChange={(p) => {
            if (isOneOf(BREAKDOWN_PAYMENTS, p)) onPaymentChange(p);
          }}
          ariaLabel={t('overview.breakdown.paymentLabel')}
          testIdPrefix="breakdown-payment"
          layout={layout}
        />
      </div>
      <div className={styles.toolbarGroup}>
        <span id={estimateLabelId} className={styles.toolbarLabel}>
          {t('overview.breakdown.estimateLabel')}
        </span>
        <FilterChipGroup
          options={BREAKDOWN_ESTIMATES.map((e) => ({
            value: e,
            label: t(I18N_UNION_KEYS.breakdownEstimate.key(e)),
          }))}
          value={settings.estimate}
          onChange={(e) => {
            if (isOneOf(BREAKDOWN_ESTIMATES, e)) onEstimateChange(e);
          }}
          labelledBy={estimateLabelId}
          testIdPrefix="breakdown-estimate"
          layout={layout}
        />
      </div>
      <div className={`${styles.toolbarGroup} ${styles.toolbarLast}`}>
        {settings.payment === 'all' ? (
          <div className={styles.toolbarGroup}>
            <span id={showLabelId} className={styles.toolbarLabel}>
              {t('overview.breakdown.showLabel')}
            </span>
            <FilterChipGroup
              options={[{ value: 'grants', label: t('overview.breakdown.colGrants') }]}
              value=""
              selectedValues={settings.grants ? ['grants'] : []}
              onChange={() => onGrantsChange(!settings.grants)}
              labelledBy={showLabelId}
              testIdPrefix="breakdown-show"
              layout="wrap"
            />
          </div>
        ) : null}
        <ObjectListFiltersPanel
          idPrefix="breakdown-sources"
          testIdPrefix="breakdown-sources"
          activeCount={0}
          labels={{
            button: t('overview.breakdown.sourceButton'),
            title: t('overview.breakdown.sourceTitle'),
            buttonActive: () => '',
            done: t('overview.breakdown.done'),
            clear: t('overview.breakdown.selectAll'),
          }}
          buttonSuffix={
            <span className={styles.sourceCount}>
              {t('overview.breakdown.sourceCount', { selected, total })}
            </span>
          }
          buttonClassName={
            selected < total ? `${styles.sourceChip} ${styles.sourceChipActive}` : styles.sourceChip
          }
          panelFooter
          onClear={onSelectAllSources}
          buttonRef={sourceButtonRef}
        >
          <ul className={styles.sourceList}>
            {sourceKeys.map((key) => {
              const checked = !settings.deselected.has(key);
              const name = sourceName(key);
              const locked = checked && keepOne;
              return (
                <li key={key}>
                  <label className={styles.checkRow}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={checked}
                      aria-disabled={locked ? 'true' : undefined}
                      aria-describedby={locked ? keepOneId : undefined}
                      onChange={(event) => {
                        if (locked) {
                          event.preventDefault();
                          return;
                        }
                        onSourceToggle(key);
                      }}
                      data-testid={`breakdown-source-${key}`}
                    />
                    <span {...(name.userText ? userText() : {})}>{name.text}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p id={keepOneId} className={shared.srOnly}>
            {t('overview.breakdown.keepOne')}
          </p>
        </ObjectListFiltersPanel>
      </div>
    </div>
  );
}
