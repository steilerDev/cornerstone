import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import { getPaperlessStatus } from '../lib/paperlessApi.js';
import { NAV_SECTIONS, paperlessStatusNeeded } from './navConfig.js';
import type { NavContext, NavSection } from './navConfig.js';

/** Role and Paperless state for navSections(); asks the server only when a served route is Paperless-gated. */
export function useNavContext(sections: readonly NavSection[] = NAV_SECTIONS): NavContext {
  const { user } = useAuth();
  const role = user?.role === 'admin' ? 'admin' : 'member';
  const needed = useMemo(() => paperlessStatusNeeded(sections), [sections]);
  const [paperlessConfigured, setPaperlessConfigured] = useState(false);

  useEffect(() => {
    if (!needed) return;
    let cancelled = false;
    getPaperlessStatus()
      .then((status) => {
        if (!cancelled) setPaperlessConfigured(status.configured);
      })
      .catch(() => {
        if (!cancelled) setPaperlessConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [needed]);

  return useMemo(() => ({ role, paperlessConfigured }), [role, paperlessConfigured]);
}
