import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import shared from '../../styles/shared.module.css';
import {
  formatDateRange,
  formatNumberRange,
  parseDateRange,
  parseNumberRange,
} from './rangeParams.js';
import type { ObjectListFilterRenderContext } from './types.js';
import styles from './ObjectListRangeFilters.module.css';

export interface DateRangeFilterProps {
  readonly ctx: ObjectListFilterRenderContext;
  /** Inputs get `${testId}-from` and `${testId}-to`. */
  readonly testId: string;
  readonly labels: { readonly from: string; readonly to: string };
}

/** From and To dates; the URL receives `from:…,to:…` on every change. */
export function DateRangeFilter({ ctx, testId, labels }: DateRangeFilterProps) {
  const range = parseDateRange(ctx.value);
  const from = range?.from ?? '';
  const to = range?.to ?? '';
  // Local drafts, synced from the URL when it changes (the DiaryFilters pattern).
  const [fromDraft, setFromDraft] = useState(from);
  const [prevFrom, setPrevFrom] = useState(from);
  if (from !== prevFrom) {
    setPrevFrom(from);
    setFromDraft(from);
  }
  const [toDraft, setToDraft] = useState(to);
  const [prevTo, setPrevTo] = useState(to);
  if (to !== prevTo) {
    setPrevTo(to);
    setToDraft(to);
  }
  return (
    <div className={styles.range}>
      <div className={styles.rangeField}>
        <label htmlFor={`${ctx.id}-from`} className={styles.rangeLabel}>
          {labels.from}
        </label>
        <input
          id={`${ctx.id}-from`}
          type="date"
          className={shared.input}
          value={fromDraft}
          onChange={(e) => {
            setFromDraft(e.target.value);
            ctx.onChange(formatDateRange(e.target.value || null, toDraft || null));
          }}
          data-testid={`${testId}-from`}
        />
      </div>
      <div className={styles.rangeField}>
        <label htmlFor={`${ctx.id}-to`} className={styles.rangeLabel}>
          {labels.to}
        </label>
        <input
          id={`${ctx.id}-to`}
          type="date"
          className={shared.input}
          value={toDraft}
          onChange={(e) => {
            setToDraft(e.target.value);
            ctx.onChange(formatDateRange(fromDraft || null, e.target.value || null));
          }}
          data-testid={`${testId}-to`}
        />
      </div>
    </div>
  );
}

function draftNumber(draft: string): number | null {
  if (draft.trim() === '') return null;
  const number = Number(draft);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export interface NumberRangeFilterProps {
  readonly ctx: ObjectListFilterRenderContext;
  /** Inputs get `${testId}-min` and `${testId}-max`. */
  readonly testId: string;
  readonly labels: { readonly min: string; readonly max: string };
  /** '0.01' for money, '1' for counts. */
  readonly step: '0.01' | '1';
}

/** Minimum and Maximum; committed on blur and Enter. */
export function NumberRangeFilter({ ctx, testId, labels, step }: NumberRangeFilterProps) {
  const range = parseNumberRange(ctx.value);
  const min = range?.min == null ? '' : String(range.min);
  const max = range?.max == null ? '' : String(range.max);
  const [minDraft, setMinDraft] = useState(min);
  const [prevMin, setPrevMin] = useState(min);
  if (min !== prevMin) {
    setPrevMin(min);
    setMinDraft(min);
  }
  const [maxDraft, setMaxDraft] = useState(max);
  const [prevMax, setPrevMax] = useState(max);
  if (max !== prevMax) {
    setPrevMax(max);
    setMaxDraft(max);
  }

  const commit = () => {
    const next = formatNumberRange(draftNumber(minDraft), draftNumber(maxDraft));
    if (next !== (ctx.value || null)) ctx.onChange(next);
  };
  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
  };

  return (
    <div className={styles.range}>
      <div className={styles.rangeField}>
        <label htmlFor={`${ctx.id}-min`} className={styles.rangeLabel}>
          {labels.min}
        </label>
        <input
          id={`${ctx.id}-min`}
          type="number"
          min="0"
          step={step}
          className={shared.input}
          value={minDraft}
          onChange={(e) => setMinDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onEnter}
          onWheel={(e) => e.currentTarget.blur()}
          data-testid={`${testId}-min`}
        />
      </div>
      <div className={styles.rangeField}>
        <label htmlFor={`${ctx.id}-max`} className={styles.rangeLabel}>
          {labels.max}
        </label>
        <input
          id={`${ctx.id}-max`}
          type="number"
          min="0"
          step={step}
          className={shared.input}
          value={maxDraft}
          onChange={(e) => setMaxDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onEnter}
          onWheel={(e) => e.currentTarget.blur()}
          data-testid={`${testId}-max`}
        />
      </div>
    </div>
  );
}
