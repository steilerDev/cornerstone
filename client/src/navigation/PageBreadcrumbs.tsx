import { use } from 'react';
import { createPortal } from 'react-dom';
import { Breadcrumbs } from '../components/Breadcrumbs/Breadcrumbs.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { BreadcrumbSlotContext, TOP_BAR_MEDIA_QUERY } from './breadcrumbSlot.js';
import { usePageBreadcrumbs } from './usePageBreadcrumbs.js';
import type { ObjectNames } from './usePageBreadcrumbs.js';

/**
 * Connected breadcrumb row for the current route (parents from the route map, Back from origin
 * state). From 1024 px it is portaled into the top bar's slot; otherwise it renders inline.
 * Exactly one row exists at any moment.
 */
export function PageBreadcrumbs({ objectNames }: { readonly objectNames?: ObjectNames }) {
  const props = usePageBreadcrumbs(objectNames);
  const slot = use(BreadcrumbSlotContext);
  const wide = useMediaQuery(TOP_BAR_MEDIA_QUERY);
  return wide && slot !== null ? (
    createPortal(<Breadcrumbs {...props} layout="bar" />, slot)
  ) : (
    <Breadcrumbs {...props} />
  );
}

export default PageBreadcrumbs;
