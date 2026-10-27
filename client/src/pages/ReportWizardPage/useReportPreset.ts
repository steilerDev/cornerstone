import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { BudgetSource } from '@cornerstone/shared';
import { resolveReportPreset, type ReportPreset } from './reportPreset.js';

/**
 * Applies the `?type=` / `?sourceId=` preset (#2243 D1) once per distinct pair, as soon as the
 * funding sources are loaded and no report type is chosen yet. Without a valid `type` nothing
 * happens: the normal step 1 flow runs, and a `sourceId` is applied once a type is picked.
 */
export function useReportPreset(
  ready: boolean,
  sources: readonly BudgetSource[],
  apply: (preset: ReportPreset) => void,
  useCase: string | null,
): void {
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type');
  const sourceId = searchParams.get('sourceId');
  const appliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || useCase !== null) return;
    const key = `${type}|${sourceId}`;
    if (appliedRef.current === key) return;
    const preset = resolveReportPreset(type, sourceId, sources);
    if (preset === null) return;
    appliedRef.current = key;
    apply(preset);
  }, [ready, useCase, type, sourceId, sources, apply]);
}
