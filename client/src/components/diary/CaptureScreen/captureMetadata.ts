import type {
  DailyLogMetadata,
  DeliveryMetadata,
  DiaryEntryMetadata,
  DiaryInspectionOutcome,
  DiaryIssueResolution,
  DiaryIssueSeverity,
  DiarySignatureEntry,
  DiaryWeather,
  IssueMetadata,
  ManualDiaryEntryType,
  SiteVisitMetadata,
} from '@cornerstone/shared';
import { DIARY_TYPE_METADATA_KEYS, droppedMetadataKeys } from '@cornerstone/shared';

/** new = nothing written yet, draft = autosaved draft, saved = edit of a saved entry. */
export type CaptureMode = 'new' | 'draft' | 'saved';

/**
 * Every metadata value of every entry type, in one object, so switching the type back and forth
 * before saving keeps the values typed so far.
 */
export interface CaptureFields {
  // daily_log
  weather: DiaryWeather | null;
  /** Free text of the temperature input; parsed on build. */
  temperature: string;
  workers: number | null;
  vendorId: string | null;
  /** Display name of `vendorId` (resolved by the server on read, or picked here). Never sent. */
  vendorName: string | null;
  // daily_log and site_visit
  workStart: string | null;
  workEnd: string | null;
  // site_visit
  inspectorName: string;
  outcome: DiaryInspectionOutcome | null;
  // delivery (the company's name)
  vendor: string | null;
  materials: string[];
  deliveryConfirmed: boolean;
  // issue
  severity: DiaryIssueSeverity | null;
  resolutionStatus: DiaryIssueResolution | null;
}

export const EMPTY_FIELDS: CaptureFields = {
  weather: null,
  temperature: '',
  workers: null,
  vendorId: null,
  vendorName: null,
  workStart: null,
  workEnd: null,
  inspectorName: '',
  outcome: null,
  vendor: null,
  materials: [],
  deliveryConfirmed: false,
  severity: null,
  resolutionStatus: null,
};

/** Field ids of the validation errors (also the DOM ids `capture-field-<id>`). */
export type CaptureFieldId =
  'inspector' | 'outcome' | 'severity' | 'status' | 'time' | 'signatures';

/** Order in which the first invalid field is focused (matches the DOM order). */
export const CAPTURE_FIELD_ORDER: readonly CaptureFieldId[] = [
  'inspector',
  'outcome',
  'time',
  'severity',
  'status',
  'signatures',
];

/** True when both times are set and the end is not after the start. */
export function isInvalidTimePair(workStart: string | null, workEnd: string | null): boolean {
  return Boolean(workStart && workEnd && workEnd <= workStart);
}

export function typeHasTimes(type: ManualDiaryEntryType): boolean {
  return type === 'daily_log' || type === 'site_visit';
}

export function typeHasSignatures(type: ManualDiaryEntryType): boolean {
  return DIARY_TYPE_METADATA_KEYS[type].includes('signatures');
}

export function isSignatureComplete(sig: DiarySignatureEntry): boolean {
  return (
    typeof sig.signerName === 'string' &&
    sig.signerName.trim().length > 0 &&
    typeof sig.signatureDataUrl === 'string' &&
    sig.signatureDataUrl.trim().length > 0
  );
}

