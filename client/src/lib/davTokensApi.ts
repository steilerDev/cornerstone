import { get, post, del } from './apiClient.js';
import type { DavTokenStatus, DavTokenResponse } from '@cornerstone/shared';

/**
 * Fetches the current DAV token status for the user.
 */
export function getDavTokenStatus(): Promise<DavTokenStatus> {
  return get<DavTokenStatus>('/users/me/dav/token');
}

/**
 * Generates a new DAV token for the user.
 */
export function generateDavToken(): Promise<DavTokenResponse> {
  return post<DavTokenResponse>('/users/me/dav/token', {});
}

/**
 * Revokes the current DAV token.
 */
export function revokeDavToken(): Promise<void> {
  return del<void>('/users/me/dav/token');
}

/**
 * Gets the URL to download the DAV profile for iOS/macOS setup.
 */
export function getDavProfileUrl(): string {
  return '/api/users/me/dav/profile';
}
