import type { RefObject } from 'react';
import type { MilestoneDetail } from '@cornerstone/shared';
import type { OriginState } from '../../navigation/origin.js';

export interface MilestonePanelProps {
  readonly milestone: MilestoneDetail;
  /** Silent re-fetch of the milestone (strip figures, both lists). */
  readonly refresh: () => Promise<void>;
  /** Bumps after every successful refresh; panels that load their own data reload on it. */
  readonly revision: number;
  readonly originState: OriginState;
  /** The page h1: focus fallback when a panel's own target is gone. */
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}