function parseTemperature(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Fields and signature slots of a loaded entry. */
export function fieldsFromEntry(entry: {
  entryType: string;
  metadata: DiaryEntryMetadata | null;
}): { fields: CaptureFields; signatures: DiarySignatureEntry[] } {
  const fields: CaptureFields = { ...EMPTY_FIELDS, materials: [] };
  let signatures: DiarySignatureEntry[] = [];
  const metadata = entry.metadata;
  if (!metadata) return { fields, signatures };

  if (entry.entryType === 'daily_log') {
    const m = metadata as DailyLogMetadata;
    fields.weather = m.weather ?? null;
    fields.temperature =
      m.temperatureCelsius !== null && m.temperatureCelsius !== undefined
        ? String(m.temperatureCelsius)
        : '';
    fields.workers = m.workersOnSite ?? null;
    fields.vendorId = m.vendorId ?? null;
    fields.vendorName = m.vendorName ?? null;
    fields.workStart = m.workStart ?? null;
    fields.workEnd = m.workEnd ?? null;
    signatures = m.signatures ?? [];
  } else if (entry.entryType === 'site_visit') {
    const m = metadata as SiteVisitMetadata;
    fields.inspectorName = m.inspectorName ?? '';
    fields.outcome = m.outcome ?? null;
    fields.workStart = m.workStart ?? null;
    fields.workEnd = m.workEnd ?? null;
    signatures = m.signatures ?? [];
  } else if (entry.entryType === 'delivery') {
    const m = metadata as DeliveryMetadata;
    fields.vendor = m.vendor ?? null;
    fields.materials = m.materials ?? [];
    fields.deliveryConfirmed = m.deliveryConfirmed === true;
  } else if (entry.entryType === 'issue') {
    const m = metadata as IssueMetadata;
    fields.severity = m.severity ?? null;
    fields.resolutionStatus = m.resolutionStatus ?? null;
    signatures = m.signatures ?? [];
  }
  return { fields, signatures };
}

/**
 * The metadata object for `type`: only the keys of that type, empty values omitted, only
 * accepted signatures, never `vendorName`. Null when empty.
 */
export function buildMetadata(
  type: ManualDiaryEntryType,
  fields: CaptureFields,
  signatures: readonly DiarySignatureEntry[],
): DiaryEntryMetadata | null {
  const complete = signatures.filter(isSignatureComplete);

  if (type === 'daily_log') {
    const m: DailyLogMetadata = {};
    if (fields.weather) m.weather = fields.weather;
    const temperature = parseTemperature(fields.temperature);
    if (temperature !== null) m.temperatureCelsius = temperature;
    if (fields.workers !== null) m.workersOnSite = fields.workers;
    if (fields.vendorId) m.vendorId = fields.vendorId;
    if (fields.workStart) m.workStart = fields.workStart;
    if (fields.workEnd) m.workEnd = fields.workEnd;
    if (complete.length > 0) m.signatures = complete;
    return Object.keys(m).length > 0 ? m : null;
  }

  if (type === 'site_visit') {
    const m: SiteVisitMetadata = {};
    if (fields.inspectorName.trim()) m.inspectorName = fields.inspectorName.trim();
    if (fields.outcome) m.outcome = fields.outcome;
    if (fields.workStart) m.workStart = fields.workStart;
    if (fields.workEnd) m.workEnd = fields.workEnd;
    if (complete.length > 0) m.signatures = complete;
    return Object.keys(m).length > 0 ? m : null;
  }

  if (type === 'delivery') {
    const m: DeliveryMetadata = {};
    if (fields.vendor) m.vendor = fields.vendor;
    if (fields.materials.length > 0) m.materials = fields.materials;
    if (fields.deliveryConfirmed) m.deliveryConfirmed = true;
    return Object.keys(m).length > 0 ? m : null;
  }

  if (type === 'issue') {
    const m: IssueMetadata = {};
    if (fields.severity) m.severity = fields.severity;
    if (fields.resolutionStatus) m.resolutionStatus = fields.resolutionStatus;
    if (complete.length > 0) m.signatures = complete;
    return Object.keys(m).length > 0 ? m : null;
  }

  return null;
}

export interface CaptureFormValues {
  entryType: ManualDiaryEntryType;
  entryDate: string;
  title: string;
  body: string;
  fields: CaptureFields;
  signatures: DiarySignatureEntry[];
}

/** Payload of the save of a saved entry and of the promote request. */
export function buildSavePayload(form: CaptureFormValues) {
  return {
    entryDate: form.entryDate,
    title: form.title.trim() || null,
    body: form.body.trim(),
    metadata: buildMetadata(form.entryType, form.fields, form.signatures),
  };
}

/** Field error message keys (namespace `diary`) for the Save attempt. */
export function validateForSave(
  type: ManualDiaryEntryType,
  mode: CaptureMode,
  fields: CaptureFields,
  signatures: readonly DiarySignatureEntry[],
): Partial<Record<CaptureFieldId, string>> {
  const errors: Partial<Record<CaptureFieldId, string>> = {};
  if (type === 'site_visit') {
    if (!fields.inspectorName.trim()) errors.inspector = 'capture.errors.inspectorRequired';
    if (!fields.outcome) errors.outcome = 'capture.errors.outcomeRequired';
  }
  if (type === 'issue') {
    if (!fields.severity) errors.severity = 'capture.errors.severityRequired';
    if (mode !== 'saved' && !fields.resolutionStatus) {
      errors.status = 'capture.errors.statusRequired';
    }
  }
  if (typeHasTimes(type) && isInvalidTimePair(fields.workStart, fields.workEnd)) {
    errors.time = 'capture.endBeforeStart';
  }
  if (typeHasSignatures(type) && signatures.some((sig) => !isSignatureComplete(sig))) {
    errors.signatures = 'edit.signatureIncomplete';
  }
  return errors;
}

/** Save needs a title, text or a stored photo (the server counts stored photos only). */
export function hasContent(title: string, body: string, uploadedPhotoCount: number): boolean {
  return title.trim().length > 0 || body.trim().length > 0 || uploadedPhotoCount > 0;
}

/** Keys of `capture.dropped.*`. */
export type DroppedKey =
  | 'signatures'
  | 'weather'
  | 'temperature'
  | 'workers'
  | 'company'
  | 'times'
  | 'inspector'
  | 'outcome'
  | 'severity'
  | 'status'
  | 'materials'
  | 'deliveryConfirmed';

export interface DroppedDetail {
  key: DroppedKey;
  /** `signatures` only. */
  count?: number;
}

const DROPPED_KEY_BY_METADATA_KEY: Readonly<Record<string, DroppedKey>> = {
  signatures: 'signatures',
  weather: 'weather',
  temperatureCelsius: 'temperature',
  workersOnSite: 'workers',
  vendorId: 'company',
  vendor: 'company',
  workStart: 'times',
  workEnd: 'times',
  inspectorName: 'inspector',
  outcome: 'outcome',
  severity: 'severity',
  resolutionStatus: 'status',
  materials: 'materials',
  deliveryConfirmed: 'deliveryConfirmed',
};

/**
 * The details a switch from `from` to `to` would remove, one entry per label. Signature slots
 * count even when not yet accepted; a defect status still at the default `open` does not.
 */
export function droppedDetails(
  from: ManualDiaryEntryType,
  to: ManualDiaryEntryType,
  fields: CaptureFields,
  signatures: readonly DiarySignatureEntry[],
): DroppedDetail[] {
  const metadata = buildMetadata(from, fields, signatures) as Record<string, unknown> | null;
  const dropped = new Set<DroppedKey>();
  for (const metadataKey of droppedMetadataKeys(metadata, to)) {
    if (metadataKey === 'resolutionStatus' && metadata?.resolutionStatus === 'open') continue;
    const key = DROPPED_KEY_BY_METADATA_KEY[metadataKey];
    if (key) dropped.add(key);
  }
  if (typeHasSignatures(from) && !typeHasSignatures(to) && signatures.length > 0) {
    dropped.add('signatures');
  }
  return [...dropped].map((key) =>
    key === 'signatures' ? { key, count: signatures.length } : { key },
  );
}

/** Metadata keys each field belongs to, for `pruneFields`. */
const METADATA_KEYS_OF_FIELD: Readonly<Record<keyof CaptureFields, string>> = {
  weather: 'weather',
  temperature: 'temperatureCelsius',
  workers: 'workersOnSite',
  vendorId: 'vendorId',
  vendorName: 'vendorId',
  workStart: 'workStart',
  workEnd: 'workEnd',
  inspectorName: 'inspectorName',
  outcome: 'outcome',
  vendor: 'vendor',
  materials: 'materials',
  deliveryConfirmed: 'deliveryConfirmed',
  severity: 'severity',
  resolutionStatus: 'resolutionStatus',
};

/**
 * The fields after a switch to `to`: values the new type does not keep are reset, and a defect
 * starts with the status `open`.
 */
export function pruneFields(fields: CaptureFields, to: ManualDiaryEntryType): CaptureFields {
  const kept = DIARY_TYPE_METADATA_KEYS[to];
  const next: CaptureFields = { ...fields, materials: [...fields.materials] };
  const reset = next as unknown as Record<string, unknown>;
  const empty = EMPTY_FIELDS as unknown as Record<string, unknown>;
  for (const name of Object.keys(METADATA_KEYS_OF_FIELD) as (keyof CaptureFields)[]) {
    if (!kept.includes(METADATA_KEYS_OF_FIELD[name])) {
      reset[name] = Array.isArray(empty[name]) ? [] : empty[name];
    }
  }
  if (to === 'issue' && !next.resolutionStatus) next.resolutionStatus = 'open';
  return next;
}
