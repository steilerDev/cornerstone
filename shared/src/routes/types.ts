// Route map types (EPIC-21, ADR-038).
// Self-contained on purpose: E2E and `npm run plan:check` load shared/src/routes/ as source
// without a build, so nothing in this folder may import from outside it.

export type RouteKind = 'page' | 'redirect';
export type RouteChange =
  | 'kept'
  | 'new'
  | 'moved'
  | 'merged'
  | 'retired'
  | 'redirect'
  | 'retargeted'
  | 'repair'
  | 'query-map'
  | 'conditional'
  | 'redirect-becomes-page';
export type RouteGuard = 'public' | 'member' | 'admin';
export type RouteGate = 'none' | 'paperless' | 'paperless+ai';
export type RouteSection =
  | 'Auth'
  | 'Home'
  | 'Tasks'
  | 'Purchases'
  | 'Site diary'
  | 'Photos'
  | 'Money'
  | 'Companies'
  | 'Areas'
  | 'History'
  | 'Documents'
  | 'Settings'
  | 'System';

/**
 * Rollout stage of an entry.
 * - done: served as `to`/`kind` say.
 * - interim: served today, but not yet in its final form (see `interim`).
 * - planned: not served; waits for its own story.
 */
export type RouteStage = 'done' | 'interim' | 'planned';

/** Conditions of conditional (gate / role) entries. */
export type RouteCondition = 'paperless-off' | 'ai-off' | 'paperless-or-ai-off' | 'not-admin';

export interface RouteMatch {
  /** Query-map entries: query keys that must match (`true` = present with any value). */
  readonly query?: Readonly<Record<string, string | true>>;
  /** Conditional entries: the condition under which the entry applies. */
  readonly condition?: RouteCondition;
  /** Conditional entries: ids of the pages the condition applies to. */
  readonly appliesTo?: readonly string[];
}

export interface RouteMapEntry {
  /** Addressable route id. Only on entries whose `from` is a plain path code may link to. */
  readonly id?: string;
  readonly from: string;
  readonly to: string;
  readonly kind: RouteKind;
  readonly change: RouteChange;
  readonly section: RouteSection;
  readonly guard: RouteGuard;
  readonly gate: RouteGate;
  readonly permanent: boolean;
  readonly carries: readonly string[];
  readonly stage: RouteStage;
  /**
   * Interim form (stage `interim` only): `'page'` = today's page still serves the entry;
   * any other string = a one-hop redirect to today's equivalent target.
   */
  readonly interim?: string;
  /** Id of the parent route (breadcrumbs / highlighting). */
  readonly parent?: string;
  readonly match?: RouteMatch;
}
