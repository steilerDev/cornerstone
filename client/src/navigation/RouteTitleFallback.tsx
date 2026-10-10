import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useHouseName } from '../contexts/HouseNameContext.js';
import { useSectionLabel } from '../hooks/useDocumentTitle.js';
import { composeDocumentTitle } from './pageIdentity.js';

/**
 * Root-level fallback title "<section> · <house>". Runs as a layout effect so a page's
 * useDocumentTitle (passive effect) always wins, and pages that have not adopted it never keep
 * the previous page's title.
 */
export function RouteTitleFallback() {
  const { pathname } = useLocation();
  const { houseName } = useHouseName();
  const section = useSectionLabel(pathname);

  useLayoutEffect(() => {
    document.title = composeDocumentTitle({ page: null, section, house: houseName });
  }, [pathname, section, houseName]);

  return null;
}

export default RouteTitleFallback;
