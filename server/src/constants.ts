/**
 * Application-wide constants shared across server modules.
 */

/**
 * The name of the HTTP-only cookie used to store session IDs.
 * This cookie is set on login and cleared on logout.
 */
export const COOKIE_NAME = 'cornerstone_session';

/** Hard cap (MB) on any multipart upload; PHOTO_MAX_FILE_SIZE_MB above it has no effect. */
export const MULTIPART_FILE_SIZE_CAP_MB = 50;
