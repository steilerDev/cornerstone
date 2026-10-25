import { useCallback, useLayoutEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BREAKDOWN_ESTIMATES,
  BREAKDOWN_PAYMENTS,
  BREAKDOWN_VIEWS,
} from '../../components/CostBreakdownTable/breakdownSettings.js';
import type {
  BreakdownEstimate,
  BreakdownPayment,
  BreakdownSettings,
  BreakdownView,
} from '../../components/CostBreakdownTable/breakdownSettings.js';

export interface BreakdownSettingsApi {
  settings: BreakdownSettings;
  /** `?by` (area = absent) */
  setView(v: BreakdownView): void;
  /** `?paymentStatus` (all = absent) */
  setPayment(p: BreakdownPayment): void;
  /** `?estimate` (expected = absent) */
  setEstimate(e: BreakdownEstimate): void;
  /** `?grants=1` (off = absent) */
  setGrants(on: boolean): void;
  /** `?deselectedSources` (comma list; `unassigned` is the literal key of null-source lines) */
  toggleSource(key: string): void;
  selectAllSources(): void;
  /** Payment all, estimate expected, every source; the view and Grants are kept. */
  reset(): void;
}

const DEFAULT_VIEW: BreakdownView = 'area';
const DEFAULT_PAYMENT: BreakdownPayment = 'all';
const DEFAULT_ESTIMATE: BreakdownEstimate = 'expected';

function oneOf<T extends string>(members: readonly T[], raw: string | null, fallback: T): T {
  return members.find((member) => member === raw) ?? fallback;
}

/** True when `raw` is present but is not a non-default member (unknown or the default itself). */
function isDroppable(members: readonly string[], raw: string | null, fallback: string): boolean {
  return raw !== null && (raw === fallback || !members.includes(raw));
}

/**
 * Breakdown settings from the URL. Every write is a history `replace` that keeps the other
 * params; an absent param is the default, and unknown values are dropped.
 */
export function useBreakdownSettings(): BreakdownSettingsApi {
  const [searchParams, setSearchParams] = useSearchParams();

  const byRaw = searchParams.get('by');
  const paymentRaw = searchParams.get('paymentStatus');
  const estimateRaw = searchParams.get('estimate');
  const grantsRaw = searchParams.get('grants');
  const deselectedRaw = searchParams.get('deselectedSources');

  const deselected = useMemo<ReadonlySet<string>>(
    () => new Set(deselectedRaw ? deselectedRaw.split(',').filter(Boolean) : []),
    [deselectedRaw],
  );

  const settings = useMemo<BreakdownSettings>(
    () => ({
      view: oneOf(BREAKDOWN_VIEWS, byRaw, DEFAULT_VIEW),
      payment: oneOf(BREAKDOWN_PAYMENTS, paymentRaw, DEFAULT_PAYMENT),
      estimate: oneOf(BREAKDOWN_ESTIMATES, estimateRaw, DEFAULT_ESTIMATE),
      grants: grantsRaw === '1',
      deselected,
    }),
    [byRaw, paymentRaw, estimateRaw, grantsRaw, deselected],
  );

  // Unknown values (and the explicit defaults) leave the URL.
  useLayoutEffect(() => {
    const dropBy = isDroppable(BREAKDOWN_VIEWS, byRaw, DEFAULT_VIEW);
    const dropPayment = isDroppable(BREAKDOWN_PAYMENTS, paymentRaw, DEFAULT_PAYMENT);
    const dropEstimate = isDroppable(BREAKDOWN_ESTIMATES, estimateRaw, DEFAULT_ESTIMATE);
    const dropGrants = grantsRaw !== null && grantsRaw !== '1';
    if (!dropBy && !dropPayment && !dropEstimate && !dropGrants) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (dropBy) next.delete('by');
        if (dropPayment) next.delete('paymentStatus');
        if (dropEstimate) next.delete('estimate');
        if (dropGrants) next.delete('grants');
        return next;
      },
      { replace: true },
    );
  }, [byRaw, paymentRaw, estimateRaw, grantsRaw, setSearchParams]);

  const write = useCallback(
    (change: (params: URLSearchParams) => void) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          change(next);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setOrDelete = (params: URLSearchParams, key: string, value: string, fallback: string) => {
    if (value === fallback) params.delete(key);
    else params.set(key, value);
  };

  return {
    settings,
    setView: (v) => write((p) => setOrDelete(p, 'by', v, DEFAULT_VIEW)),
    setPayment: (v) => write((p) => setOrDelete(p, 'paymentStatus', v, DEFAULT_PAYMENT)),
    setEstimate: (v) => write((p) => setOrDelete(p, 'estimate', v, DEFAULT_ESTIMATE)),
    setGrants: (on) =>
      write((p) => {
        if (on) p.set('grants', '1');
        else p.delete('grants');
      }),
    toggleSource: (key) =>
      write((p) => {
        const current = new Set(p.get('deselectedSources')?.split(',').filter(Boolean) ?? []);
        if (current.has(key)) current.delete(key);
        else current.add(key);
        if (current.size === 0) p.delete('deselectedSources');
        else p.set('deselectedSources', [...current].join(','));
      }),
    selectAllSources: () => write((p) => p.delete('deselectedSources')),
    reset: () =>
      write((p) => {
        p.delete('paymentStatus');
        p.delete('estimate');
        p.delete('deselectedSources');
      }),
  };
}
