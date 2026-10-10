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

export interface DocumentTitleOptions {
  /** Include the section segment (default true). */
  readonly section?: boolean;
  /** Include the house name (default true); false uses the product name. */
  readonly house?: boolean;
}

/**
 * Sets document.title to "<page> · <section> · <house>". Pass the h1 text; null = no page segment.
 * No cleanup: the root RouteTitleFallback owns the title between pages.
 */
export function useDocumentTitle(
  pageTitle: string | null | undefined,
  options?: DocumentTitleOptions,
): void {
  const { pathname } = useLocation();
  const { houseName } = useHouseName();
  const sectionLabel = useSectionLabel(pathname);
  const withSection = options?.section !== false;
  const withHouse = options?.house !== false;
  const title = composeDocumentTitle({
    page: pageTitle,
    section: withSection ? sectionLabel : null,
    house: withHouse ? houseName : null,
  });

  useEffect(() => {
    document.title = title;
  }, [title, pathname, withSection, withHouse]);
}
