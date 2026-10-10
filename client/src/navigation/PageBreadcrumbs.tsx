import { use } from 'react';
import { createPortal } from 'react-dom';
import { Breadcrumbs } from '../components/Breadcrumbs/Breadcrumbs.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { BreadcrumbSlotContext, TOP_BAR_MEDIA_QUERY } from './breadcrumbSlot.js';
import { pathnameOf } from './origin.js';
import { PreviousPathContext, historyIndex } from './previousPath.js';
import { usePageBreadcrumbs } from './usePageBreadcrumbs.js';
import type { ObjectNames } from './usePageBreadcrumbs.js';

/**
 * Connected breadcrumb row for the current route (parents from the route map, Back from origin
 * state). It is portaled into the top bar's slot at every width: the full trail from 1024 px,
 * the single compact "‹ target" link below. Outside AppShell (no slot) it renders inline.
 * Exactly one row exists at any moment.
 */
export function PageBreadcrumbs({ objectNames }: { readonly objectNames?: ObjectNames }) {
  const props = usePageBreadcrumbs(objectNames);
  const slot = use(BreadcrumbSlotContext);
  const wide = useMediaQuery(TOP_BAR_MEDIA_QUERY);
  const getPrevious = use(PreviousPathContext);

  if (slot === null) return <Breadcrumbs {...props} />;

  // Back goes back in history only when the previous page is the one the label names.
  const shouldGoBack = (href: string): boolean =>
    historyIndex() > 0 && getPrevious() === pathnameOf(href);

  return createPortal(
    <Breadcrumbs {...props} layout={wide ? 'bar' : 'compact'} shouldGoBack={shouldGoBack} />,
    slot,
  );
}

export default PageBreadcrumbs;
