import type { TFunction } from 'i18next';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';

/** The message of a failed action: the server's translated code, else the action's own fallback. */
export function taskActionError(
  err: unknown,
  tErrors: TFunction<'errors'>,
  fallback: string,
): string {
  return err instanceof ApiClientError ? translateApiError(err.error.code, tErrors) : fallback;
}
