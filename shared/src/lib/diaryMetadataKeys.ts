import type { ManualDiaryEntryType } from '../types/diary.js';

/** Metadata keys each manual type keeps (contract 5). A type change drops every other key. */
export const DIARY_TYPE_METADATA_KEYS: Readonly<Record<ManualDiaryEntryType, readonly string[]>> = {
  daily_log: [
    'weather',
    'temperatureCelsius',
    'workersOnSite',
    'vendorId',
    'workStart',
    'workEnd',
    'signatures',
  ],
  site_visit: ['inspectorName', 'outcome', 'workStart', 'workEnd', 'signatures'],
  delivery: ['vendor', 'materials', 'deliveryConfirmed'],
  issue: ['severity', 'resolutionStatus', 'signatures'],
  general_note: [],
};

/** Keys of `metadata` that a switch to `to` would drop (only keys with a non-null value). */
export function droppedMetadataKeys(
  metadata: Readonly<Record<string, unknown>> | null | undefined,
  to: ManualDiaryEntryType,
): string[] {
  if (!metadata) return [];
  const kept = DIARY_TYPE_METADATA_KEYS[to];
  return Object.keys(metadata).filter(
    (key) =>
      key !== 'vendorName' &&
      metadata[key] !== null &&
      metadata[key] !== undefined &&
      !kept.includes(key),
  );
}
