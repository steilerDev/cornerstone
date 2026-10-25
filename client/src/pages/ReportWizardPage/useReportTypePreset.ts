import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SOURCE_REPORT_TYPES } from '@cornerstone/shared';
import type { SourceReportType } from '@cornerstone/shared';

function isSourceReportType(value: string | null): value is SourceReportType {
  return SOURCE_REPORT_TYPES.some((type) => type === value);
}

/**
 * Applies the `?type=` preset (e.g. the Money page's "Budget overview for the bank") once, as soon
 * as the wizard is ready and no use case is chosen yet. An unknown value does nothing; the param
 * stays in the URL, like `sourceId`.
 */
export function useReportTypePreset(
  ready: boolean,
  useCase: SourceReportType | null,
  apply: (type: SourceReportType) => void,
): void {
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type');
  const appliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || useCase !== null || !isSourceReportType(type) || appliedRef.current === type) {
      return;
    }
    appliedRef.current = type;
    apply(type);
  }, [ready, useCase, type, apply]);
}
