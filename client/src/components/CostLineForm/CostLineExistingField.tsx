/**
 * "Use an existing cost line": when a cost line is created on an offer or invoice, the user may pick
 * one of the target's lines that has no offer or invoice yet and link it instead of adding a new one.
 *
 * A form field can only set its own value, so the pick lives here as `{ id, type, description, gross }`
 * and the sibling `amount` field reads it through the render context's `values`: an empty `amount`
 * with an existing line means "the line's own gross, capped at the remaining amount" (the server
 * rejects a larger one with ITEMIZED_SUM_EXCEEDS_INVOICE).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BaseBudgetLine } from '@cornerstone/shared';
import { useLocale } from '../../contexts/LocaleContext.js';
import { useFormatters } from '../../lib/formatters.js';
import { fetchHouseholdItemBudgets } from '../../lib/householdItemBudgetsApi.js';
import { fetchWorkItemBudgets } from '../../lib/workItemBudgetsApi.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import { costLineGross } from '../CostLineTable/index.js';
import type { CostLineTarget } from '../CostLineTable/types.js';
import type { CostLineExistingRef } from './types.js';
import styles from './CostLineForm.module.css';

export interface CostLineExistingFieldProps {
  readonly id: string;
  readonly target: CostLineTarget;
  readonly value: CostLineExistingRef | null;
  readonly onChange: (value: CostLineExistingRef | null) => void;
  readonly busy: boolean;
  readonly invalid: boolean;
  readonly describedBy: string | undefined;
}

interface Loaded {
  readonly key: string;
  readonly failed: boolean;
  readonly lines: readonly CostLineExistingRef[];
}

/** Unlinked lines of a task or purchase, as picks. */
export function toExistingRefs(
  lines: readonly BaseBudgetLine[],
  type: CostLineTarget['type'],
  vatRate: number,
): CostLineExistingRef[] {
  return lines
    .filter((line) => line.invoiceLink === null)
    .map((line) => ({
      id: line.id,
      type,
      description: line.description,
      gross: costLineGross(line, vatRate),
    }));
}

export function CostLineExistingField({
  id,
  target,
  value,
  onChange,
  busy,
  invalid,
  describedBy,
}: CostLineExistingFieldProps) {
  const { t } = useTranslation('costLines');
  const { vatRate } = useLocale();
  const { formatCurrency } = useFormatters();
  const key = `${target.type}:${target.id}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const lines =
          target.type === 'work_item'
            ? await fetchWorkItemBudgets(target.id)
            : await fetchHouseholdItemBudgets(target.id);
        if (!cancelled) {
          setLoaded({ key, failed: false, lines: toExistingRefs(lines, target.type, vatRate) });
        }
      } catch {
        if (!cancelled) setLoaded({ key, failed: true, lines: [] });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [key, target.id, target.type, vatRate]);

  const ready = loaded !== null && loaded.key === key;
  const lines = ready ? loaded.lines : [];

  // A pick made for another target no longer applies.
  const stale = ready && value !== null && !lines.some((line) => line.id === value.id);
  useEffect(() => {
    if (stale) onChange(null);
  }, [stale, onChange]);

  if (!ready) return <Skeleton lines={1} />;
  if (loaded.failed) return <p className={styles.hint}>{t('section.loadError')}</p>;

  return (
    <select
      id={id}
      className={styles.select}
      value={value?.id ?? ''}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      aria-disabled={busy || undefined}
      onChange={(event) => {
        if (busy) return;
        onChange(lines.find((line) => line.id === event.target.value) ?? null);
      }}
      data-testid="cost-line-existing"
    >
      <option value="">{t('form.existingNew')}</option>
      {lines.map((line) => (
        <option key={line.id} value={line.id}>
          {t('form.existingOption', {
            description: line.description ?? t('table.noDescription'),
            amount: formatCurrency(line.gross),
          })}
        </option>
      ))}
    </select>
  );
}
