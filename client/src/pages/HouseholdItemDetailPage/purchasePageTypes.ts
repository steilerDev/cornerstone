import type { RefObject } from 'react';
import type { HouseholdItemPageDetail } from '@cornerstone/shared';
import type { OriginState } from '../../navigation/origin.js';

export interface PurchasePanelProps {
  readonly purchase: HouseholdItemPageDetail;
  /** Bumps after every successful refresh; panels that load their own data reload on it. */
  readonly revision: number;
  /** Silent re-fetch of the purchase (strip figures, dependencies, cost lines). */
  readonly refresh: () => Promise<void>;
  readonly originState: OriginState;
  /** The page h1: focus fallback when a panel's own target is gone. */
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}
