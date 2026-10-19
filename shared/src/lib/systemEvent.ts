import type { SystemEventMetadataV1 } from '../types/systemEvent.js';

export const SYSTEM_EVENT_NAMES = [
  'status_changed',
  'milestone_delayed',
  'invoice_created',
  'legacy',
] as const;

export type SystemEventName = (typeof SYSTEM_EVENT_NAMES)[number];

/** True for a non-null, non-array object with v === 1 and an `event` in SYSTEM_EVENT_NAMES. */
export function isSystemEventMetadataV1(value: unknown): value is SystemEventMetadataV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as { v?: unknown; event?: unknown };
  return (
    candidate.v === 1 &&
    typeof candidate.event === 'string' &&
    (SYSTEM_EVENT_NAMES as readonly string[]).includes(candidate.event)
  );
}
