import { createContext } from 'react';
import type { RouteId } from '@cornerstone/shared';
import type { NavActive } from './navActive.js';
import type { NavLabelKey, NavSection } from './navConfig.js';

export interface ViewMenuEntry {
  readonly route: RouteId;
  readonly labelKey: NavLabelKey;
  /** The section's main view (first row). */
  readonly main: boolean;
}

export interface ViewMenuModel {
  /** Main view first, then the visible views. */
  readonly entries: readonly ViewMenuEntry[];
  readonly current: RouteId;
}

/** Set by AppShell below 1024 px only; null elsewhere (desktop, outside AppShell, tests). */
export const ViewMenuContext = createContext<ViewMenuModel | null>(null);

/**
 * The title menu for the current page, or null when the page is not exactly a section's
 * main view or one of its views, the section is not visible, or fewer than 2 views exist.
 */
export function viewMenuFor(
  active: NavActive | null,
  sections: readonly NavSection[],
): ViewMenuModel | null {
  if (!active || !active.exact) return null;
  const section = sections.find((s) => s.id === active.sectionId);
  if (!section) return null;
  const entries: ViewMenuEntry[] = [
    { route: section.route, labelKey: section.mainViewLabelKey, main: true },
    ...section.views.map((v) => ({ route: v.route, labelKey: v.labelKey, main: false })),
  ];
  if (entries.length < 2) return null;
  return { entries, current: active.viewRoute ?? section.route };
}
