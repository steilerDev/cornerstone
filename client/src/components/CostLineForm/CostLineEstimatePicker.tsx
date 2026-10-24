import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../contexts/LocaleContext.js';
import { useUserText } from '../../hooks/useUserText.js';
import { useFormatters } from '../../lib/formatters.js';
import { fetchHouseholdItemBudgets } from '../../lib/householdItemBudgetsApi.js';
import { fetchWorkItemBudgets } from '../../lib/workItemBudgetsApi.js';
import sharedStyles from '../../styles/shared.module.css';
import { Modal } from '../Modal/Modal.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import { toExistingRefs } from './CostLineExistingField.js';
import type { CostLineTarget } from '../CostLineTable/types.js';
import type { CostLineExistingRef } from './types.js';
import styles from './CostLineGrid.module.css';

export interface CostLineEstimatePickerProps {
  /** The task or purchase of the row; without one the picker asks to pick it first. */
  readonly target: CostLineTarget | null;
  /** Lines other rows already use. */
  readonly takenIds: ReadonlySet<string>;
  readonly onPick: (line: CostLineExistingRef) => void;
  readonly onClose: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

interface Loaded {
  readonly key: string;
  readonly failed: boolean;
  readonly lines: readonly CostLineExistingRef[];
}

/** "Use an existing cost line…": picks one of the row's target's lines that has no offer or invoice yet. */
export function CostLineEstimatePicker({
  target,
  takenIds,
  onPick,
  onClose,
  returnFocusRef,
}: CostLineEstimatePickerProps) {
  const { t } = useTranslation('costLines');
  const { t: tc } = useTranslation('common');
  const { vatRate } = useLocale();
  const { formatCurrency } = useFormatters();
  const userText = useUserText();
  const key = target ? `${target.type}:${target.id}` : '';
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    async function load(from: CostLineTarget) {
      try {
        const lines =
          from.type === 'work_item'
            ? await fetchWorkItemBudgets(from.id)
            : await fetchHouseholdItemBudgets(from.id);
        if (!cancelled) {
          setLoaded({ key, failed: false, lines: toExistingRefs(lines, from.type, vatRate) });
        }
      } catch {
        if (!cancelled) setLoaded({ key, failed: true, lines: [] });
      }
    }
    void load(target);
    return () => {
      cancelled = true;
    };
  }, [key, target, vatRate]);

  const ready = target !== null && loaded !== null && loaded.key === key;
  const lines = ready ? loaded.lines.filter((line) => !takenIds.has(line.id)) : [];

  let body;
  if (target === null) {
    body = <p className={styles.pickerMessage}>{t('existing.pickTargetFirst')}</p>;
  } else if (!ready) {
    body = <Skeleton lines={3} />;
  } else if (loaded.failed) {
    body = <p className={styles.pickerMessage}>{t('section.loadError')}</p>;
  } else if (lines.length === 0) {
    body = <p className={styles.pickerMessage}>{t('existing.empty', { target: target.label })}</p>;
  } else {
    body = (
      <ul className={styles.pickerList}>
        {lines.map((line) => (
          <li key={line.id} className={styles.pickerItem}>
            <span {...userText(styles.pickerText)}>
              {line.description ?? t('table.noDescription')}
            </span>
            <span className={styles.pickerAmount}>{formatCurrency(line.gross)}</span>
            <button
              type="button"
              className={sharedStyles.btnSecondaryCompact}
              onClick={() => onPick(line)}
              data-testid={`cost-line-existing-use-${line.id}`}
            >
              {t('existing.use')}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Modal
      title={t('existing.title')}
      onClose={onClose}
      returnFocusRef={returnFocusRef}
      footer={
        <button type="button" className={sharedStyles.btnSecondary} onClick={onClose}>
          {tc('button.cancel')}
        </button>
      }
    >
      {body}
    </Modal>
  );
}
