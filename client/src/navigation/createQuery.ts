/** Query vocabulary of the create targets (`?create=1`, `kind`, pre-fill keys). */
export const CREATE_PARAM = 'create';
export const CREATE_KIND_PARAM = 'kind';
export const CREATE_PREFILL_KEYS = ['areaId', 'companyId', 'date', 'documentId'] as const;
export type CreatePrefillKey = (typeof CREATE_PREFILL_KEYS)[number];
export type CreatePrefill = Readonly<Partial<Record<CreatePrefillKey, string>>>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_ID_LENGTH = 64;
/** A Paperless document id: a positive integer of at most ten digits. */
const DOCUMENT_ID_PATTERN = /^[1-9]\d{0,9}$/;

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isValidId(value: string): boolean {
  return value.length > 0 && value.length <= MAX_ID_LENGTH && ID_PATTERN.test(value);
}

function isValidValue(key: CreatePrefillKey, value: string): boolean {
  if (key === 'date') return isRealDate(value);
  if (key === 'documentId') return DOCUMENT_ID_PATTERN.test(value);
  return isValidId(value);
}

/** Keeps only valid pre-fill keys: `date` is a real YYYY-MM-DD day, ids are short slugs, `documentId` a positive integer. */
export function sanitizePrefill(input: Partial<Record<CreatePrefillKey, unknown>>): CreatePrefill {
  const out: Partial<Record<CreatePrefillKey, string>> = {};
  for (const key of CREATE_PREFILL_KEYS) {
    const value = input[key];
    if (typeof value !== 'string') continue;
    if (isValidValue(key, value)) out[key] = value;
  }
  return out;
}

/** Reads the pre-fill keys from a query string through `sanitizePrefill`. */
export function prefillFromSearch(params: URLSearchParams): CreatePrefill {
  return sanitizePrefill({
    areaId: params.get('areaId') ?? undefined,
    companyId: params.get('companyId') ?? undefined,
    date: params.get('date') ?? undefined,
    documentId: params.get('documentId') ?? undefined,
  });
}

/** `?start=` of the capture screen: which Log now tile opened it (applied once, then removed). */
export const START_PARAM = 'start';
export const QUICK_LOG_MODES = ['photo', 'note', 'delivery'] as const;
export type QuickLogMode = (typeof QUICK_LOG_MODES)[number];

export function isQuickLogMode(value: unknown): value is QuickLogMode {
  return typeof value === 'string' && (QUICK_LOG_MODES as readonly string[]).includes(value);
}

/** The start mode of a query string; any other value is ignored (null). */
export function startModeFromSearch(params: URLSearchParams): QuickLogMode | null {
  const value = params.get(START_PARAM);
  return isQuickLogMode(value) ? value : null;
}
