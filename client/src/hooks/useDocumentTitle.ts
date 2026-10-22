import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { matchLocation } from '@cornerstone/shared';
import { useHouseName } from '../contexts/HouseNameContext.js';
import { composeDocumentTitle, navSectionForRoute } from '../navigation/pageIdentity.js';
import { useRealLocationKey } from '../navigation/realLocation.js';

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
  /**
   * A dialog's title: while it is mounted, the titles of the pages behind it do not write
   * `document.title`, however late (lazy) they mount. The page re-asserts its own title when
   * the overlay unmounts (its effect re-runs on the navigation that closes the dialog).
   */
  readonly overlay?: boolean;
  /** Leading marker before the title, e.g. Home's attention count "(3)". Null/empty = none. */
  readonly prefix?: string | null;
}

/** Number of mounted overlay titles; page titles stay silent while it is above zero. */
let overlayCount = 0;

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
  // A navigation that keeps the display location (opening or closing a dialog) re-asserts the
  // title after the root fallback has reset it.
  const realKey = useRealLocationKey();
  const sectionLabel = useSectionLabel(pathname);
  const withSection = options?.section !== false;
  const withHouse = options?.house !== false;
  const title = composeDocumentTitle({
    page: pageTitle,
    section: withSection ? sectionLabel : null,
    house: withHouse ? houseName : null,
    prefix: options?.prefix ?? null,
  });

  const overlay = options?.overlay === true;
  useEffect(() => {
    if (overlay) {
      overlayCount += 1;
      document.title = title;
      return () => {
        overlayCount -= 1;
      };
    }
    if (overlayCount === 0) document.title = title;
  }, [title, pathname, withSection, withHouse, realKey, overlay]);
}
