import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { matchLocation } from '@cornerstone/shared';
import type { BreadcrumbLink, BreadcrumbsProps } from '../components/Breadcrumbs/Breadcrumbs.js';
import { pathnameOf, readOrigin } from './origin.js';
import { breadcrumbChain, isNavView, originLabelKeyForPath } from './pageIdentity.js';

/**
 * Object display names by route id, e.g. `{ householdItem: item?.name }`.
 * `undefined` = not loaded yet (omitted, trail pending). `null` = this ancestor does not apply
 * and is skipped entirely (not pending, not the nearest parent).
 */
export type ObjectNames = Readonly<Partial<Record<string, string | null | undefined>>>;

/** Breadcrumb props for the current location: parents-only trail plus the origin Back link. */
export function usePageBreadcrumbs(objectNames?: ObjectNames): BreadcrumbsProps {
  const location = useLocation();
  const { t } = useTranslation('common');

  const match = matchLocation(location.pathname);
  const id = match?.entry.id;
  if (!match || !id || isNavView(id)) return { parents: [] };

  const parents: BreadcrumbLink[] = [];
  let pending = false;
  const chain = breadcrumbChain(id, match.params).filter((item) => objectNames?.[item.id] !== null);
  for (const item of chain) {
    if (item.labelKey) {
      parents.push({ label: t(item.labelKey), href: item.href });
      continue;
    }
    const name = objectNames?.[item.id]?.trim();
    if (name) parents.push({ label: name, href: item.href, dynamic: true });
    else pending = true;
  }

  let origin: BreadcrumbLink | null = null;
  const raw = readOrigin(location.state);
  if (raw) {
    const originPath = pathnameOf(raw.to);
    const nearest = chain[chain.length - 1];
    const suppressed =
      originPath === location.pathname || (nearest && originPath === pathnameOf(nearest.href));
    if (!suppressed) {
      const key = originLabelKeyForPath(originPath);
      const label = raw.name?.trim() || (key ? t(key) : null);
      if (label) origin = { label, href: raw.to, dynamic: !!raw.name };
    }
  }

  return { parents, origin, pending };
}
