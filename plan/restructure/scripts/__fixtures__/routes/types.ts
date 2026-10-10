// Synthetic route module used by build-routes.test.mjs (mirrors shared/src/routes, 6 entries).
export interface FixtureRouteEntry {
  readonly id?: string;
  readonly from: string;
  readonly to: string;
  readonly kind: 'page' | 'redirect';
  readonly stage: 'done' | 'interim' | 'planned';
  readonly interim?: string;
}
