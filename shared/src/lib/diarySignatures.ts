/** Maximum number of signatures stored on a single diary entry. */
export const MAX_SIGNATURES_PER_ENTRY = 10;

/** Maximum length of a signer name (after trimming). */
export const MAX_SIGNER_NAME_LENGTH = 300;

/** Maximum length (in characters) of a signature data URL. */
export const MAX_SIGNATURE_DATA_URL_LENGTH = 512 * 1024;

/** Accepted signature data URL format: base64-encoded png, jpeg or webp. */
export const SIGNATURE_DATA_URL_PATTERN =
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * Strict ISO-8601 timestamp with explicit timezone (e.g. `2026-03-14T10:00:00.000Z`).
 * Capture groups: year, month, day, hour, minute, optional second, and (for numeric
 * offsets) offset sign, hours and minutes. The fraction is not captured.
 */
export const SIGNED_AT_PATTERN =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2})(?:\.\d{1,3})?)?(?:Z|(?<offsetSign>[+-])(?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/;
