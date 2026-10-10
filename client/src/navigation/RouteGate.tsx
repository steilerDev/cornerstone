import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { conditionHolds, resolveRedirect } from '@cornerstone/shared';
import type { RouteGateContext, RouteMapEntry } from '@cornerstone/shared';
import { fetchConfig } from '../lib/configApi.js';
import { getPaperlessStatus } from '../lib/paperlessApi.js';

export interface RouteGateProps {
  /** Live conditional rules of the gated page (from `liveConditionalRules(pageId)`), in order. */
  readonly rules: readonly RouteMapEntry[];
}

const NEEDS_PAPERLESS = new Set(['paperless-off', 'paperless-or-ai-off']);
const NEEDS_CONFIG = new Set(['ai-off', 'paperless-or-ai-off']);

/**
 * Layout route for conditional redirects (e.g. Paperless off). Renders nothing while the
 * conditions load and fails open (renders the page) when a lookup fails.
 */
export function RouteGate({ rules }: RouteGateProps) {
  const params = useParams();
  const { search, hash } = useLocation();
  const [ctx, setCtx] = useState<RouteGateContext | 'open' | null>(null);

  useEffect(() => {
    let cancelled = false;
    const needsPaperless = rules.some((r) => NEEDS_PAPERLESS.has(r.match?.condition ?? ''));
    const needsConfig = rules.some((r) => NEEDS_CONFIG.has(r.match?.condition ?? ''));
    Promise.all([
      needsPaperless ? getPaperlessStatus() : Promise.resolve(null),
      needsConfig ? fetchConfig() : Promise.resolve(null),
    ])
      .then(([status, config]) => {
        if (cancelled) return;
        setCtx({
          paperlessConfigured: status ? status.configured : true,
          llmEnabled: config ? config.llmEnabled : true,
        });
      })
      .catch(() => {
        if (!cancelled) setCtx('open');
      });
    return () => {
      cancelled = true;
    };
  }, [rules]);

  if (ctx === null) return null;
  if (ctx !== 'open') {
    const hit = rules.find(
      (rule) => rule.match?.condition !== undefined && conditionHolds(rule.match.condition, ctx),
    );
    if (hit) return <Navigate replace to={resolveRedirect(hit.to, params, search, hash)} />;
  }
  return <Outlet />;
}

export default RouteGate;
