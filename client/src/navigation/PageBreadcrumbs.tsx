import { Breadcrumbs } from '../components/Breadcrumbs/Breadcrumbs.js';
import { usePageBreadcrumbs } from './usePageBreadcrumbs.js';
import type { ObjectNames } from './usePageBreadcrumbs.js';

/** Connected breadcrumb row for the current route (parents from the route map, Back from origin state). */
export function PageBreadcrumbs({ objectNames }: { readonly objectNames?: ObjectNames }) {
  return <Breadcrumbs {...usePageBreadcrumbs(objectNames)} />;
}

export default PageBreadcrumbs;
