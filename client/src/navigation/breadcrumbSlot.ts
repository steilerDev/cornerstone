import { createContext } from 'react';

export const TOP_BAR_MEDIA_QUERY = '(min-width: 1024px)';

/** The top bar's breadcrumb slot element; null outside AppShell or before mount. */
export const BreadcrumbSlotContext = createContext<HTMLElement | null>(null);
