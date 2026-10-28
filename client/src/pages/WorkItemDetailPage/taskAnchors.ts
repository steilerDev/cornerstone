/** Timing-tab intents other pages deep-link to (`#constraints`, `#reschedule`). */
export const TASK_TIMING_INTENTS = ['constraints', 'reschedule'] as const;
export type TaskTimingIntent = (typeof TASK_TIMING_INTENTS)[number];
