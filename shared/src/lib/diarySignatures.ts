/** Maximum number of signatures stored on a single diary entry. */
export const MAX_SIGNATURES_PER_ENTRY = 10;

/** Maximum length of a signer name (after trimming). */
export const MAX_SIGNER_NAME_LENGTH = 300;

/** Maximum length (in characters) of a signature data URL. */
export const MAX_SIGNATURE_DATA_URL_LENGTH = 512 * 1024;

/** Accepted signature data URL format: base64-encoded png, jpeg or webp. */
export const SIGNATURE_DATA_URL_PATTERN =
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
