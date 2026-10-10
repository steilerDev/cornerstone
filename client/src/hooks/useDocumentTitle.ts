import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { matchLocation } from '@cornerstone/shared';
import { useHouseName } from '../contexts/HouseNameContext.js';
import { composeDocumentTitle, navSectionForRoute } from '../navigation/pageIdentity.js';

/** Section label (translated) of the route at `pathname`, or null outside a section. */
export function useSectionLabel(pathname: string): string | null {
  const { t } = useTranslation('common');
  const id = matchLocation(pathname)?.entry.id;
  const section = id ? navSectionForRoute(id) : null;
  return section ? t(section.labelKey) : null;
}

/**
 * Sets document.title to "<page> · <section> · <house>". Pass the h1 text; null = no page segment.
 * No cleanup: the root RouteTitleFallback owns the title between pages.
 */
export function useDocumentTitle(pageTitle: string | null | undefined): void {
  const { pathname } = useLocation();
  const { houseName } = useHouseName();
  const section = useSectionLabel(pathname);
  const title = composeDocumentTitle({ page: pageTitle, section, house: houseName });

  useEffect(() => {
    document.title = title;
  }, [title, pathname]);
}
