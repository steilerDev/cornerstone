import { ApiClientError } from './apiClient.js';
import { translateApiError } from './errorTranslation.js';

/**
 * Why a load failed, kept as data so a fetch effect never depends on the translator: the message
 * is built at render time (a locale change then re-renders instead of refetching).
 */
export type FetchFailure =
  | { readonly kind: 'api'; readonly code: string; readonly notFound: boolean }
  | { readonly kind: 'other' };

export function toFetchFailure(err: unknown): FetchFailure {
  return err instanceof ApiClientError
    ? { kind: 'api', code: err.error.code, notFound: err.statusCode === 404 }
    : { kind: 'other' };
}

/** The translated message of a failure; `notFound` replaces the API text for a 404 when given. */
export function fetchFailureMessage(
  failure: FetchFailure,
  tErrors: Parameters<typeof translateApiError>[1],
  fallback: string,
  notFound?: string,
): string {
  if (failure.kind === 'other') return fallback;
  return failure.notFound && notFound !== undefined
    ? notFound
    : translateApiError(failure.code, tErrors);
}
