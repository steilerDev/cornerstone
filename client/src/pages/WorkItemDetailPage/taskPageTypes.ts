import type { RefObject } from 'react';
import type { WorkItemPageDetail } from '@cornerstone/shared';
import type { OriginState } from '../../navigation/origin.js';

export interface TaskPanelProps {
  readonly task: WorkItemPageDetail;
  /** Bumps after every successful refresh; panels that load their own data reload on it. */
  readonly revision: number;
  /** Silent re-fetch of the task (strip figures, dependencies, subtasks, cost lines). */
  readonly refresh: () => Promise<void>;
  readonly originState: OriginState;
  /** The page h1: focus fallback when a panel's own target is gone. */
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}
