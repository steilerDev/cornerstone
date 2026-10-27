import { useEffect, useState } from 'react';
import type { PaperlessStatusResponse } from '@cornerstone/shared';
import { fetchConfig } from '../lib/configApi.js';
import { getSharedPaperlessStatus } from '../lib/paperlessStatusCache.js';

export interface DocumentIntegration {
  /** The status and config lookups have settled (a failure settles as "off"). */
  readonly loaded: boolean;
  readonly status: PaperlessStatusResponse | null;
  /** Paperless is configured and reachable. */
  readonly available: boolean;
  /** The AI reader is enabled. */
  readonly llmEnabled: boolean;
}

const NOT_LOADED: DocumentIntegration = {
  loaded: false,
  status: null,
  available: false,
  llmEnabled: false,
};
const OFF: DocumentIntegration = { ...NOT_LOADED, loaded: true };

/**
 * Whether Paperless (and the AI reader) is available. With `enabled: false` nothing is fetched
 * and the result stays "not loaded".
 */
export function useDocumentIntegration({
  enabled = true,
}: { readonly enabled?: boolean } = {}): DocumentIntegration {
  const [integration, setIntegration] = useState<DocumentIntegration>(NOT_LOADED);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    Promise.all([getSharedPaperlessStatus(), fetchConfig()])
      .then(([status, appConfig]) => {
        if (cancelled) return;
        setIntegration({
          loaded: true,
          status,
          available: status.configured && status.reachable,
          llmEnabled: appConfig.llmEnabled,
        });
      })
      .catch(() => {
        if (!cancelled) setIntegration(OFF);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return integration;
}
